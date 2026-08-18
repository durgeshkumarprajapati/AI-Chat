# AI Knowledge Graph & Personal Knowledge Engine (Phase 41)

The **AI Knowledge Graph & Personal Knowledge Engine** transforms isolated documents and chunk embeddings into a connected, grounded, and queryable knowledge graph layer without replacing existing vector search, BM25, or RAG components.

---

## 1. Architecture Overview

```
Document Upload -> Chunking -> Embeddings -> Knowledge Graph Job
                                                   │
                                          ┌────────┴────────┐
                                          ▼                 ▼
                                    Entity Extractor   Relationship Extractor
                                          │                 │
                                          └────────┬────────┘
                                                   ▼
                                        Validation & Deduplication
                                                   │
                                                   ▼
                                         Evidence Linking
                                                   │
                                                   ▼
                                   PostgreSQL (pgvector + KG)
```

---

## 2. Controlled Registries

### Entity Types
`PERSON`, `ORGANIZATION`, `TECHNOLOGY`, `PRODUCT`, `PROJECT`, `CONCEPT`, `TOPIC`, `DOCUMENT`, `LOCATION`, `EVENT`, `DATE`, `METRIC`, `API`, `DATABASE`, `FRAMEWORK`, `LIBRARY`, `TOOL`, `PROCESS`, `SKILL`, `CLAIM`, `OTHER`.

### Relationship Types
`RELATED_TO`, `DEPENDS_ON`, `USES`, `IMPLEMENTS`, `PART_OF`, `CONTAINS`, `MENTIONS`, `SUPPORTS`, `CONTRADICTS`, `REQUIRES`, `PRODUCES`, `CAUSED_BY`, `DERIVED_FROM`, `ALTERNATIVE_TO`, `PRECEDES`, `FOLLOWS`, `SIMILAR_TO`, `BELONGS_TO`, `LOCATED_IN`, `CREATED_BY`.

---

## 3. Data Models

- **`KnowledgeEntity`**: Canonical concept node with aliases and confidence metrics.
- **`KnowledgeRelationship`**: Directed edge linking source and target entities backed by SHA-256 fingerprint.
- **`KnowledgeEvidence`**: Mandatory chunk-level evidence link (`documentId`, `chunkId`, `pageNumber`, `sourceTextHash`, `snippet`).
- **`KnowledgeClaim`**: Grounded subject-predicate-object assertion.
- **`KnowledgeConflict`**: Contradiction record tracking conflicting claims across evidence.
- **`KnowledgeGraphJob`**: Asynchronous background job metadata.
- **`KnowledgeGraphVersion`**: Scoped version tracking for graph invalidation.

---

## 4. Key Features

1. **Multi-Tenant Isolation**: Server-side authorization filtering by `userId` and `projectId`.
2. **Graph + RAG Fusion**: Parallel graph neighborhood traversal (1–3 hops) fused with pgvector & BM25 retrieval.
3. **Contradiction & Knowledge Gap Engine**: Identifies conflicting claims and poorly documented concepts.
4. **Prompt Injection Defense**: Explicit `<DOCUMENT_EVIDENCE>` delimiters treating document text strictly as untrusted data.
5. **Platform Integrations**: Copilot, AI Study Mode, AI Roadmaps, AI Workflow Builder, Project Workspaces, Admin Diagnostics, and Health Checks.

---

## 5. API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/knowledge-graph` | Fetch graph nodes & edges |
| `POST` | `/api/knowledge-graph/index` | Trigger document graph extraction |
| `GET` | `/api/knowledge-graph/entities` | Search & filter entities |
| `GET` | `/api/knowledge-graph/conflicts` | Detect claim contradictions |
| `GET` | `/api/knowledge-graph/gaps` | Detect knowledge gaps |
| `POST` | `/api/knowledge-graph/explain-connection` | Synthesize grounded multi-hop explanation |

---

## 6. Testing & Benchmarking

```bash
# Run Phase 41 Test Suite
npm run test:phase41

# Benchmark Knowledge Graph Performance
npm run benchmark:knowledge-graph

# Run All Phase Regressions
npm run test:all-phases
```
