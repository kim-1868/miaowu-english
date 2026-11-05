-- V33: additive self-service claim / human reconciliation ledger.
-- Safe to apply ONLY to audited miaowu-english-prod after read-only preflight.
-- No updates, drops, deletes, or backfilling of existing paid users or vouchers.
CREATE TABLE IF NOT EXISTS self_service_claims (
  id TEXT PRIMARY KEY,
  order_reference TEXT NOT NULL UNIQUE,
  code_id TEXT NOT NULL UNIQUE REFERENCES activation_codes(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  requester_digest TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(review_status IN ('pending','verified','abnormal')),
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES ops_operators(id),
  reviewed_at TEXT,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS ix_self_claims_claimed
  ON self_service_claims(claimed_at);
CREATE INDEX IF NOT EXISTS ix_self_claims_requester
  ON self_service_claims(requester_digest,claimed_at);
CREATE INDEX IF NOT EXISTS ix_self_claims_review
  ON self_service_claims(review_status,claimed_at);
CREATE TABLE IF NOT EXISTS self_service_claim_actions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES self_service_claims(id),
  actor_id TEXT NOT NULL REFERENCES ops_operators(id),
  action TEXT NOT NULL CHECK(action IN ('verify','flag','revoke','restore')),
  reason TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_self_claim_actions_claim
  ON self_service_claim_actions(claim_id,created_at);
