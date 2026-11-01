import { test } from "node:test";
import assert from "node:assert/strict";
import { continuation } from "../content/drafts/rainy-night-s1-ch03-ch06.mjs";
import { composeRainyNightSeasonDraft } from "../scripts/compose-rainy-night-s1-full.mjs";
import { validatePackage } from "../src/editorial-content.js";
import { generateSql } from "../scripts/build-content-import.mjs";

const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
const wordsByChapter=continuation.chapters.map(ch=>{
  const text=ch.paragraphs.join("");
  const mentions=[...text.matchAll(/\[\[([a-z]+)\]\]/g)].map(m=>m[1]);
  return {number:ch.number,paragraphs:ch.paragraphs.length,
    han:hanCount(text),mentions:mentions.length,distinct:new Set(mentions).size};
});
test("S28 expanded chapters 3–6 are complete narrative-length drafts with moderated word frequency",()=>{
  assert.deepEqual(wordsByChapter.map(c=>c.number),[3,4,5,6]);
  for(const c of wordsByChapter){
    assert.ok(c.han>=3000&&c.han<=3500,
      "chapter "+c.number+" should contain 3000–3500 Han chars; got "+c.han);
    assert.ok(c.mentions>=50&&c.mentions<=65,
      "chapter "+c.number+" should expose 50–65 English targets; got "+c.mentions);
    assert.ok(c.paragraphs>=35);
    assert.ok(c.distinct>=20);
  }
});
test("S28 every embedded marker in chapters 3–6 resolves to one real manuscript word ID",()=>{
  const {bundle}=composeRainyNightSeasonDraft();
  const ids=new Set(bundle.words.map(w=>w.id));
  assert.equal(bundle.chapters.length,12);
  assert.equal(bundle.words.length,188);
  assert.equal(validatePackage(bundle).chapters.length,12);
  for(const chapter of bundle.chapters.slice(2,6)){
    const segments=chapter.paragraphs.flatMap(p=>p.segments);
    const actual=segments.filter(s=>s.wordId);
    assert.equal(actual.length,wordsByChapter[chapter.number-3].mentions);
    for(const seg of actual){
      assert.ok(ids.has(seg.wordId));
      assert.equal(typeof seg.gloss,"string");
      assert.ok(seg.gloss.length>0);
    }
  }
});
test("S28 private story text never becomes a public book or published paid chapter on import",()=>{
  const {bundle}=composeRainyNightSeasonDraft();
  const sql=generateSql(bundle);
  assert.match(bundle.book.id,/^draft-/);
  assert.match(bundle.book.title,/测试/);
  assert.equal(bundle.chapters.filter(c=>c.preview).length,1);
  assert.ok(bundle.chapters.slice(1).every(c=>c.preview===false));
  assert.equal(sql.summary.publication,"draft-only");
  assert.ok(sql.sql.includes("status='draft'"));
  assert.doesNotMatch(sql.sql,/UPDATE\s+books\s+SET\s+status\s*=\s*'published'/i);
  assert.ok(bundle.words.every(w=>!w.phoneticUk&&!w.phoneticUs),
    "IPA remains blocked for human review, never fabricate pronunciation");
});
