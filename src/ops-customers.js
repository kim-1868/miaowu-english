// Read-only publisher view for customer accounts and activation history.
// The database already tracks status, redeemed_by and redeemed_at.
// Never expose code_hash, raw voucher, password hashes or recovery secrets.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";

const JSON_HEADERS={
 "content-type":"application/json; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "content-security-policy":"default-src 'none'; frame-ancestors 'none'"
};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const fail=(error,status=400)=>answer({error},status);
const PAGE_SIZE=20;
const ALLOWED_STATUS=new Set(["","unused","redeemed","revoked"]);
const CATEGORY=/^(?:|[a-z][a-z0-9-]{2,29})$/;

async function readBody(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))return null;
 if(Number(request.headers.get("content-length")||0)>1200)return null;
 const raw=await request.text();
 if(new TextEncoder().encode(raw).byteLength>1200)return null;
 try{
  const v=JSON.parse(raw);
  return v&&typeof v==="object"&&!Array.isArray(v)?v:null;
 }catch{return null;}
}
function stmt(db,sql,...args){return db.prepare(sql).bind(...args)}
async function listUsers(db,search,page){
 const where="(?='' OR instr(lower(u.username),lower(?))>0 OR EXISTS "+
  "(SELECT 1 FROM activation_codes a WHERE a.redeemed_by=u.id "+
  "AND instr(lower(COALESCE(a.order_reference,'')),lower(?))>0))";
 const binds=[search,search,search];
 const total=await stmt(db,"SELECT COUNT(*) AS count FROM users u WHERE "+where,...binds).first();
 const rows=await stmt(db,
  "SELECT u.id,u.username,u.created_at, "+
  "(SELECT group_concat(c.title,' / ') FROM entitlements e "+
  " JOIN categories c ON c.id=e.category_id WHERE e.user_id=u.id AND e.revoked_at IS NULL) AS packages, "+
  "(SELECT COUNT(*) FROM activation_codes a WHERE a.redeemed_by=u.id AND a.status='redeemed') AS redeemed_count, "+
  "(SELECT MAX(a.redeemed_at) FROM activation_codes a WHERE a.redeemed_by=u.id "+
  "AND a.status='redeemed') AS last_redeemed_at "+
  "FROM users u WHERE "+where+" ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?",
  ...binds,PAGE_SIZE,(page-1)*PAGE_SIZE).all();
 return {items:rows.results||[],total:Number(total?.count||0)};
}
async function listCodes(db,search,status,category,page){
 const where="(?='' OR instr(lower(COALESCE(a.order_reference,'')),lower(?))>0 "+
  "OR instr(lower(COALESCE(u.username,'')),lower(?))>0) "+
  "AND (?='' OR a.status=?) AND (?='' OR c.slug=?)";
 const binds=[search,search,search,status,status,category,category];
 const joins=" FROM activation_codes a "+
  "JOIN categories c ON c.id=a.category_id "+
  "LEFT JOIN users u ON u.id=a.redeemed_by ";
 const total=await stmt(db,"SELECT COUNT(*) AS count"+joins+"WHERE "+where,...binds).first();
 const rows=await stmt(db,
  "SELECT a.id,a.status,a.order_reference,a.created_at,a.redeemed_at, "+
  "u.username AS redeemed_username,c.slug AS category_slug,c.title AS category_title, "+
  "CASE WHEN e.user_id IS NOT NULL AND e.revoked_at IS NULL THEN 1 ELSE 0 END AS entitlement_active "+
  joins+"LEFT JOIN entitlements e ON e.source_code_id=a.id AND e.user_id=a.redeemed_by "+
  "WHERE "+where+" ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?",
  ...binds,PAGE_SIZE,(page-1)*PAGE_SIZE).all();
 return {items:rows.results||[],total:Number(total?.count||0)};
}
async function overview(db){
 const row=await db.prepare(
  "SELECT (SELECT COUNT(*) FROM users) AS users, "+
  "(SELECT COUNT(*) FROM activation_codes WHERE status='unused') AS unused, "+
  "(SELECT COUNT(*) FROM activation_codes WHERE status='redeemed') AS redeemed, "+
  "(SELECT COUNT(*) FROM activation_codes WHERE status='revoked') AS revoked"
 ).first();
 return {users:Number(row?.users||0),unused:Number(row?.unused||0),
  redeemed:Number(row?.redeemed||0),revoked:Number(row?.revoked||0)};
}
export async function handleOpsCustomers(request,env,path){
 if(path!=="/api/ops/customers/query"||request.method!=="POST")
  return fail("NOT_FOUND",404);
 if(env.APP_ENV!=="production"||env.OPS_CONSOLE_ENABLED!=="true")
  return fail("OPS_CUSTOMERS_DISABLED",403);
 const auth=await authenticateOperator(request,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return fail("OPS_ROLE_FORBIDDEN",403);
 const body=await readBody(request);
 if(!body)return fail("INVALID_QUERY",400);
 const mode=body.mode??"codes",search=body.search??"",
  category=body.category??"",status=body.status??"";
 const page=body.page??1;
 if(!["users","codes"].includes(mode)||typeof search!=="string"||
  search.length>80||typeof category!=="string"||!CATEGORY.test(category)||
  typeof status!=="string"||!ALLOWED_STATUS.has(status)||
  !Number.isInteger(page)||page<1||page>10000)
  return fail("INVALID_QUERY",400);
 try{
  const result=mode==="users"?
   await listUsers(env.DB,search.trim(),page):
   await listCodes(env.DB,search.trim(),status,category,page);
  return answer({mode,page,pageSize:PAGE_SIZE,...result,overview:await overview(env.DB)});
 }catch{
  console.error("OPS_CUSTOMERS_QUERY_FAILED");
  return fail("OPS_CUSTOMERS_UNAVAILABLE",503);
 }
}
