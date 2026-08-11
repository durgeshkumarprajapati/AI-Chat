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

## 6. Production Deployment Strategy

- **Next.js Web Application**: Deployed to Vercel.
- **Worker Process**: Deployed as Docker container / ECS service on AWS / Render / Railway.
- **Database**: Managed PostgreSQL (e.g. AWS RDS / Supabase / Neon with `pgvector` enabled).
- **Message Queue**: CloudAMQP or AWS Amazon MQ (RabbitMQ engine).
- **Cache**: AWS ElastiCache for Redis or Upstash.
- **Object Storage**: AWS S3.
