// V1.1 P5 owner-side restored-library QA. LOCAL SQLite ONLY; no Cloudflare
// API, remote D1, account access, uploading manuscripts, or data migration.
// stdout is strictly aggregate. Raw source contexts can ONLY be written to a
// new, owner-controlled private path outside this repository (mode 0600).
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync,openSync,closeSync,writeFileSync,constants,realpathSync} from "node:fs";
import {dirname,isAbsolute,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {buildSenseShadow} from "./v11-shadow-sense-audit.mjs";
import {readLocalSenseSnapshot} from "./v11-reviewed-sense-impact.mjs";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const die=code=>{throw Error(code)};
const hash=txt=>createHash("sha256").update(String(txt)).digest("hex");
const count=(items,property)=>items.reduce((n,x)=>n+(x[property]||0),0);
const normalize=x=>String(x||"").normalize("NFKC").trim().toLocaleLowerCase("en-US");
const knownTables=["categories","books","chapters","words","chapter_words"];
const existing=(db,name)=>Boolean(db.prepare(
 "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const validAnchor=/^p([0-9]+):s([0-9]+)$/;
const approvedBooks=book=>book.status==="published";
const readRegistry=()=>JSON.parse(readFileSync(resolve(ROOT,
 "content/operations/published-book-story-tags-v38.json"),"utf8"));

export function auditRestoredLibrary(db,{
 historicRegistry=readRegistry(),includePrivateQueue=false
}={}){
 if(!db||typeof db.prepare!=="function")die("RESTORED_DB_REQUIRED");
 for(const name of knownTables)if(!existing(db,name))
  die("RESTORED_REQUIRED_TABLE_MISSING");
 // Disallow any write after this point even if someone passes a writable local
 // DB connection. CLI separately uses DatabaseSync readOnly:true.
 db.exec("PRAGMA query_only=ON");
 const check=db.prepare("PRAGMA integrity_check").get();
 if(check?.integrity_check!=="ok")die("RESTORED_INTEGRITY_INVALID");
 if(db.prepare("PRAGMA foreign_key_check").all().length)
  die("RESTORED_FOREIGN_KEYS_INVALID");
 if(!Array.isArray(historicRegistry?.records))
  die("RESTORED_HISTORIC_REGISTRY_MISSING");
 const historic=new Map();
 for(const rec of historicRegistry.records){
  if(!rec.bookId||historic.has(rec.bookId))die("RESTORED_HISTORIC_ID_DUPLICATE");
  historic.set(rec.bookId,rec.title);
 }
 const books=db.prepare("SELECT b.id,b.title,b.status,b.category_id,c.slug category_slug,"+
  "c.is_visible FROM books b LEFT JOIN categories c ON c.id=b.category_id "+
  "WHERE b.status='published' ORDER BY b.id").all();
 const bookById=new Map(books.map(b=>[b.id,b]));
 const perBook=new Map(books.map(b=>[b.id,{
  bookId:b.id,title:b.title,category:b.category_slug||b.category_id,
  chapters:0,fullyPublishedChapters:0,unpublishedChapters:0,freePreviewChapters:0,
  uniqueWordIds:0,wordMentions:0,contextIndexes:0,
  missingReferencedWordIds:0,unindexedMentions:0,unmatchedIndexedAnchors:0,
  unknownAnchorFormats:0,emptyContextSentences:0,
  malformedChapterDocuments:0,missingUKIPA:0,missingUSIPA:0,
  missingEnglishExample:0,missingChineseExample:0,mixedPOSCards:0,
  hiddenCategory:b.is_visible!==1
 }]));
 const allWords=db.prepare("SELECT id,headword,part_of_speech,meaning_zh,"+
  "phonetic_uk,phonetic_us,example_en,example_zh FROM words ORDER BY id").all();
 const byWord=new Map(allWords.map(w=>[w.id,w]));
 const referenced=new Map(books.map(b=>[b.id,new Set()]));
 const occurrences=new Map();
 const chapters=db.prepare("SELECT ch.id,ch.book_id,ch.chapter_no,ch.title,ch.content_json,"+
  "ch.is_preview,ch.published_at FROM chapters ch JOIN books b ON b.id=ch.book_id "+
  "WHERE b.status='published' ORDER BY ch.book_id,ch.chapter_no").all();
 const chapterById=new Map(chapters.map(ch=>[ch.id,ch]));
 for(const ch of chapters){
  const info=perBook.get(ch.book_id);
  info.chapters++;
  if(ch.published_at)info.fullyPublishedChapters++;
  else info.unpublishedChapters++;
  if(ch.is_preview===1)info.freePreviewChapters++;
  const mentioned=new Set();
  try{
   const doc=JSON.parse(ch.content_json);
   if(!doc||!Array.isArray(doc.paragraphs))die("INVALID_CHAPTER_STRUCTURE");
   for(const [pi,p] of doc.paragraphs.entries()){
    if(!Array.isArray(p?.segments))die("INVALID_CHAPTER_STRUCTURE");
    for(const [si,seg] of p.segments.entries()){
     if(seg&&typeof seg.wordId==="string"){
      info.wordMentions++;
      const anchor="p"+pi+":s"+si;
      mentioned.add(anchor+"|"+seg.wordId);
      if(!byWord.has(seg.wordId))info.missingReferencedWordIds++;
      else referenced.get(ch.book_id).add(seg.wordId);
     }
    }
   }
  }catch{
   info.malformedChapterDocuments++;
  }
  occurrences.set(ch.id,{mentioned,indexed:new Set()});
 }
 const cardsByBook=new Map(books.map(b=>[b.id,new Set()]));
 const cardContext=new Map();
 const usedByWord=new Map();
 for(const row of db.prepare("SELECT ch.book_id,cw.chapter_id,cw.word_id,"+
  "cw.context_anchor,cw.context_sentence FROM chapter_words cw "+
  "JOIN chapters ch ON ch.id=cw.chapter_id "+
  "JOIN books b ON b.id=ch.book_id WHERE b.status='published' "+
  "ORDER BY cw.word_id,cw.chapter_id,cw.context_anchor").iterate()){
  const info=perBook.get(row.book_id);
  info.contextIndexes++;
  cardsByBook.get(row.book_id).add(row.word_id);
  const used=usedByWord.get(row.word_id)||new Set();
  used.add(row.book_id);usedByWord.set(row.word_id,used);
  const indexed=occurrences.get(row.chapter_id);
  if(!indexed)die("RESTORED_MISSING_CHAPTER_FOR_CONTEXT");
  if(!String(row.context_sentence||"").trim())info.emptyContextSentences++;
  if(validAnchor.test(row.context_anchor)){
   const k=row.context_anchor+"|"+row.word_id;
   indexed.indexed.add(k);
   if(!indexed.mentioned.has(k))info.unmatchedIndexedAnchors++;
  }else info.unknownAnchorFormats++;
  const contexts=cardContext.get(row.word_id)||[];
  if(contexts.length<6)contexts.push({
   bookId:row.book_id,chapterId:row.chapter_id,
   contextSentence:row.context_sentence,wordId:row.word_id
  });
  cardContext.set(row.word_id,contexts);
 }
 for(const ch of chapters){
  const info=perBook.get(ch.book_id),ix=occurrences.get(ch.id);
  info.unindexedMentions+=[...ix.mentioned].filter(k=>!ix.indexed.has(k)).length;
 }
 for(const b of books){
  const info=perBook.get(b.id);
  info.uniqueWordIds=new Set([...referenced.get(b.id),...cardsByBook.get(b.id)]).size;
  for(const id of new Set([...referenced.get(b.id),...cardsByBook.get(b.id)])){
   const w=byWord.get(id);
   if(!w)continue;
   if(!String(w.phonetic_uk||"").trim())info.missingUKIPA++;
   if(!String(w.phonetic_us||"").trim())info.missingUSIPA++;
   if(!String(w.example_en||"").trim())info.missingEnglishExample++;
   if(!String(w.example_zh||"").trim())info.missingChineseExample++;
   if(/[\/／]/.test(String(w.part_of_speech||"")))info.mixedPOSCards++;
  }
 }
 let sourceFingerprint=null,candidateClusters=[],snapshotProblemCodes=[];
 try{
  const audit=buildSenseShadow(readLocalSenseSnapshot(db),null,{includeCandidates:true});
  sourceFingerprint=audit.sourceFingerprint;
  candidateClusters=audit.candidates||[];
  snapshotProblemCodes=audit.blockers.map(x=>x.code);
 }catch{
  snapshotProblemCodes=["REVIEWED_SENSE_FINGERPRINT_UNAVAILABLE"];
 }
 const crossBookCandidates=candidateClusters.filter(c=>{
  const ids=c.wordIds||[];
  const booksUsed=new Set(ids.flatMap(id=>[...(usedByWord.get(id)||[])]));
  return booksUsed.size>1;
 });
 const bookRows=[...perBook.values()];
 const expectedSet=new Set(historic.keys());
 const currentSet=new Set(books.map(x=>x.id));
 const missingHistoric=[...expectedSet].filter(id=>!currentSet.has(id));
 const unexpectedPublished=[...currentSet].filter(id=>!expectedSet.has(id));
 const technicalBlockers=[
  ["MISSING_WORD_IDS",count(bookRows,"missingReferencedWordIds")],
  ["MISSING_CHAPTER_WORD_INDEXES",count(bookRows,"unindexedMentions")],
  ["STORED_INDEX_NOT_IN_CHAPTER",count(bookRows,"unmatchedIndexedAnchors")],
  ["UNRECOGNIZED_CHAPTER_WORD_INDEX_FORMAT",count(bookRows,"unknownAnchorFormats")],
  ["EMPTY_STORY_CONTEXT",count(bookRows,"emptyContextSentences")],
  ["BROKEN_CHAPTER_DOCUMENT",count(bookRows,"malformedChapterDocuments")],
  ["PUBLISHED_BOOK_HAS_UNPUBLISHED_CHAPTER",count(bookRows,"unpublishedChapters")],
  ["MISSING_UK_IPA",count(bookRows,"missingUKIPA")],
  ["MISSING_US_IPA",count(bookRows,"missingUSIPA")],
  ["MISSING_ENGLISH_EXAMPLE",count(bookRows,"missingEnglishExample")],
  ["MISSING_CHINESE_EXAMPLE",count(bookRows,"missingChineseExample")]
 ].filter(([,n])=>n>0).map(([code])=>code);
 const report={
  version:"v11-p5-restored-library/1",
  source:"LOCAL_READ_ONLY_RESTORED_SQLITE_NOT_REMOTE_D1",
  totalPublishedBooks:books.length,
  historicSnapshotBookCount:expectedSet.size,
  historicIdsMatchingPublished:expectedSet.size-missingHistoric.length,
  missingHistoricPublishedCount:missingHistoric.length,
  unexpectedPublishedSinceHistoricCount:unexpectedPublished.length,
  totalChapters:count(bookRows,"chapters"),
  publishedChapters:count(bookRows,"fullyPublishedChapters"),
  notPublishedChapters:count(bookRows,"unpublishedChapters"),
  freePreviewChapters:count(bookRows,"freePreviewChapters"),
  totalWordMentions:count(bookRows,"wordMentions"),
  chapterWordIndexes:count(bookRows,"contextIndexes"),
  missingReferencedWordIds:count(bookRows,"missingReferencedWordIds"),
  unindexedMentions:count(bookRows,"unindexedMentions"),
  unmatchedIndexedAnchors:count(bookRows,"unmatchedIndexedAnchors"),
  unknownAnchorFormats:count(bookRows,"unknownAnchorFormats"),
  emptyContextSentences:count(bookRows,"emptyContextSentences"),
  malformedChapterDocuments:count(bookRows,"malformedChapterDocuments"),
  missingUKIPA:count(bookRows,"missingUKIPA"),
  missingUSIPA:count(bookRows,"missingUSIPA"),
  missingEnglishExample:count(bookRows,"missingEnglishExample"),
  missingChineseExample:count(bookRows,"missingChineseExample"),
  wordIdsSharedAcrossPublishedBooks:[...usedByWord.values()].filter(x=>x.size>1).length,
  differentWordIdsCrossBookSenseCandidates:crossBookCandidates.length,
  fingerprintForHumanReview:sourceFingerprint,
  reviewBlockerCodes:snapshotProblemCodes,
  technicalBlockerCodes:technicalBlockers,
  technicalContentReady:technicalBlockers.length===0&&snapshotProblemCodes.length===0,
  sameAsHistoricBookInventory:missingHistoric.length===0&&unexpectedPublished.length===0,
  humanSenseReviewComplete:false,
  userHistoriesInspected:false,
  automaticMappingEnabled:false,
  productionD1Accessed:false,
  automaticReleaseApproved:false
 };
 const result={summary:report};
 if(includePrivateQueue){
  result.privateQueue={
   version:"v11-p5-restored-private-review/1",
   caution:"PRIVATE OWNER FILE: contains full book titles and limited original story contexts. DO NOT COMMIT/UPLOAD.",
   snapshotFingerprint:sourceFingerprint,
   status:"HUMAN_SEMANTIC_REVIEW_REQUIRED_NO_AUTO_APPROVAL",
   books:bookRows,
   missingHistoricBookIds:missingHistoric,
   unexpectedPublishedBookIds:unexpectedPublished,
   candidates:crossBookCandidates.map(group=>({
    ...group,
    contexts:group.wordIds.flatMap(id=>(cardContext.get(id)||[]).slice(0,2)
      .map(item=>({...item,contextSha256:hash(item.contextSentence)})))
   }))
  };
 }
 return result;
}

function writePrivate(target,queue){
 if(!isAbsolute(target))die("PRIVATE_OUTPUT_ABSOLUTE_PATH_REQUIRED");
 const full=resolve(target);
 const folder=realpathSync(dirname(full));
 const rel=relative(ROOT,folder);
 if(rel===""||rel==="."||(!rel.startsWith(".."+sep)&&rel!==".."))
  die("PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED");
 // Non-overwriting mode 0600. Owner decides where to keep/remove the file.
 const fd=openSync(full,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
 try{writeFileSync(fd,JSON.stringify(queue,null,2)+"\n")}
 finally{closeSync(fd)}
}
function cli(argv){
 const options={db:null,privateOutput:null,requireHistoric:false,requireClean:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==="--local-sqlite")options.db=argv[++i];
  else if(a==="--private-review-queue")options.privateOutput=argv[++i];
  else if(a==="--require-historic-coverage")options.requireHistoric=true;
  else if(a==="--require-clean-content")options.requireClean=true;
  else die("UNRECOGNIZED_AUDIT_ARGUMENT");
 }
 if(!options.db||!isAbsolute(options.db))die("ABSOLUTE_LOCAL_SQLITE_REQUIRED");
 const db=new DatabaseSync(resolve(options.db),{readOnly:true});
 try{
  const r=auditRestoredLibrary(db,{includePrivateQueue:Boolean(options.privateOutput)});
  if(options.privateOutput)writePrivate(options.privateOutput,r.privateQueue);
  process.stdout.write(JSON.stringify(r.summary,null,2)+"\n");
  if(options.requireHistoric&&!r.summary.sameAsHistoricBookInventory)
   process.exitCode=1;
  if(options.requireClean&&!r.summary.technicalContentReady)
   process.exitCode=1;
 }finally{db.close()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{cli(process.argv.slice(2))}
 catch{console.error("V11_RESTORED_LIBRARY_AUDIT_BLOCKED");process.exitCode=1}
}
