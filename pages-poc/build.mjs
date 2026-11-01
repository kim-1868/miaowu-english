// Creates a fully bundled Pages Advanced Mode artifact with no secrets or
// database migration. Only ./public/ is copied; src/ remains server-side.
import {cpSync,writeFileSync,rmSync,mkdirSync,existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve,join} from "node:path";
import {build} from "esbuild";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const output=join(here,"dist");
const assets=join(root,"public");
const entry=join(here,"entry.mjs");
if(!existsSync(join(assets,"index.html"))||!existsSync(entry))
  throw new Error("PAGES_POC_REQUIRED_SOURCE_MISSING");
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
cpSync(assets,output,{recursive:true});
await build({
 entryPoints:[entry],outfile:join(output,"_worker.js"),
 bundle:true,platform:"browser",format:"esm",target:"es2022",
 sourcemap:false,legalComments:"none",logLevel:"info"
});
// Every route must pass through the Pages Function staging preview gate.
// A misplaced exclusion could leak the app's static HTML or editor assets.
const routeConfig={version:1,include:["/*"],exclude:[]};
writeFileSync(join(output,"_routes.json"),JSON.stringify(routeConfig,null,2)+"\n");
writeFileSync(join(output,"__miaowu_pages_asset_probe.txt"),
  "MIAOWU_PAGES_STATIC_ASSET_OK\nNo account data or secret appears here.\n");
const script=readFileSync(join(output,"_worker.js"),"utf8");
if(!script.includes("STAGING_PREVIEW_PASSWORD")||!script.includes("stagingGate"))
  throw Error("PAGES_POC_PROTECTED_ROUTER_NOT_BUNDLED");
if(script.includes("88a817cb-23bb-4ae4-bcb8-92286c4165d4"))
  throw Error("PAGES_POC_BUNDLED_DB_IDENTIFIER_UNEXPECTED");
for(const file of ["index.html","_worker.js","_routes.json","__miaowu_pages_asset_probe.txt"]){
 if(!existsSync(join(output,file)))throw Error("MISSING_PAGES_ARTIFACT_"+file);
}
console.log("Pages proof-of-connectivity build ready: routing protected, probes intentionally public.");
