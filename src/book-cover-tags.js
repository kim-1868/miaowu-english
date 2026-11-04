// Publisher-managed book-cover labels. Metadata only; never returns chapter content.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
const HEAD={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const reject=(code,status=400)=>answer({error:code},status);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const COLOR=/^#[0-9a-fA-F]{6}$/;
const LABEL=/^[^<>\u0000-\u001f\u007f]{1,24}$/u;
const query=(db,sql,...params)=>db.prepare(sql).bind(...params);

async function checkSchema(db){
  try{
    const info=await db.prepare("PRAGMA table_info(book_cover_tags)").all();
    const keys=new Set((info.results||[]).map(x=>x.name));
    return ["book_id","label","color","sort_order"].every(key=>keys.has(key));
  }catch{return false}
}
async function parse(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
    throw Error("CONTENT_TYPE");
  if(Number(req.headers.get("content-length")||0)>2048)throw Error("TOO_LARGE");
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>2048)throw Error("TOO_LARGE");
  let obj;try{obj=JSON.parse(raw)}catch{throw Error("INVALID_JSON")}
  if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("INVALID_JSON");
  return obj;
}
function cleanLabel(v){
  if(typeof v!=="string")return null;
  const x=v.trim().replace(/\s+/gu," ");
  return LABEL.test(x)?x:null;
}
async function book(db,id){
  return query(db,"SELECT id,status,title FROM books WHERE id=?",id).first();
}
async function list(db,id){
  const items=await query(db,
    "SELECT label,color,sort_order FROM book_cover_tags WHERE book_id=? ORDER BY sort_order,rowid",id).all();
  const presets=await db.prepare(
    "SELECT label,color FROM book_cover_tags GROUP BY label ORDER BY MAX(updated_at) DESC LIMIT 500").all();
  return {tags:items.results||[],presets:presets.results||[]};
}
export async function handleBookCoverTags(req,env,path){
  if(!["staging","production"].includes(env.APP_ENV))return reject("NOT_FOUND",404);
  const match=path.match(/^\/api\/ops\/books\/([a-z][a-z0-9_-]{2,79})\/tags$/);
  if(!match||!["GET","POST","DELETE"].includes(req.method))return reject("NOT_FOUND",404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,"publisher"))return reject("OPS_ROLE_FORBIDDEN",403);
  if(!env.DB||!(await checkSchema(env.DB)))return reject("TAGS_SCHEMA_REQUIRED",503);
  const id=match[1];
  const record=await book(env.DB,id);
  if(!record)return reject("BOOK_NOT_FOUND",404);
  if(req.method==="GET")return answer({bookId:id,...await list(env.DB,id)});
  let input;
  try{input=await parse(req)}catch(e){return reject(e.message,400)}
  const label=cleanLabel(input.label);
  if(!label)return reject("INVALID_TAG_LABEL",400);
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId||""))
    return reject("INVALID_REQUEST_ID",400);
  if(req.method==="POST"&&!COLOR.test(input.color||""))return reject("INVALID_TAG_COLOR",400);
  const previous=input.previousLabel==null?null:cleanLabel(input.previousLabel);
  if(input.previousLabel!=null&&!previous)return reject("INVALID_PREVIOUS_LABEL",400);
  const color=(input.color||"").toLowerCase();
  const auditId=crypto.randomUUID();
  const event=req.method==="DELETE"?"book.tag.remove":"book.tag.save";
  const db=env.DB;
  let statement;
  if(req.method==="DELETE"){
    statement=query(db,"DELETE FROM book_cover_tags WHERE book_id=? AND label=?",id,label);
  }else if(previous&&previous!==label){
    const existing=await query(db,"SELECT 1 ok FROM book_cover_tags WHERE book_id=? AND label=?",id,previous).first();
    if(!existing)return reject("TAG_NOT_FOUND",404);
    statement=query(db,"UPDATE book_cover_tags SET label=?,color=?,updated_at=CURRENT_TIMESTAMP WHERE book_id=? AND label=?",
      label,color,id,previous);
  }else{
    statement=query(db,"INSERT INTO book_cover_tags(book_id,label,color,sort_order) "+
      "SELECT ?,?,?,COALESCE(MAX(sort_order)+1,0) FROM book_cover_tags WHERE book_id=? "+
      "ON CONFLICT(book_id,label) DO UPDATE SET color=excluded.color,updated_at=CURRENT_TIMESTAMP",
      id,label,color,id);
  }
  try{
    await db.batch([statement,query(db,
      "INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id,reason_code) VALUES(?,?,?,?,?,?,?)",
      auditId,auth.operator.id,event,"book",id,input.requestId,"PUBLISHER_TAG_CHANGE")]);
  }catch{return reject("TAG_UPDATE_CONFLICT",409)}
  return answer({saved:true,bookId:id,...await list(db,id)});
}
