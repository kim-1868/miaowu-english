// WordLetter site announcements. Completely separate from learning/paid content.
// Public reads expose PUBLISHED rows only; admin mutations require the existing
// independent publisher credential, same-origin enforcement at worker boundary,
// and an opt-in isolated schema. No automatic production migration.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const err=(code,status=400)=>respond({error:code},status);
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const CATEGORIES=new Set(["feature","books","maintenance","other"]);
const PUBLISHER_ENV=new Set(["production","staging"]);
const view=r=>({id:r.id,title:r.title,summary:r.summary,body:r.body,
 category:r.category,showOnHome:r.show_on_home===1,
 publishedAt:r.published_at});
const editorView=r=>({...view(r),status:r.status,revision:r.revision,
 createdAt:r.created_at,updatedAt:r.updated_at});
const text=(value,min,max)=>typeof value==="string"&&value.trim().length>=min&&
 value.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&
 !/mwops_[a-f0-9]{64}/i.test(value);
const readInput=async req=>{
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return {error:"CONTENT_TYPE"};
 if(Number(req.headers.get("content-length")||0)>7000)return {error:"TOO_LARGE"};
 const raw=await req.text();
 if(new TextEncoder().encode(raw).length>7000)return {error:"TOO_LARGE"};
 try{
  const value=JSON.parse(raw);
  if(!value||Array.isArray(value)||typeof value!=="object")return {error:"INVALID_JSON"};
  return {value};
 }catch{return {error:"INVALID_JSON"}}
};
const fields=v=>{
 const {title,summary,body,category,showOnHome}=v;
 if(!text(title,1,90)||!text(summary,1,180)||!text(body,1,4000)||
    !CATEGORIES.has(category)||typeof showOnHome!=="boolean")
   return null;
 return {title:title.trim(),summary:summary.trim(),body:body.trim(),
  category,showOnHome:showOnHome?1:0};
};
const schemaReady=async db=>{
 try{
  const columns=await q(db,"PRAGMA table_info(site_announcements)").all();
  const names=new Set((columns.results||[]).map(x=>x.name));
  return ["id","title","summary","body","category","status","show_on_home",
   "revision","published_at","updated_at"].every(x=>names.has(x));
 }catch{return false}
};
// Explicit publisher-approved STAGING-ONLY setup. No deployment token or automatic
// production schema mutation. Only creates an independent additive notice table.
async function initializeStagingAnnouncementSchema(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS site_announcements ("+
  "id TEXT PRIMARY KEY,"+
  "title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 90),"+
  "summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 180),"+
  "body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),"+
  "category TEXT NOT NULL CHECK(category IN ('feature','books','maintenance','other')),"+
  "status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','withdrawn')),"+
  "show_on_home INTEGER NOT NULL DEFAULT 1 CHECK(show_on_home IN (0,1)),"+
  "revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),"+
  "created_by TEXT NOT NULL,updated_by TEXT NOT NULL,"+
  "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
  "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
  "published_at TEXT,"+
  "CHECK((status='draft' AND published_at IS NULL) OR status!='draft'))").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_site_announcements_public "+
  "ON site_announcements(status,show_on_home,published_at DESC,id DESC)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_site_announcements_admin "+
  "ON site_announcements(updated_at DESC,id DESC)").run();
 return schemaReady(db);
}
const select="id,title,summary,body,category,status,show_on_home,revision,"+
 "created_at,updated_at,published_at";
// Exactly two clearly labeled demonstration entries for a protected staging
// site without D1 query permission. Never used in production and never stored
// as real published owner content.
const PREVIEW_DEMO_UPDATES=Object.freeze([
 {id:"d6e8f098-18fd-46e1-a1ab-45167df393e1",
  title:"预览示例：妙屋新鲜事上线啦",
  summary:"我们正在试用新的更新公告栏。点击详情可查看完整说明。",
  body:"喵呜～这里是妙屋英语 V1.1 测试站的演示公告。\n你可以先体验首页公告关闭、历史记录查看和运营台管理布局。\n这条内容仅为预览示例，不代表正式网站已发布。",
  category:"feature",showOnHome:true,publishedAt:"2026-11-07 10:00:00"},
 {id:"831e827d-f941-43b0-b7e0-6ea84076db65",
  title:"预览示例：历史更新可以随时查看",
  summary:"即使关闭首页公告，也可以回到更新日志里查看。",
  body:"这是测试站的第二条演示公告。正式启用后，所有已发布消息会按时间从新到旧排列，草稿和下架公告则不会公开。",
  category:"other",showOnHome:false,publishedAt:"2026-11-06 10:00:00"}
]);
function stagingOnlyDemo(env,path,req){
 if(env.APP_ENV!=="staging"||env.PREVIEW_ANNOUNCEMENT_DEMO!=="true")return null;
 if(path==="/api/updates/latest")return respond({latest:PREVIEW_DEMO_UPDATES[0],available:false,previewOnly:true});
 if(path==="/api/updates"){
  const query=new URL(req.url).searchParams.get("page")||"1";
  if(!/^[1-9][0-9]{0,4}$/.test(query))return err("INVALID_PAGE",400);
  return respond({updates:query==="1"?PREVIEW_DEMO_UPDATES:[],total:2,
   page:Number(query),hasMore:false,available:false,previewOnly:true});
 }
 const id=path.match(/^\/api\/updates\/([a-f0-9-]{36})$/i)?.[1];
 if(id){
  const item=PREVIEW_DEMO_UPDATES.find(x=>x.id===id);
  return item?respond({update:item,previewOnly:true}):err("UPDATE_NOT_FOUND",404);
 }
 return null;
}
async function publicRoute(req,env,path){
 if(req.method!=="GET")return err("NOT_FOUND",404);
 if(!await schemaReady(env.DB)){
  const demo=stagingOnlyDemo(env,path,req);
  if(demo)return demo;
  if(path==="/api/updates/latest")return respond({latest:null,available:false});
  if(path==="/api/updates")return respond({updates:[],total:0,page:1,hasMore:false,available:false});
  return err("UPDATE_NOT_FOUND",404);
 }
 if(path==="/api/updates/latest"){
  const row=await q(env.DB,"SELECT "+select+" FROM site_announcements "+
   "WHERE status='published' AND show_on_home=1 "+
   "ORDER BY published_at DESC,created_at DESC,id DESC LIMIT 1").first();
  if(!row&&env.APP_ENV==="staging"&&env.PREVIEW_ANNOUNCEMENT_DEMO==="true"){
    // A real operator-created draft must NOT be replaced with a fake published banner.
    const count=await q(env.DB,"SELECT COUNT(*) n FROM site_announcements").first();
    if(Number(count?.n||0)===0)return stagingOnlyDemo(env,path,req);
  }
  return respond({latest:row?view(row):null,available:true});
 }
 if(path==="/api/updates"){
  const params=new URL(req.url).searchParams;
  const raw=params.get("page")||"1";
  if(!/^[1-9][0-9]{0,4}$/.test(raw))return err("INVALID_PAGE",400);
  const page=Number(raw),size=15,offset=(page-1)*size;
  const totalRow=await q(env.DB,"SELECT COUNT(*) n FROM site_announcements WHERE status='published'").first();
  const total=Number(totalRow?.n||0);
  if(total===0&&env.APP_ENV==="staging"&&env.PREVIEW_ANNOUNCEMENT_DEMO==="true"){
    const count=await q(env.DB,"SELECT COUNT(*) n FROM site_announcements").first();
    if(Number(count?.n||0)===0)return stagingOnlyDemo(env,path,req);
  }
  const result=await q(env.DB,"SELECT "+select+" FROM site_announcements WHERE status='published' "+
    "ORDER BY published_at DESC,created_at DESC,id DESC LIMIT ? OFFSET ?",size,offset).all();
  return respond({updates:(result.results||[]).map(view),total,page,hasMore:offset+size<total,available:true});
 }
 const match=path.match(/^\/api\/updates\/([a-f0-9-]{36})$/i);
 if(match){
  const row=await q(env.DB,"SELECT "+select+" FROM site_announcements "+
    "WHERE id=? AND status='published'",match[1]).first();
  return row?respond({update:view(row)}):err("UPDATE_NOT_FOUND",404);
 }
 return err("NOT_FOUND",404);
}
const audit=(env,actor,action,id,expectedRevision)=>q(env.DB,
 "INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id) "+
 "VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM site_announcements WHERE id=? "+
 "AND revision=? AND updated_by=?) AND changes()=1 THEN ? ELSE NULL END,'announcement',?,?)",
 crypto.randomUUID(),actor.id,id,expectedRevision,actor.id,"announcement."+action,id,crypto.randomUUID());
async function adminRoute(req,env,path){
 if(!PUBLISHER_ENV.has(env.APP_ENV))return err("NOT_FOUND",404);
 if(env.OPS_CONSOLE_ENABLED!=="true")return err("OPS_CONSOLE_DISABLED",403);
 if(env.APP_ENV==="production"&&env.OPS_ANNOUNCEMENTS_ENABLED!=="true")
  return err("OPS_ANNOUNCEMENTS_DISABLED",403);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return err("OPS_ROLE_FORBIDDEN",403);
 const ready=await schemaReady(env.DB);
 if(path==="/api/ops/updates/setup"){
  if(req.method!=="POST")return err("NOT_FOUND",404);
  // This route is available ONLY in password-protected staging and requires
  // a verified publisher credential + same-origin POST (at the worker boundary).
  if(env.APP_ENV!=="staging")return err("NOT_FOUND",404);
  if(!ready){
   try{if(!await initializeStagingAnnouncementSchema(env.DB))
    return err("ANNOUNCEMENTS_SCHEMA_REQUIRED",503)}
   catch{console.error("STAGING_ANNOUNCEMENTS_SETUP_FAILED");
    return err("ANNOUNCEMENTS_SCHEMA_SETUP_FAILED",503)}
  }
  return respond({ready:true,created:!ready});
 }
 if(!ready){
  if(path==="/api/ops/updates"&&req.method==="GET")
   return respond({updates:[],setupRequired:true});
  return err("ANNOUNCEMENTS_SCHEMA_REQUIRED",503);
 }
 const actor=auth.operator;
 if(path==="/api/ops/updates"&&req.method==="GET"){
  const rows=await q(env.DB,"SELECT "+select+" FROM site_announcements "+
   "ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 250").all();
  return respond({updates:(rows.results||[]).map(editorView)});
 }
 if(path==="/api/ops/updates"&&req.method==="POST"){
  const input=await readInput(req);if(input.error)return err(input.error,400);
  const v=fields(input.value);if(!v)return err("INVALID_ANNOUNCEMENT",400);
  const id=crypto.randomUUID();
  const statements=[
    q(env.DB,"INSERT INTO site_announcements "+
      "(id,title,summary,body,category,status,show_on_home,created_by,updated_by) "+
      "VALUES(?,?,?,?,?,'draft',?,?,?)",id,v.title,v.summary,v.body,v.category,
      v.showOnHome,actor.id,actor.id),
    audit(env,actor,"create",id,1)
  ];
  try{await env.DB.batch(statements)}
  catch{return err("ANNOUNCEMENT_WRITE_FAILED",409)}
  return respond({id,status:"draft",revision:1},201);
 }
 const match=path.match(/^\/api\/ops\/updates\/([a-f0-9-]{36})(?:\/(publish|withdraw))?$/i);
 if(!match)return err("NOT_FOUND",404);
 const id=match[1],action=match[2]||"edit",method=action==="edit"?"PUT":"POST";
 if(req.method!==method)return err("NOT_FOUND",404);
 const input=await readInput(req);if(input.error)return err(input.error,400);
 const expectedRevision=input.value.revision;
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return err("INVALID_REVISION",400);
 const current=await q(env.DB,"SELECT id,status,revision FROM site_announcements WHERE id=?",id).first();
 if(!current)return err("UPDATE_NOT_FOUND",404);
 if(current.revision!==expectedRevision)return err("ANNOUNCEMENT_STALE",409);
 if(action==="edit"){
  const v=fields(input.value);if(!v)return err("INVALID_ANNOUNCEMENT",400);
  try{
   await env.DB.batch([
    q(env.DB,"UPDATE site_announcements SET title=?,summary=?,body=?,category=?,"+
      "show_on_home=?,updated_by=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP "+
      "WHERE id=? AND revision=?",v.title,v.summary,v.body,v.category,v.showOnHome,
       actor.id,id,expectedRevision),
    audit(env,actor,"edit",id,expectedRevision+1)
   ]);
  }catch{return err("ANNOUNCEMENT_CONFLICT",409)}
  return respond({id,status:current.status,revision:expectedRevision+1});
 }
 if(action==="publish"&&current.status==="published")
  return err("ALREADY_PUBLISHED",409);
 if(action==="withdraw"&&current.status!=="published")
  return err("NOT_PUBLISHED",409);
 try{
  await env.DB.batch([
   q(env.DB,"UPDATE site_announcements SET status=?,published_at="+
     (action==="publish"?"CURRENT_TIMESTAMP":"published_at")+
     ",updated_by=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP "+
     "WHERE id=? AND revision=? AND status=?",
     action==="publish"?"published":"withdrawn",actor.id,id,expectedRevision,current.status),
   audit(env,actor,action,id,expectedRevision+1)
  ]);
 }catch{return err("ANNOUNCEMENT_CONFLICT",409)}
 return respond({id,status:action==="publish"?"published":"withdrawn",revision:expectedRevision+1});
}
export async function handleSiteAnnouncements(req,env,path){
 // Preview ONLY. This feature must not be reachable on the public site yet.
 if(env.APP_ENV!=="staging")return err("NOT_FOUND",404);
 if(!env.DB)return err("DATABASE_UNAVAILABLE",503);
 if(path.startsWith("/api/ops/updates"))return adminRoute(req,env,path);
 try{return await publicRoute(req,env,path)}
 catch{console.error("PUBLIC_ANNOUNCEMENTS_UNAVAILABLE");return err("ANNOUNCEMENTS_UNAVAILABLE",503)}
}
