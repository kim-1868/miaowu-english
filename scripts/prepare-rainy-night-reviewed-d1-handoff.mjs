// Prepare version-locked production D1 update payload ONLY from two real,
// source-bound offline editorial reviews supplied by the publisher.
// No action without BOTH files. No remote writes, SQL execution, or publication.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateReview} from "./build-rainy-night-reviewed-ipa-patch.mjs";
import {buildRainyNightSentenceReviewQueue} from "./build-rainy-night-private-sentence-review.mjs";
import {buildRainyNightFullDensityReviewDraft} from "./assemble-rainy-night-high-density-review-draft.mjs";
import {prepareRainyNightDraftRevisionPlan} from "./prepare-rainy-night-versioned-draft-revision.mjs";

const hex=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const NOTE_SCHEMA="RAINY_NIGHT_HUMAN_SENTENCE_NOTES_V1";
const sentenceNoteValid=note=>note?.decision==="pass"&&
 typeof note.note==="string"&&note.note.trim().length>=15&&note.note.length<=2000&&
 typeof note.editedAt==="string"&&!Number.isNaN(Date.parse(note.editedAt));
export function prepareReviewedRainyNightUpdate({ipaReview,sentenceReview}={}){
 const ipa=validateReview(ipaReview);
 if(!ipa.valid)throw Error("188_IPA_REVIEW_NOT_VERIFIABLE: "+ipa.errors.slice(0,5).join(","));
 const reference=buildRainyNightSentenceReviewQueue();
 if(!sentenceReview||sentenceReview.schema!==NOTE_SCHEMA||
    sentenceReview.bookId!==reference.bookId||
    sentenceReview.sourceDigest!==reference.sourceDigest||
    sentenceReview.issuesTotal!==reference.totalIssues||
    !sentenceReview.notes||typeof sentenceReview.notes!=="object"||
    Array.isArray(sentenceReview.notes))
  throw Error("STORY_REVIEW_FILE_MISSING_OR_STALE");
 const expected=new Set(reference.reviewRows.map(r=>r.id));
 const actual=Object.keys(sentenceReview.notes);
 if(actual.length!==expected.size||actual.some(id=>!expected.has(id))||
    actual.some(id=>!sentenceNoteValid(sentenceReview.notes[id]))||
    sentenceReview.remaining!==0)
  throw Error("STORY_REVIEW_HAS_UNRESOLVED_SENTENCES");
 const {draft,report}=buildRainyNightFullDensityReviewDraft();
 const plan=prepareRainyNightDraftRevisionPlan();
 if(report.proposalAnchors!==1892||report.words!==188||
    report.paragraphsBelowThree!==0||reference.totalIssues!==337||
    draft.chapters.length!==12||draft.chapters.some(c=>c.preview!==false)||
    plan.bookId!==draft.book.id||plan.proposedAnchors!==report.proposalAnchors)
  throw Error("MANUSCRIPT_NOT_THE_SIGNED_VERSION");
 const words=new Map(draft.words.map(w=>[w.id,w]));
 const ipaRows=ipaReview.rows.map(w=>{
  const source=words.get(w.wordId);
  if(!source||source.headword!==w.headword)throw Error("IPA_WORD_MISMATCH");
  return {id:w.wordId,headword:w.headword,phoneticUk:w.phoneticUk,
   phoneticUs:w.phoneticUs,ukProvenance:w.ukProvenance,
   usProvenance:w.usProvenance,reviewedBy:w.reviewedBy,
   reviewedAt:w.reviewedAt,evidenceRef:w.evidenceRef};
 });
 const frozen={
  schemaVersion:"RAINY_NIGHT_REVIEWED_DRAFT_UPDATE_V1",
  bookId:plan.bookId,category:"cet4",bookTitle:"雨夜档案",
  contentSourceHash:reference.sourceDigest,ipaSourceHash:ipa.sourceDigest,
  storyApprovalEvidenceDigest:hex(sentenceReview),
  pronunciationApprovalEvidenceDigest:hex(ipaReview),
  expectedProductionState:{bookStatus:"draft",chapters:12,previewChapters:0,
   publishedChapterCount:0,existingChapterWordAnchors:733,
   previousChapterFingerprint:plan.baseContentFingerprint},
  targetState:{chapters:12,previewChapters:0,wordCards:188,
   wordAnchors:1892,proposedChapterFingerprint:plan.proposedContentFingerprint},
  reviewedChapters:draft.chapters,reviewedWordPronunciations:ipaRows,
  chapterPlans:plan.chapterPlans,
  releaseStage:"READY_FOR_BACKUP_AND_LIVE_CONTENT_COMPARISON_NOT_PUBLISHED",
  safeguards:{requireIndependentProductionD1Backup:true,
   compareEveryLiveChapterToPlanBeforeWrite:true,
   preserveAccountEntitlementAndStudyTables:true,
   requireAtomicUpdateAndWordIndexRebuild:true,
   runProductionReadinessAndRealPaidUnpaidBrowserAcceptance:true,
   requireOpsPublisherVersionBoundManualApprovalAfterImport:true},
  productionD1Touched:false,publishAttempted:false
 };
 return {payload:frozen,summary:{
  bookId:frozen.bookId,chapters:12,words:188,anchors:1892,
  ipaVerifiedBySourceBoundReview:true,
  sentenceReviewItemsVerified:337,
  productionD1Touched:false,publishAttempted:false
 }};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [ipaPath,sentencePath]=process.argv.slice(2);
  if(!ipaPath||!sentencePath||process.argv.length!==4)
   throw Error("Usage: node scripts/prepare-rainy-night-reviewed-d1-handoff.mjs <signed-ipa.json> <signed-story-notes.json>");
  const data=prepareReviewedRainyNightUpdate({
   ipaReview:JSON.parse(readFileSync(resolve(ipaPath),"utf8")),
   sentenceReview:JSON.parse(readFileSync(resolve(sentencePath),"utf8"))
  });
  mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
  writeFileSync(resolve("private-output/rainy-night-REVIEWED-D1-UPDATE-PRECHECK.json"),
   JSON.stringify(data.payload,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("REVIEWED_RAINY_NIGHT_D1_HANDOFF "+JSON.stringify(data.summary));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
