// Read-only V1.1 editorial import-package audit. Never modifies novels or D1.
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const packageDir="content/release-packages";
const defaults=()=>readdirSync(resolve(packageDir)).filter(name=>name.endsWith(".json"))
 .sort().map(name=>packageDir+"/"+name);
const present=v=>typeof v==="string"&&v.trim().length>0;
const normalized=v=>String(v||"").normalize("NFKC").toLocaleLowerCase("en-US").trim().replace(/\s+/g," ");
const signature=w=>[normalized(w.headword),normalized(w.partOfSpeech),normalized(String(w.meaningZh||"").split(/[；;]/)[0])].join("|");
export function auditPackages(packages){
 if(!Array.isArray(packages)||!packages.length)throw Error("NO_PACKAGES");
 const issues=[],summaries=[],ids=new Map(),meaningGroups=new Map();
 let refs=0,duplicates=0;
 for(const {path,doc} of packages){
  if(!doc||!Array.isArray(doc.words)||!Array.isArray(doc.chapters))
   throw Error("INVALID_PACKAGE_STRUCTURE:"+path);
  const local=new Map(),seenChapter=new Set(),seenRef=new Set();
  let chapterRefs=0;
  const add=(type,location,detail)=>issues.push({type,package:path,location,detail});
  for(const w of doc.words){
   const id=String(w?.id||"");
   if(!id||!present(w.headword)){add("INVALID_WORD",id,"missing ID or English headword");continue}
   if(local.has(id))add("DUPLICATE_WORD_ID",id,"duplicate word within book");
   local.set(id,w);
   if(ids.has(id)){
    duplicates++;
    const old=ids.get(id);
    const sameCore=["headword","partOfSpeech","meaningZh"].every(k=>normalized(old[k])===normalized(w[k]));
    if(!sameCore)add("CROSS_BOOK_ID_CONFLICT",id,"shared ID has mismatching sense fields");
   }else ids.set(id,w);
   const key=signature(w);
   if(meaningGroups.has(key)&&meaningGroups.get(key)!==id)
    add("PARALLEL_SENSE_IDS",id,"same normalized headword, POS and teaching meaning uses multiple IDs");
   else meaningGroups.set(key,id);
   for(const field of ["phoneticUk","phoneticUs","partOfSpeech","meaningZh","exampleEn","exampleZh"]){
    if(!present(w[field]))add("MISSING_LEARNING_METADATA",id,field);
   }
   if(!Array.isArray(w.collocations)||w.collocations.length===0){
    add("MISSING_COLLOCATION",id,"no curated bilingual collocation; UI may hide the section");
   }else if(w.collocations.some(p=>!p||!present(p.en)||!present(p.zh))){
    add("INVALID_COLLOCATION",id,"bilingual collocation contains incomplete entries");
   }
  }
  for(const ch of doc.chapters){
   const chId=String(ch?.id||"");
   if(!chId||seenChapter.has(chId))add("INVALID_CHAPTER_ID",chId,"missing/duplicate chapter id");
   seenChapter.add(chId);
   for(const paragraph of ch.paragraphs||[]){
    if(!Array.isArray(paragraph?.segments)){add("INVALID_PARAGRAPH",chId,"missing segments array");continue}
    for(const seg of paragraph.segments){
     if(!seg||!seg.wordId)continue;
     chapterRefs++;refs++;
     seenRef.add(seg.wordId);
     const word=local.get(seg.wordId);
     if(!word)add("DANGLING_WORD_REFERENCE",chId,seg.wordId);
     else if(present(seg.surface)&&normalized(seg.surface)!==normalized(word.headword)){
      // An inflected English form is allowed; flag for human review only.
      add("SURFACE_VARIANT_REVIEW",chId,seg.wordId+" "+seg.surface+" -> "+word.headword);
     }
    }
   }
  }
  for(const w of doc.words)if(w?.id&&!seenRef.has(w.id))
   add("UNUSED_WORD_CARD",w.id,"listed card has no chapter use");
  summaries.push({package:path,title:doc.book?.title||"",chapters:doc.chapters.length,
   cards:doc.words.length,wordOccurrences:chapterRefs,distinctUsed:seenRef.size});
 }
 const counts=Object.fromEntries([...new Set(issues.map(x=>x.type))].sort().map(type=>[type,issues.filter(x=>x.type===type).length]));
 const blockers=issues.filter(x=>!["MISSING_COLLOCATION","SURFACE_VARIANT_REVIEW","PARALLEL_SENSE_IDS"].includes(x.type));
 return {ok:blockers.length===0,packageCount:packages.length,chapters:summaries.reduce((n,x)=>n+x.chapters,0),
  cardDefinitions:summaries.reduce((n,x)=>n+x.cards,0),
  uniqueWordIds:ids.size,crossBookSharedDefinitions:duplicates,wordOccurrences:refs,
  issues,counts,summaries,blockers:blockers.length};
}
export function auditFiles(paths=defaults()){
 const packages=paths.map(path=>({path,doc:JSON.parse(readFileSync(resolve(path),"utf8"))}));
 return auditPackages(packages);
}
const called=process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]);
if(called){
 const args=process.argv.slice(2),paths=args.filter(s=>!s.startsWith("--"));
 const report=auditFiles(paths.length?paths:defaults());
 console.log(JSON.stringify(report,null,2));
 if(!report.ok||args.includes("--strict")&&report.issues.length)process.exitCode=1;
}
