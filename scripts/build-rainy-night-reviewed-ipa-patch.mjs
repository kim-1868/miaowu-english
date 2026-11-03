// Offline only: prepare and validate human-reviewed IPA, never contact D1.
// Source candidates are not approvals. This script does not publish books.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {prepareRainyNightMemberCandidate,MEMBER_BOOK_ID} from "./prepare-rainy-night-member-candidate.mjs";
const UK=JSON.parse(readFileSync(new URL("../content/editorial/rainy-night-s1-britfone-uk-ipa-candidates.json",import.meta.url),"utf8"));
const US=JSON.parse(readFileSync(new URL("../content/editorial/rainy-night-s1-us-ipa-candidates-UNVERIFIED.json",import.meta.url),"utf8"));
const VERSION="RAINY_NIGHT_IPA_HUMAN_REVIEW_V1";
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const idRe=/^[a-zA-Z0-9_-]{3,80}$/;
const ipaRe=/^\/[^\/<>\r\n]{1,100}\/$/u;
const allowedUK=new Set(["BRITFONE_MIT","INDEPENDENT_TRANSCRIPTION"]);
const allowedUS=new Set(["IPA_DICT_MIT","INDEPENDENT_TRANSCRIPTION"]);
const {candidate}=prepareRainyNightMemberCandidate();
const expected=[...candidate.words].sort((a,b)=>a.id.localeCompare(b.id));
if(expected.length!==188)throw Error("RAINY_NIGHT_WORD_COUNT_DRIFT");
const sourceDigest=hash(expected.map(w=>[w.id,w.headword,w.partOfSpeech,w.meaningZh,w.exampleEn,w.exampleZh]));
const ukMap=new Map(UK.words.map(w=>[w.headword,w.phoneticUkCandidates]));
const usMap=new Map(US.words.map(w=>[w.headword,w.usIpaCandidates]));
if(ukMap.size!==188||usMap.size!==188||expected.some(w=>!ukMap.has(w.headword)||!usMap.has(w.headword)))
 throw Error("IPA_SOURCE_INVENTORY_DRIFT");
const safeSQL=s=>"'"+String(s).replaceAll("'","''")+"'";
export function reviewTemplate(){
 return {schemaVersion:VERSION,bookId:MEMBER_BOOK_ID,sourceDigest,
  warning:"PRIVATE EDITORIAL TEMPLATE. Filling the form is NOT independent human approval or commercial authorization.",
  rows:expected.map(w=>({
   wordId:w.id,headword:w.headword,partOfSpeech:w.partOfSpeech,meaningZh:w.meaningZh,
   englishExample:w.exampleEn,chineseExample:w.exampleZh,
   ukSourceCandidates:ukMap.get(w.headword),usSourceCandidates:usMap.get(w.headword),
   phoneticUk:"",phoneticUs:"",ukProvenance:"",usProvenance:"",
   reviewedBy:"",reviewedAt:"",evidenceRef:"",reviewNote:"",commercialUseConfirmed:false
  }))};
}
export function validateReview(input){
 const errors=[];
 if(!input||typeof input!=="object"||Array.isArray(input))return {valid:false,errors:["INVALID_INPUT"]};
 if(input.schemaVersion!==VERSION)errors.push("SCHEMA_VERSION_MISMATCH");
 if(input.bookId!==MEMBER_BOOK_ID)errors.push("BOOK_ID_MISMATCH");
 if(input.sourceDigest!==sourceDigest)errors.push("SOURCE_CHANGED_REVIEW_AGAIN");
 if(!Array.isArray(input.rows)||input.rows.length!==188)
  return {valid:false,errors:[...errors,"REVIEW_ROW_COUNT_NOT_188"]};
 const canonical=new Map(expected.map(w=>[w.id,w]));
 const seen=new Set();
 for(const row of input.rows){
  if(!row||typeof row!=="object"||!canonical.has(row.wordId)){
   errors.push("UNKNOWN_WORD");continue;
  }
  if(seen.has(row.wordId)){errors.push("DUPLICATE_"+row.wordId);continue;}
  seen.add(row.wordId);
  const w=canonical.get(row.wordId);
  if(row.headword!==w.headword||row.partOfSpeech!==w.partOfSpeech||
     row.meaningZh!==w.meaningZh||row.englishExample!==w.exampleEn||
     row.chineseExample!==w.exampleZh||
     JSON.stringify(row.ukSourceCandidates)!==JSON.stringify(ukMap.get(w.headword))||
     JSON.stringify(row.usSourceCandidates)!==JSON.stringify(usMap.get(w.headword))){
   errors.push("SOURCE_ROW_CHANGED_"+w.headword);continue;
  }
  if(!ipaRe.test(row.phoneticUk||"")||!ipaRe.test(row.phoneticUs||""))
   errors.push("IPA_MISSING_OR_NOT_SLASH_DELIMITED_"+w.headword);
  if(!allowedUK.has(row.ukProvenance)||!allowedUS.has(row.usProvenance))
   errors.push("SOURCE_PROVENANCE_MISSING_"+w.headword);
  if(ukMap.get(w.headword).length===0&&row.ukProvenance!=="INDEPENDENT_TRANSCRIPTION")
   errors.push("UNLICENSED_UK_GAP_"+w.headword);
  if(row.commercialUseConfirmed!==true)
   errors.push("COMMERCIAL_LICENSE_NOT_CONFIRMED_"+w.headword);
  if(!idRe.test(row.reviewedBy||"")||!idRe.test(row.evidenceRef||"")||
     typeof row.reviewNote!=="string"||row.reviewNote.trim().length<15||
     row.reviewNote.length>1000||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(row.reviewedAt||"")||
     !Number.isFinite(Date.parse(row.reviewedAt)))
   errors.push("ACTUAL_REVIEW_EVIDENCE_MISSING_"+w.headword);
 }
 if(seen.size!==188)errors.push("WORD_INVENTORY_INCOMPLETE");
 return {valid:errors.length===0,errors:errors.slice(0,50),totalErrors:errors.length,
  wordCount:188,sourceDigest,remoteDatabaseTouched:false};
}
export function buildPrivateSql(review){
 const checked=validateReview(review);
 if(!checked.valid)throw Error("IPA_REVIEW_NOT_APPROVED: "+checked.errors.slice(0,5).join(", "));
 const ordered=new Map(review.rows.map(x=>[x.wordId,x]));
 const output=[
  "-- VERIFIED HUMAN REVIEW REQUIRED; review SQL and backup D1 before use.",
  "-- No user, entitlement, chapter, publication, or purchase changes.",
  "-- Source fingerprint: "+sourceDigest,
  "-- Must be executed only in a documented, reviewed private D1 maintenance transaction."
 ];
 for(const w of expected){
  const r=ordered.get(w.id);
  // The owning book must still be a CET4 draft with 12 entirely protected chapters.
  output.push("UPDATE words SET phonetic_uk="+safeSQL(r.phoneticUk)+
   ", phonetic_us="+safeSQL(r.phoneticUs)+
   " WHERE id="+safeSQL(w.id)+
   " AND EXISTS (SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id"+
   " JOIN books b ON b.id=ch.book_id WHERE cw.word_id=words.id"+
   " AND b.id="+safeSQL(MEMBER_BOOK_ID)+" AND b.category_id='cet4' AND b.status='draft'"+
   " AND (SELECT COUNT(*) FROM chapters x WHERE x.book_id=b.id)=12"+
   " AND NOT EXISTS (SELECT 1 FROM chapters x WHERE x.book_id=b.id AND x.is_preview<>0));");
 }
 output.push("-- After apply, verify 188/188 words have reviewed IPA via a separate read-only D1 query.");
 return output.join("\n")+"\n";
}
function main(){
 const [cmd,path]=process.argv.slice(2);
 if(cmd==="--summary"&&!path){
  const t=reviewTemplate();const bothSingle=t.rows.filter(r=>r.ukSourceCandidates.length===1&&r.usSourceCandidates.length===1).length;
  console.log(JSON.stringify({bookId:MEMBER_BOOK_ID,wordCount:188,bothSingle,needsReview:188,
   variantOrGap:188-bothSingle,sourceDigest,remoteDatabaseTouched:false},null,2));
 }else if(cmd==="--template"&&!path){
  const dest=resolve("private-output","rainy-night-ipa-HUMAN-REVIEW-REQUIRED.json");
  mkdirSync(dirname(dest),{recursive:true,mode:0o700});
  writeFileSync(dest,JSON.stringify(reviewTemplate(),null,2)+"\n",{flag:"wx",mode:0o600});
  console.log("Generated PRIVATE review template; no words approved.");
 }else if(cmd==="--validate"&&path){
  const data=JSON.parse(readFileSync(resolve(path),"utf8"));
  const result=validateReview(data);
  console.log(JSON.stringify(result,null,2));if(!result.valid)process.exitCode=1;
 }else if(cmd==="--build-sql"&&path){
  const data=JSON.parse(readFileSync(resolve(path),"utf8"));
  const sql=buildPrivateSql(data);
  const dest=resolve("private-output","rainy-night-ipa-REVIEWED-PRIVATE-PATCH.sql");
  mkdirSync(dirname(dest),{recursive:true,mode:0o700});
  writeFileSync(dest,sql,{flag:"wx",mode:0o600});
  console.log("Private review-validated SQL written. NO REMOTE D1 WRITE. SQL needs independent review.");
 }else throw Error("Usage: --summary | --template | --validate <private-json> | --build-sql <private-json>");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
