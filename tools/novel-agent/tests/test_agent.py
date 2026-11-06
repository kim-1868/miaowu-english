# -*- coding: utf-8 -*-
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import novel_agent as agent

class AgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root=Path(__file__).resolve().parents[1]
        cls.sample=cls.root.parent/"wordletter_agent_sources"/"第十三张底片_修复版_出版台上传.json"

    def test_shelf_index_contains_only_senses(self):
        src=self.root/"data"/"shelf_20261106_sanitized.json"
        x=agent.published_shelf(src)
        self.assertGreater(len(x),500)
        self.assertTrue(all(set(w).issubset({"category","headword","partOfSpeech","meaningZh","sourceWordId","identityStatus"}) for w in x))
        self.assertGreater(sum(w["category"]=="cet4" for w in x),100)

    def test_demo_runs_and_generates_zip_without_live_db(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo"
            qa,pack=agent.demo(out)
            self.assertTrue(pack.exists())
            self.assertEqual(qa["metrics"]["chapters"],2)
            self.assertEqual(qa["metrics"]["wordOccurrences"],2)
            self.assertFalse(qa["metrics"]["liveImporterValidated"])
            with __import__('zipfile').ZipFile(pack) as z:
                self.assertIn("出版台导入包.json",z.namelist())
                loaded=json.loads(z.read("出版台导入包.json").decode())
                self.assertFalse(any(ch["preview"] for ch in loaded["chapters"]))

    def test_whitespace_segment_is_p0(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo";agent.demo(out)
            book=agent.build_package(out)
            book["chapters"][0]["paragraphs"][0]["segments"].insert(1,{"text":" "})
            result=agent.validate_package(book)
            self.assertIn("EMPTY_TEXT",{i["code"] for i in result["errors"]})

    def test_invalid_word_card_reference_is_p0(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo";agent.demo(out)
            book=agent.build_package(out)
            book["chapters"][0]["paragraphs"][0]["segments"][1]["wordId"]="not-here"
            result=agent.validate_package(book)
            self.assertIn("BROKEN_WORD_LINK",{i["code"] for i in result["errors"]})

    def test_empty_collocations_is_p1(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo";agent.demo(out)
            book=agent.build_package(out)
            book["words"][2]["collocations"]=[]
            result=agent.validate_package(book)
            self.assertIn("EMPTY_COLLOCATIONS",{i["code"] for i in result["errors"]})

    def test_old_preview_is_blocked_by_current_no_preview_rule(self):
        if not self.sample.exists():self.skipTest("historic sample not included in release archive")
        book=agent.read_json(self.sample)
        result=agent.validate_package(book)
        self.assertEqual(result["metrics"]["totalWordCards"],122)
        self.assertEqual(result["metrics"]["wordOccurrences"],295)
        self.assertIn("PREVIEW_ON",{i["code"] for i in result["errors"]})
        self.assertFalse({i["code"] for i in result["errors"]}&{"BROKEN_WORD_LINK","EMPTY_TEXT"})

    def test_repeat_ratio_is_measured_by_headword_not_word_id(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo";agent.demo(out)
            book=agent.build_package(out);book["book"]["category"]="cet4"
            shelf=[{"category":"cet4","headword":"message","partOfSpeech":"n.","meaningZh":"消息"}]
            result=agent.validate_package(book,shelf)
            self.assertEqual(result["metrics"]["crossBookRepeatRatio"],1)
            self.assertIn("CET4_CROSSBOOK_RATIO",{x["code"] for x in result["errors"]})

    def test_no_shelf_cannot_claim_cet4_repetition(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/"demo";agent.demo(out)
            book=agent.build_package(out);book["book"]["category"]="cet4"
            result=agent.validate_package(book,[])
            self.assertIsNone(result["metrics"]["crossBookRepeatRatio"])
            self.assertIn("NO_PUBLISHED_SHELF",{x["code"] for x in result["errors"]})

    def test_refuses_nonempty_user_project_directory(self):
        from argparse import Namespace
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/"dont-delete.txt").write_text("important")
            args=Namespace(category="cet4",title="不覆盖",genre="原创",chapters=8,words=130,min_chars=700,out=str(p),shelf=None,lexicon=None)
            with self.assertRaises(ValueError):agent.make_config(args)
            self.assertEqual((p/"dont-delete.txt").read_text(),"important")

if __name__=="__main__":unittest.main()