import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflightAgentV2Packages} from '../scripts/v11-agent-v2-preflight.mjs';

const card = (id='mw-card-001',more={}) => ({
  id,headword:'record',meaningZh:'记录',partOfSpeech:'n.',
  phoneticUk:'/ˈrekɔːd/',phoneticUs:'/ˈrekərd/',
  exampleEn:'She kept a record of every clue.',exampleZh:'她保留了每一条线索的记录。',
  collocations:[{en:'keep a record',zh:'保留记录'}],...more
});
const document = (name='first',w=card()) => ({
  version:1,sourceLabel:'agent-v2',
  book:{id:'mw-'+name+'-book',title:'Story '+name,category:'cet4',description:'Original story'},
  words:[w],
  chapters:[{id:'mw-'+name+'-ch01',number:1,title:'第一章',preview:false,
    paragraphs:[{segments:[{text:'她看着那份 '},{wordId:w.id,surface:w.headword,gloss:w.meaningZh},{text:'，意识到真相。'}]}]}]
});
const packet=(doc,path='test.json')=>[{path,doc}];
test('accepts a valid novel using exact live website validatePackage',()=>{
  const report=preflightAgentV2Packages(packet(document()));
  assert.equal(report.importStructurePass,true);
  assert.equal(report.counts.p0,0);
  assert.equal(report.counts.p1,0);
  assert.equal(report.summaries[0].mentions,1);
  assert.equal(report.publicationApproved,false);
});
test('blocks a whitespace-only segment (historic upload rejection)',()=>{
  const doc=document();
  doc.chapters[0].paragraphs[0].segments.push({text:'  '});
  const report=preflightAgentV2Packages(packet(doc));
  assert.equal(report.importStructurePass,false);
  assert.ok(report.issues.some(x=>x.code==='EDITORIAL_PACKAGE_INVALID'));
});
test('blocks unapproved preview chapters despite structurally valid JSON',()=>{
  const doc=document();
  doc.chapters[0].preview=true;
  assert.ok(preflightAgentV2Packages(packet(doc)).issues.some(x=>x.code==='UNAPPROVED_FREE_PREVIEW'));
});
test('blocks a second book with identical book ID',()=>{
  const doc=document();
  const result=preflightAgentV2Packages([{path:'a.json',doc},{path:'b.json',doc}]);
  assert.ok(result.issues.some(x=>x.code==='DUPLICATE_BOOK_ID'));
});
test('blocks shared word ID when a different sense is assigned',()=>{
  const a=document('a');const b=document('b',card('mw-card-001',{meaningZh:'录制'}));
  const result=preflightAgentV2Packages([{path:'a.json',doc:a},{path:'b.json',doc:b}]);
  assert.equal(result.importStructurePass,false);
  assert.ok(result.issues.some(x=>x.code==='CROSS_BOOK_ID_CONFLICT'));
});
test('warns rather than auto-merges two IDs for the same textual sense',()=>{
  const a=document('a');const b=document('b',card('mw-card-002'));
  const result=preflightAgentV2Packages([{path:'a.json',doc:a},{path:'b.json',doc:b}]);
  assert.equal(result.importStructurePass,true);
  assert.ok(result.issues.some(x=>x.code==='PARALLEL_SENSE_IDS'&&x.severity==='P1'));
});
test('warns about mismatched metadata for one reused ID (INSERT OR IGNORE)',()=>{
  const a=document('a');const b=document('b',card('mw-card-001',{exampleEn:'A different sample sentence.'}));
  const result=preflightAgentV2Packages([{path:'a.json',doc:a},{path:'b.json',doc:b}]);
  assert.equal(result.importStructurePass,true);
  assert.ok(result.issues.some(x=>x.code==='SHARED_ID_METADATA_REVIEW'));
});
test('warns for zero collocations without inventing them',()=>{
  const result=preflightAgentV2Packages(packet(document('a',card('mw-card-001',{collocations:[]}))));
  assert.ok(result.issues.some(x=>x.code==='MISSING_COLLOCATION'&&x.severity==='P1'));
});
test('blocks unknown sale category even when category slug is syntactically safe',()=>{
  const doc=document();doc.book.category='learning';
  assert.ok(preflightAgentV2Packages(packet(doc)).issues.some(x=>x.code==='UNKNOWN_CATEGORY'));
});
