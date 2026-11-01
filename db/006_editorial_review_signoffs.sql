-- S3-C2: immutable manual QA acknowledgements, never a publication command.
CREATE TABLE IF NOT EXISTS editorial_review_signoffs (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  content_fingerprint TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  note TEXT NOT NULL,
  reviewer_identity TEXT NOT NULL DEFAULT 'staging-editor-key-holder',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_editorial_review_signoffs_book
  ON editorial_review_signoffs(book_id,created_at DESC);
