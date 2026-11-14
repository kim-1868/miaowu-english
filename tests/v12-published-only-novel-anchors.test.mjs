import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditPublishedOnly as audit} from '../scripts/audit-published-only-novel-anchors.mjs';
const sample=()=>({
 status:'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS',verified:true,
 content_exported:false,production_db_writes:0,
 latest_metadata:{
  books:[{book_id:'private-A',category_id:'cat-private',status:'published',title:'Private novel A'},
    {book_id:'private-B',category_id:'cat-private',status:'published',title:'Private novel B'},
    {book_id:'private-DRAFT',category_id:'cat-private',status:'draft',title:'Private draft'}],
  chapters:[{chapter_id:'ch-a',book_id:'private-A',published_at:'2026-01-01'},
    {chapter_id:'ch-b',book_id:'private-B',published_at:'2026-01-01'},
    {chapter_id:'ch-draft',book_id:'private-DRAFT',published_at:null}],
  anchors:[{chapter_id:'ch-a',legacy_word_id:'WORD1'},
    {chapter_id:'ch-b',legacy_word_id:'WORD1'},
    {chapter_id:'ch-draft',legacy_word_id:'WORD2'}]
 }
});
test('only published books count and draft word ids have no influence',()=>{
 const result=audit(sample());
 assert.equal(result.published_books,2);
 assert.equal(result.published_book_chapters,2);
 assert.equal(result.released_chapters,2);
 assert.equal(result.legacy_anchor_rows,2);
 assert.equal(result.unpublished_books_processed,0);
 assert.equal(result.groups[0].shared_legacy_word_ids_across_published_books,1);
 assert.equal(result.groups[0].distinct_legacy_word_ids,1);
 const out=JSON.stringify(result);
 for(const secret of ['private-A','private-B','private-DRAFT','Private novel A','Private draft','cat-private','ch-draft','WORD1','WORD2'])
  assert.ok(!out.includes(secret),'must not emit private '+secret);
});
test('draft-only category is excluded completely and all draft changes are irrelevant',()=>{
 const s=sample();
 s.latest_metadata.books[2].category_id='draft-only-category';
 s.latest_metadata.anchors.push({chapter_id:'ch-draft',legacy_word_id:'SECRET-DRAFT'});
 const r=audit(s);
 assert.equal(r.groups.length,1);
 assert.equal(r.legacy_anchor_rows,2);
 assert.equal(r.private_identifiers_emitted,0);
});
test('malformed input or orphan word anchor rejected without disclosing row values',()=>{
 const s=sample();s.latest_metadata.anchors.push({chapter_id:'invalid-chapter',legacy_word_id:'SECRET'});
 assert.throws(()=>audit(s));
});
test('existing protected report uses published-only checker without another D1 export',()=>{
 const w=readFileSync('.github/workflows/v12-production-publisher-artifact-summary.yml','utf8');
 assert.match(w,/scripts\/audit-published-only-novel-anchors.mjs/);
 assert.match(w,/production-d1-readonly-approval/);
 assert.doesNotMatch(w,/wrangler d1|CLOUDFLARE_API_TOKEN|d1 execute|wrangler deploy/i);
});
