import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const js=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
const a=js.indexOf("    function renderWords(){");
const b=js.indexOf("    function confirmEchoExit(",a);
assert.ok(a>=0&&b>a);
function harness({loggedIn=true,cloudWords=[],localDemo=["contract"]}={}){
 const nodes=new Map();
 const $=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:"",textContent:"",onclick:null});
  return nodes.get(id);
 };
 const words=new Map(cloudWords.map(w=>[w.word_id,w]));
 const ctx={
  $,document:{querySelectorAll:()=>[]},wordFilter:"all",
  user:loggedIn?{name:"buyer_a"}:null,cloudSaved:words,
  saved:new Set(localDemo),
  safe:s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
  navigate:()=>{},showLogin:()=>{},toast:()=>{},speakWord:()=>{},
  renderExampleWords:s=>String(s), // extracted renderWords harness, actual tokenizer tested separately
  serverRequest:()=>{throw Error("no remote request during render")},
  refreshCloudLearning:()=>{}
 };
 const render=runInNewContext(js.slice(a,b)+"\nrenderWords",ctx);
 return {render,ctx,$};
}
const cloudWord={word_id:"vocab-contract",headword:"contract",status:"learning",
 phonetic_uk:"/ˈkɒntrækt/",part_of_speech:"n.",meaning_zh:"合同",
 context_sentence:"她签下 contract。",example_en:"She signed a contract.",
 example_zh:"她签了合同。",collocations:[]};
test("S24 commercial wordbook only lists authenticated cloud bookmarks, not saved demo words",()=>{
 const h=harness({cloudWords:[cloudWord]});
 h.render();
 const content=h.$("vocabGrid").innerHTML;
 assert.match(content,/contract/);
 assert.match(content,/已同步词卡 1/);
 assert.match(content,/data-cloud-master="vocab-contract"/);
 assert.match(content,/data-cloud-remove="vocab-contract"/);
 assert.doesNotMatch(content,/本机演示|《玫瑰未落幕》|data-demo-/);
 assert.equal(h.$("bookplateCount").textContent,"1");
});
test("S24 guests cannot see local demo content as paid wordbooks",()=>{
 const h=harness({loggedIn:false,localDemo:["contract"]});h.render();
 assert.match(h.$("vocabGrid").innerHTML,/登录后，打开你的云端生词本/);
 assert.doesNotMatch(h.$("vocabGrid").innerHTML,/contract|本机演示/);
 assert.equal(h.$("bookplateCount").textContent,"0");
});
test("S24 mastered/learning filters work exclusively from cloud word status",()=>{
 const h=harness({cloudWords:[cloudWord,{...cloudWord,word_id:"vocab-record",headword:"record",status:"mastered"}]});
 h.ctx.wordFilter="mastered";h.render();
 assert.match(h.$("vocabGrid").innerHTML,/record/);
 assert.doesNotMatch(h.$("vocabGrid").innerHTML,/<h3>contract<\/h3>/);
 h.ctx.wordFilter="learning";h.render();
 assert.match(h.$("vocabGrid").innerHTML,/<h3>contract<\/h3>/);
 assert.doesNotMatch(h.$("vocabGrid").innerHTML,/<h3>record<\/h3>/);
});
