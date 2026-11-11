// V1.2, phase 2: STAGING-ONLY, guarded real headword card+feedback endpoint.
// Enforce a real approved CONTEXT ANCHOR (not just a dictionary hit), a purchased
// or free published chapter, a licensed source, and an approved active sense.
// The authenticated session user is injected by worker.js; never accept user_id
// from a request body. Production is always off, even if a flag is accidentally set.
import {createHeadwordStudyState,applyHeadwordStudyFeedback,
  previewHeadwordStudyDue} from './global-dictionary-headword-srs.js';

const ENTRY=/^gdict_[a-f0-9]{24}$/u;
const CHAPTER=/^[a-zA-Z0-9_-]{1,80}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const ROUTE=/^\/api\/me\/dictionary\/headwords\/(gdict_[a-f0-9]{24})(\/feedback)?$/u;
const ACTIONS=new Set(['seen','remembered','forgotten','mark_mastered','unmark_mastered']);
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer','content-security-policy':"default-src 'none'"
}});
const error=(code,status)=>json({error:code},status);
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/gu,'').trim();
const normPos=x=>norm(x).toLowerCase().replace(/[.。]/gu,'');
const normHead=x=>String(x??'').normalize('NFKC').trim().toLowerCase().replaceAll('’',"'");
const FLAGS={read:'GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED',write:'GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED'};
const approvalSql=`SELECT b.id AS book_id, e.entry_id, e.headword,
 l.senses_json, l.phonetic_uk, l.phonetic_us, l.collocations_json,
 l.reviewed_by, l.reviewed_at, sb.sense_id AS context_sense_id
 FROM global_dictionary_book_sense_bindings sb
 JOIN global_dictionary_senses contextual ON contextual.sense_id=sb.sense_id
   AND contextual.entry_id=sb.entry_id AND contextual.approved=1
   AND contextual.active=1 AND length(trim(contextual.reviewed_by))>0
   AND length(trim(contextual.reviewed_at))>0
 JOIN global_dictionary_entries e ON e.entry_id=sb.entry_id
   AND e.teaching_ready=1 AND e.reviewed_at IS NOT NULL
 JOIN global_dictionary_sources src ON src.source_key=e.source_name
   AND src.enabled=1 AND src.license_reviewed=1
 JOIN global_dictionary_lessons l ON l.entry_id=e.entry_id
   AND lower(trim(l.headword))=lower(trim(e.headword))
   AND length(trim(l.reviewed_by))>0 AND length(trim(l.reviewed_at))>0
 JOIN chapters ch ON ch.id=sb.chapter_id AND ch.book_id=sb.book_id
 JOIN books b ON b.id=sb.book_id AND b.status='published'
 JOIN categories c ON c.id=b.category_id AND c.is_visible=1
 WHERE sb.entry_id=? AND sb.chapter_id=? AND sb.context_anchor=?
 AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
 AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements t
  WHERE t.user_id=? AND t.category_id=b.category_id
  AND t.revoked_at IS NULL AND NOT EXISTS (
   SELECT 1 FROM activation_codes a WHERE a.id=t.source_code_id
   AND a.status='revoked')))
 LIMIT 1`;
const sensesSql=`SELECT sense_id,entry_id,pos,meaning_zh,example_en,example_zh,
 reviewed_by,reviewed_at FROM global_dictionary_senses
 WHERE entry_id=? AND approved=1 AND active=1 ORDER BY sense_id`;
const progressSql=`SELECT user_id,entry_id,status,stage,bookmarked,
 encounter_count,remembered_count,forgotten_count,due_at,
 last_seen_at,last_feedback_at,last_advanced_day,mastered_at,revision
 FROM user_headword_study WHERE user_id=? AND entry_id=?`;
const eventSql=`SELECT event_id,user_id,entry_id,action,source_book_id,
 source_chapter_id,source_context_anchor,state_revision FROM user_headword_review_events
 WHERE event_id=?`;

function decodeCard(approved,reviewed){
  if(!ENTRY.test(approved.entry_id||'')||!normHead(approved.headword)||
     !String(approved.phonetic_uk||'').trim()||!String(approved.phonetic_us||'').trim()||
     !Array.isArray(reviewed)||!reviewed.length)return null;
  let listed,collocations;
  try{
    listed=JSON.parse(approved.senses_json);
    collocations=JSON.parse(approved.collocations_json);
  }catch{return null}
  if(!Array.isArray(listed)||!listed.length||!Array.isArray(collocations)||
    collocations.length>8)return null;
  const found=new Map();
  for(const item of listed){
    if(!item||!normPos(item.pos)||!norm(item.meaningZh)||
       !String(item.exampleEn||'').trim()||!String(item.exampleZh||'').trim())return null;
    const key=normPos(item.pos)+'\0'+norm(item.meaningZh);
    if(found.has(key))return null;
    found.set(key,item);
  }
  if(!collocations.every(c=>c&&typeof c.en==='string'&&
       typeof c.zh==='string'&&c.en.trim()&&c.zh.trim()))return null;
  const senses=[],ids=new Set(),keys=new Set();
  for(const row of reviewed){
    if(!row||row.entry_id!==approved.entry_id||
      typeof row.sense_id!=='string'||!/^gds_[a-f0-9]{24}$/u.test(row.sense_id)||
      !String(row.reviewed_by||'').trim()||!String(row.reviewed_at||'').trim()||
      !normPos(row.pos)||!norm(row.meaning_zh)||
      !String(row.example_en||'').trim()||!String(row.example_zh||'').trim())return null;
    const key=normPos(row.pos)+'\0'+norm(row.meaning_zh);
    if(ids.has(row.sense_id)||keys.has(key)||!found.has(key))return null;
    const source=found.get(key);
    // Do not display a different example than the signed sense record.
    if(source.exampleEn.trim()!==row.example_en.trim()||
       source.exampleZh.trim()!==row.example_zh.trim())return null;
    ids.add(row.sense_id);keys.add(key);
    senses.push({sense_id:row.sense_id,pos:row.pos,
      meaningZh:row.meaning_zh,exampleEn:row.example_en,exampleZh:row.example_zh});
  }
  if(!ids.has(approved.context_sense_id))return null;
  return {entry_id:approved.entry_id,headword:approved.headword,
    phoneticUk:approved.phonetic_uk,phoneticUs:approved.phonetic_us,
    senses,collocations:keys.size===found.size?collocations:[],
    context_sense_id:approved.context_sense_id};
}
function normalizedState(raw,userId,entryId){
  if(!raw)return {state:createHeadwordStudyState({user_id:userId,entry_id:entryId}),revision:0};
  if(raw.user_id!==userId||raw.entry_id!==entryId||!Number.isSafeInteger(raw.revision)||
     raw.revision<0)throw Error('HEADWORD_STUDY_DATABASE_STATE_INVALID');
  return {state:{...raw,bookmarked:raw.bookmarked===1||raw.bookmarked===true,
    revision:undefined},revision:raw.revision};
}
async function getContext(db,entryId,chapterId,anchor,userId){
  const source=await stmt(db,approvalSql,entryId,chapterId,anchor,userId).first();
  if(!source)return null;
  const senseRows=await stmt(db,sensesSql,entryId).all();
  const card=decodeCard(source,senseRows.results||[]);
  return card?{book_id:source.book_id,card}:null;
}
function ownOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}
}
async function parseInput(req){
  if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')||''))
    return {error:'HEADWORD_INVALID_CONTENT_TYPE'};
  if(Number(req.headers.get('content-length')||0)>1500)
    return {error:'HEADWORD_FEEDBACK_TOO_LARGE'};
  const body=await req.text();
  if(new TextEncoder().encode(body).length>1500)return {error:'HEADWORD_FEEDBACK_TOO_LARGE'};
  try{const value=JSON.parse(body);
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
    return {value};
  }catch{return {error:'HEADWORD_INVALID_JSON'}}
}
export async function handleHeadwordStudyApi(req,env,path,user,{clock=()=>new Date().toISOString()}={}){
  // Always disabled in production. Merely defining the endpoint never changes
  // the production Worker; staging needs two independently explicit flags.
  if(env?.APP_ENV!=='staging')return error('NOT_FOUND',404);
  if(env[FLAGS.read]!=='true')return error('HEADWORD_SRS_DISABLED',503);
  if(!user||typeof user.id!=='string'||!user.id)return error('LOGIN_REQUIRED',401);
  const match=ROUTE.exec(path||'');
  if(!match)return error('NOT_FOUND',404);
  const entryId=match[1],feedback=Boolean(match[2]);
  if((feedback&&req.method!=='POST')||(!feedback&&req.method!=='GET'))
    return error('METHOD_NOT_ALLOWED',405);
  if(feedback&&env[FLAGS.write]!=='true')
    return error('HEADWORD_SRS_WRITE_DISABLED',503);
  if(feedback&&!ownOrigin(req))return error('INVALID_ORIGIN',403);
  if(!env.DB||typeof env.DB.prepare!=='function')return error('HEADWORD_SCHEMA_UNAVAILABLE',503);
  let input,chapterId,anchor,kind,eventId,expectedRevision;
  if(feedback){
    input=await parseInput(req);if(input.error)return error(input.error,400);
    ({chapterId,anchor,kind,eventId,expectedRevision}=input.value);
    if(!ACTIONS.has(kind)||!UUID.test(eventId||'')||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
       expectedRevision>2147483646)return error('INVALID_HEADWORD_FEEDBACK',400);
  }else{
    const params=new URL(req.url).searchParams;
    chapterId=params.get('chapterId');anchor=params.get('anchor');
  }
  if(typeof chapterId!=='string'||!CHAPTER.test(chapterId)||
     typeof anchor!=='string'||anchor.length<1||anchor.length>512||
     /[\u0000-\u001f]/u.test(anchor))return error('INVALID_HEADWORD_CONTEXT',400);
  try{
    const context=await getContext(env.DB,entryId,chapterId,anchor,user.id);
    if(!context)return error('HEADWORD_NOT_AVAILABLE',403);
    let {state,revision}=normalizedState(
      await stmt(env.DB,progressSql,user.id,entryId).first(),user.id,entryId);
    const now=clock();
    if(!feedback){
      return json({card:context.card,study:previewHeadwordStudyDue(state,now),
        bookmarked:state.bookmarked,revision,read_only:true});
    }
    // Idempotency is scoped to the authenticated identity, exact chapter,
    // action, and entry. An event cannot be replayed to a different word.
    const previous=await stmt(env.DB,eventSql,eventId).first();
    if(previous){
      if(previous.user_id!==user.id||previous.entry_id!==entryId||
         previous.action!==kind||previous.source_book_id!==context.book_id||
         previous.source_chapter_id!==chapterId||
         previous.source_context_anchor!==anchor)
        return error('HEADWORD_EVENT_ID_CONFLICT',409);
      return json({study:previewHeadwordStudyDue(state,now),
        bookmarked:state.bookmarked,revision,idempotent_replay:true});
    }
    if(revision!==expectedRevision)return error('HEADWORD_STALE_REVISION',409);
    const outcome=applyHeadwordStudyFeedback(state,{kind,at:now});
    const s=outcome.state,nextRevision=revision+1;
    const upsert=`INSERT INTO user_headword_study(
      user_id,entry_id,status,stage,bookmarked,encounter_count,
      remembered_count,forgotten_count,due_at,last_seen_at,last_feedback_at,
      last_advanced_day,mastered_at,revision,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,entry_id) DO UPDATE SET
      status=excluded.status,stage=excluded.stage,bookmarked=excluded.bookmarked,
      encounter_count=excluded.encounter_count,
      remembered_count=excluded.remembered_count,
      forgotten_count=excluded.forgotten_count,due_at=excluded.due_at,
      last_seen_at=excluded.last_seen_at,last_feedback_at=excluded.last_feedback_at,
      last_advanced_day=excluded.last_advanced_day,mastered_at=excluded.mastered_at,
      revision=excluded.revision,updated_at=CURRENT_TIMESTAMP
      WHERE user_headword_study.revision=?`;
    const insertEvent=`INSERT INTO user_headword_review_events(
      event_id,user_id,entry_id,action,source_book_id,source_chapter_id,source_context_anchor,
      state_revision) SELECT ?,?,?,?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM user_headword_study
        WHERE user_id=? AND entry_id=? AND revision=?)`;
    // D1.batch is transactional. CAS + UNIQUE(user,entry,revision)
    // prevents two devices recording different events for one revision.
    if(typeof env.DB.batch!=='function')return error('HEADWORD_ATOMIC_BATCH_REQUIRED',503);
    let receipts;
    try{
      receipts=await env.DB.batch([
        stmt(env.DB,upsert,user.id,entryId,s.status,s.stage,s.bookmarked?1:0,
          s.encounter_count,s.remembered_count,s.forgotten_count,
          s.due_at,s.last_seen_at,s.last_feedback_at,s.last_advanced_day,
          s.mastered_at,nextRevision,expectedRevision),
        stmt(env.DB,insertEvent,eventId,user.id,entryId,kind,
          context.book_id,chapterId,anchor,nextRevision,user.id,entryId,nextRevision)
      ]);
    }catch(e){
      // A missing 019 table must not be disguised as a normal CAS conflict.
      if(/no such (?:table|column)|D1_ERROR|SQLITE_ERROR/iu.test(String(e?.message||'')))
        return error('HEADWORD_SCHEMA_OR_REVIEW_UNAVAILABLE',503);
      // No successful partial response after an atomic batch failure.
      return error('HEADWORD_CONCURRENT_OR_WRITE_CONFLICT',409);
    }
    if(!Array.isArray(receipts)||receipts.length!==2||
      receipts[0]?.meta?.changes!==1||receipts[1]?.meta?.changes!==1)
      return error('HEADWORD_STALE_REVISION',409);
    return json({study:previewHeadwordStudyDue(s,now),
      bookmarked:s.bookmarked,revision:nextRevision,advanced:outcome.advanced,
      session_requeue_after:outcome.session_requeue_after,
      idempotent_replay:false});
  }catch{
    // Missing 013-019 schema, wrong source, or corrupt state is fail-closed.
    return error('HEADWORD_SCHEMA_OR_REVIEW_UNAVAILABLE',503);
  }
}