-- APPLY ONLY to a freshly created, separately audited PRODUCTION D1 database.
-- NEVER apply automatically to miaowu-english-test (it has repeated QA order labels).
-- A confirmed external order buys exactly ONE category voucher in V1.
-- Database-level uniqueness prevents reimporting or issuing two vouchers per order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_codes_one_paid_order
  ON activation_codes(order_reference)
  WHERE order_reference IS NOT NULL;
