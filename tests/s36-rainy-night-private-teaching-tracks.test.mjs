import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightTeachingTrackPlan} from "../scripts/plan-rainy-night-teaching-tracks.mjs";

test("S36 draft curriculum plan splits the 188 target words into documented, non-overlapping teaching tracks",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const p=buildRainyNightTeachingTrackPlan(bundle);
 assert.equal(p.total,188);
 assert.equal(p.sumCET4CandidateForms,172);
 assert.deepEqual(p.counts,{
  CET4_FORM_CANDIDATE:172,
  CET6_STORY_EXTENSION:9,
  MORPHOLOGY_OF_LISTED_ROOT:4,
  STORY_EXTRA_NOT_IN_SYLLABUS_HEADWORDS:3});
 assert.equal(p.manuallyCertified,0);
 assert.equal(p.publishAllowed,false);
 assert.ok(p.rows.every(w=>w.candidateForReview&&!w.publicationApproved&&!w.meaningPosIpaApproved));
 assert.ok(p.rows.every(w=>Number.isInteger(w.sourcePdfPage)));
 assert.deepEqual(new Set(p.rows.map(x=>x.wordId)),new Set(bundle.words.map(x=>x.id)));
});
test("S36 advanced plot vocabulary may remain for story coherence but cannot be sold as CET4 core",()=>{
 const p=buildRainyNightTeachingTrackPlan(composeRainyNightSeasonDraft().bundle);
 assert.deepEqual(p.rows.filter(w=>w.track==="CET6_STORY_EXTENSION").map(x=>x.headword).sort(),
 ["allocation","anonymous","archive","disclose","discrepancy","duplicate","inventory","spine","testimony"]);
 assert.ok(p.rows.filter(x=>x.track==="CET6_STORY_EXTENSION").every(x=>x.note.includes("cannot count")));
});
test("S36 distinguish morphological forms from words missing as standalone dictionary entries",()=>{
 const p=buildRainyNightTeachingTrackPlan(composeRainyNightSeasonDraft().bundle);
 assert.deepEqual(p.rows.filter(w=>w.track==="MORPHOLOGY_OF_LISTED_ROOT").map(x=>x.headword).sort(),
 ["blurred","childhood","hidden","incorrect"]);
 assert.deepEqual(p.rows.filter(w=>w.track==="STORY_EXTRA_NOT_IN_SYLLABUS_HEADWORDS").map(x=>x.headword).sort(),
 ["falsify","outage","watermark"]);
 assert.ok(p.rows.find(w=>w.headword==="hidden").sourceRoot==="hide");
});
