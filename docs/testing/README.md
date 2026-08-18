# Enterprise Jest Testing Infrastructure & Architecture

This repository uses a production-grade Jest testing framework alongside the universal Phase regression runner (`scripts/test-all-phases.ts`).

---

## 1. Test Architecture Overview

```
tests/
├── unit/            # Isolated unit tests for LLM Gateway, RAG, study, reranking, workers
├── integration/     # Service & repository integration tests
├── api/             # Next.js API route tests using realistic Request/Response objects
├── security/        # Security test suites (Multi-tenant isolation, RBAC, Prompt Injection, SSRF)
├── components/      # React UI component tests running in JSDOM environment
├── mocks/           # In-memory Redis mocks, LLM provider mocks, file mocks
├── fixtures/        # Deterministic sample PDF text, chunks, citations, workflow graphs
├── factories/       # User, Document, Roadmap, Study, Workflow test data generators
├── helpers/         # Database safety guards, network access guards
└── phase*.test.ts   # Phase 7–40 regression suite scripts
```

---

## 2. Test Environments

Jest uses a dual-environment configuration in `jest.config.ts`:
- **`node` environment**: Services, repositories, security, API, LLM Gateway, workers (`tests/unit`, `tests/integration`, `tests/api`, `tests/security`).
- **`jsdom` environment**: React components (`tests/components`).

---

## 3. Environment & Network Safety Guards

1. **Database Guard (`tests/helpers/database.ts`)**:
   - Refuses execution if `NODE_ENV !== 'test'` or if `DATABASE_URL` contains production indicators.
2. **Network Access Guard (`tests/helpers/network-safety.ts`)**:
   - Intercepts external HTTP calls and throws `NetworkAccessError` if unexpected external network requests (Ollama, Kimi, Open-Meteo, external web APIs) occur during tests.

---

## 4. Test Commands

| Command | Description |
| :--- | :--- |
| `npm test` | Run all Jest test suites |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:api` | Run Next.js API route tests |
| `npm run test:security` | Run security test suites (Tenant isolation, RBAC, SSRF, Injection) |
| `npm run test:components` | Run React component tests in JSDOM |
| `npm run test:phase40` | Run Phase 40 infrastructure verification suite |
| `npm run test:coverage` | Generate code coverage metrics |
| `npm run test:ci` | Run non-interactive CI test runner with coverage |
| `npm run test:all-phases` | Run universal Phase 7–40 regression test suite |
| `npm run benchmark:tests` | Benchmark test execution speeds |

---

## 5. How to Run Specific Tests

```bash
# Run a single test file
npm test -- tests/unit/llm/llm-router.test.ts

# Run tenant isolation security tests
npm run test:security

# Run Phase 40 test suite
npm run test:phase40
```
