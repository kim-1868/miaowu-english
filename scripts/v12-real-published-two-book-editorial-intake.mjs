// Convert a verified, encrypted REAL published two-book context proof into a
// reviewable private intake packet. Does NOT approve any dictionary source,
// author/license rights, lesson, sense, legacy mapping or TEST/PROD write.
// All lexical details and paid-story excerpts MUST remain AES256 encrypted.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha=value=>createHash('sha256').update(value).digest('hex');
const HEX=/^[a-f0-9]{64}$/u;
const ANCHOR=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const ID=/^[a-z0-9_-]{1,120}$/iu;
const QA=/^(?:qa-|draft-|internal-|mw-v12-pilot-)/iu;
const tidy=x=>String(x??'').normalize('NFKC').trim();
const lower=x=>tidy(x).toLowerCase().replaceAll('’',"'");
const meaning=x=>tidy(x).replace(/\s+/gu,'');
const pos=x=>lower(x).replace(/[.。]/gu,'');
const RIGHTS=['lexical_definition','uk_ipa','us_ipa','english_example',
 'chinese_example','collocations','original_story_context'];
const blockingChecks=['same_word_sense','part_of_speech','uk_ipa',
 'us_ipa','english_example','chinese_example','story_context_semantics',
 'commercial_rights','dictionary_entry','authenticated_ops_signoff'];

export function buildRealPublishedTwoBookEditorialIntake(proof){
 assert.equal(proof?.schema,'wordletter-real-production-2book-context-evidence-v1',
  'REAL_PROOF_SCHEMA_NOT_TRUSTED');
 assert.equal(proof?.status,'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  'REAL_PROOF_MUST_BE_UNAPPROVED');
 assert.equal(proof?.source_artifact_id,13911979176,
  'REAL_PROOF_SOURCE_SNAPSHOT_ID_CHANGED');
 for(const [field,value] of Object.entries({
  approved_sense_id:null,commercial_license_verified:false,
  authenticated_ops_signoff:false,bound_staging_legacy_word_ids:0,
  production_writes:0,customer_study_writes:0,staging_writes:0}))
  assert.equal(proof[field],value,'REAL_PROOF_PRETENDS_APPROVED_'+field);
 const c=proof.editorial_candidate;
 assert.ok(c&&HEX.test(c.fingerprint_sha256??'')&&
  typeof c.headword==='string'&&tidy(c.headword)&&
  typeof c.pos==='string'&&tidy(c.pos)&&
  typeof c.meaning_zh==='string'&&tidy(c.meaning_zh)&&
  Array.isArray(c.paired_cards)&&c.paired_cards.length===2,
  'REAL_PROOF_INVALID_EDITORIAL_CANDIDATE');
 const rows=proof.verified_actual_published_contexts;
 assert.ok(Array.isArray(rows)&&rows.length===2,'REAL_PROOF_REQUIRES_TWO_CONTEXTS');
 const usedBooks=new Set(),usedOldIds=new Set(),cards=[];
 for(let i=0;i<2;i++){
  const row=rows[i],expected=c.paired_cards[i];
  assert.ok(row&&expected&&row.rank===i&&
   ID.test(row.book_id??'')&&!QA.test(row.book_id)&&
   ID.test(row.chapter_id??'')&&ID.test(row.legacy_word_id??'')&&
   row.book_id===expected.book_id&&
   row.legacy_word_id===expected.old_word_id&&
   Number.isSafeInteger(row.chapter_no)&&row.chapter_no>0&&
   ANCHOR.test(row.anchor??'')&&
   typeof row.book_title==='string'&&
   typeof row.chapter_title==='string'&&
   typeof row.category_id==='string'&&
   row.segment_word_id===row.legacy_word_id,
   'REAL_PROOF_BOOK_ANCHOR_IDENTITY_MISMATCH');
  usedBooks.add(row.book_id);usedOldIds.add(row.legacy_word_id);
  assert.equal(lower(row.old_headword),lower(c.headword),
   'REAL_PROOF_HEADWORD_DRIFT');
  assert.equal(pos(row.old_pos),pos(c.pos),'REAL_PROOF_POS_DRIFT');
  assert.equal(meaning(row.old_meaning),meaning(c.meaning_zh),
   'REAL_PROOF_MEANING_DRIFT');
  assert.equal(meaning(row.segment_gloss),meaning(row.old_meaning),
   'REAL_PROOF_STORY_GLOSS_CHANGED');
  for(const [old,original] of [['old_uk','phonetic_uk'],['old_us','phonetic_us'],
   ['old_en','example_en'],['old_zh','example_zh']])
   assert.ok(typeof row[old]==='string'&&tidy(row[old])&&
    row[old]===expected[original],'REAL_PROOF_OLD_CARD_CHANGED_'+old);
  assert.ok(typeof row.old_collocations==='string'&&
   typeof row.paragraph_json==='string','REAL_PROOF_RAW_CARD_OR_PARAGRAPH_MISSING');
  let paragraph,collocations;
  try{paragraph=JSON.parse(row.paragraph_json);
   collocations=JSON.parse(row.old_collocations)}
  catch{throw Error('REAL_PROOF_INVALID_JSON_CONTEXT_OR_COLLOCATIONS')}
  assert.ok(Array.isArray(paragraph?.segments)&&
   Array.isArray(collocations),'REAL_PROOF_INVALID_STORY_OR_COLLOCATION_SHAPE');
  const [pidx,sidx]=row.anchor.split(':').map(t=>Number(t.slice(1)));
  assert.ok(Number.isSafeInteger(pidx)&&pidx>=0&&
   Number.isSafeInteger(sidx)&&sidx>=0&&sidx<paragraph.segments.length,
   'REAL_PROOF_ANCHOR_OUT_OF_BOUNDS');
  const seg=paragraph.segments[sidx];
  assert.ok(seg?.wordId===row.legacy_word_id&&
   meaning(seg?.gloss)===meaning(row.old_meaning)&&
   typeof seg?.surface==='string'&&tidy(seg.surface),
   'REAL_PROOF_SEGMENT_ID_GLOSS_OR_SURFACE_CHANGED');
  const originalCard=[row.legacy_word_id,row.old_headword,row.old_uk,
   row.old_us,row.old_pos,row.old_meaning,row.old_en,row.old_zh,
   row.old_collocations];
  assert.ok(HEX.test(row.old_card_sha256??'')&&
   sha(JSON.stringify(originalCard))===row.old_card_sha256,
   'REAL_PROOF_OLD_CARD_SHA256_MISMATCH');
  cards.push({book_id:row.book_id,book_title:row.book_title,
   category_id:row.category_id,chapter_id:row.chapter_id,
   chapter_no:row.chapter_no,chapter_title:row.chapter_title,
   anchor:row.anchor,legacy_word_id:row.legacy_word_id,
   old_card_sha256:row.old_card_sha256,old_headword:row.old_headword,
   part_of_speech:row.old_pos,meaning_zh:row.old_meaning,
   phonetic_uk:row.old_uk,phonetic_us:row.old_us,
   example_en:row.old_en,example_zh:row.old_zh,
   collocations_json:row.old_collocations,
   paragraph_json:row.paragraph_json,segment_surface:seg.surface,
   context_gloss:seg.gloss,context_paragraph_sha256:sha(row.paragraph_json)});
 }
 assert.ok(usedBooks.size===2&&usedOldIds.size===2,
  'REAL_PROOF_SAME_BOOK_OR_LEGACY_WORD');
 assert.equal(c.paired_cards.length,2);
 const fingerprint=sha(JSON.stringify(proof));
 const rights=Object.fromEntries(RIGHTS.map(k=>[k,{
  verified:false,rights_holder:'',license_reference:'',evidence_sha256:null}]));
 return {
  schema:'wordletter-real-published-two-book-editorial-intake-v1',
  source_proof_sha256:fingerprint,
  source_encrypted_artifact_id:13963540716,
  source_snapshot_artifact_id:13911979176,
  scope:'two_actual_published_production_novels_READ_ONLY_evidence',
  status:'REAL_TWO_BOOKS_CONTEXT_VERIFIED_EDITORIAL_AND_RIGHTS_HOLD',
  candidate:{headword:c.headword,part_of_speech:c.pos,
   meaning_zh:c.meaning_zh,original_textual_fingerprint_sha256:c.fingerprint_sha256,
   original_book_count:c.source_book_count,original_occurrences:c.occurrences,
   real_cards:cards},
  review_decision:{action:'HOLD',word_sense_verified:false,
   same_sense_across_books_verified:false,
   editor_identity:null,editor_signature:null,
   dictionary_entry_id:null,verified_source_key:null,
   teaching_example_rights_approved:false,
   rights,checks:Object.fromEntries(blockingChecks.map(k=>[k,{
    approved:false,evidence:null}])),
   authenticated_ops_signoff:false,approved_sense_id:null,
   license_audit_id:null},
  next_stage:'INDEPENDENT_DICT_ENTRY_LICENSE_AND_CONTENT_REVIEW_BEFORE_TEST_IMPORT',
  production_d1_writes:0,staging_d1_writes:0,
  user_study_changes:0,published_book_edits:0,
  actual_signed_off_senses:0,actual_legacy_links:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,4,'REAL_EDITORIAL_INTAKE_USAGE');
  const evidence=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const out=buildRealPublishedTwoBookEditorialIntake(evidence);
  writeFileSync(process.argv[3],JSON.stringify(out),{flag:'wx',mode:0o600});
  console.log('REAL_PUBLISHED_EDITORIAL_INTAKE_SAFE_COUNTS='+JSON.stringify({
   real_books:2,real_cards:2,verified_contexts:2,
   verified_commercial_rights:0,authenticated_approvals:0,db_writes:0}));
 }catch(e){console.error('REAL_PUBLISHED_EDITORIAL_INTAKE_BLOCKED',
   typeof e?.message==='string'&&/^[A-Z0-9_]+$/u.test(e.message)?
    e.message:'PRIVATE_PROOF_VALIDATION_FAILED');
  process.exitCode=1}
}
