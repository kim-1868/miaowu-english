#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WordLetter novel production agent: local-only orchestration + offline validation.

Python 3.9+, stdlib only. AI content generation requires a separately authenticated
Codex CLI; neither code nor AI-generated output accesses live D1/Pages/Workers.
"""
from __future__ import annotations
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATS = {"cet4", "cet6", "postgrad", "ielts"}
EXPECTED_CARD_FIELDS = ("id", "headword", "phoneticUk", "phoneticUs", "partOfSpeech", "meaningZh", "exampleEn", "exampleZh", "collocations")
REQUIRED_CHAPTER_FIELDS = ("id", "number", "title", "preview", "paragraphs")
CANONICAL_CARD_FIELDS = set(EXPECTED_CARD_FIELDS)
HARD_MIXED = re.compile(r"(?i)(?:work室|meeting上|从系统missing|备用power|一份official|完成training后)")
GENERIC_EXAMPLE = re.compile(r"(?i)(?:they (?:discussed|talked about) the \w+ (?:before making a decision|during the meeting)|they talked about the meeting during the meeting)")
CHINESE_CHAR = re.compile(r"[\u4e00-\u9fff]")
WORDISH = re.compile(r"[A-Za-z][A-Za-z'’\-]*")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().casefold())


def norm_pos(s):
    return norm(s).replace(" ", "")


def sha(s, n=12):
    return hashlib.sha256(str(s).encode("utf-8")).hexdigest()[:n]


def timestamp():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def issue(level, code, where, detail, hint=""):
    return {"level":level, "code":code, "where":where, "detail":detail, "hint":hint}


def published_shelf(source: Path | None, target_category=None):
    """Accept our P5 content-review snapshot or a compact shelf index.
    NEVER include story excerpts, users, purchases or activation codes.
    """
    if not source:
        return []
    src = read_json(source)
    if isinstance(src, list):
        items = src
    elif isinstance(src, dict) and "senses" in src:
        items = src["senses"]
    elif isinstance(src, dict) and "cards" in src and "books" in src:
        categories = {b["book_id"]:b["category"] for b in src["books"]}
        items = []
        for w in src["cards"]:
            contexts = w.get("contexts", [])
            linked = {categories.get(x.get("book_id")) for x in contexts}
            for cat in linked:
                if cat in CATS:
                    items.append({"headword":w.get("headword", ""), "partOfSpeech":w.get("part_of_speech", ""),
                                  "meaningZh":w.get("meaning_zh", ""), "category":cat,
                                  "sourceWordId":w.get("word_id", "")})
    else:
        raise ValueError("书架词库格式不支持；请提供 P5 content-review.json 或 senses 索引")
    result = {}
    for w in items:
        cat = w.get("category", "")
        if cat not in CATS or (target_category and cat != target_category):
            continue
        h = norm(w.get("headword", "")); pos=norm_pos(w.get("partOfSpeech",w.get("pos","")));
        meaning = str(w.get("meaningZh", w.get("meaning_zh", ""))).strip()
        if not (h and pos and meaning):
            continue
        key = (cat,h,pos,meaning)
        # Exact same text/POS/gloss is a reuse CANDIDATE, not confirmed identical sense.
        result.setdefault(key,{"category":cat,"headword":h,"partOfSpeech":pos,"meaningZh":meaning,
                               "sourceWordId":w.get("sourceWordId", ""),"identityStatus":"candidate_not_human_verified"})
    return sorted(result.values(), key=lambda v:(v["category"],v["headword"],v["partOfSpeech"],v["meaningZh"]))


def make_config(args):
    if args.category not in CATS:
        raise ValueError("分类必须是 cet4/cet6/postgrad/ielts")
    if args.chapters<2 or args.chapters>24:
        raise ValueError("章节数必须 2–24")
    if args.words<10 or args.words>600:
        raise ValueError("目标独立词数必须 10–600")
    folder = Path(args.out).expanduser().resolve()
    if folder.exists() and any(folder.iterdir()):
        raise ValueError(f"目录不为空，为保护已有项目不覆盖：{folder}")
    folder.mkdir(parents=True,exist_ok=True)
    book_id = f"mw-{args.category}-{sha(args.title+'|'+timestamp(),14)}"
    config={"bookId":book_id,"title":args.title,"category":args.category,
            "genre":args.genre,"chapters":args.chapters,"targetUniqueWords":args.words,
            "minimumChineseCharsPerChapter":args.min_chars,"previewChapters":0,
            "createdUtc":timestamp(),"generationProvider":"Codex CLI (authenticated locally)",
            "sourceClaim":"reference_candidate_only_unless_reviewed"}
    write_json(folder/"config.json",config)
    shelf_source = Path(args.shelf).expanduser() if args.shelf else ROOT/"data"/"shelf_20261106_sanitized.json"
    if shelf_source.exists():
        shelf = published_shelf(shelf_source, args.category)
        write_json(folder/"shelf.json", {"status":"published_2026-11-06_snapshot_not_live","category":args.category,"senses":shelf})
    else:
        write_json(folder/"shelf.json", {"status":"not_provided","category":args.category,"senses":[]})
    if args.lexicon:
        lex=Path(args.lexicon).expanduser()
        if not lex.is_file(): raise ValueError("词汇参考文件不存在")
        shutil.copyfile(lex,folder/("lexicon"+lex.suffix.lower()))
    (folder/"chapters").mkdir(exist_ok=True)
    (folder/"cards").mkdir(exist_ok=True)
    (folder/"AGENTS.md").write_text((ROOT/"AGENTS.md").read_text(encoding="utf-8"),encoding="utf-8")
    guide=ROOT/"PRODUCTION_RULES.md"
    (folder/"PRODUCTION_RULES.md").write_text(guide.read_text(encoding="utf-8"),encoding="utf-8")
    print("项目创建成功：",folder)
    print("内部书籍编号：",book_id)
    print("书架状态：",read_json(folder/"shelf.json")["status"])
    print("下一步：python3 novel_agent.py run --project",folder)
    return folder


def codex_run(project:Path, task:str, prompt:str, output:Path):
    if not shutil.which("codex"):
        raise RuntimeError("未找到 Codex CLI。安装后运行 codex 并登录 ChatGPT，再重试。见 README.md")
    output.parent.mkdir(parents=True,exist_ok=True)
    print(f"\n[Codex] {task} → {output.relative_to(project)}",flush=True)
    # Uses least-privilege writable project sandbox; NO full-access or bypass flags.
    argv=["codex","exec","--skip-git-repo-check","--sandbox","workspace-write","-C",str(project),"-"]
    # Codex receives task context via stdin. No shell=True, no API credentials stored.
    result=subprocess.run(argv,input=prompt,encoding="utf-8",cwd=project,check=False)
    if result.returncode!=0:
        raise RuntimeError(f"Codex 阶段 {task} 失败，退出码 {result.returncode}；生成文件可保留，重新执行会跳过已完成阶段")
    if not output.is_file():
        raise RuntimeError(f"Codex 阶段 {task} 没有生成预期文件：{output}")
    try: read_json(output)
    except Exception as e: raise RuntimeError(f"{task} 已写文件但 JSON 不合法：{e}") from e


def plan_prompt(project:Path):
    cfg=read_json(project/"config.json")
    shelf=read_json(project/"shelf.json")
    n=cfg["targetUniqueWords"]
    if cfg["category"]=="cet4" and shelf["senses"]:
        old_count=round(n*.35)
        ratio=f"四级词目目标 N={n}，其中已有书架词目 R≈{old_count}（30%-40%），其余为新词，禁止把书架候选当作已核验官方四级词。"
    elif cfg["category"]=="cet4":
        ratio="没有书架词库，必须记录‘重复率不可核验’，不能编造 R/N；允许创建供人工检查的草稿。"
    else:
        ratio="该等级未设置 35% 复现硬目标；报告实际比例或不可核验，不得套用四级数值。"
    return f"""你是 WordLetter 的原创中文小说编辑/英语词汇课程设计师。读取当前目录 AGENTS.md 和 PRODUCTION_RULES.md，严格遵守。
先读取 config.json 和 shelf.json（已有同级已出版书架旧词，日期快照，不能假定是实时）。存在 lexicon.csv 时可参考，但非官方等级词未核验。
只创建当前目录两个完整有效 JSON：outline.json、vocab_plan.json；不要写其他地方，不修改 config/shelf。
项目：{cfg['title']}，题材 {cfg['genre']}，分类 {cfg['category']}，{cfg['chapters']} 章，约 {n} 个不同目标词。章节要有明确人物动机、悬念转折和完结，纯原创不借鉴特定作品。
{ratio}
outline.json 格式：{{"title":"...","description":"...","chapters":[{{"number":1,"title":"...","beat":"不少于40字","turn":"..."}}]}}，正好 {cfg['chapters']} 章。
vocab_plan.json 格式：数组 [{{"headword":"example","partOfSpeech":"n.","meaningZh":"例子","senseKey":"example|n.|例子","sourceStatus":"reference_candidate","plannedChapters":[1,3]}}]，约 {n} 条，每项仅一个语境主词性及教学义项，优先选能自然融入具体章节的单词。对已有书架确实同义且同 POS 的词卡，尽量沿用书架已存在的第一中文主释义以便学习状态兼容；对不同义项不得强合。高风险例 leak/power/record/sign 按语境拆义。
必须完整写入磁盘，不允许只写摘要，不要声明已经人工审核通过。"""


def validate_plan(project:Path):
    cfg=read_json(project/"config.json")
    outline=read_json(project/"outline.json")
    vocab=read_json(project/"vocab_plan.json")
    assert len(outline.get("chapters",[]))==cfg["chapters"],"章节提纲数量不对"
    assert isinstance(vocab,list) and len(vocab)>=10,"词汇规划少于10条"
    numbers=[c["number"] for c in outline["chapters"]]
    assert numbers==list(range(1,cfg["chapters"]+1)),"章节顺序必须1..N"
    seen=set(); ids=[]
    for w in vocab:
        for key in ("headword","partOfSpeech","meaningZh","plannedChapters"):
            assert w.get(key), f"词汇缺少 {key}: {w}"
        k=(norm(w["headword"]),norm_pos(w["partOfSpeech"]),norm(w["meaningZh"]))
        assert k not in seen, f"词汇规划义项重复: {w['headword']}";seen.add(k)
        assert all(isinstance(n,int) and 1<=n<=cfg["chapters"] for n in w["plannedChapters"]),"计划章节越界"
        w["id"]="wl-"+sha(cfg["bookId"]+"|"+"|".join(k),20)
        w.setdefault("senseKey","|".join(k))
        w.setdefault("sourceStatus","reference_candidate")
        ids.append(w["id"])
    assert len(set(ids))==len(ids)
    write_json(project/"vocab_plan.json",vocab)
    return outline,vocab


def cards_prompt(project:Path,batch:list, index:int):
    payload=project/"cards"/f"input_{index:03d}.json"
    write_json(payload,batch)
    output=f"cards/batch_{index:03d}.json"
    return output, f"""请读取 AGENTS.md、PRODUCTION_RULES.md、config.json 和 {payload.relative_to(project)}，仅生成 {output} 这一 JSON 文件，不要覆盖输入。
文件应是数组，且恰好为输入每一条词汇生成一张词卡，顺序不限但 ID 必须和输入一致。结构按真正出版台：
[{{"id":"输入 id 原样","headword":"...","phoneticUk":"/IPA/","phoneticUs":"/IPA/","partOfSpeech":"...","meaningZh":"当前本书所用一个教学义项","exampleEn":"自然英语例句，体现当前义项","exampleZh":"准确中文译文","collocations":[{{"en":"常用搭配","zh":"中文释义"}}]}}]
不得为空 IPA/例句/搭配；搭配优先1–3条，不造假，不要使用万能例句或虚构权威校验。不同词性/不同重音必须分别处理。若某词无法可靠给出 IPA，请保持资料结构、留出供人工校验并在输出旁报告风险，绝不假称已权威核验。
所有目标词均需生成；只修改 {output}。"""


def chapter_prompt(project:Path,no:int, outline:dict, cards:list):
    cfg=read_json(project/"config.json")
    vocab=read_json(project/"vocab_plan.json")
    subset=[x for x in vocab if no in x["plannedChapters"]]
    if len(subset)<8: subset=vocab[max(0,(no-1)*12):no*12+12]
    compact=[{"id":w["id"],"headword":w["headword"],"pos":w["partOfSpeech"],"meaning":w["meaningZh"]} for w in subset]
    target=project/"chapters"/f"ch{no:02d}.json"
    data=project/"chapters"/f"selection_ch{no:02d}.json"
    write_json(data,compact)
    previous=f"chapters/ch{no-1:02d}.json" if no>1 else "无（第一章）"
    point=outline["chapters"][no-1]
    return target, f"""你是 WordLetter 小说作家兼英语混排编辑。阅读 AGENTS.md、PRODUCTION_RULES.md、config.json、outline.json、vocab_plan.json 和 cards/merged.json。
本章目标：第{no}章《{point['title']}》；剧情：{point['beat']}；转折：{point['turn']}。上一章：{previous}，请读取以保持人物和时序一致。
使用本章候选词清单 {data.relative_to(project)}，只能引用 cards/merged.json 真实存在的 id。所列词可自然取舍，但必须保证章节完整、人物行为因果成立，且全书最终使用尽可能多计划词。
只写文件 chapters/ch{no:02d}.json，格式：{{"id":"{cfg['bookId']}-ch{no:02d}","number":{no},"title":"{point['title']}","preview":false,"paragraphs":[{{"segments":[{{"text":"自然中文叙事片段"}},{{"wordId":"已有id","surface":"英文词形","gloss":"与正文用法一致的简洁中文义项"}},{{"text":"继续中文叙事"}}]}}]}}。
硬约束：每个纯文本段 trim 后都必须非空；不允许 {{"text":" "}}；按真实中文语法自然嵌词（不要 work室、meeting上、从系统missing）；通常有词的句子2–5个目标英文单词，段落平均3–6处，关键台词可以例外；正文汉字总量至少 {cfg['minimumChineseCharsPerChapter']} 字（不是把多个重复句凑字数）；叙事有场景和冲突，原创且本章推进明确。无免费试读章节。
不要提交 markdown 代码块，不修改其他文件，不声称已发布。"""


def review_prompt(project:Path,no:int):
    ch=read_json(project/"chapters"/f"ch{no:02d}.json")
    unique_ids=sorted({s["wordId"] for p in ch.get("paragraphs",[]) for s in p.get("segments",[]) if isinstance(s,dict) and "wordId" in s})
    cards={w["id"]:w for w in read_json(project/"cards"/"merged.json")}
    target=project/"review"/f"ch{no:02d}.json"
    source=project/"review"/f"input_ch{no:02d}.json"
    write_json(source,{"chapter":ch,"usedWordCards":[cards[w] for w in unique_ids if w in cards],"requiredIds":unique_ids})
    prompt=f"""你是独立编辑质检 Agent，不是作者。读取 AGENTS.md、PRODUCTION_RULES.md、review/input_ch{no:02d}.json 和 config.json。
对第{no}章实际出现的每个单词 ID，逐个审查正文真实词义、词性、英美 IPA 重音、英语例句是否符合主释义、中文例句翻译、collocations 是否自然。对剧情因果和生硬中英混排也给出问题清单。
只写 review/ch{no:02d}.json，有且只有这些键：
{{"chapterNumber":{no},"cards":[{{"wordId":"完全照原ID","verdict":"pass|revise|uncertain","severity":"none|P0|P1|P2","reason":"审查依据（说清具体句子和义项）","suggestion":"如需修改请给新值"}}],"storyIssues":[{{"severity":"P0|P1|P2","reason":"...","suggestion":"..."}}],"note":"AI审校，仅是待人工复核，不代表权威词典已核验"}}
必须覆盖 input 文件中 requiredIds 的每个 ID，禁止漏项。对不确定 IPA 必须标 uncertain，而不是猜测为正确。遇到 leak=泄密却正文漏水、power=权力却正文电力、sign 名词误做动词、record n/v 重音错误、work室 等，标 P0/P1。不得自动将 verdict=pass 等同于人工已审核。不得修改章节正文或词卡原文件，只提交审校意见。"""
    return target,prompt,unique_ids


def gather_editorial_review(project:Path):
    cfg=read_json(project/"config.json")
    errors=[];reviews=[];counts=Counter()
    for no in range(1,cfg["chapters"]+1):
        path=project/"review"/f"ch{no:02d}.json"
        if not path.exists():
            errors.append({"chapter":no,"problem":"未生成 AI 编辑复核文件"});continue
        chapter=read_json(path)
        required=set(review_prompt(project,no)[2])
        provided={str(x.get("wordId","")) for x in chapter.get("cards",[]) if isinstance(x,dict)}
        for wid in sorted(required-provided):errors.append({"chapter":no,"wordId":wid,"problem":"AI 复核遗漏此词卡"})
        for x in chapter.get("cards",[]):
            sev=x.get("severity","unknown");counts[sev]+=1
            if x.get("verdict") in ("revise","uncertain"):
                errors.append({"chapter":no,"wordId":x.get("wordId"),"severity":sev,
                               "problem":x.get("reason",""),"suggestion":x.get("suggestion","")})
        for x in chapter.get("storyIssues",[]):
            errors.append({"chapter":no,"severity":x.get("severity","P1"),
                           "problem":x.get("reason",""),"suggestion":x.get("suggestion","")})
        reviews.append({"chapter":no,"auditedWordIds":len(provided),"needed":len(required)})
    summary={"status":"AI 初审完成但尚未人工审核" if not errors else "AI 初审有待修订项", "chapters":reviews,
             "countsBySeverity":dict(counts),"issues":errors,"humanApproval":False,"dictionaryVerification":False}
    write_json(project/"review"/"summary.json",summary)
    return summary


def combine_cards(project:Path, expected:list):
    files=sorted((project/"cards").glob("batch_*.json"))
    all_cards=[]
    for p in files:
        a=read_json(p)
        if not isinstance(a,list): raise ValueError(f"词卡批次不是数组：{p}")
        all_cards.extend(a)
    by_id={w.get("id"):w for w in all_cards if isinstance(w,dict)}
    expected_ids={w["id"] for w in expected}
    missing=expected_ids-set(by_id)
    unexpected=set(by_id)-expected_ids
    if missing or unexpected or len(by_id)!=len(all_cards):
        raise ValueError(f"词卡批次不全或重复：缺 {len(missing)} / 多 {len(unexpected)} / ID重复 {len(all_cards)-len(by_id)}")
    merged=[{k:by_id[w["id"]].get(k) for k in EXPECTED_CARD_FIELDS} for w in expected]
    write_json(project/"cards"/"merged.json",merged)
    return merged


def run_agent(project:Path,stage:str, batch_size:int=22):
    if not (project/"config.json").is_file(): raise ValueError("找不到项目 config.json")
    cfg=read_json(project/"config.json")
    if stage in ("all","outline"):
        if not (project/"outline.json").exists() or not (project/"vocab_plan.json").exists():
            codex_run(project,"故事大纲/选词",plan_prompt(project),project/"vocab_plan.json")
        validate_plan(project)
    if stage in ("all","cards"):
        outline,vocab=validate_plan(project)
        for i in range(0,len(vocab),batch_size):
            chunk=vocab[i:i+batch_size]
            idx=i//batch_size+1
            output,prompt=cards_prompt(project,chunk,idx)
            if not (project/output).exists():
                codex_run(project,f"逐义项词卡 {idx}",prompt,project/output)
        combine_cards(project,vocab)
    if stage in ("all","chapters"):
        outline,vocab=validate_plan(project)
        if not (project/"cards"/"merged.json").exists(): raise ValueError("请先生成词卡，运行 --stage cards")
        cards=read_json(project/"cards"/"merged.json")
        for no in range(1,cfg["chapters"]+1):
            output,prompt=chapter_prompt(project,no,outline,cards)
            if not output.exists():codex_run(project,f"创作第{no}章",prompt,output)
            if not isinstance(read_json(output).get("paragraphs"),list):
                raise ValueError(f"第 {no} 章没有 paragraphs，需修订该章节 JSON")
    if stage in ("all","review"):
        for no in range(1,cfg["chapters"]+1):
            target,prompt,required=review_prompt(project,no)
            if not target.exists():codex_run(project,f"独立复核第{no}章",prompt,target)
        summary=gather_editorial_review(project)
        print("AI 编辑复核：",summary["status"],"；待处理条目：",len(summary["issues"]))
    if stage=="all":
        package_project(project)


def build_package(project:Path):
    cfg=read_json(project/"config.json")
    outline=read_json(project/"outline.json")
    cards=read_json(project/"cards"/"merged.json")
    chapters=[read_json(project/"chapters"/f"ch{no:02d}.json") for no in range(1,cfg["chapters"]+1)]
    return {"version":1,"sourceLabel":f"wordletter-original-{cfg['bookId']}-draft-machine-check",
            "book":{"id":cfg["bookId"],"category":cfg["category"],"title":outline.get("title") or cfg["title"],
                    "description":outline.get("description") or f"{cfg['genre']}原创故事"},
            "words":cards,"chapters":chapters}


def render_segments(paragraph):
    return "".join(s.get("text",s.get("surface","")) for s in paragraph.get("segments",[]) if isinstance(s,dict))


def validate_package(book:dict, shelf:list|None=None, required_chapters=None, min_chinese=0):
    """Offline contract-like checks based on corrected real sample, NOT website validatePackage.
    Returns machine findings and review gates; cannot approve linguistic accuracy.
    """
    errors=[];warnings=[];count=Counter()
    if not isinstance(book,dict): return {"errors":[issue("P0","BAD_ROOT","root","JSON根节点必须对象")],"warnings":[],"metrics":{}}
    metadata=book.get("book",{}) or {}
    cat=metadata.get("category")
    if book.get("version")!=1: errors.append(issue("P0","VERSION","root","version 必须为 1"))
    if cat not in CATS: errors.append(issue("P0","CATEGORY","book.category",f"非法等级: {cat}"))
    if not metadata.get("id") or not metadata.get("title") or not metadata.get("description"):
        errors.append(issue("P0","BOOK_META","book","缺少 ID / 书名 / 简介"))
    words=book.get("words") if isinstance(book.get("words"),list) else []
    chapters=book.get("chapters") if isinstance(book.get("chapters"),list) else []
    if not words: errors.append(issue("P0","NO_WORDS","words","没有词卡"))
    if not chapters: errors.append(issue("P0","NO_CHAPTERS","chapters","没有章节"))
    if required_chapters and len(chapters)!=required_chapters:
        errors.append(issue("P0","CHAPTER_COUNT","chapters",f"预期 {required_chapters} 章，实际 {len(chapters)} 章"))
    by_id={};names=set();colloc_empty=0
    for i,w in enumerate(words):
        loc=f"words[{i}]"; wid=w.get("id")
        if not wid or not isinstance(wid,str):
            errors.append(issue("P0","WORD_ID",loc,"词卡 ID 缺失"));continue
        if wid in by_id:errors.append(issue("P0","WORD_ID_DUP",loc,f"重复词卡 ID: {wid}"))
        by_id[wid]=w
        for field in EXPECTED_CARD_FIELDS[:-1]:
            if not isinstance(w.get(field),str) or not w[field].strip():
                errors.append(issue("P0","CARD_FIELD",loc,f"缺少 {field}"))
        for p in ("phoneticUk","phoneticUs"):
            ipa=w.get(p,"") or ""
            if isinstance(ipa,str) and ipa.strip() and not (ipa.startswith("/") and ipa.endswith("/")):
                warnings.append(issue("P1","IPA_FORMAT",loc,f"{p} 看起来缺少 /.../"))
        co=w.get("collocations")
        if not isinstance(co,list) or not co:
            colloc_empty+=1
            errors.append(issue("P1","EMPTY_COLLOCATIONS",loc,"常用搭配没有可审核的记录"))
        else:
            if len(co)>3: warnings.append(issue("P2","MANY_COLLOCATIONS",loc,"搭配多于3条，需人工精选"))
            for c in co:
                if not isinstance(c,dict) or not (isinstance(c.get("en"),str) and c["en"].strip() and isinstance(c.get("zh"),str) and c["zh"].strip()):
                    errors.append(issue("P1","COLLOCATION_BAD",loc,"搭配必须含 en、zh 非空文本"))
        if GENERIC_EXAMPLE.search(w.get("exampleEn","") or ""):
            errors.append(issue("P1","GENERIC_EXAMPLE",loc,"模板化例句应人工改写"))
        k=(norm(w.get("headword")),norm_pos(w.get("partOfSpeech")),norm(w.get("meaningZh")))
        if k in names:errors.append(issue("P0","DUPLICATE_SENSE_IN_BOOK",loc,"同书内重复建立同拼写+词性+释义卡"))
        names.add(k)
        count["cards"]+=1
    word_usage=Counter();seen_chapter=set();density=[];china=[]
    for i,ch in enumerate(chapters):
        loc=f"chapters[{i}]"; ch_id=ch.get("id")
        if not ch_id or ch_id in seen_chapter:errors.append(issue("P0","CHAPTER_ID",loc,"章节 ID 缺失或重复"))
        seen_chapter.add(ch_id)
        if ch.get("number")!=i+1:errors.append(issue("P0","CHAPTER_ORDER",loc,"章节 number 不是连续 1..N"))
        if not isinstance(ch.get("preview"),bool):errors.append(issue("P0","PREVIEW_TYPE",loc,"preview 必须为布尔值"))
        elif ch["preview"]:errors.append(issue("P0","PREVIEW_ON",loc,"新书默认不提供免费试读（0章）"))
        if not isinstance(ch.get("paragraphs"),list) or not ch["paragraphs"]:
            errors.append(issue("P0","PARAGRAPHS",loc,"缺少正文段落"));continue
        zh=0;marks=0
        for j,p in enumerate(ch["paragraphs"]):
            ploc=f"{loc}.paragraphs[{j}]"; segs=p.get("segments")
            if not isinstance(segs,list) or not segs:errors.append(issue("P0","SEGMENTS",ploc,"段落 segments 不能为空"));continue
            for k,s in enumerate(segs):
                sloc=f"{ploc}.segments[{k}]"
                if not isinstance(s,dict):errors.append(issue("P0","SEGMENT_TYPE",sloc,"片段必须是对象"));continue
                if "text" in s:
                    if not isinstance(s["text"],str) or not s["text"].strip():
                        errors.append(issue("P0","EMPTY_TEXT",sloc,"空白段会触发出版台 INVALID_NOVEL_PACKAGE"))
                elif "wordId" in s:
                    wid=s["wordId"]
                    if wid not in by_id:errors.append(issue("P0","BROKEN_WORD_LINK",sloc,f"找不到词卡 ID：{wid}"))
                    if not (isinstance(s.get("surface"),str) and s["surface"].strip() and isinstance(s.get("gloss"),str) and s["gloss"].strip()):
                        errors.append(issue("P0","WORD_SEGMENT",sloc,"缺少 surface 或 gloss"))
                    if wid in by_id:
                        hw=norm(by_id[wid].get("headword"))
                        sf=norm(s.get("surface"))
                        if sf!=hw and sf not in (hw+"s",hw+"es",hw+"ed",hw+"ing"):
                            warnings.append(issue("P1","SURFACE_LEMMA",sloc,f"表面词 {sf} 与词目 {hw} 不同，需检查变形和原义项"))
                        if norm(s.get("gloss")) not in norm(by_id[wid].get("meaningZh")) and norm(by_id[wid].get("meaningZh")) not in norm(s.get("gloss")):
                            warnings.append(issue("P1","GLOSS_MISMATCH",sloc,"正文简释与词卡释义不完全对应，需人工审校"))
                    word_usage[wid]+=1;marks+=1;count["word_occurrences"]+=1
                else: errors.append(issue("P0","UNKNOWN_SEGMENT",sloc,"片段必须有 text 或 wordId"))
            rendered=render_segments(p);zh+=len(CHINESE_CHAR.findall(rendered))
            if HARD_MIXED.search(rendered):warnings.append(issue("P1","HARD_MIXED_LANGUAGE",ploc,"疑似机械硬嵌词，如 work室/meeting上，应审读"))
            density.append(sum(1 for s in segs if "wordId" in s)/1.0)
        china.append(zh)
        if min_chinese and zh<min_chinese:
            errors.append(issue("P1","SHORT_CHAPTER",loc,f"章节仅 {zh} 汉字，低于生产目标 {min_chinese}"))
    for wid in by_id:
        if not word_usage[wid]: warnings.append(issue("P2","UNUSED_CARD",f"words.{wid}","词卡没有被任何章节引用"))
    unique_used={(norm(by_id[w].get("headword")),norm_pos(by_id[w].get("partOfSpeech")),norm(by_id[w].get("meaningZh"))) for w in word_usage if w in by_id}
    used_hw={norm(by_id[w].get("headword")) for w in word_usage if w in by_id}
    unique_hw=len(used_hw)
    shelf_senses=shelf or []
    shelf_hw={norm(w.get("headword")) for w in shelf_senses if w.get("category")==cat}
    repeated=used_hw&shelf_hw if shelf_hw else set()
    ratio=round(len(repeated)/unique_hw,4) if shelf_hw and unique_hw else None
    if cat=="cet4":
        if not shelf_hw: errors.append(issue("P1","NO_PUBLISHED_SHELF","coverage","缺少已发布同级书架词库，不能核验35%"))
        elif ratio is not None and not .30<=ratio<=.40:
            errors.append(issue("P1","CET4_CROSSBOOK_RATIO","coverage",f"跨书重复率 {ratio*100:.1f}% 不在30%-40%；请按剧情合理修订"))
    if density and (sum(density)/len(density)<2.5 or sum(density)/len(density)>7):
        warnings.append(issue("P2","AVERAGE_DENSITY","chapters","平均每段标注量偏离约3–6；不可机械堆词"))
    for risk in ("semantic_primary_gloss","part_of_speech_in_context","dictionary_verified_ipa","example_naturalness",
                 "translation_fidelity","collocation_authenticity","originality","real_backend_validator","learning_state_crossbook",
                 "purchase_entitlement","cover_rights"):
        pass
    return {"errors":errors,"warnings":warnings,"metrics":{
        "bookId":metadata.get("id"),"category":cat,"chapters":len(chapters),"chapterChineseChars":china,
        "totalWordCards":len(words),"usedWordCardIds":len(word_usage),"uniqueHeadwordsUsed":unique_hw,
        "uniqueTeachingSensesUsed":len(unique_used),"wordOccurrences":count["word_occurrences"],
        "emptyCollocations":colloc_empty,"avgAnnotationsPerParagraph":round(sum(density)/len(density),2) if density else 0,
        "shelfWordCount":len(shelf_hw) if shelf_hw else None,"repeatedHeadwords":len(repeated) if shelf_hw else None,
        "newHeadwords":unique_hw-len(repeated) if shelf_hw else None,"crossBookRepeatRatio":ratio,
        "gradeSourceVerifiedCount":None,"humanReviewCompleted":False,"liveImporterValidated":False,
        "crossBookLearningStateVerified":False,
    },"status":"机器预检通过（仍待人工和真实后台验收）" if not errors else "待修订（未达到发布条件）"}


def qa_markdown(result):
    m=result["metrics"]
    out=["# WordLetter 小说离线质量报告","",f"生成时间：{timestamp()}",
         f"状态：**{result['status']}**","",
         "> 注意：这是离线模拟导入契约的预检，不是网站当前服务端 validatePackage，也不是词卡人工语义/IPA 审核或读者付费权限验收。",
         "", "## 定量指标",""]
    for k,v in m.items():out.append(f"- {k}: {v}")
    for label,items in (("阻断与修订项",result["errors"]),("提醒",result["warnings"])):
        out.extend(["",f"## {label}（{len(items)}）",""])
        for x in items[:200]:out.append(f"- **{x['level']} {x['code']}** `{x['where']}`：{x['detail']}")
        if len(items)>200:out.append(f"- 另有 {len(items)-200} 条，请查看 QA.json。")
    out.extend(["", "## 人工审核与发布闸门（默认全部未通过）", "",
                "- [ ] 小说原创/剧情/版权人工审核", "- [ ] 全部所用词义与正文真实语境逐卡比对", 
                "- [ ] 英美 IPA 依据权威词典逐义项核验", "- [ ] 双语例句与常用搭配自然性审核",
                "- [ ] 相同词义跨书复用身份且用户不会重复首次学习", "- [ ] 当前网站真实 validatePackage / 导入预检通过",
                "- [ ] 付费权限、0章试读、书籍版本回滚、封面合法性检查",
                "", "**禁止在全部闸门未完成时标记为‘可上架’或‘人工审核通过’。**",""])
    return "\n".join(out)


def report_for_json(book:dict, shelf:list|None=None, chapters=None, min_chinese=0):
    r=validate_package(book,shelf,chapters,min_chinese)
    return r


def package_project(project:Path):
    if not (project/"config.json").exists(): raise ValueError("缺少 config.json")
    cfg=read_json(project/"config.json")
    pkg=build_package(project)
    shelf=read_json(project/"shelf.json").get("senses",[]) if (project/"shelf.json").exists() else []
    qa=validate_package(pkg,shelf,cfg["chapters"],cfg["minimumChineseCharsPerChapter"])
    review_source=project/"review"/"summary.json"
    if review_source.exists():
        review=read_json(review_source)
        for x in review.get("issues",[]):
            qa["errors"].append(issue(x.get("severity","P1"),"AI_EDITOR_REVIEW",f"chapter:{x.get('chapter')}",
                                       x.get("problem", "AI 审稿有待复核项")))
        qa["metrics"]["aiReviewCompleted"] = True
        if review.get("issues"):
            qa["status"]="待修订（AI 复核有问题）"
    else:
        qa["metrics"]["aiReviewCompleted"] = False
        qa["errors"].append(issue("P1","NO_EDITOR_REVIEW","editorial","尚未独立执行 AI 全章节初审"))
        qa["status"]="待审核（缺少独立 AI 初审）"
    if len(pkg["words"]) and qa["metrics"]["usedWordCardIds"] < cfg["targetUniqueWords"]*.7:
        qa["errors"].append(issue("P1","LOW_VOCAB_COVERAGE","coverage","已用词卡少于规划目标70%，可能有过多未使用词卡"))
        qa["status"]="待修订（词汇覆盖不足）"
    folder=project/"output";folder.mkdir(exist_ok=True)
    write_json(folder/"出版台导入包.json",pkg)
    write_json(folder/"QA.json",qa)
    (folder/"质量与覆盖报告.md").write_text(qa_markdown(qa),encoding="utf-8")
    outline=read_json(project/"outline.json")
    (folder/"故事大纲.md").write_text("# "+str(outline.get("title",cfg["title"]))+"\n\n"+str(outline.get("description",""))+"\n\n"+"\n".join(f"## {x['number']}. {x['title']}\n\n{x['beat']}\n\n转折：{x['turn']}\n" for x in outline["chapters"]),encoding="utf-8")
    story=[f"# {pkg['book']['title']}",""]
    for ch in pkg["chapters"]:
        story.append(f"## 第{ch['number']}章 {ch['title']}\n")
        story.extend(render_segments(p)+"\n" for p in ch.get("paragraphs",[]))
    (folder/"完整小说阅读稿.md").write_text("\n".join(story),encoding="utf-8")
    with (folder/"最终词卡审校表.csv").open("w",encoding="utf-8-sig",newline="") as fh:
        wr=csv.writer(fh);wr.writerow(["word_id","headword","part_of_speech","meaning_zh","phonetic_uk","phonetic_us","example_en","example_zh","collocations","qa_status","review_note"])
        for w in pkg["words"]:
            wr.writerow([w.get("id"),w.get("headword"),w.get("partOfSpeech"),w.get("meaningZh"),w.get("phoneticUk"),w.get("phoneticUs"),w.get("exampleEn"),w.get("exampleZh"),json.dumps(w.get("collocations",[]),ensure_ascii=False),"待人工审核",""])
    if review_source.exists():
        shutil.copyfile(review_source,folder/"AI逐章复核汇总.json")
    plan_source=project/"vocab_plan.json"
    if plan_source.exists():
        plan=read_json(plan_source)
        shelf_index={(norm(x.get("headword")),norm_pos(x.get("partOfSpeech")),norm(x.get("meaningZh"))) for x in shelf}
        with (folder/"候选词与义项台账.csv").open("w",encoding="utf-8-sig",newline="") as fh:
            wr=csv.writer(fh)
            wr.writerow(["word_id","headword","pos","sense_key","meaning_zh","grade","source_status","existing_exact_sense_candidate","planned_chapters","status"])
            for w in plan:
                key=(norm(w.get("headword")),norm_pos(w.get("partOfSpeech")),norm(w.get("meaningZh")))
                wr.writerow([w.get("id"),w.get("headword"),w.get("partOfSpeech"),w.get("senseKey"),
                             w.get("meaningZh"),cfg["category"],w.get("sourceStatus","not_verified"),
                             "yes_candidate_only" if key in shelf_index else "no", 
                             ",".join(str(x) for x in w.get("plannedChapters",[])),"待人工审核"])
    (folder/"修订日志与检查清单.md").write_text(
        "# 修订日志与出版前复核清单\n\n## 改动记录\n\n| 日期 | wordId/chapterId | 原值 | 新值 | 原因 | 审核人 |\n|---|---|---|---|---|---|\n| 待填写 | | | | | |\n\n"
        "## 准入清单\n\n- [ ] 剧情与原创/版权人工审读\n- [ ] 全量词卡释义、词性、音标词典核验\n"
        "- [ ] 全部自然例句、双语翻译、常用搭配审核\n- [ ] 章节词卡 ID 和跨书同义学习状态验证\n"
        "- [ ] 当前网站 validatePackage 实际执行通过\n- [ ] 运营台封面、权限、0试读配置检查\n"
        "- [ ] 有隔离测试、正式 D1 新备份和恢复方案再批准上架\n",encoding="utf-8")
    (folder/"人工验收与发布说明.md").write_text("# 发布前必须完成的人工审查\n\n- 本文件只在本机生成，**没有上传 Cloudflare**。\n- 即使 QA.json 没有自动错误，词义/IPA/例句/版权/真实导入/权限也都必须单独核对。\n- 当前导入包默认 preview=false；禁止未经批准改为免费章节。\n- 对照当前运营台真实内容校验器上传预检，必须人工确认后才可上架。\n- 不要把任何包含用户、订单、密钥的生产 SQL 上传仓库。\n",encoding="utf-8")
    dest=project/("WordLetter_"+cfg["bookId"]+"_审核待确认.zip")
    with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(folder.iterdir()):
            if p.is_file(): z.write(p,arcname=p.name)
    print("\n已生成出版台候选包（默认待人工审核）：",dest)
    print("离线结构/P1 问题数量：",len(qa["errors"]),"，其他提醒：",len(qa["warnings"]))
    print("详细错误：",folder/"质量与覆盖报告.md")
    return qa,dest


def demo(folder:Path):
    folder.mkdir(parents=True,exist_ok=True)
    cfg={"bookId":"wl-demo-not-for-sale","title":"演示：雨后线索","category":"cet6","genre":"原创悬疑",
         "chapters":2,"targetUniqueWords":10,"minimumChineseCharsPerChapter":0,"previewChapters":0}
    write_json(folder/"config.json",cfg)
    write_json(folder/"shelf.json",{"status":"not_provided","senses":[]})
    write_json(folder/"outline.json",{"title":cfg["title"],"description":"仅用于验证构建与打包结构，不可作为售卖小说。","chapters":[{"number":1,"title":"门口的灯","beat":"调查旧事","turn":"出现谜团"},{"number":2,"title":"回信","beat":"找到证据","turn":"解开谜团"}]})
    labels=[("evidence","n.","证据","/ˈevɪdəns/"),("record","n.","记录","/ˈrekɔːd/"),("message","n.","消息","/ˈmesɪdʒ/"),("archive","n.","档案","/ˈɑːkaɪv/"),("confirm","v.","确认","/kənˈfɜːm/"),("notice","n.","通知","/ˈnəʊtɪs/"),("detail","n.","细节","/ˈdiːteɪl/"),("answer","n.","答案","/ˈɑːnsə/"),("decision","n.","决定","/dɪˈsɪʒən/"),("risk","n.","风险","/rɪsk/")]
    cards=[]
    for i,(h,pos,zh,ipa) in enumerate(labels):
        cards.append({"id":f"demo-{i:02d}","headword":h,"phoneticUk":ipa,"phoneticUs":ipa,"partOfSpeech":pos,"meaningZh":zh,
                      "exampleEn":f"The team checked the {h} carefully.","exampleZh":f"团队认真核实了{zh}。","collocations":[{"en":f"important {h}","zh":f"重要的{zh}"}]})
    write_json(folder/"cards"/"merged.json",cards)
    for i in (1,2):
        para={"segments":[{"text":"雨停后，他回到档案室，终于发现了那封被遗忘的"},
                          {"wordId":"demo-02","surface":"message","gloss":"消息"},
                          {"text":"。其中一条手写记录让所有人沉默，调查终于有了方向。"}]}
        write_json(folder/"chapters"/f"ch{i:02d}.json",{"id":f"wl-demo-not-for-sale-ch{i:02d}","number":i,"title":"门口的灯" if i==1 else "回信","preview":False,"paragraphs":[para]})
    return package_project(folder)


def main():
    parser=argparse.ArgumentParser(prog="novel_agent.py",description="妙屋英语小说生成 Agent — Codex 本地生成 + 严格离线 QA / 打包")
    sub=parser.add_subparsers(dest="command",required=True)
    p=sub.add_parser("new",help="创建一部新书项目")
    p.add_argument("--title",required=True);p.add_argument("--genre",default="悬疑")
    p.add_argument("--category",required=True,choices=sorted(CATS));p.add_argument("--chapters",type=int,default=8)
    p.add_argument("--words",type=int,default=130);p.add_argument("--min-chars",type=int,default=750)
    p.add_argument("--out",required=True);p.add_argument("--shelf",help="可选 P5 内容审核包 / 匿名书架词库")
    p.add_argument("--lexicon",help="可选参考词表 CSV (非官方等级认证)")
    p=sub.add_parser("run",help="使用已登录的 Codex 分阶段生成完整小说")
    p.add_argument("--project",required=True);p.add_argument("--stage",choices=["all","outline","cards","chapters","review"],default="all")
    p.add_argument("--batch-size",type=int,default=22)
    p=sub.add_parser("pack",help="从已生成章节和词卡打包离线出版候选文件")
    p.add_argument("--project",required=True)
    p=sub.add_parser("check",help="检查已有出版社 JSON 文件 (只读)")
    p.add_argument("--file",required=True);p.add_argument("--shelf");p.add_argument("--out");p.add_argument("--min-chars",type=int,default=0)
    p=sub.add_parser("demo",help="用合成短故事检查结构+打包，非AI小说")
    p.add_argument("--out",default="./demo-workspace")
    p=sub.add_parser("wizard",help="交互式引导创建项目并运行")
    p.add_argument("--out-root",default="./projects")
    args=parser.parse_args()
    try:
        if args.command=="new":make_config(args)
        elif args.command=="run":run_agent(Path(args.project).expanduser().resolve(),args.stage,args.batch_size)
        elif args.command=="pack":package_project(Path(args.project).expanduser().resolve())
        elif args.command=="check":
            b=read_json(Path(args.file).expanduser())
            shelf=published_shelf(Path(args.shelf).expanduser()) if args.shelf else []
            result=report_for_json(b,shelf,None,args.min_chars)
            out=Path(args.out).expanduser() if args.out else Path(args.file).with_suffix(".qa.json")
            write_json(out,result)
            out.with_suffix(".md").write_text(qa_markdown(result),encoding="utf-8")
            print("预检结果：",result["status"],"；P0/P1 条目：",len(result["errors"]),"；报告：",out)
        elif args.command=="demo":demo(Path(args.out).expanduser().resolve())
        elif args.command=="wizard":
            print("\n妙屋英语 · 小说生产 Agent（需要 Codex CLI 已登录）\n")
            title=input("书名（回车使用建议名）: ").strip() or "雨夜来信"
            genre=input("题材（悬疑/都市/言情/玄幻/BL 等）: ").strip() or "原创悬疑"
            cat=input("等级 [cet4/cet6/postgrad/ielts] (默认 cet4): ").strip().lower() or "cet4"
            ch=int(input("章节数（默认8）: ").strip() or "8")
            words=int(input("目标不同英语词目数（默认130）: ").strip() or "130")
            dest=Path(args.out_root).expanduser()/f"{cat}-{sha(title)}"
            req=argparse.Namespace(title=title,genre=genre,category=cat,chapters=ch,words=words,
                                   min_chars=750,out=str(dest),shelf=None,lexicon=None)
            pr=make_config(req)
            answer=input("现在开始调用 Codex 生成？[y/N] ").strip().lower()
            if answer=="y":run_agent(pr,"all")
            else:print("以后运行: python3 novel_agent.py run --project",pr)
    except (ValueError, AssertionError, RuntimeError, FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        print("\n错误：",str(e),file=sys.stderr)
        return 2
    return 0

if __name__=="__main__":sys.exit(main())