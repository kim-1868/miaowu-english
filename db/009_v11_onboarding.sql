-- V1.1 additive and idempotent: only new users get a row.
-- Apply ONLY to backed-up staging D1 first. Never auto-run on production.
CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT,
  completion_kind TEXT CHECK(completion_kind IN ('finished','skipped')),
  first_word_tip_at TEXT,
  first_bookmark_tip_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
