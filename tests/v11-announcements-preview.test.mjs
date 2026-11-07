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


test("V1.1 notice stays visible after details return until the close button is clicked",async()=>{
 const {runInNewContext}=await import("node:vm");
 const js=read("public/site-updates.js");
 const key="miaowu_notice_dismissed_id_v1";
 const id="d6e8f098-18fd-46e1-a1ab-45167df393e1";
 const storage=new Map([[key,id]]); // previous demo dismissal from earlier preview
 const latest={id,title:"预览示例：妙屋新鲜事上线啦",category:"feature",publishedAt:"2026-11-07 10:00:00"};
 async function visit(search=""){
  let url=new URL("https://preview.example/"+search);
  const events={};
  const nodes={
   siteUpdateBanner:{hidden:true},
   siteUpdateTitle:{textContent:""},
   siteUpdateMeta:{textContent:""},
   siteUpdateDetail:{href:""},
   siteUpdateMessage:{onclick:null},
   siteUpdateTitle:{onclick:null},
   siteUpdateMeta:{onclick:null},
   siteUpdateDismiss:{onclick:null}
  };
  const location={get href(){return url.href},get search(){return url.search}};
  const history={state:null,replaceState(_state,_title,target){url=new URL(target,url)}};
  const localStorage={
   getItem:k=>storage.get(k)||null,
   setItem:(k,v)=>storage.set(k,String(v)),
   removeItem:k=>storage.delete(k)
  };
  const context={
   document:{readyState:"complete",hidden:false,getElementById:id=>nodes[id]||null,
    addEventListener:(name,fn)=>{events[name]=fn}},
   window:{addEventListener:(name,fn)=>{events[name]=fn}},
   fetch:async()=>({ok:true,json:async()=>({latest,previewOnly:true})}),
   history,location,localStorage,URL,URLSearchParams,Date,Intl
  };
  runInNewContext(js,context,{filename:"site-updates.js"});
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,events,get search(){return url.search}};
 }
 const first=await visit("?previewAnnouncement=1");
 assert.equal(first.nodes.siteUpdateBanner.hidden,false);
 assert.equal(first.search,"","preview query must be consumed once");
 assert.equal(storage.has(key),false,"preview reset clears only the old demo dismissal");
 assert.equal(typeof first.nodes.siteUpdateDetail.onclick,"function","details is an in-page action");
 assert.equal(typeof first.nodes.siteUpdateTitle.onclick,"function","title opens modal");
 assert.equal(typeof first.nodes.siteUpdateMeta.onclick,"function","date opens modal");
 assert.equal(first.nodes.siteUpdateMessage.onclick,null,"empty message wrapper must not be a click target");
 const back=await visit(); // history page's "返回首页" points to /
 assert.equal(back.nodes.siteUpdateBanner.hidden,false,"detail/return should not hide notice");
 back.events.pageshow(); // bfcache/history restoration
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(back.nodes.siteUpdateBanner.hidden,false);
 back.nodes.siteUpdateDismiss.onclick();
 assert.equal(storage.get(key),id);
 assert.equal(back.nodes.siteUpdateBanner.hidden,true);
 const refreshed=await visit();
 assert.equal(refreshed.nodes.siteUpdateBanner.hidden,true,"only explicit close persists");
});
test("V1.1 text-only announcement is borderless and responsive at mobile, tablet and desktop widths",()=>{
 const css=read("public/site-updates.css");
 assert.match(css,/\.mw-update-strip\{[^}]*border:0;[^}]*border-radius:0;[^}]*background:transparent;[^}]*box-shadow:none/);
 assert.match(css,/@media\(max-width:860px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/\.mw-update-message\{[^}]*min-width:0/);
 assert.match(css,/\.mw-update-action\{[^}]*min-height:32px/);
 assert.match(css,/html\[data-theme="dark"\] \.mw-update-strip/);
 const index=read("public/index.html");
 assert.match(index,/site-updates\.css\?v=20261107-preview6/);
 assert.match(index,/site-updates\.js\?v=20261107-preview6/);
});

// Modal interactions: no route changes, cached newest text, compact expandable history.
test("V1.1 modal instantly shows latest then five history headings, expands on demand and never dismisses banner",async()=>{
 const {runInNewContext}=await import("node:vm");
 const events={};
 function el(id=""){
  return {
   id,hidden:false,textContent:"",className:"",children:[],attributes:{},listeners:{},open:false,
   setAttribute(k,v){this.attributes[k]=v},
   addEventListener(k,fn){this.listeners[k]=fn},
   append(...items){this.children.push(...items)},
   replaceChildren(...items){this.children=[...items]},
   querySelectorAll(selector){const cls=selector.slice(1);return this.children.flatMap(row=>row.children.filter(x=>x.className===cls))},
   showModal(){this.open=true},close(){this.open=false}
  };
 }
 const ids=["siteUpdateBanner","siteUpdateTitle","siteUpdateMeta","siteUpdateMessage","siteUpdateDetail","siteUpdateDismiss",
  "siteUpdateDialog","siteUpdateDialogClose","siteUpdateTabLatest","siteUpdateTabHistory",
  "siteUpdatePanelLatest","siteUpdatePanelHistory","siteUpdateDialogDate","siteUpdateDialogHeadline",
  "siteUpdateDialogBody","siteUpdateCompactList","siteUpdateHistoryInlineStatus","siteUpdateHistoryMore"];
 const nodes=Object.fromEntries(ids.map(id=>[id,el(id)]));
 nodes.siteUpdateBanner.hidden=true;nodes.siteUpdatePanelHistory.hidden=true;nodes.siteUpdateHistoryMore.hidden=true;
 const rows=Array.from({length:12},(_,i)=>({
  id:"id-"+i,title:"历史公告 "+i,body:"这是第 "+i+" 条详细内容",
  publishedAt:"2026-11-07 10:00:00",category:"feature"
 }));
 const latest={...rows[0],title:"最新公告",body:"弹窗直接展示完整正文"};
 const calls=[];
 const context={
  document:{readyState:"complete",hidden:false,getElementById:id=>nodes[id]||null,
   createElement:()=>el(),
   addEventListener:(name,fn)=>{events[name]=fn}},
  window:{addEventListener:(name,fn)=>{events[name]=fn}},
  fetch:async url=>{
   calls.push(url);
   return {ok:true,json:async()=>url.includes("latest")?{latest,previewOnly:true}:
    {updates:rows,total:12,page:1,hasMore:false}};
  },
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  history:{state:null,replaceState(){}},
  location:{search:"",href:"https://staging.example/"},
  URL,URLSearchParams,Date,Intl
 };
 runInNewContext(read("public/site-updates.js"),context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1,"initial page loads only latest notice");
 nodes.siteUpdateTitle.onclick();
 assert.equal(nodes.siteUpdateDialog.open,true,"title click opens dialog");
 assert.equal(nodes.siteUpdateDialogHeadline.textContent,"最新公告");
 assert.equal(nodes.siteUpdateDialogBody.textContent,"弹窗直接展示完整正文");
 assert.equal(calls.length,1,"opening dialog should be immediate without an additional fetch");
 nodes.siteUpdateTabHistory.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2,"history loads lazily on tab selection");
 assert.equal(nodes.siteUpdateCompactList.children.length,5);
 const first=nodes.siteUpdateCompactList.children[0];
 assert.equal(first.children[1].hidden,true,"history body starts collapsed");
 assert.equal(first.children[0].children[1].textContent,"历史公告 0");
 first.children[0].listeners.click();
 assert.equal(first.children[1].hidden,false,"tap title reveals original details");
 nodes.siteUpdateHistoryMore.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.siteUpdateCompactList.children.length,10,"load 5 at a time");
 nodes.siteUpdateHistoryMore.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.siteUpdateCompactList.children.length,12);
 assert.equal(nodes.siteUpdateHistoryMore.hidden,true);
 nodes.siteUpdateDialogClose.listeners.click();
 assert.equal(nodes.siteUpdateDialog.open,false);
 assert.equal(nodes.siteUpdateBanner.hidden,false,"closing modal preserves the home strip");
 nodes.siteUpdateDetail.onclick();
 assert.equal(nodes.siteUpdateDialog.open,true,"modal can reopen without navigation");
 assert.equal(nodes.siteUpdatePanelLatest.hidden,false,"dialog reopens on latest tab");
 assert.equal(nodes.siteUpdateTabLatest.attributes["aria-selected"],"true");
 nodes.siteUpdateDialog.close();
 nodes.siteUpdateMeta.onclick();
 assert.equal(nodes.siteUpdateDialog.open,true,"date click opens same modal");
 nodes.siteUpdateDialog.close();
 nodes.siteUpdateDetail.onclick();
 assert.equal(nodes.siteUpdateDialog.open,true,"details opens same modal");
 nodes.siteUpdateDialog.close();
 nodes.siteUpdateDismiss.onclick();
 assert.equal(nodes.siteUpdateBanner.hidden,true,"only strip close hides the announcement");
});
test("V1.1 modal is accessible, center-aligned, mobile-adaptive and never links from details to archive page",()=>{
 const html=read("public/index.html"),css=read("public/site-updates.css");
 assert.match(html,/id="siteUpdateDetail"[^>]*type="button"[^>]*aria-haspopup="dialog"/);
 assert.ok(html.includes('<div id="siteUpdateMessage" class="mw-update-message">'));
 assert.ok(html.includes('id="siteUpdateTitle" class="mw-update-title-trigger" type="button" aria-haspopup="dialog"'));
 assert.ok(html.includes('id="siteUpdateMeta" class="mw-update-meta" type="button" aria-haspopup="dialog"'));
 assert.doesNotMatch(html,/<button id="siteUpdateMessage"/);
 assert.ok(css.includes('.mw-update-title-trigger{display:block;flex:0 1 auto;'));
 assert.ok(css.includes('.mw-update-message{min-width:0;flex:1;'));
 assert.doesNotMatch(css,/\.mw-update-message\{[^}]*cursor:pointer/);
 assert.ok(css.includes('.mw-update-title-trigger:focus-visible'));
 assert.match(html,/<dialog id="siteUpdateDialog"/);
 assert.match(html,/id="siteUpdateTabLatest"[^>]*role="tab"/);
 assert.match(html,/id="siteUpdateTabHistory"[^>]*role="tab"/);
 assert.match(html,/id="siteUpdatePanelHistory"[^>]*hidden/);
 assert.match(css,/\.mw-updates-dialog\{/);
 assert.match(css,/max-height:min\(80vh,80dvh\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/html\[data-theme="dark"\] \.mw-updates-dialog/);
 assert.doesNotMatch(html,/id="siteUpdateDetail"[^>]*href=/);
});

// Regression: announcement whitespace remains inert, only text buttons are interactive.
test("V1.1 notice outer strip and flex whitespace are not clickable",()=>{
 const html=read("public/index.html"),js=read("public/site-updates.js"),css=read("public/site-updates.css");
 assert.match(html,/<div id="siteUpdateMessage" class="mw-update-message">/);
 assert.match(html,/id="siteUpdateTitle" class="mw-update-title-trigger" type="button"/);
 assert.match(html,/id="siteUpdateMeta" class="mw-update-meta" type="button"/);
 assert.doesNotMatch(html,/id="siteUpdateMessage"[^>]*type="button"/);
 assert.doesNotMatch(js,/\$\("siteUpdateMessage"\)\.onclick/);
 assert.match(js,/\$\("siteUpdateTitle"\)\.onclick/);
 assert.match(js,/\$\("siteUpdateMeta"\)\.onclick/);
 assert.match(css,/\.mw-update-title-trigger\{[^}]*flex:0 1 auto/);
 assert.doesNotMatch(css,/\.mw-update-message\{[^}]*cursor:pointer/);
});