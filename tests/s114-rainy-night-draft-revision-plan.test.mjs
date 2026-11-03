import test from "node:test";
import assert from "node:assert/strict";
import {prepareRainyNightDraftRevisionPlan} from "../scripts/prepare-rainy-night-versioned-draft-revision.mjs";
test("S114 versioned Rainy Night revision keeps all 12 chapter IDs and denies premature production changes",()=>{
 const p=prepareRainyNightDraftRevisionPlan();
 assert.equal(p.bookId,"rainy-night-archives-cet4-v1");
 assert.equal(p.category,"cet4");
 assert.equal(p.chapters,12);
 assert.equal(p.wordCount,188);
 assert.equal(p.sourceAnchors,733);
 assert.ok(p.proposedAnchors>=1892);
 assert.equal(p.allChapterPreviewFlagsFalse,true);
 assert.equal(p.chapterPlans.length,12);
 assert.equal(new Set(p.chapterPlans.map(c=>c.id)).size,12);
 assert.ok(p.chapterPlans.every(c=>c.approved===false&&c.wouldReplaceAnchorIndex===true));
 assert.ok(p.chapterPlans.every(c=>c.sourceContentJsonSha256.length===64));
 assert.ok(p.chapterPlans.every(c=>c.proposedContentJsonSha256.length===64));
 assert.ok(p.chapterPlans.some(c=>c.sourceContentJsonSha256!==c.proposedContentJsonSha256));
 assert.equal(p.releaseGate,"BLOCKED_UNTIL_REAL_EDITORIAL_AND_IPA_SIGNOFF");
 assert.equal(p.productionD1Touched,false);
 assert.equal(p.sqlGenerated,false);
 assert.equal(p.publishNow,false);
 assert.equal(p.migrationConditions.compareLiveContentFingerprintBeforeAnyWrite,true);
 for(const t of ["users","entitlements","activation_codes","user_words","reading_progress","review_events"])
  assert.ok(p.migrationConditions.preserveTables.includes(t));
 console.log("RAINY_NIGHT_DRAFT_REVISION_PLAN "+JSON.stringify({
  bookId:p.bookId,chapters:p.chapters,sourceAnchors:p.sourceAnchors,
  proposedAnchors:p.proposedAnchors,reviewPending:p.humanReviewOutstanding,
  productionD1Touched:p.productionD1Touched
 }));
});
