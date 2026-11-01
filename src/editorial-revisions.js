// Staging-only optimistic edits with immutable previous-version snapshots.
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:H});
const bad=(code,status=400)=>reply({error:code},status);
const q=(db,sql,...params)=>db.prepare(sql).bind(...params);
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const HASH=/^[a-f0-9]{64}$/;
const valid=(x,max)=>typeof x==="string"&&x.trim().length>0&&x.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
const optional=(x,max)=>x==null||x===""||valid(x,max);
const numChanges=x=>Number(x?.meta?.changes??x?.changes??0);
export async function snapshotVersion(x){
  const b=new TextEncoder().encode(JSON.stringify(x));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",b));
  return Array.from(digest,v=>v.toString(16).padStart(2,"0")).join("");
}
export function chapterSnapshot(row){
  return {title:row.title,preview:!!row.is_preview,paragraphs:JSON.parse(row.content_json).paragraphs};
}
export function wordSnapshot(row){
  let collocations=[];try{collocations=JSON.parse(row.collocations_json||"[]")}catch{}
  return {headword:row.headword,meaningZh:row.meaning_zh,
    phoneticUk:row.phonetic_uk||"",phoneticUs:row.phonetic_us||"",
    partOfSpeech:row.part_of_speech||"",exampleEn:row.example_en||"",
    exampleZh:row.example_zh||"",collocations};
}
export async function revisionReady(env){
  try {
    const res=await env.DB.prepare("PRAGMA table_info(editorial_revisions)").all();
    return (res.results||[]).some(x=>x.name==="snapshot_json");
  }catch{return false}
}
async function parse(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))throw Error("CONTENT_TYPE");
  if(Number(req.headers.get("content-length")||0)>170000)throw Error("TOO_LARGE");
  const str=await req.text();
  if(new TextEncoder().encode(str).length>170000)throw Error("TOO_LARGE");
  try{return JSON.parse(str)}catch{throw Error("INVALID_JSON")}
}
function validateParagraphs(paragraphs,allowed) {
  if(!Array.isArray(paragraphs)||paragraphs.length<1||paragraphs.length>150)throw Error("INVALID_EDITOR_PAYLOAD");
  const out=[];let total=0;
  for(const para of paragraphs){
    if(!para||!Array.isArray(para.segments)||para.segments.length<1||para.segments.length>100)throw Error("INVALID_EDITOR_PAYLOAD");
    const segs=[];let length=0;
    for(const seg of para.segments){
      if(seg&&typeof seg.text==="string"&&seg.wordId===undefined){
        if(!valid(seg.text,5000))throw Error("INVALID_EDITOR_PAYLOAD");
        length+=seg.text.length;segs.push({text:seg.text});
      }else if(seg&&typeof seg.wordId==="string"&&seg.text===undefined){
        if(!allowed.has(seg.wordId)||!valid(seg.surface,80)||!valid(seg.gloss,200))throw Error("INVALID_EDITOR_PAYLOAD");
        length+=seg.surface.length;
        segs.push({wordId:seg.wordId,surface:seg.surface,gloss:seg.gloss});
      }else throw Error("INVALID_EDITOR_PAYLOAD");
    }
    if(length>6000)throw Error("TOO_LARGE");
    total+=length;
    if(total>150000)throw Error("TOO_LARGE");
    out.push({segments:segs});
  }
  return out;
}
function validateWord(x) {
  if(!x||!valid(x.headword,70)||!valid(x.meaningZh,300)||
    !optional(x.phoneticUk,120)||!optional(x.phoneticUs,120)||
    !optional(x.partOfSpeech,60)||!optional(x.exampleEn,700)||!optional(x.exampleZh,700)||
    !Array.isArray(x.collocations)||x.collocations.length>8)throw Error("INVALID_EDITOR_PAYLOAD");
  const collocations=x.collocations.map(p=>{
    if(!p||!valid(p.en,200)||!valid(p.zh,200))throw Error("INVALID_EDITOR_PAYLOAD");
    return {en:p.en,zh:p.zh};
  });
  return {headword:x.headword,meaningZh:x.meaningZh,phoneticUk:x.phoneticUk||"",
    phoneticUs:x.phoneticUs||"",partOfSpeech:x.partOfSpeech||"",
    exampleEn:x.exampleEn||"",exampleZh:x.exampleZh||"",collocations};
}
async function draft(db,bookId){
  if(!ID.test(bookId))return null;
  return q(db,"SELECT id,category_id FROM books WHERE id=? AND status='draft'",bookId).first();
}
async function editableChapter(env,bookId,id,req){
  const db=env.DB;const book=await draft(db,bookId);
  if(!book||!ID.test(id))return bad("DRAFT_NOT_FOUND",404);
  const old=await q(db,"SELECT ch.title,ch.content_json,ch.is_preview FROM chapters ch WHERE ch.id=? AND ch.book_id=? AND ch.published_at IS NULL",id,bookId).first();
  if(!old)return bad("DRAFT_NOT_FOUND",404);
  let x,next;
  try{
    x=await parse(req);
    if(!x||!HASH.test(x.expectedVersion)||!valid(x.title,120)||typeof x.preview!=="boolean")throw Error("INVALID_EDITOR_PAYLOAD");
    const rows=await q(db,"SELECT word_id FROM word_categories WHERE category_id=?",book.category_id).all();
    const allowed=new Set((rows.results||[]).map(w=>w.word_id));
    next={title:x.title,preview:x.preview,paragraphs:validateParagraphs(x.paragraphs,allowed)};
  }catch(e){return bad(["CONTENT_TYPE","TOO_LARGE","INVALID_JSON"].includes(e.message)?e.message:"INVALID_EDITOR_PAYLOAD",400)}
  const prior=chapterSnapshot(old);
  const previousVersion=await snapshotVersion(prior);
  if(x.expectedVersion!==previousVersion)return bad("EDIT_CONFLICT",409);
  if(JSON.stringify(prior)===JSON.stringify(next))return reply({saved:false,unchanged:true,version:previousVersion});
  const revisionId=crypto.randomUUID(),json=JSON.stringify({version:1,paragraphs:next.paragraphs});
  const commands=[
    q(db,"INSERT INTO editorial_revisions(id,entity_type,entity_id,book_id,old_version,snapshot_json) SELECT ?,'chapter',ch.id,?,?,? FROM chapters ch JOIN books b ON b.id=ch.book_id WHERE ch.id=? AND b.id=? AND b.status='draft' AND ch.published_at IS NULL AND ch.title=? AND ch.content_json=? AND ch.is_preview=?",
      revisionId,bookId,previousVersion,JSON.stringify(prior),id,bookId,old.title,old.content_json,old.is_preview),
    q(db,"UPDATE chapters SET title=?,is_preview=?,content_json=? WHERE id=? AND book_id=? AND published_at IS NULL AND EXISTS(SELECT 1 FROM editorial_revisions WHERE id=?)",
      next.title,next.preview?1:0,json,id,bookId,revisionId),
    q(db,"DELETE FROM chapter_words WHERE chapter_id=? AND EXISTS(SELECT 1 FROM editorial_revisions WHERE id=?)",id,revisionId)
  ];
  for(const [pi,p] of next.paragraphs.entries()){
    const context=p.segments.map(seg=>seg.text??seg.surface).join("");
    for(const [si,seg] of p.segments.entries())if(seg.wordId){
      commands.push(q(db,"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM editorial_revisions WHERE id=?)",
        id,seg.wordId,context,"p"+pi+":s"+si,revisionId));
    }
  }
  if(commands.length>465)return bad("EDITOR_PACKAGE_LIMIT",400);
  try{
    const result=await db.batch(commands);
    if(numChanges(result[0])!==1)return bad("EDIT_CONFLICT",409);
    return reply({saved:true,version:await snapshotVersion(next),revisionId,testOnly:true});
  }catch{
    console.error("S3_EDITOR_FAILED","chapter_edit");
    return bad("EDITOR_SAVE_FAILED",500);
  }
}
async function editableWord(env,bookId,id,req){
  const db=env.DB;const book=await draft(db,bookId);
  if(!book||!ID.test(id))return bad("DRAFT_NOT_FOUND",404);
  const old=await q(db,"SELECT * FROM words WHERE id=?",id).first();
  if(!old)return bad("WORD_NOT_FOUND",404);
  const usages=await q(db,"SELECT b.id AS book_id,b.status,ch.published_at FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id JOIN books b ON b.id=ch.book_id WHERE cw.word_id=?",id).all();
  if(!(usages.results||[]).length||(usages.results||[]).some(u=>u.book_id!==bookId||u.status!=="draft"||u.published_at!==null))
    return bad("SHARED_WORD_LOCKED",409);
  let x,next;
  try{
    x=await parse(req);
    if(!x||!HASH.test(x.expectedVersion))throw Error("INVALID_EDITOR_PAYLOAD");
    next=validateWord(x);
  }catch(e){return bad(["CONTENT_TYPE","TOO_LARGE","INVALID_JSON"].includes(e.message)?e.message:"INVALID_EDITOR_PAYLOAD",400)}
  const before=wordSnapshot(old),previousVersion=await snapshotVersion(before);
  if(x.expectedVersion!==previousVersion)return bad("EDIT_CONFLICT",409);
  if(JSON.stringify(before)===JSON.stringify(next))return reply({saved:false,unchanged:true,version:previousVersion});
  const rid=crypto.randomUUID();
  const commands=[
    q(db,"INSERT INTO editorial_revisions(id,entity_type,entity_id,book_id,old_version,snapshot_json) SELECT ?,'word',w.id,?,?,? FROM words w WHERE w.id=? AND w.headword IS ? AND w.meaning_zh IS ? AND w.phonetic_uk IS ? AND w.phonetic_us IS ? AND w.part_of_speech IS ? AND w.example_en IS ? AND w.example_zh IS ? AND w.collocations_json IS ? AND EXISTS(SELECT 1 FROM books WHERE id=? AND status='draft') AND NOT EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id JOIN books b ON b.id=ch.book_id WHERE cw.word_id=w.id AND (b.id<>? OR b.status<>'draft' OR ch.published_at IS NOT NULL))",
      rid,bookId,previousVersion,JSON.stringify(before),id,old.headword,old.meaning_zh,old.phonetic_uk,old.phonetic_us,old.part_of_speech,old.example_en,old.example_zh,old.collocations_json,bookId,bookId),
    q(db,"UPDATE words SET headword=?,meaning_zh=?,phonetic_uk=?,phonetic_us=?,part_of_speech=?,example_en=?,example_zh=?,collocations_json=? WHERE id=? AND EXISTS(SELECT 1 FROM editorial_revisions WHERE id=?)",
      next.headword,next.meaningZh,next.phoneticUk||null,next.phoneticUs||null,next.partOfSpeech||null,
      next.exampleEn||null,next.exampleZh||null,JSON.stringify(next.collocations),id,rid)
  ];
  try{
    const result=await db.batch(commands);
    if(numChanges(result[0])!==1)return bad("EDIT_CONFLICT",409);
    return reply({saved:true,version:await snapshotVersion(next),revisionId:rid,testOnly:true});
  }catch{
    console.error("S3_EDITOR_FAILED","word_edit");
    return bad("EDITOR_SAVE_FAILED",500);
  }
}
async function history(env,bookId,type,id){
  if(!ID.test(bookId)||!ID.test(id)||!["word","chapter"].includes(type))return bad("INVALID_ID",400);
  if(!(await draft(env.DB,bookId)))return bad("DRAFT_NOT_FOUND",404);
  const found=type==="chapter"
    ? await q(env.DB,"SELECT 1 AS ok FROM chapters WHERE id=? AND book_id=? AND published_at IS NULL",id,bookId).first()
    : await q(env.DB,"SELECT 1 AS ok FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id=? AND cw.word_id=? LIMIT 1",bookId,id).first();
  if(!found)return bad("DRAFT_NOT_FOUND",404);
  const result=await q(env.DB,"SELECT id,old_version AS version,snapshot_json,saved_at FROM editorial_revisions WHERE book_id=? AND entity_type=? AND entity_id=? ORDER BY rowid DESC LIMIT 15",bookId,type,id).all();
  return reply({revisions:(result.results||[]).map(r=>({id:r.id,version:r.version,savedAt:r.saved_at,
    snapshot:JSON.parse(r.snapshot_json)})),testOnly:true});
}
export async function handleRevision(req,env,path){
  const chapter=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/chapters\/([a-z0-9_-]+)$/);
  const word=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/words\/([a-z0-9_-]+)$/);
  const revisions=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/revisions\/(word|chapter)\/([a-z0-9_-]+)$/);
  if(!chapter&&!word&&!revisions)return bad("NOT_FOUND",404);
  if(!(await revisionReady(env)))return bad("EDITOR_REVISION_SCHEMA_REQUIRED",503);
  if(chapter&&req.method==="PUT")return editableChapter(env,chapter[1],chapter[2],req);
  if(word&&req.method==="PUT")return editableWord(env,word[1],word[2],req);
  if(revisions&&req.method==="GET")return history(env,revisions[1],revisions[2],revisions[3]);
  return bad("NOT_FOUND",404);
}
