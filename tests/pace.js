// Onboarding pace step: a recommendation from the person's numbers, always reachable, with other paces still offered.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('#nm');
  const at = async (st) => { await page.evaluate((st) => DC.comp.setState(Object.assign({ step: 6, goals: ['lose'], units: 'imperial', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light', paceSet: false, goalWeight: '' }, st)), st); await page.waitForTimeout(150);
    return page.evaluate(() => { const p = DC.comp.renderVals().pz; return { rec: p.recLabel, cal: p.cal, rate: p.rate, warn: p.warnText, paces: p.paces.map((x) => x.label), recOn: p.recOn }; }); };
  let v = await at({ weight: '185', goalWeight: '175' });
  expect(v.rec === '1 lb a week' && v.cal === '2,010' && v.rate === '−1 lb/wk' && v.recOn, '185 lb → 1 lb a week preselected (' + JSON.stringify(v) + ')');
  expect(['0.5 lb a week', '1 lb a week', '1.5 lb a week', '2 lb a week'].every((l) => v.paces.includes(l)), 'gentler and harder paces still offered');
  v = await at({ weight: '260', goalWeight: '200' });
  expect(v.rec === '1.75 lb a week' && !v.warn, 'heavy profile: recommendation stays within the safety limit (' + v.rec + ')');
  expect(v.paces.includes('1.75 lb a week'), 'a non-standard recommendation is added to the list');
  v = await at({ weight: '165', goalWeight: '160' });
  expect(v.rec === '0.75 lb a week', 'lean and close to goal → slower (' + v.rec + ')');
  // picking another pace keeps it
  await at({ weight: '185', goalWeight: '175' });
  await page.getByRole('button', { name: /^2 lb a week/ }).click(); await page.waitForTimeout(150);
  v = await page.evaluate(() => { const p = DC.comp.renderVals().pz; return { rate: p.rate, warn: p.warnText, recOn: p.recOn }; });
  expect(!v.recOn && /1.5/.test(v.rate) && /safe limit/.test(v.warn), '2 lb picked: capped at about 1.5 lb with a warning');
  await page.getByRole('button', { name: 'Use this pace' }).click(); await page.waitForTimeout(150);
  expect(await page.evaluate(() => DC.comp.renderVals().pz.recOn), 'Use this pace goes back to the recommendation');
  expect(!errs.length, 'no page errors: ' + errs.join(' | '));
  await b.close(); if (fails.length) process.exit(1); console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 300)); process.exit(1); });
