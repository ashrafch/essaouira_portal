#!/bin/sh
# Off-site backup sync (host-side).
#
# The db-backup container writes gzip dumps into the `db_backups` Docker volume.
# Those dumps live on the same disk as the database, so a disk failure loses both.
# This script copies them to a remote (cloud bucket, NAS, another host) with rclone,
# which — unlike the postgres:alpine backup container — is available on the host.
#
# One-time setup:
#   1. install rclone on the host (https://rclone.org/install/)
#   2. configure a remote:            rclone config          (e.g. name it "offsite")
#   3. set REMOTE below or via env:   REMOTE=offsite:essaouira-portal-backups
#
# Run manually, or schedule it (host cron / Windows Task Scheduler), e.g. hourly:
#   0 * * * * /path/to/scripts/offsite-sync.sh >> /var/log/essa-offsite.log 2>&1
set -e

REMOTE="${REMOTE:-offsite:essaouira-portal-backups}"
VOLUME="${BACKUP_VOLUME:-essaouira-portal_db_backups}"
STAGING="${BACKUP_STAGING:-./.backup-staging}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "[offsite] rclone not found on host. Install it: https://rclone.org/install/" >&2
  exit 1
fi

echo "[offsite] exporting backups from volume '$VOLUME'"
mkdir -p "$STAGING"
# Copy the volume contents out via a throwaway container that mounts it read-only.
docker run --rm -v "${VOLUME}:/backups:ro" -v "$(pwd)/${STAGING}:/out" alpine \
  sh -c 'cp -a /backups/*.sql.gz /out/ 2>/dev/null || true'

echo "[offsite] syncing to '$REMOTE'"
rclone sync "$STAGING" "$REMOTE" --progress

echo "[offsite] cleaning staging"
rm -rf "$STAGING"
echo "[offsite] done"
