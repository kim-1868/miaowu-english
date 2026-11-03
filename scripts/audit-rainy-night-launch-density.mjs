// Read-only audit of the actual private Rainy Night book against the
// user's confirmed high-density Chinese-plus-English teaching style.
// Never rewrite or publish any content, or access remote D1.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {auditChapterDensity,DENSITY} from "./audit-cet4-word-density.mjs";

export function auditRainyNightLaunchDensity(){
 const {candidate}=prepareRainyNightMemberCandidate();
 const chapters=candidate.chapters.map(auditChapterDensity);
 const totalHan=chapters.reduce((sum,x)=>sum+x.han,0);
 const totalOccurrences=chapters.reduce((sum,x)=>sum+x.occurrences,0);
 const paragraphs=candidate.chapters.reduce((n,c)=>n+c.paragraphs.length,0);
 const minimumOccurrences=chapters.reduce((n,c)=>n+c.targetMin,0);
 return {
  bookId:candidate.book.id,
  chapterCount:chapters.length,
  distinctWords:candidate.words.length,
  totalHan,totalOccurrences,paragraphs,
  occurrencesPer100Han:Number((totalOccurrences/totalHan*100).toFixed(2)),
  meanWordsPerParagraph:Number((totalOccurrences/paragraphs).toFixed(2)),
  minimumOccurrences,additionalOccurrencesNeeded:Math.max(0,minimumOccurrences-totalOccurrences),
  chapterPasses:chapters.filter(c=>c.passedDensity).length,
  minTargetPer100Han:DENSITY.minimum,expectedWordsPerParagraph:[DENSITY.paragraphAverageMin,DENSITY.paragraphAverageMax],
  chapterDetails:chapters.map(({number,han,occurrences,averagePerParagraph,occurrencesPer100Han,additionalOccurrencesNeeded,passedDensity})=>({
   number,han,occurrences,averagePerParagraph,occurrencesPer100Han,additionalOccurrencesNeeded,passedDensity
  })),
  meetsConfirmedLearningDensity:chapters.every(c=>c.passedDensity),
  status:chapters.every(c=>c.passedDensity)?"DENSITY_TARGET_REACHED":"READER_DENSITY_REVISION_REQUIRED",
  productionD1Touched:false,publishingAllowed:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=auditRainyNightLaunchDensity();
 console.log(JSON.stringify(report,null,2));
 if(process.argv.includes("--enforce")&&!report.meetsConfirmedLearningDensity)process.exitCode=1;
}
