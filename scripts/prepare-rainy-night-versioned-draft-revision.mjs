// Read-only comparison of staged Rainy Night D1 candidate and pending editorial revision.
// No SQL, remote DB request, user data, entitlement modification, or publication.
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate,MEMBER_BOOK_ID} from "./prepare-rainy-night-member-candidate.mjs";
import {buildRainyNightFullDensityReviewDraft} from "./assemble-rainy-night-high-density-review-draft.mjs";
import {validatePackage} from "../src/editorial-content.js";
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const actualContent=ch=>({version:1,paragraphs:ch.paragraphs.map(p=>({
 segments:p.segments.map(s=>s.wordId?{wordId:s.wordId,surface:s.surface,gloss:s.gloss}:{text:s.text})
}))});
function anchors(ch){
 const items=[];
 for(const [p,paragraph] of ch.paragraphs.entries()){
  const context=paragraph.segments.map(s=>s.wordId?s.surface:s.text).join("");
  for(const [i,s] of paragraph.segments.entries())if(s.wordId)
   items.push({chapterId:ch.id,wordId:s.wordId,contextAnchor:"p"+p+":s"+i,contextSentence:context});
 }
 return items;
}
function assertSameWordOrder(oldChapter,newChapter){
 if(oldChapter.paragraphs.length!==newChapter.paragraphs.length)throw Error("PARAGRAPH_COUNT_CHANGED_"+oldChapter.id);
 for(let i=0;i<oldChapter.paragraphs.length;i++){
  const prev=oldChapter.paragraphs[i].segments.filter(s=>s.wordId).map(s=>s.wordId);
  const next=newChapter.paragraphs[i].segments.filter(s=>s.wordId).map(s=>s.wordId);
  let cursor=0;
  for(const wordId of prev){
   const match=next.indexOf(wordId,cursor);
   if(match<cursor)throw Error("STAGED_WORD_ANCHOR_LOST_"+oldChapter.id+"_"+(i+1));
   cursor=match+1;
  }
 }
}
export function prepareRainyNightDraftRevisionPlan(){
 const {candidate:staged}=prepareRainyNightMemberCandidate();
 const {draft:proposed,report}=buildRainyNightFullDensityReviewDraft();
 const a=validatePackage(staged),b=validatePackage(proposed);
 if(a.book.id!==MEMBER_BOOK_ID||b.book.id!==MEMBER_BOOK_ID||
    a.book.category!=="cet4"||b.book.category!=="cet4"||
    JSON.stringify(a.book)!==JSON.stringify(b.book))throw Error("DRAFT_BOOK_SCOPE_CHANGED");
 if(staged.chapters.length!==12||proposed.chapters.length!==12||
    staged.chapters.some(x=>x.preview)||proposed.chapters.some(x=>x.preview))
  throw Error("PAID_ONLY_CHAPTER_POLICY_CHANGED");
 if(staged.words.length!==188||proposed.words.length!==188||
    digest(staged.words)!==digest(proposed.words))throw Error("DRAFT_VOCABULARY_MISMATCH");
 const chapters=[];
 for(let i=0;i<12;i++){
  const before=staged.chapters[i],after=proposed.chapters[i];
  if(before.id!==after.id||before.number!==after.number||before.title!==after.title)
   throw Error("CHAPTER_IDENTIFIER_OR_TITLE_CHANGED_"+i);
  assertSameWordOrder(before,after);
  const beforeAnchors=anchors(before),afterAnchors=anchors(after);
  if(afterAnchors.length<beforeAnchors.length)throw Error("CHAPTER_ANCHOR_REGRESSION_"+i);
  chapters.push({id:before.id,number:before.number,title:before.title,
   existingParagraphs:before.paragraphs.length,
   sourceContentJsonSha256:digest(actualContent(before)),
   proposedContentJsonSha256:digest(actualContent(after)),
   sourceAnchors:beforeAnchors.length,proposedAnchors:afterAnchors.length,
   wouldReplaceAnchorIndex:true,approved:false});
 }
 if(chapters.reduce((n,x)=>n+x.sourceAnchors,0)!==733||
    chapters.reduce((n,x)=>n+x.proposedAnchors,0)!==report.proposalAnchors)
  throw Error("CHAPTER_INDEX_DRIFT");
 return {schemaVersion:"RAINY_NIGHT_DRAFT_REVISION_PREFLIGHT_V1",
  bookId:MEMBER_BOOK_ID,category:"cet4",chapters:chapters.length,
  wordCount:staged.words.length,
  baseContentFingerprint:digest(chapters.map(x=>x.sourceContentJsonSha256)),
  proposedContentFingerprint:digest(chapters.map(x=>x.proposedContentJsonSha256)),
  sourceAnchors:733,proposedAnchors:report.proposalAnchors,
  allChapterPreviewFlagsFalse:true,chapterPlans:chapters,
  releaseGate:"BLOCKED_UNTIL_REAL_EDITORIAL_AND_IPA_SIGNOFF",
  humanReviewOutstanding:{longSentences:report.sentenceViolations,wordsNeedingSignedOffIPA:188},
  migrationConditions:{
   databaseName:"miaowu-english-prod",bookStatus:"draft",allPublishedAtNull:true,
   compareLiveContentFingerprintBeforeAnyWrite:true,
   independentlyBackUpProductionD1:true,
   validatePublishedVersionTriggerAndApprovalInvalidation:true,
   requireAtomicBatchWithExactly12ChapterUpdatesAndRebuiltScopedChapterWordAnchors:true,
   preserveTables:["users","entitlements","activation_codes","user_words","reading_progress","review_events"],
   noUnreviewedTextOrWordMetadataAllowed:true
  },productionD1Touched:false,sqlGenerated:false,publishNow:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.slice(2).join(" ")!=="--summary")throw Error("USAGE --summary");
  console.log(JSON.stringify(prepareRainyNightDraftRevisionPlan(),null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
