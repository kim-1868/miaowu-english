#!/usr/bin/env node
// Run only on a trusted private workstation. Never upload outputs to public CI.
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {planExamFirstPrivateEditorialQueue} from '../src/global-dictionary-exam-first-review.js';

function jsonLines(path){
 const raw=readFileSync(resolve(path),'utf8');
 return raw.split(/\r?\n/u).filter(Boolean).map((text,i)=>{
   try{return JSON.parse(text)}catch{throw Error('INVALID_PRIVATE_JSONL_LINE_'+(i+1))}
 });
}
function main(args){
 if(args.length!==4)throw Error(
   'Usage: node scripts/audit-private-exam-first.mjs TARGETS.jsonl HISTORICAL.jsonl DRAFTS.jsonl PRIVATE_OUT_DIR');
 const [targets,historicalSenses,draftSuggestions]=args.slice(0,3).map(jsonLines);
 const output=resolve(args[3]);
 if(existsSync(output))throw Error('PRIVATE_OUTPUT_DIRECTORY_MUST_NOT_EXIST');
 const result=planExamFirstPrivateEditorialQueue({
   targets,historicalSenses,draftSuggestions,batchSize:100
 });
 mkdirSync(output,{recursive:false,mode:0o700});
 for(const [filename,data] of [
   ['summary.json',{status:result.status,...result.summary,
     private_workstation_only:true,not_content_approved:true,
     live_books_verified:false}],
   ['review-queue.jsonl',result.review_queue],
   ['missing-content-queue.jsonl',result.missing_content_queue],
   ['editorial-batches.json',result.batches]
 ]){
   const target=join(output,filename);
   const text=filename.endsWith('.jsonl')?
     data.map(row=>JSON.stringify(row)).join('\n')+'\n':
     JSON.stringify(data,null,2)+'\n';
   writeFileSync(target,text,{encoding:'utf8',mode:0o600,flag:'wx'});
 }
 console.log(JSON.stringify({status:result.status,...result.summary,
   remote_db_writes:0,publisher_approvals:0}));
}
try{main(process.argv.slice(2))}catch(e){
 console.error(String(e?.message||e));
 process.exitCode=1;
}
