// V1.1 pre-release evidence ledger. Offline only; NO deployment, D1 access,
// secrets or production approval. Metadata may be asserted by an operator but
// cannot authenticate the real Cloudflare backup or human approval.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {auditProductionConfig} from "./check-production-config.mjs";
import {auditV11PreviewConfig} from "./check-v11-preview-config.mjs";

const PROD_DB_ID="649c71b3-340c-49bf-b806-3d39256851d3";
const SHA=/^[0-9a-f]{40}$/i;
const CHECKSUM=/^[0-9a-f]{64}$/i;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const REQUIRED_EVIDENCE=Object.freeze([
 "real_production_backup",
 "independent_real_backup_restore",
 "production_schema_and_rights_audit",
 "editorial_sense_review",
 "ops_order_and_activation_acceptance",
 "reader_cross_device_acceptance",
 "rollback_plan"
]);
const validDate=s=>typeof s==="string"&&ISO.test(s)&&!Number.isNaN(Date.parse(s));
const isObj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const goodBool=v=>v===true;
function testEvidence(key,e,candidateSha,backup){
 if(!isObj(e))return false;
 switch(key){
 case "real_production_backup":
  return e.databaseId===PROD_DB_ID&&CHECKSUM.test(e.backupSha256||"")&&validDate(e.capturedAt)&&
   ["trusted_sql_export","time_travel_bookmark"].includes(e.method)&&e.sourceVerified===true;
 case "independent_real_backup_restore":
  return backup&&e.databaseId===PROD_DB_ID&&e.backupSha256===backup.backupSha256&&
   validDate(e.verifiedAt)&&goodBool(e.diskRestoreVerified)&&
   goodBool(e.migrations009to013Passed)&&goodBool(e.legacyRowsPreserved)&&
   goodBool(e.rightsCountsPreserved)&&goodBool(e.usedRealBackup);
 case "production_schema_and_rights_audit":
  return e.databaseId===PROD_DB_ID&&validDate(e.reviewedAt)&&
   goodBool(e.schemaInspectedReadOnly)&&goodBool(e.rightsExceptionsReviewed)&&
   goodBool(e.publishedContentSampleReviewed);
 case "editorial_sense_review":
  return e.candidateSha===candidateSha&&validDate(e.reviewedAt)&&
   goodBool(e.sameSenseAliasesReviewed)&&goodBool(e.polysemyReviewed)&&
   goodBool(e.legacyWordIdsPreserved);
 case "ops_order_and_activation_acceptance":
  return e.candidateSha===candidateSha&&validDate(e.testedAt)&&
   ["issue","claim","redeem","revoke","restore","recovery","category_entitlement"].every(k=>e[k]===true);
 case "reader_cross_device_acceptance":
  return e.candidateSha===candidateSha&&validDate(e.testedAt)&&
   ["iphoneSafari","android","paidWall","crossBookMastery","threeReviewGames","audio"].every(k=>e[k]===true);
 case "rollback_plan":
  return e.candidateSha===candidateSha&&validDate(e.preparedAt)&&
   SHA.test(e.previousWorkerSha||"")&&SHA.test(e.previousPagesSha||"")&&
   goodBool(e.rollbackOwnerConfirmed)&&goodBool(e.postBackupWritesRiskReviewed);
 default: return false;
 }
}
export function checkV11ReleaseReadiness({
 candidateSha, evidence=null, stagingConfig=null, productionConfig=null, pagesConfig=null
}={}){
 const blockers=[];
 const add=code=>{if(!blockers.includes(code))blockers.push(code)};
 if(!SHA.test(candidateSha||""))add("CANDIDATE_SHA_NOT_PINNED");
 try{
  const staging=auditV11PreviewConfig(
    stagingConfig??JSON.parse(readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8")),
    productionConfig??JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc",import.meta.url),"utf8")),
    pagesConfig??JSON.parse(readFileSync(new URL("../pages-production/wrangler.jsonc",import.meta.url),"utf8"))
  );
  if(!staging.safe)for(const code of staging.errors)add("CONFIG_"+code);
  const prod=auditProductionConfig(
    productionConfig??JSON.parse(readFileSync(new URL("../deploy/production.wrangler.jsonc",import.meta.url),"utf8"))
  );
  if(!prod.safe)for(const code of prod.issues)add("CONFIG_"+code);
 }catch{add("CONFIG_INSPECTION_FAILED")}
 if(evidence!==null&&(!isObj(evidence)||evidence.version!==1||evidence.candidateSha!==candidateSha))
  add("EVIDENCE_SCHEMA_OR_SHA_MISMATCH");
 if(isObj(evidence)&&(evidence.ownerApproval||evidence.releaseApproved||evidence.productionDeployToken))
  add("APPROVAL_CANNOT_BE_GRANTED_BY_EVIDENCE_FILE");
 const e=isObj(evidence)&&evidence.version===1&&evidence.candidateSha===candidateSha?evidence: {};
 const entries=isObj(e.entries)?e.entries:{};
 const backup=entries.real_production_backup;
 const evidenceState={};
 for(const name of REQUIRED_EVIDENCE){
  // A claimed check cannot substitute for source-independent verification.
  const ok=testEvidence(name,entries[name],candidateSha,backup);
  evidenceState[name]=ok?"METADATA_RECORDED_UNVERIFIED":"MISSING_OR_INVALID";
  if(!ok)add("REQUIRED_EVIDENCE_"+name.toUpperCase());
 }
 // This intentionally NEVER claims deployability. Plain JSON and a simulated
 // offline test cannot authenticate a D1 backup, an actual human sign-off,
 // source provenance or the absence of new customer writes since a snapshot.
 return {
  version:"v11-release-readiness/1",
  candidateSha:SHA.test(candidateSha||"")?candidateSha:null,
  stagingAndProductionConfigStaticCheckPassed:
   !blockers.some(code=>code.startsWith("CONFIG_")),
  evidenceMetadata:evidenceState,
  missingOrInvalidEvidence:REQUIRED_EVIDENCE.filter(n=>evidenceState[n]==="MISSING_OR_INVALID"),
  blockers,
  status:blockers.length?"BLOCKED_PRE_RELEASE":"METADATA_COMPLETE_REQUIRES_INDEPENDENT_VERIFICATION",
  productionReleaseApproved:false,
  productionDatabaseAccessed:false,
  permissionToDeployProduction:false,
  note:"Self-reported JSON is NOT proof of Cloudflare backup, real acceptance or owner approval. Manual sign-off and an independently verified immutable SHA are always mandatory."
 };
}
function main(){
 const args=process.argv.slice(2);
 let candidateSha=null,evidencePath=null,strict=false;
 for(let i=0;i<args.length;i++){
  const v=args[i];
  if(v==="--candidate-sha")candidateSha=args[++i];
  else if(v==="--evidence")evidencePath=args[++i];
  else if(v==="--strict")strict=true;
  else if(v==="--help"){
   console.log("node scripts/v11-release-readiness.mjs --candidate-sha FULL_COMMIT_SHA [--evidence PRIVATE_METADATA.json] [--strict]");
   return;
  }else throw Error("UNKNOWN_RELEASE_GATE_ARGUMENT");
 }
 if(!candidateSha)throw Error("CANDIDATE_SHA_REQUIRED");
 const e=evidencePath?JSON.parse(readFileSync(resolve(evidencePath),"utf8")):null;
 const result=checkV11ReleaseReadiness({candidateSha,evidence:e});
 console.log(JSON.stringify(result,null,2));
 if(strict&&result.blockers.length)process.exitCode=1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main()}catch{
  console.error("V11_RELEASE_READINESS_INPUT_INVALID");process.exitCode=2;
 }
}
