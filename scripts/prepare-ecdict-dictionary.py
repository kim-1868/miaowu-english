#!/usr/bin/env python3
"""Offline licensed ECDICT CSV -> compact, reviewable supplemental dictionary chunks.

This NEVER writes to Cloudflare, GitHub or the production database.
Source: https://github.com/skywind3000/ECDICT (MIT repository license).
Before commercial distribution, preserve ECDICT LICENSE and validate data provenance.
Example:
 python3 scripts/prepare-ecdict-dictionary.py /private/ecdict.csv --out /tmp/miaowu-dictionary --limit 12000
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

VALID = re.compile(r"^[a-z][a-z'-]{0,39}$")
HAN = re.compile(r"[\u3400-\u9fff]")
def cli():
    p=argparse.ArgumentParser()
    p.add_argument("csv_file", type=Path, help="Local ECDICT ecdict.csv; never downloaded at runtime")
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--limit", type=int, default=12000)
    p.add_argument("--chunk-size", type=int, default=140)
    args=p.parse_args()
    if not 100 <= args.limit <= 40000 or not 20 <= args.chunk_size <= 180:
        p.error("limits: 100..40000 words, 20..180 records/chunk")
    args.out.mkdir(parents=True, exist_ok=True)
    source_hash=hashlib.sha256()
    with args.csv_file.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):
            source_hash.update(block)
    candidates={}
    with args.csv_file.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            word=(row.get("word") or "").strip().lower()
            trans=(row.get("translation") or "").strip()
            if not VALID.fullmatch(word) or not HAN.search(trans):
                continue
            translation=re.sub(r"\s+", " ", trans)
            # Avoid wholesale copying of large dictionary article content.
            # Keep only brief at-a-glance translations and flag for later editing.
            translation=translation[:280]
            phonetic=(row.get("phonetic") or "").strip()[:90]
            pos=(row.get("pos") or "").strip()[:64]
            try:
                frq=int(row.get("frq") or 0)
                bnc=int(row.get("bnc") or 0)
            except ValueError:
                frq=bnc=0
            valid_ranks=[v for v in (frq,bnc) if v>0]
            if not valid_ranks:
                continue
            rank=min(valid_ranks)
            item={"word":word,"phonetic":phonetic,"pos":pos,
                "translation_zh":translation,"source":"ECDICT"}
            if word not in candidates or rank<candidates[word][0]:
                candidates[word]=(rank,item)
    selected=sorted(candidates.values(),key=lambda x:(x[0],x[1]["word"]))[:args.limit]
    selection=[x[1] for x in selected]
    for start in range(0,len(selection),args.chunk_size):
        output=args.out/f"chunk-{start//args.chunk_size+1:04d}.json"
        output.write_text(json.dumps({"entries":selection[start:start+args.chunk_size]},
            ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    manifest={"source":"skywind3000/ECDICT","repository":"https://github.com/skywind3000/ECDICT",
      "license":"MIT (preserve upstream license and attribution)",
      "source_sha256":source_hash.hexdigest(),
      "entries":len(selection),"chunks":(len(selection)+args.chunk_size-1)//args.chunk_size,
      "warning":"Dictionary reference only; not verified novel-specific lexical senses or approved learning cards."}
    (args.out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(manifest,ensure_ascii=False))
if __name__=="__main__":
    cli()
