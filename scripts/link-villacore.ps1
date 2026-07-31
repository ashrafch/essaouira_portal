<#
.SYNOPSIS
    Prepares the shared Docker bridge between this portal and the VillaCore stack.

.DESCRIPTION
    Idempotent. Safe to re-run.

      1. creates the `villacore_link` network if missing;
      2. connects the running VillaCore Home Assistant container to it;
      3. resolves `home-assistant` from inside the network and, when a token is
         supplied, checks that the HA API accepts it;
      4. prints exactly what to put in .env.

    Nothing is deleted and no container is restarted. Connecting a container to
    an extra network is additive: existing traffic keeps working.

.PARAMETER Network
    Network name. Must match VILLACORE_LINK_NETWORK in .env (default villacore_link).

.PARAMETER HaContainer
    Name of the VillaCore Home Assistant container (default villacore-home-assistant-1).

.PARAMETER Token
    Optional long-lived HA token to validate. Never stored by this script.

.EXAMPLE
    .\scripts\link-villacore.ps1
    .\scripts\link-villacore.ps1 -Token "<long-lived-token>"
#>
[CmdletBinding()]
param(
    [string]$Network = "villacore_link",
    [string]$HaContainer = "villacore-home-assistant-1",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message) { Write-Host "    OK  $message" -ForegroundColor Green }
function Write-Warn2($message) { Write-Host "    !   $message" -ForegroundColor Yellow }
function Write-Fail($message) { Write-Host "    X   $message" -ForegroundColor Red }

# --- 1. Docker available ---------------------------------------------------
Write-Step "Checking Docker"
try {
    docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker version failed" }
} catch {
    Write-Fail "Docker is not reachable. Start Docker Desktop and re-run."
    exit 1
}
Write-Ok "Docker engine reachable"

# --- 2. Network -----------------------------------------------------------
Write-Step "Ensuring network '$Network'"
$existing = docker network ls --filter "name=^$Network$" --format '{{.Name}}'
if ($existing -eq $Network) {
    Write-Ok "already present"
} else {
    docker network create $Network | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "could not create the network"; exit 1 }
    Write-Ok "created"
}

# --- 3. Attach the VillaCore HA container --------------------------------
Write-Step "Attaching '$HaContainer'"
$running = docker ps --filter "name=^$HaContainer$" --format '{{.Names}}'
if ($running -ne $HaContainer) {
    Write-Warn2 "container not running. Start the VillaCore stack first (.\scripts\start.ps1 there),"
    Write-Warn2 "or pass -HaContainer with the real name (docker ps)."
    Write-Warn2 "The network exists, so you can re-run this script later."
    exit 2
}

$attachedRaw = docker inspect $HaContainer --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
$attached = @($attachedRaw -split '\s+' | Where-Object { $_ })
if ($attached -contains $Network) {
    Write-Ok "already on '$Network'"
} else {
    # Alias `home-assistant` keeps the URL identical no matter how the VillaCore
    # compose project names the service.
    docker network connect --alias home-assistant $Network $HaContainer
    if ($LASTEXITCODE -ne 0) { Write-Fail "could not attach the container"; exit 1 }
    Write-Ok "attached with alias 'home-assistant'"
}

# --- 4. Verify from inside the network -----------------------------------
# A throwaway container on the same network proves DNS + reachability the way
# the backend will see them. The HA image itself is reused so nothing is pulled.
Write-Step "Verifying http://home-assistant:8123 from inside the network"
$haImage = docker inspect $HaContainer --format '{{.Config.Image}}'

function Invoke-Probe {
    param([string]$Url, [string]$BearerToken = "")
    $args = @(
        "run", "--rm", "--network", $Network, "--entrypoint", "curl", $haImage,
        "-s", "-o", "/dev/null", "-m", "8", "-w", "%{http_code}"
    )
    if ($BearerToken) { $args += @("-H", "Authorization: Bearer $BearerToken") }
    $args += $Url
    return (& docker @args 2>&1 | Out-String).Trim()
}

$reach = Invoke-Probe -Url "http://home-assistant:8123/"
if ($reach -eq "200") {
    Write-Ok "reachable by service name"
} elseif ($reach -match "executable file not found") {
    Write-Warn2 "no curl in the HA image: reachability not verified automatically"
} else {
    Write-Fail "not reachable (answer: '$reach')"
    exit 1
}

if ($Token) {
    $auth = Invoke-Probe -Url "http://home-assistant:8123/api/" -BearerToken $Token
    switch ($auth) {
        "200" { Write-Ok "token accepted by the HA API" }
        "401" {
            Write-Fail "token rejected (401). It probably belongs to a different HA instance."
            exit 1
        }
        default {
            Write-Fail "unexpected API answer: '$auth'"
            exit 1
        }
    }
} else {
    Write-Warn2 "no -Token given: authentication not verified"
}

# --- 5. Next steps -------------------------------------------------------
$suggested = -join ((1..48) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] })

Write-Host ""
Write-Step "Put this in .env (portal root)"
Write-Host @"
    SMART_PROVIDER_MODE=villacore
    HOME_ASSISTANT_URL=http://home-assistant:8123
    HOME_ASSISTANT_TOKEN=<long-lived token from HA: profile -> Security>
    SMART_INGEST_TOKEN=$suggested
    SMART_POLL_INTERVAL_SECONDS=300
    VILLACORE_SITE_ID=dev
"@
Write-Step "Then start the portal with the link overlay"
Write-Host "    docker compose -f docker-compose.yml -f docker-compose.villacore.yml up -d --build"
Write-Step "In VillaCore, secrets.yaml needs the same shared secret"
Write-Host "    portal_ingest_token: $suggested"
Write-Host "    portal_base_url: http://backend:8000"
Write-Host ""
Write-Warn2 "The attachment above is a runtime one: Docker forgets it if the VillaCore"
Write-Warn2 "container is recreated. Apply prompt P1 in docs/VILLACORE_PROMPTS.md to make"
Write-Warn2 "it permanent in VillaCore's own docker-compose.yml."
