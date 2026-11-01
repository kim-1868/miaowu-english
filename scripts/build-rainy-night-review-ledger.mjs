// S66: private, source-fingerprinted, human-editable review worksheet.
// This ledger NEVER authorizes publication, user access or commercial IPA usage.
import {createHash} from "node:crypto";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {composeRainyNightSeasonDraft} from "./compose-rainy-night-s1-full.mjs";
import {createVocabularyReviewQueue} from "./prepare-rainy-night-vocabulary-review.mjs";
import {buildRainyNightOccurrenceReview} from "./review-rainy-night-word-contexts.mjs";
import {buildEchoReviewPack} from "./build-rainy-night-echo-review-pack.mjs";
import {buildRainyNightTeachingTrackPlan} from "./plan-rainy-night-teaching-tracks.mjs";

const VERSION="RAINY_NIGHT_OFFLINE_REVIEW_LEDGER_V1";
const KINDS=["word","context","echo"];
const DECISIONS=["PENDING","REVIEWED_OK","CHANGES_REQUESTED"];
const HASH=/^[a-f0-9]{64}$/;
const digest=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const noteSafe=x=>typeof x==="string"&&x.length<=1800&&
 !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
const fields=["id","kind","sourceHash","chapter","headword","preview",
 "decision","reviewer","reviewedAt","note","evidenceRef"];
const decisionFields=["decision","reviewer","reviewedAt","note","evidenceRef"];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

export function buildRainyNightReviewLedger(bundle){
 if(!bundle.book.id.startsWith("draft-"))throw Error("LEDGER_ONLY_FOR_UNPUBLISHED_DRAFT");
 const wordReview=createVocabularyReviewQueue(bundle);
 const occurrenceReview=buildRainyNightOccurrenceReview(bundle);
 const echo=buildEchoReviewPack(bundle);
 const tracks=buildRainyNightTeachingTrackPlan(bundle);
 if(bundle.chapters.length!==12||bundle.words.length!==188||
    occurrenceReview.rows.length!==733||echo.questions.length!==36||
    wordReview.rows.length!==188||tracks.rows.length!==188)
   throw Error("LEDGER_REQUIRES_FIXED_PRIVATE_DRAFT_INVENTORY");
 const byWord=new Map(bundle.words.map(w=>[w.id,w]));
 const trackById=new Map(tracks.rows.map(w=>[w.wordId,w]));
 const candidateById=new Map(wordReview.rows.map(w=>[w.wordId,w]));
 const rows=[];
 const put=(id,kind,chapter,headword,preview,source)=>{
  if(!KINDS.includes(kind)||typeof id!=="string"||!id.length)throw Error("LEDGER_BAD_ID");
  rows.push({id,kind,sourceHash:digest([kind,id,source]),chapter,
   headword,preview,decision:"PENDING",reviewer:"",
   reviewedAt:"",note:"",evidenceRef:""});
 };
 for(const w of bundle.words){
  const candidate=candidateById.get(w.id),track=trackById.get(w.id);
  if(!candidate||!track)throw Error("LEDGER_MISSING_WORD_SOURCE");
  put("word:"+w.id,"word",null,w.headword,
    [w.headword,w.partOfSpeech,w.meaningZh,w.exampleEn,w.exampleZh].join(" | "),
    {word:w,track,candidates:{
      uk:candidate.sourceUkCandidates,us:candidate.sourceUsIpaCandidates,
      ukGap:candidate.sourceUkGapReference,
      usIpaProvenance:candidate.sourceUsIpaProvenance,
      ukIpaProvenance:candidate.sourceUkProvenance}});
 }
 for(const c of occurrenceReview.rows){
  put("context:"+c.ref,"context",c.chapter,c.word,
    "第"+c.chapter+"章 "+c.ref+" · "+c.originalContext,
    {ref:c.ref,chapter:c.chapter,wordId:c.wordId,word:c.word,
     declaredMeaning:c.declaredMeaning,gloss:c.gloss,
     partOfSpeech:c.partOfSpeech,originalContext:c.originalContext,
     reviewFlags:c.reviewFlags});
 }
 for(const q of echo.questions){
  const ref=q.chapterId+":p"+String(q.paragraphNo).padStart(2,"0")+
    ":s"+String(q.segmentNo).padStart(2,"0");
  put("echo:"+ref,"echo",q.chapterNo,q.headword,
    "第"+q.chapterNo+"章 · "+q.hintZh+" · "+q.blankContext,
    {question:q,word:byWord.get(q.wordId)});
 }
 if(new Set(rows.map(x=>x.id)).size!==957)throw Error("LEDGER_DUPLICATE_SOURCE_IDS");
 return {
  schemaVersion:VERSION,
  bookId:bundle.book.id,
  manuscriptDigest:digest(rows.map(({id,sourceHash})=>({id,sourceHash}))),
  caution:"PRIVATE HUMAN REVIEW RECORD; not a commercial release approval; keep unpublished.",
  rows
 };
}

export function validateRainyNightReviewLedger(bundle,supplied){
 const expected=buildRainyNightReviewLedger(bundle);
 const failures=[];
 if(!supplied||typeof supplied!=="object"||Array.isArray(supplied))
  return {valid:false,failures:["LEDGER_NOT_AN_OBJECT"],reviewed:0,changesRequested:0,pending:957};
 if(supplied.schemaVersion!==VERSION)failures.push("SCHEMA_VERSION_MISMATCH");
 if(supplied.bookId!==expected.bookId)failures.push("BOOK_MISMATCH");
 if(!HASH.test(supplied.manuscriptDigest||"")||
    supplied.manuscriptDigest!==expected.manuscriptDigest)
  failures.push("MANUSCRIPT_CHANGED_REGENERATE_AND_RECHECK");
 if(!Array.isArray(supplied.rows))failures.push("ROWS_NOT_ARRAY");
 const provided=Array.isArray(supplied.rows)?supplied.rows:[];
 if(provided.length!==expected.rows.length)failures.push("ROW_COUNT_MISMATCH");
 const byId=new Map(expected.rows.map(row=>[row.id,row]));
 const seen=new Set();
 const counts={PENDING:0,REVIEWED_OK:0,CHANGES_REQUESTED:0};
 for(const r of provided){
  if(!r||typeof r!=="object"||Array.isArray(r)||typeof r.id!=="string"){
   failures.push("INVALID_ROW");continue;
  }
  if(seen.has(r.id)){failures.push("DUPLICATE_ID:"+r.id);continue;}
  seen.add(r.id);
  const src=byId.get(r.id);
  if(!src){failures.push("UNKNOWN_ROW_ID:"+r.id);continue;}
  if(Object.keys(r).sort().join("|")!==[...fields].sort().join("|"))
   failures.push("INVALID_ROW_FIELDS:"+r.id);
  for(const key of fields.filter(k=>!decisionFields.includes(k))){
   if(r[key]!==src[key]){failures.push("SOURCE_FIELD_CHANGED:"+r.id+":"+key);break;}
  }
  if(!DECISIONS.includes(r.decision)){
   failures.push("INVALID_DECISION:"+r.id);continue;
  }
  counts[r.decision]++;
  if(![r.reviewer,r.reviewedAt,r.note,r.evidenceRef].every(noteSafe))
   failures.push("INVALID_EDITOR_TEXT:"+r.id);
  if(r.decision==="PENDING"){
   if(r.reviewer||r.reviewedAt||r.note||r.evidenceRef)
    failures.push("PENDING_ROW_HAS_FAKE_SIGNOFF:"+r.id);
  }else{
   if(typeof r.reviewer!=="string"||r.reviewer.trim().length<3||
      typeof r.note!=="string"||r.note.trim().length<12||
      typeof r.evidenceRef!=="string"||r.evidenceRef.trim().length<3||
      typeof r.reviewedAt!=="string"||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(r.reviewedAt)||
      !Number.isFinite(Date.parse(r.reviewedAt))||
      new Date(r.reviewedAt).toISOString()!==new Date(Date.parse(r.reviewedAt)).toISOString())
    failures.push("HUMAN_REVIEW_EVIDENCE_MISSING:"+r.id);
  }
 }
 for(const src of expected.rows)if(!seen.has(src.id))failures.push("MISSING_ROW:"+src.id);
 return {
  valid:failures.length===0,failures:failures.slice(0,30),
  total:expected.rows.length,
  reviewed:counts.REVIEWED_OK,changesRequested:counts.CHANGES_REQUESTED,
  pending:counts.PENDING,
  publicationAllowed:false,productionDbTouched:false,
  warning:"Valid means structurally consistent and currently bound to source, NOT independently authenticated human approval."
 };
}

function main(){
 const args=process.argv.slice(2),bundle=composeRainyNightSeasonDraft().bundle;
 const output=resolve("private-output","rainy-night-s1-HUMAN-REVIEW-LEDGER.json");
 if(args.length===0||args.join(" ")==="--summary"){
  const {rows,...metadata}=buildRainyNightReviewLedger(bundle);
  process.stdout.write(JSON.stringify({...metadata,counts:{word:188,context:733,echo:36},
   reviewed:0,publicationAllowed:false},null,2)+"\n");
 }else if(args.length===1&&args[0]==="--write-private"){
  const data=buildRainyNightReviewLedger(bundle);
  mkdirSync(resolve("private-output"),{recursive:true,mode:0o700});
  writeFileSync(output,JSON.stringify(data,null,2)+"\n",
    {encoding:"utf8",mode:0o600,flag:"wx"});
  process.stdout.write(JSON.stringify({written:output,records:data.rows.length,
    automaticApprovals:0,publicationAllowed:false},null,2)+"\n");
 }else if(args.length===2&&args[0]==="--validate-private"){
  const supplied=JSON.parse(readFileSync(resolve(args[1]),"utf8"));
  const result=validateRainyNightReviewLedger(bundle,supplied);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.valid)process.exitCode=1;
 }else throw Error("Usage: --summary | --write-private | --validate-private <local-json-path>");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){process.stderr.write(e.message+"\n");process.exitCode=1;}
}
