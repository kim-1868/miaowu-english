import {test} from "node:test";
import assert from "node:assert/strict";
import {codeSwitchPosRisk} from "../src/editorial-code-switch-lint.js";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOccurrenceReview} from "../scripts/review-rainy-night-word-contexts.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const detect=(partOfSpeech,before,after)=>codeSwitchPosRisk({partOfSpeech,before,after});
test("S60 flags previously seen verb-as-noun and adjective-without-head patterns",()=>{
 assert.deepEqual(detect("v.","最早的一次 "," 开始说。"),["CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER"]);
 assert.deepEqual(detect("v.","每一次 "," 物资的记录都清楚"),["CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER"]);
 assert.deepEqual(detect("v.","要求注明日期和 "," 方式。"),["CODE_SWITCH_VERB_IN_NOUN_MODIFIER_SLOT"]);
 assert.deepEqual(detect("adj.","他要求核对 ","，因为版本不同"),["CODE_SWITCH_ADJECTIVE_HEAD_NOUN_MISSING"]);
 assert.deepEqual(detect("adj.","一条 "," 的记录"),["CODE_SWITCH_ADJECTIVE_LINKER_REVIEW"]);
});
test("S60 avoids flagging corrected verb phrases and normal adjective predicates",()=>{
 const normal=[
 ["v.","当晚第一次 "," 值班人员的经过"],
 ["v.","工作人员每次 "," 物资后留下的记录"],
 ["v.","注明今后如何 "," 他"],
 ["adj.","核对 "," 纸本再扫描"],
 ["adj.","年份看起来 ","，月份却写错"],
 ["adj.","一条 "," 记录本该出现"],
 ["n.","她保存 ","，以备核查"]
 ];
 for(const [p,b,a] of normal)
  assert.deepEqual(detect(p,b,a),[],p+":"+b+" [[target]] "+a);
});
test("S60 all source occurrence flags remain private, auditable, non-certifying",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const review=buildRainyNightOccurrenceReview(bundle);
 assert.equal(review.rows.length,733);
 assert.equal(review.overview.unreviewed,733);
 assert.equal(review.overview.syntaxRiskFlagsAreReviewHintsOnly,true);
 for(const code of ["CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER",
  "CODE_SWITCH_VERB_IN_NOUN_MODIFIER_SLOT",
  "CODE_SWITCH_ADJECTIVE_HEAD_NOUN_MISSING",
  "CODE_SWITCH_ADJECTIVE_LINKER_REVIEW"]){
  assert.equal(typeof review.overview.flags[code],"number");
  assert.ok(review.overview.flags[code]>=0);
  assert.equal(review.overview.flags[code],
   review.rows.filter(r=>r.reviewFlags.includes(code)).length);
 }
 assert.ok(review.rows.every(r=>r.reviewStatus==="UNREVIEWED"&&r.verifiedBy===""));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.review.pendingOccurrences,733);
 assert.equal(gate.productionDbTouched,false);
});
