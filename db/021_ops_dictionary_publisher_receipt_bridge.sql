-- P0A-1. TEST/STAGING ONLY. Requires 007 OPS identity/audit first.
-- Additive trust registry for the actual Publisher operator. Creates NO operator,
-- key, approval, customer state, license or dictionary entry. Never auto-migrate PROD.
CREATE TABLE IF NOT EXISTS ops_dictionary_publisher_keys (
 public_key_sha256 TEXT PRIMARY KEY
  CHECK(length(public_key_sha256)=64
    AND public_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 operator_id TEXT NOT NULL REFERENCES ops_operators(id),
 registration_audit_id TEXT NOT NULL UNIQUE REFERENCES ops_audit_events(id),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)),
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(is_active=0 OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_ops_dictionary_publisher_keys_owner
 ON ops_dictionary_publisher_keys(operator_id,is_active);
CREATE TRIGGER IF NOT EXISTS ops_publisher_key_no_delete
 BEFORE DELETE ON ops_dictionary_publisher_keys
 BEGIN SELECT RAISE(ABORT,'OPS_PUBLISHER_KEY_DELETE_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS ops_publisher_key_identity_immutable
 BEFORE UPDATE OF operator_id,public_key_sha256,registration_audit_id
 ON ops_dictionary_publisher_keys
 BEGIN SELECT RAISE(ABORT,'OPS_PUBLISHER_KEY_IDENTITY_IMMUTABLE'); END;

-- This table records authentication and signature verification ONLY.
-- A receipt is not a legally reviewed lesson, approved sense, or import permit.
CREATE TABLE IF NOT EXISTS ops_dictionary_publisher_receipts (
 receipt_sha256 TEXT PRIMARY KEY
  CHECK(length(receipt_sha256)=64
    AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
 authorization_audit_id TEXT NOT NULL UNIQUE REFERENCES ops_audit_events(id),
 verification_audit_id TEXT NOT NULL UNIQUE REFERENCES ops_audit_events(id),
 operator_id TEXT NOT NULL REFERENCES ops_operators(id),
 public_key_sha256 TEXT NOT NULL REFERENCES ops_dictionary_publisher_keys(public_key_sha256),
 review_sha256 TEXT NOT NULL CHECK(length(review_sha256)=64),
 source_proof_sha256 TEXT NOT NULL CHECK(length(source_proof_sha256)=64),
 candidate_sha256 TEXT NOT NULL CHECK(length(candidate_sha256)=64),
 reviewer_id TEXT NOT NULL,
 signed_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'TEST_PREFLIGHT_ONLY'
  CHECK(status='TEST_PREFLIGHT_ONLY'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_dictionary_publisher_receipts_review
 ON ops_dictionary_publisher_receipts(review_sha256,created_at);
CREATE TRIGGER IF NOT EXISTS ops_publisher_receipt_no_update
 BEFORE UPDATE ON ops_dictionary_publisher_receipts
 BEGIN SELECT RAISE(ABORT,'OPS_PUBLISHER_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ops_publisher_receipt_no_delete
 BEFORE DELETE ON ops_dictionary_publisher_receipts
 BEGIN SELECT RAISE(ABORT,'OPS_PUBLISHER_RECEIPT_IMMUTABLE'); END;
