/* board.js (B3 → B4): Campaign Board, the 2D twin of the Marble-Run Garden (w-grow.js).
   Count-ups (ctx.raf, once, ≥40 % visible), bars + dots, "How?" backs, the 43-tick Replay, CSP Before/After, message match.
   Bus: emits board:replay {dur: 6000} and board:flip {tile, open}; listens to board:cmd {flash: tile} | {flip: tile} | {replay: true}.
   The Replay runs the same timeline as the 3D: tick i leaves at .8·i/43 of 6 s and takes .2 of it; dot j pops when tick
   floor((j+1)·43/19)−1 lands. Numbers always end on the exact DOM string (the overlay is aria-hidden). */
const DUR = 6000;
export function init(root, ctx) {
  const ac = new AbortController(), on = (el, ev, fn) => el && el.addEventListener(ev, fn, { signal: ac.signal });
  const html = document.documentElement, bus = ctx.bus;
  const T = (k) => ctx.t('board.' + k);
  const rm = () => !!(ctx.env && ctx.env.reduce) || html.classList.contains('rm');
  const fmt = (n, d) => { try { return ctx.fmt(n, { decimals: d }); } catch (e) { return n.toFixed(d); } };
  const offs = [], timers = new Set();
  let dead = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const tile = (k) => root.querySelector(`.tile[data-tile="${k}"]`);

  function count(el) {
    const to = parseFloat(el.dataset.to), d = parseInt(el.dataset.dec, 10) || 0;
    const fin = el.textContent, fs = fmt(to, d), at = fin.indexOf(fs);
    if (!(to > 0) || at < 0) return;
    const pre = fin.slice(0, at), suf = fin.slice(at + fs.length);
    const o = document.createElement('span');
    o.className = 'num-anim';
    o.setAttribute('aria-hidden', 'true');
    o.textContent = pre + fmt(0, d) + suf;
    el.append(o);
    el.classList.add('is-counting');
    let t0 = 0, off = null;
    const end = () => { if (off) off(); off = null; o.remove(); el.classList.remove('is-counting'); };
    off = ctx.raf.add((now) => {
      if (dead) return end();
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / 1200), e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      o.textContent = pre + fmt(to * e, d) + suf;
      if (p >= 1) end();
    });
    offs.push(end);
  }

  // reveal per tile at ≥40 % visible (own ratio check: core's once-mode stops at the first intersection)
  root.querySelectorAll('.tile').forEach((t) => {
    let stop = null;
    stop = ctx.onVisible(t, (e, isIn) => {
      if (dead || !isIn || (e && e.intersectionRatio < 0.4 && e.intersectionRect.height < innerHeight * 0.4)) return;
      if (stop) stop();
      t.classList.add('is-in');
      if (!rm()) t.querySelectorAll('.num[data-to]').forEach(count);
    }, { threshold: [0, 0.4], once: false });
    offs.push(() => stop && stop());
  });

  // "How?" backs: cross-fade, aria-expanded + aria-controls; mirrored as board:flip
  function flip(b, open) {
    const t = b.closest('.tile');
    if (open == null) open = b.getAttribute('aria-expanded') !== 'true';
    t.classList.toggle('is-flipped', open);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = T(open ? 'back' : 'how');
    if (bus) bus.emit('board:flip', { tile: t.dataset.tile, open });
  }
  root.querySelectorAll('.tile-how').forEach((b) => on(b, 'click', () => flip(b)));

  // Replay 8–23 Oct: 43 ticks (1 tick = 10 clicks) roll, the 19 matching ones become the 19 dots; counts come from the markup
  const ticks = root.querySelector('.ticks'), lead = ticks && ticks.closest('.tile'), dots = [...root.querySelectorAll('.dot')];
  if (ticks && !ticks.children.length) {
    const n = parseInt(ticks.dataset.n, 10) || 0, k = dots.length, hit = new Map();
    for (let j = 0; j < k; j++) hit.set(Math.floor(((j + 1) * n) / k) - 1, j);
    let h = '';
    for (let i = 0; i < n; i++) h += `<i style="--d:${Math.round((DUR * 0.8 * i) / n)}ms"${hit.has(i) ? ' class="in"' : ''}></i>`;
    ticks.innerHTML = h;
    dots.forEach((d, j) => { const m = Math.floor(((j + 1) * n) / k) - 1; d.style.setProperty('--dd', Math.round(DUR * ((0.8 * m) / n + 0.17 + 0.045)) + 'ms'); });
  }
  let rT = 0;
  function replay() {
    if (!lead) return;
    lead.classList.add('is-in');
    if (bus) bus.emit('board:replay', { dur: DUR });
    if (rm()) return; // reduced motion: the end state is already shown
    lead.classList.remove('is-replay');
    void lead.offsetWidth; // restart the CSS animations
    lead.classList.add('is-replay');
    clearTimeout(rT);
    rT = later(() => lead.classList.remove('is-replay'), DUR + 400);
  }
  on(root.querySelector('#board-replay'), 'click', replay);

  // CSP incident: Before / After, two buttons in a group (the pressed one is the state shown)
  const ct = root.querySelector('.csp-toggle'), csp = ct && ct.closest('.tile');
  on(ct, 'click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b === ct.lastElementChild;
    ct.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    csp.classList.add('is-in');
    csp.classList.toggle('is-after', a);
  });

  // message match: two legend toggles (keyboard/tap) + hover on any token
  const mt = root.querySelector('.match'), hl = [...root.querySelectorAll('[data-hl]')];
  const show = (k) => { if (!mt) return; mt.dataset.hl = k || ''; hl.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hl === k))); };
  hl.forEach((b) => on(b, 'click', () => show(b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.hl)));
  on(mt, 'pointerover', (e) => { const t = e.target.closest('[data-token]'); if (t) mt.dataset.hover = t.dataset.token; });
  on(mt, 'pointerout', (e) => { if (e.target.closest('[data-token]')) mt.dataset.hover = ''; });

  // commands from the 3D garden come back through the same handlers
  const ev = {};
  if (bus) offs.push(bus.on('board:cmd', (d = {}) => {
    if (dead) return;
    if (d.replay) replay();
    if (d.flip) { const b = tile(d.flip) && tile(d.flip).querySelector('.tile-how'); if (b) flip(b); }
    const t = d.flash && tile(d.flash);
    if (t) { clearTimeout(ev[d.flash]); t.classList.add('is-evidence'); ev[d.flash] = later(() => t.classList.remove('is-evidence'), 1200); }
  }));

  root.classList.add('is-live');
  offs.push(bus && bus.on('aa:doc', (d) => { if (d && d.on) destroy(); }));

  function destroy() {
    if (dead) return;
    dead = true;
    ac.abort();
    timers.forEach(clearTimeout);
    timers.clear();
    offs.forEach((f) => { try { f && f(); } catch (e) {} });
    if (lead) lead.classList.remove('is-replay');
  }
  return { destroy };
}
