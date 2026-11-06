# -*- coding: utf-8 -*-
"""Story-first pre-writing gate for WordLetter (V1.1).

No production network calls. The injected Codex runner writes only project-local JSON.
Story gate is a *pre-draft* editorial filter, NOT a certification of literary quality.
"""
from __future__ import annotations
import json
import hashlib
import re
import shutil
from pathlib import Path

FIELDS=("beat","turn","goal","obstacle","decision","consequence","newInformation","hook","causalLink")
BIBLE_FIELDS=("storyPromise","centralConflict","stakes","distinctiveElement","endingPayoff")
SCORE_FIELDS={"openingHook":20,"characterMotivation":20,"causalProgression":25,"conflictAndStakes":20,"originalityAndPayoff":15}
MIN_SCORE=85


def _read(p:Path): return json.loads(p.read_text(encoding="utf-8"))
def _write(p:Path,obj):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def _clean(x):return re.sub(r"\s+","",str(x or "").strip()).lower()
def outline_hash(project:Path):
    path=project/"outline.json"
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None

def approved(project:Path):
    report=project/"story_gate_report.json"
    if not report.is_file():return False
    info=_read(report)
    return info.get("status")=="AI_outline_precheck_passed" and info.get("outlineSha256")==outline_hash(project)

def outline_issues(outline:dict,chapter_count:int):
    issues=[]
    if not isinstance(outline,dict):return ["大纲顶层必须是 JSON 对象"]
    bible=outline.get("storyBible")
    if not isinstance(bible,dict):return ["缺少 storyBible：不能只靠章节标题开始写小说"]
    for key in BIBLE_FIELDS:
        if len(_clean(bible.get(key)))<14:issues.append(f"storyBible.{key} 太笼统（建议至少14字的具体可检验信息）")
    people=bible.get("characters",[])
    if not isinstance(people,list) or len(people)<2:issues.append("角色表必须至少包含两位有冲突关系的主要角色")
    else:
        for idx,person in enumerate(people[:5],1):
            if not isinstance(person,dict):issues.append(f"角色{idx}不是对象");continue
            for key in ("name","want","fear","flaw","change"):
                if len(_clean(person.get(key))) < (2 if key=="name" else 7):issues.append(f"角色{idx}.{key} 缺少具体内容")
    chapters=outline.get("chapters",[])
    if not isinstance(chapters,list) or len(chapters)!=chapter_count:
        issues.append(f"需要 {chapter_count} 章且每章完整，实际 {len(chapters) if isinstance(chapters,list) else '非法'}");return issues
    seen=set();prev=None
    for idx,ch in enumerate(chapters,1):
        if not isinstance(ch,dict):issues.append(f"第{idx}章不是对象");continue
        if ch.get("number")!=idx:issues.append(f"第{idx}章 number 必须为 {idx}")
        if len(_clean(ch.get("title")))<2:issues.append(f"第{idx}章缺少章节标题")
        for field in FIELDS:
            minlen=20 if field=="beat" else 9
            if len(_clean(ch.get(field)))<minlen:issues.append(f"第{idx}章 {field} 不够具体（至少{minlen}字）")
        b=_clean(ch.get("beat"))
        if b in seen:issues.append(f"第{idx}章与此前章节剧情推进重复")
        seen.add(b)
        if idx>1 and _clean(ch.get("causalLink")) in ("继续上章","承接上章","剧情继续","继续调查"):
            issues.append(f"第{idx}章 causalLink 不能是笼统承接")
        if idx==chapter_count and len(_clean(ch.get("consequence")))<12:issues.append("结局必须交代决定的实际后果")
    return issues


def story_outline_prompt(project:Path):
    cfg=_read(project/"config.json")
    return f"""你是妙屋英语的原创小说主编。第一阶段只设计一部**拿掉所有英语词依然好看**的中文小说，不写词表、不写词卡、不写正文。
读取 AGENTS.md、PRODUCTION_RULES.md、config.json；只写项目内 outline.json，不修改其他文件。
设定：书名《{cfg["title"]}》，题材{cfg["genre"]}，总计{cfg["chapters"]}章。
严格要求：先决定故事核心悬念/情绪承诺及最终答案，人物欲望和代价，首章真实钩子；每章要有可见事件、行动受阻、人物主动选择、实质性状态变化、由上一章导致的因果链、引出下一章的追读问题。避免主角反复查看资料、谈话、犹豫但什么都没改变；不能靠凭空证据解谜。后半段逐步收束伏笔，完结必须偿还初始悬念、让人物付出代价或产生改变。
写入合法 JSON，示例结构：
{{"title":"{cfg['title']}","description":"具有独特冲突与故事钩子的简介","storyBible":{{"storyPromise":"读者为什么想看、核心问题","centralConflict":"具体人物与目标如何冲突","stakes":"失败的真实后果与升级","distinctiveElement":"区别于常见套路的具体机制","endingPayoff":"开篇悬念如何在结局被有因果地解答","characters":[{{"name":"姓名","want":"具体可验证的愿望","fear":"害怕的损失","flaw":"影响选择的缺点","change":"故事中的真实转变"}},{{"name":"另一位姓名","want":"目标","fear":"损失","flaw":"缺点","change":"改变"}}]}},"chapters":[{{"number":1,"title":"章节名","beat":"本章发生的具体事件，40字以上","turn":"造成局面改变的转折","goal":"这一章主角主动要做什么","obstacle":"阻挡目标的具体事件或人物","decision":"主角作出的有代价的决定","consequence":"决定导致的可见后果","newInformation":"新线索/新情报和可信获得方式","hook":"结尾真正让读者想继续读的问题","causalLink":"由何种已知事实引发本章事件"}}]}}
必须严格 {cfg['chapters']} 章，每项具体有内容。不能用“调查继续”“有意外发现”“更加复杂”等无实质变化的空话，人物不要每章重复同一争吵。保持原创，不模仿特定版权小说。
现在只生成 outline.json，必须是完整可解析 JSON。"""


def story_critique_prompt(project:Path,target:str):
    return f"""你是一位**没有参与该作品策划**的严格故事策划主编。只读 config.json、outline.json 和 STORY_GATE_STANDARD.md，忽略词卡与学习指标，站在普通付费网文读者角度挑毛病。只能写入 {target}，绝不修改 outline.json。
检查：开场是否有效钩人；反派/阻力是否真实；每章是否推进因果而非闲谈/注水；人物选择有无代价；伏笔和结局是否公平回收；事件/章节能否互换而不影响故事；有没有套路式堆砌和机械反转。不能只称赞，不要因长篇公式化而给高分。
输出合法 JSON：{{"verdict":"pass|revise","scores":{{"openingHook":0,"characterMotivation":0,"causalProgression":0,"conflictAndStakes":0,"originalityAndPayoff":0}},"chapterComments":[{{"chapter":1,"evidence":"对应大纲中可核对的具体事件","finding":"章节中的实质进展或疑点"}}],"issues":[{{"severity":"P0|P1|P2","chapter":1,"evidence":"指出大纲的具体事件/字段","why":"因果、注水、动机或悬念问题","fix":"具体修改什么行动及后果"}}],"editorNote":"为何这部故事不靠学单词仍能吸引读者"}}
各分值满分分别为 openingHook=20, characterMotivation=20, causalProgression=25, conflictAndStakes=20, originalityAndPayoff=15。评分有证据，最后一章必须审视伏笔回收；逐章给出带证据的评论，恰好与章节总数一致。任何 P0/P1 必须 verdict=revise，不得因为总分看起来高而放行。该结果只是 AI 策划审稿，不代表真人已阅读或证明小说好看。"""


def critique_issues(critique:dict,chapters:int):
    issues=[]
    if not isinstance(critique,dict):return ["审稿输出不是对象"]
    score=critique.get("scores",{})
    if not isinstance(score,dict):return ["审稿缺少各项评分"]
    for key,full in SCORE_FIELDS.items():
        val=score.get(key)
        if not isinstance(val,(int,float)) or not 0<=val<=full:issues.append(f"评分 {key} 非法")
        elif val < full*0.6:issues.append(f"{key} 得分过低 {val}/{full}")
    total=sum(score.get(k,0) for k in SCORE_FIELDS if isinstance(score.get(k),(int,float)))
    if total < MIN_SCORE:issues.append(f"故事大纲策划审稿 {total} 分低于 {MIN_SCORE} 分建议门槛")
    if critique.get("verdict")!="pass":issues.append("独立审稿未通过，仍需修订")
    comments=critique.get("chapterComments",[])
    if not isinstance(comments,list) or len(comments)!=chapters:issues.append("独立审稿必须逐章评议")
    else:
        if [x.get("chapter") for x in comments if isinstance(x,dict)]!=list(range(1,chapters+1)):
            issues.append("逐章评议章节号错误")
        for n,x in enumerate(comments,1):
            if not isinstance(x,dict) or len(_clean(x.get("evidence")))<6 or len(_clean(x.get("finding")))<6:
                issues.append(f"第{n}章审稿意见无具体证据")
    for x in critique.get("issues",[]):
        if not isinstance(x,dict) or x.get("severity") in ("P0","P1"):
            issues.append("独立审稿仍有 P0/P1 剧情问题")
        elif len(_clean(x.get("evidence")))<5:issues.append("审稿问题缺乏证据")
    if len(_clean(critique.get("editorNote")))<18:issues.append("缺少独立审稿综合判断")
    return issues


def vocab_prompt(project:Path):
    cfg=_read(project/"config.json")
    repetition=("四级跨书去重目标30%–40%，优先35%" if cfg["category"]=="cet4" else "该等级未制定跨书复现硬目标，只报告实际比例，不套用四级35%的标准")
    return f"""你是妙屋英语词汇课程设计师。**剧情方案已通过独立 AI 大纲评审**，请先读 config.json、outline.json、story_review.json、shelf.json、AGENTS.md 和 PRODUCTION_RULES.md。
故事必须原样保留，不为凑单词改动大纲。只写 vocab_plan.json，不修改 outline.json、story_review.json 和其他已有文件。
围绕各章的具体人物行动自然选择约{cfg["targetUniqueWords"]}个不同目标词；适合嵌入原句和语境的优先，不合适的词放弃，不要提前认定词汇通过权威等级核验。
输出 JSON 数组 [{{"headword":"evidence","partOfSpeech":"n.","meaningZh":"证据","senseKey":"evidence|n.|证据","sourceStatus":"reference_candidate","plannedChapters":[2,5]}}]；所有计划章节介于 1 和 {cfg["chapters"]}，同一英文+词性+义项不可重复。
{repetition}，只能基于 shelf.json 真实旧词目做候选对比，不能只根据wordId判断。不同义项不得合并。同书词汇可自然复现。对于难以自然嵌入的词，不要凑够数字而牺牲剧情。
现在完整写入 vocab_plan.json。"""


def revision_prompt(project:Path,issue_file:str):
    cfg=_read(project/"config.json")
    return f"""你是妙屋英语故事策划主编。请读取 outline.json、{issue_file}、STORY_GATE_STANDARD.md，针对具体指出的剧情漏洞进行改稿，不要改写成无关新故事。
仅覆盖写入 outline.json；不要触碰 vocab_plan.json、章节/词卡，不能改书名或总章数（{cfg['chapters']}）。
每次修改都必须给因果动作、人物实际代价、新事件、伏笔回收；不能简单把文本拉长蒙混通过。所有 storyBible 字段和章节字段必须保留，返回完整合法 JSON。"""


def ensure_story_ready(project:Path,runner,max_revisions:int=2):
    """Stop before any word/card/chapter generation unless the story passes both gates.

    Returns accepted outline; preserves every previous outline/critique in history on revisions.
    """
    cfg=_read(project/"config.json")
    count=cfg["chapters"]
    standard=project/"STORY_GATE_STANDARD.md"
    if not standard.exists():
        source=Path(__file__).resolve().parent/"STORY_GATE_STANDARD.md"
        shutil.copyfile(source,standard)
    out=project/"outline.json"
    report=project/"story_gate_report.json"
    review=project/"story_review.json"
    if report.is_file() and review.is_file() and not approved(project):
        # An edited outline must never inherit an old AI approval.
        review.unlink()
    if not out.exists():runner(project,"原创剧情方案（先不选词）",story_outline_prompt(project),out)
    for attempt in range(max_revisions+1):
        structure=outline_issues(_read(out),count)
        report=project/"story_gate_report.json"
        if structure:
            _write(report,{"status":"blocked","stage":"structure","issues":structure,"humanApproval":False})
            if attempt>=max_revisions:raise RuntimeError(f"故事结构检查未通过，已停止选词和写小说；详见 {report}")
            history=project/"story_history";history.mkdir(exist_ok=True)
            shutil.copyfile(out,history/f"outline_before_fix_{attempt+1}.json")
            runner(project,f"修订大纲结构 {attempt+1}",revision_prompt(project,"story_gate_report.json"),out)
            continue
        review=project/"story_review.json"
        if not review.exists():runner(project,"独立剧情主编审核",story_critique_prompt(project,"story_review.json"),review)
        problems=critique_issues(_read(review),count)
        if not problems:
            _write(report,{"status":"AI_outline_precheck_passed","stage":"story_before_vocabulary","score":sum(_read(review)["scores"].values()),"outlineSha256":outline_hash(project),"humanApproval":False,"warning":"大纲通过AI预检，正文可读性和文学质量仍需真实阅读审校"})
            return _read(out)
        _write(report,{"status":"blocked","stage":"editorial","issues":problems,"aiCritique":_read(review),"humanApproval":False})
        if attempt>=max_revisions:raise RuntimeError(f"独立剧情审核未通过，停止后续生成；详见 {report}")
        history=project/"story_history";history.mkdir(exist_ok=True)
        shutil.copyfile(out,history/f"outline_before_fix_{attempt+1}.json")
        shutil.copyfile(review,history/f"story_review_before_fix_{attempt+1}.json")
        review.unlink()
        runner(project,f"修订剧情问题 {attempt+1}",revision_prompt(project,"story_gate_report.json"),out)
    raise RuntimeError("故事预审被阻断")