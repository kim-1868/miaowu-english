-- S9-A: Additive-only operator identities and immutable audit evidence.
-- Do not apply to production before backup, migration-history review and acceptance.
-- No operator, token or privilege is created by this migration.
CREATE TABLE IF NOT EXISTS ops_operators (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor','reviewer','publisher')),
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  key_digest TEXT NOT NULL UNIQUE CHECK(length(key_digest)=64),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_operators_environment_role
  ON ops_operators(environment,role,is_active);

CREATE TABLE IF NOT EXISTS ops_audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES ops_operators(id),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  content_fingerprint TEXT,
  reason_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_type,request_id)
);
CREATE INDEX IF NOT EXISTS ix_ops_audit_resource
  ON ops_audit_events(resource_type,resource_id,created_at);
CREATE TRIGGER IF NOT EXISTS ops_audit_no_update
  BEFORE UPDATE ON ops_audit_events
  BEGIN SELECT RAISE(ABORT,'OPS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS ops_audit_no_delete
  BEFORE DELETE ON ops_audit_events
  BEGIN SELECT RAISE(ABORT,'OPS_AUDIT_APPEND_ONLY'); END;
