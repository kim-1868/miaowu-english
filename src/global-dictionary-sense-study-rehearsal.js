// B1.4 read-only projection: identical APPROVED senses may share progress,
// unrelated meanings of one displayed headword may NEVER share mastery.
const SENSE=/^gds_[a-f0-9]{24}$/;
const STATUSES=new Set(['new','learning','review_due','mastered']);
const earliest=items=>items.filter(Boolean).sort()[0]||null;
const latest=items=>items.filter(Boolean).sort().at(-1)||null;
export function rehearseApprovedSenseStudyState({links=[],progress=[]}={}){
 if(!Array.isArray(links)||!Array.isArray(progress))
  throw Error('INVALID_SENSE_STUDY_INPUT');
 const mapping=new Map(),issues=[];
 for(const x of links){
  if(!x||typeof x.legacy_word_id!=='string'||!x.legacy_word_id||
    !SENSE.test(x.sense_id||'')||x.reviewed!==true||
    x.source_approved!==true||x.lesson_approved!==true||
    x.sense_approved!==true){
   issues.push('UNAPPROVED_SENSE_LINK_IGNORED');
   continue;
  }
  if(mapping.has(x.legacy_word_id)){
   if(mapping.get(x.legacy_word_id)!==x.sense_id)
    throw Error('LEGACY_WORD_ID_CONFLICTS_ACROSS_SENSES');
   throw Error('DUPLICATE_APPROVED_LEGACY_SENSE_LINK');
  }
  mapping.set(x.legacy_word_id,x.sense_id);
 }
 const groups=new Map(),rowSeen=new Set();
 let unmapped=0;
 for(const row of progress){
  if(!row||typeof row.user_id!=='string'||!row.user_id||
    typeof row.word_id!=='string'||!row.word_id||
    !STATUSES.has(row.status)||![0,1,true,false].includes(row.bookmarked)||
    row.due_at!=null&&typeof row.due_at!=='string'||
    row.last_seen_at!=null&&typeof row.last_seen_at!=='string')
   throw Error('INVALID_OR_CORRUPTED_STUDY_ROW');
  const original=row.user_id+'\u0000'+row.word_id;
  if(rowSeen.has(original))throw Error('DUPLICATE_HISTORICAL_STUDY_ROW');
  rowSeen.add(original);
  const sense=mapping.get(row.word_id);
  if(!sense){unmapped++;continue}
  const groupKey=row.user_id+'\u0000'+sense;
  if(!groups.has(groupKey))groups.set(groupKey,{
   user_id:row.user_id,sense_id:sense,old_rows:[]});
  groups.get(groupKey).old_rows.push(row);
 }
 const proposed=[],counts={
  original_study_rows:progress.length,
  reviewed_legacy_sense_links:mapping.size,
  unmapped_study_rows:unmapped,
  proposed_sense_groups:groups.size,
  repeated_same_sense_groups:0,
  conflicting_mastery_groups:0,
  merged_bookmark_candidates:0,
  missing_due_dates:0,
  different_senses_not_collapsed:true,
  production_db_modified:false,review_events_modified:false,
  books_modified:false,entitlements_modified:false};
 for(const g of groups.values()){
  const rows=g.old_rows,statuses=rows.map(x=>x.status);
  if(rows.length>1)counts.repeated_same_sense_groups++;
  const allMastered=statuses.every(x=>x==='mastered');
  const anyMastered=statuses.includes('mastered');
  if(anyMastered&&!allMastered)counts.conflicting_mastery_groups++;
  const status=allMastered?'mastered':statuses.includes('review_due')?
   'review_due':statuses.includes('learning')||anyMastered?
   'learning':'new';
  const bookmarked=rows.some(x=>x.bookmarked===1||x.bookmarked===true);
  if(bookmarked&&rows.some(x=>!(x.bookmarked===1||x.bookmarked===true)))
   counts.merged_bookmark_candidates++;
  const notMastered=rows.filter(x=>x.status!=='mastered');
  const due_at=status==='mastered'?null:earliest(notMastered.map(x=>x.due_at));
  if(status!=='mastered'&&notMastered.some(x=>!x.due_at))
   counts.missing_due_dates++;
  proposed.push({user_id:g.user_id,sense_id:g.sense_id,status,
   bookmarked,due_at,last_seen_at:latest(rows.map(x=>x.last_seen_at)),
   source_old_word_ids:rows.map(x=>x.word_id).sort(),
   requires_manual_review:rows.length>1&&
    (anyMastered&&!allMastered||notMastered.some(x=>!x.due_at))});
 }
 proposed.sort((a,b)=>a.user_id.localeCompare(b.user_id,'en')||
  a.sense_id.localeCompare(b.sense_id,'en'));
 return {status:'LOCAL_ONLY_SENSE_LEVEL_STUDY_REHEARSAL',
  counts,issues:[...new Set(issues)],
  proposed_rows:proposed,
  human_approval_required:true,
  automatic_production_migration_allowed:false,
  user_progress_writes:0,review_event_writes:0,entitlement_writes:0};
}
