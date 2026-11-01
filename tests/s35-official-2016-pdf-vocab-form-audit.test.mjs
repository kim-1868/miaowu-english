import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {verifyOfficial2016FormAudit} from "../scripts/check-rainy-night-official-2016-form-audit.mjs";
import {checkRainyNightCET4Candidates} from "../scripts/check-rainy-night-cet4-candidates.mjs";

const source=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json",import.meta.url),"utf8"));

test("S35 exact 2016 CET PDF headword form audit has independently locatable page evidence for all 188 words",()=>{
 const {bundle}=composeRainyNightSeasonDraft(),result=verifyOfficial2016FormAudit(bundle);
 assert.equal(result.words,188);
 assert.equal(result.formMatchesCET4,172);
 assert.equal(result.counts.CET4_UNSTARRED_HEADWORD,168);
 assert.equal(result.counts.CET4_PRINTED_VARIANT,4);
 assert.equal(result.starredCET6,9);
 assert.equal(result.notStandalone,7);
 assert.equal(result.verifiedPosSenseIpa,0);
 assert.equal(result.releaseAllowed,false);
 assert.equal(source.sourcePages,215);
 assert.equal(source.sourceSha256.length,64);
 assert.ok(source.words.every(x=>x.pdfPage>=21&&x.pdfPage<=149&&x.bookPage===x.pdfPage-5));
 assert.ok(source.words.every(x=>x.posSenseIpaVerified===false));
 assert.ok(bundle.words.every(w=>w.verifiedCET4!==true));
});
test("S35 source ★ marked CET6 words are explicitly identified, even when in derivative family",()=>{
 const audit=verifyOfficial2016FormAudit(composeRainyNightSeasonDraft().bundle);
 assert.deepEqual(audit.priorityReview.filter(x=>x.formStatus==="CET6_STARRED_HEADWORD_OR_FAMILY")
  .map(x=>x.headword).sort(),
  ["allocation","anonymous","archive","disclose","discrepancy",
   "duplicate","inventory","spine","testimony"]);
 const allocation=source.words.find(w=>w.headword==="allocation");
 assert.equal(allocation.pdfPage,24);
 assert.equal(allocation.formStatus,"CET6_STARRED_HEADWORD_OR_FAMILY");
});
test("S35 distinguish omitted standalone forms from variant notations",()=>{
 const audit=verifyOfficial2016FormAudit(composeRainyNightSeasonDraft().bundle);
 assert.deepEqual(audit.variants.map(w=>w.headword),
   ["connection","fiber","photograph","recognize"]);
 assert.deepEqual(audit.priorityReview.filter(x=>x.formStatus==="NOT_STANDALONE_HEADWORD")
  .map(x=>x.headword),
   ["blurred","childhood","falsify","hidden","incorrect","outage","watermark"]);
 assert.equal(source.words.find(w=>w.headword==="connection").printedVariant,"connection/-xion");
 assert.equal(source.words.find(w=>w.headword==="fiber").printedVariant,"fiber/-bre");
 assert.equal(source.words.find(w=>w.headword==="photograph").printedVariant,"photo(graph)");
 assert.equal(source.words.find(w=>w.headword==="recognize").printedVariant,"recognize/-ise");
});
test("S35 uploaded original PDF and earlier community transcription agree on the 16 high-risk word forms",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const previous=checkRainyNightCET4Candidates(bundle);
 const sourceByHeadword=new Map(source.words.map(w=>[w.headword,w]));
 for(const row of previous.flagged){
  const official=sourceByHeadword.get(row.headword);
  if(row.provisionalMatch==="CET6_STARRED")
   assert.equal(official.formStatus,"CET6_STARRED_HEADWORD_OR_FAMILY");
  else assert.equal(official.formStatus,"NOT_STANDALONE_HEADWORD");
 }
 assert.equal(previous.flagged.length,16);
 assert.ok(!JSON.stringify(source).includes("phoneticUk"));
});
