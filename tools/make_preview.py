#!/usr/bin/env python3
"""Copy a build of the app into preview/ so it can be tried at .../Calorie-Tracker/preview/ (and in the
Fuel Preview app) before it goes live.

  python3 tools/make_preview.py            # preview the files in the working tree
  python3 tools/make_preview.py my-branch  # preview a branch without checking it out

The preview has its own food database and shares the live site's icons and scanner files, has no offline cache, and shows
an orange PREVIEW tag. It signs in to the same accounts, so anything logged there is real data.
"""
import os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ref = sys.argv[1] if len(sys.argv) > 1 else None

def read(path):
    if ref:
        return subprocess.run(['git', 'show', f'{ref}:{path}'], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return open(os.path.join(ROOT, path), encoding='utf-8').read()

def swap(s, pairs, name):
    for a, b in pairs:
        if a not in s:
            sys.exit(f'{name}: expected text not found: {a}')
        s = s.replace(a, b)
    return s

html = swap(read('index.html'), [
    ('href="icons/', 'href="../icons/'), ('href="manifest.json"', 'href="../manifest.json"'),
    ('src="vendor/', 'src="../vendor/'),
], 'index.html')
html = re.sub(r'<title>[^<]*</title>', '<title>Fuel preview</title>', html, count=1)
html = html.replace('<body>', '<body><div style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99;'
                    'background:#FFA866;color:#0E1013;font:700 11px Inter,sans-serif;padding:2px 10px;'
                    'border-radius:0 0 8px 8px;pointer-events:none">PREVIEW</div>', 1)
js = swap(read('app/fuel.js'), [
    ("'./vendor/zxing-reader.js'", "'../vendor/zxing-reader.js'"),
    ("'./vendor/zxing_reader.wasm'", "'../vendor/zxing_reader.wasm'"),
    # no service worker in the preview, so it never touches the live app's offline cache
    ("if ('serviceWorker' in navigator && location.protocol === 'https:')", "if (false)"),
], 'app/fuel.js')

os.makedirs(os.path.join(ROOT, 'preview', 'app'), exist_ok=True)
for path, text in [('preview/index.html', html), ('preview/app/fuel.js', js), ('preview/app/runtime.js', read('app/runtime.js'))]:
    open(os.path.join(ROOT, path), 'w', encoding='utf-8').write(text)

def read_bytes(path):
    if ref:
        return subprocess.run(['git', 'show', f'{ref}:{path}'], cwd=ROOT, check=True, capture_output=True).stdout
    return open(os.path.join(ROOT, path), 'rb').read()

def list_files(folder):
    if ref:
        out = subprocess.run(['git', 'ls-tree', '-r', '--name-only', ref, folder], cwd=ROOT, capture_output=True, text=True).stdout
        return [x for x in out.split('\n') if x]
    return [os.path.relpath(os.path.join(d, f), ROOT) for d, _, fs in os.walk(os.path.join(ROOT, folder)) for f in fs]

# Big files (food database, label reader, dish recognizer) are shared with the live site when they are
# identical, so the site stays small enough for GitHub Pages to publish. Otherwise the preview gets its own.
def same_as_live(paths):
    for path in paths:
        live = os.path.join(ROOT, path)
        if not os.path.exists(live):
            return False
        try:
            if read_bytes(path) != open(live, 'rb').read():
                return False
        except subprocess.CalledProcessError:
            return False
    return True

big_vendor = list_files('vendor/tesseract') + list_files('vendor/tflite') + list_files('vendor/foodmodel')
# from the working tree the files are the live ones by definition
share_vendor = ref is None or same_as_live(big_vendor)
share_db = ref is None or same_as_live(['foods-db.json'])

for path in ['app/label.js', 'app/plate.js']:
    try:
        text = read_bytes(path).decode('utf-8')
    except subprocess.CalledProcessError:
        continue
    if share_vendor:  # load the engines from the live site's vendor/ folder
        text = text.replace("const base = document.currentScript", "const base = '../'; const _unused = document.currentScript", 1)
    open(os.path.join(ROOT, 'preview', path), 'w', encoding='utf-8').write(text)
import shutil
for d in ['vendor']:
    shutil.rmtree(os.path.join(ROOT, 'preview', d), ignore_errors=True)
if not share_vendor:
    for path in big_vendor:
        dst = os.path.join(ROOT, 'preview', path); os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(read_bytes(path))
if not share_db:
    open(os.path.join(ROOT, 'preview', 'foods-db.json'), 'wb').write(read_bytes('foods-db.json'))
if share_db:
    if os.path.exists(os.path.join(ROOT, 'preview', 'foods-db.json')):
        os.remove(os.path.join(ROOT, 'preview', 'foods-db.json'))
    for f in ['preview/index.html', 'preview/app/fuel.js']:
        fp = os.path.join(ROOT, f); t = open(fp, encoding='utf-8').read()
        open(fp, 'w', encoding='utf-8').write(t.replace("this.DB_URL = './foods-db.json'", "this.DB_URL = '../foods-db.json'"))
print('shared with live:', 'engines' if share_vendor else '-', 'database' if share_db else '-')
