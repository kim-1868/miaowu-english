import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {annotateStudyWords} from "../src/study-identity.js";

const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
function fixture({canonical=true}={}){
 const db=new DatabaseSync(":memory:");
 db.exec(read("db/001_schema.sql"));
 if(canonical)db.exec(read("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES "+
   "('u1','reader-one','hashed','salt'),('u2','reader-two','hashed','salt')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES "+
   "('wa','record','n.','记录；档案'),"+
   "('wb','record','n.','记录'),"+
   "('wc','record','v.','录制')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES "+
   "('u1','wa','mastered',1,NULL),"+
   "('u1','wb','learning',1,'2026-01-01 00:00:00')");
 const queries=[];
 const env={DB:{prepare(sql){
  return {bind(...args){
   const st=db.prepare(sql);queries.push({sql,args});
   return {
    first:async()=>st.get(...args)||null,
    all:async()=>({results:st.all(...args)}),
    run:async()=>st.run(...args)
   };
  }};
 }}};
 const words=[
  {word_id:"wa",headword:"record",part_of_speech:"n.",meaning_zh:"记录；档案"},
  {word_id:"wb",headword:"record",part_of_speech:"n.",meaning_zh:"记录"},
  {word_id:"wc",headword:"record",part_of_speech:"v.",meaning_zh:"录制"}
 ];
 return {db,env,queries,words};
}
test("P5 real SQLite: explicit unmaster and unbookmark supersede older mastered/bookmarked aliases in chapter",async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',0,0)");
  const result=await annotateStudyWords(f.env,"u1",f.words);
  assert.equal(result[0].study_seen,true);
  assert.equal(result[0].study_status,"learning");
  assert.equal(result[0].study_bookmarked,false);
  assert.equal(result[1].study_status,"learning");
  assert.equal(result[1].study_bookmarked,false);
  assert.equal(result[2].study_seen,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_words WHERE status='mastered'").get().n,1,
   "reader annotation must not overwrite historical rows");
  assert.ok(f.queries.some(x=>x.sql.includes("FROM user_study_schedules")));
 }finally{f.db.close()}
});
test("P5 real SQLite: a new book's same sense inherits explicit mastered state even without old alias row",async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',1,1)");
  const [result]=await annotateStudyWords(f.env,"u1",[
   {word_id:"brand-new",headword:"record",part_of_speech:"n.",meaning_zh:"记录"}
  ]);
  assert.equal(result.study_seen,true);
  assert.equal(result.study_status,"mastered");
  assert.equal(result.study_bookmarked,true);
 }finally{f.db.close()}
});
test("P5 real SQLite: canonical state never transfers across users or part-of-speech",async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',0,0)");
  const noun=await annotateStudyWords(f.env,"u1",[f.words[0]]);
  const verb=await annotateStudyWords(f.env,"u1",[f.words[2]]);
  const another=await annotateStudyWords(f.env,"u2",[f.words[0]]);
  const guest=await annotateStudyWords(f.env,null,[f.words[0]]);
  assert.equal(noun[0].study_status,"learning");
  assert.equal(verb[0].study_seen,false);
  assert.equal(another[0].study_seen,false);
  assert.equal(guest[0].study_seen,false);
  assert.ok(another.every(x=>!x.study_bookmarked));
 }finally{f.db.close()}
});
test("P5 real SQLite: legacy schema without schedule table keeps old mastered/bookmarked behavior",async()=>{
 const f=fixture({canonical:false});try{
  const result=await annotateStudyWords(f.env,"u1",[f.words[0],f.words[1]]);
  assert.ok(result.every(x=>x.study_seen&&x.study_status==="mastered"&&x.study_bookmarked));
 }finally{f.db.close()}
});
test("P5 real SQLite: canonical word query is bound in limited batches for long chapters",async()=>{
 const f=fixture();try{
  const insert=f.db.prepare("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES(?,?,?,?)");
  const plan=f.db.prepare("INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES(?,?,1,0)");
  const input=[];
  for(let i=0;i<65;i++){
   const id="new"+i,headword="word"+i,key="sense:"+headword+"|n|含义";
   insert.run(id,headword,"n.","含义");
   plan.run("u1",key);
   input.push({word_id:id,headword,part_of_speech:"n.",meaning_zh:"含义"});
  }
  const results=await annotateStudyWords(f.env,"u1",input);
  assert.equal(results.length,65);
  assert.ok(results.every(x=>x.study_seen&&x.study_status==="mastered"));
  const statements=f.queries.filter(x=>x.sql.includes("FROM user_study_schedules"));
  assert.equal(statements.length,2);
  assert.ok(statements.every(x=>x.args.length<=61));
 }finally{f.db.close()}
});
