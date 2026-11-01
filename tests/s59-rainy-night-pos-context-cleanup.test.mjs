import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const actualText=(chapter)=>bundle.chapters.find(x=>x.number===chapter).paragraphs.map(
 p=>p.segments.map(s=>s.text??s.surface).join("")).join("\n");
const cases=[
 [2,"当年做出了一个错误的 choice","做错过一个 choice"],
 [2,"旧卡上的年份看起来 accurate","年份十分 accurate"],
 [3,"还有新的 clue 值得查","引导新的 clue"],
 [5,"一条 missing 记录本该出现在这里","一条 missing 的记录"],
 [3,"第一封 original 信件","第一封信的 original"],
 [6,"核对 original 纸本","核对 original，却"],
 [6,"preserve 你拿到的 original 信件","preserve 你拿到的 original。"],
 [9,"第一次 contact 值班人员的经过","最早的一次 contact"],
 [9,"每次 distribute 物资后留下的记录","每一次 distribute 物资的记录"],
 [9,"independent 核查员复核","independent 人员复核"],
 [9,"写明今后该如何 contact 他","注明日期和 contact 方式"],
 [9,"通过获授权的渠道 contact 姐姐","合法的 contact 渠道"],
 [7,"original 纸本的去向","纸本 original 去向"],
 [9,"保留录音的 original 文件","保留文件的 original，"],
 [11,"核对 original 纸本就完成扫描","核对 original 就完成扫描"],
 [12,"original 文件不该被私人反复搬动","original 不该被私人反复搬动"]
];
test("S59 fixes sixteen high-confidence POS/sense problems in actual original story contexts",()=>{
 assert.equal(cases.length,16);
 for(const [chapter,expected,stale] of cases){
  const text=actualText(chapter);
  assert.ok(text.includes(expected),"chapter "+chapter+" missing natural source: "+expected);
  assert.ok(!text.includes(stale),"chapter "+chapter+" retained awkward source: "+stale);
 }
});
test("S59 changed language only: no word IDs, occurrence loss or automatic commercial publication",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 const occurrences=buildRainyNightOccurrenceReview(bundle);
 assert.equal(occurrences.overview.occurrenceCount,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.equal(echo.questions.filter(x=>x.reviewStatus!=="EDITORIAL_NOT_APPROVED").length,0);
 assert.equal(echo.questions.filter(x=>x.forCloudUse).length,0);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
