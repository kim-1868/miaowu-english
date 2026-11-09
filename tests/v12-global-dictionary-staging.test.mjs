import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {compileDictionaryDraftIndex} from '../scripts/build-global-dictionary-index.mjs';
import {buildGlobalDictionaryImportSQL}
  from '../scripts/build-global-dictionary-staging-sql.mjs';
import {globalDictionaryTablesReady,loadGlobalDictionaryCandidateIndex}
  from '../src/global-dictionary-db.js';
import {preflightNovelDictionaryMatches,matchDictionaryWord}
  from '../src/global-dictionary-matcher.js';
import {inspectStagingNovelMatch,handleOpsImportPreflight}
  from '../src/ops-import-preflight.js';

const header='单词,涉及考试,音标,词性,中文释义,词形变化\n';
const fixture=header+
 'develop,"高考,四级,六级",/dɪˈveləp/,v:100,发展,d:developed/3:develops/i:developing\n'+
 'record,"四级,六级",/rɪˈkɔːd/,n:50/v:50,记录,p:recorded/i:recording\n'+
 'see,"四级,六级",/siː/,v:100,看见,p:saw/d:seen\n'+
 'saw,六级,/sɔː/,n:100,锯子,s:saws\n'+
 'sophisticated,"六级,雅思",/səˈfɪstɪkeɪtɪd/,adj:100,复杂的,\n';
const SHA='a'.repeat(64);
const manuscript={
 version:1,book:{id:'cet-six-story',category:'cet6',title:'六级学习故事'},
 chapters:[{number:1,paragraphs:[{segments:[
  {text:'她决定 '},{wordId:'story-developed',surface:'developed',gloss:'开发'},
  {text:' a device. She saw a sophisticated model.'}
 ]}]}]
};
function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../db/013_global_dictionary.sql',import.meta.url),'utf8'));
 const source=compileDictionaryDraftIndex(fixture);
 const pkg=buildGlobalDictionaryImportSQL(source,{sourceSha256:SHA,batchSize:2});
 for(const item of pkg.chunks)sql.exec(item.sql);
 const db={prepare(query){
   const stmt=sql.prepare(query);
   return {
    async all(){return {results:stmt.all()};},
    bind(...args){
      return {async all(){return {results:stmt.all(...args)};},
        async first(){return stmt.get(...args)}};
    }
   };
 }};
 return {sql,db,pkg,source};
}
test('A2 source compiler creates one canonical entry across CET4 and CET6 and disabled import batches',()=>{
 const index=compileDictionaryDraftIndex(fixture);
 assert.equal(index.stats.retainedHeadwords,5);
 assert.equal(index.entries.find(x=>x.headword==='develop').exam_levels.includes('cet6'),true);
 assert.equal(index.entries.find(x=>x.headword==='develop').exam_levels.includes('cet4'),true);
 const out=buildGlobalDictionaryImportSQL(index,{sourceSha256:SHA,batchSize:2});
 assert.equal(out.entries,5);
 assert.equal(out.forms,index.forms.length);
 assert.equal(out.chunks.filter(x=>x.name.startsWith('01-entries-')).length,3);
 assert.equal(out.enabled,false);
 assert.ok(out.chunks.every(x=>!/\b(?:UPDATE|DELETE|DROP)\s+(?:user_words|entitlements|books|chapters)\b/i.test(x.sql)));
 assert.ok(out.chunks.at(-1).sql.includes("'0'")===false);
});
test('new isolated schema has no customer tables and only additive index structures',()=>{
 const s=readFileSync(new URL('../db/013_global_dictionary.sql',import.meta.url),'utf8');
 assert.match(s,/CREATE TABLE IF NOT EXISTS global_dictionary_entries/);
 assert.match(s,/CREATE TABLE IF NOT EXISTS global_dictionary_forms/);
 assert.doesNotMatch(s,/DROP TABLE|UPDATE user_words|DELETE FROM user_words/i);
});
test('staging schema and owner-source data import are inspectable in SQLite with zero approved cards',async()=>{
 const {sql,db,pkg}=setup();
 try{
  assert.equal(await globalDictionaryTablesReady(db),true);
  const row=sql.prepare('SELECT COUNT(*) AS total FROM global_dictionary_entries').get();
  assert.equal(row.total,5);
  assert.equal(sql.prepare('SELECT COUNT(*) AS total FROM global_dictionary_forms').get().total,pkg.forms);
  assert.equal(sql.prepare('SELECT enabled FROM global_dictionary_sources').get().enabled,0);
  const loaded=await loadGlobalDictionaryCandidateIndex(db,['develop','developed','record','saw','sophisticated']);
  assert.equal(loaded.index.headwordCount,5);
  assert.equal(loaded.index.entryCount,5);
  assert.equal(loaded.approvedSourceCount,0);
  assert.equal(matchDictionaryWord('develop',loaded.index).status,'dictionary_only');
  assert.equal(matchDictionaryWord('developed',loaded.index).status,'needs_review');
  assert.equal(matchDictionaryWord('saw',loaded.index).status,'needs_review');
 }finally{sql.close()}
});
test('staging auto-match endpoint reads canonical dictionary after flag but never assumes source approval',async()=>{
 const {sql,db}=setup();
 try{
  const before=sql.prepare('SELECT total_changes() AS n').get().n;
  const copy=structuredClone(manuscript);
  const out=await inspectStagingNovelMatch({
    DB:db,GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true'
  },manuscript);
  assert.equal(out.dictionary_index_ready,true);
  assert.equal(out.dictionary_status,'GLOBAL_DICTIONARY_STAGING_DRAFT');
  assert.equal(out.category,'cet6');
  assert.equal(out.summary.target.needs_review,1);
  assert.equal(out.targets[0].normalized_surface,'developed');
  assert.equal(out.targets[0].reason,'INFLECTION_NOT_VERIFIED');
  assert.equal(out.discovered.find(x=>x.normalized_surface==='saw').status,'needs_review');
  assert.equal(out.discovered.find(x=>x.normalized_surface==='sophisticated').status,'dictionary_only');
  assert.equal(out.release_blocked,true);
  assert.equal(out.ready_to_publish,false);
  assert.deepEqual(manuscript,copy);
  assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,before);
 }finally{sql.close()}
});
test('only explicit source + teaching + form signoff can produce a confirmed match',async()=>{
 const {sql,db}=setup();
 try{
  sql.exec("UPDATE global_dictionary_sources SET license_reviewed=1,enabled=1 WHERE source_key='owner_ecdict_exam_snapshot'");
  sql.exec("UPDATE global_dictionary_entries SET teaching_ready=1,reviewed_at='2026-11-10' WHERE headword='develop'");
  sql.exec("UPDATE global_dictionary_forms SET reviewed=1 WHERE form='developed'");
  const loaded=await loadGlobalDictionaryCandidateIndex(db,['develop','developed']);
  assert.equal(matchDictionaryWord('develop',loaded.index).status,'matched');
  assert.equal(matchDictionaryWord('developed',loaded.index).status,'matched');
  // Every other unreviewed word remains an unapproved dictionary lookup.
  const other=await loadGlobalDictionaryCandidateIndex(db,['record','recording']);
  assert.equal(matchDictionaryWord('record',other.index).status,'dictionary_only');
  assert.equal(matchDictionaryWord('recording',other.index).status,'needs_review');
 }finally{sql.close()}
});
test('missing schema fails closed when the feature flag is enabled',async()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  const db={prepare(s){return{async all(){return {results:sql.prepare(s).all()}}}}};
  assert.equal(await globalDictionaryTablesReady(db),false);
  await assert.rejects(
    ()=>inspectStagingNovelMatch({DB:db,GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true'},manuscript),
    /DICTIONARY_SCHEMA_REQUIRED/);
 }finally{sql.close()}
});
test('SQL emitter rejects partial source digest and pre-approved fake cards',()=>{
 const index=compileDictionaryDraftIndex(fixture);
 assert.throws(()=>buildGlobalDictionaryImportSQL(index),/SOURCE_SHA256_REQUIRED/);
 index.entries[0].teaching_ready=true;
 assert.throws(()=>buildGlobalDictionaryImportSQL(index,{sourceSha256:SHA}),
  /UNAPPROVED_OR_INVALID_SOURCE_ENTRY/);
});
test('staging preflight authorization remains mandatory when a real global index exists',async()=>{
 const {sql,db}=setup();
 try{
  const req=new Request('https://staging.example/api/ops/import/preflight',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(manuscript)
  });
  const r=await handleOpsImportPreflight(req,{
    APP_ENV:'staging',DB:db,OPS_TOKEN_PEPPER:'p'.repeat(64),
    GLOBAL_DICTIONARY_LOOKUP_ENABLED:'true'
  },'/api/ops/import/preflight');
  assert.equal(r.status,401);
 }finally{sql.close()}
});
