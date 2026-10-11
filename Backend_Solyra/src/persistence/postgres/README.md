# Solyra PostgreSQL Persistence Engine

## Architecture & Overview
This subsystem provides the relational persistence driver for Solyra using Node.js and PostgreSQL 18. It implements connection pooling with SSL support, declarative SQL schema migrations, and relational repository adapters.

## Implemented Baseline
- **Connection Pool (`pool.ts`)**: Exports `createPostgresPool`, `getPgPool` (singleton accessor), and `checkPostgresHealth` with production SSL fallback.
- **Relational Schema (`schema.sql`, `init_db.sql`, `rollback_schema.sql`)**: Defines tables for `users`, `workspaces`, `chat_sessions`, `chat_messages`, `knowledge_nodes`, and `memory_records`.
- **Repository Adapters**:
  - `PostgresUserRepository`: CRUD and lookup by email for user entities.
  - `PostgresWorkspaceRepository`: Workspace membership and slug resolution.
  - `PostgresChatRepository`: Session management and message history append/retrieval.
  - `PostgresKnowledgeRepository`: Knowledge node storage with JSONB metadata.
  - `PostgresMemoryRepository`: Tenant-scoped memory storage keyed by `(tenant_id, tier, key)` with salience search and delete semantics.
- **Runtime Wiring**: `Backend_Solyra/src/index.ts` now performs a real `checkPostgresHealth(getPgPool())` in `/ready` and reports `storage: 'connected' | 'disconnected'` based on the live pool state.
- **Verification Suite (`postgres.verify.ts`)**: Validates connection health, CRUD operations, cascade deletes, tenant isolation, and the memory adapter against PostgreSQL 18.

## Known Gaps & Active Remaining Work
- **Vector Search (Phase 3.4)**: `pgvector` was probed as `NOT_INSTALLED`; JSONB float-array cosine similarity search is planned for Phase 3.4.

## Status: ACTIVE (Relational + Memory Baseline Verified)
- **Verified Tests**: PostgreSQL verification includes the memory repository and health route checks in `src/persistence/postgres/postgres.verify.ts` and the dedicated `test/postgres.verify.ts` regression script.
