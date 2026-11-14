// V1.2: one displayed headword = one user's practice schedule, across books.
// Pure functions ONLY: no API, D1, purchase or historical user state writes.
// Existing sense ids remain available for contextual teaching and audit.
const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const INTERVALS=Object.freeze([1,3,7,14,30]);
const STATUSES=new Set(['new','learning','review_due','mastered']);
const KINDS=new Set(['seen','remembered','forgotten','mark_mastered','unmark_mastered']);
const date=x=>{
  if(typeof x!=='string'||!ISO.test(x)||!Number.isFinite(Date.parse(x))||
      (x!==new Date(x).toISOString()&&
       x!==new Date(x).toISOString().replace(/\.000Z$/u,'Z')))
    throw Error('HEADWORD_SRS_INVALID_TIME');
  return x;
};
const later=(now,days)=>new Date(Date.parse(now)+days*86400000).toISOString();
const utcDay=now=>now.slice(0,10);
const okayTime=x=>x===null||date(x);
const nonNegative=x=>Number.isSafeInteger(x)&&x>=0;
const person=x=>typeof x==='string'&&x.length>0&&x.length<=128&&
  !/[\u0000-\u001f]/u.test(x);
function validate(state){
  if(!state||typeof state!=='object'||Array.isArray(state)||
    !person(state.user_id)||!ENTRY.test(state.entry_id||'')||
    !STATUSES.has(state.status)||!Number.isInteger(state.stage)||
    state.stage<0||state.stage>5||typeof state.bookmarked!=='boolean'||
    !nonNegative(state.encounter_count)||!nonNegative(state.remembered_count)||
    !nonNegative(state.forgotten_count)||
    !okayTime(state.due_at)||!okayTime(state.last_seen_at)||
    !okayTime(state.last_feedback_at)||!okayTime(state.mastered_at)||
    (state.last_advanced_day!==null&&
      (typeof state.last_advanced_day!=='string'||!DAY.test(state.last_advanced_day)))||
    (state.status==='mastered'&&state.due_at!==null)||
    (state.stage===0&&state.due_at!==null))
    throw Error('HEADWORD_SRS_INVALID_STATE');
  return state;
}
export const HEADWORD_SRS_DAYS=INTERVALS;
export function createHeadwordStudyState({user_id,entry_id}){
  const s={user_id,entry_id,status:'new',stage:0,bookmarked:false,
    encounter_count:0,remembered_count:0,forgotten_count:0,
    due_at:null,last_seen_at:null,last_feedback_at:null,
    last_advanced_day:null,mastered_at:null};
  validate(s);
  return s;
}
export function previewHeadwordStudyDue(state,at){
  const s=validate(state),now=date(at);
  return {entry_id:s.entry_id,user_id:s.user_id,stage:s.stage,
    status:s.status==='mastered'?'mastered':
      s.due_at&&Date.parse(now)>=Date.parse(s.due_at)?'review_due':s.status,
    due_at:s.due_at,is_due:Boolean(s.status!=='mastered'&&s.due_at&&
      Date.parse(now)>=Date.parse(s.due_at)),
    mastered:s.status==='mastered'};
}
export function applyHeadwordStudyFeedback(state,{kind,at}={}){
  const s=validate(state),now=date(at);
  if(!KINDS.has(kind))throw Error('HEADWORD_SRS_INVALID_FEEDBACK');
  if(s.last_seen_at&&Date.parse(now)<Date.parse(s.last_seen_at)||
    s.last_feedback_at&&Date.parse(now)<Date.parse(s.last_feedback_at))
    throw Error('HEADWORD_SRS_NONMONOTONIC_TIMESTAMP');
  const day=utcDay(now);
  const next={...s,last_seen_at:now};
  let advanced=false,session_requeue_after=null;
  if(kind==='seen'){
    // Opening the same card in other books never changes the SRS schedule.
    next.encounter_count++;
  }else{
    next.last_feedback_at=now;
    if(kind==='remembered'){
      next.remembered_count++;
      if(s.status!=='mastered'&&s.last_advanced_day!==day&&
         (s.stage===0||s.due_at!==null&&Date.parse(now)>=Date.parse(s.due_at))){
        next.stage=Math.min(5,s.stage+1);
        next.status='learning';
        next.due_at=later(now,INTERVALS[next.stage-1]);
        next.last_advanced_day=day;
        advanced=true;
      }
    }else if(kind==='forgotten'){
      next.forgotten_count++;
      next.status='learning';
      next.stage=Math.max(1,s.stage-1);
      const suggested=later(now,1);
      // Repeated wrong answers in one day cannot postpone an earlier due date.
      next.due_at=s.due_at&&Date.parse(s.due_at)>Date.parse(now)&&
        Date.parse(s.due_at)<Date.parse(suggested)?s.due_at:suggested;
      next.mastered_at=null;
      next.last_advanced_day=day;
      session_requeue_after=5; // only a hint; the fast-review queue owns repeats.
    }else if(kind==='mark_mastered'){
      next.status='mastered';
      next.due_at=null;
      next.mastered_at=now;
    }else if(kind==='unmark_mastered'){
      if(s.status!=='mastered')throw Error('HEADWORD_SRS_NOT_MASTERED');
      next.status='learning';
      next.stage=1;
      next.due_at=later(now,1);
      next.last_advanced_day=day;
      next.mastered_at=null;
    }
  }
  validate(next);
  return {state:next,advanced,session_requeue_after,
    status:'PURE_HEADWORD_SRS_PROPOSAL_NO_DATABASE_WRITE',
    study_key:{user_id:s.user_id,entry_id:s.entry_id},
    database_writes:0,review_events_written:0,legacy_words_modified:0};
}
export function setHeadwordBookmark(state,bookmarked){
  const s=validate(state);
  if(typeof bookmarked!=='boolean')throw Error('HEADWORD_SRS_INVALID_BOOKMARK');
  return {...s,bookmarked};
}