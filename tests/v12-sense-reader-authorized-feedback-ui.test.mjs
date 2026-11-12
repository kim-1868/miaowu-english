import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const ID='gds_'+'a'.repeat(24),ENTRY='gdict_'+'b'.repeat(24);
const baseCard={sense_id:ID,entry_id:ENTRY,headword:'choice',pos:'n.',
 meaningZh:'选择',exampleEn:'The choice was hers.',exampleZh:'选择由她决定。',
 phoneticUk:'/tʃɔɪs/',phoneticUs:'/tʃɔɪs/'};
const source={revision:0,study:{status:'new',stage:0,due_at:null},
 write_enabled:true,read_only:false,card:baseCard};
function setup(stored={...source,study:{...source.study}}){
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{innerHTML:'',onclick:null,disabled:false});
  return elements.get(id);
 };
 const state={...stored},events=[],root={
  crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}
 };
 const requester=async(path,method='GET',payload)=>{
  events.push({path,method,payload});
  if(method==='POST'){
   if(state.revision!==payload.expectedRevision)
    throw Error('SENSE_STALE_REVISION');
   state.revision++;
   state.study={...state.study,stage:1,status:'learning'};
   return {revision:state.revision,study:state.study};
  }
  return {...state,card:baseCard};
 };
 runInNewContext(readFileSync(new URL('../public/sense-reader-bridge.js',import.meta.url),'utf8'),{
  window:root,document:{getElementById:get},console,URL
 });
 root.MiaowuSenseReaderBridge.configure({
  user:()=>true,request:requester,
  speak:()=>{},pause:()=>{},close:()=>{},
  openLegacy:()=>events.push({legacy:true}),
  supersedeLegacy:()=>{},toast:t=>events.push({toast:t})
 });
 const ctx=(chapterId='book-a-chapter',legacyWordId='word-a')=>({
  senseId:ID,entryId:ENTRY,chapterId,legacyWordId,anchor:'p0:s7',element:{}
 });
 return {root,get,events,ctx,state};
}
test('authorized per-sense feedback uses same sense id across book A and B',async()=>{
 const x=setup(),bridge=x.root.MiaowuSenseReaderBridge;
 await bridge.open(x.ctx());
 assert.match(x.get('wordPop').innerHTML,/跨书统一复习/);
 assert.match(x.get('wordPop').innerHTML,/id="senseRemember"/);
 await x.get('senseRemember').onclick();
 assert.equal(x.state.revision,1);
 assert.equal(x.events.filter(e=>e.method==='POST').length,1);
 assert.deepEqual(x.events.find(e=>e.method==='POST').payload,
  {chapterId:'book-a-chapter',anchor:'p0:s7',
   kind:'remembered',eventId:'11111111-1111-4111-8111-111111111111',
   expectedRevision:0});
 await bridge.open(x.ctx('book-b-chapter','word-b'));
 assert.match(x.get('wordPop').innerHTML,/第 1 阶段/);
 await x.get('senseForget').onclick();
 assert.equal(x.state.revision,2);
 const posts=x.events.filter(e=>e.method==='POST');
 assert.equal(posts[1].path,posts[0].path);
 assert.equal(posts[1].payload.chapterId,'book-b-chapter');
 assert.equal(posts[1].payload.expectedRevision,1);
 assert.equal(x.events.filter(e=>e.legacy).length,2);
});
test('read-only API cannot display write actions even if study revision exists',async()=>{
 const x=setup({...source,read_only:true,write_enabled:false});
 await x.root.MiaowuSenseReaderBridge.open(x.ctx());
 assert.doesNotMatch(x.get('wordPop').innerHTML,/id="senseRemember"/);
 assert.doesNotMatch(x.get('wordPop').innerHTML,/id="senseForget"/);
 assert.match(x.get('wordPop').innerHTML,/复习记录仍使用原版词卡/);
 assert.equal(x.events.filter(e=>e.method==='POST').length,0);
});
test('SRS failure returns original card, never claims successful feedback',async()=>{
 const x=setup(),bridge=x.root.MiaowuSenseReaderBridge;
 await bridge.open(x.ctx());
 x.state.revision=99;
 await x.get('senseRemember').onclick();
 assert.ok(x.events.some(e=>e.legacy));
 assert.ok(x.events.some(e=>e.toast));
});
test('two simultaneous clicks cannot submit duplicate study revisions',async()=>{
 const x=setup(),bridge=x.root.MiaowuSenseReaderBridge;
 await bridge.open(x.ctx());
 const button=x.get('senseRemember');
 const first=button.onclick(),second=button.onclick();
 await Promise.all([first,second]);
 assert.equal(x.events.filter(e=>e.method==='POST').length,1);
 assert.equal(x.state.revision,1);
});
