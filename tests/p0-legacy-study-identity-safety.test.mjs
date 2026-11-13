import test from 'node:test';
import assert from 'node:assert/strict';
import {studyKey,uniqueStudyRows,relatedAccessibleWordIds,annotateStudyWords}
 from '../src/study-identity.js';

const row=(id,pos,meaning)=>({
 id,headword:'record',part_of_speech:pos,meaning_zh:meaning
});

test('P0: truly identical legacy definitions share learning key across novels',()=>{
 assert.equal(studyKey(row('book-a','n.','记录；档案')),
              studyKey(row('book-b','n','记录;档案')));
 const unique=uniqueStudyRows([
  {...row('book-a','n.','记录；档案')},
  {...row('book-b','n.','记录;档案')}
 ]);
 assert.equal(unique.length,1);
});

test('P0: common first Chinese gloss must not merge different secondary senses',()=>{
 const sameFirstButDifferent=row('book-b','n.','记录；成绩');
 const base=row('book-a','n.','记录；档案');
 assert.notEqual(studyKey(base),studyKey(sameFirstButDifferent));
 assert.equal(uniqueStudyRows([base,sameFirstButDifferent]).length,2);
 assert.notEqual(studyKey(base),studyKey(row('book-c','v.','记录；档案')));
});

test('P0: missing gloss retains separate legacy word identity',()=>{
 assert.notEqual(studyKey(row('a','n.','')),studyKey(row('b','n.','')));
});

test('P0: a learning decision updates only accessible identical full-sense copies',async()=>{
 const initial=row('book-a','n.','记录；档案');
 const rows=[
  row('book-a','n.','记录；档案'),
  row('book-b','n.','记录;档案'),
  row('book-c','n.','记录；成绩'),
  row('book-d','v.','记录；档案')
 ];
 const env={DB:{prepare(sql){return {bind(...args){return {
  first:async()=>initial,all:async()=>({results:rows})
 }}}}}};
 assert.deepEqual(await relatedAccessibleWordIds(env,'book-a','reader-1'),
  ['book-a','book-b']);
});

test('P0: a mastered state does not bleed to an unrelated legacy sense',async()=>{
 const target=[row('book-b','n.','记录；档案'),
               row('book-c','n.','记录；成绩')];
 const records=[{...row('book-a','n.','记录；档案'),
  word_id:'book-a',status:'mastered',bookmarked:1,last_seen_at:'2026-11-13'}];
 const env={DB:{prepare(){return {bind(){return {
  all:async()=>({results:records})
 }}}}}};
 const annotated=await annotateStudyWords(env,'reader-1',target);
 assert.equal(annotated[0].study_status,'mastered');
 assert.equal(annotated[0].study_seen,true);
 assert.equal(annotated[1].study_status,null);
 assert.equal(annotated[1].study_seen,false);
});
