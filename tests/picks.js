// Recipe picks: recommended by goal, calorie target, meal and eating style, with a portion sized to the plan.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  const base = { mode: 'app', view: 'tabs', tab: 'plan', units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', dietPref: 'all' };
  const get = () => page.evaluate(() => { const r = DC.comp.renderVals(); const plan = DC.comp.computePlan();
    return { goal: plan.goal, cal: plan.cal, note: r.pickNote, n: r.recipeCount, picks: r.ideas.map((x) => { const d = DC.comp.ideas.find((y) => y.id === x.id); return { id: x.id, kcal: d.kcal, p: d.p, slots: d.slots, diets: d.diets, cats: d.cats, fit: x.fitTxt, portion: x.portionTxt }; }) }; });
  await page.evaluate((s) => DC.comp.setState({ ...s, goals: ['lose'], pickSlot: 'main' }), base); await page.waitForTimeout(250);
  const lose = await get();
  expect(lose.n >= 110, 'over 110 recipes to pick from (' + lose.n + ')');
  expect(lose.picks.length >= 6 && lose.picks.every((x) => x.slots.includes('main')), 'fat loss, lunch & dinner: ' + lose.picks.length + ' lunch/dinner picks');
  const avgPD = (ps) => ps.reduce((a, x) => a + x.p * 4 / x.kcal, 0) / ps.length;
  expect(avgPD(lose.picks) >= 0.33, 'fat-loss picks are high in protein (avg ' + Math.round(avgPD(lose.picks) * 100) + '% of calories)');
  const budget = Math.round(lose.cal * 0.32);
  const fits = lose.picks.map((x) => parseInt(x.fit, 10));
  expect(fits.every((k) => Math.abs(k - budget) / budget < 0.3), 'portions land near the ' + budget + ' cal meal budget (' + fits.join(', ') + ')');
  expect(/Fat loss/.test(lose.note) && lose.note.includes(lose.cal.toLocaleString('en-US')), 'note explains the goal and target: ' + lose.note);
  await page.screenshot({ path: SHOTS + '/picks-lose.png' });
  await page.evaluate(() => DC.comp.setState({ goals: ['muscle'] })); await page.waitForTimeout(250);
  const mus = await get();
  expect(mus.cal > lose.cal && /Muscle gain/.test(mus.note), 'muscle gain has a bigger target (' + mus.cal + ' vs ' + lose.cal + ')');
  const mFits = mus.picks.map((x) => parseInt(x.fit, 10)), lFits = fits;
  expect(mFits.reduce((a, b) => a + b) / mFits.length > lFits.reduce((a, b) => a + b) / lFits.length + 100, 'muscle-gain meals are bigger');
  expect(JSON.stringify(mus.picks.map((x) => x.id)) !== JSON.stringify(lose.picks.map((x) => x.id)), 'muscle-gain picks differ from fat-loss picks');
  for (const [d, test] of [['vegan', (x) => x.diets.includes('vegan')], ['veg', (x) => x.diets.includes('veg')], ['lowcarb', (x) => x.cats.includes('lowcarb')], ['lf', (x) => x.diets.includes('lf')]]) {
    await page.evaluate((d) => DC.comp.setState({ goals: ['lose'], dietPref: d }), d); await page.waitForTimeout(150);
    const v = await get();
    expect(v.picks.length >= 1 && v.picks.every(test), d + ': ' + v.picks.length + ' picks, all match');
  }
  await page.evaluate(() => DC.comp.setState({ dietPref: 'all' }));
  for (const sl of ['breakfast', 'snack']) {
    await page.getByRole('button', { name: sl === 'breakfast' ? 'Breakfast' : 'Snacks', exact: true }).click(); await page.waitForTimeout(150);
    const v = await get();
    expect(v.picks.length >= 5 && v.picks.every((x) => x.slots.includes(sl)), sl + ' chip shows ' + sl + ' recipes (' + v.picks.length + ')');
  }
  await page.screenshot({ path: SHOTS + '/picks-snacks.png' });
  // open a pick: portion carried over, numbers and amounts scale, logging uses the portion
  await page.getByRole('button', { name: 'Lunch & dinner', exact: true }).click(); await page.waitForTimeout(150);
  const first = (await get()).picks[0];
  await page.evaluate(() => DC.comp.renderVals().ideas[0].open()); await page.waitForTimeout(250);
  let rc = await page.evaluate(() => { const r = DC.comp.renderVals().rc; return { kcal: r.kcal, label: r.portionLabel, line: r.lines[0].t, k: DC.comp.state.portion }; });
  expect(rc.label === first.portion.replace('Your portion: ', '') && rc.kcal === parseInt(first.fit, 10), 'recipe page opens with your portion (' + rc.label + ', ' + rc.kcal + ' cal)');
  await page.screenshot({ path: SHOTS + '/recipe-portion.png' });
  await page.getByRole('button', { name: 'Bigger portion' }).click(); await page.waitForTimeout(150);
  const rc2 = await page.evaluate(() => { const r = DC.comp.renderVals().rc; return { kcal: r.kcal, line: r.lines[0].t, k: DC.comp.state.portion }; });
  expect(rc2.k === rc.k + 0.25 && rc2.kcal > rc.kcal && rc2.line !== rc.line, 'bigger portion scales calories and amounts (' + rc.line + ' → ' + rc2.line + ')');
  await page.getByRole('button', { name: 'Add to diary' }).click(); await page.waitForTimeout(150);
  const sv = await page.evaluate(() => DC.comp.state.servings);
  expect(sv === rc2.k, 'Add to diary uses your portion (' + sv + ' servings)');
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
