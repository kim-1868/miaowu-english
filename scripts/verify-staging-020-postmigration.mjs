// Offline verification for guarded test D1 020 migration; never logs customer records.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifySense020Preflight} from './verify-staging-020-post019-baseline.mjs';
const LEGACY=['books','chapters','words','user_words','review_events','entitlements',
  'activation_codes','chapter_words','reading_progress'];
function rows(raw){
  let json;try{json=typeof raw==='string'?JSON.parse(raw):raw}
  catch{throw Error('SENSE_020_POST_INVALID_JSON')}
  const packets=Array.isArray(json)?json:[json];
  if(!packets.length||packets.some(x=>x?.success===false))
    throw Error('SENSE_020_POST_FAILED_PACKET');
  return packets.flatMap(x=>x?.results??x?.result?.results??[]);
}
const nat=(value,label)=>{
  const n=Number(value);
  assert.ok(Number.isSafeInteger(n)&&n>=0,'SENSE_020_INVALID_COUNT_'+label);
  return n;
};
export function verifySense020After({countsJson,fkJson,quickJson,before}={}){
  const c=rows(countsJson);
  assert.equal(c.length,1,'SENSE_020_POST_COUNT_SHAPE');
  const x=c[0];
  const old=before?.legacy_counts;
  assert.ok(before?.phase==='POST_019_PRE_020'&&old&&
    before?.source_candidates_unapproved===true,'SENSE_020_PREVIOUS_VERIFICATION_MISSING');
  const strict={
    dictionary_tables:10,dictionary_guard_triggers:5,core_tables:4,
    headword_019_tables:2,headword_019_indexes:2,
    sense_020_tables:2,sense_020_indexes:2,sense_020_triggers:3,
    sense_study_rows:0,sense_events_rows:0,
    headword_study_rows:0,headword_events_rows:0,
    candidate_heads:61422,candidate_forms:16442,
    upstream_heads:61422,other_heads:0,upstream_forms:16442,other_forms:0,
    source_registry_intact:1,approved_senses:0,teaching_ready:0,
    active_sources:0,approved_lessons:0
  };
  for(const [k,v] of Object.entries(strict))
    assert.equal(nat(x[k],k),v,'SENSE_020_POST_BASELINE_DRIFT_'+k);
  const legacy={};
  for(const name of LEGACY)legacy[name]=nat(x['old_'+name],'old_'+name);
  assert.deepEqual(legacy,old,'SENSE_020_OLD_CUSTOMER_OR_CONTENT_TOTAL_CHANGED');
  assert.deepEqual(rows(fkJson),[],'SENSE_020_POST_FK_ERROR');
  const quick=rows(quickJson);
  assert.equal(quick.length,1,'SENSE_020_POST_QUICK_SHAPE');
  assert.equal(quick[0]?.quick_check,'ok','SENSE_020_POST_INTEGRITY_ERROR');
  return {status:'SENSE_020_STAGING_SCHEMA_APPLIED_VERIFIED',new_tables:2,
    new_indexes:2,new_approval_triggers:3,empty_sense_study:true,
    legacy_aggregate_counts_preserved:true,live_srs_enabled:false,
    production_deployments:0};
}
const main=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(main){
  try{
    const [phase,counts,fk,quick,baseline]=process.argv.slice(2);
    assert.ok(['before','after'].includes(phase)&&
      [counts,fk,quick,baseline].every(Boolean),'SENSE_020_POST_USAGE_INVALID');
    if(phase==='before'){
      const result=verifySense020Preflight({countsJson:readFileSync(counts,'utf8'),
        fkJson:readFileSync(fk,'utf8'),quickJson:readFileSync(quick,'utf8')});
      writeFileSync(baseline,JSON.stringify(result),{mode:0o600,flag:'wx'});
      console.log('SENSE_020_PRE_MIGRATION_STRICT_AGGREGATES_FK_PASS');
    }else{
      const result=verifySense020After({countsJson:readFileSync(counts,'utf8'),
        fkJson:readFileSync(fk,'utf8'),quickJson:readFileSync(quick,'utf8'),
        before:JSON.parse(readFileSync(baseline,'utf8'))});
      console.log(result.status);
      console.log('SENSE_020_TEST_D1_2_TABLES_2_INDEXES_3_TRIGGERS_OLD_RECORD_COUNTS_PRESERVED');
      console.log('NO_CUSTOMER_STUDY_WRITES_NO_PRODUCTION_DEPLOYMENT');
    }
  }catch(e){console.error('SENSE_020_GUARDED_ABORT',e.message);process.exitCode=1}
}
