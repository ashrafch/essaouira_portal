#!/bin/sh
set -e

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_DB:=essa}"
: "${POSTGRES_USER:=essa}"
: "${POSTGRES_PASSWORD:=essa}"
: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_RETENTION_DAYS:=7}"

export PGPASSWORD="$POSTGRES_PASSWORD"

while true; do
  timestamp=$(date +"%Y%m%d_%H%M%S")
  file="/backups/${POSTGRES_DB}_${timestamp}.sql.gz"
  echo "[backup] creating $file"
  pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$file"

  echo "[backup] pruning files older than ${BACKUP_RETENTION_DAYS} days"
  find /backups -name "*.sql.gz" -type f -mtime +"$BACKUP_RETENTION_DAYS" -delete

  sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
done
