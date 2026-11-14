import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileTwoRealPublishedCards as reconcile}
 from '../scripts/v12-real-two-card-full-snapshot-us-ipa-audit.mjs';
const knownUS='972cd67dd5f96bc5660e28070cde26e3928abcd7';
function fixture(){
 const a={book_id:'real-publisher-a',legacy_word_id:'word-abc',
  headword:'record',part_of_speech:'n.',meaning_zh:'记录',
  phonetic_uk:'/ˈrekɔːd/',phonetic_us:'/ˈrɛkɚd/',
  example_en:'She kept a detailed record of the events.',
  example_zh:'她保存了这些事件的详细记录。',
  original_card_sha256:'a'.repeat(64),paragraph_sha256:'b'.repeat(64),
  historical_register_status:'NO_EXACT_LEGACY_CARD_ID_IN_20261110_REGISTER',
  decision:'HOLD',authenticated_ops_signoff:false,
  individual_example_provenance_signed:false,heuristic_flags:['ENGLISH_LENGTH_REVIEW']};
 const b={...a,book_id:'real-publisher-b',legacy_word_id:'word-def',
  original_card_sha256:'c'.repeat(64),paragraph_sha256:'d'.repeat(64)};
 const review={schema:'wordletter-real-two-card-private-content-review-v1',
  status:'PRIVATE_AUTOMATED_CONTENT_PRECHECK_HUMAN_SIGNOFF_REQUIRED',
  source_proof_sha256:'e'.repeat(64),candidate_sha256:'f'.repeat(64),
  commercial_approval:false,actual_test_database_imports:0,
  counts:{real_cards:2,old_ids_not_in_register:2,database_writes:0},
  private_review_cards:[a,b]};
 const original={book_id:a.book_id,old_word_id:a.legacy_word_id,
  phonetic_uk:a.phonetic_uk,phonetic_us:a.phonetic_us,
  example_en:a.example_en,example_zh:a.example_zh,occurrences:3};
 const originalB={...original,book_id:b.book_id,old_word_id:b.legacy_word_id};
 const group={headword:'record',pos:'n.',meaning_zh:'记录',
  legacy_word_ids:[a.legacy_word_id,b.legacy_word_id],
  book_ids:[a.book_id,b.book_id],
  card_evidence:[original,originalB],editor_decision:'HOLD'};
 const blank=()=>({headword:'placeholder',pos:'n.',meaning_zh:'匿名',
  legacy_word_ids:[],book_ids:[],card_evidence:[],editor_decision:'HOLD'});
 const queue={status:'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  all_records_private:true,created_approvals:0,production_writes:0,
  counts:{published_books:32,published_anchor_occurrences:8444,
   distinct_old_word_ids:3433,distinct_headwords:1585,
   textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
   duplicate_excess_old_ids:1452},
  duplicate_review_queue:[group,...Array.from({length:531},blank)],
  other_candidate_groups:Array.from({length:1449},blank)};
 const US=Array.from({length:30010},(_,i)=>'dummy'+i+'\t/ˈdʌmi/').join('\n')
   +'\nrecord\t/ˈrɛkɚd/\nrecord\t/ɹɪˈkɔɹd/';
 return {review,queue,usIpaText:US};
}
test('2 real old cards absent from 305 register match full 32-book encrypted source',()=>{
 const f=fixture(),r=reconcile({
  privateReview:f.review,publisherQueue:f.queue,usIpaText:f.usIpaText});
 assert.equal(r.status,'FULL_PUBLISHER_SOURCE_VERIFIED_US_IPA_CANDIDATE_CHECKED_EDITORIAL_HOLD');
 assert.equal(r.counts.verified_against_full_32_book_publisher_snapshot,2);
 assert.equal(r.counts.old_ids_missing_from_small_305_register,2);
 assert.equal(r.counts.us_ipa_candidates_present,2);
 assert.equal(r.counts.us_ipa_candidate_text_match,2);
 assert.equal(r.counts.unique_us_ipa_ambiguous,2);
 assert.equal(r.counts.automated_heuristic_flag_counts.ENGLISH_LENGTH_REVIEW,2);
 assert.equal(r.us_ipa_commit,knownUS);
 assert.equal(r.ops_authenticated_signature_present,false);
 assert.equal(r.actual_test_d1_import_allowed,false);
 assert.equal(r.counts.actual_approved_teaching_senses,0);
 assert.equal(r.counts.test_d1_writes,0);
 assert.equal(r.counts.prod_d1_writes,0);
 assert.ok(r.reviewer_material_private.every(c=>
  c.complete_32_book_snapshot_status==='EXACT_PUBLISHED_OLD_CARD_FIELDS_VERIFIED'));
});
test('two card source or IPA variants disagreement never auto approves',()=>{
 const f=fixture();f.usIpaText=f.usIpaText.replace('/ˈrɛkɚd/','/ˈrəkoʊrd/');
 const r=reconcile({
  privateReview:f.review,publisherQueue:f.queue,usIpaText:f.usIpaText});
 assert.equal(r.counts.us_ipa_candidate_text_match,0);
 assert.equal(r.counts.us_ipa_candidates_differ,2);
 assert.equal(r.counts.actual_approved_teaching_senses,0);
});
test('forged origin, source change or signoff blocks audit',()=>{
 const change=[
  f=>{f.queue.duplicate_review_queue[0].card_evidence[0].example_en='changed'},
  f=>{f.queue.duplicate_review_queue[0].card_evidence[0].phonetic_us='changed'},
  f=>{f.queue.duplicate_review_queue[0].book_ids=[]},
  f=>{f.review.private_review_cards[0].legacy_word_id='different'},
  f=>{f.review.private_review_cards[0].authenticated_ops_signoff=true},
  f=>{f.review.commercial_approval=true},
  f=>{f.review.counts.old_ids_not_in_register=0},
  f=>{f.queue.counts.published_books=31},
  f=>{f.queue.duplicate_review_queue[0].editor_decision='APPROVED'},
  f=>{f.queue.production_writes=1}
 ];
 for(const mutate of change){const f=fixture();mutate(f);
  assert.throws(()=>reconcile({
   privateReview:f.review,publisherQueue:f.queue,usIpaText:f.usIpaText}));
 }
});
test('full snapshot protected workflow downloads only old encrypted artifact and fixed public US IPA, never remote D1',()=>{
 const w=readFileSync('.github/workflows/v12-real-two-card-full-source-us-ipa-audit.yml','utf8');
 assert.match(w,/13967904583/);
 assert.match(w,/13911979176/);
 assert.match(w,/production-d1-readonly-approval/);
 assert.match(w,/PRODUCTION_D1_METADATA_PASSPHRASE/);
 assert.match(w,/972cd67dd5f96bc5660e28070cde26e3928abcd7/);
 assert.match(w,/en_US\.txt/);
 assert.match(w,/actions\/upload-artifact@v4/);
 assert.doesNotMatch(w,/CLOUDFLARE|wrangler|d1 execute|d1 migrations|deploy\/production/iu);
});
