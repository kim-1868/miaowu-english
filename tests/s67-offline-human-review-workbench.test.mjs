import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {buildRainyNightOfflineReviewWorkbench} from
 "../scripts/build-rainy-night-offline-review-workbench.mjs";
import {buildRainyNightReviewLedger,validateRainyNightReviewLedger} from
 "../scripts/build-rainy-night-review-ledger.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const bundle=composeRainyNightSeasonDraft().bundle;
const jsPath=fileURLToPath(new URL("../scripts/rainy-night-offline-workbench-client.js",import.meta.url));
const generatorPath=fileURLToPath(new URL("../scripts/build-rainy-night-offline-review-workbench.mjs",import.meta.url));

test("S67 private HTML embeds full 957-source ledger and source-aligned review cards",()=>{
 const {html,summary}=buildRainyNightOfflineReviewWorkbench(bundle);
 const ledger=buildRainyNightReviewLedger(bundle);
 assert.equal(summary.totalReviewUnits,957);
 assert.equal(summary.reviewDecisionsSaved,0);
 assert.equal(summary.publicationAllowed,false);
 assert.equal((html.match(/data-kind="word"/g)||[]).length,188);
 assert.equal((html.match(/data-kind="context"/g)||[]).length,733);
 assert.equal((html.match(/data-kind="echo"/g)||[]).length,36);
 assert.ok(html.includes('id="human-review-export"'));
 assert.ok(html.includes('id="human-review-import"'));
 assert.ok(html.includes('id="human-review-save"'));
 const match=html.match(/<script id="human-ledger-data" type="application\/json">([\s\S]*?)<\/script>/);
 assert.ok(match,"embedded ledger not found");
 assert.ok(!match[1].includes("<"));
 const embedded=JSON.parse(match[1]);
 assert.equal(embedded.manuscriptDigest,ledger.manuscriptDigest);
 assert.equal(embedded.rows.length,957);
 assert.equal(validateRainyNightReviewLedger(bundle,embedded).valid,true);
 assert.equal(evaluateRainyNightPublicationGate(bundle).status,"BLOCKED");
});
test("S67 script and HTML are offline-only, escaped and prohibit server or browser auto-persistence",()=>{
 const source=readFileSync(jsPath,"utf8");
 const {html}=buildRainyNightOfflineReviewWorkbench(bundle);
 assert.ok(!source.includes("fetch("));
 assert.ok(!source.includes("localStorage"));
 assert.ok(!source.includes("sessionStorage"));
 assert.match(html,/connect-src &#39;none&#39;/);
 assert.ok(!html.includes('src="https:'));
 assert.ok(!html.includes('<form'));
 assert.ok(!html.includes('data-review-status="APPROVED"'));
 const syntax=spawnSync(process.execPath,["--check",jsPath],{encoding:"utf8"});
 assert.equal(syntax.status,0,syntax.stderr);
 const dangerous=structuredClone(bundle);
 dangerous.words[0].exampleEn='<script>alert("manuscript")</script>';
 const bad=buildRainyNightOfflineReviewWorkbench(dangerous).html;
 assert.ok(!bad.includes('<script>alert("manuscript")</script>'));
 assert.ok(bad.includes("\\u003cscript"));
});
test("S67 offline CLI writes only when explicitly requested and refuses overwrite",()=>{
 const temp=mkdtempSync(join(tmpdir(),"miaowu-s67-"));
 try{
  const summary=spawnSync(process.execPath,[generatorPath,"--summary"],{cwd:temp,encoding:"utf8"});
  assert.equal(summary.status,0,summary.stderr);
  assert.equal(existsSync(join(temp,"private-output")),false);
  const built=spawnSync(process.execPath,[generatorPath,"--write-private"],{cwd:temp,encoding:"utf8"});
  assert.equal(built.status,0,built.stderr);
  const output=join(temp,"private-output","rainy-night-s1-PRIVATE-HUMAN-REVIEW-WORKBENCH.html");
  assert.ok(existsSync(output));
  assert.ok(readFileSync(output,"utf8").includes("离线逐项审校工作台"));
  const second=spawnSync(process.execPath,[generatorPath,"--write-private"],{cwd:temp,encoding:"utf8"});
  assert.notEqual(second.status,0);
  assert.equal(existsSync(join(temp,"public")),false);
 }finally{rmSync(temp,{recursive:true,force:true})}
});
test("S67 real offline JS interaction records explicit review and rejects stale imported manuscript",async()=>{
 const ledger=buildRainyNightReviewLedger(bundle);
 class Element{
  constructor(owner){this.ownerDocument=owner;this.events={};this.children=[];this.attributes={};
   this.value="";this.textContent="";this.hidden=false;this.files=null;this.size=0;}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k]}
  addEventListener(k,fn){this.events[k]=fn}
  appendChild(el){this.children.push(el);return el}
  scrollIntoView(){}
  click(){if(this.events.click)this.events.click()}
  remove(){}
 }
 const doc={};
 const elements=new Map();
 const ids=["human-ledger-data","review-workbench","human-review-count",
  "human-review-editor","human-review-item","human-review-message",
  "human-review-decision","human-review-reviewer","human-review-note",
  "human-review-evidence","human-review-save","human-review-import",
  "human-review-export"];
 ids.forEach(id=>elements.set(id,new Element(doc)));
 elements.get("human-ledger-data").textContent=JSON.stringify(ledger);
 doc.getElementById=id=>elements.get(id);
 const cards={
  word:Array.from({length:188},()=>new Element(doc)),
  context:Array.from({length:733},()=>new Element(doc)),
  echo:Array.from({length:36},()=>new Element(doc))
 };
 const buttons=[];
 doc.querySelectorAll=selector=>{
  if(selector.startsWith('[data-kind="'))return cards[selector.match(/"(.+?)"/)[1]];
  if(selector==="[data-human-review-button]")return buttons;
  return [];
 };
 doc.createElement=tag=>{
  const node=new Element(doc);
  if(tag==="button"){
   const original=node.setAttribute.bind(node);
   node.setAttribute=(k,v)=>{
    original(k,v);
    if(k==="data-human-review-button")buttons.push(node);
   };
  }
  return node;
 };
 doc.body=new Element(doc);
 let exported=null;
 const api={createObjectURL:()=> "blob:local-only",revokeObjectURL:()=>{}};
 const source=readFileSync(jsPath,"utf8");
 runInNewContext(source,{document:doc,URL:api,Blob:class{
  constructor(parts){exported=parts.join("");}
 },Date,JSON,Set,Map,Array,String,Number,Error,setTimeout:()=>{}});
 assert.equal(buttons.length,957);
 buttons[0].click();
 assert.equal(elements.get("human-review-editor").hidden,false);
 elements.get("human-review-decision").value="REVIEWED_OK";
 elements.get("human-review-reviewer").value="reviewer-01";
 elements.get("human-review-note").value="Checked bilingual word usage and source evidence.";
 elements.get("human-review-evidence").value="private-note-A1";
 elements.get("human-review-save").click();
 assert.match(elements.get("human-review-count").textContent,/已标记复核 1 项/);
 elements.get("human-review-export").click();
 const saved=JSON.parse(exported);
 assert.equal(saved.rows[0].decision,"REVIEWED_OK");
 assert.equal(validateRainyNightReviewLedger(bundle,saved).valid,true);
 const importElement=elements.get("human-review-import");
 const stale=structuredClone(saved);
 stale.rows[0].sourceHash="b".repeat(64);
 importElement.files=[{size:300_000,text:async()=>JSON.stringify(stale)}];
 await importElement.events.change({currentTarget:importElement});
 assert.match(elements.get("human-review-message").textContent,/导入失败/);
 assert.match(elements.get("human-review-count").textContent,/已标记复核 1 项/);
 importElement.files=[{size:300_000,text:async()=>JSON.stringify(saved)}];
 await importElement.events.change({currentTarget:importElement});
 assert.match(elements.get("human-review-message").textContent,/已导入匹配当前原稿/);
 assert.match(elements.get("human-review-count").textContent,/已标记复核 1 项/);
});
