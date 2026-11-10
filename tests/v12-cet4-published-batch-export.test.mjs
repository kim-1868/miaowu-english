import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {collectPublishedCET4Batch} from '../public/ops-cet4-export.js';
import {unpackAndVerifyCET4LiveBatch} from '../scripts/audit-cet4-published-archive-offline.mjs';
const hash=async value=>createHash('sha256').update(value).digest('hex');
const all=[{id:'mw-sample',title:'样本',category_id:'cet4',status:'published',chapter_count:1},
{id:'mw-six',title:'六级',category_id:'cet6',status:'published',chapter_count:1}];
const pkg={version:1,book:{id:'mw-sample',title:'样本',category:'cet4'},
 chapters:[{id:'ch1',number:1,title:'第一章',paragraphs:[{segments:[{text:'文本'}]}]}],words:[]};
const env=()=>({catalog:all,hash,capturedAt:()=> '2026-11-10T09:30:00.000Z',
 fetchExport:async()=>({package:pkg,version:3}),
 fetchOverview:async()=>({version:3,book:{id:'mw-sample',title:'样本'},chapterCount:1}),
 refreshCatalog:async()=>all});
test('CET4 batch is read-only, version guarded and independently hashed',async()=>{
 const batch=await collectPublishedCET4Batch(env());
 assert.equal(batch.bookCount,1);
 assert.equal(batch.books[0].version,3);
 assert.equal(batch.atomicSnapshot,false);
 assert.equal(batch.containsUserData,false);
 assert.equal(batch.books[0].sha256,await hash(JSON.stringify(pkg)));
 assert.equal(unpackAndVerifyCET4LiveBatch(batch)[0].book.id,'mw-sample');
});
test('version drift and catalog drift block entire bundle',async()=>{
 await assert.rejects(collectPublishedCET4Batch({...env(),
 fetchOverview:async()=>({version:4,book:{id:'mw-sample',title:'样本'},chapterCount:1})}),/VERSION_OR_CONTENT_DRIFT/);
 await assert.rejects(collectPublishedCET4Batch({...env(),refreshCatalog:async()=>[]}),/INVALID_CET4_BOOK_COUNT/);
});
test('tampered manuscripts and duplicated archive entries are rejected offline',async()=>{
 const orig=await collectPublishedCET4Batch(env());
 assert.throws(()=>unpackAndVerifyCET4LiveBatch({...orig,atomicSnapshot:true}),/INVALID_PRIVATE_CET4_EXPORT_FORMAT/);
 const tampered=structuredClone(orig);tampered.books[0].package.chapters[0].title='内容被更改';
 assert.throws(()=>unpackAndVerifyCET4LiveBatch(tampered),/PRIVATE_CET4_EXPORT_CHECKSUM_MISMATCH/);
 const duplicate=structuredClone(orig);duplicate.books.push(structuredClone(duplicate.books[0]));duplicate.bookCount=2;
 assert.throws(()=>unpackAndVerifyCET4LiveBatch(duplicate),/INVALID_PRIVATE_CET4_EXPORT_BOOK/);
});
test('unpublished drafts and other categories do not participate in CET4 exports',async()=>{
 await assert.rejects(collectPublishedCET4Batch({...env(),catalog:all.map(x=>({...x,status:'draft'}))}),/INVALID_CET4_BOOK_COUNT/);
});
