import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken} from "../src/ops-access.js";

const origin="https://customer-admin-test.invalid";
const opsToken="mwops_"+"c".repeat(64);
const pepper="S158_FAKE_ACTIVATION_SECRET_USED_ONLY_IN_TEST_2026";
const opsPepper="S158_FAKE_OPERATOR_SECRET_USED_ONLY_IN_TEST_2026";
class D1{
 constructor(){
  this.sql=new DatabaseSync(":memory:");
  for(const path of ["001_schema.sql","002_s1.sql","003_public_categories.sql","007_ops_identity_audit.sql"]){
   this.sql.exec(readFileSync(new URL("../db/"+path,import.meta.url),"utf8"));
  }
  for(const path of ["001_one_paid_order_one_code.sql","002_account_recovery_codes.sql","003_paid_order_recovery.sql"]){
   this.sql.exec(readFileSync(new URL("../db/production/"+path,import.meta.url),"utf8"));
  }
  this.sql.exec(`INSERT INTO books(id,category_id,title,status) VALUES
    ('study-cet4','cet4','Local test book','published');
    INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at)
      VALUES('study-ch1','study-cet4',1,'Chapter','{"paragraphs":["fixture"]}',0,CURRENT_TIMESTAMP);`);
 }
 prepare(sql){
  const db=this.sql;
  const bind=(params=[])=>{
   const q=db.prepare(sql);
   return {first:async()=>q.get(...params)??null,
    all:async()=>({results:q.all(...params)}),
    run:async()=>({meta:q.run(...params),success:true})};
  };
  return {...bind(),bind(...p){return bind(p)}};
 }
 async batch(commands){
  this.sql.exec("BEGIN IMMEDIATE");
  try{const x=[];for(const cmd of commands)x.push(await cmd.run());this.sql.exec("COMMIT");return x}
  catch(e){this.sql.exec("ROLLBACK");throw e}
 }
 close(){this.sql.close()}
}
const env=db=>({APP_ENV:"production",DB:db,OPS_TOKEN_PEPPER:opsPepper,
 ACTIVATION_PEPPER:pepper,OPS_CONSOLE_ENABLED:"true",OPS_SALES_ENABLED:"true",
 ORDER_RECOVERY_ENABLED:"true",ASSETS:{fetch:async()=>new Response("OK")}
});
function req(url,method="GET",data,token=opsToken){
 const headers={Origin:origin};
 if(token)headers["X-Mw-Ops-Key"]=token;
 if(data!==undefined)headers["Content-Type"]="application/json";
 return new Request(origin+url,{method,headers,
  ...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
test("S158: activation ledger exposes only read-only state, account and package",async()=>{
 const db=new D1();const app=env(db);
 try{
  const digest=await digestOpsToken(opsToken,opsPepper);
  db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("owner-ops","Owner","publisher","production",digest);
  const endpoint="/api/ops/customers/query";
  assert.equal((await worker.fetch(req(endpoint,"POST",{mode:"codes"},null),app)).status,401);
  assert.equal((await worker.fetch(req(endpoint,"GET",undefined),app)).status,404);
  assert.equal((await worker.fetch(req(endpoint,"POST",{mode:"codes",page:0}),app)).status,400);
  assert.equal((await worker.fetch(req(endpoint,"POST",{mode:"codes",search:"x".repeat(81)}),app)).status,400);
  assert.equal((await worker.fetch(req(endpoint,"POST",{mode:"codes"}),{...app,OPS_CONSOLE_ENABLED:"false"})).status,403);
  const sale={categoryId:"cet4",paymentConfirmed:true,contentConfirmed:true};
  const issued=[];
  for(const orderReference of ["20261105-CUSTOMER-A","20261105-CUSTOMER-B"]){
   const res=await worker.fetch(req("/api/ops/sales/issue","POST",{...sale,orderReference}),app);
   assert.equal(res.status,201);
   issued.push(await res.json());
  }
  const before=await (await worker.fetch(req(endpoint,"POST",{mode:"codes",status:"unused"}),app)).json();
  assert.equal(before.total,2);
  assert.equal(before.overview.unused,2);
  assert.equal(before.overview.redeemed,0);
  assert.ok(before.items.every(x=>x.status==="unused"&&x.redeemed_username===null));
  const registered=await worker.fetch(req("/api/auth/register","POST",{
   username:"test-customer",password:"s158-password-2026",activationCode:issued[0].activationCode
  },null),app);
  assert.equal(registered.status,201);
  const ledger=await (await worker.fetch(req(endpoint,"POST",{
   mode:"codes",search:"CUSTOMER-A",status:"redeemed",category:"cet4"
  }),app)).json();
  assert.equal(ledger.total,1);
  assert.equal(ledger.items[0].redeemed_username,"test-customer");
  assert.equal(ledger.items[0].category_slug,"cet4");
  assert.equal(ledger.items[0].entitlement_active,1);
  assert.ok(ledger.items[0].redeemed_at);
  assert.equal(ledger.overview.redeemed,1);
  assert.equal(ledger.overview.unused,1);
  const userList=await (await worker.fetch(req(endpoint,"POST",{
   mode:"users",search:"test-customer"
  }),app)).json();
  assert.equal(userList.total,1);
  assert.equal(userList.items[0].redeemed_count,1);
  assert.match(userList.items[0].packages,/四级/);
  const userByOrder=await (await worker.fetch(req(endpoint,"POST",{
   mode:"users",search:"CUSTOMER-A"
  }),app)).json();
  assert.equal(userByOrder.total,1);
  const text=JSON.stringify({ledger,userList,userByOrder});
  for(const secret of ["code_hash","password_hash","password_salt",
   "recoveryKey",issued[0].activationCode,issued[1].activationCode])
   assert.ok(!text.includes(secret),"sensitive secret leaked: "+secret.slice(0,12));
  assert.equal((await worker.fetch(req(endpoint,"POST",{mode:"codes",category:"cet6"}),app)
    .then(r=>r.json())).total,0);
 }finally{db.close();}
});
test("S158: customer endpoint rejects unauthorized roles",async()=>{
 const db=new D1();
 try{
  const digest=await digestOpsToken(opsToken,opsPepper);
  db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("editor-ops","Editor","editor","production",digest);
  assert.equal((await worker.fetch(req("/api/ops/customers/query","POST",{mode:"users"}),env(db))).status,403);
 }finally{db.close();}
});
test("S158: production assets and page expose the read-only customer interface",()=>{
 const html=readFileSync(new URL("../public/ops.html",import.meta.url),"utf8");
 const js=readFileSync(new URL("../public/ops-customers.js",import.meta.url),"utf8");
 const server=readFileSync(new URL("../src/ops-customers.js",import.meta.url),"utf8");
 const build=readFileSync(new URL("../scripts/build-production-assets.mjs",import.meta.url),"utf8");
 for(const id of ["customerPanel","customerTabUsers","customerTabCodes","customerSearch",
  "customerCategory","customerCodeStatus","customerList","customerPageInfo"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(build,/"ops-customers\.js"/);
 assert.match(js,/api\/ops\/customers\/query/);
 assert.doesNotMatch(server,/SELECT\s+\*/i);
 assert.doesNotMatch(server,/UPDATE\s+(users|activation_codes|entitlements)/i);
});

test("V1.1 P5 customer account and voucher ledger agree with REAL paid access when a legacy code is revoked",async()=>{
 const db=new D1(),app=env(db);
 try{
  const digest=await digestOpsToken(opsToken,opsPepper);
  db.sql.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES (?,?,?,?,?)")
   .run("p5-ops","P5 Publisher","publisher","production",digest);
  const issued=await worker.fetch(req("/api/ops/sales/issue","POST",{
   categoryId:"cet4",paymentConfirmed:true,contentConfirmed:true,orderReference:"20261106-P5-CUSTOMER"
  }),app);
  assert.equal(issued.status,201);
  const {activationCode}=await issued.json();
  const reg=await worker.fetch(req("/api/auth/register","POST",{
   username:"p5-reader",password:"p5-reader-pass-2026",activationCode
  },null),app);
  assert.equal(reg.status,201);
  const cookie=(reg.headers.get("set-cookie")||"").split(";")[0];
  const id=db.sql.prepare("SELECT id FROM activation_codes WHERE order_reference='ORD-20261106-P5-CUSTOMER'").get().id;
  const customers=async mode=>(await worker.fetch(req("/api/ops/customers/query","POST",{
   mode,search:"20261106-P5-CUSTOMER"
  }),app)).json();
  const me=()=>worker.fetch(new Request(origin+"/api/auth/me",{headers:{Origin:origin,Cookie:cookie}}),app).then(x=>x.json());
  assert.equal((await customers("codes")).items[0].entitlement_active,1);
  assert.match((await customers("users")).items[0].packages,/四级/);
  assert.deepEqual((await me()).categories.map(c=>c.slug),["cet4"]);
  // Historical/manual inconsistency: code is revoked but e.revoked_at is
  // still NULL. Paid chapter/auth-me deny access already; operator UI must
  // not falsely label this code or package active.
  db.sql.prepare("UPDATE activation_codes SET status='revoked' WHERE id=?").run(id);
  assert.equal(db.sql.prepare("SELECT revoked_at FROM entitlements WHERE source_code_id=?").get(id).revoked_at,null);
  assert.deepEqual((await me()).categories,[]);
  const codeList=await customers("codes"),userList=await customers("users");
  assert.equal(codeList.items[0].status,"revoked");
  assert.equal(codeList.items[0].entitlement_active,0);
  assert.equal(userList.items[0].packages,null);
  assert.ok(!JSON.stringify({codeList,userList}).includes(activationCode));
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM entitlements").get().n,1,"query is read only");
  // Consistent restoration is still reflected by both read models.
  db.sql.prepare("UPDATE activation_codes SET status='redeemed' WHERE id=?").run(id);
  assert.deepEqual((await me()).categories.map(c=>c.slug),["cet4"]);
  assert.equal((await customers("codes")).items[0].entitlement_active,1);
  assert.match((await customers("users")).items[0].packages,/四级/);
 }finally{db.close()}
});
