// V1.2 020: staging-only reviewed SENSE study endpoint.
// Study identity is (session user_id, reviewed sense_id); never headword entry_id.
// Disabled unless both explicit staging flags are enabled. No production routes.
import {createSenseStudyState,applySenseStudyFeedback,previewSenseStudyDue} from './global-dictionary-sense-srs.js';
import {listReviewedReaderSenseAnchors} from './global-dictionary-reader-sense-anchors.js';
const SENSE=/^gds_[a-f0-9]{24}$/u;
const CHAPTER=/^[A-Za-z0-9_-]{1,80}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const ROUTE=/^\/api\/me\/dictionary\/senses\/(gds_[a-f0-9]{24})(\/feedback)?$/u;
const READER_ROUTE=/^\/api\/me\/dictionary\/chapters\/([A-Za-z0-9_-]{1,80})\/sense-anchors$/u;
const ACTIONS=new Set(['seen','remembered','forgotten','mark_mastered','unmark_mastered']);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'"}});
const reject=(reason,status)=>json({error:reason},status);
const query=(db,sql,...args)=>db.prepare(sql).bind(...args);
const CONTEXT_SQL=`SELECT b.id AS book_id,s.sense_id,s.entry_id,e.headword,s.pos,s.meaning_zh,
 s.example_en,s.example_zh,l.phonetic_uk,l.phonetic_us,
 l.senses_json,l.reviewed_by AS lesson_reviewed_by,l.reviewed_at AS lesson_reviewed_at
 FROM global_dictionary_book_sense_bindings link
 JOIN global_dictionary_senses s ON s.sense_id=link.sense_id AND s.entry_id=link.entry_id
   AND s.approved=1 AND s.active=1 AND length(trim(s.reviewed_by))>0
   AND length(trim(s.reviewed_at))>0
 JOIN global_dictionary_entries e ON e.entry_id=s.entry_id
   AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
 JOIN global_dictionary_sources source ON source.source_key=e.source_name
   AND source.enabled=1 AND source.license_reviewed=1
 JOIN global_dictionary_lessons l ON l.entry_id=e.entry_id
   AND length(trim(l.reviewed_by))>0 AND length(trim(l.reviewed_at))>0
 JOIN chapters ch ON ch.id=link.chapter_id AND ch.book_id=link.book_id
 JOIN books b ON b.id=link.book_id AND b.status='published'
 JOIN categories c ON c.id=b.category_id AND c.is_visible=1
 WHERE link.sense_id=? AND link.chapter_id=? AND link.context_anchor=?
 AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
 AND (ch.is_preview=1 OR EXISTS(
  SELECT 1 FROM entitlements t WHERE t.user_id=? AND t.category_id=b.category_id
   AND t.revoked_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM activation_codes a WHERE a.id=t.source_code_id AND a.status='revoked')
 ))
 LIMIT 1`;
const STATE_SQL=`SELECT user_id,sense_id,status,stage,bookmarked,encounter_count,remembered_count,
 forgotten_count,due_at,last_seen_at,last_feedback_at,last_advanced_day,mastered_at,revision
 FROM user_dictionary_sense_study WHERE user_id=? AND sense_id=?`;
const EVENT_SQL=`SELECT event_id,user_id,sense_id,entry_id,action,source_book_id,
 source_chapter_id,source_context_anchor,state_revision
 FROM user_dictionary_sense_review_events WHERE event_id=?`;
const upsertSql=`INSERT INTO user_dictionary_sense_study
 (user_id,sense_id,status,stage,bookmarked,encounter_count,remembered_count,
 forgotten_count,due_at,last_seen_at,last_feedback_at,last_advanced_day,
 mastered_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(user_id,sense_id) DO UPDATE SET
 status=excluded.status,stage=excluded.stage,bookmarked=excluded.bookmarked,
 encounter_count=excluded.encounter_count,remembered_count=excluded.remembered_count,
 forgotten_count=excluded.forgotten_count,due_at=excluded.due_at,
 last_seen_at=excluded.last_seen_at,last_feedback_at=excluded.last_feedback_at,
 last_advanced_day=excluded.last_advanced_day,mastered_at=excluded.mastered_at,
 revision=excluded.revision
 WHERE user_dictionary_sense_study.revision=?`;
const eventInsert=`INSERT INTO user_dictionary_sense_review_events
 (event_id,user_id,sense_id,entry_id,action,source_book_id,source_chapter_id,
 source_context_anchor,state_revision)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (
 SELECT 1 FROM user_dictionary_sense_study
 WHERE user_id=? AND sense_id=? AND revision=?
 )`;
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const pos=x=>norm(x).toLowerCase().replace(/[.。]/gu,'');
function decode(context){
 if(!SENSE.test(context.sense_id||'')||
    !/^gdict_[a-f0-9]{24}$/u.test(context.entry_id||'')||
    !context.phonetic_uk?.trim()||!context.phonetic_us?.trim()||
    !pos(context.pos)||!norm(context.meaning_zh)||
    !context.example_en?.trim()||!context.example_zh?.trim())return null;
 let lesson;try{lesson=JSON.parse(context.senses_json)}catch{return null}
 if(!Array.isArray(lesson))return null;
 const aligned=lesson.filter(s=>pos(s?.pos)===pos(context.pos)&&
   norm(s?.meaningZh)===norm(context.meaning_zh)&&
   s?.exampleEn?.trim()===context.example_en.trim()&&
   s?.exampleZh?.trim()===context.example_zh.trim());
 if(aligned.length!==1)return null;
 return {sense_id:context.sense_id,entry_id:context.entry_id,
   headword:context.headword,pos:context.pos,meaningZh:context.meaning_zh,
   exampleEn:context.example_en,exampleZh:context.example_zh,
   phoneticUk:context.phonetic_uk,phoneticUs:context.phonetic_us};
}
const ownOrigin=req=>{
 const origin=req.headers.get('origin');
 if(!origin)return false;
 try{return new URL(origin).origin===new URL(req.url).origin}catch{return false}
};
async function feedbackInput(req){
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')||''))
  return {error:'SENSE_INVALID_CONTENT_TYPE'};
 if(Number(req.headers.get('content-length')||0)>1600)return {error:'SENSE_INPUT_TOO_LARGE'};
 const raw=await req.text();
 if(new TextEncoder().encode(raw).length>1600)return {error:'SENSE_INPUT_TOO_LARGE'};
 try{const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
  return {value};
 }catch{return {error:'SENSE_INVALID_JSON'}}
}
function stateFromDb(row,userId,senseId){
 if(!row)return {state:createSenseStudyState({user_id:userId,sense_id:senseId}),revision:0};
 if(row.user_id!==userId||row.sense_id!==senseId||
  !Number.isSafeInteger(row.revision)||row.revision<0)
  throw Error('SENSE_DATABASE_STATE_INVALID');
 return {state:{...row,bookmarked:row.bookmarked===1||row.bookmarked===true,
   revision:undefined},revision:row.revision};
}
export async function handleSenseStudyApi(req,env,path,user,{clock=()=>new Date().toISOString()}={}){
 if(env?.APP_ENV!=='staging')return reject('NOT_FOUND',404);
 if(env.GLOBAL_DICTIONARY_SENSE_SRS_ENABLED!=='true')return reject('SENSE_SRS_DISABLED',503);
 if(!user?.id||typeof user.id!=='string')return reject('LOGIN_REQUIRED',401);
 const reader=READER_ROUTE.exec(path||'');
 if(reader){
  if(req.method!=='GET')return reject('METHOD_NOT_ALLOWED',405);
  if(!env.DB?.prepare)return reject('SENSE_SCHEMA_UNAVAILABLE',503);
  try{return json(await listReviewedReaderSenseAnchors(env.DB,{
   chapterId:reader[1],userId:user.id}));}
  catch{return reject('SENSE_READER_ANCHORS_UNAVAILABLE',503)}
 }
 const route=ROUTE.exec(path||'');
 if(!route)return reject('NOT_FOUND',404);
 const senseId=route[1],feedback=Boolean(route[2]);
 if((feedback&&req.method!=='POST')||(!feedback&&req.method!=='GET'))
  return reject('METHOD_NOT_ALLOWED',405);
 if(feedback&&env.GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED!=='true')
  return reject('SENSE_SRS_WRITE_DISABLED',503);
 if(feedback&&!ownOrigin(req))return reject('INVALID_ORIGIN',403);
 if(!env.DB?.prepare)return reject('SENSE_SCHEMA_UNAVAILABLE',503);
 let chapterId,anchor,kind,eventId,expectedRevision;
 if(feedback){
  const parsed=await feedbackInput(req);if(parsed.error)return reject(parsed.error,400);
  ({chapterId,anchor,kind,eventId,expectedRevision}=parsed.value);
  if(!ACTIONS.has(kind)||!UUID.test(eventId||'')||
     !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
     expectedRevision>2147483646)return reject('SENSE_INVALID_FEEDBACK',400);
 }else{
  const params=new URL(req.url).searchParams;
  chapterId=params.get('chapterId');anchor=params.get('anchor');
 }
 if(!CHAPTER.test(chapterId||'')||typeof anchor!=='string'||
    anchor.length<1||anchor.length>512||/[\u0000-\u001f]/u.test(anchor))
  return reject('SENSE_INVALID_CONTEXT',400);
 try{
  const row=await query(env.DB,CONTEXT_SQL,senseId,chapterId,anchor,user.id).first();
  const card=row&&decode(row);
  if(!card)return reject('SENSE_NOT_AVAILABLE',403);
  const {state,revision}=stateFromDb(
   await query(env.DB,STATE_SQL,user.id,senseId).first(),user.id,senseId);
  const now=clock();
  if(!feedback)return json({card,study:previewSenseStudyDue(state,now),
   bookmarked:state.bookmarked,revision,read_only:true});
  const existing=await query(env.DB,EVENT_SQL,eventId).first();
  if(existing){
   if(existing.user_id!==user.id||existing.sense_id!==senseId||
      existing.entry_id!==card.entry_id||existing.action!==kind||
      existing.source_book_id!==row.book_id||
      existing.source_chapter_id!==chapterId||
      existing.source_context_anchor!==anchor)
    return reject('SENSE_EVENT_ID_CONFLICT',409);
   return json({study:previewSenseStudyDue(state,now),
    bookmarked:state.bookmarked,revision,idempotent_replay:true});
  }
  if(revision!==expectedRevision)return reject('SENSE_STALE_REVISION',409);
  if(typeof env.DB.batch!=='function')return reject('SENSE_TRANSACTION_UNAVAILABLE',503);
  const outcome=applySenseStudyFeedback(state,{kind,at:now});
  const next=outcome.state,newRevision=revision+1;
  const statements=[
   query(env.DB,upsertSql,user.id,senseId,next.status,next.stage,
    next.bookmarked?1:0,next.encounter_count,next.remembered_count,
    next.forgotten_count,next.due_at,next.last_seen_at,next.last_feedback_at,
    next.last_advanced_day,next.mastered_at,newRevision,revision),
   query(env.DB,eventInsert,eventId,user.id,senseId,card.entry_id,kind,row.book_id,
    chapterId,anchor,newRevision,user.id,senseId,newRevision)
  ];
  // DB batch is the atomic transaction; 020 approval triggers also reject
  // senses removed from an approved/active commercial lexicon at commit.
  const committed=await env.DB.batch(statements);
  if(!Array.isArray(committed)||committed.length!==2||
    committed[0]?.meta?.changes!==1||committed[1]?.meta?.changes!==1)
   throw Error('SENSE_TRANSACTION_INTEGRITY_NOT_CONFIRMED');
  return json({study:previewSenseStudyDue(next,now),
   bookmarked:next.bookmarked,revision:newRevision,advanced:outcome.advanced,
   session_requeue_after:outcome.session_requeue_after});
 }catch{return reject('SENSE_SRS_UNAVAILABLE',503)}
}
