# Document AI / RAG Platform

A production-grade, enterprise-ready Retrieval-Augmented Generation (RAG) and Document AI platform built with Next.js App Router, TypeScript, Prisma ORM, PostgreSQL with `pgvector`, RabbitMQ, Redis, AWS S3, and OpenAI.

---

## 1. Architecture Overview

The system is decoupled into a web application (running on Next.js/Vercel) and an independent asynchronous Document Processing Worker node service.

```mermaid
flowchart TD
    subgraph Client Layer
        Browser[Browser / Web Client]
    end

    subgraph Application Layer
        NextApp[Next.js App Router]
        UploadSvc[Upload Service]
        ChatSvc[Chat Service]
    end

    subgraph Infrastructure Services
        S3[(AWS S3 Storage)]
        RabbitMQ[RabbitMQ Message Broker]
        Redis[(Redis Cache & State)]
        Postgres[(PostgreSQL + pgvector)]
        OpenAI[OpenAI API]
    end

    subgraph Asynchronous Processing Layer
        Worker[Document Processing Worker Process]
        PDFParser[PDF Extractor / OCR]
        Chunker[Text Cleaning & Chunker]
        Embedder[Embedding Generator]
    end

    Browser -->|Upload PDF / Trigger| NextApp
    NextApp --> UploadSvc
    NextApp --> ChatSvc

    UploadSvc -->|Store Original PDF| S3
    UploadSvc -->|Publish Job| RabbitMQ

    RabbitMQ -->|Consume Message| Worker
    Worker -->|Fetch PDF| S3
    Worker --> PDFParser
    PDFParser --> Chunker
    Chunker --> Embedder
    Embedder -->|Generate Vector| OpenAI
    Embedder -->|Save Chunks & Vectors| Postgres

    ChatSvc -->|Exact / Semantic Cache| Redis
    ChatSvc -->|Generate Question Vector| OpenAI
    ChatSvc -->|Similarity Search| Postgres
    ChatSvc -->|Generate Grounded Answer| OpenAI
```

---

## 2. Ingestion & RAG Pipelines

### Upload & Processing Pipeline
1. User requests presigned upload URL via Next.js Server Action.
2. File is uploaded directly & securely to AWS S3.
3. Next.js creates `Document` record in PostgreSQL (`status = UPLOADING`) and publishes job to `document-processing` RabbitMQ queue.
4. Independent Node.js Worker consumes job:
   - Sets document status to `PROCESSING`.
   - Downloads PDF from S3.
   - Extracts text (supports OCR fallback for scanned PDFs).
   - Cleans text and splits into semantic chunks.
   - Batch generates vector embeddings using OpenAI (`text-embedding-3-small`).
   - Atomically saves chunks and vectors into `document_chunks` with `pgvector`.
   - Updates document status to `COMPLETED`.

### RAG Chat Pipeline
1. User sends question to Next.js Chat Service.
2. Authorization check ensures `currentUser -> authorized document -> document chunks`.
3. Redis checks for exact cached answer.
4. OpenAI generates question vector embedding.
5. `pgvector` performs cosine similarity search over user's authorized chunks.
6. Context chunks are injected into system prompt.
7. OpenAI LLM generates answer with `[Doc X, Page Y]` citations.
8. Response & citations are saved and cached in Redis.

---

## 3. Prerequisites & Environment Setup

- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **Docker & Docker Compose**: Installed and running

### Environment Variables
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `.env` contains:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/document_ai?schema=public"
RABBITMQ_URL="amqp://guest:guest@localhost:5672"
REDIS_URL="redis://localhost:6379"
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"
AWS_S3_BUCKET_NAME="document-ai-rag-bucket"
OPENAI_API_KEY="sk-proj-your-key"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_CHAT_MODEL="gpt-4o-mini"
APP_URL="http://localhost:3000"
```

---

## 4. Local Development Instructions

### Step 1: Start Infrastructure Containers (PostgreSQL + pgvector, RabbitMQ, Redis)

```bash
docker compose up -d
```

### Step 2: Install Project Dependencies

```bash
npm install
npm --prefix worker install
```

### Step 3: Run Database Migrations & Generate Prisma Client

```bash
npm run db:generate
npm run db:push
```

To run the custom pgvector SQL migration manually if required:
```bash
npx prisma db execute --file ./prisma/migrations/0_init_vector/migration.sql --schema ./prisma/schema.prisma
```

### Step 4: Start Next.js App

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 5: Start Asynchronous Document Worker

In a separate terminal window:

```bash
npm run worker
```

---

## 5. Health Checks & Verification Commands

Verify code quality and type safety:

```bash
# Type check web app and worker
npm run typecheck

# Lint codebase
npm run lint

# Build Next.js production bundle
npm run build
```

Health Check Endpoint:
[http://localhost:3000/api/health](http://localhost:3000/api/health)

Returns:
```json
{
  "status": "ok",
  "timestamp": "2026-08-11T15:14:08.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "rabbitmq": "healthy"
  }
}
```

---

---

## 7. Phase 13 — Streaming RAG Chat

### Overview
Phase 13 delivers a real-time, progressive LLM response streaming experience over Server-Sent Events (SSE). Instead of waiting for the full answer to generate, tokens stream incrementally into the UI with real-time caret animations, instant stop generation controls, and citation badges.

### Architecture

```mermaid
flowchart TD
    A[User Question] --> B[POST /api/chat/stream]
    B --> C[Authentication]
    C --> D[Question Embedding]
    D --> E[pgvector Retrieval]
    E --> F{Relevant Chunks?}
    F -->|No| G[Grounded Fallback]
    F -->|Yes| H[Build Context]
    H --> I[LLM Provider]
    I -->|Ollama / OpenAI| J[Streaming Deltas]
    J --> K[Browser Chat UI]
    K --> L[Final Answer + Citations]
    L --> M[Persist Message to PostgreSQL]
```

### Streaming Lifecycle
`START` → `RETRIEVE` → `STREAM` → `FINALIZE` → `PERSIST` → `DONE`

If `pgvector` retrieval returns 0 chunks passing `RAG_MIN_SIMILARITY`, the LLM is **not** called. The API emits the deterministic fallback response with zero citations (`[]`).

### API Specification

```http
POST /api/chat/stream
Content-Type: application/json

{
  "conversationId": "optional-uuid",
  "question": "What are the major deployment steps?"
}
```

Server-Sent Events emitted:
- `event: start` -> `{"conversationId": "...", "citations": [...]}`
- `event: delta` -> `{"text": "According"}`
- `event: done` -> `{"messageId": "...", "answer": "...", "citations": [...]}`
- `event: error` -> `{"message": "..."}`

### Provider Support
- **Ollama**: Default local provider (`OLLAMA_CHAT_MODEL="llama3.2"`). Streams line-delimited JSON chunks from `/api/generate`.
- **OpenAI**: Optional provider (`OPENAI_CHAT_MODEL="gpt-4o-mini"`). Streams delta completion tokens via OpenAI SDK.

### Security & Privacy
- Vector embeddings and database credentials remain strictly server-side.
- Tenant isolation (`WHERE d.user_id = $2`) is enforced before retrieval.
- Citations originate exclusively from retrieved chunks.

### Testing Commands
```bash
# Automated mocked streaming test suite (23 test cases)
npm run test:phase13

# Optional real Ollama streaming test script
npm run test:ollama-chat-stream
```

---

## 8. Phase 14 — Hybrid Retrieval, Reranking & Observability

### Overview
Phase 14 improves retrieval quality by combining semantic vector search (`pgvector`) with lexical keyword search (`PostgreSQL Full-Text Search`). Results are merged, deduplicated, and scored using a zero-overhead local reranker with term coverage and exact phrase match bonuses.

### Architecture

```mermaid
flowchart TD
    A[User Question] --> B[Question Embedding]
    B --> C[Vector Search pgvector]
    A --> D[Keyword Search tsvector]

    C --> E[Candidate Merge]
    D --> E

    E --> F[Deduplication by chunkId]
    F --> G[Hybrid Scoring 0.70/0.30]
    G --> H[Local Reranker]
    H --> I[Top K Grounded Chunks]
    I --> J[Grounded LLM Context]
    J --> K[Streaming / Non-Streaming Chat]
    K --> L[Answer + Citations]
```

### Hybrid Scoring Formula
$$\text{hybridScore} = 0.70 \cdot \text{vectorScore} + 0.30 \cdot \text{normalizedKeywordScore}$$

$$\text{rerankScore} = \min(1.0, 0.65 \cdot \text{hybridScore} + 0.25 \cdot \text{termCoverage} + 0.25 \cdot \text{phraseMatch})$$

### Developer RAG Inspector
- **Route**: `/rag-debug`
- **Debug API**: `POST /api/rag/debug`
- Displays candidate breakdown (`vector`/`keyword`/`hybrid`), candidate pipeline step bar, score comparison, and execution timing metrics (`vectorMs`, `keywordMs`, `mergeMs`, `rerankMs`, `totalMs`).

### Testing Commands
```bash
# Automated Hybrid Retrieval & Local Reranker Test Suite
npm run test:phase14
```

---

## 9. Phase 15 — Pluggable Document Storage (Amazon S3)

### Overview
Phase 15 introduces pluggable document storage support for Amazon S3 while preserving 100% backward compatibility for local file storage. The document processing pipeline and database records depend strictly on the `StorageProvider` abstraction, maintaining uniform logical storage keys across both drivers.

### Architecture

```mermaid
flowchart TD
    A[PDF Upload Request] --> B[Document API]
    B --> C[StorageProvider Resolver]
    C -->|AWS_STORAGE_PROVIDER=local| D[LocalStorageProvider]
    C -->|AWS_STORAGE_PROVIDER=s3| E[S3StorageProvider]

    D --> F[Local Filesystem storage/]
    E --> G[Amazon S3 Private Bucket]

    F --> H[RabbitMQ Job Message]
    G --> H

    H --> I[Decoupled Worker]
    I --> C
```

### Configuration & Fail-Fast Validation
- **Local Storage (Default)**:
  `AWS_STORAGE_PROVIDER="local"` — Operates without AWS credentials. Suitable for local development.
- **Amazon S3 Storage (Production)**:
  `AWS_STORAGE_PROVIDER="s3"` — Uses `@aws-sdk/client-s3`. Fails fast with `ConfigurationError` if `AWS_REGION` or `AWS_S3_BUCKET` is missing.

```ini
AWS_STORAGE_PROVIDER="s3"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="my-private-document-bucket"
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_SESSION_TOKEN="" # Optional
```

### Security Guidelines
- S3 Bucket remains private (Block Public Access enabled).
- Pre-signed URLs are generated server-side with strict expiration.
- AWS credentials are never exposed to client-side bundles or health check responses.

### Testing Commands
```bash
# Automated Mocked Storage Provider Test Suite
npm run test:phase15

# Real S3 Connectivity Verification Script (Requires live AWS credentials & bucket)
npm run test:s3-storage
```

---

## 10. Phase 16 — Document Management & Knowledge Base

### Overview
Phase 16 transforms the platform into a SaaS-style Document Management & Knowledge Base experience. Users can search, filter, sort, paginate, inspect, retry, reprocess, preview, download, and delete documents with complete tenant isolation and storage-provider transparency.

### Architecture

```mermaid
flowchart TD
    User[Authenticated Client] --> API[Document API /api/documents]
    API --> Svc[DocumentService]
    Svc --> Rep[DocumentRepository]
    Svc --> Storage[Canonical StorageProvider]

    Storage -->|AWS_STORAGE_PROVIDER=local| LocalStorage[LocalStorageProvider]
    Storage -->|AWS_STORAGE_PROVIDER=s3| S3Storage[S3StorageProvider]

    Svc -->|Publish Job| RabbitMQ[RabbitMQ Broker]
    RabbitMQ --> Worker[Document Processing Worker]
    Worker --> Extractor[pdfjs-dist PDF Parser]
    Extractor --> Chunker[cl100k_base Chunker]
    Chunker --> Embedder[Ollama / OpenAI Embeddings]
    Embedder --> Postgres[(PostgreSQL + pgvector)]
```

### Endpoints Implemented
- `GET /api/documents` — Paginated catalog with debounced case-insensitive search (`filename` & `originalFilename`), status filter (`ALL`, `PROCESSING`, `COMPLETED`, `FAILED`, `UPLOADING`), sort order (`createdAt`, `filename`, `fileSize`, `status`, `updatedAt`), Knowledge Base summary stats, and current storage driver badge (`local` vs `s3`).
- `GET /api/documents/[id]` — Returns document metadata, pipeline steps checklist, chunk metrics, chunks detail, and storage driver information.
- `POST /api/documents/[id]/retry` — Safely retries a `FAILED` document by resetting status to `PROCESSING` and publishing a new RabbitMQ processing job.
- `POST /api/documents/[id]/reprocess` — Explicitly reprocesses a `COMPLETED` or `FAILED` document by transactionally clearing old chunks/embeddings, resetting status to `PROCESSING`, and re-enqueuing worker job.
- `DELETE /api/documents/[id]` — Deletes document database record, chunks, and storage object via `StorageProvider.delete(storageKey)`.
- `GET /api/documents/[id]/download` — Securely streams file content to authorized owners with `Content-Disposition` headers.

### Testing Commands
```bash
# Automated Document Management & Knowledge Base Test Suite
npm run test:phase16
```

---

## 11. Phase 17 — Multi-Document Knowledge Bases / Collections

### Overview
Phase 17 introduces a first-class Knowledge Base / Collection abstraction. Documents, chunks, vector embeddings, and storage files remain 100% single-instance (zero duplication). A document can belong to multiple Knowledge Bases via a junction table (`KnowledgeBaseDocument`).

RAG retrieval can be dynamically scoped to a selected Knowledge Base or run globally across all user documents while preserving vector search, keyword search, hybrid scoring, local reranking, streaming SSE responses, citations, and complete tenant isolation.

### Scoped RAG Architecture

```mermaid
flowchart TD
    U[User / Web Client] --> UI[Knowledge Base & Chat UI]
    UI --> KB[Knowledge Base Scope]
    KB -->|Junction Filter| KBD[KnowledgeBaseDocument]
    KBD --> D[Documents]
    D --> C[Document Chunks]
    C --> V[pgvector 768d]

    UI -->|Question| ScopedRAG[RetrievalService]
    ScopedRAG -->|Vector Search + SQL EXISTS| V
    ScopedRAG -->|Keyword Search + SQL EXISTS| Lexical[PostgreSQL Full-Text Search]
    V --> CandidateMerge[Candidate Merge & Hybrid Score]
    Lexical --> CandidateMerge
    CandidateMerge --> Reranker[LocalReranker]
    Reranker --> TopK[Top-K Context]
    TopK --> LLM[Streaming LLM Provider]
```

### Endpoints Implemented
- `GET /api/knowledge-bases` — Paginated list of user Knowledge Bases with search, sorting, and stats.
- `POST /api/knowledge-bases` — Create new Knowledge Base collection.
- `GET /api/knowledge-bases/[id]` — Retrieve Knowledge Base metadata and statistics.
- `PATCH /api/knowledge-bases/[id]` — Update Knowledge Base name or description.
- `DELETE /api/knowledge-bases/[id]` — Delete Knowledge Base (deletes collection record and join rows; member documents, chunks, embeddings, and storage files remain 100% intact).
- `GET /api/knowledge-bases/[id]/documents` — List documents belonging to Knowledge Base.
- `POST /api/knowledge-bases/[id]/documents` — Add existing document to Knowledge Base (prevents duplicate membership).
- `DELETE /api/knowledge-bases/[id]/documents/[documentId]` — Remove document from Knowledge Base (removes join row; document remains intact).
- `POST /api/chat` & `POST /api/chat/stream` — Grounded & SSE streaming chat supporting optional `knowledgeBaseId`.
- `POST /api/rag/debug` — RAG Inspector supporting optional `knowledgeBaseId`.

### Testing Commands
```bash
# Automated Knowledge Bases & Scoped RAG Test Suite
npm run test:phase17
```

---

## 12. Phase 18 — Conversation Memory & Context Management

### Overview
Phase 18 adds multi-turn RAG conversation memory, follow-up retrieval query contextualization, token-bounded context management, background conversation summarization, auto-titling, and paginated conversation CRUD management while strictly enforcing document-grounded zero-hallucination policies and user tenant isolation.

### Conversation Memory Architecture

```mermaid
flowchart TD
    A[User Question] --> B[Authentication & Ownership]
    B --> C[ConversationContextService]
    C -->|Query Rewriting| D[Standalone Retrieval Query]
    D --> E[Knowledge Base / Tenant Scope]
    E --> F[Hybrid Retrieval & Local Reranking]
    F --> G[Retrieved Document Evidence]

    C -->|Token Bounded Context| H[Conversation Memory & Summary]
    G --> I[Grounded LLM Generation]
    H --> I
    A --> I

    I --> J[Streaming SSE / JSON Response]
    J --> K[Persist Messages & Auto-Title]
```

### Key Capabilities & Environment Configuration
- **Follow-up Query Contextualization**: Automatically rewrites ambiguous follow-up questions (e.g. *"Explain the third requirement in more detail"*) into standalone retrieval search queries.
- **Zero-Hallucination Guardrail**: When `retrievedChunks.length === 0`, the system returns the deterministic fallback message without calling the LLM.
- **Strict Evidence Separation**: Citations are derived exclusively from retrieved document chunks — conversation turns are never cited as document evidence.
- **Environment Variables**:
  - `CONVERSATION_MAX_MESSAGES` (default `12`)
  - `CONVERSATION_MAX_CONTEXT_TOKENS` (default `6000`)
  - `CONVERSATION_SUMMARY_ENABLED` (default `true`)
  - `CONVERSATION_SUMMARY_TRIGGER_TOKENS` (default `4500`)

### Endpoints Implemented
- `GET /api/conversations` — Paginated list of conversations (`page`, `pageSize`, `search`, `knowledgeBaseId`, `sortBy`, `sortOrder`).
- `GET /api/conversations/[id]` — Detailed conversation history with summary and messages.
- `PATCH /api/conversations/[id]` — Rename conversation title.
- `DELETE /api/conversations/[id]` — Delete conversation and messages with ownership verification.
- `POST /api/chat` & `POST /api/chat/stream` — Grounded chat with multi-turn conversation memory.
- `POST /api/rag/debug` — RAG Inspector with memory diagnostics (retrieval query rewrite, context message counts, token estimates).

### Testing Commands
```bash
# Automated Conversation Memory Test Suite
npm run test:phase18
```






