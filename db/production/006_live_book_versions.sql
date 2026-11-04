-- V29: immutable pre-change snapshots for publisher edits of LIVE books.
-- Additive only. No user, entitlement, book or chapter row is mutated here.
-- Apply to production only after a point-in-time D1 backup and schema check.
CREATE TABLE IF NOT EXISTS ops_live_book_versions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  actor_id TEXT NOT NULL REFERENCES ops_operators(id),
  action TEXT NOT NULL CHECK(action IN ('metadata','content','restore')),
  request_id TEXT NOT NULL UNIQUE,
  base_version INTEGER NOT NULL CHECK(base_version>=0),
  snapshot_json TEXT NOT NULL CHECK(length(snapshot_json)>10),
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_live_book_versions_book
  ON ops_live_book_versions(book_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS ops_live_versions_no_update
  BEFORE UPDATE ON ops_live_book_versions
  BEGIN SELECT RAISE(ABORT,'OPS_LIVE_VERSION_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS ops_live_versions_no_delete
  BEFORE DELETE ON ops_live_book_versions
  BEGIN SELECT RAISE(ABORT,'OPS_LIVE_VERSION_APPEND_ONLY'); END;
