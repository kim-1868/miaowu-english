import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProductionPublisherMetadata as validate} from
 '../scripts/validate-production-publisher-metadata.mjs';
const packet=results=>JSON.stringify([{success:true,results}]);
const valid=()=>({
 booksJson:packet([{book_id:'book-a',category_id:'cet4',status:'published',
   title:'合成书',chapter_count:1,word_anchor_count:1}]),
 chaptersJson:packet([{chapter_id:'chapter-a',book_id:'book-a',chapter_no:1,
  is_preview:0,published_at:'2026-11-01 00:00:00',content_bytes:18000}]),
 anchorsJson:packet([{chapter_id:'chapter-a',legacy_word_id:'word-a',
  context_anchor:'p0:s1'}])
});
test('only approved metadata columns, and no fiction/customer bytes in output',()=>{
 const result=validate(valid());
 assert.equal(result.verified,true);
 assert.deepEqual(result.stats,{books:1,published_books:1,chapters:1,
  anchor_rows:1,books_with_zero_anchors:0});
 assert.equal(result.content_exported,false);
 assert.equal(result.production_db_writes,0);
 assert.ok(!JSON.stringify(result).includes('content_json'));
});
test('account, order, and novel content fields are forbidden even with valid metadata',()=>{
 for(const [kind,column] of [['books','username'],['chapters','content_json'],
  ['anchors','context_sentence']]){
  const input=valid();
  const key=kind+'Json';
  const rows=JSON.parse(input[key])[0].results;
  rows[0][column]='PRIVATE';
  input[key]=packet(rows);
  assert.throws(()=>validate(input),/PRIVATE_FIELD_OR_SCHEMA/);
 }
});
test('missing current chapter, duplicated anchor, or contradictory book totals fail closed',()=>{
 let input=valid();
 input.chaptersJson=packet([]);
 assert.throws(()=>validate(input),/INVALID_OR_ORPHAN_ANCHOR/);
 input=valid();
 input.anchorsJson=packet([...JSON.parse(input.anchorsJson)[0].results,
 ...JSON.parse(input.anchorsJson)[0].results]);
 assert.throws(()=>validate(input),/DUPLICATE_ANCHOR/);
 input=valid();
 input.booksJson=packet([{...JSON.parse(input.booksJson)[0].results[0],word_anchor_count:2}]);
 assert.throws(()=>validate(input),/BOOK_ANCHOR_COUNT_CHANGED_DURING_EXPORT/);
});
test('only fixed SELECT production workflow, protected manual trigger and encryption',()=>{
 const wf=readFileSync('.github/workflows/v12-production-publisher-metadata-readonly.yml','utf8');
 assert.match(wf,/on:\n  workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n  push:|\n  pull_request:/);
 for(const token of ['github.actor == \'kim-1868\'',
  "github.ref == 'refs/heads/feature/v11-smart-vocab-preflight-20261109'",
  'production-d1-readonly-approval','PRODUCTION_PUBLISHER_METADATA_READ_ONLY',
  'CLOUDFLARE_PROD_D1_READ_TOKEN','PRODUCTION_D1_METADATA_PASSPHRASE',
  '649c71b3-340c-49bf-b806-3d39256851d3',
  'miaowu-english-prod','--remote --json','--command "$query"',
  'SELECT b.id book_id','SELECT ch.id chapter_id','SELECT cw.chapter_id',
  '--symmetric --cipher-algo AES256','cmp -s',
  'v12-production-publisher-metadata-encrypted'])
  assert.ok(wf.includes(token),'missing required export guard '+token);
 assert.doesNotMatch(wf,/d1 migrations apply|d1 export|wrangler deploy|wrangler publish|--file db\//i);
 assert.equal((wf.match(/readonly_query "SELECT/g)||[]).length,3);
});
