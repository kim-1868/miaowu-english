// Private JSONL reviewer decision preflight, offline only.
// No Cloudflare token, no DB writes, no automatically approved lessons.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {validatePrivateSenseReviewDecisions} from '../src/global-dictionary-editorial-signoff-gate.js';
export function checkPrivateReviewerDecisionJsonl({candidateJsonl,decisionJsonl}){
 if(typeof candidateJsonl!=='string'||typeof decisionJsonl!=='string')
  throw Error('PRIVATE_REVIEW_CONTENT_MUST_BE_TEXT');
 const lines=s=>s.trim()?s.trim().split(/\r?\n/u).filter(Boolean).map(x=>JSON.parse(x)):[];
 const candidates=lines(candidateJsonl),decisions=lines(decisionJsonl);
 return validatePrivateSenseReviewDecisions(candidates,decisions);
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const args=process.argv.slice(2),get=k=>{
  const i=args.indexOf(k);return i<0?null:args[i+1]
 },source=get('--source'),decisions=get('--decisions'),out=get('--out');
 if(!source||!decisions||!out){
  console.error('Usage: node scripts/check-private-reviewer-decisions.mjs --source /private/senses.jsonl --decisions /private/reviewer-decisions.jsonl --out /private/qa-review.json');
  process.exitCode=2;
 }else try{
  if(existsSync(resolve(out)))throw Error('REFUSE_TO_OVERWRITE_EXISTING_PRIVATE_REVIEW_REPORT');
  const report=checkPrivateReviewerDecisionJsonl({
   candidateJsonl:readFileSync(resolve(source),'utf8'),
   decisionJsonl:readFileSync(resolve(decisions),'utf8')
  });
  writeFileSync(resolve(out),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:report.status,total:report.total_source_candidates,
   received:report.received_decisions,counts:report.status_counts,
   approved:report.final_approved_senses_created,d1_writes:report.cloudflare_database_writes}));
 }catch(e){
  console.error('PRIVATE_REVIEW_DECISIONS_REJECTED',e?.message||e);
  process.exitCode=1;
 }
}
