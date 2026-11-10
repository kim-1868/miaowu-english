// Manual-only STAGING schema utility. NEVER run on production.
// No remote actions unless --execute-test-only and all GitHub confirmations.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {rehearseDictionaryAdditiveMigrations,MIGRATIONS}
 from './rehearse-dictionary-staging-migration.mjs';
const ROOT=new URL('../',import.meta.url);
const NAME='miaowu-english-test';
const UUID='88a817cb-23bb-4ae4-bcb8-92286c4165d4';
const BRANCH='refs/heads/feature/v11-smart-vocab-preflight-20261109';
const REPO='kim-1868/miaowu-english';
export function assertTestD1Configuration(configuration){
 if(configuration?.name!=='miaowu-english-staging'||
    configuration?.vars?.APP_ENV!=='staging'||
    configuration?.d1_databases?.length!==1||
    configuration.d1_databases[0].database_name!==NAME||
    configuration.d1_databases[0].database_id!==UUID)
  throw Error('STAGING_DATABASE_NAME_OR_UUID_MISMATCH');
 return true;
}
export function assertGitHubManualApproval(env){
 if(!((env.GITHUB_EVENT_NAME==='workflow_dispatch')||
      (env.GITHUB_EVENT_NAME==='push' &&
       env.GITHUB_WORKFLOW==='One-shot guarded staging D1 dictionary 013-018' &&
       env.GITHUB_WORKFLOW_REF?.includes('/.github/workflows/global-dictionary-staging-once-20261110.yml@refs/heads/feature/v11-smart-vocab-preflight-20261109')))||
    env.GITHUB_REPOSITORY!==REPO||env.GITHUB_ACTOR!=='kim-1868'||
    env.GITHUB_REF!==BRANCH||
    env.MIAOWU_STAGING_SCHEMA_APPROVAL!=='STAGING_013_018_ADD_ONLY'||
    env.MIAOWU_STAGING_TARGET!==NAME||
    env.MIAOWU_STAGING_UUID!==UUID||
    !env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('STAGING_SCHEMA_MANUAL_APPROVAL_OR_SECRET_REQUIRED');
 return true;
}
export function readScalarResult(raw,field){
 let obj;
 try{obj=JSON.parse(raw)}catch{throw Error('STAGING_D1_JSON_RESULT_UNRECOGNIZED')}
 const rows=(Array.isArray(obj)?obj:[obj]).flatMap(x=>x?.results||x?.result?.results||[]);
 if(rows.length!==1||!Number.isInteger(Number(rows[0]?.[field])))
  throw Error('STAGING_D1_SCALAR_UNEXPECTED');
 return Number(rows[0][field]);
}
const command=(spawn,args,env,reason)=>{
 const o=spawn('npx',['wrangler',...args],{
  encoding:'utf8',env,timeout:120000,maxBuffer:800000
 });
 if(o.error||o.status!==0)throw Error('STAGING_D1_'+reason+'_FAILED');
 return o.stdout;
};
const sql=(spawn,env,statement,label)=>command(spawn,
 ['d1','execute',NAME,'--remote','--json','--config','wrangler.jsonc','--command',statement],env,label);
const baseSQL="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'global_dictionary_%') AS n,(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('books','words','user_words','chapter_words')) AS core_n;";
export function stageSchemaMigration({execute=false,env=process.env,spawn=spawnSync}={}){
 assertTestD1Configuration(JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')));
 const files=MIGRATIONS.map(filename=>({filename,content:readFileSync(
  new URL('../db/'+filename,import.meta.url),'utf8')}));
 const rehearsal=rehearseDictionaryAdditiveMigrations(files);
 if(!execute)return {status:'STAGING_SCHEMA_DRY_RUN_ONLY',migrations:files.length,
  new_tables:rehearsal.migrated_tables,cloudflare_writes:0};
 assertGitHubManualApproval(env);
 const before=sql(spawn,env,baseSQL,'BASELINE_READ');
 if(readScalarResult(before,'n')!==0||readScalarResult(before,'core_n')!==4)
  throw Error('STAGING_D1_BASELINE_CHANGED_ABORT');
 const recoveryReferenceUTC=new Date().toISOString();
 const checkpoint=command(spawn,['d1','time-travel','info',NAME,'--config','wrangler.jsonc'],env,'BOOKMARK');
 if(!/bookmark/i.test(checkpoint))throw Error('STAGING_D1_RECOVERY_BOOKMARK_ABSENT');
 console.log('STAGING_D1_RECOVERY_REFERENCE_UTC='+recoveryReferenceUTC);
 console.log('STAGING_D1_BOOKMARK_AVAILABLE_VALUE_PRIVATE');
 let executed=0;
 for(const filename of MIGRATIONS){
  // Explicit file-by-file D1 test schema only, never the old Wrangler
  // remote migrations ledger and never any production target.
  command(spawn,['d1','execute',NAME,'--remote','--config','wrangler.jsonc',
   '--file','db/'+filename],env,'ADD_ONLY_'+filename.slice(0,3));
  executed++;
  console.log('STAGING_TEST_SCHEMA_FILE_'+filename.slice(0,3)+'_APPLIED');
 }
 const finalSQL="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'global_dictionary_%') AS n,(SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('global_dictionary_bindings_draft_guard','global_dictionary_sense_identity_guard','global_dictionary_legacy_sense_link_guard','global_dictionary_legacy_sense_link_no_repoint','global_dictionary_book_sense_guard')) AS triggers_n;";
 const after=sql(spawn,env,finalSQL,'POST_SCHEMA_READ');
 if(readScalarResult(after,'n')!==10||readScalarResult(after,'triggers_n')!==5)
  throw Error('STAGING_D1_SCHEMA_GUARDS_INCOMPLETE_MANUAL_REVIEW');
 return {status:'STAGING_DICTIONARY_SCHEMA_APPLIED_TO_TEST_ONLY',
  files_applied:executed,tables:10,triggers:5,
  recovery_reference_utc:recoveryReferenceUTC,
  old_learning_rows_written:0,production_d1_accessed:false};
}
const main=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(main){
 const execute=process.argv.includes('--execute-test-only');
 try{
  const result=stageSchemaMigration({execute});
  console.log(JSON.stringify(result));
 }catch(e){
  console.error('GUARDED_STAGING_DICTIONARY_SCHEMA_ABORT',e.message);
  process.exitCode=1;
 }
}
