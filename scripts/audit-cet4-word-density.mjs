// S84: independent, read-only CET4 story density audit.
// Report is diagnostic, NOT a publishing approval and never calls an API or D1.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {buildS82DraftBundles} from "./build-six-original-story-packages.mjs";
export const DENSITY={minimum:5,preferredMinimum:6,preferredMaximum:9,hardMaximum:12,
 paragraphAverageMin:3,paragraphAverageMax:6,longSentenceMinHan:25,longSentenceMinAnchors:2,
 longSentenceMaxAnchors:5};
const hanCount=value=>(value.match(/\p{Script=Han}/gu)||[]).length;
export function auditChapterDensity(chapter){
 const paragraphs=chapter.paragraphs;
 const han=paragraphs.reduce((n,p)=>n+hanCount(p.segments.map(s=>s.text||"").join("")),0);
 const uses=paragraphs.flatMap(p=>p.segments.filter(s=>s.wordId).map(s=>s.surface));
 const occurrences=uses.length,distinct=new Set(uses).size;
 const ratio=han?occurrences/han*100:0;
 const targetMin=Math.ceil(han*DENSITY.minimum/100);
 const paragraphCounts=paragraphs.map(p=>p.segments.filter(s=>s.wordId).length);
 const averagePerParagraph=paragraphs.length?occurrences/paragraphs.length:0;
 const overConcentrated=paragraphCounts.filter(n=>n>8).length;
 // Chinese full stops, questions, and exclamations delimit narration sentences.
 // Short standalone dialogue and fragments have a lower word density by design.
 const text=paragraphs.map(p=>p.segments.map(s=>s.wordId?"[["+s.surface+"]]":s.text).join("")).join("\\n");
 const sentences=text.split(/[。！？\\n]/).filter(x=>x.trim());
 const substantial=sentences.map(x=>({han:hanCount(x),words:(x.match(/\\[\\[[a-z]+\\]\\]/g)||[]).length}))
  .filter(x=>x.han>=DENSITY.longSentenceMinHan);
 const sentenceViolations=substantial.filter(s=>s.words<DENSITY.longSentenceMinAnchors||
   s.words>DENSITY.longSentenceMaxAnchors).length;
 const meetsParagraphAverage=averagePerParagraph>=DENSITY.paragraphAverageMin&&
   averagePerParagraph<=DENSITY.paragraphAverageMax;
 return {number:chapter.number,han,occurrences,distinctWords:distinct,
  occurrencesPer100Han:Number(ratio.toFixed(2)),targetMin,
  averagePerParagraph:Number(averagePerParagraph.toFixed(2)),
  substantialSentences:substantial.length,sentenceViolations,
  additionalOccurrencesNeeded:Math.max(0,targetMin-occurrences),
  passedDensity:han>=300&&ratio>=DENSITY.minimum&&ratio<=DENSITY.hardMaximum&&
   meetsParagraphAverage&&overConcentrated===0&&sentenceViolations===0,
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
