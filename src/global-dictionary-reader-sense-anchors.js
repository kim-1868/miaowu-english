// Read-only 020 reader anchor bridge. The reader needs a confirmed sense ID,
// not merely an entry/headword, before enabling any future learning controls.
// Approval and purchase checks run in SQL; no guessed sense or user data writes.
const CHAPTER=/^[A-Za-z0-9_-]{1,80}$/u;
const ANCHOR=/^p(?:0|[1-9][0-9]*):s(?:0|[1-9][0-9]*)$/u;
const SENSE=/^gds_[a-f0-9]{24}$/u;
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const MAX=2000;
const SQL=`SELECT binding.context_anchor AS anchor,binding.entry_id,
  binding.sense_id,reviewed.pos,reviewed.meaning_zh,
  reviewed.example_en,reviewed.example_zh,lesson.senses_json
 FROM global_dictionary_book_sense_bindings binding
 JOIN global_dictionary_book_bindings legacy
  ON legacy.book_id=binding.book_id AND legacy.chapter_id=binding.chapter_id
  AND legacy.context_anchor=binding.context_anchor
  AND legacy.entry_id=binding.entry_id
 JOIN chapter_words word
  ON word.chapter_id=legacy.chapter_id AND word.context_anchor=legacy.context_anchor
  AND word.word_id=legacy.legacy_word_id
 JOIN global_dictionary_senses reviewed ON reviewed.sense_id=binding.sense_id
  AND reviewed.entry_id=binding.entry_id AND reviewed.approved=1
  AND reviewed.active=1 AND length(trim(reviewed.reviewed_by))>0
  AND length(trim(reviewed.reviewed_at))>0
 JOIN global_dictionary_entries entry ON entry.entry_id=binding.entry_id
  AND entry.teaching_ready=1 AND entry.reviewed_at IS NOT NULL
 JOIN global_dictionary_sources source ON source.source_key=entry.source_name
  AND source.enabled=1 AND source.license_reviewed=1
 JOIN global_dictionary_lessons lesson ON lesson.entry_id=binding.entry_id
  AND length(trim(lesson.reviewed_by))>0 AND length(trim(lesson.reviewed_at))>0
  AND length(trim(lesson.phonetic_uk))>0 AND length(trim(lesson.phonetic_us))>0
 JOIN chapters chapter ON chapter.id=binding.chapter_id
  AND chapter.book_id=binding.book_id
 JOIN books book ON book.id=binding.book_id AND book.status='published'
 JOIN categories category ON category.id=book.category_id AND category.is_visible=1
 WHERE binding.chapter_id=? AND chapter.published_at IS NOT NULL
  AND chapter.published_at<=CURRENT_TIMESTAMP
  AND (chapter.is_preview=1 OR EXISTS (
   SELECT 1 FROM entitlements allowed
   WHERE allowed.user_id=? AND allowed.category_id=book.category_id
    AND allowed.revoked_at IS NULL AND NOT EXISTS(
      SELECT 1 FROM activation_codes revoked WHERE revoked.id=allowed.source_code_id
      AND revoked.status='revoked')))
 ORDER BY binding.context_anchor LIMIT ${MAX+1}`;
const z=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>z(x).toLowerCase().replace(/[.。]/gu,'');
function reviewedLessonMatches(r){
 if(!pos(r.pos)||!z(r.meaning_zh)||!r.example_en?.trim()||!r.example_zh?.trim())
  return false;
 let lesson;try{lesson=JSON.parse(r.senses_json)}catch{return false}
 return Array.isArray(lesson)&&lesson.filter(s=>
  pos(s?.pos)===pos(r.pos)&&z(s?.meaningZh)===z(r.meaning_zh)&&
  s?.exampleEn?.trim()===r.example_en.trim()&&
  s?.exampleZh?.trim()===r.example_zh.trim()).length===1;
}
export async function listReviewedReaderSenseAnchors(db,{chapterId,userId}={}){
 if(typeof db?.prepare!=='function'||!CHAPTER.test(chapterId||'')||
  typeof userId!=='string'||!userId||userId.length>128)
  throw Error('SENSE_READER_INVALID_AUTHORIZED_CHAPTER');
 const data=await db.prepare(SQL).bind(chapterId,userId).all();
 if(!Array.isArray(data?.results)||data.results.length>MAX)
  throw Error('SENSE_READER_INVALID_PAGE_SIZE');
 const anchors=[],seen=new Set();
 for(const row of data.results){
  if(!ANCHOR.test(row.anchor||'')||!ENTRY.test(row.entry_id||'')||
   !SENSE.test(row.sense_id||'')||seen.has(row.anchor)||
   !reviewedLessonMatches(row))
    throw Error('SENSE_READER_INVALID_OR_AMBIGUOUS_APPROVED_ANCHOR');
  seen.add(row.anchor);
  anchors.push({anchor:row.anchor,entry_id:row.entry_id,sense_id:row.sense_id});
 }
 return {chapterId,anchors,study_identity:'sense_id',publisher_binding_required:true,
  approved_only:true,read_only:true,automatically_published:false,
  user_study_rows_written:0,d1_writes:0};
}
