// V1.2 staging-only read-only aggregate verifier. Never handles customer rows.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const EXPECTED=Object.freeze({
 dictionary_tables:10,dictionary_triggers:5,core_tables:4,
 candidate_heads:61422,candidate_forms:16442,
 upstream_heads:61422,other_heads:0,upstream_forms:16442,other_forms:0,
 source_original_intact:1,
 approved_senses:0,teaching_ready:0,active_sources:0,
 approved_lessons:0,
});
const LEGACY=Object.freeze([
 'books','chapters','words','user_words','review_events',
 'entitlements','activation_codes','chapter_words','reading_progress'
]);
function rows(raw){
 let parsed;
 try{parsed=typeof raw==='string'?JSON.parse(raw):raw}catch{throw Error('STAGING_019_READ_RESULT_NOT_JSON')}
 const packets=Array.isArray(parsed)?parsed:[parsed];
 if(!packets.length||packets.some(p=>p?.success===false))throw Error('STAGING_019_QUERY_UNSUCCESSFUL');
 return packets.flatMap(p=>p?.results??p?.result?.results??[]);
}
export function verify019Aggregate({countJson,fkJson,quickJson,after=false,previous=null}){
 const counts=rows(countJson);
 assert.equal(counts.length,1,'STAGING_019_AGGREGATE_NOT_SINGLE_ROW');
 const c=counts[0];
 for(const [field,want] of Object.entries(EXPECTED)){
   assert.equal(Number(c[field]),want,'STAGING_019_BASELINE_DRIFT_'+field);
 }
 assert.equal(Number(c.headword_tables),after?2:0,'STAGING_019_TABLES_UNEXPECTED');
 assert.equal(Number(c.headword_indexes),after?2:0,'STAGING_019_INDEXES_UNEXPECTED');
 const legacy={};
 for(const t of LEGACY){
   const n=Number(c['old_'+t]);
   assert.ok(Number.isSafeInteger(n)&&n>=0,'STAGING_019_INVALID_LEGACY_TOTAL_'+t);
   legacy[t]=n;
 }
 assert.deepEqual(rows(fkJson),[],'STAGING_019_FOREIGN_KEY_VIOLATIONS');
 const integrity=rows(quickJson);
 assert.equal(integrity.length,1,'STAGING_019_QUICK_CHECK_SHAPE');
 assert.equal(integrity[0]?.quick_check,'ok','STAGING_019_QUICK_CHECK_FAILED');
 if(after)assert.deepEqual(legacy,previous?.legacy,'STAGING_019_LEGACY_AGGREGATES_CHANGED');
 return {legacy,phase:after?'POST_019':'PRE_019',candidate_heads:61422,
   candidate_forms:16442,old_core_preserved:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [phase,countsPath,fkPath,quickPath,baselinePath]=process.argv.slice(2);
 try{
   assert.ok(['before','after'].includes(phase),'STAGING_019_INVALID_PHASE');
   assert.ok([countsPath,fkPath,quickPath,baselinePath].every(Boolean),'STAGING_019_MISSING_FILE');
   const args={countJson:readFileSync(countsPath,'utf8'),
     fkJson:readFileSync(fkPath,'utf8'),quickJson:readFileSync(quickPath,'utf8'),
     after:phase==='after'};
   if(args.after)args.previous=JSON.parse(readFileSync(baselinePath,'utf8'));
   const result=verify019Aggregate(args);
   if(!args.after)writeFileSync(baselinePath,JSON.stringify({legacy:result.legacy}),{mode:0o600});
   // No personal rows or word forms are printed.
   console.log('STAGING_019_'+result.phase+'_EXACT_COUNTS_FK_QUICK_CHECK_OK');
 }catch(e){
   console.error('STAGING_019_GUARDED_ABORT',e.message);
   process.exitCode=1;
 }
}
