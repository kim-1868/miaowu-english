// Audit only counts. Never accept or display live Publisher text, users or IDs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const FIELDS=[
 'published_anchors','published_books','all_distinct_old_ids',
 'duplicate_candidate_anchors','duplicate_candidate_old_ids',
 'duplicate_candidate_groups','invalid_chapter_json_anchors',
 'missing_context_segments','confirmed_matching_wordid_anchors',
 'mismatched_wordid_anchors','missing_context_gloss_anchors',
 'duplicate_gloss_equal_anchors','duplicate_gloss_mismatch_anchors',
 'duplicate_missing_surface_anchors'
];
export function verifyPublishedContextGlossAggregate(payload){
 let input;
 try{input=typeof payload==='string'?JSON.parse(payload):payload}
 catch{throw Error('PUBLISHED_CONTEXT_INVALID_JSON')}
 const packets=Array.isArray(input)?input:[input];
 assert.ok(packets.length&&packets.every(p=>p?.success!==false),
  'PUBLISHED_CONTEXT_READONLY_QUERY_FAILED');
 const rows=packets.flatMap(p=>p?.results??p?.result?.results??[]);
 assert.equal(rows.length,1,'PUBLISHED_CONTEXT_SINGLE_AGGREGATE_REQUIRED');
 const x=rows[0];
 assert.deepEqual(Object.keys(x).sort(),[...FIELDS].sort(),
  'PUBLISHED_CONTEXT_UNEXPECTED_PRIVATE_FIELDS');
 for(const f of FIELDS)
  assert.ok(Number.isSafeInteger(x[f])&&x[f]>=0,
   'PUBLISHED_CONTEXT_INVALID_COUNTER_'+f);
 for(const [f,n] of Object.entries({
  published_books:32,published_anchors:8444,all_distinct_old_ids:3433,
  duplicate_candidate_groups:532,duplicate_candidate_old_ids:1984,
  duplicate_candidate_anchors:5507
 }))assert.equal(x[f],n,'PUBLISHED_CONTEXT_LIVE_SNAPSHOT_DRIFT_'+f);
 assert.equal(x.confirmed_matching_wordid_anchors+x.mismatched_wordid_anchors+
  x.missing_context_segments,x.published_anchors,
  'PUBLISHED_CONTEXT_WORDID_PARTITION_INCONSISTENT');
 for(const f of ['invalid_chapter_json_anchors','missing_context_segments',
  'mismatched_wordid_anchors','missing_context_gloss_anchors'])
  assert.ok(x[f]<=x.published_anchors,'PUBLISHED_CONTEXT_IMPOSSIBLE_COUNTER');
 for(const f of ['duplicate_gloss_equal_anchors',
  'duplicate_gloss_mismatch_anchors','duplicate_missing_surface_anchors'])
  assert.ok(x[f]<=x.duplicate_candidate_anchors,'PUBLISHED_CONTEXT_DUPLICATE_SUBSET_INVALID');
 assert.ok(x.duplicate_gloss_equal_anchors+x.duplicate_gloss_mismatch_anchors
  <=x.duplicate_candidate_anchors,
  'PUBLISHED_CONTEXT_GLOSS_PARTITION_INVALID');
 return {status:'PUBLISHED32_CONTEXT_READONLY_EVIDENCE_CHECKED',
  scope:{published_books:32,all_published_anchors:8444,
    duplicate_textual_sense_groups:532,duplicate_group_anchors:5507},
  results:Object.fromEntries(FIELDS.filter(f=>!['published_books','published_anchors',
    'duplicate_candidate_groups','duplicate_candidate_anchors'].includes(f))
   .map(f=>[f,x[f]])),
  contextual_sense_semantically_approved:0,production_writes:0,
  legacy_user_srs_merged:0,
  warning:'Matching context gloss proves stored annotation alignment, not independent semantic correctness, lesson accuracy, or commercial rights.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3,'PUBLISHED_CONTEXT_EXPECT_SOURCE_FILE');
  const v=verifyPublishedContextGlossAggregate(readFileSync(process.argv[2],'utf8'));
  console.log('PUBLISHED32_CONTEXT_GLOSS_AGGREGATE_JSON='+JSON.stringify(v));
  console.log('PUBLISHED32_CONTEXT_NO_STORY_TEXT_OR_PRIVATE_IDS_EXPORTED');
 }catch(e){
  console.error('PUBLISHED32_CONTEXT_AGGREGATE_BLOCKED',e.message);
  process.exitCode=1;
 }
}
