// S53: read-only external acceptance probe for the PUBLIC Pages production host.
// GET-only, no cookies, no auth, no Cloudflare API access and no database writes.
import {pathToFileURL} from "node:url";

export const PUBLIC_ORIGIN="https://miaowu-english-pages.pages.dev";
export const SAFETY_ENDPOINTS=Object.freeze([
 "/account-test.html","/reading-test.html","/editor.html",
 "/api/staging/diagnostics","/api/staging/test-voucher",
 "/api/chapters/qa-cet4-paid","/api/books/qa-cet4/chapters"
]);

export async function probeProductionReadonly({
 fetcher=fetch,origin=PUBLIC_ORIGIN,timeoutMs=12000
}={}){
 // Do not let a caller accidentally target staging, an attacker-controlled URL,
 // any customer-specific URL or an operator endpoint.
 if(origin!==PUBLIC_ORIGIN)throw Error("S53_PUBLIC_ORIGIN_MUST_BE_PINNED");
 const checks=[];
 async function read(path,expectStatus=200,parseJson=true){
  if(!path.startsWith("/")||path.startsWith("//"))
   throw Error("S53_UNSAFE_PATH");
  const url=new URL(path,origin);
  if(url.origin!==origin)throw Error("S53_UNSAFE_ORIGIN");
  const res=await fetcher(url.toString(),{
   method:"GET",redirect:"manual",cache:"no-store",
   headers:{"accept":parseJson?"application/json":"text/html"},
   signal:AbortSignal.timeout(timeoutMs)
  });
  if(res.status!==expectStatus)
   throw Error("S53_STATUS_MISMATCH "+path+" expected="+expectStatus+" actual="+res.status);
  // Read only expected public data; don't log the body, headers or cookies.
  const body=await res.text();
  if(body.length>100_000)throw Error("S53_RESPONSE_TOO_LARGE "+path);
  let data;
  if(parseJson){
   try{data=JSON.parse(body)}catch{throw Error("S53_INVALID_JSON "+path)}
  }else data=body;
  checks.push({path,status:res.status,passed:true});
  return data;
 }
 const edge=await read("/__miaowu_prod_edge_probe");
 if(edge.ok!==true||edge.layer!=="pages-production-entry"||
    edge.productionBindingPresent!==true||edge.dataAccess!==false)
  throw Error("S53_PAGES_SERVICE_BINDING_NOT_CONFIRMED");
 const health=await read("/api/health");
 if(health.ok!==true||health.dbBound!==true||
    health.authConfigured!==true||health.activationSecretReady!==true||
    health.activationSecretStatus!=="hidden")
  throw Error("S53_WORKER_D1_AUTH_HEALTH_NOT_READY");
 if(typeof health.paymentIntegration!=="boolean")
  throw Error("S53_PAYMENT_STATE_UNKNOWN");
 const categories=await read("/api/categories");
 const required=["cet4","cet6","ielts","postgrad"];
 if(!Array.isArray(categories.categories)||
    required.some(x=>!categories.categories.some(c=>c.slug===x)))
  throw Error("S53_CATEGORY_INVENTORY_INCOMPLETE");
 const guest=await read("/api/auth/me",401);
 if(guest.error!=="LOGIN_REQUIRED")
  throw Error("S53_GUEST_AUTH_LEAK");
 const shelf=await read("/api/books?category=cet4");
 if(!Array.isArray(shelf.books))
  throw Error("S53_BOOKS_PAYLOAD_INVALID");
 if(shelf.books.some(b=>/^(?:draft|qa)[-_]/i.test(String(b.id))||
     /测试|示例|sample|demo/i.test(String(b.title))))
  throw Error("S53_PRIVATE_OR_TEST_BOOK_VISIBLE");
 const html=await read("/",200,false);
 if(!/<html\b/i.test(html)||!html.includes("妙屋英语"))
  throw Error("S53_PUBLIC_READER_SHELL_MISSING");
 for(const path of SAFETY_ENDPOINTS){
  const p=await read(path,404,path.startsWith("/api/"));
  if(path.startsWith("/api/")&&p.error!=="NOT_FOUND")
   throw Error("S53_RESTRICTED_API_MUST_FAIL_CLOSED "+path);
 }
 return {
  status:"READONLY_PRODUCTION_EDGE_PROBE_PASSED",
  origin,checks:checks.length,categorySlugs:required,
  visibleCET4Books:shelf.books.length,
  paymentIntegration:health.paymentIntegration,
  verified:["Pages service binding","Worker+D1 health","category read","anonymous auth denial",
    "public home","production-only restricted routes"],
  NOT_VERIFIED:["real account registration/login","actual voucher/redemption",
    "cross-device learning state","paid chapter entitlement","payment settlement",
    "mobile browser QA","manuscript commercial approval"],
  productionWrites:0,credentialsUsed:false
 };
}
async function main(){
 if(process.argv.slice(2).some(x=>x!=="--readonly"))
  throw Error("Usage: node scripts/probe-production-readonly.mjs --readonly");
 const report=await probeProductionReadonly();
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{process.stderr.write(String(e.message)+"\n");process.exitCode=1});
}
