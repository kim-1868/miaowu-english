"""Synthetic fixtures only. Never upload private owner exam terms to CI."""
import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/'scripts/compile-exam-base-remaining-review-drafts.py'
spec=importlib.util.spec_from_file_location('base_compiler',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def row(word,tier='基础',approved=False):
 return {'headword':word,'entry_id':'gdict_'+hashlib.sha256(word.encode()).hexdigest()[:24],
   'target_tier':tier,'review_lane':'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW',
   'publisher_approved':approved,'approved_sense_id':None,'ipa_us_candidates_unverified':['/xyz/'],
   'pos_meaning_suggestions_unverified':[{'pos_unverified':'n.','meaning_candidates_unverified':['测试中文']}],
   'source_refs':{'ecdict':{'commit':'synthetic'},'us_ipa':{'commit':'synthetic'}}}

def fixture(td,source_approved=False):
 root=Path(td);triage=root/'triage';triage.mkdir()
 rows=[row('garden'),row('harbor'),row('meadow','四级新增',approved=source_approved)]
 (triage/'BASIC_MISSING_SENSES_REVIEW_ONLY.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in rows[:2]))
 (triage/'CET4_NEW_MISSING_SENSES_REVIEW_ONLY.jsonl').write_text(json.dumps(rows[2])+'\n')
 prior1=root/'prior1.jsonl';prior2=root/'prior2.jsonl'
 prior1.write_text(json.dumps({'headword':'garden','entry_id':rows[0]['entry_id'],'publisher_approved':False,'approved_sense_id':None,'example_en_draft':'The garden was full of flowers this spring.'})+'\n')
 prior2.write_text(json.dumps({'headword':'meadow','entry_id':rows[2]['entry_id'],'publisher_approved':False,'approved_sense_id':None,'example_en_draft':'The meadow was green after the rain stopped.'})+'\n')
 curated=root/'extra.tsv';curated.write_text('基础|harbor|n.|港口|The harbor was quiet after the fishing boats returned.|渔船回来之后，港口变得很安静。\n')
 return triage,curated,[prior1,prior2]

class BaseLastBatchQA(unittest.TestCase):
 def test_final_batch_no_publisher_signoff_and_no_d1(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);x=m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
   self.assertEqual(x['all_low_conflict_drafts'],3)
   self.assertEqual(x['remaining_low_conflict_words_without_examples'],0)
   self.assertEqual(x['publisher_approved_senses'],0)
   self.assertEqual(x['production_or_staging_d1_writes'],0)
   self.assertFalse(x['commercial_release_ready'])
   out=m.load(Path(d)/'out/1_REMAINING_BASIC_ORIGINAL_EXAMPLES_DRAFT_NOT_APPROVED.jsonl')
   self.assertEqual(out[0]['approved_sense_id'],None)
   self.assertFalse(out[0]['publisher_approved'])
 def test_no_replacement_of_existing_private_output(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);(Path(d)/'out').mkdir()
   with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE_PRIVATE_REVIEW'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_forged_source_approval_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d,True)
   with self.assertRaisesRegex(ValueError,'SOURCE_PREAPPROVED_FORBIDDEN'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_source_entry_identity_unchanged(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d)
   r=json.loads(p[0].read_text());r['entry_id']='gdict_'+'0'*24;p[0].write_text(json.dumps(r)+'\n')
   with self.assertRaisesRegex(ValueError,'PRIOR_DRAFT_DUPLICATE_OR_IDENTITY_MISMATCH'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_prior_draft_duplicates_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);p[1].write_text(p[0].read_text())
   with self.assertRaisesRegex(ValueError,'PRIOR_DRAFT_DUPLICATE_OR_IDENTITY_MISMATCH'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_missing_basic_draft_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);c.write_text('')
   with self.assertRaisesRegex(ValueError,'BASIC_DRAFT_ROW_COUNT_DUPLICATE_OR_DRIFT'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_example_not_containing_word_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);c.write_text(c.read_text().replace('The harbor was','The city was'))
   with self.assertRaisesRegex(ValueError,'HEADWORD_NOT_LITERAL_IN_EXAMPLE'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_duplicate_english_sentence_across_batches_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d)
   prior=json.loads(p[0].read_text());prior['example_en_draft']='The harbor was quiet after the fishing boats returned.';p[0].write_text(json.dumps(prior)+'\n')
   with self.assertRaisesRegex(ValueError,'DUPLICATE_ORIGINAL_EXAMPLE_SENTENCE_ACROSS_BATCHES'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)
 def test_exam_batch_must_appear_in_prior(self):
  with tempfile.TemporaryDirectory() as d:
   t,c,p=fixture(d);p[1].write_text('')
   with self.assertRaisesRegex(ValueError,'EXAM_SINGLE_POS_COVERAGE_NOT_CARRIED_FORWARD'):
    m.compile_remaining_basic(t,c,p,Path(d)/'out',1)

if __name__=='__main__':unittest.main()