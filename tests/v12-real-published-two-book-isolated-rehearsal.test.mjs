import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildRealPublishedTwoBookEditorialIntake} from
 '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {rehearseActualPublishedTwoBookSenseOverlay as rehearse} from
 '../scripts/v12-real-published-two-book-isolated-rehearsal.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function sourceProof(){
 const candidate={headword:'choice',pos:'n.',meaning_zh:'选择',
  fingerprint_sha256:'b'.repeat(64),source_book_count:2,occurrences:9,
  paired_cards:[]},rows=[];
 for(let i=0;i<2;i++){
  const book='real-publisher-book-'+i,legacy='existing-publisher-card-'+i;
  const p=JSON.stringify({segments:[{text:'这个场景里有一个'},
   {surface:'choice',wordId:legacy,gloss:'选择'},
   {text:'，人物要做出决定。'}]});
  const card={rank:i,book_id:book,category_id:'cet4',
   book_title:'实际出版书候选'+i,chapter_id:'novel-chapter-'+i,
   chapter_no:i+1,chapter_title:'第一章',
   legacy_word_id:legacy,anchor:'p3:s1',
   old_headword:'choice',old_uk:'/tʃɔɪs/',old_us:'/tʃɔɪs/',
   old_pos:'n.',old_meaning:'选择',
   old_en:'She made a careful choice.',
   old_zh:'她做出了谨慎的选择。',old_collocations:'[]',
   paragraph_json:p,segment_word_id:legacy,segment_gloss:'选择'};
  card.old_card_sha256=sha(JSON.stringify([legacy,'choice','/tʃɔɪs/',
   '/tʃɔɪs/','n.','选择',card.old_en,card.old_zh,'[]']));
  candidate.paired_cards.push({book_id:book,old_word_id:legacy,
   phonetic_uk:card.old_uk,phonetic_us:card.old_us,
   example_en:card.old_en,example_zh:card.old_zh});
  rows.push(card);
 }
 return {schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  editorial_candidate:candidate,verified_actual_published_contexts:rows,
  source_artifact_id:13911979176,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0};
}
function source(){return buildRealPublishedTwoBookEditorialIntake(sourceProof())}
test('two actual publisher old cards and nonzero paragraph anchor share ONE sense in disposable in-memory reader',async()=>{
 const r=await rehearse(source());
 assert.equal(r.status,'REAL_SOURCE_TWO_BOOK_ISOLATED_TECHNICAL_QA_ONLY');
 assert.equal(r.actual_real_source_books,2);
 assert.equal(r.actual_real_source_old_cards,2);
 assert.equal(r.verified_isolated_reader_anchors,2);
 assert.equal(r.same_isolated_qa_sense_id,true);
 assert.equal(r.cryptographic_card_guards_passed,true);
 assert.equal(r.source_commercial_rights_verified,false);
 assert.equal(r.actual_ops_editorial_signoff,false);
 assert.equal(r.real_approved_teaching_senses_created,0);
 assert.equal(r.real_staging_legacy_links_created,0);
 assert.equal(r.production_db_writes,0);
 assert.equal(r.staging_db_writes,0);
 assert.equal(r.user_learning_changes,0);
 assert.match(r.database,/memory/);
});
test('stale SHA, mismatched gloss/paragraph and incomplete card abort even locally',async()=>{
 const variants=[
  x=>{x.candidate.real_cards[0].old_card_sha256='0'.repeat(64)},
  x=>{x.candidate.real_cards[0].context_paragraph_sha256='1'.repeat(64)},
  x=>{x.candidate.real_cards[0].context_gloss='否决'},
  x=>{x.candidate.real_cards[0].segment_surface='changed'},
  x=>{x.candidate.real_cards[0].anchor='p3:s10'},
  x=>{x.candidate.real_cards[0].example_en='different'},
  x=>{x.candidate.real_cards[0].book_id='qa-hidden'},
  x=>{x.candidate.real_cards[1].book_id=x.candidate.real_cards[0].book_id},
  x=>{x.candidate.real_cards[1].phonetic_us='different'},
 ];
 for(const change of variants){
  const x=source();change(x);
  await assert.rejects(rehearse(x));
 }
});
test('no fake commercial approval or OPS decision can enter the technical rehearsal',async()=>{
 const variants=[
  x=>{x.status='REVIEWED_AND_APPROVED'},
  x=>{x.review_decision.action='request_signoff'},
  x=>{x.review_decision.rights.english_example.verified=true},
  x=>{x.review_decision.checks.same_word_sense.approved=true},
  x=>{x.review_decision.dictionary_entry_id='gdict_'+'f'.repeat(24)},
  x=>{x.review_decision.authenticated_ops_signoff=true},
  x=>{x.actual_signed_off_senses=1},
  x=>{x.production_d1_writes=1},
  x=>{x.staging_d1_writes=1},
 ];
 for(const change of variants){
  const x=source();change(x);
  await assert.rejects(rehearse(x));
 }
});
test('protected real-proof job cannot access any Cloudflare D1 or production deploy',()=>{
 const workflow=readFileSync(
  '.github/workflows/v12-real-published-two-book-isolated-rehearsal.yml','utf8');
 assert.match(workflow,/production-d1-readonly-approval/);
 assert.match(workflow,/13964630089/);
 assert.match(workflow,/PRODUCTION_D1_METADATA_PASSPHRASE/);
 assert.match(workflow,/REAL_SOURCE_TWO_BOOK_IN_MEMORY_QA/);
 assert.doesNotMatch(workflow,/CLOUDFLARE|wrangler|d1 execute|d1 migrations|deploy\/production/i);
});
