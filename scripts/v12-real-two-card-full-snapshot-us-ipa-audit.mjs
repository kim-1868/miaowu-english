// Completes the FULL private publisher-snapshot lineage of two REAL cards
// missed by the early 305-card public register and checks fixed-source US IPA.
// It does not validate commercial rights, edit prose or approve study senses.
// Outputs real paid content solely into an encrypted private runner archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const HEX=/^[0-9a-f]{64}$/u;
const trim=x=>String(x??'').normalize('NFKC').trim();
const word=x=>trim(x).toLowerCase().replaceAll('’',"'");
const sense=x=>trim(x).replace(/\s+/gu,'');
const pos=x=>word(x).replace(/[.。]/gu,'');
const US_COMMIT='972cd67dd5f96bc5660e28070cde26e3928abcd7';
function parseUS(txt){
 assert.ok(typeof txt==='string'&&txt.length>10000&&txt.length<10000000,
  'FULL_SOURCE_US_IPA_FILE_INVALID');
 const m=new Map();
 let parsed=0;
 for(const line of txt.split(/\r?\n/gu)){
  if(!line.trim())continue;
  const tab=line.indexOf('\t');
  assert.ok(tab>0&&tab<180,'FULL_SOURCE_US_IPA_TAB_STRUCTURE_CHANGED');
  const lemma=word(line.slice(0,tab)),pron=trim(line.slice(tab+1));
  assert.ok(lemma&&pron&&pron.length<160,
   'FULL_SOURCE_US_IPA_LEMMA_OR_PRON_INVALID');
  parsed++;
  const entry=m.get(lemma)??new Set();
  for(const p of pron.split(',').map(trim).filter(Boolean))entry.add(p);
  m.set(lemma,entry);
 }
 assert.ok(parsed>30000,'FULL_SOURCE_US_IPA_UNEXPECTEDLY_SMALL');
 return {map:m,lines:parsed};
}
function canonicalIpa(x){
 return trim(x).replace(/^[/\[]|[/\]]$/gu,'')
  .replace(/[ˈˌ'\s]/gu,'')
  .replaceAll('ɹ','r').replaceAll('ɚ','ər')
  .replaceAll('ː',':');
}
const COUNTS={published_books:32,published_anchor_occurrences:8444,
 distinct_old_word_ids:3433,distinct_headwords:1585,
 textual_sense_candidates:1981,duplicate_textual_sense_groups:532,
 duplicate_excess_old_ids:1452};
function privateQueue(source){
 assert.equal(source?.status,'PRIVATE_PUBLISHED_EDITORIAL_CANDIDATES_UNAPPROVED',
  'FULL_SOURCE_REAL_PUBLISHER_SNAPSHOT_REQUIRED');
 assert.equal(source.all_records_private,true);
 assert.equal(source.created_approvals,0);
 assert.equal(source.production_writes,0);
 for(const [k,v] of Object.entries(COUNTS))
  assert.equal(source.counts?.[k],v,'FULL_SOURCE_SNAPSHOT_DRIFT_'+k);
 assert.ok(Array.isArray(source.duplicate_review_queue)&&
  source.duplicate_review_queue.length===532&&
  Array.isArray(source.other_candidate_groups)&&
  source.other_candidate_groups.length===1449,
  'FULL_SOURCE_GROUP_SCOPE_CHANGED');
 const byBookOld=new Map();
 for(const g of [...source.duplicate_review_queue,...source.other_candidate_groups]){
  assert.equal(g?.editor_decision,'HOLD',
   'FULL_SOURCE_HAS_UNEXPECTED_APPROVAL');
  for(const row of g.card_evidence??[]){
   const key=JSON.stringify([row.book_id,row.old_word_id]);
   assert.ok(!byBookOld.has(key),'FULL_SOURCE_DUPLICATE_BOOK_WORD_ROW');
   byBookOld.set(key,{row,group:g});
  }
 }
 return byBookOld;
}
function flagCounts(cards){
 const v={};
 for(const c of cards){
  for(const f of c.heuristic_flags??[]){
   assert.ok(/^[A-Z][A-Z0-9_]{1,90}$/u.test(f),
    'FULL_SOURCE_UNSAFE_FLAG_LABEL');
   v[f]=(v[f]??0)+1;
  }
 }
 return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)));
}
export function reconcileTwoRealPublishedCards({privateReview,publisherQueue,usIpaText}={}){
 assert.equal(privateReview?.schema,'wordletter-real-two-card-private-content-review-v1',
  'FULL_SOURCE_PRIVATE_REVIEW_SCHEMA_REQUIRED');
 assert.equal(privateReview?.status,
  'PRIVATE_AUTOMATED_CONTENT_PRECHECK_HUMAN_SIGNOFF_REQUIRED');
 assert.equal(privateReview?.commercial_approval,false);
 assert.equal(privateReview?.actual_test_database_imports,0);
 assert.ok(HEX.test(privateReview.source_proof_sha256??'')&&
  HEX.test(privateReview.candidate_sha256??''));
 const cards=privateReview.private_review_cards;
 assert.ok(Array.isArray(cards)&&cards.length===2);
 assert.equal(privateReview.counts?.real_cards,2);
 assert.equal(privateReview.counts?.old_ids_not_in_register,2);
 assert.equal(privateReview.counts?.database_writes,0);
 assert.ok(cards.every(c=>c?.decision==='HOLD'&&
  c.authenticated_ops_signoff===false&&
  c.individual_example_provenance_signed===false));
 assert.ok(cards[0].book_id!==cards[1].book_id&&
  cards[0].legacy_word_id!==cards[1].legacy_word_id);
 const index=privateQueue(publisherQueue),us=parseUS(usIpaText);
 const merged=[];
 for(const c of cards){
  const matching=index.get(JSON.stringify([c.book_id,c.legacy_word_id]));
  assert.ok(matching,'FULL_SOURCE_REAL_CARD_NOT_FOUND_IN_32_BOOK_SNAPSHOT');
  const e=matching.row,g=matching.group;
  assert.equal(word(g.headword),word(c.headword),
   'FULL_SOURCE_HEADWORD_CHANGED');
  assert.equal(pos(g.pos),pos(c.part_of_speech),
   'FULL_SOURCE_POS_CHANGED');
  assert.equal(sense(g.meaning_zh),sense(c.meaning_zh),
   'FULL_SOURCE_MEANING_CHANGED');
  for(const k of ['phonetic_uk','phonetic_us','example_en','example_zh'])
   assert.equal(e[k],c[k],'FULL_SOURCE_OLD_CARD_FIELD_CHANGED_'+k);
  assert.ok(g.legacy_word_ids.includes(c.legacy_word_id)&&
   g.book_ids.includes(c.book_id)&&e.occurrences>=1,
   'FULL_SOURCE_GROUP_BOOK_CARD_MISMATCH');
  const candidates=[...(us.map.get(word(c.headword))??[])].sort();
  const matches=candidates.filter(x=>canonicalIpa(x)===canonicalIpa(c.phonetic_us));
  const status=!candidates.length?'US_IPA_HEADWORD_ABSENT':
   matches.length>0?'US_IPA_CANDIDATE_TEXT_MATCH':
   'US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD';
  merged.push({
   book_id:c.book_id,legacy_word_id:c.legacy_word_id,
   headword:c.headword,pos:c.part_of_speech,meaning_zh:c.meaning_zh,
   old_card_sha256:c.original_card_sha256,
   original_paragraph_sha256:c.paragraph_sha256,
   prior_305_register_status:c.historical_register_status,
   complete_32_book_snapshot_status:'EXACT_PUBLISHED_OLD_CARD_FIELDS_VERIFIED',
   source_group_fingerprint_sha256:sha(JSON.stringify([
    g.headword,g.pos,g.meaning_zh,[...g.legacy_word_ids].sort(),
    [...g.book_ids].sort()])),
   ipa_us:{status,old_card:c.phonetic_us,candidates,
    source_commit:US_COMMIT,
    source_dataset:'open-dict-data/ipa-dict/data/en_US.txt',
    rights_not_finally_signed_off:true},
   ipa_uk:{status:'UK_SOURCE_PROVENANCE_REQUIRES_SEPARATE_CHECK',
    known_source_conflict:'en_UK ipacards GPL-3.0 derivative cannot assume MIT',
    original:c.phonetic_uk},
   example_en:c.example_en,example_zh:c.example_zh,
   user_reported_chatgpt_example_origin:true,
   original_example_provenance_confirmed_per_card:false,
   editor_translation_approved:false,editor_pronunciation_approved:false,
   commercial_source_license_signed_off:false,real_ops_receipt:null,
   flags:c.heuristic_flags??[],decision:'HOLD'
  });
 }
 const summary={
  actual_real_published_books:2,actual_old_cards:2,
  old_ids_missing_from_small_305_register:2,
  verified_against_full_32_book_publisher_snapshot:merged.filter(x=>
   x.complete_32_book_snapshot_status==='EXACT_PUBLISHED_OLD_CARD_FIELDS_VERIFIED').length,
  us_ipa_candidates_present:merged.filter(x=>x.ipa_us.status!=='US_IPA_HEADWORD_ABSENT').length,
  us_ipa_candidate_text_match:merged.filter(x=>x.ipa_us.status==='US_IPA_CANDIDATE_TEXT_MATCH').length,
  us_ipa_candidates_differ:merged.filter(x=>x.ipa_us.status==='US_IPA_CANDIDATES_DIFFER_FROM_OLD_CARD').length,
  unique_us_ipa_ambiguous:merged.filter(x=>x.ipa_us.candidates.length>1).length,
  automated_heuristic_flag_counts:flagCounts(cards),
  copyright_source_signoffs:0,authenticated_ops_signoffs:0,
  actual_approved_teaching_senses:0,test_d1_writes:0,
  prod_d1_writes:0
 };
 return {
  schema:'wordletter-two-real-published-cards-complete-provenance-review-v1',
  status:'FULL_PUBLISHER_SOURCE_VERIFIED_US_IPA_CANDIDATE_CHECKED_EDITORIAL_HOLD',
  full_production_snapshot_source_artifact_id:13911979176,
  first_private_content_audit_artifact_id:13967904583,
  original_review_sha256:sha(JSON.stringify(privateReview)),
  source_snapshot_sha256:sha(JSON.stringify(publisherQueue)),
  us_ipa_file_sha256:sha(usIpaText),
  us_ipa_commit:US_COMMIT,
  counts:summary,
  reviewer_material_private:merged,
  ops_authenticated_signature_present:false,
  actual_test_d1_import_allowed:false,
  publisher_content_rights_not_automatically_confirmed:true,
  note:'Full production snapshot proves historical record identity, not original authorship, commercial rights, legal suitability, UK IPA or bilingual meaning. US IPA candidate text matching does not prove its sense, accent or a signed license. Strict hold.'
 };
}
function reviewerMarkdown(result){
 const cards=result.reviewer_material_private;
 let x='# 妙屋英语真实双书 · 完整生产来源对账与音标候选审核\n\n';
 x+='本资料来自历史正式32本小说加密快照与真实双书审核包，全部仍为 HOLD。\n\n';
 for(let i=0;i<cards.length;i++){
  const c=cards[i];
  x+='## 真实词卡 '+(i+1)+'\n\n';
  x+='词头：'+c.headword+'；词性：'+c.pos+'；中文义项：'+c.meaning_zh+'\n\n';
  x+='英例句：'+c.example_en+'\n\n';
  x+='中例句：'+c.example_zh+'\n\n';
  x+='历史旧卡ID：'+c.legacy_word_id+'\n\n';
  x+='完整生产32本词卡快照：'+c.complete_32_book_snapshot_status+'\n\n';
  x+='US候选：'+c.ipa_us.status+'（'+c.ipa_us.candidates.join(' / ')+'）\n\n';
  x+='UK旧卡：'+c.ipa_uk.original+'；UK来源尚未许可核验。\n\n';
  x+='预审问题：'+(c.flags.join('、')||'未触发预设机器规则')+'\n\n';
  x+='待核查：英文词义、英文例句、中文翻译、US/UK发音、原创例句对应生成记录、真实OPS审签。\n\n';
 }
 x+='**本清单只供受保护的人工编辑审核，绝非已售词卡、签字或入库授权。**';
 return x;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,7,'FULL_SOURCE_REVIEW_CLI_USAGE');
  const r=reconcileTwoRealPublishedCards({
   privateReview:JSON.parse(readFileSync(process.argv[2],'utf8')),
   publisherQueue:JSON.parse(readFileSync(process.argv[3],'utf8')),
   usIpaText:readFileSync(process.argv[4],'utf8')});
  writeFileSync(process.argv[5],JSON.stringify(r),{mode:0o600,flag:'wx'});
  writeFileSync(process.argv[6],reviewerMarkdown(r),{mode:0o600,flag:'wx'});
  console.log('FULL_PUBLISHED_TWO_CARD_PROVENANCE_SAFE_COUNTS='+JSON.stringify(r.counts));
 }catch(e){
  console.error('FULL_PUBLISHED_TWO_CARD_PROVENANCE_BLOCKED',
   /^[A-Z0-9_]+$/u.test(String(e?.message))?e.message:'PRIVATE_SOURCE_VERIFICATION_FAILED');
  process.exitCode=1;
 }
}
