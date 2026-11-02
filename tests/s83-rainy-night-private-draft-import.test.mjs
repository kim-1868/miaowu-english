import {test} from "node:test";
import assert from "node:assert/strict";
import {buildRainyNightMemberDraftImport} from "../scripts/build-rainy-night-member-draft-import.mjs";

test("S83 complete Rainy Night is a safe private D1 draft SQL package, not a paid chapter leak",()=>{
 const {sql,summary}=buildRainyNightMemberDraftImport();
 assert.equal(summary.chapters,12);
 assert.equal(summary.words,188);
 assert.equal(summary.wordOccurrences,733);
 assert.equal(summary.publication,"draft-only");
 assert.equal(summary.readiness,"REVIEW_REQUIRED_NOT_FOR_SALE");
 assert.equal(summary.publicPreviewChapter,null);
 assert.equal(summary.categoryEntitlementForChapters,"1-12");
 assert.equal(summary.publisherCanRelease,false);
 assert.equal(summary.productionDbTouched,false);
 assert.equal(summary.sourceGateStatus,"BLOCKED");
 assert.equal(summary.remainingEditorial.pendingWordSense,188);
 assert.equal(summary.remainingEditorial.pendingOccurrences,733);
 assert.equal(summary.remainingEditorial.pendingEcho,36);
 assert.ok(sql.includes("INSERT OR IGNORE INTO books"));
 assert.ok(sql.includes("INSERT OR IGNORE INTO chapters"));
 assert.ok(!sql.includes("UPDATE books SET status="));
 assert.ok(!sql.includes("INSERT INTO entitlements"));
 assert.ok(!sql.includes("published_at=CURRENT_TIMESTAMP"));
 const blocks=sql.match(/INSERT OR IGNORE INTO chapters\(/g)||[];
 assert.equal(blocks.length,12);
});
