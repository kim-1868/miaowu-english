import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import {randomUUID} from "node:crypto";
import {handleLearningState} from "../src/reading-library.js";
import {PRODUCTION_ASSET_ALLOWLIST,buildProductionAssets} from "../scripts/build-production-assets.mjs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const schema=read("../db/001_schema.sql");
const user={id:"learner-one",username:"learner_one"};

function createFixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
    .run(user.id,user.username,"hash","salt");
  db.prepare("INSERT INTO users(id,username,password_hash,password_salt) VALUES(?,?,?,?)")
    .run("learner-two","learner_two","hash","salt");
  for(const [id,slug] of [["cet4","cet4"],["cet6","cet6"]])
    db.prepare("INSERT INTO categories(id,slug,title) VALUES(?,?,?)").run(id,slug,slug);
  for(const [id,cat,status] of [["accessible","cet4","published"],["premium","cet6","published"],["withdrawn","cet4","draft"]])
    db.prepare("INSERT INTO books(id,category_id,title,status) VALUES(?,?,?,?)")
      .run(id,cat,id,status);
  for(const [id,book,preview] of [["ch-one","accessible",0],["ch-locked","premium",0],["ch-draft","withdrawn",0]])
    db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES(?,?,1,'第一章','{}',?,CURRENT_TIMESTAMP)")
      .run(id,book,preview);
  db.prepare("INSERT INTO entitlements(user_id,category_id) VALUES(?,?)").run(user.id,"cet4");
  for(const [id,headword,chapter] of [["word-a","evidence","ch-one"],["word-b","promise","ch-one"],["word-c","restricted","ch-locked"],["word-d","unpublished","ch-draft"]]){
    db.prepare("INSERT INTO words(id,headword,meaning_zh,phonetic_uk,example_en,collocations_json) VALUES(?,?,?,?,?,?)")
      .run(id,headword,"中文释义","/test/","Meaningful example.","[]");
    db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES(?,?,?,?)")
      .run(chapter,id,"这是小说中的 "+headword,"p0:s0");
    db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at,last_seen_at) VALUES(?,?,'learning',1,datetime('now','-1 day'),CURRENT_TIMESTAMP)")
      .run(user.id,id);
  }
  db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES(?,?,'learning',1,datetime('now','-1 day'))")
    .run("learner-two","word-a");
  const adapter={
    prepare(query){
      return {
        bind(...args){
          const statement=db.prepare(query);
          return {
            async first(){return statement.get(...args)||null},
            async all(){return {results:statement.all(...args)}},
            async run(){return statement.run(...args)}
          };
        }
      };
    },
    async batch(stmts){
      db.exec("BEGIN");
      try{const out=[];for(const stmt of stmts)out.push(await stmt.run());db.exec("COMMIT");return out}
      catch(e){db.exec("ROLLBACK");throw e}
    }
  };
  const call=async(path,method="GET",body=null,auth=user)=>{
    const req=new Request("https://miaowu.example"+path,{
      method,headers:body?{"content-type":"application/json"}:{},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const res=await handleLearningState(req,{DB:adapter},new URL(req.url).pathname,auth);
    return {status:res.status,body:await res.json()};
  };
  return {db,call};
}

test("S157: bookplate pools only contain purchased, still-published and bookmarked words",async()=>{
  const {db,call}=createFixture();
  try{
    const pool=await call("/api/me/flashcards?scope=due&page=1&size=10");
    assert.equal(pool.status,200);
    assert.deepEqual(pool.body.words.map(x=>x.word_id),["word-a","word-b"]);
    assert.equal(pool.body.total,2);
    assert.equal((await call("/api/me/words")).body.flashDue,2);
    for(const card of pool.body.words){
      assert.ok(!("chapter_id" in card),"practice cards must not bind to a chapter");
      assert.ok(!("book_title" in card),"practice cards must not bind to a novel");
      assert.ok(!("context_sentence" in card),"practice cards must not carry novel excerpts");
    }
    assert.ok(pool.body.words[0].example_en,"generic dictionary examples remain available");
    assert.equal((await call("/api/me/flashcards?scope=invalid")).status,400);
    assert.equal((await call("/api/me/flashcards?page=-1")).status,400);
    assert.equal((await call("/api/me/flashcards?size=1000")).status,400);
    assert.equal((await call("/api/me/flashcards","GET",null,null)).status,401);
  }finally{db.close()}
});

test("S158: a word appearing in multiple novels remains a single sourced-neutral practice card",async()=>{
  const {db,call}=createFixture();
  try{
    db.prepare("INSERT INTO books(id,category_id,title,status) VALUES('another-story','cet4','第二本小说','published')").run();
    db.prepare("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,is_preview,published_at) VALUES('another-chapter','another-story',1,'第一章','{}',0,CURRENT_TIMESTAMP)").run();
    db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('another-chapter','word-a','完全不同的小说原句','p9:s0')").run();
    const response=await call("/api/me/flashcards?scope=all&page=1&size=10");
    assert.equal(response.status,200);
    assert.equal(response.body.total,2,"one saved word ID must count once despite multiple novels");
    assert.equal(response.body.words.filter(x=>x.word_id==="word-a").length,1);
    assert.equal(response.body.words[0].example_en,"Meaningful example.");
    assert.ok(response.body.words.every(x=>!("book_title" in x)&&!("chapter_id" in x)&&!("context_sentence" in x)));
  }finally{db.close()}
});

test("S157: flip rating and server-checked spelling save cloud events without erasing bookmarks or mastery",async()=>{
  const {db,call}=createFixture();
  try{
    const req1=randomUUID();
    const accepted=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-a",mode:"flip",judgment:"known",requestId:req1
    });
    assert.equal(accepted.status,200,JSON.stringify(accepted.body));
    assert.equal(accepted.body.correct,true);
    assert.equal(accepted.body.nextReviewDays,1);
    assert.equal(db.prepare("SELECT bookmarked,status,due_at FROM user_words WHERE user_id=? AND word_id='word-a'").get(user.id).bookmarked,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM review_events WHERE game_type='bookplate-flip'").get().n,1);
    const repeated=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-a",mode:"flip",judgment:"known",requestId:req1
    });
    assert.equal(repeated.body.alreadyApplied,true);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
    assert.equal((await call("/api/me/flashcards?scope=due")).body.total,1);
    assert.equal((await call("/api/me/words")).body.flashDue,1);
    const req2=randomUUID();
    const guess=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-b",mode:"spell",answer:" PROMISE ",requestId:req2
    });
    assert.equal(guess.status,200);
    assert.equal(guess.body.correct,true);
    assert.equal(guess.body.expected,"promise");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM review_events WHERE game_type='bookplate-spell' AND result='correct'").get().n,1);
    const miss=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-b",mode:"spell",answer:"wrong",requestId:randomUUID()
    });
    assert.equal(miss.status,200);
    assert.equal(miss.body.correct,false);
    assert.equal(db.prepare("SELECT bookmarked,status FROM user_words WHERE word_id='word-b' AND user_id=?").get(user.id).status,"learning");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM review_events WHERE user_id='learner-two'").get().n,0);
    assert.equal((await call("/api/me/flashcards/answer","POST",{
      wordId:"word-c",mode:"flip",judgment:"known",requestId:randomUUID()
    })).status,403);
    assert.equal((await call("/api/me/flashcards/answer","POST",{
      wordId:"word-d",mode:"spell",answer:"unpublished",requestId:randomUUID()
    })).status,403);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  }finally{db.close()}
});

test("S157: an existing mastered word stays mastered on correct and returns to study on forgetting",async()=>{
  const {db,call}=createFixture();
  try{
    db.prepare("UPDATE user_words SET status='mastered',due_at=NULL WHERE user_id=? AND word_id='word-a'").run(user.id);
    const kept=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-a",mode:"flip",judgment:"known",requestId:randomUUID()
    });
    assert.equal(kept.body.status,"mastered");
    assert.equal(kept.body.nextReviewDays,null);
    const forgotten=await call("/api/me/flashcards/answer","POST",{
      wordId:"word-a",mode:"flip",judgment:"forgot",requestId:randomUUID()
    });
    assert.equal(forgotten.body.correct,false);
    assert.equal(forgotten.body.status,"learning");
    assert.equal(db.prepare("SELECT bookmarked FROM user_words WHERE word_id='word-a' AND user_id=?").get(user.id).bookmarked,1);
  }finally{db.close()}
});

test("S157: server pages large collections beyond the old 200-word display limit",async()=>{
  const {db,call}=createFixture();
  try{
    for(let n=0;n<215;n++){
      const id="extra-word-"+String(n).padStart(3,"0");
      db.prepare("INSERT INTO words(id,headword,meaning_zh) VALUES(?,?,?)").run(id,"vocab"+n,"释义");
      db.prepare("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES('ch-one',?,?,'p1:s0')")
        .run(id,"这是 "+id);
      db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES(?,?,'learning',1,datetime('now','-1 day'))")
        .run(user.id,id);
    }
    const first=await call("/api/me/flashcards?scope=learning&page=1&size=20");
    const last=await call("/api/me/flashcards?scope=learning&page=11&size=20");
    assert.equal(first.body.total,217);
    const legacy=await call("/api/me/words");
    assert.equal(legacy.body.words.length,200);
    assert.equal(legacy.body.flashDue,217);
    assert.equal(first.body.words.length,20);
    assert.equal(last.body.words.length,17);
    assert.equal(first.body.pageSize,20);
    assert.ok(first.body.hasMore);
    assert.equal(last.body.hasMore,false);
    assert.ok(!first.body.words.some(x=>last.body.words.some(y=>x.word_id===y.word_id)));
  }finally{db.close()}
});

test("S157: customer learning screen is reachable and original bookplate grid and other game modes remain",()=>{
  const html=read("../public/index.html"),app=read("../public/app.js"),
    ui=read("../public/flashcards.js"),css=read("../public/flashcards.css"),
    worker=read("../src/worker.js");
  new Script(ui,{filename:"flashcards.js"});
  new Script(app,{filename:"app.js"});
  assert.ok(html.includes('id="flashcardTrainer"'));
  assert.ok(html.includes('id="vocabGrid"'));
  assert.ok(html.includes('src="/flashcards.js?v=20261105-v31-word-only"'));
  assert.ok(html.includes('href="/flashcards.css?v=20261105-v31-word-only"'));
  assert.ok(html.includes('src="/app.js?v=20261105-v30-flashcards"'));
  assert.ok(app.includes("window.MiaowuFlashcards?.configure"));
  assert.ok(app.includes("globalThis.MiaowuFlashcards?.render"));
  assert.ok(!ui.includes("来自你的小说记忆"));
  assert.ok(!ui.includes("w.book_title"));
  assert.ok(!ui.includes("w.context_sentence"));
  assert.ok(ui.includes("常用例句"));
  assert.ok(!css.includes(".flash-context"));
  assert.ok(css.includes(".flash-example"));
  assert.ok(!read("../src/reading-library.js").includes("flashSource("));
  assert.ok(ui.includes('"/api/me/flashcards/answer"'));
  assert.ok(ui.includes('crypto.randomUUID()'));
  assert.ok(ui.includes('local.queue.splice(later,0,{word:w,retry:true,submitPayload:null})'));
  assert.ok(ui.includes('retryCounts:new Map()'));
  assert.ok(ui.includes('if(times<2)'));
  assert.ok(ui.includes('roundSize=20'));
  assert.ok(!ui.includes('setTimeout(()=>{if(local===round'));
  assert.ok(ui.includes('下一张 →'));
  assert.ok(ui.includes("inputmode=\"text\""));
  assert.ok(ui.includes("autocomplete=\"off\""));
  assert.ok(ui.includes("每张词卡只在提交成功后推进"));
  assert.ok(ui.includes('last.scope==="due"?1:last.page+1'));
  assert.ok(ui.includes("确定结束本轮吗"));
  assert.ok(worker.includes('path === "/api/me/flashcards"'));
  assert.ok(css.includes("@media(max-width:620px)"));
  assert.ok(css.includes('html[data-theme="dark"] .flash-paper'));
  assert.ok(css.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes("flashcards.js"));
  assert.ok(PRODUCTION_ASSET_ALLOWLIST.includes("flashcards.css"));
  const build=buildProductionAssets();
  assert.equal(build.assets.length,46);
});
