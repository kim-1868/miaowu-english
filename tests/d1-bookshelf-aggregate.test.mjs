import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleMyBookshelf} from "../src/my-bookshelf.js";

const schema=name=>readFileSync(new URL("../db/"+name,import.meta.url),"utf8");
function setup(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(schema("001_schema.sql"));
 sqlite.exec(schema("010_v11_my_bookshelf.sql"));
 const captured=[];
 const DB={prepare(query){
  captured.push(query);
  return {bind(...args){
   const statement=sqlite.prepare(query);
   return {
    async first(){return statement.get(...args)||null;},
    async all(){return {results:statement.all(...args)};},
    async run(){return {meta:statement.run(...args)};}
   };
  }};
 }};
 for(const id of ["u1","u2"]){
  sqlite.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
   .run(id,id,"hash","salt");
 }
 sqlite.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES(?,?,?,1)")
  .run("c1","cet4","CET-4");
 for(const id of ["a","b","hidden"]){
  sqlite.prepare("INSERT INTO books(id,category_id,title,description,status) VALUES(?,?,?,?,?)")
   .run(id,"c1",id,"",id==="hidden"?"draft":"published");
 }
 for(const [id,book,no,visible] of [["a1","a",1,true],["a2","a",2,true],
   ["a3","a",3,false],["b1","b",1,true],["h1","hidden",1,true]]){
  sqlite.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES(?,?,?,?,?,?)")
   .run(id,book,no,id,"{}",visible?"2026-01-01":null);
 }
 sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at,updated_at) VALUES(?,?,?,?,?)")
  .run("u1","a1",1,"2026-11-14","2026-11-14 11:00:00");
 sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress,updated_at) VALUES(?,?,?,?)")
  .run("u1","a2",0.3,"2026-11-14 12:00:00");
 sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress,updated_at) VALUES(?,?,?,?)")
  .run("u1","a3",0.2,"2026-11-14 13:00:00");
 sqlite.prepare("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at,updated_at) VALUES(?,?,?,?,?)")
  .run("u2","b1",1,"2026-11-14","2026-11-14 14:00:00");
 sqlite.prepare("INSERT INTO user_bookmarks(user_id,book_id) VALUES(?,?)").run("u1","b");
 return {sqlite,DB,captured};
}

test("D1 bookshelf: single user-scoped progress aggregate, stable summary and no cross-user leakage",async()=>{
 const {sqlite,DB,captured}=setup();
 try{
  const response=await handleMyBookshelf(new Request("https://test.local/api/me/bookshelf"),{DB},{id:"u1"});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.books.length,1);
  assert.equal(data.books[0].book_id,"b");
  assert.equal(data.books[0].state,"want");
  assert.equal(data.books[0].chapter_count,1);
  assert.equal(data.recent.length,1);
  assert.equal(data.recent[0].book_id,"a");
  assert.equal(data.recent[0].chapter_count,2);
  assert.equal(data.recent[0].started_chapters,2);
  assert.equal(data.recent[0].completed_chapters,1);
  assert.equal(data.recent[0].last_chapter_id,"a2");
  assert.equal(data.recent[0].state,"reading");
  assert.equal(captured.length,2);
  assert.match(captured[1],/WITH valid_progress AS/);
  assert.match(captured[1],/WHERE rp.user_id=\?/);
  const other=await handleMyBookshelf(new Request("https://test.local/api/me/bookshelf"),{DB},{id:"u2"});
  const otherData=await other.json();
  assert.equal(otherData.books.length,0);
  assert.equal(otherData.recent.length,1);
  assert.equal(otherData.recent[0].book_id,"b");
  assert.equal(otherData.recent[0].state,"finished");
 }finally{sqlite.close();}
});
