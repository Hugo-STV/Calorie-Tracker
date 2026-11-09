/* Fuel production layer.
   Wraps the screen logic (Component, from the mockup) with what a real app needs:
   saved state, a new log every day, accounts + sync (Firebase, swappable), camera barcode
   scanning, Open Food Facts lookups, and backup export/import. Nothing here calls Claude. */
(function () {
  'use strict';

  // ---- cloud: one object, swap it to change providers ---------------------------------------
  // Shares Peak's Firebase project so one email/password works in both apps.
  // Data lives under users/{uid}/fuel/profile and users/{uid}/fuelDays/{yyyy-mm-dd}.
  const FB = { apiKey: 'AIzaSyCk3UOeS-w8HvhMDyZepAK5PsABTkWI39U', projectId: 'peak-c4dfb' };
  const FS = 'https://firestore.googleapis.com/v1/projects/' + FB.projectId + '/databases/(default)/documents';
  const FIREBASE = {
    name: 'Firebase',
    async auth(path, body) {
      const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:' + path + '?key=' + FB.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || 'AUTH_FAILED');
      return j;
    },
    async signUp(email, password) { const j = await this.auth('signUp', { email, password, returnSecureToken: true }); return this.session(j); },
    async signIn(email, password) { const j = await this.auth('signInWithPassword', { email, password, returnSecureToken: true }); return this.session(j); },
    async resetPassword(email) { await this.auth('sendOobCode', { requestType: 'PASSWORD_RESET', email }); },
    session(j) { return { uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 }; },
    async refresh(a) {
      const r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + FB.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refreshToken) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && j.error.message) || 'TOKEN_REFRESH_FAILED');
      return Object.assign({}, a, { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 });
    },
    url(a, path) { return FS + '/users/' + a.uid + '/' + path; },
    async get(a, path) {
      const r = await fetch(this.url(a, path), { headers: { Authorization: 'Bearer ' + a.idToken } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('GET ' + r.status);
      return this.unpack(await r.json());
    },
    async put(a, path, data) {
      const body = { fields: { json: { stringValue: JSON.stringify(data) }, updatedAt: { integerValue: String(Date.now()) } } };
      const r = await fetch(this.url(a, path), { method: 'PATCH', headers: { Authorization: 'Bearer ' + a.idToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('SAVE ' + r.status);
    },
    async list(a, coll) {
      const out = []; let token = '';
      do {
        const r = await fetch(this.url(a, coll) + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), { headers: { Authorization: 'Bearer ' + a.idToken } });
        if (!r.ok) throw new Error('LIST ' + r.status);
        const j = await r.json();
        (j.documents || []).forEach((d) => out.push(Object.assign({ id: d.name.split('/').pop() }, this.unpack(d))));
        token = j.nextPageToken || '';
      } while (token);
      return out;
    },
    unpack(d) {
      const f = d.fields || {};
      let data = null; try { data = JSON.parse(f.json ? f.json.stringValue : 'null'); } catch (e) { data = null; }
      return { data, updatedAt: f.updatedAt ? +f.updatedAt.integerValue : 0 };
    }
  };
  let CLOUD = FIREBASE;

  const AUTH_MSG = {
    EMAIL_EXISTS: 'That email already has an account (maybe from Peak). Sign in instead.',
    EMAIL_NOT_FOUND: 'No account with that email. Create one instead.',
    INVALID_PASSWORD: 'Wrong password.', INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    INVALID_EMAIL: 'That email address doesn\'t look right.', MISSING_PASSWORD: 'Enter a password.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a few minutes and try again.',
    USER_DISABLED: 'This account has been disabled.', OPERATION_NOT_ALLOWED: 'Email sign-in is turned off in Firebase.'
  };
  const authMsg = (e) => { const k = String(e && e.message || e).split(' ')[0].split(':')[0]; if (k.startsWith('WEAK_PASSWORD')) return 'Use at least 8 characters.'; return AUTH_MSG[k] || (navigator.onLine ? 'Something went wrong (' + k + ').' : 'You\'re offline. Connect and try again.'); };

  // ---- Open Food Facts -------------------------------------------------------------------
  const OFF = 'https://world.openfoodfacts.org';
  const OFF_FIELDS = 'code,nutriscore_grade,nutriscore_score,nutrition_data_per,product_name,generic_name,brands,nutriments,serving_size,serving_quantity,additives_tags,nova_group,labels_tags,categories_tags,image_front_small_url,product_quantity,quantity';
  const OFF_GROUPS = [
    [['en:breakfast-cereals'], 'Breakfast cereals'], [['en:cheeses', 'en:yogurts', 'en:dairies', 'en:eggs', 'en:milks'], 'Dairy & eggs'],
    [['en:beverages', 'en:waters', 'en:sodas', 'en:juices'], 'Drinks'], [['en:fats', 'en:vegetable-oils', 'en:butters', 'en:margarines'], 'Fats & oils'],
    [['en:sausages', 'en:hams', 'en:prepared-meats', 'en:bacons'], 'Sausages & deli meats'], [['en:poultries', 'en:chickens'], 'Poultry'],
    [['en:fishes', 'en:seafood', 'en:canned-fishes'], 'Fish & seafood'], [['en:meats'], 'Beef'], [['en:legumes', 'en:beans'], 'Beans & legumes'],
    [['en:nuts', 'en:seeds', 'en:nut-butters'], 'Nuts & seeds'], [['en:fresh-fruits', 'en:fruits', 'en:fruits-based-foods', 'en:compotes', 'en:fruit-purees', 'en:dried-fruits'], 'Fruit'], [['en:fresh-vegetables', 'en:vegetables', 'en:vegetables-based-foods'], 'Vegetables'],
    [['en:confectioneries', 'en:chocolates', 'en:candies', 'en:sweet-spreads'], 'Sweets'], [['en:biscuits-and-cakes', 'en:breads', 'en:pastries', 'en:viennoiseries'], 'Baked goods'],
    [['en:salty-snacks', 'en:chips-and-fries', 'en:crisps', 'en:snacks', 'en:protein-bars', 'en:bars'], 'Snacks'], [['en:pastas', 'en:rices', 'en:cereals-and-their-products'], 'Grains & pasta'],
    [['en:soups', 'en:sauces', 'en:condiments'], 'Soups & sauces'], [['en:meals', 'en:prepared-meals'], 'Meals & sides']
  ];
  const regionOf = (code) => { const c = String(code); if (c.length === 12 || /^0[0-9]/.test(c) || /^1[0-3]/.test(c)) return 'US/CA'; if (/^75[45]/.test(c)) return 'CA'; if (/^3[0-7]/.test(c)) return 'FR'; if (/^50/.test(c)) return 'UK'; if (/^93/.test(c)) return 'AU'; return 'Intl'; };

  // ---- persistence helpers ---------------------------------------------------------------
  const TRANSIENT = ['view', 'sheet', 'fab', 'toast', 'scanning', 'scanMissing', 'scanErr', 'query', 'sel', 'prod', 'form', 'exMenu', 'mealMenu', 'builder', 'rbuild', 'wPend', 'wIn', 'code',
    'prevView', 'prodPrev', 'targetPrev', 'waterPrev', 'wPrev', 'exPrev', 'builderBack', 'recipeBack', 'planView', 'browseCat', 'recipeId', 'nutriOpen', 'exSel', 'multi', 'multiSel', 'exQ', 'rtSel',
    'dbReady', 'dbFail', 'pw', 'demo', 'acctErr', 'acctBusy', 'acctInfo', 'offRes', 'offBusy', 'offErr', 'offQ', 'syncStatus', 'digOff', 'weekOff', 'servings', 'selUnit'];
  const persistable = (S) => { const o = {}; for (const k in S) if (!TRANSIENT.includes(k)) o[k] = S[k]; return o; };
  const revive = (o) => {
    if (o.weights) o.weights = o.weights.map((w) => Object.assign({}, w, { at: new Date(w.at) }));
    if (o.exLog) o.exLog = o.exLog.map((e) => Object.assign({}, e, { at: new Date(e.at) }));
    return o;
  };
  const isoOf = (dayKey) => { const d = new Date(dayKey); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const keyOfIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toDateString(); };
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  const FRESH = { mode: 'onb', step: 0, name: '', goals: [], barriers: [], activity: '', sex: '', age: '', country: '', units: 'imperial', ft: '', inch: '', cm: '', weight: '', goalWeight: '',
    pace: 0.5, surplus: 200, macro: 'high', email: '', agree: true, reminders: true, tab: 'today', view: 'tabs',
    log: { breakfast: [], lunch: [], dinner: [], snacks: [] }, history: [], myFoods: [], myMeals: [], water: 0, weights: [], exercise: 0, exLog: [], exCount: 0, steps: [],
    saved: [], userRecipes: [], myRoutines: [], override: null, days: {}, scanCache: {}, acctMode: 'create', acctFrom: 'onb' };

  class App extends Component { // Component: the screen logic from the mockup (global class)
    constructor(props) {
      super(props);
      this.DB_URL = '../foods-db.json';
      this.acct = ls.get('fuel:acct');
      this.loadLocal();
      this._lastView = this.state.view;
      this.syncing = false;
    }
    storeKey() { return 'fuel:state:' + (this.acct ? this.acct.uid : 'local'); }
    loadLocal() {
      const saved = ls.get(this.storeKey());
      const base = Object.assign({}, this.state);
      if (saved && saved.state) this.state = Object.assign(base, revive(saved.state), { view: 'tabs', sheet: null, fab: false, toast: '', demo: false, updatedAt: saved.updatedAt || 0 });
      else this.state = Object.assign(base, JSON.parse(JSON.stringify(FRESH)), { joined: new Date().toISOString(), logDay: new Date().toDateString(), email: this.acct ? this.acct.email : '', updatedAt: 0 });
      this._savedJson = null;
      this.rollover();
    }

    // every state change is saved locally, then synced
    setState(patch) { super.setState(patch); this.saveSoon(); }
    saveSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.saveNow(), 400); }
    saveNow() {
      const p = persistable(this.state); delete p.updatedAt;
      const json = JSON.stringify(p);
      if (json === this._savedJson) return;
      this._savedJson = json;
      this.state.updatedAt = Date.now();
      if (!ls.set(this.storeKey(), { state: p, updatedAt: this.state.updatedAt })) this.flash('Phone storage is full. Export a backup from More.');
      this.pushSoon();
    }

    // a new log every day; yesterday is kept as a compact summary
    rollover() {
      const S = this.state, today = new Date().toDateString();
      if (!S.logDay) { S.logDay = today; return; }
      if (S.logDay === today) return;
      const sum = this.daySummary(S);
      const days = Object.assign({}, S.days || {});
      if (sum.kcal > 0 || sum.ex > 0 || sum.water > 0) days[S.logDay] = sum;
      this.state = Object.assign({}, S, { days, logDay: today, log: { breakfast: [], lunch: [], dinner: [], snacks: [] }, water: 0, exercise: 0, exLog: [], wPend: [] });
      this.saveSoon();
    }
    daySummary(S) {
      const t = { kcal: 0, p: 0, c: 0, f: 0, mic: null, ex: S.exercise || 0, water: S.water || 0, items: [] };
      Object.keys(S.log || {}).forEach((meal) => (S.log[meal] || []).forEach((e) => {
        const m = e.servings || 1, fd = e.food;
        t.kcal += fd.kcal * m; t.p += (fd.p || 0) * m; t.c += (fd.c || 0) * m; t.f += (fd.f || 0) * m;
        ['fib', 'sug', 'sat', 'na', 'ch', 'po'].forEach((k) => { if (fd[k] != null) { t.mic = t.mic || { fib: 0, sug: 0, sat: 0, na: 0, ch: 0, po: 0 }; t.mic[k] += fd[k] * m; } });
        t.items.push({ n: fd.name, c: fd.cat || this.catOf(fd), k: Math.round(fd.kcal * m), meal });
      }));
      t.kcal = Math.round(t.kcal); t.p = Math.round(t.p * 10) / 10; t.c = Math.round(t.c * 10) / 10; t.f = Math.round(t.f * 10) / 10;
      return t;
    }
    catOf(fd) {
      if (fd.alcohol) return 'alcohol';
      const g = fd.grp || (fd.gi != null && this.db ? this.db.groups[fd.gi] : '');
      if (g === 'Vegetables') return 'veg';
      if (g === 'Fruit') return 'fruit';
      if (['Poultry', 'Beef', 'Pork', 'Fish & seafood', 'Lamb, veal & game', 'Beans & legumes', 'Dairy & eggs', 'Sausages & deli meats'].includes(g)) return 'protein';
      if (g === 'Sweets' || g === 'Snacks') return 'snack';
      return '';
    }

    componentDidMount() {
      super.componentDidMount();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.rollover(); this.forceUpdate(); this.pull(); } else this.saveNow(); });
      window.addEventListener('online', () => this.pushSoon(0));
      setInterval(() => { const d = this.state.logDay; this.rollover(); if (d !== this.state.logDay) this.forceUpdate(); }, 60000);
      if (this.acct) this.pull();
    }

    // ---- accounts & sync -------------------------------------------------------------------
    async token() {
      if (!this.acct) return null;
      if (this.acct.exp - Date.now() < 60000) { this.acct = await CLOUD.refresh(this.acct); ls.set('fuel:acct', this.acct); }
      return this.acct;
    }
    pushSoon(ms) { if (!this.acct) return; clearTimeout(this._pushT); this._pushT = setTimeout(() => this.push(), ms == null ? 3000 : ms); }
    async push() {
      if (!this.acct || this.syncing) return;
      if (!navigator.onLine) { this.status('Offline · will sync later'); return; }
      this.syncing = true;
      try {
        const a = await this.token();
        const p = persistable(this.state); const days = p.days || {}; delete p.days;
        await CLOUD.put(a, 'fuel/profile', { state: p, updatedAt: this.state.updatedAt });
        const sent = ls.get('fuel:sentDays:' + a.uid) || {};
        for (const k of Object.keys(days)) {
          const sig = JSON.stringify(days[k]).length + ':' + days[k].kcal;
          if (sent[k] === sig) continue;
          await CLOUD.put(a, 'fuelDays/' + isoOf(k), days[k]);
          sent[k] = sig;
        }
        ls.set('fuel:sentDays:' + a.uid, sent);
        this.status('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      } catch (e) {
        this.status(String(e.message).includes('403') ? 'Sync blocked: check Firestore rules' : 'Sync failed · will retry');
        console.warn('[Fuel] push failed', e);
        this.pushSoon(30000);
      } finally { this.syncing = false; }
    }
    async pull() {
      if (!this.acct || !navigator.onLine) return false;
      try {
        const a = await this.token();
        const prof = await CLOUD.get(a, 'fuel/profile');
        const days = await CLOUD.list(a, 'fuelDays').catch(() => []);
        let changed = false;
        const S = this.state;
        const merged = Object.assign({}, S.days || {});
        days.forEach((d) => { const k = keyOfIso(d.id); if (d.data && !merged[k]) { merged[k] = d.data; changed = true; } });
        if (prof && prof.data && prof.data.state && (prof.data.updatedAt || 0) > (S.updatedAt || 0)) {
          this.state = Object.assign({}, this.state, revive(prof.data.state), { days: merged, view: S.view, tab: S.tab, updatedAt: prof.data.updatedAt });
          this._savedJson = null; changed = true;
        } else if (changed) this.state = Object.assign({}, this.state, { days: merged });
        if (changed) { this.rollover(); this.saveNow(); this.forceUpdate(); }
        const sent = ls.get('fuel:sentDays:' + a.uid) || {};
        days.forEach((d) => { if (d.data) sent[keyOfIso(d.id)] = JSON.stringify(d.data).length + ':' + d.data.kcal; });
        ls.set('fuel:sentDays:' + a.uid, sent);
        this.status('Synced ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        return !!(prof && prof.data);
      } catch (e) { console.warn('[Fuel] pull failed', e); this.status(String(e.message).includes('403') ? 'Sync blocked: check Firestore rules' : 'Sync failed · will retry'); return false; }
    }
    status(t) { this.state.syncStatus = t; this.forceUpdate(); }

    async doAuth() {
      const S = this.state;
      const email = (S.email || '').trim(), pw = S.pw || '';
      this.setState({ acctBusy: true, acctErr: '', acctInfo: '' });
      try {
        const sess = S.acctMode === 'signin' ? await CLOUD.signIn(email, pw) : await CLOUD.signUp(email, pw);
        const local = persistable(this.state);
        this.acct = sess; ls.set('fuel:acct', sess);
        // switch to this account's storage; keep onboarding answers if the account is new
        const mine = ls.get(this.storeKey());
        if (mine && mine.state) { this.state = Object.assign({}, this.state, revive(mine.state), { updatedAt: mine.updatedAt || 0 }); }
        else { this.state = Object.assign({}, this.state, local, { updatedAt: 0 }); }
        this._savedJson = null;
        const hadRemote = await this.pull();
        const from = this.state.acctFrom;
        if (hadRemote) this.setState({ mode: 'app', view: 'tabs', tab: from === 'more' ? 'more' : 'today', acctBusy: false, pw: '', email: sess.email });
        else if (from === 'more' || this.state.mode === 'app') this.setState({ mode: 'app', view: 'tabs', tab: 'more', acctBusy: false, pw: '', email: sess.email });
        else if (S.acctMode === 'signin' && !this.state.goals.length) this.setState({ step: 1, acctBusy: false, pw: '', email: sess.email, acctInfo: 'Signed in. Answer a few questions to set up Fuel.' });
        else this.setState({ step: 9, acctBusy: false, pw: '', email: sess.email });
        this.flash('Signed in as ' + sess.email);
        this.pushSoon(500);
      } catch (e) {
        const k = String(e.message);
        this.setState({ acctBusy: false, acctErr: authMsg(e), acctMode: k.startsWith('EMAIL_EXISTS') ? 'signin' : k.startsWith('EMAIL_NOT_FOUND') ? 'create' : S.acctMode });
      }
    }
    signOut() {
      this.saveNow();
      this.acct = null; ls.del('fuel:acct');
      this.loadLocal();
      this.forceUpdate();
      this.flash('Signed out. Data stays saved in your account.');
    }

    // ---- barcode: local first, then Open Food Facts --------------------------------------
    findCode(code) {
      const c = String(code).replace(/\D/g, '');
      if (!c) return;
      const S = this.state, cache = S.scanCache || {};
      const local = this.allFoods().find((f) => f.code === c) || cache[c] || (c.length === 12 && cache['0' + c]) || (c.length === 13 && c[0] === '0' && cache[c.slice(1)]);
      if (local) { this.setState({ code: c, scanMissing: false, scanning: false, prod: local, view: 'product', prodPrev: 'scan' }); return; }
      if (!navigator.onLine) { this.setState({ code: c, scanMissing: true, scanning: false, scanErr: 'You\'re offline, so new products can\'t be looked up. Scanned products are saved for offline use.' }); return; }
      this.setState({ code: c, scanning: true, scanMissing: false, scanErr: '' });
      this.offLookup(c).then((food) => {
        if (food) { this.cacheProduct(food); this.setState({ scanning: false, prod: food, view: 'product', prodPrev: 'scan' }); }
        else this.setState({ scanning: false, scanMissing: true });
      }).catch((e) => { console.warn('[Fuel] lookup failed', e); this.setState({ scanning: false, scanMissing: true, scanErr: 'Couldn\'t reach Open Food Facts. Check your connection and try again.' }); });
    }
    async offGet(url) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
      try { const r = await fetch(url, { signal: ctl.signal }); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
      finally { clearTimeout(t); }
    }
    async offLookup(code) {
      const tries = [code];
      if (code.length === 12) tries.push('0' + code);
      if (code.length === 13 && code[0] === '0') tries.push(code.slice(1));
      for (const c of tries) {
        const j = await this.offGet(OFF + '/api/v2/product/' + c + '.json?fields=' + OFF_FIELDS);
        if (j && j.status === 1 && j.product) return this.offToFood(Object.assign({ code: c }, j.product), code);
      }
      return null;
    }
    offToFood(p, scanned) {
      const n = p.nutriments || {};
      const num = (v) => v == null || v === '' || isNaN(+v) ? null : +v;
      const g = (k) => num(n[k + '_100g']);
      const gs = (k) => num(n[k + '_serving']);
      const cats = p.categories_tags || [];
      const isDrink = (cats.includes('en:beverages') || cats.includes('en:waters')) && !cats.some((c) => /dairies|milks|yogurt/.test(c));
      // values per 100 g, or per serving (common for US/Canadian products) converted when the serving weight is known
      const readSet = (get) => {
        let k = get('energy-kcal'); if (k == null && get('energy-kj') != null) k = get('energy-kj') / 4.184; if (k == null && get('energy') != null) k = get('energy') / 4.184;
        const na = get('sodium') != null ? get('sodium') * 1000 : (get('salt') != null ? get('salt') * 400 : null);
        return { k, p: get('proteins'), c: get('carbohydrates'), f: get('fat'), fib: get('fiber'), sug: get('sugars'), sat: get('saturated-fat'), na, ch: null, po: null };
      };
      // serving weight: the field, else grams/ml written in the serving text ("4 cookies (30 g)")
      const svm = String(p.serving_size || '').match(/(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i);
      const sv = +p.serving_quantity || (svm ? +svm[1].replace(',', '.') : 0);
      const p100 = readSet(g), psv = readSet(gs);
      const filled = (o) => Object.keys(o).filter((k) => o[k] != null).length;
      let per = null, perServ = null;
      if (p100.k != null && filled(p100) >= filled(psv)) per = p100;
      else if (psv.k != null && sv > 0) { per = {}; Object.keys(psv).forEach((k) => { per[k] = psv[k] == null ? null : psv[k] * 100 / sv; }); }
      else if (psv.k != null) perServ = psv;
      else if (p100.k != null) per = p100;
      const unit = isDrink ? 'ml' : 'g';
      const units = [];
      if (sv > 0) units.push({ label: (p.serving_size ? String(p.serving_size).replace(/\s*\(.*\)\s*$/, '') : '1 serving') + ' (' + Math.round(sv) + ' ' + unit + ')', g: sv });
      units.push({ label: '100 ' + unit, g: 100 });
      const pq = +p.product_quantity;
      if (pq > 0 && pq !== sv && pq <= 3000) units.push({ label: 'Whole pack (' + Math.round(pq) + ' ' + unit + ')', g: pq });
      let grp = '';
      for (const [tags, name] of OFF_GROUPS) if (tags.some((t) => cats.includes(t))) { grp = name; break; }
      // en:e150d -> E150d; roman-numeral sub-variants (en:e322i, en:e471ii) fold into their parent
      const additives = Array.from(new Set((p.additives_tags || []).map((t) => { const m = /^en:e(\d+)([a-f])?(?:i{1,3}|iv|vi?|v)?$/i.exec(t); return m ? 'E' + m[1] + (m[2] || '').toLowerCase() : null; }).filter(Boolean)));
      const labels = p.labels_tags || [];
      const code = String(p.code || scanned);
      const u = units[0];
      const fvRaw = num(n['fruits-vegetables-legumes-estimate-from-ingredients_100g']) ?? num(n['fruits-vegetables-nuts-estimate-from-ingredients_100g']) ?? num(n['fruits-vegetables-nuts_100g']);
      const food = {
        id: 'o' + code, code, name: (p.product_name || p.generic_name || 'Unnamed product').trim(), brand: (p.brands || '').split(',')[0].trim() || 'Packaged product',
        src: 'Open Food Facts', tag: regionOf(code), region: regionOf(code), verified: false, img: p.image_front_small_url || '', grp, bev: isDrink,
        additives, organic: labels.some((l) => /organic|bio/.test(l)), nova: +p.nova_group || null, per100: per, units: per ? units : null, incomplete: !per && !perServ, perServ,
        fv: fvRaw, nsGrade: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : null, nsPoints: num(p.nutriscore_score),
        serving: per ? u.label : (p.serving_size || '1 serving'),
        kcal: per ? Math.round(per.k * u.g / 100) : perServ ? Math.round(perServ.k) : 0,
        p: per ? Math.round((per.p || 0) * u.g) / 100 : perServ ? perServ.p || 0 : 0, c: per ? Math.round((per.c || 0) * u.g) / 100 : perServ ? perServ.c || 0 : 0, f: per ? Math.round((per.f || 0) * u.g) / 100 : perServ ? perServ.f || 0 : 0,
        fib: perServ ? perServ.fib : undefined, sug: perServ ? perServ.sug : undefined, sat: perServ ? perServ.sat : undefined, na: perServ ? perServ.na : undefined,
        cat: grp === 'Drinks' && /beer|wine|spirit|alcohol/.test(cats.join(' ')) ? 'alcohol' : undefined
      };
      if (food.cat === 'alcohol') food.alcohol = true;
      return food;
    }
    cacheProduct(food) {
      const cache = Object.assign({}, this.state.scanCache || {});
      cache[food.code] = food;
      const keys = Object.keys(cache);
      if (keys.length > 250) keys.slice(0, keys.length - 250).forEach((k) => delete cache[k]);
      this.setState({ scanCache: cache });
    }
    findFood(id) {
      if (/^o\d+$/.test(id)) return (this.state.scanCache || {})[id.slice(1)] || null;
      return super.findFood(id);
    }
    async searchOff() {
      const q = (this.state.query || '').trim();
      if (!q || this.state.offBusy) return;
      this.offCache = this.offCache || {};
      if (this.offCache[q]) { this.setState({ offRes: this.offCache[q], offQ: q, offErr: '' }); return; }
      if (!navigator.onLine) { this.setState({ offErr: 'You\'re offline. Packaged products need a connection.', offQ: q }); return; }
      this.setState({ offBusy: true, offErr: '', offRes: null, offQ: q });
      try {
        const j = await this.offGet(OFF + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=30&fields=' + OFF_FIELDS);
        const res = ((j && j.products) || []).filter((p) => p.product_name).map((p) => this.offToFood(p, p.code))
          .sort((a, b) => (a.per100 ? 0 : a.perServ ? 1 : 2) - (b.per100 ? 0 : b.perServ ? 1 : 2));
        this.offCache[q] = res;
        this.setState({ offBusy: false, offRes: res });
      } catch (e) {
        const limited = String(e && e.message).includes('429');
        this.setState({ offBusy: false, offErr: limited ? 'Open Food Facts allows about 10 searches a minute. Wait a moment and tap Search again.' : 'Open Food Facts didn\'t answer. Try again in a minute.' });
      }
    }

    // ---- camera scanner (BarcodeDetector, ZXing fallback) ---------------------------------
    canScan() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false; }
    async loadZXing() {
      if (window.ZXingWASM) return window.ZXingWASM;
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../vendor/zxing-reader.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      window.ZXingWASM.prepareZXingModule({ overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? new URL('../vendor/zxing_reader.wasm', location.href).href : prefix + path } });
      return window.ZXingWASM;
    }
    async openScanner() {
      if (this.scanUI) return;
      if (!this.canScan()) { this.setState({ scanErr: 'This browser can\'t open the camera here. Type the barcode instead.' }); return; }
      const ui = document.createElement('div');
      ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-label', 'Barcode scanner');
      ui.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;color:#F2F4F7';
      ui.innerHTML = '<div style="position:relative;flex:1;overflow:hidden"><video playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>'
        + '<div style="position:absolute;left:8%;right:8%;top:32%;height:28%;border:3px solid #C8F25C;border-radius:16px;box-shadow:0 0 0 2000px rgba(0,0,0,.45)"></div>'
        + '<div data-s style="position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + 20px);text-align:center;font-size:15px;font-weight:600;padding:0 20px">Starting camera…</div></div>'
        + '<div style="display:flex;gap:10px;padding:16px 16px calc(env(safe-area-inset-bottom) + 16px);background:#0E1013">'
        + '<button data-c style="flex:1;height:52px;border:0;border-radius:999px;background:#20242B;color:#F2F4F7;font:inherit;font-weight:700;font-size:16px">Cancel</button>'
        + '<button data-t style="width:52px;height:52px;border:0;border-radius:50%;background:#20242B;color:#F2F4F7;font:inherit;font-size:20px;display:none" aria-label="Flashlight">⚡</button>'
        + '<button data-k style="flex:1;height:52px;border:0;border-radius:999px;background:#C8F25C;color:#0E1013;font:inherit;font-weight:700;font-size:16px">Type code</button></div>';
      document.body.appendChild(ui);
      this.scanUI = ui;
      const say = (t) => { const s = ui.querySelector('[data-s]'); if (s) s.textContent = t; };
      // Cancel leaves scanning; Type code stays on the scan screen to enter the number by hand
      ui.querySelector('[data-c]').onclick = () => { this.closeScanner(); if (this.state.view === 'scan') this.setState({ view: this.state.prevView || 'tabs', scanErr: '' }); };
      ui.querySelector('[data-k]').onclick = () => { this.closeScanner(); setTimeout(() => { const i = document.getElementById('bc'); if (i) i.focus(); }, 50); };
      const video = ui.querySelector('video');
      try {
        this.scanStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch (e) {
        say(e && e.name === 'NotAllowedError' ? 'Camera access is blocked. Allow the camera for this app in your phone settings, or type the code.' : 'Couldn\'t open the camera. Type the code instead.');
        return;
      }
      if (!this.scanUI) { this.scanStream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = this.scanStream;
      try { await video.play(); } catch (e) { /* autoplay with muted should work */ }
      if (!this.scanUI || !this.scanStream) return; // closed while the camera was starting
      const track = this.scanStream.getVideoTracks()[0];
      try { const caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.torch) { const tb = ui.querySelector('[data-t]'); tb.style.display = 'block'; let on = false; tb.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); }; } } catch (e) { /* no torch */ }
      say('Point at a barcode');
      let detect;
      try {
        if ('BarcodeDetector' in window) {
          const fm = await window.BarcodeDetector.getSupportedFormats();
          const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => fm.includes(f));
          if (want.length) { const bd = new window.BarcodeDetector({ formats: want }); detect = async () => { const r = await bd.detect(video); return r[0] && r[0].rawValue; }; }
        }
      } catch (e) { detect = null; }
      if (!detect) {
        try {
          const Z = await this.loadZXing();
          if (!this.scanUI) return;
          const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
          detect = async () => {
            const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
            const scale = Math.min(1, 960 / vw), w = Math.round(vw * scale), hgt = Math.round(vh * 0.5 * scale);
            cv.width = w; cv.height = hgt;
            cx.drawImage(video, 0, vh * 0.25, vw, vh * 0.5, 0, 0, w, hgt);
            const res = await Z.readBarcodes(cx.getImageData(0, 0, w, hgt), { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 });
            const ok = res.find((r) => r.isValid && r.text);
            return ok && ok.text;
          };
        } catch (e) { say('Scanner failed to load. Type the code instead.'); return; }
      }
      const loop = async () => {
        if (!this.scanUI) return;
        let code = null;
        try { code = await detect(); } catch (e) { code = null; }
        if (code && /^\d{8}$|^\d{12,13}$/.test(code)) {
          if (navigator.vibrate) navigator.vibrate(60);
          this.closeScanner();
          this.findCode(code);
          return;
        }
        this.scanTimer = setTimeout(loop, 120);
      };
      loop();
    }
    closeScanner() {
      clearTimeout(this.scanTimer);
      if (this.scanStream) { this.scanStream.getTracks().forEach((t) => t.stop()); this.scanStream = null; }
      if (this.scanUI) { this.scanUI.remove(); this.scanUI = null; }
    }

    // ---- backup ----------------------------------------------------------------------------
    async exportData() {
      this.saveNow();
      const data = { app: 'Fuel', format: 1, exportedAt: new Date().toISOString(), account: this.acct ? this.acct.email : null, state: persistable(this.state) };
      const name = 'fuel-backup-' + isoOf(new Date().toDateString()) + '.json';
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      try {
        const file = new File([blob], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Fuel backup' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      this.flash('Backup saved as ' + name);
    }
    importData() {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        f.text().then((txt) => {
          const d = JSON.parse(txt);
          if (!d || d.app !== 'Fuel' || !d.state) throw new Error('not a Fuel backup');
          this.state = Object.assign({}, this.state, revive(d.state), { mode: 'app', view: 'tabs', tab: 'today', updatedAt: Date.now() });
          this._savedJson = null; this.rollover(); this.saveNow(); this.forceUpdate();
          this.flash('Backup restored');
        }).catch(() => this.flash('That file isn\'t a Fuel backup'));
      };
      inp.click();
    }

    // ---- extra values for the production screens ------------------------------------------
    productVals(S) {
      const r = super.productVals(S);
      if (!r.vProduct) return r;
      const P = S.prod;
      r.pr.hasImg = !!P.img; r.pr.noImg = !P.img; r.pr.img = P.img || '';
      if (P.src === 'Open Food Facts') {
        r.pr.codeLine = 'Barcode ' + P.code + ' · Open Food Facts';
        r.pr.note += ' Product data from Open Food Facts (openfoodfacts.org), shared under the Open Database License.';
        if (P.incomplete) { r.pr.unrated = true; r.pr.rated = false; r.pr.why = 'Open Food Facts has this product but no nutrition values yet. Add them from the label.'; }
      }
      // nutrition table: what the database actually has (per 100 g, or per serving)
      const base = P.per100 || P.perServ || this.per100(P);
      const unitTxt = P.per100 || (!P.perServ && base) ? 'Per 100 ' + (P.bev ? 'ml' : 'g') : 'Per serving' + (P.serving ? ' (' + P.serving + ')' : '');
      const f1 = (x, u) => x == null ? '—' : (Math.round(x * 10) / 10) + ' ' + u;
      r.pr.hasFacts = !!base; r.pr.factsBasis = unitTxt;
      r.pr.facts = base ? [['Calories', base.k == null ? '—' : Math.round(base.k) + ' kcal'], ['Protein', f1(base.p, 'g')], ['Carbohydrates', f1(base.c, 'g')], ['  of which sugars', f1(base.sug, 'g')],
        ['Fat', f1(base.f, 'g')], ['  of which saturated', f1(base.sat, 'g')], ['Fiber', f1(base.fib, 'g')], ['Salt', base.na == null ? '—' : f1(base.na * 2.5 / 1000, 'g')]].map(([l, v]) => ({ l: l.trim(), v, pad: l.startsWith('  ') ? 14 : 0, lc: l.startsWith('  ') ? '#9AA3AF' : '#F2F4F7', vc: v === '—' ? '#FFA866' : '#F2F4F7' })) : [];
      const missing = !base || ['sug', 'sat', 'na'].some((k) => base[k] == null) || !P.per100;
      r.pr.canFix = P.src === 'Open Food Facts' && (missing || P.incomplete);
      r.pr.fixText = P.incomplete ? 'Open Food Facts knows this product but has no nutrition values for it yet.' : 'Some values are missing from Open Food Facts, so the rating is limited. Fill them in from the label once and Fuel will use your version every time you scan it.';
      r.pr.fix = () => {
        const u0 = P.units && P.units[0] && P.units[0].g ? P.units[0] : null;
        const src = P.per100 && u0 ? Object.fromEntries(Object.entries(P.per100).map(([k, x]) => [k, x == null ? null : x * u0.g / 100])) : (P.perServ || {});
        const fmt = (x) => x == null ? '' : String(Math.round(x * 10) / 10);
        this.setState({ view: 'log', sheet: 'create', form: { name: P.name + (P.brand && P.brand !== 'Packaged product' ? ' (' + P.brand + ')' : ''), serving: u0 ? u0.label.replace(/\s*\(.*\)$/, '') : (P.serving || '1 serving'), grams: u0 ? String(u0.g) : '',
          kcal: fmt(src.k), p: fmt(src.p), c: fmt(src.c), f: fmt(src.f), fib: fmt(src.fib), sug: fmt(src.sug), sat: fmt(src.sat), na: src.na == null ? '' : String(Math.round(src.na)), code: P.code } });
      };
      r.pr.openOff = () => window.open('https://world.openfoodfacts.org/product/' + P.code, '_blank', 'noopener');
      if (P.incomplete) r.pr.add = r.pr.fix;
      if (P.perServ && !P.per100 && !r.pr.rated) { r.pr.why = 'Not rated yet: Open Food Facts only has per-serving values without a serving weight. You can still add it to your diary.'; }
      return r;
    }
    renderVals() {
      this.rollover();
      const S = this.state;
      if (S.view !== this._lastView) {
        if (S.view === 'scan' && this.canScan()) setTimeout(() => this.openScanner(), 30);
        if (this._lastView === 'scan') this.closeScanner();
        this._lastView = S.view;
      }
      const v = super.renderVals();
      const days = S.days || {};
      // real streak and week strip from saved days
      let streak = v.loggedCount ? 1 : 0;
      for (let a = 1; a < 400; a++) { const d = new Date(); d.setDate(d.getDate() - a); if (days[d.toDateString()] && days[d.toDateString()].kcal > 0) streak++; else break; }
      v.streak = streak;
      const dow = new Date().getDay();
      v.week = v.week.map((w, i) => { if (i >= dow) return w; const d = new Date(); d.setDate(d.getDate() - (dow - i)); return days[d.toDateString()] && days[d.toDateString()].kcal > 0 ? Object.assign({}, w, { cls: 'dayc done' }) : w; });
      // scanner
      v.scanCam = () => this.openScanner();
      v.canCam = this.canScan();
      v.scanErr = !!S.scanErr; v.scanErrText = S.scanErr || '';
      // packaged-product search
      const q = (S.query || '').trim();
      const wrapOff = (f) => { const rt = this.rate(f); return Object.assign({}, f, { dot: rt.rated ? rt.dot : '#3A414C', kcalTxt: f.incomplete ? 'no nutrition data' : f.kcal + ' cal, ' + f.serving,
        open: () => { this.cacheProduct(f); this.setState({ prod: f, view: 'product', prodPrev: 'log' }); },
        quick: () => { if (f.incomplete) { this.setState({ prod: f, view: 'product', prodPrev: 'log' }); return; } this.cacheProduct(f); this.logFood(this.concrete(f, 0), 1); } }); };
      const isCode = /^\d{8,14}$/.test(q);
      // packaged products search automatically once you pause typing (cached; Open Food Facts allows ~10 searches a minute)
      if (S.view === 'log' && q.length >= 3 && !isCode && navigator.onLine && S.offQ !== q && !(this.offCache && this.offCache[q]) && this._offPending !== q) {
        clearTimeout(this._offT); this._offPending = q;
        this._offT = setTimeout(() => { this._offPending = null; if ((this.state.query || '').trim() === q) this.searchOff(); }, 900);
      } else if (this.offCache && this.offCache[q] && S.offQ !== q) setTimeout(() => this.setState({ offRes: this.offCache[q], offQ: q, offErr: '' }), 0);
      const offRes = S.offQ === q && S.offRes ? S.offRes : null;
      v.off = { canSearch: isCode || (q.length >= 2 && !S.offBusy && !offRes && (!!S.offErr || !navigator.onLine || q.length < 3)),
        label: isCode ? 'Look up barcode ' + q : 'Search packaged products for "' + q + '"', search: () => isCode ? this.findCode(q) : this.searchOff(), busy: !!S.offBusy && S.offQ === q,
        hasRes: !!offRes, results: offRes ? offRes.map(wrapOff) : [], count: offRes ? (offRes.length ? 'Packaged products · ' + offRes.length + ' from Open Food Facts' : 'No packaged products found for "' + q + '"') : '',
        err: !!S.offErr && S.offQ === q, errText: S.offErr || '' };
      // local list: best matches first, then packaged products, then the rest
      if (q && Array.isArray(v.results)) { v.moreResults = v.results.slice(6); v.results = v.results.slice(0, 6); v.hasMore = v.moreResults.length > 0; } else { v.moreResults = []; v.hasMore = false; }
      if (q) { const n = (v.results.length + v.moreResults.length); v.resultCount = n + (n === 1 ? ' match' : ' matches') + ' in ' + (this.db ? this.db.foods.length.toLocaleString('en-US') : '…') + ' offline foods' + (navigator.onLine ? ' · plus ~3M packaged products online' : ' · offline: packaged products need internet'); }
      // account
      const signedIn = !!this.acct;
      const create = S.acctMode !== 'signin';
      v.acct = {
        signedIn, signedOut: !signedIn, email: this.acct ? this.acct.email : '', status: S.syncStatus || (signedIn ? 'Tap to sync' : ''),
        isCreate: create, isSignIn: !create, title: create ? 'Create your account' : 'Sign in', sub: create ? 'Use the same email and password as Peak if you have it. Your data syncs between phone and web.' : 'Use your Fuel or Peak email and password.',
        pwAuto: create ? 'new-password' : 'current-password', hasErr: !!S.acctErr, err: S.acctErr || '', hasInfo: !!S.acctInfo, info: S.acctInfo || '',
        toggleLabel: create ? 'I already have an account' : 'Create a new account instead', toggleMode: () => this.setState({ acctMode: create ? 'signin' : 'create', acctErr: '' }),
        canSkip: S.acctFrom !== 'more', skip: () => this.setState({ step: 9, acctErr: '' }),
        forgot: () => { const e = (S.email || '').trim(); if (!/.+@.+\..+/.test(e)) { this.setState({ acctErr: 'Enter your email first.' }); return; } CLOUD.resetPassword(e).then(() => this.setState({ acctInfo: 'Password reset email sent to ' + e + '.', acctErr: '' })).catch((x) => this.setState({ acctErr: authMsg(x) })); },
        syncNow: () => { this.status('Syncing…'); this.pull().then(() => this.push()); }, signOut: () => this.signOut(),
        openSignIn: () => this.setState({ mode: 'onb', step: 8, acctFrom: 'more', acctMode: 'signin', acctErr: '', pw: '' }),
        exportData: () => this.exportData(), importData: () => this.importData(), provider: CLOUD.name
      };
      if (S.mode === 'onb' && S.step === 0) v.startSignIn = () => this.setState({ step: 8, acctFrom: 'onb', acctMode: 'signin', acctErr: '' });
      if (S.mode === 'onb' && S.step === 8) {
        const ok = /.+@.+\..+/.test((S.email || '').trim()) && (S.pw || '').length >= (create ? 8 : 1);
        v.nextLabel = S.acctBusy ? 'Please wait…' : create ? 'Create account' : 'Sign in';
        v.nextDisabled = !ok || !!S.acctBusy;
        v.next = () => this.doAuth();
        if (S.acctFrom === 'more') v.back = () => this.setState({ mode: 'app', view: 'tabs', tab: 'more', acctErr: '' });
      }
      return v;
    }
  }

  window.FuelApp = App;
  window.FUEL_CLOUD = { get: () => CLOUD, set: (c) => { CLOUD = c; } };
  DC.mount(document.getElementById('screens'), App, document.getElementById('app'));
  if (false) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
