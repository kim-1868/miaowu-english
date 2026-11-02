import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const index=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");

test("S54 public Rose demo never claims an arbitrary unreviewed future chapter commitment",()=>{
 assert.match(index,/仅有2章互动演示内容；正式小说章节数以通过审核的作品为准。/);
 assert.doesNotMatch(index,/正式版本计划每部25[–-]35章/);
 assert.match(app,/后续章节 · 内容筹备中/);
 assert.doesNotMatch(app,/03[–-]30 · 内容筹备中/);
});

test("S54 preserves honest free-demo and paid-release boundary",()=>{
 assert.match(index,/网站上线准备中/);
 assert.match(index,/付费购买仍在验收中/);
 assert.match(app,/id:'rose',name:'玫瑰未落幕'/);
 assert.match(app,/status:'demo'/);
 assert.match(app,/后续章节 · 内容筹备中/);
});
