#!/usr/bin/env python3
"""Release helper: compose ONLY approved P1 delta on the currently running production sources.
Requires a read-only Cloudflare Worker source archive and live public assets;
writes solely to the temporary CI checkout. No Cloudflare mutation or D1 access.
"""
import hashlib
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser
from pathlib import Path

ROOT=Path.cwd()
ORIGIN='https://miaowu-english-pages.pages.dev'
BASE='af3ee6b3d7b7068e2501943bd8a5eff2673afea9'
PATCH='0e7b9e9970a0cccb4169c1915f32b20df298b4be'
DELTA_FILES=(
    'src/echo-cloud.js',
    'public/app.js','public/flashcards.js','public/flashcards.css','public/echo-cloud.js',
)
LIVE_DIFFS={
    'app.js','index.html','flashcards.js','flashcards.css','echo-cloud.js',
    'ops-console.css','ops-console.js','ops.html','styles.css'
}
EXPECTED_HASH_PREFIX={
    'app.js':'51af970f6d8f9c34',
    'index.html':'80fa12f07c7d1f6e',
    'flashcards.js':'f5001d4e8217cec1',
    'flashcards.css':'0fe2ee63dbc6e988',
    'echo-cloud.js':'77148f2ab1d19cb2',
    'ops-console.js':'e6d71459b6465e55',
    'ops-console.css':'abed82cc7a3269be',
    'ops.html':'76d8f174d20e283d',
    'styles.css':'950f16334e07b8ac',
}
JS_VERSIONS={
    'flashcards.css':'20261117-interaction',
    'echo-cloud.js':'20261117-instant',
    'flashcards.js':'20261117-instant',
    'app.js':'20261117-live-merged-inplace',
}

def assert_tag(value,marker):
    assert marker in value, 'REQUIRED_LIVE_OR_PATCH_MARKER_MISSING_'+marker

def live_assets():
    names=json.loads(Path('/tmp/p1-assets-approved.json').read_text())
    assert len(names)==50 and len(set(names))==50, 'PRODUCTION_ALLOWLIST_CHANGED_ABORT'
    assert 'sense-reader-bridge.js' not in names, 'BRIDGE_NOW_IN_BASELINE_REVIEW'
    expected=set(names)|{'sense-reader-bridge.js'}
    def fetch(name):
        command=['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','25',
                 f'{ORIGIN}/{name}?p1_preserve_prod_20261117=1']
        proc=subprocess.run(command,capture_output=True)
        if proc.returncode:raise RuntimeError('LIVE_ASSET_FETCH_FAILED_'+name)
        return name,proc.stdout
    with ThreadPoolExecutor(max_workers=8) as p:
        items=list(p.map(fetch,sorted(expected)))
    files=dict(items)
    diffs=set()
    for name in names:
        data=files[name]
        candidate=(ROOT/'dist-production/public'/name).read_bytes()
        if data!=candidate: diffs.add(name)
        if name in EXPECTED_HASH_PREFIX:
            actual=hashlib.sha256(data).hexdigest()
            assert actual.startswith(EXPECTED_HASH_PREFIX[name]),'LIVE_ASSET_CHANGED_STOP_'+name
    assert diffs==LIVE_DIFFS, ('LIVE_ASSET_DIVERGENCE_ABORT',sorted(diffs^LIVE_DIFFS))
    assert b'senseReader' in files['sense-reader-bridge.js'] or b'Miaowu' in files['sense-reader-bridge.js'] or b'example' in files['sense-reader-bridge.js'], 'UNRECOGNIZED_LIVE_BRIDGE'
    for name,data in files.items():
        for folder in ('public','dist-production/public'):
            path=ROOT/folder/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(data)
    print('EXACT_LIVE_PUBLIC_ASSETS_RESTORED',len(files),'LIVE_DIFFERENCES',sorted(diffs),flush=True)
    return files

def worker_sources():
    headers=Path('/tmp/p1-prod-headers').read_text(errors='replace')
    cts=[line.strip().split(':',1)[1].strip() for line in headers.splitlines() if line.lower().startswith('content-type:')]
    assert cts and 'multipart/form-data' in cts[-1], 'NO_WORKER_SOURCEMAP_MULTIPART'
    msg=BytesParser(policy=policy.default).parsebytes(('Content-Type: '+cts[-1]+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+Path('/tmp/p1-prod-multipart').read_bytes())
    parts=list(msg.iter_parts())
    maps=[part for part in parts if (part.get_filename() or '').endswith('.map')]
    assert len(maps)==1, 'MISSING_WORKER_SOURCEMAP'
    sm=json.loads(maps[0].get_payload(decode=True))
    names=sm.get('sources',[])
    contents=sm.get('sourcesContent',[])
    assert len(names)==len(contents) and len(names)>=35 and all(t is not None for t in contents),'INCOMPLETE_LIVE_SOURCE_MAP'
    restored=[]
    for name,source in zip(names,contents):
        if not name.startswith('../src/'):continue
        rest=name.removeprefix('../src/')
        assert rest and '..' not in Path(rest).parts and not Path(rest).is_absolute(), 'UNSAFE_SOURCE_MAP_NAME'
        target=ROOT/'src'/rest
        assert target.exists(), 'LIVE_SOURCE_MODULE_NOT_PRESENT_IN_RELEASE_TREE_'+rest
        target.write_text(source,encoding='utf-8')
        restored.append(rest)
    assert len(restored)>=35, 'INSUFFICIENT_LIVE_WORKER_MODULES'
    for name in ('worker.js','reading-library.js','echo-cloud.js','ops-import.js','ops-console.js','my-bookshelf.js'):
        assert name in restored,'LIVE_WORKER_MODULE_MISSING_'+name
    assert_tag((ROOT/'src/worker.js').read_text(), 'handleEcho')
    print('EXACT_RUNNING_PROD_WORKER_MODULES_RESTORED',len(restored),flush=True)

def patch_live_file(file):
    original=subprocess.check_output(['git','show',f'{BASE}:{file}'])
    candidate=subprocess.check_output(['git','show',f'{PATCH}:{file}'])
    current=(ROOT/file).read_bytes()
    p=Path('/tmp/p1-old-'+Path(file).name)
    q=Path('/tmp/p1-new-'+Path(file).name)
    c=Path('/tmp/p1-live-'+Path(file).name)
    p.write_bytes(original);q.write_bytes(candidate);c.write_bytes(current)
    proc=subprocess.run(['git','merge-file','-p','--diff3',str(c),str(p),str(q)],capture_output=True)
    assert proc.returncode==0 and b'<<<<<<<' not in proc.stdout,'LIVE_MERGE_CONFLICT_'+file
    if original!=candidate:assert proc.stdout!=current,'P1_PATCH_NOT_APPLIED_'+file
    (ROOT/file).write_bytes(proc.stdout)
    if file.startswith('public/'):
        (ROOT/'dist-production'/file).write_bytes(proc.stdout)
    print('P1_PATCH_CLEAN_THREEWAY',file,'bytes',len(proc.stdout),flush=True)

def patch_index_html():
    path=ROOT/'public/index.html'
    text=path.read_text()
    old=text
    for asset,version in JS_VERSIONS.items():
        prefix='/'+asset+'?v='
        assert text.count(prefix)==1,'MULTIPLE_OR_NO_CACHE_ASSET_'+asset
        start=text.index(prefix)+len(prefix)
        end=text.index('"',start)
        text=text[:start]+version+text[end:]
    assert old!=text, 'CACHE_NOT_UPDATED'
    for marker in ('sense-reader-bridge.js','tabindex="-1"','siteUpdateBanner','myBookshelf'):
        assert_tag(text,marker)
    path.write_text(text)
    (ROOT/'dist-production/public/index.html').write_text(text)
    print('P1_LIVE_INDEX_SCRIPT_VERSIONS_UPDATED_BRIDGE_PRESERVED',flush=True)

def verify_static():
    expected=set(json.loads(Path('/tmp/p1-assets-approved.json').read_text()))|{'sense-reader-bridge.js'}
    actual={f.name for f in (ROOT/'dist-production/public').iterdir() if f.is_file()}
    assert actual==expected, 'PRODUCTION_STATIC_BUNDLE_UNEXPECTED_FILES'
    for name in ('ops-console.js','ops-console.css','ops.html','styles.css'):
        assert hashlib.sha256((ROOT/'dist-production/public'/name).read_bytes()).hexdigest().startswith(EXPECTED_HASH_PREFIX[name]), 'OPS_OR_STYLE_REGRESSION_'+name
    for file,markers in {
        'app.js':['wordbookWrites','progressOutbox','routeRequest'],
        'flashcards.js':['requestId','pending'],
        'echo-cloud.js':['requestId','persistAnswer'],
        'index.html':['sense-reader-bridge.js','20261117-live-merged-inplace'],
    }.items():
        value=(ROOT/'dist-production/public'/file).read_text()
        for marker in markers:assert_tag(value,marker)
    server=(ROOT/'src/echo-cloud.js').read_text()
    for marker in ('requestId','review_events'):assert_tag(server,marker)
    print('PRODUCTION_51_ASSETS_ASSERTED_46_UNCHANGED_AND_5_PATCHED',flush=True)

def main():
    worker_sources()
    live_assets()
    for file in DELTA_FILES:patch_live_file(file)
    patch_index_html()
    verify_static()
    print('P1_PRODUCTION_COMPOSITE_READY_FROM_ACTUAL_LIVE_NO_DB_WRITES',flush=True)

if __name__=='__main__':main()
