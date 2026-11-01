// Public entry for the actual customer-facing Pages host.
// Every request is sent through a private Service Binding to the dedicated
// production Worker, which alone holds the D1 binding, users and secrets.
// DO NOT connect this to the staging Worker or to the QA database.
const failHeaders={
 "cache-control":"no-store, max-age=0",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"
};
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  // An unprivileged operational probe, not an account/DB availability check.
  if(request.method==="GET"&&url.pathname==="/__miaowu_prod_edge_probe"){
   return new Response(JSON.stringify({
    ok:true,layer:"pages-production-entry",dataAccess:false,
    productionBindingPresent:typeof env.PRODUCTION_ORIGIN?.fetch==="function"
   }),{headers:{...failHeaders,"content-type":"application/json; charset=utf-8"}});
  }
  // Never return a Pages-origin HTML/JS asset as fallback.
  if(typeof env.PRODUCTION_ORIGIN?.fetch!=="function")
   return new Response("Service temporarily unavailable",{status:503,headers:failHeaders});
  return env.PRODUCTION_ORIGIN.fetch(request);
 }
};
