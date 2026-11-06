// P5: purely offline shadow mapping. NEVER alters production DB, word IDs, or study state.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {studyKey} from '../src/study-identity.js';
const normal=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu,'');
const normalizedPos=value=>normal(value).replace(/[.。]/gu,'').replace(/[／]/gu,'/');
const sortedUnique=arr=>[...new Set(arr)].sort((a,b)=>a.localeCompare(b,'en'));
const noControl=v=>typeof v==='string'&&!/[\u0000-\u001f]/.test(v)&&v.trim().length>0;
function normalizedCard(row){
 const wordId=String(row?.word_id||row?.wordId||row?.sourceWordId||row?.id||'');
 const headword=String(row?.headword||'');
 const pos=String(row?.part_of_speech??row?.partOfSpeech??'');
 const meaning=String(row?.meaning_zh??row?.meaningZh??'');
 if(!/^[a-zA-Z][a-zA-Z0-9_-]{1,79}$/.test(wordId)||!noControl(headword)||!noControl(pos)||!noControl(meaning))
  throw Error('INVALID_WORD_ID_OR_TEACHING_FIELDS:'+wordId);
 return {wordId,headword,pos,meaning,ipaUk:String(row?.phonetic_uk??row?.phoneticUk??''),
  ipaUs:String(row?.phonetic_us??row?.phoneticUs??''),
  contexts:Array.isArray(row.contexts)?row.contexts.length:0};
}
function asCards(input){
 const rows=Array.isArray(input)?input:Array.isArray(input?.cards)?input.cards:Array.isArray(input?.senses)?input.senses:null;
 if(!rows)throw Error('SNAPSHOT_REQUIRES_CARDS_OR_SENSES');
 if(rows.length>200000)throw Error('SNAPSHOT_TOO_LARGE');
 return rows.map(normalizedCard);
}
function fingerprint(cards){
 const serial=cards.map(c=>[c.wordId,normal(c.headword),normalizedPos(c.pos),normal(c.meaning),c.ipaUk,c.ipaUs])
   .sort((a,b)=>a[0].localeCompare(b[0],'en')).map(x=>JSON.stringify(x)).join('\n');
 return createHash('sha256').update(serial).digest('hex');
}
const makeProblem=(code,detail,ids=[])=>({code,detail,wordIds:sortedUnique(ids)});
export function buildSenseShadow(snapshot,approvalManifest=null,{includeCandidates=false,includeAssignments=false}={}){
 const rows=asCards(snapshot),byId=new Map(),blockers=[];
 for(const row of rows){
  const old=byId.get(row.wordId);
  if(old){
   if([old.headword,old.pos,old.meaning,old.ipaUk,old.ipaUs].join('\u0001')!==
      [row.headword,row.pos,row.meaning,row.ipaUk,row.ipaUs].join('\u0001'))
    blockers.push(makeProblem('SAME_WORD_ID_DIFFERENT_DEFINITION','Conflicting definitions for existing word ID',[row.wordId]));
  } else byId.set(row.wordId,row);
 }
 const unique=[...byId.values()].sort((a,b)=>a.wordId.localeCompare(b.wordId,'en'));
 const sourceFingerprint=fingerprint(unique);
 const byCandidate=new Map(),byHeadword=new Map();
 for(const row of unique){
  const key=studyKey({word_id:row.wordId,headword:row.headword,part_of_speech:row.pos,meaning_zh:row.meaning});
  const list=byCandidate.get(key)||[];list.push(row);byCandidate.set(key,list);
  const lemma=normal(row.headword);const choices=byHeadword.get(lemma)||new Set();choices.add(key);byHeadword.set(lemma,choices);
 }
 const candidates=[...byCandidate.entries()].filter(([,rows])=>rows.length>1).map(([candidateKey,items])=>({
  candidateKey,wordIds:items.map(x=>x.wordId).sort(),headword:items[0].headword,
  differentIpa:sortedUnique(items.map(x=>x.ipaUk+'|'+x.ipaUs)).length>1,
  differentSecondaryGloss:sortedUnique(items.map(x=>normal(x.meaning))).length>1,
  contextCount:items.reduce((n,x)=>n+x.contexts,0),
  status:'requires_semantic_review_not_auto_merge'
 })).sort((a,b)=>b.wordIds.length-a.wordIds.length||a.candidateKey.localeCompare(b.candidateKey));
 const assignments=new Map(unique.map(x=>[x.wordId,'legacy:'+x.wordId]));
 const validatedGroups=[];const seenApprovedIds=new Set(),seenSenseIds=new Set();
 if(approvalManifest!==null){
  if(!approvalManifest||approvalManifest.version!==1||!Array.isArray(approvalManifest.groups))
   blockers.push(makeProblem('APPROVAL_SCHEMA_INVALID','Expected version:1 and groups array'));
  if(approvalManifest?.snapshotFingerprint!==sourceFingerprint)
   blockers.push(makeProblem('APPROVAL_SNAPSHOT_MISMATCH','Review approval is not pinned to this exact snapshot'));
  for(const [i,g] of (Array.isArray(approvalManifest?.groups)?approvalManifest.groups:[]).entries()){
   const label='approval group '+(i+1);
   if(!g||g.status!=='approved'||!/^reviewed:[a-z0-9_-]{3,80}$/.test(g.senseId||'')||
      !noControl(g.reviewer)||!noControl(g.evidence)||/^\d{4}-\d{2}-\d{2}$/.test(g.reviewedAt||'')===false||
      !Array.isArray(g.wordIds)||g.wordIds.length<2||g.wordIds.length>500){
     blockers.push(makeProblem('APPROVAL_GROUP_INVALID',label));continue;
   }
   if(seenSenseIds.has(g.senseId)){blockers.push(makeProblem('DUPLICATE_REVIEWED_SENSE_ID',label));continue}
   seenSenseIds.add(g.senseId);
   const ids=g.wordIds.map(String),found=ids.map(id=>byId.get(id));
   if(new Set(ids).size!==ids.length||found.some(x=>!x)){
    blockers.push(makeProblem('APPROVAL_UNKNOWN_OR_DUPLICATE_WORD_ID',label,ids));continue;
   }
   if(ids.some(id=>seenApprovedIds.has(id))){
    blockers.push(makeProblem('WORD_ID_APPROVED_IN_MULTIPLE_SENSES',label,ids));continue;
   }
   if(sortedUnique(found.map(x=>normal(x.headword))).length!==1||
      sortedUnique(found.map(x=>normalizedPos(x.pos))).length!==1||
      found.some(x=>/[\/]/.test(normalizedPos(x.pos)))){
    blockers.push(makeProblem('APPROVAL_DIFFERENT_HEADWORD_OR_POS',label,ids));continue;
   }
   ids.forEach(id=>seenApprovedIds.add(id));
   validatedGroups.push({senseId:g.senseId,wordIds:sortedUnique(ids),reviewer:g.reviewer,reviewedAt:g.reviewedAt});
  }
  // Never apply a partial approval manifest with even one unresolved blocker.
  if(!blockers.length)for(const g of validatedGroups)for(const id of g.wordIds)assignments.set(id,g.senseId);
 }
 const mixedPOS=unique.filter(x=>/[\/]/.test(normalizedPos(x.pos))).length;
 const otherSenseLemmas=[...byHeadword.values()].filter(keys=>keys.size>1).length;
 const approvedGroups=blockers.length?[]:validatedGroups;
 const summary={
  snapshotCards:rows.length,distinctWordIds:unique.length,candidateClusters:candidates.length,
  candidateExtraWordIds:candidates.reduce((n,x)=>n+x.wordIds.length-1,0),
  sameHeadwordMultipleSenseKeys:otherSenseLemmas,mixedPosCards:mixedPOS,
  differentIpaCandidateClusters:candidates.filter(x=>x.differentIpa).length,
  approvedGroups:approvedGroups.length,approvedWordIds:approvedGroups.reduce((n,x)=>n+x.wordIds.length,0),
  blockingProblems:blockers.length
 };
 return {version:'v11-p5-shadow/1',sourceFingerprint,summary,blockers,
  candidates:includeCandidates?candidates:undefined,
  assignments:includeAssignments&&!blockers.length?Object.fromEntries([...assignments].sort((a,b)=>a[0].localeCompare(b[0],'en'))):undefined,
  productionWritten:false,releaseApproved:false,
  note:'Only explicit semantic approval produces a shared shadow identity. No reader data, D1 or word IDs changed.'};
}
function parseArgs(argv){
 const parsed={snapshot:null,approvals:null,includeCandidates:false,includeAssignments:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];if(a==='--snapshot'||a==='--approvals')parsed[a==='--snapshot'?'snapshot':'approvals']=argv[++i];
  else if(a==='--candidates')parsed.includeCandidates=true;
  else if(a==='--assignments')parsed.includeAssignments=true;
  else if(a==='--help')return {help:true};
  else throw Error('UNRECOGNIZED_ARGUMENT:'+a);
 }
 if(!parsed.snapshot)throw Error('REQUIRES_--snapshot');
 return parsed;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const opt=parseArgs(process.argv.slice(2));
  if(opt.help)console.log('node scripts/v11-shadow-sense-audit.mjs --snapshot PRIVATE_P5_JSON [--approvals REVIEWED_JSON] [--candidates] [--assignments]');
  else{
   const source=JSON.parse(readFileSync(resolve(opt.snapshot),'utf8'));
   const approvals=opt.approvals?JSON.parse(readFileSync(resolve(opt.approvals),'utf8')):null;
   const result=buildSenseShadow(source,approvals,opt);
   console.log(JSON.stringify(result,null,2));
   if(result.blockers.length)process.exitCode=1;
  }
 }catch(error){console.error(JSON.stringify({ok:false,error:String(error.message)}));process.exitCode=2}
}
