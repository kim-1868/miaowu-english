import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileCET4SignedOffSQL} from '../scripts/build-cet4-approved-staging-package.mjs';

const drafts=readFileSync(new URL('../content/lexicon/cet4-priority-draft-batch-20261110.jsonl',import.meta.url),'utf8')
  .trim().split(/\r?\n/u).map(JSON.parse);
const sample={
  word_id:'sv_cet4_confirm',category_slug:'cet4',headword:'confirm',
  phonetic_uk:'/kənˈfɜːm/',part_of_speech:'v.',meaning_zh:'确认',
  example_en:'Please confirm the meeting date before Friday.',
  example_zh:'请在周五前确认会议日期。',
  frequency_rank:1851,frequency_source:'COCA',
  reviewed:true,editorial_approved_by:'CET4 Editor',
  editorial_approved_at:'2026-11-10',ipa_verified:true,
  example_reviewed:true,meaning_reviewed:true
};

test('no CET4 raw source or draft card may be converted into an approved import automatically',()=>{
  assert.throws(()=>compileCET4SignedOffSQL(drafts,{previewOnly:true}),/EDITORIAL_APPROVAL_REQUIRED/);
  assert.throws(()=>compileCET4SignedOffSQL([{...sample,ipa_verified:false}],{previewOnly:true}),/EDITORIAL_APPROVAL_REQUIRED/);
  assert.throws(()=>compileCET4SignedOffSQL([{...sample,reviewed:false}],{previewOnly:true}),/EDITORIAL_APPROVAL_REQUIRED/);
});

test('even a manually approved one-card batch cannot claim the complete 3849-headword CET4 exam library',()=>{
  assert.throws(()=>compileCET4SignedOffSQL([sample]),/CET4_NOT_COMPLETE_1_OF_3849/);
});

test('authorized staging preview SQL cannot change any live learning, purchase or novel data',()=>{
  const v=compileCET4SignedOffSQL([sample],{previewOnly:true});
  assert.equal(v.cards,1);
  assert.equal(v.enabled,false);
  assert.match(v.sql,/BEGIN TRANSACTION;/);
  assert.match(v.sql,/INSERT INTO words/);
  assert.match(v.sql,/INSERT INTO smart_vocab_catalog/);
  assert.match(v.sql,/enabled\) VALUES\(/);
  assert.match(v.sql,/NULL,0\) ON CONFLICT/);
  assert.doesNotMatch(v.sql,/(?:INSERT INTO|UPDATE|DELETE FROM) (?:user_words|review_events|entitlements|reading_progress|chapter_words)/i);
  assert.doesNotMatch(v.sql,/DROP TABLE|ALTER TABLE/i);
  assert.doesNotMatch(v.sql,/UPDATE smart_vocab_levels SET enabled=1/);
});

test('unranked abbreviations compile with NULL frequency without inventing any number',()=>{
  const v=compileCET4SignedOffSQL([{...sample,word_id:'sv_cet4_i_e',headword:'i.e.',
    part_of_speech:'abbr.',meaning_zh:'也就是说',
    example_en:'The seminar is virtual, i.e. it takes place online.',
    example_zh:'这场研讨会是线上的，也就是说通过网络举行。',
    frequency_rank:null,frequency_source:'UNRANKED',frequency_available:0
  }],{previewOnly:true});
  assert.match(v.sql,/'UNRANKED',0,1\)/);
  assert.match(v.sql,/'sv_cet4_i_e',NULL,'UNRANKED'/);
  assert.doesNotMatch(v.sql,/'sv_cet4_i_e',1851,'UNRANKED'/);
});

test('mismatched level, duplicate IDs and missing teacher signoff cannot enter staging',()=>{
  assert.throws(()=>compileCET4SignedOffSQL([{...sample,category_slug:'cet6'}],{previewOnly:true}),/MIXED_EXAM_CARD/);
  assert.throws(()=>compileCET4SignedOffSQL([sample,sample],{previewOnly:true}),/DUPLICATE_WORD_ID/);
  assert.throws(()=>compileCET4SignedOffSQL([{...sample,editorial_approved_by:''}],{previewOnly:true}),/EDITORIAL_APPROVAL_REQUIRED/);
});

test('CET4 staging rejects combining two meanings in a single otherwise signed card',()=>{
  assert.throws(()=>compileCET4SignedOffSQL([{
    ...sample,meaning_zh:'确认；证实'
  }],{previewOnly:true}),/CET4_MULTIPLE_SENSES_NEED_SPLIT/);
});
