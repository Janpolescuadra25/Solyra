# Step 14 Phase 1: Organization Data Contracts & Persistence Layer

## Status
- [x] DONE

## Added schema objects
- `organizations` stores organization metadata and the owning user.
- `organization_members` stores per-organization membership and role assignments.
- `organization_workspaces` links workspaces to organizations without breaking workspace ownership.
- `sessions.organization_id` adds org-aware authentication context without removing workspace scoping.

## Canonical tables and constraints

```sql
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, workspace_id)
);
```

## Migration execution

```bash
PGDATABASE="${PGDATABASE:-Solyra_db}" PGUSER="${PGUSER:-postgres}" psql -U "${PGUSER:-postgres}" -d "${PGDATABASE:-Solyra_db}" -f Backend_Solyra/src/persistence/postgres/step14_phase1_organizations.sql
```

## Rollback execution

```bash
PGDATABASE="${PGDATABASE:-Solyra_db}" PGUSER="${PGUSER:-postgres}" psql -U "${PGUSER:-postgres}" -d "${PGDATABASE:-Solyra_db}" -f Backend_Solyra/src/persistence/postgres/step14_phase1_organizations_rollback.sql
```

## Operational safety
- Use the same `${PGDATABASE:-Solyra_db}` and `${PGUSER:-postgres}` values across migration and rollback commands.
- Run the schema backup command before DDL: `pg_dump -U "${PGUSER:-postgres}" -d "${PGDATABASE:-Solyra_db}" --schema-only -f backup_pre_step14.sql`.
- Preserve all active sessions and workspace ownership by checking for invalid `workspaces.owner_id` UUIDs and orphaned sessions before migration.
