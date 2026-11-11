// Today screen: tap an earlier day in the week strip to see (and edit) it; meals fold to one line.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  const keys = await page.evaluate(() => {
    const t = new Date(), dow = t.getDay(), f = (id, n, k) => ({ id, name: n, kcal: k, p: 20, c: 30, f: 10, serving: '1 serving' }), e = (id, food, s) => ({ id, food, servings: s || 1 });
    const back = (n) => { const d = new Date(t); d.setDate(t.getDate() - n); return d.toDateString(); };
    // within this week: yesterday (summary only, like days saved before v1.7) and two days ago (full log)
    const y = back(1), y2 = back(2);
    const days = {}, dayLogs = {};
    days[y] = { kcal: 900, p: 60, c: 90, f: 30, ex: 200, water: 4, items: [{ n: 'Toast', k: 300, meal: 'breakfast' }, { n: 'Rice bowl', k: 600, meal: 'dinner' }] };
    dayLogs[y2] = { breakfast: [e('a', f('fa', 'Oatmeal', 300))], lunch: [e('b', f('fb', 'Chicken wrap', 500)), e('c', f('fc', 'Apple', 95))], dinner: [], snacks: [] };
    days[y2] = { kcal: 895, p: 60, c: 90, f: 30, ex: 0, water: 0, items: [] };
    DC.comp.setState({ mode: 'app', view: 'tabs', tab: 'today', goals: ['lose'], units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light',
      days, dayLogs, log: { breakfast: [e('t1', f('ft1', 'Eggs', 150)), e('t2', f('ft2', 'Coffee', 5))], lunch: [], dinner: [], snacks: [] } });
    return { y, y2, dow };
  });
  await page.waitForTimeout(300);
  // meals fold by default
  let v = await page.evaluate(() => DC.comp.renderVals().meals.map((m) => [m.label, m.count, m.shown.length]));
  expect(v[0][1] === '2 items' && v[0][2] === 0, 'Breakfast shows "2 items" folded (' + JSON.stringify(v[0]) + ')');
  await page.screenshot({ path: SHOTS + '/today-folded.png' });
  await page.getByRole('button', { name: /^Breakfast/ }).click(); await page.waitForTimeout(150);
  expect(await page.locator('text=Coffee').isVisible(), 'tapping Breakfast opens its list');
  await page.screenshot({ path: SHOTS + '/today-open.png' });
  if (keys.dow >= 2) {
    // yesterday: view only
    await page.locator('button[aria-label^="' + new Date(keys.y).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '"]').click(); await page.waitForTimeout(200);
    v = await page.evaluate(() => { const r = DC.comp.renderVals(); return { t: r.dayTitle, past: r.isPast, eaten: r.eatenStr, note: r.pastNote, b: r.meals[0].count, canAdd: r.meals[0].canAdd }; });
    expect(v.past && v.eaten === '900' && v.b === '1 item' && !v.canAdd, 'yesterday (summary only) shows its 900 kcal and items, view only (' + JSON.stringify(v) + ')');
    await page.screenshot({ path: SHOTS + '/today-yesterday.png' });
    // two days ago: full log, add and remove
    await page.locator('button[aria-label^="' + new Date(keys.y2).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '"]').click(); await page.waitForTimeout(200);
    v = await page.evaluate(() => { const r = DC.comp.renderVals(); return { eaten: r.eatenStr, lunch: r.meals[1].count, canAdd: r.meals[1].canAdd }; });
    expect(v.eaten === '895' && v.lunch === '2 items' && v.canAdd, 'two days ago shows its full log and can be edited (' + JSON.stringify(v) + ')');
    await page.evaluate(() => { DC.comp.logFood({ id: 'fz', name: 'Yogurt', kcal: 120, p: 10, c: 12, f: 3, serving: '1 cup' }, 1, 'snacks'); });
    await page.waitForTimeout(150);
    v = await page.evaluate((k) => ({ eaten: DC.comp.renderVals().eatenStr, saved: DC.comp.state.days[k].kcal, todayLog: Object.values(DC.comp.state.log).flat().length }), keys.y2);
    expect(v.eaten === '1,015' && v.saved === 1015 && v.todayLog === 2, 'food added to that day updates its total, not today (' + JSON.stringify(v) + ')');
    await page.getByRole('button', { name: 'Back to today' }).click(); await page.waitForTimeout(150);
    expect(await page.evaluate(() => DC.comp.renderVals().dayTitle === 'Today'), 'Back to today');
  } else console.log('(early in the week: past-day checks skipped)');
  // rollover keeps the full log for the finished day
  await page.waitForTimeout(1500);
  const k = await page.evaluate(() => Object.keys(localStorage).find((x) => x.startsWith('fuel:state:')));
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); const y = new Date(); y.setDate(y.getDate() - 1); s.state.logDay = y.toDateString(); localStorage.setItem(k, JSON.stringify(s)); }, k);
  await page.reload(); await page.waitForSelector('text=Today'); await page.waitForTimeout(500);
  const dl = await page.evaluate(() => { const y = new Date(); y.setDate(y.getDate() - 1); const L = (DC.comp.state.dayLogs || {})[y.toDateString()]; return L ? Object.values(L).flat().map((e) => e.food.name) : null; });
  expect(dl && dl.includes('Eggs') && dl.includes('Coffee'), 'at midnight the finished day keeps its full log (' + JSON.stringify(dl) + ')');
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); if (fails.length) process.exit(1); console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); process.exit(1); });
