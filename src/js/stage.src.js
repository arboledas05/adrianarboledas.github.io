/* stage.js (B2): ONE WebGL renderer for the whole page. Every world draws into its DOM slot:
   desktop = one fixed full-viewport canvas + viewport/scissor per slot; phones = the same canvas re-parented
   into the single live slot. Started by main.js (start('stage', null)) only when the gate passes. */
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

export async function init(root, ctx) {
 const d = document, H = d.documentElement, env = ctx.env, F = ctx.flags || {}, bus = ctx.bus, A = ctx.assets || {}, cl = H.classList;
 const Q = new URLSearchParams(location.search), local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
 const wq = local ? Q.get('w') : null, sid = Q.get('still'), mob = env.mobile;
 const still = sid ? { p: +Q.get('p') || 0, beat: +Q.get('beat') || 0 } : null;
 const url = (k) => new URL(A[k] || k.split('/').pop(), A[k] ? d.baseURI : import.meta.url).href;
 const ss = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
 const now = () => performance.now(), clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
 const ric = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 60));
 /* main.js' calm(fn): runs fn once nothing has scrolled for 300 ms (the heavy boot steps never land inside a gesture).
    Always resolves from a fresh task: when the page is already calm, ctx.calm calls back synchronously, and an await on it
    used to run the next boot step in the same task (import + context creation + setup = one long task at 4x CPU) */
 const calm = () => new Promise((r) => { const go = () => setTimeout(r); ctx.calm ? ctx.calm(go) : go(); });
 /* pixel cap per tier; desktop also steps a ladder relative to the clamped DPR, so Q2 / Q1 really shed pixels at DPR ≤ 1.25 */
 const CAP = mob ? [0, 1.5, 1.5, 1.5] : [0, 1, 1.25, 1.75], LAD = [0, .67, .85, 1];
 let tier = mob ? 1 : 3;
 const sq = ss('aa-q');
 if (sq != null && +sq < tier) tier = +sq;
 if (local && Q.has('q')) tier = +Q.get('q');
 /* html.gl-pre (head script) holds the 3D layout from the first paint; on desktop any 'off' drops it so the 2D layout returns.
    Phones keep it (9-nov-2026 round 3): their stage boots and can give up ('slow', 'lost', …) while the reader is scrolling, and
    dropping the 3D layout then re-laid the whole page (CLS 0.83, a 166 ms task at 4x CPU); the 2D twins fill the same boxes
    instead, and the next visit starts 2D (aa-q = 0 skips gl-pre in the head script) */
 const gl = (on, why) => { if (!on && !mob) cl.remove('gl-pre'); bus.emit('aa:gl', { on, tier, why }); };
 if (tier < 1) return gl(false, 'tier');

 /* which slots: flags.worlds.<id> (or ?w=all|test on localhost); ?still=<id> renders only that one; no hero on phones */
 const W = new Map();
 for (const slot of d.querySelectorAll('[data-world-slot]')) {
  const id = slot.dataset.worldSlot, fig = slot.closest('.world') || slot.parentNode;
  if (sid ? id !== sid : (mob && id === 'hero') || !(wq === 'all' || wq === 'test' || (F.worlds && F.worlds[id]))) continue;
  W.set(slot, { id, slot, fig, st: 0, p: 0, tp: 0, beat: 0, t: 0, first: 1, hit: slot.querySelector('.slot-hit'), mode: fig.querySelector('.fig-mode'),
   inp: { nx: 0, ny: 0, inside: false, down: false, dx: 0, dy: 0, beat: 0, tap: false, paused: false } });
 }
 if (!W.size) return gl(false, 'none');

 await calm(); /* three.js evaluates in this task */
 const T = await import(THREE_URL), kit = await import(url('js/kit.js'));
 let cv = d.getElementById('stage');
 if (!cv) { cv = d.createElement('canvas'); cv.id = 'stage'; d.body.prepend(cv); }
 cv.setAttribute('aria-hidden', 'true');
 const home = cv.parentNode, homeNext = cv.nextSibling;
 let R;
 await calm(); /* the ANGLE context creation */
 try { R = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: !mob && devicePixelRatio < 1.5, stencil: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
 catch (e) { return gl(false, 'context'); }
 const g = R.getContext(), dbg = g.getExtension('WEBGL_debug_renderer_info');
 if (/SwiftShader|llvmpipe|Basic Render|Software/i.test(g.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : g.RENDERER)) && !sid && !wq) {
  R.dispose(); R.forceContextLoss(); return gl(false, 'software');
 }
 await calm(); /* the context creation was its own task; the rest of the boot (classes, layout reads, aa:gl) is the next one */
 R.outputColorSpace = T.SRGBColorSpace; R.toneMapping = T.ACESFilmicToneMapping; R.autoClear = false; R.setClearColor(0, 0); R.shadowMap.enabled = false;
 R.debug.checkShaderErrors = local; /* production skips the sync info-log / link-status queries on each program's first use */
 kit.init(T, R, { mobile: mob, tier });
 if (local) kit.selfTest();

 const offs = [], P = { passive: true };
 const L = (el, ty, fn, o) => { el.addEventListener(ty, fn, o); offs.push(() => el.removeEventListener(ty, fn, o)); };
 let seq = 0, dead = 0, subs = null, lastIn = now(), lastR = 0, lastDraw = 0, drew = 0, hid = 1, cur = null, SW = 1, SH = 1, fi = 16.7, jk = 0, over = 0, wu = 0, stillDone = 0, qOn = 0;
 /* PMREM programs (equirect + blur) compile and link once, when the page is calm, before any world asks for its env.
    The stops are the first world's own (hero on desktop, build on phones): kit caches the map, nothing is wasted.
    Calm idle steps: the programs link in parallel first, then the map renders in a few slices (kit.envSteps: the cube-UV
    pass, then the blur passes two by two), so the first PMREM (its first-use uploads included) is never one long task. */
 const envReady = (async () => {
  await new Promise(ric); await calm(); if (dead) return;
  try { await kit.envPrep(); } catch (e) {}
  try {
   const it = kit.envSteps(mob ? ['#FFFFFF', '#BDEBDD', '#2C5A52'] : ['#FFF4E0', '#E9E6FD', '#3A2BE0']);
   do { await new Promise(ric); await calm(); if (dead) return void it.return(); } while (!it.next().done);
  } catch (e) {}
 })();
 let paused = cl.contains('motion-off'); /* site.js owns the switch (html.motion-off + aa:pause) */
 cv.style.visibility = 'hidden';
 cl.add('gl', 'gl-q' + tier);

 function wake() { lastIn = now(); if (!subs && !dead) { wu = lastIn + 1000; subs = [ctx.raf.add(read, 'read'), ctx.raf.add(render, 'render')]; } }
 function sleep() { if (subs) { subs.forEach((f) => f()); subs = null; } lastR = 0; if (!drew && !mob) { cv.style.visibility = 'hidden'; hid = 1; } }
 const e0 = bus.emit;
 bus.emit = function (n, x) { e0.call(bus, n, x); wake(); }; /* any bus event wakes the engine */

 /* sizes: desktop = fixed canvas, pixel cap; phones = canvas sized to the live slot */
 function size() {
  if (dead) return;
  if (mob) { if (cur) fit(cur, 1); return; }
  SW = cv.clientWidth || innerWidth; SH = cv.clientHeight || innerHeight;
  const b = Math.min(devicePixelRatio, CAP[3], Math.sqrt(3.5e6 / (SW * SH))); /* Q3 = this, as before */
  R.setDrawingBufferSize(SW, SH, Math.min(b * LAD[tier], CAP[tier])); /* one buffer reshape (not setPixelRatio + setSize) */
  W.forEach(beats);
  wake();
 }
 /* phones: the canvas takes the live slot's size: the rect of this frame's read phase (no forced layout), one buffer reshape */
 function fit(w, fresh) { const r = (!fresh && w.r) || w.slot.getBoundingClientRect(); SW = r.width || 1; SH = r.height || 1; R.setDrawingBufferSize(SW, SH, Math.min(devicePixelRatio, CAP[tier])); }
 let rT = 0;
 const resize = () => { clearTimeout(rT); rT = setTimeout(size, 120); };
 if (window.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe(H); offs.push(() => ro.disconnect()); }
 if (window.visualViewport) L(visualViewport, 'resize', resize);
 L(window, 'resize', resize);
 /* scroll speed of the latest scrolled frame (px/s), for the warm queue: a long frame mid-glide must not look like calm.
    The listener only stamps the time; scrollY is read in this frame's read phase (a read in the listener forced a layout) */
 let sy = scrollY, sT = 0, sT0 = 0, sv = 0, sd = 0, jT = -1e9;
 L(window, 'scroll', () => { sT = now(); sd = 1; wake(); }, P);
 /* input wakes the engine in the same frame Lenis first moves the DOM (only matters while motion is paused) */
 L(window, 'wheel', wake, P); L(window, 'touchstart', wake, P); L(d, 'keydown', wake, P);
 L(cv, 'webglcontextlost', () => kill('lost'));

 /* beats: the li[data-beat] anchors of the [data-beats=<id>] wrapper, offsets cached, re-measured on resize */
 function beats(w) {
  const bc = w.bc || (w.bc = w.slot.closest('[data-beats="' + w.id + '"]'));
  if (!bc) return;
  if (!w.ro && window.ResizeObserver) { w.ro = new ResizeObserver(() => beats(w)); w.ro.observe(bc); offs.push(() => w.ro.disconnect()); }
  const top = bc.getBoundingClientRect().top;
  const bo = [...bc.querySelectorAll('[data-beat]')].sort((a, b) => a.dataset.beat - b.dataset.beat).map((li) => { const r = li.getBoundingClientRect(); return [r.top - top, r.height]; });
  /* 8-nov-2026: a collapsed anchor (the phone sprint log shows only its first and last period) has no box: spread it evenly
     between its visible neighbours, so the beats keep rising with the card's progress instead of jumping */
  for (let i = 0; i < bo.length; i++) {
   if (bo[i][1]) continue;
   let j = i; while (j < bo.length && !bo[j][1]) j++;
   const a = i ? bo[i - 1][0] : j < bo.length ? bo[j][0] : 0, b = j < bo.length ? bo[j][0] : a;
   for (let k = i; k < j; k++) bo[k] = [a + ((b - a) * (k - i + 1)) / (j - i + 1), 0];
   i = j;
  }
  w.bo = bo;
 }
 function beatAt(w, vh) {
  const B = w.bo, line = vh * .55 - w.bt;
  if (!B || !B.length || line < B[0][0]) return 0;
  let i = 0;
  while (i < B.length - 1 && B[i + 1][0] <= line) i++;
  return i === B.length - 1 ? i : i + clamp((line - B[i][0]) / Math.max(1, B[i + 1][0] - B[i][0]), 0, .999);
 }

 /* pause motion (WCAG 2.2.2): the .fig-pause buttons live in site.js (2D loops too); the engine follows aa:pause */
 const syncP = () => W.forEach((w) => w.slot.classList.toggle('is-paused', paused));
 offs.push(bus.on('aa:pause', ({ on } = {}) => { paused = !!on; syncP(); wake(); }));
 syncP();

 /* input on .slot-hit: nx, ny ∈ [-1, 1] (y up), drag (touch: horizontal intent only), tap, keys */
 function send(w, type, x) { wake(); const o = w.w; if (o && o.pointer) try { o.pointer(Object.assign({ type, nx: w.inp.nx, ny: w.inp.ny, dx: 0, dy: 0 }, x)); } catch (e) { fail(w, e); } }
 W.forEach((w) => {
  const el = w.hit, I = w.inp;
  beats(w);
  if (w.mode) w.mode.textContent = ctx.t('ui.w.mode2d');
  L(w.slot, 'keydown', (e) => { const k = w.w && w.w.keys; if (k && k.includes(e.key)) { e.preventDefault(); send(w, 'key', { key: e.key }); } });
  if (!el) return;
  el.setAttribute('aria-hidden', 'true');
  w.cur0 = el.getAttribute('data-cursor');
  let sx = 0, sy = 0, lx = 0, ly = 0, t0 = 0, drag = 0;
  const pos = (e) => { const r = w.r || w.slot.getBoundingClientRect(); I.nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1); I.ny = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1); };
  L(el, 'pointermove', (e) => {
   pos(e); I.inside = true;
   if (I.down) {
    const ddx = e.clientX - lx, ddy = e.clientY - ly, ax = Math.abs(e.clientX - sx), ay = Math.abs(e.clientY - sy);
    lx = e.clientX; ly = e.clientY;
    if (!drag && (e.pointerType === 'touch' ? ax > 8 && ax > 1.5 * ay : ax + ay > 3)) { drag = 1; try { el.setPointerCapture(e.pointerId); } catch (_) {} }
    if (drag) { I.dx += ddx; I.dy += ddy; return send(w, 'drag', { dx: ddx, dy: ddy }); }
   }
   send(w, 'move');
  }, P);
  L(el, 'pointerdown', (e) => { if (e.button) return; pos(e); I.down = true; drag = 0; sx = lx = e.clientX; sy = ly = e.clientY; t0 = now(); send(w, 'down'); }, P);
  const up = (e) => { if (!I.down) return; I.down = false; send(w, 'up'); if (!drag && e.type === 'pointerup' && now() - t0 < 500) { I.tap = true; send(w, 'tap'); } drag = 0; };
  L(el, 'pointerup', up, P); L(el, 'pointercancel', up, P);
  L(el, 'pointerleave', () => { if (!drag) { I.inside = false; send(w, 'leave'); } }, P);
 });

 /* lifecycle: in band at 250 % (phones 150 %) → queued warm (import + create + compileAsync + texture uploads, in idle),
    live at 15 %, phones dispose beyond 300 % */
 const io = (m, fn) => { const o = new IntersectionObserver((es) => es.forEach((e) => { const w = W.get(e.target); w && fn(w, e.isIntersecting); }), { rootMargin: m + ' 0px' }); W.forEach((w) => o.observe(w.slot)); offs.push(() => o.disconnect()); };
 if (still) { const w = [...W.values()][0]; w.slot.scrollIntoView({ block: 'center' }); w.near = 1; warm(w); }
 else {
  io(mob ? '150%' : '250%', (w, i) => { w.band = i; if (i) pump(); });
  io('15%', (w, i) => { w.near = i; wake(); });
  if (mob) io('300%', (w, i) => !i && w.st === 2 && off(w));
 }
 /* ONE warm at a time, nearest the viewport centre first, never while the page moves faster than ~1 viewport/s
    (a nav jump or a fling passes on the 2D twins; warming resumes once it settles) */
 function pump() {
  if (qOn || dead) return;
  qOn = 1; const y0 = scrollY;
  /* 100 ms, then two frames: a glide scrolls in every frame, so a long frame (no scroll events while it blocks) is never
     mistaken for calm */
  setTimeout(() => { const tq = now(); requestAnimationFrame(() => requestAnimationFrame(() => {
   if (dead) return;
   if (Math.abs(scrollY - y0) > innerHeight * .1 || (sT >= tq && sv > innerHeight)) { qOn = 0; return pump(); }
   let best = null, bd = 1e9;
   for (const w of W.values()) if (w.band && !w.st) { const r = w.slot.getBoundingClientRect(), dd = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (dd < bd) { bd = dd; best = w; } }
   if (!best) { qOn = 0; return; }
   ric(() => warm(best).finally(() => { qOn = 0; pump(); }));
  })); }, 100);
 }
 async function warm(w) {
  if (w.st) return;
  w.st = 1; const k = w.k = ++seq;
  try {
   const mod = wq === 'test' ? { create: testWorld } : await import(url('js/w-' + w.id + '.js'));
   if (dead || w.k !== k) return;
   await envReady;
   if (dead || w.k !== k) return;
   const o = await mod.create(T, kit, ctx, w.slot, { tier, mobile: mob, still, bus, renderer: R });
   if (dead || w.k !== k) return void kit.dispose(o.scene);
   w.w = o;
   if (o.setQuality) o.setQuality(tier);
   await new Promise(ric);
   if (dead || w.k !== k) return;
   /* parallel compile, in idle slices (compileSliced). The world keeps its 2D twin until every program is really linked (a
      first render of an unfinished program blocks on the driver); after 20 s it gives up and stays 2D. Disposal waits for it. */
   w.cp = R.compileAsync ? compileSliced(o, () => dead || w.k !== k) : Promise.resolve(R.compile(o.scene, o.camera));
   const ok = await Promise.race([w.cp.then(() => 1, () => 1), new Promise((r) => setTimeout(r, 20000, 0))]);
   if (dead || w.k !== k) return;
   if (!ok) return fail(w, new Error('compile timeout'));
   /* textures upload one per idle slice now, not all in the world's first visible frame */
   const tx = new Set(), add = (v) => v && v.isTexture && !v.isRenderTargetTexture && tx.add(v);
   o.scene.traverse((x) => { for (const m of [].concat(x.material || [])) { for (const p in m) add(m[p]); for (const u of Object.values(m.uniforms || {})) add(u && u.value); } });
   for (const t of tx) { await new Promise(ric); if (dead || w.k !== k) return; try { R.initTexture(t); } catch (e) {} }
   w.st = 2; w.first = 1; w.t = 0;
   wu = Math.max(wu, now() + 500); /* the watchdog ignores warm-up hitches */
   w.slot.classList.add('is-warm');
   bus.emit('aa:world', { id: w.id, state: 'warm' });
  } catch (e) { fail(w, e); }
 }
 /* R.compileAsync(scene, camera), cut into idle slices: three's compile() prepares every object's material (shader
    parameters + cache key: ~1 ms per object at 4x CPU, 30–50 ms for a world in one go). Here it runs on batches of objects
    (a duck-typed scene: compile() only calls traverse / traverseVisible on it; lights, fog and env still come from the
    world's own scene, its targetScene), the batch sized to ~4 ms, ≤ 8 ms per slice. Then compileAsync's own readiness poll
    (r160, three is pinned): every material's program reports KHR_parallel_shader_compile completion. */
 async function compileSliced(o, gone) {
  const all = [], mats = new Set();
  o.scene.traverse((x) => x.material && all.push(x));
  for (let i = 0, n = 8; i < all.length;) {
   if (i) { await new Promise(ric); if (gone()) return; }
   const end = now() + 8;
   do {
    const b = all.slice(i, i += n), t0 = now();
    R.compile({ traverse: (f) => b.forEach(f), traverseVisible() {} }, o.camera, o.scene).forEach((m) => mats.add(m));
    n = clamp(Math.round(n * 4 / Math.max(now() - t0, .5)), 1, 64);
   } while (i < all.length && now() < end - 4);
  }
  await new Promise((res) => {
   const chk = () => {
    if (gone()) return res();
    for (const m of mats) { const p = R.properties.get(m).currentProgram; if (!p || p.isReady()) mats.delete(m); }
    mats.size ? setTimeout(chk, 10) : res();
   };
   chk();
  });
 }
 function off(w, keep) {
  const o = w.w;
  w.w = null; w.st = keep || 0; w.shown = 0; w.k = 0; w.w0 = 0; w.pr = 0; w.pq = w.pa = null;
  const cp = w.cp, gone = () => { try { o.dispose && o.dispose(); } catch (e) {} kit.dispose(o.scene); };
  w.cp = null;
  if (o) cp ? cp.then(gone, gone) : gone();
  w.slot.classList.remove('is-warm', 'is-live');
  rest(o);
  if (w.hit) w.hit.setAttribute('data-cursor', w.cur0 || '');
  if (w.mode) w.mode.textContent = ctx.t('ui.w.mode2d');
  if (cur === w) { cur = null; home.insertBefore(cv, homeNext); cv.style.visibility = 'hidden'; hid = 1; drew = 0; }
  bus.emit('aa:world', { id: w.id, state: 'off' });
 }
 /* hotspots back to their 2D/CSS positions (a world that goes 2D or is disposed) */
 function rest(o) { for (const h of (o && o.hotspots) || []) if (h.el) { h.el.classList.remove('hs-on', 'hs-off'); h.el.style.transform = h.el.style.visibility = h.el.style.opacity = ''; h.el._t = h.el._v = h.el._o = 0; } }
 function demote(w) { w.shown = 0; w.slot.classList.remove('is-live'); rest(w.w); }
 function fail(w, e) { console.warn('[aa] world ' + w.id, e); off(w, 3); bus.emit('aa:module-failed', { name: 'w-' + w.id }); }

 /* READ phase: rect reads only */
 function read() {
  if (sd) { sd = 0; const y = scrollY; sv = Math.abs(y - sy) * 1000 / Math.max(1, sT - sT0); if (Math.abs(y - sy) > innerHeight * .5) jT = sT; sy = y; sT0 = sT; }
  for (const w of W.values()) {
   if (w.st !== 2 || !w.near) continue;
   const r = w.slot.getBoundingClientRect(), o = w.r;
   w.mv = !o || r.top !== o.top || r.left !== o.left || r.width !== o.width || r.height !== o.height;
   w.r = r;
   if (w.bc) w.bt = w.bc.getBoundingClientRect().top;
  }
 }

 /* RENDER phase */
 const v3 = new T.Vector3(), c3 = new T.Vector3(), e3 = new T.Vector3(), pr = {};
 function render(t, dms) {
  if (dead || stillDone) return;
  const vh = innerHeight, vw = innerWidth;
  /* candidates: warm, near, with visible area; desktop ≤ 2, phones 1 (largest area, ties → nearest the centre) */
  const cand = [];
  for (const w of W.values()) {
   if (w.st !== 2 || !w.near || !w.r) continue;
   const r = w.r, a = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
   if (!r.height && !w.shown) { w.slot.classList.add('is-live'); continue; } /* collapsed slots open on .is-live first */
   if (mob && !w.shown && !w.pr && !still) continue; /* phones: a world goes live only once primed (below); its 2D twin until then */
   if (a > 0 || still) cand.push([a, Math.abs(r.top + r.height / 2 - vh / 2), w]);
  }
  cand.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let list;
  if (mob) {
   /* phones: the live world changes hands only when the challenger shows 1.25x more area, or the current one is < 30 % visible */
   const cc = cur && cand.find((c) => c[2] === cur), top = cand[0];
   let pick = cc ? cur : top && top[2];
   if (cc && top[2] !== cur && (top[0] > cc[0] * 1.25 || cc[0] < .3 * Math.min(cur.r.width * cur.r.height, vw * vh))) pick = top[2];
   list = pick ? [pick] : [];
  } else {
   list = cand.slice(0, 2).map((c) => c[2]);
   for (const c of cand.slice(2)) if (c[2].shown) demote(c[2]); /* a 3rd visible world shows its 2D twin */
  }
  /* phones, right after a jump (a nav link, a scrollIntoView): the GPU is busy rastering the newly exposed page, and the
     switch's buffer reshape waits for it (a 120–150 ms frame at 4x CPU). The live world changes hands 250 ms later. */
  if (mob && list[0] && list[0] !== cur && t - jT < 250) list = cur && cand.some((c) => c[2] === cur) ? [cur] : [];
  if (mob && list[0] && list[0] !== cur) {
   if (cur) demote(cur);
   cur = list[0];
   cur.slot.insertBefore(cv, cur.slot.querySelector('.slot-ui'));
   fit(cur); cur.w0 = 0; wu = t + 1000;
  }
  /* watchdog (raw raf dt, step-down only), refresh-agnostic: fi ≈ the vsync interval (6.9 ms at 144 Hz, 16.7 at 60).
     A janky frame is > 1.5 vsync AND longer than one 60 Hz frame (the 3D runs ≤ 60 fps, Lenis steps ≤ 72 Hz) or, at Q1,
     than one 30 Hz frame. jk = EMA of the janky-frame ratio (~50 frames); > 8 % for 1.5 s (Q1: 2 s) steps down. */
  if (drew && t > wu && dms < 250) {
   fi = Math.min(fi + .02, dms);
   jk += ((dms > Math.max(fi * 1.5, tier < 2 ? 34 : 18) ? 1 : 0) - jk) * .02;
   if (jk > .08) { if ((over += dms) > (tier < 2 ? 2000 : 1500)) return down(); } else if (jk < .04) over = 0;
  }
  const active = t - lastIn < 4000, moved = !mob && list.some((w) => w.mv);
  /* Q3/Q2: ≤60 fps, 30 fps after 4 s without input; Q1: 30 fps. Desktop always follows a moving slot (no scissor lag);
     on 120/144 Hz screens site.js steps Lenis on every 2nd vsync, so a scroll renders at ≤ 72 fps, not 144. */
  if (list.length && !moved && !still && t - lastR < (tier > 1 && active ? 12 : 31)) return;
  let busy = t - lastIn < 500;
  /* dt = time since the last RENDER (not the last rAF), so throttled loops keep real-time speed */
  const dt = Math.min(lastR ? t - lastR : dms, 100) / 1000;
  lastR = t;
  if (drew) { R.setScissorTest(false); R.clear(); drew = 0; }
  /* prime: while the page is calm, a warm world draws its objects into a 1 px scissor (cleared again right after), one
     material per frame, so its first visible frame no longer pays the first-draw work (buffer uploads, VAOs, the driver's
     shader variants) in one go mid-scroll. Only in a frame that presents anyway, or while the canvas is hidden (phones:
     also when nothing is drawn, as the canvas is then out of view). Phones: a world within 15 % of the viewport waits for
     its priming to go live, so it primes even mid-scroll, first, as many materials as fit in ~5 ms per frame. */
  if (!still && (list.length || hid || mob)) {
   let pw = null;
   for (const w of W.values()) if (w.st === 2 && !w.shown && !w.pr && w.w && (!pw || (w.near && !pw.near))) pw = w;
   if (pw) {
    const urgent = mob && pw.near, t0 = now();
    if (urgent || t - lastIn > 300) { wu = Math.max(wu, t + 300); try { do prime(pw); while (urgent && !pw.pr && now() - t0 < 5); } catch (e) { pw.pr = 1; fail(pw, e); } }
    busy = 1; /* stay awake until every warm world is primed */
   }
  }
  const k = 1 - Math.exp(-8 * dt);
  for (const w of list) {
   const r = w.r, o = w.w, I = w.inp;
   w.tp = still ? still.p : clamp((vh - r.top) / (vh + r.height), 0, 1);
   w.p = w.first ? w.tp : w.p + (w.tp - w.p) * k;
   if (w.bc) { const tb = still ? still.beat : beatAt(w, vh); w.beat = w.first ? tb : w.beat + (tb - w.beat) * k; if (Math.abs(tb - w.beat) > 1e-3) busy = 1; }
   if (Math.abs(w.tp - w.p) > 1e-4) busy = 1;
   I.beat = w.beat; I.paused = paused;
   const fdt = paused || still ? 0 : dt;
   w.t += fdt;
   if (mob) { R.setViewport(0, 0, SW, SH); R.setScissorTest(false); }
   else {
    const x0 = Math.max(0, r.left), x1 = Math.min(SW, r.right), y0 = Math.max(0, r.top), y1 = Math.min(SH, r.bottom);
    R.setViewport(r.left, SH - r.bottom, r.width, r.height); R.setScissor(x0, SH - y1, Math.max(0, x1 - x0), Math.max(0, y1 - y0)); R.setScissorTest(true);
   }
   R.toneMappingExposure = o.exposure || 1;
   try {
    if (w.w0 !== r.width || w.h0 !== r.height) { w.w0 = r.width; w.h0 = r.height; if (mob) { fit(w); R.setViewport(0, 0, SW, SH); } o.resize && o.resize(r.width, r.height); }
    o.update(still ? 0 : w.t, fdt, w.p, I);
    R.render(o.scene, o.camera);
   } catch (e) { fail(w, e); continue; }
   I.tap = false; I.dx = I.dy = 0; w.first = 0; drew = 1;
   if (!paused && (!o.needsFrame || o.needsFrame())) busy = 1;
   if (o.cursor !== undefined && w.hit && w.cc !== o.cursor) { w.cc = o.cursor; w.hit.setAttribute('data-cursor', o.cursor == null ? w.cur0 || '' : o.cursor); }
   spots(w, r);
   if (!w.shown) {
    w.shown = 1; wu = t + 1000;
    w.slot.classList.add('is-live');
    if (w.mode) w.mode.textContent = ctx.t('ui.w.mode3d');
    bus.emit('aa:world', { id: w.id, state: 'live' });
   }
  }
  if (drew) { lastDraw = t; if (hid) { cv.style.visibility = 'visible'; hid = 0; } }
  else if (!hid && !mob && t - lastDraw > 300) { cv.style.visibility = 'hidden'; hid = 1; }
  if (still && drew) { stillDone = 1; window.__stillReady = true; return sleep(); }
  if (!busy) sleep();
 }

 function prime(w) {
  const o = w.w;
  if (!w.pq) {
   const m = new Map();
   o.scene.traverseVisible((x) => { if (x.material) for (const mt of [].concat(x.material)) { if (!m.has(mt)) m.set(mt, []); m.get(mt).push(x); } });
   w.pq = [...m.values()]; w.pa = [...new Set(w.pq.flat())];
  }
  const on = w.pq.shift(), all = w.pa;
  if (!w.pq.length) { w.pr = 1; w.pq = w.pa = null; }
  if (!on) return;
  const keep = all.map((x) => [x.visible, x.frustumCulled]);
  for (const x of all) x.visible = false;
  for (const x of on) { x.visible = true; x.frustumCulled = false; }
  try {
   R.setViewport(0, 0, SW, SH); R.setScissor(0, 0, 1, 1); R.setScissorTest(true);
   R.toneMappingExposure = o.exposure || 1;
   R.render(o.scene, o.camera); R.clear();
  } finally { all.forEach((x, i) => { x.visible = keep[i][0]; x.frustumCulled = keep[i][1]; }); }
 }

 /* hotspots: project anchors, translate3d relative to the slot, hide outside the slot or facing away */
 function spots(w, r) {
  const o = w.w;
  for (const h of o.hotspots || []) {
   const el = h.el, a = h.anchor;
   if (!el || !a) continue;
   if (a.isObject3D) a.getWorldPosition(v3); else v3.copy(a);
   if (h.offset) v3.add(h.offset);
   kit.project(v3, o.camera, r.width, r.height, pr);
   let hide = !pr.vis || pr.x < 0 || pr.y < 0 || pr.x > r.width || pr.y > r.height;
   if (!hide && h.hideBehind && a.isObject3D && a.parent) {
    a.parent.getWorldPosition(c3);
    if (o.camera.isOrthographicCamera) o.camera.getWorldDirection(e3).negate(); else o.camera.getWorldPosition(e3).sub(v3);
    hide = c3.subVectors(v3, c3).dot(e3) < 0;
   }
   /* a focusable pin that leaves the frame stays in the tab order: clamped to the slot edge, shown only while focused (.hs-off) */
   const foc = el.tabIndex >= 0 && (el.tagName === 'BUTTON' || el.tagName === 'A'), off = foc && hide;
   const x = off ? Math.min(Math.max(pr.x, 100), r.width - 100) : pr.x, y = off ? Math.min(Math.max(pr.y, 40), r.height - 30) : pr.y;
   const tf = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)', vv = hide && !foc ? 'hidden' : 'visible';
   if (el._t !== tf) el.style.transform = el._t = tf;
   if (el._v !== vv) el.style.visibility = el._v = vv;
   if (el._o !== off) el.classList.toggle('hs-off', el._o = off);
   if (!el.classList.contains('hs-on')) el.classList.add('hs-on');
  }
 }

 /* tiers: step-down only (Q3 → Q2 → Q1 → Q0); only DPR, counts and visibility change, never materials */
 function down() {
  over = 0; jk = 0; wu = now() + 1000; /* the reshape's own hitch never counts toward the next step */
  cl.remove('gl-q' + tier); tier--; ss('aa-q', tier);
  if (tier < 1) return kill('slow');
  cl.add('gl-q' + tier);
  W.forEach((w) => { try { w.w && w.w.setQuality && w.w.setQuality(tier); } catch (e) { fail(w, e); } });
  size(); gl(true);
 }
 function destroy() {
  if (dead) return;
  sleep(); W.forEach((w) => w.w && off(w)); dead = 1;
  offs.forEach((f) => f()); offs.length = 0; bus.emit = e0;
  cl.remove('gl', 'gl-q1', 'gl-q2', 'gl-q3');
  if (!mob || cl.contains('doc')) cl.remove('gl-pre');
  if (cv.parentNode !== home) home.insertBefore(cv, homeNext);
  cv.style.visibility = 'hidden';
  try { kit.destroy && kit.destroy(); R.dispose(); R.forceContextLoss(); } catch (e) {}
 }
 function kill(why) { if (!dead) { destroy(); gl(false, why); } }
 L(d, 'aa:doc', (e) => e.detail && e.detail.on && destroy());

 size();
 gl(true);
 if (still) setTimeout(() => { if (!window.__stillReady) window.__stillReady = 'timeout'; }, 20000);
 return { destroy };

 /* ?w=test (localhost): the reference world for the other builders: a slab + lip + bead on a blob shadow */
 async function testWorld(T, K, c, slot, opt) {
  const sc = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .1, 100), grp = new T.Group();
  cam.position.set(0, 2.4, 6.6); cam.lookAt(0, .2, 0);
  K.rig(sc, { hemi: ['#FFF6EA', '#C9BFEA', .9], key: ['#FFF1DF', 2.2, [-3, 5, 6]], rim: ['#8E7CFF', 1, [4, 3, -5]] });
  sc.environment = K.env(['#FFF4E0', '#E9E6FD', '#3A2BE0']);
  const plinth = new T.Mesh(K.slab(3.2, .32, 2.1, { r: .32, bevel: .07 }), K.clay('#F7DCC4'));
  const lip = K.lip(3.2, 2.1, .32, .035); lip.position.y = .16;
  const bead = new T.Mesh(new T.SphereGeometry(.2, 32, 16), K.clay('#3A2BE0', { coat: .6, emissive: '#3A2BE0', emissiveIntensity: .12 }));
  const sh = K.blob(4, 2.8, .2); sh.position.y = -.17;
  grp.add(plinth, lip, bead, sh); sc.add(grp);
  const sp = K.spring(260, 20), hs = slot.querySelector('.slot-ui .hs');
  return {
   id: 'test', scene: sc, camera: cam, exposure: 1.1, hotspots: hs ? [{ el: hs, anchor: bead, offset: new T.Vector3(0, .3, 0) }] : [],
   update(t, dt, p, i) {
    sp.t = i.inside ? i.nx * .4 : 0;
    grp.rotation.y = .35 * Math.sin(t * .5) + sp.step(dt) + (p - .5) * 1.2;
    bead.position.y = .36 + Math.abs(Math.sin(t * 2.2)) * .35;
   },
   resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
   pointer() {}, needsFrame: () => true, setQuality() {}, dispose() { K.dispose(sc); }
  };
 }
}
