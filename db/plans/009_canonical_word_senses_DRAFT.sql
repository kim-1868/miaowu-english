-- DESIGN DRAFT ONLY — DO NOT APPLY TO PRODUCTION.
-- No existing columns, primary keys, chapter content, user rows or review events are modified.
-- Apply only to an isolated D1 test database after a restore rehearsal.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS canonical_word_senses (
  id TEXT PRIMARY KEY,
  lemma_normalized TEXT NOT NULL,
  part_of_speech TEXT NOT NULL,
  sense_code TEXT NOT NULL,
  meaning_zh TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(verification_status IN ('draft','approved','retired')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lemma_normalized,part_of_speech,sense_code)
);

-- Only approved mappings may be used for progress sharing; pending mappings are inert.
CREATE TABLE IF NOT EXISTS legacy_word_sense_map (
  word_id TEXT PRIMARY KEY REFERENCES words(id),
  sense_id TEXT NOT NULL REFERENCES canonical_word_senses(id),
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(review_status IN ('pending','approved','rejected')),
  reviewer_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_legacy_word_sense_sense
  ON legacy_word_sense_map(sense_id,review_status);

-- Granular override if one legacy word_id represents multiple senses at different anchors.
-- The current frontend does not yet carry an occurrence identity on click;
-- the override is a schema provision, NOT ready to activate by itself.
CREATE TABLE IF NOT EXISTS chapter_word_sense_overrides (
  chapter_id TEXT NOT NULL,
  word_id TEXT NOT NULL,
  context_anchor TEXT NOT NULL,
  sense_id TEXT NOT NULL REFERENCES canonical_word_senses(id),
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(review_status IN ('pending','approved','rejected')),
  reviewed_at TEXT,
  PRIMARY KEY(chapter_id,word_id,context_anchor),
  FOREIGN KEY(chapter_id,word_id,context_anchor)
    REFERENCES chapter_words(chapter_id,word_id,context_anchor)
);
CREATE INDEX IF NOT EXISTS ix_chapter_word_sense_sense
  ON chapter_word_sense_overrides(sense_id,review_status);

-- Shadow per-sense progress; current user_words remains untouched.
CREATE TABLE IF NOT EXISTS user_sense_state (
  user_id TEXT NOT NULL REFERENCES users(id),
  sense_id TEXT NOT NULL REFERENCES canonical_word_senses(id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','learning','review_due','mastered')),
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
  due_at TEXT,
  last_seen_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_revision INTEGER NOT NULL DEFAULT 1 CHECK(source_revision >= 1),
  PRIMARY KEY(user_id,sense_id)
);
CREATE INDEX IF NOT EXISTS ix_user_sense_state_due
  ON user_sense_state(user_id,bookmarked,due_at);

-- Link approved historical review events to a sense without changing original events.
CREATE TABLE IF NOT EXISTS review_event_senses (
  event_id TEXT PRIMARY KEY REFERENCES review_events(id),
  sense_id TEXT NOT NULL REFERENCES canonical_word_senses(id),
  mapped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_review_event_senses_sense
  ON review_event_senses(sense_id,event_id);

-- NO INSERT/UPDATE/DELETE of legacy data in this script.
-- NO automatic migration of users, subscriptions, or book chapter content.
