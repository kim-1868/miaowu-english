// S34: offline cross-check of proposed CET4 teaching words, NOT an official exam certification.
// The underlying community transcription is NOT bundled in this repository.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";

const json=JSON.parse(readFileSync(
 new URL("../content/editorial/rainy-night-s1-cet2016-crosscheck-UNVERIFIED.json",import.meta.url),"utf8"));

export function checkRainyNightCET4Candidates(bundle){
 if(json.reviewStatus!=="UNVERIFIED_COMMUNITY_TRANSCRIPTION_CROSSCHECK")
  throw Error("CET_CROSSCHECK_MUST_REMAIN_UNVERIFIED");
 if(!json.officialSyllabusUrl.startsWith("https://cet.neea.edu.cn/"))
  throw Error("CET_SOURCE_LINK_MISSING");
 const known=new Set(["FOUR_BAND_CANDIDATE","CET6_STARRED","NOT_FOUND_IN_TRANSCRIPTION"]);
 const rows=new Map();
 for(const row of json.words){
  if(!/^[a-z]+$/.test(row.headword)||!known.has(row.provisionalMatch)||
    row.officialVerified!==false||row.requiresContextAndSourceReview!==true)
   throw Error("BAD_UNVERIFIED_WORD_ROW");
  if(rows.has(row.headword))throw Error("DUPLICATE_WORD_"+row.headword);
  rows.set(row.headword,row);
 }
 if(bundle.words.length!==rows.size)throw Error("CET_CHECK_WORD_COUNT_MISMATCH");
 for(const word of bundle.words){
  if(!rows.has(word.headword))throw Error("CET_CHECK_MISSING_"+word.headword);
  if(word.verifiedCET4===true)throw Error("PREMATURE_OFFICIAL_LEVEL_APPROVAL_"+word.headword);
 }
 const counted={fourBandCandidates:0,sixBandStarred:0,notFound:0};
 for(const r of rows.values()){
  if(r.provisionalMatch==="FOUR_BAND_CANDIDATE")counted.fourBandCandidates++;
  if(r.provisionalMatch==="CET6_STARRED")counted.sixBandStarred++;
  if(r.provisionalMatch==="NOT_FOUND_IN_TRANSCRIPTION")counted.notFound++;
 }
 if(Object.keys(counted).some(k=>counted[k]!==json.counts[k]))
  throw Error("CET_CROSSCHECK_COUNTS_CHANGED");
 const flagged=[...rows.values()].filter(x=>x.provisionalMatch!=="FOUR_BAND_CANDIDATE");
 return {reviewStatus:json.reviewStatus,officialVerifiedWords:0,
  candidateWords:rows.size,
  ...counted,
  pendingIndividualReview:rows.size,
  releaseAllowed:false,flagged,
  source:json.officialSyllabusUrl,
  independentTranscription:json.secondarySourceRepo};
}

function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>x!=="--summary"))throw Error("Usage: node scripts/check-rainy-night-cet4-candidates.mjs --summary");
 const {bundle}=composeRainyNightSeasonDraft();
 const result=checkRainyNightCET4Candidates(bundle);
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
