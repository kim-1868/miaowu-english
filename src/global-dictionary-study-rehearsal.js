// B1.1 conservative read-only study-state reconciliation.
// This is NOT a migration. It must not mark one whole dictionary headword as
// mastered if even one historical sense is still new/learning/review-due.
const STATUSES=new Set(['new','learning','review_due','mastered']);
const ID=/^[a-z][a-z0-9_-]{2,99}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)?$/;
const earliest=values=>values.filter(Boolean).sort()[0]||null;
const latest=values=>values.filter(Boolean).sort().at(-1)||null;

export function reconcileCanonicalStudyRows({links=[],progress=[]}={}){
 if(!Array.isArray(links)||!Array.isArray(progress))
  throw Error('INVALID_CANONICAL_STATE_ROWS');
 const canonical=new Map(),validLinks=new Map(),issues=[];
 for(const x of links){
  if(!x||!ID.test(x.legacy_word_id||'')||!ID.test(x.entry_id||'')||
      x.reviewed!==true||x.source_approved!==true||x.lesson_approved!==true){
   issues.push('UNAPPROVED_OR_INVALID_LEGACY_LINK');
   continue;
  }
  if(validLinks.has(x.legacy_word_id)&&validLinks.get(x.legacy_word_id)!==x.entry_id){
   // Stop the entire preview rather than guessing which paid dictionary card
   // should become the user's identity.
   throw Error('LEGACY_ID_CANONICAL_CONFLICT');
  }
  validLinks.set(x.legacy_word_id,x.entry_id);
 }
 let unmapped=0;
 const exact=new Set();
 for(const row of progress){
  if(!row||typeof row.user_id!=='string'||!row.user_id||
     !ID.test(row.word_id||'')||!STATUSES.has(row.status)||
     ![0,1,true,false].includes(row.bookmarked)||
     (row.due_at!=null&&!DATE.test(row.due_at))||
     (row.last_seen_at!=null&&!DATE.test(row.last_seen_at)))
    throw Error('INVALID_HISTORICAL_STUDY_ROW');
  const original=row.user_id+'\0'+row.word_id;
  if(exact.has(original))throw Error('DUPLICATE_HISTORICAL_STUDY_RECORD');
  exact.add(original);
  const entry=validLinks.get(row.word_id);
  if(!entry){unmapped++;continue}
  const k=row.user_id+'\0'+entry;
  if(!canonical.has(k))canonical.set(k,{user_id:row.user_id,entry_id:entry,rows:[]});
  canonical.get(k).rows.push(row);
 }
 const normalized=[];
 const counts={unmapped,records:progress.length,
  reviewed_links:validLinks.size,canonical_groups:canonical.size,
  duplicate_legacy_groups:0,mastery_conflicts:0,bookmark_unions:0,
  pending_due_unknown:0,source_records_untouched:true};
 for(const group of canonical.values()){
  const rows=group.rows,ids=[...new Set(rows.map(x=>x.word_id))].sort();
  if(rows.length>1)counts.duplicate_legacy_groups++;
  const statuses=[...new Set(rows.map(x=>x.status))];
  const allMastered=statuses.length===1&&statuses[0]==='mastered';
  const someMastered=statuses.includes('mastered');
  if(someMastered&&!allMastered)counts.mastery_conflicts++;
  let status;
  if(allMastered)status='mastered';
  else if(statuses.includes('review_due'))status='review_due';
  else if(statuses.includes('learning')||someMastered)status='learning';
  else status='new';
  const bookmarked=rows.some(x=>x.bookmarked===1||x.bookmarked===true);
  if(bookmarked&&rows.some(x=>!(x.bookmarked===1||x.bookmarked===true)))
   counts.bookmark_unions++;
  const notMastered=rows.filter(x=>x.status!=='mastered');
  const due_at=status==='mastered'?null:earliest(notMastered.map(x=>x.due_at));
  if(status!=='mastered'&&notMastered.some(x=>!x.due_at))
   counts.pending_due_unknown++;
  const last_seen_at=latest(rows.map(x=>x.last_seen_at));
  normalized.push({user_id:group.user_id,entry_id:group.entry_id,
    status,bookmarked,due_at,last_seen_at,
    source_legacy_word_ids:ids,
    requires_manual_review:someMastered&&!allMastered||
      status!=='mastered'&&notMastered.some(x=>!x.due_at)});
 }
 // No user records are written here; this is a reversible proposed projection.
 return {status:'READ_ONLY_CANONICAL_STUDY_REHEARSAL',counts,
  issues:[...new Set(issues)],
  proposed_rows:normalized.sort((a,b)=>
    a.user_id.localeCompare(b.user_id,'en')||
    a.entry_id.localeCompare(b.entry_id,'en')),
  migration_applied:false,review_events_modified:false,
  entitlement_state_modified:false};
}
