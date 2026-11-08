// V1.1 P5: inspect actual rights CONSISTENCY in a restored LOCAL database.
// Strictly read only. Never contacts Cloudflare; never returns order IDs,
// usernames, voucher hashes, password material or learning contents.
import {readFileSync} from "node:fs";

const REPORT_SQL=readFileSync(new URL("../docs/v11-p5-rights-reconciliation-readonly.sql",import.meta.url),"utf8");
const sourceSQL=REPORT_SQL.replace(/--[^\n]*/g,"").trim();
const REQUIRED_TABLES=["activation_codes","entitlements","users"];
const CLAIMS_TABLE="self_service_claims";
const EIGHTH_METRIC="verified_claim_on_revoked_code";
const EXPECTED_METRICS=[
 "active_grant_revoked_source",
 "active_grant_nonredeemed_source",
 "grant_owner_mismatch",
 "grant_category_mismatch",
 "redeemed_code_without_live_matching_grant",
 "redeemed_code_without_reader",
 "unused_code_with_reader",
 EIGHTH_METRIC
];
function guardedSql(sql){
 if(!/^SELECT\s/i.test(sql)||/\b(?:UPDATE|INSERT|DELETE|REPLACE|ATTACH|DETACH|ALTER|DROP|CREATE|PRAGMA|VACUUM|LOAD_EXTENSION)\b/i.test(sql))
  throw Error("RIGHTS_AUDIT_MUST_BE_READ_ONLY");
}
function hasTable(db,name){
 return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
export function auditRestoredRights(db){
 if(!db||typeof db.prepare!=="function")throw Error("RIGHTS_AUDIT_REQUIRES_LOCAL_DB");
 for(const name of REQUIRED_TABLES)if(!hasTable(db,name))throw Error("RIGHTS_AUDIT_REQUIRED_TABLE_MISSING_"+name.toUpperCase());
 const claimsAvailable=hasTable(db,CLAIMS_TABLE);
 // Old pre-self-claim backups have no claims table. Preserve seven useful
 // metrics but explicitly mark the eighth UNKNOWN, never silently report 0.
 const sql=claimsAvailable?sourceSQL:
   sourceSQL.slice(0,sourceSQL.lastIndexOf("UNION ALL")).trim();
 guardedSql(sql);
 const findings=db.prepare(sql).all();
 const counts=Object.fromEntries(findings.map(r=>[r.metric,Number(r.affected)]));
 const expected=claimsAvailable?EXPECTED_METRICS:EXPECTED_METRICS.slice(0,-1);
 if(JSON.stringify(Object.keys(counts))!==JSON.stringify(expected)||
    Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))
  throw Error("RIGHTS_AUDIT_UNEXPECTED_METRICS");
 if(!claimsAvailable)counts[EIGHTH_METRIC]=null;
 const reviewMetrics=Object.entries(counts).filter(([_,n])=>n!==null&&n>0).map(([name])=>name);
 return {
  status:claimsAvailable?"EIGHT_METRICS_COMPLETE":"SEVEN_METRICS_CLAIMS_TABLE_NOT_PRESENT",
  claimsAuditAvailable:claimsAvailable,
  counts,reviewMetrics,
  manualReviewRequired:reviewMetrics.length>0||!claimsAvailable,
  rowsOrCustomerIdentifiersReturned:false,
  productionDatabaseModified:false,
  productionReleaseApproved:false
 };
}
export function compareRestoredRights(before,after){
 if(!before||!after||!before.counts||!after.counts)throw Error("RIGHTS_AUDIT_COMPARISON_INVALID");
 if(JSON.stringify(before.counts)!==JSON.stringify(after.counts))
   throw Error("RESTORE_RIGHTS_COUNTS_CHANGED");
 return {rightCountsPreserved:true,manualReviewRequired:before.manualReviewRequired,
  claimsAuditAvailable:before.claimsAuditAvailable};
}
