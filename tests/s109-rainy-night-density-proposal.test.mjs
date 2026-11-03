import test from "node:test";
import assert from "node:assert/strict";
import {buildHighDensityChapterOneProposal} from "../scripts/rewrite-rainy-night-ch01-density-proposal.mjs";
test("S109 chapter-one revised draft has 36 fully-anchored bilingual paragraphs without production writes",()=>{
 const {chapter,report}=buildHighDensityChapterOneProposal();
 assert.equal(chapter.id,"rns1-ch01");
 assert.equal(chapter.paragraphs.length,36);
 assert.equal(report.originalAnchors,64);
 assert.ok(report.addedAnchors>=80);
 assert.ok(report.averagePerParagraph>=3);
 assert.ok(report.per100Han>=5);
 assert.equal(report.productionD1Touched,false);
 assert.ok(report.privateReviewRequired);
 console.log("RAINY_NIGHT_CH01_DENSITY_PROPOSAL "+JSON.stringify(report));
 for(const p of chapter.paragraphs){
  const text=p.segments.map(s=>s.text??s.surface).join("");
  assert.ok(text.length>30);
  assert.ok(!text.includes("[["));
  assert.ok(p.segments.filter(s=>s.wordId).length>=3);
 }
});
