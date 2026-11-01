// A private Cloudflare Service Binding makes the existing staging Worker
// available behind a Pages hostname without ever copying D1 or auth secrets
// into this Pages project. Only harmless connectivity probes are public.
const probeHeaders={
  "cache-control":"no-store, max-age=0",
  "x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer"
};
const json=value=>new Response(JSON.stringify(value),{
  headers:{...probeHeaders,"content-type":"application/json; charset=utf-8"}
});
export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(request.method==="GET" && path==="/__miaowu_pages_function_probe"){
      return json({
        ok:true,service:"miaowu-pages-access-poc",
        layer:"pages-function",dataAccess:false,loginRequired:false,
        serviceBindingPresent:typeof env.STAGING_ORIGIN?.fetch==="function",
        note:"Connectivity probe only; never reads customer data."
      });
    }
    if(request.method==="GET" && path==="/__miaowu_pages_asset_probe.txt"){
      return env.ASSETS.fetch(request);
    }
    // A missing binding must NEVER fall back to public Pages assets, which
    // would bypass the staging preview password protecting index.html.
    if(typeof env.STAGING_ORIGIN?.fetch!=="function"){
      return new Response("Miaowu staging service binding not ready.",{
        status:503,headers:probeHeaders
      });
    }
    // Service binding invokes the original staging Worker inside Cloudflare.
    // That Worker enforces its own preview gate, reader sessions, entitlement
    // checks, and has the ONLY D1 and ACTIVATION_PEPPER bindings.
    return env.STAGING_ORIGIN.fetch(request);
  }
};
