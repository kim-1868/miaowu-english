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
