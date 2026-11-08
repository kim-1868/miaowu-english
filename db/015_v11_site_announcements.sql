-- WordLetter V1.1: independent noticeboard data only.
-- ADDITIVE / MANUAL REVIEW. Do not apply to production D1 automatically.
-- No edits to readers, learning records, orders, entitlements or books.
CREATE TABLE IF NOT EXISTS site_announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 90),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 180),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  category TEXT NOT NULL CHECK(category IN ('feature','books','maintenance','other')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),
  show_on_home INTEGER NOT NULL DEFAULT 1 CHECK(show_on_home IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  CHECK((status='draft' AND published_at IS NULL) OR status!='draft')
);
CREATE INDEX IF NOT EXISTS idx_site_announcements_public
  ON site_announcements(status,show_on_home,published_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_site_announcements_admin
  ON site_announcements(updated_at DESC,id DESC);
