// Safe, repeatable aggregate-only reporting for the successfully encrypted
// PROD Publisher metadata artifact. Do not print books, chapter IDs or word IDs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function summarizePublisherMetadataPrivate(input) {
  assert.equal(input?.status,'PROD_PUBLISHER_METADATA_ONLY_NO_CONTENT_OR_CUSTOMERS');
  assert.equal(input?.verified,true);
  assert.equal(input?.content_exported,false);
  assert.equal(input?.production_db_writes,0);
  const {books,chapters,anchors}=input.latest_metadata??{};
  assert.ok(Array.isArray(books)&&Array.isArray(chapters)&&Array.isArray(anchors));
  assert.ok(books.length>0&&books.length<=500&&chapters.length<=50000&&anchors.length<=150000);
  const chapterBook=new Map(),byCategory=new Map(),bookAnchors=new Map(),uniqueWords=new Set();
  let contentMetadataBytes=0,unpublishedChapters=0,previewChapters=0;
  for(const b of books) {
    assert.ok(typeof b.book_id==='string'&&b.book_id&&typeof b.category_id==='string');
    assert.ok(['published','draft','coming_soon'].includes(b.status));
    const cat=b.category_id;
    // Distinct category IDs from Publisher may themselves be private or noisy:
    // limit output to counts, not category identifiers, book IDs or titles.
    const x=byCategory.get(cat)??{books:0,published_books:0,chapters:0,anchors:0};
    x.books++;
    if(b.status==='published')x.published_books++;
    byCategory.set(cat,x);
    bookAnchors.set(b.book_id,0);
  }
  for(const ch of chapters){
    assert.ok(bookAnchors.has(ch.book_id)&&!chapterBook.has(ch.chapter_id));
    chapterBook.set(ch.chapter_id,ch.book_id);
    const x=byCategory.get(books.find(b=>b.book_id===ch.book_id).category_id);
    x.chapters++;
    assert.ok(Number.isSafeInteger(Number(ch.content_bytes))&&Number(ch.content_bytes)>=0);
    contentMetadataBytes+=Number(ch.content_bytes);
    if(ch.published_at==null)unpublishedChapters++;
    if(Number(ch.is_preview)===1)previewChapters++;
  }
  for(const row of anchors){
    const bookId=chapterBook.get(row.chapter_id);
    assert.ok(bookId&&typeof row.legacy_word_id==='string');
    bookAnchors.set(bookId,bookAnchors.get(bookId)+1);
    const x=byCategory.get(books.find(b=>b.book_id===bookId).category_id);
    x.anchors++;
    uniqueWords.add(row.legacy_word_id);
  }
  const noAnchors=books.filter(b=>bookAnchors.get(b.book_id)===0).length;
  const publishedNoAnchors=books.filter(b=>b.status==='published'&&bookAnchors.get(b.book_id)===0).length;
  assert.equal(books.length,Number(input.stats.books));
  assert.equal(chapters.length,Number(input.stats.chapters));
  assert.equal(anchors.length,Number(input.stats.anchor_rows));
  assert.equal(noAnchors,Number(input.stats.books_with_zero_anchors));
  const buckets=[...byCategory.values()].sort((a,b)=>b.books-a.books||b.anchors-a.anchors);
  return {
    export_verified:true,source:'encrypted production Publisher metadata 2026-11-12',
    books:books.length,published_books:books.filter(x=>x.status==='published').length,
    chapters:chapters.length,word_anchor_rows:anchors.length,
    distinct_legacy_word_ids:uniqueWords.size,
    books_without_any_anchors:noAnchors,
    published_books_without_any_anchors:publishedNoAnchors,
    unpublished_chapters:unpublishedChapters,preview_chapters:previewChapters,
    category_bucket_counts:buckets,
    // Never claim a per-chapter content hash or reviewed sense: this export
    // has no content bytes and no canonical sense bindings.
    real_text_read:false,content_sha_verified:false,
    contextual_sense_binding_confirmed:false,
    metadata_only:true,production_writes:0,
    warning:'Category IDs, titles, manuscript text, user and order data are intentionally omitted. Not a sense-level audit.'
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try {
    assert.equal(process.argv.length,3,'ONE_PRIVATE_JSON_REQUIRED');
    const path=process.argv[2];
    const result=summarizePublisherMetadataPrivate(JSON.parse(readFileSync(path,'utf8')));
    console.log('PRODUCTION_PUBLISHER_AGGREGATE_ONLY_VERIFIED');
    console.log('PUBLISHER_AGGREGATE_JSON='+JSON.stringify(result));
    console.log('NO_CUSTOMER_ROWS_NO_BOOK_TEXT_NO_PRODUCTION_WRITES');
  }catch(e) {
    console.error('PRODUCTION_PUBLISHER_AGGREGATE_VALIDATION_FAILED',e.message);
    process.exitCode=1;
  }
}
