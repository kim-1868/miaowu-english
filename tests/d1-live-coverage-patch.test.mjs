import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {preparePatch} from '../scripts/prepare-live-coverage-410.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=`export default {
 async fetch(request,env) {
  if(new URL(request.url).pathname==="/api/ops/import/coverage"){
   await env.DB.prepare("SELECT * FROM chapters").all();
   return new Response("legacy heavy coverage");
  }
  return new Response("ordinary route");
 }
}`;
test('SHA-pinned deployed Worker guard returns 410 before DB without modifying other routes',async()=>{
 const buf=Buffer.from(source),prepared=preparePatch(buf,hash(buf));
 assert.equal(prepared.originalHash,hash(buf));
 assert.notEqual(prepared.originalHash,prepared.patchedHash);
 assert.equal(prepared.patched.slice(0,prepared.insertIndex)+
  prepared.patched.slice(prepared.insertIndex+prepared.patchBytes),source);
 const url='data:text/javascript;base64,'+Buffer.from(prepared.patched).toString('base64');
 const worker=(await import(url)).default;
 let touches=0;
 const env={DB:{prepare(){touches++;throw Error('query forbidden');}}};
 for(const method of ['GET','POST','OPTIONS']){
  for(const address of [
   'https://test.invalid/api/ops/import/coverage',
   'https://test.invalid/api/ops/import/coverage?book_id=x',
   'https://test.invalid/api/ops/import/coverage/'
  ]){
   const res=await worker.fetch(new Request(address,{method}),env);
   assert.equal(res.status,410);
   assert.equal((await res.json()).error,'COVERAGE_PREVIEW_DISABLED');
   assert.equal(touches,0);
  }
 }
 const normal=await worker.fetch(new Request('https://test.invalid/api/books'),env);
 assert.equal(await normal.text(),'ordinary route');
});
test('script aborts when baseline not identified unambiguously',()=>{
 const buf=Buffer.from(source);
 assert.throws(()=>preparePatch(buf,'0'.repeat(64)),/FINGERPRINT_MISMATCH/);
 assert.throws(()=>preparePatch(buf,'bad'),/EXPECTED_SHA256_REQUIRED/);
 assert.throws(()=>preparePatch(Buffer.from('export default {}'),hash('export default {}')),/DOES_NOT_CONTAIN_COVERAGE_ROUTE/);
 const double=source+'\nasync fetch(request, env) {return null}';
 assert.throws(()=>preparePatch(Buffer.from(double),hash(double)),/FETCH_ENTRY_COUNT_NOT_ONE/);
 const once=preparePatch(buf,hash(buf));
 assert.throws(()=>preparePatch(Buffer.from(once.patched),hash(once.patched)),/ALREADY_GUARDED/);
});
