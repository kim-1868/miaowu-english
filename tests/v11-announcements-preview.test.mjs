import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleSiteAnnouncements} from "../src/site-announcements.js";
import {digestOpsToken} from "../src/ops-access.js";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const key="mwops_"+("a".repeat(64));
const pepper="only-staging-operator-credential-pepper-not-a-real-secret";
const form={
 title:"新书来啦",summary:"妙屋书架更新",body:"在每段故事里遇见更多词汇。",
 category:"books",showOnHome:true
};
function fixture({table=true,role="publisher",environment="staging"}={}){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec(read("db/001_schema.sql"));
 db.exec(read("db/007_ops_identity_audit.sql"));
 if(table)db.exec(read("db/015_v11_site_announcements.sql"));
 const D1={
  prepare(sql){return {
   all:async()=>({results:db.prepare(sql).all()}),
   first:async()=>db.prepare(sql).get()||null,
   bind(...args){return {
    sql,args,
    first:async()=>db.prepare(sql).get(...args)||null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>db.prepare(sql).run(...args)
   }}
  }},
  async batch(statements){
   db.exec("BEGIN IMMEDIATE");
   try{
    const result=statements.map(s=>db.prepare(s.sql).run(...s.args));
    db.exec("COMMIT");
    return result;
   }catch(e){db.exec("ROLLBACK");throw e}
  }
 };
 const env={DB:D1,APP_ENV:environment,OPS_CONSOLE_ENABLED:"true",
  OPS_TOKEN_PEPPER:pepper};
 return {db,env,async ready(){
  const hash=await digestOpsToken(key,pepper);
  db.prepare("INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES(?,?,?,?,?)")
   .run("op1","Test publisher",role,environment,hash)
 }};
}
async function call(env,path,method="GET",payload=null,{authorized=false}={}){
 const headers={Accept:"application/json"};
 if(authorized)headers["X-Mw-Ops-Key"]=key;
 if(payload!==null)headers["Content-Type"]="application/json";
 const req=new Request("https://wordletter.example"+path,{
  method,headers,...(payload!==null?{body:JSON.stringify(payload)}:{})
 });
 const response=await handleSiteAnnouncements(req,env,new URL(req.url).pathname);
 return {status:response.status,data:await response.json()};
}
test("V1.1 notice API: missing additive table hides homepage, history remains empty without breaking site",async()=>{
 const f=fixture({table:false});try{
  assert.deepEqual((await call(f.env,"/api/updates/latest")).data,{latest:null,available:false});
  const history=await call(f.env,"/api/updates");
  assert.equal(history.status,200);
  assert.deepEqual(history.data.updates,[]);
  assert.equal(history.data.available,false);
 }finally{f.db.close()}
});
test("V1.1 notice API: public access is intentionally disabled in production until separate release",async()=>{
 const f=fixture({environment:"production"});try{
  assert.equal((await call(f.env,"/api/updates/latest")).status,404);
  assert.equal((await call(f.env,"/api/updates")).status,404);
  assert.equal((await call(f.env,"/api/ops/updates")).status,404);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM site_announcements").get().n,0);
 }finally{f.db.close()}
});
test("V1.1 notice API: operator auth and publisher role required even in protected staging",async()=>{
 const f=fixture({role:"editor"});try{
  await f.ready();
  assert.equal((await call(f.env,"/api/ops/updates")).status,401);
  assert.equal((await call(f.env,"/api/ops/updates","POST",form)).status,401);
  const forbidden=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  assert.equal(forbidden.status,403);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM site_announcements").get().n,0);
 }finally{f.db.close()}
});
test("V1.1 notice API: publisher creates draft, publishes, edits without re-alerting and withdraws with history",async()=>{
 const f=fixture();try{
  await f.ready();
  const created=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  assert.equal(created.status,201);
  assert.equal(created.data.status,"draft");
  const id=created.data.id;
  assert.match(id,/^[a-f0-9-]{36}$/i);
  assert.equal((await call(f.env,"/api/updates/latest")).data.latest,null);
  assert.equal((await call(f.env,"/api/updates")).data.total,0);
  const published=await call(f.env,"/api/ops/updates/"+id+"/publish","POST",
   {revision:1},{authorized:true});
  assert.equal(published.status,200);
  assert.equal(published.data.status,"published");
  const newest=(await call(f.env,"/api/updates/latest")).data.latest;
  assert.equal(newest.title,form.title);
  assert.equal(newest.showOnHome,true);
  assert.equal((await call(f.env,"/api/updates")).data.total,1);
  const edit=await call(f.env,"/api/ops/updates/"+id,"PUT",
   {...form,title:"新书来啦（调整文案）",revision:2},{authorized:true});
  assert.equal(edit.status,200);
  assert.equal(edit.data.revision,3);
  const after=(await call(f.env,"/api/updates/latest")).data.latest;
  assert.equal(after.id,id,"Editing must preserve dismiss-by-id");
  assert.equal(after.title,"新书来啦（调整文案）");
  const hidden=await call(f.env,"/api/ops/updates/"+id+"/withdraw","POST",
   {revision:3},{authorized:true});
  assert.equal(hidden.status,200);
  assert.equal(hidden.data.status,"withdrawn");
  assert.equal((await call(f.env,"/api/updates/latest")).data.latest,null);
  assert.equal((await call(f.env,"/api/updates")).data.total,0);
  assert.equal((await call(f.env,"/api/updates/"+id)).status,404);
  const history=(await call(f.env,"/api/ops/updates","GET",null,{authorized:true})).data.updates;
  assert.equal(history.length,1);
  assert.equal(history[0].status,"withdrawn");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ops_audit_events WHERE resource_type='announcement'").get().n,4);
  assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 }finally{f.db.close()}
});
test("V1.1 notice API: historical updates include previously published but non-home rows",async()=>{
 const f=fixture();try{
  await f.ready();
  const a=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  await call(f.env,"/api/ops/updates/"+a.data.id+"/publish","POST",{revision:1},{authorized:true});
  const b=await call(f.env,"/api/ops/updates","POST",
   {...form,title:"历史公告",showOnHome:false},{authorized:true});
  await call(f.env,"/api/ops/updates/"+b.data.id+"/publish","POST",{revision:1},{authorized:true});
  const latest=(await call(f.env,"/api/updates/latest")).data.latest;
  assert.equal(latest.id,a.data.id,"non-home updates stay in history without taking over banner");
  const archive=(await call(f.env,"/api/updates")).data;
  assert.equal(archive.total,2);
  assert.equal(archive.updates.length,2);
  assert.ok(archive.updates.some(x=>x.id===b.data.id&&x.showOnHome===false));
 }finally{f.db.close()}
});
test("V1.1 notice API: stale admin revisions are rejected and previous text remains unchanged",async()=>{
 const f=fixture();try{
  await f.ready();
  const a=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  const id=a.data.id;
  const first=await call(f.env,"/api/ops/updates/"+id,"PUT",
   {...form,title:"编辑后的标题",revision:1},{authorized:true});
  assert.equal(first.status,200);
  assert.equal((await call(f.env,"/api/ops/updates/"+id,"PUT",
   {...form,title:"过期客户端覆盖",revision:1},{authorized:true})).status,409);
  assert.equal(f.db.prepare("SELECT title FROM site_announcements WHERE id=?").get(id).title,"编辑后的标题");
 }finally{f.db.close()}
});
test("V1.1 notice API: rejects empty input, huge body and operator token leaks in public notice",async()=>{
 const f=fixture();try{
  await f.ready();
  assert.equal((await call(f.env,"/api/ops/updates","POST",
   {...form,body:""},{authorized:true})).status,400);
  assert.equal((await call(f.env,"/api/ops/updates","POST",
   {...form,body:"a".repeat(4010)},{authorized:true})).status,400);
  assert.equal((await call(f.env,"/api/ops/updates","POST",
   {...form,summary:key},{authorized:true})).status,400);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM site_announcements").get().n,0);
 }finally{f.db.close()}
});
test("V1.1 notice API: staging demo seeds newest banner and both historical entries",async()=>{
 const f=fixture();try{
  f.db.exec(read("db/staging/015_v11_site_announcements_demo.sql"));
  f.db.exec(read("db/staging/015_v11_site_announcements_demo.sql"));
  const banner=(await call(f.env,"/api/updates/latest")).data.latest;
  assert.match(banner.title,/预览示例/);
  assert.equal((await call(f.env,"/api/updates")).data.total,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM site_announcements").get().n,2);
 }finally{f.db.close()}
});
test("V1.1 notice API never touches user, word, entitlement or paid order tables",async()=>{
 const f=fixture();try{
  await f.ready();
  const start=["users","activation_codes","entitlements","user_words","review_events","reading_progress"]
   .map(name=>f.db.prepare("SELECT COUNT(*) n FROM "+name).get().n);
  const a=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  await call(f.env,"/api/ops/updates/"+a.data.id+"/publish","POST",{revision:1},{authorized:true});
  const after=["users","activation_codes","entitlements","user_words","review_events","reading_progress"]
   .map(name=>f.db.prepare("SELECT COUNT(*) n FROM "+name).get().n);
  assert.deepEqual(after,start);
 }finally{f.db.close()}
});
test("V1.1 site strips and history links use DOM textContent, never HTML of user-edited notice",()=>{
 const js=read("public/site-updates.js");
 const op=read("public/ops-updates.js");
 const html=read("public/index.html");
 const ops=read("public/ops.html");
 assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML/);
 assert.doesNotMatch(op,/innerHTML|insertAdjacentHTML/);
 assert.match(html,/id="siteUpdateBanner"[\s\S]*id="siteUpdateDismiss"/);
 assert.match(ops,/id="updatesFold"[\s\S]*id="updatesAdminForm"/);
 assert.match(read("public/updates.html"),/id="siteUpdateHistory"/);
 assert.match(read("src/site-announcements.js"),/env\.APP_ENV!=="staging"/);
});

test("V1.1 protected preview shows sample announcement with installed but empty announcement table",async()=>{
 const f=fixture();try{
  f.env.PREVIEW_ANNOUNCEMENT_DEMO="true";
  const latest=(await call(f.env,"/api/updates/latest")).data;
  assert.equal(latest.previewOnly,true);
  assert.match(latest.latest.title,/预览示例/);
  const history=(await call(f.env,"/api/updates")).data;
  assert.equal(history.previewOnly,true);
  assert.equal(history.total,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM site_announcements").get().n,0);
  await f.ready();
  const draft=await call(f.env,"/api/ops/updates","POST",form,{authorized:true});
  assert.equal(draft.status,201);
  const published=await call(f.env,"/api/ops/updates/"+draft.data.id+"/publish","POST",{revision:1},{authorized:true});
  assert.equal(published.status,200);
  const live=(await call(f.env,"/api/updates/latest")).data;
  assert.equal(live.latest.id,draft.data.id);
  assert.equal(live.previewOnly,undefined);
  assert.equal((await call(f.env,"/api/updates")).data.total,1);
 }finally{f.db.close()}
});
test("V1.1 notice sits directly below top navigation and before homepage hero",()=>{
 const html=read("public/index.html");
 const nav=html.indexOf('</header>');
 const notice=html.indexOf('id="siteUpdateBanner"');
 const hero=html.indexOf('id="miaowuHomeScene"');
 assert.ok(nav>=0&&nav<notice&&notice<hero);
 assert.match(read("public/site-updates.js"),/previewAnnouncement/);
});

test("V1.1 password-gated staging shows clearly labeled public DEMO notices without any D1 write capability",async()=>{
 const f=fixture({table:false});try{
  f.env.PREVIEW_ANNOUNCEMENT_DEMO="true";
  const banner=await call(f.env,"/api/updates/latest");
  assert.equal(banner.status,200);
  assert.equal(banner.data.previewOnly,true);
  assert.match(banner.data.latest.title,/预览示例/);
  const history=await call(f.env,"/api/updates");
  assert.equal(history.data.total,2);
  assert.ok(history.data.updates.every(x=>x.title.startsWith("预览示例")));
  assert.equal((await call(f.env,"/api/updates/"+banner.data.latest.id)).status,200);
  assert.equal((await call(f.env,"/api/updates/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).status,404);
  assert.equal((await call(f.env,"/api/ops/updates")).status,401);
  await f.ready();
  assert.equal((await call(f.env,"/api/ops/updates","GET",null,{authorized:true})).status,503,
   "Without test D1 permissions, mutations cannot pretend to persist");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ops_audit_events").get().n,0);
 }finally{f.db.close()}
});
