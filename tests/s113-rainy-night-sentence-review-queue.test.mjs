import test from "node:test";
import assert from "node:assert/strict";
import {buildRainyNightSentenceReviewQueue} from "../scripts/build-rainy-night-private-sentence-review.mjs";
import {buildRainyNightFullDensityReviewDraft} from "../scripts/assemble-rainy-night-high-density-review-draft.mjs";
test("S113 exactly fingerprinted sentence QA queue is private and never passes publication automatically",()=>{
 const x=buildRainyNightSentenceReviewQueue();
 const {report}=buildRainyNightFullDensityReviewDraft();
 assert.equal(x.bookId,"rainy-night-archives-cet4-v1");
 assert.match(x.sourceDigest,/^[a-f0-9]{64}$/);
 assert.equal(x.chapters,12);
 assert.equal(x.wordCount,188);
 assert.equal(x.reviewRows.length,report.sentenceViolations);
 assert.equal(x.totalIssues,x.low+x.high);
 assert.equal(x.chapterSummary.length,12);
 assert.equal(x.allowedToPublish,false);
 assert.equal(x.productionD1Touched,false);
 assert.ok(x.reviewRows.every(p=>p.reviewed===false&&p.textForPrivateReview.length>=25));
 assert.equal(new Set(x.reviewRows.map(x=>x.id)).size,x.reviewRows.length);
 console.log("RAINY_NIGHT_PRIVATE_SENTENCE_QA_COUNTS "+JSON.stringify({
  totalIssues:x.totalIssues,low:x.low,high:x.high,zeroEnglish:x.zeroEnglishLongSentences,
  chapterSummary:x.chapterSummary
 }));
});
