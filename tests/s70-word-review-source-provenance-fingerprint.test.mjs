import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {composeRainyNightSeasonDraft} from "../scripts/compose-rainy-night-s1-full.mjs";
import {createVocabularyReviewQueue} from "../scripts/prepare-rainy-night-vocabulary-review.mjs";
import {verifyOfficial2016FormAudit} from "../scripts/check-rainy-night-official-2016-form-audit.mjs";
import {buildRainyNightTeachingTrackPlan} from "../scripts/plan-rainy-night-teaching-tracks.mjs";
import {buildRainyNightReviewLedger,validateRainyNightReviewLedger} from
 "../scripts/build-rainy-night-review-ledger.mjs";
import {evaluateRainyNightPublicationGate} from "../scripts/check-rainy-night-publishing-gate.mjs";
const {bundle}=composeRainyNightSeasonDraft();
const audit=JSON.parse(readFileSync(new URL(
 "../content/editorial/rainy-night-s1-official-2016-pdf-form-audit.json",import.meta.url),"utf8"));
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("S70 each real word signoff is tied to ALL source pronunciation candidates and official form evidence",()=>{
 const ledger=buildRainyNightReviewLedger(bundle);
 const queue=createVocabularyReviewQueue(bundle);
 const form=verifyOfficial2016FormAudit(bundle);
 const plan=buildRainyNightTeachingTrackPlan(bundle);
 const byCandidate=new Map(queue.rows.map(x=>[x.wordId,x]));
 const byTrack=new Map(plan.rows.map(x=>[x.wordId,x]));
 const byForm=new Map(audit.words.map(x=>[x.headword,x]));
 const wordRows=ledger.rows.filter(x=>x.kind==="word");
 assert.equal(wordRows.length,188);
 for(const word of bundle.words){
  const c=byCandidate.get(word.id),e=byForm.get(word.headword);
  assert.ok(c&&e);
  const payload={
   word,track:byTrack.get(word.id),candidateReview:c,
   formReview:e,
   sourceMetadata:{
    ukCandidateLicense:queue.overview.ukCandidateLicence,
    ukCandidateSha:queue.overview.ukCandidateSourceSha,
    usIpaCandidateSha:queue.overview.usIpaCandidateSourceSha,
    usArpaSourceHash:queue.overview.usArpaSourceHash,
    officialCET4SourceSha:form.sourceSha256,
    officialCET4ReviewStatus:form.status
   }
  };
  const sourceHash=digest(["word","word:"+word.id,payload]);
  assert.equal(wordRows.find(x=>x.id==="word:"+word.id)?.sourceHash,sourceHash);
 }
 assert.equal(ledger.rows.length,957);
 assert.equal(validateRainyNightReviewLedger(bundle,ledger).valid,true);
});

test("S70 changing UK gap source rights, US IPA variant or CET status makes previous record source hash invalid",()=>{
 const ledger=buildRainyNightReviewLedger(bundle);
 const q=createVocabularyReviewQueue(bundle),form=verifyOfficial2016FormAudit(bundle);
 const track=new Map(buildRainyNightTeachingTrackPlan(bundle).rows.map(x=>[x.wordId,x]));
 const word=bundle.words.find(w=>w.headword==="blurred");
 const candidate=q.rows.find(w=>w.wordId===word.id);
 const forms=audit.words.find(w=>w.headword==="blurred");
 assert.equal(candidate.sourceUkGapCommercialApproved,false);
 assert.ok(candidate.sourceUkGapReferenceUrl);
 assert.ok(candidate.sourceUsIpaCandidates);
 const source={word,track:track.get(word.id),candidateReview:candidate,formReview:forms,
  sourceMetadata:{ukCandidateLicense:q.overview.ukCandidateLicence,
   ukCandidateSha:q.overview.ukCandidateSourceSha,
   usIpaCandidateSha:q.overview.usIpaCandidateSourceSha,
   usArpaSourceHash:q.overview.usArpaSourceHash,
   officialCET4SourceSha:form.sourceSha256,officialCET4ReviewStatus:form.status}};
 const original=digest(["word","word:"+word.id,source]);
 assert.equal(ledger.rows.find(r=>r.id==="word:"+word.id).sourceHash,original);
 const changedRights=structuredClone(source);
 changedRights.candidateReview.sourceUkGapCommercialApproved=true;
 assert.notEqual(digest(["word","word:"+word.id,changedRights]),original);
 const changedUrl=structuredClone(source);
 changedUrl.candidateReview.sourceUkGapReferenceUrl="https://invalid.example";
 assert.notEqual(digest(["word","word:"+word.id,changedUrl]),original);
 const changedUs=structuredClone(source);
 changedUs.candidateReview.sourceUsIpaCandidates+=" | /UNREVIEWED-OTHER/";
 assert.notEqual(digest(["word","word:"+word.id,changedUs]),original);
 const changedForm=structuredClone(source);
 changedForm.formReview.formStatus="CET6_STARRED_HEADWORD_OR_FAMILY";
 assert.notEqual(digest(["word","word:"+word.id,changedForm]),original);
 const altered=structuredClone(ledger);
 altered.rows.find(r=>r.id==="word:"+word.id).sourceHash=digest(["word","word:"+word.id,changedRights]);
 const check=validateRainyNightReviewLedger(bundle,altered);
 assert.equal(check.valid,false);
 assert.ok(check.failures.some(x=>x.startsWith("SOURCE_FIELD_CHANGED:word:"+word.id)));
 assert.equal(evaluateRainyNightPublicationGate(bundle).status,"BLOCKED");
});
