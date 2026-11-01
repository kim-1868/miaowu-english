import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
import {createVocabularyReviewQueue} from "../scripts/prepare-rainy-night-vocabulary-review.mjs";
import {validatePackage} from "../src/editorial-content.js";

function parseCsv(csv){
 const rows=[];let row=[],value="",quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){
   if(c==='"'&&csv[i+1]==='"'){value+='"';i++;}
   else if(c==='"')quoted=false;
   else value+=c;
  }else if(c==='"')quoted=true;
  else if(c===','){row.push(value);value="";}
  else if(c==='\n'){row.push(value);rows.push(row);row=[];value="";}
  else if(c!=='\r')value+=c;
 }
 assert.equal(quoted,false,"CSV quotes cannot be left open");
 return rows;
}
test("S32 all 188 targets have at least two contextual exposures across 12 chapters",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 validatePackage(bundle);
 const queue=createVocabularyReviewQueue(bundle),audit=auditRainyNight(bundle);
 assert.equal(bundle.words.length,188);
 assert.equal(bundle.chapters.length,12);
 assert.equal(queue.overview.totalMentions,733);
 assert.equal(audit.totalMentions,733);
 assert.equal(queue.overview.oneMentionWords,0);
 assert.equal(queue.overview.singleChapterWords,72);
 assert.equal(queue.overview.acrossTwoOrMore,116);
 assert.ok(queue.rows.every(w=>w.mentions>=2),"No single-exposure words in pilot");
 assert.ok(queue.rows.every(w=>w.firstChapter!=null&&w.firstContext.length>0));
 for(const ch of audit.chapters){
  assert.ok(ch.hanCharacters>=3000&&ch.hanCharacters<=3500,"length chapter "+ch.number);
  assert.ok(ch.wordMentions>=50&&ch.wordMentions<=65,"word density chapter "+ch.number);
 }
});
test("S32 private review CSV stays consistent with canonical manuscript",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const data=readFileSync(new URL("../content/editorial/rainy-night-s1-review-queue-UNVERIFIED.csv",import.meta.url),"utf8");
 const records=parseCsv(data);
 assert.equal(records.length,189);
 const cols=records[0],index=Object.fromEntries(cols.map((c,i)=>[c,i]));
 const queue=createVocabularyReviewQueue(bundle);
 const byWord=new Map(queue.rows.map(w=>[w.headword,w]));
 let sum=0;
 for(const r of records.slice(1)){
  assert.equal(r.length,cols.length);
  const word=r[index.headword],entry=byWord.get(word);
  assert.ok(entry,"CSV word missing from manuscript: "+word);
  assert.equal(Number(r[index.mentions]),entry.mentions,word+" mention drift");
  assert.equal(r[index.chapters_used],entry.chapters.join("|"),word+" chapter drift");
  assert.equal(r[index.editor_review_status],"UNREVIEWED");
  assert.equal(r[index.CET4_level_status],"NOT_VERIFIED");
  assert.equal(r[index.american_ipa_status],"NOT_VERIFIED");
  sum+=entry.mentions;
 }
 assert.equal(sum,733);
});
test("S32 recurrence adjustments do not accidentally publish a real title or verify source claims",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle);
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.equal(audit.wordsWithoutIpa,188);
 assert.equal(audit.wordsWithoutVerifiedLevel,188);
 assert.equal(bundle.chapters.filter(ch=>ch.preview).length,1);
 assert.ok(bundle.chapters.slice(1).every(ch=>!ch.preview));
});
