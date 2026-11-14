-- A4.3 one canonical teaching lesson per dictionary headword.
-- These are separately reviewed, structured multi-sense teaching records.
-- Do not copy unverified ECDICT examples or automatically mark rows reviewed.
-- STAGING ONLY until copyright provenance, tests and rollback approved.
CREATE TABLE IF NOT EXISTS global_dictionary_lessons (
 entry_id TEXT PRIMARY KEY REFERENCES global_dictionary_entries(entry_id),
 headword TEXT NOT NULL,
 senses_json TEXT NOT NULL CHECK(json_valid(senses_json)),
 phonetic_uk TEXT NOT NULL,
 phonetic_us TEXT NOT NULL,
 part_of_speech TEXT NOT NULL,
 meaning_zh TEXT NOT NULL,
 example_en TEXT NOT NULL,
 example_zh TEXT NOT NULL,
 collocations_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(collocations_json)),
 reviewed_by TEXT NOT NULL,
 reviewed_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(length(trim(reviewed_by))>0),
 CHECK(length(trim(reviewed_at))>0)
);
CREATE INDEX IF NOT EXISTS ix_global_dictionary_lessons_headword
 ON global_dictionary_lessons(headword COLLATE NOCASE);
