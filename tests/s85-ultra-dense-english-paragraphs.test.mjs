import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildS82DraftBundles} from "../scripts/build-six-original-story-packages.mjs";
import {DENSITY,auditChapterDensity} from "../scripts/audit-cet4-word-density.mjs";
import {buildStoryBatchPlans} from "../scripts/story-batch.mjs";

test("S85 first chapter has high-frequency repeatable English vocabulary",()=>{
 const one=buildS82DraftBundles().find(x=>x.summary.id==="rejected-family-second-life");
 const check=auditChapterDensity(one.bundle.chapters[0]);
 assert.equal(one.bundle.chapters[0].paragraphs.length,17);
 assert.equal(check.occurrences,77);
 assert.ok(check.distinctWords>=35);
 assert.ok(check.averagePerParagraph>=3&&check.averagePerParagraph<=6);
 assert.ok(check.occurrencesPer100Han>=DENSITY.preferredMinimum);
 assert.ok(check.occurrencesPer100Han<=DENSITY.preferredMaximum);
 assert.ok(check.substantialSentences>=10);
 assert.equal(check.sentenceViolations,0);
 assert.equal(check.passedDensity,true);
 assert.ok(one.bundle.chapters[0].paragraphs.every(p=>p.segments.filter(s=>s.wordId).length>=3&&p.segments.filter(s=>s.wordId).length<=6));
});
test("S85 added everyday vocabulary is explicitly unverified, not public reader content",()=>{
 const one=buildS82DraftBundles().find(x=>x.summary.id==="rejected-family-second-life");
 for(const w of ["hospital","dawn","property","message","bank","contract","loan","debt","phone"]){
  const item=one.bundle.words.find(x=>x.headword===w);
  assert.ok(item);
  assert.equal(item.vocabularyReviewStatus,"PENDING_CET4_HEADWORD_FORM_AND_SENSE_REVIEW");
  assert.equal(item.phoneticUk,null);
  assert.equal(item.phoneticUs,null);
 }
 const source=JSON.parse(readFileSync(new URL("../content/editorial/s85-high-density-extra-word-candidates-UNVERIFIED.json",import.meta.url)));
 assert.equal(source.officialCET4Verified,false);
 assert.equal(source.publicationAllowed,false);
 assert.equal(source.wordCount,15);
 assert.ok(buildStoryBatchPlans().every(p=>p.vocabulary.length===64&&p.vocabulary.some(w=>w.headword==="hospital"&&w.senseReviewed===false)));
 assert.equal(one.bundle.book.category,"cet4");
 assert.ok(!JSON.stringify(one.bundle.book).includes("genre"));
});
