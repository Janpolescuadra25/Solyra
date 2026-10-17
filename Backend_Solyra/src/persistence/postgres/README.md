# Solyra PostgreSQL Persistence Engine

## Architecture & Overview
This subsystem provides the relational persistence driver for Solyra using Node.js and PostgreSQL 18. It implements connection pooling with SSL support, declarative SQL schema migrations, and relational repository adapters.

## Implemented Baseline
- **Connection Pool (`pool.ts`)**: Exports `createPostgresPool`, `getPgPool` (singleton accessor), and `checkPostgresHealth` with production SSL fallback.
- **Relational Schema (`schema.sql`, `init_db.sql`, `rollback_schema.sql`)**: Defines tables for `users`, `workspaces`, `chat_sessions`, `chat_messages`, `knowledge_nodes`, and `memory_records`.
- **Native Vector Function**: Adds a PostgreSQL 18 `cosine_similarity(a JSONB, b JSONB)` PL/pgSQL fallback for JSONB embedding comparison when `pgvector` is not installed.
- **Repository Adapters**:
  - `PostgresUserRepository`: CRUD and lookup by email for user entities.
  - `PostgresWorkspaceRepository`: Workspace membership and slug resolution.
  - `PostgresChatRepository`: Session management and message history append/retrieval.
  - `PostgresKnowledgeRepository`: Knowledge node storage with JSONB metadata and semantic similarity search.
  - `PostgresMemoryRepository`: Tenant-scoped memory storage keyed by `(tenant_id, tier, key)` with salience search and delete semantics.
- **Semantic Search API**: `searchBySemanticSimilarity(workspaceId, queryEmbedding, minSimilarity = 0.7, limit = 10)` returns `SemanticSearchResult[]` sorted by descending similarity inside the current workspace.
- **Runtime Wiring**: `Backend_Solyra/src/index.ts` now performs a real `checkPostgresHealth(getPgPool())` in `/ready` and reports `storage: 'connected' | 'disconnected'` based on the live pool state.
- **Verification Suite**: `Backend_Solyra/test/postgres.verify.ts` validates health checks, CRUD, memory persistence, and semantic similarity filtering for multi-tenant workspaces.

## Semantic Search Contract
```typescript
searchBySemanticSimilarity(
  workspaceId: string,
  queryEmbedding: number[],
  minSimilarity?: number,
  limit?: number,
): Promise<SemanticSearchResult[]>
```

- `workspaceId` must be a non-empty string.
- `queryEmbedding` must be a non-empty number array.
- `minSimilarity` must be a number between `-1.0` and `1.0`.
- `limit` must be a positive integer.
- Each result includes the matching `KnowledgeNode` plus a `similarity` score.

## Status: COMPLETE (Phase 3.4 Vector Search Verified)
- **Verified Tests**: Semantic search, workspace isolation, and validation guards are covered in `Backend_Solyra/test/postgres.verify.ts`.

## PostgreSQL Test Safety Guard (`guard.ts`)
**Status:** DONE - LAST UPDATED: 2026-10-16

To prevent accidental modification or destructive testing against the application database (`Solyra_db`), all PostgreSQL verification and integration scripts must use `guard.ts`:
- **`validatePostgresTestSafety(options)`**:
  - Requires `NODE_ENV === 'test'`.
  - Requires an explicit, non-empty `SOLYRA_TEST_DB_URL` environment variable.
  - Rejects connection strings pointing to `solyra_db` or empty database names.
  - Returns the normalized target test database name.
- **`assertConnectedToTestDatabase(client, expectedDbName)`**:
  - Queries `SELECT current_database()` upon connection.
  - Asserts that the connected database strictly matches `expectedDbName` and is not `solyra_db`.
  - Aborts immediately before any table creation, schema modification, or write.
- **Integration Test Execution:**
  - Standard unit tests (`pnpm test`) do not connect to PostgreSQL.
  - PostgreSQL integration testing is strictly opt-in via:
    ```bash
    pnpm run test:integration:pg
    ```
