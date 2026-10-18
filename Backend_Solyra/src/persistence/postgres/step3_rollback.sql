-- Step 3 Incremental Rollback (Non-destructive to base tables)
DROP INDEX IF EXISTS idx_tokens_hash_type;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_onboarding_state;
ALTER TABLE users DROP COLUMN IF EXISTS locked_until;
ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_state;
ALTER TABLE users DROP COLUMN IF EXISTS is_guest;
