import fs from 'fs';
const D = process.argv[2];
const num = (x) => { const n = parseFloat(x); return isNaN(n) ? null : n; };
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
const r0 = (x) => x == null ? null : Math.round(x);
const groups = ['Dairy & eggs','Spices & herbs','Fats & oils','Poultry','Soups & sauces','Sausages & deli meats','Breakfast cereals','Fruit','Pork','Vegetables','Nuts & seeds','Beef','Drinks','Fish & seafood','Beans & legumes','Lamb, veal & game','Baked goods','Sweets','Grains & pasta','Fast food','Meals & sides','Snacks','Restaurant foods','Prepared dishes','Other'];
const G = Object.fromEntries(groups.map((g, i) => [g, i]));
const usdaGrp = { '0100':'Dairy & eggs','0200':'Spices & herbs','0400':'Fats & oils','0500':'Poultry','0600':'Soups & sauces','0700':'Sausages & deli meats','0800':'Breakfast cereals','0900':'Fruit','1000':'Pork','1100':'Vegetables','1200':'Nuts & seeds','1300':'Beef','1400':'Drinks','1500':'Fish & seafood','1600':'Beans & legumes','1700':'Lamb, veal & game','1800':'Baked goods','1900':'Sweets','2000':'Grains & pasta','2100':'Fast food','2200':'Meals & sides','2500':'Snacks','3600':'Restaurant foods' };
const foods = []; const seen = new Set();
const add = (o) => { const k = o.n.toLowerCase(); if (seen.has(k + o.s)) return; seen.add(k + o.s); foods.push(o); };
// USDA SR28
const split = (l) => l.replace(/\r/g, '').split('^').map((x) => x.replace(/^~|~$/g, ''));
const des = {}; for (const l of fs.readFileSync(D + '/fda-nutrient-database-1.0.2/package/data/FOOD_DES.txt', 'latin1').split('\n')) { if (!l.trim()) continue; const f = split(l); des[f[0]] = { grp: f[1], long: f[2] }; }
let usda = 0;
for (const l of fs.readFileSync(D + '/fda-nutrient-database-1.0.2/package/data/ABBREV.txt', 'latin1').split('\n')) {
  if (!l.trim()) continue; const f = split(l); const d = des[f[0]]; if (!d) continue;
  const grp = usdaGrp[d.grp]; if (!grp) continue; // drops baby foods + American Indian/Alaska Native
  const kcal = num(f[3]); if (kcal == null) continue;
  let sv = num(f[48]), sd = (f[49] || '').trim();
  if (!sv || !sd) { sv = null; sd = null; }
  add({ n: d.long.replace(/\s+/g, ' ').trim(), g: G[grp], s: 0, k: r0(kcal), p: r1(num(f[4])), c: r1(num(f[7])), f: r1(num(f[5])), fib: r1(num(f[8])), sug: r1(num(f[9])), sat: r1(num(f[44])), na: r0(num(f[15])), ch: r0(num(f[47])), po: r0(num(f[14])), sv: sv ? r1(sv) : null, sd });
  usda++;
}
// BLS via thereforejs
const mod = await import(D + '/thereforejs-foods-0.0.3/package/dist/index.mjs');
let bls = 0;
for (const v of Object.values(mod)) {
  if (!v || typeof v !== 'object' || !v.per100g || !v.name) continue;
  const p = v.per100g; const x = (k) => num(p[k]);
  const fat = x('fat'), carb = x('carbohydrate'), prot = x('protein');
  if (fat == null || carb == null || prot == null) continue;
  const kcal = 9 * fat + 4 * carb + 4 * prot + 2 * (x('fibre') || 0) + 7 * (x('alcohol') || 0) + 2.4 * (x('polyols') || 0) + 3 * (x('organicAcids') || 0);
  const name = (v.name.en || v.name.de || '').trim(); if (!name) continue;
  add({ n: name, g: G['Other'], s: 1, k: r0(kcal), p: r1(prot), c: r1(carb), f: r1(fat), fib: r1(x('fibre')), sug: r1(x('sugars')), sat: r1(x('saturates')), na: x('sodium') == null ? null : r0(x('sodium') * 1000), ch: null, po: null, sv: null, sd: null });
  bls++;
}
// TempoLife curated (non-USDA rows only)
const tcat = { 'Piimatooted':'Dairy & eggs','Munad':'Dairy & eggs','Pähklid ja seemned':'Nuts & seeds','Köögivili':'Vegetables','Leivad ja pagarittooted':'Baked goods','Liha ja linnuliha':'Meals & sides','Puuviljad ja marjad':'Fruit','Teravili ja pasta':'Grains & pasta','Joogid':'Drinks','Kala ja mereannid':'Fish & seafood','Magustoidud ja küpsetised':'Sweets','Kastmed ja maitsed':'Soups & sauces','Rasvad ja õlid':'Fats & oils','Snäkid ja suupisted':'Snacks','Supid':'Soups & sauces','Vürtsid ja maitseained':'Spices & herbs','Kaunviljad':'Beans & legumes' };
let tempo = 0;
for (const t of JSON.parse(fs.readFileSync(D + '/tempo-food-db-1.0.0/package/data/tempolife-foods.json', 'utf8'))) {
  if (t.source) continue; if (t.kcal_per_100g == null) continue;
  add({ n: t.name.trim() + (t.brand ? ' (' + t.brand + ')' : ''), g: G[tcat[t.category] || 'Prepared dishes'], s: 2, k: r0(t.kcal_per_100g), p: r1(t.protein_g), c: r1(t.carbs_g), f: r1(t.fat_g), fib: r1(t.fiber_g), sug: r1(t.sugar_g), sat: r1(t.saturated_fat_g), na: t.salt_g == null ? null : r0(t.salt_g * 400), ch: null, po: null, sv: null, sd: null });
  tempo++;
}

// Regional staples not covered above: typical per-100 g values (estimates), tagged by country
const ST = [
 ['CA','Poutine','Fast food',230,5.5,23,13,1.8,1,5.5,450,330,'1 regular'],['CA','Butter tart','Sweets',410,4,52,21,1,32,9,180,60,'1 tart'],['CA','Nanaimo bar','Sweets',470,4.5,52,28,2,40,15,150,60,'1 bar'],
 ['CA','Tourtière (meat pie)','Meals & sides',290,11,22,18,1.2,1.5,7,420,150,'1 slice'],['CA','Bannock','Baked goods',330,7,50,11,2,3,2,550,80,'1 piece'],['CA','Peameal bacon, cooked','Pork',140,22,1,5.5,0,0.5,1.8,1100,84,'3 slices'],
 ['CA','Montreal-style bagel','Baked goods',270,9,54,1.8,2.2,7,0.3,280,85,'1 bagel'],['CA','Fried dough pastry with cinnamon sugar','Sweets',380,6,48,18,2,18,4,300,120,'1 pastry'],['CA','Split pea soup with ham, Québec style','Soups & sauces',75,4.5,11,1.5,3,1.5,0.6,380,300,'1 bowl'],
 ['CA','Maple taffy (tire sur la neige)','Sweets',350,0,90,0,0,85,0,10,30,'1 stick'],['CA','Beef jerky, plain','Snacks',410,33,11,25,1.8,9,10,1800,28,'1 oz'],
 ['UK','Crumpet','Baked goods',190,6.2,38,1,2.1,2,0.2,320,55,'1 crumpet'],['UK','Scone, plain','Baked goods',360,7,53,13,2,15,5,520,70,'1 scone'],['UK','Yorkshire pudding','Baked goods',250,8.5,30,11,1.2,2.5,3,220,30,'1 pudding'],
 ['UK','Sausage roll','Baked goods',330,8.5,25,22,1.3,2,9,550,60,'1 roll'],['UK','Cornish pasty','Meals & sides',270,7,25,16,1.7,1.5,6.5,380,250,'1 pasty'],['UK','Fish and chips (battered cod and chips)','Meals & sides',210,9,22,10,2,0.5,1.5,200,450,'1 portion'],
 ['UK',"Shepherd's pie",'Meals & sides',120,6.5,10,6,1.2,1.5,2.8,250,350,'1 portion'],['UK','Black pudding','Sausages & deli meats',300,10,19,21,0.5,0.5,8,1000,30,'1 slice'],['UK','Scotch egg','Meals & sides',250,11,15,16,1.5,1,4,480,110,'1 egg'],
 ['UK','Full English breakfast','Meals & sides',180,9,9,12,1.5,2,4,650,450,'1 plate'],['UK','Beans on toast','Meals & sides',140,6,22,2.5,4,4.5,0.4,400,250,'1 serving'],['UK','Jacket potato with cheese','Meals & sides',150,6,18,6,1.8,1,3.6,140,300,'1 potato'],
 ['UK','Chicken tikka masala','Meals & sides',140,10,6,9,1,3,3.5,380,350,'1 portion'],['UK','Sticky toffee pudding','Sweets',360,3.5,52,16,1,38,9,300,120,'1 portion'],['UK','Yeast extract spread','Spices & herbs',180,25,12,0.5,2.5,2,0.1,3400,5,'1 tsp'],
 ['UK','Prawn mayonnaise sandwich','Meals & sides',240,9,24,12,2,3,1.5,420,180,'1 sandwich'],['UK','Mince pie','Sweets',380,3.5,58,15,1.8,30,6,150,55,'1 pie'],
 ['AU','Meat pie','Meals & sides',260,8.5,22,15,1.3,2,7,480,175,'1 pie'],['AU','Lamington','Sweets',380,4.5,55,16,2,40,10,200,60,'1 lamington'],['AU','Pavlova with cream and fruit','Sweets',230,2.5,35,9,0.8,32,6,40,100,'1 slice'],
 ['AU','Anzac biscuit','Sweets',470,5,63,22,3.5,30,12,280,20,'1 biscuit'],['AU','Sausage sizzle (sausage in bread with onion)','Fast food',270,10,24,15,1.5,3,6,620,130,'1 serve'],['AU','Chicken parmigiana','Meals & sides',210,15,12,11,1,2.5,4.5,450,350,'1 serve'],
 ['AU','Smashed avocado on toast','Meals & sides',230,5.5,20,14,5,2,2.5,280,200,'1 serve'],['AU','Flat white, whole milk','Drinks',50,3.2,4.5,2.2,0,4.5,1.4,40,220,'1 cup'],['AU','Sausage roll, beef','Baked goods',320,8,26,20,1.5,2,9,580,120,'1 roll'],
 ['AU','Barramundi, grilled','Fish & seafood',120,23,0,2.8,0,0,0.8,60,150,'1 fillet'],['AU','Kangaroo steak, cooked','Lamb, veal & game',140,29,0,2,0,0,0.8,60,150,'1 steak'],
 ['FR','Pain au chocolat','Baked goods',420,7.5,46,23,2.5,13,14,340,65,'1 pastry'],['FR','Quiche lorraine','Meals & sides',290,10,18,20,0.8,2,9,450,150,'1 slice'],['FR','Croque-monsieur','Meals & sides',270,14,22,14,1.3,3,7,800,180,'1 sandwich'],
 ['FR','Ratatouille','Vegetables',60,1.3,6,3.3,2,4,0.5,250,200,'1 serving'],['FR','Crêpe, plain','Baked goods',220,7,30,8,1,6,3,180,60,'1 crêpe'],['FR','Galette complète (ham, egg, cheese)','Meals & sides',200,11,16,10,1.8,1,4.5,550,250,'1 galette'],
 ['FR','Steak frites','Meals & sides',240,14,17,13,1.7,0.5,4,250,400,'1 plate'],['FR','Boeuf bourguignon','Meals & sides',140,14,4,7,0.8,2,2.6,330,300,'1 portion'],['FR','Confit de canard','Poultry',270,20,0,21,0,0,6.5,600,180,'1 leg'],
 ['FR','Fromage blanc 0%','Dairy & eggs',46,7.6,4,0.1,0,4,0.1,40,100,'100 g'],['FR','Croissant aux amandes','Baked goods',440,9,44,26,3,20,11,250,100,'1 pastry'],['FR','Tarte aux pommes','Sweets',260,3,35,12,1.5,18,7,150,120,'1 slice'],
 ['FR','Salade niçoise','Meals & sides',110,7,5,7,1.6,2.5,1.3,350,350,'1 bowl'],['FR','Jambon-beurre sandwich','Meals & sides',260,12,30,10,1.8,2,5.5,700,200,'1 sandwich'],['FR','Comté cheese','Dairy & eggs',415,28,0,34,0,0,22,320,30,'1 slice']
];
let staples = 0;
for (const [r, n, grp, k, p, c, f, fib, sug, sat, na, sv, sd] of ST) { add({ n, g: G[grp], s: 3, r, k, p, c, f, fib, sug, sat, na, ch: null, po: null, sv, sd }); staples++; }
const keys = ['n','g','s','r','k','p','c','f','fib','sug','sat','na','ch','po','sv','sd'];
const out = { v: 1, built: new Date().toISOString().slice(0, 10), groups, sources: ['USDA SR28', 'BLS 4.0', 'TempoLife', 'Fuel staples (estimate)'], keys, foods: foods.map((o) => keys.map((k) => o[k] ?? null)) };
fs.writeFileSync('foods-db.json', JSON.stringify(out));
console.log({ usda, bls, tempo, staples, total: foods.length, bytes: fs.statSync('foods-db.json').size });
const pick = (q) => foods.filter((o) => o.n.toLowerCase().includes(q)).slice(0, 3).map((o) => o.n + ' | ' + o.k + 'kcal P' + o.p + ' C' + o.c + ' F' + o.f + ' fib' + o.fib + ' na' + o.na + ' | ' + (o.sd ? o.sv + 'g ' + o.sd : '100 g') + ' | src' + o.s);
for (const q of ['chicken, broilers or fryers, breast, meat only, cooked', 'oat', 'croissant', 'baguette', 'big mac', 'greek', 'poutine', 'vegemite', 'crumpet', 'egg, whole, cooked, fried']) console.log(q, '=>', pick(q));
