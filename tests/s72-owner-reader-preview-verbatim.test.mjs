import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";

const markdown=readFileSync(new URL("../content/drafts/rainy-night-s1-OWNER-FULL-READING-PREVIEW-20261102.md",import.meta.url),"utf8");
const {bundle}=composeRainyNightSeasonDraft();
const numerals=["","一","二","三","四","五","六","七","八","九","十","十一","十二"];
test("S72 owner preview contains all 12 real draft chapters and every paragraph verbatim after bold markup",()=>{
 assert.equal((markdown.match(/^## 第[一二三四五六七八九十]+章 · /gm)||[]).length,12);
 for(const chapter of bundle.chapters){
  assert.ok(markdown.includes("## 第"+numerals[chapter.number]+"章 · "+chapter.title));
  for(const p of chapter.paragraphs){
   const original=p.segments.map(s=>s.wordId?"**"+s.surface+"**":s.text).join("");
   assert.ok(markdown.includes(original),"Owner preview missing source text for "+chapter.id);
  }
 }
});
test("S72 privacy and source cardinality are preserved: 188 words, 733 references and no public release",()=>{
 assert.equal(bundle.words.length,188);
 const marked=[...markdown.matchAll(/\*\*([a-z]+)\*\*/g)].map(x=>x[1]);
 assert.equal(marked.length,733);
 assert.equal(new Set(marked).size,188);
 assert.match(markdown,/仅供项目所有者审阅，不对外公开、不收费/);
 assert.match(markdown,/188词不等于完整的大学英语四级词汇/);
 assert.match(bundle.book.id,/^draft-/);
 const gate=evaluateRainyNightPublicationGate(bundle);
 assert.equal(gate.status,"BLOCKED");
 assert.equal(gate.publicationAllowed,false);
 assert.equal(gate.productionDbTouched,false);
 assert.equal(gate.productionReleasePerformed,false);
});
