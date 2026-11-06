import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("V1.1 responsive overrides load after all prior styles and are bundled for production",()=>{
 const html=read("public/index.html");
 const all=["styles.css","flashcards.css","v11-reader.css","v11-bookshelf.css","v11-wordbook.css","v11-responsive.css"];
 const loc=all.map(x=>html.indexOf('href="/'+x+'?'));
 assert.ok(loc.every(x=>x>=0),JSON.stringify(loc));
 assert.deepEqual(loc,[...loc].sort((a,b)=>a-b),"responsive stylesheet must be last");
 const allowlist=read("scripts/build-production-assets.mjs");
 assert.match(allowlist,/\"v11-responsive.css\"/);
});
test("V1.1 homepage book controls stack within existing cards at every device breakpoint",()=>{
 const css=read("public/v11-responsive.css");
 assert.match(css,/#view-library \.home-shelf-layout \.cloud-book-item \.book-actions\{\s*display:grid;/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.cloud-book-item \.book-actions button\{[\s\S]*?white-space:nowrap/);
 assert.match(css,/\.cloud-bookmark-button\{[\s\S]*?width:100%/);
 assert.match(css,/@media\(min-width:601px\) and \(max-width:820px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:370px\)/);
 const app=read("public/app.js");
 assert.match(app,/'<div class="book-actions"><button class="primary" type="button">'\+action/);
 assert.match(app,/cloud-bookmark-button/);
 assert.match(app,/继续阅读 →/);
 assert.match(app,/✓ 已收藏/);
});
test("V1.1 account, bookplate, quiz, flash and reader buttons do not wrap text",()=>{
 const css=read("public/v11-responsive.css");
 for(const p of [".v11-my-shelf-actions button","#view-reader .tool-row button",
  "#view-words .card-tools button","#view-echo .quiz-foot button",
  ".flash-votes button",".flash-finish-actions button"]){
  assert.ok(css.includes(p),p);
 }
 assert.match(css,/white-space:nowrap/);
 assert.match(css,/word-break:keep-all/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.doesNotMatch(css,/display:none!important/,"don't hide buttons to make layouts fit");
});
