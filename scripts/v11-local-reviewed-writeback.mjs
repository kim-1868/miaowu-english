// WordLetter V1.1 P5 - isolated SQLite writeback rehearsal ONLY.
// This module is never imported by the live Worker, staging gate or Pages.
// No remote access and no production D1 migration. Explicitly preserves
// original words IDs, reading progress, historical review events and orders.
import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {studyKey} from "../src/study-identity.js";
import {scheduleFirstActiveLearning} from "../src/spaced-review.js";
import {previewReviewedLearningViews,previewReviewedFeedback} from "./v11-reviewed-sense-shadow-views.mjs";

const fail=code=>{throw Error(code)};
const isoToSql=v=>v?String(v).replace("T"," ").replace(/\.\d{3}Z$/,"").replace(/Z$/,""):null;
const utc=v=>{
 if(!v)return null;
 const s=String(v);
 const x=Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");
 return Number.isFinite(x)?new Date(x).toISOString():null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const modes=new Set(["flip","spell","echo","manual"]);
function verify(db,userId,wordId,now){
 if(!(db instanceof DatabaseSync))fail("WRITEBACK_LOCAL_SQLITE_ONLY");
 if(typeof userId!=="string"||!userId||typeof wordId!=="string"||!wordId)
  fail("WRITEBACK_INVALID_ID");
 if(db.prepare("PRAGMA foreign_keys").get().foreign_keys!==1)
  fail("WRITEBACK_FOREIGN_KEYS_REQUIRED");
 const mapping=db.prepare("SELECT sense_id FROM reviewed_sense_aliases WHERE word_id=?").get(wordId);
 if(!mapping)fail("WRITEBACK_WORD_NOT_REVIEWED");
 const read=previewReviewedLearningViews(db,userId,{reviewed:true,now});
 const selected=read.reading.find(r=>r.wordId===wordId);
 if(!selected||selected.studyKey!==mapping.sense_id)fail("WRITEBACK_NO_ENTITLEMENT");
 const aliases=read.reading.filter(r=>r.studyKey===mapping.sense_id).map(r=>r.wordId).sort();
 if(!aliases.length)fail("WRITEBACK_NO_REVIEWED_ALIASES");
 const rows=db.prepare("SELECT id,headword,part_of_speech,meaning_zh FROM words WHERE id IN ("+
   aliases.map(()=>"?").join(",")+")").all(...aliases);
 const keys=[...new Set(rows.map(w=>studyKey({word_id:w.id,...w})))].sort();
 const scheduleKeys=[mapping.sense_id,...keys.filter(k=>k!==mapping.sense_id)];
 const before=db.prepare("SELECT stage_index,due_at,last_positive_day,last_reviewed_at,"+
  "mastered,bookmarked,study_key FROM user_study_schedules "+
  "WHERE user_id=? AND study_key IN ("+scheduleKeys.map(()=>"?").join(",")+")")
  .all(userId,...scheduleKeys);
 // Fail closed if an older explicit plan conflicts with another explicit
 // reviewed schedule (including one created by a previous test-only write).
 if(before.length>1){
  const canonical=b=>JSON.stringify([b.stage_index,utc(b.due_at),b.last_positive_day,
    utc(b.last_reviewed_at),b.mastered,b.bookmarked]);
  if(before.some(x=>canonical(x)!==canonical(before[0])))
   fail("WRITEBACK_CONFLICTING_EXISTING_PLANS");
 }
 const saved=before[0]||null;
 const seen=read.reading.find(w=>w.studyKey===mapping.sense_id&&w.seen);
 const studied=db.prepare("SELECT status,bookmarked,due_at FROM user_words "+
  "WHERE user_id=? AND word_id IN ("+aliases.map(()=>"?").join(",")+")")
  .all(userId,...aliases);
 if(!studied.length)fail("WRITEBACK_NOT_YET_STUDIED");
 const current={
  stageIndex:saved?.stage_index??0,
  dueAt:utc(saved?.due_at)||(!saved?studied.map(x=>utc(x.due_at)).filter(Boolean).sort()[0]||null:null),
  lastPositiveDay:saved?.last_positive_day??null,
  lastReviewedAt:utc(saved?.last_reviewed_at),
  mastered:saved?Boolean(saved.mastered):studied.some(w=>w.status==="mastered"),
  bookmarked:saved?Boolean(saved.bookmarked):studied.some(w=>Boolean(w.bookmarked))
 };
 if(!seen)fail("WRITEBACK_STUDY_STATE_UNAVAILABLE");
 return {mapping,aliases,keys:scheduleKeys,current};
}
function writeState(db,userId,key,next,bookmarked){
 db.prepare("INSERT INTO user_study_schedules "+
  "(user_id,study_key,stage_index,due_at,last_positive_day,last_reviewed_at,mastered,bookmarked) "+
  "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,study_key) DO UPDATE SET "+
  "stage_index=excluded.stage_index,due_at=excluded.due_at,"+
  "last_positive_day=excluded.last_positive_day,last_reviewed_at=excluded.last_reviewed_at,"+
  "mastered=excluded.mastered,bookmarked=excluded.bookmarked,updated_at=CURRENT_TIMESTAMP")
  .run(userId,key,next.stageIndex,next.mastered?null:isoToSql(next.dueAt),
    next.lastPositiveDay,next.lastReviewedAt,next.mastered?1:0,bookmarked?1:0);
}
/**
 * Test-only analogue of the real applySenseReview + setSenseManualState
 * transaction. The caller must first install schema 014 and stage contextual
 * approval on an isolated SQLite fixture. No HTTP/Cloudflare APIs.
 */
export function commitLocalReviewedAction(db,userId,{
 wordId,mode,requestId=null,chapterId=null,answer=null,choiceId=null,judgment=null,
 status=null,bookmarked=null,now=new Date(),failBeforeCommit=false
}={}){
 if(!modes.has(mode))fail("WRITEBACK_INVALID_MODE");
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail("WRITEBACK_INVALID_TIME");
 if(mode==="manual"&&(!(status==="learning"||status==="mastered")||
     typeof bookmarked!=="boolean"))fail("WRITEBACK_INVALID_MANUAL_STATE");
 if(mode!=="manual"&&(typeof requestId!=="string"||!uuid.test(requestId)))
  fail("WRITEBACK_REQUEST_ID_REQUIRED");
 const ctx=verify(db,userId,wordId,now);
 if(mode==="echo"){
  if(typeof chapterId!=="string"||!db.prepare("SELECT 1 FROM reading_progress p "+
   "JOIN chapter_words cw ON cw.chapter_id=p.chapter_id "+
   "WHERE p.user_id=? AND p.chapter_id=? AND p.completed_at IS NOT NULL "+
   "AND cw.word_id=? LIMIT 1").get(userId,chapterId,wordId))
   fail("WRITEBACK_ECHO_REQUIRES_COMPLETED_CHAPTER");
 }
 if(mode!=="manual"){
  const prior=db.prepare("SELECT user_id,word_id,game_type,result "+
   "FROM review_events WHERE id=?").get(requestId);
  if(prior){
   if(prior.user_id!==userId||prior.word_id!==wordId||prior.game_type!=="bookplate-"+mode)
    fail("WRITEBACK_REQUEST_ID_REUSED");
   return {saved:true,alreadyApplied:true,wordId,studyKey:ctx.mapping.sense_id,
    productionTouched:false};
  }
 }
 let next,correct=null,result=null;
 if(mode==="manual"){
  const mastered=status==="mastered";
  next={...ctx.current,mastered,dueAt:mastered?null:ctx.current.dueAt};
  if(!mastered&&ctx.current.mastered&&!next.dueAt){
   const restart=scheduleFirstActiveLearning({},now);
   next={...next,stageIndex:restart.stageIndex,dueAt:restart.dueAt,
    lastPositiveDay:null};
  }
 }else{
  const shadow=previewReviewedFeedback(db,userId,{
   wordId,mode,answer,choiceId,judgment,reviewed:true,now});
  correct=shadow.correct;
  result=correct?"correct":mode==="flip"&&judgment==="unsure"?"hinted":"incorrect";
  next={...ctx.current,mastered:shadow.projectedMastered,
   stageIndex:shadow.stageIndex,dueAt:shadow.projectedDueAt,
   lastPositiveDay:shadow.projectedLastPositiveDay,
   lastReviewedAt:shadow.projectedLastReviewedAt};
  bookmarked=ctx.current.bookmarked;
 }
 db.exec("BEGIN IMMEDIATE");
 try{
  if(mode!=="manual"){
   db.prepare("INSERT INTO review_events "+
    "(id,user_id,word_id,chapter_id,game_type,result) "+
    "VALUES(?,?,?,?,?,?)").run(requestId,userId,wordId,mode==="echo"?chapterId:null,
      "bookplate-"+mode,result);
  }
  for(const key of ctx.keys)writeState(db,userId,key,next,bookmarked);
  for(const id of ctx.aliases){
   db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
    "VALUES(?,?,?,?,CURRENT_TIMESTAMP,?) "+
    "ON CONFLICT(user_id,word_id) DO UPDATE SET "+
    "status=excluded.status,bookmarked=excluded.bookmarked,"+
    "last_seen_at=excluded.last_seen_at,due_at=excluded.due_at")
    .run(userId,id,next.mastered?"mastered":"learning",bookmarked?1:0,
      next.mastered?null:isoToSql(next.dueAt));
  }
  if(failBeforeCommit)fail("WRITEBACK_INJECTED_ROLLBACK");
  if(db.prepare("PRAGMA foreign_key_check").all().length)
   fail("WRITEBACK_FOREIGN_KEY_VIOLATION");
  db.exec("COMMIT");
 }catch(e){
  db.exec("ROLLBACK");
  if(String(e?.message||"").startsWith("WRITEBACK_"))throw e;
  fail("WRITEBACK_TRANSACTION_ROLLED_BACK");
 }
 return {
  saved:true,alreadyApplied:false,wordId,
  studyKey:ctx.mapping.sense_id,
  affectedReviewedAliases:ctx.aliases,
  mirroredLegacyScheduleKeys:ctx.keys.length-1,
  correct,mastered:next.mastered,bookmarked:Boolean(bookmarked),
  dueAt:next.mastered?null:next.dueAt,
  historicalWordIdsReplaced:false,oldEventsDeleted:false,
  isolatedLocalSQLiteOnly:true,productionTouched:false,onlineEnabled:false
 };
}
export const newLocalReviewId=()=>randomUUID();
