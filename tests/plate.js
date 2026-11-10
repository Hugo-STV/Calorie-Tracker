// Plate scan: photo of a dish → top guesses from the on-phone recognizer → database foods to log.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } };
const SHOTS = process.env.SHOTS || 'test-shots'; fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  await page.waitForFunction(() => DC.comp.state.dbReady, null, { timeout: 20000 });
  await page.evaluate(() => DC.comp.setState({ mode: 'app', view: 'log' })); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Meal scan/ }).first().click();
  // before any photo: camera and buttons, no guesses on screen
  await page.waitForTimeout(800);
  expect(!(await page.locator('text=Best guesses').isVisible()), 'no guesses before a photo is taken');
  expect(await page.getByRole('button', { name: 'Take photo' }).isVisible(), 'Take photo is visible');
  expect(await page.getByRole('button', { name: 'Choose from gallery' }).isVisible(), 'Choose from gallery is visible');
  await page.getByRole('tab', { name: 'Nutrition label' }).click(); await page.waitForTimeout(200);
  expect(!(await page.locator('text=Review and save').isVisible()), 'no label values before a photo is taken');
  await page.getByRole('tab', { name: 'Plate' }).click(); await page.waitForTimeout(200);
  for (const [file, want] of [['pad-thai.jpg', /pad thai/i], ['hamburger.jpg', /burger/i], ['pizza.jpg', /pizza/i]]) {
    await page.evaluate(() => DC.comp.setState({ msMode: 'plate', msStep: 'camera' })); await page.waitForTimeout(200);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose from gallery' }).click();
    await (await chooser).setFiles(path.join(__dirname, 'fixtures', file));
    await page.waitForFunction(() => DC.comp.state.msStep === 'result', null, { timeout: 90000 }); await page.waitForTimeout(300);
    const v = await page.evaluate(() => DC.comp.renderVals().mz);
    const top = v.matches.map((m) => m.name + ' ' + m.pct);
    console.log(file, '→', top.join(' | '), '| log as:', JSON.stringify(v.matches[0].foods.map((f) => f.name)));
    expect(want.test(v.matches[0].name), file + ' top guess matches (got ' + v.matches[0].name + ')');
    expect(v.matches[0].foods.length > 0, file + ' offers database foods for the top guess');
    expect(!!v.photo, file + ' shows the photo');
    expect(await page.locator('text=Best guesses').isVisible() && !(await page.getByRole('button', { name: 'Take photo' }).isVisible()), file + ' guesses replace the camera');
    if (file === 'pizza.jpg') expect(v.matches[0].foods.some((f) => /pizza/i.test(f.name)), 'pizza guess offers pizza, not pepperoni sausage');
    if (file === 'pad-thai.jpg') await page.screenshot({ path: SHOTS + '/plate-result.png' });
  }
  // logging the top food opens the food sheet
  await page.evaluate(() => DC.comp.renderVals().mz.matches[0].foods[0].open()); await page.waitForTimeout(200);
  expect(await page.evaluate(() => DC.comp.state.sheet === 'food' && !!DC.comp.state.sel), 'tapping a food opens it to set the amount');
  expect(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); if (fails.length) process.exit(1); console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); process.exit(1); });
