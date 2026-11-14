import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const SENSE='gds_'+'a'.repeat(24),ENTRY='gdict_'+'b'.repeat(24);
const card={sense_id:SENSE,entry_id:ENTRY,headword:'record',pos:'n.',
 meaningZh:'记录',exampleEn:'Keep a record of the visit.',
 exampleZh:'保留这次参观的记录。',phoneticUs:'/ˈrekərd/',phoneticUk:'/ˈrekɔːd/'};
function load({request=async()=>({card,revision:0})}={}){
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',onclick:null});
  return elements.get(id);
 };
 const events=[];
 const root={};const ctx={senseId:SENSE,entryId:ENTRY,chapterId:'ch1',
  anchor:'p0:s0',legacyWordId:'old1',element:{id:'word'}};
 runInNewContext(readFileSync(new URL('../public/sense-reader-bridge.js',import.meta.url),'utf8'),{
  window:root,document:{getElementById:get},URL,console
 });
 const api={user:()=>true,request:(...args)=>{events.push(['request',...args]);return request(...args)},
  speak:x=>events.push(['speak',x]),pause:()=>events.push(['pause']),
  close:()=>events.push(['close']),openLegacy:(...x)=>events.push(['legacy',...x]),
  supersedeLegacy:()=>events.push(['supersede']),toast:x=>events.push(['toast',x])};
 root.MiaowuSenseReaderBridge.configure(api);
 return {bridge:root.MiaowuSenseReaderBridge,get,events,ctx};
}
test('exact approved sense opens in staging read-only view, preserves old learning fallback',async()=>{
 const x=load();
 assert.equal(await x.bridge.open(x.ctx),true);
 assert.match(x.get('wordPop').innerHTML,/本章词义/);
 assert.match(x.get('wordPop').innerHTML,/复习记录仍使用原版词卡/);
 assert.doesNotMatch(x.get('wordPop').innerHTML,/id="v12Remember"|id="v12Master"/);
 assert.equal(x.events.filter(e=>e[0]==='request').length,1);
 assert.match(x.events.find(e=>e[0]==='request')[1],/\/api\/me\/dictionary\/senses\/gds_/);
 x.get('senseLegacyCard').onclick();
 assert.equal(x.events.filter(e=>e[0]==='legacy').length,2);
});
test('wrong approved identity is refused and falls back to legacy',async()=>{
 const x=load({request:async()=>({card:{...card,sense_id:'gds_'+'c'.repeat(24)},revision:0})});
 await x.bridge.open(x.ctx);
 assert.equal(x.events.filter(e=>e[0]==='legacy').length,2);
 assert.ok(x.events.some(e=>e[0]==='toast'));
});
test('card content is escaped, no injected buttons or script markup',async()=>{
 const x=load({request:async()=>({card:{...card,exampleEn:'<img src=x onerror=alert(1)>',meaningZh:'<script>'},revision:0})});
 await x.bridge.open(x.ctx);
 const html=x.get('wordPop').innerHTML;
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<script>|<img/);
});
test('bad anchors fail before remote call and cannot create learning events',async()=>{
 const x=load();
 assert.equal(await x.bridge.open({...x.ctx,senseId:ENTRY}),false);
 assert.equal(await x.bridge.open({...x.ctx,anchor:'p1:s1&x=1'}),false);
 assert.equal(x.events.length,0);
});
test('async stale response does not replace another word card',async()=>{
 let release;const x=load({request:()=>new Promise(resolve=>{release=resolve})});
 const pending=x.bridge.open(x.ctx);
 x.bridge.invalidate();release({card,revision:0});
 await pending;
 assert.doesNotMatch(x.get('wordPop').innerHTML,/本章词义/);
});
test('reader route and HTML explicitly gate staging-only sense maps',()=>{
 const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(worker,/senseReaderReady:env.APP_ENV==='staging'&&/);
 assert.match(worker,/GLOBAL_DICTIONARY_SENSE_SRS_ENABLED==='true'/);
 assert.match(app,/if\(page.senseReaderReady&&user\)/);
 assert.match(app,/reviewedSenseAnchors=new Map\(\)/);
 assert.match(app,/MiaowuSenseReaderBridge\.open/);
 assert.match(page,/sense-reader-bridge\.js/);
});
