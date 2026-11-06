import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";

const origin="https://claim-qa.example";
const opsToken="mwops_"+"a".repeat(64),opsSecret="test_ops_self_claim_secret_is_not_for_production_2026";
const pepper="test_voucher_self_claim_secret_is_not_for_production_2026";
class D1 {
 constructor(){
  this.sql=new DatabaseSync(":memory:");
  for(const name of ["001_schema.sql","002_s1.sql","003_public_categories.sql","007_ops_identity_audit.sql"])
   this.sql.exec(readFileSync(new URL("../db/"+name,import.meta.url),"utf8"));
  for(const name of ["001_one_paid_order_one_code.sql","002_account_recovery_codes.sql",
    "003_paid_order_recovery.sql","007_self_service_claims.sql"])
   this.sql.exec(readFileSync(new URL("../db/production/"+name,import.meta.url),"utf8"));
  this.sql.exec(`INSERT INTO books(id,category_id,title,status)
   VALUES('claim-book','cet4','Claim only QA','published');
   INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
   VALUES('claim-ch','claim-book',1,'Chapter','{"paragraphs":["QA only"]}',0,CURRENT_TIMESTAMP);`);
 }
 prepare(text){
  const db=this.sql;
  const bind=(p=[])=>{
   const q=db.prepare(text);
   return {first:async()=>q.get(...p)??null,all:async()=>({results:q.all(...p)}),
    run:async()=>({meta:q.run(...p),success:true})};
  };
  return {...bind(),bind(...p){return bind(p)}};
 }
 async batch(commands){
  this.sql.exec("BEGIN IMMEDIATE");
  try{const output=[];for(const c of commands)output.push(await c.run());
   this.sql.exec("COMMIT");return output;
  }catch(e){this.sql.exec("ROLLBACK");throw e;}
 }
 close(){this.sql.close();}
}
const config=db=>({APP_ENV:"production",DB:db,
 ACTIVATION_PEPPER:pepper,OPS_TOKEN_PEPPER:opsSecret,
 OPS_SALES_ENABLED:"true",OPS_CONSOLE_ENABLED:"true",
 ORDER_RECOVERY_ENABLED:"true",SELF_CLAIM_ENABLED:"true",
 ASSETS:{fetch:async()=>new Response("site")}
});
function request(path,method="GET",data,ops=false){
 const headers={Origin:origin,"CF-Connecting-IP":"203.0.113.25"};
 if(ops)headers["X-Mw-Ops-Key"]=opsToken;
 if(data!==undefined)headers["Content-Type"]="application/json";
 return new Request(origin+path,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
test("V33 buyer claim is unique, category-scoped and after-claim code works at registration",async()=>{
 const db=new D1(),env=config(db);
 try{
  assert.equal((await worker.fetch(request("/api/claim/categories"),{
   ...env,SELF_CLAIM_ENABLED:"false"
  }).then(r=>r.json())).enabled,false);
  const categories=await worker.fetch(request("/api/claim/categories"),env).then(r=>r.json());
  assert.deepEqual(categories.categories.map(c=>c.slug),["cet4"]);
  const path="/api/claim/issue";
  assert.equal((await worker.fetch(request(path,"POST",{orderReference:"12345678901234",categoryId:"cet6"}),env)).status,409);
  assert.equal((await worker.fetch(request(path,"POST",{orderReference:"invalid",categoryId:"cet4"}),env)).status,400);
  const res=await worker.fetch(request(path,"POST",{
   orderReference:"12345678901234",categoryId:"cet4"
  }),env);
  assert.equal(res.status,201);
  const issued=await res.json();
  assert.match(issued.activationCode,/^MW-CET4-/);
  assert.match(issued.recoveryKey,/^MW-REC-/);
  assert.equal((await worker.fetch(request(path,"POST",{
   orderReference:"12345678901234",categoryId:"cet4"
  }),env)).status,409);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM self_service_claims").get().n,1);
  assert.ok(!JSON.stringify(db.sql.prepare("SELECT * FROM activation_codes").all())
   .includes(issued.activationCode));
  const reg=await worker.fetch(request("/api/auth/register","POST",{
   username:"claim-buyer",password:"claim-buyer-pass-2026",
   activationCode:issued.activationCode
  }),env);
  assert.equal(reg.status,201);
  const after=await db.sql.prepare("SELECT a.status,u.username FROM activation_codes a JOIN users u ON u.id=a.redeemed_by").get();
  assert.equal(after.status,"redeemed");assert.equal(after.username,"claim-buyer");
 }finally{db.close();}
});
test("V33 publisher can verify, revoke and restore ONLY the claimed code entitlement",async()=>{
 const db=new D1(),env=config(db);
 try{
  const digest=await digestOpsToken(opsToken,opsSecret);
  db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("claim-owner","Claim Owner","publisher","production",digest);
  assert.equal((await worker.fetch(request("/api/ops/claims/query","POST",{page:1}),env)).status,401);
  const claimed=await worker.fetch(request("/api/claim/issue","POST",{
   orderReference:"12345678901235",categoryId:"cet4"
  }),env).then(r=>r.json());
  const reg=await worker.fetch(request("/api/auth/register","POST",{
   username:"claim-buyer-two",password:"claim-buyer-pass-2026",
   activationCode:claimed.activationCode
  }),env);
  assert.equal(reg.status,201);
  const cookie=(reg.headers.get("set-cookie")||"").split(";")[0];
  const reader=()=>worker.fetch(new Request(origin+"/api/chapters/claim-ch",{headers:{Origin:origin,Cookie:cookie}}),env);
  assert.equal((await reader()).status,200);
  const list=await worker.fetch(request("/api/ops/claims/query","POST",{page:1},true),env).then(r=>r.json());
  assert.equal(list.total,1);assert.equal(list.items[0].username,"claim-buyer-two");
  const claimId=list.items[0].id;
  const mutate=(action)=>worker.fetch(request("/api/ops/claims/action","POST",{
    claimId,action,reason:"人工核实订单记录备注信息",requestId:crypto.randomUUID()
  },true),env);
  assert.equal((await mutate("revoke")).status,200);
  assert.equal((await reader()).status,403);
  assert.equal((await mutate("restore")).status,200);
  assert.equal((await reader()).status,200);
  assert.equal((await mutate("flag")).status,200);
  assert.equal((await mutate("verify")).status,200);
  const acts=db.sql.prepare("SELECT action FROM self_service_claim_actions ORDER BY rowid").all();
  assert.deepEqual(acts.map(x=>x.action),["revoke","restore","flag","verify"]);
 }finally{db.close();}
});

test("V1.1 P5 self-service claim reconciliation never labels revoked code as active despite stale grant",async()=>{
 const db=new D1(),env=config(db);
 try{
  const digest=await digestOpsToken(opsToken,opsSecret);
  db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("p5-claim-owner","Claim reviewer","publisher","production",digest);
  const issued=await worker.fetch(request("/api/claim/issue","POST",{
   orderReference:"12345678901239",categoryId:"cet4"
  }),env);
  assert.equal(issued.status,201);
  const {activationCode}=await issued.json();
  const registered=await worker.fetch(request("/api/auth/register","POST",{
   username:"p5-claim-buyer",password:"p5-claim-buyer-pass-2026",activationCode
  }),env);
  assert.equal(registered.status,201);
  const cookie=(registered.headers.get("set-cookie")||"").split(";")[0];
  const chapter=()=>worker.fetch(new Request(origin+"/api/chapters/claim-ch",{headers:{Origin:origin,Cookie:cookie}}),env);
  const ledger=()=>worker.fetch(request("/api/ops/claims/query","POST",{page:1},true),env).then(r=>r.json());
  assert.equal((await chapter()).status,200);
  assert.equal((await ledger()).items[0].entitlement_active,1);
  // Simulate inconsistent legacy state without writing to actual customers.
  db.sql.exec("UPDATE activation_codes SET status='revoked' WHERE redeemed_by IS NOT NULL");
  assert.equal(db.sql.prepare("SELECT revoked_at FROM entitlements LIMIT 1").get().revoked_at,null);
  assert.equal((await chapter()).status,403);
  const inactive=(await ledger()).items[0];
  assert.equal(inactive.code_status,"revoked");
  assert.equal(inactive.entitlement_active,0);
  db.sql.exec("UPDATE activation_codes SET status='redeemed' WHERE redeemed_by IS NOT NULL");
  assert.equal((await chapter()).status,200);
  assert.equal((await ledger()).items[0].entitlement_active,1);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM self_service_claim_actions").get().n,0,
   "read-only reconciliation must not create actions or audit writes");
 }finally{db.close()}
});
