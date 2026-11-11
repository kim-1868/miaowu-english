import hashlib,importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('audit_239',Path(__file__).with_name('audit_239.py'))
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

def row(n,cohort,flags,ipa,translation='n. 测试'):
    w='test'+('x'*n)
    return {'headword':w,'entry_id':'gdict_'+hashlib.sha256(w.encode()).hexdigest()[:24],
            'target_tier':'基础','cohort':cohort,'risk_flags_unverified':flags,
            'original_raw_translation_unverified':translation,
            'us_ipa_options_unverified':ipa,'pos_options_unverified':[],
            'publisher_approved':False,'approved_sense_id':None,
            'production_publish_allowed':False,'old_word_ids':[]}

class TestAudit(unittest.TestCase):
    def fixture(self):
        s=[row(i,'S0_SOURCE_GAP_AND_SPECIAL',['NO_PARSEABLE_POS_MEANING'],['/tɛst/']) for i in range(1,123)]
        p=[row(i,'P1_IPA_VARIANT_ONLY_MACHINE_FLAGS',['MULTIPLE_US_PRONUNCIATIONS'],['/ˈtɛst/','/tɛst/']) for i in range(124,241)]
        return s,p
    def test_parenthetical_pos_kept_not_signed(self):
        self.assertEqual(mod.parse_pos_recovery('v. (使)减少, (使)变小')[0]['pos_unverified'],'v.')
        self.assertEqual(mod.parse_pos_recovery('n. (中小学)女校长')[0]['raw_meaning_with_source_parenthetical_unverified'],'(中小学)女校长')
        self.assertTrue(mod.parse_pos_recovery('v. (使)减少')[0]['manual_review_required'])
    def test_no_fabricated_pos(self):
        self.assertEqual(mod.parse_pos_recovery('软件, 新的名词'),[])
        self.assertEqual(mod.parse_pos_recovery('[计] 网络'),[])
        self.assertEqual(mod.parse_pos_recovery('n. 不带括号'),[])
    def test_real_scope_synthetic_rows_keep_blocked(self):
        s,p=self.fixture();s[0]['original_raw_translation_unverified']='v. (使)减少'
        rows,c=mod.inspect(s,p)
        self.assertEqual(len(rows),239)
        self.assertEqual(c['EXPLICIT_PARENTHESES_POS_PARSER_FALSE_NEGATIVE'],1)
        self.assertEqual(c['IPA_SAME_BASE_SEGMENTS_STRESS_DIFFERENCES'],117)
        self.assertTrue(all(x['publisher_approved'] is False and x['approved_sense_id'] is None for x in rows))
    def test_museum_stress_position_is_not_pronunciation_approval(self):
        s,p=self.fixture();p[0]['us_ipa_options_unverified']=['/ˈmjuziəm/','/mjuˈziəm/']
        items,c=mod.inspect(s,p)
        self.assertEqual(c['IPA_SAME_BASE_SEGMENTS_STRESS_DIFFERENCES'],117)
        self.assertIn('NEVER auto-merge',items[-117]['note'])
        self.assertIsNone(items[-117]['approved_sense_id'])
    def test_identity_and_commercial_approval_mutations_rejected(self):
        s,p=self.fixture()
        s[0]['entry_id']='gdict_'+'0'*24
        with self.assertRaisesRegex(ValueError,'ENTRY_HASH_MISMATCH'):mod.inspect(s,p)
        s,p=self.fixture();p[0]['publisher_approved']=True
        with self.assertRaisesRegex(ValueError,'FORGED_APPROVAL'):mod.inspect(s,p)
    def test_duplicate_and_old_word_migration_rejected(self):
        s,p=self.fixture();p[0]['headword']=s[0]['headword'];p[0]['entry_id']=s[0]['entry_id']
        with self.assertRaisesRegex(ValueError,'DUPLICATE_CROSS_COHORT'):mod.inspect(s,p)
        s,p=self.fixture();s[0]['old_word_ids']=['old-id']
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_OLD_CARD_ID'):mod.inspect(s,p)
    def test_ipa_invalid_rejected(self):
        s,p=self.fixture();p[0]['us_ipa_options_unverified']=['bad','/tɛst/']
        with self.assertRaisesRegex(ValueError,'INVALID_IPA_RECORD'):mod.inspect(s,p)
if __name__=='__main__':unittest.main()