-- WordLetter V1.1 P2: independent user bookmarks; reading status remains in reading_progress.
CREATE TABLE IF NOT EXISTS user_bookmarks (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,book_id)
);
CREATE INDEX IF NOT EXISTS ix_user_bookmarks_book ON user_bookmarks(book_id);
