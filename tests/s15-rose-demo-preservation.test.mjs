import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const registry=JSON.parse(readFileSync(new URL("../content/editorial/launch-candidate-registry.json",import.meta.url),"utf8"));

test("S15 preserves Rose book identity and both original noncommercial demo chapters",()=>{
 const rose=registry.works.find(x=>x.id==="rose-demo");
 assert.ok(rose);
 assert.equal(rose.title,"玫瑰未落幕");
 assert.equal(rose.sourceType,"browser-local-demo");
 assert.equal(rose.existingChapters,2);
 assert.equal(rose.currentTargetWordCount,12);
 assert.equal(rose.preserve,true);
 assert.equal(rose.releaseStatus,"retain-demo-not-for-sale");
 assert.match(source,/\{id:'rose',name:'玫瑰未落幕'/);
 assert.match(source,/status:'demo'/);
 const chapters=source.slice(source.indexOf("const CHAPTERS=["),source.indexOf("const QUIZ=["));
 assert.equal((chapters.match(/\{title:/g)||[]).length,2);
 assert.match(chapters,/一纸协议/);
 assert.match(chapters,/藏在照片里的名字/);
 assert.match(chapters,/这只是一个用于测试阅读功能的场景片段，并非正式小说正文/);
 assert.match(chapters,/这一章同样是临时交互文案/);
 const words=source.slice(source.indexOf("const WORDS={"),source.indexOf("const WORD_EXTRAS="));
 assert.equal((words.match(/\{meaning:/g)||[]).length,12);
 assert.match(html,/玫瑰未落幕/);
});
test("S15 CET4 D1 bookshelf independently displays and labels local demo without overriding cloud books",()=>{
 assert.match(source,/const showRoseDemo=slug==='cet4'/);
 assert.match(source,/!books\.some\(b=>/);
 assert.match(source,/b\.id==='rose'\|\|b\.title==='玫瑰未落幕'/);
 assert.match(source,/book-item demo-book-item/);
 assert.match(source,/互动演示 · 非正式商品/);
 assert.match(source,/仅供体验 · 不出售/);
 assert.match(source,/浏览器本地演示/);
 assert.match(source,/item\.querySelector\('\.book-actions button'\)\.onclick=\(\)=>openChapter\(0\)/);
 assert.match(source,/const visibleCardCount=books\.length\+\(showRoseDemo\?1:0\)/);
 assert.match(source,/const response=await serverRequest\('\/api\/books\?category='/);
 assert.match(source,/item\.querySelector\('\.book-actions button'\)\.onclick=\(\)=>openCloudBook\(book,slug\)/);
});
test("S15 commercial classification remains category-level and both stories require separate editorial gates",()=>{
 const rainy=registry.works.find(x=>x.id==="rainy-night-s1-draft");
 assert.ok(rainy);
 assert.equal(rainy.existingChapters,12);
 assert.equal(rainy.currentTargetWordCount,188);
 assert.equal(rainy.releaseStatus,"candidate-needs-review-not-for-sale");
 assert.equal(rainy.primaryCategory,"cet4");
 assert.equal(registry.policy.rights,"V1 category-based authorization, not per-book");
 assert.equal(registry.works.every(x=>x.releaseStatus.includes("not-for-sale")),true);
 assert.match(registry.policy.commercial,/never place paid novel body in public\/app\.js/);
});
