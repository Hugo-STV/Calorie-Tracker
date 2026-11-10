// Label scan: photo of a nutrition panel → values read on the phone → Create a food filled in.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } };
const SHOTS = process.env.SHOTS || 'test-shots'; fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'log' })); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Meal scan/ }).first().click();
  await page.getByRole('tab', { name: 'Nutrition label' }).click();
  expect(!(await page.locator('text=Try a sample').count()), 'no sample photos in the app');
  // Take photo uses the live camera in the frame, not the gallery
  await page.waitForFunction(() => { const v = document.getElementById('msvid'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
  expect(await page.evaluate(() => { const v = document.getElementById('msvid'); return !!(v && v.srcObject && v.videoWidth > 0); }), 'live camera shows in the frame');
  let opened = false; const onChooser = () => { opened = true; }; page.on('filechooser', onChooser);
  await page.getByRole('button', { name: 'Take photo' }).click(); await page.waitForTimeout(1500);
  expect(!opened, 'Take photo does not open the gallery');
  await page.waitForFunction(() => DC.comp.state.msStep !== 'busy', null, { timeout: 60000 });
  page.off('filechooser', onChooser);
  await page.evaluate(() => DC.comp.setState({ msStep: 'camera', toast: null }));
  // a saved picture goes through Choose from gallery
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from gallery' }).click();
  await (await chooser).setFiles(path.join(__dirname, 'fixtures', 'label-ca.jpg'));
  await page.waitForSelector('text=Review and save', { timeout: 60000 });
  expect(await page.evaluate(() => !DC.comp.mealStream), 'camera stops after the photo');
  await page.screenshot({ path: SHOTS + '/label-result.png' });
  await page.getByRole('button', { name: 'Review and save' }).click(); await page.waitForTimeout(300);
  const form = await page.evaluate(() => DC.comp.state.form);
  console.log('form', JSON.stringify(form));
  for (const [k, v] of Object.entries({ kcal: '190', f: '9', sat: '4.5', c: '25', sug: '12', fib: '2', p: '3', na: '140', grams: '40' })) expect(form[k] === v, 'label ' + k + ' = ' + v + ' (got ' + form[k] + ')');
  expect(/cookie/.test(form.serving), 'serving read as 1 cookie');
  expect(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); if (fails.length) process.exit(1); console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); process.exit(1); });
