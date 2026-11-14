import hashlib,importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/review-exam-us-ipa-source-variants.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

def sample(head,missing=True):
 return {'headword':head,'tier':'基础','entry_id':'gdict_'+hashlib.sha256(head.encode()).hexdigest()[:24],
         'publisher_approved':False,'approved_sense_id':None,'us_ipa_missing':missing,'original_translation_unverified':'n. 假数据'}

class OfflineSuggestionSafety(unittest.TestCase):
 def setup(self,folder):
  p=Path(folder);row=[sample('offence')]+[sample('word'+str(i),False) for i in range(238)]
  (p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
  with zipfile.ZipFile(p/'public.zip','w') as z:z.writestr('en_US.txt','offense\t/əˈfɛns/\n')
  (p/'variant.json').write_text(json.dumps({'offence':'offense'}));return p,row
 def test_only_source_spelling_suggestion_not_an_approved_pronunciation(self):
  with tempfile.TemporaryDirectory() as folder:
   p,row=self.setup(folder)
   row[1:92]=[sample('nomatch'+str(i)) for i in range(91)]
   (p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
   r=audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
   self.assertEqual(r['missing_us_ipa_source'],92)
   self.assertEqual(r['missing_with_related_spelling_in_same_MIT_ipa_source'],1)
   x=json.loads((p/'out/92_MISSING_US_IPA_VARIANT_REVIEW_ONLY.jsonl').read_text().splitlines()[0]);self.assertTrue(x['do_not_copy_related_word_pronunciation']);self.assertIsNone(x['approved_sense_id']);self.assertFalse(x['publisher_approved'])
 def test_duplicate_headword_and_tampered_entry_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   p,row=self.setup(folder)
   row[1]=row[0].copy();(p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
   with self.assertRaisesRegex(ValueError,'DUPLICATE_HEADWORD'):audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
  with tempfile.TemporaryDirectory() as folder:
   p,row=self.setup(folder);row[0]['entry_id']='gdict_'+'b'*24
   (p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
   with self.assertRaisesRegex(ValueError,'ENTRY_ID_MISMATCH'):audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
 def test_false_approval_and_no_overwrite(self):
  with tempfile.TemporaryDirectory() as folder:
   p,row=self.setup(folder);row[0]['publisher_approved']=True
   (p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
   with self.assertRaisesRegex(ValueError,'FALSE_APPROVAL'):audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
  with tempfile.TemporaryDirectory() as folder:
   p,row=self.setup(folder);row[1:92]=[sample('nomatch'+str(i)) for i in range(91)]
   (p/'239.jsonl').write_text(''.join(json.dumps(x)+'\n' for x in row))
   audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
   with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):audit.run(p/'239.jsonl',p/'public.zip',p/'out',p/'variant.json')
 def test_not_treat_word_as_semantic_equivalence(self):
  self.assertTrue(any(x['candidate_word']=='offense' for x in audit.possible_forms('offence',{'offence':'offense'})))
  self.assertFalse(any(x['candidate_word']=='offense' for x in audit.possible_forms('offense')))
  self.assertEqual(audit.possible_forms('unrelated'),[])

if __name__=='__main__':unittest.main()