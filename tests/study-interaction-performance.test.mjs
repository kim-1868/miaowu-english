import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const drain=async()=>{await Promise.resolve();await Promise.resolve();
  await new Promise(resolve=>setImmediate(resolve));};

function fakeDom(hostId){
  const elements=new Map(),choices=[];
  function element(id){
    let markup="",label="";
    const el={id,onclick:null,dataset:{},disabled:false,value:"",
      get innerHTML(){return markup;},
      set innerHTML(value){
        markup=String(value);
        for(const match of markup.matchAll(/id="([^"]+)"/g))
          elements.set(match[1],element(match[1]));
        if(id===hostId){
          choices.length=0;
          for(const m of markup.matchAll(/<button[^>]*data-choice="([^"]+)"[^>]*data-choice-id="([^"]+)"/g)){
            const option=element("choice-"+m[2]);
            option.dataset.choice=m[1];option.dataset.choiceId=m[2];
            option.closest=()=>({dataset:{choiceId:m[2]}});
            choices.push(option);
          }
        }
      },
      get textContent(){return label;},
      set textContent(value){label=String(value);},
      focus(){},
      querySelectorAll(){return [];},
      querySelector(selector){
        return selector.startsWith("#")?elements.get(selector.slice(1))||null:null;
      }};
    return el;
  }
  const host=element(hostId);
  elements.set(hostId,host);
  return {host,elements,choices,document:{
    getElementById:id=>elements.get(id)||null,
    querySelectorAll:selector=>selector==="[data-choice]"?choices:[]
  }};
}

test("quick flashcards show feedback and next word before the server responds",async()=>{
  const ui=fakeDom("flashcardTrainer"),timers=[],requests=[];
  const browser={addEventListener(){}};
  runInNewContext(source("public/flashcards.js"),{
    document:ui.document,window:browser,
    crypto:{randomUUID:()=> "00000000-0000-4000-8000-000000000001"},
    navigator:{vibrate(){}},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;}
  });
  browser.MiaowuFlashcards.configure({
    user:()=>"synthetic",saved:()=>2,due:()=>0,
    login(){},speak(){},toast(){},refresh(){},
    request:async(path,method,body)=>{
      if(path.startsWith("/api/me/flashcards?"))
        return {total:2,words:[
          {word_id:"one",headword:"alpha",meaning_zh:"a"},
          {word_id:"two",headword:"bravo",meaning_zh:"b"}]};
      return new Promise((resolve,reject)=>requests.push({body,resolve,reject}));
    }
  });
  browser.MiaowuFlashcards.render({loggedIn:true,saved:2,due:0,sessionKey:"synthetic"});
  ui.elements.get("flashStartFlip").onclick();
  await drain();
  ui.elements.get("flashFlip").onclick();
  ui.elements.get("flashKnown").onclick();
  assert.match(ui.host.innerHTML,/记住了，喵呜/);
  await drain();
  assert.equal(requests.length,1);
  timers.find(x=>x.ms===220).fn();
  assert.match(ui.host.innerHTML,/bravo/); // first save still pending
  requests[0].reject(new Error("synthetic timeout"));
  await drain();
  assert.match(ui.elements.get("flashSyncState").innerHTML,/尚未保存/);
  ui.elements.get("flashRetrySync").onclick();
  await drain();
  assert.equal(requests.length,2);
  assert.equal(requests[0].body.requestId,requests[1].body.requestId);
  requests[1].resolve({saved:true,correct:true,nextReviewDays:1});
  await drain();
  assert.doesNotMatch(ui.elements.get("flashSyncState").innerHTML,/尚未保存/);
});

test("spelling check reveals an answer before its cloud write completes",async()=>{
  const ui=fakeDom("flashcardTrainer"),requests=[];
  const browser={addEventListener(){}};
  runInNewContext(source("public/flashcards.js"),{
    document:ui.document,window:browser,
    crypto:{randomUUID:()=> "00000000-0000-4000-8000-000000000003"},
    navigator:{},setTimeout
  });
  browser.MiaowuFlashcards.configure({
    user:()=>"synthetic",saved:()=>2,due:()=>0,
    login(){},speak(){},toast(){},refresh(){},
    request:async(path,method,body)=>{
      if(path.startsWith("/api/me/flashcards?"))return {total:2,words:[
        {word_id:"one",headword:"alpha",meaning_zh:"a"},
        {word_id:"two",headword:"bravo",meaning_zh:"b"}]};
      return new Promise(resolve=>requests.push({body,resolve}));
    }
  });
  browser.MiaowuFlashcards.render({loggedIn:true,saved:2,due:0,sessionKey:"synthetic"});
  ui.elements.get("flashStartSpell").onclick();
  await drain();
  ui.elements.get("flashAnswer").value="ALPHA";
  ui.elements.get("flashSubmit").onclick();
  assert.match(ui.host.innerHTML,/记住了，喵呜/);
  assert.ok(ui.elements.get("flashNext"));
  ui.elements.get("flashNext").onclick();
  assert.match(ui.host.innerHTML,/class="flash-meaning">b<\/h3>/);
  assert.match(ui.host.innerHTML,/2 \/ 2/);
  await drain();
  assert.equal(requests.length,1);
  requests[0].resolve({saved:true,correct:true,nextReviewDays:1});
  await drain();
});

test("story echo immediately reveals answer, retries with the same idempotency key",async()=>{
  const ui=fakeDom("quizContainer"),requests=[];
  const browser={};
  const words=[
    {word_id:"w1",headword:"alpha",chapter_id:"c1",meaning_zh:"a",
      context_sentence:"alpha is here"},
    {word_id:"w2",headword:"bravo",chapter_id:"c1",meaning_zh:"b",
      context_sentence:"bravo is here"}];
  runInNewContext(source("public/echo-cloud.js"),{
    document:ui.document,window:browser,URLSearchParams,
    crypto:{randomUUID:()=> "00000000-0000-4000-8000-000000000004"}
  });
  browser.MiaowuCloudEcho.configure({
    progress:()=>[{completed_at:"now",book_id:"book",book_title:"Sample"}],
    login(){},toast(){},speak(){},refresh(){},showModal(){},closeModal(){},navigate(){},
    request:async(path,method,body)=>{
      if(path.includes("/available"))return {words,availableGames:["fill","situation","spell"]};
      return new Promise((resolve,reject)=>requests.push({body,resolve,reject}));
    }
  });
  browser.MiaowuCloudEcho.render();
  ui.elements.get("cloudEchoStart").onclick();
  await drain();
  assert.ok(ui.choices.length);
  ui.choices[0].onclick();
  assert.match(ui.host.innerHTML,/正在同步云端/);
  assert.match(ui.host.innerHTML,/quiz-response/);
  await drain();
  assert.equal(requests.length,1);
  requests[0].reject(new Error("synthetic timeout"));
  await drain();
  assert.match(ui.host.innerHTML,/保存失败，请重试/);
  ui.elements.get("cloudEchoRetry").onclick();
  await drain();
  assert.equal(requests.length,2);
  assert.equal(requests[0].body.requestId,requests[1].body.requestId);
  requests[1].resolve({correct:true,expected:"alpha",meaning:"a",
    phonetic:"",context:"alpha is here",nextReviewDays:3});
  await drain();
  assert.match(ui.host.innerHTML,/复习已保存/);
});

test("wordbook is edited per card and mobile controls keep pinch zoom",()=>{
  const app=source("public/app.js");
  const start=app.indexOf("async function update(id,bookmarked,status)");
  assert.ok(start>0);
  const block=app.slice(start,app.indexOf("function confirmEchoExit",start));
  assert.match(block,/card\.classList\.toggle\('status-mastered'/);
  assert.match(block,/await serverRequest\('\/api\/me\/words\//);
  assert.doesNotMatch(block,/refreshCloudLearning\(\)|wordbookData=null;renderWords\(\)/);
  const css=source("public/flashcards.css");
  assert.match(css,/touch-action:\s*manipulation/);
  assert.match(css,/font-size:16px/);
  assert.doesNotMatch(source("public/index.html"),/user-scalable=no/);
});
