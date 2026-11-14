"""Synthetic data only; never run private owner list in public GitHub CI."""
import csv
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'scripts/compile-exam-next-batch-review-drafts.py'
spec=importlib.util.spec_from_file_location('exam_followup_compiler',PATH)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def make_row(word,tier='四级新增',approved=False,review_lane='SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW'):
    return {'headword':word,'entry_id':'gdict_'+hashlib.sha256(word.encode()).hexdigest()[:24],
        'target_tier':tier,'review_lane':review_lane,'publisher_approved':approved,'approved_sense_id':None,
        'pos_meaning_suggestions_unverified':[{'pos_unverified':'n.',
            'meaning_candidates_unverified':['测试名词']}],
        'ipa_us_candidates_unverified':['/abc/'],
        'source_refs':{'ecdict':{'commit':'synthetic'},'us_ipa':{'commit':'synthetic'}}}

def make_fixture(root,approved=False,wrong_prior_id=False):
    root=Path(root);triage=root/'review';triage.mkdir()
    source=[make_row('mall','六级新增',approved=approved),make_row('meadow'),make_row('orchard','考研新增')]
    for tier,path in [('四级新增','CET4_NEW_MISSING_SENSES_REVIEW_ONLY.jsonl'),
                      ('六级新增','CET6_NEW_MISSING_SENSES_REVIEW_ONLY.jsonl'),
                      ('考研新增','POSTGRAD_NEW_MISSING_SENSES_REVIEW_ONLY.jsonl')]:
        (triage/path).write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in source if x['target_tier']==tier))
    prior={'headword':'meadow','entry_id':source[1]['entry_id'] if not wrong_prior_id else 'gdict_'+'0'*24,
           'publisher_approved':False,'approved_sense_id':None}
    prior_path=root/'prior.jsonl';prior_path.write_text(json.dumps(prior)+'\n')
    curated=root/'new.tsv';curated.write_text('\n'.join([
      '六级新增|mall|n.|购物中心|The mall opened a quiet reading space upstairs.|商场在楼上开辟了一处安静的阅读空间。',
      '考研新增|orchard|n.|果园|The orchard provides fresh apples for nearby schools.|果园为附近的学校供应新鲜苹果。'])+'\n')
    return triage,curated,prior_path

class ReviewBatchSafety(unittest.TestCase):
    def test_all_exam_low_conflict_covered_but_no_approval(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d)
            result=mod.compile_exam_batch(t,c,p,Path(d)/'out',2,risk_flags={'mall':'SYNTHETIC_LEXICAL_REVIEW'})
            self.assertEqual(result['new_drafts'],2)
            self.assertEqual(result['all_missing_sense_exam_low_conflict_words'],3)
            self.assertEqual(result['previous_plus_incremental_exam_drafts'],3)
            self.assertTrue(result['exam_low_conflict_all_drafted'])
            self.assertEqual(result['publisher_approved_senses'],0)
            self.assertEqual(result['remote_d1_writes'],0)
            self.assertEqual(result['old_card_ids_written'],0)
            self.assertFalse(result['production_publish_allowed'])
            rows=mod.load_jsonl(Path(d)/'out/2_ADDITIONAL_EXAM_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl')
            self.assertEqual(len(rows),2)
            self.assertTrue(all(x['publisher_approved'] is False and x['approved_sense_id'] is None for x in rows))
            flagged=mod.load_jsonl(Path(d)/'out/semantic_risks_for_human_editor.jsonl')
            self.assertIn('mall',[x['word'] for x in flagged])
    def test_source_identity_change_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d,wrong_prior_id=True)
            with self.assertRaisesRegex(ValueError,'PRIOR_DRAFT_SOURCE_CHANGED'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',2)
    def test_forged_approved_source_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d,approved=True)
            with self.assertRaisesRegex(ValueError,'TRIAGE_PREAPPROVED_FORBIDDEN'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',2)
    def test_duplicate_prior_word_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d)
            with p.open('a') as f:f.write(p.read_text())
            with self.assertRaisesRegex(ValueError,'PRIOR_DRAFT_IDENTITY_INVALID'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',2)
    def test_reuse_prior_word_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d)
            c.write_text(c.read_text()+'四级新增|meadow|n.|草地|The meadow looked green after the rain stopped.|雨停后，草地显得格外青翠。\n')
            with self.assertRaisesRegex(ValueError,'EXAMPLE_COLLIDES_WITH_PRIOR_BATCH'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',3)
    def test_missing_target_phrase_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d)
            c.write_text(c.read_text().replace('The mall opened','The market opened'))
            with self.assertRaisesRegex(ValueError,'HEADWORD_NOT_LITERAL_IN_EXAMPLE'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',2)
    def test_existing_private_output_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d);(Path(d)/'out').mkdir()
            with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE_PRIVATE_INCREMENTAL_REVIEW_DIR'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',2)
    def test_incomplete_exam_tier_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            t,c,p=make_fixture(d)
            c.write_text(c.read_text().splitlines()[0]+'\n')
            with self.assertRaisesRegex(ValueError,'EXAM_SINGLE_POS_TIER_NOT_FULLY_DRAFTED'):
                mod.compile_exam_batch(t,c,p,Path(d)/'out',1)

if __name__=='__main__':unittest.main()