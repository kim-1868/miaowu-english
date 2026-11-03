// Server-side merchant issuance. Never returns vouchers to public readers.
// Uses the existing production ACTIVATION_PEPPER without revealing the Secret
// to merchant devices. Independent publisher authorization and explicit gate.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
import {hashCode,normalizeCode,hmacHex,requireSecret} from "./security.js";

const HEADERS={
 "content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "content-security-policy":"default-src 'none'; frame-ancestors 'none'"
};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const fail=(code,status=400)=>answer({error:code},status);
const CATEGORY=/^[a-z][a-z0-9-]{2,29}$/;
const TITLE_MAX=40;
const ORDER=/^ORD-[A-Z0-9][A-Z0-9_-]{5,55}$/;
function normalizeOrder(value){
 if(typeof value!=="string")return null;
 const raw=value.normalize("NFKC").trim().toUpperCase();
 const ref=raw.startsWith("ORD-")?raw:"ORD-"+raw;
 return ORDER.test(ref)?ref:null;
}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return null;
 if(+(req.headers.get("content-length")||0)>2048)return null;
 const text=await req.text();
 if(new TextEncoder().encode(text).byteLength>2048)return null;
 try{
  const data=JSON.parse(text);
  return data&&typeof data==="object"&&!Array.isArray(data)?data:null;
 }catch{return null}
}
function tokenHex(bytes=20){
 return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
  b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function mintVoucher(category,env){
 const raw=tokenHex();
 const code="MW-"+category.toUpperCase()+"-"+(raw.match(/.{8}/g)||[]).join("-");
 return {code,hash:await hashCode(normalizeCode(code),env)};
}
async function mintRecovery(env){
 const raw=tokenHex();
 const key="MW-REC-"+(raw.match(/.{8}/g)||[]).join("-");
 const digest=await hmacHex(requireSecret(env),"order-recovery:v1:"+key.replaceAll("-",""));
 return {key,digest};
}
function stmt(db,sql,...args){return db.prepare(sql).bind(...args)}
// All configured learning categories are visible to authorized merchants.
 // The public bookshelf still reads ONLY categories where is_visible=1.
 // Do not confuse "created" with "launched", or "launched" with "saleable".
async function categories(env){
 const data=await env.DB.prepare(`SELECT c.slug,c.title,c.is_visible,
  (SELECT COUNT(*) FROM books b WHERE b.category_id=c.id
    AND b.status='draft') AS draft_books,
  (SELECT COUNT(*) FROM books b
   WHERE b.category_id=c.id AND b.status='published'
    AND EXISTS(SELECT 1 FROM chapters ch WHERE ch.book_id=b.id
     AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP)) AS published_books
  FROM categories c ORDER BY
    CASE c.slug WHEN 'cet4' THEN 0 WHEN 'cet6' THEN 1
      WHEN 'postgrad' THEN 2 WHEN 'ielts' THEN 3 ELSE 4 END,
    c.slug LIMIT 40`).all();
 return answer({categories:(data.results||[]).map(c=>({
  slug:c.slug,title:c.title,isVisible:Boolean(c.is_visible),
  draftBooks:Number(c.draft_books),publishedBooks:Number(c.published_books),
  issuable:Boolean(c.is_visible)&&Number(c.published_books)>0,
  status:!c.is_visible?"draft":
    Number(c.published_books)>0?"on_sale":"preparing"
 }))});
}
// Adding a category has no impact on the public shelf or customer rights.
async function createCategory(env,request,operator){
 const data=await body(request);
 const slug=data?.slug;
 const title=typeof data?.title==="string"?data.title.normalize("NFKC").trim():"";
 if(typeof slug!=="string"||!CATEGORY.test(slug)||
    title.length<2||title.length>TITLE_MAX||/[\\u0000-\\u001f]/.test(title))
  return fail("INVALID_CATEGORY_INPUT",400);
 const auditId=crypto.randomUUID(),reqId=crypto.randomUUID();
 try{
  await env.DB.batch([
   stmt(env.DB,`INSERT INTO categories(id,slug,title,is_visible)
      SELECT ?,?,?,0 WHERE (SELECT COUNT(*) FROM categories)<30`,
      slug,slug,title),
   stmt(env.DB,`INSERT INTO ops_audit_events
    (id,actor_id,event_type,resource_type,resource_id,request_id,reason_code)
    VALUES (?,?,CASE WHEN changes()=1 THEN 'category.create' ELSE NULL END,
      'category',?,?,'HIDDEN_UNTIL_LAUNCH')`,
      auditId,operator.id,slug,reqId)
  ]);
 }catch{return fail("CATEGORY_CREATE_REJECTED",409)}
 return answer({created:true,slug,title,isVisible:false,issuable:false},201);
}
// Launch means opening the category to the public bookshelf; it does not
// grant a buyer any additional entitlement. Require a published chapter first.
async function launchCategory(env,request,operator){
 const data=await body(request);
 const slug=data?.slug;
 if(typeof slug!=="string"||!CATEGORY.test(slug))
  return fail("INVALID_CATEGORY_INPUT",400);
 const auditId=crypto.randomUUID(),reqId=crypto.randomUUID();
 try{
  await env.DB.batch([
   stmt(env.DB,`UPDATE categories SET is_visible=1 WHERE slug=?
      AND is_visible=0 AND EXISTS(SELECT 1 FROM books b
        WHERE b.category_id=categories.id AND b.status='published'
        AND EXISTS(SELECT 1 FROM chapters ch WHERE ch.book_id=b.id
          AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP))`,slug),
   stmt(env.DB,`INSERT INTO ops_audit_events
    (id,actor_id,event_type,resource_type,resource_id,request_id,reason_code)
    VALUES (?,?,CASE WHEN changes()=1 THEN 'category.launch' ELSE NULL END,
      'category',?,?,'PUBLISHED_CONTENT_CONFIRMED')`,
      auditId,operator.id,slug,reqId)
  ]);
 }catch{return fail("CATEGORY_LAUNCH_REJECTED",409)}
 return answer({launched:true,slug,isVisible:true},200);
}
async function status(env,request){
 const data=await body(request);
 const order=normalizeOrder(data?.orderReference);
 if(!order)return fail("INVALID_ORDER_REFERENCE",400);
 const found=await stmt(env.DB,`SELECT a.order_reference,c.slug,c.title,a.status,a.redeemed_at,
  r.reset_count,(r.code_id IS NOT NULL) AS recovery_assigned
  FROM activation_codes a
  JOIN categories c ON c.id=a.category_id
  LEFT JOIN order_recovery_credentials r ON r.code_id=a.id
  WHERE a.order_reference=?`,order).first();
 return answer({found:!!found,order:found||null});
}
async function issue(env,request,operator){
 const data=await body(request);
 const order=normalizeOrder(data?.orderReference);
 const category=data?.categoryId;
 if(!order||typeof category!=="string"||!CATEGORY.test(category)||data?.paymentConfirmed!==true||
    data?.contentConfirmed!==true)
  return fail("INVALID_SALES_CONFIRMATION",400);
 // Explicit cap on creation even if operator token is compromised.
 const voucher=await mintVoucher(category,env);
 const recovery=await mintRecovery(env);
 const id=crypto.randomUUID(),auditId=crypto.randomUUID(),requestId=crypto.randomUUID();
 try{
  await env.DB.batch([
   stmt(env.DB,`INSERT INTO activation_codes
      (id,code_hash,category_id,status,order_reference)
      SELECT ?,?,c.id,'unused',? FROM categories c
      WHERE c.slug=? AND c.is_visible=1
        AND EXISTS(SELECT 1 FROM books b WHERE b.category_id=c.id
         AND b.status='published' AND EXISTS(SELECT 1 FROM chapters ch
         WHERE ch.book_id=b.id AND ch.published_at IS NOT NULL
           AND ch.published_at<=CURRENT_TIMESTAMP))
        AND (SELECT COUNT(*) FROM activation_codes a
         WHERE a.order_reference IS NOT NULL
           AND a.created_at>=date('now'))<30`,
      id,voucher.hash,order,category),
   stmt(env.DB,`INSERT INTO order_recovery_credentials(code_id,secret_hash)
     VALUES (?,?)`,id,recovery.digest),
   stmt(env.DB,`INSERT INTO ops_audit_events
     (id,actor_id,event_type,resource_type,resource_id,request_id,reason_code)
     VALUES (?,?,'sale.issue','order',?,?,'PAYMENT_AND_CONTENT_CONFIRMED')`,
     auditId,operator.id,order,requestId)
  ]);
 }catch{
  // Do not issue again on a retry. In particular, an already-used order
  // must never receive a second code even after a network timeout.
  return fail("ORDER_ISSUE_REJECTED",409);
 }
 // The only server response containing plaintext. No logging or persistence
 // in D1 / session / cookies. Browser is instructed not to cache it.
 return answer({issued:true,orderReference:order,categoryId:category,
  activationCode:voucher.code,recoveryKey:recovery.key,
  instruction:"Copy and deliver these privately now; they cannot be retrieved again."},201);
}
export async function handleOpsSales(req,env,path){
 if(env.APP_ENV!=="production"||env.OPS_SALES_ENABLED!=="true"||
    env.ORDER_RECOVERY_ENABLED!=="true")return fail("OPS_SALES_DISABLED",403);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return fail("OPS_ROLE_FORBIDDEN",403);
 try{
  if(path==="/api/ops/sales/categories"&&req.method==="GET")return await categories(env);
  if(path==="/api/ops/sales/categories/create"&&req.method==="POST")
    return await createCategory(env,req,auth.operator);
  if(path==="/api/ops/sales/categories/launch"&&req.method==="POST")
    return await launchCategory(env,req,auth.operator);
  if(path==="/api/ops/sales/status"&&req.method==="POST")return await status(env,req);
  if(path==="/api/ops/sales/issue"&&req.method==="POST")return await issue(env,req,auth.operator);
  return fail("NOT_FOUND",404);
 }catch{
  // Fixed log label only: never leak order refs, secrets or voucher contents.
  console.error("OPS_SALES_FAILED");
  return fail("OPS_SALES_UNAVAILABLE",503);
 }
}
