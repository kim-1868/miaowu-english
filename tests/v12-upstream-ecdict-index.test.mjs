import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {compileUpstreamEcdictDraftIndex}
  from '../scripts/build-upstream-ecdict-index.mjs';
import {buildGlobalDictionaryImportSQL}
  from '../scripts/build-global-dictionary-staging-sql.mjs';

const header='word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio\n';
const csv=header+
 'record,/ˈrekɔːd/,,记录,n:55/v:45,3,1,cet4 cet6,300,200,p:recorded/i:recording,,\n'+
 'sophisticated,/səˈfɪstɪkeɪtɪd/,,复杂的,adj:100,4,0,cet6 ielts,1800,1300,,,\n'+
 'go,/ɡəʊ/,,去,v:100,5,1,gk cet4 ky,88,77,p:went/d:gone/3:goes/i:going,,\n'+
 'i.e.,,,"也就是说",abbr:100,0,0,cet4,10000,10500,,,\n';
const SHA='c'.repeat(64);
test('official ECDICT upstream headers produce one wordcard per headword and accurate multi-exam labels',()=>{
 const result=compileUpstreamEcdictDraftIndex(csv);
 assert.equal(result.stats.sourceRows,4);
 assert.equal(result.stats.retainedHeadwords,3);
 assert.equal(result.stats.excludedHeadwords,1);
 assert.equal(result.stats.levels.cet4,2);
 assert.equal(result.stats.levels.cet6,2);
 assert.equal(result.stats.levels.ielts,1);
 assert.equal(result.stats.levels.postgrad,1);
 assert.equal(result.entries.find(x=>x.headword==='record').exam_levels.join(','),'cet4,cet6');
 assert.equal(result.entries.every(x=>x.teaching_ready===false),true);
 assert.equal(result.forms.find(x=>x.form==='went').headword,'go');
 assert.equal(result.forms.every(x=>x.reviewed===false),true);
 assert.ok(result.excluded.some(x=>x.source_headword==='i.e.'));
});
test('upstream ECDICT can feed existing disabled staging D1 emitter without transforming novel/user tables',()=>{
 const index=compileUpstreamEcdictDraftIndex(csv);
 const out=buildGlobalDictionaryImportSQL(index,{
   sourceSha256:SHA,sourceKey:'upstream_ecdict_unverified',batchSize:2
 });
 assert.equal(out.entries,3);
 assert.equal(out.enabled,false);
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(readFileSync(new URL('../db/013_global_dictionary.sql',import.meta.url),'utf8'));
  for(const part of out.chunks)db.exec(part.sql);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_entries').get().n,3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM global_dictionary_forms').get().n,index.forms.length);
  const levels=JSON.parse(db.prepare(
   "SELECT exam_levels_json FROM global_dictionary_entries WHERE headword='record'"
  ).get().exam_levels_json);
  assert.deepEqual(levels,['cet4','cet6']);
  assert.equal(db.prepare(
   "SELECT enabled FROM global_dictionary_sources WHERE source_key='upstream_ecdict_unverified'"
  ).get().enabled,0);
 }finally{db.close()}
});
test('upstream ECDICT duplicate normalized word and structurally missing fields fail closed',()=>{
 const double=header+
  'RECORD,ipa,,记录,n,2,1,cet4,1,1,,,\n'+
  'record,ipa,,记录,n,2,1,cet6,1,1,,,\n';
 assert.throws(()=>compileUpstreamEcdictDraftIndex(double),/UPSTREAM_DUPLICATE_HEADWORD/);
 assert.throws(()=>compileUpstreamEcdictDraftIndex('word,tag\nlead,cet4\n'),
   /UPSTREAM_SOURCE_COLUMN_MISSING/);
});
test('ECDICT source quirks in morphology are retained as unverified candidates, not trusted shortcuts',()=>{
 const sample=header+'lead,liːd,,领导,v:100,5,1,cet4,20,20,p:led/d:led/x:unknown/i:a,,\n';
 const result=compileUpstreamEcdictDraftIndex(sample);
 assert.equal(result.forms.filter(x=>x.form==='led').length,1);
 assert.ok(result.stats.invalidForms>=2);
 assert.equal(result.stats.teachingReady,0);
});
