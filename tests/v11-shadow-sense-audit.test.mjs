import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSenseShadow} from '../scripts/v11-shadow-sense-audit.mjs';
const word=(id,headword='record',pos='n.',meaning='记录；档案',extra={})=>
 ({word_id:id,headword,part_of_speech:pos,meaning_zh:meaning,phonetic_uk:'/ˈrekɔːd/',phonetic_us:'/ˈrekərd/',contexts:[{book_id:'b1'}],...extra});
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
