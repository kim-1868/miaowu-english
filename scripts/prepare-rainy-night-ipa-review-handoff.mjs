// Convert the reproducible 188-word UK/US IPA *draft* into the official
// fingerprinted editor form. Never sign approvals or contact production D1.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {reviewTemplate,validateReview} from "./build-rainy-night-reviewed-ipa-patch.mjs";

export function prepareIPAOwnerReviewForm(draft){
 const form=reviewTemplate();
 if(draft?.schema!=="RAINY_NIGHT_188_IPA_REVIEW_WORKING_COPY_V2"||
    draft.bookId!==form.bookId||draft.count!==188||
    draft.humanApproved!==false||draft.productionD1Touched!==false||
    !Array.isArray(draft.rows)||draft.rows.length!==188)
  throw Error("UNTRUSTED_OR_INCOMPLETE_IPA_DRAFT");
 const byId=new Map(draft.rows.map(x=>[x.wordId,x]));
 if(byId.size!==188)throw Error("DUPLICATE_IPA_WORD_ID");
 const validIPA=s=>typeof s==="string"&&/^\/[^\/<>\r\n]{2,100}\/$/u.test(s);
 for(const r of form.rows){
  const source=byId.get(r.wordId);
  if(!source||source.headword!==r.headword||
     source.partOfSpeech!==r.partOfSpeech||
     source.meaningZh!==r.meaningZh||
     source.exampleEn!==r.englishExample||
     source.exampleZh!==r.chineseExample||
     !validIPA(source.britishSuggested)||!validIPA(source.americanSuggested))
   throw Error("IPA_DRAFT_STALE_OR_INVALID_"+r.wordId);
  r.phoneticUk=source.britishSuggested;
  r.phoneticUs=source.americanSuggested;
  // A source candidate or machine phonetic transcript is not a signed
  // commercial permission statement. Leave all identity and provenance
  // evidence empty for the actual publisher / qualified reviewer.
  r.ukProvenance="";
  r.usProvenance="";
  r.reviewedBy="";
  r.reviewedAt="";
  r.evidenceRef="";
  r.reviewNote=source.senseNote||"";
  r.commercialUseConfirmed=false;
 }
 const verdict=validateReview(form);
 if(verdict.valid)throw Error("MUST_NEVER_AUTO_APPROVE_IPA");
 const result={...form,workflowNotice:"Owner/qualified language reviewer must examine 188 source words and pronunciation contexts; fill sources, evidence and signature. Exporting this draft does NOT certify any review."};
 return {form:result,preflight:{wordCount:188,prefilledUK:188,prefilledUS:188,
  sourceDigest:form.sourceDigest,stillMissingRealHumanApprovals:true,
  automaticPublication:false,productionD1Touched:false}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const path=process.argv[2];if(!path||process.argv.length!==3)throw Error("USAGE: node scripts/prepare-rainy-night-ipa-review-handoff.mjs <private-IPA-DRAFT.json>");
  const draft=JSON.parse(readFileSync(resolve(path),"utf8"));
  const r=prepareIPAOwnerReviewForm(draft);
  mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
  writeFileSync(resolve("private-output/rainy-night-188-IPA-PREFILLED-OWNER-SIGNOFF-REQUIRED.json"),
   JSON.stringify(r.form,null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log("IPA_OWNER_REVIEW_HANDOFF "+JSON.stringify(r.preflight));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
