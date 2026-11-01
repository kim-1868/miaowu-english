// S42: one fail-closed, read-only editorial content publication gate.
// Does NOT check payment/Cloudflare entitlements or write to D1.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {auditRainyNight} from "./audit-rainy-night-s1.mjs";
import {createVocabularyReviewQueue} from "./prepare-rainy-night-vocabulary-review.mjs";
import {verifyOfficial2016FormAudit} from "./check-rainy-night-official-2016-form-audit.mjs";
import {buildRainyNightOccurrenceReview} from "./review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "./build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightTeachingTrackPlan} from "./plan-rainy-night-teaching-tracks.mjs";

export function evaluateRainyNightPublicationGate(bundle){
 const qa=auditRainyNight(bundle);
 const wordReview=createVocabularyReviewQueue(bundle).overview;
 const form=verifyOfficial2016FormAudit(bundle);
 const contexts=buildRainyNightOccurrenceReview(bundle).overview;
 const echo=buildEchoReviewPack(bundle);
 const tracks=buildRainyNightTeachingTrackPlan(bundle);
 const gate=[
  {id:"CONTENT_DRAFT_ID_NOT_APPROVED",blocks:bundle.book.id.startsWith("draft-")||/测试/.test(bundle.book.title),
   evidence:"draft book identity remains; never auto-promote"},
  {id:"WORD_POS_AND_SENSE_REVIEW_REQUIRED",blocks:wordReview.totalWords>0,
   outstanding:wordReview.totalWords,
   evidence:"No separately signed headword sense/POS approval artifact exists yet"},
  {id:"ALL_CONTEXTS_EDITORIAL_REVIEW_REQUIRED",blocks:contexts.unreviewed>0,
   outstanding:contexts.unreviewed,evidence:"One editor signoff required per actual anchor"},
  {id:"UK_IPA_REVIEW_REQUIRED",blocks:wordReview.flaggedForIpa>0,
   outstanding:wordReview.flaggedForIpa,sourceCandidates:wordReview.ukCandidatesFound,
   unavailable:wordReview.ukCandidatesMissing},
  {id:"US_IPA_REVIEW_REQUIRED",blocks:wordReview.flaggedForIpa>0,
   outstanding:wordReview.flaggedForIpa,sourceArpabetCandidates:wordReview.usArpaCandidatesFound,
   note:"ARPAbet is not publishable IPA"},
  {id:"CET4_HEADWORD_SENSE_REVIEW_REQUIRED",blocks:wordReview.flaggedForLevel>0,
   outstanding:wordReview.flaggedForLevel,nonStarredCandidateForms:form.formMatchesCET4,
   starredCET6:form.starredCET6,notStandalone:form.notStandalone},
  {id:"STORY_ECHO_ANSWER_REVIEW_REQUIRED",blocks:echo.questions.some(q=>q.reviewStatus!=="EDITOR_APPROVED"),
   outstanding:echo.questions.filter(q=>q.reviewStatus!=="EDITOR_APPROVED").length,
   evidence:"The 36 source-linked fill-in questions are editorial candidates, not deployed"},
  {id:"SEPARATE_PAYMENT_AND_REAL_D1_E2E_SIGNOFF_REQUIRED",blocks:true,
   outstanding:null,evidence:"Payment, operator signoff, test D1 full browser flows are out of scope; never guess completion"}
 ];
 const mismatches=[];
 if(qa.totalMentions!==contexts.occurrenceCount||
   qa.totalMentions!==wordReview.totalMentions)mismatches.push("MANUSCRIPT_ANCHOR_COUNT_DRIFT");
 if(form.words!==wordReview.totalWords||tracks.total!==form.words)
  mismatches.push("WORD_INVENTORY_DRIFT");
 if(echo.total!==36||echo.chapterCount!==bundle.chapters.length)
  mismatches.push("ECHO_QUESTION_COUNT_DRIFT");
 if(bundle.chapters.length!==12)mismatches.push("CHAPTER_COUNT_DRIFT");
 if(qa.releaseStatus!=="BLOCKED_FOR_EDITORIAL_REVIEW")
  mismatches.push("UNEXPECTED_EDITORIAL_AUDIT_STATE");
 const blockers=gate.filter(x=>x.blocks);
 return {status:blockers.length||mismatches.length?"BLOCKED":"READY_FOR_SEPARATE_BUSINESS_APPROVAL",
  bookId:bundle.book.id,publicationAllowed:blockers.length===0&&mismatches.length===0,
  manuscript:{chapters:bundle.chapters.length,distinctWords:wordReview.totalWords,
   annotatedOccurrences:contexts.occurrenceCount,firstPassEchoQuestions:echo.total},
  syllabus:{fourBandCandidateForms:form.formMatchesCET4,starredCET6:form.starredCET6,
   notStandalone:form.notStandalone},pronunciation:{
   ukCandidates:wordReview.ukCandidatesFound,
   ukSupplementalReferences:wordReview.ukGapReferenceCandidatesFound,
   ukSourceReferenceCoverage:wordReview.ukCombinedReferenceCoverage,
   ukSupplementalCommercialApproved:wordReview.ukGapCommercialApprovedCount,
   usArpabetCandidates:wordReview.usArpaCandidatesFound,
   usIpaCandidates:wordReview.usIpaCandidatesFound,
   usIpaAmbiguousWords:wordReview.usIpaVariantsNeedingReview,
   fullyApprovedWords:wordReview.totalWords-wordReview.flaggedForIpa},
  review:{pendingWordSense:wordReview.totalWords,
   pendingOccurrences:contexts.unreviewed,pendingEcho:echo.questions.filter(
    q=>q.reviewStatus!=="EDITOR_APPROVED").length},
  blockers,mismatches,
  productionDbTouched:false,productionReleasePerformed:false};
}
function main(){
 if(process.argv.slice(2).some(x=>x!=="--summary"))
  throw Error("Usage: node scripts/check-rainy-night-publishing-gate.mjs --summary");
 const r=evaluateRainyNightPublicationGate(composeRainyNightSeasonDraft().bundle);
 process.stdout.write(JSON.stringify(r,null,2)+"\n");
 if(r.publicationAllowed)process.stderr.write("Only content preflight passed; still requires business signoff.\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(String(e.message)+"\n");process.exitCode=1}
}
