// One-time, short-lived, test-DB-only dictionary initializer; never production.
import application from "../src/worker.js";
const send=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
async function safeToken(given,expected){
 if(typeof given!=="string"||typeof expected!=="string"||expected.length<56||given.length!==expected.length)return false;
 const b=new TextEncoder();
 const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",b.encode(given)),crypto.subtle.digest("SHA-256",b.encode(expected))]);
 const a=new Uint8Array(x),c=new Uint8Array(y);let mismatch=0;
 for(let i=0;i<a.length;i++)mismatch|=a[i]^c[i];
 return mismatch===0;
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname!=="/__v11_internal_dictionary_seed")return application.fetch(request,env,ctx);
 if(request.method!=="POST"||env.APP_ENV!=="staging"||!env.DB||
   !Number.isFinite(Number(env.MIGRATION_EXPIRES_AT))||
   Date.now()>Number(env.MIGRATION_EXPIRES_AT)||
   Date.now()<Number(env.MIGRATION_EXPIRES_AT)-20*60*1000)return send({error:"NOT_FOUND"},404);
 if(!await safeToken(request.headers.get("X-Migration-Authorization"),env.MIGRATION_SECRET))
   return send({error:"FORBIDDEN"},403);
 const raw=await request.text();
 if(raw.length>28000)return send({error:"PAYLOAD_TOO_LARGE"},413);
 let input;
 try{input=JSON.parse(raw)}catch{return send({error:"BAD_JSON"},400)}
 if(!Array.isArray(input?.entries)||input.entries.length<100||input.entries.length>180)
   return send({error:"BAD_DICTIONARY_SIZE"},400);
 if(input.entries.some(row=>!Array.isArray(row)||row.length!==3||
  typeof row[0]!=="string"||!/^[a-z][a-z'-]{0,39}$/.test(row[0])||
  typeof row[1]!=="string"||row[1].length>32||
  typeof row[2]!=="string"||!row[2].trim()||row[2].length>400))
   return send({error:"INVALID_ROW"},400);
 try{
  const original=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_words").first();
  const old=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='supplemental_dictionary'").first();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS supplemental_dictionary ("+
   "word TEXT PRIMARY KEY COLLATE NOCASE,phonetic TEXT,pos TEXT,"+
   "translation_zh TEXT NOT NULL,source TEXT NOT NULL,"+
   "source_version TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"+
   "CHECK(length(word)>0 AND length(word)<=64),"+
   "CHECK(length(translation_zh)>0 AND length(translation_zh)<=600))").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_supplemental_dictionary_source "+
   "ON supplemental_dictionary(source)").run();
  const inserts=input.entries.map(row=>env.DB.prepare(
   "INSERT OR IGNORE INTO supplemental_dictionary(word,pos,translation_zh,source,source_version) "+
   "VALUES(?,?,?,'curated-starter','2026-11-06')").bind(...row));
  for(let i=0;i<inserts.length;i+=35)await env.DB.batch(inserts.slice(i,i+35));
  const fields=await env.DB.prepare("PRAGMA table_info(supplemental_dictionary)").all();
  const expected=["word","phonetic","pos","translation_zh","source","source_version","updated_at"];
  const cols=(fields.results||[]).map(x=>x.name);
  if(JSON.stringify(cols)!==JSON.stringify(expected))return send({error:"SCHEMA_MISMATCH"},500);
  const seed=await env.DB.prepare("SELECT COUNT(*) AS n FROM supplemental_dictionary WHERE source='curated-starter'").first();
  const retained=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_words").first();
  if(!seed||seed.n<100||retained.n!==original.n)return send({error:"VERIFICATION_FAILED"},500);
  return send({ok:true,schemaVerified:true,table:"supplemental_dictionary",
   alreadyPresent:Boolean(old),seeded:seed.n,noUserDataTouched:true});
 }catch{return send({error:"STAGING_DICTIONARY_FAILED"},500)}
}};
