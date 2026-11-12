// REAL Publisher A/B old-card proof, ISOLATED in-memory SQLite rehearsal ONLY.
// This intentionally uses a disposable QA source/approval INSIDE :memory:.
// It is NOT commercial authorization, an OPS signoff, a TEST D1 import or a
// production learning binding. No network/database connector is present.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {listPublishedApprovedLegacySenseAnchors,
 lookupPublishedApprovedLegacySenseContext}
 from '../src/global-dictionary-published-approved-legacy-overlay.js';

const sha=x=>createHash('sha256').update(x).digest('hex');
const ID=/^[a-z0-9_-]{1,80}$/iu;
const HEX=/^[a-f0-9]{64}$/u;
const ANCHOR=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const N=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const POS=x=>N(x).toLowerCase().replace(/[.。]/gu,'');
const LOWER=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const QA=/^(?:qa-|draft-|internal-|mw-v12-pilot-)/iu;
const QA_SOURCE='wordletter-internal-qa-real-proof-isolated-never-commercial';
const QA_REVIEWER='ISOLATED_QA_NOT_AUTHENTICATED_EDITOR';

function validate(packet){
 assert.equal(packet?.schema,'wordletter-real-published-two-book-editorial-intake-v1',
  'ISOLATED_REAL_PACKET_WRONG_SCHEMA');
 assert.equal(packet?.status,
  'REAL_TWO_BOOKS_CONTEXT_VERIFIED_EDITORIAL_AND_RIGHTS_HOLD',
  'ISOLATED_REAL_PROOF_NOT_HOLD');
 assert.equal(packet?.scope,
  'two_actual_published_production_novels_READ_ONLY_evidence',
  'ISOLATED_REAL_PROOF_SCOPE_INVALID');
 assert.equal(packet?.source_encrypted_artifact_id,13963540716,
  'ISOLATED_REAL_PROOF_SOURCE_ARTIFACT_CHANGED');
 assert.ok(HEX.test(packet?.source_proof_sha256??''),
  'ISOLATED_REAL_PROOF_DIGEST_REQUIRED');
 for(const [key,expected] of Object.entries({
  production_d1_writes:0,staging_d1_writes:0,user_study_changes:0,
  published_book_edits:0,actual_signed_off_senses:0,actual_legacy_links:0}))
  assert.equal(packet[key],expected,'ISOLATED_REAL_PROOF_FORGED_APPROVAL_'+key);
 const dec=packet?.review_decision;
 assert.equal(dec?.action,'HOLD');
 assert.equal(dec.authenticated_ops_signoff,false);
 assert.equal(dec.approved_sense_id,null);
 assert.equal(dec.dictionary_entry_id,null);
 assert.equal(dec.editor_signature,null);
 assert.equal(dec.teaching_example_rights_approved,false);
 assert.equal(dec.word_sense_verified,false);
 assert.equal(dec.same_sense_across_books_verified,false);
 assert.ok(dec.rights&&Object.values(dec.rights).length>=7&&
  Object.values(dec.rights).every(x=>x?.verified===false),
  'ISOLATED_REAL_PROOF_RIGHTS_PRETENDED');
 assert.ok(dec.checks&&Object.values(dec.checks).length>=10&&
  Object.values(dec.checks).every(x=>x?.approved===false),
  'ISOLATED_REAL_PROOF_REVIEW_PRETENDED');
 const c=packet?.candidate,cards=c?.real_cards;
 assert.ok(c&&typeof c.headword==='string'&&N(c.headword)&&
  typeof c.part_of_speech==='string'&&N(c.part_of_speech)&&
  typeof c.meaning_zh==='string'&&N(c.meaning_zh)&&
  HEX.test(c.original_textual_fingerprint_sha256??'')&&
  Array.isArray(cards)&&cards.length===2,
  'ISOLATED_REAL_PROOF_INVALID_CARD_PAIR');
 assert.ok(cards[0].book_id!==cards[1].book_id&&
  cards[0].legacy_word_id!==cards[1].legacy_word_id,
  'ISOLATED_REAL_PROOF_SAME_BOOK_OR_WORD');
 for(const card of cards){
  assert.ok(ID.test(card.book_id??'')&&!QA.test(card.book_id)&&
   ID.test(card.chapter_id??'')&&ID.test(card.legacy_word_id??'')&&
   typeof card.category_id==='string'&&card.category_id.length>0&&
   Number.isSafeInteger(card.chapter_no)&&card.chapter_no>0&&
   ANCHOR.test(card.anchor??'')&&
   HEX.test(card.old_card_sha256??'')&&
   HEX.test(card.context_paragraph_sha256??''),
   'ISOLATED_REAL_PROOF_INVALID_ID_OR_ANCHOR');
  assert.equal(LOWER(card.old_headword),LOWER(c.headword));
  assert.equal(POS(card.part_of_speech),POS(c.part_of_speech));
  assert.equal(N(card.meaning_zh),N(c.meaning_zh));
  assert.equal(N(card.context_gloss),N(c.meaning_zh));
  assert.ok([card.phonetic_uk,card.phonetic_us,card.example_en,
   card.example_zh,card.old_headword].every(x=>typeof x==='string'&&x.trim()),
   'ISOLATED_REAL_PROOF_INCOMPLETE_CARD');
  const cardVals=[card.legacy_word_id,card.old_headword,
   card.phonetic_uk,card.phonetic_us,card.part_of_speech,
   card.meaning_zh,card.example_en,card.example_zh,card.collocations_json];
  assert.equal(sha(JSON.stringify(cardVals)),card.old_card_sha256,
   'ISOLATED_REAL_PROOF_CARD_SHA_CHANGED');
  assert.equal(sha(card.paragraph_json),card.context_paragraph_sha256,
   'ISOLATED_REAL_PROOF_CONTEXT_SHA_CHANGED');
  let p,collocations;
  try{p=JSON.parse(card.paragraph_json);
    collocations=JSON.parse(card.collocations_json)}
  catch{throw Error('ISOLATED_REAL_PROOF_INVALID_JSON')}
  assert.ok(Array.isArray(p?.segments)&&Array.isArray(collocations),
   'ISOLATED_REAL_PROOF_INVALID_PARAGRAPH_OR_COLLOCATIONS');
  const [,seg]=card.anchor.split(':').map(t=>Number(t.slice(1)));
  assert.ok(p.segments.length>seg,'ISOLATED_REAL_PROOF_SEGMENT_NOT_FOUND');
  assert.equal(p.segments[seg]?.wordId,card.legacy_word_id,
   'ISOLATED_REAL_PROOF_SEGMENT_WRONG_WORD');
  assert.equal(N(p.segments[seg]?.gloss),N(c.meaning_zh),
   'ISOLATED_REAL_PROOF_SEGMENT_GLOSS_MISMATCH');
  assert.equal(p.segments[seg]?.surface,card.segment_surface,
   'ISOLATED_REAL_PROOF_SEGMENT_SURFACE_MISMATCH');
 }
 // Shared technical sense only safe if original old-card IPA/examples are
 // bitwise identical; different editorial values must remain HOLD.
 for(const name of ['phonetic_uk','phonetic_us','example_en','example_zh'])
  assert.equal(cards[0][name],cards[1][name],
   'ISOLATED_REAL_PROOF_CROSSBOOK_CARD_DIFF_'+name);
 return cards;
}
function init(){
 const db=new DatabaseSync(':memory:');
 // :memory: is the ONLY database, never Wrangler, not a local disk file.
 const migration=name=>readFileSync(new URL('../db/'+name,import.meta.url),'utf8');
 db.exec(migration('001_schema.sql'));
 for(const f of ['013_global_dictionary.sql','016_global_dictionary_lessons.sql',
  '018_global_dictionary_reviewed_senses.sql','020_global_dictionary_sense_study.sql'])
  db.exec(migration(f));
 return db;
}
class D1ReadAdapter{
 constructor(db){this.db=db}
 prepare(sql){const db=this.db;return {bind(...args){return {
  all:async()=>({results:db.prepare(sql).all(...args)})
 }}}}
}
export async function rehearseActualPublishedTwoBookSenseOverlay(packet){
 const cards=validate(packet),db=init();
 try{
  const candidate=packet.candidate;
  const entryId='gdict_'+sha('in-memory-qa-entry:'+LOWER(candidate.headword)).slice(0,24);
  const senseId='gds_'+sha('in-memory-qa-sense:'+LOWER(candidate.headword)+
   '\0'+POS(candidate.part_of_speech)+'\0'+N(candidate.meaning_zh)).slice(0,24);
  const now='2026-11-13T00:00:00Z';
  const s=db.prepare('INSERT INTO global_dictionary_sources'+
   ' (source_key,license_name,license_reviewed,source_sha256,imported_at,enabled)'+
   ' VALUES(?,?,?,?,?,?)');
  s.run(QA_SOURCE,'ISOLATED TEST MEMORY ONLY NOT COMMERCIAL RIGHTS',1,
   sha(packet.source_proof_sha256),now,1);
  db.prepare('INSERT INTO global_dictionary_entries'+
   ' (entry_id,headword,source_name,teaching_ready,reviewed_at)'+
   ' VALUES(?,?,?,?,?)').run(entryId,candidate.headword,QA_SOURCE,1,now);
  const first=cards[0];
  db.prepare('INSERT INTO global_dictionary_lessons'+
   ' (entry_id,headword,senses_json,phonetic_uk,phonetic_us,part_of_speech,'+
   'meaning_zh,example_en,example_zh,collocations_json,reviewed_by,reviewed_at)'+
   ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(entryId,candidate.headword,
    JSON.stringify([{pos:candidate.part_of_speech,meaningZh:candidate.meaning_zh,
     exampleEn:first.example_en,exampleZh:first.example_zh}]),
    first.phonetic_uk,first.phonetic_us,candidate.part_of_speech,
    candidate.meaning_zh,first.example_en,first.example_zh,
    first.collocations_json,QA_REVIEWER,now);
  db.prepare('INSERT INTO global_dictionary_senses'+
   ' (sense_id,entry_id,pos,meaning_zh,example_en,example_zh,'+
   'reviewed_by,reviewed_at,approved,active) VALUES(?,?,?,?,?,?,?,?,1,1)')
   .run(senseId,entryId,candidate.part_of_speech,candidate.meaning_zh,
    first.example_en,first.example_zh,QA_REVIEWER,now);
  for(let i=0;i<2;i++){
   const c=cards[i];
   db.prepare('INSERT OR IGNORE INTO categories(id,slug,title,is_visible)'+
    ' VALUES(?,?,?,1)').run(c.category_id,'isolated-cat-'+i,'ISOLATED_PRIVATE_QA');
   db.prepare('INSERT INTO books(id,category_id,title,status,sort_order)'+
    ' VALUES(?,?,?, ?,0)').run(c.book_id,c.category_id,c.book_title,'published');
   const pindex=Number(c.anchor.split(':')[0].slice(1));
   assert.ok(pindex>=0&&pindex<=2000,
    'ISOLATED_REAL_PROOF_EXCESSIVE_CONTEXT_INDEX');
   const paragraphs=Array.from({length:pindex+1},()=>({
    segments:[{text:'INTERNAL_QA_PLACEHOLDER_NOT_REAL_NOVEL'}]}));
   paragraphs[pindex]=JSON.parse(c.paragraph_json);
   // Only ONE real paragraph is carried into disposable SQLite, not the book.
   db.prepare('INSERT INTO chapters'+
    ' (id,book_id,chapter_no,title,content_json,is_preview,published_at)'+
    ' VALUES(?,?,?,?,?,1,?)')
    .run(c.chapter_id,c.book_id,c.chapter_no,c.chapter_title,
     JSON.stringify({paragraphs}),now);
   db.prepare('INSERT INTO words'+
    ' (id,headword,phonetic_uk,phonetic_us,part_of_speech,meaning_zh,'+
    'example_en,example_zh,collocations_json) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(c.legacy_word_id,c.old_headword,c.phonetic_uk,c.phonetic_us,
     c.part_of_speech,c.meaning_zh,c.example_en,c.example_zh,c.collocations_json);
   db.prepare('INSERT INTO chapter_words'+
    ' (chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)')
    .run(c.chapter_id,c.legacy_word_id,'ISOLATED_ONLY',c.anchor);
   db.prepare('INSERT INTO global_dictionary_legacy_sense_links'+
    ' (legacy_word_id,sense_id,old_card_sha256,reviewed_by,reviewed_at,review_note)'+
    ' VALUES(?,?,?,?,?,?)')
    .run(c.legacy_word_id,senseId,c.old_card_sha256,QA_REVIEWER,now,
     'IN_MEMORY_NONCOMMERCIAL_QA_NOT_OPS_APPROVAL');
  }
  const adapter=new D1ReadAdapter(db);
  const result=await Promise.all(cards.map(c=>
   listPublishedApprovedLegacySenseAnchors(adapter,{
    chapterId:c.chapter_id,userId:'isolated-private-qa'})));
  assert.ok(result.every(x=>x.anchors.length===1&&x.anchors[0].sense_id===senseId),
   'ISOLATED_REAL_TWO_BOOKS_OVERLAY_NOT_SHARED');
  for(let i=0;i<2;i++){
   const c=cards[i],context=await lookupPublishedApprovedLegacySenseContext(adapter,{
    chapterId:c.chapter_id,userId:'isolated-private-qa',
    anchor:c.anchor,senseId});
   assert.ok(context&&context.book_id===c.book_id&&
    context.sense_id===senseId&&context.entry_id===entryId,
    'ISOLATED_REAL_CARD_CONTEXT_NOT_MATCHED');
  }
  const count=q=>db.prepare(q).get().n;
  assert.equal(count('SELECT count(*) n FROM global_dictionary_legacy_sense_links'),2);
  assert.equal(count('SELECT count(*) n FROM user_words'),0);
  assert.equal(count('SELECT count(*) n FROM user_dictionary_sense_study'),0);
  assert.equal(count('SELECT count(*) n FROM user_dictionary_sense_review_events'),0);
  assert.equal(count('SELECT count(*) n FROM reading_progress'),0);
  return {status:'REAL_SOURCE_TWO_BOOK_ISOLATED_TECHNICAL_QA_ONLY',
   source_encrypted_artifact_id:13964630089,
   actual_real_source_books:2,actual_real_source_old_cards:2,
   verified_isolated_reader_anchors:2,
   same_isolated_qa_sense_id:true,cryptographic_card_guards_passed:true,
   source_commercial_rights_verified:false,
   actual_ops_editorial_signoff:false,
   real_approved_teaching_senses_created:0,
   real_staging_legacy_links_created:0,
   production_db_writes:0,staging_db_writes:0,user_learning_changes:0,
   database:'SQLite :memory: discarded after test'};
 }finally{db.close()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3,'ISOLATED_REAL_CONTEXT_USAGE');
  const packet=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const out=await rehearseActualPublishedTwoBookSenseOverlay(packet);
  // Summary only: never log private card ids, book names or prose.
  console.log('REAL_SOURCE_TWO_BOOK_IN_MEMORY_QA='+JSON.stringify(out));
 }catch(e){
  console.error('REAL_SOURCE_TWO_BOOK_IN_MEMORY_QA_BLOCKED',
   /^[A-Z0-9_]+$/u.test(String(e.message))?e.message:'PRIVATE_REHEARSAL_VALIDATION_FAILED');
  process.exitCode=1;
 }
}
