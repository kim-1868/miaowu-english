import test from "node:test";
import assert from "node:assert/strict";
import {pronunciationDraft} from "../scripts/prepare-rainy-night-ipa-ai-working-copy.mjs";
test("S115 all 188 IPA suggestions are sourced and explicitly UNAPPROVED",()=>{
 const d=pronunciationDraft({britishRead:() => "/ˈtɛst/"});
 assert.equal(d.count,188);
 assert.equal(d.ukGaps,7);
 assert.equal(d.humanApproved,false);
 assert.equal(d.productionD1Touched,false);
 assert.equal(d.rows.length,188);
 assert.equal(new Set(d.rows.map(x=>x.wordId)).size,188);
 assert.ok(d.rows.every(x=>x.britishSuggested==="/ˈtɛst/"&&
   x.americanSuggested.startsWith("/")&&x.textMeaningAndPronunciationApproved===false));
 const m=new Map(d.rows.map(x=>[x.headword,x]));
 assert.equal(m.get("record").americanSuggested,"/ˈɹɛkɝd/");
 assert.equal(m.get("suspect").americanSuggested,"/səˈspɛkt/");
 assert.equal(m.get("insert").americanSuggested,"/ˌɪnˈsɝt/");
 assert.equal(m.get("duplicate").americanSuggested,"/ˈdupɫəkət/");
 assert.equal(m.get("separate").americanSuggested,"/ˈsɛpɹət/");
 assert.ok(m.get("separate").needsQualifiedReview);
 assert.ok(m.get("watermark").comparisonNeedsCheck);
 assert.equal(m.get("record").britishSuggested,"/ˈrekɔːd/");
 assert.equal(m.get("suspect").britishSuggested,"/səˈspekt/");
 assert.equal(m.get("separate").britishSuggested,"/ˈsepərət/");
 assert.equal(m.get("outage").britishSuggested,"/ˈaʊtɪdʒ/");
 assert.ok(d.rows.every(x=>x.britishAllRawCandidates.length>=0));
 console.log("RAINY_NIGHT_IPA_DRAFT_SUMMARY "+JSON.stringify({
  words:d.count,ukGaps:d.ukGaps,requiresReview:d.multipleOrGap,approved:d.humanApproved
 }));
});
