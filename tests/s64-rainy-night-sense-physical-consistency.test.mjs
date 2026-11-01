import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const textAt=(chapter,paragraph)=>bundle.chapters.find(x=>x.number===chapter).paragraphs[paragraph-1]
 .segments.map(s=>s.text??s.surface).join("");
test("S64 letter box stays outside in all opening scene clues",()=>{
 const src=textAt(2,3);
 assert.match(src,/旧信箱固定在店门外靠墙处/);
 assert.match(src,/积年的锈痕/);
 assert.doesNotMatch(src,/旧信箱挂在内侧墙上|锁孔下方积着一层薄灰/);
 assert.match(src,/作为之后可能需要的 record/);
});
test("S64 bookbinder arrival is not repeated and spine/reflect teach the stated word class",()=>{
 assert.match(textAt(5,4),/装帧铺的店门上贴着手写营业时间/);
 assert.doesNotMatch(textAt(5,4),/予安沿着巷子找到装帧铺时/);
 const ch5=bundle.chapters.find(x=>x.number===5);
 const spine=ch5.paragraphs.map(p=>p.segments.map(s=>s.text??s.surface).join("")).find(x=>x.includes("软尺测量"));
 assert.match(spine,/测量 spine 的宽度和厚度/);
 const reflectA=textAt(6,12),reflectB=textAt(6,14);
 assert.match(reflectA,/玻璃会 reflect 台灯的光/);
 assert.match(reflectB,/它会 reflect 灯光/);
 assert.doesNotMatch(reflectA,/被玻璃 reflect 出/);
 assert.doesNotMatch(reflectB,/产生 reflect/);
});
test("S64 timing, circumstance and cooperate occur in context-meaningful constructions",()=>{
 assert.match(textAt(8,1),/核对每份 evidence 出现的 timing，再按发生顺序排列/);
 assert.match(textAt(9,7),/逐个记录安置点当时的 circumstance/);
 assert.match(textAt(10,7),/愿意 cooperate，按程序向调查人员提供已核实的材料/);
 assert.doesNotMatch(textAt(10,7),/cooperate 调查/);
});
test("S64 prose revisions preserve 188 words, 733 exact anchors, 36 exercises and commercial block",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 const review=buildRainyNightOccurrenceReview(bundle);
 assert.equal(review.overview.occurrenceCount,733);
 assert.equal(review.overview.unreviewed,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.ok(echo.questions.every(q=>q.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!q.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
 assert.equal(gate.productionDbTouched,false);
});
