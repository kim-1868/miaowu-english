"""Regression tests for open-source-assisted, never-published private teaching drafts."""
import csv
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("source_candidates",ROOT/"scripts/build-exam-first-open-source-card-candidates.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def entry(word):
    return "gdict_"+hashlib.sha256(word.encode("utf-8")).hexdigest()[:24]


class SourceCandidateTests(unittest.TestCase):
    def sources(self, directory):
        p=Path(directory)
        targets=[
            {"priority_order":1,"headword":"abundant","target_tier":"四级新增",
             "status":"exact_unreviewed_candidate","entry_id":entry("abundant"),
             "teaching_sense_approved":False,"publication_ready":False},
            {"priority_order":2,"headword":"record","target_tier":"六级新增",
             "status":"exact_unreviewed_candidate","entry_id":entry("record"),
             "teaching_sense_approved":False,"publication_ready":False},
            {"priority_order":3,"headword":"mr.","target_tier":"基础",
             "status":"missing_abbreviation_or_token","entry_id":None,
             "teaching_sense_approved":False,"publication_ready":False},
            {"priority_order":4,"headword":"thriftless","target_tier":"考研新增",
             "status":"exact_unreviewed_candidate","entry_id":entry("thriftless"),
             "teaching_sense_approved":False,"publication_ready":False}
        ]
        (p/"owner.jsonl").write_text("".join(json.dumps(t)+"\n" for t in targets),encoding="utf-8")
        with (p/"ecdict.csv").open("w",newline="",encoding="utf-8") as file:
            writer=csv.DictWriter(file,fieldnames=["word","phonetic","definition","translation","pos"])
            writer.writeheader()
            writer.writerow({"word":"abundant","phonetic":"ə'bʌndənt","definition":"plentiful",
                 "translation":"adj. 丰富的；充足的","pos":"a"})
            writer.writerow({"word":"record","phonetic":"'rekɔ:d","definition":"a written record",
                 "translation":"n. 记录；vt. 记录","pos":"n/v"})
        (p/"us.txt").write_text(
            "abundant\t/əˈbəndənt/\nrecord\t/ˈɹɛkɝd/, /ɹəˈkɔɹd/\nmr.\t/ˈmɪstɝ/\n",encoding="utf-8")
        for key in ("ecdict_license.txt","ipa_license.txt"):
            (p/key).write_text("The MIT License\nCopyright example\nPermission is hereby granted\n",encoding="utf-8")
        return p

    def build(self,p):
        return mod.build_private_candidates(
            p/"owner.jsonl",p/"ecdict.csv",p/"us.txt",
            p/"ecdict_license.txt",p/"ipa_license.txt",p/"private-output")

    def test_drafts_maintain_identity_and_do_not_publish(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            report=self.build(p)
            self.assertEqual(report["target_headwords"],4)
            self.assertEqual(report["source_ipa_us_word_matches"],3)
            self.assertEqual(report["source_ipa_us_multiple_pronunciations"],1)
            self.assertEqual(report["source_ipa_us_missing"],1)
            self.assertEqual(report["ecdict_chinese_candidate_matches"],2)
            self.assertEqual(report["abbreviation_special_review"],1)
            self.assertEqual(report["teaching_senses_approved"],0)
            self.assertEqual(report["publishable_rows"],0)
            self.assertEqual(report["production_writes"],0)
            self.assertFalse(report["source_references"]["us_ipa"]["final_rights_reviewed"])
            self.assertFalse(report["source_references"]["uk_ipa"]["imported"])
            lines=[json.loads(x) for x in (p/"private-output/exam-first-opensource-candidate-only.jsonl").read_text().splitlines()]
            self.assertEqual(lines[0]["phonetic_us_candidates_unverified"],["/əˈbəndənt/"])
            self.assertEqual(len(lines[1]["phonetic_us_candidates_unverified"]),2)
            self.assertIn("US_IPA_MULTIPLE_SENSE_DEPENDENT_READINGS",lines[1]["blockers"])
            self.assertIsNone(lines[2]["entry_id"])
            self.assertIn("ABBREVIATION_REQUIRES_STABLE_ID_EDITORIAL_REVIEW",lines[2]["blockers"])
            self.assertIsNone(lines[0]["sense_id"])
            self.assertIsNone(lines[0]["example_en"])
            self.assertIsNone(lines[0]["phonetic_uk"])
            self.assertFalse(lines[0]["publisher_approved"])

    def test_duplicate_owner_and_source_are_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            text=(p/"owner.jsonl").read_text()
            (p/"owner.jsonl").write_text(text+text.splitlines()[0]+"\n")
            with self.assertRaisesRegex(ValueError,"UNSAFE_OWNER_TARGET"):
                self.build(p)
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            with (p/"ecdict.csv").open("a",encoding="utf-8") as f:
                f.write("abundant,,another definition,另一条解释,n\n")
            with self.assertRaisesRegex(ValueError,"ECDICT_DUPLICATE_OWNER_WORD"):
                self.build(p)

    def test_missing_or_wrong_source_notices_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            (p/"ipa_license.txt").write_text("GPL 3.0\n")
            with self.assertRaisesRegex(ValueError,"UPSTREAM_MIT_NOTICE_MISSING"):
                self.build(p)

    def test_ambiguous_invalid_ipa_not_silently_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            (p/"us.txt").write_text("record\tɹɛkɔɹd\n")
            with self.assertRaisesRegex(ValueError,"IPA_TSV_INVALID_READING"):
                self.build(p)

    def test_never_replaces_existing_approved_or_private_output(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            self.build(p)
            with self.assertRaisesRegex(ValueError,"PRIVATE_OUTPUT_EXISTS_NO_OVERWRITE"):
                self.build(p)
        with tempfile.TemporaryDirectory() as d:
            p=self.sources(d)
            rows=[json.loads(x) for x in (p/"owner.jsonl").read_text().splitlines()]
            rows[0]["teaching_sense_approved"]=True
            (p/"owner.jsonl").write_text("".join(json.dumps(x)+"\n" for x in rows))
            with self.assertRaisesRegex(ValueError,"UNSAFE_OWNER_TARGET"):
                self.build(p)


    def test_translation_prefix_pos_candidates_are_safe_review_hints(self):
        text = r"n. 记录\nvt. 记录\nvi. 录音\na. 创纪录的\n[计] 术语\nn. 纪录"
        self.assertEqual(
            mod.extract_pos_candidates_from_translation(text),
            ["n.", "vt.", "vi.", "adj."]
        )
        self.assertEqual(mod.extract_pos_candidates_from_translation("adj. 丰富的\nadv. 丰富地"), ["adj.", "adv."])
        self.assertEqual(mod.extract_pos_candidates_from_translation("[计] n. 不应误认"), [])
        self.assertEqual(mod.extract_pos_candidates_from_translation(None), [])
        with tempfile.TemporaryDirectory() as d:
            p = self.sources(d)
            self.build(p)
            lines = [json.loads(x) for x in (p / "private-output/exam-first-opensource-candidate-only.jsonl").read_text().splitlines()]
            self.assertEqual(lines[0]["ecdict"]["pos_candidates_from_translation_unverified"], ["adj."])
            self.assertEqual(lines[1]["ecdict"]["pos_candidates_from_translation_unverified"], ["n.", "vt."])
            summary = json.loads((p / "private-output/candidate-summary.json").read_text())
            self.assertEqual(summary["ecdict_pos_prefix_extracted"], 2)
            self.assertEqual(summary["publishable_rows"], 0)


if __name__=="__main__":
    unittest.main()
