// S9-A: separate operator authentication; never reuse user sessions, preview
// Basic credentials, activation keys or the legacy staging editor secret.
// S9-A exposes ONLY a read-only identity endpoint. No publish action exists.
const HEADERS = {
  "content-type":"application/json; charset=utf-8",
  "cache-control":"private, no-store",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
  "content-security-policy":"default-src 'none'; frame-ancestors 'none'"
};
const encoder = new TextEncoder();
const TOKEN_PATTERN = /^mwops_[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9_-]{2,79}$/;
const HEX = /^[a-f0-9]{64}$/;
const ROLES = new Set(["editor","reviewer","publisher"]);
const ENVS = new Set(["staging","production"]);
const response = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error = (code,status)=>response({error:code},status);

// HMAC means a read-only database leak cannot be used to authenticate, and a
// long random operator token is never stored in plaintext in D1.
export async function digestOpsToken(token,pepper) {
  if(!TOKEN_PATTERN.test(token)||typeof pepper!=="string"||pepper.length<32)
    throw new Error("INVALID_OPS_CREDENTIAL_INPUT");
  const key=await crypto.subtle.importKey("raw",encoder.encode(pepper),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,
    encoder.encode("miaowu:ops:v1:"+token)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}

// Explicit role separation. A publisher is NOT implicitly a reviewer,
// and the legacy staging editor key is never an operator identity.
export function hasOpsRole(operator,role){
  return Boolean(operator&&ROLES.has(role)&&operator.role===role);
}

async function schemaReady(db){
  try{
    for(const [name,required] of Object.entries({
      ops_operators:["id","role","environment","key_digest","is_active","revoked_at"],
      ops_audit_events:["id","actor_id","event_type","request_id"]
    })){
      const result=await db.prepare("PRAGMA table_info("+name+")").all();
      const cols=new Set((result.results||[]).map(v=>v.name));
      if(required.some(c=>!cols.has(c)))return false;
    }
    return true;
  }catch{return false}
}

export async function authenticateOperator(req,env){
  if(!ENVS.has(env.APP_ENV))return {response:error("NOT_FOUND",404)};
  if(!env.DB)return {response:error("OPS_NOT_CONFIGURED",503)};
  if(typeof env.OPS_TOKEN_PEPPER!=="string"||env.OPS_TOKEN_PEPPER.length<32)
    return {response:error("OPS_NOT_CONFIGURED",503)};
  const token=req.headers.get("X-Mw-Ops-Key")||"";
  if(!TOKEN_PATTERN.test(token))return {response:error("OPS_AUTH_REQUIRED",401)};
  if(!(await schemaReady(env.DB)))return {response:error("OPS_SCHEMA_REQUIRED",503)};
  const digest=await digestOpsToken(token,env.OPS_TOKEN_PEPPER);
  let operator;
  try{
    operator=await env.DB.prepare(
      "SELECT id,display_name,role,environment FROM ops_operators "+
      "WHERE key_digest=? AND environment=? AND is_active=1 AND revoked_at IS NULL"
    ).bind(digest,env.APP_ENV).first();
  }catch{return {response:error("OPS_BACKEND_UNAVAILABLE",503)}}
  if(!operator||!ID.test(operator.id)||!ROLES.has(operator.role))
    return {response:error("OPS_AUTH_REQUIRED",401)};
  return {operator};
}

// Append-only audit primitive for S9-B/C. Call only from a server-verified
// mutation, passing the verified identity from authenticateOperator.
// Never store the raw token, manuscript, note or password in the audit row.
export async function appendOpsAudit(db,actor,entry){
  if(!actor||!ID.test(actor.id)||!ROLES.has(actor.role)||
    !entry||typeof entry!=="object"||
    !/^[a-z][a-z0-9_.-]{2,63}$/.test(entry.eventType||"")||
    !/^[a-z][a-z0-9_-]{1,39}$/.test(entry.resourceType||"")||
    typeof entry.resourceId!=="string"||entry.resourceId.length<1||entry.resourceId.length>80||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(entry.requestId||"")||
    (entry.contentFingerprint!=null&&!HEX.test(entry.contentFingerprint))||
    (entry.reasonCode!=null&&!/^[A-Z][A-Z0-9_]{1,59}$/.test(entry.reasonCode)))
    throw new Error("INVALID_OPS_AUDIT_ENTRY");
  const id=crypto.randomUUID();
  await db.prepare(
    "INSERT INTO ops_audit_events "+
    "(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) "+
    "VALUES(?,?,?,?,?,?,?,?)"
  ).bind(id,actor.id,entry.eventType,entry.resourceType,entry.resourceId,
    entry.requestId,entry.contentFingerprint||null,entry.reasonCode||null).run();
  return id;
}

export async function handleOps(req,env,path){
  if(!ENVS.has(env.APP_ENV))return error("NOT_FOUND",404);
  // Deliberately no write route until S9-B has a separate approved design.
  if(path!=="/api/ops/me"||req.method!=="GET")return error("NOT_FOUND",404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  const {id,display_name,role,environment}=auth.operator;
  return response({operator:{id,displayName:display_name,role,environment},
    publishAvailable:false,withdrawAvailable:false});
}
