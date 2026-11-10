// Offline owner-only script: the paid story and old card data stay on disk.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareHistoricalSenseReview}
 from '../src/global-dictionary-historical-sense-worklist.js';
export function prepareHashedHistoricalSenseReview(snapshot){
 const data=prepareHistoricalSenseReview(snapshot);
 return {...data,candidates:data.candidates.map(x=>({
  ...x,review_candidate_hash:createHash('sha256').update(x.review_candidate_key)
   .digest('hex')
 }))};
}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
 const args=process.argv.slice(2),arg=k=>{
  const i=args.indexOf(k);return i<0?null:args[i+1];
 },source=arg('--snapshot'),out=arg('--out');
 if(!source||!out){
  console.error('Usage: node scripts/build-private-historical-sense-worklist.mjs --snapshot /private/history.json --out /private/review.json');
  process.exitCode=2;
 }else try{
  if(existsSync(resolve(out)))throw Error('REFUSE_TO_OVERWRITE_PRIVATE_REVIEW');
  const compiled=prepareHashedHistoricalSenseReview(
   JSON.parse(readFileSync(resolve(source),'utf8')));
  writeFileSync(resolve(out),JSON.stringify(compiled,null,2)+'\n',
   {flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:compiled.status,summary:compiled.summary,
   legacy_word_ids_modified:0,cloudflare_writes:0}));
 }catch(e){console.error('PRIVATE_REVIEW_BLOCKED',e?.message||e);process.exitCode=1}
}
