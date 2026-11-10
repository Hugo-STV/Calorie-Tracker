// Sync safety: reinstalling and signing in must never lose or overwrite data.
// Uses an in-memory copy of Firestore with slow responses, like a phone on mobile data.
const { chromium } = require('playwright');
const fails = []; const expect = (ok, what) => { if (!ok) { fails.push(what); console.log('FAIL:', what); } else console.log('ok:', what); };
const docs = {}; // path -> { fields, updateTime }
const now = () => new Date().toISOString();
async function mock(page, slow) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://identitytoolkit.googleapis.com/**', (r) => r.fulfill({ json: { localId: 'uid1', email: 'hugo@example.com', idToken: 'tok', refreshToken: 'ref', expiresIn: '3600' } }));
  await page.route('https://securetoken.googleapis.com/**', (r) => r.fulfill({ json: { user_id: 'uid1', id_token: 'tok', refresh_token: 'ref', expires_in: '3600' } }));
  await page.route('https://firestore.googleapis.com/**', async (route) => {
    const r = route.request(), url = r.url(), path = decodeURIComponent(url.split('/documents/')[1].split('?')[0]);
    if (slow) await new Promise((ok) => setTimeout(ok, slow));
    if (r.method() === 'PATCH') { const body = JSON.parse(r.postData()); docs[path] = { fields: body.fields, updateTime: now() }; return route.fulfill({ json: { name: 'x/' + path, fields: body.fields } }); }
    if (r.method() === 'POST' && /:runQuery$/.test(path)) {
      const coll = path.replace(/:runQuery$/, ''), q = JSON.parse(r.postData()).structuredQuery, cid = q.from[0].collectionId, since = +q.where.fieldFilter.value.integerValue;
      const out = Object.entries(docs).filter(([p, d]) => p.startsWith(coll + '/' + cid + '/') && +(d.fields.updatedAt || {}).integerValue > since).map(([p, d]) => ({ document: { name: 'x/' + p, fields: d.fields } }));
      return route.fulfill({ json: out.length ? out : [{ readTime: now() }] });
    }
    if (r.method() === 'GET') {
      if (docs[path]) return route.fulfill({ json: { name: 'x/' + path, fields: docs[path].fields } });
      const kids = Object.entries(docs).filter(([p]) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'));
      if (kids.length) return route.fulfill({ json: { documents: kids.map(([p, d]) => ({ name: 'x/' + p, fields: d.fields })) } });
      return route.fulfill({ status: 404, json: { error: { code: 404 } } });
    }
    return route.fulfill({ json: {} });
  });
}
const food = (id, name, kcal) => ({ id, name, kcal, p: 10, c: 10, f: 5, serving: '1 serving' });
const profileLog = () => { const d = docs['users/uid1/fuel/profile']; if (!d) return null; const st = JSON.parse(d.fields.json.stringValue).state; return Object.values(st.log).flat().map((e) => e.food.name); };
const appLog = (page) => page.evaluate(() => Object.values(DC.comp.state.log).flat().map((e) => e.food.name));
async function fresh(b, slow) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); await mock(page, slow);
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.errs = errs;
  await page.goto('http://localhost:8765/'); await page.waitForSelector('#nm'); return page;
}
async function signIn(page) {
  await page.evaluate(() => { DC.comp.setState({ acctMode: 'signin', email: 'hugo@example.com', pw: 'secret123', acctFrom: 'onb' }); });
  // some taps while signing in, like a person does (these used to save an empty copy)
  const p = page.evaluate(() => DC.comp.doAuth());
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(250); await page.evaluate((i) => DC.comp.setState({ name: 'tap' + i }), i); }
  await p; await page.waitForTimeout(4500); // let pushes run
}
(async () => {
  const b = await chromium.launch();
  // 1) first install: log food and a weight, sync
  const A = await fresh(b, 0);
  await A.evaluate(() => DC.comp.setState({ mode: 'app', view: 'tabs', goals: ['lose'], weight: '180', units: 'imperial', ft: '5', inch: '11', age: '30', sex: 'male', activity: 'light' }));
  await signIn(A);
  await A.evaluate((f) => { DC.comp.logFood(f[0], 1, 'breakfast'); DC.comp.logFood(f[1], 2, 'lunch'); DC.comp.setState({ weights: [{ val: 180, unit: 'lb', at: new Date() }] }); }, [food('x1', 'Oatmeal', 300), food('x2', 'Chicken bowl', 550)]);
  await A.waitForTimeout(5000);
  expect(JSON.stringify(profileLog()) === JSON.stringify(['Oatmeal', 'Chicken bowl']), 'account has the food after the first install syncs');
  expect(Object.keys(docs).some((p) => /fuelDays\/\d{4}-\d\d-\d\d$/.test(p) && JSON.parse(docs[p].fields.json.stringValue).live), "today's food is also saved as its own day record");
  // 2) reinstall: fresh phone storage, slow network, sign in
  const B = await fresh(b, 1200);
  await signIn(B);
  expect(JSON.stringify(await appLog(B)) === JSON.stringify(['Oatmeal', 'Chicken bowl']), 'after reinstall + sign-in the food is back (' + JSON.stringify(await appLog(B)) + ')');
  expect(JSON.stringify(profileLog()) === JSON.stringify(['Oatmeal', 'Chicken bowl']), 'the account was not overwritten with an empty copy');
  expect((await B.evaluate(() => DC.comp.state.weights.length)) === 1, 'weigh-in restored');
  // 3) delete on one phone, the other doesn't bring it back
  await B.evaluate(() => { const S = DC.comp.state, e = S.log.lunch[0]; DC.comp.setState({ log: Object.assign({}, S.log, { lunch: [] }), logDel: (S.logDel || []).concat([e.id]) }); });
  await B.waitForTimeout(6000);
  await A.evaluate(() => DC.comp.pull()); await A.waitForTimeout(1500);
  expect(JSON.stringify(await appLog(A)) === JSON.stringify(['Oatmeal']), 'a deleted item stays deleted on the other phone (' + JSON.stringify(await appLog(A)) + ')');
  // 4) main saved copy missing: today's day record brings the food back
  delete docs['users/uid1/fuel/profile'];
  const C = await fresh(b, 300);
  await signIn(C);
  expect(JSON.stringify(await appLog(C)) === JSON.stringify(['Oatmeal']), "today's food restored from its day record when the main copy is missing (" + JSON.stringify(await appLog(C)) + ')');
  for (const p of [A, B, C]) expect(!p.errs.length, 'no page errors ' + p.errs.join(' | '));
  await b.close(); if (fails.length) { console.log(fails.length + ' failed'); process.exit(1); } console.log('all checks passed');
})().catch((e) => { console.error('TEST FAILED', String(e).slice(0, 400)); process.exit(1); });
