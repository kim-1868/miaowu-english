// Publisher-authenticated, STAGING-ONLY read-only matcher preview.
// Until the separately curated global-dictionary index ships, this consults
// the existing "words" table only and never declares a book publishable.
import {authenticateOperator,hasOpsRole} from './ops-access.js';
import {buildGlobalDictionaryIndex,preflightNovelDictionaryMatches}
  from './global-dictionary-matcher.js';
import {globalDictionaryTablesReady,loadGlobalDictionaryCandidateIndex}
  from './global-dictionary-db.js';
import {planNovelDictionaryBindings} from './global-dictionary-bindings.js';

const H={'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:H});
const failure=(code,status)=>json({error:code},status);
const MAX_BYTES=2_000_000;

export async function inspectStagingNovelMatch(env,input){
  const empty=buildGlobalDictionaryIndex();
  // A first parse performs the same bounded, read-only token discovery as
  // final matching. Do not trust the submitted word IDs or "reviewed" values.
  const scan=preflightNovelDictionaryMatches(input,empty);
  const keys=[...new Set([...scan.targets,...scan.discovered]
    .map(item=>item.normalized_surface))];
  if(keys.length>1500)throw Error('PREFLIGHT_TOO_MANY_DISTINCT_WORDS');
  if(env.GLOBAL_DICTIONARY_LOOKUP_ENABLED==='true'){
    if(!(await globalDictionaryTablesReady(env.DB)))
      throw Error('DICTIONARY_SCHEMA_REQUIRED');
    const sourced=await loadGlobalDictionaryCandidateIndex(env.DB,keys);
    const analysis=preflightNovelDictionaryMatches(input,sourced.index);
    return {...analysis,
      binding_proposal:planNovelDictionaryBindings(input,sourced.index),
      dictionary_status:'GLOBAL_DICTIONARY_STAGING_DRAFT',
      dictionary_index_ready:true,
      source_names:sourced.sourceNames,
      source_approved_count:sourced.approvedSourceCount,
      ready_to_publish:false,release_blocked:true,
      matched_source:'Dedicated global dictionary index with source-aware approval gates',
      next_step:'Review source licensing, glossary teaching material, and all ambiguous forms before enabling automated link commits.'
    };
  }
  const dictionary=[];
  for(let i=0;i<keys.length;i+=50){
    const group=keys.slice(i,i+50);
    const rs=await env.DB.prepare(
      'SELECT id AS entry_id,headword,phonetic_uk,phonetic_us,part_of_speech,'+
      'meaning_zh,example_en,example_zh FROM words '+
      'WHERE LOWER(TRIM(headword)) IN ('+group.map(()=>'?').join(',')+') '+
      'ORDER BY headword,id'
    ).bind(...group).all();
    for(const w of rs.results||[]){
      // Even fully populated legacy cards have not been independently
      // reviewed against the NEW one-word-one-card dictionary standard.
      // Do not claim commercial teaching readiness based on field presence.
      dictionary.push({entry_id:w.entry_id,headword:w.headword,
        teaching_ready:false,source:'legacy_words_unverified'});
    }
  }
  const index=buildGlobalDictionaryIndex({entries:dictionary,forms:[]});
  const analysis=preflightNovelDictionaryMatches(input,index);
  return {
    ...analysis,
    binding_proposal:planNovelDictionaryBindings(input,index),
    dictionary_status:'LEGACY_WORD_TABLE_ONLY_NOT_GLOBAL_INDEX',
    dictionary_index_ready:false,ready_to_publish:false,
    matched_source:'Existing words table; exact normalized spelling only',
    next_step:'Build legally sourced reviewed global entries and morphology index; then enable confirmed-match workflow.',
    release_blocked:true
  };
}

export async function handleOpsImportPreflight(req,env,path){
  if(path!=='/api/ops/import/preflight'||req.method!=='POST')
    return failure('NOT_FOUND',404);
  if(env.APP_ENV!=='staging')return failure('NOT_FOUND',404);
  const auth=await authenticateOperator(req,env);
  if(auth.response)return auth.response;
  if(!hasOpsRole(auth.operator,'publisher'))return failure('OPS_ROLE_FORBIDDEN',403);
  if(!env.DB)return failure('OPS_NOT_CONFIGURED',503);
  let payload;
  try{
    if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))
      return failure('INVALID_CONTENT_TYPE',400);
    if(Number(req.headers.get('content-length')||0)>MAX_BYTES)
      return failure('PACKAGE_TOO_LARGE',413);
    const body=await req.text();
    if(new TextEncoder().encode(body).length>MAX_BYTES)
      return failure('PACKAGE_TOO_LARGE',413);
    payload=JSON.parse(body);
    if(payload===null||typeof payload!=='object'||Array.isArray(payload))
      return failure('INVALID_NOVEL_PACKAGE',400);
  }catch{return failure('INVALID_JSON',400)}
  try{
    return json(await inspectStagingNovelMatch(env,payload));
  }catch(err){
    const code=String(err?.message||'');
    if(code==='DICTIONARY_SCHEMA_REQUIRED')return failure(code,503);
    if(/^INVALID_NOVEL_|MATCH_SCAN_|MATCH_UNIQUE_|PREFLIGHT_TOO_MANY/.test(code))
      return failure(code,400);
    console.error('OPS_LEXICON_PREFLIGHT_FAILED');
    return failure('DICTIONARY_PREFLIGHT_UNAVAILABLE',503);
  }
}
