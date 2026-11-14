"""CET4/CET6/postgraduate overlap is a multi-label union, not strict nesting."""
import importlib.util
import json
import hashlib
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("priority",ROOT/"scripts/analyze-exam-priority-union.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ExamUnionTests(unittest.TestCase):
    def write(self, directory,rows):
        p=Path(directory)
        entries=[]
        for word,tags in rows:
            entries.append({
                "headword":word,
                "entry_id":"gdict_"+hashlib.sha256(word.encode()).hexdigest()[:24],
                "source":"ECDICT_FULL_UPSTREAM_UNVERIFIED",
                "reviewed":False,"teaching_ready":False,
                "exam_levels":tags
            })
        (p/"entries.jsonl").write_text("".join(json.dumps(r)+"\n" for r in entries),encoding="utf-8")
        (p/"audit.json").write_text(json.dumps({
            "source_sha256":mod.SOURCE_SHA,
            "index_statistics":{"retained_headwords":len(entries)}
        }),encoding="utf-8")
        return p

    def run_report(self,p):
        return mod.analyze(p/"entries.jsonl",p/"audit.json",strict=False)

    def test_all_overlaps_and_incremental_union(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.write(d,[
                ("a",[]),("b",["cet4"]),("c",["cet6"]),("d",["postgrad"]),
                ("e",["cet4","cet6"]),("f",["cet4","postgrad"]),
                ("g",["cet6","postgrad"]),("h",["cet4","cet6","postgrad"])
            ])
            x=self.run_report(p)
            self.assertEqual(x["source_tag_counts"],{"cet4":4,"cet6":4,"postgrad":4})
            self.assertEqual(x["exam_priority_unique_union"],7)
            self.assertEqual(x["incremental_headword_plan"],{
                "cet4_first":4,"cet6_new_not_cet4":2,
                "postgrad_new_not_cet4_or_cet6":1})
            self.assertEqual(x["subset_checks"]["cet4_words_not_in_cet6"],2)
            self.assertEqual(x["subset_checks"]["cet6_words_not_in_cet4"],2)
            self.assertEqual(x["subset_checks"]["postgrad_words_not_in_cet6"],2)
            self.assertEqual(x["teaching_senses_approved"],0)
            self.assertFalse(x["owner_lists_cross_verified"])

    def test_non_target_tags_do_not_inflate_priority_union(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.write(d,[("a",["ielts","gaokao"]),("b",["cet4","ielts"]),("c",["toefl"])])
            x=self.run_report(p)
            self.assertEqual(x["exam_priority_unique_union"],1)
            self.assertEqual(x["source_tag_counts"]["cet4"],1)

    def test_reject_pretend_approved_source(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.write(d,[("dog",["cet4"])])
            raw=json.loads((p/"entries.jsonl").read_text())
            raw["teaching_ready"]=True
            (p/"entries.jsonl").write_text(json.dumps(raw)+"\n")
            with self.assertRaisesRegex(ValueError,"HEADWORD_SOURCE_IDENTITY"):
                self.run_report(p)

    def test_reject_duplicate_words_and_tags(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.write(d,[("dog",["cet4"]),("dog",["cet6"])])
            with self.assertRaisesRegex(ValueError,"DUPLICATE_HEADWORD"):
                self.run_report(p)
            p=self.write(d,[("dog",["cet4","cet4"])])
            with self.assertRaisesRegex(ValueError,"INVALID_EXAM_TAG_SET"):
                self.run_report(p)

    def test_reject_invalid_level_or_modified_id(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.write(d,[("dogs",["cet999"])])
            with self.assertRaisesRegex(ValueError,"INVALID_EXAM_TAG_SET"):
                self.run_report(p)
            p=self.write(d,[("dogs",["cet4"])])
            raw=json.loads((p/"entries.jsonl").read_text())
            raw["entry_id"]="gdict_fake"
            (p/"entries.jsonl").write_text(json.dumps(raw)+"\n")
            with self.assertRaisesRegex(ValueError,"HEADWORD_SOURCE_IDENTITY"):
                self.run_report(p)

    def test_no_remote_or_approval_write_actions(self):
        content=(ROOT/"scripts/analyze-exam-priority-union.py").read_text()
        for forbidden in ("wrangler d1","CLOUDFLARE_API_TOKEN","UPDATE global_dictionary","INSERT INTO global_dictionary"):
            self.assertNotIn(forbidden,content)


if __name__=="__main__":
    unittest.main()
