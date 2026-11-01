import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/styles.css",import.meta.url),"utf8");
const start=js.indexOf("    function renderWords(){");
const end=js.indexOf("    function confirmEchoExit(",start);
assert.ok(start>=0&&end>start,"real bookplate renderer must exist");
const renderSource=js.slice(start,end);
const demoWord=word=>({
  phonetic:"/wəːd/",part:"n.",meaning:"释义",context:"故事中的 "+word,
  example:"Example for "+word,translation:"测试例句",
  collocations:[["learn "+word,"学习搭配"]]
});
function harness({loggedIn=true,cloudWords=[],demoWords=["contract","promise"]}={}){
  const elements={
    vocabGrid:{innerHTML:""}, bookplateCount:{textContent:""}
  };
  const state={
    wordFilter:"all",user:loggedIn?{name:"reader_a"}:null,
    cloudSaved:new Map(cloudWords.map(w=>[w.word_id,w])),
    saved:new Set(demoWords),mastered:new Set(["promise"]),
    WORDS:{contract:demoWord("contract"),promise:demoWord("promise")},
    speakWord:()=>{},navigate:()=>{},showLogin:()=>{},
    toast:()=>{},saveWords:()=>{state.savedCount++},savedCount:0,
    safe:s=>String(s).replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c])),
    $:id=>elements[id]||(elements[id]={textContent:"",innerHTML:""}),
    serverRequest:()=>{throw Error("local demo controls must not call cloud API")},
    refreshCloudLearning:()=>{throw Error("local demo controls must not refresh cloud")}
  };
  const selectorCache=new Map();
  state.document={
    querySelectorAll(selector){
      if(selector==="[data-word-filter]")return [];
      const cacheKey=selector+'|'+elements.vocabGrid.innerHTML;
      if(selectorCache.has(cacheKey))return selectorCache.get(cacheKey);
      const names=[...selector.matchAll(/data-([a-z-]+)/g)].map(m=>m[1]);
      const buttons=[...elements.vocabGrid.innerHTML.matchAll(/<button\b([^>]*)>/g)];
      const nodes=buttons.map(match=>{
        const attrs=match[1],dataset={};
        for(const a of attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)){
          const key=a[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
          dataset[key]=a[2];
        }
        return {dataset,onclick:null,disabled:false};
      }).filter(button=>names.some(n=>Object.prototype.hasOwnProperty.call(
        button.dataset,n.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()))));
      selectorCache.set(cacheKey,nodes);
      return nodes;
    }
  };
  const render=runInNewContext(renderSource+"\nrenderWords",state);
  return {render,state,elements,buttons:s=>state.document.querySelectorAll(s)};
}

test("S24 production bookplates show all previously saved Rose demo words without cloud access",()=>{
  const h=harness();
  h.render();
  const html=h.elements.vocabGrid.innerHTML;
  assert.match(html,/本机演示收藏 · 《玫瑰未落幕》/);
  assert.match(html,/contract/);
  assert.match(html,/promise/);
  assert.match(html,/故事中的 contract/);
  assert.match(html,/Example for promise/);
  assert.match(html,/仅保存在当前浏览器，不与账号同步/);
  assert.equal(h.elements.bookplateCount.textContent,"2");
});

test("S24 demo mastered and removed changes remain local and respect filters",()=>{
  const h=harness();
  h.render();
  const toggle=h.buttons("[data-demo-master]").find(x=>x.dataset.demoMaster==="contract");
  assert.ok(toggle);
  toggle.onclick();
  assert.equal(h.state.mastered.has("contract"),true);
  assert.equal(h.state.savedCount,1);
  h.state.wordFilter="mastered";
  h.render();
  assert.match(h.elements.vocabGrid.innerHTML,/contract/);
  const remove=h.buttons("[data-demo-remove]").find(x=>x.dataset.demoRemove==="contract");
  remove.onclick();
  assert.equal(h.state.saved.has("contract"),false);
  assert.equal(h.state.savedCount,2);
  assert.equal(h.elements.bookplateCount.textContent,"1");
  h.state.wordFilter="learning";
  h.render();
  assert.match(h.elements.vocabGrid.innerHTML,/这个筛选下暂无藏书票/);
});

test("S24 guest still sees locally saved demo cards but never cloud account data",()=>{
  const h=harness({loggedIn:false,demoWords:["contract"]});
  h.render();
  assert.match(h.elements.vocabGrid.innerHTML,/本机演示收藏/);
  assert.match(h.elements.vocabGrid.innerHTML,/contract/);
  assert.equal(h.elements.bookplateCount.textContent,"1");
  assert.doesNotMatch(h.elements.vocabGrid.innerHTML,/登录后，打开你的云端藏书票/);
});

test("S24 cloud and local cards are distinctly labeled without merging identifiers",()=>{
  const cloudWord={word_id:"official-contract",headword:"contract",status:"learning",
    phonetic_uk:"/kontrakt/",part_of_speech:"n.",meaning_zh:"合同",
    context_sentence:"Cloud-only context",example_en:"Cloud example",example_zh:"云端例句",
    collocations:[]};
  const h=harness({cloudWords:[cloudWord],demoWords:["contract"]});
  h.render();
  const html=h.elements.vocabGrid.innerHTML;
  assert.match(html,/☁ 云端收藏 · 已同步到账号/);
  assert.match(html,/本机演示收藏 · 《玫瑰未落幕》/);
  assert.match(html,/data-cloud-master="official-contract"/);
  assert.match(html,/data-demo-master="contract"/);
  assert.equal(h.elements.bookplateCount.textContent,"2");
  assert.match(css,/bookplate-source-summary/);
});
