import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCET4DraftCoverage} from '../scripts/build-cet4-review-worklist.mjs';

const header='涉及考试,首现层级,单词,音标,词性,中文释义,COCA词频frq,BNC词频';
const source=header+'\n'+[
  '高考，四级,高考,require,rɪkwaɪə,v:100,vt. 需要,446,411',
  '四级,四级,organize,ɔ:gənaiz,v:100,vt. 组织,1643,2000',
  '四级,四级,proposal,prəpəuzəl,n:100,n. 提案,1625,1800'
].join('\n')+'\n';
const valid={
  word_id:'sv_cet4_organize',category_slug:'cet4',headword:'organize',
  part_of_speech:'v.',meaning_zh:'组织',phonetic_uk:'/ˈɔːɡənaɪz/',
  example_en:'They organize a book fair every spring.',
  example_zh:'他们每年春天都会组织书展。',
  frequency_rank:1643,frequency_source:'COCA',source_first_tier:'四级',reviewed:false
};
test('separate new and draft word counts without pretending current published coverage',()=>{
  const res=auditCET4DraftCoverage(source,[valid]);
  assert.equal(res.status,'READ_ONLY_NO_RELEASE');
  assert.equal(res.totalSourceHeadwords,3);
  assert.equal(res.draftHeadwords,1);
  assert.equal(res.pendingHeadwords,2);
  assert.equal(res.approvedForSale,0);
  assert.deepEqual(res.draftTiers,{firstCET4:1,firstHighSchool:0});
  assert.deepEqual(res.pendingTiers,{firstCET4:1,firstHighSchool:1});
  assert.equal(res.review[0].stage,'DRAFT_NEEDS_EDITORIAL_SIGNOFF');
  assert.equal(res.backlog.every(x=>x.stage==='NO_DRAFT_YET'),true);
  assert.equal(res.draftIssues.length,0);
});
test('wrong or invented rank is diagnosed as a publication blocker',()=>{
  const res=auditCET4DraftCoverage(source,[{...valid,frequency_rank:99999}]);
  assert.equal(res.draftIssues[0].type,'SOURCE_FREQUENCY_MISMATCH');
});
test('duplicate draft headword cannot be double-counted',()=>{
  assert.throws(()=>auditCET4DraftCoverage(source,[valid,valid]),/CET4_DRAFT_HEADWORD_COLLISION/);
});
test('unrelated exam or nonexistent CET4 headword is rejected rather than silently imported',()=>{
  assert.equal(auditCET4DraftCoverage(source,[{...valid,category_slug:'cet6'}]).draftHeadwords,0);
  assert.throws(()=>auditCET4DraftCoverage(source,[{...valid,headword:'alien'}]),/DRAFT_NOT_IN_SOURCE/);
});
test('drafts cannot change a source tier or stable candidate IDs without review',()=>{
  const swapped=auditCET4DraftCoverage(source,[{...valid,source_first_tier:'高考'}]);
  assert.equal(swapped.draftIssues[0].type,'SOURCE_TIER_MISMATCH');
  assert.throws(()=>auditCET4DraftCoverage(source,[{...valid,word_id:'word-without-source'}]),
    /CET4_DRAFT_ID_MISMATCH/);
});
test('a JSONL draft reviewed=true must never be promoted by source report',()=>{
  const r=auditCET4DraftCoverage(source,[{...valid,reviewed:true}]);
  assert.equal(r.approvedForSale,0);
  assert.equal(r.draftIssues[0].type,'CANNOT_ASSUME_REVIEW_FROM_DRAFT_FILE');
});
