// Local-only operator credential provisioning. Never used by the Worker.
// Writes the raw token ONLY into a git-ignored mode-0600 file, never logs it.
// Example: OPS_TOKEN_PEPPER=... node scripts/create-ops-operator.mjs staging reviewer ops-alice "Alice"
import {randomBytes,createHmac} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";

const [environment,role,id,displayName]=process.argv.slice(2);
const pepper=process.env.OPS_TOKEN_PEPPER;
const envs=new Set(["staging","production"]);
const roles=new Set(["editor","reviewer","publisher"]);
if(!envs.has(environment)||!roles.has(role)||!id||!/^[a-z][a-z0-9_-]{2,79}$/.test(id)||
  typeof displayName!=="string"||displayName.trim().length<2||
  displayName.length>80||/[\u0000-\u001f]/.test(displayName)||
  typeof pepper!=="string"||pepper.length<32){
  process.stderr.write("Usage: OPS_TOKEN_PEPPER=<unique secret >=32 chars> node scripts/create-ops-operator.mjs <staging|production> <editor|reviewer|publisher> <ops-id> <display-name>\n");
  process.exitCode=1;
}else{
  const token="mwops_"+randomBytes(32).toString("hex");
  const digest=createHmac("sha256",pepper).update("miaowu:ops:v1:"+token).digest("hex");
  const quoted=x=>"'"+x.replaceAll("'","''")+"'";
  const sql="INSERT INTO ops_operators(id,display_name,role,environment,key_digest) VALUES ("+
    [id,displayName.trim(),role,environment,digest].map(quoted).join(", ")+");";
  const directory=join(process.cwd(),"private-output");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const path=join(directory,"operator-"+environment+"-"+id+".json");
  // Exclusive create: never silently overwrite/rotate an existing credential.
  writeFileSync(path,JSON.stringify({environment,role,id,displayName:displayName.trim(),token,sql},null,2)+"\n",
    {flag:"wx",mode:0o600});
  process.stdout.write("Credentials created in private-output/ (git-ignored). Move the token to a password manager; execute SQL only in the CORRECT isolated D1 database after review. Never paste token or pepper into chat.\n");
}
