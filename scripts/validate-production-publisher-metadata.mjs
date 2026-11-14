// Private production Publisher METADATA manifest verification.
// Pure file parser: no Cloudflare connection, token, paid text or user records.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const ID=/^[A-Za-z0-9_-]{1,100}$/u;
const ANCHOR=/^p(?:0|[1-9]\d*):s(?:0|[1-9]\d*)$/u;
const HEADS={
 books:['book_id','category_id','status','title','chapter_count','word_anchor_count'],
 chapters:['chapter_id','book_id','chapter_no','is_preview','published_at','content_bytes'],
 anchors:['chapter_id','legacy_word_id','context_anchor']
};
const STRING=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;
function decodePacket(payload){
 let data;try{data=typeof payload==='string'?JSON.parse(payload):payload}
 catch{throw Error('PROD_METADATA_INVALID_JSON')}
 const packets=Array.isArray(data)?data:[data];
 if(!packets.length||packets.some(x=>x?.success===false))
   throw Error('PROD_METADATA_QUERY_FAILED');
 const rows=packets.flatMap(x=>x?.results??x?.result?.results??[]);
 if(!Array.isArray(rows))throw Error('PROD_METADATA_INVALID_ROWS');
 return rows;
}
function objects(rows,kind){
 if(!Array.isArray(rows)||rows.length>150000)
  throw Error('PROD_METADATA_ROW_LIMIT_'+kind);
 const whitelist=HEADS[kind],out=[];
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||
   Object.keys(row).some(k=>!whitelist.includes(k))||
   whitelist.some(k=>!Object.hasOwn(row,k)))
   throw Error('PROD_METADATA_PRIVATE_FIELD_OR_SCHEMA_'+kind);
  out.push({...row});
 }
 return out;
}
const integer=(n)=>Number.isSafeInteger(Number(n))&&Number(n)>=0;
export function validateProductionPublisherMetadata({booksJson,chaptersJson,anchorsJson}){
 const books=objects(decodePacket(booksJson),'books');
 const chapters=objects(decodePacket(chaptersJson),'chapters');
 const anchors=objects(decodePacket(anchorsJson),'anchors');
 const byBook=new Map(),byChapter=new Map(),perBook=new Map(),perChapter=new Map();
 for(const b of books){
  if(!ID.test(b.book_id)||!ID.test(b.category_id)||
   !['published','draft','coming_soon'].includes(b.status)||
   !STRING(b.title,512)||!integer(b.chapter_count)||!integer(b.word_anchor_count)||
   byBook.has(b.book_id))throw Error('PROD_METADATA_INVALID_OR_DUPLICATE_BOOK');
  byBook.set(b.book_id,b);
  perBook.set(b.book_id,{chapters:0,anchors:0});
 }
 for(const c of chapters){
  if(!ID.test(c.chapter_id)||!ID.test(c.book_id)||
   !integer(c.chapter_no)||!integer(c.content_bytes)||
   ![0,1].includes(Number(c.is_preview))||
   !(c.published_at===null||STRING(c.published_at,48))||
   !byBook.has(c.book_id)||byChapter.has(c.chapter_id))
   throw Error('PROD_METADATA_INVALID_OR_ORPHAN_CHAPTER');
  byChapter.set(c.chapter_id,c);
  perBook.get(c.book_id).chapters++;
 }
 const keys=new Set();
 for(const a of anchors){
  if(!ID.test(a.chapter_id)||!ID.test(a.legacy_word_id)||
   !ANCHOR.test(a.context_anchor)||!byChapter.has(a.chapter_id))
   throw Error('PROD_METADATA_INVALID_OR_ORPHAN_ANCHOR');
  const key=[a.chapter_id,a.legacy_word_id,a.context_anchor].join('|');
  if(keys.has(key))throw Error('PROD_METADATA_DUPLICATE_ANCHOR');
  keys.add(key);
  const bookId=byChapter.get(a.chapter_id).book_id;
  perBook.get(bookId).anchors++;
  perChapter.set(a.chapter_id,(perChapter.get(a.chapter_id)||0)+1);
 }
 for(const b of books){
  const totals=perBook.get(b.book_id);
  assert.equal(totals.chapters,Number(b.chapter_count),
   'PROD_METADATA_BOOK_CHAPTER_COUNT_CHANGED_DURING_EXPORT');
  assert.equal(totals.anchors,Number(b.word_anchor_count),
   'PROD_METADATA_BOOK_ANCHOR_COUNT_CHANGED_DURING_EXPORT');
 }
 return {
  status:'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS',
  verified: true,
  stats:{books:books.length,published_books:books.filter(x=>x.status==='published').length,
   chapters:chapters.length,anchor_rows:anchors.length,
   books_with_zero_anchors:books.filter(b=>perBook.get(b.book_id).anchors===0).length},
  latest_metadata:{books,chapters,anchors},
  content_exported:false,content_hashes_verified:false,
  sense_context_approved:false,learning_write_allowed:false,
  production_db_writes:0
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const [books,chapters,anchors,out]=process.argv.slice(2);
  assert.ok([books,chapters,anchors,out].every(Boolean),'PROD_METADATA_REQUIRED_ARGS');
  const result=validateProductionPublisherMetadata({
   booksJson:readFileSync(books,'utf8'),
   chaptersJson:readFileSync(chapters,'utf8'),
   anchorsJson:readFileSync(anchors,'utf8')
  });
  writeFileSync(out,JSON.stringify(result),{mode:0o600,flag:'wx'});
  // Log only coarse totals. IDs and book titles stay in encrypted artifact.
  console.log('PROD_METADATA_EXPORT_VALIDATED_ENCRYPT_BEFORE_ARTIFACT');
  console.log('PROD_METADATA_NONCONTENT_NO_PERSONAL_DATA_NO_WRITES');
 }catch(e){console.error('PROD_METADATA_FAIL_CLOSED',e.message);process.exitCode=1}
}
