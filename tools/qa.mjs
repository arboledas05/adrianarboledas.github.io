#!/usr/bin/env node
// tools/qa.mjs (INT) — headless QA for the web CV v14 "Toy Studio" (zero deps; Node ≥ 22, Chrome or Edge).
//
//   node tools/qa.mjs --out <dir> [--w=all|flags] [--only=en:1440x900,es:390x844] [--vps=375x667,1920x1080] [--modes=worlds,rm,nojs,doc,print,nocdn,jumps]
//
// Serves the repo on a free port (tools/serve.mjs) and, for every language × viewport, scrolls each world figure
// into view, waits for it to go live (or for its 2D twin), and saves a screenshot. It also runs the reduced-motion,
// no-JS, ?doc and print-to-PDF passes. Checks collected into <out>/qa-report.json (+ a short qa-report.md):
//   - console errors / exceptions        - horizontal overflow (scrollWidth > innerWidth)
//   - WebGL contexts created (must be ≤1) - canvases in the DOM
//   - stacking-context ancestors of every .world-slot (error; a sticky ancestor passes only with z-index ≥ 3 = --z-slotui,
//     so the slot UI paints above the fixed canvas; position:fixed = warning)
//   - nocdn: three.js blocked → the 2D controls (Bugphone toggles, Cloud Lab, Board) must stay displayed
//   - per world: state (live / 2D), rAF frame time (avg / p95) and draw calls per frame while it is on screen,
//     shader programs linked while it warmed up, the engine tier (gl-qN) after it ran
//   - print: number of A4 pages per language
//   - jumps: a real click on an in-page link (nav '#europe' at 1440, hero '#contact' at 390 (EN), glance '#europe' at 390 (ES)) must land the target just
//     under the nav (|top − nav bottom| < 60 px) or at the end of the page — catches lazy-size placeholders that cut jumps short
// --w=all renders every world (stage.js honours it on localhost only); --w=flags uses src/flags.json as shipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdp from './cdp.mjs';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); if (a) return a.slice(k.length + 3); const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(ROOT, 'qa-out')));
const WMODE = arg('w', 'all');
const MODES = new Set(arg('modes', 'worlds,rm,nojs,doc,print,nocdn,jumps').split(','));
const LANGS = { en: 'en.html', es: 'index.html', ca: 'ca.html' };
// --vps=375x667,1920x1080 replaces the default viewport list (combine with --only=en,es to pick languages).
const VPS = arg('vps', '') ? arg('vps').split(',').map((s) => s.trim().split('x').map(Number))
  : [[360, 740], [390, 844], [768, 1024], [834, 1112], [1366, 768], [1440, 900]]; // 834: iPad Pro 11 portrait (engine desktop mode, ≥821)
const ONLY = arg('only', '') ? arg('only').split(',').map((s) => s.trim()) : null;
const WORLDS = ['build', 'deploy', 'grow', 'drone', 'map'];
const LIVE_MS = +arg('live-ms', 16000);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { when: new Date().toISOString(), wmode: WMODE, renderer: null, runs: [], print: [], errors: [] };

// instrumentation injected before the page's scripts: WebGL context / draw / program counters
const INIT = (clearDoc) => `(() => {
  ${clearDoc ? "try { localStorage.removeItem('aa-doc'); sessionStorage.clear(); } catch (e) {}" : ''}
  const Q = window.__qa = { ctx: 0, kinds: [], draws: 0, links: 0, renderer: '' };
  const oc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) {
    const c = oc.call(this, t, ...a);
    if (c && /webgl/i.test(t) && !this.__qac) {
      this.__qac = 1; Q.ctx++; Q.kinds.push(t + '#' + (this.id || '?'));
      try { const d = c.getExtension('WEBGL_debug_renderer_info'); Q.renderer = String(c.getParameter(d ? d.UNMASKED_RENDERER_WEBGL : c.RENDERER)); } catch (e) {}
    }
    return c;
  };
  for (const P of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!P) continue;
    for (const m of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const f = P.prototype[m]; if (!f) continue;
      P.prototype[m] = function (...a) { Q.draws++; return f.apply(this, a); };
    }
    const l = P.prototype.linkProgram; P.prototype.linkProgram = function (p) { Q.links++; return l.call(this, p); };
  }
})();`;

// in-page probes ----------------------------------------------------------------------------------
const PROBE = `(() => {
  const d = document, de = d.documentElement;
  const bad = [];
  /* the fixed full-viewport canvas is only in play on desktop with the engine on; on phones it lives inside the slot */
  const cvs = d.getElementById('stage'), fixedCv = de.classList.contains('gl') && !!cvs && !(cvs.parentElement && cvs.parentElement.dataset.worldSlot);
  for (const slot of d.querySelectorAll('.world-slot')) {
    for (let el = slot.parentElement; el && el !== de; el = el.parentElement) {
      const s = getComputedStyle(el), why = [];
      if (s.transform !== 'none') why.push('transform');
      if (+s.opacity < 1) why.push('opacity ' + s.opacity);
      if (s.filter !== 'none') why.push('filter');
      if (s.backdropFilter && s.backdropFilter !== 'none') why.push('backdrop-filter');
      if (/transform|opacity|filter/.test(s.willChange)) why.push('will-change ' + s.willChange);
      if (s.isolation === 'isolate') why.push('isolation');
      if (/paint|layout|strict|content/.test(s.contain)) why.push('contain ' + s.contain);
      if (s.mixBlendMode !== 'normal') why.push('mix-blend');
      if (s.zIndex !== 'auto' && s.position !== 'static') why.push('z-index ' + s.zIndex);
      if (s.position === 'sticky' || s.position === 'fixed') why.push('position ' + s.position);
      /* a sticky ancestor always makes a stacking context: fine only when it sits at the slot-UI layer (z ≥ 3) */
      const zOk = s.position === 'sticky' && (!fixedCv || (s.zIndex !== 'auto' && +s.zIndex >= 3));
      const rest = why.filter((w) => !(zOk && (w === 'position sticky' || /^z-index /.test(w))));
      if (rest.length) bad.push({ slot: slot.dataset.worldSlot, el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''), why: rest.join(', ') + (s.position === 'sticky' && !zOk ? ' (needs z-index ≥ 3)' : ''), soft: rest.every((w) => w === 'position fixed') });
    }
  }
  const slots = {};
  for (const s of d.querySelectorAll('.world-slot')) { const r = s.getBoundingClientRect(); slots[s.dataset.worldSlot] = { cls: s.className.replace('world-slot', '').trim(), h: Math.round(r.height), w: Math.round(r.width), mode: (s.closest('.world')?.querySelector('.fig-mode')?.textContent || '').trim() }; }
  return {
    overflowX: Math.max(de.scrollWidth, d.body.scrollWidth) - innerWidth,
    htmlClass: de.className, world: de.dataset.world || null,
    canvases: d.querySelectorAll('canvas').length,
    stageParent: (() => { const c = d.getElementById('stage'); return c ? (c.parentElement.dataset.worldSlot ? 'slot:' + c.parentElement.dataset.worldSlot : c.parentElement.tagName.toLowerCase()) : null; })(),
    qa: window.__qa ? { ctx: window.__qa.ctx, kinds: window.__qa.kinds, renderer: window.__qa.renderer, links: window.__qa.links } : null,
    stacking: bad, slots, docH: de.scrollHeight,
  };
})()`;

const FRAMES = (ms) => `new Promise((res) => {
  const ts = [], d0 = window.__qa ? window.__qa.draws : 0; let t0 = 0;
  const f = (t) => { if (!t0) t0 = t; ts.push(t); if (t - t0 < ${ms}) requestAnimationFrame(f); else {
    const dt = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b);
    const avg = dt.reduce((a, b) => a + b, 0) / Math.max(1, dt.length);
    res({ frames: ts.length, avg: +avg.toFixed(1), p95: +(dt[Math.floor(dt.length * .95)] || 0).toFixed(1), max: +(dt[dt.length - 1] || 0).toFixed(1),
      drawsPerFrame: window.__qa ? +(((window.__qa.draws - d0) / Math.max(1, ts.length))).toFixed(1) : null });
  } };
  requestAnimationFrame(f);
})`;

const scrollTo = (sel, block = 'center') => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: '${block}', behavior: 'instant' }); window.dispatchEvent(new Event('scroll')); return true; })()`;

async function shot(page, name, { jpeg = true } = {}) {
  const buf = await page.screenshot(jpeg ? { format: 'jpeg', quality: 72 } : {});
  const f = path.join(OUT, name + (jpeg ? '.jpg' : '.png'));
  fs.writeFileSync(f, buf);
  return path.basename(f);
}

async function waitLive(page, id, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(`(() => { const s = document.querySelector('[data-world-slot="${id}"]'); if (!s) return 'missing'; if (s.classList.contains('is-live')) return 'live'; const h = document.documentElement; if (!h.classList.contains('gl') && window.__aaGlDone) return '2d'; return s.classList.contains('is-warm') ? 'warm' : 'cold'; })()`);
    if (st === 'live' || st === 'missing' || st === '2d') return { st, ms: Date.now() - t0 };
    await sleep(250);
  }
  return { st: 'timeout', ms };
}

function errorsOf(logs) {
  return logs.filter((l) => l.type === 'error' || l.type === 'exception' || l.type === 'assert').map((l) => l.text.slice(0, 300));
}

// one language × viewport, worlds pass ----------------------------------------------------------
async function runWorlds(lang, [w, h], { tag = 'worlds', media, nojs = false, query } = {}) {
  const mobile = w <= 820;
  const q = query ?? (WMODE === 'all' ? '?w=all' : '');
  const url = base + LANGS[lang] + q;
  const name = `${tag}_${lang}_${w}x${h}`;
  const run = { name, lang, vp: `${w}x${h}`, mode: tag, url, shots: [], worlds: {}, errors: [] };
  const t0 = Date.now();
  let page;
  try {
    page = await cdp.open(url, { width: w, height: h, dpr: mobile ? 2 : 1, mobile, media, nojs, init: nojs ? undefined : INIT(true) + "document.addEventListener('aa:gl', () => { window.__aaGlDone = 1; });" });
    await sleep(nojs ? 600 : 1800);
    // hero (desktop: wait for the hero world when it is on)
    if (!nojs && !mobile && tag === 'worlds') { const r = await waitLive(page, 'hero', LIVE_MS); run.worlds.hero = { state: r.st, waitMs: r.ms }; await sleep(r.st === 'live' ? 1500 : 200); if (r.st === 'live') run.worlds.hero.frames = await page.evaluate(FRAMES(1500)); }
    run.shots.push(await shot(page, `${name}_00-hero`));
    let i = 1;
    for (const id of WORLDS) {
      const fig = `figure.world[data-world="${id}"]`;
      const ok = await page.evaluate(scrollTo(fig));
      if (!ok) { run.worlds[id] = { state: 'missing' }; continue; }
      const links0 = nojs ? 0 : await page.evaluate('window.__qa ? window.__qa.links : 0');
      await sleep(400);
      await page.evaluate(scrollTo(fig)); // the grow slot opens on .is-live, so re-centre once
      let st = { st: 'n/a', ms: 0 };
      if (!nojs && tag === 'worlds') st = await waitLive(page, id, LIVE_MS);
      if (st.st === 'live') { await sleep(1800); await page.evaluate(scrollTo(fig)); await sleep(500); }
      else await sleep(nojs ? 300 : 900);
      const rec = { state: st.st, waitMs: st.ms };
      if (!nojs) {
        rec.frames = await page.evaluate(FRAMES(1500));
        rec.programsLinked = (await page.evaluate('window.__qa ? window.__qa.links : 0')) - links0;
        rec.tier = ((await page.evaluate('document.documentElement.className')).match(/gl-q\d/) || ['none'])[0];
      }
      run.worlds[id] = rec;
      run.shots.push(await shot(page, `${name}_${String(i++).padStart(2, '0')}-${id}`));
    }
    await page.evaluate(scrollTo('#contact', 'start'));
    await sleep(700);
    run.shots.push(await shot(page, `${name}_06-contact`));
    run.probe = await page.evaluate(PROBE);
    run.errors = errorsOf(page.logs);
    run.warnings = page.logs.filter((l) => l.type === 'warning').map((l) => l.text.slice(0, 200)).slice(0, 8);
    if (run.probe.qa && run.probe.qa.renderer && !report.renderer) report.renderer = run.probe.qa.renderer;
  } catch (e) {
    run.errors.push('QA harness: ' + e.message);
  } finally {
    if (page) await page.close();
  }
  run.seconds = Math.round((Date.now() - t0) / 1000);
  report.runs.push(run);
  const p = run.probe || {};
  console.log(`  ${name.padEnd(28)} ${run.seconds}s  err:${run.errors.length}  ovf:${p.overflowX ?? '?'}  ctx:${p.qa ? p.qa.ctx : '-'}  ` + Object.entries(run.worlds).map(([k, v]) => `${k}:${v.state}${v.frames ? '/' + v.frames.avg + 'ms' : ''}`).join(' '));
  fs.writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 1));
}

async function runDoc(lang, [w, h]) {
  const name = `doc_${lang}_${w}x${h}`;
  const run = { name, lang, vp: `${w}x${h}`, mode: 'doc', shots: [], errors: [] };
  let page;
  try {
    page = await cdp.open(base + LANGS[lang] + '?doc', { width: w, height: h, dpr: w <= 820 ? 2 : 1, mobile: w <= 820, init: INIT(false) });
    await sleep(1500);
    run.probe = await page.evaluate(PROBE);
    // tall single shot of the doc column (capped) + the first viewport
    run.shots.push(await shot(page, `${name}_00-top`));
    const H = Math.min(run.probe.docH, 16000);
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: H, deviceScaleFactor: 1, mobile: w <= 820 });
    await sleep(800);
    run.shots.push(await shot(page, `${name}_01-full`));
    run.errors = errorsOf(page.logs);
    await page.evaluate("try { localStorage.removeItem('aa-doc'); } catch (e) {}");
  } catch (e) { run.errors.push('QA harness: ' + e.message); } finally { if (page) await page.close(); }
  report.runs.push(run);
  console.log(`  ${name.padEnd(28)} err:${run.errors.length}  docH:${run.probe ? run.probe.docH : '?'}  html:${run.probe ? run.probe.htmlClass : '?'}`);
}

// three.js CDN blocked (ad-blocker, proxy, offline): the page must keep every 2D control ------------
async function runNoCdn(lang, [w, h]) {
  const name = `nocdn_${lang}_${w}x${h}`;
  const run = { name, lang, vp: `${w}x${h}`, mode: 'nocdn', shots: [], errors: [] };
  let page;
  try {
    page = await cdp.open(base + LANGS[lang] + (WMODE === 'all' ? '?w=all' : ''), { width: w, height: h, init: INIT(true) });
    await page.send('Network.enable');
    await page.send('Network.setBlockedURLs', { urls: ['*three.module*', '*three@*'] });
    await page.evaluate('location.reload()');
    await sleep(3500);
    for (const sel of ['#build', '#deploy', '#grow']) { await page.evaluate(scrollTo(sel)); await sleep(900); }
    await sleep(1500);
    run.probe = await page.evaluate(`(() => {
      const shown = (s) => [...document.querySelectorAll(s)].map((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0);
      const r = { bodyFailed: document.body.classList.contains('mod-failed'), gl: document.documentElement.classList.contains('gl') };
      for (const s of ['.bp-toggles', '.lab-js', '.b-js']) { const a = shown(s); r[s] = a.length ? a.filter(Boolean).length + '/' + a.length : 'none'; }
      return r;
    })()`);
    const p = run.probe;
    if (p.bodyFailed) run.errors.push('nocdn: <body> got .mod-failed (hides every 2D control)');
    for (const s of ['.bp-toggles', '.lab-js', '.b-js']) if (p[s] !== 'none' && /^0\//.test(p[s])) run.errors.push(`nocdn: ${s} hidden (${p[s]})`);
    run.errors.push(...errorsOf(page.logs).filter((t) => !/three|Failed to fetch|ERR_BLOCKED|net::/i.test(t)));
    await page.evaluate(scrollTo('#lab'));
    await sleep(500);
    run.shots.push(await shot(page, `${name}_lab`));
  } catch (e) { run.errors.push('QA harness: ' + e.message); } finally { if (page) await page.close(); }
  report.runs.push(run);
  console.log(`  ${name.padEnd(28)} err:${run.errors.length}  ${JSON.stringify(run.probe || {})}`);
}

// in-page jumps: a real mouse click from the top of the page, then measure where the target landed ----------------
async function runJump(lang, [w, h], link, target) {
  const mobile = w <= 820;
  const name = `jump_${lang}_${w}x${h}_${target.slice(1)}`;
  const run = { name, lang, vp: `${w}x${h}`, mode: 'jump', link, target, shots: [], errors: [] };
  let page;
  try {
    page = await cdp.open(base + LANGS[lang], { width: w, height: h, dpr: mobile ? 2 : 1, mobile, init: INIT(true) });
    await sleep(2200);
    const at = await page.evaluate(`(() => { const a = document.querySelector(${JSON.stringify(link)}); if (!a) return null; let r = a.getBoundingClientRect(); if (r.bottom > innerHeight - 8) { a.scrollIntoView({ block: 'center', behavior: 'instant' }); r = a.getBoundingClientRect(); } return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
    if (!at || !at.w) throw new Error('link not visible: ' + link);
    if (mobile) { // a tap, as a phone does it
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
      await sleep(60);
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    await sleep(5000);
    run.probe = await page.evaluate(`(() => { const t = document.querySelector(${JSON.stringify(target)}), n = document.getElementById('nav'); const nb = n ? n.offsetTop + n.offsetHeight : 0; const se = document.scrollingElement; return { top: Math.round(t.getBoundingClientRect().top), navBottom: Math.round(nb), scrollY: Math.round(scrollY), atEnd: scrollY + innerHeight >= se.scrollHeight - 4 }; })()`);
    const p = run.probe;
    p.off = p.top - p.navBottom;
    if (Math.abs(p.off) >= 60 && !p.atEnd) run.errors.push(`jump ${link} → ${target}: target top ${p.top}px, nav bottom ${p.navBottom}px (off by ${p.off}px)`);
    run.errors.push(...errorsOf(page.logs));
    run.shots.push(await shot(page, name));
  } catch (e) { run.errors.push('QA harness: ' + e.message); } finally { if (page) await page.close(); }
  report.runs.push(run);
  console.log(`  ${name.padEnd(34)} err:${run.errors.length}  ${JSON.stringify(run.probe || {})}`);
}

async function runPrint(lang) {
  let page;
  const rec = { lang, file: null, pages: null, errors: [] };
  try {
    page = await cdp.open(base + LANGS[lang], { width: 1366, height: 900, init: INIT(true) });
    await sleep(1500);
    const pdf = await page.printPDF({ paperWidth: 8.27, paperHeight: 11.69, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, preferCSSPageSize: true });
    const f = `print_${lang}_A4.pdf`;
    fs.writeFileSync(path.join(OUT, f), pdf);
    rec.file = f; rec.kb = Math.round(pdf.length / 1024);
    rec.pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    rec.errors = errorsOf(page.logs);
  } catch (e) { rec.errors.push('QA harness: ' + e.message); } finally { if (page) await page.close(); }
  report.print.push(rec);
  console.log(`  print ${lang}: ${rec.pages} page(s) · ${rec.kb} KB${rec.errors.length ? ' · errors ' + rec.errors.length : ''}`);
}

// main --------------------------------------------------------------------------------------------
const srv = await serve({ port: 0, root: ROOT, quiet: true });
const base = srv.url;
console.log(`qa · ${base} · out ${OUT} · w=${WMODE} · modes ${[...MODES].join(',')}`);
const want = (lang, vp) => !ONLY || ONLY.includes(`${lang}:${vp[0]}x${vp[1]}`) || ONLY.includes(lang) || ONLY.includes(`${vp[0]}x${vp[1]}`);
try {
  if (MODES.has('worlds')) for (const lang of Object.keys(LANGS)) for (const vp of VPS) if (want(lang, vp)) await runWorlds(lang, vp);
  if (MODES.has('rm')) for (const vp of [[390, 844], [1440, 900]]) if (want('en', vp)) await runWorlds('en', vp, { tag: 'rm', media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (MODES.has('nojs')) for (const [lang, vp] of [['en', [390, 844]], ['en', [1440, 900]], ['es', [360, 740]], ['ca', [1366, 768]]]) if (want(lang, vp)) await runWorlds(lang, vp, { tag: 'nojs', nojs: true, query: '' });
  if (MODES.has('doc')) for (const [lang, vp] of [['en', [1366, 768]], ['en', [390, 844]], ['es', [1440, 900]], ['ca', [360, 740]]]) if (want(lang, vp)) await runDoc(lang, vp);
  if (MODES.has('nocdn')) for (const vp of [[1440, 900], [390, 844]]) if (want('en', vp)) await runNoCdn('en', vp);
  if (MODES.has('jumps')) for (const [lang, vp, link, target] of [['en', [1440, 900], '#nav .nav-links a[href="#europe"]', '#europe'], ['en', [1440, 900], '#nav .nav-links a[href="#contact"]', '#contact'], ['en', [390, 844], '.hero a[href="#contact"]', '#contact'], ['es', [390, 844], '#glance a[href="#europe"]', '#europe'], /* 8-nov-2026: the glance 3-path router */ ...['#build-accenture', '#sites-h', '#lab'].flatMap((t) => [['es', [1494, 700], `.glance-paths a[href="${t}"]`, t], ['en', [390, 844], `.glance-paths a[href="${t}"]`, t]])]) if (want(lang, vp)) await runJump(lang, vp, link, target);
  if (MODES.has('print')) for (const lang of Object.keys(LANGS)) if (!ONLY || ONLY.includes(lang) || ONLY.includes('print')) await runPrint(lang);
} finally {
  await cdp.close();
  await srv.close();
}

// summary -----------------------------------------------------------------------------------------
const lines = [`# QA ${report.when} (w=${WMODE})`, '', `GL renderer: ${report.renderer || 'n/a'}`, ''];
let fails = 0;
for (const r of report.runs) {
  const p = r.probe || {};
  const hard = (p.stacking || []).filter((s) => !s.soft);
  const issues = [];
  if (r.errors.length) issues.push(`${r.errors.length} console error(s)`);
  if (p.overflowX > 0) issues.push(`horizontal overflow ${p.overflowX}px`);
  if (p.qa && p.qa.ctx > 1) issues.push(`${p.qa.ctx} WebGL contexts`);
  if (p.canvases > 1) issues.push(`${p.canvases} canvases`);
  if (hard.length) issues.push(`stacking: ${hard.map((s) => s.slot + '<' + s.el + ' (' + s.why + ')').join('; ')}`);
  if (issues.length) fails++;
  const ws = Object.entries(r.worlds || {}).map(([k, v]) => `${k} ${v.state}${v.frames ? ` ${v.frames.avg}/${v.frames.p95} ms, ${v.frames.drawsPerFrame} draws/f` : ''}${v.tier ? ' ' + v.tier : ''}`).join(' · ');
  lines.push(`- **${r.name}** ${issues.length ? '✕ ' + issues.join(' · ') : '✓'}${ws ? '\n  - ' + ws : ''}`);
}
for (const p of report.print) { if (p.pages > 2 || p.errors.length) fails++; lines.push(`- print ${p.lang}: ${p.pages} A4 page(s), ${p.kb} KB${p.pages > 2 ? ' ✕ over the 2-page target' : ''}${p.errors.length ? ' ✕ ' + p.errors.join(' | ') : ''}`); }
fs.writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(OUT, 'qa-report.md'), lines.join('\n') + '\n');
console.log(`\n${fails ? '✕' : '✓'} ${report.runs.length} run(s), ${fails} with issues · report ${path.join(OUT, 'qa-report.md')}`);
process.exit(0);
