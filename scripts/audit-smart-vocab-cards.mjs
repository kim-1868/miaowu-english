// Read-only editorial preflight for user-supplied / drafted smart-vocabulary JSONL.
// No database connection and no review approval side effects.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {auditSmartWordCard,summarizeSmartCardAudit} from '../src/smart-vocab-card-quality.js';

const filename=process.argv[2];
const strict=process.argv.includes('--strict');
const requireApproved=process.argv.includes('--require-approved');
if(!filename||filename.startsWith('-')){
  console.error('Usage: node scripts/audit-smart-vocab-cards.mjs <cards.jsonl> [--strict] [--require-approved]');
  process.exit(2);
}
try{
  const raw=readFileSync(resolve(filename),'utf8');
  const cards=[],parsingErrors=[];
  for(const [i,line] of raw.split(/\r?\n/u).entries()){
    if(!line.trim())continue;
    try{
      const parsed=JSON.parse(line);
      if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('not an object');
      cards.push(parsed);
    }catch(e){parsingErrors.push({line:i+1,error:'INVALID_CARD_JSON'})}
  }
  const result=summarizeSmartCardAudit(cards);
  const unique=new Set(),duplicates=[];
  for(const item of cards){
    const composite=String(item.category_slug)+'|'+String(item.word_id);
    if(unique.has(composite))duplicates.push(composite);
    unique.add(composite);
  }
  const problems=parsingErrors.length+duplicates.length+
    (result.total-result.structurallyReady);
  const pendingReview=result.total-result.commerciallyApproved;
  const output={status:'READ_ONLY_EDITORIAL_AUDIT',rows:result.total,
    structurallyReady:result.structurallyReady,
    manuallyApproved:result.commerciallyApproved,
    pendingHumanReview:pendingReview,
    duplicateCatalogIds:duplicates,
    parsingErrors,errorCounts:result.errors,warningCounts:result.warnings,
    firstIssues:result.results.filter(r=>r.errors.length||r.warnings.length).slice(0,40)};
  console.log(JSON.stringify(output,null,2));
  if((strict&&problems)||(requireApproved&&(problems||pendingReview>0||result.total===0)))
    process.exitCode=1;
}catch(e){
  console.error('CARD_AUDIT_FAILED:',String(e.message||e));
  process.exitCode=1;
}
