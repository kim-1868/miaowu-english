-- MIAOWU ENGLISH - FIRST-TIME SCHEMA BOOTSTRAP - FRESH EMPTY D1 ONLY
-- Target database: miaowu-english-prod
-- Target database id: 649c71b3-340c-49bf-b806-3d39256851d3
-- WARNING: DO NOT RUN ON miaowu-english-test OR ANY DATABASE WITH EXISTING TABLES
-- No live users, real activation codes, real books, passwords, or secrets are inserted.
-- All statements derive from tracked reviewed SQL source files.
-- Run ONCE only, and inspect the table/category list after execution.
-- BEGIN SOURCE: db/001_schema.sql
-- 妙屋英语 S0 数据库草案。当前未部署，正式使用需迁移、访问权限、并发兑换及安全测试。
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK(is_visible IN (0,1))
);
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','coming_soon')),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  chapter_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  is_preview INTEGER NOT NULL DEFAULT 0 CHECK(is_preview IN (0,1)),
  published_at TEXT,
  UNIQUE(book_id,chapter_no)
);
CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  headword TEXT NOT NULL,
  phonetic_uk TEXT,
  phonetic_us TEXT,
  part_of_speech TEXT,
  meaning_zh TEXT,
  example_en TEXT,
  example_zh TEXT,
  collocations_json TEXT
);
CREATE TABLE IF NOT EXISTS chapter_words (
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  context_sentence TEXT NOT NULL,
  context_anchor TEXT NOT NULL,
  PRIMARY KEY(chapter_id,word_id,context_anchor)
);
CREATE TABLE IF NOT EXISTS activation_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','redeemed','revoked')),
  order_reference TEXT,
  redeemed_by TEXT REFERENCES users(id),
  redeemed_at TEXT,
  redemption_nonce TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  source_code_id TEXT REFERENCES activation_codes(id),
  scope_version TEXT NOT NULL DEFAULT 'launch',
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  PRIMARY KEY(user_id,category_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id),
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  progress REAL NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=1),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,chapter_id)
);
CREATE TABLE IF NOT EXISTS user_words (
  user_id TEXT NOT NULL REFERENCES users(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','learning','review_due','mastered')),
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
  due_at TEXT,
  last_seen_at TEXT,
  PRIMARY KEY(user_id,word_id)
);
CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  chapter_id TEXT REFERENCES chapters(id),
  game_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN ('correct','incorrect','hinted','revealed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_entitlements_category ON entitlements(category_id);
CREATE INDEX IF NOT EXISTS ix_user_words_due ON user_words(user_id,due_at);
CREATE INDEX IF NOT EXISTS ix_chapters_book ON chapters(book_id,chapter_no);
-- END SOURCE: db/001_schema.sql

-- BEGIN SOURCE: db/002_s1.sql
-- S1: replay-safe voucher redemption and auth throttling
CREATE TABLE IF NOT EXISTS request_throttle (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_throttle_reset ON request_throttle(reset_at);
-- END SOURCE: db/002_s1.sql

-- BEGIN SOURCE: db/003_public_categories.sql
-- Public course catalog identifiers. No demo codes, passwords, customer data or paid chapters.
INSERT OR IGNORE INTO categories(id,slug,title,is_visible) VALUES
('cet4','cet4','大学英语四级',1),
('cet6','cet6','大学英语六级',1),
('postgrad','postgrad','考研英语',1),
('ielts','ielts','雅思英语',1);
-- END SOURCE: db/003_public_categories.sql

-- BEGIN SOURCE: db/004_editorial_content.sql
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
-- END SOURCE: db/004_editorial_content.sql

-- BEGIN SOURCE: db/005_editorial_revisions.sql
-- S3-B2: audit snapshots for safe edits to still-unpublished content.
-- Additive only; no existing users, chapters, words, or entitlements are modified.
CREATE TABLE IF NOT EXISTS editorial_revisions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('chapter','word')),
  entity_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id),
  old_version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_editorial_revisions_entity
  ON editorial_revisions(book_id,entity_type,entity_id,saved_at DESC);
-- END SOURCE: db/005_editorial_revisions.sql

-- BEGIN SOURCE: db/006_editorial_review_signoffs.sql
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
-- END SOURCE: db/006_editorial_review_signoffs.sql
