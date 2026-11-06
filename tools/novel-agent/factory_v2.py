#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WordLetter V2: locked-word-list batch planner and resumable Codex fiction factory.

Local-only. No external Python dependencies. Does not upload/publish content.
No production database, checkout, secret or user record access.
"""
from __future__ import annotations

import argparse
import contextlib
import csv
import datetime as dt
import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import zipfile
from collections import Counter
from pathlib import Path

import novel_agent as na
import story_gate

HERE=Path(__file__).resolve().parent
DEFAULT_POSTGRAD=HERE/'data'/'postgrad_top1500_unverified.csv'
CATEGORIES={'cet4':'大学英语四级','cet6':'大学英语六级','postgrad':'考研英语','ielts':'雅思'}
GENRES=['原创都市悬疑','现代言情','双男主成长','都市逆袭','奇幻冒险','女性成长','职场悬疑','现实治愈','科幻推理','家庭群像']
HDR_ALIASES={'headword':['headword','word','lemma','单词','词目','词汇','英文'],
             'rank':['rank','词频排名','排名','frequency_rank','frequencyRank','序号'],
             'pos':['pos','partOfSpeech','part_of_speech','词性'],
             'meaning':['meaningZh','meaning_zh','中文释义','释义','含义'],
             'status':['source_status','sourceStatus','审核状态']}
VALID_HEAD=re.compile(r"[a-z][a-z '-]{0,63}$")


def _stamp():return dt.datetime.now().strftime('%Y%m%d-%H%M%S')
def _now():return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def _hash_file(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(65536),b''):h.update(chunk)
    return h.hexdigest()
def _norm(s):return str(s or '').strip().lower()
def _jread(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def _jwrite(p,v):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    temp=p.with_suffix(p.suffix+'.tmp')
    temp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    os.replace(temp,p)
def _fingerprint(obj):return hashlib.sha256(json.dumps(obj,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def _valid_json_file(p):
    try:return bool(Path(p).is_file() and _jread(p) is not None)
    except (OSError,ValueError):return False


def load_lexicon(path,first=1,last=1500):
    """Read an authorized CSV/TSV or plain headword TXT. Nonexistent/unknown rows fail closed.
    OCR-derived gloss/IPA are intentionally NOT used as teaching definitions.
    """
    path=Path(path).expanduser().resolve()
    if not path.is_file():raise ValueError('词表文件不存在：'+str(path))
    if not (1<=first<=last<=200000):raise ValueError('词频范围必须是正整数且起始不大于结束')
    rows=[]
    if path.suffix.lower() in ('.csv','.tsv'):
        with path.open('r',encoding='utf-8-sig',newline='') as f:
            dialect='excel-tab' if path.suffix.lower()=='.tsv' else 'excel'
            dr=csv.DictReader(f,dialect=dialect)
            if not dr.fieldnames:raise ValueError('词表没有表头')
            names={str(n or '').strip().casefold():n for n in dr.fieldnames}
            def get(row,name):
                for field in HDR_ALIASES[name]:
                    if field.casefold() in names:return str(row.get(names[field.casefold()]) or '').strip()
                return ''
            if not any(x.casefold() in names for x in HDR_ALIASES['headword']):
                raise ValueError('词表必须含 headword/word/单词 列')
            for i,row in enumerate(dr,1):
                if not isinstance(row,dict):continue
                hw=_norm(get(row,'headword'))
                rank_raw=get(row,'rank')
                try: rank=int(rank_raw) if rank_raw else i
                except ValueError:continue
                if rank<first or rank>last:continue
                rows.append({'rank':rank,'headword':hw,'posHint':get(row,'pos')[:48],
                             'meaningHint':get(row,'meaning')[:160],
                             'sourceStatus':(get(row,'status') or 'user_reference_unverified')[:80]})
    elif path.suffix.lower()=='.txt':
        for i,line in enumerate(path.read_text(encoding='utf-8-sig').splitlines(),1):
            word=_norm(line.split('#',1)[0])
            if not word:continue
            if first<=i<=last:rows.append({'rank':i,'headword':word,'posHint':'','meaningHint':'',
                                            'sourceStatus':'user_reference_unverified'})
    else:raise ValueError('当前只支持 CSV/TSV/TXT。PDF 请先转换为 CSV；不要直接凭 OCR 生成正式词卡')
    unique={};skips=[]
    for row in rows:
        hw=row['headword']
        if not VALID_HEAD.fullmatch(hw):
            skips.append({'rank':row['rank'],'headword':hw,'reason':'非单词/包含异常字符，待人工处理'});continue
        if hw in unique:continue
        unique[hw]=row
    ordered=sorted(unique.values(),key=lambda x:(x['rank'],x['headword']))
    if len(ordered)<10:raise ValueError(f'选定范围内有效的不同英文词目只有 {len(ordered)} 个，至少需要10个')
    return {'sourceFilename':path.name,'sourceSha256':_hash_file(path),'range':[first,last],
            'entries':ordered,'skippedExamples':skips[:80], 'skippedCount':len(skips),
            'warning':'外部参考词表未完成考试来源/音标/释义权威核验；仅锁定目标 headword，不把原始释义和音标直接用于教学'}


def _choose(pool,used,set_this,n):
    selected=[]
    for row in pool:
        h=row['headword']
        if h in set_this:continue
        selected.append(row);set_this.add(h)
        if len(selected)==n:break
    return selected


def allocate(entries,book_count,words_per_book,category,shelf=None,repeat_rate=.20):
    """Whole-batch deterministic allocation; no bogus percent claims.

    CET4 published-shelf repetition target 35% *when possible*; other grades use
    explicit adjustable internal batch-reinforcement guidance only.
    """
    shelf_heads={_norm(w.get('headword')) for w in (shelf or []) if w.get('category')==category}
    seen=Counter(); assignments=[]; warnings=[]
    allrows=sorted(entries,key=lambda x:(x['rank'],x['headword']))
    by_h={x['headword']:x for x in allrows}
    if len(allrows)<words_per_book:
        raise ValueError(f'词表范围只有{len(allrows)}词，少于每本要求的{words_per_book}个不同词')
    for i in range(book_count):
        chosen=[];within=set()
        if category=='cet4':
            desired=round(words_per_book*.35)
            old=[x for x in allrows if x['headword'] in shelf_heads]
            old.sort(key=lambda x:(seen[x['headword']],x['rank']))
            chosen+=_choose(old,seen,within,desired)
            if len(chosen)<desired:
                warnings.append(f'第{i+1}本：已发布四级书架与当前锁定词表只匹配到{len(chosen)}个旧词；不能保证35%')
            fresh=[x for x in allrows if x['headword'] not in shelf_heads]
            fresh.sort(key=lambda x:(seen[x['headword']],x['rank']))
            chosen+=_choose(fresh,seen,within,words_per_book-len(chosen))
        else:
            # Intentional batch repetition is a planning preference, NOT an exam rule.
            desired=0 if i==0 else round(words_per_book*repeat_rate)
            old=[x for x in allrows if seen[x['headword']]>0]
            old.sort(key=lambda x:(seen[x['headword']],x['rank']))
            chosen+=_choose(old,seen,within,desired)
            fresh=[x for x in allrows if seen[x['headword']]==0]
            chosen+=_choose(fresh,seen,within,words_per_book-len(chosen))
        if len(chosen)<words_per_book:
            rest=sorted(allrows,key=lambda x:(seen[x['headword']],x['rank']))
            chosen+=_choose(rest,seen,within,words_per_book-len(chosen))
        if len(chosen)<words_per_book:raise AssertionError('无法在锁定词库中为该书分配足够的不同词目')
        was_seen=sum(1 for x in chosen if seen[x['headword']]>0)
        was_shelf=sum(1 for x in chosen if x['headword'] in shelf_heads)
        for x in chosen:seen[x['headword']]+=1
        assignments.append({'index':i+1,'assigned':chosen,'count':len(chosen),
                            'publishedShelfOverlapCount':was_shelf if shelf_heads else None,
                            'publishedShelfOverlapRate':round(was_shelf/len(chosen),4) if shelf_heads else None,
                            'priorBatchOverlapCount':was_seen,'priorBatchOverlapRate':round(was_seen/len(chosen),4)})
    return assignments,{'uniqueAllocatedHeadwords':len(seen),'totalAllocatedSlots':sum(x['count'] for x in assignments),
                        'uniqueLockedHeadwords':len(allrows),'plannedBatchCoverageRate':round(len(seen)/len(allrows),4),
                        'warnings':warnings,'note':'均为规划口径，实际小说引用率和教学准确性须生成后重算'}


def create_batch(*,out,category,lexicon,count=3,chapters=10,words=110,first=1,last=1500,
                 genres=None,titles=None,repeat_rate=.20,min_chars=1250, shelf=None):
    if category not in CATEGORIES:raise ValueError('学习等级不支持')
    if not 1<=count<=12:raise ValueError('一批允许 1–12 本，请分批上线验收')
    if not 2<=chapters<=24:raise ValueError('每本章节数必须 2–24')
    if not 10<=words<=600:raise ValueError('每本目标词数必须 10–600')
    if not 0<=repeat_rate<=.8:raise ValueError('批次内复现率必须为0%–80%')
    if not 500<=min_chars<=5000:raise ValueError('章节最低汉字数需在500–5000')
    folder=Path(out).expanduser().resolve()
    if folder.exists() and any(folder.iterdir()):raise ValueError('为避免覆盖已有项目，批次目录必须为空：'+str(folder))
    lex=load_lexicon(lexicon,first,last)
    original=Path(lexicon).expanduser().resolve()
    # Keep a normalized, minimal and actually LOCKED input; never copy raw PDF.
    genres=list(genres or GENRES)
    if not genres:genres=list(GENRES)
    titles=[str(x).strip() for x in (titles or []) if str(x).strip()]
    if titles and (len(titles)!=count or len(set(titles))!=len(titles)):
        raise ValueError('指定书名时，数量必须与本批本数相同且不可重复；不填则由AI按题材原创起名')
    shelf_index=na.published_shelf(Path(shelf).expanduser().resolve() if shelf else HERE/'data'/'shelf_20261106_sanitized.json',category)
    assigns,summary=allocate(lex['entries'],count,words,category,shelf_index,repeat_rate)
    folder.mkdir(parents=True,exist_ok=True)
    cfg={'version':2,'batchId':'wlv2-'+na.sha(str(folder)+'|'+_stamp(),12),
         'createdUtc':_now(),'category':category,'bookCount':count,'chapters':chapters,
         'wordsPerBook':words,'minimumChineseCharsPerChapter':min_chars,
         'lexiconSource':lex['sourceFilename'],'lexiconSourceSha256':lex['sourceSha256'],
         'lexiconRankRange':[first,last],'lexiconLocked':True,
         'perBookGenres':[genres[i%len(genres)] for i in range(count)],'userTitles':titles,
         'batchOverlapTarget':repeat_rate if category!='cet4' else None,
         'shelfStatus':'reference_snapshot_2026-11-06_not_live',
         'publishing':'MANUAL_REVIEW_ONLY','productionDatabaseAccess':False}
    _jwrite(folder/'batch.json',cfg)
    shutil.copyfile(HERE/'STORY_GATE_STANDARD.md',folder/'STORY_GATE_STANDARD.md')
    _jwrite(folder/'lexicon_lock.json',lex)
    _jwrite(folder/'allocations.json',assigns)
    _jwrite(folder/'planning_summary.json',summary)
    _jwrite(folder/'shelf_index.json',{'status':cfg['shelfStatus'],'senses':shelf_index})
    cfg['planningFingerprint']=_fingerprint({'lexiconEntries':lex['entries'],'allocations':assigns})
    _jwrite(folder/'batch.json',cfg)
    _jwrite(folder/'state.json',{'status':'plan_ready','conceptsReady':False,'books':[],'lastUpdatedUtc':_now()})
    (folder/'books').mkdir()
    _write_batch_summary(folder)
    print(f'\n批次创建成功：{folder}\n等级：{CATEGORIES[category]} · {count}本 · 每本{chapters}章 · 词表已锁定{len(lex["entries"])}个不同词目')
    print('规划覆盖：',summary['uniqueAllocatedHeadwords'],'/',len(lex['entries']))
    for w in summary['warnings']:print('注意：',w)
    print('此时没有调用 Codex，也没有生成/发布任何小说。')
    return folder


def _write_batch_summary(batch):
    cfg=_jread(batch/'batch.json');plan=_jread(batch/'planning_summary.json')
    items=['# 妙屋英语 V2 · 整批生产规划','',f'批次：{cfg["batchId"]}',f'等级：{CATEGORIES[cfg["category"]]}',
           f'计划：{cfg["bookCount"]}本 × {cfg["chapters"]}章 × {cfg["wordsPerBook"]}个目标词目',
           f'锁定词表：{cfg["lexiconSource"]}；排名范围 {cfg["lexiconRankRange"]}',
           f'词库来源SHA256：`{cfg["lexiconSourceSha256"]}`',
           f'计划词目覆盖：{plan["uniqueAllocatedHeadwords"]}/{plan["uniqueLockedHeadwords"]} = {plan["plannedBatchCoverageRate"]*100:.1f}%',
           '', '> 提示：这是规划覆盖率，不等于正文已出现、用户已学习或真实考试词表覆盖率。','',
           '## 风险与例外', '']
    items.extend('- '+x for x in plan['warnings'])
    items.extend(['- 输入词频、音标、中文释义未获权威核验，只将英文 headword 锁定为候选范围。',
                  '- 中文故事自然度优先，可减少实际使用词数，但需报告缺口，不能造假达到目标。',
                  '- 自动化任务串行执行、不自动发布、无生产 D1 权限；上架需要人工词卡/版权/真后台校验。',''])
    (batch/'整批规划报告.md').write_text('\n'.join(items),encoding='utf-8')


def _concept_prompt(batch):
    cfg=_jread(batch/'batch.json')
    return f'''你是妙屋英语小说策划主编，任务是在一个批次中设计{cfg["bookCount"]}部**完全不同的原创可读中文小说**，只负责标题与新颖故事核心，不写词卡或正文。读取 batch.json、整批规划报告.md、story_gate 中的 STORY_GATE_STANDARD.md（可从当前目录下读取）。
各书依次采用 perBookGenres 指定的题材；如果 userTitles 非空，必须逐字保留同序号书名；如果为空才自动起独特书名。不要使用现有畅销作品的独特人物设定、桥段或世界观，不能只是换名改写。避免十本小说都靠“旧档案、秘密遗嘱、突然短信”驱动。
只写当前目录 concepts.json，JSON 格式为一个数组，元素正好 {cfg["bookCount"]} 个，必须严格按编号依次输出：
[{{"index":1,"title":"原创书名","genre":"题材","premise":"至少40字的实际事件和矛盾","distinctiveHook":"明确与其他书不同的具体机制","conflict":"人物因什么而被迫选择","endingPromise":"承诺怎样回收核心问题","readingMotivation":"为什么读者要打开第二章"}}]。
书名/人物/冲突不可重复。必须写入完整合法JSON并保存，回复只说已经写入。不生成任何版权改写、封面或可发布承诺。'''


def validate_concepts(concepts,cfg):
    if not isinstance(concepts,list) or len(concepts)!=cfg['bookCount']:raise ValueError('批次故事策划数量不匹配')
    seen=set()
    for i,co in enumerate(concepts,1):
        if not isinstance(co,dict) or co.get('index')!=i:raise ValueError('故事策划编号错误')
        name=str(co.get('title','')).strip()
        if len(name)<2 or name in seen:raise ValueError('书名为空或重复')
        seen.add(name)
        if cfg.get('userTitles') and name!=cfg['userTitles'][i-1]:
            raise ValueError('用户指定的书名不得由AI自动更改')
        for key in ('premise','distinctiveHook','conflict','endingPromise','readingMotivation'):
            if len(str(co.get(key,'' )).strip())<8:raise ValueError(f'第{i}本的{key}太空泛')
    return True


def _vocab_prompt(project):
    cfg=_jread(project/'config.json')
    lock=_jread(project/'assigned_words.json')
    n=len(lock['headwords'])
    return f'''你是专职英语词汇课程编辑，不是剧情作者。先阅读 config.json、outline.json、assigned_words.json、AGENTS.md 和 PRODUCTION_RULES.md。
小说的大纲已经过故事质量关卡，不能为塞词改变情节。你只能从 assigned_words.json 中的 {n} 个 headword 选择**教学标注词**，不许添加范围外的任何单词或其同义词作词卡。你可不用不自然的词，但必须明确少用的代价和原因；不得伪造词表覆盖。外部参考词表未人工核验，不可直接照搬不准确的原始释义、音标。
只写 vocab_plan.json 一个合法 JSON 数组，如 [{{"headword":"evidence","partOfSpeech":"n.","meaningZh":"证据","senseKey":"evidence|n.|证据","sourceStatus":"reference_candidate_unverified","plannedChapters":[1,3]}}]。
每个词只有一个针对当前书的具体主义项与词性，plannedChapters 只能在 1 到 {cfg['chapters']}；从剧情逻辑中选词，不可让正文为插词而出现“work室”“从系统missing”等硬嵌。
尽量使用大多数锁定的词，并让各章词汇均衡、核心词跨情节自然复现，仍以剧情自然和准确词义为第一优先。含歧义的 record/sign/power/leak 必须谨慎选义，不要默认所有词性共享同一读音。不得声称本词表已核对考研官方真题。'''


def check_vocab_scope(project):
    whitelist={x['headword'] for x in _jread(project/'assigned_words.json')['headwords']}
    plan=_jread(project/'vocab_plan.json')
    if not isinstance(plan,list):raise ValueError('vocab_plan.json 不是词条数组')
    present=[_norm(w.get('headword')) for w in plan if isinstance(w,dict)]
    unknown=sorted(set(present)-whitelist)
    if unknown:
        report={'status':'P0_BLOCKED','code':'OUT_OF_LOCKED_SCOPE','unknown':unknown}
        _jwrite(project/'lexicon_scope_fail.json',report)
        raise ValueError('P0：Agent 生成了锁定词表以外的目标词：'+', '.join(unknown[:15]))
    if len(set(present))!=len(present):raise ValueError('同一本小说出现重复目标 headword，需合并/区分义项')
    matched=set(present)&whitelist
    _jwrite(project/'lexicon_coverage.json',{'plannedAssigned':len(whitelist),'actualSelected':len(matched),
           'selectionRate':round(len(matched)/len(whitelist),4),
           'unusedAssigned':sorted(whitelist-matched),
           'warning':'只证明词表范围命中，不代表这些词已在小说正文中实际出现或释义正确'})
    if len(matched)<10:raise ValueError('选择使用的词目少于10个，不能进入词卡阶段')
    return matched


def _manuscript_fingerprint(project):
    cfg=_jread(project/'config.json')
    h=hashlib.sha256()
    for no in range(1,cfg['chapters']+1):
        path=project/'chapters'/f'ch{no:02d}.json'
        h.update(path.read_bytes())
    return h.hexdigest()


def _project_fingerprint(project):
    """Completed candidate approval is invalidated by any substantive source edit."""
    cfg=_jread(project/'config.json')
    files=[project/'outline.json',project/'vocab_plan.json',project/'cards'/'merged.json',
           project/'reader_review.json']
    for n in range(1,cfg['chapters']+1):
        files.extend([project/'chapters'/f'ch{n:02d}.json',project/'review'/f'ch{n:02d}.json'])
    h=hashlib.sha256()
    for path in files:
        h.update(str(path.relative_to(project)).encode());h.update(path.read_bytes())
    return h.hexdigest()


def _invalidate_stale_chapter_reviews(project):
    cfg=_jread(project/'config.json')
    for no in range(1,cfg['chapters']+1):
        old=project/'review'/f'ch{no:02d}.json'
        inp=project/'review'/f'input_ch{no:02d}.json'
        ch=project/'chapters'/f'ch{no:02d}.json'
        if old.exists() and inp.exists():
            try:
                reviewed_chapter=_jread(inp)['chapter']
                current_chapter=_jread(ch)
                if reviewed_chapter != current_chapter:
                    os.replace(old,old.with_suffix('.stale-review.json'))
                    print(f'第{no}章正文发生修改，旧AI逐章审校失效，将重新审校。')
            except (OSError,KeyError,ValueError):
                os.replace(old,old.with_suffix('.stale-review.json'))


def _reader_prompt(project):
    cfg=_jread(project/'config.json')
    paths=', '.join(f'chapters/ch{i:02d}.json' for i in range(1,cfg['chapters']+1))
    return f'''你是独立的网络小说读者评审与专业责任编辑，没有参与写作。请阅读全部 {paths}、outline.json、config.json。忽略学习词表数量，不看作者自评，也不要替作者找借口。目标是判断**去掉英文教学要求后，普通读者是否仍然想读下去**。
必须检查首章有效钩子、每章“行动→阻碍→抉择→后果”是否在正文落地、人物因果/时间线/动机、对话是否自然、解释与总结是否拖沓、同一场景是否注水重复、全书是否真正兑现结局。对每一章指出可核实的具体事实和最严重的一处可改进点，不能只是夸赞。
只写 reader_review.json，格式：
{{"verdict":"pass|revise","scores":{{"hook":0,"character":0,"causality":0,"pace":0,"payoff":0}},"chapterFindings":[{{"number":1,"evidence":"具体情节证据","problem":"若无重大问题也要指出小缺陷","revision":"可执行的改法","readingMomentum":"为何读者会/不会读下一章"}}],"issues":[{{"severity":"P0|P1|P2","chapter":1,"evidence":"原文具体片段","problem":"...","fix":"改写建议"}}],"overall":"编辑结论及为什么不应仅靠 AI 自评"}}
五个 scores 每项0到20，总分100；85分是机器预审参考值，任何P0/P1必须标 revise。chapterFindings 数量必须为{cfg['chapters']}。禁止修改章节、词卡、分级或已完成审校；AI自评不能替代真人盲读。'''


def validate_reader_review(project):
    d=_jread(project/'reader_review.json');cfg=_jread(project/'config.json')
    scores=d.get('scores',{})
    fields=['hook','character','causality','pace','payoff']
    if not isinstance(scores,dict) or any(not isinstance(scores.get(x),(int,float)) or isinstance(scores[x],bool) or not 0<=scores[x]<=20 for x in fields):
        raise ValueError('读者盲审评分结构错误')
    findings=d.get('chapterFindings')
    if not isinstance(findings,list) or [x.get('number') for x in findings if isinstance(x,dict)]!=list(range(1,cfg['chapters']+1)):
        raise ValueError('必须逐章提交读者盲审证据')
    for f in findings:
        if any(len(str(f.get(k,'' )).strip())<5 for k in ('evidence','problem','revision','readingMomentum')):
            raise ValueError('读者盲审缺乏具体章节证据/改写方向')
    issues=d.get('issues',[])
    if not isinstance(issues,list):raise ValueError('盲审问题必须是数组')
    score=sum(scores[x] for x in fields)
    serious=[x for x in issues if isinstance(x,dict) and x.get('severity') in ('P0','P1')]
    passed=score>=85 and d.get('verdict')=='pass' and not serious
    out={'status':'AI_READER_PRECHECK_PASS' if passed else 'AI_READER_PRECHECK_BLOCKED',
         'score':score,'seriousIssueCount':len(serious),'humanReviewComplete':False,
         'chapterCount':len(findings),'manuscriptSha256':_manuscript_fingerprint(project),'note':'AI 阅读评分仅作为自动化闸门，仍需真人读完整本并复查故事与词卡'}
    _jwrite(project/'reader_gate_report.json',out)
    return out


def finalize_book(project,batch,book_index):
    qa,zippath=na.package_project(project)
    result=_jread(project/'reader_gate_report.json')
    cfg=_jread(project/'config.json')
    pkg=_jread(project/'output'/'出版台导入包.json')
    lock={x['headword'] for x in _jread(project/'assigned_words.json')['headwords']}
    used={_norm(pkg_card['headword']) for pkg_card in pkg['words'] if pkg_card['id'] in {
         seg['wordId'] for ch in pkg['chapters'] for para in ch['paragraphs'] for seg in para['segments'] if 'wordId' in seg}}
    illegal=sorted(used-lock)
    if illegal:raise ValueError('出版包出现锁定词表外的已引用词目：'+', '.join(illegal[:10]))
    qa=_jread(project/'output'/'QA.json')
    if result['status']!='AI_READER_PRECHECK_PASS':
        qa['errors'].append(na.issue('P1','READER_GATE_BLOCKED','reader_review','独立整本读者预审发现剧情问题，禁止直接上架'))
        qa['status']='待修订（剧情整书预审未通过）'
    qa['metrics']['readerGateStatus']=result['status']
    qa['metrics']['readerGateScore']=result['score']
    qa['metrics']['lockedLexiconUsed']=len(used)
    qa['metrics']['lexiconOutOfScope']=illegal
    qa['metrics']['readyToPublish']=False
    _jwrite(project/'output'/'QA.json',qa)
    (project/'output'/'质量与覆盖报告.md').write_text(na.qa_markdown(qa),encoding='utf-8')
    _jwrite(project/'output'/'整书读者盲审报告.json',_jread(project/'reader_review.json'))
    _jwrite(project/'output'/'锁定词表使用明细.json',{'assigned':len(lock),'used':len(used),'notUsed':sorted(lock-used),
           'source':str(_jread(batch/'batch.json')['lexiconSource']),'humanConfirmed':False})
    # Replace the initially generated candidate zip with current audited outputs.
    with zipfile.ZipFile(zippath,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted((project/'output').iterdir()):
            if p.is_file():z.write(p,arcname=p.name)
    return {'index':book_index,'bookId':cfg['bookId'],'title':cfg['title'],
            'usedLockedHeadwords':len(used),'usedHeadwords':sorted(used),
            'readerScore':result['score'],'readerStatus':result['status'],
            'machineQAStatus':qa['status'],'machineQAIssues':len(qa['errors']),
            'zip':zippath.name,'stageFingerprint':_project_fingerprint(project),
            'state':'candidate_package_requires_human_review'}


def batch_report(batch):
    cfg=_jread(batch/'batch.json');state=_jread(batch/'state.json')
    status=[];global_used=set()
    for item in state.get('books',[]):
        status.append(item)
        global_used.update(item.get('usedHeadwords',[]))
    lock=_jread(batch/'lexicon_lock.json');all_words={x['headword'] for x in lock['entries']}
    summary={'batchId':cfg['batchId'],'plannedBookCount':cfg['bookCount'],
       'candidatePackageCount':len(status),'actualDistinctLockedHeadwords':len(global_used),
       'scopeDistinctHeadwords':len(all_words),
       'actualCoverageRatio':round(len(global_used)/len(all_words),4),
       'notActuallyUsed':sorted(all_words-global_used),'humanReviewComplete':False,
       'productionDatabaseTouched':False,'batchReadiness':'NOT_APPROVED_FOR_SALE'}
    _jwrite(batch/'batch_result.json',summary)
    lines=['# 妙屋小说工厂 V2 · 批次生产结果','',f'状态：{state.get("status","unknown")}',
           f'计划 {cfg["bookCount"]} 本；已有待终审导入候选包 {len(status)} 本',
           f'锁定词表实际正文词目覆盖：{len(global_used)}/{len(all_words)}（{summary["actualCoverageRatio"]*100:.1f}%）',
           '', '> 重要：实际覆盖只统计出版 JSON 正文引用的目标词目，不把计划分配当已学或已审核。','',
           '| 序号 | 书名 | 实际覆盖 | 读者预审 | QA |','|---|---|---:|---|---|']
    for x in status:
        lines.append(f'|{x["index"]}|{x["title"]}|{x["usedLockedHeadwords"]}|{x["readerStatus"]} ({x["readerScore"]})|{x["machineQAStatus"]}|')
    lines.extend(['', '## 必须人工完成的审核','',
        '- [ ] 逐本完整阅读并核对人物逻辑、伏笔回收、删去注水段落',
        '- [ ] 逐卡权威词典核验词性、义项、IPA、例句与常用搭配',
        '- [ ] 检查不同小说相同词义的读者学习状态是否复用',
        '- [ ] 使用最新版出版台真实 `validatePackage` 预检、封面版权、0试读和已购权限',
        '- [ ] 有正式数据库备份及隔离测试后由运营人员决定是否上架',
        '', '**AI 审校通过 ≠ 人工审核通过 ≠ 网站可发布。**',''])
    (batch/'整批质量报告.md').write_text('\n'.join(lines),encoding='utf-8')
    return summary


@contextlib.contextmanager
def exclusive_batch(batch):
    lock_path=batch/'.batch_running.lock'
    fd=lock_path.open('a+')
    try:
        try:fcntl.flock(fd.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('该批次已经有另一个 Agent 运行，请勿在两个终端同时启动')
        yield
    finally:
        fcntl.flock(fd.fileno(),fcntl.LOCK_UN);fd.close()


def codex_isolated_runner(project,task,prompt,output,max_minutes=18,retries=1):
    """Bounded task duration and retry of network failure; preserve valid JSON outputs."""
    exe=shutil.which('codex')
    if not exe:raise RuntimeError('没有找到 codex，请先在 Mac 上运行 codex login')
    output.parent.mkdir(parents=True,exist_ok=True)
    rel=output.relative_to(project)
    logdir=project/'codex_logs';logdir.mkdir(exist_ok=True)
    slug=re.sub(r'[^a-z0-9_-]+','-',task.lower().replace(' ','-'))[:50]+'-'+na.sha(str(rel),8)
    force_rewrite=task.startswith('修订')
    original_hash=_hash_file(output) if force_rewrite and output.exists() else None
    for attempt in range(1,retries+2):
        # Preserve valid prior output for normal generation; revisions MUST write new bytes.
        if _valid_json_file(output) and not force_rewrite:return
        args=[exe,'exec','--skip-git-repo-check','--sandbox','workspace-write','-C',str(project),'-']
        # Opt in only: ignoring user config may hide user's required network/proxy settings.
        if os.environ.get('WORDLETTER_IGNORE_USER_CODEX_CONFIG')=='1':
            args.insert(2,'--ignore-user-config')
        print(f'\n[Codex] {task}（第{attempt}次，最多{retries+1}次）',flush=True)
        t0=time.monotonic()
        log=logdir/(slug+f'-{attempt}.log')
        with log.open('w',encoding='utf-8') as f:
            try:
                p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=f,stderr=subprocess.STDOUT,
                                   cwd=str(project),start_new_session=True,text=True,encoding='utf-8')
                try:
                    p.communicate(input=prompt+'\n最后只用一句中文报告结果，不回显小说全文。',timeout=max_minutes*60)
                    code=p.returncode;timeout=False
                except subprocess.TimeoutExpired:
                    os.killpg(p.pid,signal.SIGTERM)
                    try:p.wait(timeout=5)
                    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
                    code=-9;timeout=True
            except KeyboardInterrupt:
                if 'p' in locals() and p.poll() is None:
                    os.killpg(p.pid,signal.SIGTERM);p.wait()
                raise
        t=round(time.monotonic()-t0,1)
        with (project/'codex_timings.jsonl').open('a',encoding='utf-8') as f:
            f.write(json.dumps({'time':_now(),'task':task,'attempt':attempt,'elapsedSeconds':t,
                                'exitCode':code,'timeout':timeout,'log':str(log.relative_to(project))},ensure_ascii=False)+'\n')
        print(f'[Codex] {task}: {t}秒，退出码{code}；日志 {log.name}',flush=True)
        if _valid_json_file(output):
            if not force_rewrite or _hash_file(output)!=original_hash:return
        if output.exists() and not _valid_json_file(output):
            # Preserve invalid evidence for debugging and remove only this task's output.
            bad=output.with_name(output.name+f'.broken-{attempt}')
            os.replace(output,bad)
            print('保存了不完整JSON以便排查：',bad.name)
        if attempt==retries+1:
            raise RuntimeError(f'{task} 未完成（网络/超时/写盘失败），完整日志 {log}；重新运行可以断点续跑')
        time.sleep(2)


def _resume_book(batch,item,index, runner):
    cfg=_jread(batch/'batch.json')
    books=batch/'books';book=books/f'{index:02d}'
    if not (book/'config.json').exists():
        class Args:pass
        req=Args();req.title=item['title'];req.genre=item['genre'];req.category=cfg['category']
        req.chapters=cfg['chapters'];req.words=cfg['wordsPerBook'];req.min_chars=cfg['minimumChineseCharsPerChapter']
        req.out=str(book);req.shelf=str(batch/'shelf_index.json');req.lexicon=None
        na.make_config(req)
        data=_jread(book/'config.json')
        data['factoryV2']={'batchId':cfg['batchId'],'rankRange':cfg['lexiconRankRange'],
                          'sourceSha256':cfg['lexiconSourceSha256'],'locked':True}
        _jwrite(book/'config.json',data)
        shutil.copyfile(HERE/'STORY_GATE_STANDARD.md',book/'STORY_GATE_STANDARD.md')
    assignments=_jread(batch/'allocations.json')[index-1]['assigned']
    if not (book/'assigned_words.json').exists():
        _jwrite(book/'assigned_words.json',{'headwords':assignments,
           'lexiconSourceSha256':cfg['lexiconSourceSha256'],'mustRemainWithinWhitelist':True})
    if _jread(book/'assigned_words.json')['headwords']!=assignments:
        raise ValueError('此前分配的锁定词已改变，拒绝续跑以免破坏词卡和学习状态')
    # Story gate auto-revises outline <=2 rounds; no vocabulary until it passes.
    story_gate.ensure_story_ready(book,runner)
    if not (book/'vocab_plan.json').exists():runner(book,'锁定词表下的剧情选词',_vocab_prompt(book),book/'vocab_plan.json')
    check_vocab_scope(book)
    na.validate_plan(book)
    phase_lock=book/'phase_lock.json'
    current_vocabulary_hash=_hash_file(book/'vocab_plan.json')
    if phase_lock.exists() and _jread(phase_lock)['vocabPlanSha256']!=current_vocabulary_hash:
        raise ValueError('已开始生产的词表被修改，原词卡与义项审核可能失效，禁止无审查继续')
    if not phase_lock.exists():_jwrite(phase_lock,{'vocabPlanSha256':current_vocabulary_hash,'lockedUtc':_now()})
    with patched_codex(runner):
        na.run_agent(book,'cards',fast=True)
        na.run_agent(book,'chapters',fast=True)
        _invalidate_stale_chapter_reviews(book)
        na.run_agent(book,'review',fast=True)
    reader_report=book/'reader_gate_report.json'
    if reader_report.exists() and _jread(reader_report).get('manuscriptSha256')!=_manuscript_fingerprint(book):
        review=book/'reader_review.json'
        if review.exists():os.replace(review,review.with_suffix('.stale-review.json'))
        reader_report.unlink()
    if not (book/'reader_review.json').exists():runner(book,'独立整书读者盲审',_reader_prompt(book),book/'reader_review.json')
    validate_reader_review(book)
    return finalize_book(book,batch,index)


@contextlib.contextmanager
def patched_codex(runner):
    original=na.codex_run
    na.codex_run=runner
    try:yield
    finally:na.codex_run=original


def run_batch(batch,runner=None,only_book=None):
    batch=Path(batch).expanduser().resolve()
    if not (batch/'batch.json').is_file():raise ValueError('批次目录缺少 batch.json')
    cfg=_jread(batch/'batch.json')
    runner=runner or codex_isolated_runner
    with exclusive_batch(batch):
        # Guard against accidentally swapping inputs between interruptions.
        lock=_jread(batch/'lexicon_lock.json')
        if lock['sourceSha256']!=cfg['lexiconSourceSha256']:
            raise ValueError('原始词表校验信息被修改，拒绝继续')
        current_fp=_fingerprint({'lexiconEntries':lock['entries'],'allocations':_jread(batch/'allocations.json')})
        if current_fp!=cfg.get('planningFingerprint'):
            raise ValueError('锁定词表或整批分配方案与创建时不一致，拒绝续跑')
        concepts_path=batch/'concepts.json'
        if not concepts_path.is_file():
            runner(batch,'整批不同题材原创策划',_concept_prompt(batch),concepts_path)
        concepts=_jread(concepts_path);validate_concepts(concepts,cfg)
        st=_jread(batch/'state.json')
        if only_book and not 1<=only_book<=cfg['bookCount']:raise ValueError('书籍序号超出范围')
        done={x['index']:x for x in st.get('books',[])}
        st['status']='running';st['conceptsReady']=True;_jwrite(batch/'state.json',st)
        for idx,concept in enumerate(concepts,1):
            if only_book and idx!=only_book:continue
            if idx in done:
                bookpath=batch/'books'/f'{idx:02d}'
                actual=_project_fingerprint(bookpath)
                if done[idx].get('stageFingerprint')!=actual:
                    raise ValueError(f'第{idx}本已完成的源文件被修改，原审核失效；需要重新安排审校，不可静默复用旧成果')
                print(f'\n[跳过] 第{idx}本《{done[idx]["title"]}》已经完成候选包')
                continue
            bookpath=batch/'books'/f'{idx:02d}'
            print(f'\n===== 第{idx}/{cfg["bookCount"]}本《{concept["title"]}》 =====',flush=True)
            try:
                result=_resume_book(batch,concept,idx,runner)
            except Exception as e:
                st['status']='paused_after_error';st['error']={'bookIndex':idx,'message':str(e)}
                st['lastUpdatedUtc']=_now();_jwrite(batch/'state.json',st)
                batch_report(batch)
                raise
            done[idx]=result
            st['books']=[done[k] for k in sorted(done)]
            st['lastUpdatedUtc']=_now();st.pop('error',None);_jwrite(batch/'state.json',st)
            batch_report(batch)
        st['status']='candidate_packages_complete' if len(done)==cfg['bookCount'] else 'partially_complete'
        st['lastUpdatedUtc']=_now();_jwrite(batch/'state.json',st)
        result=batch_report(batch)
        print(f'\n批次已结束：生成候选包 {result["candidatePackageCount"]}/{cfg["bookCount"]} 本。所有文件仍需人工终审。')
        return result




def export_batch(batch):
    """Zip existing candidate files and summary, explicitly NOT a publishing deployment."""
    batch=Path(batch).expanduser().resolve()
    if not (batch/'batch.json').is_file():raise ValueError('缺少 batch.json')
    batch_report(batch)
    cfg=_jread(batch/'batch.json');st=_jread(batch/'state.json')
    output=batch/(f"WordLetter_{cfg['batchId']}_整批审核待确认.zip")
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for filename in ('batch.json','planning_summary.json','整批规划报告.md','整批质量报告.md','batch_result.json'):
            p=batch/filename
            if p.exists():archive.write(p,arcname=filename)
        for b in st.get('books',[]):
            p=batch/'books'/f"{b['index']:02d}"/b['zip']
            if p.is_file():archive.write(p,arcname=f"待人工终审小说/{b['index']:02d}_{b['title'][:25]}.zip")
    print('整批候选包已打包（没有任何正式上架动作）：',output)
    return output

def batch_status(batch):
    batch=Path(batch).expanduser().resolve(); cfg=_jread(batch/'batch.json');state=_jread(batch/'state.json')
    print('批次：',cfg['batchId'],'·',CATEGORIES[cfg['category']]);print('状态：',state['status'])
    completed={x['index'] for x in state.get('books',[])}
    for i in range(1,cfg['bookCount']+1):
        book=batch/'books'/f'{i:02d}'
        chapters=len(list((book/'chapters').glob('ch[0-9][0-9].json'))) if book.exists() else 0
        reviews=len(list((book/'review').glob('ch[0-9][0-9].json'))) if book.exists() else 0
        print(f'  第{i:02d}本：'+('候选包已生成（待人工审核）' if i in completed else f'已保存正文{chapters}/{cfg["chapters"]}章、审校{reviews}/{cfg["chapters"]}章'))
    if state.get('error'):print('上次暂停原因：',state['error']['message'])


def interactive_wizard():
    print('\n🐾 妙屋英语小说工厂 V2 · 一键批量生产（Mac）')
    print('提示：已有 V1 小说正在运行时，请先只创建规划，不要同时调用 Codex。\n')
    def ask(msg,default):return input(f'{msg} [默认 {default}]：').strip() or str(default)
    cat=ask('等级 cet4 / cet6 / postgrad / ielts','postgrad').lower()
    if cat not in CATEGORIES:raise ValueError('等级无效')
    source_default=str(DEFAULT_POSTGRAD) if cat=='postgrad' and DEFAULT_POSTGRAD.exists() else ''
    src=ask('词表路径（CSV/TSV/TXT，可把文件拖进终端）',source_default).strip("'\" ")
    if not src:raise ValueError('必须提供词表，否则不能宣称指定范围生产')
    start=int(ask('排名从第几个词开始','1'));stop=int(ask('排名到第几个词结束','1500'))
    count=int(ask('本批小说数量','3'));chapters=int(ask('每本章节数','10'))
    words=int(ask('每本目标不同词目数','110'))
    genresp=ask('题材（逗号分隔；回车采用多样化题材）','自动搭配')
    name_list=input('可选：指定全部书名（逗号分隔；回车由AI原创命名）：').strip()
    titles=[x.strip() for x in re.split('[，,、]',name_list) if x.strip()]
    genres=None if genresp=='自动搭配' else [x.strip() for x in re.split('[，,、]',genresp) if x.strip()]
    folder=HERE/'batches'/('batch-'+_stamp()+'-'+na.sha(cat+str(src),5))
    batch=create_batch(out=folder,category=cat,lexicon=src,count=count,chapters=chapters,words=words,
                       first=start,last=stop,genres=genres,titles=titles)
    if ask('现在开始真正调用 Codex 批量生产？输入 YES 才开始（其余只规划）','NO').upper()=='YES':
        run_batch(batch)
    else:
        print('仅完成离线规划。稍后可以双击「继续批量生产.command」恢复；不会自动开启后台生成。')


def main(argv=None):
    p=argparse.ArgumentParser(description='妙屋英语 V2：指定词表 + 原创故事前审 + 批量生成 + 逐本QA + 可续跑')
    sub=p.add_subparsers(dest='action',required=True)
    init=sub.add_parser('init',help='只创建并锁定整批词汇规划，不调用Codex')
    init.add_argument('--out',required=True);init.add_argument('--category',required=True,choices=sorted(CATEGORIES))
    init.add_argument('--lexicon',required=True);init.add_argument('--count',type=int,default=3)
    init.add_argument('--chapters',type=int,default=10);init.add_argument('--words',type=int,default=110)
    init.add_argument('--first',type=int,default=1);init.add_argument('--last',type=int,default=1500)
    init.add_argument('--genre',action='append',default=[]);init.add_argument('--title',action='append',default=[]);init.add_argument('--repeat-rate',type=float,default=.2)
    init.add_argument('--min-chars',type=int,default=1250);init.add_argument('--shelf',default=None)
    r=sub.add_parser('run',help='从现有批次依次生成，自动跳过完成的内容')
    r.add_argument('--batch',required=True);r.add_argument('--only-book',type=int)
    st=sub.add_parser('status',help='只读查看项目阶段进度')
    st.add_argument('--batch',required=True)
    check=sub.add_parser('lexicon-check',help='仅读取指定词表，检查数量和排名')
    check.add_argument('--lexicon',required=True);check.add_argument('--first',type=int,default=1)
    check.add_argument('--last',type=int,default=1500)
    out=sub.add_parser('export',help='把已经生成的候选小说和批次报告打成一个 ZIP')
    out.add_argument('--batch',required=True)
    sub.add_parser('wizard',help='最简单的交互式创建/运行')
    a=p.parse_args(argv)
    try:
        if a.action=='init':create_batch(out=a.out,category=a.category,lexicon=a.lexicon,count=a.count,
                              chapters=a.chapters,words=a.words,first=a.first,last=a.last,
                              genres=a.genre,titles=a.title,repeat_rate=a.repeat_rate,min_chars=a.min_chars,shelf=a.shelf)
        elif a.action=='run':run_batch(a.batch,only_book=a.only_book)
        elif a.action=='status':batch_status(a.batch)
        elif a.action=='export':export_batch(a.batch)
        elif a.action=='lexicon-check':
            w=load_lexicon(a.lexicon,a.first,a.last)
            print('锁定范围可用不同词目：',len(w['entries']),'；异常排除：',w['skippedCount'])
        elif a.action=='wizard':interactive_wizard()
        return 0
    except KeyboardInterrupt:
        if a.action=='run':
            try:
                root=Path(a.batch).expanduser().resolve()
                if (root/'state.json').is_file():
                    state=_jread(root/'state.json');state['status']='paused_by_user'
                    state['lastUpdatedUtc']=_now();_jwrite(root/'state.json',state)
            except (OSError,ValueError):pass
        print('\n已停止当前本地生成。已保存文件保持原状，可再次启动断点续跑。',file=sys.stderr)
        return 130
    except (ValueError,RuntimeError,AssertionError,FileNotFoundError,KeyError,OSError,subprocess.SubprocessError) as exc:
        print('\n错误：'+str(exc),file=sys.stderr)
        return 2


if __name__=='__main__':sys.exit(main())