// Label scan: photo of a nutrition panel → values read on the phone → Create a food filled in.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } };
const SHOTS = process.env.SHOTS || 'test-shots'; fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'log' })); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Meal scan/ }).first().click();
  await page.getByRole('tab', { name: 'Nutrition label' }).click();
  expect(!(await page.locator('text=Try a sample').count()), 'no sample photos in the app');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo' }).click();
  await (await chooser).setFiles(path.join(__dirname, 'fixtures', 'label-ca.jpg'));
  await page.waitForSelector('text=Review and save', { timeout: 60000 });
  await page.screenshot({ path: SHOTS + '/label-result.png' });
  await page.getByRole('button', { name: 'Review and save' }).click(); await page.waitForTimeout(300);
  const form = await page.evaluate(() => DC.comp.state.form);
  console.log('form', JSON.stringify(form));
  for (const [k, v] of Object.entries({ kcal: '190', f: '9', sat: '4.5', c: '25', sug: '12', fib: '2', p: '3', na: '140', grams: '40' })) expect(form[k] === v, 'label ' + k + ' = ' + v + ' (got ' + form[k] + ')');
  expect(/cookie/.test(form.serving), 'serving read as 1 cookie');
  // plate mode says it's coming rather than guessing
  await page.keyboard.press('Escape'); await page.evaluate(() => DC.comp.setState({ sheet: null, form: null, view: 'mealscan', msMode: 'plate', msStep: 'camera' })); await page.waitForTimeout(200);
  await page.evaluate(() => DC.comp.mealPhoto('plate', new Blob())); await page.waitForTimeout(200);
  expect(/coming in the next update/.test(await page.evaluate(() => DC.comp.state.toast || '')), 'plate mode explains it is coming');
  expect(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); if (fails.length) process.exit(1); console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); process.exit(1); });
