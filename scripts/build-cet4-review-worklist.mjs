// Non-mutating queue builder for the owner's CET4 source CSV + our draft JSONL.
// Source remains local to the operator; this script never uploads it to GitHub/D1.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCET4Source} from './audit-cet4-source.mjs';
import {auditSmartWordCard} from '../src/smart-vocab-card-quality.js';

const LOCAL_DRAFTS=[
  'content/lexicon/smart-vocab-pilot-20-review.jsonl',
  'content/lexicon/cet4-priority-draft-batch-20261110.jsonl',
  'content/lexicon/cet4-priority-draft-batch-2-20261110.jsonl'
];
export function auditCET4DraftCoverage(sourceCsv,allDrafts=[]){
  const source=auditCET4Source(sourceCsv);
  const byHead=new Map(source.queue.map(r=>[r.headword.toLocaleLowerCase('en'),r]));
  const unique=new Map(),issues=[];
  for(const candidate of allDrafts){
    if(candidate?.category_slug!=='cet4')continue;
    const key=String(candidate.headword||'').toLocaleLowerCase('en').trim();
    if(!key||!byHead.has(key))throw Error('DRAFT_NOT_IN_SOURCE_'+key);
    if(unique.has(key))throw Error('CET4_DRAFT_HEADWORD_COLLISION_'+key);
    if(candidate.word_id!==('sv_cet4_'+key))throw Error('CET4_DRAFT_ID_MISMATCH_'+key);
    const original=byHead.get(key);
    const qa=auditSmartWordCard(candidate);
    if(!qa.structurallyReady)issues.push({headword:key,type:'DRAFT_STRUCTURAL_QA',errors:qa.errors});
    if(original.frequency_source!==candidate.frequency_source||
       original.frequency_rank!==candidate.frequency_rank)
      issues.push({headword:key,type:'SOURCE_FREQUENCY_MISMATCH',
        source:original.frequency_source,sourceRank:original.frequency_rank,
        draft:candidate.frequency_source,draftRank:candidate.frequency_rank});
    if(candidate.source_first_tier&&candidate.source_first_tier!==original.first_tier)
      issues.push({headword:key,type:'SOURCE_TIER_MISMATCH'});
    if(candidate.reviewed===true)
      issues.push({headword:key,type:'CANNOT_ASSUME_REVIEW_FROM_DRAFT_FILE'});
    unique.set(key,{...candidate,sourceFirstTier:original.first_tier,qa});
  }
  const backlog=source.queue.filter(r=>!unique.has(r.headword.toLocaleLowerCase('en'))).map(row=>({
    ...row,
    stage:'NO_DRAFT_YET',
    // No IPA, meaning, example, POS or original grade should be guessed.
    needs_independent_bilingual_example:true,
    needs_editorial_sense_review:true,
    needs_ipa_verification:true
  }));
  const review=source.queue.filter(r=>unique.has(r.headword.toLocaleLowerCase('en'))).map(row=>{
    const card=unique.get(row.headword.toLocaleLowerCase('en'));
    return {headword:row.headword,word_id:card.word_id,
      first_tier:row.first_tier,frequency_source:row.frequency_source,
      frequency_rank:row.frequency_rank,qa_errors:card.qa.errors,
      qa_warnings:card.qa.warnings,
      stage:'DRAFT_NEEDS_EDITORIAL_SIGNOFF',reviewed:false};
  });
  const groups=arr=>({
    firstCET4:arr.filter(r=>r.first_tier==='四级').length,
    firstHighSchool:arr.filter(r=>r.first_tier==='高考').length
  });
  return {
    status:'READ_ONLY_NO_RELEASE',
    sourceSha256:source.summary.sha256,
    totalSourceHeadwords:source.summary.cet4UniqueHeadwords,
    draftHeadwords:unique.size,
    draftTiers:groups(review),
    pendingHeadwords:backlog.length,
    pendingTiers:groups(backlog),
    sourceQualityFlags:source.summary.flags,
    sourceExceptionsNeedingReview:source.queue.filter(r=>r.source_exception_reason).length,
    draftIssues:issues,
    approvedForSale:0,
    backlog,review
  };
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const csv=process.argv[2];
  const at=process.argv.indexOf('--out'),dir=at>=0?process.argv[at+1]:null;
  if(!csv||csv.startsWith('-')||!dir){
    console.error('Usage: node scripts/build-cet4-review-worklist.mjs <owner-local-source.csv> --out <local-output-directory>');
    process.exitCode=2;
  }else{
    try{
      const drafts=LOCAL_DRAFTS.flatMap(path=>readFileSync(resolve(path),'utf8')
        .trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse));
      const report=auditCET4DraftCoverage(readFileSync(resolve(csv),'utf8'),drafts);
      mkdirSync(resolve(dir),{recursive:true});
      writeFileSync(join(resolve(dir),'cet4-review-worklist-summary.json'),
        JSON.stringify(Object.fromEntries(Object.entries(report)
          .filter(([key])=>!['backlog','review'].includes(key))),null,2)+'\n');
      writeFileSync(join(resolve(dir),'cet4-not-yet-drafted.jsonl'),
        report.backlog.map(x=>JSON.stringify(x)).join('\n')+'\n');
      writeFileSync(join(resolve(dir),'cet4-draft-editorial-queue.jsonl'),
        report.review.map(x=>JSON.stringify(x)).join('\n')+'\n');
      console.log(JSON.stringify({status:report.status,source:report.totalSourceHeadwords,
        draft:report.draftHeadwords,remaining:report.pendingHeadwords,issues:report.draftIssues.length},null,2));
      if(report.draftIssues.length)process.exitCode=1;
    }catch(e){
      console.error('CET4_WORKLIST_BLOCKED:',e?.message||String(e));process.exitCode=1;
    }
  }
}
