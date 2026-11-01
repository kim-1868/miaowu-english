// Email-free recovery code. Use only in isolated production environment.
// Loss of BOTH password and this one-time code requires verified operator help.
// Never log, store in public resources or send recovery codes through URL.
import {randomToken,hmacHex,requireSecret} from "./security.js";
export function normalizeRecoveryCode(value){
 if(typeof value!=="string")return null;
 const raw=value.normalize("NFKC").replace(/[\s-]/g,"").toLowerCase();
 return /^[a-f0-9]{64}$/.test(raw)?raw:null;
}
export async function createRecoveryCode(env){
 const token=randomToken();
 const codeHash=await hmacHex(requireSecret(env),"recovery:v1:"+token);
 const displayCode=(token.match(/.{8}/g)||[]).join("-");
 return {displayCode,codeHash};
}
export async function recoveryDigest(raw,env){
 const normalized=normalizeRecoveryCode(raw);
 return normalized?await hmacHex(requireSecret(env),"recovery:v1:"+normalized):null;
}
