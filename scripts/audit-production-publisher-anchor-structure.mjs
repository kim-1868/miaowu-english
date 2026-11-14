// Privacy-safe structural diagnostics for the existing encrypted Publisher
// metadata. No book title, book ID, chapter ID or legacy word ID is emitted.
// These are legacy card IDs; they are not vocabulary headwords or reviewed senses.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const median=arr=>{
 if(!arr.length)return 0;
 const a=[...arr].sort((x,y)=>x-y),i=Math.floor(a.length/2);
 return a.length%2?a[i]:(a[i-1]+a[i])/2;
};
const id=x=>typeof x==='string'&&x.length>0&&x.length<200;
const nat=x=>Number.isSafeInteger(Number(x))&&Number(x)>=0;
export function auditPublisherAnchorStructure(metadata){
 assert.equal(metadata?.status,'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS');
 assert.equal(metadata?.verified,true);
 assert.equal(metadata?.content_exported,false);
 assert.equal(metadata?.production_db_writes,0);
 const {books,chapters,anchors}=metadata?.latest_metadata??{};
 assert.ok(Array.isArray(books)&&Array.isArray(chapters)&&Array.isArray(anchors));
 const bookMap=new Map(),chapterMap=new Map(),categoryMap=new Map();
 for(const b of books){
  assert.ok(id(b.book_id)&&id(b.category_id)&&!bookMap.has(b.book_id));
  assert.ok(['published','draft','coming_soon'].includes(b.status));
  assert.ok(nat(b.chapter_count)&&nat(b.word_anchor_count));
  const state={...b,chapterCount:0,anchorCount:0,words:new Set()};
  bookMap.set(b.book_id,state);
  let x=categoryMap.get(b.category_id);
  if(!x){
   x={books:[],globalWordToBooks:new Map(),allAnchors:0,chapterCount:0,
      zeroAnchorChapters:0,publishedAnchors:0};
   categoryMap.set(b.category_id,x);
  }
  x.books.push(state);
 }
 for(const ch of chapters){
  assert.ok(id(ch.chapter_id)&&!chapterMap.has(ch.chapter_id));
  const b=bookMap.get(ch.book_id);
  assert.ok(b&&nat(ch.content_bytes));
  b.chapterCount++;
  const data={ch,b,count:0};
  chapterMap.set(ch.chapter_id,data);
  categoryMap.get(ch.book_id&&b.category_id).chapterCount++;
 }
 for(const a of anchors){
  const ch=chapterMap.get(a.chapter_id);
  assert.ok(ch&&id(a.legacy_word_id));
  ch.count++;
  ch.b.anchorCount++;
  ch.b.words.add(a.legacy_word_id);
  const cat=categoryMap.get(ch.b.category_id);
  cat.allAnchors++;
  if(ch.b.status==='published')cat.publishedAnchors++;
  if(!cat.globalWordToBooks.has(a.legacy_word_id))
   cat.globalWordToBooks.set(a.legacy_word_id,new Set());
  cat.globalWordToBooks.get(a.legacy_word_id).add(ch.b.book_id);
 }
 for(const ch of chapterMap.values())
  if(ch.count===0)categoryMap.get(ch.b.category_id).zeroAnchorChapters++;
 const groups=[];
 for(const x of categoryMap.values()){
  const published=x.books.filter(b=>b.status==='published');
  for(const b of x.books){
   assert.equal(b.chapterCount,Number(b.chapter_count));
   assert.equal(b.anchorCount,Number(b.word_anchor_count));
  }
  const perPublishedBook=published.map(b=>b.anchorCount);
  const perPublishedBookUnique=published.map(b=>b.words.size);
  const repeats=[...x.globalWordToBooks.values()].filter(s=>s.size>1).length;
  groups.push({
   books:x.books.length,published_books:published.length,
   unpublished_books:x.books.length-published.length,
   chapters:x.chapterCount,anchors:x.allAnchors,
   published_anchors:x.publishedAnchors,
   zero_anchor_chapters:x.zeroAnchorChapters,
   median_published_book_anchors:median(perPublishedBook),
   min_published_book_anchors:perPublishedBook.length?Math.min(...perPublishedBook):0,
   max_published_book_anchors:perPublishedBook.length?Math.max(...perPublishedBook):0,
   median_published_book_distinct_legacy_word_ids:median(perPublishedBookUnique),
   distinct_legacy_word_ids_in_category:x.globalWordToBooks.size,
   legacy_word_ids_present_in_multiple_books:repeats
  });
 }
 groups.sort((a,b)=>b.books-a.books||b.anchors-a.anchors);
 assert.equal(groups.reduce((s,x)=>s+x.books,0),books.length);
 assert.equal(groups.reduce((s,x)=>s+x.chapters,0),chapters.length);
 assert.equal(groups.reduce((s,x)=>s+x.anchors,0),anchors.length);
 return {source:'verified encrypted production metadata',category_groups:groups,
  published_books:books.filter(b=>b.status==='published').length,
  zero_anchor_chapters:groups.reduce((s,x)=>s+x.zero_anchor_chapters,0),
  privacy:'AGGREGATES_ONLY_NO_TITLE_NO_ROW_IDS_NO_USER_DATA',
  warning:'Old word IDs are not verified headwords/sense IDs. No chapter content or editorial sense approval in this snapshot.',
  publisher_reads:0,production_writes:0,approved_sense_bindings:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try {
  assert.equal(process.argv.length,3);
  const report=auditPublisherAnchorStructure(JSON.parse(readFileSync(process.argv[2],'utf8')));
  console.log('PRODUCTION_PUBLISHER_ANCHOR_STRUCTURAL_AUDIT_PASS');
  console.log('PUBLISHER_ANCHOR_AUDIT_JSON='+JSON.stringify(report));
  console.log('EXISTING_ENCRYPTED_SNAPSHOT_ONLY_ZERO_DATABASE_CONTACT');
 }catch(e){console.error('PRODUCTION_PUBLISHER_ANCHOR_AUDIT_BLOCKED',e.message);process.exitCode=1}
}
