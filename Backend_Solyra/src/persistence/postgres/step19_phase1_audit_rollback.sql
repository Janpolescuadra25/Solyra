-- Step 19 Phase 1 Audit Events Rollback Script
-- Restores audit_events table definition to the Step 18 state

DROP INDEX IF EXISTS idx_audit_events_org_created;
DROP INDEX IF EXISTS idx_audit_events_ws_created;
DROP INDEX IF EXISTS idx_audit_events_organization_id;
DROP INDEX IF EXISTS idx_audit_events_action;
DROP INDEX IF EXISTS idx_audit_events_workspace_id;

ALTER TABLE audit_events DROP COLUMN IF EXISTS organization_id;
ALTER TABLE audit_events DROP COLUMN IF EXISTS target_type;
ALTER TABLE audit_events DROP COLUMN IF EXISTS target_id;
ALTER TABLE audit_events DROP COLUMN IF EXISTS metadata;

-- Revert workspace_id to UUID if needed for exact Step 18 rollback.
-- Note: in production, dropping data/constraints requires table recreation.
