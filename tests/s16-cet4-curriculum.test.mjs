import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildCET4CandidatePlan,canonicalHeadword,proposedWordId,
  renderCET4Report,reviewQueueCsv} from "../scripts/build-cet4-master-lexicon.mjs";

const rose=JSON.parse(readFileSync(new URL(
 "../content/editorial/cet4-rose-demo-word-seed.json",import.meta.url),"utf8"));
const bundle=composeRainyNightSeasonDraft().bundle;
test("S16 candidate master plan derives real manuscript words and 12 Rose demo words",()=>{
 const plan=buildCET4CandidatePlan(bundle,rose);
 assert.equal(plan.status,"UNVERIFIED_EDITORIAL_CANDIDATES_NO_RELEASE");
 assert.equal(plan.targetSizePlanningOnly,4500);
 assert.equal(plan.actualVerifiedOfficialLexiconSize,0);
 assert.equal(plan.books[0].uniqueHeadwords,188);
 const actualMentions=bundle.chapters.flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments))
   .filter(s=>typeof s.wordId==="string").length;
 assert.equal(plan.books[0].wordMentions,actualMentions);
 assert.ok(plan.books[0].wordMentions>=300,
   "Expanded manuscript must not silently regress below the 300 word-mention milestone");
 const chaptersPerWord=new Map();
 for(const ch of bundle.chapters){
   for(const id of new Set(ch.paragraphs.flatMap(p=>p.segments)
       .filter(s=>s.wordId).map(s=>s.wordId))){
     chaptersPerWord.set(id,(chaptersPerWord.get(id)||0)+1);
   }
 }
 assert.equal(plan.books[0].acrossChaptersRepeatedWords,
   [...chaptersPerWord.values()].filter(n=>n>1).length);
 assert.equal(plan.chapters.length,12);
 assert.equal(plan.books[1].uniqueHeadwords,12);
 assert.equal(plan.books[1].reusedFromPreviousBooks,10);
 assert.equal(plan.books[1].newCandidateHeadwords,2);
 assert.equal(plan.candidateUniqueHeadwords,190);
 assert.equal(plan.books[1].wordMentions,null);
 assert.equal(plan.books[1].newCandidateHeadwords+
    plan.books[1].reusedFromPreviousBooks,12);
 assert.equal(plan.candidateUniqueHeadwords,188+plan.books[1].newCandidateHeadwords);
 assert.equal(plan.entries.length,plan.candidateUniqueHeadwords);
 assert.equal(new Set(plan.entries.map(x=>x.id)).size,plan.entries.length);
 assert.equal(plan.pendingLevelVerification,plan.entries.length);
 assert.equal(plan.pendingPhoneticVerification,plan.entries.length);
 assert.equal(plan.pendingSenseApproval,plan.entries.length);
 assert.equal(plan.proposedIdsAreNotDatabaseIds,true);
 assert.ok(plan.books[0].hanCharacters>0);
});
test("S16 stable provisional IDs map existing rainy draft words without changing draft IDs",()=>{
 const plan=buildCET4CandidatePlan(bundle,rose);
 for(const word of bundle.words){
  const entry=plan.entries.find(e=>e.lemma===word.headword);
  assert.ok(entry,word.headword);
  assert.equal(entry.id,proposedWordId(word.headword));
  assert.ok(entry.draftIds.includes(word.id));
  assert.notEqual(entry.id,word.id);
  assert.equal(entry.reviewStatus,"pending-source-and-sense-review");
 }
 assert.equal(canonicalHeadword(" Evidence "),"evidence");
 assert.equal(proposedWordId("evidence"),"lex-en-evidence");
 assert.throws(()=>canonicalHeadword("run  away"),/HEADWORD_REQUIRES_LEMMA_REVIEW/);
 assert.throws(()=>canonicalHeadword("contract;DROP TABLE words"),/HEADWORD_REQUIRES_LEMMA_REVIEW/);
});
test("S16 same spelling across two stories is flagged for sense comparison, not auto-approved",()=>{
 const plan=buildCET4CandidatePlan(bundle,rose);
 const repeated=plan.entries.filter(e=>e.crossBookReuse);
 assert.equal(repeated.length,plan.books[1].reusedFromPreviousBooks);
 assert.equal(repeated.length,plan.overlappingDemoWordsNeedingSenseReview);
 assert.ok(repeated.every(e=>e.requiresSenseComparison&&!e.senseApproved));
 assert.ok(repeated.every(e=>e.sourceBooks.length===2));
 // The already-present 'evidence' example must be counted as a potential
 // cross-book repeat rather than being added as a second distinct lemma.
 const evidence=plan.entries.find(e=>e.lemma==="evidence");
 assert.deepEqual(evidence.sourceBooks,["rainy-night-s1","rose-v03-browser-demo"]);
 assert.ok(evidence.rainyChapterNumbers.length>=1);
});
test("S16 approved static Rose demo seed actually matches its client-side 12-word list",()=>{
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 const words=app.match(/const WORDS=\{([\s\S]*?)\};\s*const WORD_EXTRAS=/)?.[1];
 assert.ok(words,"Rose demo vocabulary list must still exist");
 const clientNames=[...words.matchAll(/([a-z]+):\{meaning:/g)].map(x=>x[1]).sort();
 assert.deepEqual(clientNames,rose.headwords.slice().sort());
 assert.match(app,/name:'玫瑰未落幕'/);
});
test("S16 review CSV includes each candidate once and never falsely claims exam certification",()=>{
 const plan=buildCET4CandidatePlan(bundle,rose);
 const csv=reviewQueueCsv(plan);
 assert.equal(csv.trimEnd().split("\n").length,plan.candidateUniqueHeadwords+1);
 assert.ok(csv.includes("COMPARE_MEANINGS_BETWEEN_BOOKS"));
 assert.ok(csv.includes("REVIEW_REQUIRED"));
 assert.ok(!csv.includes("READY_FOR_SALE"));
 const md=renderCET4Report(plan);
 assert.match(md,/未经词源、等级、IPA及义项审核/);
 assert.match(md,/4500/);
});
test("S16 refuses duplicate or invalid manuscript word IDs and forged demo release status",()=>{
 const duplicate=structuredClone(bundle);
 duplicate.words[1].id=duplicate.words[0].id;
 assert.throws(()=>buildCET4CandidatePlan(duplicate,rose),/DUPLICATED_RAINY_DRAFT_ID/);
 const unreviewed=structuredClone(rose);
 unreviewed.publishable=true;
 assert.throws(()=>buildCET4CandidatePlan(bundle,unreviewed),/INVALID_ROSE_DEMO_INPUT/);
 const repeated=structuredClone(rose);
 repeated.headwords.push("contract");
 assert.throws(()=>buildCET4CandidatePlan(bundle,repeated),/DUPLICATED_ROSE_DEMO_LEMMA/);
 const unknown=structuredClone(bundle);
 unknown.chapters[0].paragraphs[0].segments.push({
  wordId:"rns1-fake-deleted",surface:"fake",gloss:"假的"
 });
 assert.throws(()=>buildCET4CandidatePlan(unknown,rose),/UNRECOGNIZED_DRAFT_WORD/);
});
