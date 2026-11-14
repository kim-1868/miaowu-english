import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rehearseSense020} from '../scripts/rehearse-sense-020.mjs';
import {
 createSenseStudyState,applySenseStudyFeedback,previewSenseStudyDue,
 setSenseBookmark,SENSE_SRS_DAYS
} from '../src/global-dictionary-sense-srs.js';

const noun='gds_'+'b'.repeat(24),verb='gds_'+'c'.repeat(24);
const student='sample-user';
const start='2026-11-11T12:00:00.000Z';
const nextDay='2026-11-12T12:00:00.000Z';
const schema=readFileSync(new URL('../db/020_global_dictionary_sense_study.sql',import.meta.url),'utf8');

test('020 independently rehearsed with the actual 001+013-019 SQL; no legacy writes',()=>{
 const x=rehearseSense020();
 assert.equal(x.status,'OFFLINE_SENSE_020_REHEARSAL_SUCCESS');
 assert.equal(x.new_objects,7);
 assert.equal(x.one_display_headword_multiple_independent_sense_plans,true);
 assert.equal(x.legacy_rows_preserved,true);
 assert.equal(x.test_d1_writes,0);
});
test('A and B novels referencing the SAME reviewed sense share one schedule, not two',()=>{
 const first=createSenseStudyState({user_id:student,sense_id:noun});
 const result=applySenseStudyFeedback(first,{kind:'remembered',at:start});
 const acrossBook=applySenseStudyFeedback(result.state,{kind:'seen',at:'2026-11-11T13:00:00.000Z'});
 assert.deepEqual(result.study_key,{user_id:student,sense_id:noun});
 assert.equal(result.advanced,true);
 assert.equal(result.state.stage,1);
 assert.equal(acrossBook.state.due_at,result.state.due_at);
 const rememberedAgain=applySenseStudyFeedback(acrossBook.state,{kind:'remembered',
    at:'2026-11-11T14:00:00.000Z'});
 assert.equal(rememberedAgain.advanced,false);
 assert.equal(rememberedAgain.state.due_at,result.state.due_at);
 assert.equal(previewSenseStudyDue(rememberedAgain.state,nextDay).is_due,true);
 assert.deepEqual(SENSE_SRS_DAYS,[1,3,7,14,30]);
});
test('different meanings beneath the SAME displayed headword never share mastery',()=>{
 let n=createSenseStudyState({user_id:student,sense_id:noun});
 let v=createSenseStudyState({user_id:student,sense_id:verb});
 n=applySenseStudyFeedback(n,{kind:'mark_mastered',at:start}).state;
 assert.equal(n.status,'mastered');
 assert.equal(n.due_at,null);
 assert.equal(v.status,'new');
 assert.equal(v.stage,0);
 assert.notEqual(n.sense_id,v.sense_id);
 v=applySenseStudyFeedback(v,{kind:'remembered',at:start}).state;
 assert.equal(v.stage,1);
 assert.equal(n.status,'mastered');
 const marked=setSenseBookmark(v,true);
 assert.equal(marked.bookmarked,true);
 assert.equal(n.bookmarked,false);
});
test('unreviewed or forged sense IDs cannot become state',()=>{
 assert.throws(()=>createSenseStudyState({user_id:student,sense_id:'gdict_'+'b'.repeat(24)}),
  /SENSE_SRS_INVALID_STATE/);
 assert.throws(()=>createSenseStudyState({user_id:student,sense_id:'gds_fake'}),
  /SENSE_SRS_INVALID_STATE/);
 assert.match(schema,/PRIMARY KEY\(user_id,sense_id\)/);
 assert.match(schema,/SENSE_STUDY_UNAPPROVED/);
 assert.match(schema,/FOREIGN KEY\(sense_id,entry_id\)/);
});
test('020 SQL is strictly additive and does not rewrite old study history',()=>{
 assert.doesNotMatch(schema,/\b(?:DROP TABLE|ALTER TABLE|DELETE FROM user_words|UPDATE user_words|DROP TRIGGER)\b/i);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS user_dictionary_sense_study/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS user_dictionary_sense_review_events/);
 assert.match(schema,/user_dictionary_sense_study_approved_update/);
 assert.match(schema,/user_dictionary_sense_events_approved_insert/);
});
