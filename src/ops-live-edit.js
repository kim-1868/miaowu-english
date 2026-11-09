// Authenticated, version-guarded live book editing. Never changes accounts,
// entitlements, reading_progress, user_words or review_events. A transaction
// stores the complete pre-change snapshot BEFORE a new edition goes live.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
import {validatePackage} from "./editorial-content.js";

const HEAD={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const fail=(error,status=400)=>reply({error},status);
const bookIdPattern=/^[a-z][a-z0-9_-]{2,79}$/;
const requestPattern=/^[a-zA-Z0-9_-]{8,100}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const stmt=(db,s,...params)=>db.prepare(s).bind(...params);
const plain=x=>x==null?"":String(x);
const cleanWord=w=>({
  id:w.id,headword:w.headword,meaning_zh:w.meaningZh,
  phonetic_uk:w.phoneticUk||null,phonetic_us:w.phoneticUs||null,
  part_of_speech:w.partOfSpeech||null,example_en:w.exampleEn||null,
  example_zh:w.exampleZh||null,collocations_json:JSON.stringify(w.collocations||[])
});
const wordFields=["headword","meaning_zh","phonetic_uk","phonetic_us",
  "part_of_speech","example_en","example_zh","collocations_json"];
const wordRowToPackage=w=>({
  id:w.id,headword:w.headword,meaningZh:w.meaning_zh||"",
  phoneticUk:w.phonetic_uk||"",phoneticUs:w.phonetic_us||"",
  partOfSpeech:w.part_of_speech||"",exampleEn:w.example_en||"",
  exampleZh:w.example_zh||"",collocations:JSON.parse(w.collocations_json||"[]")
});
const packChapter=ch=>JSON.stringify({version:1,paragraphs:ch.paragraphs.map(p=>({
  segments:p.segments.map(s=>s.wordId?
    {wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})
}))});
const anchorRows=ch=>{
  const result=[];
  ch.paragraphs.forEach((p,pi)=>{
    const context=p.segments.map(s=>s.wordId?s.surface:s.text).join("");
    p.segments.forEach((s,si)=>{
      if(s.wordId)result.push([ch.id,s.wordId,context,"p"+pi+":s"+si]);
    });
  });
  return result;
};
const unique=x=>[...new Set(x)];

export function checkLivePackage(valid,current,existingWords,{allowAnchorRemoval=false}={}){
  const {book,chapters,words}=valid;
  if(book.id!==current.book.id||book.category!==current.book.category_id)
    throw Error("BOOK_ID_OR_CATEGORY_CHANGED");
  if(chapters.length<current.chapters.length)
    throw Error("PUBLISHED_CHAPTER_REMOVAL_FORBIDDEN");
  if(chapters.length>60||words.length>1500||valid.mentionCount>10000)
    throw Error("REVISION_TOO_LARGE");
  if(chapters.some((ch,i)=>ch.number!==i+1))
    throw Error("CHAPTER_NUMBERS_MUST_BE_CONTIGUOUS");
  const old=new Map(current.chapters.map(ch=>[ch.id,ch]));
  const previouslyUsed=new Map();
  const removedAnchors=[];
  for(const a of current.anchors){
    if(!previouslyUsed.has(a.chapter_id))previouslyUsed.set(a.chapter_id,new Set());
    previouslyUsed.get(a.chapter_id).add(a.word_id);
  }
  for(const ch of current.chapters){
    if(chapters[ch.chapter_no-1]?.id!==ch.id)
      throw Error("EXISTING_CHAPTER_ID_OR_ORDER_CHANGED");
    const next=chapters[ch.chapter_no-1];
    const nextWordIds=new Set(next.paragraphs.flatMap(p=>
      p.segments.filter(s=>s.wordId).map(s=>s.wordId)));
    for(const wordId of previouslyUsed.get(ch.id)||[])
      if(!nextWordIds.has(wordId)){
        if(!allowAnchorRemoval)throw Error("EXISTING_STUDY_WORD_REMOVED");
        removedAnchors.push({chapterId:ch.id,wordId});
      }
  }
  const additions=chapters.slice(current.chapters.length);
  if(additions.some(ch=>old.has(ch.id)))throw Error("DUPLICATE_CHAPTER_ID");
  const existingById=new Map(existingWords.map(w=>[w.id,w]));
  const newWords=[];
  for(const w of words){
    const row=existingById.get(w.id),normalized=cleanWord(w);
    if(!row){newWords.push(w);continue;}
    if(wordFields.some(k=>plain(row[k])!==plain(normalized[k])))
      throw Error("EXISTING_WORD_CARD_CHANGED");
  }
  const changedChapters=[];
  const paragraphLine=p=>p.segments.map(s=>s.wordId?s.surface:s.text).join("");
  const excerpt=parts=>parts.slice(0,1).join(" ").slice(0,180);
  for(const ch of chapters){
    const oldCh=old.get(ch.id);
    if(!oldCh){
      changedChapters.push({number:ch.number,title:ch.title,kind:"added",
        beforeExcerpt:"",afterExcerpt:excerpt(ch.paragraphs.map(paragraphLine))});
      continue;
    }
    if(oldCh.title!==ch.title||Boolean(oldCh.is_preview)!==ch.preview||
      oldCh.content_json!==packChapter(ch)){
      const before=JSON.parse(oldCh.content_json).paragraphs.map(paragraphLine);
      const after=ch.paragraphs.map(paragraphLine);
      const firstChanged=before.findIndex((line,i)=>line!==after[i]);
      const index=firstChanged<0?0:firstChanged;
      changedChapters.push({number:ch.number,title:ch.title,kind:"revised",
        beforeExcerpt:excerpt(before.slice(index)),afterExcerpt:excerpt(after.slice(index))});
    }
  }
  const metadataChanged=current.book.title!==book.title||
    plain(current.book.description)!==plain(book.description);
  if(!metadataChanged&&!changedChapters.length&&!newWords.length)
    throw Error("NO_CHANGES_TO_PUBLISH");
  return {metadataChanged,changedChapters,
    addedChapters:additions.length,newWords:newWords.length,
    totalChapters:chapters.length,studyAnchors:valid.mentionCount,
    removedStudyWords:removedAnchors.length,removedAnchors};
}
async function schemaReady(db){
  const info=await db.prepare("PRAGMA table_info(ops_live_book_versions)").all();
  const columns=new Set((info.results||[]).map(x=>x.name));
  return ["id","book_id","actor_id","action","request_id","base_version",
    "snapshot_json","summary_json"].every(k=>columns.has(k));
}
async function getBook(db,id){
  return stmt(db,"SELECT b.id,b.category_id,b.title,b.description,b.cover_key,b.status,"+
    "v.version FROM books b JOIN ops_book_content_versions v ON v.book_id=b.id WHERE b.id=?",id).first();
}
async function readCurrent(db,id,{withContent=true}={}){
  const book=await getBook(db,id);
  if(!book)throw Error("BOOK_NOT_FOUND");
  if(book.status!=="published")throw Error("BOOK_NOT_PUBLISHED");
  if(!withContent)return {book,chapters:[],anchors:[]};
  const chapters=(await stmt(db,"SELECT id,book_id,chapter_no,title,content_json,is_preview,published_at "+
    "FROM chapters WHERE book_id=? ORDER BY chapter_no",id).all()).results||[];
  const anchors=(await stmt(db,"SELECT cw.chapter_id,cw.word_id,cw.context_sentence,cw.context_anchor "+
    "FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
    "WHERE ch.book_id=? ORDER BY ch.chapter_no,cw.context_anchor,cw.word_id",id).all()).results||[];
  return {book,chapters,anchors};
}
async function wordRows(db,ids){
  const rows=[];
  for(let i=0;i<ids.length;i+=60){
    const part=ids.slice(i,i+60);
    if(!part.length)continue;
    const result=await stmt(db,"SELECT * FROM words WHERE id IN ("+
      part.map(()=>"?").join(",")+")",...part).all();
    rows.push(...(result.results||[]));
  }
  return rows;
}
async function readJson(req,max=1_900_000){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
    throw Error("INVALID_CONTENT_TYPE");
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>max)throw Error("PAYLOAD_TOO_LARGE");
  try{
    const v=JSON.parse(raw);
    if(!v||typeof v!=="object"||Array.isArray(v))throw Error();
    return v;
  }catch{throw Error("INVALID_JSON")}
}
const requestValid=x=>typeof x==="string"&&requestPattern.test(x);
const hash=async x=>{
  const bytes=new TextEncoder().encode(JSON.stringify(x));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
};
async function checkRevision(db,id,pkg,{allowAnchorRemoval=false}={}){
  const valid=validatePackage(pkg);
  const current=await readCurrent(db,id);
  const words=await wordRows(db,valid.words.map(x=>x.id));
  const diff=checkLivePackage(valid,current,words,{allowAnchorRemoval});
  return {current,valid,diff,source:pkg,digest:await hash(pkg)};
}
async function snapshot(current,kind){
  const result={book:{id:current.book.id,category_id:current.book.category_id,
    title:current.book.title,description:current.book.description},
    chapters:kind==="metadata"?null:current.chapters,
    anchors:kind==="metadata"?null:current.anchors};
  const serialized=JSON.stringify(result);
  if(new TextEncoder().encode(serialized).byteLength>1_700_000)
    throw Error("BACKUP_TOO_LARGE_USE_SMALLER_EDITION");
  return serialized;
}
function backupStatements({dbBook,actor,requestId,action,snapshotText,summary}){
  const backupId=crypto.randomUUID();
  // One transaction must first create a matching version snapshot or abort.
  // A stale/bad version intentionally raises an existing PK violation.
  return {backupId,rows:[
    {s:"INSERT INTO ops_live_book_versions(id,book_id,actor_id,action,request_id,base_version,snapshot_json,summary_json) "+
      "SELECT ?,b.id,?,?,?,?,?,? FROM books b JOIN ops_book_content_versions v ON v.book_id=b.id "+
      "WHERE b.id=? AND b.status='published' AND v.version=?",
      p:[backupId,actor,action,requestId,dbBook.version,snapshotText,JSON.stringify(summary),dbBook.id,dbBook.version]},
    {s:"INSERT INTO books(id,category_id,title) SELECT ?,?,? WHERE NOT EXISTS "+
      "(SELECT 1 FROM ops_live_book_versions WHERE id=?)",
      p:[dbBook.id,dbBook.category_id,dbBook.title,backupId]}
  ]};
}
function makeAudit({id,actor,requestId,kind}){
  return {s:"INSERT INTO ops_audit_events(id,actor_id,event_type,resource_type,resource_id,request_id,reason_code) "+
    "VALUES(?,?,?,?,?,?,?)",
    p:[crypto.randomUUID(),actor,"book.live_"+kind,"book",id,requestId,"PUBLISHER_VERSIONED_"+kind.toUpperCase()]};
}
async function priorEvent(db,requestId,actor,bookId,kind){
  const event=await stmt(db,"SELECT actor_id,resource_id,event_type FROM ops_audit_events "+
    "WHERE request_id=? AND event_type=?",requestId,"book.live_"+kind).first();
  if(!event)return null;
  if(event.actor_id!==actor||event.resource_id!==bookId)throw Error("REQUEST_ID_REUSED");
  return {alreadyApplied:true,updated:true,bookId};
}
const compiled=(db,rows)=>rows.map(x=>stmt(db,x.s,...x.p));
async function commitBatch(db,rows){
  if(rows.length>1400)throw Error("REVISION_STATEMENT_LIMIT");
  await db.batch(compiled(db,rows));
}
function anchorWrites(ch){
  const list=anchorRows(ch),rows=[];
  for(let i=0;i<list.length;i+=25){
    const part=list.slice(i,i+25);
    rows.push({s:"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES "+
      part.map(()=>"(?,?,?,?)").join(","),p:part.flat()});
  }
  return rows;
}
async function exportPackage(db,id){
  const current=await readCurrent(db,id);
  const ids=unique(current.anchors.map(x=>x.word_id));
  const words=await wordRows(db,ids);
  if(words.length!==ids.length)throw Error("BOOK_WORD_DATA_MISSING");
  const pkg={version:1,sourceLabel:"miaowu-published-editor-export",
    book:{id:current.book.id,title:current.book.title,
      description:current.book.description||"",category:current.book.category_id},
    chapters:current.chapters.map(ch=>{
      const parsed=JSON.parse(ch.content_json);
      if(parsed.version!==1||!Array.isArray(parsed.paragraphs))throw Error("INVALID_STORED_CHAPTER");
      return {id:ch.id,number:ch.chapter_no,title:ch.title,
        preview:Boolean(ch.is_preview),paragraphs:parsed.paragraphs};
    }),words:words.map(wordRowToPackage)};
  return {package:pkg,version:current.book.version,bookId:id};
}
async function preview(req,env,id){
  const body=await readJson(req);
  const rev=await checkRevision(env.DB,id,body.package,
    {allowAnchorRemoval:body.allowAnchorRemoval===true});
  return reply({ready:true,bookId:id,expectedVersion:rev.current.book.version,
    digest:rev.digest,diff:rev.diff,
    anchorRemovalRequiresConfirmation:rev.diff.removedStudyWords>0,
    warnings:["现有章节编号和目标词 ID 必须保持不变","新增章节允许追加，但旧章节不可删除",
      "已有词卡内容不可在此修改；这能保护其它书籍引用和学习记录",
      "确认发布后当前阅读者刷新页面即可加载新版内容"]});
}
async function listHistory(db,id){
  const current=await getBook(db,id);
  if(!current)return fail("BOOK_NOT_FOUND",404);
  const rows=await stmt(db,"SELECT id,action,base_version,summary_json,created_at "+
    "FROM ops_live_book_versions WHERE book_id=? ORDER BY rowid DESC LIMIT 30",id).all();
  return reply({version:current.version,status:current.status,
    versions:(rows.results||[]).map(r=>({id:r.id,action:r.action,
      baseVersion:r.base_version,summary:JSON.parse(r.summary_json),createdAt:r.created_at}))});
}
async function writeMetadata(req,env,id,actor){
  const v=await readJson(req,9000);
  if(!requestValid(v.requestId)||!Number.isSafeInteger(v.expectedVersion))
    throw Error("INVALID_EDIT_CONFIRMATION");
  const replay=await priorEvent(env.DB,v.requestId,actor,id,"metadata");if(replay)return reply(replay);
  if(typeof v.title!=="string"||!v.title.trim()||v.title.length>120||
    typeof v.description!=="string"||v.description.length>2000||
    /[\u0000-\u001f]/.test(v.title)||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.description))
    throw Error("INVALID_BOOK_METADATA");
  const current=await readCurrent(env.DB,id,{withContent:false});
  if(current.book.version!==v.expectedVersion)throw Error("STALE_BOOK_VERSION");
  if(current.book.title===v.title.trim()&&current.book.description===v.description)
    throw Error("NO_METADATA_CHANGE");
  const history=await snapshot(current,"metadata");
  const save=backupStatements({dbBook:current.book,actor,requestId:v.requestId,
    action:"metadata",snapshotText:history,summary:{oldTitle:current.book.title,newTitle:v.title.trim()}});
  const actions=[...save.rows,
    {s:"UPDATE books SET title=?,description=? WHERE id=? AND status='published'",
      p:[v.title.trim(),v.description,id]},
    makeAudit({id,actor,requestId:v.requestId,kind:"metadata"})];
  await commitBatch(env.DB,actions);
  return reply({updated:true,bookId:id,historyId:save.backupId});
}
async function publishRevision(req,env,id,actor){
  if(env.OPS_PUBLICATION_ENABLED!=="true")return fail("LIVE_EDIT_DISABLED",403);
  const v=await readJson(req);
  if(!requestValid(v.requestId)||!Number.isSafeInteger(v.expectedVersion)||
     !digestPattern.test(v.previewDigest||""))throw Error("INVALID_EDIT_CONFIRMATION");
  const replay=await priorEvent(env.DB,v.requestId,actor,id,"content");if(replay)return reply(replay);
  const rev=await checkRevision(env.DB,id,v.package,
    {allowAnchorRemoval:v.allowAnchorRemoval===true});
  if(rev.diff.removedStudyWords>0&&v.confirmAnchorRemoval!==true)
    throw Error("ANCHOR_REMOVAL_CONFIRMATION_REQUIRED");
  if(rev.current.book.version!==v.expectedVersion)throw Error("STALE_BOOK_VERSION");
  if(v.previewDigest!==rev.digest)throw Error("PREVIEW_CHANGED_RECHECK_REQUIRED");
  const snapshotText=await snapshot(rev.current,"content");
  const save=backupStatements({dbBook:rev.current.book,actor,requestId:v.requestId,
    action:"content",snapshotText,summary:rev.diff});
  const rows=[...save.rows];
  const book=rev.valid.book;
  if(rev.diff.metadataChanged)rows.push({s:"UPDATE books SET title=?,description=? WHERE id=? AND status='published'",
    p:[book.title,book.description||"",id]});
  const known=new Map(rev.current.chapters.map(ch=>[ch.id,ch]));
  const existingWords=new Set((await wordRows(env.DB,rev.valid.words.map(w=>w.id))).map(x=>x.id));
  for(const w of rev.valid.words){
    if(existingWords.has(w.id))continue;
    const r=cleanWord(w);
    rows.push({s:"INSERT INTO words(id,headword,meaning_zh,phonetic_uk,phonetic_us,"+
      "part_of_speech,example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)",
      p:[r.id,r.headword,r.meaning_zh,r.phonetic_uk,r.phonetic_us,r.part_of_speech,
        r.example_en,r.example_zh,r.collocations_json]});
    rows.push({s:"INSERT OR IGNORE INTO word_categories(word_id,category_id,proficiency_note) VALUES(?,?,'')",
      p:[w.id,rev.current.book.category_id]});
  }
  for(const ch of rev.valid.chapters){
    const stored=known.get(ch.id),content=packChapter(ch);
    if(stored&&stored.title===ch.title&&stored.content_json===content&&
       Boolean(stored.is_preview)===ch.preview)continue;
    if(stored){
      rows.push({s:"UPDATE chapters SET title=?,content_json=?,is_preview=? "+
        "WHERE id=? AND book_id=? AND published_at IS NOT NULL",
        p:[ch.title,content,ch.preview?1:0,ch.id,id]});
      rows.push({s:"DELETE FROM chapter_words WHERE chapter_id=?",p:[ch.id]});
    }else{
      rows.push({s:"INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) "+
        "VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)",
        p:[ch.id,id,ch.number,ch.title,content,ch.preview?1:0]});
    }
    rows.push(...anchorWrites(ch));
  }
  rows.push(makeAudit({id,actor,requestId:v.requestId,kind:"content"}));
  await commitBatch(env.DB,rows);
  return reply({updated:true,bookId:id,historyId:save.backupId,diff:rev.diff});
}
async function restoreVersion(req,env,id,actor){
  if(env.OPS_PUBLICATION_ENABLED!=="true")return fail("LIVE_EDIT_DISABLED",403);
  const v=await readJson(req,9000);
  if(!requestValid(v.requestId)||!Number.isSafeInteger(v.expectedVersion)||
    typeof v.historyId!=="string"||v.confirmRestore!==true)
    throw Error("INVALID_RESTORE_CONFIRMATION");
  const replay=await priorEvent(env.DB,v.requestId,actor,id,"restore");if(replay)return reply(replay);
  const record=await stmt(env.DB,"SELECT id,action,snapshot_json FROM ops_live_book_versions "+
    "WHERE id=? AND book_id=?",v.historyId,id).first();
  if(!record)throw Error("VERSION_NOT_FOUND");
  const prior=JSON.parse(record.snapshot_json);
  if(prior.book?.id!==id)throw Error("VERSION_BOOK_MISMATCH");
  const current=await readCurrent(env.DB,id,{withContent:true});
  if(current.book.version!==v.expectedVersion)throw Error("STALE_BOOK_VERSION");
  if(prior.book.category_id!==current.book.category_id)
    throw Error("VERSION_CATEGORY_MISMATCH");
  const snapshotText=await snapshot(current,"content");
  const save=backupStatements({dbBook:current.book,actor,requestId:v.requestId,
    action:"restore",snapshotText,
    summary:{restoredFrom:v.historyId,restoredAction:record.action}});
  const rows=[...save.rows];
  if(current.book.title!==prior.book.title||current.book.description!==prior.book.description){
    rows.push({s:"UPDATE books SET title=?,description=? WHERE id=? AND status='published'",
      p:[prior.book.title,prior.book.description||"",id]});
  }
  if(Array.isArray(prior.chapters)){
    const oldMap=new Map(prior.chapters.map(ch=>[ch.id,ch]));
    const nowMap=new Map(current.chapters.map(ch=>[ch.id,ch]));
    // Never create missing chapter IDs during restore. This protects a user's
    // chapter history if a newer edition has already been rolled back.
    for(const ch of prior.chapters)if(!nowMap.has(ch.id))throw Error("RESTORE_CHAPTER_ID_MISSING");
    const appended=current.chapters.filter(ch=>!oldMap.has(ch.id));
    for(const ch of appended){
      const row=await stmt(env.DB,"SELECT "+
        "(SELECT COUNT(*) FROM reading_progress WHERE chapter_id=?) AS progress,"+
        "(SELECT COUNT(*) FROM review_events WHERE chapter_id=?) AS review",
        ch.id,ch.id).first();
      if(Number(row?.progress)>0||Number(row?.review)>0)
        throw Error("RESTORE_WOULD_REMOVE_READER_HISTORY");
      rows.push({s:"DELETE FROM chapter_words WHERE chapter_id=?",p:[ch.id]});
      rows.push({s:"DELETE FROM chapters WHERE id=? AND book_id=?",p:[ch.id,id]});
    }
    const byChapter=new Map();
    for(const anchor of prior.anchors||[]){
      if(!byChapter.has(anchor.chapter_id))byChapter.set(anchor.chapter_id,[]);
      byChapter.get(anchor.chapter_id).push(anchor);
    }
    for(const ch of prior.chapters){
      const currentRow=nowMap.get(ch.id);
      if(currentRow.chapter_no!==ch.chapter_no)
        throw Error("RESTORE_CHAPTER_ORDER_CHANGED");
      if(ch.title===currentRow.title&&ch.content_json===currentRow.content_json&&
        ch.is_preview===currentRow.is_preview)continue;
      rows.push({s:"UPDATE chapters SET title=?,content_json=?,is_preview=? "+
        "WHERE id=? AND book_id=? AND published_at IS NOT NULL",
        p:[ch.title,ch.content_json,ch.is_preview,ch.id,id]});
      rows.push({s:"DELETE FROM chapter_words WHERE chapter_id=?",p:[ch.id]});
      for(let i=0;i<(byChapter.get(ch.id)||[]).length;i+=25){
        const part=byChapter.get(ch.id).slice(i,i+25);
        rows.push({s:"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES "+
          part.map(()=>"(?,?,?,?)").join(","),
          p:part.flatMap(x=>[x.chapter_id,x.word_id,x.context_sentence,x.context_anchor])});
      }
    }
  }
  rows.push(makeAudit({id,actor,requestId:v.requestId,kind:"restore"}));
  await commitBatch(env.DB,rows);
  return reply({restored:true,bookId:id,historyId:save.backupId,restoredFrom:v.historyId});
}
export async function handleOpsLiveEdit(req,env,path){
  if(!["production","staging"].includes(env.APP_ENV)||
     env.OPS_CONSOLE_ENABLED!=="true")return fail("NOT_FOUND",404);
  const match=path.match(/^\/api\/ops\/books\/([a-z][a-z0-9_-]{2,79})\/live-editor(?:\/(export|preview|metadata|publish|history|restore))?$/);
  if(!match)return fail("NOT_FOUND",404);
  const [,id,action="overview"]=match;
  const method=req.method;
  const allowed=action==="overview"||action==="export"||action==="history"?"GET":"POST";
  if(method!==allowed)return fail("NOT_FOUND",404);
  const auth=await authenticateOperator(req,env);if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,"publisher"))return fail("OPS_ROLE_FORBIDDEN",403);
  try{
    if(!(await schemaReady(env.DB)))return fail("LIVE_EDIT_SCHEMA_REQUIRED",503);
    if(action==="history")return await listHistory(env.DB,id);
    if(action==="overview"){
      const book=await getBook(env.DB,id);
      if(!book)return fail("BOOK_NOT_FOUND",404);
      if(book.status!=="published")return fail("BOOK_NOT_PUBLISHED",409);
      const number=await stmt(env.DB,
        "SELECT COUNT(*) AS n FROM chapters WHERE book_id=?",id).first();
      return reply({book:{id:book.id,title:book.title,
        description:book.description||"",category:book.category_id},
        version:book.version,chapterCount:Number(number?.n||0),
        editable:env.OPS_PUBLICATION_ENABLED==="true",
        note:"保留章节与词汇 ID；修订前系统会保存不可更改的历史版本。"});
    }
    if(action==="export")return reply(await exportPackage(env.DB,id));
    if(action==="preview")return await preview(req,env,id);
    if(action==="metadata"){
      if(env.OPS_PUBLICATION_ENABLED!=="true")return fail("LIVE_EDIT_DISABLED",403);
      return await writeMetadata(req,env,id,auth.operator.id);
    }
    if(action==="publish")return await publishRevision(req,env,id,auth.operator.id);
    return await restoreVersion(req,env,id,auth.operator.id);
  }catch(err){
    const expected=["BOOK_NOT_FOUND","BOOK_NOT_PUBLISHED","INVALID_CONTENT_TYPE",
      "PAYLOAD_TOO_LARGE","INVALID_JSON","INVALID_EDIT_CONFIRMATION","INVALID_REVISED_PACKAGE",
      "INVALID_BOOK_METADATA","NO_METADATA_CHANGE","STALE_BOOK_VERSION","PREVIEW_CHANGED_RECHECK_REQUIRED",
      "NO_CHANGES_TO_PUBLISH","BOOK_ID_OR_CATEGORY_CHANGED","PUBLISHED_CHAPTER_REMOVAL_FORBIDDEN",
      "REVISION_TOO_LARGE","CHAPTER_NUMBERS_MUST_BE_CONTIGUOUS","EXISTING_CHAPTER_ID_OR_ORDER_CHANGED",
      "EXISTING_STUDY_WORD_REMOVED","ANCHOR_REMOVAL_CONFIRMATION_REQUIRED","DUPLICATE_CHAPTER_ID","EXISTING_WORD_CARD_CHANGED",
      "BACKUP_TOO_LARGE_USE_SMALLER_EDITION","REVISION_STATEMENT_LIMIT","INVALID_RESTORE_CONFIRMATION",
      "VERSION_NOT_FOUND","VERSION_BOOK_MISMATCH","VERSION_CATEGORY_MISMATCH",
      "RESTORE_CHAPTER_ID_MISSING","RESTORE_WOULD_REMOVE_READER_HISTORY",
      "RESTORE_CHAPTER_ORDER_CHANGED","REQUEST_ID_REUSED"];
    if(expected.includes(err.message))return fail(err.message,
      /NOT_FOUND/.test(err.message)?404:/STALE|CHANGED|CONFLICT|FORBIDDEN|REMOVED|MISSING|NO_CHANGES|NO_METADATA|TOO_LARGE|WOULD_REMOVE/.test(err.message)?409:400);
    if(err.message?.startsWith("Content validation:"))
      return fail("INVALID_REVISED_PACKAGE",400);
    console.error("OPS_LIVE_EDIT_FAILED",String(err?.message||"unknown").slice(0,130));
    return fail("LIVE_EDIT_FAILED",503);
  }
}