-- S9-B: append-only release approvals, atomic content version guards.
-- IMPORTANT: Do not apply to a remote D1 database before independent backup,
-- migration-history reconciliation, QA, and a documented rollout.
ALTER TABLE books ADD COLUMN last_release_request_id TEXT;

CREATE TABLE IF NOT EXISTS ops_book_content_versions (
  book_id TEXT PRIMARY KEY REFERENCES books(id),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0)
);
INSERT OR IGNORE INTO ops_book_content_versions(book_id,version)
  SELECT id,0 FROM books;

-- Book/chapters and related vocabulary changes invalidate a prior approval.
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
