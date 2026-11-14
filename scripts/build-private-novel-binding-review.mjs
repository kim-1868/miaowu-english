// A local-only helper: --source historical-map.jsonl --novels private-folder --out private.json
// Does not fetch Cloudflare, deploy, upload, or write study records.
import {realpathSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,relative,sep,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateNovelBindingReview} from '../src/global-dictionary-private-novel-binding-review.js';
const ROOT=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const outside=(path,exists=true)=>{
 const full=exists?realpathSync(resolve(path)):resolve(path);
 const target=exists?full:realpathSync(dirname(full));
 const rel=relative(ROOT,target);
 if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))
  throw Error('NOVEL_BINDING_INPUT_OUTPUT_MUST_BE_PRIVATE');
 return full;
};
export function compilePrivateNovelBindingReview({novels,candidates}){
 return createPrivateNovelBindingReview({documents:novels,historicalCandidates:candidates});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const flags=process.argv.slice(2);
  if(flags.length!==6)throw Error('USAGE --source PRIVATE_HISTORY.jsonl --novels PRIVATE_DIR --out PRIVATE_REPORT.json');
  const options=new Map();
  for(let i=0;i<6;i+=2)options.set(flags[i],flags[i+1]);
  if(options.size!==3||!options.has('--source')||!options.has('--novels')||!options.has('--out'))
   throw Error('USAGE_INVALID_FLAGS');
  const src=outside(options.get('--source')),novels=outside(options.get('--novels'));
  const target=outside(options.get('--out'),false);
  const candidates=readFileSync(src,'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x));
  const docs=readdirSync(novels).filter(n=>n.endsWith('.json')).sort().map(n=>
   JSON.parse(readFileSync(outside(join(novels,n)),'utf8')));
  const report=compilePrivateNovelBindingReview({novels:docs,candidates});
  writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:report.status,summary:report.summary,
   source_private:true,publisher_approved:false,remote_writes:0}));
 }catch(e){console.error('PRIVATE_NOVEL_BINDING_REVIEW_ABORT',e.message);process.exitCode=1}
}
