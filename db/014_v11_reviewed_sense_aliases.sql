-- V1.1 P5 / proposal 014: additive reviewer-approved sense identity metadata.
-- SCHEMA ONLY. Never run remotely without separate restore + approval.
-- Existing words.id, chapter_words, user_words, review_events, schedules
-- and reading_progress are NEVER rewritten by this migration.
CREATE TABLE IF NOT EXISTS reviewed_sense_groups (
 sense_id TEXT PRIMARY KEY CHECK(substr(sense_id,1,9)='reviewed:'),
 snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64),
 evidence_sha256 TEXT NOT NULL CHECK(length(evidence_sha256)=64),
 reviewer TEXT NOT NULL CHECK(length(trim(reviewer))>0),
 reviewed_at TEXT NOT NULL CHECK(length(reviewed_at)=10),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reviewed_sense_aliases (
 word_id TEXT NOT NULL PRIMARY KEY REFERENCES words(id) ON DELETE RESTRICT,
 sense_id TEXT NOT NULL REFERENCES reviewed_sense_groups(sense_id) ON DELETE RESTRICT,
 legacy_study_key TEXT NOT NULL CHECK(length(legacy_study_key)>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_v11_reviewed_sense_aliases_sense
 ON reviewed_sense_aliases(sense_id);
