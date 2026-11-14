import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {compileStagingCrossbookPilot} from '../scripts/compile-staging-owner-crossbook-pilot.mjs';
import {listPublishedApprovedLegacySenseAnchors}
 from '../src/global-dictionary-published-approved-legacy-overlay.js';
class D1 {
 constructor(raw){this.raw=raw}
 prepare(q){const db=this.raw;return {bind(...values){return {
  all:async()=>({results:db.prepare(q).all(...values)})
 }}}}
}
const m=x=>readFileSync(new URL(x,import.meta.url),'utf8');
function db(){
 const conn=new DatabaseSync(':memory:');
 conn.exec(m('../db/001_schema.sql'));
 for(const file of ['../db/013_global_dictionary.sql',
  '../db/016_global_dictionary_lessons.sql',
  '../db/018_global_dictionary_reviewed_senses.sql',
  '../db/020_global_dictionary_sense_study.sql'])
  conn.exec(m(file));
 conn.prepare("INSERT INTO categories(id,slug,title,is_visible) VALUES('cet4','cet4','四级',1)").run();
 conn.prepare("INSERT INTO global_dictionary_sources(source_key,license_name,source_sha256,imported_at) VALUES('unreviewed-ecd','not yet reviewed',?,'2026-11-01')")
  .run('f'.repeat(64));
 conn.prepare("INSERT INTO global_dictionary_entries(entry_id,headword,source_name,teaching_ready) VALUES(?,?,?,0)")
  .run('gdict_'+'a'.repeat(24),'choice','unreviewed-ecd');
 return conn;
}
test('two owner-release first chapter paragraphs have one canonical STAGING-only choice sense',async()=>{
 const pilot=compileStagingCrossbookPilot();
 assert.equal(pilot.status,'STAGING_SAMPLE_SQL_PREPARED_NOT_EXECUTED');
 assert.equal(pilot.pilotBooks.length,2);
 assert.equal(pilot.pilotAnchors.length,2);
 assert.notEqual(pilot.pilotAnchors[0].legacyWordId,pilot.pilotAnchors[1].legacyWordId);
 assert.deepEqual(new Set(pilot.pilotAnchors.map(x=>x.oldCardSha256)).size,2);
 assert.equal(pilot.reviewedForCommercialPublication,false);
 assert.equal(pilot.productionWritesAllowed,false);
 const sql=db();
 try{
  sql.exec(pilot.sql);
  const count=query=>sql.prepare(query).get().n;
  assert.equal(count("SELECT count(*) n FROM books WHERE id LIKE 'mw-v12-pilot-%'"),2);
  assert.equal(count("SELECT count(*) n FROM global_dictionary_senses WHERE approved=1"),1);
  assert.equal(count("SELECT count(*) n FROM global_dictionary_legacy_sense_links"),2);
  assert.equal(count("SELECT count(*) n FROM chapter_words"),2);
  assert.equal(count("SELECT count(*) n FROM user_dictionary_sense_study"),0);
  assert.equal(count("SELECT count(*) n FROM user_words"),0);
  assert.equal(count("SELECT count(*) n FROM entitlements"),0);
  const D=new D1(sql);
  const first=await listPublishedApprovedLegacySenseAnchors(D,
   {chapterId:pilot.pilotAnchors[0].chapterId,userId:'anonymous'});
  const second=await listPublishedApprovedLegacySenseAnchors(D,
   {chapterId:pilot.pilotAnchors[1].chapterId,userId:'anonymous'});
  assert.equal(first.anchors.length,1);
  assert.equal(second.anchors.length,1);
  assert.equal(first.anchors[0].sense_id,pilot.senseId);
  assert.equal(second.anchors[0].sense_id,pilot.senseId);
  assert.notEqual(pilot.pilotAnchors[0].chapterId,pilot.pilotAnchors[1].chapterId);
  assert.equal(first.d1_writes,0);
  const original=sql.prepare("SELECT original_source_name,original_teaching_ready FROM v12_internal_pilot_entry_restore").get();
  assert.equal(original.original_source_name,'unreviewed-ecd');
  assert.equal(original.original_teaching_ready,0);
  assert.throws(()=>sql.exec(pilot.sql));
 }finally{sql.close()}
});
test('changing legacy card or story gloss invalidates pilot sense overlay',async()=>{
 const pilot=compileStagingCrossbookPilot(),sql=db();
 try{
  sql.exec(pilot.sql);
  const entry=pilot.pilotAnchors[0];
  sql.prepare("UPDATE words SET meaning_zh='另一种意思' WHERE id=?").run(entry.legacyWordId);
  const result=await listPublishedApprovedLegacySenseAnchors(new D1(sql),
    {chapterId:entry.chapterId,userId:'guest'});
  assert.equal(result.anchors.length,0);
  assert.equal(result.blockedCounts.published_context_mismatch,1);
 }finally{sql.close()}
});
test('pilot SQL has no production targets, customer writes or hidden automatic deployment',()=>{
 const p=compileStagingCrossbookPilot(),sql=p.sql;
 assert.ok(sql.includes('v12_internal_pilot_entry_restore'));
 assert.ok(sql.includes('INTERNAL_STAGING_QA_NOT_AUTHENTICATED_PUBLISHER'));
 assert.ok(!/\b(?:DELETE FROM users|UPDATE users|UPDATE entitlements|UPDATE user_words|UPDATE review_events|DROP TABLE)\b/i.test(sql));
 assert.equal(p.actualLivePublisherBookCount,0);
 assert.equal(p.expectedPublishedPilotAnchors,2);
});
