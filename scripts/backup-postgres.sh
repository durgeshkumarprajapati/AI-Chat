#!/usr/bin/env bash
#
# backup-postgres.sh
#
# Dumps the database pointed at by DATABASE_URL to a timestamped,
# compressed pg_dump custom-format (-Fc) file, then prunes backups older
# than a configurable retention window.
#
# IMPORTANT — this script is for the self-hosted docker-compose deployment
# path ONLY. If you are using a MANAGED PostgreSQL provider (RDS, Cloud
# SQL, Supabase, Neon, Render Postgres, etc.), use that provider's own
# automated backup / point-in-time-recovery feature instead — it will be
# more reliable, more space-efficient (incremental), and does not require
# this script's cron/CI wiring. This script exists for teams running
# their own `postgres` container via docker-compose.prod.yml.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup-postgres.sh
#
# Env vars:
#   DATABASE_URL       (required) Postgres connection string to back up.
#   BACKUP_DIR         (optional) Output directory. Default: ./backups
#   BACKUP_RETENTION_DAYS
#                       (optional) Delete backups older than N days.
#                       Default: 14
#
# Output:
#   $BACKUP_DIR/document-ai-<UTC timestamp>.dump
#
# Restoring a backup made by this script: see scripts/restore-postgres.sh
# (pg_restore, not psql — this uses pg_dump's custom format, not plain
# SQL, so it can be restored selectively / in parallel).
#
# Exit codes: non-zero on any failure, so this can be safely chained from
# deploy-migrate.sh or a cron job / CI job that should react to failure.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to run pg_dump without a target." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump is not installed/on PATH. Install the postgresql-client package." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/document-ai-${TIMESTAMP}.dump"

# ---------------------------------------------------------------------------
# Dump
# ---------------------------------------------------------------------------

echo "Starting Postgres backup..."
echo "  Output: $OUT_FILE"

# -Fc: custom format — compressed by default, supports selective/parallel
# restore via pg_restore (unlike plain-SQL `pg_dump > file.sql`).
if ! pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$OUT_FILE"; then
  echo "ERROR: pg_dump failed." >&2
  # Remove a partial/corrupt dump file rather than leaving a misleading
  # zero-byte or truncated backup behind.
  rm -f "$OUT_FILE"
  exit 1
fi

if [ ! -s "$OUT_FILE" ]; then
  echo "ERROR: backup file is empty after pg_dump reported success — treating as a failure." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "Backup completed successfully: $OUT_FILE ($SIZE)"

# ---------------------------------------------------------------------------
# Retention pruning
# ---------------------------------------------------------------------------

echo "Pruning backups older than $BACKUP_RETENTION_DAYS days in $BACKUP_DIR..."

DELETED_COUNT=0
while IFS= read -r -d '' old_file; do
  echo "  Deleting old backup: $old_file"
  rm -f "$old_file"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'document-ai-*.dump' -mtime "+${BACKUP_RETENTION_DAYS}" -print0)

echo "Retention pruning complete. Deleted $DELETED_COUNT old backup(s)."
echo "$OUT_FILE"
