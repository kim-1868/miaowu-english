// Public opt-in self-service claim. No Xiaohongshu payment verification:
// purchase references are buyer assertions, manually reconciled later.
// Codes and independent recovery credentials appear ONCE in this response.
import {hashCode,normalizeCode,hmacHex,requireSecret,throttleKey,isBlocked,countFailure,checkOrigin} from "./security.js";

const HEADERS={
 "content-type":"application/json; charset=utf-8",
 "cache-control":"no-store, private, max-age=0",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "content-security-policy":"default-src 'none'; frame-ancestors 'none'",
 "x-robots-tag":"noindex, nofollow"
};
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
const fail=(error,status=400)=>respond({error},status);
const CATEGORY=/^[a-z][a-z0-9-]{2,29}$/;
const ORDER=/^ORD-[A-Z0-9][A-Z0-9_-]{9,55}$/;
function normalizeOrder(value){
 if(typeof value!=="string")return null;
 const raw=value.normalize("NFKC").trim().toUpperCase();
 const order=raw.startsWith("ORD-")?raw:"ORD-"+raw;
 return ORDER.test(order)&&/[0-9]/.test(order)?order:null;
}
function randomHex(bytes=20){
 return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
  b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function formatSecret(prefix,raw){
 return prefix+(raw.match(/.{8}/g)||[]).join("-");
}
function stmt(db,sql,...params){return db.prepare(sql).bind(...params)}
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return null;
 if(Number(req.headers.get("content-length")||0)>1200)return null;
 const source=await req.text();
 if(new TextEncoder().encode(source).byteLength>1200)return null;
 try{
  const value=JSON.parse(source);
  return value&&typeof value==="object"&&!Array.isArray(value)?value:null;
 }catch{return null;}
}
async function saleableCategories(db){
 const res=await db.prepare(`SELECT c.id,c.slug,c.title FROM categories c
  WHERE c.is_visible=1 AND EXISTS(
    SELECT 1 FROM books b JOIN chapters ch ON ch.book_id=b.id
    WHERE b.category_id=c.id AND b.status='published'
      AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP)
  ORDER BY CASE c.slug WHEN 'cet4' THEN 0 WHEN 'cet6' THEN 1
    WHEN 'postgrad' THEN 2 WHEN 'ielts' THEN 3 ELSE 4 END,c.slug LIMIT 40`).all();
 return res.results||[];
}
export async function handlePublicClaim(req,env,path){
 if(env.APP_ENV!=="production"||!env.DB)return fail("NOT_FOUND",404);
 if(path==="/api/claim/categories"&&req.method==="GET"){
  if(env.SELF_CLAIM_ENABLED!=="true")
   return respond({enabled:false,categories:[]});
  try{return respond({enabled:true,categories:await saleableCategories(env.DB)});}
  catch{console.error("CLAIM_CATALOG_UNAVAILABLE");return fail("CLAIM_UNAVAILABLE",503);}
 }
 if(path!=="/api/claim/issue"||req.method!=="POST")return fail("NOT_FOUND",404);
 if(env.SELF_CLAIM_ENABLED!=="true")return fail("CLAIM_CLOSED",503);
 if(!checkOrigin(req))return fail("INVALID_ORIGIN",403);
 const data=await body(req);
 const order=normalizeOrder(data?.orderReference),category=data?.categoryId;
 if(!order||typeof category!=="string"||!CATEGORY.test(category))return fail("INVALID_CLAIM_INPUT",400);
 if(typeof env.ACTIVATION_PEPPER!=="string"||env.ACTIVATION_PEPPER.length<32)
  return fail("CLAIM_UNAVAILABLE",503);
 const key=await throttleKey(env,"claim-center",req);
 try{
  if(await isBlocked(env.DB,key))return fail("TOO_MANY_ATTEMPTS",429);
  const available=await saleableCategories(env.DB);
  const product=available.find(c=>c.slug===category);
  if(!product)return fail("PACKAGE_UNAVAILABLE",409);
  // Duplicate orders include manually issued orders, not only this new flow.
  if(await stmt(env.DB,
    "SELECT 1 AS existing FROM activation_codes WHERE order_reference=?",order).first()){
   await countFailure(env.DB,key);
   return fail("ORDER_ALREADY_CLAIMED",409);
  }
  const digest=await hmacHex(requireSecret(env),"selfclaim:requester:"+
    (req.headers.get("cf-connecting-ip")||"unknown"));
  const limit=await stmt(env.DB,`SELECT
    (SELECT COUNT(*) FROM self_service_claims WHERE claimed_at>=datetime('now','-1 day')) AS all_today,
    (SELECT COUNT(*) FROM self_service_claims
     WHERE requester_digest=? AND claimed_at>=datetime('now','-1 day')) AS ip_today`,digest).first();
  if(Number(limit?.all_today||0)>=40||Number(limit?.ip_today||0)>=3)
   return fail("CLAIM_LIMIT_REACHED",429);
  const raw=randomHex(),code=formatSecret("MW-"+category.toUpperCase()+"-",raw);
  const codeHash=await hashCode(normalizeCode(code),env);
  const recoveryRaw=randomHex(),recoveryKey=formatSecret("MW-REC-",recoveryRaw);
  const recoveryDigest=await hmacHex(requireSecret(env),
   "order-recovery:v1:"+recoveryKey.replaceAll("-",""));
  const id=crypto.randomUUID(),claimId=crypto.randomUUID();
  try{
   // D1.batch is transactional. The limits are checked again inside the
   // INSERT to prevent two concurrent requests bypassing the preflight.
   const operations=[
    stmt(env.DB,`INSERT INTO activation_codes(id,code_hash,category_id,status,order_reference)
     SELECT ?,?,c.id,'unused',? FROM categories c
     WHERE c.slug=? AND c.is_visible=1
     AND EXISTS(SELECT 1 FROM books b JOIN chapters ch ON ch.book_id=b.id
       WHERE b.category_id=c.id AND b.status='published'
       AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP)
     AND NOT EXISTS(SELECT 1 FROM activation_codes a WHERE a.order_reference=?)
     AND (SELECT COUNT(*) FROM self_service_claims
       WHERE claimed_at>=datetime('now','-1 day'))<40
     AND (SELECT COUNT(*) FROM self_service_claims
       WHERE requester_digest=? AND claimed_at>=datetime('now','-1 day'))<3`,
     id,codeHash,order,category,order,digest),
    stmt(env.DB,`INSERT INTO self_service_claims
       (id,order_reference,code_id,category_id,requester_digest)
       SELECT ?,?,?,a.category_id,? FROM activation_codes a
       WHERE a.id=? AND a.order_reference=?`,
       claimId,order,id,digest,id,order),
    stmt(env.DB,`INSERT INTO order_recovery_credentials(code_id,secret_hash)
       SELECT id,? FROM activation_codes WHERE id=? AND order_reference=?`,
       recoveryDigest,id,order)
   ];
   const results=await env.DB.batch(operations);
   // Do not return an unusable code if no row was inserted due to quota.
   if(results.some(x=>x?.meta?.changes===0))return fail("CLAIM_LIMIT_REACHED",429);
   return respond({issued:true,category:{slug:product.slug,title:product.title},
     activationCode:code,recoveryKey,claimNote:"请立即保存，页面关闭后无法重新查看。"},201);
  }catch{
   await countFailure(env.DB,key);
   return fail("ORDER_ALREADY_CLAIMED_OR_UNAVAILABLE",409);
  }
 }catch{
  console.error("PUBLIC_CLAIM_UNAVAILABLE");
  return fail("CLAIM_UNAVAILABLE",503);
 }
}
