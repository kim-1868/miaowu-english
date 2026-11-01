// Private draft-only teaching plan for already-chosen 188 words.
// No public UI, D1 writes or automatic CET level certification.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {verifyOfficial2016FormAudit} from "./check-rainy-night-official-2016-form-audit.mjs";

const src=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json",import.meta.url),"utf8"));
const singleForm=new Set(["blurred","hidden"]);
const derivation=new Set(["childhood","incorrect"]);
const storyOnly=new Set(["falsify","outage","watermark"]);

export function buildRainyNightTeachingTrackPlan(bundle){
 const audit=verifyOfficial2016FormAudit(bundle);
 const byWord=new Map(src.words.map(w=>[w.headword,w]));
 const rows=bundle.words.map(w=>{
  const item=byWord.get(w.headword);
  let track="CET4_FORM_CANDIDATE";
  let note="PDF unstarred word form; POS, sense, IPA and teaching context still unreviewed";
  if(item.formStatus==="CET6_STARRED_HEADWORD_OR_FAMILY"){
   track="CET6_STORY_EXTENSION";
   note="PDF starred CET6 target, cannot count as core CET4 headword";
  }else if(item.formStatus==="NOT_STANDALONE_HEADWORD"){
   if(singleForm.has(w.headword)){
    track="MORPHOLOGY_OF_LISTED_ROOT";
    note="Inflected word: teach with listed root, not as separate official CET4 headword";
   }else if(derivation.has(w.headword)){
    track="MORPHOLOGY_OF_LISTED_ROOT";
    note="Derived word: teach formation using listed base, not a separate official headword";
   }else if(storyOnly.has(w.headword)){
    track="STORY_EXTRA_NOT_IN_SYLLABUS_HEADWORDS";
    note="Not present as an independent 2016 CET headword; may remain in story as assisted vocabulary";
   }else throw Error("UNCLASSIFIED_EXTRA_WORD_"+w.headword);
  }
  return {
   wordId:w.id,headword:w.headword,track,sourceForm:item.formStatus,
   sourcePdfPage:item.pdfPage,sourceBookPage:item.bookPage,
   sourceRoot:item.relatedHeadword||null,
   candidateForReview:true,
   publicationApproved:false,
   meaningPosIpaApproved:false,
   note
  };
 });
 const counts=Object.fromEntries(
 ["CET4_FORM_CANDIDATE","CET6_STORY_EXTENSION","MORPHOLOGY_OF_LISTED_ROOT",
 "STORY_EXTRA_NOT_IN_SYLLABUS_HEADWORDS"].map(s=>[s,rows.filter(x=>x.track===s).length]));
 if(rows.length!==188||counts.CET4_FORM_CANDIDATE!==172||
  counts.CET6_STORY_EXTENSION!==9||counts.MORPHOLOGY_OF_LISTED_ROOT!==4||
  counts.STORY_EXTRA_NOT_IN_SYLLABUS_HEADWORDS!==3)
  throw Error("DRAFT_TRACK_COUNT_DRIFT");
 if(rows.some(x=>x.publicationApproved||x.meaningPosIpaApproved))
  throw Error("TRACK_PLAN_CANNOT_CERTIFY_UNREVIEWED_WORDS");
 return {status:"PRIVATE_TRACK_PLANNING_NOT_PUBLISHED",
  documentSha256:audit.sourceSha256,
  counts,total:rows.length,
  sumCET4CandidateForms:counts.CET4_FORM_CANDIDATE,
  manuallyCertified:0,publishAllowed:false,
  rows};
}
function main(){
 if(process.argv.slice(2).some(x=>x!=="--summary"))
  throw Error("Usage: node scripts/plan-rainy-night-teaching-tracks.mjs --summary");
 const result=buildRainyNightTeachingTrackPlan(composeRainyNightSeasonDraft().bundle);
 const {rows,...summary}=result;
 summary.examplesByTrack=Object.fromEntries(Object.keys(result.counts).map(k=>[
  k,rows.filter(x=>x.track===k).slice(0,12).map(x=>x.headword)]));
 process.stdout.write(JSON.stringify(summary,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
