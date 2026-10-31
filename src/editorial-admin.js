import { validatePackage } from "./editorial-content.js";
import { reviewDraft } from "./editorial-review.js";
import {handleReviewSignoff} from "./editorial-signoff.js";
import {publicationReadiness} from "./editorial-publication.js";
import {handleRevision,revisionReady,snapshotVersion,chapterSnapshot,wordSnapshot} from "./editorial-revisions.js";

const NO_STORE = {"content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const resp=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:NO_STORE});
const err=(error,status=400)=>resp({error},status);
const limiter={maxBytes:350000,maxChapters:15,maxWords:180,maxMentions:450,maxStatements:950};
const encoder=new TextEncoder();
async function adminAllowed(req,env) {
  const actual=env.S3_EDITOR_SECRET;
  if(typeof actual!=="string" || actual.length<32)return null;
  const candidate=req.headers.get("X-Mw-Editor-Key")||"";
  if(candidate.length<32 || candidate.length>256)return false;
  const [a,b]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256",encoder.encode(actual))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
const bound=(db,sql,...values)=>db.prepare(sql).bind(...values);
async function digest(source) {
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(JSON.stringify(source))));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
async function parsePackage(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("Content-Type")||""))throw new Error("CONTENT_TYPE");
  if(Number(req.headers.get("Content-Length")||0)>limiter.maxBytes)throw new Error("TOO_LARGE");
  const body=await req.text();
  if(encoder.encode(body).length>limiter.maxBytes)throw new Error("TOO_LARGE");
  let parsed;try{parsed=JSON.parse(body)}catch{throw new Error("INVALID_JSON")}
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed) || !parsed.package)
    throw new Error("INVALID_PACKAGE");
  return parsed.package;
}
// Only fixed diagnostic labels reach the browser. Never log user-supplied
// editor credentials, manuscript contents, SQL statements, or raw DB errors.
async function editorCheck(env) {
  if(!env.DB)return err("SERVICE_NOT_CONFIGURED",503);
  try{
    const tables=["books","chapters","words","chapter_words","content_packages","word_categories"];
    const info=await Promise.all(tables.map(async table=>{
      const columns=await env.DB.prepare("PRAGMA table_info("+table+")").all();
      return {table,ready:Array.isArray(columns.results)&&columns.results.length>0};
    }));
    const missing=info.filter(x=>!x.ready).map(x=>x.table);
    return resp({ok:missing.length===0,editorConfigured:true,dbBound:true,
      schemaReady:missing.length===0,missingTables:missing,revisionsSchemaReady:await revisionReady(env),testOnly:true},missing.length?503:200);
  }catch {
    return err("EDITOR_SCHEMA_CHECK_FAILED",503);
  }
}
async function safeListing(env) {
  try { return await listing(env); }
  catch {
    console.error("S3_EDITOR_FAILED","listing");
    return resp({error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.list"},500);
  }
}
async function safePreview(env,id) {
  try { return await preview(env,id); }
  catch {
    console.error("S3_EDITOR_FAILED","preview");
    return resp({error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.preview"},500);
  }
}

async function listing(env) {
  const result=await env.DB.prepare(`SELECT b.id,b.title,b.description,b.category_id AS category,
    b.status,COUNT(DISTINCT ch.id) AS chapter_count,
    (SELECT COUNT(DISTINCT cw.word_id) FROM chapter_words cw
      JOIN chapters ch2 ON cw.chapter_id=ch2.id WHERE ch2.book_id=b.id) AS word_count
    FROM books b LEFT JOIN chapters ch ON ch.book_id=b.id
    WHERE b.status='draft' GROUP BY b.id ORDER BY b.rowid DESC LIMIT 50`).all();
  return resp({drafts:result.results||[],testOnly:true});
}
async function preview(env,id){
  if(!/^[a-z][a-z0-9_-]{2,79}$/.test(id))return err("INVALID_ID",400);
  const book=await bound(env.DB,`SELECT id,title,description,category_id AS category,status
    FROM books WHERE id=? AND status='draft'`,id).first();
  if(!book)return err("DRAFT_NOT_FOUND",404);
  const chapters=await bound(env.DB,`SELECT id,chapter_no AS number,title,content_json,is_preview
    FROM chapters WHERE book_id=? AND published_at IS NULL ORDER BY chapter_no LIMIT 60`,id).all();
  const result=await Promise.all((chapters.results||[]).map(async row=>{
    let content=null,version=null;
    try{content=JSON.parse(row.content_json);version=await snapshotVersion(chapterSnapshot(row))}catch{}
    return {id:row.id,number:row.number,title:row.title,preview:!!row.is_preview,content,version};
  }));
  const words=await bound(env.DB,`SELECT DISTINCT w.id,w.headword,w.phonetic_uk,w.phonetic_us,
      w.part_of_speech,w.meaning_zh,w.example_en,w.example_zh,w.collocations_json
    FROM words w JOIN chapter_words cw ON cw.word_id=w.id
    JOIN chapters ch ON ch.id=cw.chapter_id WHERE ch.book_id=?
    ORDER BY w.headword LIMIT 500`,id).all();
  const enriched=await Promise.all((words.results||[]).map(async row=>{
    const snap=wordSnapshot(row);
    const {collocations_json,...rest}=row;
    return {...rest,collocations:snap.collocations,version:await snapshotVersion(snap)};
  }));
  return resp({book,chapters:result,words:enriched,testOnly:true});
}
async function createDraft(env,req) {
  let source,validated;
  try {
    source=await parsePackage(req);
    validated=validatePackage(source);
    if(validated.chapters.length>limiter.maxChapters || validated.words.length>limiter.maxWords ||
      validated.mentionCount>limiter.maxMentions)throw new Error("EDITOR_PACKAGE_LIMIT");
  }catch(e) {
    return err(["CONTENT_TYPE","TOO_LARGE","INVALID_JSON","INVALID_PACKAGE","EDITOR_PACKAGE_LIMIT"].includes(e.message)
      ?e.message:"EDITOR_PACKAGE_INVALID",400);
  }
  const {book,chapters,words,label}=validated;
  const existing=await bound(env.DB,"SELECT id FROM books WHERE id=?",book.id).first();
  if(existing)return err("DRAFT_ID_EXISTS",409);
  // Existing shared global words must mean the same thing, or another book could
  // silently change/cross-link the meaning and examples of earlier paid content.
  for(const w of words){
    const prior=await bound(env.DB,"SELECT headword,meaning_zh FROM words WHERE id=?",w.id).first();
    if(prior && (prior.headword!==w.headword || prior.meaning_zh!==w.meaningZh))
      return err("VOCAB_ID_CONFLICT",409);
  }
  const hash=await digest(source);
  const statements=[];
  statements.push(bound(env.DB,`INSERT INTO books(id,category_id,title,description,cover_key,status,sort_order)
    VALUES(?,?,?,?,?,'draft',0)`,book.id,book.category,book.title,book.description||"",book.coverKey||null));
  for(const w of words){
    statements.push(bound(env.DB,`INSERT OR IGNORE INTO words
      (id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json)
      VALUES(?,?,?,?,?,?,?,?,?)`,w.id,w.headword,w.phoneticUk||null,w.phoneticUs||null,
      w.partOfSpeech||null,w.meaningZh,w.exampleEn||null,w.exampleZh||null,JSON.stringify(w.collocations||[])));
    statements.push(bound(env.DB,`INSERT OR IGNORE INTO word_categories(word_id,category_id,proficiency_note)
      VALUES(?,?,'')`,w.id,book.category));
  }
  for(const chapter of chapters){
    const paragraphs=chapter.paragraphs.map(p=>({segments:p.segments.map(seg=>seg.wordId
      ?{wordId:seg.wordId,surface:seg.surface,gloss:seg.gloss}:{text:seg.text})}));
    statements.push(bound(env.DB,`INSERT INTO chapters
      (id,book_id,chapter_no,title,content_json,is_preview,published_at)
      VALUES(?,?,?,?,?,?,NULL)`,chapter.id,book.id,chapter.number,chapter.title,
      JSON.stringify({version:1,paragraphs}),chapter.preview?1:0));
    for(const [pi,p] of chapter.paragraphs.entries()){
      const context=p.segments.map(seg=>seg.wordId?seg.surface:seg.text).join("");
      for(const [si,seg] of p.segments.entries()){
        if(!seg.wordId)continue;
        statements.push(bound(env.DB,`INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor)
          VALUES(?,?,?,?)`,chapter.id,seg.wordId,context,"p"+pi+":s"+si));
      }
    }
  }
  statements.push(bound(env.DB,`INSERT INTO content_packages(id,book_id,source_digest,source_label)
    VALUES(?,?,?,?)`,"pkg-"+hash.slice(0,28),book.id,hash,label));
  if(statements.length>limiter.maxStatements)return err("EDITOR_PACKAGE_LIMIT",400);
  // D1.batch is transactional: no partially imported books if a FK or ID fails.
  try{await env.DB.batch(statements)}
  catch{ return err("IMPORT_CONFLICT",409); }
  return resp({created:true,bookId:book.id,chapters:chapters.length,words:words.length,
    publication:"draft-only",testOnly:true},201);
}

export async function handleEditor(req,env,path) {
  // This route is strictly staging-only. Never grant editorial powers to
  // reviewer Basic credentials or to a normal paid customer account.
  if(env.APP_ENV!=="staging")return err("NOT_FOUND",404);
  const authorized=await adminAllowed(req,env);
  if(authorized===null)return err("EDITOR_NOT_CONFIGURED",503);
  if(!authorized)return err("EDITOR_FORBIDDEN",403);
  if(!env.DB)return err("SERVICE_NOT_CONFIGURED",503);
  if(path==="/api/staging/editor/check" && req.method==="GET")return editorCheck(env);
  if(path.match(/^\/api\/staging\/editor\/drafts\/[a-z0-9_-]+\/(chapters|words|revisions)\//))
    return handleRevision(req,env,path);
  const review=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/review$/);
  if(review && req.method==="GET") {
    try{return await reviewDraft(env,review[1])}
    catch{console.error("S3_EDITOR_FAILED","drafts.review");
      return resp({error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.review"},500);}
  }
  const signoff=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/review-signoffs$/);
  if(signoff && (req.method==="GET"||req.method==="POST")){
    try{return await handleReviewSignoff(req,env,signoff[1])}
    catch{console.error("S3_EDITOR_FAILED","drafts.signoff");
      return resp({error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.signoff"},500);}
  }
  const preflight=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)\/publication-readiness$/);
  if(preflight && req.method==="GET"){
    try{return await publicationReadiness(env,preflight[1])}
    catch{console.error("S3_EDITOR_FAILED","drafts.publication_readiness");
      return resp({error:"EDITOR_BACKEND_ERROR",diagnosticStage:"drafts.publication_readiness"},500);}
  }
  if(path==="/api/staging/editor/drafts" && req.method==="GET")return safeListing(env);
  const id=path.match(/^\/api\/staging\/editor\/drafts\/([a-z0-9_-]+)$/);
  if(id && req.method==="GET")return safePreview(env,id[1]);
  if(path==="/api/staging/editor/drafts" && req.method==="POST")return createDraft(env,req);
  return err("NOT_FOUND",404);
}
