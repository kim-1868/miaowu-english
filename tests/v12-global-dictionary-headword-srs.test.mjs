import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {HEADWORD_SRS_DAYS,createHeadwordStudyState,applyHeadwordStudyFeedback,
 previewHeadwordStudyDue,setHeadwordBookmark} from '../src/global-dictionary-headword-srs.js';
const ENTRY='gdict_'+'a'.repeat(24);
const FIRST='2026-11-11T08:00:00.000Z';
const newUser=(user_id='learner')=>createHeadwordStudyState({user_id,entry_id:ENTRY});
const doIt=(s,kind,at)=>applyHeadwordStudyFeedback(s,{kind,at});

test('one user+headword key across novels; seeing does not change the due date',()=>{
 const a=newUser();
 const first=doIt(a,'remembered',FIRST);
 const two=doIt(first.state,'seen','2026-11-11T08:05:00.000Z');
 const three=doIt(two.state,'seen','2026-11-11T08:06:00.000Z');
 assert.equal(first.state.due_at,'2026-11-12T08:00:00.000Z');
 assert.equal(three.state.due_at,first.state.due_at);
 assert.equal(three.state.encounter_count,2);
 assert.deepEqual(first.study_key,{user_id:'learner',entry_id:ENTRY});
 assert.equal(first.database_writes,0);
 assert.deepEqual(a,newUser());
});
test('a full on-time 1/3/7/14/30 schedule; max stage does not grow infinitely',()=>{
 assert.deepEqual(HEADWORD_SRS_DAYS,[1,3,7,14,30]);
 let s=newUser(),moment=FIRST;
 for(const [i,expected] of [1,3,7,14,30].entries()){
  const r=doIt(s,'remembered',moment);
  assert.equal(r.advanced,true);
  assert.equal(r.state.stage,i+1);
  assert.equal(r.state.due_at,new Date(Date.parse(moment)+expected*86400000).toISOString());
  s=r.state;moment=s.due_at;
 }
 const r=doIt(s,'remembered',moment);
 assert.equal(r.state.stage,5);
 assert.equal(r.state.due_at,new Date(Date.parse(moment)+30*86400000).toISOString());
});
test('same calendar day and before due cannot farm advances or extend next due',()=>{
 const first=doIt(newUser(),'remembered',FIRST);
 const same=doIt(first.state,'remembered','2026-11-11T19:59:59.000Z');
 const early=doIt(same.state,'remembered','2026-11-12T07:59:59.000Z');
 assert.equal(same.advanced,false);assert.equal(early.advanced,false);
 assert.equal(same.state.due_at,first.state.due_at);
 assert.equal(early.state.due_at,first.state.due_at);
 assert.equal(early.state.remembered_count,3);
 const due=previewHeadwordStudyDue(early.state,first.state.due_at);
 assert.equal(due.is_due,true);
 assert.equal(due.status,'review_due');
});
test('forgotten shortens review, invites in-session replay without auto mastery',()=>{
 const first=doIt(newUser(),'remembered',FIRST).state;
 const second=doIt(first,'remembered',first.due_at).state;
 const missed=doIt(second,'forgotten','2026-11-13T09:00:00.000Z');
 assert.equal(missed.state.stage,1);
 assert.equal(missed.state.status,'learning');
 assert.equal(missed.state.due_at,'2026-11-14T09:00:00.000Z');
 assert.equal(missed.session_requeue_after,5);
 const same=doIt(missed.state,'remembered','2026-11-13T09:10:00.000Z');
 assert.equal(same.advanced,false);
 assert.equal(same.state.due_at,missed.state.due_at);
});
test('mastered requires independent explicit action and can be undone',()=>{
 const first=doIt(newUser(),'remembered',FIRST).state;
 assert.notEqual(first.status,'mastered');
 const mastered=doIt(first,'mark_mastered','2026-11-11T09:00:00.000Z');
 assert.equal(mastered.state.status,'mastered');
 assert.equal(mastered.state.due_at,null);
 assert.equal(doIt(mastered.state,'remembered','2026-11-12T08:00:00.000Z').state.status,'mastered');
 const undone=doIt(mastered.state,'unmark_mastered','2026-11-12T10:00:00.000Z');
 assert.equal(undone.state.status,'learning');
 assert.equal(undone.state.due_at,'2026-11-13T10:00:00.000Z');
 assert.throws(()=>doIt(first,'unmark_mastered','2026-11-12T10:00:00.000Z'),/NOT_MASTERED/);
});
test('two users never share schedule; bookmarks do not modify learning',()=>{
 const a=doIt(newUser('a'),'remembered',FIRST).state;
 const b=newUser('b');
 const x=setHeadwordBookmark(a,true);
 assert.equal(x.bookmarked,true);assert.equal(x.due_at,a.due_at);
 assert.equal(a.bookmarked,false);assert.equal(b.stage,0);
 assert.throws(()=>setHeadwordBookmark(a,'yes'),/INVALID_BOOKMARK/);
});
test('invalid identity/time/retroactive events fail closed',()=>{
 assert.throws(()=>createHeadwordStudyState({user_id:'x',entry_id:'fake'}),/INVALID_STATE/);
 assert.throws(()=>doIt(newUser(),'remembered','2026-11-11'),/INVALID_TIME/);
 assert.throws(()=>doIt(newUser(),'unknown',FIRST),/INVALID_FEEDBACK/);
 const a=doIt(newUser(),'remembered',FIRST).state;
 assert.throws(()=>doIt(a,'remembered','2026-11-11T07:59:59.000Z'),/NONMONOTONIC/);
 assert.throws(()=>doIt({...a,stage:999},'seen',FIRST),/INVALID_STATE/);
});
test('migration 019 is additive; foreign keys/unique key/event ledger preserve legacy tables',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY);'+
  'CREATE TABLE books(id TEXT PRIMARY KEY);'+
  'CREATE TABLE global_dictionary_entries(entry_id TEXT PRIMARY KEY);'+
  'CREATE TABLE user_words(user_id TEXT,word_id TEXT);');
  db.prepare('INSERT INTO users(id) VALUES(?)').run('a');
  db.prepare('INSERT INTO global_dictionary_entries(entry_id) VALUES(?)').run(ENTRY);
  db.prepare('INSERT INTO user_words(user_id,word_id) VALUES(?,?)').run('a','record-n');
  const sql=readFileSync(new URL('../db/019_global_dictionary_headword_study.sql',import.meta.url),'utf8');
  db.exec(sql);db.exec(sql);
  db.prepare('INSERT INTO user_headword_study(user_id,entry_id) VALUES(?,?)').run('a',ENTRY);
  assert.throws(()=>db.prepare('INSERT INTO user_headword_study(user_id,entry_id) VALUES(?,?)').run('a',ENTRY));
  assert.throws(()=>db.prepare('INSERT INTO user_headword_study(user_id,entry_id) VALUES(?,?)').run('unknown',ENTRY));
  assert.equal(db.prepare('SELECT count(*) as n FROM user_words').get().n,1);
  assert.throws(()=>db.prepare("UPDATE user_headword_study SET status='mastered',due_at='2026-11-12' WHERE user_id='a'").run());
  db.prepare('INSERT INTO user_headword_review_events(event_id,user_id,entry_id,action,state_revision) VALUES(?,?,?,?,?)')
    .run('event1','a',ENTRY,'remembered',1);
  assert.throws(()=>db.prepare('INSERT INTO user_headword_review_events(event_id,user_id,entry_id,action,state_revision) VALUES(?,?,?,?,?)').run('event2','a',ENTRY,'remembered',1));
  assert.equal(db.prepare('SELECT count(*) AS n FROM user_words').get().n,1);
 }finally{db.close()}
});