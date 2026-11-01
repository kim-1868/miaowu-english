-- READ-ONLY / SCREENSHOT-SAFE: Run against miaowu-english-test ONLY.
-- Confirm result rows; no user data, activation codes or secrets returned.
-- Do NOT run migrations or schema changes yet.
SELECT '001.users' AS check_name,
  CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='users') THEN 'present' ELSE 'missing' END AS status
UNION ALL
SELECT '001.books',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='books') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '001.chapters',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='chapters') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '004.word_categories',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='word_categories') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '005.editorial_revisions',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='editorial_revisions') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '006.editorial_review_signoffs',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='editorial_review_signoffs') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '007.ops_operators',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ops_operators') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '008.ops_publication_approvals',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ops_publication_approvals') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT '008.books.last_release_request_id',CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('books') WHERE name='last_release_request_id') THEN 'present' ELSE 'missing' END
UNION ALL
SELECT 'd1_migrations',CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations') THEN 'present' ELSE 'missing' END;
