import test from "node:test";
import assert from "node:assert/strict";
import {prepareReviewedRainyNightUpdate} from "../scripts/prepare-rainy-night-reviewed-d1-handoff.mjs";
import {reviewTemplate} from "../scripts/build-rainy-night-reviewed-ipa-patch.mjs";
import {buildRainyNightSentenceReviewQueue} from "../scripts/build-rainy-night-private-sentence-review.mjs";

// Synthetic MOCK fixture used only inside tests; never save it, never use
// as an actual human review or authorize commercial publishing.
function fakeTestOnlyApproval(){
 const ipaReview=reviewTemplate();
 for(const r of ipaReview.rows){
  r.phoneticUk="/ˈtɛst/";r.phoneticUs="/ˈtɛst/";
  r.ukProvenance=r.ukSourceCandidates.length?"BRITFONE_MIT":"INDEPENDENT_TRANSCRIPTION";
  r.usProvenance="IPA_DICT_MIT";
  r.reviewedBy="TEST_FAKE_NOT_PRODUCTION";
  r.reviewedAt="2026-11-03T00:00:00.000Z";
  r.evidenceRef="FAKE_TEST_NOT_REAL";
  r.reviewNote="SYNTHETIC FIXTURE. No real phonetic review or commercial license was conducted.";
  r.commercialUseConfirmed=true;
 }
 const queue=buildRainyNightSentenceReviewQueue();
 const sentenceReview={
  schema:"RAINY_NIGHT_HUMAN_SENTENCE_NOTES_V1",
  bookId:queue.bookId,sourceDigest:queue.sourceDigest,issuesTotal:queue.totalIssues,
  remaining:0,
  notes:Object.fromEntries(queue.reviewRows.map(r=>[r.id,{
   decision:"pass",note:"SYNTHETIC TEST PASS ONLY; this is not actual language proofreading.",
   editedAt:"2026-11-03T00:00:00.000Z"
  }]))
 };
 return {ipaReview,sentenceReview};
}
test("S118 incomplete or absent real review files cannot authorize import",()=>{
 assert.throws(()=>prepareReviewedRainyNightUpdate(),/188_IPA_REVIEW_NOT_VERIFIABLE/);
 const mock=fakeTestOnlyApproval();
 assert.throws(()=>prepareReviewedRainyNightUpdate({ipaReview:mock.ipaReview}),/STORY_REVIEW_FILE_MISSING_OR_STALE/);
 const partly=structuredClone(mock);
 partly.sentenceReview.notes["ch01-p01-s01"]={decision:"revise",note:"TEST_ONLY_THIS_NEEDS_REWRITE",editedAt:"2026-11-03T00:00:00.000Z"};
 assert.throws(()=>prepareReviewedRainyNightUpdate(partly),/STORY_REVIEW_HAS_UNRESOLVED_SENTENCES/);
 const stale=structuredClone(mock);
 stale.sentenceReview.sourceDigest="0".repeat(64);
 assert.throws(()=>prepareReviewedRainyNightUpdate(stale),/STORY_REVIEW_FILE_MISSING_OR_STALE/);
 const revoked=structuredClone(mock);
 revoked.ipaReview.rows[0].commercialUseConfirmed=false;
 assert.throws(()=>prepareReviewedRainyNightUpdate(revoked),/188_IPA_REVIEW_NOT_VERIFIABLE/);
});
test("S118 synthetic test fixture verifies only preflight shape, NEVER mutates D1",()=>{
 const validated=prepareReviewedRainyNightUpdate(fakeTestOnlyApproval());
 assert.equal(validated.summary.chapters,12);
 assert.equal(validated.summary.words,188);
 assert.equal(validated.summary.anchors,1892);
 assert.equal(validated.summary.sentenceReviewItemsVerified,337);
 assert.equal(validated.payload.expectedProductionState.existingChapterWordAnchors,733);
 assert.equal(validated.payload.reviewedChapters.every(ch=>ch.preview===false),true);
 assert.equal(validated.payload.reviewedWordPronunciations.length,188);
 assert.equal(validated.payload.productionD1Touched,false);
 assert.equal(validated.payload.publishAttempted,false);
 assert.match(validated.payload.releaseStage,/NOT_PUBLISHED/);
});
