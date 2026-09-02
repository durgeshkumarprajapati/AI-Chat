#!/usr/bin/env bash
#
# deploy-migrate.sh
#
# The migration-safety sub-step used by the CI pipeline's
# `production_migration` and `staging_migration` jobs (.gitlab-ci.yml).
#
# IMPORTANT: this script does NOT deploy the application. Deploying the
# app/worker containers is the CI pipeline's job (deploy_production /
# deploy_production_worker / deploy_staging / deploy_staging_worker).
# This script's only responsibility is making a schema migration safe:
#
#   1. Back up the database (skippable for managed-provider users — see
#      below).
#   2. Verify DB connectivity before attempting anything destructive.
#   3. Run `npx prisma migrate deploy` — NEVER `prisma db push`. `db push`
#      is a dev-only, non-versioned schema sync command with no migration
#      history and no rollback story; it must never run against a
#      real environment.
#   4. Verify the migration actually succeeded (exit code + `prisma
#      migrate status`).
#
# Exits non-zero on any step's failure, so the calling CI job fails loudly
# rather than silently proceeding to deploy a container against a
# database in an unknown state.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/deploy-migrate.sh
#
# Env vars:
#   DATABASE_URL   (required) target database for the migration.
#   SKIP_BACKUP    (optional) set to "true" to skip step 1 — intended for
#                  teams on a MANAGED Postgres provider (RDS, Cloud SQL,
#                  Supabase, Neon, ...) that already takes its own
#                  automated backups / supports point-in-time recovery.
#                  Default: "false" (self-hosted docker-compose path).
#   BACKUP_DIR / BACKUP_RETENTION_DAYS
#                  (optional) forwarded to scripts/backup-postgres.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SKIP_BACKUP="${SKIP_BACKUP:-false}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Refusing to run a migration without a target." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx is not installed/on PATH (this script expects to run where the" >&2
  echo "project's npm dependencies — including the 'prisma' CLI — are installed)." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 1: Backup
# ---------------------------------------------------------------------------

if [ "$SKIP_BACKUP" = "true" ]; then
  echo "[1/4] SKIP_BACKUP=true — skipping backup step (assuming a managed Postgres"
  echo "      provider's own automated backup / PITR is in place)."
else
  echo "[1/4] Backing up database before migration..."

  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "ERROR: pg_dump is not installed and SKIP_BACKUP is not 'true'." >&2
    echo "  Either install postgresql-client (e.g. 'apt-get install -y postgresql-client')" >&2
    echo "  or, if this database is on a managed provider with its own automated" >&2
    echo "  backups, re-run with SKIP_BACKUP=true." >&2
    exit 1
  fi

  if ! "$SCRIPT_DIR/backup-postgres.sh"; then
    echo "ERROR: backup-postgres.sh failed. Aborting migration — refusing to run an" >&2
    echo "unbacked-up schema migration against this database." >&2
    exit 1
  fi

  echo "      Backup completed."
fi

# ---------------------------------------------------------------------------
# Step 2: Verify DB connectivity
# ---------------------------------------------------------------------------

echo "[2/4] Verifying database connectivity..."

if command -v pg_isready >/dev/null 2>&1; then
  if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    echo "ERROR: pg_isready reports the database is not reachable. Aborting." >&2
    exit 1
  fi
else
  # pg_isready is part of the same postgresql-client package as pg_dump;
  # if it's unavailable (e.g. SKIP_BACKUP=true on a minimal image), fall
  # back to a lightweight Prisma-driven connectivity check instead of
  # failing outright.
  echo "      pg_isready not found — falling back to 'npx prisma db execute'."
  if ! echo "SELECT 1;" | npx prisma db execute --url "$DATABASE_URL" --stdin >/dev/null; then
    echo "ERROR: could not connect to the database via Prisma. Aborting." >&2
    exit 1
  fi
fi

echo "      Database is reachable."

# ---------------------------------------------------------------------------
# Step 3: Run the migration (NEVER `prisma db push`)
# ---------------------------------------------------------------------------

echo "[3/4] Running 'npx prisma migrate deploy'..."

if ! npx prisma migrate deploy; then
  echo "ERROR: 'prisma migrate deploy' failed. The database may be left mid-migration —" >&2
  echo "do NOT retry blindly. Investigate via 'npx prisma migrate status' and consult" >&2
  echo "DEPLOYMENT.md's rollback section (restore from the backup taken in step 1, or" >&2
  echo "forward-fix with a new migration) before taking further action." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Verify success
# ---------------------------------------------------------------------------

echo "[4/4] Verifying migration status..."

if ! npx prisma migrate status; then
  echo "ERROR: 'prisma migrate status' reports a problem after a reported-successful" >&2
  echo "deploy. Treating this as a failure — investigate before deploying the app." >&2
  exit 1
fi

echo ""
echo "=========================================="
echo "Migration completed and verified successfully."
echo "=========================================="
