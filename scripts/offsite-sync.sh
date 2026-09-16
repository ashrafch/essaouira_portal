#!/bin/sh
# Host-side copy to a configured rclone remote; remote retention is independent.
set -eu
umask 077

: "${REMOTE:?Set REMOTE to a configured, preferably encrypted rclone destination}"
VOLUME="${BACKUP_VOLUME:-essaouira-portal_db_backups}"
PARENT="${BACKUP_STAGING:-${TMPDIR:-/tmp}}"

command -v rclone >/dev/null 2>&1 || { echo '[offsite] rclone is required' >&2; exit 1; }
# Docker otherwise creates a missing named volume and a typo looks like success.
docker volume inspect "$VOLUME" >/dev/null
mkdir -p "$PARENT"
PARENT=$(cd "$PARENT" && pwd)
STAGING=$(mktemp -d "$PARENT/portal-backup.XXXXXXXX")
case "$STAGING" in "$PARENT"/portal-backup.*) ;; *) exit 1 ;; esac
trap 'rm -rf -- "$STAGING"' EXIT
trap 'exit 1' HUP INT TERM

docker run --rm \
  --mount "type=volume,source=$VOLUME,target=/backups,readonly" \
  --mount "type=bind,source=$STAGING,target=/out" alpine:3.21 \
  sh -ec '
    count=0
    for file in /backups/*.dump /backups/*.sql.gz; do
      [ -f "$file" ] || continue
      [ -s "$file" ] || exit 1
      cp "$file" /out/
      count=$((count + 1))
    done
    [ "$count" -gt 0 ] || { echo "[offsite] no completed backups" >&2; exit 1; }
  '

# Never use sync: an empty/partial local export must not delete disaster recovery.
rclone copy "$STAGING" "$REMOTE"
echo '[offsite] copy completed; remote retention unchanged'
