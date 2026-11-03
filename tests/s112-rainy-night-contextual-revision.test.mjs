import test from "node:test";
import assert from "node:assert/strict";
import {buildChapters2to12DensityCandidate} from "../scripts/rewrite-rainy-night-ch02-ch12-density-proposal.mjs";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";
test("S112 contextual chapter 2–4 edits retain paid-only books and no unknown substitutions",()=>{
 const partial=buildChapters2to12DensityCandidate();
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 assert.equal(partial.report.unappliedExtraCount,0,"All carefully scoped phrase edits must apply");
 assert.equal(partial.report.chapterCount,11);
 assert.equal(report.chapters,12);
 assert.equal(report.words,188);
 assert.equal(report.originalAnchors,733);
 assert.ok(report.proposalAnchors>=1758);
 assert.ok(report.paragraphsBelowThree<69);
 assert.equal(report.allChaptersEntitled,true);
 assert.equal(report.freePreviewCount,0);
 assert.equal(report.productionD1Touched,false);
 assert.equal(report.reviewedByHuman,false);
 assert.equal(report.canPublish,false);
 for(const c of draft.chapters){
  assert.ok(c.paragraphs.length>=35);
  for(const p of c.paragraphs)assert.ok(p.segments.length>0);
 }
 console.log("RAINY_NIGHT_S112_CONTEXTUAL_REVIEW "+JSON.stringify({
   fullAnchors:report.proposalAnchors,underfilled:report.paragraphsBelowThree,
   sentenceViolations:report.sentenceViolations,
   perChapter:report.chapterStats.map(x=>({number:x.chapter,anchors:x.anchors,sentenceViolations:x.sentencesNeedingEdit})),
   unappliedExtras:partial.report.unappliedExtras
 }));
});
