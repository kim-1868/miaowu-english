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

CREATE TABLE IF NOT EXISTS request_throttle (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_throttle_reset ON request_throttle(reset_at);

INSERT OR IGNORE INTO categories(id,slug,title,is_visible) VALUES
('cet4','cet4','大学英语四级',1),
('cet6','cet6','大学英语六级',1),
('postgrad','postgrad','考研英语',1),
('ielts','ielts','雅思英语',1);

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

CREATE TABLE IF NOT EXISTS ops_operators (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor','reviewer','publisher')),
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  key_digest TEXT NOT NULL UNIQUE CHECK(length(key_digest)=64),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_operators_environment_role
  ON ops_operators(environment,role,is_active);

CREATE TABLE IF NOT EXISTS ops_audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES ops_operators(id),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  content_fingerprint TEXT,
  reason_code TEXT,
  reason_note TEXT CHECK(reason_note IS NULL OR length(reason_note) BETWEEN 12 AND 400),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_type,request_id)
);
CREATE INDEX IF NOT EXISTS ix_ops_audit_resource
  ON ops_audit_events(resource_type,resource_id,created_at);
CREATE TRIGGER IF NOT EXISTS ops_audit_no_update
  BEFORE UPDATE ON ops_audit_events
  BEGIN SELECT RAISE(ABORT,'OPS_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS ops_audit_no_delete
  BEFORE DELETE ON ops_audit_events
  BEGIN SELECT RAISE(ABORT,'OPS_AUDIT_APPEND_ONLY'); END;

ALTER TABLE books ADD COLUMN last_release_request_id TEXT;

CREATE TABLE IF NOT EXISTS ops_book_content_versions (
  book_id TEXT PRIMARY KEY REFERENCES books(id),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0)
);
INSERT OR IGNORE INTO ops_book_content_versions(book_id,version)
  SELECT id,0 FROM books;

CREATE TRIGGER IF NOT EXISTS ops_book_insert_version AFTER INSERT ON books BEGIN
  INSERT OR IGNORE INTO ops_book_content_versions(book_id,version) VALUES(NEW.id,0);
END;
CREATE TRIGGER IF NOT EXISTS ops_book_update_version AFTER UPDATE ON books BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS ops_chapter_insert_version AFTER INSERT ON chapters BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id=NEW.book_id;
END;
CREATE TRIGGER IF NOT EXISTS ops_chapter_update_version AFTER UPDATE ON chapters BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id=NEW.book_id;
  UPDATE ops_book_content_versions SET version=version+1
    WHERE book_id=OLD.book_id AND OLD.book_id<>NEW.book_id;
END;
CREATE TRIGGER IF NOT EXISTS ops_chapter_delete_version AFTER DELETE ON chapters BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id=OLD.book_id;
END;
CREATE TRIGGER IF NOT EXISTS ops_word_update_version AFTER UPDATE ON words BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT DISTINCT ch.book_id FROM chapter_words cw
    JOIN chapters ch ON ch.id=cw.chapter_id
    WHERE cw.word_id IN (OLD.id,NEW.id));
END;
CREATE TRIGGER IF NOT EXISTS ops_word_delete_version AFTER DELETE ON words BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT DISTINCT ch.book_id FROM chapter_words cw
    JOIN chapters ch ON ch.id=cw.chapter_id WHERE cw.word_id=OLD.id);
END;
CREATE TRIGGER IF NOT EXISTS ops_anchor_insert_version AFTER INSERT ON chapter_words BEGIN
  UPDATE ops_book_content_versions SET version=version+1
    WHERE book_id=(SELECT book_id FROM chapters WHERE id=NEW.chapter_id);
END;
CREATE TRIGGER IF NOT EXISTS ops_anchor_update_version AFTER UPDATE ON chapter_words BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT book_id FROM chapters WHERE id IN (NEW.chapter_id,OLD.chapter_id));
END;
CREATE TRIGGER IF NOT EXISTS ops_anchor_delete_version AFTER DELETE ON chapter_words BEGIN
  UPDATE ops_book_content_versions SET version=version+1
    WHERE book_id=(SELECT book_id FROM chapters WHERE id=OLD.chapter_id);
END;
CREATE TRIGGER IF NOT EXISTS ops_word_category_insert_version AFTER INSERT ON word_categories BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT DISTINCT b.id FROM books b JOIN chapters ch ON ch.book_id=b.id
    JOIN chapter_words cw ON cw.chapter_id=ch.id
    WHERE cw.word_id=NEW.word_id AND b.category_id=NEW.category_id);
END;
CREATE TRIGGER IF NOT EXISTS ops_word_category_update_version AFTER UPDATE ON word_categories BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT DISTINCT b.id FROM books b JOIN chapters ch ON ch.book_id=b.id
    JOIN chapter_words cw ON cw.chapter_id=ch.id
    WHERE (cw.word_id=NEW.word_id AND b.category_id=NEW.category_id)
       OR (cw.word_id=OLD.word_id AND b.category_id=OLD.category_id));
END;
CREATE TRIGGER IF NOT EXISTS ops_word_category_delete_version AFTER DELETE ON word_categories BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id IN (
    SELECT DISTINCT b.id FROM books b JOIN chapters ch ON ch.book_id=b.id
    JOIN chapter_words cw ON cw.chapter_id=ch.id
    WHERE cw.word_id=OLD.word_id AND b.category_id=OLD.category_id);
END;
CREATE TRIGGER IF NOT EXISTS ops_revision_insert_version AFTER INSERT ON editorial_revisions BEGIN
  UPDATE ops_book_content_versions SET version=version+1 WHERE book_id=NEW.book_id;
END;

CREATE TABLE IF NOT EXISTS ops_publication_approvals (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  operator_id TEXT NOT NULL REFERENCES ops_operators(id),
  content_fingerprint TEXT NOT NULL CHECK(length(content_fingerprint)=64),
  content_version INTEGER NOT NULL,
  checks_json TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_ops_approvals_book
  ON ops_publication_approvals(book_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS ops_approval_no_update BEFORE UPDATE ON ops_publication_approvals
  BEGIN SELECT RAISE(ABORT,'OPS_APPROVAL_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS ops_approval_no_delete BEFORE DELETE ON ops_publication_approvals
  BEGIN SELECT RAISE(ABORT,'OPS_APPROVAL_APPEND_ONLY'); END;

CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_codes_one_paid_order
  ON activation_codes(order_reference)
  WHERE order_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS account_recovery (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_recovery_hash
  ON account_recovery(code_hash);
