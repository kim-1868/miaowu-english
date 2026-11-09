-- A2 optional staging-only dictionary lookup storage. NEVER execute on production
-- without separate approval, backup and a rollout plan. The tables are additive:
-- no historical words, chapter_words, user_words, review_events or entitlements change.
CREATE TABLE IF NOT EXISTS global_dictionary_entries (
 entry_id TEXT PRIMARY KEY,
 headword TEXT NOT NULL UNIQUE COLLATE NOCASE,
 exam_levels_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(exam_levels_json)),
 source_name TEXT NOT NULL,
 source_ipa_unverified TEXT,
 source_pos_unverified TEXT,
 source_translation_unverified TEXT,
 teaching_ready INTEGER NOT NULL DEFAULT 0 CHECK(teaching_ready IN (0,1)),
 reviewed_at TEXT,
 CHECK(teaching_ready=0 OR reviewed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS global_dictionary_entries_teaching
 ON global_dictionary_entries(teaching_ready,headword);

-- One surface spelling may refer to multiple dictionary headwords.
-- Only explicit editorial signoff can make a non-exact alias auto-matchable.
CREATE TABLE IF NOT EXISTS global_dictionary_forms (
 form TEXT NOT NULL COLLATE NOCASE,
 entry_id TEXT NOT NULL REFERENCES global_dictionary_entries(entry_id),
 source_name TEXT NOT NULL,
 reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1)),
 PRIMARY KEY(form,entry_id)
);
CREATE INDEX IF NOT EXISTS global_dictionary_forms_lemma
 ON global_dictionary_forms(entry_id);

CREATE TABLE IF NOT EXISTS global_dictionary_sources (
 source_key TEXT PRIMARY KEY,
 license_name TEXT NOT NULL,
 license_reviewed INTEGER NOT NULL DEFAULT 0 CHECK(license_reviewed IN (0,1)),
 source_sha256 TEXT NOT NULL,
 imported_entries INTEGER NOT NULL DEFAULT 0 CHECK(imported_entries>=0),
 imported_forms INTEGER NOT NULL DEFAULT 0 CHECK(imported_forms>=0),
 imported_at TEXT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 CHECK(enabled=0 OR (license_reviewed=1 AND imported_at IS NOT NULL))
);
