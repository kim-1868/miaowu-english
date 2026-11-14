import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCET4MorphologyCandidates}
  from '../scripts/build-cet4-morphology-candidates.mjs';

const header='单词,涉及考试,词形变化';
const csv=header+'\n'+
 'state,四级,s:states/p:stated/d:stated/3:states/i:stating\n'+
 'base,四级,s:bases/d:based/i:basing\n'+
 'basis,高考，四级,s:bases\n'+
 'go,高考,p:went/d:gone/3:goes/i:going\n'+
 'went,六级,\n'+
 'play,六级,p:played/d:played/3:plays/i:playing\n'+
 'rating,四级,s:ratings\n';

test('directly reuses exchange field instead of attempting to invent inflections',()=>{
 const r=buildCET4MorphologyCandidates(csv);
 assert.equal(r.status,'OFFLINE_ONLY_DO_NOT_AUTOLINK');
 assert.equal(r.counts.sourceHeadwords,7);
 assert.equal(r.counts.cet4Headwords,4);
 assert.equal(r.counts.cet4WithExchange,4);
 assert.ok(r.candidates.some(x=>x.form==='stated'&&x.headword==='state'));
 assert.ok(r.candidates.some(x=>x.form==='stating'&&x.headword==='state'));
 assert.ok(r.candidates.every(x=>x.status==='NEEDS_CONTEXT_VALIDATION'));
});

test('same inflected spelling that maps to two distinct base words is never automatically matched',()=>{
 const r=buildCET4MorphologyCandidates(csv);
 assert.ok(r.needsReview.some(x=>x.form==='bases'&&
   x.allSourceTargets.includes('base')&&x.allSourceTargets.includes('basis')));
 assert.equal(r.candidates.some(x=>x.form==='bases'),false);
});

test('inflection that is itself another dictionary headword cannot be silently auto-linked',()=>{
 const r=buildCET4MorphologyCandidates(csv);
 assert.equal(r.candidates.some(x=>x.form==='went'),false);
 assert.equal(r.needsReview.some(x=>x.form==='went'),false);
 const src=header+'\n'+'lead,四级,p:led/d:led\n'+'led,高考,\n';
 const y=buildCET4MorphologyCandidates(src);
 assert.ok(y.needsReview.some(x=>x.form==='led'&&
   x.reason==='ALSO_A_DICTIONARY_HEADWORD'));
});

test('non-CET4 headwords do not pollute CET4 form candidates',()=>{
 const r=buildCET4MorphologyCandidates(csv);
 assert.equal(r.candidates.some(x=>x.headword==='play'),false);
});

test('invalid exchange codes, impossible shapes and duplicate lemmas fail closed',()=>{
 const d=header+'\n'+'work,四级,p:worked/x:suspicious/s:s\n';
 const result=buildCET4MorphologyCandidates(d);
 assert.deepEqual(result.candidates.map(x=>x.form),['worked']);
 assert.ok(result.counts.excludedInvalidOrUnsupported>=2);
 assert.throws(()=>buildCET4MorphologyCandidates(header+'\nwork,四级,\nwork,六级,\n'),/DUPLICATE_HEADWORD/);
 assert.throws(()=>buildCET4MorphologyCandidates('单词,词形变化\nwork,s:works\n'),/MISSING_COLUMN/);
});

test('no forms can be trusted solely because the source has a single candidate',()=>{
 const result=buildCET4MorphologyCandidates(csv);
 assert.match(result.safety,/contextual editorial review/i);
 assert.equal(result.candidates.every(x=>x.status!=='APPROVED'),true);
});
