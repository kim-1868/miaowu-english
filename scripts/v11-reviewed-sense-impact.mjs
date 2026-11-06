// P5 website-only OFFLINE impact preview for an editor-approved sense alias group.
// Every database access is SELECT. No D1, production deployment, user data
// migration, automatic approval or rewriting of old word IDs/review history.
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {buildSenseShadow} from "./v11-shadow-sense-audit.mjs";
import {studyKey} from "../src/study-identity.js";

const fail=code=>{throw Error(code)};
const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
const dateMs=value=>{
 if(!value)return null;
 const s=String(value);
 const n=Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");
 return Number.isFinite(n)?n:null;
};
const timeString=value=>{
 const time=dateMs(value);
 return time===null?null:new Date(time).toISOString();
};
const sorted=values=>[...new Set(values)].sort();
const hasTable=(db,name)=>Boolean(db.prepare(
 "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

// Construct the same snapshot from the actual LOCAL database to bind the
// editor's signed manifest to the exact word definitions AND chapter contexts.
// Never print or return the raw story sentences.
export function readLocalSenseSnapshot(db){
 if(!db||typeof db.prepare!=="function")fail("LOCAL_SQLITE_REQUIRED");
 for(const table of ["words","chapter_words"])if(!hasTable(db,table))fail("SENSE_SOURCE_TABLE_MISSING");
 const cards=db.prepare("SELECT id AS word_id,headword,part_of_speech,meaning_zh,"+
   "phonetic_uk,phonetic_us FROM words ORDER BY id").all();
 const index=new Map(cards.map(c=>(c.contexts=[],[c.word_id,c])));
 for(const row of db.prepare("SELECT word_id,chapter_id,context_anchor,context_sentence "+
   "FROM chapter_words ORDER BY word_id,chapter_id,context_anchor").iterate()){
  const card=index.get(row.word_id);
  if(!card)fail("SENSE_SOURCE_REFERENTIAL_MISMATCH");
  card.contexts.push({chapter_id:row.chapter_id,context_anchor:row.context_anchor,
   context_sentence:row.context_sentence});
 }
 return {cards};
}
const accessibleSql=ids=>
 "SELECT uw.user_id,uw.word_id,uw.status,uw.bookmarked,uw.due_at,uw.last_seen_at,"+
 "w.headword,w.part_of_speech,w.meaning_zh FROM user_words uw "+
 "JOIN words w ON w.id=uw.word_id WHERE uw.word_id IN ("+
 ids.map(()=>"?").join(",")+") AND EXISTS ("+
 "SELECT 1 FROM chapter_words cw JOIN chapters ch ON ch.id=cw.chapter_id "+
 "JOIN books b ON b.id=ch.book_id JOIN categories c ON c.id=b.category_id "+
 "WHERE cw.word_id=uw.word_id AND b.status='published' AND c.is_visible=1 "+
 "AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP "+
 "AND (ch.is_preview=1 OR EXISTS(SELECT 1 FROM entitlements e "+
 "WHERE e.user_id=uw.user_id AND e.category_id=b.category_id "+
 "AND e.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM activation_codes v "+
 "WHERE v.id=e.source_code_id AND v.status='revoked')))) "+
 "ORDER BY uw.user_id,uw.word_id";

function plansCompatible(plans){
 if(plans.length<2)return true;
 const make=p=>JSON.stringify([
  Number(p.stage_index),timeString(p.due_at),p.last_positive_day||null,
  timeString(p.last_reviewed_at),Number(p.mastered),Number(p.bookmarked)
 ]);
 return plans.slice(1).every(p=>make(p)===make(plans[0]));
}
export function simulateReviewedSenseImpact(db,approvalManifest,{now=new Date()}={}){
 if(!db||typeof db.prepare!=="function")fail("LOCAL_SQLITE_REQUIRED");
 if(!hasTable(db,"user_words")||!hasTable(db,"review_events")||!hasTable(db,"entitlements"))
  fail("REQUIRED_LEGACY_STUDY_TABLE_MISSING");
 if(!approvalManifest||!Array.isArray(approvalManifest.groups))fail("REVIEW_MANIFEST_REQUIRED");
 const snapshot=readLocalSenseSnapshot(db);
 const reviewed=buildSenseShadow(snapshot,approvalManifest,{includeAssignments:true});
 if(reviewed.blockers.length||!reviewed.assignments)return {
  version:"v11-p5-impact/1",status:"REVIEW_BLOCKED",
  snapshotFingerprint:reviewed.sourceFingerprint,
  approvedGroups:0,groups:[],
  reviewBlockerCodes:sorted(reviewed.blockers.map(e=>e.code)),
  productionWritten:false,historyRewritten:false,migrationApproved:false
 };
 const source=new Map(snapshot.cards.map(w=>[w.word_id,w]));
 const byKey=new Map();
 for(const w of snapshot.cards){
  const key=studyKey({...w,word_id:w.word_id});
  const entries=byKey.get(key)||new Set();entries.add(w.word_id);byKey.set(key,entries);
 }
 const output=[],blocking=new Set();
 const haveSchedules=hasTable(db,"user_study_schedules");
 const current=now instanceof Date?now.getTime():new Date(now).getTime();
 if(!Number.isFinite(current))fail("INVALID_REVIEW_CLOCK");
 for(const approval of approvalManifest.groups){
  const ids=sorted(approval.wordIds);
  const keys=sorted(ids.map(id=>studyKey({...source.get(id),word_id:id})));
  const problems=new Set();
  // A historical schedule is keyed by the old text-derived studyKey. A
  // partially approved cluster CANNOT split an existing schedule shared
  // with an unapproved third card, even if two reviewed cards seem equal.
  for(const key of keys)if([...byKey.get(key)].some(id=>!ids.includes(id)))
   problems.add("UNAPPROVED_LEGACY_KEY_COLLISION");
  const byUser=new Map();
  // 500 IDs is the audited manifest's maximum per group. The old website
  // can use many IDs across books, so query in bound chunks.
  for(let i=0;i<ids.length;i+=100){
   const chunk=ids.slice(i,i+100);
   for(const row of db.prepare(accessibleSql(chunk)).all(...chunk)){
    const list=byUser.get(row.user_id)||[];
    list.push(row);byUser.set(row.user_id,list);
   }
  }
  let masteredAccounts=0,bookmarkedAccounts=0,dueAccounts=0;
  let protectedScheduleAccounts=0,conflictAccounts=0;
  const uniqueSourceIds=new Set();
  for(const [userId,items] of byUser){
   for(const item of items)uniqueSourceIds.add(item.word_id);
   const visibleKeys=sorted(items.map(w=>studyKey(w)));
   const plans=haveSchedules?
    db.prepare("SELECT study_key,stage_index,due_at,last_positive_day,"+
      "last_reviewed_at,mastered,bookmarked FROM user_study_schedules "+
      "WHERE user_id=? AND study_key IN ("+visibleKeys.map(()=>"?").join(",")+")")
      .all(userId,...visibleKeys):[];
   const historicalMastery=items.some(row=>row.status==="mastered");
   const historicalBookmark=items.some(row=>Number(row.bookmarked)===1);
   // Existing V1.1 canonical decisions override legacy copies. But when two
   // formerly independent plans disagree, a merge must NOT guess which
   // explicit unmaster/unbookmark action is the latest user intent.
   if(!plansCompatible(plans))problems.add("CONFLICTING_CANONICAL_STUDY_PLANS");
   if(plans.length&&plans.some(p=>Number(p.mastered)===0)&&historicalMastery)
    problems.add("EXPLICIT_UNMASTER_CONFLICTS_WITH_OLD_MASTERY");
   if(plans.length&&plans.some(p=>Number(p.bookmarked)===0)&&historicalBookmark)
    problems.add("EXPLICIT_UNBOOKMARK_CONFLICTS_WITH_OLD_BOOKMARK");
   if(!plansCompatible(plans)||
      plans.length&&plans.some(p=>Number(p.mastered)===0)&&historicalMastery||
      plans.length&&plans.some(p=>Number(p.bookmarked)===0)&&historicalBookmark){
    conflictAccounts++;continue;
   }
   if(plans.length)protectedScheduleAccounts++;
   const mastered=plans.length?Boolean(plans[0].mastered):historicalMastery;
   const bookmarked=plans.length?Boolean(plans[0].bookmarked):historicalBookmark;
   const due=mastered?null:(plans.length?timeString(plans[0].due_at):
     items.map(x=>timeString(x.due_at)).filter(Boolean).sort()[0]||null);
   if(mastered)masteredAccounts++;
   if(bookmarked)bookmarkedAccounts++;
   if(due!==null&&dateMs(due)<=current)dueAccounts++;
  }
  // Review events are immutable provenance. Include only aggregate counts
  // (they can belong to users no longer entitled and must never be deleted).
  let events=0;
  for(let i=0;i<ids.length;i+=100){
   const chunk=ids.slice(i,i+100);
   events+=db.prepare("SELECT COUNT(*) AS n FROM review_events WHERE word_id IN ("+
    chunk.map(()=>"?").join(",")+")").get(...chunk).n;
  }
  for(const code of problems)blocking.add(code);
  output.push({
   senseId:approval.senseId,reviewedWordCount:ids.length,
   oldStudyKeyCount:keys.length,
   previouslySharedByCurrentStudyKey:keys.length===1,
   distinctVisibleStudiedAliases:uniqueSourceIds.size,
   impactedAccounts:byUser.size,
   projectedMasteredAccounts:masteredAccounts,
   projectedBookmarkedAccounts:bookmarkedAccounts,
   projectedDueAccounts:dueAccounts,
   accountsWithExplicitSchedules:protectedScheduleAccounts,
   accountsRequiringManualDecision:conflictAccounts,
   preservedHistoricalReviewEventCount:events,
   reviewBlockerCodes:sorted([...problems]),
   status:problems.size?"MANUAL_REVIEW_REQUIRED":"SAFE_FOR_ISOLATED_STAGING_DESIGN_ONLY"
  });
 }
 return {
  version:"v11-p5-impact/1",
  snapshotFingerprint:reviewed.sourceFingerprint,
  approvedGroups:output.length,groups:output,
  reviewBlockerCodes:sorted([...blocking]),
  status:blocking.size?"MANUAL_REVIEW_REQUIRED":"SIMULATION_PASSED_NO_MIGRATION",
  productionWritten:false,historyRewritten:false,migrationApproved:false,
  note:"Read-only projection. No real user IDs, passwords, orders, story sentences or direct migration SQL returned."
 };
}
function main(args){
 if(args.length!==4||args[0]!=="--local-sqlite"||args[2]!=="--approvals")
  fail("USAGE_LOCAL_SQLITE_AND_REVIEWED_APPROVAL_MANIFEST_REQUIRED");
 // Never accept remote DB identifiers or Wrangler arguments. Only a local
 // sqlite pathname is accepted, opened READ-ONLY, with no temp/scratch SQL.
 const path=resolve(args[1]);
 const approvals=JSON.parse(readFileSync(resolve(args[3]),"utf8"));
 const db=new DatabaseSync(path,{readOnly:true});
 try{console.log(JSON.stringify(simulateReviewedSenseImpact(db,approvals),null,2))}
 finally{db.close()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{main(process.argv.slice(2))}
 catch{
  // Do not expose private filesystem paths, SQL text or user information.
  console.error("V11_REVIEWED_SENSE_IMPACT_PREVIEW_BLOCKED");process.exitCode=1;
 }
}
