import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import worker from "../src/worker.js";
import {digestOpsToken,hasOpsRole,appendOpsAudit} from "../src/ops-access.js";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const OPS_PEPPER="ops-independent-HMAC-pepper-at-least-32-characters-for-test";
const TOKEN="mwops_"+"a".repeat(64);
const OTHER_TOKEN="mwops_"+"b".repeat(64);
function fixture(environment="production",withSchema=true){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for(const path of ["../db/001_schema.sql","../db/002_s1.sql","../db/003_public_categories.sql"])sqlite.exec(read(path));
  if(withSchema)sqlite.exec(read("../db/007_ops_identity_audit.sql"));
  const DB={prepare(sql){return {
    bind(...params){const stmt=sqlite.prepare(sql);return {
      async first(){return stmt.get(...params)??null},
      async all(){return {results:stmt.all(...params)}},
      async run(){return stmt.run(...params)}
    }},
    async all(){return {results:sqlite.prepare(sql).all()}},
    async first(){return sqlite.prepare(sql).get()??null}
  }}};
  const env={DB,APP_ENV:environment,OPS_TOKEN_PEPPER:OPS_PEPPER,
    ACTIVATION_PEPPER:"legacy-test-activation-pepper-xxxxxxxxxxxxxxx",
    S3_EDITOR_SECRET:"legacy-staging-only-secret-with-long-length",
    STAGING_PREVIEW_PASSWORD:"test-preview-password-independent-2026"};
  return {env,sqlite};
}
async function addOperator(sqlite,token,role="reviewer",environment="production",id="ops-reviewer"){
  const digest=await digestOpsToken(token,OPS_PEPPER);
  sqlite.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
    .run(id,"Test operator",role,environment,digest);
  return {id,role,environment};
}
function request(path="/api/ops/me",token=TOKEN,method="GET",preview=false){
  const headers={"Origin":"https://mw.example"};
  if(token!==undefined)headers["X-Mw-Ops-Key"]=token;
  if(preview)headers.Authorization="Basic "+Buffer.from("reviewer:test-preview-password-independent-2026").toString("base64");
  return new Request("https://mw.example"+path,{method,headers});
}
test("S9-A operator endpoint is genuinely separate from reader and staging editor auth",async()=>{
  const {env,sqlite}=fixture();
  await addOperator(sqlite,TOKEN);
  const res=await worker.fetch(request(),env);
  assert.equal(res.status,200,await res.clone().text());
  const result=await res.json();
  assert.deepEqual(result.operator,{id:"ops-reviewer",displayName:"Test operator",role:"reviewer",environment:"production"});
  assert.equal(result.publishAvailable,false);
  assert.equal(result.withdrawAvailable,false);
  assert.match(res.headers.get("cache-control"),/no-store/);
  assert.equal(JSON.stringify(result).includes(TOKEN),false);
  assert.equal((await worker.fetch(request("/api/ops/me",undefined),env)).status,401);
  assert.equal((await worker.fetch(request("/api/ops/me",env.S3_EDITOR_SECRET),env)).status,401);
  assert.equal((await worker.fetch(request("/api/ops/me",OTHER_TOKEN),env)).status,401);
  assert.equal((await worker.fetch(request("/api/ops/publish",TOKEN,"POST"),env)).status,404);
  assert.equal((await worker.fetch(request("/api/ops/revoke",TOKEN,"DELETE"),env)).status,404);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM ops_audit_events").get().n,0);
});
test("S9-A fails closed if pepper, migration, operator or environment is invalid",async()=>{
  const {env,sqlite}=fixture();
  await addOperator(sqlite,TOKEN);
  assert.equal((await worker.fetch(request(),{...env,OPS_TOKEN_PEPPER:undefined})).status,503);
  assert.equal((await worker.fetch(request(),{...env,OPS_TOKEN_PEPPER:"short"})).status,503);
  assert.equal((await worker.fetch(request(),{...env,APP_ENV:"local"})).status,404);
  assert.equal((await worker.fetch(request(),{...env,APP_ENV:"staging"})).status,401);
  const {env:noSchema}=fixture("production",false);
  assert.equal((await worker.fetch(request(),noSchema)).status,503);
  sqlite.prepare("UPDATE ops_operators SET is_active=0 WHERE id='ops-reviewer'").run();
  assert.equal((await worker.fetch(request(),env)).status,401);
  sqlite.prepare("UPDATE ops_operators SET is_active=1,revoked_at=CURRENT_TIMESTAMP WHERE id='ops-reviewer'").run();
  assert.equal((await worker.fetch(request(),env)).status,401);
});
test("S9-A staging operators require BOTH preview gate and environment-scoped ops identity",async()=>{
  const {env,sqlite}=fixture("staging");
  await addOperator(sqlite,TOKEN,"publisher","staging","ops-publisher");
  assert.equal((await worker.fetch(request(),env)).status,401);
  assert.equal((await worker.fetch(request("/api/ops/me",TOKEN,"GET",true),env)).status,200);
  assert.equal((await worker.fetch(request("/api/ops/me",OTHER_TOKEN,"GET",true),env)).status,401);
  assert.equal((await worker.fetch(request("/api/ops/me",TOKEN,"GET",true),{...env,APP_ENV:"production"})).status,401);
});
test("S9-A roles are explicit; publisher may not forge reviewer approval",()=>{
  const reviewer={id:"ops-1",role:"reviewer"};
  const publisher={id:"ops-2",role:"publisher"};
  assert.equal(hasOpsRole(reviewer,"reviewer"),true);
  assert.equal(hasOpsRole(reviewer,"publisher"),false);
  assert.equal(hasOpsRole(publisher,"reviewer"),false);
  assert.equal(hasOpsRole(publisher,"publisher"),true);
  assert.equal(hasOpsRole({id:"ops-3",role:"admin"},"publisher"),false);
});
test("S9-A audit is append-only, idempotent per event/request and never stores a raw token",async()=>{
  const {env,sqlite}=fixture();
  const actor=await addOperator(sqlite,TOKEN);
  const event={eventType:"review.checked",resourceType:"book",resourceId:"original-book-01",
    requestId:"2026-review-request-001",contentFingerprint:"a".repeat(64),reasonCode:"HUMAN_REVIEW"};
  const id=await appendOpsAudit(env.DB,actor,event);
  const row=sqlite.prepare("SELECT * FROM ops_audit_events WHERE id=?").get(id);
  assert.equal(row.actor_id,actor.id);
  assert.equal(row.content_fingerprint,"a".repeat(64));
  assert.equal(JSON.stringify(row).includes(TOKEN),false);
  await assert.rejects(appendOpsAudit(env.DB,actor,event),/UNIQUE/);
  assert.throws(()=>sqlite.prepare("UPDATE ops_audit_events SET reason_code='OTHER' WHERE id=?").run(id),
    /OPS_AUDIT_APPEND_ONLY/);
  assert.throws(()=>sqlite.prepare("DELETE FROM ops_audit_events WHERE id=?").run(id),
    /OPS_AUDIT_APPEND_ONLY/);
  await assert.rejects(appendOpsAudit(env.DB,actor,{...event,resourceId:TOKEN}),/INVALID_OPS_AUDIT_ENTRY/);
});
