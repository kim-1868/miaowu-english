// V1.2 historical manuscripts: generate review-only, per-occurrence binding evidence.
// Import this pure helper with PRIVATE local manuscripts and historical candidate map.
// No D1 or network, no source-licensing assumption, no automatic SRS writes.
import {createHash} from 'node:crypto';
const sum=s=>createHash('sha256').update(s).digest('hex');
const lemma=s=>String(s??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const zh=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'')\n .replace(/[；;]/gu,';').replace(/(?:…{2,}|\\.{2,})/gu,'…').trim();
const part=s=>lemma(s).replace(/[。.]/gu,'');
const entry=/^gdict_[0-9a-f]{24}$/u;
const hash=/^[0-9a-f]{64}$/u;
const noCopy=word=>({word_id:word.id,headword:word.headword,
 part_of_speech:word.partOfSpeech,meaning_zh:word.meaningZh});
export function createPrivateNovelBindingReview({documents=[],historicalCandidates=[]}={}){
 if(!Array.isArray(documents)||!documents.length||documents.length>50||
   !Array.isArray(historicalCandidates)||historicalCandidates.length>30000)
  throw Error('BINDING_REVIEW_INVALID_SOURCES');
 const candidateMap=new Map();
 for(const row of historicalCandidates){
  if(!row||typeof row.old_word_id!=='string'||!row.old_word_id||
    !entry.test(row.entry_id||'')||!hash.test(row.candidate_hash_sha256||'')||
    row.editorial_sense_approved!==false||row.stable_approved_sense_id!==null||
    row.candidate_strict_text_match!==true)
    throw Error('BINDING_REVIEW_INVALID_OR_APPROVED_HISTORY');
  const prior=candidateMap.get(row.old_word_id);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(row))
    throw Error('BINDING_REVIEW_CONFLICTING_HISTORY_ID');
  candidateMap.set(row.old_word_id,row);
 }
 const books=[],pending=[],idset=new Set(),reviewIdSet=new Set();
 const detailedStats={reviewable_occurrences:0,missing_legacy_candidates:0,
  mismatched_headword:0,mismatched_pos:0,mismatched_meaning:0,
  invalid_card_ref:0,context_gloss_discrepancies:0,no_study_targets:0,
  missing_ipa:0,missing_bilingual_example:0};
 for(const doc of documents){
  const x=doc?.package??doc;
  if(!x?.book?.id||!['cet4','cet6','postgrad'].includes(x.book.category)||
     !Array.isArray(x.words)||!Array.isArray(x.chapters)||!x.chapters.length)
    throw Error('BINDING_REVIEW_INVALID_BOOK');
  const book=x.book.id;
  if(idset.has(book))throw Error('BINDING_REVIEW_DUPLICATE_BOOK_ID');
  idset.add(book);
  const wordmap=new Map();
  for(const card of x.words){
   if(!card?.id||!card?.headword||wordmap.has(card.id))
    throw Error('BINDING_REVIEW_DUPLICATE_OR_MISSING_WORDCARD_ID');
   wordmap.set(card.id,card);
   if(!String(card.phoneticUk??card.phoneticUs??'').trim())detailedStats.missing_ipa++;
   if(!String(card.exampleEn??'').trim()||!String(card.exampleZh??'').trim())
    detailedStats.missing_bilingual_example++;
  }
  let counts={occurrences:0,unresolved:0,paragraphs:0,paragraphs_without_target:0,
   wordcard_count:wordmap.size};
  const seenChapters=new Set();
  for(const ch of x.chapters){
   if(!Number.isInteger(ch.number)||seenChapters.has(ch.number)||
      !Array.isArray(ch.paragraphs))
    throw Error('BINDING_REVIEW_INVALID_CHAPTER');
   seenChapters.add(ch.number);
   ch.paragraphs.forEach((paragraph,pidx)=>{
    if(!Array.isArray(paragraph?.segments))throw Error('BINDING_REVIEW_INVALID_PARAGRAPH');
    counts.paragraphs++;let marked=0;
    paragraph.segments.forEach((seg,sidx)=>{
      if(typeof seg.wordId!=='string')return;
      marked++;counts.occurrences++;
      const card=wordmap.get(seg.wordId),old=candidateMap.get(seg.wordId);
      const flags=[];
      if(!card){flags.push('UNRESOLVED_WORDCARD_ID');detailedStats.invalid_card_ref++}
      else if(!old){flags.push('NO_HISTORICAL_CANDIDATE');detailedStats.missing_legacy_candidates++}
      else{
       if(lemma(card.headword)!==lemma(old.headword)){
        flags.push('CANDIDATE_HEADWORD_CHANGED');detailedStats.mismatched_headword++}
       if(part(card.partOfSpeech)!==part(old.part_of_speech)){
        flags.push('CANDIDATE_PART_OF_SPEECH_CHANGED');detailedStats.mismatched_pos++}
       if(zh(card.meaningZh)!==zh(old.meaning_zh)){
        flags.push('CANDIDATE_MEANING_CHANGED');detailedStats.mismatched_meaning++}
       if(!Array.isArray(old.historical_book_ids)||
          !old.historical_book_ids.includes(book))
        flags.push('CANDIDATE_NOT_FROM_THIS_HISTORICAL_BOOK');
      }
      if(card&&zh(seg.gloss)!==zh(card.meaningZh)){
       flags.push('CONTEXT_GLOSS_DIFFERS');detailedStats.context_gloss_discrepancies++}
      const anchor=[book,ch.number,pidx,sidx,seg.wordId].join('|');
      const cardIdentity=card?noCopy(card):null;
      const fingerprint=sum(JSON.stringify([anchor,cardIdentity,
       old?.candidate_hash_sha256??null,old?.entry_id??null,seg.surface,seg.gloss]));
      const record={
       review_id:'review_'+sum(anchor).slice(0,24),
       book_id:book,book_category:x.book.category,chapter_number:ch.number,
       paragraph_index:pidx,segment_index:sidx,old_word_id:seg.wordId,
       surface:seg.surface??null,context_gloss:seg.gloss??null,
       headword:card?.headword??null,part_of_speech:card?.partOfSpeech??null,
       meaning_zh:card?.meaningZh??null,
       candidate_entry_id:old?.entry_id??null,
       candidate_hash_sha256:old?.candidate_hash_sha256??null,
       source_fingerprint_sha256:fingerprint,
       issues:flags,
       approved_sense_id:null,editor_confirmed_context_sense:false,
       verified_current_published_chapter:false,
       editor_action:'hold',editor_note:'',
       eligible_for_auto_publish:false,eligible_for_study_write:false
      };
      if(reviewIdSet.has(record.review_id))throw Error('BINDING_REVIEW_DUPLICATE_ANCHOR');
      reviewIdSet.add(record.review_id);
      if(flags.length)counts.unresolved++;
      else detailedStats.reviewable_occurrences++;
      pending.push(record);
    });
    if(!marked){counts.paragraphs_without_target++;detailedStats.no_study_targets++}
   });
  }
  books.push({book_id:book,category:x.book.category,...counts});
 }
 pending.sort((a,b)=>a.book_id.localeCompare(b.book_id,'en')||
   a.chapter_number-b.chapter_number||a.paragraph_index-b.paragraph_index||
   a.segment_index-b.segment_index);
 return {status:'HISTORICAL_LOCAL_NOVEL_BINDINGS_REVIEW_REQUIRED',
  source_type:'private_local_novel_json_not_live_publisher_snapshot',
  summary:{books:books.length,candidate_occurrences:pending.length,
   ...detailedStats,actual_approved_context_bindings:0,
   live_database_writes:0,production_deployments:0},
  books:books.sort((a,b)=>a.book_id.localeCompare(b.book_id,'en')),
  review_rows:pending,
  all_decisions_default_hold:true,approved_senses_created:0,
  release_blocked:true,live_snapshot_checked:false,
  warning:'Card match and lemma spelling are NOT proof of contextual meaning. Human editor AND current Publisher version reconciliation are required before any binding or user SRS migration.'};
}
