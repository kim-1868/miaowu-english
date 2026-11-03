import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const registry=JSON.parse(readFileSync(new URL("../content/editorial/launch-candidate-registry.json",import.meta.url),"utf8"));
test("S15 retains Rose's isolated original prototype source in repo while removing public demo exposure",()=>{
 const rose=registry.works.find(x=>x.id==="rose-demo");
 assert.ok(rose);
 assert.equal(rose.title,"玫瑰未落幕");
 assert.equal(rose.sourceType,"browser-local-demo");
 assert.equal(rose.existingChapters,2);
 assert.equal(rose.preserve,true);
 assert.match(source,/id:'rose',name:'玫瑰未落幕'/);
 assert.match(source,/const CHAPTERS=\[/);
 assert.doesNotMatch(html,/玫瑰未落幕|互动演示|本机演示/);
 assert.doesNotMatch(source,/const showRoseDemo=slug==='cet4'/);
});
test("S15 public shelf displays only D1-published books; no planned stories appear to buyers",()=>{
 assert.match(source,/const response=await serverRequest\('\/api\/books\?category='/);
 assert.match(source,/item\.querySelector\('\.book-actions button'\)\.onclick=\(\)=>openCloudBook\(book,slug\)/);
 assert.match(source,/if\(!books\.length\)/);
 assert.match(source,/isRainyNight=book\.id==='rainy-night-archives-cet4-v1'/);
 assert.doesNotMatch(source,/newNovels\.forEach/);
 assert.doesNotMatch(source,/book-item demo-book-item/);
 assert.doesNotMatch(source,/BOOKS\.filter\(b=>b\.status==='planned'\)/);
});
test("S15 retains category-gated commercial licensing and prevents public paid manuscript bundling",()=>{
 assert.equal(registry.policy.rights,"V1 category-based authorization, not per-book");
 assert.match(registry.policy.commercial,/never place paid novel body in public\/app\.js/);
 assert.doesNotMatch(source,/chapter_words\s*=\s*\[/);
});