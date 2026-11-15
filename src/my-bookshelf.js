// V1.1 personal bookshelf: bookmarks never grant entitlements.
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEADERS});
const fail=(code,status)=>json({error:code},status);
const sql=(env,query,...params)=>env.DB.prepare(query).bind(...params);
export async function bookshelfSchemaReady(env){
 try{
  const result=await sql(env,"SELECT name FROM sqlite_master WHERE type='table' AND name='user_bookmarks'").first();
  return result?.name==="user_bookmarks";
 }catch{return false}
}
// Reuse each user progress row once instead of six per-book correlated scans.
async function listBooks(env,userId){
 const statement=[
 "WITH valid_progress AS (",
 " SELECT ch.book_id,rp.chapter_id,ch.chapter_no,rp.completed_at,rp.updated_at,",
 " ROW_NUMBER() OVER (PARTITION BY ch.book_id ORDER BY rp.updated_at DESC,rp.chapter_id DESC) AS recency",
 " FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id",
 " WHERE rp.user_id=? AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP",
 "), progress_summary AS (",
 " SELECT book_id,COUNT(*) AS started_chapters,",
 " SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_chapters,",
 " MAX(updated_at) AS last_read_at FROM valid_progress GROUP BY book_id",
 "), latest_chapter AS (",
 " SELECT book_id,chapter_id,chapter_no FROM valid_progress WHERE recency=1",
 ")",
 "SELECT b.id AS book_id,b.title,b.description,b.cover_key,c.slug AS category_slug,",
 "CASE WHEN ub.book_id IS NULL THEN 0 ELSE 1 END AS bookmarked,",
 "(SELECT COUNT(*) FROM chapters ch WHERE ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP) AS chapter_count,",
 "COALESCE(ps.completed_chapters,0) AS completed_chapters,",
 "COALESCE(ps.started_chapters,0) AS started_chapters,",
 "lc.chapter_id AS last_chapter_id,lc.chapter_no AS last_chapter_no,ps.last_read_at",
 "FROM books b JOIN categories c ON c.id=b.category_id",
 "LEFT JOIN user_bookmarks ub ON ub.book_id=b.id AND ub.user_id=?",
 "LEFT JOIN progress_summary ps ON ps.book_id=b.id",
 "LEFT JOIN latest_chapter lc ON lc.book_id=b.id",
 "WHERE b.status='published' AND c.is_visible=1",
 "AND (ub.book_id IS NOT NULL OR ps.book_id IS NOT NULL)",
 "ORDER BY CASE WHEN ub.book_id IS NOT NULL THEN 0 ELSE 1 END,",
 "COALESCE(ps.last_read_at,ub.created_at) DESC,b.title LIMIT 200"
 ].join(" ");
 const result=await sql(env,statement,userId,userId).all();
 return (result.results||[]).map(b=>{
  const total=Number(b.chapter_count)||0;
  const completed=Number(b.completed_chapters)||0;
  const started=Number(b.started_chapters)>0;
  const state=started?(total>0&&completed===total?"finished":"reading"):"want";
  return {...b,bookmarked:Boolean(b.bookmarked),state,chapter_count:total,
    completed_chapters:completed,started_chapters:Number(b.started_chapters)||0};
 });
}
export async function handleMyBookshelf(request,env,user){
 if(!user)return fail("LOGIN_REQUIRED",401);
 if(!await bookshelfSchemaReady(env))return fail("BOOKSHELF_NOT_READY",503);
 const path=new URL(request.url).pathname;
 if(path==="/api/me/bookshelf"&&request.method==="GET"){
  const all=await listBooks(env,user.id);
  // Only explicit bookmarks belong to MY bookshelf. Reading history is separate.
  return json({books:all.filter(b=>b.bookmarked),
    recent:all.filter(b=>!b.bookmarked&&b.started_chapters>0).slice(0,12)});
 }
 const match=path.match(/^\/api\/me\/bookshelf\/([a-zA-Z0-9_-]{1,80})$/);
 if(!match)return fail("NOT_FOUND",404);
 if(request.method!=="PUT")return fail("METHOD_NOT_ALLOWED",405);
 const bookId=match[1];
 if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))
  return fail("CONTENT_TYPE",400);
 const raw=await request.text();
 if(new TextEncoder().encode(raw).length>512)return fail("TOO_LARGE",400);
 let payload;
 try{payload=JSON.parse(raw)}catch{return fail("INVALID_JSON",400)}
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    Object.keys(payload).length!==1||typeof payload.bookmarked!=="boolean")
  return fail("INVALID_BOOKMARK",400);
 const visible=await sql(env,"SELECT b.id FROM books b JOIN categories c ON c.id=b.category_id "+
   "WHERE b.id=? AND b.status='published' AND c.is_visible=1",bookId).first();
 if(!visible)return fail("BOOK_NOT_AVAILABLE",404);
 if(payload.bookmarked){
  await sql(env,"INSERT OR IGNORE INTO user_bookmarks(user_id,book_id) VALUES(?,?)",user.id,bookId).run();
 }else{
  await sql(env,"DELETE FROM user_bookmarks WHERE user_id=? AND book_id=?",user.id,bookId).run();
 }
 return json({saved:true,bookId,bookmarked:payload.bookmarked});
}
