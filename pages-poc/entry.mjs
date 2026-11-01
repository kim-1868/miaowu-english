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
        note:"Connectivity probe only; not a database or learning-feature check."
      }),{headers:{...probeHeaders,"content-type":"application/json; charset=utf-8"}});
    }
    if(request.method==="GET" && path==="/__miaowu_pages_asset_probe.txt"){
      return env.ASSETS.fetch(request);
    }
    // Every application route continues to be guarded by stagingGate.
    // No secret is built into the artifact, and current Worker stays active.
    return worker.fetch(request,env,ctx);
  }
};
