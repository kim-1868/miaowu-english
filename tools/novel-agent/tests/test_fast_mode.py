import json
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import novel_agent as a

class FastModePipelineTests(unittest.TestCase):
    def test_fast_mode_groups_calls_and_resume_protects_finished_chapters(self):
        with tempfile.TemporaryDirectory() as tmp:
            project=Path(tmp)/'book'
            a.make_config(Namespace(title='模拟四章',genre='悬疑',category='cet6',chapters=4,
                                   words=10,min_chars=0,out=str(project),shelf=None,lexicon=None))
            cfg=a.read_json(project/'config.json');cfg['storyGateVersion']=1;a.write_json(project/'config.json',cfg)
            tasks=[]
            def fake_codex(pr,task,prompt,output):
                tasks.append(task)
                if task.startswith('故事大纲'):
                    a.write_json(pr/'outline.json',{'title':'模拟四章','description':'测试大纲','chapters':[
                        {'number':i,'title':f'第{i}章','beat':'发现新线索并行动','turn':'产生新后果'} for i in range(1,5)]})
                    a.write_json(pr/'vocab_plan.json',[
                        {'headword':f'word{i}','partOfSpeech':'n.','meaningZh':f'词义{i}','plannedChapters':[i%4+1]}
                        for i in range(10)])
                elif task.startswith('逐义项词卡'):
                    inp=a.read_json(pr/'cards'/'input_001.json')
                    a.write_json(output,[{'id':w['id'],'headword':w['headword'],
                        'partOfSpeech':w['partOfSpeech'],'meaningZh':w['meaningZh'],
                        'phoneticUk':'/wɜːd/','phoneticUs':'/wɜːrd/',
                        'exampleEn':'A word appeared in the story.', 'exampleZh':'故事里出现了一个词。',
                        'collocations':[{'en':'new word','zh':'新单词'}]} for w in inp])
                elif task.startswith('连写第'):
                    # Mock model must write separate files even though single call.
                    assert '本次仅修改' in prompt
                    start,end=[int(x) for x in task.replace('连写第','').replace('章','').split('-')]
                    for no in range(start,end+1):
                        self.make_chapter(pr,no)
                elif task.startswith('独立复核第'):
                    start,end=[int(x) for x in task.replace('独立复核第','').replace('章','').split('-')]
                    for no in range(start,end+1):
                        ins=a.read_json(pr/'review'/f'input_ch{no:02d}.json')
                        a.write_json(pr/'review'/f'ch{no:02d}.json',{'chapterNumber':no,'cards':[
                           {'wordId':wid,'verdict':'pass','severity':'none','reason':'mock','suggestion':''}
                           for wid in ins['requiredIds']], 'storyIssues':[], 'note':'模拟 QA'})
                elif task.startswith('创作第'):
                    no=int(task.replace('创作第','').replace('章',''))
                    self.make_chapter(pr,no)
                else:
                    raise AssertionError(task)
                self.assertTrue(output.exists())
            with patch.object(a,'codex_run',side_effect=fake_codex):
                a.run_agent(project,'all',fast=True)
                self.assertEqual(len(tasks),6) # 1 outline + 1 card + 2 chap pairs + 2 review pairs
                count=len(tasks)
                a.run_agent(project,'all',fast=True)
                self.assertEqual(len(tasks),count)
            qa=a.read_json(project/'output'/'QA.json')
            self.assertTrue(qa['metrics']['aiReviewCompleted'])
            self.assertFalse(qa['metrics']['humanReviewCompleted'])
            self.assertTrue(list(project.glob('WordLetter_*.zip')))

    def make_chapter(self,pr,no):
        cfg=a.read_json(pr/'config.json')
        w=a.read_json(pr/'cards'/'merged.json')[(no-1)%10]
        a.write_json(pr/'chapters'/f'ch{no:02d}.json',{'id':cfg['bookId']+f'-ch{no:02d}',
           'number':no,'title':f'第{no}章','preview':False,
           'paragraphs':[{'segments':[{'text':'她沿着线索走进房间，看到了'},
                                     {'wordId':w['id'],'surface':w['headword'],'gloss':w['meaningZh']},
                                     {'text':'，终于发现关键证据。'}]}]})

    def test_existing_v1_partial_project_resumes_without_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            pr=Path(tmp)/'book'
            a.make_config(Namespace(title='兼容',genre='悬疑',category='cet6',chapters=4,words=10,min_chars=0,
                                    out=str(pr),shelf=None,lexicon=None))
            cfg=a.read_json(pr/'config.json');cfg['storyGateVersion']=1;a.write_json(pr/'config.json',cfg)
            a.write_json(pr/'outline.json',{'title':'兼容','chapters':[
                {'number':i,'title':str(i),'beat':'具体','turn':'转折'} for i in range(1,5)]})
            a.write_json(pr/'vocab_plan.json',[{'headword':f'w{i}','partOfSpeech':'n.',
                    'meaningZh':f'义{i}','plannedChapters':[i%4+1]} for i in range(10)])
            _,vocab=a.validate_plan(pr)
            a.write_json(pr/'cards'/'merged.json',[{'id':w['id'],'headword':w['headword'],
                'phoneticUk':'/wɜːd/','phoneticUs':'/wɜːrd/','partOfSpeech':'n.',
                'meaningZh':w['meaningZh'],'exampleEn':'It was found.','exampleZh':'找到了。',
                'collocations':[{'en':'known fact','zh':'已知事实'}]} for w in vocab])
            self.make_chapter(pr,1)
            self.make_chapter(pr,2)
            old= (pr/'chapters'/'ch02.json').read_bytes()
            tasks=[]
            def fake(p,task,prompt,out):
                tasks.append(task)
                if task.startswith('连写第'):
                    for no in (3,4):self.make_chapter(p,no)
                elif task.startswith('独立复核第'):
                    start,end=[int(x) for x in task.replace('独立复核第','').replace('章','').split('-')]
                    for no in range(start,end+1):
                        ins=a.read_json(p/'review'/f'input_ch{no:02d}.json')
                        a.write_json(p/'review'/f'ch{no:02d}.json',{'chapterNumber':no,'cards':[
                            {'wordId':w,'verdict':'pass','severity':'none','reason':'mock','suggestion':''}
                            for w in ins['requiredIds']],'storyIssues':[],'note':'mock'})
                else:raise AssertionError(task)
                self.assertTrue(out.exists())
            with patch.object(a,'codex_run',side_effect=fake):
                a.run_agent(pr,'all',fast=True)
            self.assertEqual((pr/'chapters'/'ch02.json').read_bytes(),old)
            self.assertEqual(tasks,['连写第3-4章','独立复核第1-2章','独立复核第3-4章'])

if __name__=='__main__':unittest.main()