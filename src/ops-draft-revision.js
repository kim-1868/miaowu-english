// Production publisher-only draft replacement with one atomic D1 batch.
// Never publishes/withdraws or touches accounts, entitlements or study tables.
// Existing chapter/word IDs are preserved so learned content remains linked.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
import {validatePackage} from "./editorial-content.js";
import {reviewDraft} from "./editorial-review.js";
const H={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const reject=(error,status=400)=>respond({error},status);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const HEX=/^[a-f0-9]{64}$/;
const REQUEST_ID=/^[a-zA-Z0-9_-]{8,100}$/;
const stmt=(db,s,...args)=>db.prepare(s).bind(...args);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const normalized=x=>x??"";
const wordFields=w=>({
 headword:w.headword,phonetic_uk:w.phoneticUk||null,phonetic_us:w.phoneticUs||null,
 part_of_speech:w.partOfSpeech||null,meaning_zh:w.meaningZh,
 example_en:w.exampleEn||null,example_zh:w.exampleZh||null,
 collocations_json:JSON.stringify(w.collocations||[])
});
function pack(ch){
 return JSON.stringify({version:1,paragraphs:ch.paragraphs.map(p=>({segments:p.segments.map(s=>
  s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})}))});
}
function oldAnchors(ch){
 const old=JSON.parse(ch.content_json);
 if(old.version!==1||!Array.isArray(old.paragraphs))throw Error("INVALID_OLD_CHAPTER");
 return old.paragraphs.map(p=>p.segments.filter(s=>s.wordId).map(s=>s.wordId));
}
function preserveOriginalAnchors(before,after){
 const old=oldAnchors(before);
 if(old.length!==after.paragraphs.length)throw Error("PARAGRAPH_SHAPE_CHANGED");
 for(let i=0;i<old.length;i++){
  const next=after.paragraphs[i].segments.filter(s=>s.wordId).map(s=>s.wordId);
  let pointer=0;for(const id of old[i]){
   pointer=next.indexOf(id,pointer);
   if(pointer<0)throw Error("ORIGINAL_STUDY_ANCHOR_REMOVED");
   pointer++;
  }
 }
}
// Drafts that have never been published or studied may be fully rewritten.
// Retain every previously referenced study word somewhere in the same book;
// paragraph-local anchors are not meaningful for a genuinely new narrative.
function preserveDraftReflowWords(originalChapters,newChapters){
 const before=new Set(),after=new Set();
 for(const chapter of originalChapters)
  for(const paragraph of oldAnchors(chapter))
   for(const id of paragraph)before.add(id);
 for(const chapter of newChapters)
  for(const paragraph of chapter.paragraphs)
   for(const segment of paragraph.segments)
    if(segment.wordId)after.add(segment.wordId);
 for(const id of before)
  if(!after.has(id))throw Error("ORIGINAL_STUDY_WORD_REMOVED");
}
const checkChanged=()=>({
 sql:"INSERT INTO books(id,category_id,title) SELECT ?,?,? WHERE changes()<>1",
 params:[] // filled per target book
});
export function planDraftRevision({validated,originalBook,originalChapters,
 originalWords,externalWordIds=[],expectedVersion,requestId,actorId,allowSafeReflow=false}){
 const {book,chapters,words,mentionCount}=validated;
 if(!originalBook||originalBook.status!=="draft"||originalBook.id!==book.id||
    originalBook.category_id!==book.category||originalBook.title!==book.title)
  throw Error("BOOK_NOT_SAME_DRAFT");
 if(!Array.isArray(originalChapters)||originalChapters.length!==chapters.length||
    originalChapters.some(ch=>ch.published_at!==null))
  throw Error("CHAPTERS_NOT_SAME_UNPUBLISHED_SET");
 if(mentionCount>10_000||chapters.length>60||words.length>500)
  throw Error("REVISED_PACKAGE_TOO_LARGE");
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0||
    !REQUEST_ID.test(requestId)||!ID.test(actorId))
  throw Error("INVALID_REVISION_VERSION_OR_REQUEST");
 if(allowSafeReflow)preserveDraftReflowWords(originalChapters,chapters);
 const oldById=new Map(originalChapters.map(c=>[c.id,c]));
 const newById=new Map(chapters.map(c=>[c.id,c]));
 if(oldById.size!==chapters.length||newById.size!==chapters.length)throw Error("DUPLICATE_CHAPTER");
 for(const ch of chapters){
  const old=oldById.get(ch.id);
  if(!old||old.chapter_no!==ch.number)throw Error("CHAPTER_ID_OR_ORDER_CHANGED");
  if(!allowSafeReflow)preserveOriginalAnchors(old,ch);
 }
 const prevWords=new Map(originalWords.map(w=>[w.id,w]));
 const globalOthers=new Set(externalWordIds);
 const statements=[];
 const guard="INSERT INTO books(id,category_id,title) SELECT ?,?,? WHERE "+
  "NOT EXISTS(SELECT 1 FROM ops_book_content_versions WHERE book_id=? AND version=?)";
 statements.push({sql:guard,params:[book.id,book.category,book.title,book.id,expectedVersion]});
 // Each changed row must match the exact previously inspected JSON. A guard
 // using changes() immediately after every UPDATE aborts a stale transaction.
 for(const ch of chapters){
  const previous=oldById.get(ch.id);
  statements.push({sql:"UPDATE chapters SET title=?,is_preview=?,content_json=? "+
   "WHERE id=? AND book_id=? AND content_json=? AND published_at IS NULL AND "+
   "EXISTS(SELECT 1 FROM books WHERE id=? AND status='draft')",
   params:[ch.title,ch.preview?1:0,pack(ch),ch.id,book.id,previous.content_json,book.id]});
  statements.push({...checkChanged(),params:[book.id,book.category,book.title]});
 }
 // Existing shared words can be reused unchanged but cannot be modified by
 // a different book (this preserves the teaching history of other products).
 for(const w of words){
  const next=wordFields(w),prev=prevWords.get(w.id);
  if(prev){
   if(prev.headword!==next.headword||globalOthers.has(w.id)&&
    ["phonetic_uk","phonetic_us","part_of_speech","meaning_zh","example_en",
     "example_zh","collocations_json"].some(k=>normalized(prev[k])!==normalized(next[k])))
    throw Error("SHARED_WORD_CARD_CONFLICT");
   if(["phonetic_uk","phonetic_us","part_of_speech","meaning_zh","example_en",
     "example_zh","collocations_json"].some(k=>normalized(prev[k])!==normalized(next[k]))){
    statements.push({sql:"UPDATE words SET phonetic_uk=?,phonetic_us=?,part_of_speech=?,"+
     "meaning_zh=?,example_en=?,example_zh=?,collocations_json=? WHERE id=?",
     params:[next.phonetic_uk,next.phonetic_us,next.part_of_speech,next.meaning_zh,
      next.example_en,next.example_zh,next.collocations_json,w.id]});
    statements.push({...checkChanged(),params:[book.id,book.category,book.title]});
   }
  }else{
   statements.push({sql:"INSERT INTO words(id,headword,phonetic_uk,phonetic_us,part_of_speech,"+
    "meaning_zh,example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)",
    params:[w.id,next.headword,next.phonetic_uk,next.phonetic_us,next.part_of_speech,
     next.meaning_zh,next.example_en,next.example_zh,next.collocations_json]});
   statements.push({...checkChanged(),params:[book.id,book.category,book.title]});
  }
  statements.push({sql:"INSERT OR IGNORE INTO word_categories(word_id,category_id,proficiency_note) VALUES(?,?,'')",
   params:[w.id,book.category]});
 }
 statements.push({sql:"DELETE FROM chapter_words WHERE chapter_id IN "+
  "(SELECT id FROM chapters WHERE book_id=?)",params:[book.id]});
 let inserted=0;
 for(const ch of chapters){
  const list=[];
  for(const [p,paragraph] of ch.paragraphs.entries()){
   const context=paragraph.segments.map(s=>s.wordId?s.surface:s.text).join("");
   for(const [si,s] of paragraph.segments.entries())if(s.wordId)
    list.push([ch.id,s.wordId,context,"p"+p+":s"+si]);
  }
  for(let k=0;k<list.length;k+=25){
   const rows=list.slice(k,k+25);
   statements.push({sql:"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES "+
    rows.map(()=>"(?,?,?,?)").join(","),params:rows.flat()});
   inserted+=rows.length;
  }
 }
 if(inserted!==mentionCount)throw Error("ANCHOR_PLAN_DRIFT");
 // Prove post-write index count under the same transaction or abort by PK.
 statements.push({sql:"INSERT INTO books(id,category_id,title) SELECT ?,?,? WHERE "+
  "(SELECT COUNT(*) FROM chapter_words cw JOIN chapters ch ON cw.chapter_id=ch.id "+
  "WHERE ch.book_id=?)<>?",params:[book.id,book.category,book.title,book.id,inserted]});
 statements.push({sql:"INSERT INTO ops_audit_events"+
  "(id,actor_id,event_type,resource_type,resource_id,request_id,reason_code) "+
  "VALUES(?,?,'book.revise','book',?,?,'PUBLISHER_VERSIONED_DRAFT')",
  params:[crypto.randomUUID(),actorId,book.id,requestId]});
 if(statements.length>1600)throw Error("TOO_MANY_REVISION_STATEMENTS");
 return {statements,summary:{bookId:book.id,chapters:chapters.length,
  newAnchors:inserted,wordCards:words.length,remainsUnpublished:true,
  approvalInvalidated:true}};
}
async function readBody(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
  throw Error("CONTENT_TYPE");
 const raw=await req.text();
 if(new TextEncoder().encode(raw).length>2_000_000)throw Error("TOO_LARGE");
 try{return JSON.parse(raw)}catch{throw Error("INVALID_JSON")}
}
export async function handleOpsDraftRevision(req,env,path){
 if(path!=="/api/ops/import/revise"||req.method!=="POST")return reject("NOT_FOUND",404);
 const auth=await authenticateOperator(req,env);if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return reject("OPS_ROLE_FORBIDDEN",403);
 let input,valid;
 try{
  input=await readBody(req);
  valid=validatePackage(input?.package);
 }catch{return reject("INVALID_REVISED_PACKAGE",400)}
 const id=valid.book.id;
 if(!HEX.test(input?.expectedFingerprint||"")||input?.confirmTitle!==valid.book.title||
    !REQUEST_ID.test(input?.requestId||""))return reject("INVALID_REVISION_CONFIRMATION",400);
 const status=await stmt(env.DB,
  "SELECT id,title,category_id,status FROM books WHERE id=?",id).first();
 if(!status||status.status!=="draft")return reject("NO_EDITABLE_DRAFT",409);
 // Existing ops quality report binds the review to the same content version
 // the publisher explicitly selected in their private dashboard.
 const review=await reviewDraft(env,id),body=await review.json();
 if(review.status!==200||body.contentFingerprint!==input.expectedFingerprint)
  return reject("STALE_CONTENT_REVIEW_REQUIRED",409);
 const version=await stmt(env.DB,"SELECT version FROM ops_book_content_versions WHERE book_id=?",id).first();
 if(!version)return reject("BOOK_VERSION_REQUIRED",409);
 const originals=await stmt(env.DB,
  "SELECT id,chapter_no,title,content_json,is_preview,published_at FROM chapters WHERE book_id=? ORDER BY chapter_no",id).all();
 // Only an unpublished, never-studied draft may reflow paragraph positions.
 // Keep the original per-paragraph anchor rules whenever publication or
 // study history exists. If the history check is unavailable, fail closed.
 let allowSafeReflow=false;
 try{
  const risk=await stmt(env.DB,
   "SELECT "+ 
   "(SELECT COUNT(*) FROM reading_progress WHERE chapter_id IN "+
   "(SELECT id FROM chapters WHERE book_id=?)) AS read_count,"+
   "(SELECT COUNT(*) FROM review_events WHERE chapter_id IN "+
   "(SELECT id FROM chapters WHERE book_id=?)) AS review_count,"+
   "(SELECT COUNT(*) FROM ops_audit_events WHERE resource_type='book' "+
   "AND resource_id=? AND event_type='book.publish') AS publish_count",
   id,id,id).first();
  allowSafeReflow=!!risk&&Number(risk.read_count)===0&&
   Number(risk.review_count)===0&&Number(risk.publish_count)===0;
 }catch{
  return reject("DRAFT_REFLOW_HISTORY_CHECK_UNAVAILABLE",503);
 }
 const wordIds=valid.words.map(w=>w.id);
 const originalWords=[];
 const externalIds=[];
 for(let j=0;j<wordIds.length;j+=65){
  const ids=wordIds.slice(j,j+65);
  const rows=await stmt(env.DB,"SELECT * FROM words WHERE id IN ("+
   ids.map(()=>"?").join(",")+")",...ids).all();
  originalWords.push(...(rows.results||[]));
  const ext=await stmt(env.DB,"SELECT DISTINCT cw.word_id FROM chapter_words cw "+
   "JOIN chapters ch ON ch.id=cw.chapter_id WHERE cw.word_id IN ("+
   ids.map(()=>"?").join(",")+") AND ch.book_id<>?",...ids,id).all();
  externalIds.push(...(ext.results||[]).map(r=>r.word_id));
 }
 let plan;
 try{plan=planDraftRevision({validated:valid,originalBook:status,
  originalChapters:originals.results||[],originalWords,
  externalWordIds:externalIds,expectedVersion:version.version,
  requestId:input.requestId,actorId:auth.operator.id,allowSafeReflow})}
 catch(e){
  const known=new Set(["SHARED_WORD_CARD_CONFLICT","BOOK_NOT_SAME_DRAFT",
   "CHAPTERS_NOT_SAME_UNPUBLISHED_SET","CHAPTER_ID_OR_ORDER_CHANGED",
   "PARAGRAPH_SHAPE_CHANGED","ORIGINAL_STUDY_ANCHOR_REMOVED",
   "ORIGINAL_STUDY_WORD_REMOVED"]);
  return reject(known.has(e.message)?e.message:"REVISED_PACKAGE_INCOMPATIBLE",409);
 }
 try{await env.DB.batch(plan.statements.map(x=>stmt(env.DB,x.sql,...x.params)))}
 catch{console.error("OPS_DRAFT_REVISION_FAILED");return reject("DRAFT_REVISION_CONFLICT",409)}
 return respond({updated:true,...plan.summary,
  nextStep:"recheck-editorial-readiness-and-record-new-approval"},200);
}