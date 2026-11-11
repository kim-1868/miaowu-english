import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/headword-reader-bridge.js',import.meta.url),'utf8');
const ENTRY='gdict_'+'a'.repeat(24),SENSE='gds_'+'b'.repeat(24);
const valid={card:{entry_id:ENTRY,headword:'record',phoneticUk:'/rek/',phoneticUs:'/rek/',
  context_sense_id:SENSE,senses:[{sense_id:SENSE,pos:'n.',meaningZh:'记录',
    exampleEn:'She kept a record.',exampleZh:'她保存了一份记录。'}],
  collocations:[{en:'keep a record',zh:'保存记录'}]},
  study:{status:'new',stage:0,due_at:null},revision:0};
function harness({wait=false}={}){
 const el=new Map(),calls=[],toasts=[];
 const get=id=>{if(!el.has(id))el.set(id,{id,innerHTML:'',disabled:false,
    querySelectorAll(){return []},onclick:null});return el.get(id)};
 const root={crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'}};
 const document={getElementById:get};
 runInNewContext(source,{window:root,document});
 let deferred;
 const request=async(path,method,payload)=>{
  calls.push({path,method:method||'GET',payload});
  if(wait&&(!method||method==='GET'))return new Promise(resolve=>{deferred=resolve});
  if(method==='POST')return {study:{stage:1},revision:1};
  return valid;
 };
 let legacy=0,paused=0,closed=0,saved=0,skipped=0;
 root.MiaowuHeadwordReaderBridge.configure({
   user:()=>true,request,speak:()=>{},pause:()=>paused++,close:()=>closed++,
   openLegacy:()=>{legacy++},supersedeLegacy:()=>skipped++,
   saveLegacy:()=>saved++,toast:s=>toasts.push(s)
 });
 const ctx={entryId:ENTRY,chapterId:'c1',anchor:'p0:s1',legacyWordId:'old-record',element:{}};
 return {root,get,calls,toasts,ctx,resolve:()=>deferred?.(valid),counters:()=>({legacy,paused,closed,saved,skipped})};
}
test('reader shows one approved multi-sense card after real GET, preserving original popup',async()=>{
 const h=harness();assert.equal(await h.root.MiaowuHeadwordReaderBridge.open(h.ctx),true);
 assert.equal(h.calls.length,1);assert.match(h.calls[0].path,/chapterId=c1&anchor=p0%3As1/);
 assert.match(h.get('wordPop').innerHTML,/UNIFIED WORD CARD/);
 assert.match(h.get('wordPop').innerHTML,/record/);
 assert.deepEqual(h.counters(),{legacy:1,paused:1,closed:0,saved:0,skipped:1});
 h.get('wordClose').onclick();assert.equal(h.counters().closed,1);
});
test('clicking 认识 POSTs one user+entry revision and retains exact source anchor',async()=>{
 const h=harness();await h.root.MiaowuHeadwordReaderBridge.open(h.ctx);
 await h.get('v12Remember').onclick();
 const post=h.calls.find(x=>x.method==='POST');
 assert.ok(post);assert.equal(post.payload.kind,'remembered');
 assert.equal(post.payload.expectedRevision,0);
 assert.equal(post.payload.chapterId,'c1');assert.equal(post.payload.anchor,'p0:s1');
 assert.equal(post.payload.eventId,'00000000-0000-4000-8000-000000000001');
});
test('unapproved or mismatched entry fails closed instead of rendering raw HTML',async()=>{
 const h=harness();h.ctx.entryId='record';
 assert.equal(await h.root.MiaowuHeadwordReaderBridge.open(h.ctx),false);
 assert.equal(h.calls.length,0);
});
test('changing chapters or closing prevents stale async GET from replacing newer popup',async()=>{
 const h=harness({wait:true}),pending=h.root.MiaowuHeadwordReaderBridge.open(h.ctx);
 h.root.MiaowuHeadwordReaderBridge.invalidate();h.get('wordPop').innerHTML='另一张词卡';
 h.resolve();await pending;
 assert.equal(h.get('wordPop').innerHTML,'另一张词卡');
});
test('rendered data is escaped, not injected as executable markup',async()=>{
 const h=harness();valid.card.senses[0].exampleEn='<img src=x onerror=alert(1)>';
 try{await h.root.MiaowuHeadwordReaderBridge.open(h.ctx);
   assert.ok(h.get('wordPop').innerHTML.includes('&lt;img'));
   assert.ok(!h.get('wordPop').innerHTML.includes('<img'));
 }finally{valid.card.senses[0].exampleEn='She kept a record.'}
});