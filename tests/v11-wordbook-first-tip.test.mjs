import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordbookFirstTip} from '../public/wordbook-first-tip.js';
const storage=()=>{const d=new Map();return {getItem:k=>d.get(k),setItem:(k,v)=>d.set(k,v),d};};
test('not shown before smart vocabulary is ready',()=>{
  assert.equal(createWordbookFirstTip({storage:storage(),username:'alice',smartReady:false}).shouldShow(),false);
});
test('first entry displays once and remembers user dismissal',()=>{
  const s=storage(),hint=createWordbookFirstTip({storage:s,username:'alice',smartReady:true});
  assert.equal(hint.shouldShow(),true);
  assert.equal(hint.dismiss(),true);
  assert.equal(hint.shouldShow(),false);
});
test('existing three-card onboarding flow is not interrupted',()=>{
  const hint=createWordbookFirstTip({storage:storage(),username:'alice',smartReady:true,onboardingPending:true});
  assert.equal(hint.shouldShow(),false);
});
test('different signed-in users have separate first-use hints',()=>{
  const s=storage();
  const a=createWordbookFirstTip({storage:s,username:'alice',smartReady:true});
  const b=createWordbookFirstTip({storage:s,username:'bob',smartReady:true});
  a.dismiss();assert.equal(a.shouldShow(),false);assert.equal(b.shouldShow(),true);
});
test('unavailable local storage never breaks the wordbook page',()=>{
  const s={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
  const hint=createWordbookFirstTip({storage:s,username:'alice',smartReady:true});
  assert.equal(hint.shouldShow(),false);assert.equal(hint.dismiss(),false);
});
