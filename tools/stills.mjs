// tools/stills.mjs (B3): posters, QA strips and Open Graph cards, rendered by headless Chrome/Edge (tools/cdp.mjs)
// through the real engine's still mode (stage.js: ?still=<id>&p=…&beat=… renders once, then window.__stillReady).
//   node tools/stills.mjs                  → img/worlds/hero-d-<lang>.webp (1000 w, ≤45 KB) + hero-m-<lang>.webp (600 w, ≤24 KB)
//                                            per language (the blade labels are baked into the canvas),
//                                            then img/og-es.jpg, og-ca.jpg, og-en.jpg (1200×630, ≤120 KB) from tools/og.html
//   --posters | --og                       one half only
//   --grow                                 img/worlds/grow-d.webp (16:8 slot, 1000 w) + grow-m.webp (phone 1:1 slot, 600 w), p .5
//   --strip[=hero,build,…]                 QA strip of the worlds (not shipped) → <out>/qa-strip.png + one png per still
//   --out=<dir>                            where QA pngs go (default: <os tmp>/aa-stills)
//   --page=en.html  --base=http://127.0.0.1:4790   page / running server (otherwise tools/serve.mjs on a free port)
// The poster is the transparent canvas only (page, portrait, bead and pills hidden), clipped to the hero slot, so the
// poster and the live deck share one camera and line up pixel for pixel. Over budget → one retry at q0.72, then fail.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cdp from './cdp.mjs';
import { encodeWithin } from './images.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KB = 1000; /* budgets in decimal kB, the stricter reading */
const arg = (k) => { const a = process.argv.find((x) => x === '--' + k || x.startsWith('--' + k + '=')); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : null; };
const PAGE = arg('page') || 'en.html';
const OUT = resolve(String(arg('out') || join(tmpdir(), 'aa-stills')));
const ONLY = arg('posters') ? 'posters' : arg('og') ? 'og' : arg('strip') ? 'strip' : arg('grow') ? 'grow' : null;

/* QA strip: representative moments of every world (p = section progress, beat = Build sprint) */
const STRIP = [['hero', 0, 0], ['build', .5, 0], ['build', .5, 2], ['build', .5, 4], ['build', .5, 7], ['deploy', .5, 0], ['grow', .6, 0], ['drone', .5, 0], ['map', .6, 0]];

async function server() {
  const given = arg('base');
  if (given) return { base: String(given).replace(/\/$/, ''), stop() {} };
  const { serve } = await import(pathToFileURL(join(ROOT, 'tools/serve.mjs')).href);
  const s = await serve({ port: 0, root: ROOT, quiet: true });
  return { base: s.url.replace(/\/$/, ''), stop: () => s.close() };
}

const slotRect = (id) => `(() => { const s = document.querySelector('[data-world-slot="${id}"]'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`;
/* keep only the canvas: every other layer goes invisible, the page background transparent */
/* stills must line up: the engine draws ONE frame into the fixed canvas at the slot rect of that frame, and the page may
   still scroll afterwards (scrollIntoView, smooth scrolling, late fonts). So: never scroll when the slot is already in
   view, scroll instantly otherwise, and record the slot rect at the very moment the engine flags __stillReady; the
   clip uses that rect, which is exactly where the frame was drawn. */
const INIT = `(() => {
  const id = new URLSearchParams(location.search).get('still'); let v;
  Object.defineProperty(window, '__stillReady', { configurable: true, get: () => v, set: (x) => {
    v = x; const s = document.querySelector('[data-world-slot="' + id + '"]');
    if (s) { const r = s.getBoundingClientRect(); window.__stillRect = { x: r.left, y: r.top, width: r.width, height: r.height }; }
  } });
  Element.prototype.scrollIntoView = function () {
    const r = this.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= innerHeight) return;
    window.scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: 'instant' });
  };
})();`;
const CANVAS_ONLY = `(() => { const st = document.createElement('style'); st.textContent = 'html,body{background:transparent!important}body *:not(#stage){visibility:hidden!important}#aurora,#grain{display:none!important}'; document.head.appendChild(st); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`;

/** Render ?still=<id>&p&beat; returns { png, rect } with the canvas clipped to the slot at roughly `width` device px. */
async function still(base, id, p, beat, { width = 1000, vw = 1440, vh = 1000, canvasOnly = true, page: pg = PAGE } = {}) {
  const sep = pg.includes('?') ? '&' : '?', url = `${base}/${pg}${sep}still=${id}&p=${p}&beat=${beat}`;
  let page = await cdp.open(url, { width: vw, height: vh, dpr: 1, init: INIT });
  let rect = await page.evaluate(slotRect(id));
  if (!rect || !rect.width) { await page.close(); throw new Error(`still ${id}: no [data-world-slot=${id}] on ${pg}`); }
  const dpr = Math.max(1, width / rect.width);
  if (dpr > 1.01) { await page.close(); page = await cdp.open(url, { width: vw, height: vh, dpr, init: INIT }); }
  try {
    await page.waitFor('window.__stillReady !== undefined', 60000).catch(() => { throw new Error(`still ${id}: never ready (gate failed? WebGL2 off? flags?)\n  ` + page.logs.slice(-8).map((l) => l.type + ': ' + l.text).join('\n  ')); });
    if ((await page.evaluate('window.__stillReady')) !== true) throw new Error(`still ${id}: stage reported ${await page.evaluate('String(window.__stillReady)')}`);
    if (canvasOnly) await page.evaluate(CANVAS_ONLY);
    rect = (await page.evaluate('window.__stillRect')) || (await page.evaluate(slotRect(id)));
    if (rect.y < 0 || rect.y + rect.height > vh + .5) console.warn(`  ${id}: the slot was only partly in view when drawn (${rect.y.toFixed(0)}…${(rect.y + rect.height).toFixed(0)} of ${vh}), the still is clipped`);
    /* the CDP clip is in document coordinates; the canvas is fixed, so add the current scroll to the viewport rect */
    const [sx, sy] = await page.evaluate('[scrollX, scrollY]');
    const png = await page.screenshot({ format: 'png', transparent: canvasOnly, clip: { x: rect.x + sx, y: rect.y + sy, width: rect.width, height: rect.height } });
    const errs = page.logs.filter((l) => l.type === 'error' || l.type === 'exception');
    if (errs.length) console.warn(`  ${id}: ${errs.length} console error(s): ${errs[0].text.slice(0, 160)}`);
    return { png, rect, dpr };
  } finally { await page.close(); }
}

const LANG_PAGES = [['es', 'index.html'], ['ca', 'ca.html'], ['en', 'en.html']];
async function posters(base) {
  mkdirSync(join(ROOT, 'img/worlds'), { recursive: true });
  for (const [lang, pg] of LANG_PAGES) await poster(base, lang, pg);
}
async function poster(base, lang, pg) {
  const { png, rect, dpr } = await still(base, 'hero', 0, 0, { width: 1000, page: pg });
  console.log(`  hero ${lang} slot ${rect.width.toFixed(0)}×${rect.height.toFixed(0)} css px @${dpr.toFixed(2)}x`);
  const src = 'data:image/png;base64,' + png.toString('base64'), enc = await cdp.open('about:blank', { width: 400, height: 300 });
  try {
    for (const [w, budget, out, levels] of [[1000, 45 * KB, `img/worlds/hero-d-${lang}.webp`, 12], [600, 24 * KB, `img/worlds/hero-m-${lang}.webp`, 10]]) {
      const buf = await encodeWithin(enc, src, { width: w, quality: 0.8, alphaLevels: levels }, budget, out);
      writeFileSync(join(ROOT, out), buf);
      console.log(`  ${out}  ${w} w  ${(buf.length / KB).toFixed(1)} KB`);
    }
  } finally { await enc.close(); }
}

/* the Grow figure's 2D stand-in (board.html .slot-fallback): reserves the slot while the 3D is not live (no CLS) */
async function growPosters(base) {
  mkdirSync(join(ROOT, 'img/worlds'), { recursive: true });
  const enc = await cdp.open('about:blank', { width: 400, height: 300 });
  try {
    for (const [w, vw, vh, budget, out] of [[1000, 1440, 1000, 45 * KB, 'img/worlds/grow-d.webp'], [600, 390, 844, 26 * KB, 'img/worlds/grow-m.webp']]) {
      const { png, rect, dpr } = await still(base, 'grow', 0.5, 0, { width: w, vw, vh });
      console.log(`  grow slot ${rect.width.toFixed(0)}×${rect.height.toFixed(0)} css px @${dpr.toFixed(2)}x (viewport ${vw})`);
      const buf = await encodeWithin(enc, 'data:image/png;base64,' + png.toString('base64'), { width: w, quality: 0.8, alphaLevels: 10 }, budget, out);
      writeFileSync(join(ROOT, out), buf);
      console.log(`  ${out}  ${w} w  ${(buf.length / KB).toFixed(1)} KB`);
    }
  } finally { await enc.close(); }
}

async function strip(base, which) {
  mkdirSync(OUT, { recursive: true });
  const list = STRIP.filter(([id]) => !which || which.includes(id)), shots = [];
  for (const [id, p, beat] of list) {
    try {
      const { png } = await still(base, id, p, beat, { width: 560, vw: 1366, vh: 900, canvasOnly: false });
      const f = join(OUT, `still-${id}-p${p}-b${beat}.png`); writeFileSync(f, png); shots.push(png);
      console.log('  ' + f);
    } catch (e) { console.warn('  skip ' + e.message.split('\n')[0]); }
  }
  if (!shots.length) return;
  const page = await cdp.open('about:blank', { width: 400, height: 300 });
  try {
    const url = await page.evaluate(`(async () => {
      const ims = await Promise.all(${JSON.stringify(shots.map((b) => 'data:image/png;base64,' + b.toString('base64')))}.map((s) => { const i = new Image(); i.src = s; return i.decode().then(() => i); }));
      const H = 420, W = ims.reduce((a, i) => a + Math.round(i.naturalWidth * H / i.naturalHeight) + 12, 12);
      const c = document.createElement('canvas'); c.width = W; c.height = H + 24; const g = c.getContext('2d');
      g.fillStyle = '#F4F1EA'; g.fillRect(0, 0, W, H + 24); let x = 12;
      for (const i of ims) { const w = Math.round(i.naturalWidth * H / i.naturalHeight); g.drawImage(i, x, 12, w, H); x += w + 12; }
      return c.toDataURL('image/png');
    })()`);
    const f = join(OUT, 'qa-strip.png'); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('  ' + f);
  } finally { await page.close(); }
}

async function og(base) {
  for (const lang of ['es', 'ca', 'en']) {
    const out = `img/og-${lang}.jpg`;
    const page = await cdp.open(`${base}/tools/og.html?lang=${lang}`, { width: 1200, height: 630, dpr: 1 });
    try {
      await page.waitFor('window.__ogReady === true', 20000);
      let buf = await page.screenshot({ format: 'jpeg', quality: 86 });
      if (buf.length > 120 * KB) { console.warn(`  ${out}: ${(buf.length / KB).toFixed(1)} KB, retrying at q72`); buf = await page.screenshot({ format: 'jpeg', quality: 72 }); }
      if (buf.length > 120 * KB) throw new Error(`${out}: ${(buf.length / KB).toFixed(1)} KB is over the 120 KB budget`);
      writeFileSync(join(ROOT, out), buf);
      console.log(`  ${out}  1200×630  ${(buf.length / KB).toFixed(1)} KB`);
    } finally { await page.close(); }
  }
}

async function main() {
  const srv = await server();
  console.log('serving ' + srv.base + '  page ' + PAGE);
  try {
    if (!ONLY || ONLY === 'posters') await posters(srv.base);
    if (ONLY === 'grow') await growPosters(srv.base);
    if (!ONLY || ONLY === 'og') {
      for (const [l] of LANG_PAGES) if (!existsSync(join(ROOT, `img/worlds/hero-d-${l}.webp`))) throw new Error(`og: img/worlds/hero-d-${l}.webp is missing, run the posters first`);
      await og(srv.base);
    }
    if (ONLY === 'strip') { const w = arg('strip'); await strip(srv.base, w === true ? null : String(w).split(',')); }
  } finally { await cdp.close(); srv.stop(); }
}
main().catch((e) => { console.error('stills.mjs: ' + (e.message || e)); cdp.close().finally(() => process.exit(1)); });
