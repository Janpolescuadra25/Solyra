-- ============================================================================
-- Solyra PostgreSQL Rollback Schema
-- Drops tables in reverse dependency order
-- ============================================================================
DROP TABLE IF EXISTS knowledge_nodes CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;
