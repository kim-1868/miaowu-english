import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const {bundle}=composeRainyNightSeasonDraft();
const questions=buildEchoReviewPack(bundle).questions;
const find=(chapter,headword)=>{
 const q=questions.find(x=>x.chapterNo===chapter&&x.headword===headword);
 assert.ok(q,"Missing story-anchored Echo question for "+chapter+":"+headword);
 const source=bundle.chapters.find(x=>x.number===chapter).paragraphs[q.paragraphNo-1];
 assert.equal(source.segments[q.segmentNo-1].surface,headword);
 return {q,paragraph:q.originalContext};
};
test("S56 six anchor-specific Echo contexts use natural semantics and preserve original answers",()=>{
 const checks=[
  [2,"identity","请出示能证明你 identity 的证件","请留下你的 identity 证明"],
  [4,"official","official 受理记录上的通话时间","official 通话时间"],
  [6,"negative","negative（底片）与冲印照片明暗相反","黑白底片像一张 negative"],
  [7,"contact","姐姐何时最后一次 contact 家人","姐姐最后一次 contact 家人的时间"],
  [10,"decision","做出一个艰难的 decision","做一个 decision"],
  [10,"privacy","录音涉及姐姐的 privacy","录音属于姐姐的 privacy"],
  [11,"seal","封存条放进保护套，给他们看上面完整的 seal","封条上的 seal 与自己手里的回执编号一致"]
 ];
 for(const [chapter,word,expected,banned] of checks){
  const {paragraph,q}=find(chapter,word);
  assert.ok(paragraph.includes(expected),chapter+":"+word+" not naturalized");
  assert.ok(!paragraph.includes(banned),chapter+":"+word+" retains unsafe wording");
  assert.equal(q.correctAnswer,word);
  assert.equal(q.reviewStatus,"EDITORIAL_NOT_APPROVED");
  assert.equal(q.forCloudUse,false);
 }
});
test("S56 typo cleanup and narrative edit cannot change original story corpus count or paid-release gate",()=>{
 const ch6=bundle.chapters.find(x=>x.number===6);
 const all=ch6.paragraphs.flatMap(x=>x.segments).map(s=>s.text??s.surface).join("");
 assert.ok(all.includes("由另一位独立的核查者核实"));
 assert.ok(!all.includes("由另一位人核实"));
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 assert.equal(questions.length,36);
 assert.deepEqual([...new Set(questions.map(q=>q.chapterNo))],[1,2,3,4,5,6,7,8,9,10,11,12]);
 assert.equal(new Set(questions.map(q=>q.wordId)).size,36);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
});
