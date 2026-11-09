-- Smart vocabulary is fully isolated from novel chapter import and customer history.
-- Apply to staging D1 ONLY after a verified backup. Never run automatically in production.
CREATE TABLE IF NOT EXISTS smart_vocab_levels (
  category_id TEXT PRIMARY KEY REFERENCES categories(id),
  expected_headwords INTEGER NOT NULL CHECK(expected_headwords > 0),
  catalog_verified_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS smart_vocab_catalog (
  category_id TEXT NOT NULL REFERENCES categories(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  -- Verified unranked syllabus items are taught AFTER frequency-ranked words.
  -- NULL is not a fictitious rank 0; never claim genuine exam/corpus frequency.
  frequency_rank INTEGER CHECK(frequency_rank IS NULL OR frequency_rank > 0),
  frequency_source TEXT NOT NULL CHECK(frequency_source IN ('COCA','BNC','POSTGRAD_EXAM','UNRANKED')),
  frequency_verified INTEGER NOT NULL DEFAULT 1 CHECK(frequency_verified IN (0,1)),
  CHECK((frequency_source='UNRANKED' AND frequency_rank IS NULL) OR
        (frequency_source!='UNRANKED' AND frequency_rank IS NOT NULL)),
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1)),
  PRIMARY KEY(category_id,word_id)
);
CREATE INDEX IF NOT EXISTS ix_smart_vocab_rank
  ON smart_vocab_catalog(category_id,reviewed,frequency_rank,word_id);
CREATE INDEX IF NOT EXISTS ix_smart_vocab_word
  ON smart_vocab_catalog(word_id,category_id);
