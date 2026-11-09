#!/usr/bin/env python3
"""Build index.html from the design mockup (mockup/fuel.dc.html).

The mockup is the source of truth for screens and screen logic. This script lifts its template and
logic into the production page and applies the production patches listed below (layout, account
screen, camera button, packaged-product search, removed prototype-only bits). Every patch must
match exactly once, so a changed mockup fails loudly instead of building something half-patched.

Usage:  python3 tools/build.py            (writes index.html)
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'mockup' / 'fuel.dc.html'
OUT = ROOT / 'index.html'
VERSION = (ROOT / 'VERSION').read_text().strip() if (ROOT / 'VERSION').exists() else 'dev'

src = SRC.read_text(encoding='utf-8')

def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        sys.exit(f'patch "{label}" matched {n} times (expected 1). Update tools/build.py for the new mockup.')
    return text.replace(old, new)

def once_re(text, pattern, new, label, flags=0):
    found = re.findall(pattern, text, flags)
    if len(found) != 1:
        sys.exit(f'patch "{label}" matched {len(found)} times (expected 1).')
    return re.sub(pattern, new, text, count=1, flags=flags)

# ---- split the mockup ----------------------------------------------------------------------
m = re.search(r'<x-dc>(.*)</x-dc>', src, re.S)
xdc = m.group(1)
helmet = re.search(r'<helmet>(.*?)</helmet>', xdc, re.S).group(1)
tpl = re.sub(r'<helmet>.*?</helmet>', '', xdc, count=1, flags=re.S).strip()
logic = re.search(r'<script type="text/x-dc"[^>]*>(.*?)</script>', src, re.S).group(1)

# ---- template patches ----------------------------------------------------------------------
t = tpl
t = once(t, '<div style="width: 390px; height: 844px; position: relative; overflow: hidden; background: #0E1013; color: #F2F4F7; font-family: Inter, system-ui, sans-serif; display: flex; flex-direction: column">',
         '<div class="app-root" style="width: 100%; max-width: 560px; margin: 0 auto; height: 100dvh; position: relative; overflow: hidden; background: #0E1013; color: #F2F4F7; font-family: Inter, system-ui, sans-serif; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); box-sizing: border-box">',
         'full-screen root')

# account step (email + password, sign in or create, skip)
t = once_re(t, r'    <sc-if value="\{\{s8\}\}" hint-placeholder-val="\{\{ false \}\}">.*?</sc-if>\n(?=    <sc-if value="\{\{s9\}\}")', '''    <sc-if value="{{s8}}" hint-placeholder-val="{{ false }}">
      <h1 class="h1">{{acct.title}}</h1>
      <p class="sub">{{acct.sub}}</p>
      <label class="lbl" for="em">Email</label>
      <input id="em" class="inp" type="email" value="{{email}}" onChange="{{onEmail}}" placeholder="you@example.com" autocomplete="email">
      <label class="lbl" for="pw">Password</label>
      <input id="pw" class="inp" type="password" value="{{pw}}" onChange="{{onPw}}" placeholder="At least 8 characters" autocomplete="{{acct.pwAuto}}">
      <sc-if value="{{acct.hasErr}}" hint-placeholder-val="{{ false }}"><p role="alert" style="color: #FFA866; font-size: 14px; line-height: 1.45; margin: 12px 0 0">{{acct.err}}</p></sc-if>
      <sc-if value="{{acct.hasInfo}}" hint-placeholder-val="{{ false }}"><p role="status" style="color: #C8F25C; font-size: 14px; line-height: 1.45; margin: 12px 0 0">{{acct.info}}</p></sc-if>
      <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 14px">
        <button type="button" onClick="{{acct.toggleMode}}" style="min-height: 44px; border: 0; background: none; color: #C8F25C; font: inherit; font-weight: 600; padding: 0; cursor: pointer">{{acct.toggleLabel}}</button>
        <sc-if value="{{acct.isSignIn}}" hint-placeholder-val="{{ false }}"><button type="button" onClick="{{acct.forgot}}" style="min-height: 44px; border: 0; background: none; color: #9AA3AF; font: inherit; padding: 0; cursor: pointer">Forgot password?</button></sc-if>
        <sc-if value="{{acct.canSkip}}" hint-placeholder-val="{{ true }}"><button type="button" onClick="{{acct.skip}}" style="min-height: 44px; border: 0; background: none; color: #9AA3AF; font: inherit; padding: 0; cursor: pointer">Use Fuel without an account</button></sc-if>
      </div>
      <p class="muted small" style="margin-top: 14px; line-height: 1.5">Your account is shared with Peak. Data is stored in your own Firebase project and only you can read it. Without an account, everything stays on this device.</p>
    </sc-if>
''', 'account step', re.S)

t = once(t, '      <input id="nm" class="inp" value="{{name}}" onChange="{{onName}}" placeholder="Your name" autocomplete="given-name">',
         '      <input id="nm" class="inp" value="{{name}}" onChange="{{onName}}" placeholder="Your name" autocomplete="given-name">\n      <button type="button" onClick="{{startSignIn}}" style="min-height: 44px; margin-top: 14px; border: 0; background: none; color: #C8F25C; font: inherit; font-weight: 600; padding: 0; cursor: pointer">I already have an account (Fuel or Peak)</button>',
         'welcome sign-in link')

# More tab: account + backup
t = once(t, '    <div class="lbl">Travel and data</div>', '''    <div class="lbl">Account and sync</div>
    <div class="card" style="padding: 0; overflow: hidden">
      <sc-if value="{{acct.signedIn}}" hint-placeholder-val="{{ false }}">
        <div class="lt" style="cursor: default">Signed in<span class="muted" style="margin-left: auto; font-size: 13px">{{acct.email}}</span></div>
        <button type="button" class="lt" onClick="{{acct.syncNow}}">Sync now<span class="muted" style="margin-left: auto; font-size: 13px">{{acct.status}}</span></button>
        <button type="button" class="lt" style="border: 0" onClick="{{acct.signOut}}">Sign out</button>
      </sc-if>
      <sc-if value="{{acct.signedOut}}" hint-placeholder-val="{{ true }}">
        <button type="button" class="lt" style="border: 0" onClick="{{acct.openSignIn}}">Sign in or create account<span class="muted" style="margin-left: auto; font-size: 13px">Sync phone and web</span></button>
      </sc-if>
    </div>

    <div class="lbl">Travel and data</div>''', 'account section')
t = once_re(t, r'<button type="button" class="lt" onClick="\{\{soon\}\}">Export my data \(CSV\)(<svg.*?</svg>)</button>',
            r'<button type="button" class="lt" onClick="{{acct.exportData}}">Export a backup\1</button>\n      <button type="button" class="lt" onClick="{{acct.importData}}">Import a backup\1</button>', 'backup rows')
t = once(t, 'Fuel · prototype v5 · food data from Open Food Facts and USDA in production',
         'Fuel ' + VERSION + ' · foods: USDA, BLS 4.0 (CC BY 4.0), TempoLife (CC BY 4.0) · packaged products: Open Food Facts (ODbL)', 'footer')

# no meal scan in this build yet (the on-phone recognizer and label reader come next)
t = once_re(t, r'\n\s*<button type="button" class="bigtile"[^\n]*onClick="\{\{fabMealScan\}\}">.*?</button>', '', 'remove fab meal scan')
t = once_re(t, r'\n\s*<button type="button" class="tile" onClick="\{\{goMealScan\}\}">.*?</button>', '', 'remove log meal scan')
t = once(t, '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">\n      <button type="button" class="tile" onClick="{{goScanFromLog}}">',
         '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">\n      <button type="button" class="tile" onClick="{{goScanFromLog}}">', 'log tiles to 2 columns')

# label scan: mockup only until the label reader is built in
t = once(t, '''      <button type="button" class="btn" style="width: 100%" onClick="{{scanLabelFromScan}}">Scan the nutrition label</button>
      <button type="button" onClick="{{createFromScan}}" style="width: 100%; min-height: 44px; margin-top: 4px; border: 0; background: none; color: #C8F25C; font: inherit; font-weight: 600; cursor: pointer">Type it in instead</button>''',
         '''      <button type="button" class="btn" style="width: 100%" onClick="{{createFromScan}}">Create this food</button>''', 'label scan hidden')

# scanner screen: real camera
t = once_re(t, r'<p class="sub">UPC \(US, Canada\) and EAN.*?</p>', '<p class="sub">UPC (US, Canada) and EAN (UK, France, Australia) barcodes. Products come from Open Food Facts and are saved on your phone after the first scan.</p>', 'scan subtitle')
t = once(t, '  <span class="lbl">Try a demo product</span>', '''  <sc-if value="{{canCam}}" hint-placeholder-val="{{ true }}"><button type="button" class="btn" style="width: 100%; margin-top: 14px" onClick="{{scanCam}}">Open camera</button></sc-if>
  <sc-if value="{{scanErr}}" hint-placeholder-val="{{ false }}"><p role="alert" style="color: #FFA866; font-size: 14px; line-height: 1.45; margin: 12px 0 0">{{scanErrText}}</p></sc-if>
  <span class="lbl">Test products (made up, for trying the rating)</span>''', 'camera button')

# product page: real photo when Open Food Facts has one
t = once_re(t, r'(<div style="width: 88px; height: 88px; border-radius: 20px; background: \{\{pr.tileBg\}\}; display: flex; align-items: center; justify-content: center; flex: none">)(<svg.*?</svg>)(</div>)',
            r'\1<sc-if value="{{pr.hasImg}}" hint-placeholder-val="{{ false }}"><img src="{{pr.img}}" alt="" style="width: 88px; height: 88px; object-fit: contain; border-radius: 20px; background: #FFFFFF"></sc-if><sc-if value="{{pr.noImg}}" hint-placeholder-val="{{ true }}">\2</sc-if>\3', 'product photo')

# product page: nutrition table and "fill in missing values"
t = once(t, '<p class="muted small" style="margin: 16px 4px 0; line-height: 1.5">{{pr.note}}</p>', '''<sc-if value="{{pr.hasFacts}}" hint-placeholder-val="{{ true }}">
      <div class="row" style="margin: 20px 4px 8px"><h2 class="h2">Nutrition facts</h2><span class="muted small">{{pr.factsBasis}}</span></div>
      <div class="card" style="padding: 2px 16px">
        <sc-for list="{{pr.facts}}" as="fa" hint-placeholder-count="8"><div class="row" style="padding: 9px 0; border-bottom: 1px solid #23272E; font-size: 14px"><span style="padding-left: {{fa.pad}}px; color: {{fa.lc}}">{{fa.l}}</span><span style="color: {{fa.vc}}">{{fa.v}}</span></div></sc-for>
      </div>
    </sc-if>
    <sc-if value="{{pr.canFix}}" hint-placeholder-val="{{ false }}">
      <div class="card" style="margin-top: 12px">
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5">{{pr.fixText}}</p>
        <button type="button" class="btn" style="width: 100%" onClick="{{pr.fix}}">Fill in missing values</button>
        <button type="button" onClick="{{pr.openOff}}" style="width: 100%; min-height: 44px; margin-top: 6px; border: 0; background: none; color: #C8F25C; font: inherit; font-weight: 600; cursor: pointer">Improve it on Open Food Facts ↗</button>
      </div>
    </sc-if>
    <p class="muted small" style="margin: 16px 4px 0; line-height: 1.5">{{pr.note}}</p>''', 'nutrition facts')

# search: packaged products from Open Food Facts
FIT = '''      <div class="fitem">
        <button type="button" class="fname" onClick="{{f.open}}"><span style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600">{{f.name}}<span class="tag">{{f.tag}}</span></span><span class="muted" style="font-size: 13px; display: flex; align-items: center; gap: 6px"><span style="width: 8px; height: 8px; border-radius: 50%; background: {{f.dot}}; flex: none"></span>{{f.brand}} · {{f.kcalTxt}}</span></button>
        <button type="button" class="plus" aria-label="Add {{f.name}}" onClick="{{f.quick}}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button>
      </div>'''
ROW = re.search(r'<sc-for list="\{\{results\}\}" as="f" hint-placeholder-count="5">(.*?)</sc-for>', t, re.S).group(1).strip('\n')
t = once(t, '  </sc-if>\n\n  <sc-if value="{{showAll}}"', '''    <div style="margin: 14px 0 4px">
      <sc-if value="{{off.canSearch}}" hint-placeholder-val="{{ true }}"><button type="button" class="btn ghost" style="width: 100%; height: auto; min-height: 52px; padding: 10px 18px; font-size: 15px" onClick="{{off.search}}">{{off.label}}</button></sc-if>
      <sc-if value="{{off.busy}}" hint-placeholder-val="{{ false }}"><p class="muted small" role="status">Searching about 3 million packaged products…</p></sc-if>
      <sc-if value="{{off.err}}" hint-placeholder-val="{{ false }}"><p role="alert" style="color: #FFA866; font-size: 13px">{{off.errText}}</p></sc-if>
      <sc-if value="{{off.hasRes}}" hint-placeholder-val="{{ false }}">
        <div style="margin: 16px 0 10px; font-weight: 700; font-size: 15px">{{off.count}}</div>
        <sc-for list="{{off.results}}" as="f" hint-placeholder-count="5">
''' + FIT + '''
        </sc-for>
      </sc-if>
    </div>
    <sc-if value="{{hasMore}}" hint-placeholder-val="{{ false }}">
      <div style="margin: 18px 0 10px; font-weight: 700; font-size: 15px">More generic foods</div>
      <sc-for list="{{moreResults}}" as="f" hint-placeholder-count="5">
__RESULT_ROW__
      </sc-for>
    </sc-if>
  </sc-if>

  <sc-if value="{{showAll}}"'''.replace('__RESULT_ROW__', ROW), 'packaged product search')

# ---- logic patches -------------------------------------------------------------------------
L = logic
L = once_re(L, r"this\.DB_URL = '/_blob/[0-9a-f]+';", "this.DB_URL = './foods-db.json';", 'database url')
L = once(L, "} else if (ago === 0 && eat.kcal > 0) Object.assign(d, { logged: true, kcal: eat.kcal, p: eat.p, c: eat.c, f: eat.f, ex: this.exToday(S), mic: eat.mic, micro: !!eat.mic });",
         "} else if (ago === 0 && eat.kcal > 0) Object.assign(d, { logged: true, kcal: eat.kcal, p: eat.p, c: eat.c, f: eat.f, ex: this.exToday(S), mic: eat.mic, micro: !!eat.mic });\n    else if (ago > 0 && S.days && S.days[key] && S.days[key].kcal > 0) { const a = S.days[key]; Object.assign(d, { logged: true, kcal: a.kcal, p: a.p, c: a.c, f: a.f, ex: a.ex || 0, mic: a.mic || null, micro: !!a.mic }); }",
         'saved days in charts')
L = once(L, "let c = e.food.cat;", "let c = e.food.cat || (this.catOf ? this.catOf(e.food) : '');", 'food category')
L = once(L, "    if (S.demo) lg.filter((d) => !(d.ago === 0 && eat.kcal > 0)).forEach((d) => {",
         "    if (!S.demo && S.days) wk.forEach((d) => { if (d.ago <= 0) return; const a = S.days[d.date.toDateString()]; if (!a || !a.items) return; a.items.forEach((it) => { if (cnt[it.c] != null) cnt[it.c]++; freq[it.n] = (freq[it.n] || 0) + 1; }); });\n    if (S.demo) lg.filter((d) => !(d.ago === 0 && eat.kcal > 0)).forEach((d) => {",
         'digest past days')
L = once(L, "[['Foods logged', items.length],", "[['Foods logged', items.length + Object.values(S.days || {}).reduce((a, x) => a + (x.items ? x.items.length : 0), 0)],", 'all-time foods')
L = once_re(L, r"sync: \{ title: 'Connect your workout app', sub: .*?\n\s*fields: \[\], ok: true, save: .*?\} \},",
            "sync: { title: 'Connect Peak', sub: 'Fuel and Peak already share your account. Pulling Peak workouts into Fuel as calories burned comes in the next update.', cta: 'OK', fields: [], ok: true, save: () => this.setState({ sheet: null }) },",
            'workout app sheet', re.S)
L = once(L, "scanStatus: S.scanning ? 'Reading barcode…' : 'Point the camera at a barcode'", "scanStatus: S.scanning ? 'Looking up the product…' : 'Tap Open camera to scan'", 'scan status')
L = once(L, "emailLine: S.email || 'Not signed in · prototype'", "emailLine: this.acct ? this.acct.email : 'Not signed in'", 'profile email')

# ---- assemble -------------------------------------------------------------------------------
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#0E1013">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Fuel">
<meta name="description" content="Fuel: macro and calorie tracker with barcode scanning and food ratings.">
<title>Fuel</title>
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<!-- generated by tools/build.py from mockup/fuel.dc.html ({VERSION}); edit the mockup or the patches, not this file -->
{helmet.strip()}
<style>
html,body{{margin:0;height:100%;background:#0E1013;overscroll-behavior:none}}
*{{-webkit-tap-highlight-color:transparent}}
#app,.dc-root{{height:100%}}
input,textarea,button{{font-size:16px}}
</style>
</head>
<body>
<div id="app"><div style="color:#9AA3AF;font-family:system-ui;padding:40px;text-align:center">Loading Fuel…</div></div>
<template id="screens">
{t}
</template>
<script src="vendor/preact.min.umd.js"></script>
<script src="app/runtime.js"></script>
<script>
{L.strip()}
</script>
<script src="app/fuel.js"></script>
</body>
</html>
'''
OUT.write_text(html, encoding='utf-8')
print(f'wrote {OUT.relative_to(ROOT)} ({len(html):,} bytes) from {SRC.relative_to(ROOT)}')
