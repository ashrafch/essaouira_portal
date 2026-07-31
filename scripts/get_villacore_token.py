#!/usr/bin/env python3
"""Create a Home Assistant long-lived token and write it into an env file.

Runs the same auth flow the Home Assistant web UI runs, so you don't have to
click through profile -> Security -> Long-lived access tokens:

    1. POST /auth/login_flow                       -> flow id
    2. POST /auth/login_flow/{id}                  -> authorization code
    3. POST /auth/token                            -> short-lived access token
    4. WS   auth/long_lived_access_token           -> the long-lived token

The password is read with getpass: never a CLI argument, never echoed, never
written anywhere. Only the resulting token is persisted, into the env file.

Standard library only (a minimal RFC 6455 client is included) so it runs on
Windows and Linux with no extra install.

    python scripts/get_villacore_token.py
    python scripts/get_villacore_token.py --url http://127.0.0.1:18123 --user ashraf
    python scripts/get_villacore_token.py --also-server-env
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import re
import socket
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_URL = "http://127.0.0.1:18123"
DEFAULT_TOKEN_NAME = "Hostara Portal"
# ~10 years: this is a machine-to-machine link, rotated deliberately, not on a timer.
TOKEN_LIFESPAN_DAYS = 3650


# --- output ----------------------------------------------------------------
def step(message: str) -> None:
    print(f"==> {message}")


def ok(message: str) -> None:
    print(f"    OK  {message}")


def fail(message: str) -> None:
    print(f"    X   {message}", file=sys.stderr)


# --- HTTP ------------------------------------------------------------------
def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode()
    return json.loads(body) if body else {}


def post_form(url: str, payload: dict) -> dict:
    data = urllib.parse.urlencode(payload).encode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read().decode()
    return json.loads(body) if body else {}


# --- minimal WebSocket client ---------------------------------------------
class WebSocket:
    """Just enough of RFC 6455 to exchange small text frames with Home Assistant."""

    def __init__(self, url: str, timeout: float = 15.0) -> None:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in {"ws", "wss"}:
            raise ValueError(f"unsupported websocket scheme: {parsed.scheme}")
        if parsed.scheme == "wss":
            raise ValueError(
                "wss:// is not supported by this helper; use the loopback http:// URL "
                "of Home Assistant, or create the token from the HA web UI"
            )
        port = parsed.port or 80
        self._buffer = b""
        self._socket = socket.create_connection((parsed.hostname, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        path = parsed.path or "/"
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self._socket.sendall(handshake.encode())
        while b"\r\n\r\n" not in self._buffer:
            chunk = self._socket.recv(4096)
            if not chunk:
                raise ConnectionError("connection closed during websocket handshake")
            self._buffer += chunk
        header, self._buffer = self._buffer.split(b"\r\n\r\n", 1)
        status = header.split(b"\r\n", 1)[0].decode()
        if "101" not in status:
            raise ConnectionError(f"websocket upgrade refused: {status}")

    def _recv_more(self) -> None:
        chunk = self._socket.recv(4096)
        if not chunk:
            raise ConnectionError("connection closed by Home Assistant")
        self._buffer += chunk

    def send_json(self, payload: dict) -> None:
        data = json.dumps(payload).encode()
        header = bytearray([0x81])  # FIN + text frame
        length = len(data)
        # Client frames must always be masked.
        if length < 126:
            header.append(0x80 | length)
        elif length < (1 << 16):
            header.append(0x80 | 126)
            header += struct.pack(">H", length)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", length)
        mask = os.urandom(4)
        header += mask
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(data))
        self._socket.sendall(bytes(header) + masked)

    def receive_json(self) -> dict:
        while True:
            while len(self._buffer) < 2:
                self._recv_more()
            first, second = self._buffer[0], self._buffer[1]
            opcode = first & 0x0F
            length = second & 0x7F
            offset = 2
            if length == 126:
                while len(self._buffer) < 4:
                    self._recv_more()
                length = struct.unpack(">H", self._buffer[2:4])[0]
                offset = 4
            elif length == 127:
                while len(self._buffer) < 10:
                    self._recv_more()
                length = struct.unpack(">Q", self._buffer[2:10])[0]
                offset = 10
            while len(self._buffer) < offset + length:
                self._recv_more()
            payload = self._buffer[offset : offset + length]
            self._buffer = self._buffer[offset + length :]
            if opcode == 0x8:
                raise ConnectionError("Home Assistant closed the websocket")
            if opcode in {0x9, 0xA}:  # ping/pong: ignore
                continue
            return json.loads(payload.decode())

    def close(self) -> None:
        try:
            self._socket.close()
        except OSError:
            pass


# --- env file --------------------------------------------------------------
def set_env_value(path: Path, key: str, value: str) -> bool:
    if not path.exists():
        fail(f"env file not found: {path}")
        return False
    # Keep the file's original newline style and BOM handling intact.
    text = path.read_text(encoding="utf-8-sig")
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=.*$", re.MULTILINE)
    if pattern.search(text):
        text = pattern.sub(f"{key}={value}", text, count=1)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += f"{key}={value}\n"
    path.write_text(text, encoding="utf-8")
    return True


# --- main ------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Home Assistant base URL (default {DEFAULT_URL})")
    parser.add_argument("--user", default="", help="Home Assistant username (prompted if omitted)")
    parser.add_argument("--token-name", default=DEFAULT_TOKEN_NAME, help="Name shown in HA under Security")
    parser.add_argument("--env-file", default=".env", help="Env file to update (default .env)")
    parser.add_argument(
        "--also-server-env",
        action="store_true",
        help="Also update apps/server/.env (used when running uvicorn on the host)",
    )
    parser.add_argument("--print-token", action="store_true", help="Print the token instead of writing it")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    # Home Assistant requires client_id to be a URL matching the caller's origin.
    client_id = f"{base_url}/"

    step(f"Checking {base_url}")
    try:
        urllib.request.urlopen(base_url, timeout=8).read(1)
    except urllib.error.HTTPError:
        pass  # any HTTP answer proves it is listening
    except OSError as exc:
        fail(f"Home Assistant is not reachable at {base_url}: {exc}")
        print("    Start the VillaCore stack, or pass --url with the right port.")
        return 1
    ok("reachable")

    # The password must be typed by a human at a real terminal: it is never a CLI
    # argument, so there is nothing to read when input is not interactive.
    def no_terminal(reason: str) -> int:
        fail(reason)
        print(
            "    Run this script yourself in PowerShell or a shell:\n"
            "        python scripts/get_villacore_token.py\n"
            "    Alternatively create the token in the Home Assistant UI\n"
            "    (profile -> Security -> Long-lived access tokens) and paste it into\n"
            "    HOME_ASSISTANT_TOKEN in .env."
        )
        return 2

    if not sys.stdin.isatty():
        return no_terminal("this script needs an interactive terminal to read the password")

    try:
        username = args.user or input("Home Assistant username: ").strip()
    except EOFError:
        return no_terminal("no username provided (input is not interactive)")
    if not username:
        fail("username is required")
        return 1
    try:
        password = getpass.getpass(f"Home Assistant password for '{username}': ")
    except (EOFError, getpass.GetPassWarning):
        return no_terminal("could not read the password from this terminal")
    if not password:
        fail("password is required")
        return 1

    step("Starting the Home Assistant auth flow")
    try:
        flow = post_json(
            f"{base_url}/auth/login_flow",
            {"client_id": client_id, "handler": ["homeassistant", None], "redirect_uri": client_id},
        )
        flow_id = flow.get("flow_id")
        if not flow_id:
            fail(f"Home Assistant did not return a flow id: {flow}")
            return 1

        result = post_json(
            f"{base_url}/auth/login_flow/{flow_id}",
            {"client_id": client_id, "username": username, "password": password},
        )
    except urllib.error.HTTPError as exc:
        fail(f"auth flow failed: HTTP {exc.code} {exc.read().decode(errors='replace')[:200]}")
        return 1
    finally:
        password = ""

    code = result.get("result")
    if not code:
        errors = result.get("errors") or result.get("error") or "invalid credentials"
        fail(f"login refused: {errors}")
        return 1
    ok("credentials accepted")

    try:
        token_response = post_form(
            f"{base_url}/auth/token",
            {"grant_type": "authorization_code", "code": code, "client_id": client_id},
        )
    except urllib.error.HTTPError as exc:
        fail(f"token exchange failed: HTTP {exc.code} {exc.read().decode(errors='replace')[:200]}")
        return 1

    access_token = token_response.get("access_token")
    if not access_token:
        fail(f"no access token returned: {token_response}")
        return 1
    ok("session token obtained")

    step(f"Creating the long-lived token '{args.token_name}'")
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
    socket_client = None
    try:
        socket_client = WebSocket(ws_url)
        greeting = socket_client.receive_json()
        if greeting.get("type") != "auth_required":
            fail(f"unexpected websocket greeting: {greeting}")
            return 1
        socket_client.send_json({"type": "auth", "access_token": access_token})
        auth_result = socket_client.receive_json()
        if auth_result.get("type") != "auth_ok":
            fail(f"websocket authentication failed: {auth_result}")
            return 1
        socket_client.send_json(
            {
                "id": 1,
                "type": "auth/long_lived_access_token",
                "client_name": args.token_name,
                "lifespan": TOKEN_LIFESPAN_DAYS,
            }
        )
        token_result = socket_client.receive_json()
    except (ConnectionError, OSError, ValueError) as exc:
        fail(f"websocket step failed: {exc}")
        return 1
    finally:
        if socket_client is not None:
            socket_client.close()

    if not token_result.get("success"):
        message = (token_result.get("error") or {}).get("message", "unknown error")
        fail(f"token creation refused: {message}")
        print(
            f"    A token named '{args.token_name}' may already exist. Delete it in Home Assistant\n"
            "    (profile -> Security) or re-run with --token-name '<another name>'."
        )
        return 1

    long_lived_token = token_result.get("result")
    if not long_lived_token:
        fail("no token returned")
        return 1
    ok(f"token created (valid {TOKEN_LIFESPAN_DAYS} days)")

    if args.print_token:
        print()
        print(long_lived_token)
        return 0

    repo_root = Path(__file__).resolve().parents[1]
    env_path = Path(args.env_file)
    if not env_path.is_absolute():
        env_path = repo_root / env_path
    step(f"Updating {env_path}")
    if set_env_value(env_path, "HOME_ASSISTANT_TOKEN", long_lived_token):
        ok("HOME_ASSISTANT_TOKEN written")

    if args.also_server_env:
        server_env = repo_root / "apps" / "server" / ".env"
        step(f"Updating {server_env}")
        if set_env_value(server_env, "HOME_ASSISTANT_TOKEN", long_lived_token):
            ok("HOME_ASSISTANT_TOKEN written")

    print()
    step("Next")
    print("    docker compose -f docker-compose.yml -f docker-compose.villacore.yml up -d backend")
    print("    then open 'Link VillaCore' in the portal and press 'Sincronizza catalogo'")
    print()
    print("The token was written to the env file only; it is deliberately not printed here.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
