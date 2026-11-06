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
 const rows=await sql(db,"SELECT s.id,s.order_reference,s.claimed_at,s.review_status,s.reviewed_at,s.review_note,c.title AS category_title,c.slug AS category_slug,a.status AS code_status,a.redeemed_at,u.username,CASE WHEN a.status='redeemed' AND e.revoked_at IS NULL AND e.user_id IS NOT NULL THEN 1 ELSE 0 END AS entitlement_active"+joins+where+" ORDER BY s.claimed_at DESC,s.id DESC LIMIT 10 OFFSET ?",...args,(page-1)*10).all();
 const counts=await db.prepare("SELECT COUNT(*) AS n,SUM(review_status='pending') AS pending,SUM(review_status='verified') AS verified,SUM(review_status='abnormal') AS abnormal FROM self_service_claims").first();
 return answer({page,pageSize:10,total:Number(total?.n||0),items:rows.results||[],overview:{all:Number(counts?.n||0),pending:Number(counts?.pending||0),verified:Number(counts?.verified||0),abnormal:Number(counts?.abnormal||0)}});
}
async function act(db,operator,d){
 const action=d.action,id=d.claimId,requestId=d.requestId;
 const reason=typeof d.reason==="string"?d.reason.trim():"";
 if(!["verify","flag","revoke","restore"].includes(action)||
   !/^[0-9a-f-]{36}$/.test(id||"")||!/^[A-Za-z0-9_-]{8,100}$/.test(requestId||"")||
   reason.length<8||reason.length>250||/[\u0000-\u001f]/.test(reason))
  return error("INVALID_CONFIRMATION",400);
 const row=await sql(db,"SELECT s.id,s.review_status,s.code_id,a.status AS code_status FROM self_service_claims s JOIN activation_codes a ON a.id=s.code_id WHERE s.id=?",id).first();
 if(!row)return error("CLAIM_NOT_FOUND",404);
 if(action==="revoke"&&row.code_status==="revoked")return error("ALREADY_REVOKED",409);
 if(action==="restore"&&row.code_status!=="revoked")return error("NOT_REVOKED",409);
 if(action==="verify"&&(row.review_status==="verified"||row.code_status==="revoked"))return error("REVIEW_CONFLICT",409);
 if(action==="flag"&&row.review_status==="abnormal")return error("REVIEW_CONFLICT",409);
 const audit=()=>sql(db,"INSERT INTO self_service_claim_actions(id,claim_id,actor_id,action,reason,request_id) VALUES (?,?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?)",
  crypto.randomUUID(),id,operator.id,action,reason,requestId);
 let commands;
 if(action==="verify"||action==="flag"){
  const next=action==="verify"?"verified":"abnormal";
  commands=[sql(db,"UPDATE self_service_claims SET review_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND review_status<>? AND EXISTS(SELECT 1 FROM activation_codes a WHERE a.id=self_service_claims.code_id AND a.status<>'revoked')",next,operator.id,reason,id,next),audit()];
 }else{
  const nextCode=action==="revoke"?"'revoked'":"CASE WHEN redeemed_by IS NULL THEN 'unused' ELSE 'redeemed' END";
  const codeCondition=action==="revoke"?"IN ('unused','redeemed')":"='revoked'";
  const reviewState=action==="revoke"?"abnormal":"verified";
  const entitlementState=action==="revoke"?"CURRENT_TIMESTAMP":"NULL";
  const currentEntitlement=action==="revoke"?"NULL":"NOT NULL";
  commands=[
   sql(db,"UPDATE activation_codes SET status="+nextCode+" WHERE id=? AND status "+codeCondition,row.code_id),
   sql(db,"UPDATE self_service_claims SET review_status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND changes()=1",reviewState,operator.id,reason,id),
   audit(),
   sql(db,"UPDATE entitlements SET revoked_at="+entitlementState+" WHERE source_code_id=? AND revoked_at IS "+currentEntitlement,row.code_id)
  ];
 }
 try{await db.batch(commands);return answer({ok:true,claimId:id,action});}
 catch{return error("CLAIM_ACTION_CONFLICT",409)}
}
export async function handleOpsClaims(req,env,path){
 if(!["/api/ops/claims/query","/api/ops/claims/action"].includes(path)||req.method!=="POST")return error("NOT_FOUND",404);
 if(env.APP_ENV!=="production"||env.OPS_CONSOLE_ENABLED!=="true")return error("OPS_CLAIMS_DISABLED",403);
 const auth=await authenticateOperator(req,env);if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return error("OPS_ROLE_FORBIDDEN",403);
 const d=await parse(req);if(!d)return error("INVALID_QUERY");
 try{
  if(path.endsWith("/query"))return await list(env.DB,d);
  return await act(env.DB,auth.operator,d);
 }catch{console.error("OPS_CLAIMS_QUERY_FAILED");return error("OPS_CLAIMS_UNAVAILABLE",503)}
}
