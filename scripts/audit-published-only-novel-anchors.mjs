// Production Publisher metadata audit, published BOOKS ONLY.
// No book/chapter ID, title, category ID, word ID or private content leaves runner.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const median=items=>{const a=[...items].sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
export function auditPublishedOnly(metadata){
 assert.equal(metadata?.verified,true);
 assert.equal(metadata?.status,'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS');
 assert.equal(metadata?.content_exported,false);
 assert.equal(metadata?.production_db_writes,0);
 const {books,chapters,anchors}=metadata?.latest_metadata??{};
 assert.ok(Array.isArray(books)&&Array.isArray(chapters)&&Array.isArray(anchors));
 const allBooks=new Map(),published=new Map(),chaptersById=new Map(),byCategory=new Map();
 for(const b of books){
  assert.ok(typeof b.book_id==='string'&&b.book_id&&!allBooks.has(b.book_id));
  assert.ok(['draft','coming_soon','published'].includes(b.status));
  allBooks.set(b.book_id,b);
  if(b.status!=='published')continue; // intentionally discard unpublished books
  const info={id:b.book_id,category:b.category_id,chapters:0,anchors:0,unique:new Set(),
   liveChapters:0,liveAnchors:0,zeroAnchors:0,maxChapter:0};
  published.set(b.book_id,info);
  if(!byCategory.has(b.category_id))byCategory.set(b.category_id,{books:[],wordBooks:new Map(),chapters:0,liveChapters:0,anchors:0});
  byCategory.get(b.category_id).books.push(info);
 }
 for(const c of chapters){
  assert.ok(typeof c.chapter_id==='string'&&c.chapter_id&&!chaptersById.has(c.chapter_id));
  assert.ok(allBooks.has(c.book_id));
  chaptersById.set(c.chapter_id,{book:c.book_id,live:c.published_at!==null&&c.published_at!==undefined,count:0});
  const p=published.get(c.book_id);
  if(!p)continue;
  p.chapters++;byCategory.get(p.category).chapters++;
  if(c.published_at!=null){p.liveChapters++;byCategory.get(p.category).liveChapters++;}
 }
 for(const a of anchors){
  const ch=chaptersById.get(a.chapter_id);
  assert.ok(ch&&typeof a.legacy_word_id==='string'&&a.legacy_word_id);
  ch.count++;
  const p=published.get(ch.book);
  if(!p)continue;
  p.anchors++;p.unique.add(a.legacy_word_id);
  if(ch.live)p.liveAnchors++;
  const group=byCategory.get(p.category);group.anchors++;
  if(!group.wordBooks.has(a.legacy_word_id))group.wordBooks.set(a.legacy_word_id,new Set());
  group.wordBooks.get(a.legacy_word_id).add(p.id);
 }
 for(const ch of chaptersById.values()){
  const p=published.get(ch.book);
  if(!p)continue;
  p.maxChapter=Math.max(p.maxChapter,ch.count);
  if(ch.count===0)p.zeroAnchors++;
 }
 const groups=[];
 for(const g of byCategory.values()){
  const anchorsPerBook=g.books.map(b=>b.anchors);
  groups.push({
   published_books:g.books.length,chapters_in_published_books:g.chapters,
   released_chapters_in_published_books:g.liveChapters,
   legacy_anchor_rows:g.anchors,
   published_book_anchors_median:median(anchorsPerBook),
   published_book_anchors_min:Math.min(...anchorsPerBook),
   published_book_anchors_max:Math.max(...anchorsPerBook),
   published_books_over_500_anchors:g.books.filter(b=>b.anchors>500).length,
   published_books_over_1000_anchors:g.books.filter(b=>b.anchors>1000).length,
   zero_anchor_chapters:g.books.reduce((n,b)=>n+b.zeroAnchors,0),
   distinct_legacy_word_ids:g.wordBooks.size,
   shared_legacy_word_ids_across_published_books:[...g.wordBooks.values()].filter(ids=>ids.size>1).length,
   median_distinct_legacy_word_ids_per_published_book:median(g.books.map(b=>b.unique.size))
  });
 }
 groups.sort((a,b)=>b.published_books-a.published_books||b.legacy_anchor_rows-a.legacy_anchor_rows);
 return {
  status:'PUBLISHED_BOOKS_ONLY_NO_UNPUBLISHED_TASKS',
  book_scope:'published',published_books:published.size,
  published_book_chapters:groups.reduce((n,x)=>n+x.chapters_in_published_books,0),
  released_chapters:groups.reduce((n,x)=>n+x.released_chapters_in_published_books,0),
  legacy_anchor_rows:groups.reduce((n,x)=>n+x.legacy_anchor_rows,0),
  zero_anchor_chapters:groups.reduce((n,x)=>n+x.zero_anchor_chapters,0),
  groups,unpublished_books_processed:0,private_identifiers_emitted:0,
  reviewed_sense_bindings_created:0,production_writes:0,
  warning:'Legacy word IDs are not unique English headwords or approved sense IDs; content and semantics were not exported.'
 };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  assert.equal(process.argv.length,3);
  const result=auditPublishedOnly(JSON.parse(readFileSync(process.argv[2],'utf8')));
  console.log('PUBLISHED_ONLY_PRODUCTION_STRUCTURE_VERIFIED');
  console.log('PUBLISHED_ONLY_AGGREGATE='+JSON.stringify(result));
  console.log('UNPUBLISHED_BOOKS_SKIPPED_NO_PRODUCTION_DB_CONTACT');
 }catch(e){console.error('PUBLISHED_ONLY_AUDIT_BLOCKED',e.message);process.exitCode=1}
}
