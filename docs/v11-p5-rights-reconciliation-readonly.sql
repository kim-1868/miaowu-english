-- WordLetter V1.1 P5: aggregate, read-only order/activation/rights consistency audit.
-- Requires existing activation_codes, entitlements, users, self_service_claims.
-- Run on VERIFIED staging D1 or a local private, audited production backup only.
-- Do NOT run with raw order/user export; results contain counts, never identifiers.
-- These are indicators for human review, NOT automatic revocation/restoration.
SELECT 'active_grant_revoked_source' AS metric, COUNT(*) AS affected
 FROM entitlements e JOIN activation_codes a ON a.id=e.source_code_id
 WHERE e.revoked_at IS NULL AND a.status='revoked'
UNION ALL
SELECT 'active_grant_nonredeemed_source',COUNT(*)
 FROM entitlements e JOIN activation_codes a ON a.id=e.source_code_id
 WHERE e.revoked_at IS NULL AND a.status<>'redeemed'
UNION ALL
SELECT 'grant_owner_mismatch',COUNT(*)
 FROM entitlements e JOIN activation_codes a ON a.id=e.source_code_id
 WHERE a.redeemed_by IS NOT NULL AND a.redeemed_by<>e.user_id
UNION ALL
SELECT 'grant_category_mismatch',COUNT(*)
 FROM entitlements e JOIN activation_codes a ON a.id=e.source_code_id
 WHERE a.category_id<>e.category_id
UNION ALL
SELECT 'redeemed_code_without_live_matching_grant',COUNT(*)
 FROM activation_codes a
 WHERE a.status='redeemed' AND a.redeemed_by IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM entitlements e WHERE e.source_code_id=a.id
    AND e.category_id=a.category_id AND e.user_id=a.redeemed_by
    AND e.revoked_at IS NULL)
UNION ALL
SELECT 'redeemed_code_without_reader',COUNT(*)
 FROM activation_codes a WHERE a.status='redeemed' AND a.redeemed_by IS NULL
UNION ALL
SELECT 'unused_code_with_reader',COUNT(*)
 FROM activation_codes a WHERE a.status='unused' AND a.redeemed_by IS NOT NULL
UNION ALL
SELECT 'verified_claim_on_revoked_code',COUNT(*)
 FROM self_service_claims s JOIN activation_codes a ON a.id=s.code_id
 WHERE s.review_status='verified' AND a.status='revoked';
