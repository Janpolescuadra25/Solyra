-- Step 14 Phase 1 Rollback Script
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS fk_sessions_workspace;
ALTER TABLE sessions DROP COLUMN IF EXISTS organization_id;
DROP TABLE IF EXISTS organization_workspaces CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
