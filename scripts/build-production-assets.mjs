// Build ONLY the reviewed customer and operator assets for production.
// Staging keeps its full public/ directory and its QA laboratories unchanged.
// This script never contacts Cloudflare and cannot publish any site.
import {copyFileSync,mkdirSync,rmSync,readdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildRainyNightPublicSample} from "./build-rainy-night-public-sample.mjs";
import {buildS86FreeChapter} from "./build-s86-free-first-chapter.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=join(root,"public"),out=join(root,"dist-production","public");
export const PRODUCTION_ASSET_ALLOWLIST=Object.freeze([
 "index.html","styles.css","flashcards.css","app.js","chapter-words.js","echo-cloud.js","flashcards.js",
 "install-guide.css","install-guide.js","v11-reader.css","v11-wordbook.css","v11-responsive.css",
 "live.html","live-reader.js","live-reader.css",
 "ops.html","ops-console.js","ops-customers.js","ops-claims.js","ops-console.css","novel-file-parser.js","rainy-night.html",
 "rainy-night-cover.webp","rainy-night-cover-v2.svg",
 "cat-reading-window.svg","cat-reading-watercolor.webp","cat-reading-hd.avif",
 "cat-reading-tablet-1x.webp","cat-reading-tablet-2x.webp","cat-reading-tablet-2x.avif",
 "cat-bookmark-clip.svg",
 "shelf-cet4.svg","shelf-cet6.svg","shelf-postgrad.svg","shelf-ielts.svg",
 "shelf-cet4-watercolor.webp","shelf-cet6-watercolor.webp",
 "shelf-postgrad-watercolor.webp","shelf-ielts-watercolor.webp",
 "rejected-family-second-life.html","claim.html","claim.css","claim.js"
]);
// Owner-approved announcements are a separate opt-in production package.
export const NOTICE_ASSETS=Object.freeze([
 "site-updates.css","site-updates.js","updates.html","ops-updates.js"
]);
export function selectedProductionAssets({withAnnouncements=false}={}){
 return withAnnouncements?[...PRODUCTION_ASSET_ALLOWLIST,...NOTICE_ASSETS]:[...PRODUCTION_ASSET_ALLOWLIST];
}
const forbidden=/^(?:account-test|reading-test|editor|design-reference)/i;
export function auditProductionAssets({withAnnouncements=false}={}){
 const files=readdirSync(out).sort();
 const allowed=selectedProductionAssets({withAnnouncements}).sort();
 if(JSON.stringify(files)!==JSON.stringify(allowed))
  throw Error("UNEXPECTED_OR_MISSING_PRODUCTION_ASSET");
 for(const file of files){
  if(forbidden.test(file))throw Error("QA_ASSET_IN_PRODUCTION_"+file);
 }
 for(const entry of ["index.html","live.html","ops.html","claim.html","rainy-night.html","rejected-family-second-life.html",...(withAnnouncements?["updates.html"]:[])]){
  const body=readFileSync(join(out,entry),"utf8");
  const refs=[...body.matchAll(/(?:src|href)=["'](\/[a-zA-Z][^"'?#]*)["']/g)]
    .map(x=>x[1].slice(1));
  for(const ref of refs){
   if(!allowed.includes(ref))
    throw Error("UNBUNDLED_PRODUCTION_ASSET_REFERENCE_"+ref);
  }
 }
 return {status:"REVIEWED_STATIC_ASSETS_ONLY",assets:allowed};
}
// When notices are not enabled, entirely strip the announcement UI.
function stripNotices(name,html){
 if(name==="index.html"){
  html=html.replace(/\s*<link[^>]*href="\/site-updates\.css[^"]*"[^>]*>/g,"");
  html=html.replace(/\s*<section id="siteUpdateBanner"[\s\S]*?<\/section>/,"");
  html=html.replace(/\s*<dialog id="siteUpdateDialog"[\s\S]*?<\/dialog>/,"");
  html=html.replace(/\s*<a class="mw-update-footer"[^>]*>[\s\S]*?<\/a>/,"");
  html=html.replace(/\s*<script src="\/site-updates\.js[^"]*"><\/script>/,"");
 }
 if(name==="ops.html"){
  html=html.replace(/\s*<section class="panel mw-ops-update-panel"[\s\S]*?<\/section>/,"");
 }
 if(/site-updates|siteUpdateBanner|updatesAdminForm|updates\.html/.test(html))
   throw Error("UNAPPROVED_ANNOUNCEMENT_UI_BUNDLE_"+name);
 return html;
}
export function buildProductionAssets({withAnnouncements=false}={}){
 rmSync(out,{recursive:true,force:true});
 mkdirSync(out,{recursive:true});
 for(const name of selectedProductionAssets({withAnnouncements})){
  if(name==="rejected-family-second-life.html"){
   writeFileSync(join(out,name),buildS86FreeChapter());
  }else if(name==="rainy-night.html"){
   writeFileSync(join(out,name),buildRainyNightPublicSample());
  }else if(!withAnnouncements&&(name==="index.html"||name==="ops.html")){
   writeFileSync(join(out,name),stripNotices(name,readFileSync(join(source,name),"utf8")));
  }else copyFileSync(join(source,name),join(out,name));
 }
 return auditProductionAssets({withAnnouncements});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(buildProductionAssets({
  withAnnouncements:process.argv.includes("--approved-announcements")
 }),null,2))}
 catch(e){console.error("PRODUCTION_ASSET_CHECK_FAILED:",e.message);process.exitCode=1}
}
