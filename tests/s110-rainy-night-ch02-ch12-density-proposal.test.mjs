import test from "node:test";
import assert from "node:assert/strict";
import {buildChapters2to12DensityCandidate} from "../scripts/rewrite-rainy-night-ch02-ch12-density-proposal.mjs";
import {prepareRainyNightMemberCandidate} from "../scripts/prepare-rainy-night-member-candidate.mjs";
test("Rainy Night chapters 2-12 lexical revision preserves all original word anchors",()=>{
 const original=prepareRainyNightMemberCandidate().candidate;
 const x=buildChapters2to12DensityCandidate();
 assert.equal(x.chapters.length,11);
 assert.equal(x.report.chapterCount,11);
 assert.equal(x.report.productionD1Touched,false);
 assert.equal(x.report.readyToPublish,false);
 assert.ok(x.report.candidateAnchors>=x.report.sourceAnchors);
 assert.ok(x.report.additionalAnchors>0);
 assert.ok(x.report.underfilledParagraphs<=x.audit.length);
 for(const c of x.chapters){
  const old=original.chapters.find(a=>a.number===c.number);
  assert.ok(old);assert.equal(c.id,old.id);
  assert.equal(c.paragraphs.length,old.paragraphs.length);
  for(const [i,p] of c.paragraphs.entries()){
   const prev=old.paragraphs[i];
   const oldAnchor=prev.segments.filter(s=>s.wordId).map(s=>s.wordId);
   const newAnchor=p.segments.filter(s=>s.wordId).map(s=>s.wordId);
   assert.ok(newAnchor.length>=oldAnchor.length);
   assert.ok(newAnchor.length<=6);
   let pos=0;
   for(const wordId of oldAnchor){const found=newAnchor.indexOf(wordId,pos);assert.ok(found>=pos);pos=found+1;}
   assert.ok(p.segments.every(s=>s.text!==undefined||
       (typeof s.wordId==="string"&&s.surface&&s.gloss)));
  }
 }
 console.log("RAINY_NIGHT_CH02_CH12_DENSITY "+JSON.stringify(x.report));
 console.log("RAINY_NIGHT_PARAGRAPHS_NEEDING_EDIT "+JSON.stringify(x.audit.filter(p=>p.needsManualRewrite).map(p=>({chapter:p.chapter,paragraph:p.paragraph,words:p.newWords}))));
});
