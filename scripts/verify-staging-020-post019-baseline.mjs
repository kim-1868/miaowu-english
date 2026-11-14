// V1.2 020 staging baseline gate. Anonymous counts only; no customer rows.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const EXPECTED=Object.freeze({
  dictionary_tables:10,dictionary_guard_triggers:5,core_tables:4,
  headword_019_tables:2,headword_019_indexes:2,
  sense_020_tables:0,sense_020_indexes:0,sense_020_triggers:0,
  headword_study_rows:0,headword_events_rows:0,
  candidate_heads:61422,candidate_forms:16442,
  upstream_heads:61422,other_heads:0,upstream_forms:16442,other_forms:0,
  source_registry_intact:1,approved_senses:0,teaching_ready:0,
  active_sources:0,approved_lessons:0
});
const LEGACY=Object.freeze(['books','chapters','words','user_words','review_events',
  'entitlements','activation_codes','chapter_words','reading_progress']);
function parseRows(x){
  let data;
  try{data=typeof x==='string'?JSON.parse(x):x}catch{throw Error('SENSE_020_RESPONSE_INVALID_JSON')}
  const packets=Array.isArray(data)?data:[data];
  if(!packets.length||packets.some(v=>v?.success===false))
    throw Error('SENSE_020_RESPONSE_QUERY_FAILURE');
  return packets.flatMap(v=>v?.results??v?.result?.results??[]);
}
export function verifySense020Preflight({countsJson,fkJson,quickJson}={}){
  const rows=parseRows(countsJson);
  assert.equal(rows.length,1,'SENSE_020_EXPECT_ONE_AGGREGATE_ROW');
  const row=rows[0],legacy={};
  for(const [field,expected] of Object.entries(EXPECTED)){
    const num=Number(row[field]);
    assert.ok(Number.isSafeInteger(num)&&num===expected,'SENSE_020_BASELINE_DRIFT_'+field);
  }
  for(const field of LEGACY){
    const v=Number(row['old_'+field]);
    assert.ok(Number.isSafeInteger(v)&&v>=0,'SENSE_020_LEGACY_INVALID_'+field);
    legacy[field]=v;
  }
  assert.deepEqual(parseRows(fkJson),[],'SENSE_020_FOREIGN_KEY_VIOLATION');
  const quick=parseRows(quickJson);
  assert.equal(quick.length,1,'SENSE_020_QUICK_SHAPE');
  assert.equal(quick[0]?.quick_check,'ok','SENSE_020_QUICK_NOT_OK');
  return {phase:'POST_019_PRE_020',staging_only:true,
    headword_019_schema_present:true,sense_020_schema_absent:true,
    source_candidates_unapproved:true,legacy_counts:legacy,
    remote_writes:0,production_deployments:0};
}
const main=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(main){
  try{
    const paths=process.argv.slice(2);
    if(paths.length!==3)throw Error('SENSE_020_REQUIRED_PRIVATE_JSON_FILES');
    const p=verifySense020Preflight({
      countsJson:readFileSync(paths[0],'utf8'),
      fkJson:readFileSync(paths[1],'utf8'),
      quickJson:readFileSync(paths[2],'utf8')
    });
    // NO individual customer totals, word rows or private tokens in CI logs
    console.log('STAGING_020_POST_019_READY_BASELINE_10_DICTIONARY_2_HEADWORD_0_SENSE_TABLES');
    console.log('STAGING_020_FK_QUICK_CHECK_PASS__NO_REMOTE_WRITES');
  }catch(e){console.error('STAGING_020_PREFLIGHT_BLOCKED',e.message);process.exitCode=1}
}
