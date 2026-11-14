// Sanitized GitHub Actions diagnostics for staging D1 SELECT/PRAGMA failures.
// NEVER echo or upload Wrangler stdout/stderr: they may include secrets or
// private metadata. Emits only a fixed category and query-step name.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const rules=[
  [/authentication error|invalid api token|invalid token|authentication.*failed|code[: ]*10000|error code[: ]*10000|401\b/iu,'READ_TOKEN_AUTHENTICATION_FAILED'],
  [/insufficient privileges|not authorized|unauthorized|permission denied|access denied|forbidden|403\b|requires.*permission/iu,'READ_TOKEN_PERMISSION_DENIED'],
  [/no such table|no such column|database .*not found|database_not_found|unknown database|missing database/iu,'TEST_D1_SCHEMA_OR_DATABASE_MISSING'],
  [/unknown option|unknown argument|unexpected argument|invalid command|unrecognized option|invalid option/iu,'WRANGLER_CLI_OPTIONS_UNSUPPORTED'],
  [/pragma.*(not supported|unsupported|forbidden)|unsupported.*pragma|readonly.*pragma/iu,'REMOTE_PRAGMA_UNSUPPORTED'],
  [/too many requests|rate limit|429\b|quota exceeded/iu,'D1_RATE_LIMIT_OR_QUOTA'],
  [/timed out|timeout|econnreset|enotfound|connection refused|network error|fetch failed|503\b|502\b/iu,'CLOUDFLARE_NETWORK_OR_SERVICE_UNAVAILABLE'],
  [/d1_error|sqlite_error|sql execution error|sql error|failed to execute|error executing/iu,'D1_QUERY_REJECTED']
];
export function classifyStagingD1Failure(stderr,stdout=''){
 const text=String(stderr??'').slice(0,16000)+'\n'+String(stdout??'').slice(0,16000);
 for(const [pattern,code] of rules)if(pattern.test(text))return code;
 return 'UNKNOWN_READONLY_QUERY_FAILURE';
}
const labels=new Set(['COUNTS','FK','INTEGRITY']);
export function sanitizedDiagnostic(label,stderr,stdout=''){
 if(!labels.has(label))throw Error('INVALID_READONLY_STEP');
 return 'STAGING_019_READONLY_'+label+'_'+classifyStagingD1Failure(stderr,stdout);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [label,stdoutPath,stderrPath]=process.argv.slice(2);
 if(!labels.has(label)||!stdoutPath||!stderrPath){
  console.error('STAGING_019_READONLY_DIAGNOSTIC_ARGUMENTS_INVALID');
  process.exitCode=1;
 }else{
  let stdout='',stderr='';
  try{stdout=readFileSync(stdoutPath,'utf8')}catch{}
  try{stderr=readFileSync(stderrPath,'utf8')}catch{}
  console.error(sanitizedDiagnostic(label,stderr,stdout));
  console.error('NO_PRIVATE_WRANGLER_LOG_PRINTED_NO_D1_WRITES');
  process.exitCode=1;
 }
}
