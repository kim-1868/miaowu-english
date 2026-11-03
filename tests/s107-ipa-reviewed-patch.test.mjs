import test from "node:test";
import assert from "node:assert/strict";
import {reviewTemplate,validateReview,buildPrivateSql} from "../scripts/build-rainy-night-reviewed-ipa-patch.mjs";

test("Rainy Night all 188 IPA review entries are grounded to the exact private manuscript",()=>{
 const t=reviewTemplate();
 assert.equal(t.bookId,"rainy-night-archives-cet4-v1");
 assert.equal(t.rows.length,188);
 assert.equal(new Set(t.rows.map(x=>x.wordId)).size,188);
 assert.equal(t.rows.filter(x=>x.ukSourceCandidates.length===1&&x.usSourceCandidates.length===1).length,133);
 assert.equal(t.rows.filter(x=>x.ukSourceCandidates.length===0).length,7);
 assert.ok(t.rows.every(x=>!x.phoneticUk&&!x.phoneticUs&&x.commercialUseConfirmed===false));
});
test("Unreviewed or inconsistent IPA cannot produce SQL or commercial publication",()=>{
 const t=reviewTemplate();
 let r=validateReview(t);
 assert.equal(r.valid,false);
 assert.ok(r.totalErrors>=188);
 assert.throws(()=>buildPrivateSql(t),/IPA_REVIEW_NOT_APPROVED/);
 const altered=structuredClone(t);
 altered.rows[0].headword="altered";
 assert.ok(validateReview(altered).errors.some(x=>x.startsWith("SOURCE_ROW_CHANGED_")));
 const stale=structuredClone(t);
 stale.sourceDigest="0".repeat(64);
 assert.ok(validateReview(stale).errors.includes("SOURCE_CHANGED_REVIEW_AGAIN"));
 const duplicate=structuredClone(t);
 duplicate.rows[1].wordId=duplicate.rows[0].wordId;
 assert.ok(validateReview(duplicate).errors.some(x=>x.startsWith("DUPLICATE_")));
});
test("UK phonetic gap requires independently created/cleared content, never Cambridge reference copied automatically",()=>{
 const t=reviewTemplate();
 const gaps=t.rows.filter(x=>x.ukSourceCandidates.length===0);
 assert.equal(gaps.length,7);
 for(const entry of gaps){
  entry.ukProvenance="BRITFONE_MIT";
 }
 assert.equal(validateReview(t).valid,false);
 assert.ok(gaps.every(x=>validateReview(t).errors.includes("UNLICENSED_UK_GAP_"+x.headword))===false);
 // A representative gap is always caught, regardless of other empty fields.
 const errs=validateReview(t);
 assert.ok(errs.totalErrors>188);
});
