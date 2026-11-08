// One-shot staging-only QA reader provisioning. Every change is isolated to test D1.
// This entrypoint is never production; it is removed from the live staging worker
// immediately after the GitHub job completes.
import app from "../src/worker.js";
import {newPasswordHash,hashCode} from "../src/security.js";
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
}});
async function validToken(token,expected){
 if(typeof token!=="string"||typeof expected!=="string"||expected.length<56||token.length>200)return false;
 const bytes=new TextEncoder();
 const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",bytes.encode(token)),crypto.subtle.digest("SHA-256",bytes.encode(expected))]);
 let diff=0;const a=new Uint8Array(x),b=new Uint8Array(y);
 for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname!=="/__v11_one_time_qa_account")return app.fetch(request,env,ctx);
  if(request.method!=="POST" || env.APP_ENV!=="staging"||
    !env.DB || !Number.isFinite(Number(env.QA_EXPIRY))||
    Date.now()>Number(env.QA_EXPIRY)||Date.now()<Number(env.QA_EXPIRY)-12*60*1000) return respond({error:"NOT_FOUND"},404);
  if(!await validToken(request.headers.get("X-QA-Authorization"),env.QA_BOOTSTRAP_SECRET))
    return respond({error:"FORBIDDEN"},403);
  let body;
  try{body=await request.json()}catch{return respond({error:"INVALID_INPUT"},400)}
  const username=body?.username;
  const password=body?.password;
  if(typeof username!=="string"||!/^v11review_[a-z0-9]{8}$/.test(username)||
     typeof password!=="string"||!/^[a-zA-Z0-9!_-]{18,80}$/.test(password))
     return respond({error:"INVALID_QA_CREDENTIAL_INPUT"},400);
  if(typeof env.ACTIVATION_PEPPER!=="string"||env.ACTIVATION_PEPPER.length<32)
     return respond({error:"STAGING_SECRETS_NOT_READY"},503);
  try{
   const allowed=await env.DB.prepare("SELECT id,slug FROM categories WHERE is_visible=1 AND slug IN ('cet4','cet6','postgrad','ielts') ORDER BY slug").all();
   const cats=allowed.results||[];
   if(!cats.some(c=>c.slug==="cet4"))return respond({error:"QA_CET4_NOT_AVAILABLE"},409);
   const exists=await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
   if(exists)return respond({error:"QA_USERNAME_ALREADY_EXISTS"},409);
   const id=crypto.randomUUID();
   const hash=await newPasswordHash(password,env);
   const statements=[env.DB.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES (?,?,?,?)").bind(id,username,hash.hash,hash.salt)];
   for(const cat of cats){
     const voucherId=crypto.randomUUID();
     const code="V11QA"+crypto.randomUUID().replace(/-/g,"").toUpperCase();
     const codeHash=await hashCode(code,env);
     statements.push(env.DB.prepare("INSERT INTO activation_codes(id,code_hash,category_id,status,redeemed_by,redeemed_at,redemption_nonce,order_reference) VALUES (?,?,?,'redeemed',?,CURRENT_TIMESTAMP,?,NULL)").bind(voucherId,codeHash,cat.id,id,"QA-ONLY"));
     statements.push(env.DB.prepare("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES (?,?,?)").bind(id,cat.id,voucherId));
   }
   const onboard=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_onboarding'").first();
   if(onboard?.name==="user_onboarding")
     statements.push(env.DB.prepare("INSERT INTO user_onboarding(user_id) VALUES (?)").bind(id));
   // Atomic: user + QA-only vouchers + test entitlements + onboarding or nothing.
   await env.DB.batch(statements);
   // Verify creation through the app's real username/password login route.
   const origin=url.origin;
   const auth="Basic "+btoa("reviewer:"+env.STAGING_PREVIEW_PASSWORD);
   const login=await app.fetch(new Request(origin+"/api/auth/login",{
     method:"POST",
     headers:{Origin:origin,Authorization:auth,"Content-Type":"application/json"},
     body:JSON.stringify({username,password})
   }),env,ctx);
   const result=await login.json();
   if(login.status!==200||result?.user?.username!==username)
     return respond({error:"QA_CREATED_BUT_LOGIN_VERIFICATION_FAILED"},500);
   const owned=(result.categories||[]).map(c=>c.slug).sort();
   return respond({ok:true,loginVerified:true,username,entitlements:owned,guideEligible:Boolean(onboard)});
  }catch(e){
   // Only safe, fixed error code, never SQL or credentials in response.
   return respond({error:"QA_CREATION_OR_VERIFICATION_FAILED"},500);
  }
 }
};
