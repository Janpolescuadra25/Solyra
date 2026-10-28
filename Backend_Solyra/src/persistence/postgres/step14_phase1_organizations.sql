-- Step 14 Phase 1: Organizations, Memberships, Workspace Linking & Schema DDL Alignment

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'workspaces'
          AND kcu.column_name = 'owner_id'
          AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        EXECUTE 'ALTER TABLE workspaces DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE workspaces ALTER COLUMN owner_id TYPE UUID USING owner_id::uuid;
ALTER TABLE workspaces ADD CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS organization_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_org_workspaces_ws ON organization_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_org_workspaces_org ON organization_workspaces(organization_id);

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'sessions'
          AND kcu.column_name = 'workspace_id'
          AND tc.constraint_type = 'FOREIGN KEY'
    ) LOOP
        EXECUTE 'ALTER TABLE sessions DROP CONSTRAINT ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE sessions ALTER COLUMN workspace_id TYPE VARCHAR(64) USING workspace_id::text;
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE sessions ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
        CREATE INDEX idx_sessions_org ON sessions(organization_id);
    END IF;
END $$;
