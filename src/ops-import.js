// Publisher-only self-service full book package import.
// NEVER creates entitlements or publishes any chapter. The S9 release gate
// remains a separate explicit review + publish action with a version fingerprint.
import {authenticateOperator,hasOpsRole} from "./ops-access.js";
import {isNonProductionManuscript} from "./ops-publication.js";
import {reviewNovelCoverage} from "./ops-novel-coverage.js";
import {validatePackage} from "./editorial-content.js";
const HEAD={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:HEAD});
const err=(code,status=400)=>json({error:code},status);
const MAX_BYTES=2_000_000;
const MAX_CHAPTERS=60;
const MAX_WORDS=500;
const MAX_ANCHORS=10000;
const MAX_STATEMENTS=1200;
const stmt=(db,q,...args)=>db.prepare(q).bind(...args);
const clean=(v)=>v??null;
const coalesce=(v)=>v??"";
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function readPackage(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))throw Error("INVALID_CONTENT_TYPE");
 if(Number(req.headers.get("content-length")||0)>MAX_BYTES)throw Error("PACKAGE_TOO_LARGE");
 const raw=await req.text();
 if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error("PACKAGE_TOO_LARGE");
 let value;try{value=JSON.parse(raw)}catch{throw Error("INVALID_JSON")}
 const input=value?.package??value;
 const result=validatePackage(input);
 if(result.chapters.length>MAX_CHAPTERS||result.words.length>MAX_WORDS||
   result.mentionCount>MAX_ANCHORS)throw Error("PACKAGE_LIMIT_EXCEEDED");
 if(result.chapters.some((c,i)=>c.number!==i+1))
   throw Error("CHAPTERS_MUST_BE_ORDERED_FROM_ONE");
 return {source:input,validated:result};
}
export function planOpsBookImport(validated){
 const {book,chapters,words,label,mentionCount}=validated;
 if(!book||!Array.isArray(chapters)||!Array.isArray(words))throw Error("INVALID_PACKAGE");
 const summary={bookId:book.id,title:book.title,category:book.category,
  chapters:chapters.length,wordCards:words.length,anchors:mentionCount,
  previews:chapters.filter(x=>x.preview).length,paid:chapters.filter(x=>!x.preview).length,
  metadataNeedsCompletion:words.filter(w=>!w.phoneticUk||!w.phoneticUs||
    !w.partOfSpeech||!w.exampleEn||!w.exampleZh).map(w=>w.headword),
  status:"draft",published:false};
 const statements=[];
 statements.push({sql:"INSERT INTO books(id,category_id,title,description,cover_key,status,sort_order) VALUES(?,?,?,?,?,'draft',0)",
  params:[book.id,book.category,book.title,book.description||"",book.coverKey||null]});
 for(const w of words){
  statements.push({sql:"INSERT OR IGNORE INTO words (id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)",
   params:[w.id,w.headword,clean(w.phoneticUk),clean(w.phoneticUs),clean(w.partOfSpeech),
    w.meaningZh,clean(w.exampleEn),clean(w.exampleZh),JSON.stringify(w.collocations||[])]});
  statements.push({sql:"INSERT OR IGNORE INTO word_categories(word_id,category_id,proficiency_note) VALUES(?,?,'')",
   params:[w.id,book.category]});
 }
 for(const ch of chapters){
  const content={version:1,paragraphs:ch.paragraphs.map(p=>({segments:p.segments.map(s=>
   s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})}))};
  statements.push({sql:"INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES(?,?,?,?,?,?,NULL)",
   params:[ch.id,book.id,ch.number,ch.title,JSON.stringify(content),ch.preview?1:0]});
  let anchors=[];
  for(const [pi,p] of ch.paragraphs.entries()){
   const context=p.segments.map(s=>s.wordId?s.surface:s.text).join("");
   for(const [si,s] of p.segments.entries())if(s.wordId)
    anchors.push([ch.id,s.wordId,context,"p"+pi+":s"+si]);
  }
  // Multi-value INSERTs avoid thousands of roundtrips, and each statement
  // uses <=100 parameters (Cloudflare D1 current per-query limit).
  for(let i=0;i<anchors.length;i+=25){
   const rows=anchors.slice(i,i+25);
   statements.push({sql:"INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES "+
    rows.map(()=>"(?,?,?,?)").join(","),
    params:rows.flat()});
  }
 }
 if(statements.length>MAX_STATEMENTS)throw Error("PACKAGE_STATEMENT_LIMIT");
 return {summary,statements,label};
}
const catalogFields=["headword","meaning_zh","phonetic_uk","phonetic_us","part_of_speech",
 "example_en","example_zh","collocations_json"];
async function existingWordConflicts(db,words){
 const found=new Map();
 for(let i=0;i<words.length;i+=70){
  const ids=words.slice(i,i+70).map(w=>w.id);
  const rows=await stmt(db,"SELECT id,"+catalogFields.join(",")+
   " FROM words WHERE id IN ("+ids.map(()=>"?").join(",")+")",...ids).all();
  for(const row of rows.results||[])found.set(row.id,row);
 }
 for(const w of words){
  const p=found.get(w.id);if(!p)continue;
  let collocations;try{collocations=JSON.parse(p.collocations_json||"[]")}catch{return w.id}
  if(p.headword!==w.headword||p.meaning_zh!==w.meaningZh||
     coalesce(p.phonetic_uk)!==coalesce(w.phoneticUk)||
     coalesce(p.phonetic_us)!==coalesce(w.phoneticUs)||
     coalesce(p.part_of_speech)!==coalesce(w.partOfSpeech)||
     coalesce(p.example_en)!==coalesce(w.exampleEn)||
     coalesce(p.example_zh)!==coalesce(w.exampleZh)||
     !jsonEqual(collocations,w.collocations||[]))return w.id;
 }
 return null;
}
export async function handleOpsImport(req,env,path){
 const coverage=path==="/api/ops/import/coverage"&&req.method==="POST";
 if(!coverage&&!(path==="/api/ops/import"&&req.method==="POST")&&
    !(path==="/api/ops/lexicon"&&req.method==="GET"))return err("NOT_FOUND",404);
 if(env.APP_ENV!=="production"&&env.APP_ENV!=="staging")return err("NOT_FOUND",404);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,"publisher"))return err("OPS_ROLE_FORBIDDEN",403);
 if(!env.DB)return err("OPS_NOT_CONFIGURED",503);
 if(path==="/api/ops/lexicon"){
  const category=new URL(req.url).searchParams.get("category")||"cet4";
  if(!/^[a-z][a-z0-9-]{2,29}$/.test(category))return err("INVALID_CATEGORY",400);
  try{
   const exists=await stmt(env.DB,"SELECT id FROM categories WHERE slug=?",category).first();
   if(!exists)return err("INVALID_CATEGORY",400);
   const result=await stmt(env.DB,
    "SELECT w.id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,"+
    "w.meaning_zh,w.example_en,w.example_zh,w.collocations_json FROM words w "+
    "JOIN word_categories wc ON wc.word_id=w.id WHERE wc.category_id=? "+
    "ORDER BY w.headword,w.id LIMIT 5000",category).all();
   return json({category,words:(result.results||[]).map(w=>({
    id:w.id,headword:w.headword,phoneticUk:w.phonetic_uk,phoneticUs:w.phonetic_us,
    partOfSpeech:w.part_of_speech,meaningZh:w.meaning_zh,
    exampleEn:w.example_en,exampleZh:w.example_zh,
    collocations:(()=>{try{return JSON.parse(w.collocations_json||"[]")}catch{return []}})()
   }))});
  }catch{return err("VOCABULARY_UNAVAILABLE",503)}
 }
 let checked;
 try{checked=await readPackage(req)}
 catch(e){return err(/^(PACKAGE_|INVALID_CONTENT_TYPE|INVALID_JSON|CHAPTERS_MUST_BE_ORDERED_FROM_ONE)/.test(e.message)?
  e.message:"INVALID_NOVEL_PACKAGE",400);}
 let plan;
 try{plan=planOpsBookImport(checked.validated)}
 catch(e){return err(e.message==="PACKAGE_STATEMENT_LIMIT"?"PACKAGE_STATEMENT_LIMIT":"INVALID_NOVEL_PACKAGE",400)}
 if(coverage){
  try{
   const {book,chapters,words}=checked.validated;
   const db=env.DB;
   const [result,bookMatches,wordConflict]=await Promise.all([
    reviewNovelCoverage(db,checked.validated),
    stmt(db,"SELECT id,status,category_id FROM books WHERE id=? OR (category_id=? AND title=?)",
     book.id,book.category,book.title).all(),
    existingWordConflicts(db,words)
   ]);
   if(!result)return err("INVALID_CATEGORY",400);
   const blockers=[];
   const existing=bookMatches.results.find(row=>row.id===book.id);
   if(existing)blockers.push(existing.status==="published"?
    "该书已上架，请走已发布小说修订入口。":"该书编号已存在，请走原书修订流程。");
   if(bookMatches.results.some(row=>row.id!==book.id))blockers.push("本等级已有同名书。");
   if(isNonProductionManuscript(book))blockers.push("书名或编号带有测试稿标记。");
   if(env.OPS_PUBLICATION_ENABLED!=="true")blockers.push("当前环境未启用正式发布。");
   if(!plan.summary.paid)blockers.push("至少需要一章付费正文。");
   if(!plan.summary.anchors)blockers.push("正文没有学习标注。");
   if(plan.summary.metadataNeedsCompletion.length)
    blockers.push("词卡缺少音标、词性或双语例句："+plan.summary.metadataNeedsCompletion.join("、"));
   if(wordConflict)blockers.push("正式词卡编号与上传内容冲突："+wordConflict);
   if(chapters.some(ch=>ch.paragraphs.some(p=>!p.segments.map(seg=>seg.text??seg.surface).join("").trim())))
    blockers.push("正文存在空白段落。");
   if(chapters.some(ch=>ch.paragraphs.some(p=>p.segments.some(seg=>seg.wordId&&!seg.gloss.trim()))))
    blockers.push("正文存在缺少语境释义的词卡标注。");
   {
    const ids=chapters.map(ch=>ch.id);
    const conflict=await stmt(db,"SELECT id FROM chapters WHERE id IN ("+ids.map(()=>"?").join(",")+") LIMIT 1",...ids).first();
    if(conflict)blockers.push("章节编号已存在："+conflict.id);
   }
   const alternatives=existing?[]:(await Promise.all(["cet4","cet6","postgrad","ielts","gk"]
    .filter(category=>category!==book.category)
    .map(async category=>{
     const report=await reviewNovelCoverage(db,{...checked.validated,book:{...book,category}});
     if(!report?.total)return null;
     const duplicate=await stmt(db,"SELECT id FROM books WHERE category_id=? AND title=?",category,book.title).first();
     return duplicate?null:{category,netGain:report.netGain,bookHeadwords:report.bookHeadwords,crossBookRate:report.crossBookRate};
    }))).filter(Boolean);
   return json({...result,blockers,alternatives});
  }catch{return err("COVERAGE_UNAVAILABLE",503);}
 }
 try{
  const exists=await stmt(env.DB,"SELECT id FROM books WHERE id=?",plan.summary.bookId).first();
  if(exists)return err("BOOK_ALREADY_EXISTS_USE_VERSIONED_REVISION",409);
  const conflict=await existingWordConflicts(env.DB,checked.validated.words);
  if(conflict)return err("WORD_CARD_ID_CONFLICT",409);
  const all=plan.statements.map(v=>stmt(env.DB,v.sql,...v.params));
  // Both content and anchors, or neither: an FK, duplicate, or malformed
  // request fails atomically without leaving a half-imported sale.
  await env.DB.batch(all);
 }catch(e){
  console.error("OPS_IMPORT_FAILED","transaction");
  return err("NOVEL_DRAFT_IMPORT_CONFLICT",409);
 }
 return json({...plan.summary,created:true,upload:"success",
   nextStep:"check-learning-metadata-and-review-before-publish"},201);
}