import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleExampleWordLookup} from "../src/example-word-lookup.js";
import {internalDictionaryLookup,isExampleToken} from "../src/internal-dictionary.js";
const src=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function setup({supplemental=true}={}){
 const db=new DatabaseSync(":memory:");
 db.exec(src("db/001_schema.sql"));
 db.exec(src("db/003_public_categories.sql"));
 if(supplemental){db.exec(src("db/012_v11_supplemental_dictionary.sql"));db.exec(src("db/013_v11_supplemental_starter.sql"))}
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES ('u1','first','hash','salt'),('u2','second','hash','salt')");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES ('b4','cet4','Open 4','published'),('b6','cet6','Paid 6','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES"+
  "('ch4','b4',1,'Chapter 4','{}',0,'2026-01-01 00:00:00'),"+
  "('ch6','b6',1,'Chapter 6','{}',0,'2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh,example_en) VALUES"+
  "('w4','sustain','v.','维持','She suddenly walked through the door.'),"+
  "('w6','imply','v.','暗示','She was suddenly surprised.'),"+
  "('w5','door','n.','门','Open the door.')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('ch4','w4','They sustain it.','a'),('ch6','w6','It was implied.','b'),"+
  "('ch4','w5','Open the door.','c')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES ('u1','cet4')");
 const env={DB:{prepare(query){return {bind(...args){const stmt=db.prepare(query);return {
  async first(){return stmt.get(...args)||null},
  async all(){return {results:stmt.all(...args)}},
  async run(){return stmt.run(...args)}
 }}}}}};
 const req=(word,origin=null)=>new Request("https://miaowu.test/api/lexicon/lookup?word="+
  encodeURIComponent(word)+(origin?"&originWordId="+encodeURIComponent(origin):""));
 const lookup=async(word,origin,uid="u1")=>{
  const response=await handleExampleWordLookup(req(word,origin),env,uid?{id:uid}:null);
  return {status:response.status,...await response.json()};
 };
 return {db,env,lookup};
}
test("V1.1 dictionary is isolated from learning state and safe to seed twice",async()=>{
 const x=setup();
 try{
  x.db.exec(src("db/012_v11_supplemental_dictionary.sql"));
  x.db.exec(src("db/013_v11_supplemental_starter.sql"));
  assert.ok(x.db.prepare("SELECT COUNT(*) AS n FROM supplemental_dictionary").get().n>=100);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM user_words").get().n,0);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM review_events").get().n,0);
  assert.equal(x.db.prepare("SELECT name FROM sqlite_master WHERE name='user_study_schedules'").get(),undefined);
 }finally{x.db.close()}
});
test("V1.1 clicking a missing word in an authorized example returns labeled translation without creating a card",async()=>{
 const x=setup();
 try{
  const data=await x.lookup("suddenly","w4");
  assert.equal(data.status,200);
  assert.equal(data.entries.length,0);
  assert.equal(data.fallback?.headword,"suddenly");
  assert.match(data.fallback?.meaning||"",/突然/);
  assert.equal(data.fallback.referenceOnly,true);
  assert.equal(data.fallback.source,"curated-starter");
  assert.equal(data.fallback.wordId,undefined,"supplemental definitions cannot be passed as paid word IDs");
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM user_words").get().n,0);
 }finally{x.db.close()}
});
test("V1.1 dictionary cannot be used to look up arbitrary words, locked example text or another user's origin",async()=>{
 const x=setup();
 try{
  assert.equal((await x.lookup("suddenly",null)).fallback,null);
  assert.equal((await x.lookup("suddenly","w6")).fallback,null);
  assert.equal((await x.lookup("the","w4")).fallback,null,"not in the actual authorized example");
  assert.equal((await x.lookup("suddenly","w4","u2")).fallback,null);
  assert.equal((await x.lookup("suddenly","not-allowed")).fallback,null);
  assert.equal((await x.lookup("through","w4")).fallback?.headword,"through");
  assert.equal((await x.lookup("<script>","w4")).status,400);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM entitlements").get().n,1);
 }finally{x.db.close()}
});
test("V1.1 real published vocabulary remains authoritative, supplemental dictionary never overrides it",async()=>{
 const x=setup();
 try{
  const data=await x.lookup("door","w4");
  assert.equal(data.entries.length,1);
  assert.equal(data.entries[0].meaning,"门");
  assert.equal(data.fallback,null);
  assert.equal(data.entries[0].wordId,"w5");
 }finally{x.db.close()}
});
test("V1.1 missing supplemental table degrades safely, not as a 500",async()=>{
 const x=setup({supplemental:false});
 try{
  const data=await x.lookup("suddenly","w4");
  assert.equal(data.status,200);
  assert.deepEqual(data.entries,[]);
  assert.equal(data.fallback,null);
 }finally{x.db.close()}
});
test("V1.1 dictionary token checker refuses substrings, unsafe words and oversized examples",()=>{
 assert.equal(isExampleToken("He walked through the door.","through"),true);
 assert.equal(isExampleToken("He walked through the door.","rough"),false);
 assert.equal(isExampleToken("Don't leave the room.","don't"),true);
 assert.equal(isExampleToken("<script>hello</script>","<script>"),false);
 assert.equal(isExampleToken("a".repeat(3001),"a"),false);
});
test("V1.1 frontend uses a source word ID and labels dictionary-only words",()=>{
 const js=src("public/app.js");
 assert.match(js,/data-example-origin/);
 assert.match(js,/originWordId=/);
 assert.match(js,/referenceOnly/);
 assert.match(js,/内部词典补充 · 仅供理解例句，不计入学习词卡/);
});
