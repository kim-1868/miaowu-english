// Build ONLY the reviewed customer and operator assets for production.
// Staging keeps its full public/ directory and its QA laboratories unchanged.
// This script never contacts Cloudflare and cannot publish any site.
import {copyFileSync,mkdirSync,rmSync,readdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildS86FreeChapter} from "./build-s86-free-first-chapter.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=join(root,"public"),out=join(root,"dist-production","public");
export const PRODUCTION_ASSET_ALLOWLIST=Object.freeze([
 "index.html","styles.css","app.js","chapter-words.js","echo-cloud.js",
 "live.html","live-reader.js","live-reader.css",
 "ops.html","ops-console.js","ops-console.css",
 "rainy-night-cover.webp", "rejected-family-second-life.html"
]);
const forbidden=/^(?:account-test|reading-test|editor|design-reference)/i;
export function auditProductionAssets(){
 const files=readdirSync(out).sort();
 const allowed=[...PRODUCTION_ASSET_ALLOWLIST].sort();
 if(JSON.stringify(files)!==JSON.stringify(allowed))
  throw Error("UNEXPECTED_OR_MISSING_PRODUCTION_ASSET");
 for(const file of files){
  if(forbidden.test(file))throw Error("QA_ASSET_IN_PRODUCTION_"+file);
 }
 for(const entry of ["index.html","live.html","ops.html","rejected-family-second-life.html"]){
  const body=readFileSync(join(out,entry),"utf8");
  const refs=[...body.matchAll(/(?:src|href)=["'](\/[a-zA-Z][^"'?#]*)["']/g)]
    .map(x=>x[1].slice(1));
  for(const ref of refs){
   if(!PRODUCTION_ASSET_ALLOWLIST.includes(ref))
    throw Error("UNBUNDLED_PRODUCTION_ASSET_REFERENCE_"+ref);
  }
 }
 return {status:"REVIEWED_STATIC_ASSETS_ONLY",assets:allowed};
}
export function buildProductionAssets(){
 rmSync(out,{recursive:true,force:true});
 mkdirSync(out,{recursive:true});
 for(const name of PRODUCTION_ASSET_ALLOWLIST){
  if(name==="rejected-family-second-life.html"){
   writeFileSync(join(out,name),buildS86FreeChapter());

  }else copyFileSync(join(source,name),join(out,name));
 }
 return auditProductionAssets();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(buildProductionAssets(),null,2))}
 catch(e){console.error("PRODUCTION_ASSET_CHECK_FAILED:",e.message);process.exitCode=1}
}
