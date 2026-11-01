import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const words=new Map(bundle.words.map(x=>[x.headword,x]));
const target={
 anonymous:["The letter came from an anonymous sender.","那封信来自一名匿名寄件人。"],
 confirm:["The security footage could confirm when he entered the shop.","监控录像可以证实他何时走进了店里。"],
 indicate:["The reference number might indicate where the old records were stored.","那个参考编号可能表明旧记录存放在哪里。"],
 maintain:["They had to maintain accurate records of every delivery.","他们必须准确记录每一次物资交付。"],
 recent:["A recent signature suggested that her sister might still be alive.","一处近期留下的签名表明，姐姐可能还活着。"],
 transcript:["The witness signed the interview transcript last week.","证人上周在那份访谈记录上签了名。"],
 threaten:["Someone threatened to expose the witnesses' names.","有人威胁要公开证人的姓名。"]
};
test("S55 seven plot-specific examples have well aligned natural English and Chinese",()=>{
 assert.equal(Object.keys(target).length,7);
 for(const [headword,[en,zh]] of Object.entries(target)){
  const w=words.get(headword);
  assert.ok(w,"Missing story word "+headword);
  assert.equal(w.exampleEn,en,headword);
  assert.equal(w.exampleZh,zh,headword);
 }
 assert.deepEqual(words.get("duration").collocations[0],
  {en:"the duration of the outage",zh:"停电持续时间"});
 assert.deepEqual(words.get("maintain").collocations[0],
  {en:"maintain accurate records",zh:"保留准确记录"});
 assert.deepEqual(words.get("threaten").collocations[0],
  {en:"threaten to expose a witness",zh:"威胁要曝光证人的身份"});
});
test("S55 metadata revisions preserve live story anchors and all commercial release blocks",()=>{
 const contexts=buildRainyNightOccurrenceReview(bundle);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(contexts.overview.occurrenceCount,733);
 assert.equal(echo.questions.length,36);
 assert.ok(bundle.book.id.startsWith("draft-"));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
});
