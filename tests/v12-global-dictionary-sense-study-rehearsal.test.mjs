import test from 'node:test';
import assert from 'node:assert/strict';
import {rehearseApprovedSenseStudyState}
 from '../src/global-dictionary-sense-study-rehearsal.js';
const n='gds_'+'a'.repeat(24),v='gds_'+'b'.repeat(24);
const link=(id,sense)=>({legacy_word_id:id,sense_id:sense,
 reviewed:true,source_approved:true,lesson_approved:true,sense_approved:true});
const row=(id,status,bookmarked=0,due_at=null)=>({user_id:'reader-1',
 word_id:id,status,bookmarked,due_at,last_seen_at:'2026-11-10'});
test('one headword two senses: only repeated SAME reviewed sense is combined',()=>{
 const before={links:[link('old-record-a',n),link('old-record-b',n),
   link('old-record-verb',v)],
 progress:[row('old-record-a','mastered',1),
  row('old-record-b','learning',0,'2026-11-11'),
  row('old-record-verb','mastered',0)]};
 const snap=structuredClone(before);
 const result=rehearseApprovedSenseStudyState(before);
 assert.equal(result.counts.original_study_rows,3);
 assert.equal(result.counts.proposed_sense_groups,2);
 assert.equal(result.counts.repeated_same_sense_groups,1);
 assert.equal(result.counts.conflicting_mastery_groups,1);
 const noun=result.proposed_rows.find(x=>x.sense_id===n);
 const verb=result.proposed_rows.find(x=>x.sense_id===v);
 assert.equal(noun.status,'learning');
 assert.equal(noun.bookmarked,true);
 assert.equal(noun.due_at,'2026-11-11');
 assert.equal(verb.status,'mastered');
 assert.equal(verb.due_at,null);
 assert.equal(result.automatic_production_migration_allowed,false);
 assert.deepEqual(before,snap);
});
test('unreviewed mappings never transfer mastery',()=>{
 const links=[link('a',n)];links[0].sense_approved=false;
 const r=rehearseApprovedSenseStudyState({links,
  progress:[row('a','mastered')]});
 assert.equal(r.proposed_rows.length,0);
 assert.equal(r.counts.unmapped_study_rows,1);
 assert.deepEqual(r.issues,['UNAPPROVED_SENSE_LINK_IGNORED']);
});
test('one legacy ID cannot point to two distinct senses',()=>{
 assert.throws(()=>rehearseApprovedSenseStudyState({
  links:[link('old',n),link('old',v)]}),/LEGACY_WORD_ID_CONFLICTS/);
});
test('same sense multiple old due schedules never fabricate dates',()=>{
 const a=rehearseApprovedSenseStudyState({
  links:[link('a',n),link('b',n)],
  progress:[row('a','review_due',0,'2026-11-12'),row('b','learning',1)]});
 assert.equal(a.proposed_rows[0].status,'review_due');
 assert.equal(a.proposed_rows[0].due_at,'2026-11-12');
 assert.equal(a.counts.missing_due_dates,1);
 assert.equal(a.counts.merged_bookmark_candidates,1);
});
