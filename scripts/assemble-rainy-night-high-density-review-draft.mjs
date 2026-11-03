// OFFLINE QA assembly only. This is NOT the audited release book.
// Merge 1st chapter's hand-authored high-density rewrite proposal with
// 2–12 lexical proposals, retaining exact original word IDs and CET4 scope.
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {buildHighDensityChapterOneProposal} from "./rewrite-rainy-night-ch01-density-proposal.mjs";
import {buildChapters2to12DensityCandidate} from "./rewrite-rainy-night-ch02-ch12-density-proposal.mjs";
import {auditChapterDensity} from "./audit-cet4-word-density.mjs";
import {validatePackage} from "../src/editorial-content.js";

export function buildRainyNightFullDensityReviewDraft(){
 const {candidate:base}=prepareRainyNightMemberCandidate();
 const first=buildHighDensityChapterOneProposal();
 const rest=buildChapters2to12DensityCandidate();
 const draft=structuredClone(base);
 draft.chapters=[first.chapter,...rest.chapters];
 if(draft.chapters.map(c=>c.number).join(",")!=="1,2,3,4,5,6,7,8,9,10,11,12"||
    draft.chapters.some(c=>c.preview)||draft.book.category!=="cet4")
  throw Error("ALL_ENTITLED_CHAPTER_ORDER_OR_SCOPE_DRIFT");
 const verified=validatePackage(draft);
 const density=draft.chapters.map(auditChapterDensity);
 const totalHan=density.reduce((n,c)=>n+c.han,0);
 const wordAnchors=density.reduce((n,c)=>n+c.occurrences,0);
 const report={
  bookId:draft.book.id,category:draft.book.category,chapters:draft.chapters.length,
  words:draft.words.length,originalAnchors:733,proposalAnchors:verified.mentionCount,
  addedAnchors:verified.mentionCount-733,
  totalHan,occurrencesPer100Han:Number((wordAnchors/totalHan*100).toFixed(2)),
  meanWordsPerParagraph:Number((wordAnchors/
   draft.chapters.reduce((n,c)=>n+c.paragraphs.length,0)).toFixed(2)),
  chaptersPassingStrictDensity:density.filter(x=>x.passedDensity).length,
  paragraphsBelowThree:draft.chapters.reduce((n,ch)=>n+ch.paragraphs.filter(p=>p.segments.filter(s=>s.wordId).length<3).length,0),
  sentenceViolations:density.reduce((n,c)=>n+c.sentenceViolations,0),
  chapterStats:density.map(x=>({chapter:x.number,anchors:x.occurrences,
    meanPerParagraph:x.averagePerParagraph,per100Han:x.occurrencesPer100Han,
    sentencesNeedingEdit:x.sentenceViolations,strictApproved:x.passedDensity})),
  editorialStatus:"UNREVIEWED_PROPOSAL_DO_NOT_IMPORT",
  productionD1Touched:false,allChaptersEntitled:true,freePreviewCount:0,
  reviewedByHuman:false,canPublish:false
 };
 if(report.proposalAnchors!==wordAnchors||report.words!==188||
    report.originalAnchors>=report.proposalAnchors)
  throw Error("FULL_DENSITY_DRAFT_COUNT_DRIFT");
 return {draft,report};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {draft,report}=buildRainyNightFullDensityReviewDraft();
  if(process.argv.includes("--write-private")){
   mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
   writeFileSync(resolve("private-output/rainy-night-12-chapter-high-density-UNREVIEWED.json"),
    JSON.stringify(draft,null,2)+"\n",{mode:0o600,flag:"wx"});
  }else if(!process.argv.includes("--summary"))throw Error("Usage: --summary | --write-private");
  console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(e.message);process.exitCode=1}
}
