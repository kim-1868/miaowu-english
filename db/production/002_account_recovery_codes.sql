-- S18: optional email-free password recovery using an offline, single-use
-- 256-bit recovery code shown ONCE at registration or password change.
-- Deploy on a NEW production D1 after schema review, BEFORE enabling public
-- registration. Never run on the live staging D1 without a separate decision.
CREATE TABLE IF NOT EXISTS account_recovery (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_recovery_hash
  ON account_recovery(code_hash);
