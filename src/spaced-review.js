// WordLetter V1.1 P4: deterministic spaced repetition decision engine.
// Isolated from old D1 tables until a reviewed, test-backed canonical sense
// migration is ready. No writes or HTTP requests in this module.
export const REVIEW_STEPS_DAYS=Object.freeze([1,3,7,14,30]);
const DAY_MS=24*60*60*1000;
const SHANGHAI_OFFSET_MS=8*60*60*1000;
// Use a consistent product learning day, not browser/client system time.
// China Standard Time has no DST, so this UTC offset is stable.
export function learningDayKey(now=new Date()){
 const t=asTime(now);
 if(!Number.isFinite(t))throw new TypeError("INVALID_REVIEW_DATE");
 return new Date(t+SHANGHAI_OFFSET_MS).toISOString().slice(0,10);
}
function asTime(value){
 return value instanceof Date?value.getTime():typeof value==="number"?value:Date.parse(String(value));
}
function iso(t){return new Date(t).toISOString()}
function stage(x){
 const n=Number(x);
 return Number.isInteger(n)?Math.min(REVIEW_STEPS_DAYS.length-1,Math.max(0,n)):0;
}
function base(state){
 return {stageIndex:stage(state?.stageIndex),dueAt:state?.dueAt||null,
  lastPositiveDay:state?.lastPositiveDay||null,
  lastReviewedAt:state?.lastReviewedAt||null,
  mastered:Boolean(state?.mastered)};
}
// First contact schedules 1 day later; browsing text alone MUST NOT call this.
export function scheduleFirstActiveLearning(state={},now=new Date()){
 const ms=asTime(now);
 if(!Number.isFinite(ms))throw new TypeError("INVALID_REVIEW_DATE");
 if(state?.dueAt||state?.mastered)return base(state);
 return {...base(state),dueAt:iso(ms+DAY_MS),stageIndex:0};
}
// Feedback is an explicit recall judgment from any of the three games.
// Repeated successful self-practice on the same day must NOT defer due again.
// Wrong feedback may bring due earlier, but NEVER unmark a mastered sense.
export function scheduleRecallFeedback(state,feedback,now=new Date()){
 if(feedback!=="correct"&&feedback!=="incorrect")throw new TypeError("INVALID_REVIEW_FEEDBACK");
 const ms=asTime(now);
 if(!Number.isFinite(ms))throw new TypeError("INVALID_REVIEW_DATE");
 const prev=base(state);
 const day=learningDayKey(ms);
 if(prev.mastered)return {...prev,lastReviewedAt:iso(ms)};
 if(feedback==="incorrect"){
  const nextStage=Math.max(0,prev.stageIndex-1);
  const earlierDue=ms+(prev.stageIndex===0?60*60*1000:DAY_MS);
  // In an overdue state, a new wrong answer gets a new short schedule;
  // if there was already a sooner due within the current day, preserve it.
  const oldDue=prev.dueAt?asTime(prev.dueAt):NaN;
  const due=Number.isFinite(oldDue)&&oldDue>ms?Math.min(oldDue,earlierDue):earlierDue;
  return {...prev,stageIndex:nextStage,dueAt:iso(due),
    lastReviewedAt:iso(ms),lastPositiveDay:null};
 }
 if(prev.lastPositiveDay===day){
  return {...prev,lastReviewedAt:iso(ms)};
 }
 const hasScheduled=Number.isFinite(asTime(prev.dueAt));
 const nextStage=hasScheduled?Math.min(4,prev.stageIndex+1):0;
 // Do not advance beyond one stage by answering again before the next due.
 const dueTime=prev.dueAt?asTime(prev.dueAt):NaN;
 const advancing=!Number.isFinite(dueTime)||dueTime<=ms;
 if(!advancing)return {...prev,lastReviewedAt:iso(ms),lastPositiveDay:day};
 const targetStage=nextStage;
 return {...prev,stageIndex:targetStage,
  dueAt:iso(ms+REVIEW_STEPS_DAYS[targetStage]*DAY_MS),
  lastReviewedAt:iso(ms),lastPositiveDay:day};
}
export function dueToday(state,now=new Date()){
 if(!state||state.mastered||!state.dueAt)return false;
 const deadline=asTime(state.dueAt),ms=asTime(now);
 if(!Number.isFinite(deadline)||!Number.isFinite(ms))return false;
 return deadline<=ms;
}
export function nextReviewDays(stageIndex){
 return REVIEW_STEPS_DAYS[stage(stageIndex)];
}
