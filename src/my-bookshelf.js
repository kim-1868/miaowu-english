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
async function listBooks(env,userId){
 const statement=[
 "SELECT b.id AS book_id,b.title,b.description,b.cover_key,c.slug AS category_slug,",
 "CASE WHEN ub.book_id IS NULL THEN 0 ELSE 1 END AS bookmarked,",
 "(SELECT COUNT(*) FROM chapters ch WHERE ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP) AS chapter_count,",
 "(SELECT COUNT(*) FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP AND rp.completed_at IS NOT NULL) AS completed_chapters,",
 "(SELECT COUNT(*) FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP) AS started_chapters,",
 "(SELECT rp.chapter_id FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP ORDER BY rp.updated_at DESC LIMIT 1) AS last_chapter_id,",
 "(SELECT ch.chapter_no FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP ORDER BY rp.updated_at DESC LIMIT 1) AS last_chapter_no,",
 "(SELECT MAX(rp.updated_at) FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP) AS last_read_at",
 "FROM books b JOIN categories c ON c.id=b.category_id",
 "LEFT JOIN user_bookmarks ub ON ub.book_id=b.id AND ub.user_id=?",
 "WHERE b.status='published' AND c.is_visible=1",
 "AND (ub.book_id IS NOT NULL OR EXISTS(SELECT 1 FROM reading_progress rp JOIN chapters ch ON ch.id=rp.chapter_id",
 "WHERE rp.user_id=? AND ch.book_id=b.id AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP))",
 "ORDER BY CASE WHEN ub.book_id IS NOT NULL THEN 0 ELSE 1 END,COALESCE(last_read_at,ub.created_at) DESC,b.title LIMIT 200"
 ].join(" ");
 const result=await sql(env,statement,userId,userId,userId,userId,userId,userId,userId).all();
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
