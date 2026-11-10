// A3.2: fingerprinted, isolated staging-only binding candidates.
// Never import a book or alter existing reader/customer/word tables.
import {validatePackage} from './editorial-content.js';
import {inspectStagingNovelMatch} from './ops-import-preflight.js';
import {authenticateOperator,hasOpsRole} from './ops-access.js';
import {auditDictionaryLesson} from './global-dictionary-novel-v2.js';

const HEAD={'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const out=(v,code=200)=>new Response(JSON.stringify(v),{status:code,headers:HEAD});
const bad=(error,code=400)=>out({error},code);
const HEX=/^[0-9a-f]{64}$/;
const REQUEST=/^[a-zA-Z0-9_-]{8,100}$/;
const MAX_BYTES=2_000_000;
const encoder=new TextEncoder();
const hash=async value=>{
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
};

export async function previewBindingManifest(env,payload){
  if(env.APP_ENV!=='staging'||env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
    throw Error('GLOBAL_DICTIONARY_INDEX_NOT_ENABLED');
  const source=payload?.package??payload;
  // This is a real input package validation, stronger than freeform token
  // discovery. No partial, undeclared word IDs or invalid chapters accepted.
  const valid=validatePackage(source);
  if(valid.mentionCount===0||valid.mentionCount>10000)
    throw Error('INVALID_DICTIONARY_BINDING_COUNT');
  const inspected=await inspectStagingNovelMatch(env,{
    package:source,decisions:payload?.decisions??[]
  });
  if(!inspected.dictionary_index_ready)throw Error('GLOBAL_DICTIONARY_INDEX_NOT_READY');
  const plan=inspected.binding_proposal;
  if(plan.total_target_occurrences!==valid.mentionCount)
    throw Error('DICTIONARY_BINDING_TARGET_DRIFT');
  const resolved=plan.resolved.map(item=>({
    chapter_number:item.chapter_number,
    paragraph_index:item.paragraph_index,
    segment_index:item.segment_index,
    legacy_word_id:item.legacy_word_id,
    entry_id:item.entry_id,
    normalized_surface:item.normalized_surface,
    resolution:item.resolution
  })).sort((a,b)=>a.chapter_number-b.chapter_number||
    a.paragraph_index-b.paragraph_index||a.segment_index-b.segment_index);
  // A publishing candidate must be supported by actual, independently
  // signed-off *teaching material*, not merely a source record with a
  // boolean teaching_ready flag. The author's per-sentence gloss must
  // match one of that reviewed card's explicit Chinese senses.
  // A guessed headword, raw ECDICT definition, or source licence flag alone
  // can NEVER authorize a book-to-card association.
  const gateFailures=[];
  const lessonInfo=await env.DB.prepare(
    'PRAGMA table_info(global_dictionary_lessons)').all();
  if(!Array.isArray(lessonInfo.results)||!lessonInfo.results.length)
    throw Error('GLOBAL_LESSON_SCHEMA_REQUIRED');
  const approvedLessons=new Map();
  const uniqueIds=[...new Set(resolved.map(x=>x.entry_id))];
  for(let i=0;i<uniqueIds.length;i+=45){
    const batch=uniqueIds.slice(i,i+45);
    const rs=await env.DB.prepare(
      'SELECT entry_id,headword,senses_json,phonetic_uk,phonetic_us,'+
      'part_of_speech,meaning_zh,example_en,example_zh,collocations_json,'+
      'reviewed_by,reviewed_at FROM global_dictionary_lessons WHERE entry_id IN ('+
      batch.map(()=>'?').join(',')+')'
    ).bind(...batch).all();
    for(const row of rs.results||[]){
      if(approvedLessons.has(row.entry_id))
        throw Error('DUPLICATE_GLOBAL_DICTIONARY_LESSON');
      approvedLessons.set(row.entry_id,auditDictionaryLesson(row));
    }
  }
  const cleanGloss=s=>String(s||'').normalize('NFKC').replace(/\s+/gu,'').trim();
  for(const binding of plan.resolved){
    const checked=approvedLessons.get(binding.entry_id);
    const content=valid.chapters.find(c=>c.number===binding.chapter_number)
      ?.paragraphs?.[binding.paragraph_index]
      ?.segments?.[binding.segment_index];
    if(!checked?.valid||checked.lesson.headword!==binding.headword){
      gateFailures.push({chapter_number:binding.chapter_number,
        paragraph_index:binding.paragraph_index,
        segment_index:binding.segment_index,surface:binding.surface,
        reason:'REVIEWED_DICTIONARY_LESSON_MISSING_OR_INVALID'});
      continue;
    }
    const gloss=cleanGloss(content?.gloss);
    if(!gloss||!checked.senses.some(sense=>
      cleanGloss(sense.meaningZh)===gloss)){
      gateFailures.push({chapter_number:binding.chapter_number,
        paragraph_index:binding.paragraph_index,
        segment_index:binding.segment_index,surface:binding.surface,
        reason:'CONTEXT_GLOSS_NOT_IN_REVIEWED_DICTIONARY_SENSES'});
    }
  }
  const manifest={
    version:1,book_id:valid.book.id,category_id:valid.book.category,
    target_count:plan.total_target_occurrences,bindings:resolved
  };
  // Bound to the exact submitted content, exact selected canonical targets,
  // and the server-side review state at preview time. Neither hash is an
  // assertion that the actual novel has been published.
  const packageSha256=await hash(source);
  const bindingSha256=await hash(manifest);
  return {
    status:'READ_ONLY_STAGING_BINDING_MANIFEST_PREVIEW',
    book_id:valid.book.id,category_id:valid.book.category,
    package_sha256:packageSha256,binding_sha256:bindingSha256,
    approved_count:resolved.length,total_targets:plan.total_target_occurrences,
    blockers:[...plan.review_queue.map(x=>({
      chapter_number:x.chapter_number,paragraph_index:x.paragraph_index,
      segment_index:x.segment_index,surface:x.surface,reason:x.reason
    })),...gateFailures],
    ready_to_stage:plan.review_required_occurrences===0&&gateFailures.length===0&&
      resolved.length>0&&resolved.length===valid.mentionCount,
    save_available:env.GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED==='true',
    attach_available:env.GLOBAL_DICTIONARY_BINDING_ATTACH_ENABLED==='true',
    manifest
  };
}

export async function saveStagingBindingManifest(env,payload,actor){
  if(env.APP_ENV!=='staging'||env.GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED!=='true'||
     env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
    throw Error('GLOBAL_BINDING_SAVE_DISABLED');
  if(!hasOpsRole(actor,'publisher'))throw Error('OPS_ROLE_FORBIDDEN');
  const requestId=payload?.requestId;
  if(!REQUEST.test(requestId||'')||
    !HEX.test(payload?.expectedPackageSha256||'')||
    !HEX.test(payload?.expectedBindingSha256||'')||
    payload?.confirmSave!==true)
    throw Error('INVALID_BINDING_CONFIRMATION');
  const result=await previewBindingManifest(env,payload);
  if(!result.ready_to_stage)throw Error('BINDING_REVIEW_REQUIRED');
  if(result.package_sha256!==payload.expectedPackageSha256||
     result.binding_sha256!==payload.expectedBindingSha256)
    throw Error('STALE_BINDING_PREVIEW');
  // Separate from old /api/ops/import's novel publication: this only stores
  // an immutable preview manifest with unaltered legacy word IDs.
  const table=await env.DB.prepare(
    'PRAGMA table_info(global_dictionary_binding_manifests)').all();
  if(!Array.isArray(table.results)||!table.results.length)
    throw Error('GLOBAL_BINDING_SCHEMA_REQUIRED');
  const old=await env.DB.prepare('SELECT request_id,book_id,package_sha256,'+
    'binding_sha256 FROM global_dictionary_binding_manifests WHERE request_id=?')
    .bind(requestId).first();
  if(old){
    if(old.book_id!==result.book_id||old.package_sha256!==result.package_sha256||
       old.binding_sha256!==result.binding_sha256)
      throw Error('BINDING_REQUEST_ID_CONFLICT');
    return {stored:true,idempotent:true,requestId,bookId:result.book_id,
      status:'candidate',published:false,userDataChanged:false};
  }
  // New-book only. An existing book requires the separately approved versioned
  // revision flow; do not reuse this stage-only snapshot to bypass HTTP409.
  const book=await env.DB.prepare('SELECT id FROM books WHERE id=?')
    .bind(result.book_id).first();
  if(book)throw Error('EXISTING_BOOK_REQUIRES_VERSIONED_REVISION');
  // Two strong identifiers plus a per-request unique key. All writes remain
  // in this additive sidecar table; no orders, histories or novel rows.
  try{
    await env.DB.prepare(
      'INSERT INTO global_dictionary_binding_manifests '+
      '(request_id,book_id,category_id,package_sha256,binding_sha256,'+
      'bindings_json,total_occurrences,actor_id,status) '+
      "VALUES(?,?,?,?,?,?,?,?,'candidate')"
    ).bind(requestId,result.book_id,result.category_id,result.package_sha256,
      result.binding_sha256,JSON.stringify(result.manifest.bindings),
      result.total_targets,actor.id).run();
  }catch{throw Error('BINDING_MANIFEST_CONFLICT')}
  return {stored:true,idempotent:false,requestId,bookId:result.book_id,
    status:'candidate',published:false,userDataChanged:false,
    packageSha256:result.package_sha256,bindingSha256:result.binding_sha256,
    count:result.total_targets};
}


// A4.1: export only a VERIFIED, previously saved, content-addressed sidecar.
// The original publication import remains unchanged until its versioned
// transaction and user migration controls are independently validated.
export async function exportVerifiedBindingBundle(env,payload,actor){
  if(env.APP_ENV!=='staging'||env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true'||
     env.GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED!=='true')
    throw Error('GLOBAL_BINDING_EXPORT_DISABLED');
  if(!hasOpsRole(actor,'publisher'))throw Error('OPS_ROLE_FORBIDDEN');
  if(!REQUEST.test(payload?.requestId||'')||
     !HEX.test(payload?.expectedPackageSha256||'')||
     !HEX.test(payload?.expectedBindingSha256||''))
    throw Error('INVALID_BINDING_EXPORT');
  const prior=await env.DB.prepare(
    'SELECT request_id,book_id,category_id,package_sha256,binding_sha256,'+
    'bindings_json,total_occurrences,actor_id,status '+
    'FROM global_dictionary_binding_manifests WHERE request_id=?'
  ).bind(payload.requestId).first();
  if(!prior||prior.status!=='candidate')throw Error('BINDING_CANDIDATE_NOT_FOUND');
  if(prior.actor_id!==actor.id)throw Error('BINDING_ACTOR_MISMATCH');
  // Safe for the first version only: currently published books must use the
  // existing revision API, never this new-book candidate pathway.
  const exists=await env.DB.prepare('SELECT id FROM books WHERE id=?')
    .bind(prior.book_id).first();
  if(exists)throw Error('EXISTING_BOOK_REQUIRES_VERSIONED_REVISION');
  const fresh=await previewBindingManifest(env,payload);
  if(!fresh.ready_to_stage)throw Error('BINDING_REVIEW_REQUIRED');
  if(fresh.book_id!==prior.book_id||fresh.category_id!==prior.category_id||
     fresh.total_targets!==prior.total_occurrences||
     fresh.package_sha256!==prior.package_sha256||
     fresh.binding_sha256!==prior.binding_sha256||
     fresh.package_sha256!==payload.expectedPackageSha256||
     fresh.binding_sha256!==payload.expectedBindingSha256)
    throw Error('STALE_BINDING_PREVIEW');
  // The stored JSON is never authoritative. Compare the entire canonical
  // manifest rather than trusting a matching, potentially compromised hash.
  let oldBindings;
  try{oldBindings=JSON.parse(prior.bindings_json)}catch{
    throw Error('BINDING_STORED_MANIFEST_CORRUPTED');
  }
  if(JSON.stringify(oldBindings)!==JSON.stringify(fresh.manifest.bindings))
    throw Error('BINDING_STORED_MANIFEST_CORRUPTED');
  const source=payload.package??payload;
  const envelope={
    format:'miaowu-global-dictionary-binding-bundle-v1',
    status:'STAGING_VERIFIED_NOT_IMPORTED',
    request_id:prior.request_id,
    package_sha256:prior.package_sha256,
    binding_sha256:prior.binding_sha256,
    book_id:prior.book_id,category_id:prior.category_id,
    original_package:source,
    dictionary_bindings:fresh.manifest.bindings,
    publication_ready:false,
    next_step:'Versioned import adapter must check both hashes again before attaching bindings. This bundle must not bypass the existing chapter/word data protections.'
  };
  return envelope;
}

export async function handleOpsBindingManifest(req,env,path){
  const preview=path==='/api/ops/import/bindings/preview';
  const confirm=path==='/api/ops/import/bindings/confirm';
  const exportBundle=path==='/api/ops/import/bindings/export';
  if(!(preview||confirm||exportBundle)||req.method!=='POST'||env.APP_ENV!=='staging')
    return bad('NOT_FOUND',404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,'publisher'))return bad('OPS_ROLE_FORBIDDEN',403);
  if((confirm||exportBundle)&&env.GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED!=='true')
    return bad('GLOBAL_BINDING_SAVE_DISABLED',403);
  let payload;
  try{
    if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))
      return bad('INVALID_CONTENT_TYPE',400);
    if(Number(req.headers.get('content-length')||0)>MAX_BYTES)
      return bad('PACKAGE_TOO_LARGE',413);
    const raw=await req.text();
    if(encoder.encode(raw).length>MAX_BYTES)return bad('PACKAGE_TOO_LARGE',413);
    payload=JSON.parse(raw);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))
      return bad('INVALID_JSON',400);
  }catch{return bad('INVALID_JSON',400)}
  try{
    if(preview)return out(await previewBindingManifest(env,payload));
    if(exportBundle)return out(await exportVerifiedBindingBundle(env,payload,auth.operator));
    return out(await saveStagingBindingManifest(env,payload,auth.operator),201);
  }catch(e){
    const name=String(e?.message||'');
    if(name.startsWith('Content validation:')||/^INVALID_(?:NOVEL|DICTIONARY|BINDING|MATCH)|^DECISION_/.test(name))
      return bad('INVALID_BINDING_INPUT',400);
    if(name==='GLOBAL_DICTIONARY_INDEX_NOT_ENABLED'||
       name==='GLOBAL_DICTIONARY_INDEX_NOT_READY'||
       name==='GLOBAL_BINDING_SCHEMA_REQUIRED'||
       name==='GLOBAL_LESSON_SCHEMA_REQUIRED')
      return bad(name,503);
    if(name==='GLOBAL_BINDING_SAVE_DISABLED'||name==='GLOBAL_BINDING_EXPORT_DISABLED'||
       name==='OPS_ROLE_FORBIDDEN')
      return bad(name,403);
    if(['BINDING_REVIEW_REQUIRED','STALE_BINDING_PREVIEW',
      'BINDING_REQUEST_ID_CONFLICT','EXISTING_BOOK_REQUIRES_VERSIONED_REVISION',
      'BINDING_MANIFEST_CONFLICT','BINDING_CANDIDATE_NOT_FOUND',
      'BINDING_ACTOR_MISMATCH','BINDING_STORED_MANIFEST_CORRUPTED'].includes(name))return bad(name,409);
    console.error('OPS_BINDING_MANIFEST_SAVE_FAILED');
    return bad('BINDING_MANIFEST_UNAVAILABLE',503);
  }
}
