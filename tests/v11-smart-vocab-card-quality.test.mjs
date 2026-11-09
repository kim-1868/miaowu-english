import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSmartWordCard,summarizeSmartCardAudit}
  from '../src/smart-vocab-card-quality.js';

const rows=readFileSync(new URL('../content/lexicon/smart-vocab-pilot-20-review.jsonl',import.meta.url),'utf8')
  .trim().split(/\r?\n/u).map(x=>JSON.parse(x));
const base={
  word_id:'sv_cet4_clarify',headword:'clarify',category_slug:'cet4',
  part_of_speech:'v.',meaning_zh:'澄清',
  phonetic_uk:'/ˈklærɪfaɪ/',example_en:'Could you clarify your question?',
  example_zh:'你能把问题说清楚吗？',
  frequency_rank:5050,frequency_source:'COCA',reviewed:false
};
test('all twenty pilot drafts pass structural checks but none can be published automatically',()=>{
  const result=summarizeSmartCardAudit(rows);
  assert.equal(result.total,20);
  assert.equal(result.structurallyReady,20);
  assert.equal(result.commerciallyApproved,0);
  assert.deepEqual(result.errors,{});
});
test('authentic reviewed content needs a separate manual signoff',()=>{
  const draft=auditSmartWordCard(base);
  assert.equal(draft.structurallyReady,true);
  assert.equal(draft.commerciallyApproved,false);
  assert.equal(auditSmartWordCard({...base,reviewed:true}).commerciallyApproved,true);
});
test('reject any missing or placeholder translation and unnatural empty examples',()=>{
  for(const change of [
    {example_en:'Example here.'},{example_zh:'待补充'},{example_zh:''},
    {example_en:'Hello.'},{example_en:'See https://example.com for more.'}
  ])assert.equal(auditSmartWordCard({...base,...change}).structurallyReady,false);
});
test('do not accept ECDICT technical labels as teaching meanings',()=>{
  const res=auditSmartWordCard({...base,meaning_zh:'vt. 澄清；[计] 处理'});
  assert.equal(res.structurallyReady,false);
  assert.ok(res.errors.includes('DICTIONARY_ARTIFACT'));
});
test('invalid parts of speech or missing pronunciation block publication',()=>{
  for(const item of [
    {...base,part_of_speech:''},{...base,part_of_speech:'v:100'},
    {...base,phonetic_uk:''},{...base,phonetic_uk:'?'}
  ])assert.equal(auditSmartWordCard(item).structurallyReady,false);
});
test('reject an imaginary exam-frequency rank and broken IDs',()=>{
  for(const change of [
    {frequency_rank:0},{frequency_source:'MADE_UP'},
    {frequency_source:'POSTGRAD_EXAM',frequency_available:false},
    {word_id:'../../bad'}
  ])assert.equal(auditSmartWordCard({...base,...change}).structurallyReady,false);
});
test('inflected target words are a review warning, not a false rejection',()=>{
  const x=auditSmartWordCard({...base,example_en:'She clarified her position calmly.'});
  assert.equal(x.structurallyReady,true);
  assert.ok(x.warnings.includes('EXAMPLE_TARGET_FORM_REVIEW'));
});
