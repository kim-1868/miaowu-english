import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../public/claim.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/claim.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../public/claim.css",import.meta.url),"utf8");

function browser({store=new Map(),blocked=false}={}){
 const elements=new Map(),writes=[],requests=[];
 function node(id){
  if(elements.has(id))return elements.get(id);
  const e={id,textContent:"",value:"",hidden:id==="receipt"||id==="copyAllManual",
   disabled:false,options:[],style:{},listeners:{},classList:{toggle(){},add(){}},
   addEventListener(type,fn){this.listeners[type]=fn},
   replaceChildren(...nodes){this.children=nodes;if(id==="package")this.options=[...nodes]},
   add(value){this.options.push(value)},
   scrollIntoView(){},focus(){},select(){this.selected=true}};
  elements.set(id,e);return e;
 }
 const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const document={getElementById:node,createElement:()=>({style:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},remove(){}}),
   body:{append(){}},execCommand(){return !blocked}};
 const context={
  document,window:{sessionStorage},console,
  navigator:{clipboard:{async writeText(value){if(blocked)throw Error("clipboard denied");writes.push(value)}}},
  fetch:async(path)=>{
   requests.push(path);
   return {ok:true,json:async()=>path.endsWith("/categories")?
    {enabled:true,categories:[{slug:"cet4",title:"大学英语四级"}]}:
    {category:{title:"大学英语四级"},
     activationCode:"MW-CET4-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH",
     recoveryKey:"MW-REC-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH"}};
  },
  Option:class{constructor(label,value){this.label=label;this.value=value}}
 };
 runInNewContext(source,context,{filename:"public/claim.js"});
 return {node,writes,requests,store};
}
async function issue(b){
 await new Promise(r=>setImmediate(r));
 b.node("order").value="20261106000123456789";
 b.node("package").value="cet4";
 await b.node("claimForm").listeners.submit({preventDefault(){}});
}
test("V41 approved welcome and bottommost pale thanks display in the correct layout",()=>{
 assert.match(html,/欢迎来到妙屋英语.*WordLetter！/);
 assert.match(html,/感谢你的购买！你的专属英语故事书架正在等你开启/);
 assert.match(html,/愿你在每一个精彩的故事里，遇见新的单词，也收获阅读的小快乐/);
 assert.match(html,/id="copyVoucher"/);
 assert.match(html,/id="copyRecovery"/);
 assert.match(html,/id="copyAll"/);
 assert.match(html,/一键复制完整领取信息/);
 assert.match(html,/id="receiptOrder"/);
 assert.match(html,/id="copyAllText".*readonly/);
 assert.match(html,/<section id="recoveryDetails"/);
 assert.doesNotMatch(html,/<details id="recoveryDetails"/);
 const closing=html.indexOf("感谢你选择妙屋英语，祝你阅读愉快！💕");
 assert.ok(closing>html.indexOf("id=\"copyAll\""));
 assert.ok(closing>html.indexOf("foot-note"));
 assert.equal((html.match(/感谢你选择妙屋英语，祝你阅读愉快！💕/g)||[]).length,1);
 assert.match(css,/\.closing-wish/);
 assert.match(css,/\.claim-welcome/);
 assert.match(css,/\.save-all-panel/);
});
test("V41 full receipt copies exact five fields; individual buttons copy ONLY their respective code",async()=>{
 const b=browser();
 await issue(b);
 const activation=b.node("voucher").textContent;
 const recovery=b.node("recovery").textContent;
 const order=b.node("receiptOrder").textContent;
 assert.equal(order,"20261106000123456789");
 await b.node("copyAll").listeners.click();
 assert.equal(b.writes.length,1);
 const full=b.writes[0];
 for(const line of ["妙屋英语 WordLetter","大学英语四级",order,activation,recovery,
   "https://miaowu-english-pages.pages.dev/"])
  assert.ok(full.includes(line),"missing archival field: "+line);
 assert.match(full,/兑换时只粘贴「学习兑换码」/);
 assert.equal(b.node("voucher").textContent,activation);
 assert.equal(b.node("recovery").textContent,recovery);
 assert.equal(b.node("receipt").hidden,false);
 assert.match(b.node("copyAllHint").textContent,/备忘录/);
 await b.node("copyVoucher").listeners.click();
 await b.node("copyRecovery").listeners.click();
 assert.deepEqual(b.writes.slice(1),[activation,recovery]);
 assert.equal(b.node("voucher").textContent,activation);
 assert.equal(b.node("recovery").textContent,recovery);
});
test("V41 full receipt and order are restored after same-tab refresh without another issuance",async()=>{
 const store=new Map();
 const first=browser({store});
 await issue(first);
 const second=browser({store});
 assert.equal(second.requests.length,0);
 assert.equal(second.node("receiptOrder").textContent,"20261106000123456789");
 await second.node("copyAll").listeners.click();
 assert.equal(second.writes.length,1);
 assert.match(second.writes[0],/小红书订单编号：20261106000123456789/);
 assert.match(second.writes[0],/MW-REC-ABCDEFGH/);
 assert.equal(second.node("receipt").hidden,false);
});
test("V41 in-app clipboard restrictions reveal selectable manual copy; never erase credentials",async()=>{
 const b=browser({blocked:true});
 await issue(b);
 const original=b.node("voucher").textContent;
 await b.node("copyAll").listeners.click();
 assert.equal(b.node("copyAllManual").hidden,false);
 assert.match(b.node("copyAllText").value,/妙屋英语 WordLetter/);
 assert.match(b.node("copyAllText").value,/小红书订单编号/);
 assert.equal(b.node("copyAllText").selected,true);
 assert.equal(b.node("voucher").textContent,original);
});
test("V41 previously-issued V36 receipt remains accessible with clear order fallback",async()=>{
 const store=new Map([["mw:claim:receipt:v36",JSON.stringify({
  categoryTitle:"大学英语四级",
  activationCode:"MW-CET4-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH",
  recoveryKey:"MW-REC-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH"
 })]]);
 const b=browser({store});
 assert.equal(b.requests.length,0);
 assert.equal(b.node("receiptOrder").textContent,"请查看小红书订单详情");
 await b.node("copyAll").listeners.click();
 assert.match(b.writes[0],/小红书订单编号：请查看小红书订单详情/);
});
