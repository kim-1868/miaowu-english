// Fail-closed, local-only patch generator for an independently downloaded
// Cloudflare CURRENT production Worker. Does not call Cloudflare or deploy.
// Requires a separately verified SHA-256 of the exact downloaded live script.
// Usage: node scripts/prepare-live-coverage-410.mjs --source /private/live.mjs
//   --expected-sha256 <64 hex> --out /private/coverage-blocked.mjs
import {readFileSync,writeFileSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const hash=data=>createHash('sha256').update(data).digest('hex');
const fail=message=>{throw new Error('LIVE_COVERAGE_PATCH_BLOCKED: '+message)};
export function preparePatch(source,expectedHash){
 if(!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))fail('EXPECTED_SHA256_REQUIRED');
 if(hash(source)!==expectedHash.toLowerCase())fail('LIVE_WORKER_FINGERPRINT_MISMATCH');
 let code;
 try{code=new TextDecoder('utf-8',{fatal:true}).decode(source)}
 catch{fail('NOT_PLAIN_UTF8_WORKER_MODULE')}
 if(code.includes('COVERAGE_PREVIEW_DISABLED'))fail('ALREADY_GUARDED_NO_DOUBLE_PATCH');
 if(!code.includes('/api/ops/import/coverage'))fail('LIVE_SOURCE_DOES_NOT_CONTAIN_COVERAGE_ROUTE');
 // A Wrangler module bundle may differ radically from the historical Git repo.
 // Refuse ambiguous or nonmatching fetch handlers instead of guessing.
 const entry=/\basync\s+fetch\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*[A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)?\s*\)\s*\{/g;
 const found=[...code.matchAll(entry)];
 if(found.length!==1)fail('FETCH_ENTRY_COUNT_NOT_ONE:'+found.length);
 const [match,requestVariable]=found[0];
 const index=found[0].index+match.length;
 const guard='\n/* BEGIN MIAOWU D1 20261115 coverage 410 hotfix */\n'+
   'if (new URL('+requestVariable+'.url).pathname.replace(/\\/+$/, "") === "/api/ops/import/coverage") {'+
   'return new Response(JSON.stringify({error:"COVERAGE_PREVIEW_DISABLED",message:"单本预览不再自动扫描全书架；整批发布后统一复核。"}),'+
   '{status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}\n'+
   '/* END MIAOWU D1 20261115 coverage 410 hotfix */\n';
 const patched=code.slice(0,index)+guard+code.slice(index);
 if(patched.slice(0,index)+patched.slice(index+guard.length)!==code)
  fail('NON_INSERTION_EDIT_DETECTED');
 return {patched,patchBytes:Buffer.byteLength(guard),originalHash:hash(source),
   patchedHash:hash(Buffer.from(patched)),insertIndex:index};
}
async function main(){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){
  if(!['--source','--expected-sha256','--out'].includes(args[i])||!args[i+1]||options[args[i]])
   fail('USAGE_SOURCE_SHA_OUT');
  options[args[i]]=args[i+1];
 }
 if(Object.keys(options).length!==3)fail('USAGE_SOURCE_SHA_OUT');
 const input=realpathSync(options['--source']);
 const output=resolve(options['--out']);
 if(input===output||!output.endsWith('.mjs'))fail('OUTPUT_MUST_BE_A_DISTINCT_MJS_FILE');
 const raw=readFileSync(input);
 const proof=preparePatch(raw,options['--expected-sha256']);
 writeFileSync(output,proof.patched,{flag:'wx',mode:0o600});
 const syntax=spawnSync(process.execPath,['--check',output],{encoding:'utf8',timeout:12000});
 if(syntax.status!==0){
  unlinkSync(output);
  fail('PATCHED_WORKER_SYNTAX_CHECK_FAILED: '+(syntax.stderr||'').slice(0,300));
 }
 process.stdout.write(JSON.stringify({
  status:'LOCAL_ARTIFACT_ONLY_NOT_DEPLOYED',
  source_sha256:proof.originalHash,
  patched_sha256:proof.patchedHash,
  guard_insert_bytes:proof.patchBytes,
  other_changes:0,
  source_path:input,
  patch_path:output,
  limitation:'Must independently verify running deployment version, bindings, assets, and release before deploy.'
 })+'\n');
}
if(import.meta.url===new URL('file://'+resolve(process.argv[1]||'/')).href){
 main().catch(e=>{process.stderr.write(String(e.message||e)+'\n');process.exitCode=1});
}
