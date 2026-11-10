// OFFLINE historical published-wordcard comparison. Never auto-merge or write
// customer study state. This is an editorial candidate report only.
import {validatePackage} from './editorial-content.js';
const en=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const pos=x=>en(x).replace(/[.。\s]/gu,'');
const zh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const key=(head,part,meaning)=>[en(head),pos(part),zh(meaning)].join('\u0000');
export function comparePublishedNovelToHistoricalWordcards(historical,novel){
 if(historical?.audit!=='wordletter-p5-content-review-offline'||
    !Array.isArray(historical.books)||!Array.isArray(historical.cards))
  throw Error('INVALID_HISTORICAL_CARD_SNAPSHOT');
 const checked=validatePackage(novel);
 const books=new Set(historical.books.map(x=>x.book_id));
 const idMap=new Map(),senseMap=new Map(),heads=new Map();
 for(const source of historical.cards){
  if(!source||typeof source.word_id!=='string'||!source.word_id||
    idMap.has(source.word_id)||!source.headword||!source.meaning_zh||
    !source.part_of_speech)
   throw Error('HISTORICAL_CARD_IDENTITY_CORRUPTED');
  idMap.set(source.word_id,source);
  const identity=key(source.headword,source.part_of_speech,source.meaning_zh);
  if(!senseMap.has(identity))senseMap.set(identity,[]);
  const sourceBooks=new Set(
   (Array.isArray(source.contexts)?source.contexts:[])
    .map(x=>x.book_id).filter(x=>books.has(x)));
  senseMap.get(identity).push({legacy_word_id:source.word_id,
    original_book_ids:[...sourceBooks],
    phonetic_uk:source.phonetic_uk||'',
    phonetic_us:source.phonetic_us||''});
  const lemma=en(source.headword);
  if(!heads.has(lemma))heads.set(lemma,new Set());
  heads.get(lemma).add(identity);
 }
 const review=[],counts={
  novel_word_ids:checked.words.length,exact_text_sense_candidates:0,
  old_id_present_and_same_text:0,
  candidates_also_in_other_books:0,
  multiple_historical_old_ids_same_text:0,
  ipa_variant_candidate_groups:0,
  same_lemma_but_new_text_sense:0,
  new_lemma_candidate:0,
  same_id_but_modified_meaning:0,
  unmapped_word_ids:0
 };
 for(const w of checked.words){
  const identity=key(w.headword,w.partOfSpeech,w.meaningZh);
  const rows=(senseMap.get(identity)||[]).slice().sort((a,b)=>
   a.legacy_word_id.localeCompare(b.legacy_word_id,'en'));
  const otherBooks=new Set(rows.flatMap(x=>x.original_book_ids)
   .filter(id=>id!==checked.book.id));
  const uk=new Set(rows.map(x=>x.phonetic_uk).filter(Boolean));
  const us=new Set(rows.map(x=>x.phonetic_us).filter(Boolean));
  const prior=idMap.get(w.id);
  let status='CANDIDATE_NEEDS_EDITORIAL_REVIEW';
  if(rows.length){
   counts.exact_text_sense_candidates++;
   if(prior&&key(prior.headword,prior.part_of_speech,prior.meaning_zh)===identity)
    counts.old_id_present_and_same_text++;
   if(otherBooks.size)counts.candidates_also_in_other_books++;
   if(rows.length>1)counts.multiple_historical_old_ids_same_text++;
   if(uk.size>1||us.size>1)counts.ipa_variant_candidate_groups++;
  }else{
   counts.unmapped_word_ids++;
   if(heads.has(en(w.headword)))counts.same_lemma_but_new_text_sense++;
   else counts.new_lemma_candidate++;
   status='NO_IDENTICAL_HISTORICAL_SENSE_REQUIRES_NEW_EDITORIAL_REVIEW';
  }
  if(prior&&key(prior.headword,prior.part_of_speech,prior.meaning_zh)!==identity){
   counts.same_id_but_modified_meaning++;
   status='OLD_WORD_ID_MEANING_DRIFT_REQUIRES_VERSIONED_REVIEW';
  }
  review.push({book_id:checked.book.id,book_category:checked.book.category,
   old_word_id:w.id,headword:en(w.headword),part_of_speech:w.partOfSpeech,
   meaning_zh:w.meaningZh,status,legacy_candidate_ids:rows.map(r=>r.legacy_word_id),
   shared_other_books:[...otherBooks].sort(),
   has_multiple_ipa_variants:uk.size>1||us.size>1,
   approved_sense_id:null,automatic_mastery_merge_allowed:false,
   stable_wordcard_identity_approved:false
  });
 }
 return {status:'READ_ONLY_HISTORICAL_NOVEL_SENSE_MATCH_NOT_APPLIED',
  book_id:checked.book.id,category:checked.book.category,title:checked.book.title,
  source_snapshot_date:historical.created_utc??null,
  source_not_current_production:true,
  counts,review_queue:review,
  source_book_and_chapter_text_copied:false,
  customer_study_data_accessed:false,
  production_D1_modified:false,
  actual_matched_approved_senses:0};
}
