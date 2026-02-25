#!/bin/sh
set -e

: "${POSTGRES_HOST:=localhost}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=essa}"
: "${POSTGRES_PASSWORD:=essa}"
: "${POSTGRES_DB:=essa}"
: "${RESTORE_CLEAN:=true}"

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file.sql.gz|backup_file.sql>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] file not found: $BACKUP_FILE"
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

if [ "$RESTORE_CLEAN" = "true" ]; then
  echo "[restore] cleaning schema on database $POSTGRES_DB"
  psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
fi

echo "[restore] restoring $BACKUP_FILE into $POSTGRES_DB"
case "$BACKUP_FILE" in
  *.gz)
    gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
    ;;
  *)
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$BACKUP_FILE"
    ;;
esac

echo "[restore] completed"
