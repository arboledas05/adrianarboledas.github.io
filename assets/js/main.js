/* main.js: boot. No static imports; module URLs come from #aa-assets. */
(async () => {
  const html = document.documentElement, no3d = () => html.classList.remove('gl-pre'); /* head-script guess; off on exits */
  let A = {};
  try { const el = document.getElementById('aa-assets'); if (el) A = JSON.parse(el.textContent) || {}; } catch (e) {}
  const url = (k) => (A[k] ? new URL(A[k], document.baseURI).href : new URL('./' + k.split('/').pop(), import.meta.url).href);

  let ctx;
  try {
    const core = await import(url('js/core.js'));
    ctx = core.createCtx();
    const site = await import(url('js/site.js'));
    site.init(document, ctx);
    html.classList.add('aa-ready');
  } catch (e) {
    console.warn('[aa] boot failed, static page kept', e);
    html.classList.add('reveal-safe');
    html.classList.remove('intro'); no3d();
    if (!ctx) return;
  }

  const live = new Map();
  const fail = (name, root, e) => {
    console.warn('[aa] module failed:', name, e);
    if (root && root !== document.body) root.classList.add('mod-failed'); /* never the page */
    if (name === 'stage') no3d();
    ctx.bus.emit('aa:module-failed', { name });
  };
  async function start(name, root) {
    if (live.has(name) || ctx.env.doc) return;
    live.set(name, null);
    try {
      const m = await import(url('js/' + name + '.js'));
      if (ctx.env.doc) { live.delete(name); return; }
      const inst = await m.init(root, ctx);
      live.set(name, inst || null);
    } catch (e) { live.delete(name); fail(name, root, e); }
  }

  ctx.bus.on('aa:doc', ({ on } = {}) => {
    if (on) {
      no3d();
      for (const [name, inst] of live) {
        try { if (inst && inst.destroy) inst.destroy(); } catch (e) { console.warn('[aa] destroy', name, e); }
      }
      live.clear();
    } else {
      location.reload();
    }
  });

  if (ctx.env.doc) return no3d();
  const F = ctx.flags, env = ctx.env;

  for (const [name, sel] of [['bugphone', '.bugphone'], ['cloudlab', '#lab'], ['board', '#board']]) {
    const root = document.querySelector(sel);
    if (F[name] && root) ctx.onVisible(root, (e, isIn) => { if (isIn) start(name, root); }, { rootMargin: '600px' });
  }

  /* 3D stage. Gate fails → nothing fetched, 2D twins stay. */
  const q = new URLSearchParams(location.search), local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const dev = q.has('still') || (local && q.has('w'));
  const gate = (F.stage || dev) && env.webgl2 && !env.reduce && !env.saveData && !env.lowEnd && !env.forced;
  if (!gate) return no3d();
  /* calm(fn): fn once nothing scrolled for 300 ms */
  let lastS = -1e9;
  const mark = () => { lastS = performance.now(); };
  for (const ty of ['wheel', 'scroll', 'touchmove']) addEventListener(ty, mark, { passive: true });
  const calm = (fn) => { const w = 300 - (performance.now() - lastS); w > 0 ? setTimeout(() => calm(fn), w) : fn(); };
  ctx.calm = calm;
  const go = () => calm(() => start('stage', null)); /* stage.init ignores its root */
  if (!env.mobile || dev) {
    const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 200));
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
    return;
  }
  /* phones: after the first scroll AND a non-hero slot within 150 % */
  if (!F.stagePhone || !env.memOk || !('IntersectionObserver' in window)) return no3d();
  const slots = [...document.querySelectorAll('.world-slot[data-world-slot]')].filter((s) => s.dataset.worldSlot !== 'hero');
  if (!slots.length) return no3d();
  let scrolled = false, near = false, io;
  const check = () => { if (scrolled && near) { io.disconnect(); removeEventListener('scroll', onS); go(); } };
  const onS = () => { scrolled = true; check(); };
  io = new IntersectionObserver((es) => { near = es.some((e) => e.isIntersecting) || near; check(); }, { rootMargin: '150% 0px' });
  slots.forEach((s) => io.observe(s));
  addEventListener('scroll', onS, { passive: true, once: true });
})();
