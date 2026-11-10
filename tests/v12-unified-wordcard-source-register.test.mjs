import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=name=>readFileSync(new URL('../content/lexicon/'+name,import.meta.url),'utf8');
test('shared source register is traceable, deduplicated and never considered publishing approval',()=>{
 const rows=get('wordcard-existing-source-register-20261110.jsonl').trim().split('\n').map(JSON.parse);
 const manifest=JSON.parse(get('wordcard-existing-source-register-manifest-20261110.json'));
 assert.equal(rows.length,305);
 assert.equal(manifest.source_rows_total,343);
 assert.equal(manifest.exact_duplicate_old_id_rows_collapsed,38);
 assert.equal(manifest.unique_legacy_word_ids,305);
 assert.equal(new Set(rows.map(x=>x.legacy_word_id)).size,305);
 assert.equal(rows.filter(x=>x.origin==='standalone_editorial_draft').length,238);
 assert.equal(rows.filter(x=>x.origin==='historical_novel_package_snapshot').length,67);
 assert.equal(rows.filter(x=>x.all_required_fields_present).length,67);
 assert.equal(rows.filter(x=>!x.phonetic_us).length,238);
 assert.equal(rows.filter(x=>x.source_repo_paths.length===2).length,38);
 for(const x of rows){
  assert.ok(x.legacy_word_id&&x.headword&&x.sense_key_candidate);
  assert.ok(x.example_en&&x.example_zh&&x.phonetic_uk);
  assert.equal(x.reviewed,false);
  assert.equal(x.lesson_approved,false);
  assert.equal(x.auto_publish_allowed,false);
  assert.equal(x.canonical_entry_id,null);
  assert.equal(x.approved_sense_id,null);
  assert.equal(x.legacy_id_must_be_preserved,true);
 }
});
