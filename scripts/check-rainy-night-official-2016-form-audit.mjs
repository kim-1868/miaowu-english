// Editorial-only form-level verification against a user-uploaded official 2016 CET syllabus.
// No exam certification, not an IPA/dictionary validator, no Cloudflare access.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";

const official=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json",import.meta.url),"utf8"));
const CODES=new Set(["CET4_UNSTARRED_HEADWORD","CET4_PRINTED_VARIANT",
 "CET6_STARRED_HEADWORD_OR_FAMILY","NOT_STANDALONE_HEADWORD"]);

export function verifyOfficial2016FormAudit(bundle){
 if(official.reviewStatus!=="SOURCE_BACKED_HEADWORD_FORM_CHECK_ONLY_NOT_PEDAGOGICAL_RELEASE")
  throw Error("OFFICIAL_FORM_CHECK_MUST_REMAIN_NON_RELEASE");
 if(official.sourceSha256!=="9166d3c03b7bc43abd9d9df91bd2ef8085b4419286f1e5ca100dea68f3cfd1f1")
  throw Error("UNEXPECTED_OFFICIAL_PDF_SOURCE_HASH");
 const map=new Map();
 for(const entry of official.words){
  if(!/^[a-z]+$/.test(entry.headword)||!CODES.has(entry.formStatus)||
     !Number.isInteger(entry.pdfPage)||entry.pdfPage<21||entry.pdfPage>149||
     entry.bookPage!==entry.pdfPage-5||
     entry.posSenseIpaVerified!==false)
   throw Error("INVALID_OFFICIAL_PDF_AUDIT_ROW");
  if(map.has(entry.headword))throw Error("DUPLICATED_OFFICIAL_FORM_"+entry.headword);
  if(entry.formStatus==="CET4_PRINTED_VARIANT"&&!entry.printedVariant)
   throw Error("MISSING_VARIANT_NOTATION");
  if(entry.formStatus==="NOT_STANDALONE_HEADWORD"&&!entry.relatedHeadword)
   throw Error("MISSING_RELATED_FORM");
  map.set(entry.headword,entry);
 }
 if(bundle.words.length!==188||map.size!==bundle.words.length)
  throw Error("OFFICIAL_FORM_VOCABULARY_COUNT_MISMATCH");
 for(const word of bundle.words){
  if(!map.has(word.headword))throw Error("OFFICIAL_FORM_WORD_NOT_FOUND_"+word.headword);
  if(word.verifiedCET4===true)throw Error("PREMATURE_CET4_APPROVAL_"+word.headword);
 }
 const counts={};
 for(const code of CODES)counts[code]=[...map.values()].filter(x=>x.formStatus===code).length;
 for(const code of CODES)if(counts[code]!==official.counts[code])
  throw Error("OFFICIAL_FORM_STATUS_COUNT_DRIFT_"+code);
 return {status:official.reviewStatus,sourceSha256:official.sourceSha256,
  sourceDocument:official.sourceTitle,words:map.size,counts,
  formMatchesCET4:counts.CET4_UNSTARRED_HEADWORD+counts.CET4_PRINTED_VARIANT,
  starredCET6:counts.CET6_STARRED_HEADWORD_OR_FAMILY,
  notStandalone:counts.NOT_STANDALONE_HEADWORD,
  verifiedPosSenseIpa:0,releaseAllowed:false,
  priorityReview:[...map.values()].filter(w=>
    w.formStatus==="CET6_STARRED_HEADWORD_OR_FAMILY"||
    w.formStatus==="NOT_STANDALONE_HEADWORD"),
  variants:[...map.values()].filter(w=>w.formStatus==="CET4_PRINTED_VARIANT")};
}
function main(){
 const args=process.argv.slice(2);
 if(args.some(x=>x!=="--summary"))
  throw Error("Usage: node scripts/check-rainy-night-official-2016-form-audit.mjs --summary");
 const {bundle}=composeRainyNightSeasonDraft();
 process.stdout.write(JSON.stringify(verifyOfficial2016FormAudit(bundle),null,2)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
