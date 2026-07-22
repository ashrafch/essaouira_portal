"""Minimal iCalendar (RFC 5545) helpers for availability sync.

We only need all-day busy blocks (DTSTART/DTEND as dates), so this is a small,
dependency-free reader/writer rather than a full iCal library. HTTP fetching
uses the stdlib ``urllib`` (same choice as the Home Assistant adapter).
"""

import hashlib
import hmac
import urllib.request
from datetime import date, datetime, timedelta, timezone

from app.core.config import settings

_PRODID = "-//Essaouira Portal//Revenue iCal//IT"


def export_token(unit_id: int) -> str:
    """Stable, unguessable token for a unit's public export URL (HMAC of the
    unit id with the app secret). No storage needed; rotates with the secret."""
    mac = hmac.new(
        settings.auth_secret_key.encode("utf-8"),
        f"ical:{unit_id}".encode("utf-8"),
        hashlib.sha256,
    )
    return mac.hexdigest()[:20]


def _fmt_date(d: date) -> str:
    return d.strftime("%Y%m%d")


def build_ical_for_unit(unit_name: str, bookings: list, *, stamp: datetime | None = None) -> str:
    """VCALENDAR of all-day busy blocks. Guest data is NOT included — each event
    is a generic 'Reserved' block, so the export is safe to share with OTAs."""
    dtstamp = (stamp or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{_PRODID}",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{unit_name} — Essaouira Portal",
    ]
    for b in bookings:
        lines += [
            "BEGIN:VEVENT",
            f"UID:booking-{b.id}@essaouira-portal",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART;VALUE=DATE:{_fmt_date(b.checkin_date)}",
            f"DTEND;VALUE=DATE:{_fmt_date(b.checkout_date)}",
            "SUMMARY:Reserved",
            "TRANSP:OPAQUE",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _unfold(text: str) -> list[str]:
    """RFC 5545 line unfolding: a leading space/tab continues the prior line."""
    raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    for line in raw:
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def _parse_ical_date(value: str) -> date | None:
    v = value.strip()
    if not v:
        return None
    # DATE (YYYYMMDD) or DATE-TIME (YYYYMMDDTHHMMSS[Z]) — we only need the day.
    digits = v[:8]
    try:
        return datetime.strptime(digits, "%Y%m%d").date()
    except ValueError:
        return None


def parse_ical_events(text: str) -> list[dict]:
    """Extract busy blocks: [{uid, start: date, end: date, summary}].

    DTEND is treated as exclusive (iCal all-day convention); when absent it
    defaults to start + 1 day."""
    events: list[dict] = []
    current: dict | None = None
    for line in _unfold(text or ""):
        stripped = line.strip()
        if stripped == "BEGIN:VEVENT":
            current = {"uid": None, "start": None, "end": None, "summary": ""}
            continue
        if stripped == "END:VEVENT":
            if current and current["start"] is not None:
                if current["end"] is None:
                    current["end"] = current["start"] + timedelta(days=1)
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        name_part, value = line.split(":", 1)
        name = name_part.split(";", 1)[0].strip().upper()
        if name == "UID":
            current["uid"] = value.strip()
        elif name == "DTSTART":
            current["start"] = _parse_ical_date(value)
        elif name == "DTEND":
            current["end"] = _parse_ical_date(value)
        elif name == "SUMMARY":
            current["summary"] = value.strip()
    return events


def fetch_ical(url: str, timeout: float = 10.0) -> str:
    """Fetch a remote .ics document. Raises on network/HTTP errors."""
    req = urllib.request.Request(url, headers={"User-Agent": "EssaouiraPortal/iCal"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted operator URL)
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")
