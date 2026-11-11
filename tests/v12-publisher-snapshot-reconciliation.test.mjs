import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPublisherSnapshotLegacySenseMapping as reconcile}
 from '../src/global-dictionary-publisher-snapshot-reconciliation.js';
const HASH='f'.repeat(64),ENTRY='gdict_'+'a'.repeat(24);
const old=id=>({old_word_id:id,entry_id:ENTRY,candidate_hash_sha256:HASH,
 historical_book_ids:['book-a'],candidate_strict_text_match:true,
 editorial_sense_approved:false,stable_approved_sense_id:null});
const snapshots=()=>({source:'publisher_readonly_snapshot',snapshot_sha256:HASH,
 books:[{id:'book-a',revision:'revision-2',chapters:[{
  id:'chapter-1',number:1,revision:'revision-7',
  anchors:[{context_anchor:'p0:s1',legacy_word_id:'old-n'},
   {context_anchor:'p0:s2',legacy_word_id:'missing'}]
 }]}]});
test('real publisher export shape produces only candidate contexts and never a binding write',()=>{
 const result=reconcile({publisherSnapshot:snapshots(),historicalLegacyCards:[old('old-n')]});
 assert.equal(result.summary.anchors,2);assert.equal(result.summary.historical_candidates,1);
 assert.equal(result.summary.unresolved,1);
 assert.equal(result.rows[0].book_revision,'revision-2');
 assert.equal(result.rows[0].chapter_revision,'revision-7');
 assert.equal(result.rows[0].proposed_entry_id,ENTRY);
 assert.equal(result.rows[0].proposed_sense_id,null);
 assert.equal(result.can_write_bindings,false);
 assert.equal(result.summary.d1_writes,0);
 assert.ok(result.rows.every(x=>!x.ready_for_binding_write&&!x.study_write_allowed));
});
test('missing live Publisher source, revision or duplicated context anchors fail closed',()=>{
 const bad=snapshots();delete bad.source;
 assert.throws(()=>reconcile({publisherSnapshot:bad,historicalLegacyCards:[old('old-n')]}),/READONLY_EXPORT_REQUIRED/);
 const noVersion=snapshots();delete noVersion.books[0].chapters[0].revision;
 assert.throws(()=>reconcile({publisherSnapshot:noVersion,historicalLegacyCards:[old('old-n')]}),/INVALID_CHAPTER_VERSION/);
 const duplicate=snapshots();duplicate.books[0].chapters[0].anchors.push(
  {...duplicate.books[0].chapters[0].anchors[0]});
 assert.throws(()=>reconcile({publisherSnapshot:duplicate,historicalLegacyCards:[old('old-n')]}),/DUPLICATE_CONTEXT_ANCHOR/);
});
test('no approved lessons can be inferred from historical cards or same spelling',()=>{
 assert.throws(()=>reconcile({publisherSnapshot:snapshots(),
  historicalLegacyCards:[{...old('old-n'),editorial_sense_approved:true}]}),/HISTORICAL_CARD_UNREVIEWED_REQUIRED/);
 const x=reconcile({publisherSnapshot:snapshots(),
  historicalLegacyCards:[{...old('old-n'),historical_book_ids:['other-book']}]});
 assert.equal(x.summary.historical_candidates,0);
 assert.equal(x.summary.unresolved,2);
 assert.equal(x.rows[0].flags[0],'OLD_CARD_NOT_IN_HISTORICAL_BOOK');
});
