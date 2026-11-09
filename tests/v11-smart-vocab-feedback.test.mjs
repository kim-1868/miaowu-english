import test from 'node:test';
import assert from 'node:assert/strict';
import {applySmartRecall,applySmartBookmark,shouldAdvanceSmartCard,SRS_INTERVALS} from '../src/smart-vocab-feedback.js';
test('remembered never permanently masters a new word',()=>{
  const x=applySmartRecall({status:'new',bookmarked:false},'known','2026-11-09');
  assert.equal(x.status,'learning');assert.equal(x.nextReviewDays,1);assert.equal(x.bookmarked,false);
});
test('twenty same-day correct clicks never accelerate SRS',()=>{
  let x={correctStreak:0,status:'learning',bookmarked:false};
  for(let n=0;n<20;n++)x=applySmartRecall(x,'known','2026-11-09');
  assert.equal(x.correctStreak,1);assert.equal(x.nextReviewDays,1);
  x=applySmartRecall(x,'known','2026-11-10');
  assert.equal(x.correctStreak,2);assert.equal(x.nextReviewDays,3);
});
test('correct streak saturates at 30-day interval',()=>{
  let x={correctStreak:0,status:'learning'};
  for(let d=1;d<=8;d++)x=applySmartRecall(x,'known','2026-11-'+String(d).padStart(2,'0'));
  assert.deepEqual(SRS_INTERVALS,[1,3,7,14,30]);
  assert.equal(x.nextReviewDays,30);
});
test('forgot drops mastered to learning but never adds bookmark',()=>{
  const x=applySmartRecall({correctStreak:4,status:'mastered',bookmarked:false},'forgot','2026-11-09');
  assert.equal(x.status,'learning');assert.equal(x.correctStreak,0);
  assert.equal(x.nextReviewDays,1);assert.equal(x.bookmarked,false);
});
test('collection and cancellation preserve prior schedule',()=>{
  const original={status:'learning',correctStreak:3,nextReviewDays:7,bookmarked:false};
  const b=applySmartBookmark(original,true),c=applySmartBookmark(b,false);
  assert.equal(b.bookmarked,true);assert.equal(c.bookmarked,false);
  assert.equal(c.nextReviewDays,7);assert.equal(c.correctStreak,3);
  assert.equal(original.bookmarked,false);
});
test('network failures never auto-advance learner cards',()=>{
  assert.equal(shouldAdvanceSmartCard(null),false);
  assert.equal(shouldAdvanceSmartCard({saved:false,wordId:'a',result:'correct'}),false);
  assert.equal(shouldAdvanceSmartCard({saved:true,wordId:'a',result:'incorrect'}),true);
  assert.equal(shouldAdvanceSmartCard({saved:true,wordId:'a',alreadyApplied:true}),true);
});
test('invalid feedback and bookmark input fail closed',()=>{
  assert.throws(()=>applySmartRecall({},'maybe','2026-11-09'),/INVALID_RECALL_FEEDBACK/);
  assert.throws(()=>applySmartBookmark({},'true'),/INVALID_BOOKMARK_STATE/);
});
