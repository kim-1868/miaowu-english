-- S3-B2: audit snapshots for safe edits to still-unpublished content.
-- Additive only; no existing users, chapters, words, or entitlements are modified.
CREATE TABLE IF NOT EXISTS editorial_revisions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('chapter','word')),
  entity_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id),
  old_version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_editorial_revisions_entity
  ON editorial_revisions(book_id,entity_type,entity_id,saved_at DESC);
