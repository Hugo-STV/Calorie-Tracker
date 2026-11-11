// Workout fuel on Plan: Before / After picks from workout timing, chosen from what you trained today.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  const base = { mode: 'app', view: 'tabs', tab: 'plan', planView: 'home', goals: ['lose'], units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', exLog: [], peakOn: false };
  await page.evaluate((s) => DC.comp.setState(s), base); await page.waitForTimeout(500);
  // tags
  const tags = await page.evaluate(() => { const I = DC.comp.ideas; const pre = I.filter((r) => r.cats.includes('pre')), post = I.filter((r) => r.cats.includes('post'));
    return { pre: pre.length, post: post.length, preOk: pre.every((r) => r.c * 4 / r.kcal >= 0.45 && r.f * 9 / r.kcal <= 0.3), postOk: post.every((r) => r.p >= 20 && r.c >= 15),
      preTitles: pre.map((r) => r.title), postTitles: post.map((r) => r.title) }; });
  expect(tags.pre >= 25 && tags.post >= 40 && tags.preOk && tags.postOk, tags.pre + ' recipes for before a workout (mostly carbs, low fat), ' + tags.post + ' for after (protein + carbs)');
  // no workout today → Before
  let v = await page.evaluate(() => { const R = DC.comp.renderVals(); return { note: R.fuelNote, on: R.fuelChips.find((c) => c.on).label, n: R.fuelIdeas.length, photos: R.fuelIdeas.filter((r) => r.photo).length, tag: R.fuelIdeas[0] && R.fuelIdeas[0].tag, fit: R.fuelIdeas[0] && R.fuelIdeas[0].fitTxt }; });
  expect(v.on === 'Before' && /No workout yet today/.test(v.note) && /1–3 hours before/.test(v.note), 'no workout today: shows Before (' + v.note + ')');
  expect(v.n === 8 && v.photos === 8 && v.tag === 'Pre-workout' && /g carbs/.test(v.fit), '8 pre-workout picks with photos (' + v.fit + ')');
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Workout fuel').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('img[src*="photos/"]')].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  await page.screenshot({ path: SHOTS + '/fuel-before.png' });
  // a Peak workout that just finished → After
  await page.evaluate(() => { const now = Date.now(); DC.comp.setState({ peakOn: true, peakRaw: [{ id: 'w1', name: 'Leg day', start: now - 80 * 6e4, end: now - 20 * 6e4, exercises: [] }] }); });
  await page.waitForTimeout(300);
  v = await page.evaluate(() => { const R = DC.comp.renderVals(); return { note: R.fuelNote, on: R.fuelChips.find((c) => c.on).label, tag: R.fuelIdeas[0].tag, fit: R.fuelIdeas[0].fitTxt, ps: R.fuelIdeas.map((r) => r.p) }; });
  expect(v.on === 'After' && /Leg day \(Peak\) finished at .*refuel now/.test(v.note) && /within 2 hours/.test(v.note), 'after a Peak workout: shows After (' + v.note + ')');
  expect(v.tag === 'Post-workout' && /g protein · \d+ g carbs/.test(v.fit) && v.ps.every((p) => p >= 20), 'post-workout picks have 20 g+ protein (' + v.fit + ')');
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Workout fuel').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('img[src*="photos/"]')].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  await page.screenshot({ path: SHOTS + '/fuel-after.png' });
  // switch by hand, and eating style applies
  await page.getByRole('button', { name: 'Before', exact: true }).click(); await page.waitForTimeout(200);
  await page.evaluate(() => DC.comp.setState({ dietPref: 'vegan' })); await page.waitForTimeout(200);
  v = await page.evaluate(() => { const R = DC.comp.renderVals(); return { on: R.fuelChips.find((c) => c.on).label, vegan: R.fuelIdeas.every((r) => r.diets.includes('vegan')), n: R.fuelIdeas.length }; });
  expect(v.on === 'Before' && v.vegan, 'Before can be picked by hand, and Vegan applies (' + v.n + ' vegan picks)');
  // open one: recipe page has the tag chip, and the browser has the rows
  await page.evaluate(() => DC.comp.setState({ dietPref: 'all', fuelWhen: 'post' })); await page.waitForTimeout(200);
  await page.evaluate(() => DC.comp.renderVals().fuelIdeas[0].open()); await page.waitForTimeout(300);
  const chip = await page.evaluate(() => DC.comp.renderVals().rc.catChips.map((c) => c.label));
  expect(chip.includes('After a workout'), 'recipe page shows the After a workout tag (' + chip.join(', ') + ')');
  await page.screenshot({ path: SHOTS + '/fuel-recipe.png' });
  await page.evaluate(() => DC.comp.setState({ view: 'browse', browseCat: null, savedOnly: false, recipeQ: '' })); await page.waitForTimeout(300);
  const rows = await page.evaluate(() => DC.comp.renderVals().browseRows.map((r) => r.title));
  expect(rows.some((t) => /^Before a workout · \d+/.test(t)) && rows.some((t) => /^After a workout · \d+/.test(t)), 'Recipes browser has Before and After a workout rows');
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log('pre sample:', tags.preTitles.slice(0, 12).join('; ')); console.log('post sample:', tags.postTitles.slice(0, 12).join('; '));
  await b.close();
  if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
