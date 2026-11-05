import {authenticateOperator,hasOpsRole} from "./ops-access.js";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error=(code,status=400)=>answer({error:code},status);
const sql=(db,text,...a)=>db.prepare(text).bind(...a);
async function parse(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return null;
 const body=await req.text();if(body.length>1600)return null;
 try{return JSON.parse(body)}catch{return null}
}
async function list(db,d){
 const search=String(d.search||"").trim(),status=d.reviewStatus||"",page=d.page||1;
 if(search.length>80||!["","pending","verified","abnormal"].includes(status)||!Number.isInteger(page)||page<1||page>10000)
  return error("INVALID_QUERY");
 const joins=" FROM self_service_claims s JOIN activation_codes a ON a.id=s.code_id JOIN categories c ON c.id=s.category_id LEFT JOIN users u ON u.id=a.redeemed_by LEFT JOIN entitlements e ON e.source_code_id=a.id AND e.user_id=a.redeemed_by ";
 const where=" WHERE (?='' OR instr(lower(s.order_reference),lower(?))>0 OR instr(lower(COALESCE(u.username,'')),lower(?))>0 OR instr(lower(c.title),lower(?))>0) AND (?='' OR s.review_status=?)";
 const args=[search,search,search,search,status,status];
 const total=await sql(db,"SELECT COUNT(*) AS n"+joins+where,...args).first();
 const rows=await sql(db,"SELECT s.id,s.order_reference,s.claimed_at,s.review_status,s.reviewed_at,s.review_note,c.title AS category_title,c.slug AS category_slug,a.status AS code_status,a.redeemed_at,u.username,CASE WHEN e.revoked_at IS NULL AND e.user_id IS NOT NULL THEN 1 ELSE 0 END AS entitlement_active"+joins+where+" ORDER BY s.claimed_at DESC,s.id DESC LIMIT 20 OFFSET ?",...args,(page-1)*20).all();
 const counts=await db.prepare("SELECT COUNT(*) AS n,SUM(review_status='pending') AS pending,SUM(review_status='verified') AS verified,SUM(review_status='abnormal') AS abnormal FROM self_service_claims").first();
 return answer({page,pageSize:20,total:Number(total?.n||0),items:rows.results||[],overview:{all:Number(counts?.n||0),pending:Number(counts?.pending||0),verified:Number(counts?.verified||0),abnormal:Number(counts?.abnormal||0)}});
}
export async function handleOpsClaims(req,env,path){
 if(!["/api/ops/claims/query","/api/ops/claims/action"].includes(path)||req.method!=="POST")return error("NOT_FOUND",404);
 if(env.APP_ENV!=="production"||env.OPS_CONSOLE_ENABLED!=="true")return error("OPS_CLAIMS_DISABLED",403);
 const auth=await authenticateOperator(req,env);if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return error("OPS_ROLE_FORBIDDEN",403);
 const d=await parse(req);if(!d)return error("INVALID_QUERY");
 try{
  if(path.endsWith("/query"))return await list(env.DB,d);
  return error("ACTION_NOT_READY",503);
 }catch{console.error("OPS_CLAIMS_QUERY_FAILED");return error("OPS_CLAIMS_UNAVAILABLE",503)}
}
