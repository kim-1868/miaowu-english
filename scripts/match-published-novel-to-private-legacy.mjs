// Export private, offline novel-to-owner-historical-card candidate comparison.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {comparePublishedNovelToHistoricalWordcards}
 from '../src/global-dictionary-published-legacy-compare.js';
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const args=process.argv.slice(2),arg=k=>{
  const i=args.indexOf(k);return i<0?null:args[i+1];
 };
 const snapshot=arg('--snapshot'),novel=arg('--novel'),out=arg('--out');
 if(!snapshot||!novel||!out){
  console.error('Usage: node scripts/match-published-novel-to-private-legacy.mjs --snapshot /private/p5.json --novel /private/novel.json --out /private/review.json');
  process.exitCode=2;
 }else try{
  if(existsSync(resolve(out)))throw Error('NO_OVERWRITE_OF_PRIVATE_REVIEW');
  const src=readFileSync(resolve(snapshot),'utf8');
  const text=readFileSync(resolve(novel),'utf8');
  const result=comparePublishedNovelToHistoricalWordcards(JSON.parse(src),JSON.parse(text));
  const digest=createHash('sha256').update(text).digest('hex');
  writeFileSync(resolve(out),JSON.stringify({...result,novel_sha256:digest},null,2)+'\n',
   {flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:result.status,counts:result.counts,
   old_user_state_modified:false,cloudflare_access:false}));
 }catch(e){console.error('HISTORICAL_NOVEL_COMPARE_BLOCKED',e.message);process.exitCode=1}
}
