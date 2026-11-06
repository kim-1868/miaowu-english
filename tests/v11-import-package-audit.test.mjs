import {test} from "node:test";
import assert from "node:assert/strict";
import {auditPackages,auditFiles} from "../scripts/audit-v11-import-packages.mjs";
const word=(overrides={})=>({
 id:"w1",headword:"record",partOfSpeech:"n.",meaningZh:"记录",
 phoneticUk:"/ˈrekɔːd/",phoneticUs:"/ˈrekərd/",
 exampleEn:"A record was found.",exampleZh:"发现一份记录。",
 collocations:[{en:"keep a record",zh:"保留记录"}],...overrides
});
const doc=(words=[word()],segments=[{wordId:"w1",surface:"record"}])=>({
 book:{title:"Test Novel"},words,chapters:[{id:"c1",paragraphs:[{segments}]}]
});
const item=d=>[{path:"test.json",doc:d}];
test("V1.1 imported commercial novel packets are structurally complete and links resolve",()=>{
 const report=auditFiles();
 assert.equal(report.ok,true,JSON.stringify(report.issues.filter(x=>!["SURFACE_VARIANT_REVIEW","PARALLEL_SENSE_IDS"].includes(x.type)).slice(0,8)));
 assert.equal(report.packageCount,2);
 assert.equal(report.chapters,12);
 assert.equal(report.cardDefinitions,105);
 assert.equal(report.uniqueWordIds,67);
 assert.equal(report.crossBookSharedDefinitions,38);
 assert.equal(report.wordOccurrences,348);
 assert.equal(report.counts.MISSING_LEARNING_METADATA||0,0);
 assert.equal(report.counts.DANGLING_WORD_REFERENCE||0,0);
 assert.equal(report.counts.INVALID_COLLOCATION||0,0);
});
test("V1.1 audit refuses missing teaching fields and broken chapter references",()=>{
 const r=auditPackages(item(doc([word({phoneticUk:"",exampleZh:"",collocations:[{en:"keep record",zh:""}]})],
  [{wordId:"not-there",surface:"foo"}])));
 assert.equal(r.ok,false);
 assert.ok(r.issues.some(x=>x.type==="MISSING_LEARNING_METADATA"&&x.detail==="phoneticUk"));
 assert.ok(r.issues.some(x=>x.type==="INVALID_COLLOCATION"));
 assert.ok(r.issues.some(x=>x.type==="DANGLING_WORD_REFERENCE"));
});
test("V1.1 audit blocks conflicting reused IDs, preserving cross-novel identity",()=>{
 const a={path:"novel-a",doc:doc()};
 const b={path:"novel-b",doc:doc([word({meaningZh:"录制"})])};
 const r=auditPackages([a,b]);
 assert.equal(r.ok,false);
 assert.ok(r.issues.some(x=>x.type==="CROSS_BOOK_ID_CONFLICT"));
});
test("V1.1 audit treats natural inflected forms and missing optional collocations as editorial warnings",()=>{
 const r=auditPackages(item(doc([word({collocations:[]})],[{wordId:"w1",surface:"records"}])));
 assert.equal(r.ok,true);
 assert.equal(r.counts.MISSING_COLLOCATION,1);
 assert.equal(r.counts.SURFACE_VARIANT_REVIEW,1);
});
