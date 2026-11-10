// Authenticated, read-only reuse of the existing publisher live-editor GET export.
const ID=/^[a-z][a-z0-9_-]{2,79}$/;
const bytes=new TextEncoder();
const sha256=async content=>Array.from(new Uint8Array(
 await crypto.subtle.digest('SHA-256',bytes.encode(content))),
 b=>b.toString(16).padStart(2,'0')).join('');
const goodCatalog=items=>{
 if(!Array.isArray(items))throw Error('INVALID_CET4_CATALOG');
 const books=items.filter(b=>b?.category_id==='cet4'&&b.status==='published');
 if(books.length<1||books.length>50)throw Error('INVALID_CET4_BOOK_COUNT');
 const ids=new Set();
 for(const b of books){
  if(!ID.test(b.id)||ids.has(b.id)||!Number.isSafeInteger(Number(b.chapter_count)))
   throw Error('INVALID_CET4_BOOK_CATALOG');
  ids.add(b.id);
 }
 return books.sort((a,b)=>a.id.localeCompare(b.id,'en'));
};
export async function collectPublishedCET4Batch({
 catalog,fetchExport,fetchOverview,refreshCatalog,onProgress=()=>{},
 hash=sha256,capturedAt=()=>new Date().toISOString()
}){
 if([fetchExport,fetchOverview,refreshCatalog,hash].some(x=>typeof x!=='function'))
  throw Error('MISSING_READ_ONLY_EXPORT_DEPENDENCY');
 const books=goodCatalog(catalog),out=[];
 let totalBytes=0;
 for(let i=0;i<books.length;i++){
  const b=books[i];onProgress({done:i,total:books.length,title:b.title});
  const exported=await fetchExport(b.id);
  const current=await fetchOverview(b.id);
  const p=exported?.package;
  if(!p||p.book?.id!==b.id||p.book?.category!=='cet4'||
     p.book?.title!==b.title||!Array.isArray(p.chapters)||!Array.isArray(p.words)||
     p.chapters.length!==Number(b.chapter_count)||
     !Number.isSafeInteger(exported.version)||exported.version<1||
     current?.version!==exported.version||
     current?.book?.id!==b.id||current?.book?.title!==b.title||
     current?.chapterCount!==p.chapters.length)
   throw Error('LIVE_CET4_VERSION_OR_CONTENT_DRIFT:'+b.id);
  const raw=JSON.stringify(p);
  totalBytes+=bytes.encode(raw).length;
  if(totalBytes>35_000_000)throw Error('CET4_EXPORT_TOO_LARGE');
  out.push({bookId:b.id,title:b.title,version:exported.version,
   chapterCount:p.chapters.length,sha256:await hash(raw),package:p});
 }
 const updated=goodCatalog(await refreshCatalog());
 if(updated.length!==books.length||books.some((b,i)=>updated[i].id!==b.id||
   updated[i].title!==b.title||
   Number(updated[i].chapter_count)!==Number(b.chapter_count)))
  throw Error('LIVE_CET4_CATALOG_CHANGED_RETRY');
 onProgress({done:out.length,total:out.length,title:null});
 return {format:'miaowu-cet4-published-batch-v1',
  capturedAt:capturedAt(),bookCount:out.length,bytes:totalBytes,
  source:'publisher-authorized-live-editor-GET-only',
  atomicSnapshot:false,sourceReviewApproved:false,
  containsPaidStoryContent:true,containsUserData:false,books:out};
}
