// PRIVATE OFFLINE editorial action planner built on verified crossbook preflight.
// Creates audit tasks, NEVER authenticated editorial approvals, binding writes,
// learning-state updates, or novel publication.
import {createHash} from 'node:crypto';
const GRADES=['cet4','cet6','postgrad'];
const REVIEW_STATUS='PRIVATE_BATCH_CROSSBOOK_SENSE_CANDIDATES_ONLY';
const letters=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
const rank=(a,b)=>b.priority-a.priority||a.task_id.localeCompare(b.task_id,'en');
const key=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,24);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
function assertReview(report){
 if(report?.status!==REVIEW_STATUS||report.release_blocked!==true||
    report.all_candidates_unapproved!==true||
    report.user_data_read!==false||report.cloudflare_accessed!==false||
    report.paid_story_sentences_in_report!==false||
    !Array.isArray(report.books)||!Array.isArray(report.review_queue)||
    !Array.isArray(report.unmarked_discovery_queue)||!report.summary||
    !Array.isArray(report.summary.grades)||
    report.summary.grades.some(x=>!GRADES.includes(x))||
    report.summary.approved_senses_created!==0||
    report.summary.user_study_rows_written!==0||
    report.summary.remote_d1_writes!==0)
  throw Error('REVIEW_PLAN_UNTRUSTED_OR_ALREADY_APPROVED_SOURCE');
 if(report.books.length>110||report.review_queue.length>25000||
    report.unmarked_discovery_queue.length>20000)
  throw Error('REVIEW_PLAN_INPUT_LIMIT');
 for(const book of report.books){
  if(!GRADES.includes(book?.category)||!book.book_id||
     !integer(book.paragraphs)||!integer(book.missing_card_references)||
     !integer(book.cards_missing_ipa)||!integer(book.cards_missing_examples)||
     !integer(book.context_gloss_mismatches)||!integer(book.paragraphs_without_targets))
   throw Error('REVIEW_PLAN_BOOK_INVALID');
 }
 for(const row of report.review_queue){
  if(!row?.headword||!Array.isArray(row.source_book_ids)||
     !Array.isArray(row.exam_categories)||!Array.isArray(row.review_flags)||
     row.approved_sense_id!==null||row.cross_book_mastery_merge_allowed!==false||
     row.commercially_approved!==false||!integer(row.occurrences)||
     !integer(row.historical_card_count)||
     row.exam_categories.some(x=>!GRADES.includes(x)))
   throw Error('REVIEW_PLAN_SENSE_ALREADY_APPROVED_OR_INVALID');
 }
 for(const row of report.unmarked_discovery_queue){
  if(!row?.headword||!Array.isArray(row.source_book_ids)||
     !Array.isArray(row.exam_categories)||!integer(row.occurrences)||
     row.approved_sense_id!==null||row.automatically_bound!==false||
     row.automatic_publication_allowed!==false||
     row.requires_context_sense_review!==true)
   throw Error('REVIEW_PLAN_UNMARKED_ALREADY_BOUND_OR_INVALID');
 }
}
const add=(tasks,{lane,grade,priority,subject,books=[],reasons=[],unitCount=1})=>{
 if(!integer(unitCount)||!Number.isSafeInteger(priority)||priority<0)
   throw Error('REVIEW_PLAN_INVALID_PRIORITY');
 const task_id='draft_'+key([lane,grade,subject,books.slice().sort()]);
 if(tasks.has(task_id))throw Error('REVIEW_PLAN_TASK_ID_COLLISION');
 tasks.set(task_id,{task_id,lane,grade,priority,subject,
   affected_books:[...new Set(books)].sort(),issue_count:unitCount,
   reasons:[...new Set(reasons)].sort(),
   status:'NEEDS_HUMAN_EDITORIAL_REVIEW',approval:false,approved_sense_id:null,
   source_license_verified:false,publish_allowed:false,
   user_progress_writes:0});
};
export function planCrossbookEditorialActions(report,{perGradeLimit=120}={}){
 assertReview(report);
 if(!Number.isInteger(perGradeLimit)||perGradeLimit<1||perGradeLimit>500)
  throw Error('REVIEW_PLAN_INVALID_BATCH_LIMIT');
 const tasks=new Map(),gradeBooks=Object.fromEntries(GRADES.map(g=>[g,new Set(
   report.books.filter(b=>b.category===g).map(b=>g+':'+b.book_id)
 )]));
 for(const row of report.review_queue){
  const grades=[...new Set(row.exam_categories)];
  const highReuse=row.source_book_ids.length>1;
  const blockers=[...row.review_flags];
  if(!row.strict_sense_candidate)blockers.push('SENSE_IDENTITY_INCOMPLETE');
  if(row.dictionary_lookup_status!=='matched')
    blockers.push('DICTIONARY_SOURCE_OR_LESSON_REVIEW');
  for(const grade of grades){
   const relevant=row.source_book_ids.filter(b=>gradeBooks[grade].has(b));
   if(!relevant.length)continue;
   const priority=200*Number(highReuse)+25*relevant.length+
     Math.min(100,row.occurrences)+40*Number(blockers.length>0)+
     20*Number(row.other_sense_candidates_same_spelling>0);
   add(tasks,{lane:'EXISTING_SENSE_REVIEW',grade,
     subject:[letters(row.headword),letters(row.part_of_speech),
       letters(row.meaning_zh)].join('|'),books:relevant,
     priority,reasons:blockers.length?blockers:['REVIEW_RIGHTS_AND_CONFIRM_SENSE'],
     unitCount:row.historical_card_count});
  }
 }
 for(const row of report.unmarked_discovery_queue){
  for(const grade of [...new Set(row.exam_categories)]){
   const relevant=row.source_book_ids.filter(b=>gradeBooks[grade].has(b));
   if(!relevant.length)continue;
   add(tasks,{lane:'UNMARKED_CONTEXT_REVIEW',grade,subject:letters(row.headword),
     books:relevant,priority:30*relevant.length+
       Math.min(100,row.occurrences)+
       15*Number(row.dictionary_lookup_status!=='matched'),
     reasons:['UNMARKED_ENGLISH_NEEDS_CONTEXT_CONFIRMATION',
       'DICTIONARY_'+row.dictionary_lookup_status],unitCount:row.occurrences});
  }
 }
 for(const b of report.books){
  const issues=[
   ['MISSING_CARD_REFERENCES',b.missing_card_references,450],
   ['CONTEXT_GLOSS_MISMATCH',b.context_gloss_mismatches,300],
   ['MISSING_IPA',b.cards_missing_ipa,120],
   ['MISSING_EXAMPLE',b.cards_missing_examples,120],
   ['PARAGRAPHS_WITHOUT_TARGETS',b.paragraphs_without_targets,100]
  ];
  for(const [reason,count,base] of issues){
   if(!count)continue;
   add(tasks,{lane:'BOOK_CONTENT_REPAIR',grade:b.category,
     subject:b.book_id+'|'+reason,books:[b.category+':'+b.book_id],
     priority:base+Math.min(100,count),reasons:[reason],unitCount:count});
  }
 }
 const all=[...tasks.values()].sort(rank),batches={},stats={};
 for(const grade of GRADES){
  const items=all.filter(x=>x.grade===grade);
  batches[grade]=items.slice(0,perGradeLimit).map((x,i)=>({
    ...x,review_sequence:i+1
  }));
  stats[grade]={total_tasks:items.length,scheduled_tasks:batches[grade].length,
    remaining_tasks:items.length-batches[grade].length,
    already_approved:0};
 }
 return {status:'PRIVATE_EDITORIAL_ACTION_PLAN_REQUIRES_REVIEW',
   source_status:REVIEW_STATUS,source_book_count:report.books.length,
   per_grade_limit:perGradeLimit,summary:{
     total_tasks:all.length,scheduled_tasks:Object.values(batches)
      .reduce((n,items)=>n+items.length,0),
     approved_senses:0,books_modified:0,customer_study_rows_written:0,
     remote_d1_writes:0},by_grade:stats,batches,
   source_paid_story_text_copied:false,
   publisher_authenticated_signoff:false,automatic_publication_allowed:false,
   warning:'This is an unauthenticated private editorial TASK list. Review work does not establish licensed senses or grant rights to merge historical study states.'};
}
