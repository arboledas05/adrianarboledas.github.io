/* core.js (B2): ctx factory shared by every module, zero deps. */
const J = {};
function json(id) {
 if (id in J) return J[id];
 let v = null;
 try { const el = document.getElementById(id); if (el) v = JSON.parse(el.textContent); }
 catch (e) { console.warn('[aa] JSON #' + id, e); }
 return (J[id] = v);
}
export function createCtx() {
 const html = document.documentElement, nav = navigator;
 const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
 const lang = (html.lang || 'en').slice(0, 2).toLowerCase();
 const dm = nav.deviceMemory, hc = nav.hardwareConcurrency;
 const env = {
  lang,
  reduce: mm('(prefers-reduced-motion: reduce)') || html.classList.contains('rm'),
  fine: mm('(pointer: fine)'),
  coarse: mm('(pointer: coarse)'),
  saveData: !!(nav.connection && nav.connection.saveData),
  lowEnd: (dm > 0 && dm <= 2) || (hc > 0 && hc <= 2),
  memOk: !(dm > 0 && dm < 4) && !(hc > 0 && hc < 4),
  forced: mm('(forced-colors: active)'),
  webgl2: typeof WebGL2RenderingContext !== 'undefined',
  mobile: mm('(max-width: 820px)'),
  get doc() { return html.classList.contains('doc'); }
 };

 const dict = json('aa-i18n') || {};
 function t(key, vars) {
  let v = dict;
  for (const k of String(key).split('.')) { v = v != null ? v[k] : undefined; }
  if (typeof v !== 'string') { console.warn('[aa] i18n', key); return key; }
  return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : v;
 }

 /* bus: sticky last detail; mirrored as DOM events */
 const subs = new Map(), lastD = new Map();
 const bus = {
  on(name, fn) {
   if (!subs.has(name)) subs.set(name, new Set());
   subs.get(name).add(fn);
   return () => subs.get(name).delete(fn);
  },
  emit(name, detail = {}) {
   lastD.set(name, detail);
   for (const fn of [...(subs.get(name) || [])]) try { fn(detail); } catch (e) { console.warn('[aa]', name, e); }
   try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  },
  last(name) { return lastD.get(name); }
 };

 /* raf: one loop, phases scroll → read → update → render. Each phase is snapshotted when it starts,
    so a job added by an earlier phase runs in the same frame. Sleeps when empty or hidden. */
 const P = { scroll: new Set(), read: new Set(), update: new Set(), render: new Set() }, PS = Object.values(P);
 const busy = () => PS.some((s) => s.size);
 /* id: 0 = asleep, -1 = frame() is running (a job that adds a job, or a 'scroll' listener fired from inside a phase,
    must not arm a second loop: frame() re-arms once at its end), else the pending rAF handle */
 let id = 0, prev = 0;
 function frame(now) {
  id = -1;
  const dt = prev ? Math.min(now - prev, 1000) : 16.7;
  prev = now;
  for (const set of PS) for (const fn of [...set]) {
   try { fn(now, dt); } catch (e) { set.delete(fn); console.warn('[aa]', e); }
  }
  if (busy() && !document.hidden) id = requestAnimationFrame(frame);
  else { id = 0; prev = 0; }
 }
 const wake = () => { if (!id && busy() && !document.hidden) { prev = 0; id = requestAnimationFrame(frame); } };
 document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (id > 0) cancelAnimationFrame(id); id = 0; prev = 0; } else wake();
 });
 const raf = { add(fn, phase = 'update') { const s = P[phase] || P.update; s.add(fn); wake(); return () => s.delete(fn); } };

 function onVisible(el, fn, { rootMargin = '0px', threshold = 0, once = true } = {}) {
  if (!el) return () => {};
  if (!('IntersectionObserver' in window)) { fn(null, true); return () => {}; }
  const io = new IntersectionObserver((es) => {
   for (const e of es) {
    fn(e, e.isIntersecting);
    if (once && e.isIntersecting) { io.disconnect(); break; }
   }
  }, { rootMargin, threshold });
  io.observe(el);
  return () => io.disconnect();
 }

 const nf = new Map();
 function fmt(n, { decimals = 0 } = {}) {
  if (!nf.has(decimals)) {
   try { nf.set(decimals, new Intl.NumberFormat(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })); }
   catch (e) { nf.set(decimals, { format: (x) => Number(x).toFixed(decimals) }); }
  }
  return nf.get(decimals).format(n);
 }

 const scripts = new Map();
 function loadScript(url) {
  if (!scripts.has(url)) {
   scripts.set(url, new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => { scripts.delete(url); rej(new Error('load ' + url)); };
    document.head.appendChild(s);
   }));
  }
  return scripts.get(url);
 }

 return {
  env, t, bus, raf, onVisible, fmt, loadScript,
  data: json,
  flags: json('aa-flags') || {}, /* missing: all falsy */
  assets: json('aa-assets') || {}
 };
}
