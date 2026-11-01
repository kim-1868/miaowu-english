import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const cloudJs=readFileSync(new URL("../public/echo-cloud.js",import.meta.url),"utf8");
const page=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

const a=js.indexOf("    function renderEchoModeSwitch(){");
const b=js.indexOf("    const apiErrors =",a);
const poolStart=js.indexOf("    function quizPool(){");
const poolEnd=js.indexOf("    function navigate(to)",poolStart);
assert.ok(a>=0&&b>a&&poolStart>=0&&poolEnd>poolStart);
const runtime=js.slice(poolStart,poolEnd)+"\n"+js.slice(a,b);

function fakeElement(){
  return {innerHTML:"",value:"",textContent:"",disabled:false,onclick:null,
    querySelectorAll(selector){
      const names=[...selector.matchAll(/data-([a-z-]+)/g)].map(m=>m[1]);
      return [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map(match=>{
        const dataset={};
        for(const a of match[1].matchAll(/data-([a-z-]+)="([^"]*)"/g)){
          const key=a[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
          dataset[key]=a[2];
        }
        return {dataset,onclick:null};
      }).filter(el=>names.some(name=>Object.hasOwn(el.dataset,
        name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()))));
    }};
}
function init({loggedIn=true}={}){
  const elements=new Map([["echoModeSwitch",fakeElement()],["quizContainer",fakeElement()]]);
  const $=id=>{if(!elements.has(id))elements.set(id,fakeElement());return elements.get(id)};
  // Keep a stable DOM node list for each render; event listeners attach to these.
  for(const el of elements.values()){
    const raw=el.querySelectorAll.bind(el);
    let cache="";
    let cacheMap=new Map();
    el.querySelectorAll=(selector)=>{
      if(el.innerHTML!==cache){cache=el.innerHTML;cacheMap=new Map()}
      if(!cacheMap.has(selector))cacheMap.set(selector,raw(selector));
      return cacheMap.get(selector);
    };
  }
  const answers=[];
  const ctx={
    $,document:{},
    window:{MiaowuCloudEcho:{render:()=>{ctx.cloudRenders++},
      running:()=>false}},
    cloudRenders:0,user:loggedIn?{name:"reviewer"}:null,
    echoMode:"demo",echoScope:"recent",echoTypes:new Set(["fill","situation","spell"]),
    echoPhase:"setup",echoChapterSet:new Set([0]),quizQuestions:[],quizHint:false,
    echoCustomBook:"all",echoCustomRange:"all",echoRangeStart:1,echoRangeEnd:3,
    chapter:0,quizIndex:0,quizScore:0,quizAnswer:null,
    CHAPTERS:[{title:"第一章"}],VISITED:new Set([0]),
    ECHO_BANK:[
      {type:"fill",ch:0,word:"contract",q:"她签下了一份什么文件？",choices:["contract","promise","identity","evidence"]},
      {type:"spell",ch:0,word:"promise",q:"她曾经许下了一个______",hint:"承诺"}
    ],
    ECHO_TYPES:[{id:"fill",title:"剧情填词",symbol:"▤",desc:"剧情选择"},
      {id:"situation",title:"情境选择",symbol:"✧",desc:"情境选择"},
      {id:"spell",title:"单词找回",symbol:"✎",desc:"主动拼写"}],
    WORDS:{
      contract:{meaning:"合同",phonetic:"/kɒntrækt/",context:"她签订了 contract。"},
      promise:{meaning:"承诺",phonetic:"/ˈprɒmɪs/",context:"她作出了 promise。"},
      identity:{meaning:"身份"},evidence:{meaning:"证据"}
    },
    availablePublishedBooks:()=>[{id:"rose",name:"玫瑰未落幕"}],
    echoAvailableChapters:()=>[0],
    echoCustomChapters:()=>[0],
    dueList:()=>["contract"],
    recordAnswer:(...args)=>answers.push(args),
    safe:x=>String(x).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])),
    speakWord:()=>{},toast:()=>{},showLogin:()=>{},showModal:()=>{},navigate:()=>{},
    confirmEchoExit:()=>{},
    Math,Set,Array,Object,Number,String
  };
  // VM declaration bindings are distinct from context props. Export setters for tests.
  const f=runInNewContext(runtime+"\n({renderQuiz,startEcho,reportExamResult,setMode:v=>{echoMode=v},getMode:()=>echoMode,setPhase:v=>{echoPhase=v},getPhase:()=>echoPhase})",ctx);
  return {f,ctx,answers,$};
}

test("S25 logged-in production readers default to Rose demo with actual questions, not empty cloud Echo",()=>{
  const h=init();
  h.f.renderQuiz();
  assert.match(h.$("echoModeSwitch").innerHTML,/故事演示练习/);
  assert.match(h.$("echoModeSwitch").innerHTML,/当前浏览器/);
  assert.match(h.$("quizContainer").innerHTML,/开始剧情回声/);
  assert.equal(h.ctx.cloudRenders,0);
  assert.equal(typeof h.$("beginEcho").onclick,"function");
  h.$("beginEcho").onclick();
  assert.match(h.$("quizContainer").innerHTML,/STORY ECHO/);
  assert.match(h.$("quizContainer").innerHTML,/1 \/ 2/);
  assert.equal(h.ctx.cloudRenders,0);
});

test("S25 standalone local demo works for guest and records answers locally only",()=>{
  const h=init({loggedIn:false});
  h.f.renderQuiz();
  assert.match(h.$("quizContainer").innerHTML,/演示题库/);
  h.f.startEcho();
  const q=h.ctx.quizQuestions[0];
  assert.ok(q);
  h.f.reportExamResult(q,q.word);
  assert.deepEqual([...h.answers[0]],[q.word,true,false]);
  assert.match(h.$("quizContainer").innerHTML,/演示/);
  assert.equal(h.ctx.cloudRenders,0);
});

test("S25 mode switch activates real cloud Echo only after explicit selection",()=>{
  const h=init();
  h.f.renderQuiz();
  const modeNode=h.$("echoModeSwitch").querySelectorAll("[data-echo-mode]")
    .find(x=>x.dataset.echoMode==="cloud");
  assert.ok(modeNode);
  modeNode.onclick();
  assert.equal(h.f.getMode(),"cloud");
  assert.equal(h.ctx.cloudRenders,1);
  assert.match(h.$("echoModeSwitch").innerHTML,/云端正式练习/);
  const back=h.$("echoModeSwitch").querySelectorAll("[data-echo-mode]")
    .find(x=>x.dataset.echoMode==="demo");
  back.onclick();
  assert.equal(h.f.getMode(),"demo");
  assert.match(h.$("quizContainer").innerHTML,/开始剧情回声/);
  assert.equal(h.ctx.cloudRenders,1);
});

test("S25 cloud Echo displays clear empty state for accounts without completed published chapters",()=>{
  const elements=new Map();
  const document={
    getElementById:id=>{
      if(!elements.has(id))elements.set(id,{innerHTML:"",disabled:false,onclick:null});
      return elements.get(id);
    },
    querySelectorAll:()=>[]
  };
  const window={};
  runInNewContext(cloudJs,{window,document,URLSearchParams,Set,Map,Math,Number,String});
  window.MiaowuCloudEcho.configure({
    progress:()=>[],request:()=>{throw Error("no network allowed")},
    toast:()=>{},speak:()=>{},showModal:()=>{},closeModal:()=>{},navigate:()=>{}
  });
  window.MiaowuCloudEcho.render();
  const markup=elements.get("quizContainer").innerHTML;
  assert.match(markup,/目前还没有已读完的正式云端章节/);
  assert.match(markup,/cloudEchoStart" disabled/);
  assert.match(markup,/故事演示练习/);
});
test("S25 page exposes one mode-switch container and no misleading all-cloud copy",()=>{
  assert.match(page,/id="echoModeSwitch"/);
  assert.doesNotMatch(page,/题目从云端生成，答题记录会保存在账号中/);
  assert.match(js,/if\(echoMode==='cloud'&&window\.MiaowuCloudEcho\)/);
  assert.match(js,/if\(view==='echo'&&echoMode==='demo'&&echoPhase==='playing'/);
});
