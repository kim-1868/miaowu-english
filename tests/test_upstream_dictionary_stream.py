import csv
import importlib.util
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "audit-upstream-ecdict-stream.py"
SPEC = importlib.util.spec_from_file_location("ecdict_stream", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class UpstreamDictionaryStreamTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.csvfile = self.root / "ecdict.csv"
        self.out = self.root / "index"

    def tearDown(self):
        self.tmp.cleanup()

    def sample(self, rows):
        with self.csvfile.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "word", "phonetic", "definition", "translation",
                "pos", "collins", "oxford", "tag", "bnc", "frq",
                "exchange", "detail", "audio"])
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    def test_headword_unique_across_cet4_cet6_and_quarantine_duplicates(self):
        self.sample([
            {"word": "Record", "tag": "cet4 cet6",
             "exchange": "p:recorded/i:recording"},
            {"word": "record", "tag": "cet6"},
            {"word": "develop", "tag": "gk cet4 ky",
             "exchange": "d:developed/i:developing"},
            {"word": "saw", "tag": "cet6", "exchange": "s:saws"},
            {"word": "see", "tag": "cet4", "exchange": "p:saw/d:seen"},
            {"word": "i.e.", "tag": "cet4"}])
        report = MODULE.audit_file(self.csvfile, self.out)
        self.assertEqual(report["source_statistics"]["source_rows"], 6)
        self.assertEqual(report["index_statistics"]["quarantined_duplicate_headwords"], 1)
        self.assertEqual(report["index_statistics"]["retained_headwords"], 3)
        self.assertEqual(report["exam_level_counts"]["cet4"], 2)
        self.assertEqual(report["exam_level_counts"]["cet6"], 1)
        self.assertEqual(report["index_statistics"]["form_exact_headword_collision"], 1)
        headwords = [json.loads(row) for row in
                     (self.out / "dictionary-unverified-entries.jsonl").read_text().splitlines()]
        self.assertTrue(all(x["teaching_ready"] is False and x["reviewed"] is False
                            for x in headwords))
        self.assertNotIn("record", {row["headword"] for row in headwords})
        forms = [json.loads(row) for row in
                 (self.out / "dictionary-unverified-forms.jsonl").read_text().splitlines()]
        self.assertTrue(all(x["reviewed"] is False for x in forms))
        self.assertIn(("saw", "see"), {(x["form"], x["headword"]) for x in forms})
        self.assertNotIn(("recorded", "record"),
                         {(x["form"], x["headword"]) for x in forms})
        self.assertFalse((self.out / "index-workspace.sqlite").exists())
        self.assertFalse(report["imported_into_d1"])
        rehearsal = report["sqlite_staging_schema_rehearsal"]
        self.assertEqual(rehearsal["status"],
                         "DISPOSABLE_SQLITE_D1_SCHEMA_REHEARSAL_PASSED")
        self.assertEqual(rehearsal["entries"], 3)
        self.assertEqual(rehearsal["forms"], report["index_statistics"]["candidate_forms"])
        self.assertEqual(rehearsal["approved_entries"], 0)
        self.assertEqual(rehearsal["reviewed_forms"], 0)
        self.assertEqual(rehearsal["enabled_sources"], 0)
        self.assertEqual(rehearsal["foreign_key_violations"], 0)
        self.assertFalse(rehearsal["cloudflare_d1_migrated"])

    def test_unicode_quote_and_multiline_translation_are_safe(self):
        self.sample([
            {"word": "Can’t", "tag": "ielts",
             "translation": "一行\n第二行,带有逗号",
             "exchange": "s:can’ts"},
            {"word": "control", "tag": "cet4 cet6", "exchange": "p:controlled/p:controlled"}])
        report = MODULE.audit_file(self.csvfile, self.out)
        self.assertEqual(report["index_statistics"]["retained_headwords"], 2)
        self.assertEqual(report["source_statistics"]["duplicate_forms"], 1)
        self.assertEqual(report["exam_level_counts"]["ielts"], 1)
        self.assertEqual(report["exam_level_counts"]["cet4"], 1)
        self.assertEqual(report["exam_level_counts"]["cet6"], 1)
        self.assertIn("source_sha256", report)

    def test_invalid_header_and_empty_source_fail_closed(self):
        self.csvfile.write_text("word,tag\nlead,cet4\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "UPSTREAM_ECDICT_HEADERS_MISSING"):
            MODULE.audit_file(self.csvfile, self.out)
        self.csvfile.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "UPSTREAM_CSV_NOT_FOUND_OR_EMPTY"):
            MODULE.audit_file(self.csvfile, self.out)


if __name__ == "__main__":
    unittest.main()
