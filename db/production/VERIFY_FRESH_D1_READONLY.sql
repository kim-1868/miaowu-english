-- MIAOWU ENGLISH production D1 read-only verification.
-- Run AFTER db/production/BOOTSTRAP_NEW_EMPTY_D1.sql has completed successfully.
-- Must select 'miaowu-english-prod' and visually confirm D1 database UUID:
-- 649c71b3-340c-49bf-b806-3d39256851d3
-- Cloudflare D1 has a reserved internal _cf_KV table; count it separately.
-- Expected AFTER bootstrap: 22 app tables; 23 total including _cf_KV.
SELECT COUNT(*) AS application_table_count
FROM sqlite_master
WHERE type='table' AND name NOT LIKE 'sqlite_%'
  AND name <> '_cf_KV';
SELECT COUNT(*) AS d1_internal_cf_kv_count
FROM sqlite_master
WHERE type='table' AND name='_cf_KV';
SELECT slug,title,is_visible
FROM categories ORDER BY slug;
SELECT
 (SELECT COUNT(*) FROM users) AS user_count,
 (SELECT COUNT(*) FROM activation_codes) AS voucher_count,
 (SELECT COUNT(*) FROM books) AS book_count,
 (SELECT COUNT(*) FROM account_recovery) AS recovery_count,
 (SELECT COUNT(*) FROM ops_operators) AS operator_count;
SELECT name,type
FROM sqlite_master
WHERE name IN (
 'uq_activation_codes_one_paid_order',
 'account_recovery',
 'ops_book_insert_version',
 'ops_audit_no_delete'
)
ORDER BY name;
