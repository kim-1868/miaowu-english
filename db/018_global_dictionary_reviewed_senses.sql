-- B1.3 STAGING ONLY. Separate stable learning senses beneath a single display card.
-- Do NOT apply without D1 test backup, approvals and rollback.
CREATE TABLE IF NOT EXISTS global_dictionary_senses (
 sense_id TEXT PRIMARY KEY CHECK(length(sense_id)=28 AND substr(sense_id,1,4)='gds_' AND substr(sense_id,5) NOT GLOB '*[^0-9a-f]*'),
 entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
 pos TEXT NOT NULL CHECK(length(trim(pos))>0),
 meaning_zh TEXT NOT NULL CHECK(length(trim(meaning_zh))>0),
 example_en TEXT NOT NULL CHECK(length(trim(example_en))>0),
 example_zh TEXT NOT NULL CHECK(length(trim(example_zh))>0),
 reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
 reviewed_at TEXT NOT NULL CHECK(length(trim(reviewed_at))>0),
 approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN(0,1)),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN(0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(active=0 OR approved=1),
 UNIQUE(sense_id,entry_id)
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_sense_entry
 ON global_dictionary_senses(entry_id,approved,active);
CREATE TRIGGER IF NOT EXISTS global_dictionary_sense_identity_guard
 BEFORE UPDATE OF entry_id,pos,meaning_zh ON global_dictionary_senses
 WHEN OLD.approved=1 AND
 (NEW.entry_id!=OLD.entry_id OR NEW.pos!=OLD.pos OR NEW.meaning_zh!=OLD.meaning_zh)
 BEGIN SELECT RAISE(ABORT,'REVIEWED_SENSE_IDENTITY_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS global_dictionary_legacy_sense_links (
 legacy_word_id TEXT PRIMARY KEY REFERENCES words(id),
 sense_id TEXT NOT NULL REFERENCES global_dictionary_senses(sense_id),
 old_card_sha256 TEXT NOT NULL
  CHECK(length(old_card_sha256)=64 AND old_card_sha256 NOT GLOB '*[^0-9a-f]*'),
 reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
 reviewed_at TEXT NOT NULL CHECK(length(trim(reviewed_at))>0),
 review_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_legacy_sense
 ON global_dictionary_legacy_sense_links(sense_id);
CREATE TRIGGER IF NOT EXISTS global_dictionary_legacy_sense_link_guard
 BEFORE INSERT ON global_dictionary_legacy_sense_links
 BEGIN
  SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM global_dictionary_senses g
   JOIN global_dictionary_entries e ON e.entry_id=g.entry_id
   JOIN global_dictionary_sources src ON src.source_key=e.source_name
   JOIN global_dictionary_lessons l ON l.entry_id=g.entry_id
   WHERE g.sense_id=NEW.sense_id AND g.approved=1 AND g.active=1
    AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
    AND src.enabled=1 AND src.license_reviewed=1
    AND length(trim(l.reviewed_by))>0 AND length(trim(l.reviewed_at))>0
  ) THEN RAISE(ABORT,'UNAPPROVED_LEGACY_SENSE_LINK') END;
 END;
CREATE TRIGGER IF NOT EXISTS global_dictionary_legacy_sense_link_no_repoint
 BEFORE UPDATE OF legacy_word_id,sense_id,old_card_sha256
 ON global_dictionary_legacy_sense_links
 BEGIN SELECT RAISE(ABORT,'LEGACY_SENSE_LINK_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS global_dictionary_book_sense_bindings (
 book_id TEXT NOT NULL,chapter_id TEXT NOT NULL,context_anchor TEXT NOT NULL,
 sense_id TEXT NOT NULL REFERENCES global_dictionary_senses(sense_id),
 entry_id TEXT NOT NULL,actor_id TEXT NOT NULL CHECK(length(trim(actor_id))>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(book_id,chapter_id,context_anchor),
 FOREIGN KEY(book_id,chapter_id,context_anchor)
  REFERENCES global_dictionary_book_bindings(book_id,chapter_id,context_anchor),
 FOREIGN KEY(sense_id,entry_id)
  REFERENCES global_dictionary_senses(sense_id,entry_id)
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_book_sense
 ON global_dictionary_book_sense_bindings(sense_id);
CREATE TRIGGER IF NOT EXISTS global_dictionary_book_sense_guard
 BEFORE INSERT ON global_dictionary_book_sense_bindings
 BEGIN
  SELECT CASE WHEN COALESCE((SELECT status FROM books WHERE id=NEW.book_id),'missing')!='draft'
   THEN RAISE(ABORT,'BOOK_SENSE_BINDING_DRAFT_ONLY') END;
  SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM global_dictionary_book_bindings b
   WHERE b.book_id=NEW.book_id AND b.chapter_id=NEW.chapter_id
    AND b.context_anchor=NEW.context_anchor AND b.entry_id=NEW.entry_id
  ) THEN RAISE(ABORT,'BOOK_SENSE_BINDING_ENTRY_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM global_dictionary_senses s
   WHERE s.sense_id=NEW.sense_id AND s.entry_id=NEW.entry_id
     AND s.approved=1 AND s.active=1
  ) THEN RAISE(ABORT,'BOOK_SENSE_BINDING_NOT_APPROVED') END;
 END;
