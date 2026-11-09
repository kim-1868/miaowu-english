-- A4.2 additive STAGING-ONLY binding overlay for imported DRAFT novels.
-- Does not replace chapter_words, words, user_words, or entitlement data.
CREATE TABLE IF NOT EXISTS global_dictionary_book_bindings (
 book_id TEXT NOT NULL REFERENCES books(id),
 chapter_id TEXT NOT NULL REFERENCES chapters(id),
 context_anchor TEXT NOT NULL,
 legacy_word_id TEXT NOT NULL REFERENCES words(id),
 entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
 source_request_id TEXT NOT NULL REFERENCES global_dictionary_binding_manifests(request_id),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (book_id,chapter_id,context_anchor)
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_bindings_entry
 ON global_dictionary_book_bindings(entry_id);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_bindings_request
 ON global_dictionary_book_bindings(source_request_id);

-- Guard the publish-vs-attach race even if book status changes after the
-- handler checks its initial draft snapshot.
CREATE TRIGGER IF NOT EXISTS global_dictionary_bindings_draft_guard
 BEFORE INSERT ON global_dictionary_book_bindings
 BEGIN
   SELECT CASE WHEN COALESCE(
     (SELECT status FROM books WHERE id=NEW.book_id),'missing')!='draft'
   THEN RAISE(ABORT,'GLOBAL_BINDING_REQUIRES_DRAFT_BOOK') END;
 END;
