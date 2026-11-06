import json
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import novel_agent as a


class PipelineWithoutRealModelTest(unittest.TestCase):
    """Simulate a complying Codex process so pipeline/packaging can be tested offline.
    This does NOT imply live Codex was connected or linguistic AI quality passed.
    """
    def test_all_stages_resume_and_pack(self):
        calls=[]
        with tempfile.TemporaryDirectory() as tmp:
            pr=Path(tmp)/"book"
            a.make_config(Namespace(title="演示独创",genre="悬疑",category="cet6",chapters=2,words=10,
                                    min_chars=0,out=str(pr),shelf=None,lexicon=None))
            def fake_codex(project,task,prompt,output):
                calls.append(task)
                if task.startswith("故事大纲"):
                    a.write_json(project/"outline.json",{"title":"演示独创","description":"用于测试模型分段输出结构", "chapters":[
                        {"number":1,"title":"第一章","beat":"出现信件","turn":"发现线索"},
                        {"number":2,"title":"第二章","beat":"核实线索","turn":"找出原因"}]})
                    a.write_json(project/"vocab_plan.json",[
                        {"headword":f"item{i}","partOfSpeech":"n.","meaningZh":f"项目{i}","plannedChapters":[1 if i<5 else 2]}
                        for i in range(10)])
                elif task.startswith("逐义项词卡"):
                    inp=a.read_json(project/"cards"/"input_001.json")
                    a.write_json(output,[{"id":x["id"],"headword":x["headword"],"partOfSpeech":x["partOfSpeech"],
                                  "meaningZh":x["meaningZh"],"phoneticUk":"/ˈaɪtəm/","phoneticUs":"/ˈaɪtəm/",
                                  "exampleEn":f"The {x['headword']} was found.","exampleZh":"找到了该项目。",
                                  "collocations":[{"en":"important item","zh":"重要项目"}]} for x in inp])
                elif task.startswith("创作第"):
                    n=int(task.replace("创作第","").replace("章",""))
                    plan=a.read_json(project/"vocab_plan.json")
                    c=plan[:5] if n==1 else plan[5:]
                    seg=[{"text":"她打开文件并发现了一个"}]
                    for w in c:
                        seg.extend([{"wordId":w["id"],"surface":w["headword"],"gloss":w["meaningZh"]},{"text":"，继续查阅"}])
                    a.write_json(output,{"id":a.read_json(project/"config.json")["bookId"]+f"-ch{n:02d}","number":n,
                                         "title":f"第{n}章","preview":False,"paragraphs":[{"segments":seg}]})
                elif task.startswith("独立复核第"):
                    n=int(task.replace("独立复核第","").replace("章",""))
                    ins=a.read_json(project/"review"/f"input_ch{n:02d}.json")
                    a.write_json(output,{"chapterNumber":n,"cards":[{"wordId":w,"verdict":"pass","severity":"none","reason":"模拟结构审查","suggestion":""} for w in ins["requiredIds"]],
                                         "storyIssues":[],"note":"模拟审稿，并非真正通过"})
                else:
                    raise AssertionError(task)
                self.assertTrue(output.exists())
            with patch.object(a,"codex_run",side_effect=fake_codex):
                a.run_agent(pr,"all",22)
                self.assertEqual(len(calls),6)
                a.run_agent(pr,"all",22)  # idempotent resume: no extra generation
                self.assertEqual(len(calls),6)
            qa=a.read_json(pr/"output"/"QA.json")
            self.assertEqual(qa["metrics"]["usedWordCardIds"],10)
            self.assertTrue(qa["metrics"]["aiReviewCompleted"])
            self.assertFalse(qa["metrics"]["humanReviewCompleted"])
            self.assertFalse(qa["metrics"]["liveImporterValidated"])
            self.assertEqual(len(qa["errors"]),0)
            self.assertTrue((pr/"output"/"候选词与义项台账.csv").exists())
            self.assertTrue((pr/"output"/"修订日志与检查清单.md").exists())
            self.assertTrue(list(pr.glob("WordLetter_*.zip")))

if __name__=="__main__":unittest.main()