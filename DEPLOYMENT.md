# Deployment Guide

Operational reference for building, deploying, and operating the Document AI / RAG Platform in staging and production. This is a standalone document (kept out of the root `README.md` to avoid bloating it) — link to it from `README.md`'s deployment section.

## Contents

- [Architecture overview](#architecture-overview)
- [Images](#images)
- [Environments and promotion flow](#environments-and-promotion-flow)
- [CI/CD pipeline](#cicd-pipeline)
- [Required CI/CD variables](#required-cicd-variables)
- [Cloudflare + reverse proxy](#cloudflare--reverse-proxy)
- [Database migrations: expand → migrate → deploy → contract](#database-migrations-expand--migrate--deploy--contract)
- [Backups and restore](#backups-and-restore)
- [Rollback procedure](#rollback-procedure)
- [Scaling](#scaling)
- [Local production-shaped testing](#local-production-shaped-testing)

## Architecture overview

Two deployable images, one reverse proxy, three pieces of infrastructure (managed or self-hosted):

```
                     ┌─────────────┐
  Internet ─────────▶│  Cloudflare │  (DNS, WAF, SSL: Full (strict))
                     └──────┬──────┘
                            │  HTTPS (Cloudflare origin cert)
                     ┌──────▼──────┐
                     │    nginx    │  deploy/nginx.conf
                     └──────┬──────┘
                            │  HTTP, internal network only
                ┌───────────┴────────────┐
                │                        │
          ┌─────▼─────┐                 │
          │    app     │ (Next.js,      │
          │  (N repl.) │  Dockerfile)    │
          └─────┬─────┘                 │
                │                        │
     ┌──────────┼────────────────────────┼──────────┐
     │           │                        │           │
┌────▼────┐ ┌────▼────┐            ┌──────▼──────┐    │
│ Postgres │ │  Redis  │            │  RabbitMQ   │    │
│(pgvector)│ │         │            │             │    │
└──────────┘ └─────────┘            └──────┬──────┘    │
                                            │            │
                                     ┌──────▼──────┐     │
                                     │   worker    │◀────┘
                                     │  (N repl., Dockerfile.worker)
                                     └─────────────┘
```

`app` and `worker` are independently built, independently deployed, independently scaled. `worker` has no HTTP server and is never reachable from nginx or the internet.

## Images

| Image | Dockerfile | Build context | Entrypoint |
|---|---|---|---|
| `document-ai` (app) | `Dockerfile` | repo root | `tini -- node_modules/.bin/next start` |
| `document-ai-worker` | `Dockerfile.worker` | repo root (**not** `worker/`) | `tini -- node dist/worker/src/index.js` |

Both build context is the **repository root**, not the respective subdirectory — see the comment blocks at the top of each Dockerfile for why (the worker compiles a hand-maintained allow-list of root `src/` files alongside its own `worker/src/`).

**`output: 'standalone'` was evaluated and NOT used in this phase.** A local `next build` with `output: 'standalone'` temporarily set (then reverted before committing — `next.config.mjs` is owned by a parallel workstream in this phase) confirmed standalone tracing works cleanly: it correctly follows the generated Prisma client/query-engine binary, and nothing in this codebase does a build-invisible `require()`/`readFileSync()` outside the traced dependency graph. The only reason it isn't used yet is that enabling it requires a one-line addition to `next.config.mjs`, which was out of scope here. `Dockerfile`'s runner stage instead does a full `npm ci --omit=dev` + `next start`. Once `output: 'standalone'` is added, the runner stage can be simplified to copy `.next/standalone` + `.next/static` + `public/` and run `node server.js` directly — smaller image, one less `npm ci`.

**Signal handling**: measured directly via `docker run` + `docker stop` on the built image, in three configurations — bare `next start` as PID 1 (exec-form CMD), `npm start` as PID 1, and `tini -- next start`. All three stopped within ~0.5–1.2s; `next start` run via exec-form CMD already forwards `SIGTERM` correctly on this Next.js version, so `tini` isn't fixing a broken shutdown here — it's kept as a standard, cheap defensive minimal-init (correct zombie reaping as PID 1) rather than a workaround.

## Environments and promotion flow

```
push to main
    │
    ▼
validate/quality/security/test/build/docker  (automatic)
    │
    ▼
staging_migrate → staging_deploy → staging_verify   (automatic, every push)
    │
    ▼
   [pipeline succeeds; production stages become available]
    │
    ▼
production_migration → deploy_production(+worker)   (MANUAL — click to run)
    │
    ▼
production_health_check   (automatic, once triggered)
```

Staging is **never** manual — every push to `main` that passes the automated quality gates deploys to staging automatically, gets migrated automatically, and gets smoke-tested automatically. Production is **always** manual — a human clicks `production_migration`, then `deploy_production` and `deploy_production_worker`, in GitLab's pipeline UI, only after reviewing what happened on staging.

This is enforced by GitLab CI/CD's stage ordering: the `staging_*` stages run before the `deploy`/`verify` (production) stages, so a broken automated staging deploy blocks the production jobs from even becoming available, without needing any extra branch-protection logic.

## CI/CD pipeline

See `.gitlab-ci.yml` (root of repo) for the full pipeline. Summary of what runs where:

| Stage | Jobs | Trigger |
|---|---|---|
| validate/quality/security/test/build | typecheck, lint, prisma_validate, prisma_migration_check, dependency_security, secret_scan, all_phase_tests, modern_test_suite, worker_build, production_build | automatic, every push to `main` |
| docker | docker_build (app), docker_build_worker | automatic |
| security | docker_security_scan, docker_security_scan_worker | automatic |
| staging_migrate | staging_migration | automatic |
| staging_deploy | deploy_staging, deploy_staging_worker | automatic |
| staging_verify | staging_health_check, smoke_test | automatic |
| deploy | production_migration, deploy_production, deploy_production_worker | **manual** |
| verify | production_health_check | automatic, once a manual deploy job runs |

`modern_test_suite` is new in this phase — it runs `npm run test:ci` (jest, tests/unit + integration + api + security + components + phase40 onward, per `jest.config.ts`'s own `testMatch`), covering everything `all_phase_tests` (the legacy Phase 7–32 `tsx`-based regression script) does not.

**A configuration bug was found and fixed**: every job's `rules` previously gated on `$CI_COMMIT_BRANCH == "master"`, but this repository's actual default/working branch is `main` — the pipeline as originally written could never trigger. All occurrences were changed to `"main"`.

**A dependency-drift bug was found and fixed**: `worker/package-lock.json` was out of sync with `worker/package.json` (missing the `@aws-sdk/client-s3` dependency tree entirely, still referencing a no-longer-used `@prisma/client`), which made a from-scratch `npm --prefix worker ci` fail outright. Regenerated via `npm --prefix worker install`.

**A root-vs-worker dependency assumption was found and fixed**: the pre-existing `worker_build` CI job deliberately skips installing root `npm` dependencies (per its own comment), but `worker/tsconfig.json`'s `include` pulls in whole root `src/` directories that import packages declared only in the ROOT `package.json`. Verified this breaks a from-scratch worker build; `worker_build` and `Dockerfile.worker` were both changed to install/use the root dependency tree (a proven superset) instead.

**A path-alias runtime bug was found and fixed**: `worker/tsconfig.json` has `rootDir: "../"` (so it can compile the allow-listed root `src/` files too), which changes `tsc`'s emitted directory structure — `worker/src/index.ts` compiles to `worker/dist/worker/src/index.js`, not `worker/dist/index.js`. `worker/package.json`'s own `start` script pointed at the wrong path. Separately, `tsc` does not rewrite `@/*` path-alias imports to relative paths at all — the compiled JS retained literal `require("@/config/env")` calls that fail under plain `node`. Fixed by: (1) correcting `worker/package.json`'s `start` script to `node dist/worker/src/index.js`, and (2) adding `tsc-alias` as a build step (`"build": "tsc && tsc-alias -p tsconfig.json"`), which rewrites the compiled output's aliases to real relative paths. Verified via an actual `docker run` of the built worker image connected to the real dev Postgres/Redis/RabbitMQ containers — it starts, connects, and begins consuming its queues.

**An ESLint false-positive was found and fixed**: `.eslintrc.json` only declared the base (non-TypeScript-aware) `no-unused-vars` rule, which does not understand TypeScript constructor parameter properties (`constructor(private readonly x: string) {}`) — it flagged the parameter as unused even though it's used via `this.x`. This broke `next build`'s bundled lint step (which runs on every `docker build`) for any file using that pattern. Fixed by registering the `@typescript-eslint` plugin and switching to `@typescript-eslint/no-unused-vars` with the same ignore patterns plus `caughtErrors: "none"` (to exactly preserve the previous behavior for `catch (err) {}` blocks) — verified via a full `npm run lint` before/after diff that this introduces zero new errors anywhere else in the codebase.

## Required CI/CD variables

Configure these in GitLab → Settings → CI/CD → Variables. Mark anything credential-shaped as **Protected** + **Masked**.

| Variable | Used by | Notes |
|---|---|---|
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | docker_build*, deploy_* | shared container registry login |
| `PROD_HOST` / `PROD_USER` / `PROD_SSH_PRIVATE_KEY` | deploy_production, deploy_production_worker, production_migration | production deploy target |
| `STAGING_HOST` / `STAGING_USER` / `STAGING_SSH_PRIVATE_KEY` | deploy_staging, deploy_staging_worker | staging deploy target (new this phase) |
| `PRODUCTION_URL` | production_health_check | e.g. `https://yourdomain.com` |
| `STAGING_URL` | staging_health_check, smoke_test | e.g. `https://staging.yourdomain.com` (new this phase) |
| `DATABASE_URL` | production_migration, staging_migration | **environment-scoped** — set two entries with this same name, one scoped to the `production` environment, one to `staging`, via GitLab's per-variable "Environment scope" field. Never reuse one value across both. |

On each deploy host (`/opt/document-ai/.env` and `/opt/document-ai-worker/.env`, per the paths `deploy_production`/`deploy_staging` reference): populate from `.env.production.example` / `.env.staging.example` respectively (see those files' own header comments for the full variable list and which ones are secrets vs. safe defaults).

## Cloudflare + reverse proxy

**SSL mode: Full (strict).** Never "Flexible" and never plain "Full":

- **Flexible** terminates TLS at Cloudflare and connects to your origin over **plain HTTP**, including across the public internet if your origin isn't literally inside Cloudflare's network. Session cookies, auth tokens, and every request body would cross the open internet in cleartext between Cloudflare and your server. Unsafe for any app with login/session state, which this app has.
- **Full** (non-strict) does encrypt Cloudflare→origin, but accepts **any** certificate at the origin, including a self-signed one — meaning it doesn't actually verify it's talking to your server, just that traffic is encrypted to *someone*.
- **Full (strict)** requires the origin to present a certificate Cloudflare itself validates — either a publicly trusted cert, or (simpler for a single origin you control) a **Cloudflare Origin Certificate**, issued from the Cloudflare dashboard (SSL/TLS → Origin Server → Create Certificate). This is what `deploy/nginx.conf` expects at `/etc/nginx/certs/cloudflare-origin.pem` / `cloudflare-origin-key.pem`.

Steps:
1. Cloudflare dashboard → SSL/TLS → Origin Server → Create Certificate → download the cert + key.
2. On the deploy host: `mkdir -p deploy/certs`, place the two files there as `cloudflare-origin.pem` / `cloudflare-origin-key.pem` (referenced as a bind mount in `docker-compose.prod.yml`'s `nginx` service — this directory is intentionally **not** committed to git).
3. Cloudflare dashboard → SSL/TLS → Overview → set mode to **Full (strict)**.

**WAF recommendations**: enable Cloudflare's Managed Ruleset (OWASP core rules) at minimum; consider rate-limiting rules on `/api/auth/login` and `/api/auth/register` in Cloudflare itself as a second layer on top of `deploy/nginx.conf`'s own `limit_req` and the app's own `src/lib/rate-limit.ts`.

**Cache-bypass rules** (Cloudflare → Caching → Cache Rules, or a Page Rule): set "Bypass cache" for these paths — they must never be cached by Cloudflare's edge:
- `/api/chat/stream`, `/api/assistant/chat`, `/api/explore/stream`, `/api/collaboration/events` (all streaming SSE responses — found via `grep -rl "ReadableStream\|text/event-stream" src/app/api`)
- `/api/webhooks/*` (webhook endpoints — payment/integration callbacks must reach the app every time)
- `/api/auth/*` and any other authenticated route — by default Cloudflare only caches static-asset-shaped responses, but an explicit bypass rule for `/api/*` as a whole is the safest blanket rule; only `public/`-served static assets should ever be edge-cached.

`deploy/nginx.conf` itself sets `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding on`, and a 3600s `proxy_read_timeout`/`proxy_send_timeout` specifically for the four streaming routes above, so nginx doesn't buffer or time out a long-lived SSE connection even if Cloudflare's own bypass is misconfigured.

**No `TRUST_PROXY`-style env var exists or is needed**: checked `src/config/env.ts`, `src/lib/auth.ts`, and `src/features/auth/session.service.ts` — the session cookie's `secure` flag is set from `process.env.NODE_ENV === 'production'` directly, not by inspecting the incoming request. As long as the container runs with `NODE_ENV=production` (set in `Dockerfile`), cookies are marked `secure` correctly regardless of TLS terminating at the proxy in front of it.

## Database migrations: expand → migrate → deploy → contract

This is the standard safe pattern for changing a schema that live traffic is reading/writing against, without downtime. In plain terms:

1. **Expand**: add the new column/table/index in a migration that is purely *additive* — nothing existing reads or depends on it yet. Old application code keeps working unmodified because nothing it relies on changed or disappeared.
2. **Migrate**: run that migration (`scripts/deploy-migrate.sh`, which wraps `npx prisma migrate deploy`) against the target database, *before* deploying the new app code that will use the new column.
3. **Deploy**: roll out the new application code (the CI pipeline's `deploy_staging`/`deploy_production` jobs) that reads/writes the new column. Because step 1 was purely additive, the *old* code (still running on any container mid-rollout) never broke, and the *new* code now has the schema it needs.
4. **Contract**: once you're confident the new code is fully rolled out and nothing needs the old column/shape anymore, ship a *separate*, later migration that drops/renames the now-unused old column. Never combine a destructive change with the additive change in the same migration/deploy — that's what removes the safety margin.

**Example**: renaming `User.fullName` to `User.displayName`.
- ❌ Unsafe: one migration that renames the column directly. Any app instance still running old code (mid-rollout, or if rollback is needed) breaks immediately — the column it expects no longer exists.
- ✅ Safe: (1) *expand* — add a new nullable `displayName` column; (2) *migrate* — deploy that migration; (3) ship application code that writes to *both* columns and reads from `displayName` with a fallback to `fullName`; deploy it; (4) once fully rolled out, backfill any remaining `displayName IS NULL` rows from `fullName`; (5) *contract* — a later migration drops `fullName` once nothing reads it.

## Backups and restore

`scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` are for the **self-hosted docker-compose path only**. If you're on a managed Postgres provider (RDS, Cloud SQL, Supabase, Neon, etc.), use that provider's own automated backup / point-in-time recovery instead — it will be more reliable and space-efficient than a cron'd `pg_dump`.

- `scripts/backup-postgres.sh`: `pg_dump -Fc` (custom format) to `$BACKUP_DIR` (default `./backups`), prunes anything older than `$BACKUP_RETENTION_DAYS` (default 14).
- `scripts/restore-postgres.sh <file>`: `pg_restore --clean --if-exists` into `$DATABASE_URL`. **Requires typing `YES` interactively** unless `--yes` is passed (intended only for scripted disaster-recovery runbooks you already trust — never point `--yes` at a database you haven't personally verified is the target).
- `scripts/deploy-migrate.sh`: the migration-safety wrapper the CI pipeline calls — backup → verify connectivity → `npx prisma migrate deploy` (**never** `prisma db push`) → verify via `prisma migrate status`. Does **not** deploy the application itself; that's the CI pipeline's job.

## Rollback procedure

Two independent axes — application code and database schema — with different safe rollback mechanics:

**Application rollback** (fast, safe, automatic on a failed deploy): `deploy_production`/`deploy_staging` already do this automatically — before stopping the running container, they save its current image tag to `previous-image.txt`; if the new container fails its running-status check, they automatically `docker pull` and restart the previous image. For a rollback *after* a deploy has already succeeded but a problem is found later, redeploy manually using the previous immutable `document-ai:<sha>` / `document-ai-worker:<sha>` tag — every image is tagged with its immutable commit SHA specifically so this is always possible; `latest` is never what gets deployed.

**Database rollback** (deliberately **not automatic** — this is intentional): Prisma has no built-in "undo migration" — migrations are forward-only by design. If a migration causes a problem:
- **Forward-fix (preferred)**: write a new migration that corrects the issue, following the same expand→migrate→deploy→contract discipline above. This is almost always safer than trying to reverse a migration that live traffic may have already written data under.
- **Restore from backup**: only if forward-fixing isn't viable (e.g. the migration corrupted/lost data) — use `scripts/restore-postgres.sh` against the most recent pre-migration backup (`scripts/deploy-migrate.sh` takes one automatically before every migration it runs). This loses any writes made between that backup and the restore, so it's a last resort, not a routine rollback tool.

Never attempt to hand-write a "down" migration that mechanically reverses an `up` migration's SQL — Prisma's migration history doesn't model that, and it's very easy to silently lose data that was written against the newer schema in between.

## Scaling

`docker-compose.prod.yml`'s `app` and `worker` services intentionally have **no fixed `replicas:`** — scale explicitly:

```
docker compose -f docker-compose.prod.yml up -d --scale app=3 --scale worker=2
```

`nginx`'s upstream block resolves the `app` service name via Docker's embedded DNS and round-robins across however many replicas are running. `worker` replicas are competing consumers on the same RabbitMQ queues — no coordination needed beyond that.

**Storage caveat**: if you scale `app`/`worker` beyond 1 replica, set `STORAGE_PROVIDER=s3` (not `local`) — local disk storage is per-container and does not survive a container replacement or get shared across replicas. See `.env.production.example`'s own inline reminder on this.

## Local production-shaped testing

```bash
docker build -f Dockerfile -t document-ai-app:test .
docker build -f Dockerfile.worker -t document-ai-worker:test .
docker compose -f docker-compose.prod.yml config   # validates the compose file
```

To actually run both containers against real infrastructure (e.g. the existing dev `docker-compose.yml` stack), attach them to its network:

```bash
docker run -d --name test-app --network ai-chat_agent_default \
  -e DATABASE_URL=... -e RABBITMQ_URL=... -e REDIS_URL=... \
  document-ai-app:test
```

## Future alternative: blue/green deployment

This phase implements a **rolling** deploy (stop old container → start new container, with automatic rollback to the previous image on failure — see `deploy_production`/`deploy_staging` in `.gitlab-ci.yml`). A future phase could move to **blue/green**: run the new version fully up and health-checked alongside the old version (on a separate container name / port), then atomically flip the reverse proxy's upstream to point at the new one, keeping the old one running (but out of rotation) for an instant rollback with zero cutover downtime. This trades operational complexity (two full environments running simultaneously, more moving parts in the proxy config) for a shorter/safer cutover window than the current approach's brief stop-then-start gap. Not implemented in this phase — the rolling approach above, combined with the immutable-tag + automatic-rollback-on-failed-healthcheck pattern already in `deploy_production`, was judged sufficient for this phase's scope.
