import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "../scripts/build-rainy-night-echo-review-pack.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const para=(ch,index)=>bundle.chapters.find(x=>x.number===ch).paragraphs[index-1]
 .segments.map(s=>s.text??s.surface).join("");
test("S68 chapter seven cannot depart the archive or read proof before the evidence is supplied",()=>{
 assert.match(para(7,27),/仍坐在阅览桌边.*即使今天获得一条 recent 线索/);
 assert.doesNotMatch(para(7,27),/走出馆门后|那张几周前的签名放回文件袋/);
 assert.match(para(7,28),/从夹层里取出一张最近的复印件/);
 assert.match(para(7,29),/自愿提交的笔录 transcript/);
 assert.match(para(7,32),/阅览室另一边，一位母亲正带着孩子来借书/);
 assert.doesNotMatch(para(7,32),/离开阅览室时/);
 assert.match(para(7,34),/把阅览桌上的笔记重新翻到开头/);
 assert.doesNotMatch(para(7,34),/回程的公交车|别怪周砚/);
 assert.match(para(7,35),/帮我 contact 她/);
 assert.match(para(7,36),/她写了很久/);
 assert.match(para(7,37),/离开图书馆前.*维持|离开图书馆前/);
 assert.match(para(7,37),/获准带走的笔录复印件背面.*别怪周砚/);
 assert.equal([27,28,29,30,31,32,33,34,35,36,37]
  .filter(i=>para(7,i).includes("别怪周砚")).length,1);
});
test("S68 epilogue has one continuing shop operation, not a second reopening months later",()=>{
 assert.match(para(12,26),/三个月后，书店重新开设了周末朗读活动/);
 assert.match(para(12,27),/几个月后，社区公布补录完成的第一批名单/);
 assert.match(para(12,28),/书店依旧照常迎客/);
 assert.doesNotMatch(para(12,28),/重新开门迎客/);
 assert.match(para(12,28),/不再是需要守候的特殊时刻/);
});
test("S68 five corrections preserve target word references, questions and release safety",()=>{
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(buildRainyNightOccurrenceReview(bundle).overview.occurrenceCount,733);
 const echo=buildEchoReviewPack(bundle);
 assert.equal(echo.total,36);
 assert.ok(echo.questions.every(x=>x.reviewStatus==="EDITORIAL_NOT_APPROVED"&&!x.forCloudUse));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
