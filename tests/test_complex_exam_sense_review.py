"""Synthetic-only regression; no owner list, real novels, private IDs or D1."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
from hashlib import sha256
S=Path(__file__).resolve().parents[1]/'scripts/plan-complex-exam-sense-review.py'
spec=importlib.util.spec_from_file_location('complexreview',S);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def source(w,tier,flag, lane='POLYSEMY_OR_PRONUNCIATION_REVIEW',rank=1):
    return {'schema':'wordletter-missing-sense-review-hints-v1','headword':w,
      'entry_id':'gdict_'+sha256(w.encode()).hexdigest()[:24], 'target_tier':tier,
      'owner_rank':rank,'review_lane':lane,'risk_flags':flag,
      'pos_meaning_suggestions_unverified':[{'pos_unverified':'n.','meaning_candidates_unverified':['样本']}],
      'ipa_us_candidates_unverified':['/a/','/b/'] if flag==['MULTIPLE_US_PRONUNCIATIONS'] else ['/a/'],
      'source_history_present':False,'publisher_approved':False,'teaching_ready':False,
      'publication_ready':False,'approved_sense_id':None}

def write(p,items):
    p.mkdir()
    for tier,f in mod.NAMES.items():
        (p/f).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in items if row['target_tier']==tier),encoding='utf-8')

class TestComplexReview(unittest.TestCase):
    def cases(self):
        return [source('alpha','四级新增',['MULTIPLE_US_PRONUNCIATIONS'],rank=1),
                source('beta','六级新增',['MULTIPLE_POS_REVIEW'],rank=2),
                source('gamma','考研新增',['MULTIPLE_CHINESE_TRANSLATIONS_REVIEW'],rank=3),
                source('delta','基础',['US_IPA_MISSING'],lane='SOURCE_GAP_OR_SPECIAL_REVIEW',rank=4),
                source('epsilon','基础',[],lane='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW',rank=5)]
    def test_partition_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);write(d/'in',self.cases());report=mod.run(d/'in',d/'out',fixture=True)
            self.assertEqual(report['scheduled_complex_headwords'],4)
            self.assertEqual(report['already_handled_low_conflict_drafts_excluded'],1)
            self.assertEqual(report['cohorts']['P1_IPA_VARIANT_ONLY_MACHINE_FLAGS'],1)
            rows=[json.loads(x) for x in (d/'out/P1_IPA_VARIANT_ONLY_MACHINE_FLAGS.jsonl').read_text().splitlines()]
            self.assertTrue(rows[0]['human_editorial_review_required'])
            self.assertFalse(rows[0]['publisher_approved'])
            self.assertIsNone(rows[0]['approved_sense_id'])
            self.assertEqual(report['remote_d1_writes'],0)
    def test_reject_duplicate_headword(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);rows=self.cases();rows[1]['headword']='alpha';write(d/'in',rows)
            with self.assertRaisesRegex(ValueError,'UNSAFE_OR_DUPLICATE'):mod.run(d/'in',d/'out',fixture=True)
    def test_reject_modified_identity(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);rows=self.cases();rows[0]['entry_id']='gdict_'+'a'*24;write(d/'in',rows)
            with self.assertRaisesRegex(ValueError,'ENTRY_IDENTITY_CHANGED'):mod.run(d/'in',d/'out',fixture=True)
    def test_reject_publisher_fake_or_old_data(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);rows=self.cases();rows[0]['publisher_approved']=True;write(d/'in',rows)
            with self.assertRaisesRegex(ValueError,'UNSAFE_OR_DUPLICATE'):mod.run(d/'in',d/'out',fixture=True)
    def test_reject_wrong_tier_file(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);rows=self.cases();rows[0]['target_tier']='基础';write(d/'in',rows)
            # not an error because write places it in corresponding tier; intentionally tamper the filename.
            p=d/'in';file=p/mod.NAMES['基础']; other=p/mod.NAMES['四级新增'];other.write_text(file.read_text());file.write_text('')
            with self.assertRaisesRegex(ValueError,'CROSS_TIER'):mod.run(p,d/'out',fixture=True)
    def test_reject_unknown_risk(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);rows=self.cases();rows[0]['risk_flags']=['SILENT_AUTO_APPROVED'];write(d/'in',rows)
            with self.assertRaisesRegex(ValueError,'UNSAFE_OR_DUPLICATE'):mod.run(d/'in',d/'out',fixture=True)
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as t:
            d=Path(t);write(d/'in',self.cases());(d/'out').mkdir()
            with self.assertRaisesRegex(ValueError,'INPUT_MISSING_OR_OUTPUT_EXISTS'):mod.run(d/'in',d/'out',fixture=True)

if __name__=='__main__':unittest.main()