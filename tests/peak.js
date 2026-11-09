const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } };
const SHOT = (process.env.SHOTS || 'test-shots') + '/';
require('fs').mkdirSync(SHOT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['camera'] });
  const page = await ctx.newPage(); await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errors = global.__errs = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const calls = [];
  await page.route('https://world.openfoodfacts.org/**', async (route) => {
    const u = route.request().url(); calls.push('OFF ' + u.split('?')[0]);
    if (u.includes('/api/v2/product/3017624010701')) return route.fulfill({ json: { status: 1, product: { code: '3017624010701', product_name: 'Hazelnut cocoa spread', brands: 'TestBrand', serving_size: '15 g', serving_quantity: 15, product_quantity: 400,
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, 'saturated-fat_100g': 10.6, sugars_100g: 56.3, fiber_100g: 0, salt_100g: 0.107 },
      additives_tags: ['en:e322', 'en:e322i'], nova_group: 4, labels_tags: [], categories_tags: ['en:spreads', 'en:sweet-spreads', 'en:cocoa-and-hazelnuts-spreads'], image_front_small_url: '' } } });
    if (u.includes('/api/v2/product/3288130120417')) return route.fulfill({ json: { status: 1, product: { code: '3288130120417', product_name: 'Pomme banane fraise', brands: 'Vitabio', serving_size: '90 g', serving_quantity: 90, nutriscore_grade: 'a', nutriscore_score: -3,
      nutriments: { 'energy-kcal_100g': 66, proteins_100g: 0.5, carbohydrates_100g: 14.6, fat_100g: 0.3, 'saturated-fat_100g': 0.1, sugars_100g: 12.1, fiber_100g: 1.9, salt_100g: 0.01, 'fruits-vegetables-legumes-estimate-from-ingredients_100g': 100 },
      additives_tags: [], nova_group: 1, labels_tags: ['en:organic'], categories_tags: ['en:fruits-based-foods', 'en:compotes'], image_front_small_url: '' } } });
    if (u.includes('/api/v2/product/0884282110233')) return route.fulfill({ json: { status: 1, product: { code: '0884282110233', product_name: 'Butter Cookies', brands: 'Bonn', serving_size: '4 cookies (30 g)', nutrition_data_per: 'serving',
      nutriments: { 'energy-kcal_serving': 150, proteins_serving: 2, carbohydrates_serving: 19, fat_serving: 7, sugars_serving: 7 }, categories_tags: [], image_front_small_url: '' } } });
    if (u.includes('/api/v2/product/')) return route.fulfill({ status: 404, json: { status: 0 } });
    if (u.includes('/cgi/search.pl')) return route.fulfill({ json: { products: [{ code: '0123456789012', product_name: 'Protein bar test', brands: 'Bars Inc', nutriments: { 'energy-kcal_100g': 360, proteins_100g: 33, carbohydrates_100g: 40, fat_100g: 12, 'saturated-fat_100g': 6, sugars_100g: 3, fiber_100g: 10, sodium_100g: 0.3 }, serving_quantity: 60, serving_size: '1 bar (60 g)', categories_tags: ['en:snacks', 'en:protein-bars'] }] } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route('https://identitytoolkit.googleapis.com/**', (route) => { calls.push('AUTH ' + route.request().url().split('?')[0].split(':').pop()); return route.fulfill({ json: { localId: 'uid123', email: 'hugo@example.com', idToken: 'tok', refreshToken: 'ref', expiresIn: '3600' } }); });
  const now = Date.now(), T0 = new Date(); T0.setHours(7, 10, 0, 0); const t0 = T0.getTime();
  const PW = [
    { id: 'a1', name: 'Push day', start: t0, end: t0 + 58 * 60000, exercises: [{ exId: 'Barbell_Bench_Press', sets: [{ type: 'W', w: 40, r: 8 }, { type: 'N', w: 80, r: 8 }, { type: 'N', w: 80, r: 8 }, { type: 'N', w: 80, r: 7 }, { type: 'N', w: 80, r: 6 }] }, { exId: 'Overhead_Press', sets: Array(9).fill({ type: 'N', w: 45, r: 8 }) }, { exId: 'Lateral_Raise', sets: Array(4).fill({ type: 'N', w: 10, r: 15 }) }] },
    { id: 'a2', name: 'Easy run', start: t0 - 864e5, end: t0 - 864e5, quick: true, exercises: [{ exId: 'Outdoor_Run', sets: [{ type: 'N', d: 5, t: 1800 }] }] },
    { id: 'old', name: 'Old', start: now - 60 * 864e5, end: now - 60 * 864e5 + 3600000, exercises: [] }];
  await page.route('https://firestore.googleapis.com/**', (route) => { const r = route.request();
    if (/\/users\/uid123\/w(\?|$)/.test(r.url())) { calls.push('FS GET users/uid123/w'); return route.fulfill({ json: { documents: PW.map((w) => ({ name: 'x/users/uid123/w/' + w.id, fields: { j: { stringValue: JSON.stringify(w) }, del: { booleanValue: false } } })).concat([{ name: 'x/w/gone', fields: { del: { booleanValue: true } } }]) } }); } calls.push('FS ' + r.method() + ' ' + r.url().split('/documents/')[1].split('?')[0]); if (r.method() === 'GET') return route.fulfill(r.url().includes('fuelDays') ? { json: {} } : { status: 404, json: {} }); return route.fulfill({ json: {} }); });
  const T = (s) => page.getByText(s, { exact: false });
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('#nm', { timeout: 8000 });
  await page.screenshot({ path: SHOT + '01-welcome.png' });
  await page.fill('#nm', 'Hugo'); await T('Next').last().click();
  await T('Lose fat').first().click(); await T('Next').last().click();
  await T('Nothing in particular').click(); await T('Next').last().click();
  await T('Lightly active').click(); await T('Next').last().click();
  await page.getByRole('button', { name: 'Male', exact: true }).click(); await page.fill('#age', '30'); await page.getByRole('button', { name: 'Canada' }).click(); await T('Next').last().click();
  await page.fill('input[aria-label="Feet"]', '5'); await page.fill('input[aria-label="Inches"]', '11'); await page.fill('#wt', '185'); await T('Next').last().click();
  await T('Next').last().click(); // pace
  await T('Next').last().click(); // macros
  await page.screenshot({ path: SHOT + '02-account.png' });
  await page.fill('#em', 'hugo@example.com'); await page.fill('#pw', 'supersecret1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('text=Daily calorie target', { timeout: 8000 });
  console.log('plan step:', (await page.locator('text=Maintenance (').first().innerText()));
  await page.screenshot({ path: SHOT + '03-plan.png' });
  await T('Start tracking').click();
  await page.waitForSelector('text=Today');

  await page.waitForTimeout(1500);
  const shot = (n) => page.screenshot({ path: SHOT + n, deviceScaleFactor: 2 });
  console.log('exercise card:', JSON.stringify(await page.evaluate(() => { const v = DC.comp.renderVals(); return { line: v.exTodayLine, rows: v.exToday.map((x) => [x.name, x.detail, x.kcal, x.peak]), budgetEx: DC.comp.exToday(DC.comp.state), raw: (DC.comp.state.peakRaw || []).map((w) => w.id) }; })));
  expect(await page.evaluate(() => DC.comp.exToday(DC.comp.state)) === 325, 'Peak push day counts 325 kcal today');
  await page.locator('text=PEAK').first().scrollIntoViewIfNeeded(); await shot('30-today-peak.png');
  await page.getByText('Push day').first().click(); await page.waitForSelector('text=Peak workouts');
  await page.getByRole('button', { name: /Push day/ }).click(); await page.waitForTimeout(200); await shot('31-peak.png');
  console.log('peak screen:', JSON.stringify(await page.evaluate(() => { const v = DC.comp.renderVals().pk; return { status: v.status, today: v.todayCounted, line: v.todayLine, groups: v.groups.map((g) => [g.label, g.items.map((i) => [i.name, i.meta, i.kcal])]), parts: v.groups[0].items[0].parts.map((p) => p.l + ' = ' + p.v) }; })));
  await page.getByRole('button', { name: '75%' }).click(); await page.waitForTimeout(150);
  console.log('75%:', await page.evaluate(() => [DC.comp.renderVals().pk.todayCounted, DC.comp.exToday(DC.comp.state)]));
  expect((await page.evaluate(() => DC.comp.exToday(DC.comp.state))) === 245, '75% eat-back');
  await page.getByRole('switch', { name: /Count this workout/ }).click(); await page.waitForTimeout(150);
  expect((await page.evaluate(() => DC.comp.exToday(DC.comp.state))) === 0, 'skipped workout not counted');
  console.log('skipped:', await page.evaluate(() => [DC.comp.renderVals().pk.todayCounted, DC.comp.exToday(DC.comp.state)]));
  await page.getByRole('button', { name: 'Check for new workouts' }).click(); await page.waitForTimeout(600);
  console.log('toast:', await page.evaluate(() => DC.comp.state.toast));
  await page.evaluate(() => DC.comp.setState({ peakSkip: [] }));
  await page.getByRole('button', { name: 'Back' }).first().click(); await page.waitForTimeout(200);
  console.log('back to:', await page.evaluate(() => DC.comp.state.view));
  // rollover keeps Peak calories in yesterday's summary
  await page.waitForTimeout(4000);
  const k = await page.evaluate(() => Object.keys(localStorage).find((x) => x.startsWith('fuel:state:')));
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); const y = new Date(); y.setDate(y.getDate() - 1); s.state.logDay = y.toDateString(); localStorage.setItem(k, JSON.stringify(s)); }, k);
  await page.reload(); await page.waitForSelector('text=Today'); await page.waitForTimeout(800);
  const after2 = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return Object.entries(s.state.days).map(([d, v]) => d + ' ex=' + v.ex); }, k);
  console.log('yesterday summary ex:', await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return Object.entries(s.state.days).map(([d, v]) => d + ' ex=' + v.ex); }, k));
  expect(after2 && after2.some((x) => / ex=300$/.test(x)), 'yesterday keeps the Peak run (75% of 400)');
  console.log('calls:', JSON.stringify([...new Set(calls)]));
  expect(!errors.filter((e) => !/fonts\.g|net::ERR|Failed to load resource/.test(e)).length, 'no page errors');
  console.log('errors:', JSON.stringify(errors.filter((e) => !/fonts\.g|net::ERR|Failed to load resource/.test(e)), null, 1));
  await browser.close();
  if (fails.length) { console.log(fails.length + ' check(s) failed'); process.exit(1); } console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 400)); console.log('errors so far:', JSON.stringify(global.__errs || [], null, 1).slice(0, 2000)); process.exit(1); });
