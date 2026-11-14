// Pure reviewed sense matching for V2 study anchors, separate from display cards.
// An entry_id alone must never stand in for a specific learned sense.
const zh=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replace(/[.。]/gu,'');
const ID=/^gds_[0-9a-f]{24}$/;
const place=x=>[x.chapter_number,x.paragraph_index,x.segment_index].join(':');
export function planApprovedNovelSenseAnchors(resolved,{lessons=new Map(),senses=[]}={}){
 if(!Array.isArray(resolved)||!Array.isArray(senses))throw Error('INVALID_SENSE_ANCHOR_ROWS');
 const byEntry=new Map(),seenSense=new Set();
 for(const raw of senses){
  if(!raw||typeof raw.entry_id!=='string'||!ID.test(raw.sense_id||'')||
   seenSense.has(raw.sense_id))throw Error('INVALID_OR_DUPLICATE_SENSE_ROW');
  seenSense.add(raw.sense_id);
  if(!byEntry.has(raw.entry_id))byEntry.set(raw.entry_id,[]);
  byEntry.get(raw.entry_id).push(raw);
 }
 const checked=[],review=[],seenAnchor=new Set();
 for(const target of resolved){
  const anchor=place(target);
  if(seenAnchor.has(anchor))throw Error('DUPLICATE_REVIEWED_SENSE_ANCHOR');
  seenAnchor.add(anchor);
  const entry=target.entry_id;
  const lesson=lessons instanceof Map?lessons.get(entry):lessons?.[entry];
  let lessonSenses;
  try{lessonSenses=typeof lesson?.senses_json==='string'?
    JSON.parse(lesson.senses_json):lesson?.senses_json}
  catch{lessonSenses=null}
  const matchingLesson=Array.isArray(lessonSenses)?lessonSenses.filter(s=>
    zh(s?.meaningZh)===zh(target.gloss)&&pos(s?.pos)&&
    typeof s?.exampleEn==='string'&&s.exampleEn.trim()&&
    typeof s?.exampleZh==='string'&&s.exampleZh.trim()):[];
  const reviewedRows=(byEntry.get(entry)||[]).filter(s=>
    s.approved===1||s.approved===true).filter(s=>
    s.active===1||s.active===true).filter(s=>
    s.reviewed_by&&s.reviewed_at&&zh(s.meaning_zh)===zh(target.gloss)&&
    matchingLesson.some(v=>pos(v.pos)===pos(s.pos)));
  let reason=null;
  if(!lesson||!Array.isArray(lessonSenses))reason='REVIEWED_LESSON_SENSES_REQUIRED';
  else if(!matchingLesson.length)reason='CONTEXT_MEANING_NOT_IN_APPROVED_LESSON';
  else if(reviewedRows.length===0)reason='STABLE_APPROVED_SENSE_ID_MISSING';
  else if(reviewedRows.length>1)reason='AMBIGUOUS_APPROVED_SENSE_ID';
  const at={chapter_number:target.chapter_number,
    paragraph_index:target.paragraph_index,segment_index:target.segment_index,
    entry_id:entry,headword:target.headword,meaning_zh:target.gloss};
  if(reason)review.push({...at,reason,available_sense_count:reviewedRows.length});
  else checked.push({...at,sense_id:reviewedRows[0].sense_id,
   pos:reviewedRows[0].pos});
 }
 return {status:'READ_ONLY_REVIEWED_SENSE_BINDINGS_NOT_APPLIED',
  total_occurrences:resolved.length,approved_sense_occurrences:checked.length,
  manual_review_occurrences:review.length,
  ready_for_sense_study:resolved.length>0&&review.length===0,
  reviewed_anchor_candidates:checked,review_queue:review,
  old_learning_states_migrated:false,novel_modified:false,
  user_data_accessed:false,
  warning:'Display wordId may stay shared by headword, but study/review identity requires each approved sense_id; no migration was made.'};
}
