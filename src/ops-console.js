// S9-C: isolated operator console read models and emergency controlled withdrawal.
// This module NEVER makes a withdrawn paid chapter available without entitlement.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer",
  "content-security-policy":"default-src 'none'; frame-ancestors 'none'"};
const answer=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:HEADERS});
const error=(code,status=400)=>answer({error:code},status);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,100}$/;
const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
async function schemaReady(db){
  for(const [table,expected] of Object.entries({
    ops_audit_events:["id","actor_id","event_type","request_id"],
    ops_book_content_versions:["book_id","version"]
  })){
    const result=await db.prepare("PRAGMA table_info("+table+")").all();
    if(expected.some(f=>!(result.results||[]).some(r=>r.name===f)))return false;
  }
  const result=await db.prepare("PRAGMA table_info(books)").all();
  return (result.results||[]).some(r=>r.name==="last_release_request_id");
}
async function getBook(db,id){
  return query(db,`SELECT b.id,b.title,b.status,b.category_id,b.last_release_request_id,
    (SELECT COUNT(*) FROM chapters WHERE book_id=b.id) AS chapter_count,
    (SELECT COUNT(*) FROM chapters WHERE book_id=b.id AND published_at IS NOT NULL) AS live_count,
    (SELECT COUNT(*) FROM chapters WHERE book_id=b.id AND is_preview=1) AS preview_count,
    (SELECT COUNT(*) FROM entitlements e WHERE e.category_id=b.category_id
     AND e.revoked_at IS NULL) AS active_category_grants
    FROM books b WHERE b.id=?`,id).first();
}
async function listBooks(env){
  const rows=await env.DB.prepare(`SELECT b.id,b.title,b.status,b.category_id,
    (SELECT COUNT(*) FROM chapters c WHERE c.book_id=b.id) AS chapter_count,
    (SELECT COUNT(*) FROM chapters c WHERE c.book_id=b.id AND c.published_at IS NOT NULL) AS live_count
    FROM books b WHERE b.status IN ('draft','published')
    ORDER BY b.rowid DESC LIMIT 100`).all();
  return answer({books:rows.results||[],scope:"operator-only",publishEnabled:env.OPS_PUBLICATION_ENABLED==="true",
    withdrawalEnabled:env.OPS_WITHDRAWAL_ENABLED==="true"});
}
async function audit(env,id){
  const b=await getBook(env.DB,id);
  if(!b)return error("BOOK_NOT_FOUND",404);
  const rows=await query(env.DB,`SELECT a.id,a.event_type,a.actor_id,a.request_id,
    a.reason_code,a.reason_note,a.created_at
    FROM ops_audit_events a WHERE a.resource_type='book' AND a.resource_id=?
    ORDER BY a.rowid DESC LIMIT 30`,id).all();
  return answer({book:{id:b.id,title:b.title,status:b.status},events:rows.results||[]});
}
async function withdrawalPreview(env,id){
  const b=await getBook(env.DB,id);
  if(!b)return error("BOOK_NOT_FOUND",404);
  return answer({book:{id:b.id,title:b.title,status:b.status,category:b.category_id},
    chapters:b.chapter_count,publishedChapters:b.live_count,previewChapters:b.preview_count,
    activeCategoryGrants:Number(b.active_category_grants),
    canWithdraw:b.status==="published"&&env.OPS_WITHDRAWAL_ENABLED==="true",
    effects:["公开书架与全部章节立即不可访问","原有分类权益、激活码、阅读进度与复习记录不会被删除",
      "之前已购买用户暂时无法阅读撤回的章节，必须按实际服务及售后承诺处理"],
    note:"本操作不会自动退款、撤销已售激活码或重新发布。再次上架需重新审核。"});
}
async function parseBody(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
    return {error:"CONTENT_TYPE"};
  if(Number(req.headers.get("content-length")||0)>2500)return {error:"TOO_LARGE"};
  const raw=await req.text();
  if(new TextEncoder().encode(raw).byteLength>2500)return {error:"TOO_LARGE"};
  try{const v=JSON.parse(raw);if(!v||typeof v!=="object"||Array.isArray(v))throw Error();return {value:v}}
  catch{return {error:"INVALID_JSON"}}
}
async function withdraw(req,env,operator,id){
  if(env.OPS_WITHDRAWAL_ENABLED!=="true")return error("OPS_WITHDRAWAL_DISABLED",403);
  const parsed=await parseBody(req);
  if(parsed.error)return error(parsed.error,400);
  const d=parsed.value;
  if(!REQUEST_ID.test(d.requestId||"")||typeof d.confirmTitle!=="string"||
     d.confirmAction!=="WITHDRAW_PUBLIC_ACCESS"||
     typeof d.reason!=="string"||d.reason.trim().length<12||d.reason.length>400||
     /[\u0000-\u001f]/.test(d.reason))return error("INVALID_WITHDRAWAL_CONFIRMATION",400);
  // Unique event and request id allows safe retry without altering a newer state.
  const prior=await query(env.DB,`SELECT actor_id,resource_id
    FROM ops_audit_events WHERE event_type='book.withdraw' AND request_id=?`,d.requestId).first();
  if(prior)return prior.actor_id===operator.id&&prior.resource_id===id
    ?answer({withdrawn:true,alreadyApplied:true,bookId:id})
    :error("REQUEST_ALREADY_USED",409);
  const b=await getBook(env.DB,id);
  if(!b)return error("BOOK_NOT_FOUND",404);
  if(b.status!=="published")return error("BOOK_NOT_PUBLISHED",409);
  if(b.title!==d.confirmTitle)return error("WITHDRAWAL_TITLE_MISMATCH",409);
  const auditId=crypto.randomUUID();
  try{
    // D1.batch is transactional. A failed CAS or audit insertion aborts all
    // state changes. The CASE expression deliberately violates NOT NULL
    // audit.event_type if a required condition was not met.
    await env.DB.batch([
      query(env.DB,`UPDATE books SET status='draft',last_release_request_id=?
        WHERE id=? AND status='published' AND last_release_request_id IS ?`,
        d.requestId,id,b.last_release_request_id),
      query(env.DB,`UPDATE chapters SET published_at=NULL
        WHERE book_id=? AND EXISTS(SELECT 1 FROM books WHERE id=?
        AND status='draft' AND last_release_request_id=?)`,id,id,d.requestId),
      query(env.DB,`INSERT INTO ops_audit_events
        (id,actor_id,event_type,resource_type,resource_id,request_id,reason_code,reason_note)
        VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM books
        WHERE id=? AND status='draft' AND last_release_request_id=?)
        AND NOT EXISTS(SELECT 1 FROM chapters WHERE book_id=? AND published_at IS NOT NULL)
        THEN 'book.withdraw' ELSE NULL END,'book',?,?,'OWNER_CONFIRMED_WITHDRAWAL',?)`,
        auditId,operator.id,id,d.requestId,id,id,d.requestId,d.reason.trim())
    ]);
  }catch{return error("WITHDRAWAL_CONFLICT",409)}
  return answer({withdrawn:true,bookId:id,
    retained:"entitlements, reading_progress, user_words and review_events",
    supportActionRequired:Number(b.active_category_grants)>0},201);
}
export async function handleOpsConsole(req,env,path){
  if(!["staging","production"].includes(env.APP_ENV))return error("NOT_FOUND",404);
  if(env.OPS_CONSOLE_ENABLED!=="true")return error("OPS_CONSOLE_DISABLED",403);
  const list=path==="/api/ops/books"&&req.method==="GET";
  const match=path.match(/^\/api\/ops\/books\/([a-z][a-z0-9_-]{2,79})\/(withdraw-readiness|audit|withdraw)$/);
  if(!list&&!match)return error("NOT_FOUND",404);
  const action=match?.[2];
  if(match&&((action==="withdraw"&&req.method!=="POST")||
    (action!=="withdraw"&&req.method!=="GET")))return error("NOT_FOUND",404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,"publisher"))return error("OPS_ROLE_FORBIDDEN",403);
  if(!(await schemaReady(env.DB)))return error("OPS_RELEASE_SCHEMA_REQUIRED",503);
  try{
    if(list)return listBooks(env);
    if(action==="withdraw-readiness")return withdrawalPreview(env,match[1]);
    if(action==="audit")return audit(env,match[1]);
    return withdraw(req,env,auth.operator,match[1]);
  }catch{console.error("OPS_CONSOLE_FAILED");return error("OPS_BACKEND_UNAVAILABLE",503)}
}
