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
  await page.route('https://firestore.googleapis.com/**', (route) => { const r = route.request(); calls.push('FS ' + r.method() + ' ' + r.url().split('/documents/')[1].split('?')[0]); if (r.method() === 'GET') return route.fulfill(r.url().includes('fuelDays') ? { json: {} } : { status: 404, json: {} }); return route.fulfill({ json: {} }); });
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
  // search the database
  await page.getByRole('button', { name: 'Add' }).last().click();
  await T('Log food').click();
  await page.fill('input[aria-label="Search food"]', 'chicken breast');
  await page.waitForSelector('text=/offline foods/', { timeout: 8000 });
  const countLine = await page.locator('text=/offline foods/').innerText(); console.log('count:', countLine); expect(/matches in [\d,]+ offline foods/.test(countLine), 'offline search count');
  await page.locator('.fitem .plus').first().click();
  await page.screenshot({ path: SHOT + '04-search.png' });
  // packaged products
  await page.fill('input[aria-label="Search food"]', 'protein bar');
  await page.waitForSelector('text=from Open Food Facts', { timeout: 8000 });
  console.log('off (auto):', await page.locator('text=from Open Food Facts').innerText(), '| count line:', await page.locator('text=/offline foods/').first().innerText().catch(() => '-'));
  await page.screenshot({ path: SHOT + '05-off-search.png' });
  // scanner: camera opens (fake), close it, type a code
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.getByRole('button', { name: 'Add' }).last().click();
  await T('Barcode scan').click();
  await page.waitForSelector('[aria-label="Barcode scanner"]', { timeout: 5000 });
  await page.waitForTimeout(1500);
  console.log('scanner status:', await page.locator('[aria-label="Barcode scanner"] [data-s]').innerText());
  await page.screenshot({ path: SHOT + '06-camera.png' });
  await page.locator('[data-k]').click();
  await page.fill('#bc', '3017624010701'); await page.getByRole('button', { name: 'Look up' }).click();
  await page.waitForSelector('text=Hazelnut cocoa spread', { timeout: 8000 });
  const sc1 = await page.locator('text=/\\d+\\/100/').first().innerText(); console.log('product score:', sc1); expect(+sc1.split('/')[0] < 50, 'hazelnut spread scores poorly');
  await page.screenshot({ path: SHOT + '07-product.png', fullPage: false });
  console.log('positives:', JSON.stringify(await page.locator('text=/protein$/i').allInnerTexts()));
  await page.getByRole('button', { name: 'Add to diary' }).click();
  await page.waitForTimeout(400); await page.screenshot({ path: SHOT + '07c-sheet.png' }); console.log('sheet state:', await page.evaluate(() => JSON.stringify({ sheet: DC.comp.state.sheet, sel: !!DC.comp.state.sel, view: DC.comp.state.view })));
  await page.getByRole('button', { name: /^Add to (breakfast|lunch|dinner|snacks)$/ }).click();
  await page.waitForTimeout(300);
  console.log('additives:', JSON.stringify(await page.locator('text=/^E\\d+/').allInnerTexts()));
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.waitForSelector('[aria-label="Barcode scanner"]', { timeout: 5000 }); console.log('back from product reopens camera: ok');
  await page.locator('[data-c]').click();
  await page.waitForTimeout(500); console.log('state after cancel:', await page.evaluate(() => JSON.stringify({ v: DC.comp.state.view, prev: DC.comp.state.prevView, tab: DC.comp.state.tab, mode: DC.comp.state.mode, overlay: !!document.querySelector('[aria-label="Barcode scanner"]') }))); await page.screenshot({ path: SHOT + '07b-after-cancel.png' });
  await page.waitForSelector('text=Today', { timeout: 5000 }); console.log('cancel returns to Today: ok');
  // official Nutri-Score A and per-serving-only product
  const lookup = async (code, name) => { await page.getByRole('button', { name: 'Add' }).last().click(); await T('Barcode scan').click(); await page.waitForSelector('[aria-label="Barcode scanner"]'); await page.locator('[data-k]').click(); await page.fill('#bc', code); await page.getByRole('button', { name: 'Look up' }).click(); await page.waitForSelector('text=' + name, { timeout: 8000 }); };
  await lookup('3288130120417', 'Pomme banane fraise');
  console.log('vitabio:', await page.locator('text=/\\d+\\/100/').first().innerText(), JSON.stringify(await page.evaluate(() => { const t = document.body.innerText; return (t.match(/Nutri-Score[^\n]*\n?[^\n]*/g) || []).slice(0, 3); })));
  expect(await page.evaluate(() => /Nutri-Score\s*A/.test(document.body.innerText)), 'Vitabio uses official grade A');
  await page.screenshot({ path: SHOT + '11-vitabio.png' });
  await page.getByRole('button', { name: 'Back' }).first().click(); await page.locator('[data-c]').click(); await page.waitForTimeout(300);
  await lookup('0884282110233', 'Butter Cookies');
  await page.waitForSelector('text=Nutrition facts', { timeout: 5000 });
  console.log('cookies facts:', JSON.stringify((await page.locator('text=Nutrition facts').locator('xpath=../..').innerText()).split('\n').slice(0, 20)));
  await page.locator('text=Fill in missing values').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOT + '12-cookies.png' });
  await page.getByRole('button', { name: 'Fill in missing values' }).click(); await page.waitForTimeout(400);
  console.log('fix sheet:', await page.evaluate(() => JSON.stringify({ sheet: DC.comp.state.sheet, nf: DC.comp.state.nf })));
  await page.screenshot({ path: SHOT + '13-fix.png' });
  await page.getByRole('button', { name: /Close/ }).first().click().catch(() => {}); await page.reload(); await page.waitForSelector('text=Today');
  // unknown code
  await page.getByRole('button', { name: 'Add' }).last().click(); await T('Barcode scan').click();
  await page.waitForSelector('[aria-label="Barcode scanner"]'); await page.locator('[data-k]').click();
  await page.fill('#bc', '0000000000017'); await page.getByRole('button', { name: 'Look up' }).click();
  await page.waitForSelector('text=Not found', { timeout: 8000 }); console.log('unknown code -> not found card ok');
  await page.getByRole('button', { name: 'Back' }).first().click();
  await page.waitForTimeout(300);
  const eaten = await page.locator('text=/ \\d/').first().innerText().catch(() => '?');
  await page.screenshot({ path: SHOT + '08-today.png' });
  // persistence + rollover
  await page.waitForTimeout(4500);
  const st = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('fuel:state:')); const s = JSON.parse(localStorage.getItem(k)); return { k, n: Object.values(s.state.log).flat().length, logDay: s.state.logDay }; });
  console.log('saved:', JSON.stringify(st));
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); const y = new Date(); y.setDate(y.getDate() - 1); s.state.logDay = y.toDateString(); localStorage.setItem(k, JSON.stringify(s)); }, st.k);
  await page.reload(); await page.waitForSelector('text=Today');
  await page.waitForTimeout(800);
  const after = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return { n: Object.values(s.state.log).flat().length, days: Object.keys(s.state.days), y: Object.values(s.state.days)[0] && Object.values(s.state.days)[0].kcal }; }, st.k);
  console.log('after rollover:', JSON.stringify(after)); expect(after.n === 0 && after.days.length === 1 && after.y > 0, 'new day starts empty and yesterday is saved');
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.screenshot({ path: SHOT + '09-progress.png' });
  await page.getByRole('button', { name: 'More' }).click();
  await page.locator('text=Account and sync').scrollIntoViewIfNeeded();
  await page.screenshot({ path: SHOT + '10-more.png' });
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: /Export a backup/ }).click();
  const d = await dl; console.log('export download:', d ? d.suggestedFilename() : 'none'); expect(d && /^fuel-backup-/.test(d.suggestedFilename()), 'backup export');
  console.log('calls:', JSON.stringify([...new Set(calls)]));
  expect(!errors.filter((e) => !/fonts\.g|net::ERR|Failed to load resource/.test(e)).length, 'no page errors');
  console.log('errors:', JSON.stringify(errors.filter((e) => !/fonts\.g|net::ERR|Failed to load resource/.test(e)), null, 1));
  await browser.close();
  if (fails.length) { console.log(fails.length + ' check(s) failed'); process.exit(1); } console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); console.log('errors so far:', JSON.stringify(global.__errs || [], null, 1).slice(0, 3000)); process.exit(1); });
