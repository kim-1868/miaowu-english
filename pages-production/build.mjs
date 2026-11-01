// Fail-closed Pages Advanced Mode deployment artifact generator.
// Public assets are intentionally NOT copied: the bound production Worker
// serves /index.html and every JS/CSS from its own ASSETS binding.
import {mkdirSync,rmSync,copyFileSync,writeFileSync,readFileSync,readdirSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url)),out=join(here,"dist");
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
copyFileSync(join(here,"entry.mjs"),join(out,"_worker.js"));
writeFileSync(join(out,"_routes.json"),JSON.stringify({
 version:1,include:["/*"],exclude:[]
},null,2)+"\n");
writeFileSync(join(out,"__miaowu_deployment_placeholder.txt"),
 "Miaowu Pages production route placeholder. Contains no reader content.\n");
const entry=readFileSync(join(out,"_worker.js"),"utf8");
if(!entry.includes("PRODUCTION_ORIGIN")||entry.includes("STAGING_ORIGIN")||
 entry.includes("ACTIVATION_PEPPER")||entry.includes("miaowu-english-test")||
 entry.includes("88a817cb-23bb-4ae4-bcb8-92286c4165d4"))
 throw Error("PRODUCTION_PAGES_BINDING_OR_SECRET_CONFIG_UNSAFE");
const files=readdirSync(out);
if(files.some(x=>/^(index\.html|app\.js|reading-test\.html|editor\.html|account-test\.html)$/i.test(x)))
 throw Error("PRODUCTION_PAGES_STATIC_CONTENT_MUST_NOT_BE_COPIED");
if(files.sort().join("|")!==["_routes.json","_worker.js","__miaowu_deployment_placeholder.txt"].sort().join("|"))
 throw Error("PRODUCTION_PAGES_UNEXPECTED_PUBLIC_ARTIFACT");
console.log("Safe production Pages proxy ready: all site resources remain on production Worker.");
