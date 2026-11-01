import {test} from "node:test";
import assert from "node:assert/strict";
import {composeRainyNightDraft} from "../scripts/compose-rainy-night-s1.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "../scripts/build-content-import.mjs";
test("original six chapter content remains a PRIVATE test-only draft",()=>{
 const {bundle,summary}=composeRainyNightDraft();
 assert.equal(bundle.chapters.length,6);
 assert.equal(bundle.chapters[0].preview,true);
 assert.ok(bundle.chapters.slice(1).every(ch=>ch.preview===false));
 assert.match(bundle.book.id,/^draft-/);
 assert.match(bundle.book.title,/测试/);
 assert.match(bundle.sourceLabel,/private-unreviewed/);
 assert.equal(summary.publishable,false);
 assert.equal(new Set(bundle.words.map(w=>w.headword)).size,bundle.words.length);
 assert.equal(new Set(bundle.words.map(w=>w.id)).size,bundle.words.length);
 assert.ok(bundle.words.length>=90);
 const reviewed=validatePackage(bundle);
 assert.equal(reviewed.chapters.length,6);
 assert.ok(reviewed.mentionCount>=90);
 for(const info of summary.continuationChapters){
   assert.ok(info.paragraphs>=15);
   assert.ok(info.newWords>=12);
 }
});
test("safe importer creates only unpublished draft statements for all six chapters",()=>{
 const {bundle}=composeRainyNightDraft();
 const generated=generateSql(bundle);
 assert.equal(generated.summary.publication,"draft-only");
 assert.equal(generated.summary.chapters,6);
 assert.equal(generated.summary.words,bundle.words.length);
 assert.doesNotMatch(generated.sql,/UPDATE\s+books\s+SET\s+status\s*=\s*'published'/i);
 assert.ok(generated.sql.includes("INSERT OR IGNORE INTO chapters"));
 assert.ok(generated.sql.includes("published_at) SELECT"));
});
test("all new English words have scene-aligned Chinese meanings and actual example translations",()=>{
 const {bundle}=composeRainyNightDraft();
 const newer=bundle.words.filter(w=>w.id.startsWith("rns1-")&&w.exampleZh);
 assert.ok(newer.length>=55);
 for(const word of newer){
   assert.ok(word.exampleEn.length>=15);
   assert.ok(word.exampleZh.length>=4);
   assert.equal(word.phoneticUk,null);
   assert.equal(word.phoneticUs,null);
   assert.ok(word.collocations.every(c=>c.en&&c.zh));
 }
});
