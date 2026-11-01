// Editorial QA only. Produces a private audit queue; never marks a word verified,
// publishes manuscript text, or accesses Cloudflare D1.
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "./audit-rainy-night-s1.mjs";
import {resolve} from "node:path";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const UK_SOURCE=JSON.parse(readFileSync(new URL("../content/editorial/rainy-night-s1-britfone-uk-ipa-candidates.json",import.meta.url),"utf8"));
if(UK_SOURCE.status!=="UNVERIFIED_CANDIDATES_PRIVATE_EDITORIAL_ONLY")
 throw Error("UK IPA candidates must remain explicitly unreviewed");
function csv(value){
 const s=String(value??"");
 return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function createVocabularyReviewQueue(bundle){
 const words=new Map(bundle.words.map(w=>[w.id,w]));
 const pronunciationCandidates=new Map(UK_SOURCE.words.map(w=>[w.headword,w]));
 if(pronunciationCandidates.size!==bundle.words.length||
   !bundle.words.every(w=>pronunciationCandidates.has(w.headword)))
  throw Error("British IPA candidate source must match exactly the editable word set");
 const usage=new Map(bundle.words.map(w=>[w.id,{
    count:0,chapters:new Map(),first:null,example:null
 }]));
 for(const chapter of bundle.chapters){
  for(let pi=0;pi<chapter.paragraphs.length;pi++){
   const para=chapter.paragraphs[pi];
   const parts=para.segments;
   for(let si=0;si<parts.length;si++){
    const seg=parts[si];
    if(!seg.wordId)continue;
    if(!words.has(seg.wordId))throw Error("Unknown word "+seg.wordId);
    const entry=usage.get(seg.wordId);
    entry.count++;
    entry.chapters.set(chapter.number,(entry.chapters.get(chapter.number)||0)+1);
    if(!entry.first){
      entry.first={chapter:chapter.number,paragraph:pi+1,segment:si+1};
      // Sentence is locally synthesized; do not copy full paid content into a public file.
      entry.example=parts.map(s=>s.text??s.surface).join("").slice(0,150);
    }
   }
  }
 }
 const rows=bundle.words.map(w=>{
  const u=usage.get(w.id);
  const hasIpa=!!(w.phoneticUk?.trim()&&w.phoneticUs?.trim());
  const verifiedLevel=w.verifiedCET4===true;
  const missingExample=!(w.exampleEn?.trim()&&w.exampleZh?.trim());
  const ukCandidate=pronunciationCandidates.get(w.headword);
  const possibleUkPronunciations=ukCandidate.phoneticUkCandidates;
  if(ukCandidate.humanVerified!==false||ukCandidate.selectedCandidate!==null)
   throw Error("Source phonetics must never be promoted to approved pronunciation");
  const reviewFlags=[
   !hasIpa?"IPA_NOT_VERIFIED":null,
   !verifiedLevel?"CET4_NOT_VERIFIED":null,
   !u.count?"NEVER_APPEARS":null,
   u.count===1?"ONE_APPEARANCE":null,
   u.chapters.size===1?"SINGLE_CHAPTER":null,
   missingExample?"BILINGUAL_EXAMPLE_MISSING":null,
   possibleUkPronunciations.length===0?"UK_IPA_NOT_IN_SOURCE":null,
   possibleUkPronunciations.length>1?"UK_IPA_VARIANT_NEEDS_SENSE_REVIEW":null
  ].filter(Boolean);
  const priority=u.count===0?"CRITICAL":u.count===1?"HIGH":
    u.chapters.size===1?"REPETITION_REVIEW":"NORMAL";
  return {wordId:w.id,headword:w.headword,partOfSpeech:w.partOfSpeech||"",
   meaningZh:w.meaningZh,mentions:u.count,chapterCount:u.chapters.size,
   chapters:[...u.chapters.keys()].sort((a,b)=>a-b),firstChapter:u.first?.chapter??null,
   firstParagraph:u.first?.paragraph??null,
   firstContext:u.example||"",exampleEn:w.exampleEn||"",exampleZh:w.exampleZh||"",
   collocations:w.collocations?.length||0,
   phoneticUk:w.phoneticUk||"",phoneticUs:w.phoneticUs||"",
   sourceUkCandidates:possibleUkPronunciations.join(" | "),
   sourceUkCandidatesCount:possibleUkPronunciations.length,
   sourceUkProvenance:UK_SOURCE.source+"#"+UK_SOURCE.sourceSha,
   verifiedCET4:verifiedLevel,reviewFlags,priority,
   reviewer:"",ipaSource:"",cet4LevelSource:"",reviewDecision:"UNREVIEWED"};
 }).sort((a,b)=>{
  const order={CRITICAL:0,HIGH:1,REPETITION_REVIEW:2,NORMAL:3};
  return order[a.priority]-order[b.priority]||a.mentions-b.mentions||a.headword.localeCompare(b.headword);
 });
 const counts=Object.fromEntries(["CRITICAL","HIGH","REPETITION_REVIEW","NORMAL"].map(p=>[
   p,rows.filter(r=>r.priority===p).length]));
 const overview={status:"EDITORIAL_ONLY_NOT_CET4_CERTIFICATION",totalWords:rows.length,
  flaggedForLevel:rows.filter(r=>!r.verifiedCET4).length,
  flaggedForIpa:rows.filter(r=>!r.phoneticUk||!r.phoneticUs).length,
  totalMentions:rows.reduce((a,r)=>a+r.mentions,0),
  acrossTwoOrMore:rows.filter(r=>r.chapterCount>=2).length,
  oneMentionWords:rows.filter(r=>r.mentions===1).length,
  singleChapterWords:rows.filter(r=>r.chapterCount===1).length,
  ukCandidatesFound:rows.filter(r=>r.sourceUkCandidatesCount>0).length,
  ukCandidatesMissing:rows.filter(r=>r.sourceUkCandidatesCount===0).length,
  ukVariantsNeedingReview:rows.filter(r=>r.sourceUkCandidatesCount>1).length,
  ukCandidateSource:UK_SOURCE.source,
  ukCandidateSourceSha:UK_SOURCE.sourceSha,
  ukCandidateLicence:UK_SOURCE.license,
  priorityCounts:counts,notPublished:true};
 return {rows,overview};
}
export function reviewCsv({rows}){
 const columns=["wordId","headword","partOfSpeech","meaningZh","mentions","chapterCount",
 "chapters","firstChapter","firstParagraph","firstContext","exampleEn","exampleZh",
 "collocations","phoneticUk","phoneticUs","sourceUkCandidates",
 "sourceUkCandidatesCount","sourceUkProvenance",
 "verifiedCET4","reviewFlags","priority",
 "reviewer","ipaSource","cet4LevelSource","reviewDecision"];
 return [columns.join(","),
  ...rows.map(r=>columns.map(k=>csv(Array.isArray(r[k])?r[k].join("|"):r[k])).join(","))]
  .join("\n")+"\n";
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>!["--summary","--write-private"].includes(x)))
  throw Error("Usage: node scripts/prepare-rainy-night-vocabulary-review.mjs [--summary|--write-private]");
 const {bundle}=composeRainyNightSeasonDraft();
 const queue=createVocabularyReviewQueue(bundle);
 const audit=auditRainyNight(bundle);
 if(queue.overview.totalMentions!==audit.totalMentions)
  throw Error("Vocabulary review must use assembled manuscript rather than stale planned counts");
 if(args.includes("--write-private")){
  const directory=resolve("private-output");mkdirSync(directory,{recursive:true,mode:0o700});
  writeFileSync(resolve(directory,"rainy-night-s1-vocabulary-review-UNVERIFIED.csv"),
    reviewCsv(queue),{encoding:"utf8",mode:0o600});
  writeFileSync(resolve(directory,"rainy-night-s1-vocabulary-review-summary.json"),
    JSON.stringify(queue.overview,null,2)+"\n",{encoding:"utf8",mode:0o600});
 }
 process.stdout.write(JSON.stringify(queue.overview,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
