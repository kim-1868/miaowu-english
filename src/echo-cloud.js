import {studyKey,relatedAccessibleWordIds,uniqueStudyRows,countUserDueSenses} from './study-identity.js';
import {studyScheduleReady,applySenseReview} from './study-schedule-store.js';
// S6: real Story Echo. Return questions only from accessible, completed D1 chapters.
// Server scores submitted answers and updates spaced-repeat review events and due dates.
const H={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff"};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:H});
const fail=(error,status=400)=>reply({error},status);
const exec=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const MODES=new Set(["fill","situation","spell"]);
const validId=x=>typeof x==="string"&&ID.test(x);
const core=[
"FROM reading_progress p",
"JOIN chapters ch ON ch.id=p.chapter_id",
"JOIN books b ON b.id=ch.book_id",
"JOIN categories c ON c.id=b.category_id",
"JOIN chapter_words cw ON cw.chapter_id=ch.id",
"JOIN words w ON w.id=cw.word_id",
"WHERE p.user_id=? AND p.completed_at IS NOT NULL",
"AND b.status='published' AND c.is_visible=1",
"AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP",
"AND (ch.is_preview=1 OR EXISTS(",
"SELECT 1 FROM entitlements e WHERE e.user_id=p.user_id",
"AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))"
].join(" ");
// "本章复习" is immediate practice for the chapter the reader has OPENED.
// It never depends on bookmarking a word or on completed_at. Long-term
// scopes continue to require finished chapters and per-account entitlements.
function chapterCore(){
 return [
 "FROM chapters ch",
 "JOIN books b ON b.id=ch.book_id",
 "JOIN categories c ON c.id=b.category_id",
 "JOIN chapter_words cw ON cw.chapter_id=ch.id",
 "JOIN words w ON w.id=cw.word_id",
 "WHERE ch.id=? AND b.status='published' AND c.is_visible=1",
 "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP",
 "AND (ch.is_preview=1 OR EXISTS(",
 "SELECT 1 FROM entitlements e WHERE e.user_id=?",
 "AND e.category_id=b.category_id AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v WHERE v.id=e.source_code_id AND v.status='revoked')))"
 ].join(" ");
}
async function available(env,user,url){
  const scope=url.searchParams.get("scope")||"recent";
  if(!["chapter","recent","custom","due"].includes(scope))return fail("INVALID_SCOPE");
  const bookId=url.searchParams.get("bookId")||"";
  const chapterId=url.searchParams.get("chapterId")||"";
  if(bookId&&!validId(bookId))return fail("INVALID_BOOK");
  if(chapterId&&!validId(chapterId))return fail("INVALID_CHAPTER");
  const from=Number(url.searchParams.get("from")||1);
  const to=Number(url.searchParams.get("to")||300);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to>300||from>to)
    return fail("INVALID_CHAPTER_RANGE");
  // Filter in SQL before LIMIT. A completed 12-chapter book already has 733
  // occurrences: filtering in JS *after* LIMIT silently hid older chapters
  // and older due words, even when their owner had legitimate access.
  const binds=scope==="chapter"?[chapterId,user.id]:[user.id];
  let scoped=scope==="chapter"?chapterCore():core;
  if(scope==="chapter"){
    if(!chapterId)return fail("CHAPTER_REQUIRED");
  }else if(scope==="custom"){
    if(bookId){scoped+=" AND b.id=?";binds.push(bookId)}
    scoped+=" AND ch.chapter_no BETWEEN ? AND ?";
    binds.push(from,to);
  }else if(scope==="due"){
    scoped+=" AND EXISTS(SELECT 1 FROM user_words uw "+
      "WHERE uw.user_id=p.user_id AND uw.word_id=cw.word_id "+
      "AND uw.status!='mastered' AND uw.due_at IS NOT NULL "+
      "AND uw.due_at<=CURRENT_TIMESTAMP)";
  }
  const rows=await exec(env,"SELECT ch.id chapter_id,ch.chapter_no,ch.book_id,b.title book_title,"+
    "cw.context_sentence,w.id word_id,w.headword,w.phonetic_uk,w.phonetic_us,"+
    "w.meaning_zh,w.part_of_speech,w.example_en,w.example_zh "+scoped+
    (scope==="chapter"?
      " ORDER BY ch.chapter_no DESC,cw.context_anchor ASC LIMIT 600":
      " ORDER BY p.updated_at DESC,ch.chapter_no DESC,cw.context_anchor ASC LIMIT 600"),
    ...binds).all();
  let data=rows.results||[];
  if(scope==="recent"){
    const ids=[...new Set(data.map(x=>x.chapter_id))].slice(0,3);
    data=data.filter(x=>ids.includes(x.chapter_id));
  }
  data=uniqueStudyRows(data).slice(0,60);
  return reply({scope,words:data,availableGames:data.length>=4?
    ["fill","situation","spell"]:data.length?["spell"]:[],
    distinctWords:data.length,manualOnly:false,
    note:scope==="chapter"?"当前已打开章节的目标词可立即练习，无需完成阅读或先收藏。":"仅展示已读完且有权读取的章节目标词。"});
}
async function stats(env,user){
  // Same eligible unique senses as /api/me/words.flashDue.
  const due=await countUserDueSenses(env,user.id);
  return reply({due});
}
async function answer(req,env,user){
  if(!/^application\/json(?:;|$)/i.test(req.headers.get("content-type")||""))
    return fail("CONTENT_TYPE");
  if(Number(req.headers.get("content-length")||0)>2048)return fail("TOO_LARGE",413);
  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>2048)return fail("TOO_LARGE",413);
  let data;try{data=JSON.parse(raw)}catch{return fail("INVALID_JSON")}
  if(!data||!validId(data.wordId)||!validId(data.chapterId)||!MODES.has(data.gameType)||
    typeof data.answer!=="string"||data.answer.length>90||!data.answer.trim()||
    typeof data.hinted!=="boolean"||
    (data.choiceId!==undefined&&(!validId(data.choiceId)||data.gameType==="spell")))
    return fail("INVALID_ANSWER");
  const q=await exec(env,"SELECT w.id,w.headword,w.part_of_speech,w.meaning_zh,w.phonetic_uk,w.phonetic_us,"+
    "cw.context_sentence,ch.id chapter_id "+chapterCore()+
    " AND w.id=? LIMIT 1",data.chapterId,user.id,data.wordId).first();
  if(!q)return fail("REVIEW_WORD_UNAVAILABLE",403);
  // Keep the legacy 5-second guard only before the additive 011 migration.
  // Canonical replay safety comes from its explicit schedule and same-day cap;
  // a user may switch from flipping to story practice immediately.
  if(!await studyScheduleReady(env)){
    const last=await exec(env,"SELECT created_at FROM review_events "+
      "WHERE user_id=? AND word_id=? AND created_at>datetime('now','-5 seconds') "+
      "ORDER BY created_at DESC LIMIT 1",user.id,q.id).first();
    if(last)return fail("REVIEW_TOO_FAST",429);
  }
  let right=data.answer.trim().toLocaleLowerCase("en-US")===
    q.headword.trim().toLocaleLowerCase("en-US");
  if(data.choiceId&&data.gameType!=="spell"){
    // Multiple senses can share the same English spelling: a wrong POS/sense
    // must not score as correct merely because its headword is identical.
    // Verify the chosen ID belongs to a currently accessible published chapter.
    const choice=await exec(env,"SELECT w.id,w.headword,w.part_of_speech,w.meaning_zh "+
      "FROM words w WHERE w.id=? AND EXISTS(SELECT 1 FROM chapter_words cw "+
      "JOIN chapters ch ON ch.id=cw.chapter_id "+
      "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
      "WHERE cw.word_id=w.id AND b.status='published' AND c.is_visible=1 "+
      "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
      "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
      "WHERE e.user_id=? AND e.category_id=b.category_id AND e.revoked_at IS NULL "+
      "AND NOT EXISTS(SELECT 1 FROM activation_codes v "+
      "WHERE v.id=e.source_code_id AND v.status='revoked'))))",data.choiceId,user.id).first();
    if(!choice)return fail("REVIEW_OPTION_UNAVAILABLE",403);
    if(choice.headword.trim().toLocaleLowerCase("en-US")!==data.answer.trim().toLocaleLowerCase("en-US"))
      return fail("REVIEW_OPTION_MISMATCH",400);
    right=studyKey(choice)===studyKey(q);
  }
  const result=right?(data.hinted?"hinted":"correct"):"incorrect";
  if(await studyScheduleReady(env)){
    const saved=await applySenseReview(env,{userId:user.id,wordId:q.id,
      chapterId:data.chapterId,gameType:data.gameType,result,
      correct:right&&!data.hinted,eventId:crypto.randomUUID()});
    return reply({...saved,correct:right,expected:q.headword,meaning:q.meaning_zh,
      phonetic:q.phonetic_uk||q.phonetic_us||"",context:q.context_sentence});
  }
  const related=await relatedAccessibleWordIds(env,q.id,user.id);
  const recent=await exec(env,"SELECT result FROM review_events "+
    "WHERE user_id=? AND word_id IN ("+related.map(()=>"?").join(",")+
    ") ORDER BY created_at DESC LIMIT 3",user.id,...related).all();
  const streak=right&&!data.hinted?1+(recent.results||[]).filter(x=>x.result==="correct").length:0;
  const status=streak>=4?"mastered":"learning";
  const days=status==="mastered"?null:right&&!data.hinted?Math.min(14,streak*3):1;
  await env.DB.batch([
    exec(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
      "VALUES(?,?,?,?,?,?)",crypto.randomUUID(),user.id,q.id,data.chapterId,data.gameType,result),
    ...related.map(alias=>exec(env,
      "INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
      "VALUES(?,?,?,0,CURRENT_TIMESTAMP,"+
      (days===null?"NULL":"datetime('now','+"+days+" days')")+") "+
      "ON CONFLICT(user_id,word_id) DO UPDATE SET status=excluded.status,"+
      "last_seen_at=CURRENT_TIMESTAMP,due_at=excluded.due_at",
      user.id,alias,status))
  ]);
  return reply({correct:right,result,expected:q.headword,meaning:q.meaning_zh,
    phonetic:q.phonetic_uk||q.phonetic_us||"",context:q.context_sentence,
    status,nextReviewDays:days,saved:true});
}
export async function handleEcho(req,env,path,user){
  if(!user)return fail("LOGIN_REQUIRED",401);
  if(path==="/api/me/echo/stats"&&req.method==="GET")return stats(env,user);
  if(path==="/api/me/echo/available"&&req.method==="GET")
    return available(env,user,new URL(req.url));
  if(path==="/api/me/echo/answer"&&req.method==="POST")
    return answer(req,env,user);
  return fail("NOT_FOUND",404);
}
