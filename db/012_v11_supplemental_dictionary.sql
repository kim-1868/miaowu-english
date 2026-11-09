-- V1.1 P5: isolated supplemental dictionary. No existing words or user learning state changes.
CREATE TABLE IF NOT EXISTS supplemental_dictionary (
 word TEXT PRIMARY KEY COLLATE NOCASE,
 phonetic TEXT,
 pos TEXT,
 translation_zh TEXT NOT NULL,
 source TEXT NOT NULL,
 source_version TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(length(word)>0 AND length(word)<=64),
 CHECK(length(translation_zh)>0 AND length(translation_zh)<=600)
);
CREATE INDEX IF NOT EXISTS idx_supplemental_dictionary_source ON supplemental_dictionary(source);
