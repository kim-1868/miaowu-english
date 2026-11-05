import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";
const origin="https://voucher-revoke.test.invalid";
const key="mwops_"+"d".repeat(64);
const secret="TEST_ONLY_SECRET_FOR_ACTIVATION_V37_2026_1120";
const opSecret="TEST_ONLY_SECRET_FOR_OPS_V37_2026_1120";
class D1{
 constructor(){
  this.sql=new DatabaseSync(":memory:");
  for(const path of ["001_schema.sql","002_s1.sql","003_public_categories.sql","007_ops_identity_audit.sql"])
   this.sql.exec(readFileSync(new URL("../db/"+path,import.meta.url),"utf8"));
  for(const path of ["001_one_paid_order_one_code.sql","002_account_recovery_codes.sql",
   "003_paid_order_recovery.sql","007_self_service_claims.sql"])
   this.sql.exec(readFileSync(new URL("../db/production/"+path,import.meta.url),"utf8"));
  this.sql.exec(`INSERT INTO books(id,category_id,title,status) VALUES
   ('v37-book-c4','cet4','Four study','published'),('v37-book-c6','cet6','Six study','published');
   INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES
   ('v37-c4','v37-book-c4',1,'Paid CET4','{"paragraphs":["c4"]}',0,CURRENT_TIMESTAMP),
   ('v37-c6','v37-book-c6',1,'Paid CET6','{"paragraphs":["c6"]}',0,CURRENT_TIMESTAMP);`);
 }
 prepare(sql){
  const db=this.sql;
  const wrap=(p=[])=>{const q=db.prepare(sql);return {
   first:async()=>q.get(...p)??null,all:async()=>({results:q.all(...p)}),
   run:async()=>({meta:q.run(...p),success:true})
  }};
  return {...wrap(),bind(...p){return wrap(p)}};
 }
 async batch(commands){
  this.sql.exec("BEGIN IMMEDIATE");
  try{const r=[];for(const c of commands)r.push(await c.run());this.sql.exec("COMMIT");return r;}
  catch(e){this.sql.exec("ROLLBACK");throw e}
 }
 close(){this.sql.close()}
}
const env=db=>({APP_ENV:"production",DB:db,OPS_CONSOLE_ENABLED:"true",
 OPS_SALES_ENABLED:"true",SELF_CLAIM_ENABLED:"true",ORDER_RECOVERY_ENABLED:"true",
 ACTIVATION_PEPPER:secret,OPS_TOKEN_PEPPER:opSecret,ASSETS:{fetch:async()=>new Response("OK")}});
function req(path,method="GET",body,token=key,cookie=""){
 const headers={Origin:origin,"CF-Connecting-IP":"203.0.113.34"};
 if(token)headers["X-Mw-Ops-Key"]=token;
 if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers["Content-Type"]="application/json";
 return new Request(origin+path,{method,headers,
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
const post=(app,path,body,token=key)=>worker.fetch(req(path,"POST",body,token),app);
async function operator(db,role="publisher"){
 const digest=await digestOpsToken(key,opSecret);
 db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
  .run("v37-operator","Voucher Publisher",role,"production",digest);
}
async function manualIssue(app,order,cat){
 const res=await post(app,"/api/ops/sales/issue",
  {categoryId:cat,paymentConfirmed:true,contentConfirmed:true,orderReference:order});
 assert.equal(res.status,201);
 return res.json();
}
async function voucherId(app,order){
 const res=await post(app,"/api/ops/customers/query",{mode:"codes",search:order});
 assert.equal(res.status,200);const data=await res.json();assert.equal(data.items.length,1);
 return data.items[0].id;
}
async function mutate(app,id,action,status,overrides={}){
 return post(app,"/api/ops/customers/voucher-action",
 {codeId:id,action,confirmation:action==="revoke"?"作废":"恢复",
  expectedStatus:status,reason:"已核实订单并确认用户套餐权限处理计划",requestId:crypto.randomUUID(),
  ...overrides});
}
test("V37 revoke redeemed code denies paid chapters immediately; restore returns access but preserves other category",async()=>{
 const db=new D1(),app=env(db);
 try{
  await operator(db);
  const c4=await manualIssue(app,"20261105-V37-C4","cet4");
  const c6=await manualIssue(app,"20261105-V37-C6","cet6");
  const reg=await post(app,"/api/auth/register",
   {username:"v37-reader",password:"password-v37-2026",activationCode:c4.activationCode},null);
  assert.equal(reg.status,201);
  const cookie=(reg.headers.get("set-cookie")||"").split(";")[0];
  assert.equal((await worker.fetch(req("/api/activate","POST",{activationCode:c6.activationCode},null,cookie),app)).status,200);
  const access=chapter=>worker.fetch(req("/api/chapters/"+chapter,"GET",undefined,null,cookie),app);
  assert.equal((await access("v37-c4")).status,200);
  assert.equal((await access("v37-c6")).status,200);
  const id=await voucherId(app,"20261105-V37-C4");
  assert.equal((await mutate(app,id,"revoke","redeemed",{confirmation:"wrong"})).status,400);
  assert.equal((await mutate(app,id,"revoke","redeemed",{reason:"too short"})).status,400);
  assert.equal((await access("v37-c4")).status,200);
  const gone=await mutate(app,id,"revoke","redeemed");
  assert.equal(gone.status,200);assert.equal((await gone.json()).affectedCategoryRights,true);
  assert.equal((await access("v37-c4")).status,403);
  assert.equal((await access("v37-c6")).status,200);
  const current=await worker.fetch(req("/api/auth/me","GET",undefined,null,cookie),app).then(r=>r.json());
  assert.deepEqual(current.categories.map(x=>x.slug),["cet6"]);
  const revoked=db.sql.prepare("SELECT status FROM activation_codes WHERE id=?").get(id);
  assert.equal(revoked.status,"revoked");
  assert.ok(db.sql.prepare("SELECT revoked_at FROM entitlements WHERE source_code_id=?").get(id).revoked_at);
  assert.equal((await mutate(app,id,"revoke","redeemed")).status,409);
  assert.equal((await mutate(app,id,"restore","revoked")).status,200);
  assert.equal((await access("v37-c4")).status,200);
  assert.equal((await access("v37-c6")).status,200);
  const restored=db.sql.prepare("SELECT status FROM activation_codes WHERE id=?").get(id);
  assert.equal(restored.status,"redeemed");
  assert.equal(db.sql.prepare("SELECT revoked_at FROM entitlements WHERE source_code_id=?").get(id).revoked_at,null);
  const logs=db.sql.prepare("SELECT event_type,reason_note FROM ops_audit_events WHERE resource_id=? ORDER BY rowid").all(id);
  assert.deepEqual(logs.map(x=>x.event_type),["voucher.revoke","voucher.restore"]);
  assert.ok(logs.every(x=>x.reason_note.length>=12));
 }finally{db.close()}
});
test("V37 unredeemed code cannot register after revocation; restoring allows original code",async()=>{
 const db=new D1(),app=env(db);
 try{
  await operator(db);
  const issued=await manualIssue(app,"20261105-V37-UNUSED","cet4");
  const id=await voucherId(app,"20261105-V37-UNUSED");
  assert.equal((await mutate(app,id,"revoke","unused")).status,200);
  const register=()=>post(app,"/api/auth/register",
   {username:"v37-new-user",password:"password-v37-2026",activationCode:issued.activationCode},null);
  assert.equal((await register()).status,409);
  assert.equal((await mutate(app,id,"restore","revoked")).status,200);
  assert.equal((await register()).status,201);
 }finally{db.close()}
});
test("V37 action disallows unauthorized, non-publisher roles and invalid method",async()=>{
 const db=new D1(),app=env(db);
 try{
  await operator(db,"reviewer");
  const data={codeId:crypto.randomUUID(),action:"revoke",expectedStatus:"unused",
    confirmation:"作废",reason:"核实订单需要撤销学习套餐权限",requestId:crypto.randomUUID()};
  assert.equal((await post(app,"/api/ops/customers/voucher-action",data,null)).status,401);
  assert.equal((await post(app,"/api/ops/customers/voucher-action",data)).status,403);
  assert.equal((await worker.fetch(req("/api/ops/customers/voucher-action"),app)).status,404);
 }finally{db.close()}
});
test("V37 preserves existing entitlement from a DIFFERENT voucher source",async()=>{
 const db=new D1(),app=env(db);
 try{
  await operator(db);
  const first=await manualIssue(app,"20261105-V37-FIRST","cet4");
  const reg=await post(app,"/api/auth/register",
    {username:"v37-double",password:"password-v37-2026",activationCode:first.activationCode},null);
  assert.equal(reg.status,201);
  const firstId=await voucherId(app,"20261105-V37-FIRST");
  const other=await manualIssue(app,"20261105-V37-OTHER","cet4");
  const otherId=await voucherId(app,"20261105-V37-OTHER");
  db.sql.prepare("UPDATE activation_codes SET status='redeemed',redeemed_by=(SELECT id FROM users WHERE username='v37-double') WHERE id=?").run(otherId);
  db.sql.prepare("UPDATE entitlements SET source_code_id=? WHERE source_code_id=?").run(otherId,firstId);
  assert.equal((await mutate(app,firstId,"revoke","redeemed")).status,200);
  const still=db.sql.prepare("SELECT source_code_id,revoked_at FROM entitlements").get();
  assert.equal(still.source_code_id,otherId);assert.equal(still.revoked_at,null);
  assert.equal((await mutate(app,firstId,"restore","revoked")).status,409);
 }finally{db.close()}
});
test("V37 UI clearly explains that already-redeemed codes revoke package access, with double confirmation",()=>{
 const html=readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
 const front=readFileSync(new URL("../public/ops-customers.js",import.meta.url),"utf8");
 assert.match(html,/作废此兑换码/);assert.match(html,/阅读权限/);
 assert.match(front,/customers\/voucher-action/);
 assert.match(front,/window\.confirm/);assert.match(front,/window\.prompt/);
 assert.match(front,/expectedStatus/);
});
