# D1 /api/ops/import/coverage production hotfix gate — 2026-11-15

## Verified incident

- The production Publisher preview (deployed 2026-11-14) auto-issued `/api/ops/import/coverage`.
- Cloudflare D1 Query Insights: 8 heavy `SELECT DISTINCT w.headword, b.id=? AS is_replaced` queries scanned **6.63M rows**, largely due to joining `chapter_words` with the double JSON hierarchy `paragraphs → segments` over all published books.
- The **novel upload itself is not the source**. The per-novel *automated whole-shelf vocabulary coverage* step is.
- Other current 1.33M + 1.31M SQL aggregates are separate evidence and still warrant elimination/batching. This emergency fix only blocks the specific preview endpoint.
- **Cloudflare is authoritative**: the current production worker and static Publisher assets differ from historical GitHub branches. Never deploy a previous branch wholesale.

## Change scope

1. Remove the Publisher preview's automatic all-shelf coverage request in a later synchronized frontend-only release. Preview instead says: “全书架覆盖率将在整批发布后统一复核”.
2. The immediate **server-side kill switch** is a guard at the top of the actual production Worker fetch handler:

```javascript
if (new URL(request.url).pathname.replace(/\/+$/, "") === "/api/ops/import/coverage") {
  return new Response(JSON.stringify({
    error: "COVERAGE_PREVIEW_DISABLED",
    message: "单本预览不再自动扫描全书架；整批发布后统一复核。"
  }), {
    status: 410,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
```

This is intentionally **before** any entitlement/OPS authentication, D1 binding or old handler dispatch. It discloses no protected data. The target path includes query string or an optional trailing slash.

3. All other APIs, chapter rights, editorial preflights and sale/order logic remain byte-for-byte unchanged.

## Candidate assets in this PR

- `src/worker.js`: reference fail-closed guard on **old** Git branch, **never directly deploy**.
- `scripts/prepare-live-coverage-410.mjs`: local-only patch that requires the SHA256 of an independently downloaded live script; checks one unambiguous Worker fetch handler and coverage endpoint, injects only guard bytes, fails on mismatches or syntax errors, preserves all other bytes.
- `tests/d1-legacy-coverage-410.test.mjs` and `tests/d1-live-coverage-patch.test.mjs`: no-D1 proof and exact insertion proof.
- `.github/workflows/d1-coverage-live-worker-readonly.yml`: protected Cloudflare API GET-only workflow, **no source artifacts, no D1 query, no production writes**, pending approval in GitHub Actions.

## Publish conditions (do not skip)

- [ ] Owner approves the read-only workflow `production-d1-readonly-approval`; it verifies the current single deployed Worker version and source hash. The snapshot is PRIVATE and destroyed after checks. Do not paste credentials into chat.
- [ ] Validate **actual** running Pages frontend binds to the production Worker (`PRODUCTION_ORIGIN`), not a stale release. Compare the currently served Publisher assets and record their hashes/version IDs.
- [ ] Reconcile Cloudflare current Worker source with a Git-tracked production baseline. The old Git branch and `/private/tmp/miaowu-coverage-prod` must never become the source of an unreviewed full production deploy.
- [ ] Compare current live module against exact-hash one-insertion patch. If file is a multipart module/has multiple fetch handlers or versions, halt and reconstruct exact source/metadata first.
- [ ] Preserve D1 binding, service bindings, ASSETS, Secrets, compatibility date, routes, static assets, and deployed Worker version metadata.
- [ ] Run production-config checks, the two targeted tests, full `npm test`, dry-run, preview API/OPS/reading/bookmark/sales smoke tests.
- [ ] Deploy only the reviewed changed Worker *after explicit release approval* and verify version ID. **Do not run SQL migration**.
- [ ] Verify HTTP 410 for old `/api/ops/import/coverage` **only after confirmed cutover** to avoid accidentally initiating another expensive query; confirm `Rows read` no longer rises on Publisher previews. Check both 24-hour rolling total and new timestamp-specific metrics.
- [ ] Separately replace the Publisher frontend automatic request with a non-error message and implement one-off offline/batch-only coverage reporting.
- [ ] Record production deployment ID, previous version ID, SHA256 and resource config snapshot for rollback. Do not rollback to a version with the expensive coverage path without an interim block.

### Why not ship PR #294 or the historical release branch?

Neither is the authoritative deployed production Worker that gained the automatic coverage route on November 14. PR #294 includes unrelated bookshelf/word-list performance proposals; shipping it without a diff gate risks live feature regressions. This PR intentionally isolates the 410 guard and live snapshot workflow.
