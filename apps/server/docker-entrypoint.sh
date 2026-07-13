#!/bin/sh
set -e

# Optionally apply database migrations before starting the API.
# Controlled by RUN_MIGRATIONS (default: false). The compose stack guarantees
# the database is healthy before this container starts.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying database migrations (alembic upgrade head)"
  alembic -c alembic.ini upgrade head
fi

exec "$@"
