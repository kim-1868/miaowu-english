import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const index=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
test("S54 customer site removes unfinished demo commitments instead of advertising prototype chapters",()=>{
 for(const phrase of ["仅有2章互动演示内容","网站上线准备中","正式版本计划每部25","付费购买仍在验收中","演示玩法"]){
  assert.ok(!index.includes(phrase),"unfinished prototype copy: "+phrase);
 }
 assert.doesNotMatch(app,/const showRoseDemo/);
 assert.doesNotMatch(app,/newNovels\.forEach/);
 assert.match(index,/id="view-reader"/);
});
test("S54 published titles are served from D1 and not replaced by a bundled local demo",()=>{
 assert.match(app,/serverRequest\('\/api\/books\?category='/);
 assert.match(app,/serverRequest\('\/api\/chapters\//);
 assert.match(app,/serverRequest\('\/api\/me\/progress','POST'/);
 assert.doesNotMatch(index,/id="cloudFinishReading"/);
});