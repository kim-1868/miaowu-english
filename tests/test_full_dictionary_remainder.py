"""Offline-only tests for the full non-exam candidate staging plan."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("remainder",ROOT/"scripts/prepare-full-dictionary-remainder.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class FullRemainderTests(unittest.TestCase):
    def setup_files(self,dirname):
        p=Path(dirname)
        words=[("cat",["cet4"]),("can't",["cet6"]),("feline",[]),("unusual",[]),("sprout",[])]
        entries=[dict(entry_id=mod.core.stable_id(w),headword=w,
                      exam_levels=levels,source="ECDICT_FULL_UPSTREAM_UNVERIFIED",
                      teaching_ready=False,reviewed=False)
                 for w,levels in words]
        forms=[dict(form=f,headword=w,source="ECDICT_EXCHANGE_UNVERIFIED",
                    reviewed=False,verified=False)
               for f,w in [("cats","cat"),("felines","feline"),
                           ("sprouts","sprout"),("can'ts","can't")]]
        for name,items in (("entries.jsonl",entries),("forms.jsonl",forms)):
            (p/name).write_text("".join(json.dumps(x)+"\n" for x in items),encoding="utf-8")
        (p/"audit.json").write_text(json.dumps({"source_sha256":mod.core.UPSTREAM_SHA,
            "index_statistics":{"retained_headwords":len(entries),"candidate_forms":len(forms)}}),encoding="utf-8")
        return p,entries,forms

    def compile(self,p):
        return mod.build_remainder(p/"entries.jsonl",p/"forms.jsonl",
              p/"audit.json",p/"output",cohort_cap=2,sql_file_rows=1,fixture=True)

    def test_exam_unchanged_remainder_complete_and_fks_valid(self):
        with tempfile.TemporaryDirectory() as d:
            p,_,_=self.setup_files(d)
            manifest=self.compile(p)
            self.assertEqual((manifest["already_imported_exam_entries"],manifest["already_imported_exam_forms"]),(2,2))
            self.assertEqual((manifest["candidate_remaining_entries"],manifest["candidate_remaining_forms"]),(3,2))
            self.assertEqual(len(manifest["cohorts"]),3)
            self.assertTrue(all(x["requires_owner_approval"] for x in manifest["cohorts"]))
            summary=mod.replay(p/"output",p/"entries.jsonl",p/"forms.jsonl",ROOT/"db/013_global_dictionary.sql")
            self.assertEqual((summary["full_candidate_headwords"],summary["full_candidate_forms"]),(5,4))
            self.assertEqual(summary["approved_teaching_senses"],0)
            self.assertEqual(summary["remote_writes"],0)

    def test_reject_unapproved_source_becoming_approved(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows,_=self.setup_files(d)
            rows[2]["teaching_ready"]=True
            (p/"entries.jsonl").write_text("".join(json.dumps(x)+"\n" for x in rows))
            with self.assertRaisesRegex(ValueError,"UNTRUSTED_SOURCE_ENTRY"):
                self.compile(p)

    def test_reject_corrupt_source_identity(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows,_=self.setup_files(d)
            rows[2]["entry_id"]=rows[1]["entry_id"]
            (p/"entries.jsonl").write_text("".join(json.dumps(x)+"\n" for x in rows))
            with self.assertRaisesRegex(ValueError,"UNTRUSTED_SOURCE_ENTRY"):
                self.compile(p)

    def test_reject_duplicate_surface_pair(self):
        with tempfile.TemporaryDirectory() as d:
            p,_,rows=self.setup_files(d)
            rows.append(dict(rows[0]))
            (p/"forms.jsonl").write_text("".join(json.dumps(x)+"\n" for x in rows))
            audit=json.loads((p/"audit.json").read_text())
            audit["index_statistics"]["candidate_forms"]=len(rows)
            (p/"audit.json").write_text(json.dumps(audit))
            with self.assertRaisesRegex(ValueError,"DUPLICATE_SOURCE_FORM"):
                self.compile(p)

    def test_reject_file_tampering_and_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p,_,_=self.setup_files(d)
            self.compile(p)
            with self.assertRaisesRegex(ValueError,"OUTPUT_DIRECTORY_NOT_EMPTY"):
                self.compile(p)
            target=p/"output/cohort-01-entries/0001.sql"
            target.write_text(target.read_text()+"-- altered\n")
            with self.assertRaisesRegex(ValueError,"REMAINDER_SQL_DIGEST_MISMATCH"):
                mod.replay(p/"output",p/"entries.jsonl",p/"forms.jsonl",ROOT/"db/013_global_dictionary.sql")

    def test_no_publication_and_no_remote_writes_in_compiler(self):
        s=(ROOT/"scripts/prepare-full-dictionary-remainder.py").read_text(encoding="utf-8")
        self.assertNotIn("wrangler d1",s)
        self.assertNotIn("CLOUDFLARE_API_TOKEN",s)
        self.assertNotIn("teaching_ready=1",s)
        self.assertIn("source_enabled",s)


if __name__=="__main__":
    unittest.main()
