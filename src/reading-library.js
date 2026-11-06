import {studyKey,relatedAccessibleWordIds,uniqueStudyRows} from './study-identity.js';
import {studyScheduleReady,applySenseReview,setSenseManualState} from './study-schedule-store.js';
// S4: Real reader learning state in Cloudflare D1.
// Never allow paid reading state changes without valid category entitlements.
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:HEADERS});
const err=(code,status)=>json({error:code},status);
const sql=(env,q,...params)=>env.DB.prepare(q).bind(...params);
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
async function readJson(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))return {error:"CONTENT_TYPE"};
  if(Number(req.headers.get("content-length")||0)>4096)return {error:"TOO_LARGE"};
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>4096)return {error:"TOO_LARGE"};
  try{const data=JSON.parse(raw);return data&&typeof data==="object"&&!Array.isArray(data)?{data}:{error:"INVALID_JSON"}}
  catch{return {error:"INVALID_JSON"}}
}
async function canReadChapter(env,id,userId){
  return sql(env,"SELECT ch.id FROM chapters ch JOIN books b ON b.id=ch.book_id "+
    "JOIN categories c ON c.id=b.category_id WHERE ch.id=? AND b.status='published' "+
    "AND c.is_visible=1 AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e WHERE e.user_id=? "+
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))",id,userId).first();
}
async function canStudyWord(env,id,userId){
  return sql(env,"SELECT w.id FROM words w WHERE w.id=? AND EXISTS("+ 
    "SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
    "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
    "WHERE cw.word_id=w.id AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
    "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked'))))",id,userId).first();
}
async function progressList(env,userId){
  const found=await sql(env,"SELECT p.chapter_id,p.progress,p.completed_at,p.updated_at,"+
    "ch.book_id,ch.chapter_no,b.title AS book_title,c.slug AS category_slug FROM reading_progress p "+
    "JOIN chapters ch ON ch.id=p.chapter_id JOIN books b ON b.id=ch.book_id "+
    "JOIN categories c ON c.id=b.category_id WHERE p.user_id=? "+
    "AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e WHERE e.user_id=p.user_id "+
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked'))) "+
    "ORDER BY p.updated_at DESC LIMIT 100",userId).all();
  return json({progress:found.results||[]});
}
async function setProgress(req,env,userId){
  const body=await readJson(req);if(body.error)return err(body.error,400);
  const {chapterId,progress}=body.data;
  if(typeof chapterId!=="string"||!ID.test(chapterId)||typeof progress!=="number"||
    !Number.isFinite(progress)||progress<0||progress>1)return err("INVALID_PROGRESS",400);
  if(!(await canReadChapter(env,chapterId,userId)))return err("CHAPTER_NOT_AVAILABLE",403);
  const rounded=Math.round(progress*1000)/1000;
  await sql(env,"INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at,updated_at) "+
    "VALUES(?,?,?,CASE WHEN ?>=1 THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP) "+
    "ON CONFLICT(user_id,chapter_id) DO UPDATE SET "+
    "progress=MAX(reading_progress.progress,excluded.progress), "+
    "completed_at=CASE WHEN excluded.progress>=1 "+
    "THEN COALESCE(reading_progress.completed_at,CURRENT_TIMESTAMP) "+
    "ELSE reading_progress.completed_at END,updated_at=CURRENT_TIMESTAMP",
    userId,chapterId,rounded,rounded).run();
  return json({saved:true,chapterId,progress:rounded});
}
async function wordList(env,userId){
  const result=await sql(env,"SELECT uw.word_id,uw.status,uw.bookmarked,uw.last_seen_at,uw.due_at,"+
    "w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,w.meaning_zh,"+
    "w.example_en,w.example_zh,w.collocations_json, "+
    "(SELECT cw2.context_sentence FROM chapter_words cw2 "+
    "JOIN chapters ch2 ON ch2.id=cw2.chapter_id JOIN books b2 ON b2.id=ch2.book_id "+
    "JOIN categories c2 ON c2.id=b2.category_id "+
    "WHERE cw2.word_id=uw.word_id AND b2.status='published' AND c2.is_visible=1 "+
    "AND ch2.published_at IS NOT NULL AND ch2.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch2.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e2 "+
    "WHERE e2.user_id=uw.user_id AND e2.category_id=b2.category_id AND e2.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e2.source_code_id AND v.status='revoked'))) "+
    "ORDER BY ch2.chapter_no ASC LIMIT 1) AS context_sentence "+
    "FROM user_words uw "+
    "JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? AND uw.bookmarked=1 "+
    "AND EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
    "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
    "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e WHERE e.user_id=uw.user_id "+
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))) "+
    "ORDER BY uw.last_seen_at DESC LIMIT 4000",userId).all();
  // The old list is capped for display, but the fast-learning due counter
  // must count the user's entire entitled collection, not only 200 rows.
  const dueRows=await sql(env,"SELECT uw.word_id,w.headword,w.part_of_speech,w.meaning_zh "+
    "FROM user_words uw JOIN words w ON w.id=uw.word_id "+
    "WHERE uw.user_id=? AND uw.bookmarked=1 AND "+flashVisible+" "+flashScope("due"),userId).all();
  return json({flashDue:uniqueStudyRows(dueRows.results||[]).length,
    words:uniqueStudyRows(result.results||[]).slice(0,200).map(w=>{
    let pairs=[];try{const parsed=JSON.parse(w.collocations_json||"[]");if(Array.isArray(parsed))pairs=parsed.slice(0,8)}catch{}
    const {collocations_json,...fields}=w;return {...fields,collocations:pairs};
  })});
}
async function setWord(req,env,userId,id){
  if(!ID.test(id))return err("WORD_NOT_AVAILABLE",404);
  const input=await readJson(req);if(input.error)return err(input.error,400);
  const {bookmarked,status}=input.data;
  if(typeof bookmarked!=="boolean"||!["learning","mastered"].includes(status))
    return err("INVALID_WORD_STATE",400);
  if(!(await canStudyWord(env,id,userId)))return err("WORD_NOT_AVAILABLE",403);
  // Additive 011 migration gates the new canonical schedule. Older schemas
  // continue to use the unchanged legacy projection during safe deployment.
  if(await studyScheduleReady(env))return json(await setSenseManualState(env,{
    userId,wordId:id,status,bookmarked
  }));
  // One explicit learning decision applies to every accessible copy of the same sense.
  // Keep legacy word IDs untouched for chapters and historical review events.
  const related=await relatedAccessibleWordIds(env,id,userId);
  await env.DB.batch(related.map(alias=>sql(env,
    "INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
    "VALUES(?,?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='mastered' THEN NULL ELSE datetime('now','+1 day') END) "+
    "ON CONFLICT(user_id,word_id) DO UPDATE SET "+
    "status=excluded.status,bookmarked=excluded.bookmarked,last_seen_at=CURRENT_TIMESTAMP,due_at=excluded.due_at",
    userId,alias,status,bookmarked?1:0,status)));
  return json({saved:true,wordId:id,bookmarked,status});
}
async function quickReview(req,env,userId){
  const input=await readJson(req);
  if(input.error)return err(input.error,400);
  const {wordId,chapterId,remembered}=input.data;
  if(!ID.test(wordId||"")||!ID.test(chapterId||"")||typeof remembered!=="boolean")
    return err("INVALID_REVIEW",400);
  const match=await sql(env,"SELECT 1 AS ok FROM chapter_words cw "+
    "JOIN chapters ch ON ch.id=cw.chapter_id JOIN books b ON b.id=ch.book_id "+
    "JOIN categories c ON c.id=b.category_id WHERE cw.word_id=? AND ch.id=? "+
    "AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
    "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))",
    wordId,chapterId,userId).first();
  if(!match)return err("WORD_NOT_AVAILABLE",403);
  if(await studyScheduleReady(env)){
    const saved=await applySenseReview(env,{userId,wordId,chapterId,
      gameType:"chapter-quick-review",result:remembered?"correct":"incorrect",
      correct:remembered,eventId:crypto.randomUUID(),addBookmarkOnWrong:true});
    return json({...saved,remembered});
  }
  // An answer of "remembered" does not imply permanently mastered.
  // The prior bookmark status is preserved; "forgot" adds a bookmark.
  const due=remembered?"+3 days":"+1 day";
  const related=await relatedAccessibleWordIds(env,wordId,userId);
  await env.DB.batch([
    sql(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
      "VALUES(?,?,?,?,?,?)",crypto.randomUUID(),userId,wordId,chapterId,
      "chapter-quick-review",remembered?"correct":"incorrect"),
    ...related.map(alias=>sql(env,
      "INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
      "VALUES(?,?,'learning',?,CURRENT_TIMESTAMP,datetime('now','"+due+"')) "+
      "ON CONFLICT(user_id,word_id) DO UPDATE SET "+
      "status=CASE WHEN user_words.status='mastered' AND ?=1 THEN 'mastered' ELSE 'learning' END,"+
      "bookmarked=MAX(user_words.bookmarked,excluded.bookmarked),"+
      "last_seen_at=CURRENT_TIMESTAMP,"+
      "due_at=CASE WHEN user_words.status='mastered' AND ?=1 THEN user_words.due_at "+
      "ELSE excluded.due_at END",
      userId,alias,remembered?0:1,remembered?1:0,remembered?1:0))
  ]);
  return json({saved:true,wordId,chapterId,remembered,bookmarked:!remembered,nextReviewDays:remembered?3:1});
}

// V30: bookplate memory sessions. Only accessible bookmarked words can appear
// or be reviewed; all due dates and spell-check results are authoritative in D1.
const flashVisible=
  "EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
  "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
  "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
  "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
  "WHERE e.user_id=uw.user_id AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked'))))";
const flashScope=(scope)=>scope==="due"?
  "AND uw.status!='mastered' AND uw.due_at IS NOT NULL AND uw.due_at<=CURRENT_TIMESTAMP":
  scope==="learning"?"AND uw.status!='mastered'":"";
async function flashcardPool(req,env,userId){
  const params=new URL(req.url).searchParams;
  const scope=params.get("scope")||"due";
  const pageString=params.get("page")||"1";
  const sizeString=params.get("size")||"10";
  if(!["due","learning","all"].includes(scope)||!/^[1-9][0-9]{0,3}$/.test(pageString)||
     !["10","20"].includes(sizeString))
    return err("INVALID_FLASHCARD_SCOPE",400);
  const page=Number(pageString),limit=Number(sizeString),offset=(page-1)*limit;
  const from="FROM user_words uw JOIN words w ON w.id=uw.word_id "+
    "WHERE uw.user_id=? AND uw.bookmarked=1 AND "+flashVisible+" "+flashScope(scope);
  // Deduplicate BEFORE pagination, otherwise ten aliases could consume ten card slots.
  const result=await sql(env,
    "SELECT uw.word_id,uw.status,uw.due_at,w.headword,w.meaning_zh,w.phonetic_uk,"+
    "w.phonetic_us,w.part_of_speech,w.example_en,w.example_zh,w.collocations_json "+
    from+" ORDER BY "+
    (scope==="due"?"uw.due_at ASC,uw.word_id ASC":
      "w.headword COLLATE NOCASE ASC,uw.word_id ASC")+
    " LIMIT 8000",userId).all();
  const unique=uniqueStudyRows(result.results||[]);
  const pageRows=unique.slice(offset,offset+limit);
  return json({scope,page,pageSize:limit,total:unique.length,
    hasMore:offset+limit<unique.length,
    words:pageRows.map(w=>{
      let collocations=[];try{
        const p=JSON.parse(w.collocations_json||"[]");
        if(Array.isArray(p))collocations=p.slice(0,5);
      }catch{}
      const {collocations_json,...rest}=w;
      return {...rest,collocations};
    })});
}
async function flashcardAnswer(req,env,userId){
  const body=await readJson(req);if(body.error)return err(body.error,400);
  const {wordId,mode,judgment,answer,requestId}=body.data;
  if(typeof wordId!=="string"||!ID.test(wordId)||
     !["flip","spell"].includes(mode)||
     typeof requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,44}$/i.test(requestId)||
     (mode==="flip"&&!["known","unsure","forgot"].includes(judgment))||
     (mode==="spell"&&(typeof answer!=="string"||answer.length>100||!answer.trim())))
    return err("INVALID_FLASHCARD_ANSWER",400);
  const existing=await sql(env,"SELECT user_id,word_id,game_type,result FROM review_events WHERE id=?",requestId).first();
  if(existing){
    if(existing.user_id!==userId||existing.word_id!==wordId||
       existing.game_type!=="bookplate-"+mode)return err("FLASHCARD_REQUEST_REUSED",409);
    return json({saved:true,alreadyApplied:true,correct:existing.result==="correct",
      result:existing.result});
  }
  const word=await sql(env,"SELECT w.headword,w.meaning_zh,uw.status FROM user_words uw "+
    "JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? AND uw.word_id=? "+
    "AND uw.bookmarked=1 AND "+flashVisible,userId,wordId).first();
  if(!word)return err("FLASHCARD_WORD_UNAVAILABLE",403);
  // Flip cards are honest self-ratings; spelling is ALWAYS evaluated here.
  const correct=mode==="flip"?judgment==="known":
    answer.trim().normalize("NFKC").toLocaleLowerCase("en-US")===
    word.headword.trim().normalize("NFKC").toLocaleLowerCase("en-US");
  const result=correct?"correct":mode==="flip"&&judgment==="unsure"?"hinted":"incorrect";
  if(await studyScheduleReady(env)){
    const saved=await applySenseReview(env,{userId,wordId,gameType:"bookplate-"+mode,
      result,correct,eventId:requestId});
    return json({...saved,expected:word.headword,meaning:word.meaning_zh||""});
  }
  const history=await sql(env,"SELECT result FROM review_events WHERE user_id=? AND word_id=? "+
    "AND game_type IN ('bookplate-flip','bookplate-spell') "+
    "ORDER BY rowid DESC LIMIT 3",userId,wordId).all();
  let streak=correct?1:0;
  if(correct)for(const event of history.results||[]){
    if(event.result!=="correct")break;
    streak++;
  }
  const days=correct?[1,3,7,14][Math.min(streak-1,3)]:1;
  const preserveMastered=word.status==="mastered"&&correct;
  const related=await relatedAccessibleWordIds(env,wordId,userId);
  await env.DB.batch([
    sql(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
      "VALUES(?,?,?,NULL,?,?)",requestId,userId,wordId,"bookplate-"+mode,result),
    ...related.map(alias=>sql(env,
      "UPDATE user_words SET status=?,last_seen_at=CURRENT_TIMESTAMP,"+
      "due_at=CASE WHEN ? THEN NULL ELSE datetime('now','+'||?||' days') END "+
      "WHERE user_id=? AND word_id=?",
      preserveMastered?"mastered":"learning",preserveMastered?1:0,days,userId,alias))
  ]);
  return json({saved:true,correct,result,expected:word.headword,
    meaning:word.meaning_zh||"",nextReviewDays:preserveMastered?null:days,
    status:preserveMastered?"mastered":"learning"});
}

export async function handleLearningState(req,env,path,user){
  if(!user)return err("LOGIN_REQUIRED",401);
  if(path==="/api/me/quick-review"&&req.method==="POST")return quickReview(req,env,user.id);
  if(path==="/api/me/flashcards"&&req.method==="GET")return flashcardPool(req,env,user.id);
  if(path==="/api/me/flashcards/answer"&&req.method==="POST")return flashcardAnswer(req,env,user.id);
  if(path==="/api/me/progress"&&req.method==="GET")return progressList(env,user.id);
  if(path==="/api/me/words"&&req.method==="GET")return wordList(env,user.id);
  if(path==="/api/me/progress"&&req.method==="POST")return setProgress(req,env,user.id);
  const match=path.match(/^\/api\/me\/words\/([^/]+)$/);
  if(match&&req.method==="PUT")return setWord(req,env,user.id,match[1]);
  return err("NOT_FOUND",404);
}
