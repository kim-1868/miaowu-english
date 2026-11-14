// Schema/approved-data aggregated STAGING readiness only. No lexical content.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const REQUIRED=['books','chapters','words','chapter_words','global_dictionary_entries',
 'global_dictionary_senses','global_dictionary_lessons','global_dictionary_sources',
 'global_dictionary_legacy_sense_links','global_dictionary_book_bindings',
 'global_dictionary_book_sense_bindings','user_dictionary_sense_study',
 'user_dictionary_sense_review_events'];
const KEYS=['published_books','published_chapters','approved_active_senses',
 'licensed_teaching_entries','approved_legacy_sense_links','linked_published_anchors',
 'sense_study_rows','staging_fixture_senses','staging_fixture_legacy_links',
 'staging_fixture_published_anchors'];
const parse=(json)=>{
 let raw;
 try{raw=typeof json==='string'?JSON.parse(json):json}catch{throw Error('STAGING_READINESS_INVALID_JSON')}
 const packets=Array.isArray(raw)?raw:[raw];
 assert.ok(packets.length>0&&packets.every(p=>p?.success!==false),
  'STAGING_READINESS_SELECT_FAILED');
 return packets.flatMap(p=>p?.results??p?.result?.results??[]);
};
export function verifyStagingPublishedSchema(json){
 const rows=parse(json);
 assert.ok(rows.every(r=>typeof r?.name==='string'&&Object.keys(r).length===1),
  'STAGING_SCHEMA_UNEXPECTED_FIELDS');
 const present=new Set(rows.map(r=>r.name));
 assert.equal(present.size,rows.length,'STAGING_SCHEMA_DUPLICATE_TABLE');
 return {status:REQUIRED.every(x=>present.has(x))?'SCHEMA_READY':'SCHEMA_MISSING',
  expected_tables:REQUIRED.length,
  found_tables:REQUIRED.filter(x=>present.has(x)).length,
  missing_tables:REQUIRED.filter(x=>!present.has(x)),
  database_writes:0,production_access:false};
}
export function verifyStagingPublishedCounters(json){
 const rows=parse(json);
 assert.equal(rows.length,1,'STAGING_COUNTS_EXPECT_ONE_ROW');
 const row=rows[0];
 assert.deepEqual(Object.keys(row).sort(),[...KEYS].sort(),
  'STAGING_COUNTS_UNEXPECTED_FIELDS');
 for(const k of KEYS)assert.ok(Number.isSafeInteger(row[k])&&row[k]>=0,
  'STAGING_COUNTS_INVALID_'+k);
 return {status:row.approved_active_senses>0&&row.licensed_teaching_entries>0&&
  row.approved_legacy_sense_links>0&&row.linked_published_anchors>0?
  'STAGING_APPROVED_PUBLISHED_LEGACY_LINKS_AVAILABLE':
   row.staging_fixture_published_anchors>0?
    'STAGING_INTERNAL_QA_FIXTURE_ONLY_NOT_RELEASE_READY':
    'STAGING_APPROVED_LINK_DATA_NOT_READY',
  counts:Object.fromEntries(KEYS.map(k=>[k,row[k]])),
  private_rows_exported:0,
  production_access:false,d1_writes:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4);
  const mode=process.argv[2],raw=readFileSync(process.argv[3],'utf8');
  const result=mode==='schema'?verifyStagingPublishedSchema(raw):
   mode==='counts'?verifyStagingPublishedCounters(raw):null;
  assert.ok(result,'STAGING_READINESS_INVALID_MODE');
  console.log('STAGING_PUBLISHED_SENSE_READINESS='+JSON.stringify(result));
  if(mode==='schema'&&result.status!=='SCHEMA_READY')process.exitCode=2;
 }catch(e){
  console.error('STAGING_PUBLISHED_SENSE_READINESS_BLOCKED',e.message);
  process.exitCode=1;
 }
}
