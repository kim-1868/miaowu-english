# -*- coding: utf-8 -*-
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import factory_v2 as f
import novel_agent as a
from test_story_gate import outline,critique


class BatchV2Tests(unittest.TestCase):
    def lex(self,root,n=100):
        p=Path(root)/'words.csv'
        with p.open('w',encoding='utf-8',newline='') as h:
            wr=csv.writer(h);wr.writerow(['rank','headword','source_status'])
            for i in range(1,n+1):
                suffix=chr(97+(i//26)%26)+chr(97+i%26)
                wr.writerow([i,f'word{suffix}','reference_unverified'])
        return p

    def test_real_reference_wordlist_top1500(self):
        p=Path(__file__).resolve().parents[1]/'data'/'postgrad_top1500_unverified.csv'
        if not p.is_file():self.skipTest('本机安装包提供第三方参考词表，GitHub公开代码不附带原始词表衍生排名')
        x=f.load_lexicon(p,1,1500)
        self.assertEqual(len(x['entries']),1500)
        self.assertTrue(all(x['sourceStatus']!='dictionary_verified' for x in x['entries']))

    def test_input_validation_and_lexicon_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=self.lex(tmp)
            b=f.create_batch(out=Path(tmp)/'batch',category='postgrad',lexicon=source,
                             count=3,chapters=2,words=20,first=1,last=60,min_chars=500)
            cfg=f._jread(b/'batch.json');self.assertTrue(cfg['lexiconLocked'])
            allocations=f._jread(b/'allocations.json')
            self.assertEqual(len(allocations),3)
            self.assertEqual([x['count'] for x in allocations],[20]*3)
            # Repetition is controlled and plan coverage is REAL, not sum of book targets.
            self.assertLessEqual(f._jread(b/'planning_summary.json')['uniqueAllocatedHeadwords'],60)
            with self.assertRaises(ValueError):
                f.create_batch(out=b,category='postgrad',lexicon=source,count=2,words=20)
            with self.assertRaises(ValueError):
                f.create_batch(out=Path(tmp)/'too_many',category='postgrad',lexicon=source,
                               count=1,words=80,first=1,last=60)

    def test_out_of_scope_is_p0(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            f._jwrite(p/'assigned_words.json',{'headwords':[{'headword':'evidence'}]*10})
            f._jwrite(p/'vocab_plan.json',[{'headword':'outside'}])
            with self.assertRaisesRegex(ValueError,'锁定词表以外'):
                f.check_vocab_scope(p)
            self.assertEqual(f._jread(p/'lexicon_scope_fail.json')['status'],'P0_BLOCKED')

    def test_reader_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            f._jwrite(p/'config.json',{'chapters':2})
            for n in (1,2):f._jwrite(p/'chapters'/f'ch{n:02d}.json',{'number':n,'paragraphs':[]})
            base={'verdict':'pass','scores':{'hook':18,'character':18,'causality':19,'pace':18,'payoff':17},
                  'chapterFindings':[{'number':i,'evidence':'主角追查导致实质后果','problem':'某处对白稍显冗长',
                                      'revision':'删去重复解释并展示行动','readingMomentum':'行动会带来下一章风险'} for i in (1,2)],'issues':[]}
            f._jwrite(p/'reader_review.json',base)
            self.assertEqual(f.validate_reader_review(p)['status'],'AI_READER_PRECHECK_PASS')
            base['issues']=[{'severity':'P0','evidence':'x','chapter':1,'problem':'plot hole','fix':'revise'}]
            f._jwrite(p/'reader_review.json',base)
            self.assertEqual(f.validate_reader_review(p)['status'],'AI_READER_PRECHECK_BLOCKED')

    def test_batch_end_to_end_with_mock_codex_and_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);source=self.lex(tmp,80)
            batch=f.create_batch(out=base/'batch',category='postgrad',lexicon=source,count=2,
                                 chapters=2,words=12,first=1,last=40,min_chars=500)
            calls=[]
            def fake(project,task,prompt,output):
                calls.append(task)
                if output.name=='concepts.json':
                    cfg=f._jread(project/'batch.json')
                    f._jwrite(output,[{'index':i,'title':f'第{i}部独特故事','genre':cfg['perBookGenres'][i-1],
                                      'premise':f'主人公主动改变生活并因此面对一个不可逆转的决定：情节{i}',
                                      'distinctiveHook':f'前后两条线索相互验证的具体机制{i}',
                                      'conflict':f'独立角色双方目标发生直接冲突{i}',
                                      'endingPromise':f'在结局回收所有核心承诺{i}',
                                      'readingMotivation':f'结尾出现真正有后果的新抉择{i}'} for i in (1,2)])
                elif task.startswith('原创剧情方案'):
                    value=outline(2);value['title']=f._jread(project/'config.json')['title'];f._jwrite(output,value)
                elif task.startswith('独立剧情主编审核'):
                    f._jwrite(output,critique(2))
                elif task.startswith('锁定词表下的剧情选词'):
                    words=f._jread(project/'assigned_words.json')['headwords']
                    f._jwrite(output,[{'headword':row['headword'],'partOfSpeech':'n.',
                                     'meaningZh':'词条含义','sourceStatus':'reference_unverified',
                                     'plannedChapters':[1 if i<6 else 2]} for i,row in enumerate(words)])
                elif task.startswith('逐义项词卡'):
                    ix=1
                    i=f._jread(project/'cards'/f'input_{ix:03d}.json')
                    f._jwrite(output,[{'id':w['id'],'headword':w['headword'],'phoneticUk':'/wɜːd/',
                                       'phoneticUs':'/wɜːd/','partOfSpeech':w['partOfSpeech'],
                                       'meaningZh':w['meaningZh'],'exampleEn':'The word appears in the story.',
                                       'exampleZh':'词语出现在故事中。',
                                       'collocations':[{'en':'a common word','zh':'常见词汇'}]} for w in i])
                elif task.startswith('连写第') or task.startswith('创作第'):
                    nums=(1,2) if task.startswith('连写第') else (int(task.replace('创作第','').replace('章','')),)
                    plan=f._jread(project/'vocab_plan.json')
                    for n in nums:
                        chosen=plan[:6] if n==1 else plan[6:]
                        segments=[{'text':'主角在危机中作出了真正有后果的决定，发现了一个'}]
                        for w in chosen:
                            segments +=[{'wordId':w['id'],'surface':w['headword'],'gloss':w['meaningZh']},{'text':'，并决定继续推进'}]
                        f._jwrite(project/'chapters'/f'ch{n:02d}.json',{
                            'id':f._jread(project/'config.json')['bookId']+f'-ch{n:02d}',
                            'number':n,'title':f'第{n}章','preview':False,'paragraphs':[{'segments':segments}]})
                elif task.startswith('独立复核第'):
                    nums=(1,2)
                    for n in nums:
                        ids=f._jread(project/'review'/f'input_ch{n:02d}.json')['requiredIds']
                        f._jwrite(project/'review'/f'ch{n:02d}.json',{'chapterNumber':n,
                                 'cards':[{'wordId':wid,'verdict':'pass','severity':'none','reason':'mock only','suggestion':''} for wid in ids],
                                 'storyIssues':[],'note':'mock only'})
                elif task.startswith('独立整书读者盲审'):
                    f._jwrite(output,{'verdict':'pass','scores':{'hook':18,'character':18,'causality':18,'pace':18,'payoff':17},
                      'chapterFindings':[{'number':i,'evidence':'主角决定改变了故事局势','problem':'对白需要压缩',
                        'revision':'删掉重复的说明','readingMomentum':'故事风险持续升级'} for i in (1,2)],
                      'issues':[],'overall':'模拟独立审核，不等于真实读者评价'})
                else:raise AssertionError('Unexpected fake task '+task)
                self.assertTrue(output.is_file(),task)
            first=f.run_batch(batch,runner=fake)
            self.assertEqual(first['candidatePackageCount'],2)
            self.assertEqual(first['actualDistinctLockedHeadwords'],f._jread(batch/'planning_summary.json')['uniqueAllocatedHeadwords'])
            self.assertTrue((batch/'整批质量报告.md').is_file())
            for i in (1,2):
                project=batch/'books'/f'{i:02d}'
                self.assertTrue((project/'output'/'出版台导入包.json').exists())
                self.assertTrue((project/'output'/'整书读者盲审报告.json').exists())
                qa=f._jread(project/'output'/'QA.json')
                self.assertFalse(qa['metrics']['readyToPublish'])
                self.assertEqual(qa['metrics']['readerGateStatus'],'AI_READER_PRECHECK_PASS')
                self.assertTrue(list(project.glob('WordLetter_*.zip')))
            old=len(calls)
            f.run_batch(batch,runner=fake)
            self.assertEqual(len(calls),old)
            self.assertEqual(f._jread(batch/'state.json')['status'],'candidate_packages_complete')
            aggregate=f.export_batch(batch)
            self.assertTrue(aggregate.is_file())
            # Post-review edits must not silently inherit prior AI review and candidate approval.
            ch=batch/'books'/'01'/'chapters'/'ch01.json'
            obj=f._jread(ch);obj['title']='人工修改后须重新审核';f._jwrite(ch,obj)
            with self.assertRaisesRegex(ValueError,'审核失效'):
                f.run_batch(batch,runner=fake)

if __name__=='__main__':unittest.main()