// Parse a fixed single-row published-only aggregate from production D1.
// Never print headwords, IDs or customer rows: all values are counts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const KEYS=[
 'published_anchor_rows','distinct_old_cards','distinct_headwords',
 'headwords_with_multiple_old_ids','excess_old_ids_by_headword',
 'headwords_repeated_between_books','textual_sense_candidates',
 'textual_sense_groups_with_multiple_old_ids','excess_old_ids_by_textual_sense',
 'old_ids_shared_between_books','cards_missing_either_ipa',
 'cards_missing_either_example','cards_missing_pos','cards_missing_gloss',
 'cards_missing_headword','published_books_with_anchors'
];
export function verifyPublishedIdentityAggregate(data){
 let x;try{x=typeof data==='string'?JSON.parse(data):data}
 catch{throw Error('PUBLISHED_IDENTITY_NOT_JSON')}
 const packets=Array.isArray(x)?x:[x];
 assert.ok(packets.length>0&&packets.every(p=>p?.success!==false),'PUBLISHED_IDENTITY_QUERY_FAILED');
 const rows=packets.flatMap(p=>p?.results??p?.result?.results??[]);
 assert.equal(rows.length,1,'PUBLISHED_IDENTITY_EXPECT_ONE_ROW');
 const row=rows[0];
 assert.deepEqual(Object.keys(row).sort(),[...KEYS].sort(),'PUBLISHED_IDENTITY_UNEXPECTED_FIELD');
 const out={};
 for(const k of KEYS){
  const value=row[k];
  assert.ok(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0,
   'PUBLISHED_IDENTITY_INVALID_COUNT_'+k);
  out[k]=value;
 }
 assert.equal(out.published_anchor_rows,8444,'PUBLISHED_IDENTITY_SNAPSHOT_DRIFT_REEXPORT_REQUIRED');
 assert.equal(out.published_books_with_anchors,32,'PUBLISHED_IDENTITY_BOOK_SCOPE_DRIFT_REEXPORT_REQUIRED');
 assert.ok(out.distinct_old_cards<=out.published_anchor_rows);
 assert.ok(out.distinct_headwords<=out.distinct_old_cards);
 assert.ok(out.cards_missing_either_ipa<=out.distinct_old_cards);
 assert.ok(out.cards_missing_either_example<=out.distinct_old_cards);
 assert.ok(out.cards_missing_pos<=out.distinct_old_cards);
 assert.ok(out.cards_missing_gloss<=out.distinct_old_cards);
 assert.ok(out.headwords_with_multiple_old_ids<=out.distinct_headwords);
 assert.ok(out.textual_sense_groups_with_multiple_old_ids<=out.textual_sense_candidates);
 assert.ok(out.old_ids_shared_between_books<=out.distinct_old_cards);
 return {status:'PUBLISHED_ONLY_WORD_IDENTITY_AGGREGATE_VERIFIED',
  published_books:32,published_anchors:8444,counts:out,
  sense_ids_approved:0,wordcards_updated:0,production_writes:0,
  warning:'Textual headword+POS+gloss matches are review candidates, not approved lexical senses.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3);
  const output=verifyPublishedIdentityAggregate(readFileSync(process.argv[2],'utf8'));
  console.log('PUBLISHED_IDENTITY_AGGREGATE_JSON='+JSON.stringify(output));
  console.log('PUBLISHED_IDENTITY_READONLY_NO_CUSTOMER_DATA_NO_SITE_CHANGES');
 }catch(e){console.error('PUBLISHED_IDENTITY_AGGREGATE_BLOCKED',e.message);process.exitCode=1}
}
