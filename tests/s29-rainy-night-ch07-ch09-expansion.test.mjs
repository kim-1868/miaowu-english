import {test} from "node:test";
import assert from "node:assert/strict";
import {chapters} from "../content/drafts/rainy-night-s1-ch07-ch09.mjs";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {validatePackage} from "../src/editorial-content.js";
const HAN=/\p{Script=Han}/gu;
test("S29 chapters 7–9 meet planned reading length and contextual vocabulary density",()=>{
 assert.deepEqual(chapters.map(c=>c.number),[7,8,9]);
 for(const ch of chapters){
  const text=ch.paragraphs.join("");
  const han=(text.match(HAN)||[]).length;
  const words=[...text.matchAll(/\[\[([a-z]+)\]\]/g)].map(m=>m[1]);
  assert.ok(han>=3000&&han<=3500,"Chapter "+ch.number+": "+han+" Han characters");
  assert.ok(words.length>=50&&words.length<=65,"Chapter "+ch.number+": "+words.length+" word mentions");
  assert.ok(new Set(words).size>=25,"Chapter "+ch.number+" needs varied target words");
  assert.equal(ch.paragraphs.length>=35,true);
 }
});
test("S29 expanded content composes with all twelve private chapters without losing ID or release protections",()=>{
 const {bundle}=composeRainyNightSeasonDraft();
 const checked=validatePackage(bundle);
 assert.equal(checked.chapters.length,12);
 assert.equal(bundle.words.length,188);
 assert.ok(bundle.book.id.startsWith("draft-"));
 assert.match(bundle.book.title,/测试/);
 assert.equal(bundle.chapters.filter(c=>c.preview).length,1);
 const actual=bundle.chapters.slice(6,9);
 for(const ch of actual){
  const input=chapters.find(c=>c.number===ch.number);
  assert.equal(ch.paragraphs.length,input.paragraphs.length);
  assert.equal(ch.paragraphs.flatMap(p=>p.segments).filter(x=>x.wordId).length,
    [...input.paragraphs.join("").matchAll(/\[\[([a-z]+)\]\]/g)].length);
 }
 assert.ok(bundle.words.every(w=>!w.phoneticUk&&!w.phoneticUs),
  "unverified phonetic data must remain visibly unapproved");
});
