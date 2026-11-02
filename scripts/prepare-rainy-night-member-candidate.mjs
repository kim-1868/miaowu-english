// S80: prepare all 12 Rainy Night chapters for the existing member reader.
// This produces an OFFLINE review candidate only, never a public file or D1 write.
// Exposing a non-draft ID here must not be mistaken for publish permission.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {evaluateRainyNightPublicationGate} from "./check-rainy-night-publishing-gate.mjs";
import {validatePackage} from "../src/editorial-content.js";
import {generateSql} from "./build-content-import.mjs";

export const MEMBER_BOOK_ID="rainy-night-archives-cet4-v1";
export function prepareRainyNightMemberCandidate(){
 const {bundle}=composeRainyNightSeasonDraft();
 const sourceGate=evaluateRainyNightPublicationGate(bundle);
 if(sourceGate.publicationAllowed||sourceGate.status!=="BLOCKED")
  throw Error("UNEXPECTED_PUBLISHABLE_SOURCE");
 // Working copy: never modify canonical unreviewed manuscript.
 const candidate=structuredClone(bundle);
 candidate.sourceLabel="rainy-night-membership-candidate-S80-UNREVIEWED-NO-DEPLOY";
 candidate.book={
   id:MEMBER_BOOK_ID,category:"cet4",title:"雨夜档案",
   description:"一封深夜来信，让林予安再次追寻失踪姐姐留下的秘密。跟随十二章原创轻悬疑故事，在人物的选择与线索中接触英语词汇。",
   coverKey:"rainy-night-cover.webp"
 };
 candidate.chapters.forEach((ch,i)=>{ch.preview=false;});
 const validated=validatePackage(candidate);
 if(candidate.chapters.length!==12||validated.mentionCount!==733||
    candidate.words.length!==188||candidate.chapters.filter(ch=>ch.preview).length!==0)
   throw Error("MEMBER_CANDIDATE_MANUSCRIPT_DRIFT");
 // Test import shape; SQL is an offline DRAFT-only staging artifact.
 const importShape=generateSql(candidate);
 if(importShape.summary.publication!=="draft-only"||
    importShape.sql.includes("UPDATE books SET status='published'")||
    !importShape.sql.includes("published_at"))
   throw Error("UNSAFE_IMPORT_SHAPE");
 const report={
  stage:"PRIVATE_MEMBER_READER_CANDIDATE_NOT_APPROVED",
  bookId:MEMBER_BOOK_ID,commercialReleaseAllowed:false,d1Touched:false,
  chapterCount:12,freePreviewChapters:[],entitledChapterNumbers:[1,2,3,4,5,6,7,8,9,10,11,12],
  targetWordCount:188,wordReferences:733,
  existingReaderEndpoints:["/api/categories/:slug/books","/api/books/:bookId/chapters",
    "/api/chapters/:chapterId","/api/chapters/:chapterId/words","/api/me/progress","/api/me/words"],
  draftImportOnly:true,sourceGateStatus:sourceGate.status,
  review:{pendingWordSense:sourceGate.review.pendingWordSense,
   pendingOccurrences:sourceGate.review.pendingOccurrences,
   pendingEcho:sourceGate.review.pendingEcho,
   missingPronunciationApproval:true},
  note:"Do not import or release to production. No source IPAs were reviewed or invented. No preview; all 12 chapters require CET4 entitlement after a separate approved publication."
 };
 return {candidate,report};
}
export function savePrivateCandidate({candidate,report},destination=resolve("private-output","rainy-night-member")){
 mkdirSync(destination,{recursive:true,mode:0o700});
 const content=join(destination,"rainy-night-s1-member-DRAFT-UNREVIEWED.json");
 const audit=join(destination,"reader-preflight.json");
 writeFileSync(content,JSON.stringify(candidate,null,2)+"\n",{flag:"wx",mode:0o600});
 writeFileSync(audit,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 return {content,audit};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&!["--check","--write-private"].includes(args[0]))){
  process.stderr.write("USAGE: prepare-rainy-night-member-candidate.mjs --check|--write-private\n");
  process.exitCode=1;
 }else{
  try{
   const output=prepareRainyNightMemberCandidate();
   if(args.includes("--write-private"))savePrivateCandidate(output);
   process.stdout.write(JSON.stringify(output.report,null,2)+"\n");
  }catch(e){process.stderr.write(String(e.message||e)+"\n");process.exitCode=1}
 }
}
