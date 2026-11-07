import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {buildSenseShadow} from "../scripts/v11-shadow-sense-audit.mjs";
import {readLocalSenseSnapshot} from "../scripts/v11-reviewed-sense-impact.mjs";
import {applyReviewedMappingSchema,resolveStagedStudyKey,stageReviewedSenseAliases}
 from "../scripts/v11-stage-reviewed-sense-aliases.mjs";

const read=x=>readFileSync(new URL("../"+x,import.meta.url),"utf8");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(read("db/001_schema.sql"));
 db.exec(read("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('u1','fictional-private-a','hash-one','salt-a'),"+
  "('u2','fictional-private-b','hash-two','salt-b')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES"+
  "('c4','cet4','四级',1),('c6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
  "('ba','c4','A','published'),('bb','c4','B','published'),"+
  "('bc','c6','C','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('cha','ba',1,'A1','{}','2026-01-01 00:00:00'),"+
  "('chb','bb',1,'B1','{}','2026-01-01 00:00:00'),"+
  "('chc','bc',1,'C1','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
  "('w-a','record','n.','记录；档案'),"+
  "('w-b','record','n.','档案'),"+
  "('w-verb','record','v.','录制')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('cha','w-a','She kept a record in the drawer.','a'),"+
  "('chb','w-b','The record was in the archive.','b'),"+
  "('chc','w-verb','Record a voice message.','c')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','c4')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
  "('u1','cha',1,'2026-10-01 00:00:00')");
 db.exec("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES"+
  "('u1','w-a','mastered',1,NULL),"+
  "('u1','w-b','learning',0,'2026-11-01 00:00:00'),"+
  "('u2','w-a','learning',0,'2026-11-01 00:00:00')");
 db.exec("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES"+
  "('event-one','u1','w-a','cha','story-echo-fill','correct'),"+
  "('event-two','u1','w-b','chb','listening-spell','incorrect')");
 return db;
}
function review(db,{senseId="reviewed:record_n_001",ids=["w-a","w-b"]}={}){
 return {version:1,snapshotFingerprint:buildSenseShadow(readLocalSenseSnapshot(db)).sourceFingerprint,
  groups:[{status:"approved",senseId,wordIds:ids,reviewer:"fictional-editor",
   evidence:"Manually reviewed teaching contexts for two matching noun meanings.",
   reviewedAt:"2026-11-07"}]};
}
function legacy(db){
 return {
  words:db.prepare("SELECT * FROM words ORDER BY id").all(),
  chapterWords:db.prepare("SELECT * FROM chapter_words ORDER BY word_id").all(),
  userWords:db.prepare("SELECT * FROM user_words ORDER BY user_id,word_id").all(),
  progress:db.prepare("SELECT * FROM reading_progress").all(),
  events:db.prepare("SELECT * FROM review_events ORDER BY id").all(),
  entitlements:db.prepare("SELECT * FROM entitlements ORDER BY user_id").all(),
  schedules:db.prepare("SELECT * FROM user_study_schedules").all()
 };
}
test("P5 proposed schema is additive, idempotent, and never updates old rows",()=>{
 const db=fixture();try{
  const before=legacy(db);
  applyReviewedMappingSchema(db);
  applyReviewedMappingSchema(db);
  assert.deepEqual(legacy(db),before);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'reviewed_sense_%' ORDER BY name").all().map(x=>x.name);
  assert.deepEqual(tables,["reviewed_sense_aliases","reviewed_sense_groups"]);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,0);
 }finally{db.close()}
});
test("P5 approved noun aliases can be atomically staged, but default study identity stays unchanged",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  const baseline=legacy(db),oldA=resolveStagedStudyKey(db,"w-a"),oldB=resolveStagedStudyKey(db,"w-b");
  assert.notEqual(oldA,oldB);
  const result=stageReviewedSenseAliases(db,review(db));
  assert.equal(result.status,"LOCAL_MAPPING_STAGED_NOT_ACTIVATED");
  assert.equal(result.approvedGroupCount,1);
  assert.equal(result.stagedWordCount,2);
  assert.equal(result.newAliasRows,2);
  assert.equal(result.mappingLiveForReader,false);
  assert.deepEqual(legacy(db),baseline);
  assert.equal(resolveStagedStudyKey(db,"w-a"),oldA);
  assert.equal(resolveStagedStudyKey(db,"w-b"),oldB);
  assert.equal(resolveStagedStudyKey(db,"w-a",{reviewed:true}),"reviewed:record_n_001");
  assert.equal(resolveStagedStudyKey(db,"w-b",{reviewed:true}),"reviewed:record_n_001");
  assert.notEqual(resolveStagedStudyKey(db,"w-verb",{reviewed:true}),"reviewed:record_n_001");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_groups").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,2);
  const stored=db.prepare("SELECT * FROM reviewed_sense_groups").get();
  assert.equal(stored.snapshot_sha256,review(db).snapshotFingerprint);
  assert.match(stored.evidence_sha256,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(stored).includes("Manually reviewed teaching contexts"));
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 }finally{db.close()}
});
test("P5 repeated same human approval is idempotent: no second group, no changed alias",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  const doc=review(db);
  stageReviewedSenseAliases(db,doc);
  const second=stageReviewedSenseAliases(db,doc);
  assert.equal(second.newGroupRows,0);
  assert.equal(second.newAliasRows,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,2);
 }finally{db.close()}
});
test("P5 mismatched canonical plans fail closed before creating any mappings",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  db.exec("UPDATE user_words SET status='learning',bookmarked=0 WHERE user_id='u1'");
  db.exec("INSERT INTO user_study_schedules(user_id,study_key,stage_index,mastered,bookmarked,due_at) VALUES"+
   "('u1','sense:record|n|记录',2,0,0,'2026-11-08 00:00:00'),"+
   "('u1','sense:record|n|档案',1,0,0,'2026-11-09 00:00:00')");
  assert.throws(()=>stageReviewedSenseAliases(db,review(db)),
   /REVIEWED_MAPPING_IMPACT_BLOCKED_MANUAL_REVIEW_REQUIRED/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_groups").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,0);
 }finally{db.close()}
});
test("P5 explicit unmaster cannot be overwritten by an old mastered alias",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  db.exec("INSERT INTO user_study_schedules(user_id,study_key,mastered,bookmarked) VALUES"+
   "('u1','sense:record|n|记录',0,1)");
  assert.throws(()=>stageReviewedSenseAliases(db,review(db)),
   /REVIEWED_MAPPING_IMPACT_BLOCKED_MANUAL_REVIEW_REQUIRED/);
 }finally{db.close()}
});
test("P5 third unapproved old alias sharing a text studyKey blocks partial import",()=>{
 const db=fixture();try{
  db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
   "('w-third','record','n.','记录；线索')");
  db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
   "('chb','w-third','Another private record.','third')");
  applyReviewedMappingSchema(db);
  assert.throws(()=>stageReviewedSenseAliases(db,review(db)),
   /REVIEWED_MAPPING_IMPACT_BLOCKED_MANUAL_REVIEW_REQUIRED/);
 }finally{db.close()}
});
test("P5 stale chapter-context fingerprint or incorrect POS approval cannot stage",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  const oldApproval=review(db);
  db.exec("UPDATE chapter_words SET context_sentence='Changed story meaning.' WHERE word_id='w-b'");
  assert.throws(()=>stageReviewedSenseAliases(db,oldApproval),
   /REVIEWED_MAPPING_IMPACT_BLOCKED_REVIEW_BLOCKED/);
  assert.throws(()=>stageReviewedSenseAliases(db,review(db,{ids:["w-a","w-verb"]})),
   /REVIEWED_MAPPING_IMPACT_BLOCKED_REVIEW_BLOCKED/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,0);
 }finally{db.close()}
});
test("P5 same words assigned another approved sense ID conflicts and rolls back atomically",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  stageReviewedSenseAliases(db,review(db));
  const baseline=legacy(db);
  assert.throws(()=>stageReviewedSenseAliases(db,review(db,{senseId:"reviewed:record_n_002"})),
   /REVIEWED_MAPPING_EXISTING_ALIAS_CONFLICT/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_aliases").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reviewed_sense_groups").get().n,1,
   "no orphan approved group is committed");
  assert.deepEqual(legacy(db),baseline);
 }finally{db.close()}
});
test("P5 SQLite FKs prevent unknown word IDs or missing reviewed group references",()=>{
 const db=fixture();try{
  applyReviewedMappingSchema(db);
  assert.throws(()=>db.prepare("INSERT INTO reviewed_sense_aliases(word_id,sense_id,legacy_study_key) VALUES(?,?,?)")
   .run("missing-word","reviewed:record_n_001","legacy:missing-word"),/FOREIGN KEY constraint failed/);
  db.prepare("INSERT INTO reviewed_sense_groups(sense_id,snapshot_sha256,evidence_sha256,reviewer,reviewed_at) VALUES(?,?,?,?,?)")
    .run("reviewed:test_n_001","f".repeat(64),"d".repeat(64),"test-reviewer","2026-11-07");
  assert.throws(()=>db.prepare("INSERT INTO reviewed_sense_aliases(word_id,sense_id,legacy_study_key) VALUES(?,?,?)")
   .run("missing-word","reviewed:test_n_001","legacy:missing-word"),/FOREIGN KEY constraint failed/);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 }finally{db.close()}
});
test("P5 explicit audited staged resolver is disabled without the mapping table",()=>{
 const db=fixture();try{
  const before=resolveStagedStudyKey(db,"w-a");
  assert.equal(resolveStagedStudyKey(db,"w-a",{reviewed:true}),before);
  assert.throws(()=>stageReviewedSenseAliases(db,review(db)),/REVIEWED_MAPPING_SCHEMA_NOT_INSTALLED/);
  assert.throws(()=>resolveStagedStudyKey(db,"missing-word"),/REVIEWED_WORD_NOT_FOUND/);
 }finally{db.close()}
});
test("P5 offline schema/staging modules cannot mutate user study tables or contact Cloudflare",()=>{
 const js=read("scripts/v11-stage-reviewed-sense-aliases.mjs");
 const sql=read("db/014_v11_reviewed_sense_aliases.sql");
 const source=js.replace(/\/\/[^\n]*/g,"");
 assert.doesNotMatch(source,/child_process|spawn\(|execSync\(|fetch\(|wrangler|CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(sql,/ALTER TABLE|DROP TABLE|UPDATE\s+(?:user_|words|chapters)|DELETE FROM|INSERT INTO\s+(?:user_|words|chapters|review_events)/i);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS reviewed_sense_groups/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS reviewed_sense_aliases/);
 const deployed=read("src/study-schedule-store.js");
 assert.ok(!deployed.includes("reviewed_sense_aliases"),"production schedule path must remain unchanged");
});
