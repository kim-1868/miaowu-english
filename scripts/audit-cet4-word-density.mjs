// S84: independent, read-only CET4 story density audit.
// Report is diagnostic, NOT a publishing approval and never calls an API or D1.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildS82DraftBundles} from "./build-six-original-story-packages.mjs";
export const DENSITY={minimum:2.2,preferredMaximum:3.6,hardMaximum:4.3};
const hanCount=value=>(value.match(/\p{Script=Han}/gu)||[]).length;
export function auditChapterDensity(chapter){
 const paragraphs=chapter.paragraphs;
 const han=paragraphs.reduce((n,p)=>n+hanCount(p.segments.map(s=>s.text||"").join("")),0);
 const uses=paragraphs.flatMap(p=>p.segments.filter(s=>s.wordId).map(s=>s.surface));
 const occurrences=uses.length,distinct=new Set(uses).size;
 const ratio=han?occurrences/han*100:0;
 const targetMin=Math.ceil(han*DENSITY.minimum/100);
 const overConcentrated=paragraphs.filter(p=>p.segments.filter(s=>s.wordId).length>5).length;
 return {number:chapter.number,han,occurrences,distinctWords:distinct,
  occurrencesPer100Han:Number(ratio.toFixed(2)),targetMin,
  additionalOccurrencesNeeded:Math.max(0,targetMin-occurrences),
  passedDensity:han>=300&&ratio>=DENSITY.minimum&&ratio<=DENSITY.hardMaximum&&overConcentrated===0,
  overConcentrated,readingQualityReviewRequired:true};
}
export function buildDensityReport(rows){
 const books=rows.map(({bundle,summary})=>{
  const chapters=bundle.chapters.map(auditChapterDensity);
  const han=chapters.reduce((n,c)=>n+c.han,0);
  const uses=bundle.chapters.flatMap(ch=>ch.paragraphs.flatMap(p=>p.segments
   .filter(s=>s.wordId).map(s=>s.surface)));
  const counts=new Map();
  for(const word of uses)counts.set(word,(counts.get(word)||0)+1);
  return {id:summary.id,title:summary.title,chapters,
   totalHan:han,totalOccurrences:uses.length,
   occurrencesPer100Han:Number((uses.length/han*100).toFixed(2)),
   recurrentWords:[...counts].filter(([,n])=>n>=2).length,
   chapterPasses:chapters.filter(c=>c.passedDensity).length,
   missingOccurrences:chapters.reduce((n,c)=>n+c.additionalOccurrencesNeeded,0),
   allChaptersPass:chapters.every(c=>c.passedDensity),
   publicationAllowed:false};
 });
 const status=books.every(b=>b.allChaptersPass)
   ?"DENSITY_TARGET_MET_STILL_REQUIRES_EDITORIAL_REVIEW":"DENSITY_REVISION_REQUIRED";
 return {status,product:"cet4",policy:DENSITY,books,
  chaptersReviewed:books.reduce((n,b)=>n+b.chapters.length,0),
  chaptersPassing:books.reduce((n,b)=>n+b.chapterPasses,0),
  totalOccurrences:books.reduce((n,b)=>n+b.totalOccurrences,0),
  missingOccurrences:books.reduce((n,b)=>n+b.missingOccurrences,0),
  editorApproval:false,canPublish:false,productionDbTouched:false,
  note:"Density is a measurable target only; grammar, word senses, plot quality, IPA and reading flow must be checked separately."};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==1||!["--report","--enforce"].includes(args[0]))
   throw Error("USAGE: node scripts/audit-cet4-word-density.mjs --report|--enforce");
  const report=buildDensityReport(buildS82DraftBundles());
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(args[0]==="--enforce"&&report.status==="DENSITY_REVISION_REQUIRED")process.exitCode=1;
 }catch(e){process.stderr.write(String(e.message||e)+"\n");process.exitCode=1}
}
