// S83: complete Rainy Night first-season draft import prepared offline.
// Guardrails: NO production D1 execute, NO publication status/entitlement writes.
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";
import {prepareRainyNightMemberCandidate} from "./prepare-rainy-night-member-candidate.mjs";
import {generateSql} from "./build-content-import.mjs";
const here=resolve(fileURLToPath(new URL("..",import.meta.url)));
export function buildRainyNightMemberDraftImport(){
 const {candidate,report}=prepareRainyNightMemberCandidate();
 const {sql,summary}=generateSql(candidate);
 if(summary.publication!=="draft-only"||report.commercialReleaseAllowed||
   report.d1Touched||report.chapterCount!==12||
   report.freePreviewChapters.length!==0||
   report.entitledChapterNumbers.join(",")!=="1,2,3,4,5,6,7,8,9,10,11,12"||
   summary.wordOccurrences!==733||summary.words!==188||
   sql.includes("UPDATE books SET status=")||
   sql.includes("INSERT INTO entitlements")||
   !sql.includes("INSERT OR IGNORE INTO chapters"))
   throw Error("S83: PRIVATE_DRAFT_IMPORT_SAFETY_CHECK_FAILED");
 return {sql,summary:{
  ...summary,readiness:"REVIEW_REQUIRED_NOT_FOR_SALE",
  publicPreviewChapter:null,categoryEntitlementForChapters:"1-12",
  publisherCanRelease:false,productionDbTouched:false,
  remainingEditorial:report.review,sourceGateStatus:report.sourceGateStatus
 }};
}
export function saveRainyNightPrivateImport(result,destination=join(here,"private-output","rainy-night-member")){
 mkdirSync(destination,{recursive:true,mode:0o700});
 const file=join(destination,"rainy-night-cet4-member-12chapters-DRAFT-UNREVIEWED.sql");
 writeFileSync(file,result.sql,{flag:"wx",mode:0o600});
 return file;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==1||!["--check","--write-private"].includes(args[0]))
   throw Error("USAGE: build-rainy-night-member-draft-import.mjs --check|--write-private");
  const result=buildRainyNightMemberDraftImport();
  if(args[0]==="--write-private")
    result.summary.privateFile=saveRainyNightPrivateImport(result);
  process.stdout.write(JSON.stringify(result.summary,null,2)+"\n");
 }catch(e){process.stderr.write(String(e.message||e)+"\n");process.exitCode=1}
}
