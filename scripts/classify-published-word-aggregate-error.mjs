// Never output raw Cloudflare stderr: it may contain SQL, identifiers or auth metadata.
// Emit only one bounded diagnostic code, preserving the protected runner confidentiality.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function classifyPublishedAggregateError(value){
 const text=String(value??'').slice(0,100000).toLowerCase();
 if(/authentication|authorization|unauthori[sz]ed|forbidden|permission|invalid api token|invalid token|error code: 10000|error code: 9109/.test(text))
  return 'AUTHORIZATION_OR_TOKEN_SCOPE';
 if(/sqlite_error|sqlite|syntax error|no such table|no such column|near .* syntax|failed to prepare|too many sql statements|multiple sql statements/.test(text))
  return 'SQL_OR_SCHEMA_COMPATIBILITY';
 if(/unknown argument|unknown option|command not found|not recognized|requires.*(argument|option)|usage: wrangler/.test(text))
  return 'WRANGLER_CLI_ARGUMENTS';
 if(/rate limit|too many requests|timed out|timeout|exceeded|limit/.test(text))
  return 'RATE_LIMIT_OR_TIMEOUT';
 if(/fetch failed|failed to fetch|network|connection reset|econnreset|502 bad gateway|503 service unavailable|cloudflare api error/.test(text))
  return 'NETWORK_OR_CLOUDFLARE_API';
 if(/resource not found|database not found|account not found|error code: 7003|error code: 7404/.test(text))
  return 'DATABASE_OR_ACCOUNT_IDENTITY';
 return 'UNCLASSIFIED_SAFE_LOG_REVIEW_REQUIRED';
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.argv.length!==3)throw Error();
  const body=readFileSync(process.argv[2],'utf8');
  console.log('PUBLISHED_WORD_SELECT_FAILURE_CLASS='+classifyPublishedAggregateError(body));
  console.log('NO_RAW_CLOUDFLARE_STDERR_PRINTED');
 }catch{
  console.log('PUBLISHED_WORD_SELECT_FAILURE_CLASS=UNCLASSIFIED_SAFE_LOG_REVIEW_REQUIRED');
 }
}
