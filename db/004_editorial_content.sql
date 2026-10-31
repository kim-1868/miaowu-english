-- S3-A: non-destructive editorial tracking. Existing accounts, entitlements,
-- book/chapter records, and review data are not modified.
CREATE TABLE IF NOT EXISTS content_packages (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  source_digest TEXT NOT NULL UNIQUE,
  source_label TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS word_categories (
  word_id TEXT NOT NULL REFERENCES words(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  proficiency_note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (word_id, category_id)
);
CREATE INDEX IF NOT EXISTS ix_chapter_words_word ON chapter_words(word_id,chapter_id);
CREATE INDEX IF NOT EXISTS ix_content_packages_book ON content_packages(book_id,imported_at);
