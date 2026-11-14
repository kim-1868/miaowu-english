import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const pinnedReady=existsSync('/tmp/britfone.main.3.0.1.csv')&&
 existsSync('/tmp/britfone.LICENSE.txt');
import {buildOneSenseTwoBookBritfoneReview as review,
 privateHumanReviewText} from '../scripts/v12-real-two-card-britfone-uk-editorial-review.mjs';
function fixtures(){
 const row={headword:'record',pos:'n.',meaning_zh:'记录',
  example_en:'She kept a detailed record of the events.',
  example_zh:'她保存了这些事件的详细记录。',
  ipa_uk:{original:'/ˈrekɔːd/'},
  ipa_us:{old_card:'/ˈrɛkɚd/',
   status:'US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD',
   candidates:['/ˈrekərd/']},
  complete_32_book_snapshot_status:'EXACT_PUBLISHED_OLD_CARD_FIELDS_VERIFIED',
  commercial_source_license_signed_off:false,
  original_example_provenance_confirmed_per_card:false,
  editor_translation_approved:false,editor_pronunciation_approved:false,
  decision:'HOLD',real_ops_receipt:null,
  old_card_sha256:'d'.repeat(64),original_paragraph_sha256:'e'.repeat(64),
  flags:['ENGLISH_LENGTH_REVIEW']};
 return {schema:'wordletter-two-real-published-cards-complete-provenance-review-v1',
  status:'FULL_PUBLISHER_SOURCE_VERIFIED_US_IPA_CANDIDATE_CHECKED_EDITORIAL_HOLD',
  ops_authenticated_signature_present:false,actual_test_d1_import_allowed:false,
  original_review_sha256:'f'.repeat(64),source_snapshot_sha256:'a'.repeat(64),
  us_ipa_file_sha256:'b'.repeat(64),us_ipa_commit:'972cd67dd5f96bc5660e28070cde26e3928abcd7',
  counts:{verified_against_full_32_book_publisher_snapshot:2,
   actual_approved_teaching_senses:0,test_d1_writes:0,prod_d1_writes:0},
  reviewer_material_private:[
   {...row,book_id:'real-a',legacy_word_id:'old-a'},
   {...row,book_id:'real-b',legacy_word_id:'old-b',
    ipa_uk:{...row.ipa_uk},ipa_us:{...row.ipa_us,
     candidates:[...row.ipa_us.candidates]},flags:[...row.flags],
    old_card_sha256:'c'.repeat(64),original_paragraph_sha256:'7'.repeat(64)}]};
}
function sources(){
 const csv=readFileSync('/tmp/britfone.main.3.0.1.csv','utf8');
 const license=readFileSync('/tmp/britfone.LICENSE.txt','utf8');
 return {britfoneCSV:csv,licenseText:license};
}
test('locked MIT Britfone UK pronunciation source is real and creates ONE private review for TWO actual old cards',{skip:!pinnedReady},()=>{
 const r=review({prior:fixtures(),...sources()});
 assert.equal(r.status,'ONE_REAL_SENSE_UK_US_SOURCE_CANDIDATES_EDITORIAL_HOLD');
 assert.equal(r.counts.real_books,2);
 assert.equal(r.counts.real_old_cards,2);
 assert.equal(r.counts.distinct_reviewable_textual_sense_candidates,1);
 assert.equal(r.counts.duplicated_english_example_review_items_removed,1);
 assert.equal(r.counts.old_us_ipa_conflicts_remaining,1);
 assert.equal(r.counts.uk_britfone_headwords_found,1);
 assert.equal(r.original_editorial_review_private.editor_decision,'HOLD');
 assert.equal(r.original_editorial_review_private.legal_source_claim,undefined);
 assert.equal(r.original_editorial_review_private.uk.source_commit,
  '1062be14adc96c358f2087ac5449d72130c7a6f4');
 assert.equal(r.original_editorial_review_private.uk.declared_license,'MIT');
 assert.equal(r.source_notice_required_on_final_public_release,true);
 assert.equal(r.counts.approved_real_senses,0);
 assert.equal(r.counts.test_d1_writes,0);
 const txt=privateHumanReviewText(r);
 assert.match(txt,/真实首批词义/);
 assert.match(txt,/双书同义项/);
 assert.match(txt,/HOLD/);
});
test('history card or claimed commercial approval must fail closed',{skip:!pinnedReady},()=>{
 const alterations=[
  x=>x.reviewer_material_private[0].editor_pronunciation_approved=true,
  x=>x.reviewer_material_private[0].decision='APPROVED',
  x=>x.reviewer_material_private[1].example_en='a different string',
  x=>x.reviewer_material_private[1].ipa_uk.original='different',
  x=>x.reviewer_material_private[0].real_ops_receipt={fake:'yes'},
  x=>x.reviewer_material_private[0].old_card_sha256='bad',
  x=>x.reviewer_material_private[1].book_id=x.reviewer_material_private[0].book_id,
  x=>x.counts.test_d1_writes=1,
  x=>x.actual_test_d1_import_allowed=true
 ];
 for(const [i,a] of alterations.entries()){
  const x=fixtures();a(x);
  assert.throws(()=>review({prior:x,...sources()}),
   'MUTATION_MUST_FAIL_CLOSED_INDEX_'+i);
 }
});
test('tampered Britfone data or fake MIT license cannot become approved source candidate',{skip:!pinnedReady},()=>{
 const {britfoneCSV,licenseText}=sources(),base=fixtures();
 assert.throws(()=>review({prior:base,britfoneCSV:britfoneCSV+'x',licenseText}),
  /BRITFONE_(MAIN_GIT_BLOB_SHA_CHANGED|DICTIONARY_CSV_STRUCTURE_INVALID)/);
 assert.throws(()=>review({prior:base,britfoneCSV,licenseText:licenseText+'x'}),
  /BRITFONE_LICENSE_GIT_BLOB_SHA_CHANGED/);
});
test('protected job downloads exact old private artifact and fixed British MIT source, no remote D1',()=>{
 const w=readFileSync(
  '.github/workflows/v12-real-two-card-britfone-uk-editorial-review.yml','utf8');
 assert.ok(w.includes('13971555687'));
 assert.ok(w.includes('production-d1-readonly-approval'));
 assert.ok(w.includes('PRODUCTION_D1_METADATA_PASSPHRASE'));
 assert.ok(w.includes('1062be14adc96c358f2087ac5449d72130c7a6f4'));
 assert.ok(w.includes('britfone.main.3.0.1.csv'));
 assert.ok(w.includes('LICENSE.txt'));
 assert.ok(w.includes('actions/upload-artifact@v4'));
 assert.doesNotMatch(w,/CLOUDFLARE|wrangler d1|wrangler deploy|d1 migrations apply|deploy\/production/iu);
});
