// V1.1 P5 - LOCAL restored SQLite ONLY. This module is not imported by
// production Worker, pages or the editorial upload path. Explicitly staged
// manual review data cannot silently alter live studyKey/read/write behavior.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {studyKey} from "../src/study-identity.js";
import {readLocalSenseSnapshot,simulateReviewedSenseImpact} from "./v11-reviewed-sense-impact.mjs";

const fail=code=>{throw Error(code)};
const sha=text=>createHash("sha256").update(String(text)).digest("hex");
const tableExists=(db,name)=>Boolean(db.prepare(
 "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const objectEqual=(one,two,keys)=>keys.every(k=>one?.[k]===two[k]);

// OFF by default even if the additive map table exists. This allows safe
// side-by-side comparison without changing current reader/flashcard behavior.
export function resolveStagedStudyKey(db,wordId,{reviewed=false}={}){
 if(!db||typeof db.prepare!=="function")fail("LOCAL_SQLITE_REQUIRED");
 const word=db.prepare("SELECT id,headword,part_of_speech,meaning_zh FROM words WHERE id=?").get(wordId);
 if(!word)fail("REVIEWED_WORD_NOT_FOUND");
 const fallback=studyKey({word_id:word.id,...word});
 if(!reviewed||!tableExists(db,"reviewed_sense_aliases"))return fallback;
 const alias=db.prepare("SELECT a.sense_id FROM reviewed_sense_aliases a "+
  "JOIN reviewed_sense_groups g ON g.sense_id=a.sense_id "+
  "WHERE a.word_id=?").get(wordId);
 return alias?.sense_id||fallback;
}

export function stageReviewedSenseAliases(db,approvalManifest){
 if(!db||typeof db.prepare!=="function")fail("LOCAL_SQLITE_REQUIRED");
 for(const table of ["reviewed_sense_groups","reviewed_sense_aliases"])
  if(!tableExists(db,table))fail("REVIEWED_MAPPING_SCHEMA_NOT_INSTALLED_"+table);
 if(db.prepare("PRAGMA foreign_keys").get().foreign_keys!==1)
  fail("REVIEWED_MAPPING_FOREIGN_KEYS_REQUIRED");
 if(db.prepare("PRAGMA foreign_key_check").all().length)
  fail("REVIEWED_MAPPING_PREEXISTING_FOREIGN_KEYS_INVALID");
 // Does not accept a report or candidate alone: it must be a manifest that
 // passes both human contextual approval and the per-user legacy state impact
 // gate from PR #178 before any new-table INSERT is attempted.
 const preview=simulateReviewedSenseImpact(db,approvalManifest);
 if(preview.status!=="SIMULATION_PASSED_NO_MIGRATION")
  fail("REVIEWED_MAPPING_IMPACT_BLOCKED_"+preview.status);
 if(!approvalManifest?.groups?.length||preview.approvedGroups!==approvalManifest.groups.length)
  fail("REVIEWED_MAPPING_EMPTY_OR_PARTIAL_APPROVAL");
 const snapshot=readLocalSenseSnapshot(db);
 const wordById=new Map(snapshot.cards.map(w=>[w.word_id,w]));
 const idsBefore=approvalManifest.groups.map(g=>g.senseId);
 if(new Set(idsBefore).size!==idsBefore.length)fail("REVIEWED_MAPPING_DUPLICATE_SENSE");
 // Validation is complete before starting an atomic transaction. No existing
 // legacy or learning table is targeted by any SQL in the transaction.
 let createdGroups=0,createdAliases=0;
 db.exec("BEGIN IMMEDIATE");
 try{
  for(const group of approvalManifest.groups){
   const metadata={
    sense_id:group.senseId,
    snapshot_sha256:approvalManifest.snapshotFingerprint,
    evidence_sha256:sha(group.evidence),
    reviewer:group.reviewer,
    reviewed_at:group.reviewedAt
   };
   const prev=db.prepare("SELECT sense_id,snapshot_sha256,evidence_sha256,reviewer,reviewed_at "+
    "FROM reviewed_sense_groups WHERE sense_id=?").get(group.senseId);
   if(prev){
    if(!objectEqual(prev,metadata,Object.keys(metadata)))
     fail("REVIEWED_MAPPING_EXISTING_GROUP_CONFLICT");
   }else{
    db.prepare("INSERT INTO reviewed_sense_groups "+
     "(sense_id,snapshot_sha256,evidence_sha256,reviewer,reviewed_at) VALUES(?,?,?,?,?)")
     .run(metadata.sense_id,metadata.snapshot_sha256,metadata.evidence_sha256,
      metadata.reviewer,metadata.reviewed_at);
    createdGroups++;
   }
   for(const wordId of group.wordIds){
    const word=wordById.get(wordId);
    if(!word)fail("REVIEWED_MAPPING_UNRESOLVED_WORD");
    const legacy=studyKey({word_id:wordId,...word});
    const existing=db.prepare("SELECT word_id,sense_id,legacy_study_key "+
      "FROM reviewed_sense_aliases WHERE word_id=?").get(wordId);
    if(existing){
     if(existing.sense_id!==group.senseId||existing.legacy_study_key!==legacy)
      fail("REVIEWED_MAPPING_EXISTING_ALIAS_CONFLICT");
    }else{
     db.prepare("INSERT INTO reviewed_sense_aliases(word_id,sense_id,legacy_study_key) "+
      "VALUES(?,?,?)").run(wordId,group.senseId,legacy);
     createdAliases++;
    }
   }
  }
  if(db.prepare("PRAGMA foreign_key_check").all().length)
   fail("REVIEWED_MAPPING_NEW_FOREIGN_KEYS_INVALID");
  db.exec("COMMIT");
 }catch(error){
  db.exec("ROLLBACK");
  // Error categories only; no story, customer or approval evidence exposed.
  if(String(error?.message||"").startsWith("REVIEWED_MAPPING_"))throw error;
  fail("REVIEWED_MAPPING_ATOMIC_WRITE_FAILED");
 }
 return {
  status:"LOCAL_MAPPING_STAGED_NOT_ACTIVATED",
  approvedGroupCount:approvalManifest.groups.length,
  stagedWordCount:approvalManifest.groups.reduce((sum,g)=>sum+g.wordIds.length,0),
  newGroupRows:createdGroups,newAliasRows:createdAliases,
  sourceFingerprint:approvalManifest.snapshotFingerprint,
  existingStudyKeyBehaviorUnchanged:true,
  userStudyRecordsWritten:false,
  historicalEventsWritten:false,
  productionWritten:false,
  stagingDeployed:false,
  mappingLiveForReader:false
 };
}

export function applyReviewedMappingSchema(db){
 if(!db||typeof db.exec!=="function")fail("LOCAL_SQLITE_REQUIRED");
 const sql=readFileSync(new URL("../db/014_v11_reviewed_sense_aliases.sql",import.meta.url),"utf8");
 // This executes in the supplied local DatabaseSync only. The SQL contains
 // no ALTER, DROP or statement targeting any preexisting table.
 db.exec(sql);
}
