import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "../scripts/audit-rainy-night-s1.mjs";
const pilot=JSON.parse(readFileSync(new URL("../content/drafts/rainy-night-archives-two-chapter-pilot.json",import.meta.url),"utf8"));
test("S40 avoid unnecessary 到/出了 after embedded English verbs in original two-chapter pilot",()=>{
 assert.deepEqual(pilot.chapters.map(c=>c.number),[1,2]);
 let checked=0;
 for(const chapter of pilot.chapters){
  for(const p of chapter.paragraphs){
   for(let i=0;i<p.segments.length-1;i++){
    const seg=p.segments[i],next=p.segments[i+1];
    if(!seg.wordId||!next?.text)continue;
    if(seg.surface==="notice"){
     assert.ok(!next.text.startsWith(" 到"),"notice 到 is unidiomatic");
     checked++;
    }
    if(seg.surface==="recognize")assert.ok(!next.text.startsWith(" 出"),"recognize 出 is redundant");
    if(seg.surface==="reveal")assert.ok(!next.text.startsWith(" 出"),"reveal 出 is redundant");
   }
  }
 }
 assert.ok(checked>=5);
});
test("S40 prose copyedit preserves chapter numbering, protected draft and learning word anchors",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const audit=auditRainyNight(bundle);
 assert.equal(bundle.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.equal(audit.totalMentions,733);
 assert.equal(audit.releaseStatus,"BLOCKED_FOR_EDITORIAL_REVIEW");
 assert.ok(audit.chapters.every(c=>c.hanCharacters>=3000&&c.hanCharacters<=3500));
});
