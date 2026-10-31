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
"AND e.category_id=b.category_id AND e.revoked_at IS NULL))"
].join(" ");
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
  const rows=await exec(env,"SELECT ch.id chapter_id,ch.chapter_no,ch.book_id,b.title book_title,"+
    "cw.context_sentence,w.id word_id,w.headword,w.phonetic_uk,w.phonetic_us,"+
    "w.meaning_zh,w.part_of_speech,w.example_en,w.example_zh "+core+
    " ORDER BY p.updated_at DESC,ch.chapter_no DESC,cw.context_anchor ASC LIMIT 600",
    user.id).all();
  let data=rows.results||[];
  if(scope==="chapter"){
    if(!chapterId)return fail("CHAPTER_REQUIRED");
    data=data.filter(x=>x.chapter_id===chapterId);
  }else if(scope==="custom"){
    if(bookId)data=data.filter(x=>x.book_id===bookId);
    data=data.filter(x=>x.chapter_no>=from&&x.chapter_no<=to);
  }else if(scope==="recent"){
    const ids=[...new Set(data.map(x=>x.chapter_id))].slice(0,3);
    data=data.filter(x=>ids.includes(x.chapter_id));
  }else{
    const due=await exec(env,"SELECT word_id FROM user_words WHERE user_id=? "+
      "AND status!='mastered' AND due_at IS NOT NULL AND due_at<=CURRENT_TIMESTAMP",user.id).all();
    const dueIds=new Set((due.results||[]).map(x=>x.word_id));
    data=data.filter(x=>dueIds.has(x.word_id));
  }
  const seen=new Set();
  data=data.filter(x=>{if(seen.has(x.word_id))return false;seen.add(x.word_id);return true}).slice(0,60);
  return reply({scope,words:data,availableGames:data.length>=4?
    ["fill","situation","spell"]:data.length?["spell"]:[],
    distinctWords:data.length,manualOnly:false,
    note:"仅展示当前账号已读完且有权读取的章节目标词。"});
}
async function stats(env,user){
  const count=await exec(env,"SELECT COUNT(*) n FROM user_words uw WHERE uw.user_id=? "+
    "AND uw.status!='mastered' AND uw.due_at IS NOT NULL "+
    "AND uw.due_at<=CURRENT_TIMESTAMP AND EXISTS("+
    "SELECT 1 FROM reading_progress p JOIN chapters ch ON ch.id=p.chapter_id "+
    "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
    "JOIN chapter_words cw ON cw.chapter_id=ch.id "+
    "WHERE p.user_id=uw.user_id AND p.completed_at IS NOT NULL AND cw.word_id=uw.word_id "+
    "AND b.status='published' AND c.is_visible=1 "+
    "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
    "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
    "WHERE e.user_id=p.user_id AND e.category_id=b.category_id AND e.revoked_at IS NULL)))",
    user.id).first();
  return reply({due:count?.n||0});
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
    typeof data.hinted!=="boolean")return fail("INVALID_ANSWER");
  const q=await exec(env,"SELECT w.id,w.headword,w.meaning_zh,w.phonetic_uk,w.phonetic_us,"+
    "cw.context_sentence,ch.id chapter_id "+core+
    " AND ch.id=? AND w.id=? LIMIT 1",user.id,data.chapterId,data.wordId).first();
  if(!q)return fail("REVIEW_WORD_UNAVAILABLE",403);
  const last=await exec(env,"SELECT created_at FROM review_events "+
    "WHERE user_id=? AND word_id=? AND created_at>datetime('now','-5 seconds') "+
    "ORDER BY created_at DESC LIMIT 1",user.id,q.id).first();
  if(last)return fail("REVIEW_TOO_FAST",429);
  const right=data.answer.trim().toLocaleLowerCase("en-US")===
    q.headword.trim().toLocaleLowerCase("en-US");
  const result=right?(data.hinted?"hinted":"correct"):"incorrect";
  const recent=await exec(env,"SELECT result FROM review_events "+
    "WHERE user_id=? AND word_id=? ORDER BY created_at DESC LIMIT 3",user.id,q.id).all();
  const streak=right&&!data.hinted?1+(recent.results||[]).filter(x=>x.result==="correct").length:0;
  const status=streak>=4?"mastered":"learning";
  const days=status==="mastered"?null:right&&!data.hinted?Math.min(14,streak*3):1;
  await env.DB.batch([
    exec(env,"INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) "+
      "VALUES(?,?,?,?,?,?)",crypto.randomUUID(),user.id,q.id,data.chapterId,data.gameType,result),
    exec(env,"INSERT INTO user_words(user_id,word_id,status,bookmarked,last_seen_at,due_at) "+
      "VALUES(?,?,?,0,CURRENT_TIMESTAMP,"+
      (days===null?"NULL":"datetime('now','+"+days+" days')")+") "+
      "ON CONFLICT(user_id,word_id) DO UPDATE SET status=excluded.status,"+
      "last_seen_at=CURRENT_TIMESTAMP,due_at=excluded.due_at",
      user.id,q.id,status)
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
