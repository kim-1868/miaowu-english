// V1.1 canonical study-sense ledger. Existing word_ids and historical records
// remain intact; an existing sense is lazily seeded from all accessible aliases.
import {studyKey,relatedAccessibleWordIds} from "./study-identity.js";
import {scheduleRecallFeedback,scheduleFirstActiveLearning} from "./spaced-review.js";

const sql=(env,query,...args)=>env.DB.prepare(query).bind(...args);
const isoToSql=date=>date?String(date).replace("T"," ").replace(/\.\d{3}Z$/,"").replace(/Z$/,""):null;
const normalizeDate=date=>{
 if(!date)return null;
 const time=Date.parse(String(date).includes("T")?String(date):String(date).replace(" ","T")+"Z");
 return Number.isFinite(time)?new Date(time).toISOString():null;
};
const fetchSense=async(env,wordId)=>{
 const row=await sql(env,"SELECT id,headword,part_of_speech,meaning_zh FROM words WHERE id=?",wordId).first();
 if(!row)throw Error("SENSE_WORD_NOT_FOUND");
 return studyKey(row);
};
export async function studyScheduleReady(env){
 try{
  const row=await sql(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='user_study_schedules'").first();
  return row?.name==="user_study_schedules";
 }catch{return false}
}
async function lookupPlan(env,userId,key,aliases){
 const existing=await sql(env,
  "SELECT stage_index,due_at,last_positive_day,last_reviewed_at,mastered,bookmarked "+
  "FROM user_study_schedules WHERE user_id=? AND study_key=?",userId,key).first();
 if(existing)return {
   stageIndex:existing.stage_index,dueAt:normalizeDate(existing.due_at),
   lastPositiveDay:existing.last_positive_day,lastReviewedAt:normalizeDate(existing.last_reviewed_at),
   mastered:existing.mastered===1,bookmarked:existing.bookmarked===1
 };
 const rows=await sql(env,
  "SELECT status,bookmarked,due_at,last_seen_at FROM user_words WHERE user_id=? AND word_id IN ("+
  aliases.map(()=>"?").join(",")+")",userId,...aliases).all();
 const items=rows.results||[];
 // Conserve all existing mastery and bookmarks. For conflicting legacy due
 // values choose the earliest due so no previously scheduled review is lost.
 const mastered=items.some(x=>x.status==="mastered");
 const due=items.map(x=>normalizeDate(x.due_at)).filter(Boolean).sort()[0]||null;
 return {stageIndex:0,dueAt:mastered?null:due,lastPositiveDay:null,lastReviewedAt:null,
   mastered,bookmarked:items.some(x=>Boolean(x.bookmarked))};
}
function saveSchedule(env,userId,key,plan,bookmarked){
 return sql(env,
  "INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,last_positive_day,last_reviewed_at,mastered,bookmarked) "+
  "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,study_key) DO UPDATE SET "+
  "stage_index=excluded.stage_index,due_at=excluded.due_at,"+
  "last_positive_day=excluded.last_positive_day,last_reviewed_at=excluded.last_reviewed_at,"+
  "mastered=excluded.mastered,bookmarked=excluded.bookmarked,updated_at=CURRENT_TIMESTAMP",
  userId,key,plan.stageIndex,plan.mastered?null:plan.dueAt,
  plan.lastPositiveDay,plan.lastReviewedAt,plan.mastered?1:0,bookmarked?1:0);
}
async function baseContext(env,userId,wordId){
 const aliases=await relatedAccessibleWordIds(env,wordId,userId);
 if(!aliases.length)throw Error("SENSE_NO_ACCESSIBLE_ALIASES");
 const key=await fetchSense(env,wordId);
 const previous=await lookupPlan(env,userId,key,aliases);
 return {aliases,key,previous};
}
function dueDays(next,time){
 if(next.mastered||!next.dueAt)return null;
 return Math.max(0,Math.ceil((Date.parse(next.dueAt)-time.getTime())/86400000));
}
export async function applySenseReview(env,{userId,wordId,chapterId=null,gameType,result,
  eventId,correct,addBookmarkOnWrong=false,now=new Date()}){
 if(!await studyScheduleReady(env))throw Error("STUDY_SCHEDULE_NOT_READY");
 if(!["correct","incorrect","hinted","revealed"].includes(result))throw Error("INVALID_STUDY_RESULT");
 const {aliases,key,previous}=await baseContext(env,userId,wordId);
 const success=correct&&result==="correct";
 const next=scheduleRecallFeedback(previous,success?"correct":"incorrect",now);
 const bookmarked=previous.bookmarked||Boolean(addBookmarkOnWrong&&!success);
 const mastered=next.mastered;
 const statements=[
  sql(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES(?,?,?,?,?,?)",
    eventId,userId,wordId,chapterId,gameType,result),
  saveSchedule(env,userId,key,next,bookmarked),
  ...aliases.map(id=>sql(env,
   "INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
   "VALUES(?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(user_id,word_id) DO UPDATE SET "+
   "status=excluded.status,bookmarked=excluded.bookmarked,last_seen_at=excluded.last_seen_at,"+
   "due_at=excluded.due_at",
   userId,id,mastered?"mastered":"learning",bookmarked?1:0,
   mastered?null:isoToSql(next.dueAt)))
 ];
 // Cloudflare D1 batch is atomic, so no review event is committed without
 // the matching canonical schedule and legacy compatibility projection.
 await env.DB.batch(statements);
 return {saved:true,wordId,studyKey:key,correct:success,result,
   status:mastered?"mastered":"learning",nextReviewDays:dueDays(next,now),
   nextDueAt:mastered?null:next.dueAt,bookmarked};
}
export async function setSenseManualState(env,{userId,wordId,status,bookmarked,now=new Date()}){
 if(!await studyScheduleReady(env))throw Error("STUDY_SCHEDULE_NOT_READY");
 if(!["learning","mastered"].includes(status)||typeof bookmarked!=="boolean")throw Error("INVALID_WORD_STATE");
 const {aliases,key,previous}=await baseContext(env,userId,wordId);
 const mastered=status==="mastered";
 // Bookmarking a word in a story is PASSIVE exposure: do not create a
 // successful review or advance an interval.
 const next={...previous,mastered,dueAt:mastered?null:previous.dueAt,
   stageIndex:mastered?previous.stageIndex:previous.stageIndex};
 // Explicit unmaster after an older mastered state schedules a fresh day-1 review.
 if(!mastered&&previous.mastered&&!next.dueAt){
  const start=scheduleFirstActiveLearning({},now);
  next.stageIndex=start.stageIndex;
  next.dueAt=start.dueAt;
  next.lastPositiveDay=null;
 }
 await env.DB.batch([
  saveSchedule(env,userId,key,next,bookmarked),
  ...aliases.map(id=>sql(env,
    "INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
    "VALUES(?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(user_id,word_id) DO UPDATE SET "+
    "status=excluded.status,bookmarked=excluded.bookmarked,last_seen_at=excluded.last_seen_at,"+
    "due_at=excluded.due_at",
    userId,id,status,bookmarked?1:0,isoToSql(next.dueAt)))
 ]);
 return {saved:true,wordId,studyKey:key,bookmarked,status,nextDueAt:next.dueAt};
}
