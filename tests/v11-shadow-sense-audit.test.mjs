import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSenseShadow} from '../scripts/v11-shadow-sense-audit.mjs';
const word=(id,headword='record',pos='n.',meaning='记录；档案',extra={})=>
 ({word_id:id,headword,part_of_speech:pos,meaning_zh:meaning,phonetic_uk:'/ˈrekɔːd/',phonetic_us:'/ˈrekərd/',contexts:[{book_id:'b1',chapter_id:'chapter-one',sentence:'She kept a record of every clue.'}],...extra});
const books=[word('rec-a'),word('rec-b','Record','n.','记录'),word('rec-v','record','v.','录制'),word('rec-power','power','n.','电力')];
const manifest=(fingerprint,wordIds=['rec-a','rec-b'])=>({version:1,snapshotFingerprint:fingerprint,groups:[{status:'approved',senseId:'reviewed:record_n_entries',wordIds,reviewer:'editor-internal',evidence:'Manually verified same teaching sense and contexts',reviewedAt:'2026-11-06'}]});
test('same-looking senses are only candidates; old word IDs have distinct shadow identities until review',()=>{
 const report=buildSenseShadow({cards:books},null,{includeCandidates:true,includeAssignments:true});
 assert.equal(report.summary.candidateClusters,1);
 assert.equal(report.summary.sameHeadwordMultipleSenseKeys,1);
 assert.equal(report.assignments['rec-a'],'legacy:rec-a');
 assert.equal(report.assignments['rec-b'],'legacy:rec-b');
 assert.equal(report.productionWritten,false);
 assert.equal(report.releaseApproved,false);
});
test('approved and pinned review maps compatible aliases without touching different POS',()=>{
 const baseline=buildSenseShadow({cards:books});
 const approved=buildSenseShadow({cards:books},manifest(baseline.sourceFingerprint),{includeAssignments:true});
 assert.equal(approved.summary.approvedGroups,1);
 assert.equal(approved.assignments['rec-a'],'reviewed:record_n_entries');
 assert.equal(approved.assignments['rec-b'],'reviewed:record_n_entries');
 assert.equal(approved.assignments['rec-v'],'legacy:rec-v');
 assert.equal(approved.summary.blockingProblems,0);
});
test('duplicate approval or multiple identity assignments blocks all approvals',()=>{
 const snapshot={cards:books};const base=buildSenseShadow(snapshot);
 const doc=manifest(base.sourceFingerprint);
 doc.groups.push({...doc.groups[0],senseId:'reviewed:another_record_group',wordIds:['rec-b','rec-a']});
 const out=buildSenseShadow(snapshot,doc,{includeAssignments:true});
 assert.ok(out.blockers.some(x=>x.code==='WORD_ID_APPROVED_IN_MULTIPLE_SENSES'));
 assert.equal(out.assignments,undefined);
 assert.equal(out.summary.approvedGroups,0);
});
test('noun and verb are never merged even with a hand-written approval',()=>{
 const snapshot={cards:books};const base=buildSenseShadow(snapshot);
 const out=buildSenseShadow(snapshot,manifest(base.sourceFingerprint,['rec-a','rec-v']));
 assert.ok(out.blockers.some(x=>x.code==='APPROVAL_DIFFERENT_HEADWORD_OR_POS'));
});
test('stale approval fingerprint blocks silent application to a newer novel library',()=>{
 const doc=manifest('f'.repeat(64));const out=buildSenseShadow({cards:books},doc);
 assert.ok(out.blockers.some(x=>x.code==='APPROVAL_SNAPSHOT_MISMATCH'));
});
test('same word ID with conflicting meaning is an unresolvable blocker',()=>{
 const out=buildSenseShadow({cards:[word('rec-a'),word('rec-a','record','n.','履历')]});
 assert.ok(out.blockers.some(x=>x.code==='SAME_WORD_ID_DIFFERENT_DEFINITION'));
});
test('approval with missing reviewer evidence is refused',()=>{
 const snapshot={cards:books};const doc=manifest(buildSenseShadow(snapshot).sourceFingerprint);
 doc.groups[0].evidence='';
 assert.ok(buildSenseShadow(snapshot,doc).blockers.some(x=>x.code==='APPROVAL_GROUP_INVALID'));
});
test('extra user/order fields are never emitted by the read-only report',()=>{
 const input={cards:[{...books[0],password_hash:'secret',order_id:'testorder'}],books:[{id:'b1',customer:'Test'}]};
 const out=JSON.stringify(buildSenseShadow(input,null,{includeCandidates:true,includeAssignments:true}));
 assert.ok(!out.includes('secret'));
 assert.ok(!out.includes('testorder'));
 assert.ok(!out.includes('Test'));
});
test('reordered snapshot rows do not invalidate approval fingerprint',()=>{
 const a=buildSenseShadow({cards:books});const b=buildSenseShadow({cards:books.slice().reverse()});
 assert.equal(a.sourceFingerprint,b.sourceFingerprint);
});
test('P5 compact shelf format is accepted but never promotes sourceWordId to confirmed sense',()=>{
 const row={sourceWordId:'compact-rec-n',headword:'record',partOfSpeech:'n.',meaningZh:'记录'};
 const result=buildSenseShadow({senses:[row]},null,{includeAssignments:true});
 assert.equal(result.assignments['compact-rec-n'],'legacy:compact-rec-n');
 assert.equal(result.summary.approvedGroups,0);
});

test('same word IDs and meanings with changed story context invalidate old review approval',()=>{
 const snapshot={cards:books};
 const original=buildSenseShadow(snapshot);
 const before=buildSenseShadow(snapshot,manifest(original.sourceFingerprint));
 assert.equal(before.summary.approvedGroups,1);
 const changed={cards:books.map(w=>({
  ...w,contexts:w.word_id==='rec-b'?[{book_id:'b1',chapter_id:'chapter-one',sentence:'He records a message now.'}]:w.contexts
 }))};
 const after=buildSenseShadow(changed,manifest(original.sourceFingerprint),{includeAssignments:true});
 assert.ok(after.blockers.some(x=>x.code==='APPROVAL_SNAPSHOT_MISMATCH'));
 assert.equal(after.assignments,undefined);
});
test('contextless candidate remains visible but cannot receive approved shared identity',()=>{
 const source={cards:[
  word('record-a','record','n.','记录',{contexts:[{book_id:'b1'}]}),
  word('record-b','record','n.','记录',{contexts:[]})
 ]};
 const first=buildSenseShadow(source,null,{includeCandidates:true});
 assert.equal(first.summary.candidateClusters,1);
 const approved=buildSenseShadow(source,manifest(first.sourceFingerprint,['record-a','record-b']),{includeAssignments:true});
 assert.ok(approved.blockers.some(x=>x.code==='APPROVAL_MISSING_STORY_CONTEXT'));
 assert.equal(approved.summary.approvedGroups,0);
 assert.equal(approved.assignments,undefined);
});
test('context ordering and object key order do not change review snapshot fingerprint',()=>{
 const first=books.map(w=>({...w,contexts:[
  {book_id:'b1',chapter_id:'c01',sentence:'First narrative sentence.'},
  {book_id:'b2',chapter_id:'c02',sentence:'Second narrative sentence.'}
 ]}));
 const swapped=first.slice().reverse().map(w=>({...w,contexts:[
  {sentence:'Second narrative sentence.',chapter_id:'c02',book_id:'b2'},
  {sentence:'First narrative sentence.',chapter_id:'c01',book_id:'b1'}
 ]}));
 assert.equal(buildSenseShadow({cards:first}).sourceFingerprint,
  buildSenseShadow({cards:swapped}).sourceFingerprint);
});
test('story sentence is hashed only and never emitted even in candidate and approved reports',()=>{
 const privateSentence='Private-story-text-XYZ-123';
 const cards=[
  word('same-a','record','n.','记录',{contexts:[{sentence:privateSentence}]}),
  word('same-b','record','n.','记录',{contexts:[{sentence:privateSentence}]})
 ];
 const first=buildSenseShadow({cards},null,{includeCandidates:true,includeAssignments:true});
 const approval=manifest(first.sourceFingerprint,['same-a','same-b']);
 const result=JSON.stringify(buildSenseShadow({cards},approval,{includeCandidates:true,includeAssignments:true}));
 assert.ok(!result.includes(privateSentence));
 assert.ok(!JSON.stringify(first).includes(privateSentence));
});
test('even an approved group with a changed unreviewed duplicate context loses the snapshot pin',()=>{
 const original={cards:[
  word('same-a','record','n.','记录',{contexts:[{sentence:'First context.'}]}),
  word('same-b','record','n.','记录',{contexts:[{sentence:'Second context.'}]})
 ]};
 const base=buildSenseShadow(original);
 const revised={cards:[...original.cards,word('same-b','record','n.','记录',{contexts:[{sentence:'Third new context.'}]})]};
 const report=buildSenseShadow(revised,manifest(base.sourceFingerprint,['same-a','same-b']),{includeAssignments:true});
 assert.ok(report.blockers.some(x=>x.code==='APPROVAL_SNAPSHOT_MISMATCH'));
 assert.equal(report.assignments,undefined);
});
