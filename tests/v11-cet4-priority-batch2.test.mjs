import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {summarizeSmartCardAudit} from '../src/smart-vocab-card-quality.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
  .trim().split(/\r?\n/u).map(JSON.parse);
const original=read('content/lexicon/cet4-priority-draft-batch-20261110.jsonl');
const next=read('content/lexicon/cet4-priority-draft-batch-2-20261110.jsonl');
const pilot=read('content/lexicon/smart-vocab-pilot-20-review.jsonl')
  .filter(c=>c.category_slug==='cet4');

test('second CET4 source-backed batch has 76 genuine new CET4-tier headwords',()=>{
  assert.equal(next.length,76);
  assert.equal(next.every(x=>x.category_slug==='cet4'&&x.source_first_tier==='四级'),true);
  assert.equal(next.every(x=>x.reviewed===false&&x.editorial_note.includes('审核')),true);
  const ranks=next.map(x=>x.headword+':'+x.frequency_rank).sort().join('\n')+'\n';
  assert.equal(
    createHash('sha256').update(ranks).digest('hex'),
    'fe6c22a239355d748e34d9c1729eb29d0d430733a88765a591dfa82965d27749'
  );
  assert.equal(next.every(x=>x.frequency_source==='COCA'&&
    Number.isSafeInteger(x.frequency_rank)&&x.frequency_rank>0),true);
});

test('second batch cards pass 76/76 structural QA, never silently sign off',()=>{
  const result=summarizeSmartCardAudit(next);
  assert.equal(result.total,76);
  assert.equal(result.structurallyReady,76);
  assert.equal(result.commerciallyApproved,0);
  assert.deepEqual(result.errors,{});
});

test('new 76 and previous 108 cards share no headwords or IDs',()=>{
  const cards=[...pilot,...original,...next];
  assert.equal(cards.length,184);
  assert.equal(new Set(cards.map(x=>x.word_id)).size,184);
  assert.equal(new Set(cards.map(x=>x.headword.toLowerCase())).size,184);
  assert.equal(cards.every(x=>x.reviewed===false),true);
  assert.equal(cards.every(x=>x.example_en&&x.example_zh&&x.meaning_zh),true);
});

test('98 first batch draft meanings now refer to one teaching sense per example',()=>{
  assert.equal(original.length,98);
  assert.equal(original.filter(x=>x.sense_review_note).length,58);
  assert.equal(original.filter(x=>x.meaning_zh.includes('；')).length,0);
  assert.equal(next.filter(x=>x.meaning_zh.includes('；')).length,0);
  for(const card of original.filter(x=>x.sense_review_note)){
    assert.match(card.sense_review_note,/其他词性\/义项不得自动合并/);
  }
});

test('optional collocations appear only on 141 useful cards, with no fabricated blank rows',()=>{
  const cards=[...original,...next];
  const withPairs=cards.filter(x=>Array.isArray(x.collocations)&&x.collocations.length);
  assert.equal(withPairs.length,141);
  assert.equal(cards.length-withPairs.length,33);
  for(const row of withPairs){
    assert.equal(row.collocations.length,1);
    assert.equal(row.collocations[0].en.trim().length>=4,true);
    assert.match(row.collocations[0].zh,/[\u3400-\u9fff]/u);
  }
});

test('independent exam categories, published status and existing study identities are not modified by content draft files',()=>{
  for(const card of [...original,...next]){
    assert.equal(card.word_id,'sv_cet4_'+card.headword);
    assert.equal(Object.hasOwn(card,'user_id'),false);
    assert.equal(Object.hasOwn(card,'study_status'),false);
    assert.equal(Object.hasOwn(card,'published_at'),false);
    assert.equal(Object.hasOwn(card,'category_entitlement'),false);
    assert.equal(card.reviewed,false);
  }
});
