import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizePublisherMetadataPrivate as summarize} from
 '../scripts/summarize-private-production-publisher-artifact.mjs';
const base=()=>({
 status:'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS',
 verified:true,content_exported:false,production_db_writes:0,
 stats:{books:2,published_books:1,chapters:2,anchor_rows:3,books_with_zero_anchors:1},
 latest_metadata:{
  books:[{book_id:'a',category_id:'cat4',status:'published',title:'私人书名A',chapter_count:1,word_anchor_count:3},
   {book_id:'b',category_id:'cat6',status:'draft',title:'私人书名B',chapter_count:1,word_anchor_count:0}],
  chapters:[{chapter_id:'c1',book_id:'a',chapter_no:1,is_preview:1,
    published_at:'2026-11-11',content_bytes:1200},
   {chapter_id:'c2',book_id:'b',chapter_no:1,is_preview:0,published_at:null,content_bytes:100}],
  anchors:[{chapter_id:'c1',legacy_word_id:'priv-a',context_anchor:'p0:s1'},
    {chapter_id:'c1',legacy_word_id:'priv-a',context_anchor:'p0:s2'},
    {chapter_id:'c1',legacy_word_id:'priv-b',context_anchor:'p1:s1'}]
 }});
test('aggregate-only report includes counts and rejects all books, titles, anchor IDs',()=>{
 const raw=base();const result=summarize(raw),string=JSON.stringify(result);
 assert.equal(result.books,2);assert.equal(result.published_books,1);
 assert.equal(result.chapters,2);assert.equal(result.word_anchor_rows,3);
 assert.equal(result.distinct_legacy_word_ids,2);
 assert.equal(result.books_without_any_anchors,1);
 assert.equal(result.unpublished_chapters,1);
 assert.equal(result.preview_chapters,1);
 assert.equal(result.category_bucket_counts.length,2);
 for(const val of ['私人书名A','私人书名B','cat4','cat6','priv-a','priv-b','c1','c2','a','b']){
  if(val.length>2)assert.ok(!string.includes(val),'sensitive value leaked: '+val)
 }
 assert.equal(result.metadata_only,true);assert.equal(result.contextual_sense_binding_confirmed,false);
});
test('must fail closed on incorrect secret-generated content, inconsistent manifest or forged counters',()=>{
 for(const change of [
  x=>{x.verified=false},x=>{x.content_exported=true},
  x=>{x.production_db_writes=1},x=>{x.stats.books=40},
  x=>{x.latest_metadata.chapters.push({...x.latest_metadata.chapters[0]})},
  x=>{x.latest_metadata.anchors[0].chapter_id='unavailable'}
 ]){const x=base();change(x);assert.throws(()=>summarize(x))}
});
test('encrypted artifact runner never reaches Cloudflare or logs private decrypted JSON',()=>{
 const wf=readFileSync('.github/workflows/v12-production-publisher-artifact-summary.yml','utf8');
 for(const literal of ['environment:','production-d1-readonly-approval',
  '13877832033','43070567563','PRODUCTION_D1_METADATA_PASSPHRASE',
  'v12-publisher-production-metadata.gpg',
  'scripts/summarize-private-production-publisher-artifact.mjs',
  'trap \'rm -rf "$private"\' EXIT'])
  assert.ok(wf.includes(literal),'missing '+literal);
 assert.doesNotMatch(wf,/wrangler d1|CLOUDFLARE_API_TOKEN|d1 execute|wrangler deploy/i);
});
