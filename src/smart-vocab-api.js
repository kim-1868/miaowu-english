import {studyKey,relatedAccessibleWordIds} from './study-identity.js';
import {selectSmartNewWords,SMART_EXAMS} from './smart-vocab-preflight.js';

// Optional: the entire feature is invisible unless explicitly enabled on a
// reviewed, migrated deployment. No existing novel/flashcard request calls here.
const HEADERS={'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:HEADERS});
const error=(code,status)=>reply({error:code},status);
const db=(env,q,...args)=>env.DB.prepare(q).bind(...args);
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,44}$/i;
const isEnabled=env=>env.SMART_VOCAB_ENABLED==='true';

async function activeCategory(env,userId,slug){
  if(!SMART_EXAMS.includes(slug))return null;
  return db(env,
    "SELECT c.id,c.slug FROM categories c JOIN entitlements e ON e.category_id=c.id "+
    "WHERE c.slug=? AND c.is_visible=1 AND e.user_id=? AND e.revoked_at IS NULL "+
    "AND NOT EXISTS(SELECT 1 FROM activation_codes ac WHERE ac.id=e.source_code_id AND ac.status='revoked')",
    slug,userId).first();
}

// A published catalog must contain as many *fully reviewed headwords* as its
// separately audited expectation. No row, no manual signoff, or any missing
// pronunciation / examples means fail-closed. The production gate also stays off.
async function catalogReady(env,categoryId){
  const level=await db(env,"SELECT expected_headwords,enabled,catalog_verified_at "+
    "FROM smart_vocab_levels WHERE category_id=?",categoryId).first();
  if(!level||level.enabled!==1||!level.catalog_verified_at)return false;
  const n=await db(env,
    "SELECT COUNT(DISTINCT LOWER(TRIM(w.headword))) AS n "+
    "FROM smart_vocab_catalog cv JOIN words w ON w.id=cv.word_id "+
    "WHERE cv.category_id=? AND cv.reviewed=1 AND cv.frequency_verified=1 "+
    "AND TRIM(w.headword)!='' AND TRIM(COALESCE(w.meaning_zh,''))!='' "+
    "AND (TRIM(COALESCE(w.phonetic_uk,''))!='' OR TRIM(COALESCE(w.phonetic_us,''))!='') "+
    "AND TRIM(COALESCE(w.example_en,''))!='' AND TRIM(COALESCE(w.example_zh,''))!=''",
    categoryId).first();
  return Number(n?.n||0)>=Number(level.expected_headwords);
}

async function card(env,categoryId,wordId){
  return db(env,
    "SELECT w.id AS word_id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,"+
    "w.meaning_zh,w.example_en,w.example_zh,cv.frequency_rank,cv.frequency_source,"+
    "c.slug AS category_slug "+
    "FROM smart_vocab_catalog cv JOIN words w ON w.id=cv.word_id "+
    "JOIN categories c ON c.id=cv.category_id "+
    "WHERE cv.category_id=? AND cv.word_id=? AND cv.reviewed=1 AND cv.frequency_verified=1 "+
    "AND TRIM(w.headword)!='' AND TRIM(COALESCE(w.meaning_zh,''))!='' "+
    "AND (TRIM(COALESCE(w.phonetic_uk,''))!='' OR TRIM(COALESCE(w.phonetic_us,''))!='') "+
    "AND TRIM(COALESCE(w.example_en,''))!='' AND TRIM(COALESCE(w.example_zh,''))!=''",
    categoryId,wordId).first();
}

async function studyRows(env,userId){
  const found=await db(env,"SELECT uw.word_id,uw.status,uw.bookmarked,uw.due_at,uw.last_seen_at,"+
    "w.headword,w.part_of_speech,w.meaning_zh FROM user_words uw "+
    "JOIN words w ON w.id=uw.word_id WHERE uw.user_id=? "+
    "ORDER BY uw.last_seen_at DESC,uw.rowid DESC",userId).all();
  return found.results||[];
}

async function visibleAliases(env,userId,source){
  const key=studyKey(source);
  const previous=await relatedAccessibleWordIds(env,source.word_id,userId);
  const found=await db(env,
    "SELECT DISTINCT w.id AS word_id,w.headword,w.part_of_speech,w.meaning_zh "+
    "FROM words w JOIN smart_vocab_catalog cv ON cv.word_id=w.id "+
    "JOIN smart_vocab_levels lv ON lv.category_id=cv.category_id "+
    "JOIN categories c ON c.id=cv.category_id "+
    "JOIN entitlements e ON e.category_id=c.id AND e.user_id=? "+
    "WHERE LOWER(TRIM(w.headword))=LOWER(TRIM(?)) AND cv.reviewed=1 "+
    "AND lv.enabled=1 AND lv.catalog_verified_at IS NOT NULL "+
    "AND e.revoked_at IS NULL AND c.is_visible=1 AND "+
    "NOT EXISTS(SELECT 1 FROM activation_codes ac WHERE ac.id=e.source_code_id AND ac.status='revoked')",
    userId,source.headword).all();
  const valid=(found.results||[]).filter(w=>studyKey(w)===key).map(w=>w.word_id);
  return [...new Set([...previous,...valid,source.word_id])].sort();
}

async function list(env,userId,category){
  const scope=await activeCategory(env,userId,category);
  if(!scope)return error('CATEGORY_NOT_ENTITLED',403);
  if(!await catalogReady(env,scope.id))return error('CATALOG_NOT_READY',503);
  const records=await db(env,
    "SELECT w.id AS word_id,w.headword,w.phonetic_uk,w.phonetic_us,w.part_of_speech,"+
    "w.meaning_zh,w.example_en,w.example_zh,cv.frequency_rank,cv.frequency_source,"+
    "c.slug AS category_slug FROM smart_vocab_catalog cv "+
    "JOIN words w ON w.id=cv.word_id JOIN categories c ON c.id=cv.category_id "+
    "WHERE cv.category_id=? AND cv.reviewed=1 AND cv.frequency_verified=1 "+
    "ORDER BY cv.frequency_rank,cv.word_id LIMIT 15000",scope.id).all();
  const all=records.results||[];
  const rows=await studyRows(env,userId),state=new Map();
  for(const row of rows){
    const key=studyKey(row);
    if(!state.has(key))state.set(key,row);
  }
  const due=[];
  for(const item of all){
    const row=state.get(studyKey(item));
    if(!row||row.status==='mastered'||!row.due_at||row.due_at>new Date().toISOString().replace('T',' ').slice(0,19))continue;
    due.push({...item,review:true,bookmarked:!!row.bookmarked,due_at:row.due_at});
  }
  due.sort((a,b)=>a.due_at.localeCompare(b.due_at)||
    a.frequency_rank-b.frequency_rank||a.word_id.localeCompare(b.word_id));
  // Keep a healthy flow of fresh exam words even when many reviews are due.
  const selectedDue=[],seen=new Set();
  for(const word of due){
    const key=studyKey(word);if(seen.has(key))continue;
    seen.add(key);selectedDue.push(word);if(selectedDue.length===8)break;
  }
  const fresh=selectSmartNewWords({
    category,activeEntitlements:[scope.slug],rankedWords:all,studyRows:rows,
    catalogVerified:true,limit:20
  });
  const words=[...selectedDue];
  for(const word of fresh.words){
    if(words.length>=20)break;
    words.push({...word,review:false,bookmarked:!!state.get(studyKey(word))?.bookmarked});
  }
  return reply({category,words,hasDue:due.length>0,remainingNew:fresh.remaining,
    frequencyNote:category==='postgrad'
      ?'词频以词库标注来源为准；考研真题词频与通用语料词频分别标识。'
      :'按已标注的 COCA/BNC 语料词频排序，不等于考试真题出现频率。'});
}

async function parseBody(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return null;
  if(Number(req.headers.get('content-length')||0)>2048)return null;
  const text=await req.text();if(new TextEncoder().encode(text).length>2048)return null;
  try{const v=JSON.parse(text);return v&&!Array.isArray(v)&&typeof v==='object'?v:null}
  catch{return null}
}

async function submit(req,env,userId,kind){
  const data=await parseBody(req);
  if(!data||!SMART_EXAMS.includes(data.category)||typeof data.wordId!=='string'||
    !ID.test(data.wordId))return error('INVALID_INPUT',400);
  if(kind==='answer'&&(typeof data.remembered!=='boolean'||
    typeof data.requestId!=='string'||!UUID.test(data.requestId)))
    return error('INVALID_INPUT',400);
  if(kind==='bookmark'&&typeof data.bookmarked!=='boolean')
    return error('INVALID_INPUT',400);
  const category=await activeCategory(env,userId,data.category);
  if(!category)return error('CATEGORY_NOT_ENTITLED',403);
  if(!await catalogReady(env,category.id))return error('CATALOG_NOT_READY',503);
  const w=await card(env,category.id,data.wordId);
  if(!w)return error('WORD_NOT_AVAILABLE',404);
  const aliases=await visibleAliases(env,userId,w);

  if(kind==='bookmark'){
    await env.DB.batch(aliases.map(id=>db(env,
      "INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES(?,?,'new',?) "+
      "ON CONFLICT(user_id,word_id) DO UPDATE SET bookmarked=excluded.bookmarked",
      userId,id,data.bookmarked?1:0)));
    return reply({saved:true,wordId:data.wordId,bookmarked:data.bookmarked});
  }

  const old=await db(env,
    "SELECT user_id,word_id,game_type,result FROM review_events WHERE id=?",
    data.requestId).first();
  if(old){
    if(old.user_id!==userId||old.word_id!==data.wordId||old.game_type!=='smart-vocab')
      return error('REQUEST_ID_REUSED',409);
    return reply({saved:true,alreadyApplied:true,remembered:old.result==='correct'});
  }

  // Repeat successes on the same calendar day do not infinitely advance intervals.
  const history=await db(env,
    "SELECT date(created_at) AS day, MIN(CASE WHEN result='correct' THEN 1 ELSE 0 END) AS ok "+
    "FROM review_events WHERE user_id=? AND word_id=? AND game_type='smart-vocab' "+
    "AND date(created_at)<date('now') GROUP BY date(created_at) "+
    "ORDER BY day DESC LIMIT 4",userId,data.wordId).all();
  let streak=data.remembered?1:0;
  if(data.remembered)for(const item of history.results||[]){
    if(!item.ok)break;streak++;
  }
  const days=data.remembered?[1,3,7,14,30][Math.min(streak-1,4)]:1;
  const queries=[
    db(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
      "VALUES(?,?,?,NULL,'smart-vocab',?)",
      data.requestId,userId,data.wordId,data.remembered?'correct':'incorrect'),
    ...aliases.map(id=>db(env,
      "INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at,last_seen_at) "+
      "VALUES(?,?,'learning',0,datetime('now','+'||?||' days'),CURRENT_TIMESTAMP) "+
      "ON CONFLICT(user_id,word_id) DO UPDATE SET "+
      "status=CASE WHEN user_words.status='mastered' AND ?=1 THEN 'mastered' ELSE 'learning' END,"+
      "due_at=CASE WHEN user_words.status='mastered' AND ?=1 THEN NULL "+
      "ELSE excluded.due_at END,last_seen_at=CURRENT_TIMESTAMP",
      userId,id,days,data.remembered?1:0,data.remembered?1:0))
  ];
  try{await env.DB.batch(queries)}
  catch(cause){
    // Unique event IDs are the idempotency gate. Treat racing repeats as repeats,
    // never replay answer side effects or silently advance the card.
    const repeated=await db(env,"SELECT user_id,word_id,game_type,result "+
      "FROM review_events WHERE id=?",data.requestId).first();
    if(!repeated)throw cause;
    if(repeated.user_id!==userId||repeated.word_id!==data.wordId||
      repeated.game_type!=='smart-vocab')return error('REQUEST_ID_REUSED',409);
    return reply({saved:true,alreadyApplied:true,remembered:repeated.result==='correct'});
  }
  return reply({saved:true,remembered:data.remembered,wordId:data.wordId,
    nextReviewDays:days});
}

export async function handleSmartVocab(req,env,path,user){
  if(!isEnabled(env))return error('NOT_FOUND',404);
  if(!user)return error('LOGIN_REQUIRED',401);
  const isList=path==='/api/me/smart-vocab';
  const isAnswer=path==='/api/me/smart-vocab/answer';
  const isBookmark=path==='/api/me/smart-vocab/bookmark';
  if(!isList&&!isAnswer&&!isBookmark)return error('NOT_FOUND',404);
  if(isList&&req.method==='GET'){
    const category=new URL(req.url).searchParams.get('category')||'';
    if(!SMART_EXAMS.includes(category))return error('INVALID_CATEGORY',400);
    return list(env,user.id,category);
  }
  if(isAnswer&&req.method==='POST')return submit(req,env,user.id,'answer');
  if(isBookmark&&req.method==='POST')return submit(req,env,user.id,'bookmark');
  return error('METHOD_NOT_ALLOWED',405);
}
