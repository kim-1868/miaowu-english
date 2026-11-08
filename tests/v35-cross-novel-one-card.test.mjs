import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleLearningState} from "../src/reading-library.js";
import {annotateStudyWords,studyKey,uniqueStudyRows} from "../src/study-identity.js";

const schema=readFileSync(new URL("../db/001_schema.sql",import.meta.url),"utf8");
function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES('student','student','x','salt')").run();
  db.prepare("INSERT INTO categories(id,slug,title) VALUES('cet4','cet4','四级')").run();
  db.prepare("INSERT INTO entitlements(user_id,category_id) VALUES('student','cet4')").run();
  for(const [book,word,pos,gloss] of [
    ["a","record-a","n.","记录；档案"],
    ["b","record-b","n.","记录"],
    ["c","record-c","v.","录制"],
    ["d","record-d","n.","记录；文档"]
  ]){
    db.prepare("INSERT INTO books(id,category_id,title,status) VALUES(?,'cet4',?,'published')").run(book,book);
    db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES(?,?,1,'第1章','{}',CURRENT_TIMESTAMP)").run("ch-"+book,book);
    db.prepare("INSERT INTO words(id,headword,part_of_speech,meaning_zh,phonetic_uk) VALUES(?,'record',?,?,?)")
      .run(word,pos,gloss,"/record/");
    db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)")
      .run("ch-"+book,word,"story "+book,"p0:s0");
  }
  const DB={
    prepare(q){return {bind(...params){const st=db.prepare(q);return {
      first:async()=>st.get(...params)||null, all:async()=>({results:st.all(...params)}),
      run:async()=>st.run(...params)
    }}}},
    async batch(statements){db.exec("BEGIN");try{
      const out=[];for(const x of statements)out.push(await x.run());
      db.exec("COMMIT");return out;
    }catch(error){db.exec("ROLLBACK");throw error}}
  };
  const env={DB};
  async function call(path,method="GET",payload=null){
    const req=new Request("https://site.example"+path,{method,
      headers:payload?{"content-type":"application/json"}:{},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    const res=await handleLearningState(req,env,new URL(req.url).pathname,{id:"student"});
    return {status:res.status,data:await res.json()};
  }
  return {db,env,call};
}

test("V35: same meaning in A and B shares one remembered state; different POS remains a new sense",async()=>{
  const f=fixture();
  try{
    assert.equal(studyKey({headword:"record",part_of_speech:"n.",meaning_zh:"记录；档案"}),
      studyKey({headword:"Record",part_of_speech:"n.",meaning_zh:"记录"}));
    assert.notEqual(studyKey({headword:"record",part_of_speech:"v.",meaning_zh:"录制"}),
      studyKey({headword:"record",part_of_speech:"n.",meaning_zh:"记录"}));
    const a=await f.call("/api/me/quick-review","POST",{
      chapterId:"ch-a",wordId:"record-a",remembered:true
    });
    assert.equal(a.status,200,JSON.stringify(a.data));
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM review_events").get().n,1);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM user_words").get().n,3,
      "A, B, and D are the same sense; different verb C stays separate");
    const b=await annotateStudyWords(f.env,"student",[
      {word_id:"record-b",headword:"record",part_of_speech:"n.",meaning_zh:"记录"}
    ]);
    assert.equal(b[0].study_seen,true);
    assert.equal(b[0].study_status,"learning");
    assert.equal(b[0].study_bookmarked,false);
    const other=await annotateStudyWords(f.env,"student",[
      {word_id:"record-c",headword:"record",part_of_speech:"v.",meaning_zh:"录制"}
    ]);
    assert.equal(other[0].study_seen,false);
    const saved=await f.call("/api/me/words/record-b","PUT",{bookmarked:true,status:"mastered"});
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM user_words WHERE status='mastered'").get().n,3);
    const list=await f.call("/api/me/words");
    assert.equal(list.status,200);
    assert.equal(list.data.words.length,1,"only one bookmarked card across books");
    assert.equal(list.data.words[0].status,"mastered");
    // V1.1: mastered cards are excluded from new-word learning; no opt-in re-study button.
    const flash=await f.call("/api/me/flashcards?scope=mastered");
    assert.equal(flash.status,200);
    assert.equal(flash.data.total,1,"one opt-in mastered flashcard across A and B");
    assert.equal((await f.call("/api/me/flashcards?scope=all")).data.total,0,
      "mastered sense is not in ordinary learning pool");
    const due=await f.call("/api/me/flashcards?scope=due");
    assert.equal(due.data.total,0,"no multiple due tasks after mastered");
    const another=await f.call("/api/me/words/record-c","PUT",{bookmarked:true,status:"learning"});
    assert.equal(another.status,200);
    assert.equal((await f.call("/api/me/words")).data.words.length,2,
      "genuinely new verb meaning remains a separate study card");
  }finally{f.db.close()}
});

test("V35: future novel alias inherits existing learning without republishing the old chapter",async()=>{
  const f=fixture();try{
    await f.call("/api/me/quick-review","POST",{wordId:"record-a",chapterId:"ch-a",remembered:true});
    f.db.prepare("INSERT INTO books(id,category_id,title,status) VALUES('future','cet4','未来小说','published')").run();
    f.db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES('ch-future','future',1,'第1章','{}',CURRENT_TIMESTAMP)").run();
    f.db.prepare("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES('future-alias','record','n.','记录')").run();
    f.db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('ch-future','future-alias','future context','p0:s0')").run();
    const row=(await annotateStudyWords(f.env,"student",[
      {word_id:"future-alias",headword:"record",part_of_speech:"n.",meaning_zh:"记录"}
    ]))[0];
    assert.equal(row.study_seen,true,"newly published alias should not become a new card");
    assert.equal(row.study_status,"learning");
  }finally{f.db.close()}
});

test("V35: distinguish same spelling from same teaching sense and dedupe before pagination",()=>{
 const values=[
  {word_id:"a",headword:"charge",part_of_speech:"v.",meaning_zh:"收费"},
  {word_id:"b",headword:"charge",part_of_speech:"v.",meaning_zh:"收费；收取"},
  {word_id:"c",headword:"charge",part_of_speech:"v.",meaning_zh:"指控"},
  {word_id:"d",headword:"charge",part_of_speech:"n.",meaning_zh:"费用"}
 ];
 assert.equal(uniqueStudyRows(values).length,3);
 assert.equal(uniqueStudyRows(values).filter(w=>w.headword==="charge").length,3);
});

test("V35: reader new-word counter reflects learned senses instead of only bookmarked rows",()=>{
 const app=readFileSync(new URL("../public/app.js",import.meta.url),"utf8");
 const chapter=readFileSync(new URL("../public/chapter-words.js",import.meta.url),"utf8");
 assert.match(app,/unseenSenses=new Set/);
 assert.match(app,/filter\(w=>!w\.study_seen\)/);
 assert.match(chapter,/words\.filter\(w=>!w\.study_seen\)/);
  assert.doesNotMatch(chapter,/自愿复习已学词|startLearnedReview/);
  assert.match(chapter,/学习本章新词/);
});
