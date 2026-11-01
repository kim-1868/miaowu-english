import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightOfflineReviewDashboard} from "../scripts/build-rainy-night-review-dashboard.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const wordById=new Map(bundle.words.map(w=>[w.id,w]));
const pack=buildEchoReviewPack(bundle);
test("S65 every one of 36 actual Story Echo candidates now has usable bounded learner hints",()=>{
 assert.equal(pack.total,36);
 assert.equal(pack.independentWords,36);
 for(const q of pack.questions){
  const w=wordById.get(q.wordId);
  assert.ok(w);
  assert.equal(q.hintZh,w.meaningZh.split(/[；;]/)[0].trim());
  assert.ok(q.hintZh);
  assert.equal(q.firstLetter,q.correctAnswer[0]);
  assert.equal(q.answerLetterCount,q.correctAnswer.length);
  assert.equal(q.answerFormat,"LOWERCASE_ENGLISH_HEADWORD");
  assert.equal(q.uniqueAnswerConfirmed,false);
  assert.equal(q.reviewStatus,"EDITORIAL_NOT_APPROVED");
  assert.equal(q.forCloudUse,false);
  assert.ok(!q.blankContext.toLowerCase().includes(q.correctAnswer.toLowerCase()));
  const src=bundle.chapters.find(x=>x.id===q.chapterId).paragraphs[q.paragraphNo-1];
  assert.equal(src.segments[q.segmentNo-1].surface,q.correctAnswer);
 }
});
test("S65 offline editorial dashboard displays actual Chinese clues outside hidden answer details",()=>{
 const {html,summary}=buildRainyNightOfflineReviewDashboard(bundle);
 assert.equal((html.match(/data-kind="echo"/g)||[]).length,36);
 assert.equal((html.match(/题面提示（待核）：/g)||[]).length,36);
 assert.equal((html.match(/首字母 /g)||[]).length,36);
 assert.equal((html.match(/个英文字母<\/p>/g)||[]).length,36);
 assert.ok(html.includes("提示不代表唯一答案已经核实"));
 assert.ok(html.includes("connect-src &#39;none&#39;"));
 assert.equal(summary.reviewedQuestions,0);
 assert.equal(summary.published,false);
});
test("S65 answer aid does not certify words, approve exercises or open production",()=>{
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.review.pendingEcho,36);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
