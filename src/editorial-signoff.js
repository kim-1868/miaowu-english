// S3-C2: staging-only, append-only QA acknowledgements. No publish actions.
import {reviewDraft} from "./editorial-review.js";
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const HEX=/^[a-f0-9]{64}$/;
const CHECKS=["ORIGINALITY_AND_RIGHTS","LANGUAGE_PROOFREADING","PRODUCT_SCOPE"];
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const response=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEADERS});
const error=(code,status=400)=>response({error:code},status);
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const cleanNote=value=>typeof value==="string"&&value.trim().length>=12&&
  value.length<=800&&!/[\u0000-\u001f]/.test(value);
async function hasTable(db){
  const result=await db.prepare("PRAGMA table_info(editorial_review_signoffs)").all();
  return (result.results||[]).some(x=>x.name==="content_fingerprint");
}
async function currentReport(env,bookId){
  const r=await reviewDraft(env,bookId);
  const data=await r.json();
  if(r.status!==200)return {error:data.error||"REVIEW_NOT_AVAILABLE",status:r.status};
  return {report:data,status:200};
}
async function getSignoffs(env,bookId){
  const report=await currentReport(env,bookId);
  if(report.error)return error(report.error,report.status);
  const entries=await q(env.DB,
    "SELECT id,content_fingerprint,checks_json,note,reviewer_identity,created_at "+
    "FROM editorial_review_signoffs WHERE book_id=? ORDER BY rowid DESC LIMIT 15",bookId).all();
  const last=(entries.results||[]).map(row=>{
    let checks=[];
    try{checks=JSON.parse(row.checks_json)}catch{}
    return {id:row.id,contentFingerprint:row.content_fingerprint,checks,
      note:row.note,reviewerIdentity:row.reviewer_identity,
      createdAt:row.created_at,stillMatches:row.content_fingerprint===report.report.contentFingerprint};
  });
  const current=last[0]&&last[0].stillMatches?last[0]:null;
  return response({bookId,contentFingerprint:report.report.contentFingerprint,
    technicalCheckPassed:report.report.technicalCheckPassed,
    current,latest:last[0]||null,history:last,requiresRecheck:!!last.length&&!current,
    publicationEnabled:false,testOnly:true});
}
async function saveSignoff(req,env,bookId){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return error("CONTENT_TYPE",400);
  if(Number(req.headers.get("content-length")||0)>5000)return error("TOO_LARGE",413);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>5000)return error("TOO_LARGE",413);
  let data;
  try{data=JSON.parse(raw)}catch{return error("INVALID_JSON",400)}
  if(!data||!HEX.test(data.expectedFingerprint||"")||
     !Array.isArray(data.checks)||data.checks.length!==3||
     new Set(data.checks).size!==3||!CHECKS.every(x=>data.checks.includes(x))||
     !cleanNote(data.note))return error("INVALID_REVIEW_CONFIRMATION",400);
  const check=await currentReport(env,bookId);
  if(check.error)return error(check.error,check.status);
  if(check.report.contentFingerprint!==data.expectedFingerprint)
    return error("REVIEW_CONTENT_CHANGED",409);
  if(!check.report.technicalCheckPassed || check.report.blockerCount!==0)
    return error("REVIEW_BLOCKERS_PRESENT",409);
  const revision=crypto.randomUUID();
  try{
    await q(env.DB,
      "INSERT INTO editorial_review_signoffs "+
      "(id,book_id,content_fingerprint,checks_json,note,reviewer_identity) "+
      "SELECT ?,b.id,?,?,?,'staging-editor-key-holder' FROM books b "+
      "WHERE b.id=? AND b.status='draft'",
      revision,check.report.contentFingerprint,JSON.stringify(CHECKS),
      data.note.trim(),bookId).run();
    const inserted=await q(env.DB,"SELECT id FROM editorial_review_signoffs WHERE id=?",revision).first();
    if(!inserted)return error("REVIEW_CONTENT_CHANGED",409);
  }catch{console.error("S3_EDITOR_FAILED","review_signoff");
    return error("REVIEW_SAVE_FAILED",500);}
  return response({saved:true,reviewId:revision,bookId,
    contentFingerprint:check.report.contentFingerprint,
    reviewerIdentity:"staging-editor-key-holder",
    publicationEnabled:false,testOnly:true},201);
}
export async function handleReviewSignoff(req,env,bookId){
  if(!ID.test(bookId))return error("INVALID_ID",400);
  if(!(await hasTable(env.DB)))return error("REVIEW_SCHEMA_REQUIRED",503);
  if(req.method==="GET")return getSignoffs(env,bookId);
  if(req.method==="POST")return saveSignoff(req,env,bookId);
  return error("NOT_FOUND",404);
}
