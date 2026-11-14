import test from 'node:test';
import assert from 'node:assert/strict';
import {comparePublisherSnapshotForSenseBinding as compare} from
 '../src/global-dictionary-publisher-snapshot-reconcile.js';
const sha='a'.repeat(64),shaB='b'.repeat(64);
const h={book_id:'book-a',historical_file_sha256:sha,chapter_numbers:[1],
 historical_words:2,annotated_word_occurrences:1};
const b={book_id:'book-a',current_book_sha256:sha,current_revision:'revision-1',
 chapters:[{chapter_id:'ch-a',chapter_number:1,content_sha256:shaB}]};
const a={book_id:'book-a',chapter_id:'ch-a',context_anchor:'p0:s1',
 legacy_word_id:'word-a',candidate_entry_id:'gdict_'+'c'.repeat(24),
 candidate_sense_id:'gds_'+'d'.repeat(24)};
test('matching private current Publisher export remains unapproved without editor signoff',()=>{
 const x=compare({historicalBooks:[h],currentBooks:[b],currentAnchors:[a]});
 assert.equal(x.summary.historical_books,1);assert.equal(x.summary.current_anchors,1);
 assert.equal(x.summary.books_with_review_flags,0);
 assert.equal(x.books[0].eligible_for_auto_publish,false);
 assert.equal(x.books[0].eligible_for_srs_writes,false);
 assert.equal(x.verified_current_publisher_bindings,0);
});
test('missing live Publisher data rejects any automatic historical carryover',()=>{
 const x=compare({historicalBooks:[h]});
 assert.deepEqual(x.books[0].reasons,['CURRENT_PUBLISHER_BOOK_EXPORT_MISSING']);
 assert.equal(x.summary.missing_live_books,1);
});
test('changed book revision and missing word anchors emit exact review blockers',()=>{
 const x=compare({historicalBooks:[h],currentBooks:[{...b,current_book_sha256:shaB}],
 currentAnchors:[]});
 assert.ok(x.books[0].reasons.includes('SOURCE_VERSION_CHANGED_REVIEW_CONTEXT_AGAIN'));
 assert.ok(x.books[0].reasons.includes('CURRENT_CHAPTER_WORD_ANCHORS_MISSING'));
 assert.ok(x.books[0].reasons.includes('ANCHOR_OCCURRENCE_COUNT_CHANGED'));
});
test('duplicated anchor and forged commercial approval fail closed',()=>{
 assert.throws(()=>compare({historicalBooks:[h],currentBooks:[b],
  currentAnchors:[a,a]}),/DUPLICATE_ANCHOR/);
 assert.throws(()=>compare({historicalBooks:[h],currentBooks:[{...b,publisher_approved:true}],
  currentAnchors:[a]}),/FORGED_APPROVAL/);
 assert.throws(()=>compare({historicalBooks:[h],currentBooks:[b],
  currentAnchors:[{...a,candidate_sense_id:'record'}]}),/INVALID_ANCHOR/);
});
