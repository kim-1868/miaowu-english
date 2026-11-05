// V37: publisher-controlled voucher revoke/restore for ALL manually and self-issued codes.
// Revoking a redeemed code immediately revokes ONLY the entitlement sourced from that code.
// Do not delete reader accounts, purchase history, reviews, or other category entitlements.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";

const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer",
 "content-security-policy":"default-src 'none'; frame-ancestors 'none'"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const fail=(code,status=400)=>reply({error:code},status);
const CODE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,100}$/;
function stmt(db,sql,...args){return db.prepare(sql).bind(...args)}
async function inputBody(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return null;
 if(Number(req.headers.get("content-length")||0)>1500)return null;
 const raw=await req.text();
 if(new TextEncoder().encode(raw).byteLength>1500)return null;
 try{const d=JSON.parse(raw);return d&&typeof d==="object"&&!Array.isArray(d)?d:null}
 catch{return null}
}
export async function handleOpsVoucher(req,env,path){
 if(path!=="/api/ops/customers/voucher-action"||req.method!=="POST")
  return fail("NOT_FOUND",404);
 if(env.APP_ENV!=="production"||env.OPS_CONSOLE_ENABLED!=="true")
  return fail("OPS_VOUCHER_DISABLED",403);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return fail("OPS_ROLE_FORBIDDEN",403);
 const d=await inputBody(req);
 const action=d?.action,codeId=d?.codeId,requestId=d?.requestId;
 const reason=typeof d?.reason==="string"?d.reason.trim():"";
 if(!["revoke","restore"].includes(action)||!CODE_ID.test(codeId||"")||
  !REQUEST_ID.test(requestId||"")||
  d?.confirmation!==(action==="revoke"?"作废":"恢复")||
  reason.length<12||reason.length>200||/[\u0000-\u001f]/.test(reason)||
  !["unused","redeemed","revoked"].includes(d?.expectedStatus))
  return fail("CONFIRMATION_REQUIRED",400);
 const expected=action==="revoke"?d.expectedStatus:"revoked";
 if(action==="revoke"&&!["unused","redeemed"].includes(expected))
  return fail("STATUS_CONFLICT",409);
 try{
  const row=await stmt(env.DB,"SELECT a.id,a.category_id,a.status,a.redeemed_by,"+
   "a.order_reference,c.title AS category_title,u.username,"+
   "e.source_code_id AS entitlement_source,e.revoked_at AS entitlement_revoked "+
   "FROM activation_codes a JOIN categories c ON c.id=a.category_id "+
   "LEFT JOIN users u ON u.id=a.redeemed_by "+
   "LEFT JOIN entitlements e ON e.user_id=a.redeemed_by AND e.category_id=a.category_id "+
   "WHERE a.id=?",codeId).first();
  if(!row)return fail("VOUCHER_NOT_FOUND",404);
  if(row.status!==expected)return fail("STATUS_CONFLICT",409);
  // Other legitimate activation codes may now own this same category.
  // Never revoke or silently re-grant rights sourced from another code.
  if(row.redeemed_by&&row.entitlement_source&&row.entitlement_source!==codeId){
   if(action==="restore")return fail("ENTITLEMENT_SOURCE_CHANGED",409);
  }
  if(action==="restore"&&row.redeemed_by&&row.entitlement_source!==codeId)
   return fail("ENTITLEMENT_NOT_RESTORABLE",409);
  const nextStatus=action==="revoke"?"revoked":row.redeemed_by?"redeemed":"unused";
  const commands=[
   stmt(env.DB,"UPDATE activation_codes SET status=? WHERE id=? AND status=?",
    nextStatus,codeId,expected),
   // D1.batch is transactional. This audit INSERT fails on a raced/no-op UPDATE,
   // rolling back all effects. Audits are immutable and reason is mandatory.
   stmt(env.DB,"INSERT INTO ops_audit_events"+
    "(id,actor_id,event_type,resource_type,resource_id,request_id,reason_code,reason_note) "+
    "VALUES(?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?)",
    crypto.randomUUID(),auth.operator.id,"voucher."+action,"activation",codeId,
    requestId,action==="revoke"?"VOUCHER_REVOKE":"VOUCHER_RESTORE",reason),
   stmt(env.DB,"UPDATE entitlements SET revoked_at="+
    (action==="revoke"?"CURRENT_TIMESTAMP":"NULL")+
    " WHERE user_id=? AND category_id=? AND source_code_id=? AND revoked_at IS "+
    (action==="revoke"?"NULL":"NOT NULL"),
    row.redeemed_by,row.category_id,codeId),
   ...(action==="revoke"?
    [stmt(env.DB,"UPDATE self_service_claims SET review_status='abnormal',"+
      "reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE code_id=?",
      auth.operator.id,reason,codeId)]:[]),
   // Self-service records also keep their existing per-claim action history.
   stmt(env.DB,"INSERT INTO self_service_claim_actions "+
    "(id,claim_id,actor_id,action,reason,request_id) "+
    "SELECT ?,s.id,?,?,?,? FROM self_service_claims s WHERE s.code_id=?",
    crypto.randomUUID(),auth.operator.id,action,reason,requestId,codeId)
  ];
  const outcomes=await env.DB.batch(commands);
  if(Number(outcomes?.[0]?.meta?.changes)!==1)
   return fail("STATUS_CONFLICT",409);
  return reply({ok:true,codeId,status:nextStatus,
   categoryTitle:row.category_title,redeemedUsername:row.username||null,
   affectedCategoryRights:!!row.redeemed_by&&row.entitlement_source===codeId,
   note:action==="revoke"?
    "关联兑换账号的对应套餐权益已同步撤销；其他套餐不受影响。":
    "对应套餐权益已恢复；其他套餐不受影响。"});
 }catch(e){
  console.error("OPS_VOUCHER_ACTION_REJECTED",String(e?.message||"").slice(0,50));
  return fail("VOUCHER_ACTION_REJECTED",409);
 }
}
