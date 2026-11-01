import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const at=(ch,p)=>bundle.chapters.find(x=>x.number===ch).paragraphs[p-1]
 .segments.map(s=>s.text??s.surface).join("");
test("S71 one observed partial receipt number remains partial across both chapter boundary scenes",()=>{
 assert.match(at(2,38),/准确说出了那张归还单编号的前半段/);
 assert.match(at(3,1),/说出了归还单编号的前半段/);
 assert.match(at(3,2),/数字前缀，后面四位才是单据序号/);
 assert.match(at(3,4),/无法说出是谁签收/);
 assert.doesNotMatch(at(2,38),/说出了那张归还单的编号/);
 assert.doesNotMatch(at(3,1),/说出了归还单的编号/);
});
test("S71 unsigned and independent verification requirements are not overridden by inferred proof",()=>{
 const source=at(7,31);
 assert.match(source,/复印件尚未核验真伪/);
 assert.match(source,/不能据此证明姐姐此刻安全/);
 assert.match(source,/recent 文件的取得渠道/);
 assert.match(source,/向负责转递的机构 verify/);
 assert.doesNotMatch(source,/已经足以推翻/);
});
test("S71 story consistency edits do not add anchors or promote unapproved exercise products",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.ok(echo.questions.every(q=>q.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!q.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
