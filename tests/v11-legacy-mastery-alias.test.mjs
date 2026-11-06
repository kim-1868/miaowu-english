import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annotateStudyWords} from '../src/study-identity.js';

// Simulates the query results of older word aliases, sorted by last_seen_at.
// No production D1, accounts, books, or migrations are used.
function fixture(rows){
 const calls=[];
 const env={DB:{prepare(query){
  assert.match(query,/FROM user_words uw JOIN words w/);
  return {bind(userId,...headwords){return {async all(){
   calls.push({userId,headwords});
   return {results:rows.filter(x=>x.user_id===userId&&headwords.includes(x.headword.toLowerCase()))};
  }}};
 }}};
 return {env,calls};
}
const row=(wordId,status,seen,bookmarked=0,pos='n.',userId='u1')=>({
 user_id:userId,word_id:wordId,headword:'record',part_of_speech:pos,meaning_zh:pos==='n.'?'记录；档案':'录制',
 status,bookmarked,last_seen_at:seen,due_at:null
});
test('P5 older mastered alias overrides newer learning alias for the SAME sense (read only)',async()=>{
 const f=fixture([
  row('book-b','learning','2026-11-06 10:00:00'),
  row('book-a','mastered','2026-11-05 10:00:00',1)
 ]);
 const cards=await annotateStudyWords(f.env,'u1',[
  {word_id:'new-book-record',headword:'record',part_of_speech:'n.',meaning_zh:'记录'}
 ]);
 assert.equal(cards.length,1);
 assert.equal(cards[0].study_seen,true);
 assert.equal(cards[0].study_status,'mastered');
 assert.equal(cards[0].study_bookmarked,true);
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0].headwords,['record']);
});
test('P5 same spelling with different POS must not inherit noun mastery',async()=>{
 const f=fixture([
  row('book-b','learning','2026-11-06 10:00:00'),
  row('book-a','mastered','2026-11-05 10:00:00',1),
  row('book-c','learning','2026-11-06 12:00:00',0,'v.')
 ]);
 const out=await annotateStudyWords(f.env,'u1',[
  {word_id:'new-noun',headword:'record',part_of_speech:'n.',meaning_zh:'记录'},
  {word_id:'new-verb',headword:'record',part_of_speech:'v.',meaning_zh:'录制'}
 ]);
 assert.equal(out[0].study_status,'mastered');
 assert.equal(out[1].study_status,'learning');
 assert.equal(out[1].study_bookmarked,false);
});
test('P5 no learning status leaks across accounts and guest remains unstudied',async()=>{
 const f=fixture([row('book-a','mastered','2026-11-05 10:00:00',1,'n.','u1')]);
 const sample=[{word_id:'new',headword:'record',part_of_speech:'n.',meaning_zh:'记录'}];
 const other=await annotateStudyWords(f.env,'u2',sample);
 const guest=await annotateStudyWords(f.env,null,sample);
 assert.equal(other[0].study_seen,false);
 assert.equal(other[0].study_status,null);
 assert.equal(guest[0].study_seen,false);
 assert.equal(guest[0].study_status,null);
});
