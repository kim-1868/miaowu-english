import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const paragraph=(chapter,index)=>bundle.chapters.find(c=>c.number===chapter).paragraphs[index-1]
 .segments.map(s=>s.text??s.surface).join("");
test("S69 actual word contexts teach noun negative, adj recent, transcribed testimony and future",()=>{
 const cases=[
 [6,3,"胶片留下的 negative（底片）与冲印照片明暗相反","negative（负片）模式"],
 [7,29,"自愿提交、经授权保存的 transcript","笔录 transcript"],
 [7,30,"recent 签名记录","recent 的某个时间点"],
 [12,29,"认真思考自己的 future","望着窗外的 future"]
 ];
 for(const [ch,p,wanted,stale] of cases){
  const source=paragraph(ch,p);
  assert.ok(source.includes(wanted),"missing natural sense "+ch+":"+p+": "+wanted);
  assert.ok(!source.includes(stale),"stale forced phrasing "+ch+":"+p+": "+stale);
 }
 const n=bundle.words.find(x=>x.headword==="negative");
 assert.equal(n.partOfSpeech,"n.");
 const example=paragraph(6,3);
 assert.match(example,/模拟负片的显示模式/);
 assert.match(example,/不能凭空补出原片不存在的细节/);
});
test("S69 corrects premature evidence certainty, chapter 7 room flashback and misplaced consequence",()=>{
 assert.match(paragraph(7,4),/等待邱老师时.*想起早晨馆门外/);
 assert.match(paragraph(7,30),/是否由她亲自签署.*都还需要向来源机构核实/);
 assert.match(paragraph(8,21),/反复倾诉自己的 guilt/);
 assert.doesNotMatch(paragraph(8,21),/承认 guilt/);
 assert.match(paragraph(8,34),/隐瞒错误带来的 consequence 是居民一直无法得到准确的答复/);
 assert.match(paragraph(8,37),/错误登记带来的 consequence：那些未能领到物资的人/);
 assert.match(paragraph(10,21),/与社区法律援助人员约好继续 cooperate/);
 assert.doesNotMatch(paragraph(10,21),/约好 cooperate，/);
});
test("S69 all original tagged words, chapter count and candidate exercises remain unchanged and blocked",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 const context=buildRainyNightOccurrenceReview(bundle);
 assert.equal(context.overview.occurrenceCount,733);
 assert.equal(context.overview.unreviewed,733);
 const q=buildEchoReviewPack(bundle);
 assert.equal(q.total,36);
 assert.ok(q.questions.every(e=>e.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!e.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
 assert.equal(gate.productionDbTouched,false);
});
