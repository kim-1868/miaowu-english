import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditPublisherAnchorStructure as audit} from '../scripts/audit-production-publisher-anchor-structure.mjs';
const sample=()=>({
 status:'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS',
 verified:true,content_exported:false,production_db_writes:0,
 latest_metadata:{
 books:[{book_id:'book-A',category_id:'classified-cet4',status:'published',chapter_count:2,word_anchor_count:3,title:'Private title'},
  {book_id:'book-B',category_id:'classified-cet4',status:'published',chapter_count:1,word_anchor_count:1,title:'Another private title'},
  {book_id:'book-C',category_id:'classified-cet6',status:'draft',chapter_count:1,word_anchor_count:0,title:'Draft private'}],
 chapters:[{chapter_id:'c-A1',book_id:'book-A',content_bytes:90},
  {chapter_id:'c-A2',book_id:'book-A',content_bytes:90},
  {chapter_id:'c-B1',book_id:'book-B',content_bytes:90},
  {chapter_id:'c-C1',book_id:'book-C',content_bytes:40}],
 anchors:[{chapter_id:'c-A1',legacy_word_id:'word-x',context_anchor:'p0:s1'},
  {chapter_id:'c-A1',legacy_word_id:'word-y',context_anchor:'p0:s2'},
  {chapter_id:'c-A2',legacy_word_id:'word-y',context_anchor:'p0:s1'},
  {chapter_id:'c-B1',legacy_word_id:'word-y',context_anchor:'p0:s1'}]
 }});
test('private real-snapshot analyzer shows published-only statistics and reuse count without IDs',()=>{
 const x=audit(sample());
 assert.equal(x.published_books,2);
 assert.equal(x.category_groups.length,2);
 assert.equal(x.category_groups[0].published_books,2);
 assert.equal(x.category_groups[0].legacy_word_ids_present_in_multiple_books,1);
 assert.equal(x.category_groups[0].median_published_book_anchors,2);
 assert.equal(x.category_groups[0].median_published_book_distinct_legacy_word_ids,1.5);
 assert.equal(x.zero_anchor_chapters,1);
 const output=JSON.stringify(x);
 for(const secret of ['Private title','Another private title','classified-cet4','classified-cet6','word-x','word-y','book-A','book-B','c-A1','c-B1'])
  assert.ok(!output.includes(secret),'exposed private '+secret);
 assert.equal(x.approved_sense_bindings,0);
 assert.equal(x.production_writes,0);
});
test('missing chapters, altered production output and mismatched totals fail closed',()=>{
 for(const mutate of [
  x=>{x.content_exported=true},x=>{x.production_db_writes=1},
  x=>{x.latest_metadata.anchors[0].chapter_id='orphan'},
  x=>{x.latest_metadata.books[0].word_anchor_count=2},
  x=>{x.latest_metadata.chapters[0].content_bytes=-1},
  x=>{x.latest_metadata.books.push({...x.latest_metadata.books[0]})},
 ]){
  const x=sample();mutate(x);assert.throws(()=>audit(x));
 }
});
test('approved new scope remains inside existing protected decrypt step only',()=>{
 const wf=readFileSync('.github/workflows/v12-production-publisher-artifact-summary.yml','utf8');
 assert.ok(wf.includes('production-d1-readonly-approval'));
 assert.ok(wf.includes('scripts/audit-production-publisher-anchor-structure.mjs'));
 assert.ok(wf.includes('13877832033'));
 assert.doesNotMatch(wf,/wrangler d1|CLOUDFLARE_API_TOKEN|d1 execute|wrangler deploy/i);
});
