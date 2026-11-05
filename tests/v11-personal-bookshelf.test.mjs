import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {bookshelfSchemaReady,handleMyBookshelf} from "../src/my-bookshelf.js";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const origin="https://miaowu.test";
class DB{
 constructor(migrated=true){
  this.sql=new DatabaseSync(":memory:");
  this.sql.exec(file("db/001_schema.sql"));
  this.sql.exec(file("db/003_public_categories.sql"));
  if(migrated)this.sql.exec(file("db/010_v11_my_bookshelf.sql"));
  this.sql.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES ('u1','u_1','h','s'),('u2','u_2','h','s')");
  this.sql.exec("INSERT INTO books(id,category_id,title,status) VALUES ('book1','cet4','Book One','published'),('book2','cet4','Book Two','published'),('draft1','cet4','Not Yet','draft')");
  this.sql.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
   "('ch1','book1',1,'First','{}','2026-01-01 00:00:00'),"+
   "('ch2','book1',2,'Last','{}','2026-01-01 00:00:00'),"+
   "('ch3','book2',1,'Other','{}','2026-01-01 00:00:00')");
 }
 prepare(q){
  const db=this.sql;
  return {bind(...params){
    const stmt=db.prepare(q);
    return {async first(){return stmt.get(...params)||null},
      async all(){return {results:stmt.all(...params)}},
      async run(){return {success:true,meta:stmt.run(...params)}}};
  }};
 }
}
function req(method="GET",bookId="",payload){
 const url=origin+"/api/me/bookshelf"+(bookId?"/"+bookId:"");
 const headers={};if(payload!==undefined)headers["content-type"]="application/json";
 return new Request(url,{method,headers,body:payload!==undefined?JSON.stringify(payload):undefined});
}
const user={id:"u1"};
const list=async env=>(await (await handleMyBookshelf(req(),env,user)).json()).books;
test("V1.1 bookshelf migration is additive and repeatable",async()=>{
 const env={DB:new DB()};
 env.DB.sql.exec(file("db/010_v11_my_bookshelf.sql"));
 assert.equal(await bookshelfSchemaReady(env),true);
 assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM user_words").get().n,0);
});
test("V1.1 personal shelf uses real chapter completion and preserves reading history",async()=>{
 const env={DB:new DB()};
 assert.deepEqual(await list(env),[]);
 const save=await handleMyBookshelf(req("PUT","book1",{bookmarked:true}),env,user);
 assert.equal(save.status,200,await save.clone().text());
 let books=await list(env);
 assert.equal(books.length,1);
 assert.equal(books[0].state,"want");
 assert.equal(books[0].bookmarked,true);
 assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,0,
   "bookmark must never grant purchase rights");
 const repeated=await handleMyBookshelf(req("PUT","book1",{bookmarked:true}),env,user);
 assert.equal(repeated.status,200);
 assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM user_bookmarks").get().n,1);
 env.DB.sql.exec("INSERT INTO reading_progress(user_id,chapter_id,progress) VALUES('u1','ch1',0.01)");
 books=await list(env);
 assert.equal(books[0].state,"reading");
 env.DB.sql.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES('u1','ch2',1,CURRENT_TIMESTAMP)");
 books=await list(env);
 assert.equal(books[0].state,"reading","opening and finishing last chapter alone is not finishing whole book");
 env.DB.sql.exec("UPDATE reading_progress SET progress=1,completed_at=CURRENT_TIMESTAMP WHERE chapter_id='ch1'");
 books=await list(env);
 assert.equal(books[0].state,"finished");
 env.DB.sql.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES('ch4','book1',3,'New Part','{}','2026-01-01 00:00:00')");
 books=await list(env);
 assert.equal(books[0].state,"reading","new published chapter reopens unfinished state");
 const remove=await handleMyBookshelf(req("PUT","book1",{bookmarked:false}),env,user);
 assert.equal(remove.status,200);
 books=await list(env);
 assert.equal(books[0].bookmarked,false);
 assert.equal(books[0].state,"reading","unbookmark cannot erase reading history");
 assert.equal(env.DB.sql.prepare("SELECT COUNT(*) AS n FROM reading_progress WHERE user_id='u1'").get().n,2);
});
test("V1.1 personal shelf cannot edit another user's bookmarks or draft books",async()=>{
 const env={DB:new DB()};
 assert.equal((await handleMyBookshelf(req(),env,null)).status,401);
 assert.equal((await handleMyBookshelf(req("PUT","draft1",{bookmarked:true}),env,user)).status,404);
 assert.equal((await handleMyBookshelf(req("PUT","missing",{bookmarked:true}),env,user)).status,404);
 assert.equal((await handleMyBookshelf(req("PUT","book1",{bookmarked:"true"}),env,user)).status,400);
 assert.equal((await handleMyBookshelf(req("PUT","book1",{bookmarked:true,grant:true}),env,user)).status,400);
 assert.equal((await handleMyBookshelf(req("PUT","book1",{bookmarked:true}),env,user)).status,200);
 assert.deepEqual((await (await handleMyBookshelf(req(),env,{id:"u2"})).json()).books,[]);
});
test("V1.1 legacy test D1 without migration fails closed",async()=>{
 const env={DB:new DB(false)};
 assert.equal(await bookshelfSchemaReady(env),false);
 assert.equal((await handleMyBookshelf(req(),env,user)).status,503);
});
test("V1.1 personal bookshelf UI includes dynamic states and independent toggle controls",()=>{
 const js=file("public/app.js"),html=file("public/index.html");
 assert.match(html,/id="myBookshelf"/);
 assert.match(js,/personalShelfFilter='reading'/);
 assert.match(js,/function renderPersonalBookshelf/);
 assert.match(js,/\/api\/me\/bookshelf/);
 assert.match(js,/data-cloud-bookmark/);
 assert.match(js,/data-my-shelf-save/);
 assert.match(js,/book\.state==='finished'/);
 assert.match(js,/window\.MiaowuOnboarding\?\.bookmarkTapped\(\)/);
});
