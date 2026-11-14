// Offline exam-first NEW sense review bridge. No OPS or Cloudflare connection.
// Does NOT approve source meanings, assign approved sense IDs or merge legacy users.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hydrateNewSenseInitialReviewTemplates} from '../src/global-dictionary-new-sense-initial-review-adapter.js';
import {validateNewSenseEditorialDecisions} from '../src/global-dictionary-new-sense-editorial-gate.js';

const isHistoricallyLinked = row=>row?.batch==='HISTORICAL_SENSE_80';
export function readSafeNewSenseJsonl(text,{allowHistoryFilter=false}={}){
 if(typeof text!=='string'||!text.trim())throw Error('PRIVATE_JSONL_EMPTY_OR_INVALID');
 const rows=text.trim().split(/\r?\n/u).map((line,i)=>{
  try{return JSON.parse(line)}catch{throw Error('PRIVATE_JSONL_SYNTAX_INVALID_AT_LINE_'+(i+1))}
 });
 if(!rows.length)throw Error('PRIVATE_JSONL_NO_ROWS');
 // Historical senses are not allowed through the new-sense gate.
 if(allowHistoryFilter){
  const others=rows.filter(x=>!isHistoricallyLinked(x));
  if(!others.length)throw Error('PRIVATE_JSONL_HAS_ONLY_HISTORICAL_SENSES');
  return others;
 }
 if(rows.some(isHistoricallyLinked))throw Error('HISTORICAL_SENSES_REQUIRE_LEGACY_GATE');
 return rows;
}
export function prepareOfflineNewSenseInitialReview({sourceJsonl,initialReviewJsonl}){
 const sources=readSafeNewSenseJsonl(sourceJsonl,{allowHistoryFilter:true});
 const initial=readSafeNewSenseJsonl(initialReviewJsonl);
 const prepared=hydrateNewSenseInitialReviewTemplates(sources,initial);
 const gated=validateNewSenseEditorialDecisions(sources,prepared.templates);
 if(gated.blocked!==sources.length||gated.pending_authenticated_publisher_signoff!==0||
    gated.publisher_approved_senses_created!==0||gated.user_study_state_writes!==0||
    gated.d1_writes!==0)
  throw Error('INITIAL_NEW_SENSE_REVIEW_MUST_BE_HOLD_ONLY');
 return prepared;
}
export function validateOfflineNewSenseEditorial({sourceJsonl,decisionJsonl}){
 const sources=readSafeNewSenseJsonl(sourceJsonl,{allowHistoryFilter:true});
 const decisions=readSafeNewSenseJsonl(decisionJsonl);
 return validateNewSenseEditorialDecisions(sources,decisions);
}

function cli(argv){
 const args=argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!['--source','--initial-review','--decisions','--out'].includes(key)||
     !value||value.startsWith('--')||key in options)
    throw Error('USAGE: --source PRIVATE_SOURCE.jsonl --initial-review PRIVATE_HTML_EXPORT.jsonl --out PRIVATE_HOLD_TEMPLATES.jsonl OR --source ... --decisions PRIVATE_EDITORIAL_DECISIONS.jsonl --out PRIVATE_REPORT.json');
  options[key]=value;
 }
 if(!options['--source']||!options['--out']||
    Boolean(options['--initial-review'])===Boolean(options['--decisions']))
   throw Error('NEW_SENSE_REVIEW_REQUIRE_EXACTLY_ONE_MODE');
 const sourceJsonl=readFileSync(resolve(options['--source']),'utf8');
 const initial=options['--initial-review'];
 const result=initial?prepareOfflineNewSenseInitialReview({
   sourceJsonl,initialReviewJsonl:readFileSync(resolve(initial),'utf8')
  }):validateOfflineNewSenseEditorial({
   sourceJsonl,decisionJsonl:readFileSync(resolve(options['--decisions']),'utf8')
  });
 const content=initial?result.templates.map(x=>JSON.stringify(x)).join('\n')+'\n':
  JSON.stringify(result,null,2)+'\n';
 // Never overwrite an existing review decision/report. Local output only.
 writeFileSync(resolve(options['--out']),content,{encoding:'utf8',flag:'wx',mode:0o600});
 return initial?{status:result.status,total:result.source_senses,
  initially_checked:result.initially_checked,
  publisher_approved_senses:result.publisher_approved_senses,cloudflare_d1_writes:0}:
  {status:result.status,total:result.total_candidates,
   blocked:result.blocked,ready_for_external_ops_signoff:result.pending_authenticated_publisher_signoff,
   publisher_approved_senses:result.publisher_approved_senses_created,cloudflare_d1_writes:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(cli(process.argv)))}
 catch(e){console.error('PRIVATE_NEW_SENSE_EDITORIAL_REVIEW_REJECTED',e.message);process.exitCode=1}
}