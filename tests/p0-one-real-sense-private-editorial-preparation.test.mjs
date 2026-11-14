import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildRealPublishedTwoBookEditorialIntake}
 from '../scripts/v12-real-published-two-book-editorial-intake.mjs';
import {preparePrivateReview}
 from '../scripts/p0-one-real-sense-private-editorial-preparation.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const c={headword:'record',pos:'n.',meaning_zh:'记录',
  fingerprint_sha256:'f'.repeat(64),source_book_count:2,occurrences:17,
  paired_cards:[]},rows=[];
 for(let i=0;i<2;i++){
  const book='published-real-book-'+i,old='old-card-'+i;
  const paragraph=JSON.stringify({segments:[
   {text:'她把事情写成一份'},{surface:'record',wordId:old,gloss:'记录'},
   {text:'，后来反复核对。'}]});
  const row={rank:i,book_id:book,book_title:'小说'+i,category_id:'cet4',
   chapter_id:'published-real-ch-'+i,chapter_no:i+1,chapter_title:'第'+(i+1)+'章',
   legacy_word_id:old,anchor:'p0:s1',old_headword:'record',
   old_uk:'/ˈrekɔːd/',old_us:'/ˈrekərd/',old_pos:'n.',old_meaning:'记录',
   old_en:'She kept a detailed record of the events.',
   old_zh:'她详细记录了这些事件。',old_collocations:'[]',
   paragraph_json:paragraph,segment_word_id:old,segment_gloss:'记录'};
  row.old_card_sha256=sha(JSON.stringify([old,row.old_headword,row.old_uk,
   row.old_us,row.old_pos,row.old_meaning,row.old_en,row.old_zh,
   row.old_collocations]));
  c.paired_cards.push({book_id:book,old_word_id:old,phonetic_uk:row.old_uk,
   phonetic_us:row.old_us,example_en:row.old_en,example_zh:row.old_zh});
  rows.push(row);
 }
 const proof={schema:'wordletter-real-production-2book-context-evidence-v1',
  status:'REAL_PUBLISHED_CONTEXT_EVIDENCE_ONLY_NOT_APPROVED',
  source_artifact_id:13911979176,editorial_candidate:c,
  verified_actual_published_contexts:rows,approved_sense_id:null,
  commercial_license_verified:false,authenticated_ops_signoff:false,
  bound_staging_legacy_word_ids:0,production_writes:0,
  customer_study_writes:0,staging_writes:0};
 const packet=buildRealPublishedTwoBookEditorialIntake(proof);
 const cards=packet.candidate.real_cards;
 const uk={schema:'wordletter-real-one-sense-two-books-licensed-uk-ipa-preflight-v1',
  status:'ONE_REAL_SENSE_UK_US_SOURCE_CANDIDATES_EDITORIAL_HOLD',
  counts:{real_books:2,real_old_cards:2,
   distinct_reviewable_textual_sense_candidates:1,
   approved_real_senses:0,test_d1_writes:0},
  original_editorial_review_private:{
   headword:c.headword,pos:c.pos,meaning_zh:c.meaning_zh,
   example_en:rows[0].old_en,example_zh:rows[0].old_zh,
   old_uk_ipa:rows[0].old_uk,old_us_ipa:rows[0].old_us,
   two_book_ids:cards.map(x=>x.book_id),
   two_old_card_ids:cards.map(x=>x.legacy_word_id),
   original_legacy_card_sha256:cards.map(x=>x.old_card_sha256),
   original_context_sha256:cards.map(x=>x.context_paragraph_sha256),
   english_example_reviewer_flags:['ENGLISH_LENGTH_REVIEW'],
   editor_decision:'HOLD',ops_signed:false,
   us:{source_commit:'972cd67dd5f96bc5660e28070cde26e3928abcd7',
    candidates:['/ˈrɛkərd/'],old_ipa_status:'US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD'},
   uk:{source_commit:'1062be14adc96c358f2087ac5449d72130c7a6f4',
    candidates:['/ˈrekɔːd/'],status:'MIT_UK_CANDIDATES_DIFFER_FROM_OLD_CARD'}
  }};
 return {packet,uk};
}
test('two real-book shaped cards -> ONE private review with old SHA and paragraphs preserved',()=>{
 const {packet,uk}=fixture(),r=preparePrivateReview(packet,uk);
 assert.equal(r.safe.real_published_books,2);
 assert.equal(r.safe.rights_pending,7);
 assert.equal(r.safe.editor_checks_pending,10);
 assert.equal(r.safe.approved_real_senses,0);
 assert.equal(r.safe.test_writes,0);
 assert.equal(r.privateReport.status,'HOLD_PENDING_INDEPENDENT_LANGUAGE_AND_RIGHTS_REVIEW');
 assert.equal(r.privateReport.mechanical_checks.sameMeaning,true);
 assert.equal(r.privateReport.books[0].context_sha256,
  packet.candidate.real_cards[0].context_paragraph_sha256);
 assert.match(r.md,/小说0/);
 assert.equal(r.clearance.is_approved,false);
 assert.ok(Object.values(r.clearance.rights).every(x=>x.verified===false));
 assert.ok(r.privateReport.source_inventory.some(x=>x.material.startsWith('音频')));
});
test('changing old card, translated meaning, candidate provenance or claim of approved sense is forbidden',()=>{
 const {packet,uk}=fixture();
 const bad=[
  [p=>p.candidate.real_cards[0].example_en='changed',u=>{}],
  [p=>p.candidate.real_cards[0].meaning_zh='另一个',u=>{}],
  [p=>{},u=>u.original_editorial_review_private.old_us_ipa='mismatch'],
  [p=>{},u=>u.original_editorial_review_private.two_book_ids.reverse()],
  [p=>{},u=>u.counts.approved_real_senses=1]
 ];
 for(const [a,b] of bad){
  const p=structuredClone(packet),u=structuredClone(uk);a(p);b(u);
  assert.throws(()=>preparePrivateReview(p,u));
 }
});
test('never machine-sign language/license, never import, never release production',()=>{
 const r=preparePrivateReview(...Object.values(fixture()));
 assert.equal(r.privateReport.approval,false);
 assert.equal(r.privateReport.rights_signed,0);
 assert.equal(r.privateReport.language_signed,0);
 assert.equal(r.privateReport.ops_receipts,0);
 assert.equal(r.privateReport.production_writes,0);
 assert.ok(r.md.includes('HOLD'));
 assert.match(r.md,/不同具体词义/);
});
