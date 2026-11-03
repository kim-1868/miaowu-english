import test from "node:test";
import assert from "node:assert/strict";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";
test("S111 entire Rainy Night 12 chapter density proposal remains paid-only, editable and unapproved",()=>{
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 assert.equal(draft.chapters.length,12);
 assert.equal(draft.words.length,188);
 assert.equal(report.originalAnchors,733);
 assert.equal(report.freePreviewCount,0);
 assert.equal(report.allChaptersEntitled,true);
 assert.equal(report.canPublish,false);
 assert.equal(report.productionD1Touched,false);
 assert.ok(report.proposalAnchors>report.originalAnchors);
 assert.ok(report.addedAnchors>1000);
 assert.ok(draft.chapters.every(c=>!c.preview));
 console.log("RAINY_NIGHT_FULL_12_CHAPTER_DENSITY "+JSON.stringify(report));
});
