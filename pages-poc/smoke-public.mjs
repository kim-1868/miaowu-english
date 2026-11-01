// Public-only Pages smoke check. No credentials, no accounts, no content writes.
// Intended for a developer or CI runner; it does NOT test mainland ISP reachability.
const origin="https://miaowu-english-access-check.pages.dev";
const checks=[
  {name:"pages_function",path:"/__miaowu_pages_function_probe",
   validate:async response=>{
    if(response.status!==200)return "HTTP_"+response.status;
    const body=await response.json();
    return body.ok===true&&body.layer==="pages-function"&&
      body.serviceBindingPresent===true?"PASS":"FUNCTION_OR_BINDING_UNAVAILABLE";
   }},
  {name:"pages_static",path:"/__miaowu_pages_asset_probe.txt",
   validate:async response=>
     response.status===200&&(await response.text()).includes("MIAOWU_PAGES_STATIC_ASSET_OK")
      ?"PASS":"STATIC_ASSET_UNAVAILABLE"},
  {name:"staging_page_protected",path:"/",
   validate:async response=>
      response.status===401&&/Basic/i.test(response.headers.get("www-authenticate")||"")
      ?"PASS":"STAGING_PREVIEW_CHALLENGE_MISSING_HTTP_"+response.status},
  {name:"staging_api_protected",path:"/api/health",
   validate:async response=>{
    if(response.status!==401)return "STAGING_PREVIEW_GATE_MISSING_HTTP_"+response.status;
    const body=await response.json();
    return body?.error==="STAGING_ACCESS_REQUIRED"?"PASS":"STAGING_API_GATE_WRONG";
   }},
  {name:"staging_paid_chapter_protected",path:"/api/chapters/qa-cet4-paid",
   validate:async response=>{
    if(response.status!==401)return "PAID_PREVIEW_GATE_MISSING_HTTP_"+response.status;
    const body=await response.json();
    return body?.error==="STAGING_ACCESS_REQUIRED"?"PASS":"PAID_PREVIEW_GATE_WRONG";
   }}
];
async function main(){
 const results=[];
 for(const check of checks){
  const start=performance.now();
  let status;
  try{
   const response=await fetch(origin+check.path,{method:"GET",
    headers:{"accept":"application/json, text/plain;q=0.9"},
    redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(12000)});
   status=await check.validate(response);
  }catch(e){
   status=e.name==="TimeoutError"?"TIMEOUT":"NETWORK_OR_RESPONSE_ERROR";
  }
  const elapsedMs=Math.round(performance.now()-start);
  results.push({check:check.name,result:status,elapsedMs});
 }
 const passed=results.every(x=>x.result==="PASS");
 process.stdout.write(JSON.stringify({target:origin,passed,
  network:"current execution network; not a China mainland ISP measurement",
  checks:results},null,2)+"\n");
 if(!passed)process.exitCode=1;
}
await main();
