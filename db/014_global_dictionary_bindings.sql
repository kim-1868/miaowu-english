-- A3.2 isolated, STAGING-ONLY candidate binding manifests, never publication.
-- Requires separate preview D1 migration authorization. No modifications to books,
-- words, chapter_words, user_words, review_events or entitlements.
CREATE TABLE IF NOT EXISTS global_dictionary_binding_manifests (
 request_id TEXT PRIMARY KEY,
 book_id TEXT NOT NULL,
 category_id TEXT NOT NULL,
 package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64),
 binding_sha256 TEXT NOT NULL CHECK(length(binding_sha256)=64),
 bindings_json TEXT NOT NULL CHECK(json_valid(bindings_json)),
 total_occurrences INTEGER NOT NULL CHECK(total_occurrences>0 AND total_occurrences<=10000),
 actor_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'candidate' CHECK(status='candidate'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(book_id,package_sha256,binding_sha256)
);
CREATE INDEX IF NOT EXISTS global_dictionary_binding_manifests_book
 ON global_dictionary_binding_manifests(book_id,created_at);
