// P0 phase 2, real two-book TEST D1 READ-ONLY collision/structure preflight.
// Consumes the sealed, verified non-executable real import preview from PR #274.
// No Cloudflare API, no user records, no active senses, no DML.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const SHA=/^[a-f0-9]{64}$/u,ID=/^[a-z0-9_-]{1,80}$/iu;
const qt=v=>"'"+String(v).replaceAll("'","''")+"'";
const inList=arr=>arr.map(qt).join(',');
const tables=['categories','books','chapters','words','chapter_words',
 'global_dictionary_sources','global_dictionary_entries',
 'global_dictionary_lessons','global_dictionary_senses',
 'global_dictionary_legacy_sense_links'];
export function requireRealPublisherTestPreview(manifest){
 assert.equal(manifest?.schema,'wordletter-real-two-book-test-import-preflight-v1');
 assert.equal(manifest?.status,'HOLD_PROTECTED_TEST_PREVIEW_NOT_FOR_EXECUTION');
 assert.equal(manifest?.target_database_id,TEST);
 assert.ok(SHA.test(manifest?.source_proof_sha256??''));
 assert.equal(manifest?.safety?.can_execute,false);
 assert.equal(manifest?.safety?.database_writes_performed,0);
 assert.equal(manifest?.safety?.authenticated_editorial_and_license_receipt_verified,false);
 assert.equal(manifest?.safety?.no_user_progress_copied,true);
 assert.equal(manifest?.safety?.no_entitlements_inserted,true);
 const p=manifest?.sealed_source_data;
 assert.ok(p&&p.books?.length===2&&p.chapters?.length===2&&
  p.words?.length===2&&p.chapter_words?.length===2&&
  p.categories?.length>=1&&p.categories.length<=2,
  'REAL_TEST_TWO_BOOKS_REQUIRED');
 for(const k of ['books','chapters','words','categories']){
  const ids=p[k].map(x=>x.id);
  assert.ok(ids.every(x=>ID.test(x))&&new Set(ids).size===ids.length,
   'REAL_TEST_IMPORT_INVALID_SOURCE_IDENTITIES');
 }
 assert.ok(p.books.every(x=>x.status==='draft')&&
  p.chapters.every(x=>x.is_preview===0&&x.published_at===null)&&
  p.categories.every(x=>x.is_visible===0),
  'REAL_TEST_CONTENT_EXPOSURE_FORBIDDEN');
 const books=new Set(p.books.map(x=>x.id));
 const chapters=new Set(p.chapters.map(x=>x.id));
 const words=new Set(p.words.map(x=>x.id));
 assert.ok(p.chapters.every(c=>books.has(c.book_id)&&
  Number.isSafeInteger(c.chapter_no)&&c.chapter_no>=1));
 assert.ok(p.chapter_words.every(x=>chapters.has(x.chapter_id)&&
  words.has(x.word_id)&&/^p\d+:s\d+$/u.test(x.context_anchor)));
 return p;
}
export function makeRealTestReadOnlyCollisionSQL(manifest){
 const p=requireRealPublisherTestPreview(manifest),sections=[];
 const count=(expr,alias)=>sections.push('('+expr+') AS '+alias);
 count('SELECT count(*) FROM books WHERE id IN ('+
  inList(p.books.map(x=>x.id))+')','book_id_conflicts');
 count('SELECT count(*) FROM chapters WHERE id IN ('+
  inList(p.chapters.map(x=>x.id))+')','chapter_id_conflicts');
 count('SELECT count(*) FROM words WHERE id IN ('+
  inList(p.words.map(x=>x.id))+')','old_card_id_conflicts');
 count('SELECT count(*) FROM chapters WHERE '+p.chapters.map(x=>
  '(book_id='+qt(x.book_id)+' AND chapter_no='+x.chapter_no+')').join(' OR '),
  'chapter_number_conflicts');
 count('SELECT count(*) FROM global_dictionary_legacy_sense_links WHERE legacy_word_id IN ('+
  inList(p.words.map(x=>x.id))+')','old_link_conflicts');
 count('SELECT count(*) FROM global_dictionary_entries WHERE lower(headword) IN ('+
  inList([...new Set(p.words.map(x=>x.headword.toLowerCase()))])+')',
  'headword_entry_needs_reuse_review');
 count('SELECT count(*) FROM categories WHERE id IN ('+
  inList(p.categories.map(x=>x.id))+') AND slug!=id','category_slug_conflicts');
 count('SELECT count(*) FROM sqlite_master WHERE type='+qt('table')+
  ' AND name IN ('+inList(tables)+')','ready_table_count');
 count('SELECT count(*) FROM user_words','existing_user_study_rows');
 count('SELECT count(*) FROM entitlements','existing_entitlement_rows');
 count('SELECT count(*) FROM user_dictionary_sense_study','existing_sense_study_rows');
 const sql='SELECT '+sections.join(',')+';';
 assert.ok(sql.startsWith('SELECT ')&&sql.endsWith(';')&&
  !/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|REPLACE)\b/iu.test(sql),
  'REAL_TEST_D1_SELECT_ONLY');
 return {sql,target_database_id:TEST,source_proof_sha256:manifest.source_proof_sha256,
  expected_tables:tables.length,actual_writes:0,production_access:false};
}
const expected=['book_id_conflicts','chapter_id_conflicts','old_card_id_conflicts',
 'chapter_number_conflicts','old_link_conflicts','headword_entry_needs_reuse_review',
 'category_slug_conflicts','ready_table_count','existing_user_study_rows',
 'existing_entitlement_rows','existing_sense_study_rows'];
export function assessRealTestReadOnlyCollisionResults(manifest,payload){
 requireRealPublisherTestPreview(manifest);
 const rows=(Array.isArray(payload)?payload:[payload]).flatMap(x=>x?.results??[]);
 assert.equal(rows.length,1,'REAL_TEST_READONLY_EXACT_RESULT_REQUIRED');
 const row=rows[0];
 assert.deepEqual(Object.keys(row).sort(),[...expected].sort(),
  'REAL_TEST_READONLY_UNEXPECTED_RESULT_KEYS');
 assert.ok(expected.every(k=>Number.isSafeInteger(row[k])&&row[k]>=0),
  'REAL_TEST_READONLY_INVALID_COUNT');
 const collisionKeys=expected.slice(0,5).concat(['category_slug_conflicts']);
 const blockers=collisionKeys.filter(k=>row[k]).map(k=>'TEST_ID_CONFLICT_'+k.toUpperCase());
 if(row.ready_table_count!==tables.length)blockers.push('TEST_DB_SCHEMA_REQUIRED');
 if(row.headword_entry_needs_reuse_review)
  blockers.push('TEST_HEADWORD_EXISTS_MUST_REUSE_ONLY_IF_AUTHENTICALLY_LICENSED');
 blockers.push('FIRST_STAGE_REAL_EDITORIAL_RIGHTS_AND_OPS_RECEIPT_PENDING');
 blockers.push('RESTORABLE_TEST_BACKUP_AND_SEPARATE_WRITE_AUTHORIZATION_REQUIRED');
 return {schema:'wordletter-real-two-book-test-readonly-collisions-v1',
  status:'READ_ONLY_TEST_PREFLIGHT_COMPLETED_NOT_APPROVED_TO_WRITE',
  target_database_id:TEST,
  counts:row,
  blockers,
  no_id_collisions:collisionKeys.every(k=>row[k]===0),
  test_schema_ready:row.ready_table_count===tables.length,
  actual_test_db_writes:0,actual_prod_db_access:false,
  original_published_cards_unchanged:true,
  user_progress_or_entitlements_unchanged:true,
  signed_editorial_receipt_present:false,
  test_import_allowed:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [command,file,source,out]=process.argv.slice(2);
  const manifest=JSON.parse(readFileSync(file,'utf8'));
  if(command==='sql'&&process.argv.length===5){
   const x=makeRealTestReadOnlyCollisionSQL(manifest);
   writeFileSync(source,x.sql,{flag:'wx',mode:0o600});
   console.log('REAL_TEST_D1_COLLISION_SELECT_PREPARED_NO_DB_ACCESS');
  }else if(command==='result'&&process.argv.length===6){
   const x=assessRealTestReadOnlyCollisionResults(manifest,
    JSON.parse(readFileSync(source,'utf8')));
   writeFileSync(out,JSON.stringify(x),{flag:'wx',mode:0o600});
   console.log('REAL_TEST_D1_READONLY_COLLISION_COUNTS='+JSON.stringify({
    id_collision_free:x.no_id_collisions,schema_ready:x.test_schema_ready,
    blocker_count:x.blockers.length,database_writes:0}));
  }else throw Error('REAL_TEST_D1_READONLY_USAGE');
 }catch(e){
  console.error('REAL_TEST_D1_READONLY_FAILED',
   /^[A-Z0-9_]+$/u.test(String(e?.message))?e.message:
    'PRIVATE_OR_UNTRUSTED_INPUT');
  process.exitCode=1;
 }
}
