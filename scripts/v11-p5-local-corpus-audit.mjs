// V1.1 P5: repository-local published-metadata vs available book-package audit.
// This is NOT a live D1 or 23-book semantic approval. It never downloads
// private data, uploads story contents, or alters word IDs.
import {readFileSync,readdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const read=path=>JSON.parse(readFileSync(join(ROOT,path),"utf8"));
const title=s=>String(s||"").normalize("NFKC").trim().replace(/\s+/g,"");
const wordKey=w=>[w.headword,w.partOfSpeech,w.meaningZh].map(title).join("|");
const nameOf=w=>w.id;
const same=(a,b,keys)=>keys.every(k=>title(a[k])===title(b[k]));
const DEFINITION_FIELDS=["headword","partOfSpeech","meaningZh"];
const PRONUNCIATION_FIELDS=["phoneticUk","phoneticUs"];
export function auditLocalPublishedPackages({
 registry=read("content/operations/published-book-story-tags-v38.json"),
 packages=null
}={}){
 const names=readdirSync(join(ROOT,"content/release-packages"))
  .filter(x=>x.endsWith(".json")&&!x.includes("PRIVATE"))
  .sort();
 const sources=packages||names.map(name=>({
  file:name,record:read("content/release-packages/"+name)
 }));
 if(!Array.isArray(registry.records)||!Array.isArray(sources))
  throw Error("CORPUS_INVENTORY_INVALID");
 const published=registry.records;
 const publishedIds=new Set(published.map(r=>r.bookId));
 const titleRegistry=new Map(published.map(r=>[title(r.title),r.bookId]));
 if(titleRegistry.size!==published.length||publishedIds.size!==published.length)
  throw Error("PUBLISHED_METADATA_DUPLICATES");
 const allWords=new Map(),idUses=new Map();
 const packagesByTitle=new Map(),warnings=new Set(),unknownRefs=[];
 let wordEntries=0,segments=0,wordReferences=0,chapters=0;
 const definitionDrift=new Set(),pronunciationDrift=new Set();
 const crossIdCandidates=new Map();
 for(const {file,record} of sources){
  if(!record||!record.book||!Array.isArray(record.words)||!Array.isArray(record.chapters))
   throw Error("LOCAL_RELEASE_PACKAGE_INVALID");
  const bookTitle=title(record.book.title);
  if(packagesByTitle.has(bookTitle))throw Error("LOCAL_RELEASE_PACKAGE_DUPLICATE_TITLE");
  packagesByTitle.set(bookTitle,file);
  if(!titleRegistry.has(bookTitle))warnings.add("PACKAGE_NOT_IN_PUBLISHED_METADATA");
  const current=new Map();
  for(const w of record.words){
   if(!w.id||!w.headword||!w.partOfSpeech||!w.meaningZh)
    throw Error("LOCAL_PACKAGE_WORD_INCOMPLETE");
   if(current.has(w.id))throw Error("LOCAL_PACKAGE_DUPLICATE_WORD_ID");
   current.set(w.id,w);
   wordEntries++;
   const previous=allWords.get(w.id);
   if(previous){
    if(!same(previous,w,DEFINITION_FIELDS))definitionDrift.add(w.id);
    if(!same(previous,w,PRONUNCIATION_FIELDS))pronunciationDrift.add(w.id);
   }else allWords.set(w.id,w);
   const used=idUses.get(w.id)||new Set();
   used.add(bookTitle);idUses.set(w.id,used);
   const signature=wordKey(w);
   const ids=crossIdCandidates.get(signature)||new Set();
   ids.add(w.id);crossIdCandidates.set(signature,ids);
  }
  const chaptersSeen=new Set();
  for(const ch of record.chapters){
   if(chaptersSeen.has(ch.id))throw Error("LOCAL_PACKAGE_DUPLICATE_CHAPTER");
   chaptersSeen.add(ch.id);chapters++;
   for(const para of ch.paragraphs||[]){
    for(const segment of para.segments||[]){
     segments++;
     if(typeof segment.wordId==="string"){
      wordReferences++;
      if(!current.has(segment.wordId))unknownRefs.push(segment.wordId);
     }
    }
   }
  }
 }
 const matching=published.filter(x=>packagesByTitle.has(title(x.title)));
 const unmatched=published.filter(x=>!packagesByTitle.has(title(x.title)));
 const multiBookIds=[...idUses.values()].filter(set=>set.size>1).length;
 const sameTextDifferentIds=[...crossIdCandidates.values()].filter(set=>set.size>1).length;
 const report={
  version:"v11-p5-local-corpus/1",
  source:"GITHUB_REPOSITORY_FILES_NOT_LIVE_D1",
  metadataSnapshot:registry.source||"local catalog",
  publishedMetadataTitles:published.length,
  availableFullPackageFiles:sources.length,
  titleMatchedToMetadata:matching.length,
  metadataTitlesWithoutRepositoryPackages:unmatched.length,
  chaptersAvailable:chapters,
  wordEntriesInPackages:wordEntries,
  distinctWordIds:allWords.size,
  wordReferences,
  segmentsChecked:segments,
  wordIdsUsedAcrossMultiplePackages:multiBookIds,
  sameTextSenseDifferentIdCandidates:sameTextDifferentIds,
  conflictingSharedWordIdDefinitions:definitionDrift.size,
  conflictingSharedWordIdPronunciations:pronunciationDrift.size,
  missingReferencedWordIds:unknownRefs.length,
  warnings:[...warnings].sort(),
  hasCompleteCurrentPublishedCorpus:false,
  semanticContextHumanReviewed:false,
  actualUserHistoryAudited:false,
  permissionToAutoMergeOldCards:false,
  productionD1Accessed:false,
  verdict:"PARTIAL_REPOSITORY_CONTENT_ONLY_NOT_23_BOOK_SIGNOFF"
 };
 return report;
}
function main(){
 const report=auditLocalPublishedPackages();
 console.log(JSON.stringify(report,null,2));
 if(report.missingReferencedWordIds||report.conflictingSharedWordIdDefinitions)
  process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main();
