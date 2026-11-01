// Production-only route floor. The current reader app has staging-only
// laboratories that must never be exposed as public commercial endpoints.
// This block does NOT replace identity, entitlement or admin authentication.
const LAB_ASSET=/^\/(?:account-test|reading-test|editor(?:-(?:edit|review|publication))?|ops(?:-console)?)(?:\.(?:html|js|css))$/i;
const QA_CHAPTER=/^\/api\/chapters\/qa[-_][a-z0-9_-]*(?:\/words)?$/i;
const QA_BOOK=/^\/api\/books\/qa[-_][a-z0-9_-]*\/chapters$/i;

export function isRestrictedProductionPath(path){
  return path==="/api/staging"||path.startsWith("/api/staging/")||
    LAB_ASSET.test(path)||QA_CHAPTER.test(path)||QA_BOOK.test(path);
}
export function productionSurfaceBlock(request,env){
  if(env?.APP_ENV!=="production")return null;
  const pathname=new URL(request.url).pathname;
  if(!isRestrictedProductionPath(pathname))return null;
  const isApi=pathname.startsWith("/api/");
  return new Response(isApi?JSON.stringify({error:"NOT_FOUND"}):"Not found",{
    status:404,headers:{
      "content-type":isApi?"application/json; charset=utf-8":"text/plain; charset=utf-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer"
    }
  });
}
