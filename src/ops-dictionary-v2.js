// A4.3 authorized staging-only conversion of V2 novels (no words[]).
// Only dictionary records returned by D1 are trusted, never client-submitted
// dictionary cards or client-submitted "reviewed" flags.
import {authenticateOperator,hasOpsRole} from './ops-access.js';
import {globalDictionaryTablesReady,loadGlobalDictionaryCandidateIndex}
  from './global-dictionary-db.js';
import {normalizeDictionaryNovelV2,convertDictionaryNovelV2}
  from './global-dictionary-novel-v2.js';
import {planApprovedNovelSenseAnchors} from './global-dictionary-sense-anchor.js';
import {extractUnmarkedV2EnglishTokens,planApprovedNovelAutoDiscovery}
 from './global-dictionary-auto-discovery.js';
import {inspectStagingUnmarkedEditorWorkflow}
 from './global-dictionary-unmarked-editor-ops.js';

const H={'content-type':'application/json; charset=utf-8',
 'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const MAX_BYTES=2_000_000;
const groups=(a,n=45)=>{const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out};
export async function inspectStagingDictionaryNovelV2(env,payload){
 if(env.APP_ENV!=='staging'||env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
  throw Error('DICTIONARY_V2_NOT_ENABLED');
 if(!(await globalDictionaryTablesReady(env.DB)))
  throw Error('DICTIONARY_SCHEMA_REQUIRED');
 const source=payload?.package??payload;
 const parsed=normalizeDictionaryNovelV2(source);
 const words=[...new Set(parsed.unique_surfaces)];
 const lookup=await loadGlobalDictionaryCandidateIndex(env.DB,words);
 const ids=[...new Set([
  ...lookup.index.byWord.values(),
 ].flat().map(x=>x.entry_id))];
 const cardRows=new Map();
 for(const group of groups(ids)){
  if(!group.length)continue;
  const results=await env.DB.prepare(
   'SELECT entry_id,headword,senses_json,phonetic_uk,phonetic_us,'+
   'part_of_speech,meaning_zh,example_en,example_zh,collocations_json,'+
   'reviewed_by,reviewed_at FROM global_dictionary_lessons WHERE entry_id IN ('+
   group.map(()=>'?').join(',')+')'
  ).bind(...group).all();
  for(const row of results.results||[]){
   if(cardRows.has(row.entry_id))throw Error('DUPLICATE_DICTIONARY_LESSON_ID');
   cardRows.set(row.entry_id,row);
  }
 }
 const converted=convertDictionaryNovelV2(source,lookup.index,cardRows,{
  decisions:payload?.decisions??[]
 });
 // 018 is optional until separately backed-up STAGING migration. Fail
 // closed for actual sense-level study if the table is missing or unreviewed.
 const table=await env.DB.prepare('PRAGMA table_info(global_dictionary_senses)').all();
 const senses=[];
 if((table.results||[]).length&&converted.resolved.length){
  const ids=[...new Set(converted.resolved.map(x=>x.entry_id))];
  for(const group of groups(ids)){
   const rows=await env.DB.prepare(
    'SELECT sense_id,entry_id,pos,meaning_zh,reviewed_by,reviewed_at,approved,active '+
    'FROM global_dictionary_senses WHERE entry_id IN ('+
    group.map(()=>'?').join(',')+')'
   ).bind(...group).all();
   senses.push(...(rows.results||[]));
  }
 }
 const senseAudit=planApprovedNovelSenseAnchors(converted.resolved,{
  lessons:cardRows,senses
 });
 return {...converted,dictionary_index_status:'STAGING_GLOBAL_DICTIONARY_SOURCE_REVIEWED_ONLY',
   available_approved_lessons:cardRows.size,
   sense_preflight:senseAudit,
   ready_for_sense_study:converted.ready_to_convert&&senseAudit.ready_for_sense_study,
   next_step:'V1 package is a compatibility draft. Stable reviewed sense IDs and staging user-state tests are required before publication.'};
}
// Authorized read-only preview of English tokens in V2 stories that do not
// yet contain marked {surface,gloss} targets. No guessed meaning is accepted.
export async function inspectStagingDictionaryAutoDiscovery(env,payload){
 if(env.APP_ENV!=='staging'||env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
  throw Error('DICTIONARY_V2_NOT_ENABLED');
 if(!(await globalDictionaryTablesReady(env.DB)))
  throw Error('DICTIONARY_SCHEMA_REQUIRED');
 const source=payload?.package??payload;
 const extracted=extractUnmarkedV2EnglishTokens(source);
 const lookup=await loadGlobalDictionaryCandidateIndex(
  env.DB,extracted.unique_spellings);
 const ids=[...new Set([...lookup.index.byWord.values()]
  .flat().map(x=>x.entry_id))];
 const lessons=new Map(),senses=[];
 for(const group of groups(ids)){
  if(!group.length)continue;
  const params=group.map(()=>'?').join(',');
  const cards=await env.DB.prepare(
   'SELECT entry_id,headword,senses_json,phonetic_uk,phonetic_us,'+
   'part_of_speech,meaning_zh,example_en,example_zh,collocations_json,'+
   'reviewed_by,reviewed_at FROM global_dictionary_lessons WHERE entry_id IN ('+
   params+')'
  ).bind(...group).all();
  for(const card of cards.results||[]){
   if(lessons.has(card.entry_id))throw Error('DUPLICATE_REVIEWED_DICTIONARY_LESSON');
   lessons.set(card.entry_id,card);
  }
  const reviewed=await env.DB.prepare(
   'SELECT sense_id,entry_id,pos,meaning_zh,reviewed_by,reviewed_at,approved,active '+
   'FROM global_dictionary_senses WHERE entry_id IN ('+params+')'
  ).bind(...group).all();
  senses.push(...(reviewed.results||[]));
 }
 return {...planApprovedNovelAutoDiscovery(extracted,lookup.index,{
  lessons,senses
 }),dictionary_status:'STAGING_APPROVED_SENSES_ONLY',
  next_step:'Editor must confirm each contextual meaning before generating a V2 learning target; this endpoint does not mutate the manuscript or publish.'};
}
export async function handleOpsDictionaryNovelV2(req,env,path){
 if(!['/api/ops/import/dictionary-v2/preflight',
       '/api/ops/import/dictionary-v2/discover',
       '/api/ops/import/dictionary-v2/plan-unmarked',
       '/api/ops/import/dictionary-v2/confirm-unmarked'].includes(path)||
    req.method!=='POST'||env.APP_ENV!=='staging')
   return json({error:'NOT_FOUND'},404);
 const auth=await authenticateOperator(req,env);
 if(auth.response)return auth.response;
 if(!hasOpsRole(auth.operator,'publisher'))
   return json({error:'OPS_ROLE_FORBIDDEN'},403);
 if(env.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
   return json({error:'DICTIONARY_V2_NOT_ENABLED'},503);
 let payload;
 try{
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))
   return json({error:'INVALID_CONTENT_TYPE'},400);
  if(Number(req.headers.get('content-length')||0)>MAX_BYTES)
   return json({error:'PACKAGE_TOO_LARGE'},413);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>MAX_BYTES)
   return json({error:'PACKAGE_TOO_LARGE'},413);
  payload=JSON.parse(raw);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
   return json({error:'INVALID_NOVEL_PACKAGE'},400);
 }catch{return json({error:'INVALID_JSON'},400)}
 try{
  if(path.endsWith('/plan-unmarked')||path.endsWith('/confirm-unmarked'))
    return json(await inspectStagingUnmarkedEditorWorkflow(env,payload,{
      confirm:path.endsWith('/confirm-unmarked')}));
  return json(path.endsWith('/discover')?
    await inspectStagingDictionaryAutoDiscovery(env,payload):
    await inspectStagingDictionaryNovelV2(env,payload));
 }catch(e){
  const code=String(e?.message||'');
  if(code.startsWith('Content validation:')||
     /^(INVALID_DICTIONARY_V2|V2_|DICTIONARY_V2_|DUPLICATE_DICTIONARY_V2|INVALID_AUTO_DISCOVERY|AUTO_DISCOVERY_)/.test(code) &&
       code!=='DICTIONARY_V2_NOT_ENABLED')
   return json({error:'INVALID_DICTIONARY_V2_PACKAGE',detail:code.slice(0,180)},400);
  if(code==='STALE_NOVEL_OR_APPROVED_DICTIONARY_REVIEW'||
     code==='EDITOR_CONTEXT_STABLE_SENSE_REVIEW_REQUIRED'||
     code==='EDITOR_CONTEXT_V2_CONVERSION_NOT_READY')
   return json({error:code},409);
  if(/^(INVALID_EDITOR_|DUPLICATE_EDITOR_|UNREVIEWED_|EDITOR_TOKEN_|V2_WORDS_ARRAY_FORBIDDEN)/u.test(code))
   return json({error:code},400);
  if(code==='DICTIONARY_SCHEMA_REQUIRED'||code==='DICTIONARY_V2_NOT_ENABLED'||
     code==='REVIEWED_SENSE_SCHEMA_REQUIRED')
   return json({error:code},503);
  console.error('OPS_DICTIONARY_V2_PREFLIGHT_FAILED');
  return json({error:'DICTIONARY_V2_PREFLIGHT_UNAVAILABLE'},503);
 }
}
