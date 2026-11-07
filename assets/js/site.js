/* site.js: page UI. Lenis in the raf 'scroll' phase, scroll writes in 'update'. */
const LENIS = 'https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js';

export function init(d, ctx) {
 const html = d.documentElement, env = ctx.env, F = ctx.flags, t = ctx.t, bus = ctx.bus, cl = html.classList;
 const $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];
 const mq = (q) => matchMedia(q), clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
 const reduce = env.reduce, offs = [], timers = new Set();
 const on = (el, ty, fn, o) => { if (el) { el.addEventListener(ty, fn, o); offs.push(() => el.removeEventListener(ty, fn, o)); } };
 const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
 const store = (s) => ({ set(k, v) { try { v == null ? window[s].removeItem(k) : window[s].setItem(k, v); } catch (e) {} } });
 const ls = store('localStorage'), ss = store('sessionStorage');
 const K = (b, dt) => 1 - Math.pow(1 - b, dt / 16.7);
 const pick = (e, s) => e.target.closest && e.target.closest(s);
 const vis = (el, fn, o) => offs.push(ctx.onVisible(el, fn, o));

 let live = $('#aa-live');
 if (!live) { live = d.createElement('div'); live.id = 'aa-live'; live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); d.body.append(live); }
 const say = (m) => { live.textContent = ''; later(() => { live.textContent = m; }, 60); };

 const fx = new Set(); let fxOff = null;
 const animate = (f) => {
  fx.add(f);
  if (!fxOff) fxOff = ctx.raf.add((now, dt) => { for (const g of [...fx]) if (!g(dt)) fx.delete(g); if (!fx.size && fxOff) { fxOff(); fxOff = null; } });
 };

 const nav = $('#nav'), menu = $('#menu'), burger = $('#burger'), dock = $('#dock'), mobile = mq('(max-width: 820px)');
 let menuOpen = false, heroOut = false, lenis = null, lenisOff = null, cursorOff = () => {};
 const block = new Set();
 /* the burger's two names come from the HTML (nav.menuOpen / nav.menuClose), so it never has two names for one state */
 const mc = menu && $('[data-menu-close]', menu);
 const mOpen = (burger && burger.getAttribute('aria-label')) || t('ui.menu.open'), mClose = (mc && mc.getAttribute('aria-label')) || t('ui.menu.close');
 function updDock() {
  if (!dock) return;
  const show = mobile.matches && heroOut && !block.size && !menuOpen && !env.doc;
  dock.classList.toggle('is-shown', show);
  dock.toggleAttribute('inert', !show);
  cl.toggle('dock-on', show);
 }
 const focusables = (r) => $$('a[href],button,summary,input,[tabindex="0"]', r).filter((x) => x.getClientRects().length);
 function setMenu(open, back = true) {
  if (!menu || !burger || open === menuOpen) return;
  menuOpen = open; menu.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? mClose : mOpen);
  cl.toggle('menu-open', open);
  if (lenis) open ? lenis.stop() : lenis.start();
  if (open) { nav && nav.classList.remove('hide'); const f = focusables(menu)[0]; f && f.focus(); } else if (back) burger.focus();
  updDock();
 }
 if (burger && menu) {
  burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', mOpen);
  on(burger, 'click', () => setMenu(!menuOpen));
  on(menu, 'click', (e) => { if (pick(e, '[data-menu-close]')) setMenu(false); else if (pick(e, 'a[href]')) setMenu(false, false); });
  const wide = mq('(min-width: 1101px)');
  on(wide, 'change', () => { if (wide.matches) setMenu(false, false); });
 }
 on(nav, 'focusin', () => nav.classList.remove('hide'));
 /* the CV list closes as soon as focus leaves it (it never stays open over the content) */
 on(d, 'focusin', (e) => { for (const x of $$('details.cv-menu[open]')) if (!x.contains(e.target)) x.open = false; });

 on(d, 'keydown', (e) => {
  if (e.key === 'Tab') {
   cursorOff();
   if (!menuOpen) return;
   const f = focusables(menu), i = f.indexOf(d.activeElement);
   if (i < 0) { e.preventDefault(); f[0].focus(); }
   else if (e.shiftKey && !i) { e.preventDefault(); f[f.length - 1].focus(); }
   else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  } else if (e.key === 'Escape') {
   if (menuOpen) return setMenu(false);
   const o = $$('details.cv-menu[open]');
   if (o.length) return o.forEach((x) => { x.open = false; const s = $('summary', x); s && s.focus(); });
  }
 });

 on(d, 'click', (e) => {
  for (const x of $$('details.cv-menu[open]')) if (!x.contains(e.target)) x.open = false;
  /* language switch: open the other page at the chapter in view (never the CV links, which also carry hreflang) */
  const lang = pick(e, '.lang-switch a[hreflang], .foot-langs a[hreflang]');
  if (lang) {
   const h = lang.getAttribute('href') || '';
   if (!/^[a-z]+:/i.test(h)) { lang.dataset.base = lang.dataset.base || h.split('#')[0]; lang.setAttribute('href', lang.dataset.base + (cur && cur !== 'top' ? '#' + cur : '')); }
   return;
  }
  const doc = pick(e, '[data-doc-toggle]');
  if (doc) { e.preventDefault(); return setDoc(!env.doc); }
  const chip = pick(e, '[data-uses]');
  if (chip) return query(chip);
  const cp = pick(e, '[data-copy]');
  if (cp) { e.preventDefault(); return copy(cp); }
  const a = pick(e, 'a[href^="#"]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const h = a.getAttribute('href');
  if (h.length < 2 || !goTo(h)) return;
  e.preventDefault();
  if (location.hash !== h) history.pushState(null, '', h);
  const tl = a.classList.contains('tl-link') && a.closest('.tl-item');
  if (tl) {
   const sec = d.getElementById(h.slice(1)), want = ids(tl), c = sec ? $$('[data-evidence]', sec) : [];
   flash(c.find((x) => ids(x).some((i) => want.includes(i))) || c[0], 1200);
  }
 });

 const ids = (el) => (el.getAttribute('data-evidence') || '').split(/[\s,]+/).filter(Boolean);
 function flash(el, ms) {
  if (!el) return;
  el.classList.remove('is-evidence'); void el.offsetWidth;
  el.style.setProperty('--ev-dur', ms + 'ms'); el.classList.add('is-evidence');
  clearTimeout(el._aaEv); el._aaEv = later(() => el.classList.remove('is-evidence'), ms);
 }
 /* smooth jumps aim once; figures resizing on the way shift the target: re-aim once settled, unless the reader took over */
 let aim = 0;
 for (const [w, ty] of [[window, 'wheel'], [window, 'touchstart'], [d, 'keydown']]) on(w, ty, () => aim++, { passive: true });
 function jump(el, n, id) {
  if (lenis) { wakeLenis(); lenis.scrollTo(el, { offset: -72 }); } else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  let y = -1, k = 0;
  const chk = () => {
   if (id !== aim) return;
   if (scrollY !== y && ++k < 30) { y = scrollY; return later(chk, 200); }
   const off = el.getBoundingClientRect().top - (lenis ? 72 : parseFloat(getComputedStyle(html).scrollPaddingTop) || 0);
   if (n < 2 && Math.abs(off) > 12 && scrollY + innerHeight < d.scrollingElement.scrollHeight - 2) jump(el, n + 1, id);
  };
  later(chk, 200);
 }
 function goTo(h) {
  const el = d.getElementById(h.slice(1));
  if (!el) return false;
  jump(el, 0, ++aim);
  if (!el.matches('a[href],button,input,select,textarea,summary,[tabindex]')) el.setAttribute('tabindex', '-1');
  try { el.focus({ preventScroll: true }); } catch (e) {}
  return true;
 }
 /* deep links (#id on load, also after a language switch): the page keeps resizing after the browser's own jump
    (CV details close, html.gl sizes the worlds, slots warm): hold the target under the nav for up to 5 s, until the
    reader wheels, touches, clicks or types */
 let deep = null;
 try { deep = location.hash.length > 1 && d.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
 if (deep && window.ResizeObserver) {
  const t0 = performance.now(), evs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  let q = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(() => (performance.now() - t0 > 5000 ? done() : deep.scrollIntoView({ block: 'start' }))); });
  const done = () => { ro.disconnect(); cancelAnimationFrame(q); evs.forEach((ty) => window.removeEventListener(ty, done, true)); };
  evs.forEach((ty) => window.addEventListener(ty, done, { passive: true, capture: true }));
  ro.observe(d.body); later(done, 5200); offs.push(done);
 }

 /* --p writers: rail segments, CV timeline, [data-track]. A tracked block writes --p only on its reader (svg.edge or
    .dv-rev), clamped to the range its CSS reads: no section-wide restyle */
 const secOf = (k) => d.getElementById(k) || $('section[data-chapter="' + k + '"]') || $('section[data-theme="' + k + '"]');
 const trk = (sec) => {
  const e = sec.querySelector(':scope > .edge'), r = !e && sec.querySelector('.dv-rev');
  return e ? { el: e, sec, tr: 1, p: -1, lo: 0, hi: .15 } : r ? { el: r, sec, tr: 1, p: -1, lo: .18, hi: .18 + 1 / 2.4 } : null;
 };
 const tracks = $$('#rail .rail-seg[data-seg]').map((el) => ({ el, sec: secOf(el.dataset.seg), seg: 1, p: -1 }))
  .concat($$('ol.timeline').map((el) => ({ el, sec: el, p: -1 })), $$('[data-track]').map(trk).filter(Boolean)).filter((s) => s.sec);
 let vh = innerHeight, lastY = scrollY, ticking = false, rT = 0;
 function measure() {
  vh = innerHeight;
  for (const s of tracks) { const r = s.sec.getBoundingClientRect(); s.top = r.top + scrollY; s.h = Math.max(1, r.height); }
 }
 function update() {
  ticking = false;
  const y = scrollY, dy = y - lastY;
  if (nav) {
   nav.classList.toggle('scrolled', y > 40);
   const keep = menuOpen || nav.contains(d.activeElement) || !!$('details.cv-menu[open]', nav);
   if (dy > 4 && y > 600 && !keep) nav.classList.add('hide');
   else if (dy < -4 || y <= 600 || keep) nav.classList.remove('hide');
  }
  for (const s of tracks) {
   let v = Math.round(clamp(s.tr ? (y + vh - s.top) / (vh + s.h) : (y + vh * (s.seg ? 0.5 : 0.8) - s.top) / s.h, 0, 1) * 400) / 400;
   if (s.hi) v = clamp(v, s.lo, s.hi);
   if (v === s.p) continue;
   s.p = v; s.el.style.setProperty('--p', String(v));
   if (s.seg) s.el.classList.toggle('reached', v > 0);
  }
  lastY = y;
 }
 const onScroll = () => { if (!ticking) { ticking = true; const off = ctx.raf.add(() => { off(); update(); }, 'update'); } };
 const remeasure = () => { clearTimeout(rT); rT = later(() => { measure(); update(); }, 150); };
 on(window, 'scroll', onScroll, { passive: true });
 if (window.ResizeObserver) { const ro = new ResizeObserver(remeasure); ro.observe(d.body); offs.push(() => ro.disconnect()); }
 else on(window, 'resize', remeasure);
 d.fonts && d.fonts.ready.then(remeasure, () => {});
 measure(); update();

 const chap = { glance: 'top', about: 'top' };
 const links = $$('[data-chapter-link]'), label = $('[data-chapter-label]') || $('.nav-current');
 let cur = null, navTheme = null;
 function setChapter(id, theme) {
  /* the theme only colours the nav dot: on the nav (not <html>), once per change */
  const th = theme || null;
  if (nav && th !== navTheme) { navTheme = th; th ? nav.setAttribute('data-world', th) : nav.removeAttribute('data-world'); }
  if (!id || id === cur) return;
  cur = id; let txt = '';
  for (const a of links) { const act = a.dataset.chapterLink === id; a.classList.toggle('active', act); if (act && !txt) txt = a.textContent.replace(/\s+/g, ' ').trim(); }
  if (label) label.textContent = id === 'top' ? '' : txt;
  bus.emit('aa:chapter', { id });
 }
 if (window.IntersectionObserver) {
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setChapter(chap[e.target.id] || e.target.id, e.target.getAttribute('data-theme')); }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of 'top glance about build deploy grow cv skills drone europe contact'.split(' ')) { const s = d.getElementById(id); s && io.observe(s); }
  offs.push(() => io.disconnect());
  /* the aurora shows only behind #top, #glance, #about, the footer: elsewhere html.aurora-off (CSS) stops it */
  const lit = new Set(), aio = new IntersectionObserver((es) => { for (const e of es) e.isIntersecting ? lit.add(e.target) : lit.delete(e.target); cl.toggle('aurora-off', !lit.size); });
  for (const sel of ['#top', '#glance', '#about', '.site-footer']) { const el = $(sel); el && aio.observe(el); }
  offs.push(() => { aio.disconnect(); cl.remove('aurora-off'); });
 }

 let seen = false;
 vis($('#top'), (e, isIn) => {
  if (seen && !isIn === heroOut) return;
  seen = true; heroOut = !isIn; cl.toggle('past-hero', heroOut);
  bus.emit(heroOut ? 'aa:hero-out' : 'aa:hero-in', {}); updDock();
 }, { rootMargin: '-35% 0px 0px 0px', once: false });
 if (dock) {
  updDock();
  for (const el of [$('#contact'), $('#europe .cta-row')]) if (el) vis(el, (e, isIn) => { isIn ? block.add(el) : block.delete(el); updDock(); }, { once: false });
  on(mobile, 'change', updDock);
 }

 /* Lenis on its own clock (≤ 34 ms a step, only while awake): no jolt after a nap. Steps ≥ 9.5 ms apart: on
    120/144 Hz panels the page and the 3D advance at 60/72 Hz, not 144 */
 let idleN = 0, lt = 0, acc = 0, lastL = 0;
 function wakeLenis() {
  if (!lenis || lenisOff) return;
  idleN = 0; acc = 0; lastL = 0;
  lenisOff = ctx.raf.add((now, dt) => {
   if (!lenis) return;
   acc += Math.min(dt, 34);
   if (lastL && now - lastL < 9.5) return;
   lastL = now; lenis.raf(lt += Math.min(acc, 34)); acc = 0;
   if (lenis.isScrolling) idleN = 0; else if (++idleN > 30 && lenisOff) { lenisOff(); lenisOff = null; }
  }, 'scroll');
 }
 function killLenis() { if (lenisOff) { lenisOff(); lenisOff = null; } if (lenis) { try { lenis.destroy(); } catch (e) {} lenis = null; } }
 /* at init: the hero never scrolls natively under the fixed canvas */
 if (F.lenis && env.fine && !env.coarse && !reduce && !env.doc) ctx.loadScript(LENIS).then(() => {
  if (!window.Lenis || env.doc || lenis) return;
  lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true, syncTouch: false, autoRaf: false });
  lenis.on('scroll', onScroll);
  on(window, 'wheel', wakeLenis, { passive: true });
  if (menuOpen) lenis.stop();
 }, (e) => console.warn('[aa]', e));

 /* paint warm-up (desktop): the GPU compiles a program the first time each kind of paint is drawn (a box-shadow blur
    radius, the nav glass, a clipped image, an SVG stroke...): on a cold shader cache, a 50-120 ms hitch where it first
    shows. Once after load (the 3D is not live yet), a static copy of <main> + the scrolled nav (no scripts, inert, 1 %
    opacity under the content) scrolls through itself in an iframe, a viewport per two frames, then goes. Not on phones. */
 if (!mobile.matches && !env.doc) {
  const pw = () => {
   const m = $('main');
   if (env.doc || mobile.matches || !m) return;
   const c = m.cloneNode(true), n = nav && nav.cloneNode(true), f = d.createElement('iframe');
   const kill = () => { f.onload = null; f.remove(); };
   for (const e of $$('script,iframe,video,audio,canvas', c)) e.remove();
   for (const i of $$('img', c)) i.loading = 'eager';
   if (n) { n.classList.add('scrolled'); n.classList.remove('hide'); }
   offs.push(kill);
   f.setAttribute('sandbox', 'allow-same-origin'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.inert = true;
   f.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;opacity:.01;pointer-events:none;z-index:-2';
   f.srcdoc = '<!doctype html><html lang="' + html.lang + '" class="' + html.className + ' reveal-safe"><head>' + $$('link[rel=stylesheet]').map((l) => l.outerHTML).join('') +
    '<style>html{scrollbar-width:none}</style></head><body>' + c.outerHTML + (n ? n.outerHTML : '') + '</body></html>';
   f.onload = () => {
    const w = f.contentWindow, fd = f.contentDocument;
    if (!w || !fd) return kill();
    let y = 0;
    const step = () => {
     if (env.doc || !f.isConnected || y > fd.documentElement.scrollHeight) return kill();
     w.scrollTo(0, y); y += innerHeight;
     requestAnimationFrame(() => requestAnimationFrame(() => (ctx.calm ? ctx.calm(step) : step())));
    };
    Promise.race([Promise.all([fd.fonts && fd.fonts.ready].concat([...fd.images].map((i) => i.decode()))), new Promise((r) => later(r, 1500))]).then(step, step);
   };
   d.body.append(f);
  };
  const go = () => later(() => (window.requestIdleCallback ? requestIdleCallback(pw, { timeout: 600 }) : pw()), 50);
  d.readyState === 'complete' ? go() : on(window, 'load', go, { once: true });
 }

 /* cursor: CSS url() per world + label pill, no lerp, never inverts */
 const pfx = env.fine && !env.coarse && mq('(hover: hover)').matches && !mq('(prefers-contrast: more)').matches && !env.forced;
 const pill = $('#cursor-pill'), rip = $('#cursor-ripple');
 if (F.cursor && pfx && !reduce && !env.doc) {
  cl.add('cur');
  let tgt = null, pw = 0, hideT = 0;
  cursorOff = () => { tgt = null; clearTimeout(hideT); pill && pill.classList.remove('is-on'); };
  const label = (el) => {
   const ro = el.getAttribute('data-readout');
   if (ro) return ro;
   const v = el.getAttribute('data-cursor'), s = v ? t('ui.cursor.' + v) : '';
   return s.startsWith('ui.') ? '' : s;
  };
  on(d, 'pointermove', (e) => {
   if (e.pointerType === 'touch' || !pill) return;
   const el = pick(e, '[data-readout],[data-cursor]'), x = e.clientX, y = e.clientY;
   if (el !== tgt || (el && el.getAttribute('data-cursor') !== pill._c)) {
    tgt = el; const s = el ? label(el) : '';
    pill._c = el && el.getAttribute('data-cursor');
    if (s) {
     if (pill.textContent !== s) { pill.textContent = s; pw = pill.offsetWidth; }
     const th = el.closest('[data-theme]'); pill.setAttribute('data-w', th ? th.getAttribute('data-theme') : '');
    }
    pill.classList.toggle('is-on', !!s);
    /* an action label hides after 1.5 s; a readout stays */
    clearTimeout(hideT);
    if (s && !el.hasAttribute('data-readout')) hideT = later(() => { if (tgt === el) pill.classList.remove('is-on'); }, 1500);
   }
   if (tgt) pill.style.transform = `translate3d(${(x + 16 + pw > innerWidth - 8 ? x - 12 - pw : x + 16)}px,${y + 18}px,0)`;
  }, { passive: true });
  on(d, 'pointerdown', (e) => {
   if (!rip || e.pointerType === 'touch' || !pick(e, '[data-theme=build] .world-slot')) return;
   rip.style.translate = e.clientX + 'px ' + e.clientY + 'px';
   rip.classList.remove('is-on'); void rip.offsetWidth; rip.classList.add('is-on');
  }, { passive: true });
  on(d, 'mouseout', (e) => { if (!e.relatedTarget) cursorOff(); });
 }

 /* pause (WCAG 2.2.2): one page-wide switch, 2D loops (CSS) + 3D (aa:pause), kept for the session */
 const pauses = $$('.fig-pause');
 const setPause = (v, quiet) => {
  cl.toggle('motion-off', v);
  pauses.forEach((b) => b.setAttribute('aria-pressed', String(v)));
  if (!quiet) { ss.set('aa-pause', v ? '1' : null); bus.emit('aa:pause', { on: v }); }
 };
 if (!reduce) {
  let p0 = false; try { p0 = sessionStorage.getItem('aa-pause') === '1'; } catch (e) {}
  setPause(p0, true);
  for (const b of pauses) on(b, 'click', () => setPause(!cl.contains('motion-off')));
 }
 const dr = $('#drone');
 if (dr) vis(dr, (e, isIn) => dr.classList.toggle('in-view', isIn), { once: false, rootMargin: '200px' });

 /* touch: hints swap to ui.w.<id>.hintTouch, else stay hidden (CSS) */
 if (mq('(hover: none)').matches || (env.coarse && !env.fine)) {
  const ws = ((ctx.data('aa-i18n') || {}).ui || {}).w || {};
  for (const h of $$('.fig-hint')) {
   const f = h.closest('figure'), sl = f && $('[data-world-slot]', f), id = sl && sl.dataset.worldSlot;
   const s = id && ws[id] && ws[id].hintTouch;
   if (typeof s === 'string' && s) { h.textContent = s; h.setAttribute('data-touch', ''); }
  }
 }

 const stopOf = (e) => { const a = pick(e, '.glance-link'), s = a && a.closest('.glance-stop'); return s ? s.dataset.stop : null; };
 let gh = null;
 const gl$ = $('#glance');
 const glance = (e) => { const id = e.type === 'pointerleave' || (e.type === 'focusout' && !gl$.contains(e.relatedTarget)) ? null : stopOf(e); if (id !== gh) { gh = id; bus.emit('aa:glance-hover', { id }); } };
 for (const ty of ['pointerover', 'pointerleave', 'focusin', 'focusout']) on(gl$, ty, glance);
 offs.push(bus.on('aa:world-hover', ({ id } = {}) => $$('.glance-stop').forEach((s) => s.classList.toggle('is-hover', !!id && [s.dataset.stop, s.dataset.world].includes(id === 'abroad' ? 'map' : id)))));
 offs.push(bus.on('aa:goto', ({ hash } = {}) => { if (hash && goTo(hash) && location.hash !== hash) history.pushState(null, '', hash); }));

 const follow = (el, aim, write, base, eps) => {
  const st = { x: 0, y: 0, tx: 0, ty: 0, r: null };
  const f = (dt) => {
   const k = K(base, dt); st.x += (st.tx - st.x) * k; st.y += (st.ty - st.y) * k;
   const m = Math.abs(st.tx - st.x) + Math.abs(st.ty - st.y) > eps;
   write(!m && !st.tx && !st.ty ? null : st); return m;
  };
  on(el, 'pointermove', (e) => { if (e.pointerType === 'touch') return; aim(e, st.r || (st.r = el.getBoundingClientRect()), st); animate(f); });
  on(el, 'pointerleave', () => { st.tx = st.ty = 0; st.r = null; animate(f); });
 };
 if (pfx && !reduce && !env.doc) {
  for (const el of $$('[data-magnetic]')) follow(el, (e, r, st) => {
   /* a small pull: with 10 px gaps between buttons, a CTA never slides over its neighbour */
   st.tx = clamp((e.clientX - r.left - r.width / 2) * 0.3, -6, 6); st.ty = clamp((e.clientY - r.top - r.height / 2) * 0.3, -4, 4);
  }, (st) => { el.style.translate = st ? st.x.toFixed(2) + 'px ' + st.y.toFixed(2) + 'px' : ''; }, 0.18, 0.05);
  for (const el of $$('[data-tilt]')) {
   const max = parseFloat(el.dataset.tilt) || 5;
   follow(el, (e, r, st) => {
    st.ty = clamp(((e.clientX - r.left) / r.width - 0.5) * 2 * max, -max, max);
    st.tx = clamp(-((e.clientY - r.top) / r.height - 0.5) * 2 * max, -max, max);
   }, (st) => { el.style.transform = st ? `perspective(900px) rotateX(${st.x.toFixed(2)}deg) rotateY(${st.y.toFixed(2)}deg)` : ''; }, 0.14, 0.01);
  }
 }

 const revs = $$('.reveal:not(.in)');
 if (!window.IntersectionObserver || env.doc || reduce) revs.forEach((el) => el.classList.add('in'));
 else {
  const io = new IntersectionObserver((es) => {
   let i = 0;
   for (const e of es) {
    if (!e.isIntersecting) continue;
    const el = e.target, dl = Math.min(i++, 3) * 70;
    if (dl) el.style.animationDelay = dl + 'ms';
    el.classList.add('in'); io.unobserve(el);
   }
  }, { threshold: 0.14 });
  revs.forEach((el) => io.observe(el));
  offs.push(() => io.disconnect());
 }

 let t0 = 0;
 if (cl.contains('intro') && !reduce && !env.doc) {
  ss.set('aa-intro', '1');
  t0 = 900;
  try { const a = $('#hero-tag .ins').getAnimations()[0]; if (a && a.currentTime != null) t0 = +a.currentTime; } catch (e) {}
  later(() => bus.emit('aa:intro-deploy', {}), Math.max(0, 900 - t0));
  later(() => cl.remove('intro'), Math.max(0, 1600 - t0));
 } else {
  cl.remove('intro');
  if (!reduce && !env.doc) later(() => bus.emit('aa:intro-deploy', {}), 300);
 }

 const tw = $('#tw');
 if (tw) {
  let L = [];
  try { L = JSON.parse(tw.getAttribute('data-lines')).filter(Boolean); } catch (e) {}
  if (L.length && !tw.textContent.trim()) tw.textContent = L[0];
  const twMQ = mq('(min-width: 1100px) and (min-height: 820px)');
  if (!reduce && !env.doc && L.length > 1) {
   let i = 0, j = L[0].length, del = false;
   const tick = () => {
    if (env.doc) return;
    if (!twMQ.matches || d.hidden || heroOut || cl.contains('motion-off')) return later(tick, 1000);
    let w;
    if (!del) { if (j < L[i].length) { j++; w = 38 + Math.random() * 44; } else { del = true; w = 2400; } }
    else if (j > 0) { j--; w = 20; } else { del = false; i = (i + 1) % L.length; w = 420; }
    tw.textContent = L[i].slice(0, j);
    later(tick, w);
   };
   later(tick, Math.max(400, (t0 ? 3000 : 1600) - t0));
  }
 }

 const more = $$('details.tl-more'), openAll = (v) => more.forEach((x) => { x.open = v; });
 if (!env.doc) openAll(false);
 on(window, 'beforeprint', () => { cl.add('print'); openAll(true); });
 on(window, 'afterprint', () => { cl.remove('print'); if (!env.doc) openAll(false); });

 async function copy(b) {
  const txt = b.getAttribute('data-copy');
  let ok = false;
  try { await navigator.clipboard.writeText(txt); ok = true; } catch (err) {
   try {
    const ta = d.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0';
    d.body.append(ta); ta.select(); ok = d.execCommand('copy'); ta.remove(); b.focus();
   } catch (e) {}
  }
  let n = b._aaNote;
  if (!n) { n = b._aaNote = d.createElement('span'); n.className = 'copy-note'; n.setAttribute('aria-hidden', 'true'); b.append(n); }
  n.textContent = t(ok ? 'ui.copied' : 'ui.copyFail');
  n.classList.add('is-on'); clearTimeout(n._t); n._t = later(() => n.classList.remove('is-on'), 1600);
  say(t(ok ? 'ui.copiedSr' : 'ui.copyFailSr', { text: txt }));
 }

 const qOut = $('#query-out');
 const list = (a) => { try { return new Intl.ListFormat(env.lang, { type: 'conjunction' }).format(a); } catch (e) { return a.join(', '); } };
 function query(chip) {
  const want = chip.getAttribute('data-uses').split(/[\s,]+/).filter(Boolean), all = $$('[data-evidence]'), tg = [], names = [];
  for (const id of want) {
   const els = all.filter((x) => ids(x).includes(id));
   if (!els.length) continue;
   els.forEach((x) => tg.includes(x) || tg.push(x));
   const n = (els.find((x) => x.dataset.evidenceName) || { dataset: { evidenceName: id } }).dataset.evidenceName;
   names.includes(n) || names.push(n);
  }
  const skill = chip.getAttribute('data-skill') || [...chip.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim() || chip.textContent.trim();
  tg.forEach((x) => flash(x, 2400));
  if (qOut) {
   qOut.textContent = names.length ? t('ui.query.usedAt', { skill, places: list(names) }) : t('ui.query.none', { skill });
   const f = tg[0], id = f && (f.id || (f.closest('[id]') || {}).id);
   if (id) { const a = d.createElement('a'); a.href = '#' + id; a.className = 'query-see'; a.textContent = t('ui.query.see'); qOut.append(' ', a); }
  }
  bus.emit('aa:query', { skill, targets: want });
 }

 const banner = $('.doc-banner');
 const ensureBanner = () => { if (banner) banner.hidden = false; };
 const syncDoc = () => $$('button[data-doc-toggle]').forEach((b) => { if (!b.closest('.doc-banner')) b.setAttribute('aria-pressed', String(env.doc)); });
 function setDoc(v) {
  if (v === env.doc) return;
  cl.toggle('doc', v); ls.set('aa-doc', v ? '1' : null);
  if (v) {
   ensureBanner(); setMenu(false, false); openAll(true); killLenis(); cursorOff(); fx.clear();
   $$('details.cv-menu[open]').forEach((x) => { x.open = false; });
   cl.remove('intro', 'cur'); revs.forEach((el) => el.classList.add('in'));
   scrollTo(0, 0);
   const b = banner && $('[data-doc-toggle]', banner); try { b && b.focus({ preventScroll: true }); } catch (e) {}
   say(t('ui.doc.on'));
  } else {
   try { const u = new URL(location.href); if (u.searchParams.has('doc')) { u.searchParams.delete('doc'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) {}
  }
  syncDoc(); updDock();
  bus.emit('aa:doc', { on: v }); /* main.js: destroy / reload */
 }
 if (env.doc) { ensureBanner(); openAll(true); }
 syncDoc();

 return {
  destroy() {
   offs.forEach((f) => { try { f(); } catch (e) {} }); offs.length = 0;
   timers.forEach(clearTimeout); timers.clear();
   if (fxOff) { fxOff(); fxOff = null; }
   fx.clear(); killLenis();
  }
 };
}
