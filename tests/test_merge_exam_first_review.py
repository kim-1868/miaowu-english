import json, pathlib, tempfile, unittest, importlib.util
script = pathlib.Path(__file__).resolve().parents[1] / 'scripts/merge-exam-first-review-candidates.py'
if not script.exists():
    script = pathlib.Path(__file__).with_name('merge_exam_first_review.py')
spec = importlib.util.spec_from_file_location('review_join', script)
review_join = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review_join)
plan, write_worklist = review_join.plan, review_join.write_worklist

class MergeTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.p=pathlib.Path(self.temp.name)
        self.w('t',[{'headword':'record','entry_id':'gdict_123','target_tier':'六级新增','priority_order':1,'teaching_sense_approved':False,'publication_ready':False},{'headword':'apple','entry_id':'gdict_234','target_tier':'基础','priority_order':2,'teaching_sense_approved':False,'publication_ready':False}])
        self.h=[{'headword':'record','entry_id':'gdict_123','candidate_hash_sha256':'a'*64,'old_word_ids':['old1'],'part_of_speech':'n.','meaning_zh':'记录','first_phase_target':True,'review_priority_lane':'多义音标等·专项审查','publisher_approved':False,'approved_sense_id':None,'example_candidates':[]}]
        self.w('h',self.h)
        self.w('d',[{'headword':'record','entry_id':'gdict_123','candidate_hash_sha256':'a'*64,'original_example_en_draft':'Keep a record.','original_example_zh_draft':'保存记录。','publisher_approved':False,'reviewer_approved':False,'approved_sense_id':None}])
    def tearDown(self):self.temp.cleanup()
    def w(self,key,data):
        (self.p/key).write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in data))
    def run_plan(self,s=None):
        return plan(self.p/'t',self.p/'h',self.p/'d',self.p/s if s else None)
    def test_lifecycle(self):
        items,summary=self.run_plan();self.assertEqual(summary['target_headwords'],2)
        self.assertEqual(summary['historical_first_phase_senses'],1)
        self.assertEqual(summary['headwords_without_historical_senses'],1)
        self.assertEqual(summary['approved_senses'],0)
        self.assertIsNone(items[0]['approved_sense_id'])
        self.assertEqual(items[0]['historical_sense_candidates'][0]['old_word_ids'],['old1'])
        self.assertEqual(items[0]['historical_sense_candidates'][0]['editorial_example_en_draft'],'Keep a record.')
        write_worklist(self.p/'out',items,summary)
        self.assertEqual(len(list((self.p/'out/batch').glob('*.jsonl'))),1)
        with self.assertRaisesRegex(ValueError,'PRIVATE_OUTPUT_EXISTS_NO_OVERWRITE'):
            write_worklist(self.p/'out',items,summary)
    def test_sources_candidate_only(self):
        self.w('s',[{'headword':word,'entry_id':eid,'teaching_ready':False,'publisher_approved':False,'publication_ready':False,'sense_id':None,'ecdict':{'raw_chinese_meanings_unverified':'sample'},'phonetic_us_candidates_unverified':['/a/']} for word,eid in [('record','gdict_123'),('apple','gdict_234')]])
        items,summary=self.run_plan('s')
        self.assertEqual(summary['headwords_with_pinned_opensource_candidates'],2)
        self.assertEqual(items[0]['source_ipa_us_unverified'],['/a/'])
    def test_source_preapproved_blocks(self):
        self.w('s',[{'headword':'record','entry_id':'gdict_123','teaching_ready':True,'publisher_approved':False,'publication_ready':False,'sense_id':None}])
        with self.assertRaisesRegex(ValueError,'UNSAFE_OPENSOURCE_CANDIDATE'):
            self.run_plan('s')
    def test_duplicate_historical_ids_block(self):
        self.h.append({**self.h[0],'candidate_hash_sha256':'b'*64})
        self.w('h',self.h)
        with self.assertRaisesRegex(ValueError,'OLD_WORD_ID_USED_BY_MULTIPLE_SENSES'):
            self.run_plan()
    def test_modified_target_status_blocks(self):
        t=[json.loads(line) for line in (self.p/'t').read_text().splitlines()]
        t[0]['publication_ready']=True;self.w('t',t)
        with self.assertRaisesRegex(ValueError,'UNSAFE_OWNER_TARGET_STATUS_OR_ORDER'):
            self.run_plan()

if __name__=='__main__':unittest.main()