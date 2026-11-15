-- 2026-11-15: D1 index candidate only. DO NOT EXECUTE on production.
-- EXPLAIN on a synthetic baseline schema showed /api/books category listing
-- "SCAN b USING INDEX sqlite_autoindex_books_1", while after the index it
-- showed "SEARCH b USING INDEX ix_books_category_status_sort (...)".
-- Actual production index existence, row counts and Cloudflare Insights MUST
-- be checked before scheduling any migration.
--
-- Staging validation: EXPLAIN QUERY PLAN SELECT ... FROM books b
-- JOIN categories c ON c.id=b.category_id
-- WHERE c.slug=? AND c.is_visible=1 AND b.status='published'
-- ORDER BY b.sort_order,b.id LIMIT 9 OFFSET 0;
--
-- Candidate (NOT automatically applied):
CREATE INDEX IF NOT EXISTS ix_books_category_status_sort
 ON books(category_id,status,sort_order,id);
