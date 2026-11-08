import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {buildSenseShadow} from "../scripts/v11-shadow-sense-audit.mjs";
import {readLocalSenseSnapshot,previewLocalReviewCandidates,simulateReviewedSenseImpact} from "../scripts/v11-reviewed-sense-impact.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(read("db/001_schema.sql"));
 db.exec(read("db/011_v11_study_schedules.sql"));
 db.exec("INSERT INTO users(id,username,password_hash,password_salt) VALUES"+
  "('u1','private-user-one','password-salted-test','salt'),"+
  "('u2','private-user-two','password-salted-test','salt')");
 db.exec("INSERT INTO categories(id,slug,title,is_visible) VALUES"+
  "('cat4','cet4','四级',1),('cat6','cet6','六级',1)");
 db.exec("INSERT INTO books(id,category_id,title,status) VALUES"+
  "('book-a','cat4','Book A','published'),('book-b','cat4','Book B','published'),"+
  "('book-c','cat6','Locked Book','published')");
 db.exec("INSERT INTO chapters(id,book_id,chapter_no,title,content_json,published_at) VALUES"+
  "('chapter-a','book-a',1,'One','{}','2026-01-01 00:00:00'),"+
  "('chapter-b','book-b',1,'Two','{}','2026-01-01 00:00:00'),"+
  "('chapter-c','book-c',1,'Three','{}','2026-01-01 00:00:00')");
 db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh,phonetic_uk,phonetic_us) VALUES"+
  "('sense-a','record','n.','记录；档案','/ˈrekɔːd/','/ˈrekərd/'),"+
  "('sense-b','record','n.','档案','/ˈrekɔːd/','/ˈrekərd/'),"+
  "('sense-v','record','v.','录制','/rɪˈkɔːd/','/rɪˈkɔːrd/')");
 db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
  "('chapter-a','sense-a','Private storyline context: She kept a record.','a'),"+
  "('chapter-b','sense-b','Private storyline context: The archive record.','b'),"+
  "('chapter-c','sense-v','Private storyline context: Record the audio.','c')");
 db.exec("INSERT INTO entitlements(user_id,category_id) VALUES('u1','cat4')");
 db.exec("INSERT INTO reading_progress(user_id,chapter_id,progress,completed_at) VALUES"+
  "('u1','chapter-a',1,'2026-10-01 00:00:00')");
 return db;
}
const addWord=(db,userId,id,status="learning",bookmarked=0,due="2026-01-01 00:00:00")=>
 db.prepare("INSERT INTO user_words(user_id,word_id,status,bookmarked,due_at) VALUES(?,?,?,?,?)")
  .run(userId,id,status,bookmarked,due);
const addPlan=(db,userId,key,{stage=0,due="2026-01-01 00:00:00",mastered=0,bookmarked=0}={})=>
 db.prepare("INSERT INTO user_study_schedules(user_id,study_key,stage_index,due_at,mastered,bookmarked) VALUES(?,?,?,?,?,?)")
  .run(userId,key,stage,due,mastered,bookmarked);
function approval(db,wordIds=["sense-a","sense-b"]){
 const source=buildSenseShadow(readLocalSenseSnapshot(db));
 return {version:1,snapshotFingerprint:source.sourceFingerprint,groups:[{
  status:"approved",senseId:"reviewed:record_n_001",wordIds,
  reviewer:"fictional-editor",reviewedAt:"2026-11-07",
  evidence:"Compared two original chapters and confirmed matching noun teaching sense."
 }]};
}
test("P5 manual-approved two legacy senses preserve a mastered card and existing bookmark",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a","mastered",1,null);
  addWord(db,"u1","sense-b","learning",0);
  db.exec("INSERT INTO review_events(id,user_id,word_id,chapter_id,game_type,result) VALUES"+
   "('review-a','u1','sense-a','chapter-a','story-echo-fill','correct'),"+
   "('review-b','u1','sense-b','chapter-b','listening-spell','incorrect')");
  db.exec("PRAGMA query_only=ON");
  const report=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(report.status,"SIMULATION_PASSED_NO_MIGRATION");
  const group=report.groups[0];
  assert.equal(group.oldStudyKeyCount,2);
  assert.equal(group.previouslySharedByCurrentStudyKey,false);
  assert.equal(group.impactedAccounts,1);
  assert.equal(group.projectedMasteredAccounts,1);
  assert.equal(group.projectedBookmarkedAccounts,1);
  assert.equal(group.projectedDueAccounts,0);
  assert.equal(group.preservedHistoricalReviewEventCount,2);
  assert.equal(group.accountsRequiringManualDecision,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM review_events").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM user_words").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reading_progress").get().n,1);
  assert.equal(report.productionWritten,false);
  assert.equal(report.historyRewritten,false);
  assert.equal(report.migrationApproved,false);
 }finally{db.close()}
});
test("P5 without canonical schedule keeps the earliest due and shared review count once",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a","learning",0,"2026-10-03 00:00:00");
  addWord(db,"u1","sense-b","learning",1,"2026-12-03 00:00:00");
  const r=simulateReviewedSenseImpact(db,approval(db),{now:new Date("2026-11-07T00:00:00Z")});
  assert.equal(r.status,"SIMULATION_PASSED_NO_MIGRATION");
  assert.equal(r.groups[0].projectedDueAccounts,1);
  assert.equal(r.groups[0].projectedBookmarkedAccounts,1);
  assert.equal(r.groups[0].projectedMasteredAccounts,0);
 }finally{db.close()}
});
test("P5 mutually incompatible canonical plans block rather than silently choosing an interval",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a");
  addWord(db,"u1","sense-b");
  addPlan(db,"u1","sense:record|n|记录",{stage:3,due:"2026-11-09 00:00:00",mastered:0});
  addPlan(db,"u1","sense:record|n|档案",{stage:1,due:"2026-11-08 00:00:00",mastered:0});
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"MANUAL_REVIEW_REQUIRED");
  assert.ok(r.groups[0].reviewBlockerCodes.includes("CONFLICTING_CANONICAL_STUDY_PLANS"));
  assert.equal(r.groups[0].accountsRequiringManualDecision,1);
  assert.equal(r.migrationApproved,false);
 }finally{db.close()}
});
test("P5 explicit unmaster or unbookmark conflict with stale legacy mastery/bookmark requires review",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a","mastered",1,null);
  addWord(db,"u1","sense-b","learning",0);
  addPlan(db,"u1","sense:record|n|记录",{mastered:0,bookmarked:0});
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"MANUAL_REVIEW_REQUIRED");
  assert.ok(r.groups[0].reviewBlockerCodes.includes("EXPLICIT_UNMASTER_CONFLICTS_WITH_OLD_MASTERY"));
  assert.ok(r.groups[0].reviewBlockerCodes.includes("EXPLICIT_UNBOOKMARK_CONFLICTS_WITH_OLD_BOOKMARK"));
 }finally{db.close()}
});
test("P5 identical explicit canonical plans are preserved across different teaching keys",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a");
  addWord(db,"u1","sense-b");
  const plan={stage:2,due:"2026-11-16 00:00:00",mastered:0,bookmarked:1};
  addPlan(db,"u1","sense:record|n|记录",plan);
  addPlan(db,"u1","sense:record|n|档案",plan);
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"SIMULATION_PASSED_NO_MIGRATION");
  assert.equal(r.groups[0].accountsWithExplicitSchedules,1);
  assert.equal(r.groups[0].projectedBookmarkedAccounts,1);
  assert.equal(r.groups[0].projectedDueAccounts,0);
 }finally{db.close()}
});
test("P5 unapproved third word reusing an old study key blocks partial review",()=>{
 const db=fixture();try{
  db.exec("INSERT INTO words(id,headword,part_of_speech,meaning_zh) VALUES"+
   "('sense-third','record','n.','记录；线索')");
  db.exec("INSERT INTO chapter_words(chapter_id,word_id,context_sentence,context_anchor) VALUES"+
   "('chapter-b','sense-third','A private third record.','third')");
  addWord(db,"u1","sense-a");
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"MANUAL_REVIEW_REQUIRED");
  assert.ok(r.groups[0].reviewBlockerCodes.includes("UNAPPROVED_LEGACY_KEY_COLLISION"));
 }finally{db.close()}
});
test("P5 revoked/unentitled categories cannot contribute to current state, accounts do not merge",()=>{
 const db=fixture();try{
  // Approved sense-b moved to an unentitled category; old study row remains.
  db.exec("UPDATE books SET category_id='cat6' WHERE id='book-b'");
  addWord(db,"u1","sense-a","learning",1);
  addWord(db,"u1","sense-b","mastered",1,null);
  addWord(db,"u2","sense-a","mastered",1,null);
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"SIMULATION_PASSED_NO_MIGRATION");
  assert.equal(r.groups[0].impactedAccounts,1);
  assert.equal(r.groups[0].distinctVisibleStudiedAliases,1);
  assert.equal(r.groups[0].projectedMasteredAccounts,0);
  assert.equal(r.groups[0].projectedBookmarkedAccounts,1);
 }finally{db.close()}
});
test("P5 separate noun and verb keep independent identities, even with proposed false approval",()=>{
 const db=fixture();try{
  const r=simulateReviewedSenseImpact(db,approval(db,["sense-a","sense-v"]));
  assert.equal(r.status,"REVIEW_BLOCKED");
  assert.ok(r.reviewBlockerCodes.includes("APPROVAL_DIFFERENT_HEADWORD_OR_POS"));
  assert.equal(r.groups.length,0);
 }finally{db.close()}
});
test("P5 stale approval after novel context revision fails closed and does not expose story text",()=>{
 const db=fixture();try{
  const original=approval(db);
  db.exec("UPDATE chapter_words SET context_sentence='PRIVATE CHANGED TEXT - DO NOT OUTPUT' "+
   "WHERE word_id='sense-b'");
  const r=simulateReviewedSenseImpact(db,original);
  assert.equal(r.status,"REVIEW_BLOCKED");
  assert.ok(r.reviewBlockerCodes.includes("APPROVAL_SNAPSHOT_MISMATCH"));
  assert.ok(!JSON.stringify(r).includes("PRIVATE CHANGED TEXT"));
 }finally{db.close()}
});
test("P5 no private user, account, order or story content appears in aggregate output",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a","mastered",1,null);
  addWord(db,"u1","sense-b");
  const raw=JSON.stringify(simulateReviewedSenseImpact(db,approval(db)));
  for(const forbidden of ["private-user-one","private-user-two","password-salted-test","Private storyline context:","u1","u2"])
   assert.ok(!raw.includes('"'+forbidden+'"')&&!raw.includes(forbidden),forbidden);
 }finally{db.close()}
});
test("P5 old master and review events are preserved when simulated, with PRAGMA query_only enforced",()=>{
 const db=fixture();try{
  addWord(db,"u1","sense-a","mastered",1,null);
  addWord(db,"u1","sense-b");
  const before={
   words:db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),
   progress:db.prepare("SELECT * FROM reading_progress").all(),
   grants:db.prepare("SELECT * FROM entitlements").all()
  };
  db.exec("PRAGMA query_only=ON");
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"SIMULATION_PASSED_NO_MIGRATION");
  assert.deepEqual(db.prepare("SELECT * FROM user_words ORDER BY word_id").all(),before.words);
  assert.deepEqual(db.prepare("SELECT * FROM reading_progress").all(),before.progress);
  assert.deepEqual(db.prepare("SELECT * FROM entitlements").all(),before.grants);
 }finally{db.close()}
});

test("P5 local candidate report emits matching SHA-256 for a fresh approved manifest, no story body",()=>{
 const db=fixture();try{
  const preview=previewLocalReviewCandidates(db);
  const signed=approval(db);
  assert.equal(preview.snapshotFingerprint,signed.snapshotFingerprint);
  assert.equal(preview.status,"REVIEW_CANDIDATES_ONLY");
  assert.equal(preview.productionWritten,false);
  assert.equal(preview.migrationApproved,false);
  assert.ok(!JSON.stringify(preview).includes("Private storyline context:"));
  assert.ok(!JSON.stringify(preview).includes("private-user-one"));
 }finally{db.close()}
});
test("P5 empty review manifest cannot mark an unreviewed database as safe to migrate",()=>{
 const db=fixture();try{
  const reviewed=buildSenseShadow(readLocalSenseSnapshot(db));
  const result=simulateReviewedSenseImpact(db,{version:1,snapshotFingerprint:reviewed.sourceFingerprint,groups:[]});
  assert.equal(result.status,"REVIEW_BLOCKED");
  assert.deepEqual(result.reviewBlockerCodes,["NO_APPROVED_SENSE_GROUPS"]);
  assert.equal(result.migrationApproved,false);
 }finally{db.close()}
});
test("P5 revoked activation source excludes old entitled but revoked alias state",()=>{
 const db=fixture();try{
  db.exec("UPDATE books SET category_id='cat6' WHERE id='book-b'");
  db.exec("INSERT INTO activation_codes(id,code_hash,category_id,status,redeemed_by) "+
    "VALUES('revoked-code','private-digest','cat6','revoked','u1')");
  db.exec("INSERT INTO entitlements(user_id,category_id,source_code_id) "+
    "VALUES('u1','cat6','revoked-code')");
  addWord(db,"u1","sense-a","learning",0);
  addWord(db,"u1","sense-b","mastered",1,null);
  const r=simulateReviewedSenseImpact(db,approval(db));
  assert.equal(r.status,"SIMULATION_PASSED_NO_MIGRATION");
  assert.equal(r.groups[0].impactedAccounts,1);
  assert.equal(r.groups[0].distinctVisibleStudiedAliases,1);
  assert.equal(r.groups[0].projectedMasteredAccounts,0);
  assert.equal(r.groups[0].projectedBookmarkedAccounts,0);
 }finally{db.close()}
});
