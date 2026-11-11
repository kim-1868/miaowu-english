// Read-only edition comparison of private historical manuscripts to current
// authenticated Publisher exports. No publication or database writes.
const SHA=/^[a-f0-9]{64}$/u;
const ID=/^[a-zA-Z0-9_-]{1,80}$/u;
const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const finite=x=>Number.isSafeInteger(x)&&x>=0;
const unique=(records,name)=>{
 const seen=new Set();
 for(const x of records){
  if(seen.has(x))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_'+name);
  seen.add(x);
 }
};
function rejectStatus(item){
 if(item?.publisher_approved===true||item?.publication_allowed===true||
   item?.user_study_update_allowed===true)throw Error('PUBLISHER_SNAPSHOT_FORGED_APPROVAL');
}
export function comparePublisherSnapshotForSenseBinding({
 historicalBooks=[],currentBooks=[],currentAnchors=[]
}={}){
 if(!Array.isArray(historicalBooks)||!historicalBooks.length||
  !Array.isArray(currentBooks)||!Array.isArray(currentAnchors)||
  historicalBooks.length>500||currentBooks.length>500||currentAnchors.length>100000)
  throw Error('PUBLISHER_SNAPSHOT_INVALID_BATCH');
 const history=new Map(),live=new Map(),perBook=new Map();
 for(const h of historicalBooks){
  if(!ID.test(h?.book_id||'')||!SHA.test(h?.historical_file_sha256||'')||
    !Array.isArray(h.chapter_numbers)||!h.chapter_numbers.length||
    !h.chapter_numbers.every(n=>finite(n))||
    !finite(h.historical_words)||!finite(h.annotated_word_occurrences))
   throw Error('PUBLISHER_SNAPSHOT_INVALID_HISTORICAL_METADATA');
  if(history.has(h.book_id))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_HISTORY_BOOK');
  unique(h.chapter_numbers,'HISTORICAL_CHAPTER');
  history.set(h.book_id,h);
 }
 for(const b of currentBooks){
  rejectStatus(b);
  if(!ID.test(b?.book_id||'')||!SHA.test(b?.current_book_sha256||'')||
    !ID.test(b?.current_revision||'')||
    !Array.isArray(b.chapters)||!b.chapters.length)
   throw Error('PUBLISHER_SNAPSHOT_INVALID_CURRENT_BOOK');
  if(live.has(b.book_id))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_CURRENT_BOOK');
  const chapters=new Map();
  for(const ch of b.chapters){
   if(!ID.test(ch?.chapter_id||'')||!finite(ch.chapter_number)||
     !SHA.test(ch.content_sha256||''))throw Error('PUBLISHER_SNAPSHOT_INVALID_CHAPTER');
   if(chapters.has(ch.chapter_number))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_CURRENT_CHAPTER');
   chapters.set(ch.chapter_number,ch);
  }
  live.set(b.book_id,{...b,chapterMap:chapters});
 }
 const seenAnchors=new Set();
 for(const a of currentAnchors){
  rejectStatus(a);
  if(!ID.test(a?.book_id||'')||!ID.test(a?.chapter_id||'')||
    !ANCHOR.test(a?.context_anchor||'')||!ID.test(a?.legacy_word_id||'')||
    (a?.candidate_entry_id!=null&&!ENTRY.test(a.candidate_entry_id))||
    (a?.candidate_sense_id!=null&&!SENSE.test(a.candidate_sense_id)))
   throw Error('PUBLISHER_SNAPSHOT_INVALID_ANCHOR');
  const k=[a.book_id,a.chapter_id,a.context_anchor].join('|');
  if(seenAnchors.has(k))throw Error('PUBLISHER_SNAPSHOT_DUPLICATE_ANCHOR');
  seenAnchors.add(k);
  if(!perBook.has(a.book_id))perBook.set(a.book_id,[]);
  perBook.get(a.book_id).push(a);
 }
 const reviews=[];
 for(const [bookId,h] of history){
  const b=live.get(bookId),reasons=[];
  if(!b){reasons.push('CURRENT_PUBLISHER_BOOK_EXPORT_MISSING')}
  else{
   const historyChapters=new Set(h.chapter_numbers);
   const latestChapters=new Set(b.chapters.map(x=>x.chapter_number));
   if([...historyChapters].some(n=>!latestChapters.has(n))||
      [...latestChapters].some(n=>!historyChapters.has(n)))
    reasons.push('CHAPTER_STRUCTURE_CHANGED');
   if(b.current_book_sha256!==h.historical_file_sha256)
    reasons.push('SOURCE_VERSION_CHANGED_REVIEW_CONTEXT_AGAIN');
   const anchors=perBook.get(bookId)||[];
   if(!anchors.length)reasons.push('CURRENT_CHAPTER_WORD_ANCHORS_MISSING');
   if(anchors.length!==h.annotated_word_occurrences)
    reasons.push('ANCHOR_OCCURRENCE_COUNT_CHANGED');
   for(const a of anchors){
    const found=b.chapters.find(ch=>ch.chapter_id===a.chapter_id);
    if(!found)reasons.push('ORPHANED_LIVE_CHAPTER_WORD_ANCHOR');
   }
   if(anchors.some(a=>!a.candidate_entry_id||!a.candidate_sense_id))
    reasons.push('EDITOR_CONFIRMATION_OF_CONTEXT_SENSE_REQUIRED');
  }
  reviews.push({book_id:bookId,historical_sha256:h.historical_file_sha256,
   current_revision:b?.current_revision??null,
   current_book_sha256:b?.current_book_sha256??null,
   current_anchors:(perBook.get(bookId)||[]).length,
   historical_annotated_occurrences:h.annotated_word_occurrences,
   reasons:[...new Set(reasons)],requires_editor_review:true,
   eligible_for_auto_publish:false,eligible_for_srs_writes:false});
 }
 const missingLive=reviews.filter(x=>x.reasons.includes('CURRENT_PUBLISHER_BOOK_EXPORT_MISSING')).length;
 return {status:'PRIVATE_PUBLISHER_SENSE_BINDING_VERSION_RECONCILIATION',
  summary:{historical_books:history.size,current_exports:live.size,
   current_anchors:currentAnchors.length,missing_live_books:missingLive,
   books_with_review_flags:reviews.filter(r=>r.reasons.length).length,
   approved_senses_created:0,publisher_writes:0,customer_srs_writes:0},
  books:reviews,verified_current_publisher_bindings:0,
  editorial_context_review_required:true,publication_allowed:false,
  warning:'Matching hashes and IDs only prove structural provenance, not correct contextual sense or commercially reviewed content.'};
}
