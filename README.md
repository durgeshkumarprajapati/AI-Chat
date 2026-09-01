# Enterprise AI Workspace Platform

A production-grade enterprise AI workspace: document intelligence and Retrieval-Augmented
Generation (RAG), a Knowledge Graph, proactive AI Intelligence, human-approved AI Agents,
trigger-based Workflow Automation, a Global AI Assistant, and persistent AI Memory —
built on Next.js (App Router), TypeScript, PostgreSQL (`pgvector`), Redis, RabbitMQ, and a
closed, provider-routed LLM Gateway.

This document describes the system **as implemented**. It does not describe planned or
aspirational functionality; where something is not implemented, that is stated explicitly.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Features](#2-core-features)
3. [System Architecture](#3-system-architecture)
4. [AI Architecture](#4-ai-architecture)
5. [Global AI Assistant Flow](#5-global-ai-assistant-flow)
6. [AI Memory Architecture](#6-ai-memory-architecture)
7. [RAG Architecture](#7-rag-architecture)
8. [Knowledge Graph Architecture](#8-knowledge-graph-architecture)
9. [AI Agent Architecture](#9-ai-agent-architecture)
10. [Workflow Automation Architecture](#10-workflow-automation-architecture)
11. [Configuration Architecture](#11-configuration-architecture)
12. [Billing Architecture](#12-billing-architecture)
13. [Security Architecture](#13-security-architecture)
14. [Performance Architecture](#14-performance-architecture)
15. [Technology Stack](#15-technology-stack)
16. [Project Structure](#16-project-structure)
17. [Environment Variables](#17-environment-variables)
18. [Local Development](#18-local-development)
19. [Database and Migrations](#19-database-and-migrations)
20. [Testing](#20-testing)
21. [Deployment Architecture](#21-deployment-architecture)

---

## 1. Project Overview

The platform lets a team upload and process documents, ask grounded questions over them,
extract a structured Knowledge Graph, receive proactive AI-generated intelligence (risks,
blockers, deadlines, daily/weekly briefs), delegate bounded actions to an approval-gated AI
Agent, automate multi-step workflows in response to real workspace events, and interact with
all of the above through one Global AI Assistant that remembers relevant context across
conversations. Every AI-driven action that has an external or state-changing effect (creating
a ClickUp task, a Calendar event, publishing an Automation) goes through the same closed tool
registry and human-approval gate — the system does not permit unrestricted autonomous action.

## 2. Core Features

| Area | Implemented capability |
|---|---|
| **Auth & RBAC** | Session-based authentication, `ADMIN`/`USER` platform roles, per-project `OWNER`/`EDITOR`/`VIEWER` membership roles enforced by `projectAuthorizationService`. |
| **Configuration governance** | A typed `CONFIG_REGISTRY` → PostgreSQL `Config` table → Redis-cached `ConfigService`, with pub/sub invalidation. Secrets never enter this table — see [§11](#11-configuration-architecture). |
| **RAG / document intelligence** | Upload → OCR/parse → chunk → embed (`pgvector`) → hybrid vector+keyword retrieval → rerank → cited, streamed answers. Private, Group, and Project-scoped conversations. |
| **Knowledge Bases** | Multi-document collections scoped to RAG retrieval. |
| **Knowledge Graph** | Entity/relationship/claim extraction from documents, contradiction detection, and an interactive React Flow **Knowledge Graph Explorer**. |
| **AI Intelligence** | Evidence-backed risk/blocker/deadline/knowledge-change insights, deterministic Project Health scoring, and daily/weekly AI-generated workspace briefs delivered via notifications and email digest. |
| **Notifications** | In-app bell + SSE real-time delivery + optional email digest, with quiet hours, deduplication, and rate limiting. |
| **AI Agents** | Goal → bounded LLM plan → closed tool registry → human approval (for anything above `READ_ONLY` risk) → execution → notification. |
| **Workflow Automation** | Real workspace events (meeting analysis completed, risk detected, document processed, etc.) trigger a versioned node graph that can call the same AI Agent engine, always through the same approval gate. |
| **Global AI Assistant** | One floating, streaming chat surface on every authenticated page, routing questions to RAG, Knowledge Graph, Intelligence, Agents, Automation, ClickUp, Calendar, or Sarvam AI. |
| **AI Memory & personalization** | Privacy-controlled, per-user (optionally per-project) persistent memory that the Assistant retrieves and ranks into its context, with async, non-blocking candidate extraction. |
| **Translation & digitization** | Sarvam AI integration for document translation, text translation, scanned-document digitization, and multilingual RAG answers. |
| **Billing & entitlements** | Plan/feature/limit model, `EntitlementService` feature gating, Razorpay webhook-driven subscription lifecycle — fully inert while `BILLING_ENABLED=false`. |
| **ClickUp integration** | OAuth-connected task read/create/update, reused by both the Agent tool registry and Automation. |
| **Google Calendar integration** | OAuth-connected event read/create, with Google Meet conferencing support, reused the same way. |
| **Performance & observability** | Multi-layer caching (L1 in-process + Redis L2), per-feature telemetry, a cross-cutting telemetry aggregation service, and an `/admin/performance` operational dashboard. |

## 3. System Architecture

```mermaid
flowchart TD
    Browser[Browser] --> NextApp[Next.js App Router<br/>Pages + API Routes]
    NextApp --> Services[Feature Services<br/>src/features/**]
    Services --> AuthZ[Authorization / Entitlements<br/>RBAC, Project Auth, EntitlementService]
    Services --> AI[AI / RAG / Agents / Automation<br/>LLM Gateway + Tool Registry]
    Services --> Data[(PostgreSQL + pgvector)]
    Services --> Cache[(Redis)]
    Services --> MQ[RabbitMQ]
    MQ --> Worker[Independent Worker Process]
    Worker --> Data
    Worker --> Cache
    AI --> LLMProviders[LLM Providers<br/>Ollama / OpenAI / Gemini / Groq / DeepSeek]
```

The application is two independent Node processes sharing the same PostgreSQL/Redis/RabbitMQ
infrastructure: the Next.js web process (interactive requests, streaming responses) and a
separate `worker/` process (document processing, Knowledge Graph extraction, Intelligence
generation, Automation execution, Notification dispatch, Memory candidate extraction). Nothing
CPU/latency-heavy runs inline in an HTTP request handler — it is queued to RabbitMQ and
processed by the worker, with the caller getting an immediate acknowledgement or a streamed
response.

## 4. AI Architecture

```mermaid
flowchart LR
    Doc[Documents] --> Proc[Processing<br/>OCR / Parse / Chunk / Embed]
    Proc --> RAG[RAG Retrieval]
    Proc --> KG[Knowledge Graph<br/>Extraction]
    RAG --> Intel[AI Intelligence]
    KG --> Intel
    Intel --> Agent[AI Agent]
    Intel --> Automation[Workflow Automation]
    Agent --> Automation
    RAG --> Assistant[Global AI Assistant]
    KG --> Assistant
    Intel --> Assistant
    Agent --> Assistant
    Automation --> Assistant
    Assistant --> Memory[AI Memory]
    Memory --> Assistant
```

Each layer has one clear responsibility and is built as an **additive** layer on top of the one
below it — later phases integrate with earlier ones by calling their existing services, never by
duplicating them:

- **Documents → Processing**: upload, OCR/parsing, chunking, embedding generation (see [§7](#7-rag-architecture)).
- **RAG**: grounded, cited retrieval over a user's authorized documents/knowledge bases.
- **Knowledge Graph**: structured entities/relationships/claims extracted from the same processed documents (see [§8](#8-knowledge-graph-architecture)).
- **AI Intelligence**: evidence-backed insights and health scores computed from RAG, Knowledge Graph, meetings, tasks, and project data — deterministic where the metric allows, LLM-narrated where a summary genuinely needs one.
- **AI Agent**: a bounded planner + closed tool registry + human approval gate that can act on Intelligence's findings (see [§9](#9-ai-agent-architecture)).
- **Workflow Automation**: reacts to real domain events and drives the same Agent engine on a schedule/trigger basis instead of a manual prompt (see [§10](#10-workflow-automation-architecture)).
- **Global AI Assistant**: the single conversational entry point that classifies intent and routes to whichever of the above systems the question actually requires (see [§5](#5-global-ai-assistant-flow)).
- **AI Memory**: cross-conversation personalization that the Assistant reads before responding and writes to asynchronously after responding (see [§6](#6-ai-memory-architecture)).

## 5. Global AI Assistant Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Assistant Widget (floating button + drawer)
    participant API as POST /api/assistant/chat
    participant Auth as Authorization
    participant Mem as AI Memory
    participant Intent as Intent Classifier
    participant Sys as Routed System (RAG / KG / Intelligence / Agent / ClickUp / Calendar / Automation / Sarvam)
    participant LLM as LLM Gateway

    U->>W: Ask a question (with page context hints)
    W->>API: POST (message, contextHint, conversationId?)
    API->>Auth: Re-validate every context id server-side
    Auth->>Mem: Retrieve ranked, budgeted memories
    Mem->>Intent: Classify intent (LLM Gateway, feature "COPILOT")
    Intent->>Sys: Route to the one relevant capability
    Sys->>LLM: Generate / stream the answer
    LLM-->>W: SSE stream (stage, delta, evidence, done)
    API-->>W: approval_required event if an action needs sign-off
    API--)Worker: Fire-and-forget: memory candidate extraction
```

The Assistant is a **new surface, not a rename** of the pre-existing `/copilot` page — that
page is a separate, single-shot "plan and execute" tool with no chat/turn persistence, kept
unchanged. The Assistant is the turn-based, streaming, globally-mounted chat widget
(`GlobalAssistantProvider`, mounted once in the root authenticated layout). Every client-supplied
context hint (`projectId`, `documentId`, `meetingId`, etc.) is treated as a hint only and
independently re-authorized server-side before it can influence retrieval or routing — the
Assistant never trusts a client-asserted identifier as proof of access. Mutating actions
(creating a ClickUp task, a Calendar event, or a broader Agent action) always go through the
same Agent planner → tool registry → human approval flow described in [§9](#9-ai-agent-architecture) — the
Assistant never executes a side-effecting action directly.

## 6. AI Memory Architecture

AI Memory extends the pre-existing `CopilotMemory` model (originally built as a lightweight,
cross-surface personalization store) into a full production memory engine, rather than
introducing a second, competing model.

```mermaid
flowchart TD
    Turn[Assistant Turn Completes] -->|fire-and-forget| Queue[RabbitMQ: memory-candidate-extraction]
    Queue --> Worker[Memory Extraction Worker]
    Worker --> Detect[Deterministic candidate detection<br/>preferences / decisions / facts / patterns]
    Detect -->|ambiguous only| Classify[Bounded LLM classification<br/>at most one call per turn]
    Classify --> Secret[Secret-pattern rejection]
    Detect --> Secret
    Secret --> Dedup[Upsert by normalized key<br/>existing DB-unique constraint]
    Dedup --> Store[(CopilotMemory)]
    Store --> Invalidate[Cache invalidation]

    Request[Assistant Chat Turn] --> Settings{Memory enabled?}
    Settings -->|no| Skip[Skip — return no memory]
    Settings -->|yes| CacheCheck{Cache hit?}
    CacheCheck -->|yes| Ranked[Ranked memories]
    CacheCheck -->|no| Query[Bounded, indexed query]
    Query --> Rank[Deterministic ranking:<br/>recency + importance + confidence + access count + term overlap]
    Rank --> Budget[Token/length budget + relevance threshold]
    Budget --> Ranked
    Ranked --> Wrap["Wrapped as untrusted content<br/>before reaching the LLM"]
```

**Creation**: memory is never written synchronously inside a chat response. After a turn
completes, the Assistant fires-and-forgets one RabbitMQ job carrying only the bounded
user/assistant message pair (never full history). The worker runs cheap, deterministic
keyword/pattern detection first; an LLM classification call is used only when the deterministic
pass is ambiguous, and never more than once per turn.

**Deduplication**: candidates are normalized into a stable key and upserted against the
existing `@@unique([userId, key, projectId])` constraint on `CopilotMemory` — a duplicate
candidate collides on that constraint and is treated as a successful no-op, not an error. This
reuses the model's original dedup mechanism rather than adding a second one.

**Retrieval & ranking**: bounded (`AI_MEMORY_MAX_RETRIEVAL_RESULTS`), timeout-protected
(`AI_MEMORY_RETRIEVAL_TIMEOUT_MS` — a failed or slow lookup returns no memory rather than
delaying or failing the chat turn), and ranked deterministically by recency, importance,
confidence, access frequency, and lexical term overlap with the current question.

**Privacy controls**: `/settings/copilot-memory` (the spec's suggested `/settings/memory` URL
redirects here) lets a user enable/disable memory, auto-learning, project memory, and
conversation memory; search/filter/edit/delete individual memories; clear conversation-derived,
project-specific, or all memories; and export their own memory data as JSON. All settings and
deletions invalidate the relevant cache entries immediately.

**Security boundary**: memory content is always wrapped in an explicit untrusted-content
boundary before being placed in an LLM prompt — the system policy states that instructions
found inside memory content must never override system instructions, mirroring the same
convention used for document evidence and meeting transcripts elsewhere in the platform.
Memory content is validated against the platform's existing secret-pattern list before storage;
a candidate matching a secret pattern is rejected outright, never partially stored.

## 7. RAG Architecture

Documents are uploaded, stored, parsed (with OCR fallback for scanned content), split into
semantic chunks, and embedded via a pluggable embedding provider into `pgvector`. A chat
question is answered by: an exact/semantic Redis answer-cache check, hybrid vector + keyword
retrieval over the user's authorized chunks, reranking, evidence assessment, prompt
construction with cited context, and a streamed, cited LLM answer. Group and Project-scoped
conversations compose the same retrieval primitives across multiple document owners rather than
forking the retrieval algorithm. Retrieval authorization is always server-side and scoped to
the requesting user's own documents (or an explicitly authorized project's document set) —
never a client-asserted scope.

## 8. Knowledge Graph Architecture

Entity, relationship, and claim extraction runs asynchronously (in the worker) against
processed document chunks, producing `KnowledgeEntity`/`KnowledgeRelationship`/`KnowledgeClaim`
rows with confidence scores and `KnowledgeEvidence` rows tracing each fact back to its source
document/chunk. A syntactic contradiction detector flags conflicting claims about the same
subject. The **Knowledge Graph Explorer** (`/knowledge-graph/explorer`) is a React Flow
visualization with bounded graph traversal (depth/node/edge caps enforced server-side, never
just in the UI), natural-language graph search, and the same evidence-backed, never-fabricated
principle as the rest of the platform. All graph reads are authorized per-entity, respecting
project membership where the graph is project-scoped.

## 9. AI Agent Architecture

```mermaid
flowchart LR
    Goal[User or Automation goal] --> Plan[Bounded LLM Planner]
    Plan --> Registry[Closed Tool Registry]
    Registry --> Risk{Risk level}
    Risk -->|READ_ONLY, auto-execute enabled| Exec[Worker Execution]
    Risk -->|LOW / MEDIUM / HIGH / CRITICAL| Approval[Human Approval Required]
    Approval -->|approved| Exec
    Approval -->|rejected| Stop[Run stops — no side effect]
    Exec --> Notify[Notification]
```

The planner never invents which tools exist — it selects from a fixed, server-defined registry
(currently document search, project/meeting/knowledge-graph reads, ClickUp task read/create/
update, and Calendar event read/create), and the risk level / approval requirement of each step
is always taken from the registry's own definition, never from the LLM's output. Any step above
`READ_ONLY` risk is blocked until the run's owner explicitly approves it through the Agent Runs
UI or an inline approval card in the Assistant — a rejected or un-approved step is never
executed. Every external tool call is idempotency-keyed so a retried or duplicated execution
can never create two ClickUp tasks or two Calendar events for the same step.

## 10. Workflow Automation Architecture

```mermaid
flowchart LR
    Event[Real Domain Event<br/>meeting analyzed, risk detected,<br/>document processed, etc.] --> MQ[RabbitMQ]
    MQ --> Match[Trigger Matching<br/>against active Automations]
    Match --> Exec[Automation Execution<br/>versioned node graph]
    Exec --> Agent[AI Agent Engine]
    Agent --> Approval[Human Approval]
    Approval --> Action[External Action<br/>ClickUp / Calendar]
```

Automation (`/automations`) is a distinct feature from the pre-existing `/workflows` AI
Workflow Builder (an unrelated, earlier document-generation tool with its own model namespace)
— named `Automation*` throughout specifically to avoid colliding with that existing feature.
An Automation is a versioned, immutable-once-published node graph (trigger → condition →
AI analysis → AI agent action → approval → notification → end) matched against real,
already-existing domain events (meeting analysis completion, AI Intelligence risk/blocker/
deadline detection, document processing completion, Knowledge Graph contradiction detection).
Trigger matching and execution are two separately queued, idempotent worker stages so a
duplicate event can never produce a duplicate execution. Any node that would take an external
action routes through the exact same AI Agent planner/tool-registry/approval engine described
in [§9](#9-ai-agent-architecture) — Automation does not have, and is explicitly forbidden from having, a second
execution or approval engine.

## 11. Configuration Architecture

```mermaid
flowchart TD
    Env[.env — secrets & bootstrap only] --> Bootstrap[App bootstrap]
    Registry[CONFIG_REGISTRY — typed TS source of truth] --> Seed[Idempotent seed]
    Seed --> PG[(PostgreSQL Config table)]
    PG --> RedisCache[(Redis L2 cache)]
    RedisCache --> L1[In-process L1 cache]
    L1 --> App[Application instances]
    PG -.pub/sub invalidation.-> RedisCache
```

All non-secret runtime configuration is declared once in `src/features/config/config.registry.ts`
as a typed `RegistryConfigItem` (purpose, category, type, default, bounds, `isEditable`,
`isHighImpact`, `requiresRestart`), synced idempotently into PostgreSQL by `prisma/seed.ts`, and
read through `ConfigService`, which layers an in-process L1 cache in front of a Redis L2 cache
in front of the database, invalidated via Redis pub/sub the moment a value changes so every
running instance picks up an admin-edited value without a restart (unless the item is flagged
`requiresRestart`). Secrets (API keys, OAuth credentials, database/queue URLs) are never
permitted into this table — they are validated once at boot via a Zod schema in
`src/config/env.ts` and are never logged, cached, or exposed to the client. A dedicated
secret-pattern list (`SECRET_KEY_PATTERNS`) is reused across the config validator, audit
sanitizer, and AI Memory's secret-rejection check, rather than each maintaining its own list.

## 12. Billing Architecture

```mermaid
flowchart LR
    Plan[SubscriptionPlan] --> Feat[SubscriptionPlanFeature]
    Plan --> Limit[SubscriptionPlanLimit]
    Feat --> Sub[UserSubscription]
    Limit --> Sub
    Sub --> Entitlement[EntitlementService]
    Entitlement --> Guard[Feature Guard<br/>canAccessFeature / requireFeature]
```

Plans, features, and usage limits are modeled explicitly; `EntitlementService` is the single
gate every paid feature checks through (`canAccessFeature`/`requireFeature`), backed by
Razorpay for payment/subscription lifecycle webhooks. Critically: **while `BILLING_ENABLED=false`
(the default in this environment), `EntitlementService` always grants access** — every feature
added since billing was introduced (Knowledge Intelligence, Project Intelligence, AI Agent,
Knowledge Graph Explorer, AI Workspace Intelligence, Assistant, Automation) was built and tested
against this same fail-open behavior and does not alter it. No `UserSubscription` record is
created or mutated while billing is disabled.

## 13. Security Architecture

- **Authentication & RBAC**: session-based auth; platform `ADMIN`/`USER` roles; project-level `OWNER`/`EDITOR`/`VIEWER` membership, enforced server-side on every project-scoped operation via `projectAuthorizationService` — never inferred from a client-supplied role.
- **404-vs-403 convention**: a resource the requester doesn't own or isn't authorized for returns `404 Not Found`, never a `403` that would confirm the resource's existence to an unauthorized party. Applied consistently across Agent runs, Automations, Assistant conversations, and AI Memory.
- **Context re-authorization**: every client-supplied contextual identifier (project, document, conversation, memory, meeting, knowledge-entity id) is independently re-validated server-side against the actual owning system before use — a client hint is never trusted as proof of access, including inside the Global AI Assistant's context-resolution step.
- **Prompt injection boundaries**: any content that originates outside the system's own instructions (document text, meeting transcripts, Knowledge Graph evidence, ClickUp/Calendar content, AI Memory) is wrapped in an explicit untrusted-content boundary before reaching an LLM, with a system policy stating that instructions found inside such content must never override system instructions.
- **Closed tool execution**: the AI Agent and Automation engines only ever invoke a tool from a fixed, server-defined registry — an LLM's output can select which registered tool to call and with what input, but never invents a new tool, bypasses approval, or executes arbitrary code.
- **Human approval for side effects**: every external, state-changing action (ClickUp task, Calendar event, and any Agent step above `READ_ONLY` risk) requires explicit human approval before execution, whether the action originated from a manual Agent goal, an Automation trigger, or the Assistant.
- **Idempotency**: RabbitMQ jobs and external tool calls carry idempotency keys enforced by database uniqueness — a duplicated message or retried delivery can never create a duplicate external side effect.
- **Webhook verification**: Razorpay webhook signatures are verified before any subscription state change is applied.
- **Audit logging**: security- and privacy-sensitive operations (entitlement denials, memory export/clear, automation/agent approval decisions, preference changes) are recorded via a shared `AuditService` with automatic secret-pattern redaction — routine reads are not audited, to avoid audit noise.

## 14. Performance Architecture

- **Caching**: a two-layer cache (in-process L1 + Redis L2) is used across RAG answers, LLM Gateway responses, Knowledge Graph queries, AI Memory retrieval, and configuration — every cache key is scoped to include user/project/scope identifiers to prevent cross-tenant leakage, and every Redis-backed cache degrades gracefully (falls back to the database) if Redis is unavailable rather than failing the request.
- **Asynchronous processing**: document parsing/OCR, Knowledge Graph extraction, Intelligence generation, Automation execution, Notification dispatch, and AI Memory candidate extraction all run in the separate worker process via RabbitMQ — none of them run inline inside an interactive HTTP request.
- **Streaming**: the RAG chat and Global AI Assistant both stream responses over Server-Sent Events so the user sees the first token as soon as it's generated rather than waiting for the full answer.
- **Bounded retrieval**: every retrieval path (RAG chunks, Knowledge Graph traversal, AI Memory) enforces explicit result-count caps, token budgets, and timeouts server-side — a slow or over-limit lookup degrades to a partial or empty result rather than blocking the response.
- **Database**: indexes are added only against real, observed query patterns (e.g. `(userId, category)` on memory lookups, `(userId, status)` on Automation executions); N+1 patterns found during review (e.g. a Knowledge Base list endpoint) were fixed by batching into a fixed small number of queries.
- **Telemetry**: each feature maintains its own structured, bounded-memory telemetry log (never logging secrets or full document/message content), and a cross-cutting `telemetry-aggregation.service.ts` computes p50/p95/p99 latency, slowest operations, and cache-hit ratios for the `/admin/performance` dashboard — figures shown as "Unavailable" with a stated reason when no real data source exists, never a fabricated number.

No fixed response-time guarantee is claimed for operations that inherently cannot bound their
own latency (large document analysis, external provider calls, full Agent/Automation
execution) — the architectural goal for those is a fast *first* response (an acknowledgement,
a stream start, a progress event) followed by asynchronous completion, not a synchronous
guarantee.

## 15. Technology Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **Database**: PostgreSQL with the `pgvector` extension, accessed via Prisma ORM
- **Cache**: Redis
- **Message queue**: RabbitMQ (`amqplib`)
- **Background processing**: an independent Node.js worker process (separate `worker/` package)
- **LLM providers**: routed through an internal LLM Gateway supporting Ollama (local), OpenAI, Google Gemini, Groq, and DeepSeek
- **Object storage**: pluggable local/S3-compatible document storage
- **Graph visualization**: `@xyflow/react` (dynamically loaded, used only on the pages that need it)
- **Styling**: Tailwind CSS with a centralized design-token system (`src/lib/design-system`)
- **Validation**: Zod (environment/config validation)
- **Testing**: Jest (`ts-jest`), plus a legacy `tsx`-script test runner for early-phase test files
- **Payments**: Razorpay

## 16. Project Structure

```
src/
  app/                 Next.js App Router — pages and API routes
    api/                 Route handlers, one directory per feature
    <feature pages>/     e.g. /projects, /intelligence, /automations, /notifications
  components/          Shared UI (design-system primitives, layout, feature-specific widgets)
  features/            Feature services — the bulk of the business logic
    rag/                 Retrieval, caching, orchestration, streaming
    knowledge-graph/      Extraction, retrieval, reasoning
    knowledge-graph-explorer/  Explorer-specific query/authorization/cache layer
    ai-intelligence/      Aggregation, generation, scheduling for Intelligence snapshots
    ai-agent/             Planner, tool registry, execution engine, approval
    automation/           Node registry, execution engine, domain-event dispatch
    assistant/             Global Assistant orchestration, context authorization, streaming
    copilot/               The pre-existing single-shot Copilot tool, and (memory/) AI Memory
    notifications/         In-app + email notification delivery
    billing/                Entitlements, plans, Razorpay
    config/                 CONFIG_REGISTRY, ConfigService, cache invalidation
    audit/                  AuditService
  lib/                  Cross-cutting infrastructure clients (prisma, redis, rabbitmq)
  context/             React context providers (Workspace, Theme, Assistant context registration)
worker/                Independent background-processing process
  src/processors/        One processor per queue/job type
prisma/
  schema.prisma          Single source of truth for the data model
  migrations/             Hand-authored, strictly additive migrations
  seed.ts                 Idempotent CONFIG_REGISTRY + plan/feature seed
tests/                 Jest test suites, one file family per phase
```

## 17. Environment Variables

Actual secrets/credentials only — see `.env.example` for the full, current list with inline
comments. Non-secret runtime behavior is controlled through `CONFIG_REGISTRY`, not environment
variables. Major groups (examples, not real values):

```bash
# Infrastructure
DATABASE_URL=postgresql://user:password@localhost:5433/document_ai
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# LLM providers (only the ones you intend to enable need real keys)
OPENAI_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# Object storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

# Integrations
CLICKUP_API_BASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SARVAM_API_KEY=

# Billing
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Notifications
EMAIL_API_KEY=
```

Never commit a real `.env` file. `.env.example` documents the shape and purpose of each variable
without containing real credentials.

## 18. Local Development

```bash
# 1. Start infrastructure (PostgreSQL+pgvector, RabbitMQ, Redis, Ollama)
docker compose up -d

# 2. Install dependencies (root app + worker)
npm install
npm --prefix worker install

# 3. Configure environment
cp .env.example .env
# fill in DATABASE_URL / REDIS_URL / RABBITMQ_URL and any provider keys you plan to use

# 4. Prisma: generate client, apply migrations, seed config/plans
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Run the web app and worker together
npm run dev
# or separately:
npm run dev:web
npm --prefix worker run dev
```

`npm run dev` runs the Next.js dev server and the worker concurrently (labeled `NEXT`/`WORKER`
output). The worker is a required, separate process — document processing, Knowledge Graph
extraction, Intelligence generation, Automation, Notifications, and AI Memory extraction do not
run without it.

## 19. Database and Migrations

Migrations under `prisma/migrations/` are hand-authored additive SQL (this repository does not
run `prisma migrate dev` against a shared development database as its primary workflow) — every
migration since Phase 78 follows the same convention: `ALTER TYPE ... ADD VALUE` for enum
extension, new tables, new nullable/defaulted columns on existing tables, and justified new
indexes only. No migration in this history drops a table, renames an existing column, or
changes an existing column's semantics.

```bash
npx prisma validate     # validate schema.prisma
npx prisma generate     # regenerate the Prisma client
npm run db:migrate      # apply pending migrations (interactive `prisma migrate dev`)
npm run db:seed         # idempotent: syncs CONFIG_REGISTRY + default plans/features
npm run db:studio       # Prisma Studio GUI
```

`prisma/seed.ts` is idempotent: it creates missing `CONFIG_REGISTRY` rows, refreshes metadata on
existing ones, and never overwrites an admin-edited `value` — running it twice produces no
diff.

## 20. Testing

```bash
npm test                 # full Jest suite
npm run test:unit        # tests/unit
npm run test:integration # tests/integration
npm run test:api         # tests/api
npm run test:security    # tests/security
npm run test:components  # tests/components
npm run test:coverage    # with coverage report
npm run typecheck        # root + worker TypeScript, no emit
```

Feature-phase test suites live at `tests/phase<N>-*.test.ts` (Jest, from roughly Phase 40
onward — earlier phases used standalone `tsx`-executed scripts, still runnable via the
`test:phase<N>` scripts in `package.json` for historical reference). There is no single
`test:phase90`-style script wired into `package.json` for every phase — target a specific
phase's suite directly, e.g. `npx jest tests/phase90 --no-coverage`.

## 21. Deployment Architecture

This repository provides `docker-compose.yml` for **local infrastructure only**
(PostgreSQL+pgvector, RabbitMQ, Redis, Ollama) — it is a development convenience, not a
production deployment manifest. No production orchestration (Kubernetes manifests, a
production Dockerfile for the app/worker images, CI/CD pipeline definitions, or an
infrastructure-as-code setup) is implemented in this repository as of this phase.

For a production deployment, you would need to independently provision: a managed PostgreSQL
instance with the `pgvector` extension, a managed Redis instance, a managed or self-hosted
RabbitMQ cluster, container images (or another deployment target) for the Next.js app and the
`worker/` process running as two independently-scaled services, object storage (S3 or
compatible), and secrets management for everything currently read from `.env`. This is deployment
guidance, not a description of implemented functionality.
