// Stage-1 real publisher editorial acceleration: one sense review for two
// proven real books, independent UK pronunciation candidates from MIT Britfone.
// This is NOT final pronunciation, original third-party rights or OPS approval.
// Source proof/copyright/paid prose must never appear in public CI or logs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha256=s=>createHash('sha256').update(s).digest('hex');
const gitBlob=s=>{const b=Buffer.from(s,'utf8');return createHash('sha1').update(
 'blob '+b.length+'\0').update(b).digest('hex')};
const HEAD='1062be14adc96c358f2087ac5449d72130c7a6f4';
const MAIN_BLOB='51a54c553812b06a8f464f5aa85f4df2e6edb645';
const LICENSE_BLOB='bf1fa2c81fd2585be0c9304fb9eaf56fdf549c41';
const HEX=/^[0-9a-f]{64}$/u;
const tidy=x=>String(x??'').normalize('NFKC').trim();
const headword=x=>tidy(x).toLowerCase().replaceAll('’',"'");
const ipa=x=>tidy(x).replace(/^[/\[]|[/\]]$/gu,'')
 .replace(/\s+/gu,'').replaceAll('ɹ','r')
 .replaceAll('ɛ','e').replaceAll('ɐ','ʌ')
 .replaceAll(':','ː');
function parseBritfone(raw,license){
 assert.ok(typeof raw==='string'&&raw.length>250000&&raw.length<1500000,
  'BRITFONE_PINNED_DICTIONARY_SIZE_CHANGED');
 assert.equal(gitBlob(raw),MAIN_BLOB,'BRITFONE_MAIN_GIT_BLOB_SHA_CHANGED');
 assert.equal(gitBlob(license),LICENSE_BLOB,
  'BRITFONE_LICENSE_GIT_BLOB_SHA_CHANGED');
 assert.match(license,/MIT License/u);
 assert.match(license,/Jose Llarena/u);
 const map=new Map();let valid=0,variants=0;
 for(const row of raw.split(/\r?\n/gu)){
  if(!row.trim())continue;
  const comma=row.indexOf(',');
  assert.ok(comma>0&&comma<120,'BRITFONE_DICTIONARY_CSV_STRUCTURE_INVALID');
  let spelling=tidy(row.slice(0,comma));
  const pron=tidy(row.slice(comma+1));
  assert.ok(spelling&&pron&&pron.length<160,
   'BRITFONE_MAIN_ENTRY_INVALID');
  if(/\(\d+\)$/u.test(spelling)){spelling=spelling.replace(/\(\d+\)$/u,'');variants++}
  const lemma=headword(spelling.replaceAll('_',' '));
  assert.ok(lemma&&pron&&/^[^\u0000-\u001f]+$/u.test(pron));
  const e=map.get(lemma)??new Set();
  e.add('/'+pron.replace(/\s+/gu,'')+'/');
  map.set(lemma,e);valid++;
 }
 assert.ok(valid>13000,'BRITFONE_MAIN_TOO_FEW_WORDS');
 return {map,valid,variants};
}
function core(prior){
 assert.equal(prior?.schema,
  'wordletter-two-real-published-cards-complete-provenance-review-v1');
 assert.equal(prior?.status,
  'FULL_PUBLISHER_SOURCE_VERIFIED_US_IPA_CANDIDATE_CHECKED_EDITORIAL_HOLD');
 assert.equal(prior?.ops_authenticated_signature_present,false);
 assert.equal(prior?.actual_test_d1_import_allowed,false);
 assert.equal(prior?.counts?.verified_against_full_32_book_publisher_snapshot,2);
 assert.equal(prior?.counts?.actual_approved_teaching_senses,0);
 assert.equal(prior?.counts?.test_d1_writes,0);
 assert.equal(prior?.counts?.prod_d1_writes,0);
 assert.ok(HEX.test(prior.original_review_sha256||'')&&
  HEX.test(prior.source_snapshot_sha256||'')&&
  HEX.test(prior.us_ipa_file_sha256||''));
 const cards=prior.reviewer_material_private;
 assert.ok(Array.isArray(cards)&&cards.length===2);
 assert.notEqual(cards[0].book_id,cards[1].book_id);
 assert.notEqual(cards[0].legacy_word_id,cards[1].legacy_word_id);
 for(const c of cards){
  assert.equal(c.complete_32_book_snapshot_status,
   'EXACT_PUBLISHED_OLD_CARD_FIELDS_VERIFIED');
  assert.equal(c.decision,'HOLD');
  assert.equal(c.real_ops_receipt,null);
  assert.equal(c.commercial_source_license_signed_off,false);
  assert.equal(c.editor_translation_approved,false);
  assert.equal(c.editor_pronunciation_approved,false);
  assert.equal(c.original_example_provenance_confirmed_per_card,false);
  assert.ok(HEX.test(c.old_card_sha256||'')&&
   HEX.test(c.original_paragraph_sha256||''));
  assert.ok(typeof c.ipa_uk?.original==='string'&&
   typeof c.ipa_us?.old_card==='string'&&
   Array.isArray(c.ipa_us.candidates));
 }
 for(const k of ['headword','pos','meaning_zh','example_en','example_zh'])
  assert.equal(cards[0][k],cards[1][k],
   'REAL_TWO_BOOKS_SENSE_EDITORIAL_CONTENT_DIVERGED_'+k);
 assert.equal(cards[0].ipa_uk.original,cards[1].ipa_uk.original);
 assert.equal(cards[0].ipa_us.old_card,cards[1].ipa_us.old_card);
 return cards;
}
export function buildOneSenseTwoBookBritfoneReview({prior,britfoneCSV,licenseText}={}){
 const cards=core(prior),dict=parseBritfone(britfoneCSV,licenseText);
 const item=cards[0];
 const uk=[...(dict.map.get(headword(item.headword))??[])].sort();
 const ukMatches=uk.filter(x=>ipa(x)===ipa(item.ipa_uk.original));
 const status=!uk.length?'MIT_UK_HEADWORD_NOT_FOUND':
  ukMatches.length?'MIT_UK_OLD_CARD_IPA_NORMALIZED_MATCH':
   'MIT_UK_CANDIDATES_DIFFER_FROM_OLD_CARD';
 const usRaw=[...new Set(item.ipa_us.candidates)].sort();
 assert.deepEqual(usRaw,[...new Set(cards[1].ipa_us.candidates)].sort(),
  'REAL_TWO_BOOKS_US_CANDIDATES_DIVERGED');
 const oldUsStatus=cards[0].ipa_us.status;
 assert.equal(oldUsStatus,cards[1].ipa_us.status);
 const flags=[...new Set(cards.flatMap(x=>x.flags||[]))].sort();
 const editorial={
  group:'ONE_SENSE_TWOB_RELEASED_NOVELS_HOLD',
  headword:item.headword,
  pos:item.pos,meaning_zh:item.meaning_zh,
  example_en:item.example_en,example_zh:item.example_zh,
  old_uk_ipa:item.ipa_uk.original,old_us_ipa:item.ipa_us.old_card,
  two_old_card_ids:cards.map(x=>x.legacy_word_id),
  two_book_ids:cards.map(x=>x.book_id),
  old_cards_verified_against_full_published_snapshot:true,
  original_legacy_card_sha256:cards.map(x=>x.old_card_sha256),
  original_context_sha256:cards.map(x=>x.original_paragraph_sha256),
  english_example_reviewer_flags:flags,
  us:{old_ipa_status:oldUsStatus,license_source:'open-dict-data/ipa-dict en_US MIT candidate',
   source_commit:prior.us_ipa_commit,candidates:usRaw,
   sole_candidate_possible_for_new_lesson_only:usRaw.length===1?usRaw[0]:null,
   chosen_for_commercial_lesson:false},
  uk:{status,source:'JoseLlarena/Britfone British RP pronunciation dictionary',
   source_commit:HEAD,licensed_file_git_blob_sha:MAIN_BLOB,
   license_file_git_blob_sha:LICENSE_BLOB,
   declared_license:'MIT',attribution:'Copyright (c) 2017 Jose Llarena',
   original_sources_include_dictionary_references:true,
   upstream_licence_chain_requires_editor_review:true,
   candidates:uk,
   sole_candidate_possible_for_new_lesson_only:uk.length===1?uk[0]:null,
   chosen_for_commercial_lesson:false},
  draft_instruction:'Review exactly ONE common sense with TWO legacy links, not two separate approved senses. If IPA candidates differ, do not alter historical words or published segments: create the separately approved NEW unified lesson with reviewed US/UK fields.',
  content_grammar_verified:false,content_zh_translation_verified:false,
  uk_us_actual_pronunciation_editor_verified:false,
  source_legal_signoff:false,ops_signed:false,
  approved_sense_id:null,editor_decision:'HOLD'
 };
 return {schema:'wordletter-real-one-sense-two-books-licensed-uk-ipa-preflight-v1',
  status:'ONE_REAL_SENSE_UK_US_SOURCE_CANDIDATES_EDITORIAL_HOLD',
  source_full_32_book_review_sha256:sha256(JSON.stringify(prior)),
  source_uk_britfone_csv_sha256:sha256(britfoneCSV),
  source_uk_britfone_license_sha256:sha256(licenseText),
  counts:{real_books:2,real_old_cards:2,
   distinct_reviewable_textual_sense_candidates:1,
   duplicated_english_example_review_items_removed:1,
   old_us_ipa_conflicts_remaining:oldUsStatus===
    'US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD'?1:0,
   uk_britfone_headwords_found:uk.length?1:0,
   uk_britfone_normalized_match_to_old:ukMatches.length?1:0,
   uk_britfone_candidate_options:uk.length,
   english_heuristic_distinct_flags:flags.length,
   license_legally_signed:0,independent_language_edit_signoffs:0,
   authentic_ops_signoffs:0,approved_real_senses:0,
   test_d1_writes:0,production_d1_writes:0},
  original_editorial_review_private:editorial,
  legacy_study_and_mastery_unchanged:true,
  legal_rights_not_automatically_approved:true,
  requires_authentic_ops_signature:true,
  source_notice_required_on_final_public_release:true,
  next_step:'REVIEW_ONE_REAL_SENSE_US_UK_VARIANTS_GRAMMAR_TRANSLATION_AND_SIGN_AUTHENTIC_OPS'};
}
export function privateHumanReviewText(r){
 assert.equal(r?.schema,'wordletter-real-one-sense-two-books-licensed-uk-ipa-preflight-v1');
 const x=r.original_editorial_review_private;
 return '# 妙屋真实首批词义：两本书合并为一项待审任务\n\n'+
  '单词：'+x.headword+'；词性：'+x.pos+'；词义：'+x.meaning_zh+'\n\n'+
  '英文例句：'+x.example_en+'\n\n中文翻译：'+x.example_zh+'\n\n'+
  '原美式：'+x.old_us_ipa+'；固定来源美式候选：'+x.us.candidates.join(' / ')+'\n\n'+
  '原英式：'+x.old_uk_ipa+'；Britfone MIT候选：'+x.uk.candidates.join(' / ')+'\n\n'+
  '两张原词卡指纹：'+x.original_legacy_card_sha256.join(' / ')+'\n\n'+
  '机器标记（仅供人工参考）：'+x.english_example_reviewer_flags.join(' / ')+'\n\n'+
  '## 最终编辑必须独立确认\n\n'+
  '- [ ] 双书同义项与词性\n'+
  '- [ ] 新统一教学卡英文例句语义、句法、自然度\n'+
  '- [ ] 中文翻译与英文真实对应\n'+
  '- [ ] US IPA对应词性/语境且新来源可商业复用\n'+
  '- [ ] UK IPA对应词性/语境及Britfone MIT上游来源与署名\n'+
  '- [ ] 教学素材及小说原创来源审核凭据\n'+
  '- [ ] 真实OPS签名和TEST目标审计\n\n'+
  '**HOLD：不得自动改原小说词卡、发布统一词义、修改复习记录或写D1。**\n';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,7,'REAL_UK_ONE_SENSE_PRIVATE_REVIEW_USAGE');
  const r=buildOneSenseTwoBookBritfoneReview({
   prior:JSON.parse(readFileSync(process.argv[2],'utf8')),
   britfoneCSV:readFileSync(process.argv[3],'utf8'),
   licenseText:readFileSync(process.argv[4],'utf8')});
  writeFileSync(process.argv[5],JSON.stringify(r),{flag:'wx',mode:0o600});
  writeFileSync(process.argv[6],privateHumanReviewText(r),{flag:'wx',mode:0o600});
  console.log('REAL_ONE_SENSE_UK_IPA_SAFE_COUNTS='+JSON.stringify(r.counts));
 }catch(e){
  console.error('REAL_ONE_SENSE_UK_IPA_REVIEW_BLOCKED',
   /^[A-Z0-9_]+$/u.test(String(e?.message))?e.message:
   'PRIVATE_SOURCE_OR_EDITORIAL_PACKET_FAILED');
  process.exitCode=1;
 }
}
