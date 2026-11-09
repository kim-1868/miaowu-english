import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditSmartWordCard,summarizeSmartCardAudit} from '../src/smart-vocab-card-quality.js';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
  .trim().split(/\r?\n/u).map(JSON.parse);
const cet4=load('content/lexicon/cet4-priority-draft-batch-20261110.jsonl');
const pilot=load('content/lexicon/smart-vocab-pilot-20-review.jsonl')
  .filter(x=>x.category_slug==='cet4');

test('CET4-only priority pack contains 98 distinct first-CET4 words, never touching other exams',()=>{
  assert.equal(cet4.length,98);
  assert.equal(new Set(cet4.map(x=>x.headword)).size,cet4.length);
  assert.ok(cet4.every(x=>x.category_slug==='cet4'&&
    x.source_first_tier==='四级'&&x.reviewed===false));
  assert.ok(cet4.every(x=>x.word_id==='sv_cet4_'+x.headword));
});

test('all 108 CET4 drafts preserve prior 10 cards without a spelling collision',()=>{
  assert.equal(pilot.length,10);
  const merged=[...pilot,...cet4];
  assert.equal(new Set(merged.map(x=>x.headword)).size,108);
  assert.equal(new Set(merged.map(x=>x.word_id)).size,108);
  assert.equal(merged.every(x=>x.reviewed===false),true);
});

test('98 source-verified COCA ranks have the same fingerprint as the owner CET4 CSV',()=>{
  const joined=cet4.map(x=>x.headword+':'+x.frequency_rank).sort().join('\n')+'\n';
  const digest=createHash('sha256').update(joined).digest('hex');
  // Receipt generated read-only against owner source:
  // 考试词表_合并版_原始.csv SHA256 f748cdfbd3fa2c6bd33f5ced0b021dd8f69386a52539596db4d4d8b91cc67d37
  assert.equal(digest,'4ee8c53b7e0656ae7c4e77331c22fb47f54cee369491d795a9648e637fa29935');
  assert.equal(cet4.every(x=>x.frequency_source==='COCA'&&
    Number.isSafeInteger(x.frequency_rank)&&x.frequency_rank>0),true);
});

test('all 98 drafts pass structural QA, but automated passing never means commercial approval',()=>{
  const result=summarizeSmartCardAudit(cet4);
  assert.equal(result.structurallyReady,98);
  assert.equal(result.commerciallyApproved,0);
  assert.deepEqual(result.errors,{});
  assert.ok(cet4.every(x=>auditSmartWordCard(x).structurallyReady));
});

test('example sentences, meanings and IPA remain learner-readable and explicitly marked draft',()=>{
  for(const card of cet4){
    assert.match(card.phonetic_uk,/^\/.+\/$/);
    assert.match(card.meaning_zh,/[\u3400-\u9fff]/u);
    assert.ok(card.example_en.length>=18&&card.example_en.length<=260);
    assert.match(card.example_zh,/[\u3400-\u9fff]/u);
    assert.equal(typeof card.editorial_note,'string');
    assert.match(card.editorial_note,/审核/);
  }
});
