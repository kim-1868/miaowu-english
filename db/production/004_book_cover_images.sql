-- Incremental, production-safe book cover storage. Apply to production D1 before
-- uploading covers. This does not modify existing book, account or progress rows.
-- Covers up to 750 KiB are stored as original validated binary image bytes.
-- For larger inventories/high traffic migrate covers to R2 later.
CREATE TABLE IF NOT EXISTS book_cover_images (
 book_id TEXT PRIMARY KEY NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 image_bytes BLOB NOT NULL CHECK(length(image_bytes)>0 AND length(image_bytes)<=768000),
 checksum TEXT NOT NULL CHECK(length(checksum)=64),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
