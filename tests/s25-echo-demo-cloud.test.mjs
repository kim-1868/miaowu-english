import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const cloudJs=readFileSync(new URL("../public/echo-cloud.js",import.meta.url),"utf8");
const a=js.indexOf("    function renderEchoModeSwitch(){");
const b=js.indexOf("    const apiErrors =",a);
assert.ok(a>=0&&b>a);
function run({loggedIn=true}={}){
 const nodes=new Map([["echoModeSwitch",{innerHTML:""}],["quizContainer",{innerHTML:""}]]);
 const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:"",onclick:null});return nodes.get(id)};
 const ctx={
  $,user:loggedIn?{name:"owner"}:null,echoMode:"cloud",echoPhase:"setup",
  window:{MiaowuCloudEcho:{render:()=>{ctx.renders++},running:()=>false}},
  renders:0,showLogin:()=>{},safe:s=>String(s),toast:()=>{},showModal:()=>{},navigate:()=>{}
 };
 const render=runInNewContext(js.slice(a,b)+"\nrenderQuiz",ctx);
 render();return {ctx,$};
}
test("S25 authenticated readers default to genuine published-chapter Cloud Echo, never Rose demo",()=>{
 const h=run();assert.equal(h.ctx.renders,1);
 assert.equal(h.$("echoModeSwitch").innerHTML,"");
 assert.doesNotMatch(h.$("quizContainer").innerHTML,/故事演示练习/);
 assert.doesNotMatch(html,/故事演示练习/);
});
test("S25 logged-out readers see an honest login entry, not fake demo grades",()=>{
 const h=run({loggedIn:false});
 assert.equal(h.ctx.renders,0);
 assert.match(h.$("quizContainer").innerHTML,/登录后，从读过的故事里练习/);
 assert.match(h.$("quizContainer").innerHTML,/cloudEchoLogin/);
 assert.doesNotMatch(h.$("quizContainer").innerHTML,/玫瑰未落幕|演示题库/);
});
test("S25 real Cloud Echo has a safe empty state without any invented paid progress",()=>{
 const elements=new Map();
 const document={
  getElementById:id=>{if(!elements.has(id))elements.set(id,{innerHTML:"",disabled:false,onclick:null});return elements.get(id)},
  querySelectorAll:()=>[]
 };
 const window={};
 runInNewContext(cloudJs,{window,document,URLSearchParams,Set,Map,Math,Number,String});
 window.MiaowuCloudEcho.configure({progress:()=>[],
  request:()=>{throw Error("no chapter available")},
  toast:()=>{},speak:()=>{},showModal:()=>{},closeModal:()=>{},navigate:()=>{}});
 window.MiaowuCloudEcho.render();
 const content=elements.get("quizContainer").innerHTML;
 assert.match(content,/目前还没有已读完的正式云端章节/);
 assert.match(content,/cloudEchoStart" disabled/);
});
test("S25 official Story Echo page exposes one container and no explicit demo switching",()=>{
 assert.match(html,/id="echoModeSwitch"/);
 assert.match(js,/let echoMode='cloud'/);
 assert.match(js,/window\.MiaowuCloudEcho\.render\(\)/);
 assert.doesNotMatch(html,/故事演示练习|《玫瑰未落幕》/);
});
