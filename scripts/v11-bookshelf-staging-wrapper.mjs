// One-off, strongly authenticated V1.1 test-only bookshelf table migration.
// Deploys briefly over the staging Worker, with ONLY its test D1 binding.
// Automatically expires; the workflow restores the normal protected staging Worker.
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
}});
const EXPECTED=["user_id","book_id","created_at"];
async function equalSecret(input,expected){
 if(typeof input!=="string"||typeof expected!=="string"||expected.length<56||input.length>200)return false;
 const data=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",data.encode(input)),
   crypto.subtle.digest("SHA-256",data.encode(expected))]);
 let difference=0;
 const left=new Uint8Array(a),right=new Uint8Array(b);
 for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
 return difference===0;
}
import application from '../src/worker.js';
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname!=="/__v11_bookshelf_migrate")return application.fetch(request,env,ctx);
  if(request.method!=="POST"||env.APP_ENV!=="staging"||
    !env.DB||!Number.isFinite(Number(env.MIGRATION_EXPIRES_AT))||
    Date.now()>Number(env.MIGRATION_EXPIRES_AT)||Date.now()<Number(env.MIGRATION_EXPIRES_AT)-20*60*1000)
    return respond({error:"NOT_FOUND"},404);
  if(!await equalSecret(request.headers.get("X-Migration-Authorization"),env.MIGRATION_SECRET))
    return respond({error:"FORBIDDEN"},403);
  try{
   const before=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','books','user_bookmarks') ORDER BY name").all();
   const existing=(before.results||[]).map(row=>row.name);
   if(!existing.includes("users")||!existing.includes("books"))
     return respond({error:"STAGING_BASE_SCHEMA_INCOMPLETE"},409);
   // Only creates the per-user book bookmark table and one index, no old rows touched.
   await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS user_bookmarks ("+
    "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
    "book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,"+
    "created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
    "PRIMARY KEY(user_id,book_id))").run();
   await env.DB.prepare("CREATE INDEX IF NOT EXISTS ix_user_bookmarks_book ON user_bookmarks(book_id)").run();
   const pragma=await env.DB.prepare("PRAGMA table_info(user_bookmarks)").all();
   const names=(pragma.results||[]).map(row=>row.name);
   const valid=names.length===EXPECTED.length && EXPECTED.every((x,i)=>names[i]===x);
   if(!valid)return respond({error:"MIGRATION_SCHEMA_VERIFICATION_FAILED"},500);
   const count=await env.DB.prepare("SELECT count(*) AS total FROM user_bookmarks").first();
   if(!existing.includes("user_bookmarks")&&count?.total!==0)
     return respond({error:"NEW_TABLE_NOT_EMPTY"},500);
   return respond({ok:true,table:"user_bookmarks",schemaVerified:true,
     alreadyPresent:existing.includes("user_bookmarks"),noUserDataTouched:true});
  }catch{
   return respond({error:"STAGING_SCHEMA_MIGRATION_FAILED"},500);
  }
 }
};
