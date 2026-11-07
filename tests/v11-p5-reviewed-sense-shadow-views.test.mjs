import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {buildSenseShadow} from "../scripts/v11-shadow-sense-audit.mjs";
import {readLocalSenseSnapshot} from "../scripts/v11-reviewed-sense-impact.mjs";
import {applyReviewedMappingSchema,stageReviewedSenseAliases} from
 "../scripts/v11-stage-reviewed-sense-aliases.mjs";
import {commitLocalReviewedAction,newLocalReviewId} from "../scripts/v11-local-reviewed-writeback.mjs";
import {previewReviewedLearningViews,previewReviewedFeedback} from
 "../scripts/v11-reviewed-sense-shadow-views.mjs";
import {handleLearningState} from "../src/reading-library.js";
import {handleEcho} from "../src/echo-cloud.js";
const read=x=>readFileSync(new URL("../"+x,import.meta.url),"utf8");
const DUE="2026-01-01 00:00:00";
const NOW=new Date("2026-11-07T00:00:00Z");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(read("db/001_schema.sql"));
 db.exec(read("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('u1','private-study-person','test-password-hash','test-salt'),"+
  "('u2','other-private-person','hash-two','salt-two')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES"+
  "('c4','cet4','四级',1),('c6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
  "('ba','c4','Book A','published'),('bb','c4','Book B','published'),"+
  "('bx','c6','Private Locked Book','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('cha','ba',1,'A chapter','{}','2026-01-01 00:00:00'),"+
  "('chb','bb',1,'B chapter','{}','2026-01-01 00:00:00'),"+
  "('chx','bx',1,'Locked chapter','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('wa','record','n.','记录；档案'),"+
  "('wb','record','n.','档案'),"+
  "('wv','record','v.','录制'),"+
  "('wx','sustain','v.','维持')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('cha','wa','Private storyline A: She kept a record.','a'),"+
  "('chb','wb','Private storyline B: The archive record.','a'),"+
  "('chb','wv','Private storyline C: Record a voice message.','b'),"+
  "('chx','wx','Private locked plot: Sustain the story.','a')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','c4')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
  "('u1','cha',1,'2026-10-01 00:00:00')");
 const env={DB:{
  prepare(q){return{bind(...values){const st=db.prepare(q);return{
   first:async()=>st.get(...values)||null,
   all:async()=>({results:st.all(...values)}),
   run:async()=>st.run(...values)
  }}}},
  async batch(stmts){db.exec("BEGIN IMMEDIATE");try{
   const r=[];for(const s of stmts)r.push(await s.run());
   db.exec("COMMIT");return r
  }catch(e){db.exec("ROLLBACK");throw e}}
 }};
 async function call(path){
  const request=new Request("https://miaowu.test"+path);
  const handler=path.includes("/echo/")?handleEcho:handleLearningState;
  const response=await handler(request,env,new URL(request.url).pathname,{id:"u1"});
  return {status:response.status,data:await response.json()};
 }
 const learn=(wordId,status="learning",bookmarked=0,due=DUE,userId="u1")=>
  db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES(?,?,?,?,?)")
   .run(userId,wordId,status,bookmarked,due);
 function approve(){
  const original=buildSenseShadow(readLocalSenseSnapshot(db));
  return {version:1,snapshotFingerprint:original.sourceFingerprint,groups:[{
   status:"approved",senseId:"reviewed:record_n_001",
   wordIds:["wa","wb"],reviewer:"private-reviewer",
   reviewedAt:"2026-11-07",
   evidence:"Both noun context passages were reviewed for matching teaching meaning."
  }]};
 }
 const stage=()=>{
  applyReviewedMappingSchema(db);
  return stageReviewedSenseAliases(db,approve());
 };
 return {db,env,call,learn,approve,stage};
}
const view=(db,reviewed)=>previewReviewedLearningViews(db,"u1",{reviewed,now:NOW});

test("V1.1 P5 unapproved mapping does not alter live API or default shadow study identities",async()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb", "learning",1);
  const before=view(f.db,false);
  assert.equal(before.homeDueCount,2);
  assert.equal(before.storyEchoDue.length,1,"only completed chapters enter Story Echo");
  const onlineBefore=await f.call("/api/me/flashcards?scope=due&size=20");
  assert.equal(onlineBefore.data.total,2);
  f.stage();
  const after=view(f.db,false);
  assert.deepEqual(after,before);
  assert.equal((await f.call("/api/me/flashcards?scope=due&size=20")).data.total,2);
  assert.equal((await f.call("/api/me/echo/stats")).data.due,2);
  assert.notEqual(after.reading.find(w=>w.wordId==="wa").studyKey,
   after.reading.find(w=>w.wordId==="wb").studyKey);
 }finally{f.db.close()}
});
test("V1.1 P5 reviewed opt-in shows one shared noun across home, wordbook, quick cards, listening, Echo and reader",()=>{
 const f=fixture();try{
  f.learn("wa","learning",1);
  f.learn("wb","learning",0);
  f.stage();
  const v=view(f.db,true);
  assert.equal(v.homeDueCount,1);
  assert.equal(v.echoStatsDueCount,1);
  assert.equal(v.wordbook.length,1);
  assert.equal(v.flashcardDue.length,1);
  assert.equal(v.listeningSpellingDue.length,1);
  assert.equal(v.storyEchoDue.length,1);
  assert.equal(v.flashcardDue[0].studyKey,"reviewed:record_n_001");
  assert.deepEqual(v.flashcardDue[0].eligibleAliases,["wa","wb"]);
  assert.equal(v.wordbook[0].bookmarked,true);
  assert.deepEqual(v.reading.filter(w=>["wa","wb"].includes(w.wordId))
   .map(w=>w.studyKey),["reviewed:record_n_001","reviewed:record_n_001"]);
  assert.equal(v.mode,"REVIEWED_SHADOW_ONLY");
  assert.equal(v.onlineEnabled,false);
 }finally{f.db.close()}
});
test("V1.1 P5 mastered in book A suppresses duplicate learning in book B, retains one wordbook entry",()=>{
 const f=fixture();try{
  f.learn("wa","mastered",1,null);
  f.learn("wb","learning",0);
  f.stage();
  const v=view(f.db,true);
  assert.equal(v.homeDueCount,0);
  assert.equal(v.echoStatsDueCount,0);
  assert.equal(v.flashcardDue.length,0);
  assert.equal(v.listeningSpellingDue.length,0);
  assert.equal(v.storyEchoDue.length,0);
  assert.equal(v.wordbook.length,1);
  assert.deepEqual(v.reading.filter(w=>["wa","wb"].includes(w.wordId))
   .map(w=>w.status),["mastered","mastered"]);
 }finally{f.db.close()}
});
test("V1.1 P5 different POS stays independent and inaccessible paid category is excluded",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.learn("wv");f.learn("wx","mastered",1,null);
  f.learn("wa","learning",0,DUE,"u2");
  f.stage();
  const v=view(f.db,true);
  assert.equal(v.homeDueCount,2,"noun and verb have independent due dates");
  assert.equal(v.flashcardDue.length,2);
  assert.equal(v.storyEchoDue.length,1,"only reviewed noun in completed chapter");
  assert.ok(v.reading.some(w=>w.wordId==="wv"&&w.studyKey!=="reviewed:record_n_001"));
  assert.ok(!v.reading.some(w=>w.wordId==="wx"));
  assert.ok(!v.wordbook.some(w=>w.wordId==="wx"));
 }finally{f.db.close()}
});
test("V1.1 P5 actual old SRS decisions apply identically to flip, listening and Story Echo simulated feedback",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  const common={wordId:"wa",reviewed:true,now:NOW};
  const flip=previewReviewedFeedback(f.db,"u1",{...common,mode:"flip",judgment:"known"});
  const spell=previewReviewedFeedback(f.db,"u1",{...common,mode:"spell",answer:"record"});
  const echo=previewReviewedFeedback(f.db,"u1",{...common,mode:"echo",answer:"record",choiceId:"wb"});
  for(const value of [flip,spell,echo]){
   assert.equal(value.correct,true);
   assert.equal(value.studyKey,"reviewed:record_n_001");
   assert.deepEqual(value.affectsVisibleWordIds,["wa","wb"]);
   assert.equal(value.persisted,false);
   assert.equal(value.reviewEventInserted,false);
   assert.equal(value.stageIndex,1);
   assert.equal(value.projectedDueAt,"2026-11-10T00:00:00.000Z");
  }
  const wrong=previewReviewedFeedback(f.db,"u1",{...common,mode:"echo",answer:"record",choiceId:"wv"});
  assert.equal(wrong.correct,false,"same spelling but different POS must not earn a correct result");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
 }finally{f.db.close()}
});
test("V1.1 P5 incomplete chapter forbids Story Echo, but does not deny permitted reading or flashcards",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  const v=view(f.db,true);
  assert.equal(v.homeDueCount,1);
  assert.equal(v.storyEchoDue.length,1);
  assert.throws(()=>previewReviewedFeedback(f.db,"u1",
   {wordId:"wb",mode:"echo",answer:"record",reviewed:true,now:NOW}),
   /REVIEWED_SHADOW_ECHO_CHAPTER_NOT_COMPLETED/);
  assert.ok(v.reading.some(w=>w.wordId==="wb"));
 }finally{f.db.close()}
});
test("V1.1 P5 explicit canonical conflict after staging fails closed, no accidental shared plan",()=>{
 const f=fixture();try{
  f.learn("wa","learning",0);f.learn("wb","learning",0);
  f.stage();
  f.db.exec("INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',2,'2026-11-16 00:00:00',0,0),"+
   "('u1','sense:record|n|档案',1,'2026-11-08 00:00:00',0,0)");
  assert.throws(()=>view(f.db,true),/REVIEWED_SHADOW_CONFLICTING_SCHEDULES/);
  assert.equal(view(f.db,false).homeDueCount,0,"old per-sense schedules still work separately");
 }finally{f.db.close()}
});
test("V1.1 P5 reviewing a book with an expired context snapshot cannot activate stale metadata",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  f.db.exec("UPDATE chapter_words SET context_sentence='Changed private chapter' WHERE word_id='wb'");
  assert.throws(()=>view(f.db,true),/REVIEWED_SHADOW_STALE_STORY_SNAPSHOT/);
  assert.equal(view(f.db,false).homeDueCount,2);
 }finally{f.db.close()}
});
test("V1.1 P5 revoked paid grant or missing reviewer map cannot surface another account's data",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  f.db.exec("INSERT INTO activation_codes(id,code_hash,category_id,status,redeemed_by) VALUES"+
   "('revoked','private-code-digest','c4','revoked','u1')");
  f.db.exec("DELETE FROM entitlements WHERE user_id='u1'");
  f.db.exec("INSERT INTO entitlements(user_id,category_id,source_code_id) VALUES('u1','c4','revoked')");
  const v=view(f.db,true);
  assert.equal(v.reading.length,0);
  assert.equal(v.homeDueCount,0);
  assert.equal(v.wordbook.length,0);
  assert.equal(v.storyEchoDue.length,0);
  assert.throws(()=>previewReviewedFeedback(f.db,"u1",
   {wordId:"wa",mode:"spell",answer:"record",reviewed:true}),
   /REVIEWED_SHADOW_WORD_NOT_ACCESSIBLE/);
  assert.deepEqual(view(f.db,false).reading,[]);
 }finally{f.db.close()}
});
test("V1.1 P5 shadow is strictly read-only and private even when reviewer map is installed",()=>{
 const f=fixture();try{
  f.learn("wa","learning",1);f.learn("wb");f.stage();
  const before={
   study:f.db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),
   progress:f.db.prepare("SELECT * FROM reading_progress").all(),
   events:f.db.prepare("SELECT * FROM review_events").all(),
   mapping:f.db.prepare("SELECT * FROM reviewed_sense_aliases ORDER BY word_id").all()
  };
  f.db.exec("PRAGMA query_only=ON");
  const v=view(f.db,true);
  const fdb=previewReviewedFeedback(f.db,"u1",
   {wordId:"wa",mode:"spell",answer:"record",reviewed:true,now:NOW});
  assert.equal(fdb.persisted,false);
  assert.deepEqual(f.db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),before.study);
  assert.deepEqual(f.db.prepare("SELECT * FROM reading_progress").all(),before.progress);
  assert.deepEqual(f.db.prepare("SELECT * FROM review_events").all(),before.events);
  assert.deepEqual(f.db.prepare("SELECT * FROM reviewed_sense_aliases ORDER BY word_id").all(),before.mapping);
  const output=JSON.stringify({v,fdb});
  for(const secret of ["private-study-person","other-private-person",
   "test-password-hash","Private storyline","private-code-digest"])
   assert.ok(!output.includes(secret),secret);
 }finally{f.db.close()}
});
test("V1.1 P5 this module is never imported by production site routes",()=>{
 const runtime=read("src/worker.js")+read("src/reading-library.js")+
  read("src/echo-cloud.js")+read("src/study-schedule-store.js");
 assert.ok(!runtime.includes("v11-reviewed-sense-shadow-views"));
 assert.ok(!runtime.includes("reviewed_sense_aliases"));
 assert.ok(!runtime.includes("REVIEWED_SENSE_SHADOW"));
 const module=read("scripts/v11-reviewed-sense-shadow-views.mjs").replace(/\/\/[^\n]*/g,"");
 assert.doesNotMatch(module,/child_process|execSync\(|spawn\(|\bfetch\(|CLOUDFLARE_API_TOKEN/);
});

test("P5 writeback: mastering in book A becomes mastered in B and one bookmark entry, no duplicate card",()=>{
 const f=fixture();try{
  f.learn("wa","learning",1);f.learn("wb","learning",0);f.stage();
  const before=view(f.db,true);
  assert.equal(before.homeDueCount,1);
  const result=commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"manual",
   status:"mastered",bookmarked:true,now:NOW});
  assert.equal(result.saved,true);
  assert.equal(result.productionTouched,false);
  const after=view(f.db,true);
  assert.equal(after.homeDueCount,0);
  assert.equal(after.wordbook.length,1);
  assert.equal(after.wordbook[0].status,"mastered");
  assert.equal(after.flashcardDue.length,0);
  assert.equal(after.listeningSpellingDue.length,0);
  assert.equal(after.storyEchoDue.length,0);
  assert.deepEqual(after.reading.filter(x=>["wa","wb"].includes(x.wordId))
    .map(x=>x.status),["mastered","mastered"]);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(DISTINCT word_id) n FROM user_words WHERE user_id='u1'").get().n,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_study_schedules "+
    "WHERE user_id='u1' AND study_key='reviewed:record_n_001'").get().n,1);
 }finally{f.db.close()}
});
test("P5 writeback: explicit unmaster and remove bookmark creates a fresh review without resurrecting old mastery",()=>{
 const f=fixture();try{
  f.learn("wa","learning",1);f.learn("wb");f.stage();
  commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"manual",status:"mastered",bookmarked:true,now:NOW});
  const result=commitLocalReviewedAction(f.db,"u1",{wordId:"wb",mode:"manual",
   status:"learning",bookmarked:false,now:NOW});
  assert.equal(result.bookmarked,false);
  assert.equal(result.mastered,false);
  const projected=view(f.db,true);
  assert.equal(projected.wordbook.length,0);
  assert.equal(projected.homeDueCount,0,"unmastered next due is 1 day later");
  assert.equal(projected.flashcardDue.length,0);
  assert.ok(projected.reading.filter(x=>["wa","wb"].includes(x.wordId))
   .every(x=>x.status==="learning"&&!x.bookmarked));
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_words WHERE "+
    "user_id='u1' AND bookmarked=1").get().n,0);
  const due=f.db.prepare("SELECT due_at FROM user_study_schedules "+
    "WHERE user_id='u1' AND study_key='reviewed:record_n_001'").get().due_at;
  assert.equal(due,"2026-11-08 00:00:00");
 }finally{f.db.close()}
});
test("P5 writeback: quick flip updates legacy and reviewed schedule atomically; spell and Echo see one future review",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  const id=newLocalReviewId();
  const answer=commitLocalReviewedAction(f.db,"u1",{wordId:"wb",mode:"flip",
    requestId:id,judgment:"known",now:NOW});
  assert.equal(answer.correct,true);
  assert.equal(answer.studyKey,"reviewed:record_n_001");
  assert.deepEqual(answer.affectedReviewedAliases,["wa","wb"]);
  const after=view(f.db,true);
  assert.equal(after.homeDueCount,0);
  assert.equal(after.echoStatsDueCount,0);
  assert.equal(after.listeningSpellingDue.length,0);
  assert.equal(after.flashcardDue.length,0);
  assert.equal(answer.dueAt,"2026-11-10T00:00:00.000Z");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
  assert.equal(f.db.prepare("SELECT word_id FROM review_events WHERE id=?").get(id).word_id,"wb");
  const replay=commitLocalReviewedAction(f.db,"u1",{wordId:"wb",mode:"flip",
    requestId:id,judgment:"known",now:NOW});
  assert.equal(replay.alreadyApplied,true);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
 }finally{f.db.close()}
});
test("P5 writeback: Story Echo keeps original completed chapter ID and cannot submit uncompleted chapter",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  assert.throws(()=>commitLocalReviewedAction(f.db,"u1",{wordId:"wb",mode:"echo",
    chapterId:"chb",requestId:newLocalReviewId(),answer:"record",now:NOW}),
    /REVIEWED_SHADOW_ECHO_CHAPTER_NOT_COMPLETED|WRITEBACK_ECHO_REQUIRES_COMPLETED_CHAPTER/);
  const id=newLocalReviewId();
  const saved=commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"echo",
    chapterId:"cha",requestId:id,answer:"record",choiceId:"wb",now:NOW});
  assert.equal(saved.correct,true);
  const event=f.db.prepare("SELECT word_id,chapter_id FROM review_events WHERE id=?").get(id);
  assert.deepEqual({...event},{word_id:"wa",chapter_id:"cha"});
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,1);
 }finally{f.db.close()}
});
test("P5 writeback: invalid same-spelling different-POS Echo choice is marked incorrect, never share verb plan",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.learn("wv");f.stage();
  const outcome=commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"echo",
   chapterId:"cha",requestId:newLocalReviewId(),answer:"record",choiceId:"wv",now:NOW});
  assert.equal(outcome.correct,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM user_study_schedules "+
   "WHERE user_id='u1' AND study_key='sense:record|v|录制'").get().n,0);
  assert.equal(view(f.db,true).flashcardDue.filter(x=>x.wordId==="wv").length,1);
 }finally{f.db.close()}
});
test("P5 writeback: forced mid-transaction failure retains old events, plans, word IDs and progress",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  const before={
    words:f.db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),
    progress:f.db.prepare("SELECT * FROM reading_progress").all(),
    plans:f.db.prepare("SELECT * FROM user_study_schedules").all(),
    events:f.db.prepare("SELECT * FROM review_events").all()
  };
  assert.throws(()=>commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"spell",
   requestId:newLocalReviewId(),answer:"record",now:NOW,failBeforeCommit:true}),
   /WRITEBACK_INJECTED_ROLLBACK/);
  assert.deepEqual(f.db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),before.words);
  assert.deepEqual(f.db.prepare("SELECT * FROM reading_progress").all(),before.progress);
  assert.deepEqual(f.db.prepare("SELECT * FROM user_study_schedules").all(),before.plans);
  assert.deepEqual(f.db.prepare("SELECT * FROM review_events").all(),before.events);
  assert.equal(f.db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 }finally{f.db.close()}
});
test("P5 writeback: withdrawn entitlement and other account must not be able to update reviewed learning",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.learn("wa","learning",0,DUE,"u2");f.stage();
  assert.throws(()=>commitLocalReviewedAction(f.db,"u2",{wordId:"wa",mode:"manual",
   status:"mastered",bookmarked:true,now:NOW}),
   /WRITEBACK_NO_ENTITLEMENT/);
  f.db.exec("DELETE FROM entitlements WHERE user_id='u1'");
  assert.throws(()=>commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"manual",
   status:"mastered",bookmarked:true,now:NOW}),
   /WRITEBACK_NO_ENTITLEMENT/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
 }finally{f.db.close()}
});
test("P5 writeback: changed chapter context and conflicting old schedules refuse writes",()=>{
 const f=fixture();try{
  f.learn("wa");f.learn("wb");f.stage();
  f.db.exec("INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',1,'2026-11-09 00:00:00',0,0),"+
   "('u1','sense:record|n|档案',2,'2026-11-12 00:00:00',0,0)");
  assert.throws(()=>commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"manual",
    status:"mastered",bookmarked:true,now:NOW}),
    /REVIEWED_SHADOW_CONFLICTING_SCHEDULES/);
  f.db.exec("DELETE FROM user_study_schedules");
  f.db.exec("UPDATE chapter_words SET context_sentence='PRIVATE UPDATED CONTEXT' WHERE word_id='wb'");
  assert.throws(()=>commitLocalReviewedAction(f.db,"u1",{wordId:"wa",mode:"manual",
    status:"mastered",bookmarked:true,now:NOW}),
    /REVIEWED_SHADOW_STALE_STORY_SNAPSHOT/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM review_events").get().n,0);
 }finally{f.db.close()}
});
test("P5 writeback stays imported nowhere in Worker and never runs remote Cloudflare commands",()=>{
 const files=["src/worker.js","src/reading-library.js","src/echo-cloud.js",
  "src/study-schedule-store.js","public/app.js"];
 const online=files.map(read).join("\n");
 assert.doesNotMatch(online,/v11-local-reviewed-writeback|commitLocalReviewedAction/);
 const source=read("scripts/v11-local-reviewed-writeback.mjs").replace(/\/\/[^\n]*/g,"");
 assert.doesNotMatch(source,/fetch\(|execSync\(|spawn\(|child_process|CLOUDFLARE_API_TOKEN/);
});
