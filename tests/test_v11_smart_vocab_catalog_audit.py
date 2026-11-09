"""Pure offline QA checks; never touches Cloudflare or user state."""
import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT=Path(__file__).resolve().parents[1]/"scripts"/"v11-smart-vocab-catalog-audit.py"
spec=importlib.util.spec_from_file_location("smart_catalog_audit",SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
HEAD=["全局排名","涉及考试","单词","音标","词性","中文释义","COCA词频frq","BNC词频"]

class SmartCatalogSafetyTest(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.csv=Path(self.t.name)/"source.csv"
        self.cards=Path(self.t.name)/"reviewed.jsonl"
        with open(self.csv,"w",encoding="utf-8",newline="") as fh:
            w=csv.DictWriter(fh,fieldnames=HEAD);w.writeheader()
            w.writerow(dict(zip(HEAD,["1","四级,六级","retain","rɪˈteɪn","v.","保留","120","130"])))
            w.writerow(dict(zip(HEAD,["2","四级","plausible","","","貌似合理的","",""])))
    def card(self,**overrides):
        v={"category_slug":"cet4","headword":"retain","word_id":"id-1",
           "part_of_speech":"v.","meaning_zh":"保留","phonetic_uk":"rɪˈteɪn",
           "example_en":"Please retain the receipt.","example_zh":"请保留收据。",
           "frequency_source":"COCA","frequency_rank":120,
           "reviewed_by":"human-editor","reviewed_at":"2026-11-09"}
        v.update(overrides);return v
    def write(self,*cards):
        self.cards.write_text("".join(json.dumps(c,ensure_ascii=False)+"\n" for c in cards),encoding="utf-8")
    def test_source_counts_ipa_and_unranked(self):
        _,counts,issues=module.source_audit(self.csv)
        self.assertEqual(counts["cet4"]["headwords"],2)
        self.assertEqual(counts["cet4"]["unranked"],1)
        self.assertEqual(counts["cet4"]["missing_ipa"],1)
        self.assertTrue(issues)
    def test_no_cards_is_hard_block(self):
        self.assertEqual(module.run(self.csv)["cards"]["reason"],"NO_REVIEWED_TEACHING_CARDS")
        self.assertEqual(module.run(self.csv)["status"],"blocked")
    def test_partial_cards_never_claim_complete_grade(self):
        self.write(self.card())
        a=module.run(self.csv,self.cards)
        self.assertEqual(a["cards"]["covered_headwords"]["cet4"],1)
        self.assertEqual(a["status"],"blocked")
    def test_empty_pronunciation_or_examples_are_rejected(self):
        self.write(self.card(example_en=""),self.card(word_id="id-2",phonetic_uk=""))
        _,counts,_=module.source_audit(self.csv)
        a=module.card_audit(self.cards,module.source_audit(self.csv)[0],counts)
        self.assertEqual(a["error_count"],2)
    def test_spoofed_frequency_rejected(self):
        self.write(self.card(frequency_rank=3))
        idx,counts,_=module.source_audit(self.csv)
        self.assertIn("FALSE_FREQUENCY",str(module.card_audit(self.cards,idx,counts)["errors"]))
    def test_unranked_never_claims_frequency(self):
        self.write(self.card(headword="plausible",word_id="unranked",
            part_of_speech="adj.",meaning_zh="貌似合理的",
            phonetic_uk="ˈplɔːzəbəl",
            example_en="Her explanation was plausible.",
            example_zh="她的解释似乎合理。",
            frequency_source="UNRANKED",frequency_rank=None))
        idx,counts,_=module.source_audit(self.csv)
        self.assertEqual(module.card_audit(self.cards,idx,counts)["error_count"],0)
        self.assertEqual(module.run(self.csv,self.cards)["status"],"blocked")

if __name__=="__main__":unittest.main()
