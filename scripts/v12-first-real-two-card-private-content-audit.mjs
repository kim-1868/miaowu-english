// Private, deterministic first-pass review of the TWO verified published cards.
// Consumes EXISTING AES256 reviewer worksheet and immutable repo source register.
// Never upgrades any commercial/editorial rights; never accesses any remote DB.
// Real book names, word text, paid paragraph and examples may ONLY appear in
// encrypted private outputs, never console, public CI or committed source.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const hash=s=>createHash('sha256').update(s).digest('hex');
const H=/^[a-f0-9]{64}$/u,ID=/^[a-z0-9_-]{1,80}$/iu;
const A=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const norm=x=>String(x??'').normalize('NFKC').trim();
const compact=x=>norm(x).replace(/\s+/gu,'');
const lower=x=>norm(x).toLowerCase().replaceAll('’',"'");
const POS=x=>lower(x).replace(/[.。]/gu,'');
const citation=x=>typeof x==='string'?x.slice(0,250):'';
const QA=/^(?:qa-|draft-|internal-|mw-v12-pilot-)/iu;
const flagged=(flags,name,condition)=>{if(condition)flags.push(name)};
function verifiedWorksheet(x){
 assert.equal(x?.schema,'wordletter-real-two-book-publisher-clearance-v1',
  'REAL_PRIVATE_WORKSHEET_SCHEMA_REQUIRED');
 assert.equal(x?.is_approved,false,'REAL_PRIVATE_WORKSHEET_NOT_UNAPPROVED');
 assert.equal(x?.ops_signature_required,true,'REAL_PRIVATE_WORKSHEET_OPS_GATE_REQUIRED');
 assert.ok(H.test(x.source_proof_sha256??'')&&H.test(x.candidate_sha256??''),
  'REAL_PRIVATE_WORKSHEET_IMMUTABLE_SOURCE_DIGEST_MISSING');
 const c=x.review_material_private;
 assert.ok(c&&norm(c.headword)&&norm(c.part_of_speech)&&norm(c.meaning_zh)
  &&Array.isArray(c.cards)&&c.cards.length===2,
  'REAL_PRIVATE_WORKSHEET_TWO_SOURCE_CARDS_REQUIRED');
 assert.ok(x.rights&&Object.values(x.rights).length===7&&
  Object.values(x.rights).every(r=>r?.verified===false),
  'REAL_PRIVATE_WORKSHEET_RIGHTS_FALSIFIED');
 assert.ok(x.checks&&Object.values(x.checks).length===10&&
  Object.values(x.checks).every(r=>r?.verified===false),
  'REAL_PRIVATE_WORKSHEET_EDITORIAL_FALSIFIED');
 assert.equal(x.dictionary?.verified_existing_enabled_licensed_entry,false,
  'REAL_PRIVATE_WORKSHEET_DICTIONARY_ALREADY_APPROVED');
 const books=new Set(),olds=new Set(),chapters=new Set();
 for(const card of c.cards){
  assert.ok(ID.test(card.book_id??'')&&!QA.test(card.book_id)&&
   ID.test(card.chapter_id??'')&&ID.test(card.legacy_word_id??'')&&
   A.test(card.anchor??'')&&H.test(card.old_card_sha256??'')&&
   H.test(card.original_paragraph_sha256??''),
   'REAL_PRIVATE_WORKSHEET_ID_OR_SHA_INVALID');
  assert.ok(!books.has(card.book_id)&&!olds.has(card.legacy_word_id)&&
   !chapters.has(card.chapter_id),'REAL_PRIVATE_WORKSHEET_DUPLICATE_BOOK_OR_CARD');
  books.add(card.book_id);olds.add(card.legacy_word_id);chapters.add(card.chapter_id);
  const old=[card.legacy_word_id,c.headword,card.phonetic_uk,card.phonetic_us,
   c.part_of_speech,c.meaning_zh,card.example_en,card.example_zh,card.collocations_json];
  assert.equal(hash(JSON.stringify(old)),card.old_card_sha256,
   'REAL_PRIVATE_WORKSHEET_OLD_CARD_DRIFT');
  assert.equal(hash(card.original_paragraph_json),card.original_paragraph_sha256,
   'REAL_PRIVATE_WORKSHEET_PARAGRAPH_DRIFT');
  const [,segment]=card.anchor.split(':').map(n=>Number(n.slice(1)));
  let paragraph,collocations;
  try{paragraph=JSON.parse(card.original_paragraph_json);
   collocations=JSON.parse(card.collocations_json)}
  catch{throw Error('REAL_PRIVATE_WORKSHEET_JSON_INVALID')}
  assert.ok(Array.isArray(paragraph?.segments)&&
   segment<paragraph.segments.length&&
   Array.isArray(collocations),
   'REAL_PRIVATE_WORKSHEET_PARAGRAPH_OR_COLLOCATION_MISSING');
  const at=paragraph.segments[segment];
  assert.equal(at?.wordId,card.legacy_word_id,'REAL_PRIVATE_WORKSHEET_WORD_ANCHOR_DRIFT');
  assert.equal(compact(at?.gloss),compact(c.meaning_zh),
   'REAL_PRIVATE_WORKSHEET_CONTEXT_MEANING_DRIFT');
  assert.ok(typeof at?.surface==='string'&&norm(at.surface),
   'REAL_PRIVATE_WORKSHEET_CONTEXT_SURFACE_MISSING');
 }
 assert.ok(c.cards[0].example_en===c.cards[1].example_en&&
  c.cards[0].example_zh===c.cards[1].example_zh&&
  c.cards[0].phonetic_us===c.cards[1].phonetic_us&&
  c.cards[0].phonetic_uk===c.cards[1].phonetic_uk,
  'REAL_PRIVATE_WORKSHEET_CROSSBOOK_TEACHING_CARD_DIFF');
 return c;
}
function morphologicalPossibilities(headword){
 const h=lower(headword),f=new Set([h,h+'s',h+'es',h+'ed',h+'ing']);
 if(h.endsWith('e')){f.add(h.slice(0,-1)+'ing');f.add(h+'d')}
 if(h.endsWith('y')){f.add(h.slice(0,-1)+'ies');f.add(h.slice(0,-1)+'ied')}
 const irregular={be:['am','is','are','was','were','been','being'],
  have:['has','had','having'],do:['did','does','done','doing'],
  go:['went','gone','going'],make:['made','making'],write:['wrote','written']};
 for(const x of irregular[h]??[])f.add(x);
 return f;
}
function exampleFlags(headword,en,zh,ipaUK,ipaUS){
 const flags=[],english=norm(en),chinese=norm(zh);
 const words=english.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/gu)||[];
 const lemma=morphologicalPossibilities(headword);
 flagged(flags,'ENGLISH_LEMMA_NOT_VISIBLE_HEURISTIC',!words.some(w=>lemma.has(w)));
 flagged(flags,'ENGLISH_LENGTH_REVIEW',words.length<5||words.length>35);
 flagged(flags,'ENGLISH_TERMINAL_PUNCTUATION',!/[.!?]$/u.test(english));
 flagged(flags,'ENGLISH_PLACEHOLDER',/\b(?:todo|tbd|placeholder|lorem ipsum)\b/iu.test(english));
 flagged(flags,'CHINESE_TRANSLATION_MISSING',!/[\u3400-\u9fff]/u.test(chinese));
 flagged(flags,'CHINESE_LENGTH_REVIEW',chinese.length<6||chinese.length>130);
 flagged(flags,'CHINESE_TERMINAL_PUNCTUATION',!/[。！？!?]$/u.test(chinese));
 flagged(flags,'CHINESE_PLACEHOLDER',/待补|占位|TODO/iu.test(chinese));
 for(const [name,ipa] of [['UK',ipaUK],['US',ipaUS]]){
  flagged(flags,name+'_IPA_MISSING_OR_MALFORMED',
   typeof ipa!=='string'||!/^(?:\/[^/\s]{1,100}\/|\[[^\]\s]{1,100}\])$/u.test(ipa));
 }
 return flags;
}
function oldRegister(rows){
 assert.ok(Array.isArray(rows)&&rows.length>=1&&rows.length<=15000,
  'REAL_PRIVATE_REGISTER_INVALID');
 const byId=new Map(),byHeadword=new Map();
 for(const r of rows){
  assert.ok(ID.test(r?.legacy_word_id??'')&&!byId.has(r.legacy_word_id),
   'REAL_PRIVATE_REGISTER_DUPLICATE_ID');
  byId.set(r.legacy_word_id,r);
  const key=lower(r.headword);byHeadword.set(key,(byHeadword.get(key)||[]).concat([r]));
 }
 return {byId,byHeadword};
}
export function auditRealTwoCards({worksheet,registerRows}={}){
 const c=verifiedWorksheet(worksheet);
 const reg=oldRegister(registerRows);
 const review=[];
 for(const card of c.cards){
  const flags=exampleFlags(c.headword,card.example_en,card.example_zh,
   card.phonetic_uk,card.phonetic_us);
  const source=reg.byId.get(card.legacy_word_id);
  let prior='NO_EXACT_LEGACY_CARD_ID_IN_20261110_REGISTER';
  if(source){
   const equal=lower(source.headword)===lower(c.headword)&&
    POS(source.part_of_speech)===POS(c.part_of_speech)&&
    compact(source.meaning_zh)===compact(c.meaning_zh)&&
    source.phonetic_uk===card.phonetic_uk&&
    source.phonetic_us===card.phonetic_us&&
    source.example_en===card.example_en&&
    source.example_zh===card.example_zh;
   prior=equal?'HISTORICAL_LEGACY_CARD_FIELDS_MATCH':
    'HISTORICAL_LEGACY_CARD_FIELDS_DIFFER';
   if(!equal)flags.push('HISTORICAL_CARD_SOURCE_DRIFT_REQUIRES_REVIEW');
  }else if((reg.byHeadword.get(lower(c.headword))||[]).length){
   prior='WORD_EXISTS_IN_REGISTER_BUT_SELECTED_OLD_ID_ABSENT';
  }
  // Do not interpret historic manuscript data as proof of independent
  // generation, precise UK IPA license or genuine OPS editorial approval.
  review.push({
   book_id:card.book_id,book_title:card.book_title,
   chapter_id:card.chapter_id,chapter_title:card.chapter_title,
   anchor:card.anchor,legacy_word_id:card.legacy_word_id,
   original_card_sha256:card.old_card_sha256,
   paragraph_sha256:card.original_paragraph_sha256,
   historical_register_status:prior,
   historical_register_origin:source?.origin??null,
   historical_source_paths:source?.source_repo_paths??[],
   headword:c.headword,part_of_speech:c.part_of_speech,meaning_zh:c.meaning_zh,
   example_en:card.example_en,example_zh:card.example_zh,
   phonetic_uk:card.phonetic_uk,phonetic_us:card.phonetic_us,
   context_surface:JSON.parse(card.original_paragraph_json).segments[
    Number(card.anchor.split(':s')[1])].surface,context_gloss:card.context_gloss,
   heuristic_flags:flags,
   legal_source_claim:'CHATGPT_ASSISTED_DRAFTS_PREPARED_FOR_MIAOWU_USER_REPORTED',
   individual_example_provenance_signed:false,
   uk_ipa_license_verified:false,us_ipa_license_verified:false,
   grammar_translation_editor_reviewed:false,
   crossbook_same_sense_human_confirmed:false,
   authenticated_ops_signoff:false,decision:'HOLD'
  });
 }
 const counts={real_books:2,real_cards:2,verified_original_anchors:2,
  exact_old_id_register_matches:review.filter(x=>
   x.historical_register_status==='HISTORICAL_LEGACY_CARD_FIELDS_MATCH').length,
  historic_source_drift:review.filter(x=>
   x.historical_register_status==='HISTORICAL_LEGACY_CARD_FIELDS_DIFFER').length,
  old_ids_not_in_register:review.filter(x=>
   x.historical_register_status!=='HISTORICAL_LEGACY_CARD_FIELDS_MATCH'&&
   x.historical_register_status!=='HISTORICAL_LEGACY_CARD_FIELDS_DIFFER').length,
  with_heuristic_flags:review.filter(x=>x.heuristic_flags.length).length,
  verified_source_licenses:0,independent_editor_signoffs:0,
  authentic_ops_receipts:0,database_writes:0};
 const privateResult={schema:'wordletter-real-two-card-private-content-review-v1',
  status:'PRIVATE_AUTOMATED_CONTENT_PRECHECK_HUMAN_SIGNOFF_REQUIRED',
  source_proof_sha256:worksheet.source_proof_sha256,
  candidate_sha256:worksheet.candidate_sha256,
  shared_candidate:{headword:c.headword,pos:c.part_of_speech,meaning_zh:c.meaning_zh},
  counts,private_review_cards:review,
  checklist:{independent_rights_and_creation_evidence:'HOLD',
   english_grammar_and_sense:'HOLD',chinese_translation_alignment:'HOLD',
   uk_ipa_source_and_pronunciation:'HOLD',us_ipa_source_and_pronunciation:'HOLD',
   original_novel_publisher_context:'HOLD',same_meaning_across_books:'HOLD',
   real_dictionary_source_registration:'HOLD',authenticated_ops_signoff:'HOLD'},
  commercial_approval:false,
  actual_test_database_imports:0,
  next_step:'HUMAN_EDITOR_REVIEW_PRIVATE_TWO_CARD_WORKSHEET_AND_SIGN_REAL_OPS_RECEIPT',
  note:'Exact legacy source match supports traceability, NOT copyright provenance, independent semantic review or a final license. Heuristic flags are triage only.'};
 return privateResult;
}
export function formatPrivateReviewerMarkdown(result){
 assert.equal(result?.schema,'wordletter-real-two-card-private-content-review-v1');
 const c=result.shared_candidate;
 let out='# 妙屋英语首批真实双书 · 私密词义内容审校（未批准）\n\n';
 out+='原资料SHA：'+result.source_proof_sha256+'\n\n';
 out+='**词头** '+c.headword+'；**词性** '+c.pos+'；**词义** '+c.meaning_zh+'\n\n';
 for(const [i,x] of result.private_review_cards.entries()){
  out+='## 小说 '+(i+1)+'：'+x.book_title+'\n\n';
  out+='章节：'+x.chapter_title+'；位置：'+x.anchor+
   '；旧卡指纹：'+x.original_card_sha256+'\n\n';
  out+='英例句：'+x.example_en+'\n\n中例句：'+x.example_zh+'\n\n';
  out+='UK IPA：'+x.phonetic_uk+'；US IPA：'+x.phonetic_us+'\n\n';
  out+='现有登记册比对：'+x.historical_register_status+'\n\n';
  out+='机器预检风险：'+(x.heuristic_flags.join('、')||'无预设规则标记')+'\n\n';
 }
 out+='## 人工审校清单（每项均待确认）\n\n';
 for(const k of Object.keys(result.checklist))out+='- [ ] '+k+'\n';
 out+='\n**本工作表不是 OPS 签名、不是商用授权、不是数据库入库命令。**\n';
 return out;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,6,'FIRST_REAL_CONTENT_AUDIT_USAGE');
  const worksheet=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const register=readFileSync(process.argv[3],'utf8').split(/\r?\n/gu)
   .filter(Boolean).map(line=>JSON.parse(line));
  const result=auditRealTwoCards({worksheet,registerRows:register});
  writeFileSync(process.argv[4],JSON.stringify(result),{flag:'wx',mode:0o600});
  writeFileSync(process.argv[5],formatPrivateReviewerMarkdown(result),{flag:'wx',mode:0o600});
  // Privacy invariant: only aggregate integers and no headwords in logs.
  console.log('FIRST_REAL_TWO_CARD_CONTENT_QA_SAFE_COUNTS='+JSON.stringify(result.counts));
 }catch(e){
  console.error('FIRST_REAL_TWO_CARD_CONTENT_QA_BLOCKED',
   /^[A-Z0-9_]+$/u.test(String(e?.message))?e.message:'PRIVATE_SOURCE_VALIDATION_FAILED');
  process.exitCode=1;
 }
}
