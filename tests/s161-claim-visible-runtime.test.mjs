import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../public/claim.js",import.meta.url),"utf8");
function browser(session){
 const elements=new Map();
 function node(id){
  if(elements.has(id))return elements.get(id);
  const e={id,textContent:"",value:"",hidden:false,disabled:false,listeners:{},style:{},options:[],
   classList:{toggle(){},add(){}},
   addEventListener(type,cb){this.listeners[type]=cb;},
   replaceChildren(...x){this.children=x},add(x){this.options.push(x)},
   scrollIntoView(){},focus(){}};
  elements.set(id,e);return e;
 }
 const writes=[],requests=[];
 const document={getElementById:node,createElement:()=>({style:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},remove(){}}),
   body:{append(){}}};
 const window={sessionStorage:session};
 const context={document,window,console,
  navigator:{clipboard:{async writeText(s){writes.push(s)}}},
  fetch:async(path)=>{
   requests.push(path);
   return {ok:true,json:async()=>path.endsWith("/categories")?
     {enabled:true,categories:[{slug:"cet4",title:"大学英语四级"}]}:
     {category:{title:"大学英语四级"},
      activationCode:"MW-CET4-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH",
      recoveryKey:"MW-REC-ABCDEFGH-12345678-ABCDEFGH-12345678-ABCDEFGH"}}
  },
  Option:class {constructor(text,value){this.text=text;this.value=value;}}
 };
 runInNewContext(source,context,{filename:"claim.js"});
 return {node,writes,requests,window};
}
test("V36: copy leaves both strings intact, refresh restores without second issue",async()=>{
 const store=new Map(),session={setItem(k,v){store.set(k,v)},getItem(k){return store.get(k)||null}};
 const b=browser(session);
 await new Promise(r=>setImmediate(r));
 b.node("order").value="123456789012345";b.node("package").value="cet4";
 await b.node("claimForm").listeners.submit({preventDefault(){}});
 const activation=b.node("voucher").textContent;
 const recovery=b.node("recovery").textContent;
 assert.match(activation,/^MW-CET4-/);assert.match(recovery,/^MW-REC-/);
 assert.equal(b.node("receipt").hidden,false);
 await b.node("copyVoucher").listeners.click();
 assert.deepEqual(b.writes,[activation]);
 assert.equal(b.node("voucher").textContent,activation);
 assert.equal(b.node("recovery").textContent,recovery);
 await b.node("copyRecovery").listeners.click();
 assert.deepEqual(b.writes,[activation,recovery]);
 const again=browser(session);
 assert.equal(again.node("voucher").textContent,activation);
 assert.equal(again.node("recovery").textContent,recovery);
 assert.equal(again.node("receipt").hidden,false);
 assert.equal(again.node("claimForm").hidden,true);
 assert.equal(again.requests.length,0,"refresh must not reissue any code");
});
