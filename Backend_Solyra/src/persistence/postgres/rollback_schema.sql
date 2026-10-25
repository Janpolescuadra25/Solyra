-- ============================================================================
-- Solyra PostgreSQL Rollback Schema
-- Drops tables in reverse dependency order
-- ============================================================================
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS email_outbox CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS knowledge_nodes CASCADE;
DROP TABLE IF EXISTS memory_records CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS archive_state;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS retention_expires_at;
ALTER TABLE chat_sessions DROP COLUMN IF EXISTS deleted_at;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS cosine_similarity(JSONB, JSONB);
