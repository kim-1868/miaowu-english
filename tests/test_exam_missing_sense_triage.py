"""All fixtures synthetic: never put private owner lists or chargeable book text in CI."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def import_script(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

triage=import_script('missing_sense_triage',ROOT/'scripts/triage-exam-missing-senses.py')
examples=import_script('curated_examples',ROOT/'scripts/compile-exam-original-review-drafts.py')

def row(word,tier='四级新增',historical=None,translation='n. 一个地方',ipa=None):
    return {'headword':word,'entry_id':'gdict_'+hashlib.sha256(word.encode()).hexdigest()[:24],
            'target_tier':tier,'original_priority_order':1,
            'publisher_approved':False,'teaching_ready':False,'publication_ready':False,
            'approved_sense_id':None,'historical_sense_candidates':historical or [],
            'source_ecdict_unverified':{'raw_chinese_meanings_unverified':translation,
               'raw_english_definition_unverified':'a synthetic item'},
            'source_ipa_us_unverified':ipa if ipa is not None else ['/x/']}

def make_bundle(path,rows,tamper=False):
    root='private-fixture/'
    files={
       'batch/REVIEW_001_NOT_APPROVED.jsonl':''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows).encode(),
       'source_summary.json':json.dumps({'target_headwords':len(rows),
          'source_references':{'ecdict':{'commit':'test'},'us_ipa':{'commit':'test'}}}).encode()
    }
    manifest={k:{'sha256':hashlib.sha256(v).hexdigest(),'bytes':len(v)} for k,v in files.items()}
    if tamper:
        files['source_summary.json']=b'{}'
    with zipfile.ZipFile(path,'w') as z:
        for k,v in files.items():z.writestr(root+k,v)
        z.writestr(root+'FILE_MANIFEST_SHA256.json',json.dumps(manifest))

class MissingSenseTriage(unittest.TestCase):
    def test_source_pos_split_and_no_approval(self):
        x,flags=triage.suggest_meanings('n. 记录, 档案\\nvt. 记录, 录制\\n[计] 记录表')
        self.assertEqual([y['pos_unverified'] for y in x],['n.','vt.'])
        self.assertIn('MULTIPLE_POS_REVIEW',flags)
        self.assertTrue(all(y['approved_sense_id'] is None and y['publisher_approved'] is False for y in x))

    def test_machine_only_low_conflict(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);bundle=p/'safe.zip';make_bundle(bundle,[row('harbor',translation='n. 港口'),row('observe',translation='vt. 观察; vi. 遵守')])
            result=triage.build(bundle,p/'review',fixture=True)
            self.assertEqual(result['missing_historical_headwords'],2)
            self.assertEqual(result['publisher_approved_senses'],0)
            self.assertEqual(result['remote_d1_writes'],0)
            data=[json.loads(x) for x in (p/'review/CET4_NEW_MISSING_SENSES_REVIEW_ONLY.jsonl').read_text().splitlines()]
            self.assertEqual(data[0]['review_lane'],'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW')
            self.assertEqual(data[0]['approved_sense_id'],None)
            self.assertEqual(data[1]['review_lane'],'POLYSEMY_OR_PRONUNCIATION_REVIEW')

    def test_sha_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);make_bundle(p/'unsafe.zip',[row('harbor')],tamper=True)
            with self.assertRaisesRegex(ValueError,'SOURCE_SHA256_MISMATCH'):
                triage.build(p/'unsafe.zip',p/'out',fixture=True)

    def test_forbid_fake_approval_and_old_id_collision(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);a=row('harbor');a['publisher_approved']=True
            make_bundle(p/'untrusted.zip',[a]);
            with self.assertRaisesRegex(ValueError,'UNSAFE_OR_DUPLICATE_SOURCE_ROW'):
                triage.build(p/'untrusted.zip',p/'out',fixture=True)
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);h={'approved_sense_id':None,'publisher_approved':False,'old_word_ids':['old-1']}
            make_bundle(p/'dup.zip',[row('harbor',historical=[h]),row('bridge',historical=[h])])
            with self.assertRaisesRegex(ValueError,'LEGACY_OLD_ID_COLLISION'):
                triage.build(p/'dup.zip',p/'out',fixture=True)

    def test_out_no_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);make_bundle(p/'safe.zip',[row('harbor')]);(p/'out').mkdir()
            with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE_PRIVATE_OUTPUT'):
                triage.build(p/'safe.zip',p/'out',fixture=True)

    def test_curated_example_word_must_be_present_and_reviewed(self):
        sample={'headword':'harbor','entry_id':'gdict_'+'0'*24,'target_tier':'四级新增',
                'review_lane':'SINGLE_POS_LOW_CONFLICT_INITIAL_REVIEW','publisher_approved':False,
                'approved_sense_id':None,
                'pos_meaning_suggestions_unverified':[{'pos_unverified':'n.','meaning_candidates_unverified':['港口']}]} 
        draft={'headword':'harbor','target_tier':'四级新增','pos_draft':'n.','meaning_zh_draft':'港口',
               'example_en_draft':'The harbor was quiet when the fishing boats returned.',
               'example_zh_draft':'渔船回来时，港口十分安静。'}
        self.assertEqual(examples.validate_private_example(draft,sample),[])
        draft['example_en_draft']='The market was quiet when the fishing boats returned.'
        self.assertIn('HEADWORD_NOT_LITERAL_IN_EXAMPLE',examples.validate_private_example(draft,sample))
        sample['publisher_approved']=True
        self.assertIn('SOURCE_PREAPPROVED',examples.validate_private_example(draft,sample))

if __name__=='__main__':unittest.main()