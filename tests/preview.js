// Logging a food shows your day with it added (calories, protein, carbs, fat vs goals), live as the amount changes.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'tabs', tab: 'today', goals: ['lose'], units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', peakOn: false, exLog: [], exercise: 0, days: {} }));
  // already eaten today: 1,400 kcal
  await page.evaluate(() => { const f = { name: 'Earlier meal', serving: '1 plate', kcal: 1400, p: 90, c: 150, f: 45 }; DC.comp.setState({ log: { breakfast: [{ food: f, servings: 1 }], lunch: [], dinner: [], snacks: [] } }); });
  await page.evaluate(() => DC.comp.setState({ view: 'log' }));
  await page.fill('input[aria-label="Search food"]', 'ham');
  await page.waitForSelector('text=Ham pie', { timeout: 8000 }); await page.getByText('Ham pie').first().click();
  await page.waitForSelector('#selg');
  const get = () => page.evaluate(() => { const v = DC.comp.renderVals(); return { imp: v.imp, sel: v.sel, budget: v.targetStr }; });
  let v = await get();
  const cal = v.imp.rows[0];
  console.log(JSON.stringify(v.imp.rows.map((r) => r.label + ': ' + r.nums + ' · ' + r.status)), v.imp.head, '|', v.imp.tip);
  expect(v.imp.rows.length === 4 && cal.nums.startsWith('1,400 → ' + (1400 + v.sel.kcal).toLocaleString('en-US') + ' / '), 'calories row shows eaten → with this food / goal (' + cal.nums + ')');
  expect(cal.addTxt === '+' + v.sel.kcal && v.imp.rows[1].addTxt === '+' + Math.round(v.sel.p) + ' g', 'each row shows what this food adds (' + cal.addTxt + ', ' + v.imp.rows[1].addTxt + ')');
  expect(/^Fits: [\d,]+ cal left after this$/.test(v.imp.head) && /^Up to [\d.]+ servings? fits your calories/.test(v.imp.tip), 'says it fits and how much would fit (' + v.imp.tip + ')');
  await page.evaluate(() => document.querySelector('[aria-live="polite"]').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: SHOTS + '/preview-1.png' });
  // more servings: updates right away
  const k1 = v.sel.kcal;
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'More servings' }).click();
  await page.waitForTimeout(150); v = await get();
  expect(v.imp.rows[0].addTxt === '+' + v.sel.kcal && v.sel.kcal > k1, 'tapping + updates the preview (' + v.imp.rows[0].addTxt + ')');
  // weighing a big portion: typing (no blur) updates it, and it can go over
  await page.locator('#selg').pressSequentially('900'); await page.waitForTimeout(150);
  v = await get();
  console.log(v.imp.head, '|', v.imp.tip, '|', v.imp.rows[0].status);
  expect(/^Puts you [\d,]+ cal over for the day$/.test(v.imp.head) && v.imp.rows[0].over && / over$/.test(v.imp.rows[0].status), 'a big weighed portion shows it goes over (' + v.imp.head + ')');
  expect(/^Up to \d+ g fits your calories/.test(v.imp.tip), 'weighed: says how many grams fit (' + v.imp.tip + ')');
  const gFit = +v.imp.tip.match(/\d+/)[0];
  await page.fill('#selg', String(gFit)); await page.waitForTimeout(150); v = await get();
  expect(/^Fits: /.test(v.imp.head), 'weighing exactly that amount fits (' + v.imp.head + ')');
  await page.fill('#selg', '900'); await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('[aria-live="polite"]').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: SHOTS + '/preview-over.png' });
  // protein row says goal hit when it gets there
  const pr = v.imp.rows[1];
  expect(/g to go$|^goal hit$/.test(pr.status), 'protein shows what is left to go or goal hit (' + pr.status + ')');
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
