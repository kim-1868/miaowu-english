import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "../scripts/build-content-import.mjs";
test("complete season has twelve numbered original draft chapters and no premature publication",()=>{
 const {bundle,summary}=composeRainyNightSeasonDraft();
 assert.equal(bundle.chapters.length,12);
 assert.deepEqual(bundle.chapters.map(c=>c.number),[1,2,3,4,5,6,7,8,9,10,11,12]);
 assert.equal(bundle.chapters.filter(c=>c.preview).length,1);
 assert.equal(bundle.chapters[0].preview,true);
 assert.ok(bundle.chapters.slice(1).every(c=>!c.preview));
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.match(bundle.sourceLabel,/private-first-draft/);
 assert.equal(summary.notForSale,true);
 assert.equal(summary.notDeployed,true);
 assert.ok(bundle.words.length>=180&&bundle.words.length<=240);
 assert.equal(new Set(bundle.words.map(w=>w.id)).size,bundle.words.length);
 assert.equal(new Set(bundle.words.map(w=>w.headword)).size,bundle.words.length);
 assert.ok(validatePackage(bundle).mentionCount>=bundle.words.length);
});
test("each of the final six chapters teaches at least fourteen new anchored words",()=>{
 const {bundle,summary}=composeRainyNightSeasonDraft();
 assert.equal(summary.laterChapterCoverage.length,6);
 for(const metric of summary.laterChapterCoverage){
   assert.ok(metric.paragraphs>=14);
   assert.ok(metric.newWords>=14);
   assert.ok(metric.anchors>=14);
 }
 for(const chapter of bundle.chapters.slice(6)){
   assert.ok(chapter.paragraphs.length>=14);
   assert.ok(chapter.paragraphs.flatMap(p=>p.segments).filter(s=>s.wordId).length>=14);
 }
});
test("private D1 content importer accepts all chapters but never publishes them",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const result=generateSql(bundle);
 assert.equal(result.summary.publication,"draft-only");
 assert.equal(result.summary.chapters,12);
 assert.ok(result.summary.words>=180);
 assert.ok(result.sql.includes("status='draft'"));
 assert.doesNotMatch(result.sql,/UPDATE\s+books\s+SET\s+status\s*=\s*'published'/i);
 assert.ok(result.sql.includes("INSERT OR IGNORE INTO content_packages"));
});
test("source is still blocked for public release until verified CET4 words and IPA are finished",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 assert.equal(bundle.book.category,"cet4");
 assert.ok(bundle.words.every(w=>typeof w.meaningZh==="string"&&w.meaningZh.length>0));
 assert.ok(bundle.words.every(w=>!w.phoneticUk&&!w.phoneticUs));
 assert.equal(bundle.words.some(w=>!w.exampleZh),false);
});

test("all candidate word entries now include Chinese example translations",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 assert.ok(bundle.words.every(w=>typeof w.exampleZh==="string"&&w.exampleZh.trim().length>=4));
 assert.ok(bundle.words.every(w=>typeof w.exampleEn==="string"&&w.exampleEn.trim().length>=10));
});
