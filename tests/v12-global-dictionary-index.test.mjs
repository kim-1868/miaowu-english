import test from 'node:test';
import assert from 'node:assert/strict';
import {compileDictionaryDraftIndex}
  from '../scripts/build-global-dictionary-index.mjs';

const header=['单词','涉及考试','音标','词性','中文释义','词形变化'];
const csv=(rows)=>[header,...rows].map(r=>r.map(x=>{
  const v=String(x);
  return /[,\"\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;
}).join(',')).join('\n')+'\n';

test('an owner-source index spans CET4 CET6 and other levels without duplicating main cards',()=>{
 const result=compileDictionaryDraftIndex(csv([
  ['Record','四级,六级','rekord','n:40/v:60','n. 记录；v. 录制','p:recorded/d:recorded/i:recording'],
  ['develop','高考,四级,考研','/dɪveləp/','v:100','v. 发展','d:developed/3:develops'],
  ['sophisticated','六级,雅思','','adj:100','adj. 复杂的',''],
  ['B.C.','四级','','abbr','公元前','']
 ]));
 assert.equal(result.status,'UNVERIFIED_DRAFT_DICTIONARY_INDEX_NOT_FOR_PUBLICATION');
 assert.equal(result.stats.sourceRows,4);
 assert.equal(result.stats.retainedHeadwords,3);
 assert.equal(result.stats.excludedHeadwords,1);
 assert.equal(result.stats.levels.cet4,2);
 assert.equal(result.stats.levels.cet6,2);
 assert.equal(result.stats.levels.ielts,1);
 assert.ok(result.entries.every(x=>x.teaching_ready===false&&x.reviewed===false));
 assert.ok(result.forms.every(x=>x.reviewed===false));
 assert.ok(result.forms.some(x=>x.form==='recorded'&&x.headword==='record'));
 assert.ok(result.excluded.some(x=>x.source_headword==='B.C.'));
});

test('recorded forms cannot be marked reviewed merely because ECDICT knows their spelling',()=>{
 const r=compileDictionaryDraftIndex(csv([
  ['give','高考,四级','/gɪv/','v:100','给予','p:gave/d:given/i:giving/3:gives']
 ]));
 assert.equal(r.forms.length,4);
 assert.equal(r.forms.some(x=>x.verified===true),false);
 assert.equal(r.entries[0].source_translation_unverified,'给予');
});

test('headword identity is deterministic and does not vary with source row order',()=>{
 const a=['about','四级','ipa','prep:100','关于',''];
 const b=['effect','六级','ipa','n:100','效果',''];
 const one=compileDictionaryDraftIndex(csv([a,b]));
 const two=compileDictionaryDraftIndex(csv([b,a]));
 assert.deepEqual(one.entries,two.entries);
 assert.deepEqual(one.forms,two.forms);
 assert.equal(new Set(one.entries.map(x=>x.entry_id)).size,2);
});

test('duplicates and missing source fields are refused rather than silently swallowed',()=>{
 assert.throws(()=>compileDictionaryDraftIndex(csv([
  ['RECORD','四级','','n:100','记录',''],
  ['record','六级','','v:100','录制','']
 ])),/SOURCE_DUPLICATE_NORMALIZED_HEADWORD/);
 assert.throws(()=>compileDictionaryDraftIndex('word,tag\nrecord,cet4\n'),/MISSING_DICTIONARY_SOURCE_COLUMN/);
});

test('invalid exchange entries remain unreviewed and are counted, not repaired by guessing',()=>{
 const r=compileDictionaryDraftIndex(csv([
  ['lead','四级','/liːd/','v:50','带领','p:led/x:untrusted/s:leads/i:x/3:leads']
 ]));
 assert.ok(r.forms.some(x=>x.form==='led'));
 assert.equal(r.forms.filter(x=>x.form==='leads').length,1);
 assert.ok(r.stats.sourceTokenWarnings>=2);
});
