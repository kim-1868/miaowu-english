import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightTeachingTrackPlan} from "../scripts/plan-rainy-night-teaching-tracks.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";

test("S38 a dozen real chapters yield 36 grounded private fill-in-the-word Echo review candidates",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const result=buildEchoReviewPack(bundle);
 assert.equal(result.status,"PRIVATE_EDITORIAL_REVIEW_ONLY");
 assert.equal(result.total,36);
 assert.equal(result.chapterCount,12);
 assert.equal(result.independentWords,36);
 assert.equal(result.questionsPerChapter,3);
 assert.equal(result.releaseAllowed,false);
 assert.deepEqual([...new Set(result.questions.map(q=>q.chapterNo))],
  [1,2,3,4,5,6,7,8,9,10,11,12]);
 const allowed=new Set(buildRainyNightTeachingTrackPlan(bundle).rows.filter(
  x=>x.track==="CET4_FORM_CANDIDATE").map(x=>x.wordId));
 for(const q of result.questions){
  const chapter=bundle.chapters.find(c=>c.id===q.chapterId);
  assert.ok(chapter);
  assert.ok(allowed.has(q.wordId),"Story Echo must not mislabel CET6 or story vocabulary as core CET4");
  assert.equal(chapter.paragraphs[q.paragraphNo-1].segments[q.segmentNo-1].wordId,q.wordId);
  assert.ok(q.blankContext.includes("______"));
  assert.ok(!q.blankContext.includes(q.headword));
  assert.equal(q.correctAnswer,q.headword);
  assert.equal(q.reviewStatus,"EDITORIAL_NOT_APPROVED");
  assert.equal(q.forCloudUse,false);
 }
});
test("S38 queued questions contain no invented distractors or official pronunciation claims",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const r=buildEchoReviewPack(bundle);
 assert.ok(r.questions.every(q=>q.originalContext.length>40));
 assert.ok(r.questions.every(q=>q.correctAnswer.length>=3));
 assert.ok(r.questions.every(q=>!Object.hasOwn(q,"phonetic")&&!Object.hasOwn(q,"distractors")));
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
});
