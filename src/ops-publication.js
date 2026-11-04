// S9-B: two explicit, version-bound steps for a solo operator.
// Never publish on preview, validation or approval; only a separately confirmed
// publish request may commit the status transition. Default gate stays OFF.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
import {reviewDraft} from "./editorial-review.js";

const H={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const fail=(error,status=400)=>respond({error},status);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,100}$/;
const CHECKS=["ORIGINALITY_AND_RIGHTS","LANGUAGE_PROOFREADING","PRODUCT_SCOPE"];
export const isNonProductionManuscript=book=>
  /示例|测试|sample|demo|test/i.test(book.title+" "+book.id) ||
  /^qa[-_]/i.test(book.id) || /^draft[-_]/i.test(book.id);
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);

async function schemaReady(db){
  for(const [table,fields] of Object.entries({
    ops_book_content_versions:["book_id","version"],
    ops_publication_approvals:["id","book_id","operator_id","content_fingerprint","content_version"],
    ops_audit_events:["id","actor_id","event_type","request_id"]
  })){
    const result=await db.prepare("PRAGMA table_info("+table+")").all();
    const found=new Set((result.results||[]).map(x=>x.name));
    if(fields.some(f=>!found.has(f)))return false;
  }
  const book=await db.prepare("PRAGMA table_info(books)").all();
  return (book.results||[]).some(row=>row.name==="last_release_request_id");
}

async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
    throw new Error("CONTENT_TYPE");
  if(Number(req.headers.get("content-length")||0)>4096)throw new Error("TOO_LARGE");
  const raw=await req.text();
  if(new TextEncoder().encode(raw).byteLength>4096)throw new Error("TOO_LARGE");
  try{
    const v=JSON.parse(raw);
    if(!v||typeof v!=="object"||Array.isArray(v))throw new Error();
    return v;
  }catch{throw new Error("INVALID_JSON")}
}
function checkList(checks){
  return Array.isArray(checks)&&checks.length===3&&new Set(checks).size===3&&
    CHECKS.every(c=>checks.includes(c));
}
function noteValid(note){
  return typeof note==="string"&&note.trim().length>=12&&note.length<=800&&
    !/[\u0000-\u001f]/.test(note);
}
// This is a *release* gate, stricter than draft-only editorial review warnings.
// Do not allow an exam-learning product to go live with absent UK/US IPA,
// part of speech, or bilingual teaching examples, even if a manual checkbox
// was acknowledged. It does not claim the supplied values are correct.
async function learningMetadataGaps(db,bookId){
  const row=await stmt(db,
    "SELECT COUNT(*) AS word_count, "+
    "COALESCE(SUM(CASE WHEN TRIM(COALESCE(phonetic_uk,''))='' THEN 1 ELSE 0 END),0) missing_uk, "+
    "COALESCE(SUM(CASE WHEN TRIM(COALESCE(phonetic_us,''))='' THEN 1 ELSE 0 END),0) missing_us, "+
    "COALESCE(SUM(CASE WHEN TRIM(COALESCE(part_of_speech,''))='' THEN 1 ELSE 0 END),0) missing_pos, "+
    "COALESCE(SUM(CASE WHEN TRIM(COALESCE(example_en,''))='' THEN 1 ELSE 0 END),0) missing_example_en, "+
    "COALESCE(SUM(CASE WHEN TRIM(COALESCE(example_zh,''))='' THEN 1 ELSE 0 END),0) missing_example_zh "+
    "FROM (SELECT DISTINCT w.id,w.phonetic_uk,w.phonetic_us,w.part_of_speech,"+
    "w.example_en,w.example_zh FROM words w "+
    "JOIN chapter_words cw ON cw.word_id=w.id "+
    "JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id=?)",bookId).first();
  const metadata={
    wordCount:row?.word_count??0,missingUk:row?.missing_uk??0,
    missingUs:row?.missing_us??0,missingPos:row?.missing_pos??0,
    missingExampleEn:row?.missing_example_en??0,
    missingExampleZh:row?.missing_example_zh??0
  };
  return {...metadata,complete:metadata.wordCount>0&&
    metadata.missingUk===0&&metadata.missingUs===0&&
    metadata.missingPos===0&&metadata.missingExampleEn===0&&
    metadata.missingExampleZh===0};
}
async function version(db,id){
  return await stmt(db,"SELECT version FROM ops_book_content_versions WHERE book_id=?",id).first();
}
async function review(env,id){
  const response=await reviewDraft(env,id);
  const report=await response.json();
  return response.status===200?{report}:{error:report.error||"REVIEW_UNAVAILABLE",status:response.status};
}
async function auditForRequest(db,requestId){
  return stmt(db,"SELECT actor_id,resource_id,content_fingerprint FROM ops_audit_events "+
    "WHERE event_type='book.publish' AND request_id=?",requestId).first();
}

async function readiness(env,id){
  const versionRow=await version(env.DB,id);
  const result=await review(env,id);
  if(result.error)return fail(result.error,result.status);
  const r=result.report;
  const unsafe=isNonProductionManuscript(r.book);
  const learningMetadata=await learningMetadataGaps(env.DB,id);
  const cover=await stmt(env.DB,"SELECT cover_key FROM books WHERE id=?",id).first();
  const coverReady=Boolean(cover?.cover_key);
  const approval=await stmt(env.DB,
    "SELECT id,operator_id,content_fingerprint,content_version,created_at "+
    "FROM ops_publication_approvals WHERE book_id=? ORDER BY rowid DESC LIMIT 1",id).first();
  const approvalValid=Boolean(approval&&versionRow&&
    approval.content_fingerprint===r.contentFingerprint&&approval.content_version===versionRow.version);
  return respond({book:r.book,metrics:r.metrics,technicalCheckPassed:r.technicalCheckPassed,
    blockers:r.blockers,warnings:r.warnings,manualChecks:r.manualChecks,
    contentFingerprint:r.contentFingerprint,contentVersion:versionRow?.version??null,
    approval:{id:approval?.id||null,current:approvalValid,createdAt:approval?.created_at||null},
    sampleBlocked:unsafe,learningMetadata,coverReady,
    quickPublishAvailable:env.OPS_PUBLICATION_ENABLED==="true"&&
      r.book.status==="draft"&&r.technicalCheckPassed&&!unsafe&&learningMetadata.complete&&coverReady,
    publishAvailable:env.OPS_PUBLICATION_ENABLED==="true"&&
      r.technicalCheckPassed&&!unsafe&&learningMetadata.complete&&approvalValid,
    note:"审核预览只读。发布者点击确认上架后才会提交原子发布事务。"});
}
async function approve(req,env,operator,id){
  let d;try{d=await body(req)}catch(e){return fail(e.message,400)}
  if(!HEX.test(d.expectedFingerprint||"")||!REQUEST_ID.test(d.requestId||"")||
     !checkList(d.checks)||!noteValid(d.note))return fail("INVALID_APPROVAL",400);
  const ver=await version(env.DB,id);
  if(!ver)return fail("BOOK_VERSION_REQUIRED",409);
  const checked=await review(env,id);
  if(checked.error)return fail(checked.error,checked.status);
  const r=checked.report;
  if(isNonProductionManuscript(r.book))return fail("TEST_MANUSCRIPT_BLOCKED",409);
  if(!r.technicalCheckPassed||r.blockerCount>0)return fail("EDITORIAL_CHECKS_FAILED",409);
  if(!(await learningMetadataGaps(env.DB,id)).complete)
    return fail("LEARNING_METADATA_INCOMPLETE",409);
  if(d.expectedFingerprint!==r.contentFingerprint)return fail("CONTENT_CHANGED",409);
  const idApproval=crypto.randomUUID(),auditId=crypto.randomUUID();
  try{
    await env.DB.batch([
      stmt(env.DB,
        "INSERT INTO ops_publication_approvals "+
        "(id,book_id,operator_id,content_fingerprint,content_version,checks_json,note) "+
        "SELECT ?,b.id,?,?,?,?,? FROM books b "+
        "JOIN ops_book_content_versions v ON v.book_id=b.id "+
        "WHERE b.id=? AND b.status='draft' AND v.version=?",
        idApproval,operator.id,r.contentFingerprint,ver.version,
        JSON.stringify(CHECKS),d.note.trim(),id,ver.version),
      stmt(env.DB,
        "INSERT INTO ops_audit_events "+
        "(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) "+
        "VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM ops_publication_approvals WHERE id=?) "+
        "THEN 'book.approve' ELSE NULL END,'book',?,?,?,'SOLO_CONTENT_CHECK')",
        auditId,operator.id,idApproval,id,d.requestId,r.contentFingerprint)
    ]);
  }catch{return fail("APPROVAL_CONFLICT",409)}
  return respond({approved:true,bookId:id,approvalId:idApproval,
    contentFingerprint:r.contentFingerprint,contentVersion:ver.version,
    published:false,nextStep:"explicit-publish-confirmation"},201);
}
async function publish(req,env,operator,id){
  let d;try{d=await body(req)}catch(e){return fail(e.message,400)}
  if(!HEX.test(d.expectedFingerprint||"")||!REQUEST_ID.test(d.requestId||"")||
      !UUID.test(d.approvalId||"")||typeof d.confirmTitle!=="string")
    return fail("INVALID_PUBLICATION_CONFIRMATION",400);
  const previous=await auditForRequest(env.DB,d.requestId);
  if(previous){
    if(previous.actor_id===operator.id&&previous.resource_id===id&&
       previous.content_fingerprint===d.expectedFingerprint)
      return respond({published:true,alreadyApplied:true,bookId:id},200);
    return fail("REQUEST_ALREADY_USED",409);
  }
  const ver=await version(env.DB,id);
  if(!ver)return fail("BOOK_VERSION_REQUIRED",409);
  const checked=await review(env,id);
  if(checked.error)return fail(checked.error,checked.status);
  const r=checked.report;
  if(isNonProductionManuscript(r.book))return fail("TEST_MANUSCRIPT_BLOCKED",409);
  if(!r.technicalCheckPassed||r.blockerCount>0)return fail("EDITORIAL_CHECKS_FAILED",409);
  if(!(await learningMetadataGaps(env.DB,id)).complete)
    return fail("LEARNING_METADATA_INCOMPLETE",409);
  if(d.expectedFingerprint!==r.contentFingerprint||d.confirmTitle!==r.book.title)
    return fail("PUBLICATION_CONFIRMATION_MISMATCH",409);
  const approval=await stmt(env.DB,
    "SELECT operator_id,content_fingerprint,content_version FROM ops_publication_approvals "+
    "WHERE id=? AND book_id=?",d.approvalId,id).first();
  if(!approval||approval.operator_id!==operator.id||
     approval.content_fingerprint!==r.contentFingerprint||approval.content_version!==ver.version)
    return fail("APPROVAL_STALE_OR_MISSING",409);
  const auditId=crypto.randomUUID();
  try{
    // D1.batch executes as a transaction. Stamped request id allows the final
    // NOT NULL audit insertion to abort/roll back if the book CAS lost a race.
    await env.DB.batch([
      stmt(env.DB,"UPDATE books SET status='published',last_release_request_id=? "+
        "WHERE id=? AND status='draft' AND EXISTS "+
        "(SELECT 1 FROM ops_book_content_versions WHERE book_id=? AND version=?) "+
        "AND EXISTS(SELECT 1 FROM chapters WHERE book_id=? AND published_at IS NULL) "+
        "AND NOT EXISTS(SELECT 1 FROM chapters WHERE book_id=? AND published_at IS NOT NULL)",
        d.requestId,id,id,ver.version,id,id),
      stmt(env.DB,"UPDATE chapters SET published_at=CURRENT_TIMESTAMP "+
        "WHERE book_id=? AND published_at IS NULL AND EXISTS "+
        "(SELECT 1 FROM books WHERE id=? AND status='published' AND last_release_request_id=?)",
        id,id,d.requestId),
      stmt(env.DB,"INSERT INTO ops_audit_events "+
        "(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) "+
        "VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM books WHERE id=? AND status='published' "+
        "AND last_release_request_id=?) AND "+
        "(SELECT COUNT(*) FROM chapters WHERE book_id=? AND published_at IS NULL)=0 AND "+
        "(SELECT COUNT(*) FROM chapters WHERE book_id=?)>0 "+
        "THEN 'book.publish' ELSE NULL END,'book',?,?,?,'APPROVAL_VERIFIED')",
        auditId,operator.id,id,d.requestId,id,id,id,d.requestId,r.contentFingerprint)
    ]);
  }catch{return fail("PUBLICATION_CONFLICT",409)}
  return respond({published:true,bookId:id,approvalId:d.approvalId,
    note:"Paid chapters remain subject to server-side category entitlement checks."},201);
}


async function publishReviewed(req,env,operator,id){
  // Exactly one explicit publisher click after reviewing the preview and cover.
  // A stale content fingerprint, an incomplete word card, or missing artwork fails closed.
  let d;try{d=await body(req)}catch(e){return fail(e.message,400)}
  if(!HEX.test(d.expectedFingerprint||"")||!REQUEST_ID.test(d.requestId||"")||
      d.confirmed!==true||d.bookId!==id)return fail("INVALID_PUBLICATION_CONFIRMATION",400);
  const existing=await auditForRequest(env.DB,d.requestId);
  if(existing){
    if(existing.actor_id===operator.id&&existing.resource_id===id&&
       existing.content_fingerprint===d.expectedFingerprint)
      return respond({published:true,alreadyApplied:true,bookId:id},200);
    return fail("REQUEST_ALREADY_USED",409);
  }
  const ver=await version(env.DB,id);
  if(!ver)return fail("BOOK_VERSION_REQUIRED",409);
  const checked=await review(env,id);
  if(checked.error)return fail(checked.error,checked.status);
  const r=checked.report;
  if(r.book.id!==id||r.book.status!=="draft"||isNonProductionManuscript(r.book))
    return fail("BOOK_NOT_ELIGIBLE_FOR_PUBLICATION",409);
  if(!r.technicalCheckPassed||r.blockerCount>0)return fail("EDITORIAL_CHECKS_FAILED",409);
  if(!(await learningMetadataGaps(env.DB,id)).complete)return fail("LEARNING_METADATA_INCOMPLETE",409);
  const cover=await stmt(env.DB,"SELECT cover_key FROM books WHERE id=?",id).first();
  if(!cover?.cover_key)return fail("BOOK_COVER_REQUIRED",409);
  if(r.contentFingerprint!==d.expectedFingerprint)return fail("CONTENT_CHANGED",409);
  const auditId=crypto.randomUUID();
  try{
    await env.DB.batch([
      stmt(env.DB,"UPDATE books SET status='published',last_release_request_id=? "+
        "WHERE id=? AND status='draft' AND EXISTS "+
        "(SELECT 1 FROM ops_book_content_versions WHERE book_id=? AND version=?) "+
        "AND TRIM(COALESCE(cover_key,''))<>'' "+
        "AND EXISTS(SELECT 1 FROM chapters WHERE book_id=? AND published_at IS NULL) "+
        "AND NOT EXISTS(SELECT 1 FROM chapters WHERE book_id=? AND published_at IS NOT NULL)",
        d.requestId,id,id,ver.version,id,id),
      stmt(env.DB,"UPDATE chapters SET published_at=CURRENT_TIMESTAMP "+
        "WHERE book_id=? AND published_at IS NULL AND EXISTS "+
        "(SELECT 1 FROM books WHERE id=? AND status='published' AND last_release_request_id=?)",
        id,id,d.requestId),
      stmt(env.DB,"INSERT INTO ops_audit_events "+
        "(id,actor_id,event_type,resource_type,resource_id,request_id,content_fingerprint,reason_code) "+
        "VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM books WHERE id=? AND status='published' "+
        "AND last_release_request_id=?) AND "+
        "(SELECT COUNT(*) FROM chapters WHERE book_id=? AND published_at IS NULL)=0 AND "+
        "(SELECT COUNT(*) FROM chapters WHERE book_id=?)>0 "+
        "THEN 'book.publish' ELSE NULL END,'book',?,?,?,'OWNER_PREVIEW_CONFIRMED')",
        auditId,operator.id,id,d.requestId,id,id,id,d.requestId,r.contentFingerprint)
    ]);
  }catch{return fail("PUBLICATION_CONFLICT",409)}
  return respond({published:true,bookId:id,approvalMode:"single-owner-confirmation",
    note:"Paid content remains guarded by category entitlements."},201);
}

export async function handleOpsPublication(req,env,path){
  if(!["staging","production"].includes(env.APP_ENV))return fail("NOT_FOUND",404);
  const match=path.match(/^\/api\/ops\/books\/([a-z][a-z0-9_-]{2,79})\/(readiness|approve|publish|publish-reviewed)$/);
  if(!match)return fail("NOT_FOUND",404);
  const [,id,action]=match;
  if((action==="readiness"&&req.method!=="GET")||
     (action!=="readiness"&&req.method!=="POST"))return fail("NOT_FOUND",404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,"publisher"))return fail("OPS_ROLE_FORBIDDEN",403);
  if(!(await schemaReady(env.DB)))return fail("OPS_RELEASE_SCHEMA_REQUIRED",503);
  if(action==="readiness")return readiness(env,id);
  // Fail closed until the operator and environment are intentionally enabled.
  if(env.OPS_PUBLICATION_ENABLED!=="true")return fail("OPS_PUBLICATION_DISABLED",403);
  if(action==="approve")return approve(req,env,auth.operator,id);
  if(action==="publish-reviewed")return publishReviewed(req,env,auth.operator,id);
  return publish(req,env,auth.operator,id);
}
