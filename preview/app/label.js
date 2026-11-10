// Reads nutrition values from the text of a photographed label (what Tesseract returns).
// Handles Canadian bilingual "Nutrition Facts / Valeur nutritive", US "Nutrition Facts",
// UK/EU/Australian tables (energy kJ/kcal, per 100 g and per serving columns, salt, "of which").
// Returns values for the label's basis (per serving when the label is per serving, else per 100 g),
// carbohydrate counted with fibre (as on Canadian/US labels), and a list of fields to double-check.
(function (root) {
  const N = (s) => {
    if (s == null) return null;
    let t = String(s).replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0').replace(/(?<=\d)[lI](?=\d)/g, '1').replace(/,(?=\d)/g, '.');
    const m = /(\d+(?:\.\d+)?)/.exec(t); return m ? parseFloat(m[1]) : null;
  };

  // OCR often reads the unit "g" as 9, q or ¢: "4.59" means 4.5 g, "379" 37 g, "(559)" 55 g
  function fixUnits(t) {
    return t.replace(/\b[oO](?=\s?(mg|g)\b)/g, '0')
      .replace(/(\d+(?:[.,]\d)?)[9qQ¢](?=\s*(\)|%|\d{1,3}\s?%|$|\s|\/))/gm, (m, n, _a, off, all) => {
        const before = all.slice(Math.max(0, off - 40), off).toLowerCase();
        // only on nutrient lines and serving sizes, where a weight unit belongs
        return /(fat|lipid|satur|carb|glucid|fib|sugar|sucre|protein|prot[eé]in|salt|sel|serving|portion|per |pour |\()\W*[^\n]*$/.test(before) ? n + ' g' : m;
      })
      .replace(/(\d)\s?[¢]/g, '$1 g')
      .replace(/^([^\n]*(?:fat|lipid|satur|carb|glucid|fib|sugar|sucre|protein|prot[eé]in)[^\n\d]*\d+(?:[.,]\d+)?)\s9(?=\s|$)/gim, '$1 g');
  }

  function parseLabel(raw) {
    const text = fixUnits(String(raw || '').replace(/\r/g, ''));
    const lower = text.toLowerCase();
    const lines = lower.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const eu = /\bkj\b|of which|dont|\bsalt\b|\bsel\b|per 100 ?g|pour 100 ?g|\bavg\.? qty|quantity per/.test(lower);

    // which numeric column is "per 100 g"? UK/AU tables: "Per 100g | Per serving" or "Per serving | Per 100g"
    let col100 = 0;
    const head = lines.find((l) => /per 100 ?(g|ml)|pour 100 ?(g|ml)|100 ?(g|ml)/.test(l) && /serv|portion|per pack|biscuit|bar|slice/.test(l));
    if (head) { const a = head.search(/100 ?(g|ml)/), b = head.search(/serv|portion|pack|biscuit|bar|slice/); col100 = a >= 0 && b >= 0 && b < a ? 1 : 0; }
    const per100 = eu || /per 100 ?(g|ml)|pour 100 ?(g|ml)/.test(lower);

    // numbers on a line after the keyword, skipping % daily values and kJ
    const nums = (l, after) => {
      const s = l.slice(after).replace(/(\d)\s+(\d{3})\b/g, '$1$2');
      const out = []; const re = /(<\s*)?(\d+(?:[.,]\d+)?|[oO](?:[.,]\d+)?)\s*(kcal|cal|kj|mg|µg|mcg|g|%)?/g; let m;
      while ((m = re.exec(s))) { const unit = (m[3] || '').toLowerCase(); if (unit === '%') continue; const v = m[1] ? 0 : N(m[2]); if (v == null) continue; out.push({ v, unit }); }
      return out;
    };
    const pick = (keys, opts) => {
      opts = opts || {};
      for (const l of lines) {
        if (opts.not && opts.not.test(l)) continue;
        const m = keys.exec(l); if (!m) continue;
        let ns = nums(l, m.index + m[0].length);
        if (opts.unit) { const u = ns.filter((x) => opts.unit.test(x.unit)); if (u.length) ns = u; else if (opts.strictUnit) continue; }
        else ns = ns.filter((x) => x.unit !== 'kj');
        if (!ns.length) continue;
        const i = per100 && ns.length > 1 ? col100 : 0;
        return (ns[i] || ns[0]).v;
      }
      return null;
    };

    const r = {};
    // energy: kcal, or kJ / 4.184
    r.kcal = pick(/(?<![a-zé])(calories|calorie|energy|energie|énergie|cal(?![a-z]))/, { unit: /kcal|cal|^$/, not: /from fat|kj\s*$/ });
    if (r.kcal == null) { const kj = pick(/\b(energy|energie|énergie)/, { unit: /kj/, strictUnit: true }); if (kj != null) r.kcal = Math.round(kj / 4.184); }
    if (r.kcal != null && /\bkj\b/.test(lower)) {
      // "Energy 1234 kJ 295 kcal" on one line: prefer the kcal figure
      const l = lines.find((x) => /energ/.test(x) && /kcal/.test(x)); if (l) { const k = /(\d+(?:[.,]\d+)?)\s*kcal/.exec(l); if (k) { const all = [...l.matchAll(/(\d+(?:[.,]\d+)?)\s*kcal/g)].map((x) => N(x[1])); r.kcal = all[per100 && all.length > 1 ? col100 : 0]; } }
    }
    r.f = pick(/(?<![a-zé])(total fat|fat|lipides|fett|matières grasses|matieres grasses)(?![a-zé])/, { not: /saturat|satur|trans|polyun|monoun|of which/ , unit: /^g$|^$/ });
    r.sat = pick(/(?<![a-zé])(saturated|saturates|saturés|satures|saturated fat|sat\.? fat)(?![a-zé])/, { unit: /^g$|^$/ });
    r.c = pick(/(?<![a-zé])(total carbohydrate|carbohydrate|carbohydrates|carbs|glucides|carb\.)(?![a-zé])/, { not: /of which|fibre|fiber/, unit: /^g$|^$/ });
    r.fib = pick(/(?<![a-zé])(dietary fibre|dietary fiber|fibre|fiber|fibres)(?![a-zé])/, { unit: /^g$|^$/ });
    r.sug = pick(/(?<![a-zé])(total sugars|sugars|sugar|sucres)(?![a-zé])/, { not: /added sugars|incl|sucres ajoutés/, unit: /^g$|^$/ });
    r.p = pick(/(?<![a-zé])(protein|proteins|protéines|proteines)(?![a-zé])/, { unit: /^g$|^$/ });
    r.na = pick(/\bsodium\b/, { unit: /mg|^g$|^$/ });
    if (r.na != null) { const l = lines.find((x) => /\bsodium\b/.test(x)); if (l && /\d\s*g\b/.test(l) && !/mg/.test(l)) r.na = Math.round(r.na * 1000); }
    if (r.na == null) { const salt = pick(/\b(salt|sel)\b/, { unit: /^g$|^$/ }); if (salt != null) r.na = Math.round(salt * 400); }
    r.ch = pick(/(?<![a-zé])(cholesterol|cholestérol)(?![a-zé])/, { unit: /mg|^$/ });

    // serving: "Per 1 cookie (40 g)", "Serving size 2/3 cup (55g)", "Serving size: 30g", "Servings per package 8"
    let serving = '', grams = null;
    const sl = lines.find((l) => /serving size|portion size|^per\b|^pour\b|serving:/.test(l) && /\d/.test(l) && !/servings per/.test(l));
    if (sl) {
      const g = /\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)?/.exec(sl); if (g) grams = N(g[1]);
      serving = sl.replace(/^(serving size|portion size|per|pour)\s*:?\s*/, '').replace(/\s\/\s.*$/, '').replace(/\(?\s*\d+(?:[.,]\d+)?\s*(g|ml)\s*\)?/, '').replace(/[^a-z0-9 /.,-]/g, '').trim();
    }
    if (per100) { serving = '100 g'; grams = 100; }
    else if (!serving && grams) serving = grams + ' g';

    // labels outside North America leave fibre out of carbohydrate: add it back, like Fuel's database
    if (eu && r.c != null && r.fib != null) r.c = Math.round((r.c + r.fib) * 10) / 10;

    // what to double-check: missing values, and calories that don't match the macros
    const flags = [];
    for (const k of ['kcal', 'f', 'c', 'p', 'sat', 'sug', 'fib', 'na']) if (r[k] == null) flags.push(k);
    if (r.kcal != null && r.p != null && r.c != null && r.f != null) {
      const est = 4 * r.p + 4 * Math.max(0, r.c - (r.fib || 0)) + 2 * (r.fib || 0) + 9 * r.f;
      if (Math.abs(est - r.kcal) > Math.max(25, r.kcal * 0.2)) flags.push('kcal');
    }
    if (!per100 && !grams) flags.push('serving');
    if (r.sat != null && r.f != null && r.sat > r.f + 0.5) flags.push('sat');
    if (r.sug != null && r.c != null && r.sug > r.c + 0.5) flags.push('sug');
    const found = ['kcal', 'f', 'c', 'p'].filter((k) => r[k] != null).length;
    return { name: '', serving: serving || '1 serving', grams, kcal: r.kcal, f: r.f, sat: r.sat, c: r.c, sug: r.sug, fib: r.fib, p: r.p, na: r.na, ch: r.ch, flags: [...new Set(flags)], per100, ok: found >= 3 };
  }

  root.parseLabel = parseLabel;
  if (typeof module !== 'undefined') module.exports = { parseLabel };
})(typeof window !== 'undefined' ? window : globalThis);

// ---- Browser: photo → text → values (all on the phone) ----
(function (root) {
  if (typeof document === 'undefined') return;
  // vendor/ next to the app/ folder this script came from (works for the live site and /preview/)
  const base = '../'; const _unused = document.currentScript && /app\/label\.js/.test(document.currentScript.src) ? document.currentScript.src.replace(/app\/label\.js.*$/, '') : location.href.replace(/[^/]*$/, '');
  let worker = null;
  async function getWorker(onStatus) {
    if (worker) return worker;
    if (!root.Tesseract) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = base + 'vendor/tesseract/tesseract.min.js'; s.onload = ok; s.onerror = () => no(new Error('reader-load')); document.head.appendChild(s); });
    worker = await root.Tesseract.createWorker('eng', 1, { workerPath: base + 'vendor/tesseract/worker.min.js', corePath: base + 'vendor/tesseract/core', langPath: base + 'vendor/tesseract/lang', gzip: true, workerBlobURL: false,
      logger: (m) => onStatus && m.status && onStatus(m.status, m.progress) });
    return worker;
  }
  // grey, stretched contrast, about 1800 px wide: what Tesseract reads best
  async function prep(file) {
    const img = await createImageBitmap(file);
    const scale = Math.min(2.5, Math.max(0.5, 1800 / Math.max(img.width, img.height)));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), a = d.data; const hist = new Array(256).fill(0);
    for (let i = 0; i < a.length; i += 4) { const g = (a[i] * 299 + a[i + 1] * 587 + a[i + 2] * 114) / 1000 | 0; a[i] = g; hist[g]++; }
    let lo = 0, hi = 255, n = 0, tot = w * h; while (n < tot * 0.02) n += hist[lo++]; n = 0; while (n < tot * 0.02) n += hist[hi--];
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < a.length; i += 4) { const v = Math.max(0, Math.min(255, (a[i] - lo) * k)); a[i] = a[i + 1] = a[i + 2] = v; }
    x.putImageData(d, 0, 0); return c;
  }
  const score = (r) => ['kcal', 'f', 'c', 'p'].filter((k) => r[k] != null).length * 3 + ['sat', 'sug', 'fib', 'na'].filter((k) => r[k] != null).length - r.flags.length;
  // tries a few page layouts and keeps the reading with the most sensible values
  async function readLabel(file, onStatus) {
    const w = await getWorker(onStatus); const canvas = await prep(file);
    let best = null;
    for (const psm of ['4', '6', '11']) {
      await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
      const { data } = await w.recognize(canvas);
      const r = root.parseLabel(data.text); r.text = data.text; r.psm = psm;
      if (!best || score(r) > score(best)) best = r;
      if (score(best) >= 15) break;
    }
    return best;
  }
  root.readLabel = readLabel;
})(typeof window !== 'undefined' ? window : globalThis);
