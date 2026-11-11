// Recipe photos: every recipe idea shows a real photo (cards, saved rows, recipe page with credit),
// and your own recipes can get a photo from the camera or gallery.
const { chromium } = require('playwright');
const path = require('path');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const SHOTS = process.env.SHOTS || 'test-shots'; require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const bad = []; page.on('response', (r) => { if (/\/photos\//.test(r.url()) && !r.ok()) bad.push(r.url()); });
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'tabs', tab: 'plan', goals: ['lose'], units: 'imperial', weight: '180', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', saved: ['i3', 'i7'] }));
  await page.waitForTimeout(800);
  const loaded = async () => page.evaluate(() => [...document.querySelectorAll('img[src*="photos/"]')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
  await page.evaluate(() => Promise.all([...document.querySelectorAll('img[src*="photos/"]')].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  let imgs = await loaded();
  expect(imgs.length >= 8 && imgs.every((i) => i.ok), 'Plan shows photos on idea cards and saved rows (' + imgs.length + ' images, ' + imgs.filter((i) => !i.ok).length + ' broken)');
  await page.screenshot({ path: SHOTS + '/plan-photos.png' });
  await page.locator('#nm').evaluate((el) => el.scrollTo(0, 420)).catch(() => {});
  await page.screenshot({ path: SHOTS + '/plan-saved.png' });
  // every idea has a photo file and a credit
  const ideas = await page.evaluate(() => DC.comp.ideas.map((r) => ({ id: r.id, photo: r.photo, credit: r.credit })));
  expect(ideas.length === 10 && ideas.every((r) => r.photo && /CC|Public/.test(r.credit)), 'all 10 ideas have a photo and a licence credit');
  // recipe page: big photo + credit link
  await page.evaluate(() => DC.comp.setState({ view: 'recipe', recipeId: 'i8', recipeBack: 'tabs' })); await page.waitForTimeout(400);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('img[src*="photos/"]')].map((i) => i.decode().catch(() => {}))));
  const hero = await page.evaluate(() => { const i = document.querySelector('img[src="photos/i8.jpg"]'); const a = [...document.querySelectorAll('a')].find((x) => /Wikimedia/.test(x.textContent)); return { img: !!i && i.naturalWidth > 0, h: i ? i.getBoundingClientRect().height : 0, credit: a ? a.textContent : '', href: a ? a.href : '' }; });
  expect(hero.img && hero.h >= 250, 'recipe page has the full-width photo (' + hero.h + ' px tall)');
  expect(/Prayitno · CC BY 2\.0/.test(hero.credit) && /commons\.wikimedia\.org\/wiki\/File:/.test(hero.href), 'recipe page credits the photographer and links the file page');
  await page.screenshot({ path: SHOTS + '/recipe-photo.png' });
  // browse screen
  await page.evaluate(() => DC.comp.setState({ view: 'browse', browseCat: null, savedOnly: false })); await page.waitForTimeout(400);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('img[src*="photos/"]')].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
  imgs = await loaded();
  expect(imgs.length >= 10 && imgs.every((i) => i.ok), 'Recipes browser shows photos (' + imgs.length + ')');
  await page.screenshot({ path: SHOTS + '/browse-photos.png' });
  // your own recipe: add a photo in the builder, it shows on the recipe page and in My created recipes
  await page.evaluate(() => DC.comp.setState({ view: 'builder', builderBack: 'tabs', builder: { name: 'Mom chili', source: '', serves: 4, lines: [{ food: { name: 'Beans', serving: '1 cup', kcal: 220, p: 14, c: 40, f: 1 }, m: 2, custom: true }], dir: '', picking: false, q: '' } }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '/builder-nophoto.png' });
  await page.locator('input[type=file]').first().setInputFiles(path.join(__dirname, 'fixtures', 'pizza.jpg'));
  await page.waitForFunction(() => DC.comp.state.builder && DC.comp.state.builder.photo, null, { timeout: 5000 }).catch(() => {});
  const ph = await page.evaluate(() => (DC.comp.state.builder.photo || '').length);
  expect(ph > 1000 && ph < 45000, 'builder photo is shrunk to a small JPEG (' + Math.round(ph / 1024) + ' KB as text)');
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + '/builder-photo.png' });
  await page.getByRole('button', { name: /Save recipe/i }).click().catch(async () => { await page.evaluate(() => DC.comp.renderVals().b.save()); });
  await page.waitForTimeout(400);
  const mine = await page.evaluate(() => { const r = DC.comp.state.userRecipes[0]; return { photo: !!(r && r.photo), view: DC.comp.state.view, hero: !!document.querySelector('img[alt="Mom chili"]') }; });
  expect(mine.photo && mine.view === 'recipe' && mine.hero, 'saved recipe keeps its photo and shows it on its page');
  await page.screenshot({ path: SHOTS + '/my-recipe-photo.png' });
  await page.evaluate(() => DC.comp.setState({ view: 'tabs', tab: 'plan' })); await page.waitForTimeout(300);
  const row = await page.evaluate(() => { const i = [...document.querySelectorAll('img')].find((x) => x.src.startsWith('data:image/jpeg')); const t = [...document.querySelectorAll('.fname')].some((x) => /Mom chili/.test(x.textContent)); return !!i && t; });
  expect(row, 'My created recipes row shows its name and photo');
  await page.locator('text=My created recipes').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOTS + '/my-recipes-row.png' });
  expect(!bad.length, 'no photo failed to load ' + bad.join(' '));
  expect(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close();
  if (fails.length) { console.log(fails.length + ' FAILED'); process.exit(1); }
  console.log('all passed');
})();
