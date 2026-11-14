// A4.2 STAGING-ONLY attachment of verified dictionary bindings to an
// already imported, still-DRAFT novel. No changes to old chapter_words,
// user_words, books, purchase entitlements, reader APIs or review events.
import {validatePackage} from './editorial-content.js';
import {previewBindingManifest} from './ops-global-binding-manifests.js';
import {authenticateOperator,hasOpsRole} from './ops-access.js';

const HEAD={'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const out=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:HEAD});
const fail=(error,status=400)=>out({error},status);
const SHA=/^[0-9a-f]{64}$/;
const REQUEST=/^[a-zA-Z0-9_-]{8,100}$/;
const enc=new TextEncoder();
const MAX_BYTES=2_000_000;
const canonical=(chapter)=>({version:1,paragraphs:chapter.paragraphs.map(p=>({
 segments:p.segments.map(seg=>seg.wordId?{
  wordId:seg.wordId,surface:seg.surface,gloss:seg.gloss
 }:{text:seg.text})
}))});
const ordered=arr=>arr.sort((a,b)=>a.chapter_id.localeCompare(b.chapter_id,'en')||
  a.context_anchor.localeCompare(b.context_anchor,'en'));
const unique=rows=>new Set(rows.map(x=>x.chapter_id+'\0'+x.context_anchor)).size===rows.length;
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export async function attachDictionaryBindingsToStagingDraft(env,payload,actor){
 if(env.APP_ENV!=='staging'||
    env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true'||
    env.GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED!=='true'||
    env.GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED!=='true')
  throw Error('GLOBAL_BINDING_ATTACH_DISABLED');
 if(!hasOpsRole(actor,'publisher'))throw Error('OPS_ROLE_FORBIDDEN');
 if(!REQUEST.test(payload?.requestId||'')||
    !SHA.test(payload?.expectedPackageSha256||'')||
    !SHA.test(payload?.expectedBindingSha256||'')||
    payload?.confirmAttach!==true)
  throw Error('INVALID_BINDING_ATTACH_CONFIRMATION');
 const source=payload.package;
 const valid=validatePackage(source);
 const old=await env.DB.prepare('SELECT request_id,book_id,category_id,'+
   'package_sha256,binding_sha256,bindings_json,total_occurrences,actor_id,status '+
   'FROM global_dictionary_binding_manifests WHERE request_id=?')
   .bind(payload.requestId).first();
 if(!old||old.status!=='candidate')throw Error('BINDING_CANDIDATE_NOT_FOUND');
 if(old.actor_id!==actor.id)throw Error('BINDING_ACTOR_MISMATCH');
 const now=await previewBindingManifest(env,{package:source,
   decisions:payload.decisions??[]});
 if(!now.ready_to_stage)throw Error('BINDING_REVIEW_REQUIRED');
 if(old.book_id!==valid.book.id||old.category_id!==valid.book.category||
    old.package_sha256!==now.package_sha256||
    old.binding_sha256!==now.binding_sha256||
    old.total_occurrences!==now.total_targets||
    now.package_sha256!==payload.expectedPackageSha256||
    now.binding_sha256!==payload.expectedBindingSha256)
  throw Error('STALE_BINDING_PREVIEW');
 let priorBindings;
 try{priorBindings=JSON.parse(old.bindings_json)}catch{throw Error('BINDING_STORED_MANIFEST_CORRUPTED')}
 if(!eq(priorBindings,now.manifest.bindings))
  throw Error('BINDING_STORED_MANIFEST_CORRUPTED');
 const book=await env.DB.prepare('SELECT id,category_id,title,description,status '+
   'FROM books WHERE id=?').bind(valid.book.id).first();
 if(!book)throw Error('IMPORT_BOOK_DRAFT_FIRST');
 if(book.status!=='draft')throw Error('BINDING_ATTACH_REQUIRES_DRAFT');
 if(book.category_id!==valid.book.category||
    book.title!==valid.book.title||
    book.description!==(valid.book.description||''))
  throw Error('UPLOADED_NOVEL_METADATA_DRIFT');
 const chapters=await env.DB.prepare('SELECT id,chapter_no,title,content_json,is_preview '+
   'FROM chapters WHERE book_id=? ORDER BY chapter_no')
   .bind(valid.book.id).all();
 if((chapters.results||[]).length!==valid.chapters.length)
  throw Error('UPLOADED_NOVEL_CHAPTER_COUNT_DRIFT');
 const byNo=new Map();
 for(const row of chapters.results||[]){
  if(byNo.has(row.chapter_no))throw Error('UPLOADED_NOVEL_CHAPTER_DUPLICATE');
  byNo.set(row.chapter_no,row);
 }
 const attach=[];
 for(const chapter of valid.chapters){
  const row=byNo.get(chapter.number);
  if(!row||row.id!==chapter.id||row.title!==chapter.title||
     Number(row.is_preview)!==(chapter.preview?1:0))
    throw Error('UPLOADED_NOVEL_CHAPTER_DRIFT');
  let present;
  try{present=JSON.parse(row.content_json)}catch{throw Error('UPLOADED_NOVEL_CONTENT_INVALID')}
  if(!eq(present,canonical(chapter)))throw Error('UPLOADED_NOVEL_CONTENT_DRIFT');
  const originalAnchors=[];
  for(const [pi,paragraph] of chapter.paragraphs.entries()){
   for(const [si,seg] of paragraph.segments.entries()){
    if(seg.wordId)originalAnchors.push({
      chapter_id:chapter.id,context_anchor:'p'+pi+':s'+si,
      legacy_word_id:seg.wordId
    });
   }
  }
  const indexed=await env.DB.prepare('SELECT word_id,context_anchor '+
    'FROM chapter_words WHERE chapter_id=?').bind(chapter.id).all();
  if((indexed.results||[]).length!==originalAnchors.length)
    throw Error('UPLOADED_NOVEL_WORD_ANCHOR_COUNT_DRIFT');
  const expected=new Map(originalAnchors.map(x=>[x.context_anchor,x.legacy_word_id]));
  for(const one of indexed.results||[]){
    if(expected.get(one.context_anchor)!==one.word_id)
      throw Error('UPLOADED_NOVEL_WORD_ANCHOR_DRIFT');
    expected.delete(one.context_anchor);
  }
  if(expected.size)throw Error('UPLOADED_NOVEL_WORD_ANCHOR_DRIFT');
 }
 for(const binding of now.manifest.bindings){
  const row=byNo.get(binding.chapter_number);
  if(!row)throw Error('UPLOADED_NOVEL_CHAPTER_DRIFT');
  attach.push({
    chapter_id:row.id,book_id:valid.book.id,
    context_anchor:'p'+binding.paragraph_index+':s'+binding.segment_index,
    legacy_word_id:binding.legacy_word_id,entry_id:binding.entry_id,
    source_request_id:old.request_id,actor_id:actor.id
  });
 }
 if(attach.length!==now.total_targets||!unique(attach))
  throw Error('DUPLICATE_OR_MISSING_DICTIONARY_BINDING');
 ordered(attach);
 const prior=await env.DB.prepare('SELECT chapter_id,context_anchor,'+
   'legacy_word_id,entry_id,source_request_id '+
   'FROM global_dictionary_book_bindings WHERE book_id=?')
   .bind(valid.book.id).all();
 if((prior.results||[]).length){
  const current=ordered((prior.results||[]).map(x=>({
   chapter_id:x.chapter_id,context_anchor:x.context_anchor,
   legacy_word_id:x.legacy_word_id,entry_id:x.entry_id,
   source_request_id:x.source_request_id
  })));
  const wanted=attach.map(x=>({
   chapter_id:x.chapter_id,context_anchor:x.context_anchor,
   legacy_word_id:x.legacy_word_id,entry_id:x.entry_id,
   source_request_id:x.source_request_id
  }));
  if(!eq(current,wanted))throw Error('DICTIONARY_BOOK_BINDING_CONFLICT');
  return {attached:true,idempotent:true,status:'draft-only',
    bookId:valid.book.id,bindings:attach.length,published:false,
    readerSwitched:false,userDataChanged:false};
 }
 // One atomic D1.batch even for a long novel: at most 14 rows x 7
 // parameters per INSERT, staying under D1's 100-parameter limit.
 // Existing chapter_words and all customer tables remain untouched.
 const insertStatements=[];
 for(let i=0;i<attach.length;i+=14){
   const portion=attach.slice(i,i+14);
   insertStatements.push(env.DB.prepare(
     'INSERT INTO global_dictionary_book_bindings '+
     '(book_id,chapter_id,context_anchor,legacy_word_id,entry_id,'+
     'source_request_id,actor_id) VALUES '+
      portion.map(()=>'(?,?,?,?,?,?,?)').join(',')
   ).bind(...portion.flatMap(one=>[
     one.book_id,one.chapter_id,one.context_anchor,one.legacy_word_id,
     one.entry_id,one.source_request_id,one.actor_id
   ])));
 }
 if(insertStatements.length>800)throw Error('ATTACH_STATEMENT_LIMIT');
 try{await env.DB.batch(insertStatements)}
 catch{throw Error('DICTIONARY_BINDING_ATTACHMENT_FAILED')}
 return {attached:true,idempotent:false,status:'draft-only',
   bookId:valid.book.id,bindings:attach.length,published:false,
   readerSwitched:false,userDataChanged:false};
}


export async function handleOpsDictionaryAttach(req,env,path){
 if(path!=='/api/ops/import/bindings/attach'||req.method!=='POST'||
    env.APP_ENV!=='staging')return fail('NOT_FOUND',404);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,'publisher'))return fail('OPS_ROLE_FORBIDDEN',403);
 if(env.GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED!=='true')
   return fail('GLOBAL_BINDING_ATTACH_DISABLED',403);
 let payload;
 try{
   if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))
     return fail('INVALID_CONTENT_TYPE',400);
   if(Number(req.headers.get('content-length')||0)>MAX_BYTES)
     return fail('PACKAGE_TOO_LARGE',413);
   const raw=await req.text();
   if(enc.encode(raw).length>MAX_BYTES)return fail('PACKAGE_TOO_LARGE',413);
   payload=JSON.parse(raw);
   if(!payload||typeof payload!=='object'||Array.isArray(payload))
     return fail('INVALID_JSON',400);
 }catch{return fail('INVALID_JSON',400)}
 try{
  return out(await attachDictionaryBindingsToStagingDraft(env,payload,auth.operator));
 }catch(e){
  const code=String(e?.message||'');
  if(code.startsWith('Content validation:')||/^INVALID_|^DECISION_/.test(code))
    return fail('INVALID_BINDING_ATTACH_INPUT',400);
  if(code==='OPS_ROLE_FORBIDDEN'||code==='GLOBAL_BINDING_ATTACH_DISABLED')
    return fail(code,403);
  if(code==='GLOBAL_DICTIONARY_INDEX_NOT_ENABLED'||
     code==='GLOBAL_DICTIONARY_INDEX_NOT_READY'||
     code==='DICTIONARY_SCHEMA_REQUIRED')
    return fail(code,503);
  if(['BINDING_CANDIDATE_NOT_FOUND','BINDING_ACTOR_MISMATCH',
      'BINDING_REVIEW_REQUIRED','STALE_BINDING_PREVIEW',
      'BINDING_STORED_MANIFEST_CORRUPTED','IMPORT_BOOK_DRAFT_FIRST',
      'BINDING_ATTACH_REQUIRES_DRAFT','UPLOADED_NOVEL_METADATA_DRIFT',
      'UPLOADED_NOVEL_CHAPTER_COUNT_DRIFT',
      'UPLOADED_NOVEL_CHAPTER_DUPLICATE','UPLOADED_NOVEL_CHAPTER_DRIFT',
      'UPLOADED_NOVEL_CONTENT_INVALID','UPLOADED_NOVEL_CONTENT_DRIFT',
      'UPLOADED_NOVEL_WORD_ANCHOR_COUNT_DRIFT',
      'UPLOADED_NOVEL_WORD_ANCHOR_DRIFT',
      'DUPLICATE_OR_MISSING_DICTIONARY_BINDING',
      'DICTIONARY_BOOK_BINDING_CONFLICT'].includes(code))
    return fail(code,409);
  console.error('OPS_DICTIONARY_DRAFT_ATTACH_FAILED');
  return fail('DICTIONARY_DRAFT_ATTACH_UNAVAILABLE',503);
 }
}
