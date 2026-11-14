// Anonymous, read-only diagnosis when REAL TEST D1 published intake is empty.
// Never exports chapter text, wordcards, IDs, users, orders or production data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const DIAGNOSTIC_SQL=`WITH used AS (
 SELECT b.id book_id,e.entry_id,e.source_name,l.sense_id
 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id
 JOIN books b ON b.id=ch.book_id JOIN words w ON w.id=cw.word_id
 LEFT JOIN global_dictionary_entries e ON e.headword=w.headword COLLATE NOCASE
 LEFT JOIN global_dictionary_legacy_sense_links l ON l.legacy_word_id=w.id
 WHERE b.status='published' AND ch.published_at IS NOT NULL
  AND ch.published_at<=CURRENT_TIMESTAMP
), flagged AS (
 SELECT book_id,entry_id,source_name,sense_id,
 CASE WHEN book_id LIKE 'mw-v12-pilot-%' OR book_id LIKE 'qa-%'
  OR book_id LIKE 'draft-%' OR book_id LIKE 'internal-%'
  THEN 1 ELSE 0 END qa_book,
 CASE WHEN source_name LIKE 'wordletter-internal-qa%'
  OR source_name LIKE 'qa-%' OR source_name LIKE 'test-%'
  OR source_name LIKE 'internal-%' THEN 1 ELSE 0 END qa_source,
 CASE WHEN source_name IS NULL OR source_name NOT LIKE 'wordletter-internal-qa%'
  THEN 1 ELSE 0 END source_allowed
 FROM used
)
SELECT count(*) total_published_anchors,
 COALESCE(sum(qa_book),0) excluded_qa_book_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 THEN 1 ELSE 0 END),0) nonqa_book_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 AND qa_source=1 THEN 1 ELSE 0 END),0) qa_source_on_nonqa_book_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 AND source_allowed=1 THEN 1 ELSE 0 END),0) after_source_filter_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 AND source_allowed=1 AND sense_id IS NOT NULL THEN 1 ELSE 0 END),0) existing_link_after_source_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 AND source_allowed=1 AND sense_id IS NULL THEN 1 ELSE 0 END),0) first_intake_sql_eligible_anchors,
 COALESCE(sum(CASE WHEN qa_book=0 AND source_allowed=1 AND sense_id IS NULL AND entry_id IS NULL THEN 1 ELSE 0 END),0) eligible_without_dictionary_entry_anchors
FROM flagged;`;
const KEYS=['total_published_anchors','excluded_qa_book_anchors',
 'nonqa_book_anchors','qa_source_on_nonqa_book_anchors',
 'after_source_filter_anchors','existing_link_after_source_anchors',
 'first_intake_sql_eligible_anchors','eligible_without_dictionary_entry_anchors'];
export function verifyEmptyRealPublishedIntakeCounts(input){
 const raw=typeof input==='string'?JSON.parse(input):input;
 const packets=Array.isArray(raw)?raw:[raw];
 assert.ok(packets.length>0&&packets.every(x=>x?.success!==false),
  'EMPTY_INTAKE_DIAGNOSTIC_QUERY_FAILED');
 const rows=packets.flatMap(x=>x.results??[]);
 assert.equal(rows.length,1,'EMPTY_INTAKE_DIAGNOSTIC_ONE_ROW');
 assert.deepEqual(Object.keys(rows[0]).sort(),[...KEYS].sort(),
  'EMPTY_INTAKE_DIAGNOSTIC_NO_PRIVATE_COLUMNS');
 const c=rows[0];
 for(const k of KEYS)assert.ok(Number.isSafeInteger(c[k])&&c[k]>=0,
  'EMPTY_INTAKE_DIAGNOSTIC_INVALID_COUNT_'+k);
 assert.equal(c.total_published_anchors,c.excluded_qa_book_anchors+c.nonqa_book_anchors);
 assert.equal(c.after_source_filter_anchors,
  c.existing_link_after_source_anchors+c.first_intake_sql_eligible_anchors);
 assert.ok(c.qa_source_on_nonqa_book_anchors<=c.nonqa_book_anchors);
 assert.ok(c.eligible_without_dictionary_entry_anchors<=c.first_intake_sql_eligible_anchors);
 return {status:c.first_intake_sql_eligible_anchors>0?
  'NONQA_CANDIDATES_PRESENT':'NONQA_CANDIDATES_ABSENT_REQUIRE_REAL_PUBLISHER_DATA',
  ...c,production_access:false,database_writes:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'EMPTY_INTAKE_DIAG_USAGE');
  if(process.argv[2]==='sql'){
   writeFileSync(process.argv[3],DIAGNOSTIC_SQL,{flag:'wx',mode:0o600});
  }else if(process.argv[2]==='counts'){
   const d=verifyEmptyRealPublishedIntakeCounts(readFileSync(process.argv[3],'utf8'));
   console.log('FIRST_REAL_SENSE_EMPTY_INTAKE_SAFE_DIAGNOSTIC='+JSON.stringify(d));
  }else throw Error('EMPTY_INTAKE_DIAG_INVALID_MODE');
 }catch(e){
  console.error('FIRST_REAL_SENSE_EMPTY_INTAKE_DIAG_BLOCKED',
   String(e.message).startsWith('EMPTY_INTAKE_')?e.message:'SAFE_INVALID_DIAGNOSTIC');
  process.exitCode=1;
 }
}
