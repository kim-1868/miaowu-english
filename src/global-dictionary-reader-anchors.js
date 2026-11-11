// V1.2 phase 3: staging-only READ-ONLY approved word anchors for an entitled
// chapter. All data is loaded by authenticated Worker; a name match alone is
// never an authorization to display a teaching card. No D1 writes.
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const CHAPTER=/^[a-zA-Z0-9_-]{1,80}$/u;
const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
const MAX=2000;
const SELECT=`SELECT sb.context_anchor AS anchor,sb.entry_id
 FROM global_dictionary_book_sense_bindings sb
 JOIN global_dictionary_book_bindings binding
   ON binding.book_id=sb.book_id AND binding.chapter_id=sb.chapter_id
   AND binding.context_anchor=sb.context_anchor AND binding.entry_id=sb.entry_id
 JOIN chapter_words cw ON cw.chapter_id=sb.chapter_id
   AND cw.context_anchor=sb.context_anchor AND cw.word_id=binding.legacy_word_id
 JOIN chapters ch ON ch.id=sb.chapter_id AND ch.book_id=sb.book_id
 JOIN books b ON b.id=sb.book_id AND b.status='published'
 JOIN categories c ON c.id=b.category_id AND c.is_visible=1
 JOIN global_dictionary_senses sense ON sense.sense_id=sb.sense_id
   AND sense.entry_id=sb.entry_id AND sense.approved=1 AND sense.active=1
   AND length(trim(sense.reviewed_by))>0 AND length(trim(sense.reviewed_at))>0
 JOIN global_dictionary_entries e ON e.entry_id=sb.entry_id
   AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
 JOIN global_dictionary_sources source ON source.source_key=e.source_name
   AND source.enabled=1 AND source.license_reviewed=1
 JOIN global_dictionary_lessons lesson ON lesson.entry_id=e.entry_id
   AND length(trim(lesson.reviewed_by))>0 AND length(trim(lesson.reviewed_at))>0
 WHERE sb.chapter_id=? AND ch.published_at IS NOT NULL
   AND ch.published_at<=CURRENT_TIMESTAMP
   AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements allowed
     WHERE allowed.user_id=? AND allowed.category_id=b.category_id
       AND allowed.revoked_at IS NULL AND NOT EXISTS(
         SELECT 1 FROM activation_codes revoked WHERE revoked.id=allowed.source_code_id
           AND revoked.status='revoked')))
 ORDER BY sb.context_anchor LIMIT ${MAX+1}`;
export async function listApprovedReaderChapterAnchors(db,{chapterId,userId}={}){
 if(!db||typeof db.prepare!=='function'||!CHAPTER.test(chapterId||'')||
   typeof userId!=='string'||!userId||userId.length>128)
  throw Error('INVALID_REVIEWED_READER_ANCHOR_REQUEST');
 const result=await db.prepare(SELECT).bind(chapterId,userId).all();
 if(!Array.isArray(result?.results)||result.results.length>MAX)
  throw Error('REVIEWED_READER_ANCHOR_LIMIT_EXCEEDED');
 const seen=new Set(),anchors=[];
 for(const row of result.results){
  if(!ANCHOR.test(row?.anchor||'')||!ENTRY.test(row?.entry_id||'')||seen.has(row.anchor))
   throw Error('INVALID_OR_DUPLICATE_REVIEWED_READER_ANCHOR');
  seen.add(row.anchor);anchors.push({anchor:row.anchor,entry_id:row.entry_id});
 }
 return {chapterId,anchors,approved_only:true,read_only:true,
   automatically_published:false,d1_writes:0};
}