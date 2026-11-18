// Keep my week on track: going over on earlier days this week (Sun–Sat) lowers the goal for the days left.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'tabs', tab: 'today', goals: ['lose'], units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', peakOn: false, exLog: [], exercise: 0, trainMode: 'log' }));
  await page.waitForTimeout(400);
  // the rule, on a fixed Wednesday (Nov 18 2026): Sun +900 over, Mon 300 under, Tue not logged → 600 over, 4 days left → 150 a day
  const r = await page.evaluate(() => {
    const C = DC.comp, plan = C.computePlan(), wed = new Date(2026, 10, 18, 12), k = (d) => new Date(2026, 10, d, 12).toDateString();
    const S = (days, x) => Object.assign({}, C.state, { days }, x || {});
    const a = C.weekBalance(S({ [k(15)]: { kcal: plan.cal + 900 }, [k(16)]: { kcal: plan.cal - 300 } }), plan, wed);
    const ex = C.weekBalance(S({ [k(15)]: { kcal: plan.cal + 400, ex: 400 } }), plan, wed); // ate back exercise: not over
    const under = C.weekBalance(S({ [k(15)]: { kcal: plan.cal - 700 } }), plan, wed);
    const last = C.weekBalance(S({ [k(15)]: { kcal: plan.cal + 2500 } }), plan, new Date(2026, 10, 21, 12)); // Saturday, one day left, capped
    const off = C.weekBalance(S({ [k(15)]: { kcal: plan.cal + 900 } }, { weekTrack: false }), plan, wed);
    const lastWeek = C.weekBalance(S({ [k(14)]: { kcal: plan.cal + 900 } }), plan, wed); // Saturday before: a new week
    return { cal: plan.cal, floor: plan.floor, a, ex, under, last, off, lastWeek };
  });
  expect(r.a.net === 600 && r.a.daysLeft === 4 && r.a.perDay === 150, 'over 900 Sunday, under 300 Monday → 600 over, 150 off each of the 4 days left (Wed–Sat) (' + JSON.stringify(r.a) + ')');
  expect(r.ex.net === 0 && r.ex.today === 0, 'eating back logged exercise is not counted as over');
  expect(r.under.net === -700 && r.under.today === 0, 'being under never raises the goal');
  expect(r.last.perDay === Math.min(Math.round(r.cal * 0.25), r.cal - r.floor) && r.last.leftover > 0 && r.cal - r.last.perDay >= r.floor, 'Saturday: capped at 25% and the floor, the rest shown as leftover (' + r.last.perDay + ' off, ' + r.last.leftover + ' left over)');
  expect(r.off.today === 0 && r.off.net === 900, 'switched off: nothing is taken off');
  expect(r.lastWeek.net === 0, 'last week does not count');
  // on Today, with the real date: a day earlier this week 700 over
  const dow = new Date().getDay();
  if (dow > 0) {
    await page.evaluate(() => { const C = DC.comp, plan = C.computePlan(), d = new Date(); d.setDate(d.getDate() - 1); C.setState({ days: { [d.toDateString()]: { kcal: plan.cal + 700, p: 100, c: 200, f: 80, ex: 0 } } }); });
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => { const R = DC.comp.renderVals(), plan = DC.comp.computePlan(); return { note: R.weekNote, target: R.targetStr, cal: plan.cal, carbs: R.macroBars[0].tgt, c: plan.c, prot: R.macroBars[2].tgt, p: plan.p }; });
    const left = 7 - dow, per = Math.min(Math.round(t.cal * 0.25), Math.ceil(700 / left / 10) * 10);
    expect(t.target === (t.cal - per).toLocaleString('en-US'), 'Today goal is ' + t.target + ' (target ' + t.cal + ' − ' + per + ')');
    expect(t.carbs === Math.round(t.c - per / 4) && t.prot === t.p, 'the cut comes out of carbs (' + t.carbs + ' g), protein stays ' + t.prot + ' g');
    expect(/Week so far: 700 cal over/.test(t.note), 'Today explains it: ' + t.note);
    await page.screenshot({ path: SHOTS + '/week-today.png' });
    await page.evaluate(() => DC.comp.setState({ view: 'target', targetPrev: 'tabs' })); await page.waitForTimeout(300);
    const sub = await page.evaluate(() => document.body.innerText.match(/target[^\n]*keep your week on track/));
    expect(!!sub, 'How it\'s set shows the deduction (' + (sub && sub[0]) + ')');
    await page.evaluate(() => DC.comp.setState({ view: 'tabs', tab: 'more' })); await page.waitForTimeout(300);
    await page.getByRole('switch', { name: /Keep my week on track/ }).click(); await page.waitForTimeout(200);
    await page.evaluate(() => DC.comp.setState({ tab: 'today' })); await page.waitForTimeout(200);
    const t2 = await page.evaluate(() => ({ target: DC.comp.renderVals().targetStr, cal: DC.comp.computePlan().cal, note: DC.comp.renderVals().weekNote }));
    expect(t2.target === t2.cal.toLocaleString('en-US') && /Turn on Keep my week on track/.test(t2.note), 'switched off in More: full goal back (' + t2.note + ')');
  } else console.log('skip: today is Sunday, nothing earlier this week');
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
