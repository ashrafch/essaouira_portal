#!/bin/sh
set -eu
umask 077

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_DB:=essa}"
: "${POSTGRES_USER:=essa}"
: "${POSTGRES_PASSWORD:=essa}"
: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_RETENTION_DAYS:=7}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_ONCE:=false}"

for value in "$BACKUP_INTERVAL_HOURS" "$BACKUP_RETENTION_DAYS"; do
  case "$value" in ''|*[!0-9]*|0) echo "[backup] interval and retention must be positive integers" >&2; exit 1 ;; esac
done

mkdir -p "$BACKUP_DIR"
partial=""
trap 'if [ -n "$partial" ]; then rm -f -- "$partial"; fi' EXIT
trap 'exit 1' HUP INT TERM

export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  timestamp=$(date -u +"%Y%m%d_%H%M%S")
  file="$BACKUP_DIR/portal_${timestamp}_$$.dump"
  partial="${file}.partial"
  echo "[backup] creating PostgreSQL archive"
  # No pipeline: pg_dump failure must stop the job, even if compression succeeds.
  pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -Fc -f "$partial" "$POSTGRES_DB"
  test -s "$partial"
  pg_restore --list "$partial" >/dev/null
  mv -- "$partial" "$file"
  partial=""
  echo "[backup] archive completed: $(basename "$file")"

  echo "[backup] pruning files older than ${BACKUP_RETENTION_DAYS} days"
  find "$BACKUP_DIR" -name 'portal_*.dump' -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete

  if [ "$BACKUP_ONCE" = "true" ]; then exit 0; fi

  sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
done
