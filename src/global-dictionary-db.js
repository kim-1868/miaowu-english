// Staging-only D1 adapter for a future one-headword-one-card global dictionary.
// READS ONLY. A disabled/unreviewed source may be queried for *draft* preview,
// but is never treated as a commercially approved teaching card.
import {buildGlobalDictionaryIndex} from './global-dictionary-matcher.js';

const BATCH=50;
const groups=(xs,n=BATCH)=>{const a=[];for(let i=0;i<xs.length;i+=n)a.push(xs.slice(i,i+n));return a};
const access=db=>db&&typeof db.prepare==='function';
const safeNames=['global_dictionary_entries','global_dictionary_forms','global_dictionary_sources'];
export async function globalDictionaryTablesReady(db){
 if(!access(db))return false;
 try{
  for(const table of safeNames){
   const results=await db.prepare('PRAGMA table_info('+table+')').all();
   if(!Array.isArray(results.results)||!results.results.length)return false;
  }
  return true;
 }catch{return false}
}
export async function loadGlobalDictionaryCandidateIndex(db,spellings){
 if(!access(db)||!Array.isArray(spellings)||spellings.length>2000)
  throw Error('INVALID_DICTIONARY_LOOKUP');
 const unique=[...new Set(spellings.filter(x=>typeof x==='string'&&x.length>0))];
 const map=new Map(),formMap=new Map(),sourceStates=new Map();
 const sourceVerified=row=>Number(row.source_enabled)===1&&
   Number(row.license_reviewed)===1;
 const register=row=>{
   if(!row||!row.entry_id||!row.headword)throw Error('INVALID_DICTIONARY_ROW');
   const sourceApproved=sourceVerified(row);
   const reviewed=Boolean(Number(row.teaching_ready)===1&&row.reviewed_at&&sourceApproved);
   const current=map.get(row.entry_id);
   if(current&&current.headword!==row.headword)
    throw Error('INCONSISTENT_DICTIONARY_ENTRY_ID');
   if(!current)map.set(row.entry_id,{
    entry_id:row.entry_id,headword:row.headword,
    teaching_ready:reviewed,source:row.source_name||'unknown'
   });
   sourceStates.set(row.source_name,sourceApproved);
 };
 for(const batch of groups(unique)){
  if(!batch.length)continue;
  const qs=batch.map(()=>'?').join(',');
  const exact=await db.prepare(
   'SELECT e.entry_id,e.headword,e.teaching_ready,e.reviewed_at,'+
   'e.source_name,s.license_reviewed,s.enabled AS source_enabled '+
   'FROM global_dictionary_entries e LEFT JOIN global_dictionary_sources s '+
   'ON s.source_key=e.source_name WHERE e.headword COLLATE NOCASE IN ('+qs+')'
  ).bind(...batch).all();
  for(const row of exact.results||[])register(row);
  const aliased=await db.prepare(
   'SELECT f.form,f.reviewed AS form_reviewed,'+
   'e.entry_id,e.headword,e.teaching_ready,e.reviewed_at,e.source_name,'+
   's.license_reviewed,s.enabled AS source_enabled '+
   'FROM global_dictionary_forms f JOIN global_dictionary_entries e '+
   'ON e.entry_id=f.entry_id LEFT JOIN global_dictionary_sources s '+
   'ON s.source_key=e.source_name WHERE f.form COLLATE NOCASE IN ('+qs+')'
  ).bind(...batch).all();
  for(const row of aliased.results||[]){
   register(row);
   const k=String(row.form).toLowerCase()+'\0'+row.entry_id;
   const verified=Number(row.form_reviewed)===1&&sourceVerified(row);
   const old=formMap.get(k);
   if(old)old.reviewed&&=verified;
   else formMap.set(k,{form:row.form,headword:row.headword,
     reviewed:verified});
  }
 }
 const entries=[...map.values()];
 const forms=[...formMap.values()];
 return {index:buildGlobalDictionaryIndex({entries,forms}),
  sourceNames:[...sourceStates.keys()].sort(),
  approvedSourceCount:[...sourceStates.values()].filter(Boolean).length,
  indexType:'GLOBAL_DICTIONARY_D1_DRAFT',
  // An actual qualified publishing flow must separately verify all records.
  canPublish:false};
}
