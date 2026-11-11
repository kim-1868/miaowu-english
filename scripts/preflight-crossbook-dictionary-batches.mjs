// Private offline CLI. Inputs are never read from public Git or D1.
// Usage: node scripts/preflight-crossbook-dictionary-batches.mjs
//   --cet4-batch /private/cet4.json --cet6-batch /private/cet6.json
//   --postgrad-drafts /private/postgrad-folder --lexicon /private/owner.csv
//   --out /private/crossbook-review.json
import {readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileDictionaryDraftIndex} from './build-global-dictionary-index.mjs';
import {buildGlobalDictionaryIndex} from '../src/global-dictionary-matcher.js';
import {planCrossbookDictionaryPreflight}
 from '../src/global-dictionary-crossbook-batch-preflight.js';

const ROOT=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const inside=root=>{
 const rel=relative(ROOT,root);
 return !rel||rel==='..'?rel==='':(!rel.startsWith('..'+sep)&&!isAbsolute(rel));
};
function privateRead(path){
 const abs=realpathSync(resolve(path));
 if(inside(abs))throw Error('PRIVATE_SOURCE_MUST_NOT_BE_INSIDE_PUBLIC_GIT_REPO');
 return readFileSync(abs,'utf8');
}
export function producePrivateCrossbookPreflight({
 cet4Batch=null,cet6Batch=null,postgradDrafts=[],lexicon=null
}={}){
 const bundles=[];
 for(const [grade,batch] of [['cet4',cet4Batch],['cet6',cet6Batch]]){
   if(batch){
     const b=typeof batch==='string'?JSON.parse(privateRead(batch)):batch;
     if(b?.category!==grade)throw Error('CROSSBOOK_BATCH_LEVEL_MISMATCH');
     bundles.push(b);
   }
 }
 let drafts=postgradDrafts;
 if(typeof drafts==='string'){
   const directory=realpathSync(resolve(drafts));
   if(inside(directory))throw Error('PRIVATE_DRAFT_FOLDER_MUST_BE_OUTSIDE_GIT');
   drafts=readdirSync(directory).filter(p=>p.endsWith('.json')).sort()
     .map(p=>JSON.parse(privateRead(join(directory,p))));
 }
 if(!Array.isArray(drafts))throw Error('INVALID_PRIVATE_POSTGRAD_DRAFTS');
 const index=lexicon?
   (()=>{const draft=compileDictionaryDraftIndex(privateRead(lexicon));
     return buildGlobalDictionaryIndex({entries:draft.entries,forms:draft.forms});})():null;
 return planCrossbookDictionaryPreflight({bundles,postgradDrafts:drafts,index});
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const args=process.argv.slice(2),validKeys=new Set([
   '--cet4-batch','--cet6-batch','--postgrad-drafts','--lexicon','--out'
 ]);
 try{
   if(args.length<4||args.length%2||args.some((a,i)=>i%2===0&&!validKeys.has(a)))
     throw Error('USAGE_INVALID_ARGUMENTS');
   const opts=new Map();
   for(let i=0;i<args.length;i+=2){
     if(opts.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))
       throw Error('USAGE_DUPLICATE_OR_EMPTY_ARGUMENT');
     opts.set(args[i],args[i+1]);
   }
   const out=opts.get('--out');
   if(!out)throw Error('USAGE_OUTPUT_FILE_REQUIRED');
   const target=resolve(out),parent=realpathSync(dirname(target));
   if(inside(parent))throw Error('PRIVATE_OUTPUT_MUST_NOT_BE_INSIDE_PUBLIC_GIT_REPO');
   const report=producePrivateCrossbookPreflight({
     cet4Batch:opts.get('--cet4-batch')??null,
     cet6Batch:opts.get('--cet6-batch')??null,
     postgradDrafts:opts.get('--postgrad-drafts')??[],
     lexicon:opts.get('--lexicon')??null
   });
   // No paid manuscript prose, individual user row, dictionary source rows
   // or API token is emitted to logs or uploaded to any server.
   writeFileSync(target,JSON.stringify(report,null,2)+'\n',
     {flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:report.status,summary:report.summary,
     saved_private_report:true,contains_story_sentences:false}));
 }catch(e){
   console.error('PRIVATE_CROSSBOOK_PREFLIGHT_BLOCKED',e.message);
   process.exitCode=1;
 }
}
