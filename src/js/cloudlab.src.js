/* cloudlab.js (B3 → B4): Cloud Lab. Tabs, inspector, console, actions, Auto Scaling, module chips.
   The DOM is the single source of truth; it mirrors itself on ctx.bus for the 3D turntable (w-deploy.js):
   emits lab:tab {id} · lab:run {action, state} · lab:leg {route, a, b, dur, small, stops[{c,t}]} · lab:hit {c} · lab:deny · lab:asg {n} ·
   lab:cost · lab:select {c} · lab:module {id|null}; listens to lab:cmd {inspect} | {action} | {tab} | {module, pin?}.
   Both SVG scenes live in one world slot (.lab-stage); while the 3D is live they leave the a11y tree and ul.lab-parts takes over.
   Packets are HTML overlays moved by transform through ctx.raf, only while an action runs. Strings: ctx.t('lab.…') only. */
export function init(root, ctx) {
  const ac = new AbortController(), sig = { signal: ac.signal };
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, sig);
  const html = document.documentElement, bus = ctx.bus;
  const emit = (n, d = {}) => bus && bus.emit('lab:' + n, d);
  const T = (k, v) => ctx.t('lab.' + k, v);
  const rm = () => !!(ctx.env && ctx.env.reduce) || html.classList.contains('rm');
  const mq = matchMedia('(max-width: 820px)');
  const fmt = (n) => { try { return ctx.fmt(n); } catch (e) { return String(n); } };
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const timers = new Set();
  const wait = (ms) => new Promise((res) => { const id = setTimeout(() => { timers.delete(id); res(); }, ms); timers.add(id); });
  const TONE = { upd2: 'ok', mig3: 'ok', blk: 'bad' };
  const LINES = { request: ['req1', 'req2', 'req3', 'req4'], updates: ['upd1', 'upd2'], blocked: ['blk'], migrate: ['mig1', 'mig2', 'mig3'], cost: ['cost1', 'cost2'] };
  const MODS = { 5160: ['lab-region', 'lab-vpc'], 5161: ['lab-web', 'lab-app', 'lab-asg'], 5162: ['lab-data', 'lab-rds-primary', 'lab-rds-standby'], 5163: ['lab-vpc', 'lab-nat', 'lab-sg-web', 'lab-sg-app', 'lab-sg-data'], 5164: ['lab-dms', 'lab-rds-standby'] };
  root.querySelectorAll('.lab-mod[data-parts]').forEach((b) => { MODS[b.dataset.module] = b.dataset.parts.split(' '); }); // the chip row carries the map; the built-in copy is the fallback
  const geo = new Map();
  let run = 0, act = null, dead = false, quiet = false, stopLeg = null, rt = 0, pinned = null, preview = null, live3d = false;

  const tabs = $$('[role=tab]');
  const panels = tabs.map((t) => root.querySelector('#' + t.getAttribute('aria-controls')));
  const key = (p) => p.id.slice(4); // 'nexa' | 'ld'
  const scene = (p) => root.querySelector(`.lab-scene[data-scene="${key(p)}"]`);
  const panelOf = (el) => { const s = el.closest('[data-scene]'); return s ? root.querySelector('#lab-' + s.dataset.scene) : el.closest('.lab-panel'); };
  const svgOf = (p) => scene(p).querySelector(mq.matches ? '.lab-svg--m' : '.lab-svg--d');
  const comp = (p, c) => { const s = svgOf(p); return s && s.querySelector(`[data-c="${c}"]`); };
  const current = () => panels[Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'))];
  const slot = root.querySelector('.lab-stage');

  // diagram parts become buttons only when they can do something (and only while the 2D diagram is the live one)
  const parts = $$('.lab-svg [data-c]');
  const partsOn = (on2d) => parts.forEach((g) => { g.setAttribute('role', 'button'); g.setAttribute('tabindex', on2d ? '0' : '-1'); });
  partsOn(true);

  /* ---------- tabs (roving tabindex, arrow keys); the turntable follows lab:tab */
  function select(i, focus) {
    cancel();
    tabs.forEach((t, j) => {
      const s = i === j, p = panels[j];
      t.setAttribute('aria-selected', String(s));
      t.tabIndex = s ? 0 : -1;
      if (!p) return;
      p.hidden = !s;
      scene(p).hidden = !s;
      $$(`.lab-parts [data-set="${key(p)}"]`).forEach((li) => { li.hidden = !s; });
    });
    if (focus) tabs[i].focus();
    if (panels[i]) emit('tab', { id: key(panels[i]) });
  }
  tabs.forEach((t, i) => {
    on(t, 'click', () => select(i));
    on(t, 'keydown', (e) => {
      const n = tabs.length, k = e.key;
      const j = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i + n - 1) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if (j < 0) return;
      e.preventDefault();
      select(j, true);
    });
  });
  const show = (p) => { const i = panels.indexOf(p); if (i >= 0 && p.hidden) select(i); };

  /* ---------- geometry: route lookup table in stage pixels + where each stop sits on it */
  function geom(p, name) {
    const svg = svgOf(p), path = svg && svg.querySelector(`[data-route="${name}"]`);
    if (!path) return null;
    let g = geo.get(path);
    if (g) return g;
    const L = path.getTotalLength(), pts = [];
    for (let i = 0; i <= 64; i++) { const q = path.getPointAtLength((L * i) / 64); pts.push([q.x, q.y]); }
    const sr = svg.getBoundingClientRect(), st = svg.parentNode.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const k = Math.min(sr.width / vb.width, sr.height / vb.height) || 1; // the SVG may be letter-boxed (meet) inside a fixed-ratio slot
    const ox = sr.left - st.left + (sr.width - vb.width * k) / 2, oy = sr.top - st.top + (sr.height - vb.height * k) / 2;
    const stops = (path.dataset.stops || '').split(' ').map((c) => {
      const el = svg.querySelector(`[data-c="${c}"]`);
      if (!el) return null;
      const b = el.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      let bi = 0, bd = Infinity;
      pts.forEach(([x, y], i) => { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
      return { c, t: bi / 64 };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
    g = { path, stops, px: pts.map(([x, y]) => [ox + x * k, oy + y * k]) };
    geo.set(path, g);
    return g;
  }
  function at(px, t) {
    const f = Math.max(0, Math.min(64, t * 64)), i = Math.min(63, f | 0), r = f - i, a = px[i], b = px[i + 1];
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  function packet(p, small) {
    const layer = scene(p).querySelector('.lab-packets');
    let el = layer.querySelector('.lab-packet');
    if (!el) { el = document.createElement('i'); el.className = 'lab-packet'; layer.append(el); }
    el.classList.toggle('lab-packet--s', !!small);
    return el;
  }

  /* ---------- feedback: highlights, console, inspector */
  function pulse(p, c, ms) {
    emit('hit', { c });
    const el = comp(p, c);
    if (!el) return;
    const cls = el.classList.contains('lab-gate') ? 'is-open' : 'is-on';
    el.classList.add(cls);
    const id = setTimeout(() => { timers.delete(id); el.classList.remove(cls); }, rm() ? 400 : ms || 900);
    timers.add(id);
  }
  function log(p, k, force) {
    if (quiet && !force) return;
    const ol = p.querySelector('.lab-console');
    if (!ol) return;
    const idle = ol.querySelector('.lab-idle');
    if (idle) idle.remove();
    const li = document.createElement('li');
    li.textContent = T('c.' + k);
    if (TONE[k]) li.dataset.tone = TONE[k];
    ol.append(li);
    while (ol.children.length > 6) ol.firstElementChild.remove();
  }
  function inspect(el) {
    const p = el && panelOf(el);
    if (!p) return;
    $$('.is-sel').forEach((x) => x.classList.remove('is-sel'));
    $$(`.lab-svg [data-c="${el.dataset.c}"]`).forEach((x) => x.classList.add('is-sel'));
    const box = p.querySelector('.lab-inspector');
    if (box) {
      const b = document.createElement('strong'), s = document.createElement('span');
      b.textContent = el.getAttribute('aria-label') || '';
      s.textContent = T('i.' + el.dataset.i);
      box.replaceChildren(b, s);
    }
    emit('select', { c: el.dataset.c });
  }
  on(root, 'click', (e) => {
    const g = e.target.closest('.lab-svg [data-c]');
    if (g) return inspect(g);
    const b = e.target.closest('.lab-pb'); // keyboard / screen-reader path while the 3D is live
    if (b) inspect(comp(current(), b.dataset.part));
  });
  on(root, 'keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest && e.target.closest('.lab-svg [data-c]');
    if (g) { e.preventDefault(); inspect(g); }
  });

  /* ---------- module chips (and the course card's li[data-module]): hover/focus previews, click pins */
  const chips = $$('.lab-mod');
  function setMod() {
    const id = preview || pinned, ps = MODS[id] || [];
    parts.forEach((g) => g.classList.toggle('is-mod', ps.includes(g.dataset.c)));
    chips.forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.module === pinned)); b.classList.toggle('is-on', b.dataset.module === id); });
    emit('module', { id: id || null });
  }
  chips.concat([...document.querySelectorAll('#deploy li[data-module]')]).forEach((el) => {
    const id = el.dataset.module, enter = () => { preview = id; setMod(); }, leave = () => { if (preview === id) { preview = null; setMod(); } };
    on(el, 'pointerenter', enter); on(el, 'pointerleave', leave); on(el, 'focusin', enter); on(el, 'focusout', leave);
  });
  chips.forEach((b) => on(b, 'click', () => { pinned = pinned === b.dataset.module ? null : b.dataset.module; setMod(); }));

  /* ---------- one leg of packet travel from t=a to t=b (b<a runs backwards), mirrored as lab:leg */
  function leg(p, name, dur, o = {}) {
    const g = geom(p, name), tok = run;
    if (!g) return Promise.resolve(tok === run);
    const a0 = o.a == null ? 0 : o.a, b0 = o.b == null ? 1 : o.b, rev = b0 < a0;
    const stops = g.stops.filter((s) => (rev ? s.t <= a0 && s.t >= b0 : s.t >= a0 && s.t <= b0));
    if (rev) stops.reverse();
    const hitFn = o.stop || ((c) => pulse(p, c));
    if (rm()) {
      // reduced motion: no packet, each component lights up for 400 ms in order
      return (async () => {
        for (const s of stops) { if (tok !== run || dead) return false; hitFn(s.c); await wait(400); }
        return tok === run && !dead;
      })();
    }
    emit('leg', { route: name, a: a0, b: b0, dur, small: !!o.small, stops: g.stops.map(({ c, t }) => ({ c, t })) });
    const el = packet(p, o.small);
    g.path.classList.add('is-on');
    let t0 = 0, hit = 0;
    return new Promise((res) => {
      let off = null;
      const done = (ok) => {
        if (off) off();
        off = null;
        stopLeg = null;
        el.classList.remove('is-on');
        g.path.classList.remove('is-on');
        res(ok);
      };
      stopLeg = () => done(false);
      off = ctx.raf.add((now) => {
        if (tok !== run || dead) return done(false);
        if (!t0) t0 = now;
        const q = Math.min(1, (now - t0) / dur), e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
        const t = a0 + (b0 - a0) * e, [x, y, ang] = at(g.px, t);
        el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(rev ? ang + Math.PI : ang).toFixed(3)}rad)`;
        el.classList.add('is-on');
        while (hit < stops.length && (rev ? t <= stops[hit].t : t >= stops[hit].t)) hitFn(stops[hit++].c);
        if (q >= 1) done(true);
      });
    });
  }

  /* ---------- actions */
  const ACT = {
    async request(p) {
      const L = { 'lab-web': 'req1', 'lab-app': 'req2', 'lab-data': 'req3' };
      if (!(await leg(p, 'request', 1400, { stop: (c) => { pulse(p, c); if (L[c]) log(p, L[c]); } }))) return;
      if (!(await leg(p, 'request', 1100, { a: 1, b: 0 }))) return;
      log(p, 'req4');
    },
    async updates(p) {
      const tag = svgOf(p).querySelector('.lab-tag');
      if (tag) tag.classList.add('is-on');
      if (!(await leg(p, 'updates', 1400, { stop: (c) => { pulse(p, c); if (c === 'lab-nat') log(p, 'upd1'); } }))) return;
      log(p, 'upd2');
    },
    async blocked(p) {
      if (!(await leg(p, 'blocked', 1000))) return;
      ['lab-sg-data', 'lab-data'].forEach((c) => { const el = comp(p, c); if (el) el.classList.add('is-denied'); });
      emit('deny');
      log(p, 'blk');
      await leg(p, 'blocked', 380, { a: 1, b: 0.8, stop() {} });
    },
    async migrate(p) {
      const cuts = $$('.lab-cut', scene(p)), ph = p.querySelector('.lab-phases');
      cuts.forEach((x) => x.classList.remove('is-done'));
      if (ph) ph.classList.remove('is-filled');
      log(p, 'mig1');
      if (!(await leg(p, 'dms', 1300))) return;
      log(p, 'mig2');
      if (!rm()) for (let i = 0; i < 3; i++) if (!(await leg(p, 'dms', 560, { small: 1, stop() {} }))) return;
      cuts.forEach((x) => x.classList.add('is-done'));
      if (ph) ph.classList.add('is-filled');
      pulse(p, 'lab-region', 1200);
      log(p, 'mig3');
    },
    async cost(p) {
      const f = p.querySelector('.lab-cost');
      if (!f) return;
      f.classList.add('is-replay');
      void f.offsetWidth; // jump to full width, then shrink to the AWS share
      f.classList.remove('is-replay');
      emit('cost');
      log(p, 'cost1');
      await wait(rm() ? 0 : 900);
      log(p, 'cost2');
    }
  };

  function cancel() {
    run++;
    if (stopLeg) stopLeg();
    timers.forEach(clearTimeout);
    timers.clear();
    $$('.lab-svg .is-on,.lab-svg .is-open,.lab-svg .is-denied,.lab-packet.is-on').forEach((x) => x.classList.remove('is-on', 'is-open', 'is-denied'));
    $$('.lab-act.is-run').forEach((b) => b.classList.remove('is-run'));
    quiet = false;
    if (act) { emit('run', { action: act, state: 'cancel' }); act = null; }
  }
  async function go(btn) {
    const p = panelOf(btn), name = btn.dataset.action;
    if (!p || !ACT[name]) return;
    cancel();
    const tok = run;
    btn.classList.add('is-run');
    act = name;
    emit('run', { action: name, state: 'start' });
    if (rm()) { (LINES[name] || []).forEach((k) => log(p, k, true)); quiet = true; }
    await ACT[name](p);
    if (tok === run) { btn.classList.remove('is-run'); quiet = false; act = null; emit('run', { action: name, state: 'end' }); }
  }
  $$('.lab-act').forEach((b) => on(b, 'click', () => go(b)));

  /* ---------- Auto Scaling demand (illustrative): range on desktop, − / + stepper on phones */
  const rng = root.querySelector('#lab-asg'), out = root.querySelector('#lab-asg-out');
  function asg(n) {
    if (!rng) return;
    const lo = +rng.min || 2, hi = +rng.max || 10;
    n = Math.max(lo, Math.min(hi, Math.round(n) || lo));
    rng.value = String(n);
    const s = fmt(n);
    rng.setAttribute('aria-valuetext', T('ld.asgV', { n: s }));
    if (out) out.textContent = T('ld.asgR', { n: s });
    $$('[data-scene="ld"] .lab-inst').forEach((u) => u.classList.toggle('is-up', +u.dataset.n <= n));
    emit('asg', { n });
  }
  on(rng, 'input', () => asg(+rng.value));
  $$('.lab-step').forEach((b) => on(b, 'click', () => {
    if (out) out.setAttribute('aria-live', 'polite');
    asg(+rng.value + +b.dataset.step);
  }));

  /* ---------- 3D clicks come back through the same handlers */
  const offs = [];
  const sub = (n, f) => bus && offs.push(bus.on(n, (d) => { if (!dead) f(d || {}); }));
  sub('lab:cmd', (d) => {
    if (d.tab) { const i = panels.findIndex((p) => p && key(p) === d.tab); if (i >= 0) select(i); }
    if (d.inspect) {
      const p = panels.find((x) => x && scene(x).querySelector(`[data-c="${d.inspect}"]`));
      if (p) { show(p); inspect(comp(p, d.inspect)); }
    }
    if (d.action) { const b = root.querySelector(`.lab-act[data-action="${d.action}"]`); if (b) { show(panelOf(b)); go(b); } }
    if ('module' in d) {
      const id = d.module ? String(d.module) : null;
      if (d.pin) pinned = pinned === id ? null : id; else preview = id;
      setMod();
    }
  });

  /* ---------- 3D live: the SVG parts leave the a11y tree, ul.lab-parts becomes the keyboard path; restored on 'off' */
  function handover(on3d) {
    if (on3d === live3d) return;
    live3d = on3d;
    $$('.lab-svg').forEach((s) => (on3d ? s.setAttribute('aria-hidden', 'true') : s.removeAttribute('aria-hidden')));
    partsOn(!on3d);
    root.classList.toggle('is-3d', on3d);
  }
  sub('aa:world', (d) => { if (d.id === 'deploy') handover(d.state === 'live'); });
  sub('aa:gl', (d) => { if (!d.on) handover(false); });
  sub('aa:doc', (d) => { if (d.on) destroy(); });

  /* ---------- layout changes */
  on(window, 'resize', () => { clearTimeout(rt); rt = setTimeout(() => geo.clear(), 200); });
  if (mq.addEventListener) mq.addEventListener('change', () => { cancel(); geo.clear(); }, sig);

  root.classList.add('is-live');
  select(Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')));
  /* in its own task: its first ctx.fmt builds the page's Intl.NumberFormat (~45 ms at 4x CPU, the bulk of this init);
     the readout is already in the HTML, so nothing changes on screen meanwhile */
  if (rng) setTimeout(() => { if (!dead) asg(+rng.value); });
  if (slot && slot.classList.contains('is-live')) handover(true);

  function destroy() {
    if (dead) return;
    cancel();
    dead = true;
    ac.abort();
    clearTimeout(rt);
    offs.forEach((f) => f());
    handover(false);
    parts.forEach((g) => { g.removeAttribute('role'); g.removeAttribute('tabindex'); g.classList.remove('is-mod'); });
    panels.forEach((p) => { if (p) { p.hidden = false; scene(p).hidden = false; } });
    root.classList.remove('is-live');
  }
  return { destroy };
}
