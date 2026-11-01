import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {createVocabularyReviewQueue,reviewCsv} from "../scripts/prepare-rainy-night-vocabulary-review.mjs";

const data=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-us-arpa-UNVERIFIED.json",import.meta.url),"utf8"));
test("S39 all 188 US ARPAbet source candidates are present and not promoted as IPA",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const queue=createVocabularyReviewQueue(bundle);
 assert.equal(data.total,188);
 assert.equal(data.multipleCandidates,47);
 assert.equal(data.entries.length,188);
 assert.equal(queue.overview.usArpaCandidatesFound,188);
 assert.equal(queue.overview.usArpaVariantWords,47);
 assert.equal(queue.overview.flaggedForIpa,188);
 assert.equal(queue.rows.length,188);
 assert.ok(data.entries.every(x=>x.reviewStatus==="UNVERIFIED"&&x.selected===null));
 assert.ok(data.entries.every(x=>x.arpaCandidates.length>=1));
 assert.ok(queue.rows.every(x=>!x.phoneticUs&&!x.phoneticUk));
 assert.ok(queue.rows.every(x=>x.sourceUsProvenance.includes("CMU Pronouncing Dictionary")));
 assert.ok(reviewCsv(queue).includes("sourceUsArpaCandidates"));
});
test("S39 retain all noun-v-verb pronunciation variants for homographs",()=>{
 const get=x=>data.entries.find(w=>w.headword===x);
 assert.equal(get("record").arpaCandidates.length,3);
 assert.equal(get("suspect").arpaCandidates.length,2);
 assert.equal(get("transfer").arpaCandidates.length,2);
 assert.equal(get("duplicate").arpaCandidates.length,2);
 assert.equal(get("address").arpaCandidates.length,2);
 assert.ok(get("record").arpaCandidates.some(v=>v.includes("EH1")));
 assert.ok(get("record").arpaCandidates.some(v=>v.includes("AO1")));
});
test("S39 licence/provenance and review flags prevent auto-populating public word cards",()=>{
 const text=readFileSync(new URL("../docs/third-party/CMUDICT_DATA_LICENSE.txt",import.meta.url),"utf8");
 assert.ok(text.includes("Copyright (C) 1993-2015 Carnegie Mellon University"));
 assert.match(text,/AS IS/);
 assert.equal(data.status,"UNVERIFIED_US_ARPABET_CANDIDATES_NOT_IPA");
 assert.equal(data.sourceDictionarySha256.length,64);
 const {bundle}=composeRainyNightSeasonDraft();
 assert.match(bundle.book.title,/测试/);
 assert.ok(bundle.words.every(w=>!w.phoneticUs&&!w.phoneticUk));
});
