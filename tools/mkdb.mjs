// Builds foods-db.json, Fuel's offline food database.
//
//   node tools/mkdb.mjs <packages-dir> <sources-dir>
//
// <packages-dir>: the unpacked npm packages fda-nutrient-database@1.0.2 (USDA SR28), @thereforejs/foods@0.0.3
//                 (German BLS 4.0) and tempo-food-db@1.0.0 (TempoLife).
// <sources-dir>:  a checkout of this repo's "food-sources" branch (made by .github/workflows/food-sources.yml):
//                 Canadian Nutrient File, UK CoFID, Australian AFCD, French Ciqual, USDA FNDDS.
//
// Every food is stored per 100 g (or 100 ml for drinks in AFCD's liquid table), with carbohydrate counted the
// North American way (fibre included), the way Canadian and US labels show it. UK, Australian and French tables
// report carbohydrate without fibre, so their fibre is added back.
import fs from 'fs';
import path from 'path';

const [D, S] = process.argv.slice(2);
if (!D || !S) { console.error('usage: node tools/mkdb.mjs <packages-dir> <sources-dir>'); process.exit(1); }

// ---------- helpers ----------
const num = (x) => {
  if (x == null) return null;
  let t = String(x).trim().replace(/[\s ]/g, '');
  const money = /^\$/.test(t); t = t.replace(/^\$/, '');
  if (!t || /^(n|nd|-|—|n\/a|na)$/i.test(t)) return null;
  if (/^(tr|trace|traces)$/i.test(t)) return 0;
  if (/^</.test(t)) return 0; // below detection limit
  t = t.replace(/^[~≈]/, '');
  // a comma is a decimal point (French tables: "0,098"), except in "$1,236" from a formatted spreadsheet cell
  if (money && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = parseFloat(t); return isNaN(n) ? null : n;
};
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
const r0 = (x) => x == null ? null : Math.round(x);
// RFC 4180 CSV, quoted fields may span lines
function csv(file, enc) {
  const text = fs.readFileSync(file, enc || 'utf8').replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (ch !== '\r') f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const objs = (rows) => { const h = rows[0]; return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const exists = (p) => fs.existsSync(p);

const groups = ['Dairy & eggs', 'Spices & herbs', 'Fats & oils', 'Poultry', 'Soups & sauces', 'Sausages & deli meats', 'Breakfast cereals', 'Fruit', 'Pork', 'Vegetables', 'Nuts & seeds', 'Beef', 'Drinks', 'Fish & seafood', 'Beans & legumes', 'Lamb, veal & game', 'Baked goods', 'Sweets', 'Grains & pasta', 'Fast food', 'Meals & sides', 'Snacks', 'Restaurant foods', 'Prepared dishes', 'Other'];
const G = Object.fromEntries(groups.map((g, i) => [g, i]));
const usdaGrp = { '0100': 'Dairy & eggs', '0200': 'Spices & herbs', '0400': 'Fats & oils', '0500': 'Poultry', '0600': 'Soups & sauces', '0700': 'Sausages & deli meats', '0800': 'Breakfast cereals', '0900': 'Fruit', '1000': 'Pork', '1100': 'Vegetables', '1200': 'Nuts & seeds', '1300': 'Beef', '1400': 'Drinks', '1500': 'Fish & seafood', '1600': 'Beans & legumes', '1700': 'Lamb, veal & game', '1800': 'Baked goods', '1900': 'Sweets', '2000': 'Grains & pasta', '2100': 'Fast food', '2200': 'Meals & sides', '2500': 'Snacks', '3600': 'Restaurant foods' };

// sources: index is stored per food (key s); tag is what the app shows
const SOURCES = [
  ['USDA', 'USDA National Nutrient Database for Standard Reference, Release 28', 'US'],
  ['BLS', 'Bundeslebensmittelschlüssel (BLS) 4.0', null],
  ['TempoLife', 'TempoLife food data', null],
  ['Fuel', 'Fuel regional staples (typical values, estimated)', null],
  ['CNF', 'Canadian Nutrient File 2015, Health Canada', 'CA'],
  ['CoFID', "McCance and Widdowson's Composition of Foods Integrated Dataset 2021", 'UK'],
  ['AFCD', 'Australian Food Composition Database, Release 3, FSANZ', 'AU'],
  ['Ciqual', 'Ciqual French food composition table 2025, ANSES', 'FR'],
  ['FNDDS', 'USDA Food and Nutrient Database for Dietary Studies 2021-2023', 'US']
];
const SI = Object.fromEntries(SOURCES.map((s, i) => [s[0], i]));

const foods = []; const seen = new Set(); const count = {};
const add = (o) => {
  if (!o.n || o.k == null || o.k < 0 || o.k > 950) return false;
  const key = o.s + '|' + o.n.toLowerCase();
  if (seen.has(key)) return false; seen.add(key);
  // one macro missing: work it out from the energy, so the food still tracks correctly
  const miss = ['p', 'c', 'f'].filter((k) => o[k] == null);
  if (miss.length === 1 && o.k > 0) {
    const known = 4 * (o.p || 0) + 4 * Math.max(0, (o.c || 0) - (o.fib || 0)) + 2 * (o.fib || 0) + 9 * (o.f || 0);
    const left = Math.max(0, o.k - known), m = miss[0];
    o[m] = r1(m === 'f' ? left / 9 : m === 'c' ? left / 4 + (o.fib || 0) : left / 4); (count.filled = (count.filled || 0) + 1);
  }
  if (miss.length > 1 && o.k > 20) { (count.rejected = count.rejected || []).push(o.n + ' [' + SOURCES[o.s][0] + '] missing macros'); return false; }
  // sanity: energy from macros should be in the same range as the stated energy (alcohol, polyols and seaweeds excepted)
  const est = 4 * (o.p || 0) + 4 * Math.max(0, (o.c || 0) - (o.fib || 0)) + 2 * (o.fib || 0) + 9 * (o.f || 0);
  const special = o.alc || /alcohol|liqueur|liquor|whisk|vodka|gin\b|rum\b|wine|beer|sake|spirit|brandy|extract|sorbitol|polyol|sweetener|aspartame|sucralose|seaweed|kombu|nori|wakame|baking powder|gelatin/i.test(o.n);
  if (o.k > 40 && !special && (est > o.k * 1.8 + 40 || est < o.k * 0.4 - 40)) { (count.rejected = count.rejected || []).push(o.n + ' [' + SOURCES[o.s][0] + '] stated ' + o.k + ' vs ' + Math.round(est)); return false; }
  delete o.alc;
  if (o.r === undefined) o.r = SOURCES[o.s][2];
  foods.push(o); count[SOURCES[o.s][0]] = (count[SOURCES[o.s][0]] || 0) + 1; return true;
};
// portions: [label, grams], most useful first, at most 4, no "100 g"
const units = (list) => {
  const out = [], seenL = new Set();
  for (const [l0, g0] of list) {
    const l = tidy(l0).replace(/\s*\(\s*\d+(\.\d+)?\s*(g|ml)\s*\)\s*$/i, ''), g = r1(+g0);
    if (!l || !(g > 0) || g > 3000 || /^100\s*(g|ml)$/i.test(l) || /quantity not specified/i.test(l)) continue;
    const k = l.toLowerCase(); if (seenL.has(k)) continue; seenL.add(k); out.push([l, g]);
    if (out.length >= 4) break;
  }
  return out.length ? out : null;
};

// ---------- USDA SR28 (fda-nutrient-database) ----------
{
  const split = (l) => l.replace(/\r/g, '').split('^').map((x) => x.replace(/^~|~$/g, ''));
  const base = D + '/fda-nutrient-database-1.0.2/package/data/';
  const des = {}; for (const l of fs.readFileSync(base + 'FOOD_DES.txt', 'latin1').split('\n')) { if (!l.trim()) continue; const f = split(l); des[f[0]] = { grp: f[1], long: f[2] }; }
  const wt = {}; if (exists(base + 'WEIGHT.txt')) for (const l of fs.readFileSync(base + 'WEIGHT.txt', 'latin1').split('\n')) { if (!l.trim()) continue; const f = split(l); (wt[f[0]] = wt[f[0]] || []).push([(+f[2] === 1 ? '' : f[2] + ' ') + f[3], num(f[4])]); }
  for (const l of fs.readFileSync(base + 'ABBREV.txt', 'latin1').split('\n')) {
    if (!l.trim()) continue; const f = split(l); const d = des[f[0]]; if (!d) continue;
    const grp = usdaGrp[d.grp]; if (!grp) continue; // drops baby foods and American Indian/Alaska Native foods
    const kcal = num(f[3]); if (kcal == null) continue;
    const u = wt[f[0]] ? wt[f[0]].map(([lab, g]) => [lab.replace(/^1 /, '1 '), g]) : [[f[49], num(f[48])]];
    add({ n: tidy(d.long), g: G[grp], s: SI.USDA, k: r0(kcal), p: r1(num(f[4])), c: r1(num(f[7])), f: r1(num(f[5])), fib: r1(num(f[8])), sug: r1(num(f[9])), sat: r1(num(f[44])), na: r0(num(f[15])), ch: r0(num(f[47])), po: r0(num(f[14])), u: units(u) });
  }
}

// ---------- Canadian Nutrient File 2015 ----------
if (exists(S + '/cnf/FOOD NAME.csv')) {
  const C = S + '/cnf/';
  const names = objs(csv(C + 'FOOD NAME.csv', 'latin1'));
  const NUT = { 208: 'k', 203: 'p', 205: 'c', 204: 'f', 291: 'fib', 269: 'sug', 606: 'sat', 307: 'na', 601: 'ch', 306: 'po', 221: 'alc' };
  const vals = {};
  for (const r of csv(C + 'NUTRIENT AMOUNT.csv', 'latin1').slice(1)) { const key = NUT[r[1]]; if (!key) continue; (vals[r[0]] = vals[r[0]] || {})[key] = num(r[2]); }
  const meas = Object.fromEntries(csv(C + 'MEASURE NAME.csv', 'latin1').slice(1).map((r) => [r[0], tidy(r[1])]));
  const conv = {}; for (const r of csv(C + 'CONVERSION FACTOR.csv', 'latin1').slice(1)) { if (!meas[r[1]]) continue; (conv[r[0]] = conv[r[0]] || []).push([meas[r[1]], num(r[2]) * 100]); }
  for (const r of names) {
    const v = vals[r.FoodID]; if (!v || v.k == null) continue;
    const gcode = String(r.FoodGroupID).padStart(2, '0') + '00'; const grp = usdaGrp[gcode]; if (!grp) continue;
    // CNF measure labels look like "250ml", "15ml", "1 cup, chopped", "1 fish (500 g)"
    const u = (conv[r.FoodID] || []).filter(([l]) => !/^100\s*(g|ml)$/i.test(l)).sort((a, b) => (/^\d+\s*ml$/i.test(a[0]) ? 1 : 0) - (/^\d+\s*ml$/i.test(b[0]) ? 1 : 0));
    add({ n: tidy(r.FoodDescription), a: tidy(r.FoodDescriptionF), g: G[grp], s: SI.CNF, k: r0(v.k), p: r1(v.p), c: r1(v.c), f: r1(v.f), fib: r1(v.fib), sug: r1(v.sug), sat: r1(v.sat), na: r0(v.na), ch: r0(v.ch), po: r0(v.po), alc: v.alc > 0.5, u: units(u) });
  }
}

// ---------- UK: CoFID 2021 ----------
if (exists(S + '/xlsx/cofid__1.3_Proximates.csv')) {
  const sheet = (n) => { const rows = csv(S + '/xlsx/cofid__' + n + '.csv'); const codes = rows[1]; const out = {}; for (const r of rows.slice(3)) { if (!r[0]) continue; out[r[0]] = Object.fromEntries(codes.map((c, i) => [c || rows[0][i], r[i]])); } return out; };
  const P = sheet('1.3_Proximates'), I = sheet('1.4_Inorganics');
  const ukGrp = (code) => {
    const c = String(code || '');
    if (/^AD/.test(c)) return 'Breakfast cereals'; if (/^A[A-C]/.test(c)) return 'Grains & pasta'; if (/^AP/.test(c)) return 'Sweets'; if (/^A/.test(c)) return 'Baked goods';
    if (/^[BC]/.test(c)) return 'Dairy & eggs'; if (/^DB/.test(c)) return 'Beans & legumes'; if (/^DR/.test(c)) return 'Prepared dishes'; if (/^D/.test(c)) return 'Vegetables';
    if (/^FC/.test(c)) return 'Drinks'; if (/^F/.test(c)) return 'Fruit'; if (/^G/.test(c)) return 'Nuts & seeds'; if (/^H/.test(c)) return 'Spices & herbs';
    if (/^JR/.test(c)) return 'Prepared dishes'; if (/^J/.test(c)) return 'Fish & seafood';
    if (/^MC|^MB/.test(c)) return 'Poultry'; if (/^MAA/.test(c)) return 'Beef'; if (/^MAE/.test(c)) return 'Pork'; if (/^MA/.test(c)) return 'Lamb, veal & game'; if (/^MI/.test(c)) return 'Sausages & deli meats'; if (/^MR/.test(c)) return 'Prepared dishes'; if (/^M/.test(c)) return 'Lamb, veal & game';
    if (/^O/.test(c)) return 'Fats & oils'; if (/^[PQ]/.test(c)) return 'Drinks'; if (/^SE|^SN/.test(c)) return 'Snacks'; if (/^S/.test(c)) return 'Sweets'; if (/^W/.test(c)) return 'Soups & sauces';
    return 'Other';
  };
  for (const [code, r] of Object.entries(P)) {
    const k = num(r.KCALS); if (k == null) continue;
    const fib = num(r.AOACFIB) != null ? num(r.AOACFIB) : (num(r.ENGFIB) != null ? num(r.ENGFIB) * 1.33 : null); // NSP to AOAC, approximate
    const cho = num(r.CHO), i = I[code] || {};
    add({ n: tidy(r['Food Name']), g: G[ukGrp(r.Group)], s: SI.CoFID, k: r0(k), p: r1(num(r.PROT)), c: r1(cho == null ? null : cho + (fib || 0)), f: r1(num(r.FAT)), fib: r1(fib), sug: r1(num(r.TOTSUG)), sat: r1(num(r.SATFOD)), na: r0(num(i.NA)), ch: r0(num(r.CHOL)), po: r0(num(i.K)), alc: num(r.ALCO) > 0.5 });
  }
}

// ---------- Australia: AFCD Release 3 ----------
const afcd = (file, liquid) => {
  if (!exists(file)) return;
  const rows = csv(file); const h = rows[1].map((c) => tidy(c));
  const col = (re) => h.findIndex((c) => re.test(c));
  const ix = { key: col(/^Public Food Key/), cls: col(/^Classification/), name: col(/^Food Name/), kj: col(/^Energy with dietary fibre, equated/), p: col(/^Protein/), f: col(/^Fat, total/), fib: col(/^Total dietary fibre/),
    sug: col(/^Total sugars/), c: col(/^Available carbohydrate, with sugar alcohols/), na: col(/^Sodium \(Na\)/), po: col(/^Potassium \(K\)/), sat: col(/^Total saturated fatty acids, equated\s+\(g\)/), ch: col(/^Cholesterol/), alc: col(/^Alcohol/) };
  const auGrp = (cls) => {
    const c = String(cls || '').slice(0, 2);
    return { 11: 'Drinks', 12: 'Grains & pasta', 13: 'Baked goods', 14: 'Fats & oils', 15: 'Fish & seafood', 16: 'Fruit', 17: 'Dairy & eggs', 18: 'Beef', 19: 'Dairy & eggs', 20: 'Dairy & eggs', 21: 'Soups & sauces', 22: 'Nuts & seeds', 23: 'Soups & sauces', 24: 'Vegetables', 25: 'Beans & legumes', 26: 'Snacks', 27: 'Sweets', 28: 'Sweets', 29: 'Drinks', 31: 'Other' }[c] || 'Other';
  };
  for (const r of rows.slice(2)) {
    const kj = num(r[ix.kj]); if (kj == null || !r[ix.name]) continue;
    const cls = r[ix.cls], name = tidy(r[ix.name]); if (/^3[02]/.test(String(cls))) continue; // infant formulas and special dietary
    let grp = auGrp(cls); if (/^18/.test(String(cls))) grp = /chicken|turkey|duck|poultry/i.test(name) ? 'Poultry' : /pork|ham|bacon/i.test(name) ? 'Pork' : /sausage|salami|frankfurt/i.test(name) ? 'Sausages & deli meats' : /lamb|veal|kangaroo|venison|goat|rabbit/i.test(name) ? 'Lamb, veal & game' : 'Beef';
    const fib = num(r[ix.fib]), avail = num(r[ix.c]);
    add({ n: name + (liquid ? ' (per 100 ml)' : ''), g: G[grp], s: SI.AFCD, k: r0(kj / 4.184), p: r1(num(r[ix.p])), c: r1(avail == null ? null : avail + (fib || 0)), f: r1(num(r[ix.f])), fib: r1(fib), sug: r1(num(r[ix.sug])), sat: r1(num(r[ix.sat])), na: r0(num(r[ix.na])), ch: r0(num(r[ix.ch])), po: r0(num(r[ix.po])), alc: num(r[ix.alc]) > 0.5 });
  }
};
afcd(S + '/xlsx/afcd-nutrients__All_solids_liquids_per_100_g.csv', false);

// ---------- France: Ciqual 2025 (English names from Ciqual 2020 where the food code matches) ----------
{
  const ciqFile = fs.existsSync(S + '/xlsx') ? fs.readdirSync(S + '/xlsx').find((f) => /^ciqual-new-.*composition_nutritionnelle\.csv$/.test(f)) : null;
  if (ciqFile) {
    const eng = {};
    // English names: Ciqual's own food list (alim_*.xml) has alim_nom_eng for each code
    const xml = exists(S + '/ciqual') ? fs.readdirSync(S + '/ciqual').find((f) => /alim_\d/.test(f)) : null;
    if (xml) for (const m of fs.readFileSync(S + '/ciqual/' + xml, 'utf8').matchAll(/<alim_code>\s*(\d+)\s*<\/alim_code>[\s\S]*?<alim_nom_eng>([\s\S]*?)<\/alim_nom_eng>/g)) eng[m[1]] = tidy(m[2].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
    const rows = csv(S + '/xlsx/' + ciqFile); const h = rows[0].map((c) => tidy(c));
    const col = (re) => h.findIndex((c) => re.test(c));
    const ix = { code: col(/^alim_code$/), fr: col(/^alim_nom_fr$/), grp: col(/^alim_grp_code$/), ss: col(/^alim_ssgrp_code$/), k: col(/^Energie, Règlement UE N° 1169 2011 \(kcal/), p: col(/^Protéines, N x facteur de Jones/), c: col(/^Glucides/), f: col(/^Lipides/), sug: col(/^Sucres/), fib: col(/^Fibres alimentaires/), sat: col(/^AG saturés/), na: col(/^Sodium/), po: col(/^Potassium/), ch: col(/^Cholestérol/), alc: col(/^Alcool/), salt: col(/^Sel chlorure de sodium/) };
    const frGrp = (g, ss) => {
      ss = String(ss || ''); g = String(g || '').padStart(2, '0');
      if (/^0201/.test(ss)) return 'Vegetables'; if (/^0202/.test(ss)) return 'Vegetables'; if (/^0203/.test(ss)) return 'Beans & legumes'; if (/^0204/.test(ss)) return 'Fruit'; if (/^0205/.test(ss)) return 'Nuts & seeds';
      return { '01': 'Prepared dishes', '02': 'Vegetables', '03': 'Grains & pasta', '04': 'Beef', '05': 'Dairy & eggs', '06': 'Drinks', '07': 'Sweets', '08': 'Sweets', '09': 'Fats & oils', '10': 'Soups & sauces' }[g] || 'Other';
    };
    for (const r of rows.slice(1)) {
      if (String(r[ix.grp]).padStart(2, '0') === '11' || String(r[ix.grp]) === '00') continue; // baby foods, "average food" placeholders
      const k = num(r[ix.k]); if (k == null) continue;
      const fr = tidy(r[ix.fr]), en = eng[r[ix.code]] || '';
      let grp = frGrp(r[ix.grp], r[ix.ss]);
      if (grp === 'Beef') grp = /poulet|dinde|canard|volaille|chicken|turkey|duck/i.test(fr) ? 'Poultry' : /porc|jambon|lard|bacon/i.test(fr) ? 'Pork' : /saucisse|saucisson|salami|pâté|rillettes/i.test(fr) ? 'Sausages & deli meats' : /poisson|saumon|thon|cabillaud|crevette|moule|huître|sardine|maquereau|truite|colin|merlu|crabe|homard|calmar/i.test(fr) ? 'Fish & seafood' : /oeuf|œuf/i.test(fr) ? 'Dairy & eggs' : /agneau|veau|mouton|lapin|gibier|cheval|chevreuil/i.test(fr) ? 'Lamb, veal & game' : 'Beef';
      const fib = num(r[ix.fib]), cho = num(r[ix.c]);
      let na = num(r[ix.na]); if (na == null && ix.salt >= 0 && num(r[ix.salt]) != null) na = num(r[ix.salt]) * 400;
      add({ n: en || fr, a: en ? fr : null, g: G[grp], s: SI.Ciqual, k: r0(k), p: r1(num(r[ix.p])), c: r1(cho == null ? null : cho + (fib || 0)), f: r1(num(r[ix.f])), fib: r1(fib), sug: r1(num(r[ix.sug])), sat: r1(num(r[ix.sat])), na: r0(na), ch: r0(num(r[ix.ch])), po: r0(num(r[ix.po])), alc: num(r[ix.alc]) > 0.5 });
    }
  }
}

// ---------- USA: FNDDS (foods and mixed dishes as eaten) ----------
if (exists(S + '/fndds/food.csv') && (exists(S + '/fndds/food_nutrient.csv') || exists(S + '/fndds/food_nutrient.csv.gz'))) {
  const F = S + '/fndds/';
  if (!exists(F + 'food_nutrient.csv') && exists(F + 'food_nutrient.csv.gz')) fs.writeFileSync(F + 'food_nutrient.csv', (await import('zlib')).gunzipSync(fs.readFileSync(F + 'food_nutrient.csv.gz')));
  // FNDDS food_nutrient uses the classic nutrient numbers (208 energy, 203 protein...); newer FDC files use ids (1008...)
  const NUT = { 208: 'k', 203: 'p', 205: 'c', 204: 'f', 291: 'fib', 269: 'sug', 606: 'sat', 307: 'na', 601: 'ch', 306: 'po', 221: 'alc', 1008: 'k', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fib', 2000: 'sug', 1258: 'sat', 1093: 'na', 1253: 'ch', 1092: 'po', 1018: 'alc' };
  const vals = {}; const nr = csv(F + 'food_nutrient.csv'); const nh = nr[0]; const fi = nh.indexOf('fdc_id'), ni = nh.indexOf('nutrient_id'), ai = nh.indexOf('amount');
  for (const r of nr.slice(1)) { const key = NUT[+r[ni]]; if (!key) continue; (vals[r[fi]] = vals[r[fi]] || {})[key] = num(r[ai]); }
  const por = {}; for (const r of objs(csv(F + 'food_portion.csv'))) (por[r.fdc_id] = por[r.fdc_id] || []).push([+r.seq_num, r.portion_description, num(r.gram_weight)]);
  const cat = Object.fromEntries(objs(csv(F + 'wweia_food_category.csv')).map((r) => [r.wweia_food_category || r.wweia_food_category_code || r[Object.keys(r)[0]], r.wweia_food_category_description || r[Object.keys(r)[1]]]));
  const usGrp = (d) => {
    d = String(d || '').toLowerCase();
    const T = [[/milk|yogurt|cheese|egg/, 'Dairy & eggs'], [/beef/, 'Beef'], [/pork/, 'Pork'], [/lamb|goat|game/, 'Lamb, veal & game'], [/chicken|turkey|poultry/, 'Poultry'], [/fish|shellfish|seafood/, 'Fish & seafood'], [/cold cuts|cured|hot dogs|sausages/, 'Sausages & deli meats'],
      [/beans|legumes|peas/, 'Beans & legumes'], [/nuts|seeds/, 'Nuts & seeds'], [/fruit|apple|banana|grape|citrus|berries|melon/, 'Fruit'], [/vegetable|potato|lettuce|tomato|carrot|broccoli|onion|corn|spinach|greens/, 'Vegetables'],
      [/burger|pizza|frankfurter|tacos|burritos|nachos|fries|fried chicken/, 'Fast food'], [/soup/, 'Soups & sauces'], [/sauce|gravy|condiment|dressing|dips|spreads/, 'Soups & sauces'],
      [/ready-to-eat cereal|cooked cereal/, 'Breakfast cereals'], [/rice|pasta|grain|noodle/, 'Grains & pasta'], [/bread|rolls|bagel|tortilla|biscuits|muffins|pancakes|waffles|french toast|crackers/, 'Baked goods'],
      [/cake|pie|cookie|brownie|doughnut|pastr|candy|sugar|ice cream|pudding|gelatin|sweet/, 'Sweets'], [/chips|pretzels|popcorn|snack/, 'Snacks'], [/coffee|tea|juice|soft drink|soda|water|beer|wine|liquor|drink|smoothie|shake/, 'Drinks'],
      [/butter|oil|fat|margarine|cream/, 'Fats & oils'], [/mixed dish|dishes|sandwich|stir-fry|casserole|salad/, 'Prepared dishes']];
    for (const [re, g] of T) if (re.test(d)) return g; return 'Prepared dishes';
  };
  for (const r of objs(csv(F + 'food.csv'))) {
    if (!/survey_fndds_food/.test(r.data_type)) continue;
    const v = vals[r.fdc_id]; if (!v || v.k == null) continue;
    const cdesc = cat[r.food_category_id] || ''; if (/human milk|baby food|infant formula/i.test(cdesc + ' ' + r.description)) continue;
    const p = (por[r.fdc_id] || []).sort((a, b) => a[0] - b[0]);
    const typical = p.find((x) => /quantity not specified/i.test(x[1]) && x[2] > 0);
    const u = (typical ? [['1 typical serving', typical[2]]] : []).concat(p.map((x) => [x[1], x[2]]));
    add({ n: tidy(r.description), g: G[usGrp(cdesc + ' ' + r.description)], s: SI.FNDDS, k: r0(v.k), p: r1(v.p), c: r1(v.c), f: r1(v.f), fib: r1(v.fib), sug: r1(v.sug), sat: r1(v.sat), na: r0(v.na), ch: r0(v.ch), po: r0(v.po), alc: v.alc > 0.5, u: units(u) });
  }
}

// ---------- Germany: BLS 4.0 (via @thereforejs/foods) ----------
{
  const mod = await import(path.resolve(D + '/thereforejs-foods-0.0.3/package/dist/index.mjs'));
  for (const v of Object.values(mod)) {
    if (!v || typeof v !== 'object' || !v.per100g || !v.name) continue;
    const p = v.per100g; const x = (k) => num(p[k]);
    const fat = x('fat'), carb = x('carbohydrate'), prot = x('protein');
    if (fat == null || carb == null || prot == null) continue;
    const kcal = 9 * fat + 4 * carb + 4 * prot + 2 * (x('fibre') || 0) + 7 * (x('alcohol') || 0) + 2.4 * (x('polyols') || 0) + 3 * (x('organicAcids') || 0);
    const name = tidy(v.name.en || v.name.de); if (!name) continue;
    add({ n: name, g: G.Other, s: SI.BLS, k: r0(kcal), p: r1(prot), c: r1(carb + (x('fibre') || 0)), f: r1(fat), fib: r1(x('fibre')), sug: r1(x('sugars')), sat: r1(x('saturates')), na: x('sodium') == null ? null : r0(x('sodium') * 1000), ch: null, po: null, alc: (x('alcohol') || 0) > 0.5 });
  }
}

// ---------- TempoLife (rows not copied from USDA) ----------
{
  const tcat = { 'Piimatooted': 'Dairy & eggs', 'Munad': 'Dairy & eggs', 'Pähklid ja seemned': 'Nuts & seeds', 'Köögivili': 'Vegetables', 'Leivad ja pagarittooted': 'Baked goods', 'Liha ja linnuliha': 'Meals & sides', 'Puuviljad ja marjad': 'Fruit', 'Teravili ja pasta': 'Grains & pasta', 'Joogid': 'Drinks', 'Kala ja mereannid': 'Fish & seafood', 'Magustoidud ja küpsetised': 'Sweets', 'Kastmed ja maitsed': 'Soups & sauces', 'Rasvad ja õlid': 'Fats & oils', 'Snäkid ja suupisted': 'Snacks', 'Supid': 'Soups & sauces', 'Vürtsid ja maitseained': 'Spices & herbs', 'Kaunviljad': 'Beans & legumes' };
  for (const t of JSON.parse(fs.readFileSync(D + '/tempo-food-db-1.0.0/package/data/tempolife-foods.json', 'utf8'))) {
    if (t.source || t.kcal_per_100g == null) continue;
    add({ n: tidy(t.name) + (t.brand ? ' (' + t.brand + ')' : ''), g: G[tcat[t.category] || 'Prepared dishes'], s: SI.TempoLife, k: r0(t.kcal_per_100g), p: r1(t.protein_g), c: r1(t.carbs_g), f: r1(t.fat_g), fib: r1(t.fiber_g), sug: r1(t.sugar_g), sat: r1(t.saturated_fat_g), na: t.salt_g == null ? null : r0(t.salt_g * 400) });
  }
}

// ---------- Regional staples that no official table covers (typical values, estimated) ----------
const ST = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'staples.json'), 'utf8'));
const plainT = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const official = foods.filter((o) => o.s !== SI.BLS && o.s !== SI.TempoLife).map((o) => ' ' + plainT(o.n + ' | ' + (o.a || '')).replace(/[^a-z0-9]+/g, ' ') + ' ');
for (const [r, n, grp, k, p, c, f, fib, sug, sat, na, sv, sd] of ST) {
  // drop the estimate when an official table has the same food (all main words of its name, as whole words)
  const words = plainT(n.split(/[(]/)[0]).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w.length > 2 && !['with', 'and', 'the', 'plain', 'style'].includes(w));
  if (words.length && official.some((x) => words.every((w) => x.includes(' ' + w + ' ') || x.includes(' ' + w + 's ')))) { (count.stapleReplaced = count.stapleReplaced || []).push(n); continue; }
  add({ n, g: G[grp], s: SI.Fuel, r, k, p, c, f, fib, sug, sat, na, u: [[sd, sv]] });
}

const keys = ['n', 'g', 's', 'r', 'k', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na', 'ch', 'po', 'u', 'a'];
const out = { v: 2, built: new Date().toISOString().slice(0, 10), groups, sources: SOURCES.map((s) => s[1]), tags: SOURCES.map((s) => s[0]), keys,
  foods: foods.map((o) => { const a = keys.map((k) => o[k] ?? null); while (a.length && a[a.length - 1] === null) a.pop(); return a; }) };
fs.writeFileSync('foods-db.json', JSON.stringify(out));
const rej = count.rejected || []; delete count.rejected; const rep = count.stapleReplaced || []; delete count.stapleReplaced;
console.log(JSON.stringify({ ...count, total: foods.length, bytes: fs.statSync('foods-db.json').size, rejectedForBadEnergy: rej.length, staplesReplacedByOfficial: rep.length }));
fs.writeFileSync('tools/mkdb-report.txt', 'Rejected (energy does not match macros):\n' + rej.join('\n') + '\n\nStaples replaced by an official entry:\n' + rep.join('\n') + '\n');
