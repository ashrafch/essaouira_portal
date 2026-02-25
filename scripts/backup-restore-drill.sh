#!/bin/sh
set -e

: "${POSTGRES_DB:=essa}"
: "${POSTGRES_USER:=essa}"
: "${POSTGRES_PASSWORD:=essa}"
: "${DRILL_DB:=essa_restore_drill}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[drill] docker is required"
  exit 1
fi

if ! docker compose ps >/dev/null 2>&1; then
  echo "[drill] docker compose stack not available"
  exit 1
fi

timestamp=$(date +"%Y%m%d_%H%M%S")
backup_file="./backup_restore_drill_${POSTGRES_DB}_${timestamp}.sql.gz"

echo "[drill] creating backup from db container -> $backup_file"
docker compose exec -T db sh -lc "export PGPASSWORD='$POSTGRES_PASSWORD'; pg_dump -U '$POSTGRES_USER' '$POSTGRES_DB' | gzip -c" > "$backup_file"

echo "[drill] recreating drill database: $DRILL_DB"
docker compose exec -T db sh -lc "export PGPASSWORD='$POSTGRES_PASSWORD'; psql -U '$POSTGRES_USER' -d postgres -v ON_ERROR_STOP=1 -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DRILL_DB}';\" -c \"DROP DATABASE IF EXISTS ${DRILL_DB};\" -c \"CREATE DATABASE ${DRILL_DB};\""

echo "[drill] restoring backup into $DRILL_DB"
cat "$backup_file" | docker compose exec -T db sh -lc "export PGPASSWORD='$POSTGRES_PASSWORD'; gunzip -c | psql -U '$POSTGRES_USER' -d '$DRILL_DB' -v ON_ERROR_STOP=1"

tables_count=$(docker compose exec -T db sh -lc "export PGPASSWORD='$POSTGRES_PASSWORD'; psql -U '$POSTGRES_USER' -d '$DRILL_DB' -tAc \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';\"")
echo "[drill] public tables in $DRILL_DB: $tables_count"

if [ "$tables_count" -le 0 ]; then
  echo "[drill] failed: no tables restored"
  exit 1
fi

echo "[drill] success"
