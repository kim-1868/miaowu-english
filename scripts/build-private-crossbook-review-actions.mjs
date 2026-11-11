// PRIVATE input and output only. No network or D1; no authenticated signoff.
import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planCrossbookEditorialActions} from '../src/global-dictionary-crossbook-review-action-plan.js';
const ROOT=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
function requireOutside(path,exists){
 const real=exists?realpathSync(resolve(path)):resolve(path);
 const target=exists?real:realpathSync(dirname(real));
 const rel=relative(ROOT,target);
 if(!rel||rel==='..'?rel==='':!rel.startsWith('..'+sep)&&!isAbsolute(rel))
   throw Error('PRIVATE_REVIEW_PLAN_MUST_STAY_OUTSIDE_GIT_REPOSITORY');
 return real;
}
export function buildEditorialActionPlan(report,{perGradeLimit=120}={}){
 return planCrossbookEditorialActions(report,{perGradeLimit});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  if(args.length!==4&&args.length!==6)throw Error('USAGE_REQUIRED');
  const pairs=new Map();
  for(let i=0;i<args.length;i+=2){
   if(pairs.has(args[i])||!['--report','--out','--batch-size'].includes(args[i])||
      !args[i+1])throw Error('USAGE_INVALID_ARGUMENT');
   pairs.set(args[i],args[i+1]);
  }
  if(!pairs.has('--report')||!pairs.has('--out'))throw Error('USAGE_REQUIRED');
  const input=requireOutside(pairs.get('--report'),true);
  const output=requireOutside(pairs.get('--out'),false);
  const batch=pairs.has('--batch-size')?Number(pairs.get('--batch-size')):120;
  const plan=buildEditorialActionPlan(JSON.parse(readFileSync(input,'utf8')),
    {perGradeLimit:batch});
  writeFileSync(output,JSON.stringify(plan,null,2)+'\n',
    {flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:plan.status,summary:plan.summary,
   by_grade:plan.by_grade,contains_paid_story_text:false,remote_writes:0}));
 }catch(e){
  console.error('PRIVATE_REVIEW_ACTION_PLAN_ABORT',e.message);
  process.exitCode=1;
 }
}
