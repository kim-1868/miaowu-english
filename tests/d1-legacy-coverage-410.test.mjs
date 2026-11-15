import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

test('legacy Publisher coverage request returns HTTP 410 before any D1 or auth lookups',async()=>{
 let touched=false;
 const env=new Proxy({},{
  get(){touched=true;throw Error('D1 / production bindings MUST NOT be touched');}
 });
 for(const method of ['GET','POST','OPTIONS']){
  for(const url of [
   'https://example.invalid/api/ops/import/coverage',
   'https://example.invalid/api/ops/import/coverage?book=old',
   'https://example.invalid/api/ops/import/coverage/'
  ]){
   const response=await worker.fetch(new Request(url,{method}),env);
   assert.equal(response.status,410);
   assert.match(response.headers.get('content-type')||'',/application\/json/);
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal((await response.json()).error,'COVERAGE_PREVIEW_DISABLED');
   assert.equal(touched,false);
  }
 }
});
