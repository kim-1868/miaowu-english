"""Offline source import tests: no network, no Wrangler, no Cloudflare."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("exam_stage", ROOT / "scripts/build-staging-exam-candidate-import.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class ExamCandidateTests(unittest.TestCase):
    def prepare(self, directory):
        p = Path(directory)
        entries = [
            dict(entry_id=stage.stable_id("cat"), headword="cat",
                 exam_levels=["cet4"], source="ECDICT_FULL_UPSTREAM_UNVERIFIED",
                 teaching_ready=False, reviewed=False),
            dict(entry_id=stage.stable_id("can't"), headword="can't",
                 exam_levels=["cet6", "ielts"], source="ECDICT_FULL_UPSTREAM_UNVERIFIED",
                 teaching_ready=False, reviewed=False),
            dict(entry_id=stage.stable_id("outside"), headword="outside",
                 exam_levels=[], source="ECDICT_FULL_UPSTREAM_UNVERIFIED",
                 teaching_ready=False, reviewed=False)
        ]
        forms = [
            dict(form="cats", headword="cat", source="ECDICT_EXCHANGE_UNVERIFIED",
                 reviewed=False, verified=False),
            dict(form="outsides", headword="outside", source="ECDICT_EXCHANGE_UNVERIFIED",
                 reviewed=False, verified=False)
        ]
        audit = {"source_sha256": stage.UPSTREAM_SHA,
                 "index_statistics": {"retained_headwords": len(entries),
                                      "candidate_forms": len(forms)}}
        for file, value in (("entries.jsonl", entries), ("forms.jsonl", forms)):
            (p / file).write_text("".join(json.dumps(row) + "\n" for row in value),
                                  encoding="utf-8")
        (p / "audit.json").write_text(json.dumps(audit), encoding="utf-8")
        return p, entries, forms

    def run_stage(self, base, **kwargs):
        return stage.compile_exam_candidates(base / "entries.jsonl",
            base / "forms.jsonl", base / "audit.json", base / "out",
            fixture=True, batch_size=1, **kwargs)

    def test_exam_only_offline_db_rehearsal(self):
        with tempfile.TemporaryDirectory() as d:
            base, _, _ = self.prepare(d)
            manifest = self.run_stage(base)
            self.assertEqual((manifest["selected_entries"], manifest["selected_forms"]), (2, 1))
            self.assertEqual(manifest["source_enabled"], 0)
            self.assertEqual(manifest["teaching_ready"], 0)
            self.assertEqual(manifest["license_reviewed"], 0)
            self.assertEqual(stage.verify_local(base / "out", ROOT / "db/013_global_dictionary.sql"),
                             {"entries": 2, "forms": 1, "sources": 1})
            all_sql = "\n".join(x.read_text(encoding="utf-8")
                for x in (base / "out").glob("*.sql"))
            self.assertIn("can''t", all_sql)
            self.assertNotIn("outsides", all_sql)

    def test_refuse_approved_entry(self):
        with tempfile.TemporaryDirectory() as d:
            base, rows, _ = self.prepare(d)
            rows[0]["teaching_ready"] = True
            (base / "entries.jsonl").write_text(
                "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "UNVERIFIED_SOURCE_GUARD_FAILED"):
                self.run_stage(base)

    def test_refuse_reused_identity(self):
        with tempfile.TemporaryDirectory() as d:
            base, rows, _ = self.prepare(d)
            rows[1]["entry_id"] = rows[0]["entry_id"]
            (base / "entries.jsonl").write_text(
                "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ENTRY_ID_INTEGRITY_ERROR"):
                self.run_stage(base)

    def test_refuse_duplicate_form_pair(self):
        with tempfile.TemporaryDirectory() as d:
            base, _, forms = self.prepare(d)
            forms.append(forms[0])
            (base / "forms.jsonl").write_text(
                "".join(json.dumps(row) + "\n" for row in forms), encoding="utf-8")
            audit = json.loads((base / "audit.json").read_text(encoding="utf-8"))
            audit["index_statistics"]["candidate_forms"] = len(forms)
            (base / "audit.json").write_text(json.dumps(audit), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "DUPLICATE_FORM_PAIR"):
                self.run_stage(base)

    def test_refuse_mismatched_digest(self):
        with tempfile.TemporaryDirectory() as d:
            base, _, _ = self.prepare(d)
            self.run_stage(base)
            target = base / "out/100-entries-0001.sql"
            target.write_text(target.read_text() + "-- tamper\n")
            with self.assertRaisesRegex(ValueError, "SQL_FILE_DIGEST_MISMATCH"):
                stage.verify_local(base / "out", ROOT / "db/013_global_dictionary.sql")

    def test_refuse_overwrite_existing_output(self):
        with tempfile.TemporaryDirectory() as d:
            base, _, _ = self.prepare(d)
            self.run_stage(base)
            with self.assertRaisesRegex(ValueError, "OUTPUT_MUST_BE_EMPTY"):
                self.run_stage(base)


if __name__ == "__main__":
    unittest.main()
