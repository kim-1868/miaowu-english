-- Additive-only, idempotent tag storage for current/past book covers.
-- All tags are lightweight metadata. No access to novel chapters or user records.
CREATE TABLE IF NOT EXISTS book_cover_tags (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 24),
  color TEXT NOT NULL CHECK(length(color)=7 AND substr(color,1,1)='#'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(book_id,label)
);
CREATE INDEX IF NOT EXISTS idx_book_cover_tags_catalog
  ON book_cover_tags(book_id,sort_order,label);
CREATE INDEX IF NOT EXISTS idx_book_cover_tags_presets
  ON book_cover_tags(updated_at DESC);
