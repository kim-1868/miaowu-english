// Private editorial sentence review queue. Does not approve, publish, or touch D1.
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildRainyNightFullDensityReviewDraft} from "./assemble-rainy-night-high-density-review-draft.mjs";
import {auditChapterDensity,DENSITY} from "./audit-cet4-word-density.mjs";
const hanCount=s=>(s.match(/\p{Script=Han}/gu)||[]).length;
const annotate=p=>p.segments.map(s=>s.wordId?"[["+s.surface+"]]":s.text).join("");
const tags=s=>[...s.matchAll(/\[\[([a-z]+)\]\]/g)].map(x=>x[1]);
const SHA=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function buildRainyNightSentenceReviewQueue(){
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 const sourceDigest=SHA(draft.chapters.map(ch=>[ch.id,ch.number,ch.paragraphs]));
 const problems=[],chapterSummary=[];
 for(const chapter of draft.chapters){
  const density=auditChapterDensity(chapter);let chapterIssues=0;
  for(const [i,p] of chapter.paragraphs.entries()){
   const fragments=annotate(p).split(/[。！？]/u);
   for(const [j,sentence] of fragments.entries()){
    const han=hanCount(sentence);
    if(han<DENSITY.longSentenceMinHan)continue;
    const words=tags(sentence);
    const issue=words.length<DENSITY.longSentenceMinAnchors?"LOW":
      words.length>DENSITY.longSentenceMaxAnchors?"HIGH":null;
    if(!issue)continue;
    problems.push({
     id:"ch"+String(chapter.number).padStart(2,"0")+"-p"+String(i+1).padStart(2,"0")+"-s"+String(j+1).padStart(2,"0"),
     chapter:chapter.number,paragraph:i+1,sentence:j+1,han,
     englishAnchors:words.length,existingWords:words,
     kind:issue,priority:words.length===0?"ZERO_EXPOSURE":issue==="HIGH"?"OVERCONCENTRATED":"LOW_EXPOSURE",
     textForPrivateReview:sentence.trim(),
     suggestedAction:"Rewrite context naturally; preserve clue chronology and original word anchors. Never add tokens solely to satisfy a metric.",
     reviewed:false
    });
    chapterIssues++;
   }
  }
  chapterSummary.push({chapter:chapter.number,violations:chapterIssues,referenceViolations:density.sentenceViolations});
  if(chapterIssues!==density.sentenceViolations)throw Error("SENTENCE_AUDIT_INCONSISTENT_"+chapter.number);
 }
 if(problems.length!==report.sentenceViolations)throw Error("TOTAL_SENTENCE_AUDIT_INCONSISTENT");
 return {schema:"RAINY_NIGHT_PRIVATE_SENTENCE_REVIEW_V1",bookId:draft.book.id,sourceDigest,
  wordCount:draft.words.length,chapters:draft.chapters.length,
  status:"DRAFT_PENDING_HUMAN_LANGUAGE_REVIEW",chapterSummary,totalIssues:problems.length,
  zeroEnglishLongSentences:problems.filter(x=>x.englishAnchors===0).length,
  low:problems.filter(x=>x.kind==="LOW").length,
  high:problems.filter(x=>x.kind==="HIGH").length,
  reviewRows:problems,allowedToPublish:false,productionD1Touched:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const data=buildRainyNightSentenceReviewQueue();
  if(process.argv.includes("--write-private")){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-sentences-REVIEW-ONLY.json"),
    JSON.stringify(data,null,2)+"\n",{mode:0o600,flag:"wx"});
  }else if(!process.argv.includes("--summary"))throw Error("USAGE --summary | --write-private");
  const {reviewRows,...summary}=data;
  console.log(JSON.stringify(summary,null,2));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
