/* Fuel runtime: renders a Design Component (.dc.html) screen tree with Preact.
   The screens are authored as a template (sc-if, sc-for, {{holes}}) plus a `Component` class whose
   renderVals() returns the values the template reads. This file compiles the template once and
   re-renders it whenever the component calls setState(). */
(function () {
  'use strict';
  const { h, render } = window.preact;

  // ---- base class the screen logic extends ------------------------------------------------
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      if (typeof patch === 'function') patch = patch(this.state, this.props);
      if (!patch) return;
      this.state = Object.assign({}, this.state, patch);
      DC.schedule();
    }
    forceUpdate() { DC.schedule(); }
  }
  window.DCLogic = DCLogic;

  // ---- template compiler ------------------------------------------------------------------
  const LIT = { true: true, false: false, null: null, undefined: undefined };
  const HOLE = /\{\{([^}]*)\}\}/g;

  function lookup(path, scope) {
    path = path.trim();
    if (path in LIT) return LIT[path];
    if (/^-?\d+(\.\d+)?$/.test(path)) return +path;
    if (/^'[^']*'$/.test(path) || /^"[^"]*"$/.test(path)) return path.slice(1, -1);
    const parts = path.split('.');
    let v, s = scope;
    while (s) { if (Object.prototype.hasOwnProperty.call(s, parts[0])) { v = s[parts[0]]; break; } s = s.__up; }
    for (let i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }

  // a value that is either static text, one whole hole (raw value), or text with holes
  function compileValue(str) {
    const whole = /^\s*\{\{([^}]*)\}\}\s*$/.exec(str);
    if (whole) { const p = whole[1]; return (sc) => lookup(p, sc); }
    if (!str.includes('{{')) return str;
    const parts = []; let last = 0, m; HOLE.lastIndex = 0;
    while ((m = HOLE.exec(str))) { if (m.index > last) parts.push(str.slice(last, m.index)); parts.push({ p: m[1] }); last = HOLE.lastIndex; }
    if (last < str.length) parts.push(str.slice(last));
    return (sc) => parts.map((x) => { if (typeof x === 'string') return x; const v = lookup(x.p, sc); return v == null ? '' : String(v); }).join('');
  }
  const val = (c, sc) => typeof c === 'function' ? c(sc) : c;

  function compileNode(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      if (!t.trim() && !t.includes(' ')) return t.includes('\n') ? null : () => ' ';
      const c = compileValue(t);
      return (sc) => { const v = val(c, sc); return v == null ? '' : String(v); };
    }
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    const kids = compileChildren(node);
    if (tag === 'sc-if') {
      const cond = compileValue(node.getAttribute('value') || '');
      return (sc) => val(cond, sc) ? kids(sc) : null;
    }
    if (tag === 'sc-for') {
      const list = compileValue(node.getAttribute('list') || '');
      const as = node.getAttribute('as') || 'item';
      return (sc) => {
        const arr = val(list, sc);
        if (!arr || !arr.length) return null;
        return Array.from(arr, (item, i) => kids({ [as]: item, $index: i, __up: sc }));
      };
    }
    const isText = tag === 'textarea' || (tag === 'input' && !/^(checkbox|radio)$/i.test(node.getAttribute('type') || ''));
    const attrs = [];
    for (const a of Array.from(node.attributes)) {
      let name = a.name;
      if (name.startsWith('hint-')) continue;
      if (name === 'onchange' && isText) name = 'oninput';
      attrs.push([name, compileValue(a.value)]);
    }
    return (sc) => {
      const props = {};
      for (const [n, c] of attrs) {
        let v = val(c, sc);
        if (n.startsWith('on')) { if (typeof v === 'function') props[n] = v; continue; }
        if (n === 'value' && v == null) v = '';
        if ((n === 'disabled' || n === 'checked') && typeof v === 'string') v = v !== 'false' && v !== '';
        props[n] = v;
      }
      return h(tag, props, kids(sc));
    };
  }
  function compileChildren(node) {
    const list = Array.from(node.childNodes).map(compileNode).filter(Boolean);
    return (sc) => { const out = []; for (const f of list) { const v = f(sc); if (v != null && v !== '') out.push(v); } return out; };
  }

  // ---- mounting & scheduling --------------------------------------------------------------
  const DC = window.DC = {
    comp: null, el: null, tree: null, queued: false, mounted: false,
    schedule() {
      if (this.queued || !this.el) return;
      this.queued = true;
      (window.requestAnimationFrame || setTimeout)(() => { this.queued = false; this.paint(); });
    },
    paint() {
      let vals;
      try { vals = this.comp.renderVals(); } catch (e) { console.error('[Fuel] renderVals failed', e); this.showError(e); return; }
      render(this.tree(vals), this.el);
    },
    showError(e) {
      this.el.innerHTML = '<div style="padding:24px;color:#F2F4F7;font-family:system-ui">Something went wrong. <button id="dcReload" style="margin-top:12px">Reload</button><pre style="white-space:pre-wrap;color:#9AA3AF;font-size:12px">' + String(e && e.stack || e).replace(/</g, '&lt;') + '</pre></div>';
      const b = document.getElementById('dcReload'); if (b) b.onclick = () => location.reload();
    },
    mount(templateEl, Comp, el) {
      const holder = document.createElement('div');
      holder.appendChild(templateEl.content.cloneNode(true));
      const kids = compileChildren(holder);
      this.tree = (vals) => h('div', { class: 'dc-root' }, kids(vals));
      this.el = el;
      this.comp = new Comp({});
      this.paint();
      if (typeof this.comp.componentDidMount === 'function') this.comp.componentDidMount();
    }
  };
})();
