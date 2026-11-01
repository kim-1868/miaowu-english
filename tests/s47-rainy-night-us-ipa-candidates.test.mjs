import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {createVocabularyReviewQueue,reviewCsv} from "../scripts/prepare-rainy-night-vocabulary-review.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const source=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-us-ipa-candidates-UNVERIFIED.json",import.meta.url),"utf8"));
test("S47 all 188 target words have real US IPA source candidates with upstream provenance",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const q=createVocabularyReviewQueue(bundle);
 assert.equal(source.status,"PROVISIONAL_US_IPA_SOURCED_NOT_APPROVED");
 assert.equal(source.wordCount,188);
 assert.equal(source.distinctWordsWithCandidates,188);
 assert.equal(source.singleVariantWords,141);
 assert.equal(source.multiVariantWords,47);
 assert.equal(q.overview.usIpaCandidatesFound,188);
 assert.equal(q.overview.usIpaSingleVariantWords,141);
 assert.equal(q.overview.usIpaVariantsNeedingReview,47);
 assert.equal(q.overview.flaggedForIpa,188);
 assert.equal(source.releaseApprovedWords,0);
 assert.equal(new Set(source.words.map(w=>w.headword)).size,188);
 assert.ok(q.rows.every(r=>r.sourceUsIpaCount>0));
 assert.ok(q.rows.every(r=>r.sourceUsIpaCandidates.startsWith("/")));
 assert.ok(q.rows.every(r=>!r.phoneticUs&&!r.phoneticUk));
 assert.ok(source.words.every(w=>w.selectedForPublication===null&&!w.meaningAndStressReviewed));
 assert.ok(source.words.flatMap(w=>w.usIpaCandidates).every(ipa=>
  /^\/[^\/\n]{1,70}\/$/.test(ipa)));
});
test("S47 multiple US pronunciations remain unselected and prioritize word-sense review",()=>{
 const get=w=>source.words.find(r=>r.headword===w);
 assert.deepEqual(get("record").usIpaCandidates,
  ["/ˈɹɛkɝd/","/ɹəˈkɔɹd/","/ɹɪˈkɔɹd/"]);
 assert.equal(get("suspect").usIpaCandidates.length,2);
 assert.equal(get("separate").usIpaCandidates.length,3);
 const q=createVocabularyReviewQueue(composeRainyNightSeasonDraft().bundle);
 assert.ok(q.rows.find(w=>w.headword==="record").reviewFlags.includes("US_IPA_VARIANT_NEEDS_SENSE_REVIEW"));
 assert.equal(q.rows.filter(w=>w.reviewFlags.includes("US_IPA_VARIANT_NEEDS_SENSE_REVIEW")).length,47);
});
test("S47 sourced IPA improves private review CSV, not published word cards or release approval",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const q=createVocabularyReviewQueue(bundle);
 const text=reviewCsv(q);
 assert.ok(text.includes("sourceUsIpaCandidates"));
 assert.ok(text.includes("sourceUsIpaProvenance"));
 assert.ok(text.includes("open-dict-data/ipa-dict"));
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.pronunciation.fullyApprovedWords,0);
 assert.equal(gate.review.pendingWordSense,188);
 assert.ok(bundle.words.every(w=>!w.phoneticUs&&!w.phoneticUk));
});
