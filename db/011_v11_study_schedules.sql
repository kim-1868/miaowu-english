-- WordLetter V1.1 P4 / migration 011: additive per-user per-sense review plan.
-- The legacy user_words and review_events rows are NOT modified or deleted.
-- Planned application: backed-up test D1 first, production only after user acceptance.
CREATE TABLE IF NOT EXISTS user_study_schedules (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 study_key TEXT NOT NULL,
 stage_index INTEGER NOT NULL DEFAULT 0 CHECK(stage_index BETWEEN 0 AND 4),
 due_at TEXT,
 last_positive_day TEXT,
 last_reviewed_at TEXT,
 mastered INTEGER NOT NULL DEFAULT 0 CHECK(mastered IN (0,1)),
 bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,study_key)
);
CREATE INDEX IF NOT EXISTS ix_user_study_schedules_due ON user_study_schedules(user_id,due_at);
