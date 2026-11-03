import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildS82DraftBundles} from "../scripts/build-six-original-story-packages.mjs";
import {auditChapterDensity} from "../scripts/audit-cet4-word-density.mjs";
import {generateSql} from "../scripts/build-content-import.mjs";

test("S87 two extra original CET4 novels complete all 12 chapters using private high-density text",()=>{
 const rows=buildS82DraftBundles();
 assert.equal(rows.length,8);
 for(const id of ["ex-husband-business-client","substitute-bride-tears-contract"]){
  const one=rows.find(x=>x.summary.id===id);
  assert.ok(one,id);
  assert.equal(one.bundle.chapters.length,6);
  assert.deepEqual(one.bundle.chapters.filter(c=>c.preview).map(c=>c.number),[]);
  assert.ok(one.summary.mentions>=150,"high density counts");
  assert.ok(one.summary.words>=35);
  assert.ok(one.bundle.chapters.every(c=>c.paragraphs.length>=7));
  assert.equal(one.summary.publicationAllowed,false);
  assert.equal(one.bundle.book.category,"cet4");
  assert.ok(!Object.hasOwn(one.bundle.book,"genre_internal"));
  for(const chapter of one.bundle.chapters){
   const stats=auditChapterDensity(chapter);
   assert.ok(stats.averagePerParagraph>=2.7,"paragraph density below target even in draft");
   assert.ok(stats.occurrences>=20);
  }
  const imported=generateSql(one.bundle);
  assert.equal(imported.summary.publication,"draft-only");
  assert.ok(!imported.sql.includes("UPDATE books SET status"));
  assert.ok(!imported.sql.includes("INSERT INTO entitlements"));
 }
});
test("S87 new business and wedding words remain explicit, no fake phonetics",()=>{
 const rows=buildS82DraftBundles();
 const words=rows.flatMap(x=>x.bundle.words);
 for(const term of ["client","company","meeting","report","wedding","marriage"]){
  const word=words.find(w=>w.headword===term);
  assert.ok(word,term);
  assert.equal(word.vocabularyReviewStatus,"PENDING_CET4_HEADWORD_FORM_AND_SENSE_REVIEW");
  assert.equal(word.phoneticUk,null);
  assert.equal(word.phoneticUs,null);
 }
 const list=JSON.parse(readFileSync(new URL("../content/editorial/s87-high-density-expanded-cet4-candidates-UNVERIFIED.json",import.meta.url),"utf8"));
 assert.equal(list.words.length,30);
 assert.equal(list.officialCET4Verified,false);
 assert.equal(list.publicationAllowed,false);
});
