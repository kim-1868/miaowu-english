-- B1.1 STAGING-ONLY explicit review links between historical words and canonical dictionary cards.
-- This table is additive, does not overwrite words.id, user_words, review_events,
-- user access rights, chapter_words, or existing spaced-repetition schedules.
CREATE TABLE IF NOT EXISTS global_dictionary_legacy_links (
 legacy_word_id TEXT PRIMARY KEY REFERENCES words(id),
 entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
 reviewed_by TEXT NOT NULL CHECK(length(trim(reviewed_by))>0),
 reviewed_at TEXT NOT NULL CHECK(length(trim(reviewed_at))>0),
 review_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_legacy_links_entry
 ON global_dictionary_legacy_links(entry_id);
-- An approved link must be rechecked against the current dictionary's licensing,
-- enabled state, and reviewed lesson at read-time before it can be trusted.
-- Never use this index alone as evidence that a user owns a paid exam category.
