-- Apply manually to audited production D1 only, BEFORE enabling ORDER_RECOVERY_ENABLED.
-- Additive migration: no modification of users, activations or entitlements.
-- Each paid-order activation may have its own recovery key, issued separately.
-- Existing users/orders are NOT silently granted recovery credentials.
CREATE TABLE IF NOT EXISTS order_recovery_credentials (
  code_id TEXT PRIMARY KEY NOT NULL REFERENCES activation_codes(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL UNIQUE CHECK(length(secret_hash)=64),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  reset_count INTEGER NOT NULL DEFAULT 0 CHECK(reset_count>=0)
);
CREATE INDEX IF NOT EXISTS idx_order_recovery_credentials_hash
  ON order_recovery_credentials(secret_hash);
