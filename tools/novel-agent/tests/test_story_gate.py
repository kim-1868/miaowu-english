# -*- coding: utf-8 -*-
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import story_gate
import novel_agent


def outline(n=3):
    chapters=[]
    for i in range(1,n+1):
        chapters.append({
          'number':i,'title':f'第{i}章 夜访档案室',
          'beat':f'线索从档案室的藏书票转向了第{i}位证人，主角必须用现场证据证实真实的事件顺序。',
          'turn':f'证人承认第{i}次报警不是意外，而且证词存在关键缺口。',
          'goal':f'取回第{i}封证词原件并与旧档案对比。',
          'obstacle':f'警卫拦截且第{i}名证人坚持沉默。',
          'decision':f'主角冒失去工作的风险公开自己掌握的线索{i}。',
          'consequence':f'身份被对方识破，后续证据收集的风险增加{i}。',
          'newInformation':f'从电话录音中定位第{i}个出入时间矛盾。',
          'hook':f'谁在第{i}次记录中替主角签下了姓名？',
          'causalLink':f'由于第{i-1}次报告中出现新的证词破绽。'
        })
    return {'title':'钟楼暗格','description':'被遗忘的档案牵出八年前的错案。',
        'storyBible':{
          'storyPromise':'主角能够揭开八年前事故的真正原因并保住家人清白吗？',
          'centralConflict':'城市档案馆即将销毁卷宗，保管人阻止主角公开调查的证据。',
          'stakes':'如果三日内无法找到原件，证人将被追责且主角失去唯一的申诉机会。',
          'distinctiveElement':'每封信都是不同证人的投递记录，与钟楼报时发生可计算的冲突。',
          'endingPayoff':'主角通过提前布下的记时证据拆穿伪造记录，终于救出被陷害的人。',
          'characters':[{'name':'陆晴','want':'在档案销毁前恢复父亲名誉','fear':'无法让母亲等到公正判决','flaw':'太相信记录而忽视人的证词','change':'懂得面对证人并承担自己的责任'},
           {'name':'周砚','want':'阻止无辜同事被错误定罪','fear':'说出当年真相将失去自己职位','flaw':'习惯通过沉默回避家人矛盾','change':'决定冒失业风险公开完整时间线'}]},
        'chapters':chapters}


def critique(n=3, pass_score=True):
    scores={'openingHook':18,'characterMotivation':19,'causalProgression':24,'conflictAndStakes':18,'originalityAndPayoff':14}
    if not pass_score:scores['causalProgression']=5
    return {'verdict':'pass' if pass_score else 'revise','scores':scores,
      'chapterComments':[{'chapter':i,'evidence':f'现场的第{i}封证词影响事件顺序','finding':f'第{i}章信息可导致下一章行动变化'} for i in range(1,n+1)],
      'issues':[] if pass_score else [{'severity':'P1','chapter':2,'evidence':'主角突然找到证据','why':'缺乏前因','fix':'让证人带来新信息'}],
      'editorNote':'人物为澄清旧案付出可观察的现实代价，最后会兑现开篇的原件争夺悬念。'}

class StoryGateTest(unittest.TestCase):
    def test_outline_gate_requires_causal_events_and_bible(self):
        self.assertEqual(story_gate.outline_issues(outline(),3),[])
        bad=outline();bad['chapters'][1]['beat']=bad['chapters'][0]['beat'];bad['chapters'][1]['decision']='继续调查'
        issues=story_gate.outline_issues(bad,3)
        self.assertTrue(any('重复' in x for x in issues))
        self.assertTrue(any('decision' in x for x in issues))
        self.assertTrue(story_gate.outline_issues({'chapters':[]},3))

    def test_score_requires_evidence_not_only_number(self):
        self.assertEqual(story_gate.critique_issues(critique(),3),[])
        self.assertTrue(story_gate.critique_issues(critique(pass_score=False),3))
        x=critique();x['chapterComments'][1]['evidence']='好';self.assertTrue(story_gate.critique_issues(x,3))

    def test_story_gate_before_vocabulary_and_retry(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);novel_agent.write_json(p/'config.json',{'chapters':3,'category':'cet4','title':'钟楼暗格','genre':'悬疑','targetUniqueWords':20})
            calls=[]
            def runner(project,task,prompt,output):
                calls.append(task)
                if output.name=='outline.json':novel_agent.write_json(output,outline())
                elif output.name=='story_review.json':novel_agent.write_json(output,critique())
                else:raise AssertionError('unexpected output')
            story_gate.ensure_story_ready(p,runner)
            self.assertEqual(len(calls),2)
            self.assertEqual(novel_agent.read_json(p/'story_gate_report.json')['status'],'AI_outline_precheck_passed')
            self.assertFalse((p/'vocab_plan.json').exists())
            self.assertTrue(story_gate.approved(p))
            modified=outline();modified['chapters'][0]['hook']='为什么真正的证词突然被匿名寄到母亲手中？'
            novel_agent.write_json(p/'outline.json',modified)
            self.assertFalse(story_gate.approved(p))

    def test_hard_fail_before_vocabulary_on_editorial_block(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);novel_agent.write_json(p/'config.json',{'chapters':3,'category':'cet4','title':'钟楼暗格','genre':'悬疑','targetUniqueWords':20})
            def runner(project,task,prompt,output):
                if output.name=='outline.json':novel_agent.write_json(output,outline())
                elif output.name=='story_review.json':novel_agent.write_json(output,critique(pass_score=False))
            with self.assertRaises(RuntimeError):story_gate.ensure_story_ready(p,runner,max_revisions=0)
            self.assertEqual(novel_agent.read_json(p/'story_gate_report.json')['status'],'blocked')
            self.assertFalse((p/'vocab_plan.json').exists())

if __name__=='__main__':unittest.main()

# The following test runs the new V1.1 end-to-end orchestration with a fake model;
# it verifies a stage dependency, not narrative quality or real Codex availability.
from argparse import Namespace
from unittest.mock import patch
class StoryGateIntegrationTest(unittest.TestCase):
    def test_new_project_gates_story_before_words_then_packages(self):
        with tempfile.TemporaryDirectory() as d:
            pr=Path(d)/'book'
            novel_agent.make_config(Namespace(title='钟楼暗格',genre='悬疑',category='cet6',chapters=2,words=10,min_chars=0,out=str(pr),shelf=None,lexicon=None))
            self.assertEqual(novel_agent.read_json(pr/'config.json')['storyGateVersion'],2)
            calls=[]
            def run_fake(project,task,prompt,output):
                calls.append(task)
                if task.startswith('原创剧情方案'):
                    novel_agent.write_json(output,outline(2))
                elif task.startswith('独立剧情主编审核'):
                    novel_agent.write_json(output,critique(2))
                elif task.startswith('通过剧情预审后规划词汇'):
                    novel_agent.write_json(output,[{'headword':f'item{i}','partOfSpeech':'n.','meaningZh':f'条目{i}','plannedChapters':[1 if i<5 else 2]} for i in range(10)])
                elif task.startswith('逐义项词卡'):
                    inp=novel_agent.read_json(project/'cards'/'input_001.json')
                    novel_agent.write_json(output,[{'id':x['id'],'headword':x['headword'],'partOfSpeech':x['partOfSpeech'],'meaningZh':x['meaningZh'],'phoneticUk':'/ˈaɪtəm/','phoneticUs':'/ˈaɪtəm/','exampleEn':f"The {x['headword']} was found.",'exampleZh':'找到了条目。','collocations':[{'en':'sample item','zh':'样本条目'}]} for x in inp])
                elif task.startswith('创作第'):
                    n=int(task.replace('创作第','').replace('章',''))
                    plan=novel_agent.read_json(project/'vocab_plan.json')
                    seg=[{'text':'她在房间里找到一份'}]
                    for w in plan[:5] if n==1 else plan[5:]:
                        seg.extend([{'wordId':w['id'],'surface':w['headword'],'gloss':w['meaningZh']},{'text':'，于是继续查找'}])
                    novel_agent.write_json(output,{'id':novel_agent.read_json(project/'config.json')['bookId']+f'-ch{n:02d}','number':n,'title':f'第{n}章','preview':False,'paragraphs':[{'segments':seg}]})
                elif task.startswith('独立复核第'):
                    n=int(task.replace('独立复核第','').replace('章',''))
                    ids=novel_agent.read_json(project/'review'/f'input_ch{n:02d}.json')['requiredIds']
                    novel_agent.write_json(output,{'chapterNumber':n,'cards':[{'wordId':k,'verdict':'pass','severity':'none','reason':'模拟','suggestion':''} for k in ids],'storyIssues':[],'note':'mock only'})
                else:raise AssertionError('unexpected '+task)
            with patch.object(novel_agent,'codex_run',side_effect=run_fake):
                novel_agent.run_agent(pr,'all')
                count=len(calls)
                novel_agent.run_agent(pr,'all')
                self.assertEqual(len(calls),count)
            self.assertEqual(calls[:3],['原创剧情方案（先不选词）','独立剧情主编审核','通过剧情预审后规划词汇'])
            qa=novel_agent.read_json(pr/'output'/'QA.json')
            self.assertTrue(qa['metrics']['storyOutlineAIPrecheckPassed'])
            self.assertFalse(qa['metrics']['humanReviewCompleted'])
            self.assertTrue((pr/'output'/'独立大纲审核.json').is_file())