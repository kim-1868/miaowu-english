import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";

const origin="https://merchant-test.invalid";
const pepper="S127_FAKE_PRODUCTION_ACTIVATION_PEPPER_LOCAL_ONLY_2026";
const opsPepper="S127_FAKE_OPS_TOKEN_PEPPER_LOCAL_ONLY_2026";
const token="mwops_"+"a".repeat(64);
const password="merchant-test-password-2026";
class DB{
 constructor(){
  this.db=new DatabaseSync(":memory:");
  for(const file of ["001_schema.sql","002_s1.sql","003_public_categories.sql",
   "007_ops_identity_audit.sql"]){
   this.db.exec(readFileSync(new URL("../db/"+file,import.meta.url),"utf8"));
  }
  for(const file of ["001_one_paid_order_one_code.sql","003_paid_order_recovery.sql"]){
   this.db.exec(readFileSync(new URL("../db/production/"+file,import.meta.url),"utf8"));
  }
  this.db.exec(`INSERT INTO books(id,category_id,title,status)
   VALUES('live-cet4','cet4','Local Test Only','published');
   INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
   VALUES('ch1','live-cet4',1,'Test','{"paragraphs":["fixture"]}',0,CURRENT_TIMESTAMP);`);
 }
 prepare(sql){
  const db=this.db;
  const bound=(args=[])=>{const q=db.prepare(sql);return {
    first:async()=>q.get(...args)??null,
    all:async()=>({results:q.all(...args)}),
    run:async()=>({meta:q.run(...args),success:true})
  }};
  return {...bound(),bind(...args){return bound(args)}};
 }
 async batch(items){
  this.db.exec("BEGIN IMMEDIATE");
  try{const out=[];for(const item of items)out.push(await item.run());
   this.db.exec("COMMIT");return out;
  }catch(e){this.db.exec("ROLLBACK");throw e}
 }
 close(){this.db.close()}
}
const env=db=>({APP_ENV:"production",DB:db,ACTIVATION_PEPPER:pepper,
 ORDER_RECOVERY_ENABLED:"true",OPS_SALES_ENABLED:"true",OPS_CONSOLE_ENABLED:"true",
 OPS_TOKEN_PEPPER:opsPepper,ASSETS:{fetch:async()=>new Response("OK")}
});
function req(path,method="GET",data,secret=token){
 const headers={Origin:origin};
 if(secret)headers["X-Mw-Ops-Key"]=secret;
 if(data!==undefined)headers["Content-Type"]="application/json";
 return new Request(origin+path,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
test("merchant issue requires a verified publisher; enforces category content, one order, one activation and recovery key",async()=>{
 const db=new DB();
 try{
  const digest=await digestOpsToken(token,opsPepper);
  db.db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("merchant-owner","Test Owner","publisher","production",digest);
  const app=env(db);
  const url="/api/ops/sales/issue";
  assert.equal((await worker.fetch(req(url,"POST",{categoryId:"cet4"},null),app)).status,401);
  assert.equal((await worker.fetch(req(url,"POST",{},token),{...app,OPS_SALES_ENABLED:"false"})).status,403);
  let res=await worker.fetch(req("/api/ops/sales/categories"),app);
  assert.equal(res.status,200);
  const catalog=(await res.json()).categories;
  assert.equal(catalog.find(c=>c.slug==="cet4").issuable,true);
  assert.equal(catalog.find(c=>c.slug==="cet6").issuable,false);
  const sale={categoryId:"cet4",orderReference:"20261103-UNIT001",paymentConfirmed:true,contentConfirmed:true};
  assert.equal((await worker.fetch(req(url,"POST",{...sale,paymentConfirmed:false}),app)).status,400);
  assert.equal((await worker.fetch(req(url,"POST",{...sale,categoryId:"cet6"}),app)).status,409);
  res=await worker.fetch(req(url,"POST",sale),app);
  assert.equal(res.status,201);
  const issued=await res.json();
  assert.match(issued.activationCode,/^MW-CET4-/);
  assert.match(issued.recoveryKey,/^MW-REC-/);
  assert.ok(!JSON.stringify(db.db.prepare("SELECT * FROM activation_codes").all()).includes(issued.activationCode));
  assert.ok(!JSON.stringify(db.db.prepare("SELECT * FROM order_recovery_credentials").all()).includes(issued.recoveryKey));
  assert.equal((await worker.fetch(req(url,"POST",sale),app)).status,409);
  assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM activation_codes WHERE order_reference=?").get("ORD-20261103-UNIT001").n,1);
  assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM ops_audit_events WHERE event_type='sale.issue'").get().n,1);
  const status=await worker.fetch(req("/api/ops/sales/status","POST",{orderReference:"20261103-UNIT001"}),app);
  assert.equal(status.status,200);
  assert.equal((await status.json()).order.status,"unused");
  const signup=await worker.fetch(req("/api/auth/register","POST",{
    username:"test-buyer",password,activationCode:issued.activationCode
  },null),app);
  assert.equal(signup.status,201);
  assert.equal((await worker.fetch(req("/api/auth/register","POST",{
    username:"second-buyer",password,activationCode:issued.activationCode
  },null),app)).status,409);
  const reset={username:"test-buyer",orderReference:"20261103-UNIT001",
    recoveryKey:issued.recoveryKey,newPassword:"buyer-reset-password-2026"};
  assert.equal((await worker.fetch(req("/api/auth/recover-by-order","POST",
    {...reset,recoveryKey:"MW-REC-"+("0".repeat(40))},null),app)).status,401);
  const changed=await worker.fetch(req("/api/auth/recover-by-order","POST",reset,null),app);
  assert.equal(changed.status,200);
  assert.notEqual((await changed.json()).recoveryKey,issued.recoveryKey);
  assert.equal((await worker.fetch(req("/api/auth/recover-by-order","POST",reset,null),app)).status,401);
  const after=await worker.fetch(req("/api/ops/sales/status","POST",{orderReference:"20261103-UNIT001"}),app);
  assert.equal((await after.json()).order.status,"redeemed");
  assert.equal(db.db.prepare("SELECT reset_count FROM order_recovery_credentials").get().reset_count,1);
 }finally{db.close()}
});
