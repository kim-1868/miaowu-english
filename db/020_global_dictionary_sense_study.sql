-- V1.2 STAGING-ONLY PROPOSAL: canonical review schedules belong to each
-- independently reviewed *sense*, not merely an English spelling/headword.
-- A word may render as one card with multiple approved senses, while study
-- states of distinct senses NEVER collapse. Additive only; legacy data intact.
-- No remote application, publishing, user-study migration or activation here.
CREATE TABLE IF NOT EXISTS user_dictionary_sense_study (
  user_id TEXT NOT NULL REFERENCES users(id),
  sense_id TEXT NOT NULL REFERENCES global_dictionary_senses(sense_id),
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
  PRIMARY KEY(user_id,sense_id),
  CHECK(status!='mastered' OR due_at IS NULL),
  CHECK(stage!=0 OR due_at IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_user_dictionary_sense_due
 ON user_dictionary_sense_study(user_id,due_at,status);
-- Review events have per-sense idempotency. Source book/chapter+context are
-- provenance only, not part of a study identity. No legacy records are copied.
CREATE TABLE IF NOT EXISTS user_dictionary_sense_review_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  sense_id TEXT NOT NULL REFERENCES global_dictionary_senses(sense_id),
  entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
  action TEXT NOT NULL CHECK(action IN
    ('seen','remembered','forgotten','mark_mastered','unmark_mastered')),
  source_book_id TEXT REFERENCES books(id),
  source_chapter_id TEXT REFERENCES chapters(id),
  source_context_anchor TEXT NOT NULL CHECK(length(source_context_anchor) BETWEEN 1 AND 512),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  state_revision INTEGER NOT NULL CHECK(state_revision>=1),
  UNIQUE(user_id,sense_id,state_revision),
  FOREIGN KEY(sense_id,entry_id) REFERENCES global_dictionary_senses(sense_id,entry_id)
);
CREATE INDEX IF NOT EXISTS ix_user_dictionary_sense_events
 ON user_dictionary_sense_review_events(user_id,sense_id,created_at);
-- All writes to a newly approved sense must be independently authorized by
-- a server endpoint; DB also refuses a sense that is not approved & active.
CREATE TRIGGER IF NOT EXISTS user_dictionary_sense_study_approved_insert
 BEFORE INSERT ON user_dictionary_sense_study
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM global_dictionary_senses s
    JOIN global_dictionary_entries e ON e.entry_id=s.entry_id
    JOIN global_dictionary_sources src ON src.source_key=e.source_name
    JOIN global_dictionary_lessons lesson ON lesson.entry_id=e.entry_id
    WHERE s.sense_id=NEW.sense_id AND s.approved=1 AND s.active=1
      AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
      AND src.enabled=1 AND src.license_reviewed=1
      AND length(trim(lesson.reviewed_by))>0
      AND length(trim(lesson.reviewed_at))>0
  ) THEN RAISE(ABORT,'SENSE_STUDY_UNAPPROVED') END;
 END;
CREATE TRIGGER IF NOT EXISTS user_dictionary_sense_study_approved_update
 BEFORE UPDATE ON user_dictionary_sense_study
 BEGIN
  SELECT CASE WHEN NEW.sense_id!=OLD.sense_id OR NEW.user_id!=OLD.user_id
    THEN RAISE(ABORT,'SENSE_STUDY_IDENTITY_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM global_dictionary_senses s
    JOIN global_dictionary_entries e ON e.entry_id=s.entry_id
    JOIN global_dictionary_sources src ON src.source_key=e.source_name
    JOIN global_dictionary_lessons lesson ON lesson.entry_id=e.entry_id
    WHERE s.sense_id=NEW.sense_id AND s.approved=1 AND s.active=1
      AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
      AND src.enabled=1 AND src.license_reviewed=1
      AND length(trim(lesson.reviewed_by))>0
      AND length(trim(lesson.reviewed_at))>0
  ) THEN RAISE(ABORT,'SENSE_STUDY_UNAPPROVED') END;
 END;
CREATE TRIGGER IF NOT EXISTS user_dictionary_sense_events_approved_insert
 BEFORE INSERT ON user_dictionary_sense_review_events
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM global_dictionary_senses s
    WHERE s.sense_id=NEW.sense_id AND s.entry_id=NEW.entry_id
      AND s.approved=1 AND s.active=1
  ) THEN RAISE(ABORT,'SENSE_EVENT_UNAPPROVED') END;
 END;
