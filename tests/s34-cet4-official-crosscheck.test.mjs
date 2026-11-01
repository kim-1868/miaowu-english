import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {checkRainyNightCET4Candidates} from "../scripts/check-rainy-night-cet4-candidates.mjs";
const data=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-cet2016-crosscheck-UNVERIFIED.json",import.meta.url),"utf8"));
test("S34 188 first-season targets are cross-checked separately from book's CET4 category",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const r=checkRainyNightCET4Candidates(bundle);
 assert.equal(r.candidateWords,188);
 assert.equal(r.fourBandCandidates,172);
 assert.equal(r.sixBandStarred,9);
 assert.equal(r.notFound,7);
 assert.equal(r.officialVerifiedWords,0);
 assert.equal(r.pendingIndividualReview,188);
 assert.equal(r.releaseAllowed,false);
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.ok(bundle.words.every(w=>w.verifiedCET4!==true));
});
test("S34 target words likely starred for CET6 are explicitly blocked for human replacement or bonus labeling",()=>{
 const r=checkRainyNightCET4Candidates(composeRainyNightSeasonDraft().bundle);
 assert.deepEqual(r.flagged.filter(x=>x.provisionalMatch==="CET6_STARRED").map(x=>x.headword).sort(),
 ["allocation","anonymous","archive","disclose","discrepancy",
  "duplicate","inventory","spine","testimony"]);
 assert.deepEqual(r.flagged.filter(x=>x.provisionalMatch==="NOT_FOUND_IN_TRANSCRIPTION").map(x=>x.headword).sort(),
 ["blurred","childhood","falsify","hidden","incorrect","outage","watermark"]);
 assert.ok(r.flagged.every(x=>x.officialVerified===false&&x.requiresContextAndSourceReview));
});
test("S34 source flags are provisional facts, not a permission to ship a copyrighted word list",()=>{
 assert.equal(data.reviewStatus,"UNVERIFIED_COMMUNITY_TRANSCRIPTION_CROSSCHECK");
 assert.ok(data.officialSyllabusUrl.startsWith("https://cet.neea.edu.cn/"));
 assert.ok(data.secondarySourceRepo.includes("mahavivo/english-wordlists"));
 assert.ok(data.words.every(w=>w.officialVerified===false));
 assert.equal(data.words.length,188);
 assert.equal(data.words.filter(w=>w.provisionalMatch==="FOUR_BAND_CANDIDATE").length,172);
 assert.equal(new Set(data.words.map(w=>w.headword)).size,188);
 assert.ok(!JSON.stringify(data).includes("phoneticUk"),"Do not clone external dictionary data into this catalog");
});
