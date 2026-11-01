// Pages Advanced Mode entry. Production site and original Worker are NOT changed.
// Two intentionally public and CONTENT-FREE endpoints distinguish Pages
// Functions/asset delivery from readers' protected routes.
import worker from "../src/worker.js";

const probeHeaders={
  "cache-control":"no-store, max-age=0",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer"
};
export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==="GET" && path==="/__miaowu_pages_function_probe"){
      return new Response(JSON.stringify({
        ok:true,service:"miaowu-pages-access-poc",
        layer:"pages-function",dataAccess:false,loginRequired:false,
        stagingConfigured:env.APP_ENV==="staging",
        dbBindingPresent:!!env.DB,
        note:"Connectivity probe only; not a database or learning-feature check."
      }),{headers:{...probeHeaders,"content-type":"application/json; charset=utf-8"}});
    }
    if(request.method==="GET" && path==="/__miaowu_pages_asset_probe.txt"){
      return env.ASSETS.fetch(request);
    }
    // Fail closed if Pages ignored the Wrangler environment variables or
    // the intended staging database was not bound. Without APP_ENV=staging,
    // stagingGate in worker.js would otherwise skip the preview challenge.
    if(env.APP_ENV!=="staging" || !env.DB){
      return new Response("Miaowu Pages staging configuration incomplete.",{
        status:503,headers:probeHeaders
      });
    }
    // All application routes now continue through stagingGate; the existing
    // Worker and production contents stay untouched.
    return worker.fetch(request,env,ctx);
  }
};
