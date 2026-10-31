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
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL))",id,userId).first();
}
async function canStudyWord(env,id,userId){
  return sql(env,"SELECT w.id FROM words w WHERE w.id=? AND EXISTS("+ 
    "SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
    "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
    "WHERE cw.word_id=w.id AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
    "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL)))",id,userId).first();
}
async function progressList(env,userId){
  const found=await sql(env,"SELECT p.chapter_id,p.progress,p.completed_at,p.updated_at,"+
    "ch.book_id,ch.chapter_no,b.title AS book_title FROM reading_progress p "+
    "JOIN chapters ch ON ch.id=p.chapter_id JOIN books b ON b.id=ch.book_id "+
    "JOIN categories c ON c.id=b.category_id WHERE p.user_id=? "+
    "AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e WHERE e.user_id=p.user_id "+
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL)) "+
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
    "WHERE e2.user_id=uw.user_id AND e2.category_id=b2.category_id AND e2.revoked_at IS NULL)) "+
    "ORDER BY ch2.chapter_no ASC LIMIT 1) AS context_sentence "+
    "FROM user_words uw "+
    "JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? AND uw.bookmarked=1 "+
    "AND EXISTS(SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
    "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
    "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e WHERE e.user_id=uw.user_id "+
    "AND e.category_id=b.category_id AND e.revoked_at IS NULL))) "+
    "ORDER BY uw.last_seen_at DESC LIMIT 200",userId).all();
  return json({words:(result.results||[]).map(w=>{
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
  await sql(env,"INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
    "VALUES(?,?,?,?,CURRENT_TIMESTAMP,CASE WHEN ?='mastered' THEN NULL ELSE datetime('now','+1 day') END) "+
    "ON CONFLICT(user_id,word_id) DO UPDATE SET "+
    "status=excluded.status,bookmarked=excluded.bookmarked,last_seen_at=CURRENT_TIMESTAMP,due_at=excluded.due_at",
    userId,id,status,bookmarked?1:0,status).run();
  return json({saved:true,wordId:id,bookmarked,status});
}
export async function handleLearningState(req,env,path,user){
  if(!user)return err("LOGIN_REQUIRED",401);
  if(path==="/api/me/progress"&&req.method==="GET")return progressList(env,user.id);
  if(path==="/api/me/words"&&req.method==="GET")return wordList(env,user.id);
  if(path==="/api/me/progress"&&req.method==="POST")return setProgress(req,env,user.id);
  const match=path.match(/^\/api\/me\/words\/([^/]+)$/);
  if(match&&req.method==="PUT")return setWord(req,env,user.id,match[1]);
  return err("NOT_FOUND",404);
}
