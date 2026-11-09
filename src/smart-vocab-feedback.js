// Pure user-feedback transitions for future smart vocabulary.
// No DB, no payment code and no direct impact on existing reader/flashcards.
export const SRS_INTERVALS=Object.freeze([1,3,7,14,30]);

export function applySmartRecall(previous={},judgment,studyDay){
  if(!['known','forgot'].includes(judgment))throw Error('INVALID_RECALL_FEEDBACK');
  if(typeof studyDay!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(studyDay))
    throw Error('INVALID_STUDY_DAY');
  const priorStreak=Math.max(0,Math.min(5,Number.isSafeInteger(previous.correctStreak)?previous.correctStreak:0));
  // Same-day repeated correct answers must not accelerate SRS intervals.
  const sameDay=previous.lastCorrectDay===studyDay;
  const streak=judgment==='known'?(sameDay?Math.max(1,priorStreak):Math.min(5,priorStreak+1)):0;
  const nextReviewDays=judgment==='known'?SRS_INTERVALS[Math.max(0,streak-1)]:1;
  const status=judgment==='known'&&previous.status==='mastered'?'mastered':'learning';
  return {
    status,correctStreak:streak,nextReviewDays,
    lastCorrectDay:judgment==='known'?studyDay:previous.lastCorrectDay||null,
    // Passive forgetting and recall must NEVER create/remove a bookmark.
    bookmarked:previous.bookmarked===true
  };
}

export function applySmartBookmark(previous={},bookmarked){
  if(typeof bookmarked!=='boolean')throw Error('INVALID_BOOKMARK_STATE');
  return {...previous,bookmarked};
}

// A failed network write never advances a local card. Only an acknowledged,
// authoritative server answer can advance and be used for requeue decisions.
export function shouldAdvanceSmartCard(response){
  return response?.saved===true&&response?.wordId!=null&&
    (response?.alreadyApplied===true||response?.result==='correct'||
      response?.result==='incorrect');
}
