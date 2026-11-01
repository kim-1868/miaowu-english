import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
const begin=js.indexOf("    function demoAccountSummary(){");
const end=js.indexOf("    function showModal(",begin);
assert.ok(begin>0&&end>begin,"real account renderer must be present");
const code=js.slice(begin,end);
function account({loggedIn=true,cloudWords=[],cloudProgress=[],visited=[0,1],
 saved=["contract","promise"],mastered=["promise"],reviewData={
 contract:{attempts:3,correct:2,nextDue:0},
 promise:{attempts:1,correct:1,nextDue:Date.now()+86400000}
}}={}){
  const map=new Map();
  const $=key=>{
    if(!map.has(key))map.set(key,{innerHTML:"",onclick:null,textContent:""});
    return map.get(key);
  };
  const ctx={
    $,user:loggedIn?{name:"qa_reader"}:null,
    CATS:[{id:"cet4",name:"大学英语四级"}],has:id=>id==="cet4",
    cloudProgress,cloudSaved:new Map(cloudWords.map(w=>[w.word_id,w])),
    cloudDue:()=>0,WORDS:{contract:{meaning:"合同"},promise:{meaning:"承诺"}},
    CHAPTERS:[{title:"一纸协议"},{title:"藏在照片里的名字"}],
    VISITED:new Set(visited),saved:new Set(saved),mastered:new Set(mastered),reviewData,
    dueList:()=>["contract"],category:"cet4",userCalls:[],networkCalls:[],
    safe:s=>String(s).replace(/[&<>"']/g,x=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[x])),
    navigate:where=>ctx.userCalls.push(where),
    showRedeem:()=>{},showChangePassword:()=>{},showRegister:()=>{},showLogin:()=>{},
    openCloudBook:()=>{},applyServerAccount:()=>{},toast:()=>{},
    serverRequest:(...args)=>{ctx.networkCalls.push(args);throw Error("must not access network for rendering")}
  };
  const render=runInNewContext(code+"\nrenderAccount",ctx);
  render();
  return {markup:$("accountPanel").innerHTML,ctx,$};
}
test("S26 previously recorded demo reading, bookmarks and echo answers are visible in My Study",()=>{
  const a=account();
  assert.match(a.markup,/本机学习记录/);
  assert.match(a.markup,/体验过的章节/);
  assert.match(a.markup,/2章/);
  assert.match(a.markup,/本机收藏词卡/);
  assert.match(a.markup,/2张/);
  assert.match(a.markup,/演示已掌握词/);
  assert.match(a.markup,/1个/);
  assert.match(a.markup,/剧情回声已作答/);
  assert.match(a.markup,/4题/);
  assert.match(a.markup,/剧情回声答对 3 \/ 4 题/);
  assert.match(a.markup,/一纸协议/);
  assert.match(a.markup,/藏在照片里的名字/);
  assert.deepEqual(a.ctx.networkCalls,[]);
});
test("S26 demo totals do not contaminate the real D1 cloud account counters",()=>{
  const a=account({cloudWords:[{word_id:"cloud-1",status:"learning"}],
    cloudProgress:[{book_id:"real-book",chapter_no:2,book_title:"正式书",category_slug:"cet4",
      completed_at:null}]});
  assert.match(a.markup,/1本<\/strong><small>已开始阅读/);
  assert.match(a.markup,/0章<\/strong><small>已完成章节/);
  assert.match(a.markup,/1个<\/strong><small>云端已收藏词/);
  assert.match(a.markup,/云端正式学习记录（不包括本机演示）/);
  assert.match(a.markup,/本机收藏词卡/);
  assert.match(a.markup,/2张/);
  assert.match(a.markup,/不会同步到账号/);
});
test("S26 account does not invent demo completion or quiz answers for fresh browser",()=>{
  const a=account({visited:[],saved:[],mastered:[],reviewData:{}});
  assert.match(a.markup,/0章/);
  assert.match(a.markup,/0张/);
  assert.match(a.markup,/0题/);
  assert.match(a.markup,/演示章节只统计曾打开过，不等于正式“已读完”/);
  assert.match(a.markup,/还未打开演示章节/);
});
test("S26 demo continue-reading shortcut goes to existing CET4 shelf without D1 writes",()=>{
  const a=account();
  assert.equal(typeof a.$("accountDemoRead").onclick,"function");
  a.$("accountDemoRead").onclick();
  assert.deepEqual(a.ctx.userCalls,["library"]);
  assert.equal(a.ctx.category,"cet4");
  assert.deepEqual(a.ctx.networkCalls,[]);
});
test("S26 previously approved V0.3 stylesheet is unchanged at base; new layout works in night mode",()=>{
  const ref=readFileSync(new URL("../public/design-reference-v03.html",import.meta.url),"utf8");
  const match=ref.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(match);
  assert.ok(css.startsWith(match[1]));
  assert.match(css,/\.account-demo-section/);
  assert.match(css,/html\[data-theme="dark"\] \.account-demo-section/);
  assert.match(css,/@media\(max-width:760px\).*account-demo-stats/);
});
