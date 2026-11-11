-- V1.2 staging-only ADD-ONLY proposal; NOT included in current 013-018 remote workflows.
-- One user + one approved main entry has exactly ONE schedule, regardless of how
-- many novels or senses they encounter. Never delete/overwrite old user_words,
-- review_events, purchases, entitlements, original senses or old word ids.
-- Do not run remotely without isolated backup, explicit Publisher approval,
-- separately reviewed migration plan and tested rollback.
CREATE TABLE IF NOT EXISTS user_headword_study (
  user_id TEXT NOT NULL REFERENCES users(id),
  entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','learning','review_due','mastered')),
  stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 5),
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
  encounter_count INTEGER NOT NULL DEFAULT 0 CHECK(encounter_count>=0),
  remembered_count INTEGER NOT NULL DEFAULT 0 CHECK(remembered_count>=0),
  forgotten_count INTEGER NOT NULL DEFAULT 0 CHECK(forgotten_count>=0),
  due_at TEXT,
  last_seen_at TEXT,
  last_feedback_at TEXT,
  last_advanced_day TEXT,
  mastered_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,entry_id),
  CHECK(status!='mastered' OR due_at IS NULL),
  CHECK(stage!=0 OR due_at IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_user_headword_study_due
 ON user_headword_study(user_id,due_at,status);
-- Event ledger is separate from legacy review_events; the server MUST validate
-- access to novels, canonical approvals, and state revision in one transaction.
CREATE TABLE IF NOT EXISTS user_headword_review_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
  action TEXT NOT NULL CHECK(action IN
    ('seen','remembered','forgotten','mark_mastered','unmark_mastered')),
  source_book_id TEXT REFERENCES books(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  state_revision INTEGER NOT NULL CHECK(state_revision>=1),
  UNIQUE(user_id,entry_id,state_revision)
);
CREATE INDEX IF NOT EXISTS ix_user_headword_events_user_entry
 ON user_headword_review_events(user_id,entry_id,created_at);