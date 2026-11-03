import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
const a=js.indexOf("    function renderAccount(){");
const b=js.indexOf("    function showModal(",a);
assert.ok(a>=0&&b>a);
function render({loggedIn=true,cloudWords=[],cloudProgress=[]}={}){
 const elements=new Map(),calls=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{innerHTML:"",onclick:null,textContent:""});return elements.get(id)};
 const ctx={
  $,user:loggedIn?{name:"buyer_a"}:null,
  CATS:[{id:"cet4",name:"大学英语四级"}],has:x=>x==="cet4",
  cloudProgress,cloudSaved:new Map(cloudWords.map(w=>[w.word_id,w])),
  cloudDue:()=>0,safe:s=>String(s),navigate:x=>calls.push(x),
  showRegister:()=>{},showLogin:()=>{},showRedeem:()=>{},showChangePassword:()=>{},
  openCloudBook:()=>{},applyServerAccount:()=>{},toast:()=>{},
  serverRequest:()=>{throw Error("account render must not issue network requests")}
 };
 const fn=runInNewContext(js.slice(a,b)+"\nrenderAccount",ctx);
 fn();return {markup:$("accountPanel").innerHTML,calls,$};
}
test("S26 My Study shows only cloud account statistics, never a prototype Rose section",()=>{
 const item=render({cloudWords:[{word_id:"a",status:"learning"}],
  cloudProgress:[{book_id:"rainy-night",book_title:"雨夜档案",chapter_no:2,
   category_slug:"cet4",completed_at:null}]});
 assert.match(item.markup,/1本<\/strong><small>已开始阅读/);
 assert.match(item.markup,/0章<\/strong><small>已完成章节/);
 assert.match(item.markup,/1个<\/strong><small>云端已收藏词/);
 assert.match(item.markup,/雨夜档案/);
 assert.doesNotMatch(item.markup,/本机演示|玫瑰未落幕|体验过的章节/);
});
test("S26 account empty state does not invent reading completions or fake local results",()=>{
 const item=render();
 assert.match(item.markup,/0本<\/strong><small>已开始阅读/);
 assert.match(item.markup,/0章<\/strong><small>已完成章节/);
 assert.match(item.markup,/0个<\/strong><small>云端已收藏词/);
 assert.doesNotMatch(item.markup,/已作答 4|演示记录|本机收藏/);
});
test("S26 true recently read cloud book remains resumable",()=>{
 const item=render({cloudProgress:[{book_id:"rainy-night",book_title:"雨夜档案",
  chapter_no:2,category_slug:"cet4",completed_at:null}]});
 assert.equal(typeof item.$("accountResumeRead").onclick,"function");
 assert.match(item.markup,/继续阅读/);
});
test("S26 baseline original design and responsive night-mode styling remain intact",()=>{
 const ref=readFileSync(new URL("../public/design-reference-v03.html",import.meta.url),"utf8");
 const match=ref.match(/<style>([\s\S]*?)<\/style>/);
 assert.ok(match);
 assert.ok(css.startsWith(match[1]));
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/html\[data-theme="dark"\]/);
});
