import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const para=(ch,no)=>bundle.chapters.find(x=>x.number===ch).paragraphs[no-1]
 .segments.map(s=>s.text??s.surface).join("");

test("S61 opening 2-chapter bilingual passages avoid forced wording and ungrounded deductions",()=>{
 const cases=[
 [1,5,"细节听起来很 familiar，也不足以据此 confirm 姐姐的行踪","记忆再 familiar"],
 [1,8,"那行字看起来格外 familiar","familiar 感"],
 [1,23,"recognize 这正是信里警告过的试探","recognize 了姐姐的名字"],
 [1,30,"你能 confirm 是谁让你来的吗","confirm 一下，是谁让你来的吗"],
 [2,28,"但这不能证明有人故意删改了数据","必定留下过另一份记录"],
 [2,32,"两个 separate 文件袋里","故意 separate 保存"]
 ];
 for(const [chapter,p,expected,old] of cases){
  const src=para(chapter,p);
  assert.ok(src.includes(expected),chapter+":"+p+" missing correction");
  assert.ok(!src.includes(old),chapter+":"+p+" retains old misstatement");
 }
 assert.match(para(2,32),/不知道这是不是有人刻意安排/);
 assert.match(para(2,28),/先找到当年的纸本登记/);
});
test("S61 pilot copy changes leave actual review inventory intact and strictly unpublished",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.ok(echo.questions.every(q=>q.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!q.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
 assert.equal(gate.productionDbTouched,false);
});
