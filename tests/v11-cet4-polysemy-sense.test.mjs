import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSmartWordCard,summarizeSmartCardAudit} from '../src/smart-vocab-card-quality.js';
import {studyKey} from '../src/study-identity.js';

const lines=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
  .trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const senses=lines('content/lexicon/cet4-polysemy-draft-batch-20261110.jsonl');
const previous=lines('content/lexicon/cet4-priority-draft-batch-20261110.jsonl');
const earlier=lines('content/lexicon/smart-vocab-pilot-20-review.jsonl')
  .filter(x=>x.category_slug==='cet4');

test('22 high-frequency CET4 headwords now teach 44 independent POS/sense cards',()=>{
  assert.equal(senses.length,44);
  assert.equal(new Set(senses.map(w=>w.headword)).size,22);
  assert.equal(new Set(senses.map(w=>w.word_id)).size,44);
  const grouped=new Map();
  for(const w of senses){
    if(!grouped.has(w.headword))grouped.set(w.headword,[]);
    grouped.get(w.headword).push(w);
  }
  for(const family of grouped.values()){
    assert.equal(family.length,2);
    assert.notEqual(studyKey(family[0]),studyKey(family[1]));
    assert.notEqual(family[0].part_of_speech,family[1].part_of_speech);
    assert.equal(family.every(w=>w.reviewed===false&&w.category_slug==='cet4'),true);
  }
});

test('all 44 multi-sense drafts are structurally valid and contain one primary Chinese meaning',()=>{
  const result=summarizeSmartCardAudit(senses);
  assert.equal(result.structurallyReady,44);
  assert.equal(result.commerciallyApproved,0);
  assert.deepEqual(result.errors,{});
  assert.equal(senses.every(w=>!w.meaning_zh.includes('；')&&!w.meaning_zh.includes(';')),true);
});

test('lead and record retain their distinct contextual pronunciations',()=>{
  for(const headword of ['lead','record']){
    const entries=senses.filter(x=>x.headword===headword);
    assert.equal(entries.length,2);
    assert.notEqual(entries[0].phonetic_uk,entries[1].phonetic_uk);
  }
  assert.equal(senses.find(x=>x.headword==='lead'&&x.part_of_speech==='n.').meaning_zh,'铅（金属）');
});

test('examples reflect each separate sense and are not blank placeholder sentences',()=>{
  for(const card of senses){
    assert.match(card.example_en,/[.!?]$/);
    assert.ok(card.example_en.split(/\s+/).length>=6);
    assert.match(card.example_zh,/[\u3400-\u9fff]/u);
    assert.ok(card.editorial_note.includes('人工审校'));
    assert.equal(auditSmartWordCard(card).structurallyReady,true);
  }
  const adjective=senses.find(x=>x.headword==='public'&&x.part_of_speech==='adj.');
  assert.match(adjective.example_en,/public library/);
});

test('new polysemy batch has no headword collision with earlier 108 CET4 candidates',()=>{
  const earlierHeads=new Set([...previous,...earlier].map(x=>x.headword));
  assert.equal(senses.some(x=>earlierHeads.has(x.headword)),false);
  const combined=[...previous,...earlier,...senses];
  assert.equal(combined.length,152);
  assert.equal(new Set(combined.map(x=>x.word_id)).size,152);
  assert.equal(new Set(combined.map(x=>x.headword)).size,130);
});

test('two different senses of the same headword cannot share a mastered status based on spelling alone',()=>{
  const n=senses.find(x=>x.headword==='state'&&x.part_of_speech==='n.');
  const v=senses.find(x=>x.headword==='state'&&x.part_of_speech==='v.');
  const existingNovel={word_id:'old-story-state',headword:'state',
    part_of_speech:'n.',meaning_zh:'状态'};
  assert.equal(studyKey(n),studyKey(existingNovel));
  assert.notEqual(studyKey(v),studyKey(existingNovel));
  const oldDifferentSense={...existingNovel,meaning_zh:'州'};
  assert.notEqual(studyKey(n),studyKey(oldDifferentSense));
});
