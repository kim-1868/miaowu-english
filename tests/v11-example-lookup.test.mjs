import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {handleExampleWordLookup} from "../src/example-word-lookup.js";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const url="https://miaowu.test/api/lexicon/lookup";
class DB{
 constructor(){
  this.db=new DatabaseSync(":memory:");
  this.db.exec(read("db/001_schema.sql"));
  this.db.exec(read("db/003_public_categories.sql"));
  this.db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES('u1','first','h','s'),('u2','second','h','s')");
  this.db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
    "('book1','cet4','Preview','published'),('book2','cet4','Paid','published'),"+
    "('book3','cet6','Paid CET6','published'),('draft1','cet4','Unpublished','draft')");
  this.db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES"+
    "('ch1','book1',1,'Preview','{}',1,'2026-01-01 00:00:00'),"+
    "('ch2','book2',1,'Paid','{}',0,'2026-01-01 00:00:00'),"+
    "('ch3','book3',1,'CET6','{}',0,'2026-01-01 00:00:00'),"+
    "('ch4','draft1',1,'Draft','{}',1,'2026-01-01 00:00:00')");
  this.db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
    "('w1','sample','n.','样本'),('w2','evidence','n.','证据'),"+
    "('w3','private','adj.','私人'),('w4','hidden','adj.','隐藏'),"+
    "('w5','evidence','v.','提供证据')");
  this.db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_anchor) VALUES"+
    "('ch1','w1','a'),('ch2','w2','b'),('ch3','w3','c'),('ch4','w4','d'),('ch2','w5','e')");
 }
 prepare(q){const db=this.db;return {bind(...params){const s=db.prepare(q);return {
  async all(){return {results:s.all(...params)}},async first(){return s.get(...params)||null},
  async run(){return {meta:s.run(...params)}}
 }}}}
}
const req=(q,method="GET")=>new Request(url+"?word="+encodeURIComponent(q),{method});
const fetchEntries=async(db,term,user)=>(
  await (await handleExampleWordLookup(req(term),{DB:db},user)).json()
).entries;
test("V1.1 examples only reveal vocabulary from accessible published chapters",async()=>{
 const db=new DB();
 assert.deepEqual((await fetchEntries(db,"sample",null)).map(w=>w.meaning),["样本"]);
 assert.deepEqual(await fetchEntries(db,"evidence",null),[]);
 assert.deepEqual(await fetchEntries(db,"private",null),[]);
 assert.deepEqual(await fetchEntries(db,"hidden",null),[]);
 db.db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','cet4')");
 const owned=await fetchEntries(db,"evidence",{id:"u1"});
 assert.equal(owned.length,2,"separate meaning/part-of-speech entries remain separate");
 assert.deepEqual(owned.map(w=>w.wordId),["w2","w5"]);
 assert.deepEqual(await fetchEntries(db,"evidence",{id:"u2"}),[]);
 assert.deepEqual(await fetchEntries(db,"private",{id:"u1"}),[],"CET4 access cannot reveal CET6 words");
});
test("V1.1 example word lookup saves status by user only, not through GET",async()=>{
 const db=new DB();
 db.db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','cet4')");
 db.db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked) VALUES('u1','w2','mastered',1)");
 const own=await fetchEntries(db,"evidence",{id:"u1"});
 assert.equal(own.find(w=>w.wordId==="w2").bookmarked,true);
 assert.equal(own.find(w=>w.wordId==="w2").status,"mastered");
 assert.equal(db.db.prepare("SELECT count(*) AS n FROM review_events").get().n,0,"looking up a word is not a successful review");
 assert.equal(db.db.prepare("SELECT count(*) AS n FROM user_words").get().n,1,"lookup cannot auto-save");
});
test("V1.1 word lookup validates term and method",async()=>{
 const db=new DB(), env={DB:db};
 assert.equal((await handleExampleWordLookup(req("<script>"),env,null)).status,400);
 assert.equal((await handleExampleWordLookup(req("sample","POST"),env,null)).status,405);
 assert.equal((await handleExampleWordLookup(req("1234"),env,null)).status,400);
});
test("V1.1 example UI is clickable, uses one card and hides incomplete collocations",()=>{
 const html=read("public/index.html");
 const js=read("public/app.js");
 const css=read("public/v11-wordbook.css");
 assert.match(html,/id="exampleWordLookup"/);
 assert.match(html,/我的记忆生词本/);
 assert.doesNotMatch(html,/记忆藏书票/);
 assert.match(js,/function renderExampleWords\(value\)/);
 assert.match(js,/data-example-word/);
 assert.match(js,/function showExampleLookup\(button\)/);
 assert.match(js,/if\(\$\('wordPop'\)\.classList\.contains\('on'\)\)closeWord\(\)/);
 assert.match(js,/\/api\/lexicon\/lookup\?word=/);
 assert.match(js,/data-lookup-save/);
 assert.match(js,/serverRequest\('\/api\/me\/words\//);
 assert.match(js,/w\.example_en\?'<div class="word-extra"/);
 assert.match(js,/pairs\.length\?'<div class="word-extra"/);
 assert.doesNotMatch(js,/暂无搭配/);
 assert.match(js,/wordExampleSpeak/);
 assert.match(css,/\.v11-example-lookup\[hidden\]/);
 assert.doesNotThrow(()=>new Script(js,{filename:"app.js"}));
});
