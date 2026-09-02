#!/usr/bin/env bash
#
# restore-postgres.sh
#
# Restores a backup produced by scripts/backup-postgres.sh (a pg_dump
# custom-format `-Fc` file) into the database pointed at by DATABASE_URL.
#
# ##############################################################
# #  DANGER — THIS OVERWRITES THE TARGET DATABASE.             #
# #  DOUBLE-CHECK DATABASE_URL BEFORE CONFIRMING.               #
# #  THERE IS NO UNDO ONCE THE RESTORE STARTS.                  #
# ##############################################################
#
# This script NEVER runs unattended against a real database: it always
# prints the exact target (parsed from DATABASE_URL, password redacted)
# and requires an explicit interactive "yes" confirmation, unless you
# pass --yes (intended ONLY for a scripted disaster-recovery runbook you
# already trust, e.g. restoring into a freshly provisioned, still-empty
# database — never point --yes at a database you have not personally
# verified is the intended target).
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
#     ./scripts/restore-postgres.sh ./backups/document-ai-20260101T000000Z.dump
#
#   # Non-interactive (disaster-recovery automation only — see warning above):
#   ./scripts/restore-postgres.sh --yes /path/to/backup.dump
#
# Env vars:
#   DATABASE_URL   (required) Postgres connection string to restore INTO.
#
# Exit codes: non-zero on any failure or if the user declines to confirm.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

AUTO_YES=0
BACKUP_FILE=""

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      AUTO_YES=1
      ;;
    *)
      BACKUP_FILE="$arg"
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: DATABASE_URL=... $0 [--yes] <path-to-backup.dump>" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to run pg_restore without a target." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "ERROR: pg_restore is not installed/on PATH. Install the postgresql-client package." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Redact the password out of DATABASE_URL for safe display, and extract the
# host/db name so the confirmation prompt is unambiguous about the target.
# ---------------------------------------------------------------------------

REDACTED_URL="$(echo "$DATABASE_URL" | sed -E 's#(://[^:]+):[^@]*@#\1:***@#')"

echo "############################################################"
echo "#  DESTRUCTIVE OPERATION — DATABASE RESTORE                #"
echo "############################################################"
echo ""
echo "  Backup file : $BACKUP_FILE"
echo "  Target DB   : $REDACTED_URL"
echo ""
echo "  This will DROP conflicting objects and OVERWRITE data in the"
echo "  target database with the contents of the backup file above."
echo "  Any data written to the target database AFTER the backup was"
echo "  taken will be LOST."
echo ""

if [ "$AUTO_YES" -ne 1 ]; then
  read -r -p "Type the exact word YES (all caps) to proceed: " CONFIRMATION
  if [ "$CONFIRMATION" != "YES" ]; then
    echo "Confirmation not received. Aborting — no changes made." >&2
    exit 1
  fi
else
  echo "  --yes passed: skipping interactive confirmation (scripted disaster-recovery mode)."
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

echo ""
echo "Starting restore..."

# --clean --if-exists: drop existing objects before recreating them, so
# this is a full overwrite rather than an additive merge (merging two
# databases via pg_restore is not something this script attempts).
# --no-owner --no-privileges: don't fail on role mismatches between the
# environment the backup was taken in and the one being restored into.
if ! pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$DATABASE_URL" \
  "$BACKUP_FILE"; then
  echo "ERROR: pg_restore reported failures. Inspect the output above — a partial" >&2
  echo "restore may have been applied. Do not assume the database is consistent." >&2
  exit 1
fi

echo ""
echo "Restore completed successfully from: $BACKUP_FILE"
