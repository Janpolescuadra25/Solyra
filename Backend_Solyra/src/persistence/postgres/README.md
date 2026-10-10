# Solyra PostgreSQL Persistence Engine (Phase 3.3)

## Architectural Overview
This module provides the production relational persistence layer for Solyra, implementing the repository contracts exported by `@solyra/shared` with PostgreSQL 18+.

## Design Principles
1. `pg.Pool` manages a resilient, configurable connection pool for runtime access.
2. Repository adapters keep tenant scoping explicit through workspace and user filters.
3. SQL schemas declare foreign keys with `ON DELETE CASCADE` to maintain referential integrity.
4. Health checks are non-fatal and return a structured result for runtime diagnostics.
5. The migration bundle includes `init_db.sql`, `schema.sql`, and a rollback script for controlled resets.

## Files
- `init_db.sql`: extension bootstrapping and optional `pgvector` enablement.
- `schema.sql`: relational table declarations for users, workspaces, members, chat sessions, chat messages, and knowledge nodes.
- `rollback_schema.sql`: destructive reset script for local teardown and verification.
- `pool.ts`: reusable connection pool factory and health probe helper.
- `index.ts`: bundle factory exporting the repository adapters.
- `repositories/*.ts`: PostgreSQL-backed persistence implementations.

## Local Setup
```bash
pnpm --dir Backend_Solyra add pg
pnpm --dir Backend_Solyra add -D @types/pg
```

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/solyra_db
DATABASE_SSL=false
PORT=4000
NODE_ENV=development
```

## Verification
Run the bundled verification script:

```bash
pnpm --dir Backend_Solyra exec tsx ./src/persistence/postgres/postgres.verify.ts
```

This suite validates the pool health check, CRUD operations, cascade deletes, and multi-tenant isolation.
