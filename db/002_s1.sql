-- S1: replay-safe voucher redemption and auth throttling
CREATE TABLE IF NOT EXISTS request_throttle (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_throttle_reset ON request_throttle(reset_at);
