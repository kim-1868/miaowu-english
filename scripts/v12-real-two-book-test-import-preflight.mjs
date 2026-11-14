// Preparatory preview for the FIRST REAL two-book TEST D1 import.
// Pure offline JS. Stage 1 legal + editorial signoff MUST complete separately.
// Does not emit executable SQL, approve senses, call D1, modify books or
// grant access. All returned customer/seller novel content must stay encrypted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRealPublisherClearanceTemplate}
 from './v12-real-published-commercial-rights-gate.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const exactId=/^[a-z0-9_-]{1,80}$/iu;
const anchor=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const reserved=/^(?:mw-v12-pilot-|qa-|draft-|internal-)/iu;
const digest=/^[a-f0-9]{64}$/u;
const TEST='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const cardHash=c=>sha(JSON.stringify([
 c.legacy_word_id,c.old_headword,c.phonetic_uk,c.phonetic_us,
 c.part_of_speech,c.meaning_zh,c.example_en,c.example_zh,c.collocations_json]));
function jsonObject(source,label){
 try{
  const x=JSON.parse(source);
  assert.ok(x&&typeof x==='object'&&!Array.isArray(x));
  return x;
 }catch{throw Error('TEST_IMPORT_INVALID_'+label)}
}
export function prepareRealTwoBookTestImportPreflight(packet){
 // Enforce the same original SHA256 and HOLD checks as the independent
 // clearance gate. The returned template must stay separate from import.
 const legal=createRealPublisherClearanceTemplate(packet);
 assert.equal(legal.is_approved,false);
 assert.equal(legal.source_proof_sha256,packet.source_proof_sha256);
 const cards=packet.candidate.real_cards;
 assert.equal(cards.length,2);
 const bookIds=new Set(),chapterIds=new Set(),wordIds=new Set();
 const categories=new Map(),books=[],chapters=[],words=[],chapterWords=[];
 for(const c of cards){
  assert.ok([c.book_id,c.chapter_id,c.legacy_word_id,c.category_id].every(x=>
   exactId.test(x??''))&&!reserved.test(c.book_id)&&
   digest.test(c.old_card_sha256||'')&&cardHash(c)===c.old_card_sha256&&
   digest.test(c.context_paragraph_sha256||'')&&
   sha(c.paragraph_json)===c.context_paragraph_sha256&&
   anchor.test(c.anchor||'')&&
   Number.isSafeInteger(c.chapter_no)&&c.chapter_no>0,
   'TEST_IMPORT_REAL_CARD_INVALID');
  assert.ok(!bookIds.has(c.book_id)&&!chapterIds.has(c.chapter_id)&&
   !wordIds.has(c.legacy_word_id),'TEST_IMPORT_COLLIDING_SOURCE_IDENTITIES');
  bookIds.add(c.book_id);chapterIds.add(c.chapter_id);
  wordIds.add(c.legacy_word_id);
  const [p,s]=c.anchor.split(':').map(x=>Number(x.slice(1)));
  assert.ok(p<=500&&s<=1000,'TEST_IMPORT_SAMPLE_LIMIT');
  let original;
  try{original=jsonObject(c.paragraph_json,'REAL_PUBLISHED_PARAGRAPH')}
  catch{throw Error('TEST_IMPORT_REAL_PUBLISHED_PARAGRAPH_INVALID')}
  assert.ok(Array.isArray(original.segments)&&
   original.segments[s]?.wordId===c.legacy_word_id&&
   norm(original.segments[s]?.gloss)===norm(c.meaning_zh)&&
   original.segments[s]?.surface===c.segment_surface,
   'TEST_IMPORT_ORIGINAL_ANCHOR_CHANGED');
  let collocations;
  try{collocations=JSON.parse(c.collocations_json)}
  catch{throw Error('TEST_IMPORT_COLLOCATIONS_INVALID')}
  assert.ok(Array.isArray(collocations),'TEST_IMPORT_COLLOCATIONS_NOT_ARRAY');
  categories.set(c.category_id,{
   id:c.category_id,slug:c.category_id,title:'TEST only - restricted scope',
   is_visible:0});
  // Preceding paragraphs are explicit TEST placeholders, not original
  // novel content; paid book content never printed in logs or GitHub source.
  const paragraphs=Array.from({length:p+1},(_,i)=>({
   segments:[{text:'TEST_IMPORTED_ANCHOR_PLACEHOLDER_'+i}]}));
  paragraphs[p]=original;
  const complete={paragraphs,testOnly:true,
   source:'protected-actual-published-two-book-minimal-paragraph',
   copyright_and_editorial_approval_pending:true};
  books.push({id:c.book_id,category_id:c.category_id,
   title:c.book_title,description:'TEST restricted unpublished import only',
   cover_key:null,status:'draft',sort_order:0});
  chapters.push({id:c.chapter_id,book_id:c.book_id,
   chapter_no:c.chapter_no,title:c.chapter_title,
   content_json:JSON.stringify(complete),is_preview:0,published_at:null,
   source_original_anchor:c.anchor});
  words.push({id:c.legacy_word_id,headword:c.old_headword,
   phonetic_uk:c.phonetic_uk,phonetic_us:c.phonetic_us,
   part_of_speech:c.part_of_speech,meaning_zh:c.meaning_zh,
   example_en:c.example_en,example_zh:c.example_zh,
   collocations_json:c.collocations_json});
  chapterWords.push({chapter_id:c.chapter_id,word_id:c.legacy_word_id,
   context_sentence:'TEST-only source excerpt; no real context summary',
   context_anchor:c.anchor});
 }
 const manifest={schema:'wordletter-real-two-book-test-import-preflight-v1',
  status:'HOLD_PROTECTED_TEST_PREVIEW_NOT_FOR_EXECUTION',
  source_encrypted_artifact_id:13964630089,
  source_proof_sha256:packet.source_proof_sha256,
  target_database_id:TEST,
  publisher_content_origin:{
   declaration:'USER_REPORTED_NOVELS_AI_GENERATED_FOR_MIAOWU',
   evidence_type:'user_self_report_unverified',
   specific_book_rights_signed_off:false,
   applies_to:['original_story_context'],
   excludes:['lexical_definition','uk_ipa','us_ipa','english_example',
    'chinese_example','collocations'],
   bilingual_example_origin_claim:{
    general_project_production:'CHATGPT_ASSISTED_ORIGINAL_DRAFTS',
    confirmed_by_user:true,
    prior_generation_records_exist:true,
    each_selected_legacy_card_provenance_verified:false,
    reviewer_still_checks_language_accuracy_and_external_overlap:true
   },
   downstream_provider_terms_and_third_party_rights_unverified:true},
  counts:{real_publisher_books:books.length,chapters:chapters.length,
   old_word_cards:words.length,real_context_anchors:chapterWords.length,
   distinct_senses_proven_and_approved:0},
  sealed_source_data:{categories:[...categories.values()],books,chapters,
   words,chapter_words:chapterWords},
  safety:{
   staging_source_table_safety_checked:false,
   target_schema_checked_live:false,
   staging_book_chapter_word_collision_checked_live:false,
   staging_encrypted_backup_and_restore_verified:false,
   authenticated_editorial_and_license_receipt_verified:false,
   independent_test_import_authorization:false,
   no_entitlements_inserted:true,no_user_progress_copied:true,
   categories_hidden:true,books_unpublished_drafts:true,
   chapters_not_previewable:true,database_writes_performed:0,
   executable_d1_sql_generated:false,
   can_execute:false,
   stop_reasons:['STAGE1_REAL_COMMERCIAL_AND_OPS_SIGNOFF_NOT_COMPLETED',
    'TEST_DB_LIVE_COLLISION_CHECK_PENDING',
    'TEST_DB_VERIFIED_BACKUP_AND_EXPLICIT_WRITE_APPROVAL_PENDING']},
  notes:'Draft-only hidden minimal source data, not full books. All paid prose and prior cards are private. This output is a non-executable preview requiring fresh signed signoff and live TEST read-only collision checks before any D1 write.'};
 return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'TEST_IMPORT_PREFLIGHT_CLI_USAGE');
  const packet=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const out=prepareRealTwoBookTestImportPreflight(packet);
  writeFileSync(process.argv[3],JSON.stringify(out),{flag:'wx',mode:0o600});
  console.log('TEST_IMPORT_PREFLIGHT_SAFE_COUNTS='+JSON.stringify({
   source_books:out.counts.real_publisher_books,
   real_cards:out.counts.old_word_cards,
   anchors:out.counts.real_context_anchors,
   authorized:false,live_writes:0,source_owner_reported:true}));
 }catch(e){
  console.error('TEST_IMPORT_PREFLIGHT_BLOCKED',
   /^[A-Z0-9_]+$/u.test(String(e?.message))?e.message:
   'PRIVATE_CARD_OR_SOURCE_ERROR');
  process.exitCode=1;
 }
}
