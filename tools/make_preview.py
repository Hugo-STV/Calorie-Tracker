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
# the preview carries its own food database, so a new database can be tried before it goes live
for path, text in [('preview/index.html', html), ('preview/app/fuel.js', js), ('preview/app/runtime.js', read('app/runtime.js')), ('preview/foods-db.json', read('foods-db.json'))]:
    open(os.path.join(ROOT, path), 'w', encoding='utf-8').write(text)
print('preview/ updated from', ref or 'working tree')
