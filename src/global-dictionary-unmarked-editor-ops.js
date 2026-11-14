// STAGING-ONLY, Publisher-authenticated *caller* may use this read-only
// D1-backed review helper. The handler, not the submitted payload, must
// authenticate the operator. This function never writes to D1 or publishes.
import {globalDictionaryTablesReady,loadGlobalDictionaryCandidateIndex}
  from './global-dictionary-db.js';
import {extractUnmarkedV2EnglishTokens}
  from './global-dictionary-auto-discovery.js';
import {previewUnmarkedEditorTargets,materializeEditorConfirmedUnmarkedV2}
  from './global-dictionary-unmarked-editor-confirm.js';

const group=(xs,n=45)=>{const out=[];for(let i=0;i<xs.length;i+=n)out.push(xs.slice(i,i+n));return out};

export async function inspectStagingUnmarkedEditorWorkflow(env,payload,{confirm=false}={}){
  if(env?.APP_ENV!=='staging'||env?.GLOBAL_DICTIONARY_LOOKUP_ENABLED!=='true')
    throw Error('DICTIONARY_V2_NOT_ENABLED');
  if(!env.DB||!(await globalDictionaryTablesReady(env.DB)))
    throw Error('DICTIONARY_SCHEMA_REQUIRED');
  const manuscript=payload?.package??payload;
  const extracted=extractUnmarkedV2EnglishTokens(manuscript);
  // Only server-read candidate rows are trusted. A user-provided index,
  // senses, lesson or approval flag never overrides this lookup.
  const {index}=await loadGlobalDictionaryCandidateIndex(
    env.DB,extracted.unique_spellings);
  const ids=[...new Set([...index.byWord.values()].flat()
    .filter(x=>x.teaching_ready).map(x=>x.entry_id))];
  const lessons=new Map(),senses=[];
  const table=await env.DB.prepare('PRAGMA table_info(global_dictionary_senses)').all();
  if(!Array.isArray(table?.results)||!table.results.length)
    throw Error('REVIEWED_SENSE_SCHEMA_REQUIRED');
  for(const batch of group(ids)){
    const parameters=batch.map(()=>'?').join(',');
    const cardRows=await env.DB.prepare(
      'SELECT entry_id,headword,senses_json,phonetic_uk,phonetic_us,'+
      'part_of_speech,meaning_zh,example_en,example_zh,collocations_json,'+
      'reviewed_by,reviewed_at FROM global_dictionary_lessons WHERE entry_id IN ('+
      parameters+')').bind(...batch).all();
    for(const row of cardRows.results||[]){
      if(lessons.has(row.entry_id))throw Error('DUPLICATE_REVIEWED_LESSON_ID');
      lessons.set(row.entry_id,row);
    }
    const rows=await env.DB.prepare(
      'SELECT sense_id,entry_id,pos,meaning_zh,reviewed_by,reviewed_at,approved,active '+
      'FROM global_dictionary_senses WHERE entry_id IN ('+parameters+')'
    ).bind(...batch).all();
    senses.push(...(rows.results||[]));
  }
  return confirm?
    materializeEditorConfirmedUnmarkedV2(manuscript,index,{lessons,senses},payload):
    previewUnmarkedEditorTargets(manuscript,index,{lessons,senses});
}