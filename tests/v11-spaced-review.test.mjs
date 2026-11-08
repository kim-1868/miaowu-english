import {test} from "node:test";
import assert from "node:assert/strict";
import {REVIEW_STEPS_DAYS,learningDayKey,scheduleFirstActiveLearning,
 scheduleRecallFeedback,dueToday,nextReviewDays} from "../src/spaced-review.js";
const t=s=>new Date(s);
test("V1.1 P4 approved progression is 1,3,7,14,30 days",()=>{
 assert.deepEqual(REVIEW_STEPS_DAYS,[1,3,7,14,30]);
 assert.equal(nextReviewDays(4),30);
 assert.equal(nextReviewDays(44),30);
 assert.equal(nextReviewDays(-1),1);
});
test("V1.1 initial active learning is due tomorrow, not mastered",()=>{
 const now=t("2026-11-06T08:00:00Z");
 const plan=scheduleFirstActiveLearning({},now);
 assert.equal(plan.stageIndex,0);
 assert.equal(plan.mastered,false);
 assert.equal(plan.dueAt,"2026-11-07T08:00:00.000Z");
 assert.equal(dueToday(plan,now),false);
 assert.equal(dueToday(plan,t("2026-11-07T08:00:01Z")),true);
 assert.deepEqual(scheduleFirstActiveLearning(plan,now),plan);
});
test("V1.1 sustained correct answers progress only when due, capped at 30 days",()=>{
 let plan=scheduleFirstActiveLearning({},t("2026-10-01T01:00:00Z"));
 const expected=[3,7,14,30,30,30];
 for(const days of expected){
  const at=t(plan.dueAt);
  const result=scheduleRecallFeedback(plan,"correct",at);
  assert.equal(result.dueAt,new Date(at.getTime()+days*86400000).toISOString());
  assert.equal(result.mastered,false);
  plan=result;
 }
});
test("V1.1 same-day repeated correct cannot infinitely postpone due, even cross modes",()=>{
 const at=t("2026-11-06T08:00:00Z");
 let plan=scheduleRecallFeedback({stageIndex:0,dueAt:"2026-11-06T02:00:00Z"},"correct",at);
 assert.equal(plan.stageIndex,1);
 const due=plan.dueAt;
 plan=scheduleRecallFeedback(plan,"correct",t("2026-11-06T12:00:00Z"));
 assert.equal(plan.stageIndex,1);
 assert.equal(plan.dueAt,due);
 const next=learningDayKey(t("2026-11-07T08:00:00Z"));
 assert.notEqual(next,learningDayKey(at));
 const early=scheduleRecallFeedback(plan,"correct",t("2026-11-07T08:00:00Z"));
 assert.equal(early.stageIndex,1,"early practice cannot promote not-due word");
});
test("V1.1 error brings earlier practice without resetting explicit mastery",()=>{
 const before={stageIndex:4,dueAt:"2026-12-01T09:00:00Z",mastered:false};
 const after=scheduleRecallFeedback(before,"incorrect",t("2026-11-06T09:00:00Z"));
 assert.equal(after.stageIndex,3);
 assert.equal(after.dueAt,"2026-11-07T09:00:00.000Z");
 const hard=scheduleRecallFeedback({stageIndex:0,dueAt:"2026-12-01T00:00:00Z"},"incorrect",t("2026-11-06T09:00:00Z"));
 assert.equal(hard.stageIndex,0);
 assert.equal(hard.dueAt,"2026-11-06T10:00:00.000Z");
 const mastered={...before,mastered:true,dueAt:null};
 const changed=scheduleRecallFeedback(mastered,"incorrect",t("2026-11-06T09:00:00Z"));
 assert.equal(changed.mastered,true);
 assert.equal(changed.dueAt,null);
});
test("V1.1 learning day is consistent with China time across devices",()=>{
 assert.equal(learningDayKey("2026-11-06T15:59:59Z"),"2026-11-06");
 assert.equal(learningDayKey("2026-11-06T16:00:00Z"),"2026-11-07");
 assert.throws(()=>scheduleRecallFeedback({},"known"),/INVALID_REVIEW_FEEDBACK/);
});
