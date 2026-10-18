-- ============================================================================
-- Solyra PostgreSQL Schema (Phase 3.3 Relational Persistence)
-- Declares all core entities with explicit multi-tenant scoping
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    owner_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_isolated BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_id);

CREATE TABLE IF NOT EXISTS workspace_members (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_workspace_member UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    model_identifier VARCHAR(255) NOT NULL DEFAULT 'gpt-4o',
    system_prompt_override TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace ON chat_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL,
    sender VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding JSONB,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_workspace ON knowledge_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_tags ON knowledge_nodes USING gin(tags);

-- Cosine similarity function for JSONB float arrays (PostgreSQL 18 native fallback)
CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
RETURNS FLOAT AS $$
DECLARE
  arr_a NUMERIC[];
  arr_b NUMERIC[];
  dot_product NUMERIC := 0;
  mag_a NUMERIC := 0;
  mag_b NUMERIC := 0;
  i INT;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN 0.0;
  END IF;

  arr_a := ARRAY(SELECT jsonb_array_elements_text(a)::NUMERIC);
  arr_b := ARRAY(SELECT jsonb_array_elements_text(b)::NUMERIC);

  IF array_length(arr_a, 1) IS NULL OR array_length(arr_b, 1) IS NULL OR array_length(arr_a, 1) != array_length(arr_b, 1) THEN
    RETURN 0.0;
  END IF;

  FOR i IN 1..array_length(arr_a, 1) LOOP
    dot_product := dot_product + arr_a[i] * arr_b[i];
    mag_a := mag_a + arr_a[i] * arr_a[i];
    mag_b := mag_b + arr_b[i] * arr_b[i];
  END LOOP;

  IF mag_a = 0 OR mag_b = 0 THEN
    RETURN 0.0;
  END IF;

  RETURN (dot_product / (sqrt(mag_a) * sqrt(mag_b)))::FLOAT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS memory_records (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    tier VARCHAR(32) NOT NULL CHECK (tier IN ('working', 'short_term', 'long_term', 'episodic')),
    key VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding JSONB,
    salience DOUBLE PRECISION NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, tier, key)
);

CREATE INDEX IF NOT EXISTS idx_memory_records_tenant_tier ON memory_records(tenant_id, tier);
CREATE INDEX IF NOT EXISTS idx_memory_records_salience ON memory_records(tenant_id, tier, salience DESC);

-- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- AUTH TOKENS (Email Verification, Password Reset)
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_tokens_token_hash ON tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);

-- TRANSACTIONAL EMAIL OUTBOX
CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient VARCHAR(255) NOT NULL,
    template VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status);

-- AUDIT EVENTS
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
