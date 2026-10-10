-- ============================================================================
-- Solyra PostgreSQL Database Initialization & Extension Bootstrap
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not installed in PostgreSQL instance. Using JSONB fallback for embeddings.';
END
$$;
