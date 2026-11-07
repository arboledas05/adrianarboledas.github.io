// tools/images.mjs (B3): image variants encoded in a headless Chrome canvas (tools/cdp.mjs), zero dependencies.
//   node tools/images.mjs                → the cut-out variants + the work screenshots whose source jpg still exists
//   node tools/images.mjs --cutout       → img/adrian-cutout-760.webp (≤45 KB) and -480.webp (≤30 KB), alpha kept
//   node tools/images.mjs --work         → img/work/<name>-640.webp (+ -1280.webp), with each entry's redact rects
//   node tools/images.mjs --work --redact=reformasmopri:100,16,66,46   (extra rects, source px, ';' between rects)
// Budgets are decimal kB (the stricter reading). Over budget → one retry at quality 0.72, then the run fails.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cdp from './cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KB = 1000;

/* Work screenshots. crop = source px (x, y, w, h). redact = source-px rects [x, y, w, h, 'fill'|'blur'] applied before
   scaling ('fill', the default, paints the median colour found just right of the rect). The renovation-company header
   shows the company logo and name at its top-left, so that rect is painted out
   (DELTA_BRIEF round 3: the company is never named on the web). */
export const WORK = [
  { name: 'renovation', src: 'img/reformasmopri.jpg', crop: [0, 0, 1024, 640], widths: [640, 1280], redact: [[100, 16, 66, 46]] },
  { name: 'servicempro', crop: [0, 0, 1280, 800], widths: [640, 1280] }
];
export const BUDGET = { 640: 60 * KB, 1280: 140 * KB };

/* His cut-out portrait (alpha). Source img/adrian-cutout.webp is 900×768. */
export const CUTOUT = { src: 'img/adrian-cutout.webp', out: [[760, 45 * KB, 'img/adrian-cutout-760.webp'], [480, 30 * KB, 'img/adrian-cutout-480.webp']] };

/** Encode an image (data URL) in the page: redact (source px) → crop (source px) → width → type/quality. Returns a Buffer.
 *  alphaLevels: WebP stores alpha losslessly, so quantising alpha to N levels (and clearing the colour of fully
 *  transparent pixels) roughly halves transparent files with no visible banding. */
export async function encode(page, src, { crop, width, type = 'image/webp', quality = 0.8, alphaLevels = 0, redact = [] }) {
  const url = await page.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const [x, y, w, h] = ${JSON.stringify(crop || null)} || [0, 0, img.naturalWidth, img.naturalHeight];
    let source = img;
    const R = ${JSON.stringify(redact || [])};
    if (R.length) {
      const s = document.createElement('canvas'); s.width = img.naturalWidth; s.height = img.naturalHeight;
      const sg = s.getContext('2d'); sg.drawImage(img, 0, 0);
      for (const [rx, ry, rw, rh, mode] of R) {
        if (mode === 'blur') {
          const pad = Math.ceil(Math.max(rw, rh) * .6), b = Math.max(8, Math.round(Math.min(rw, rh) / 2.5));
          const t = document.createElement('canvas'); t.width = rw + 2 * pad; t.height = rh + 2 * pad;
          const tg = t.getContext('2d');
          tg.drawImage(s, rx - pad, ry - pad, t.width, t.height, 0, 0, t.width, t.height);
          for (let i = 0; i < 3; i++) { tg.filter = 'blur(' + b + 'px)'; tg.drawImage(t, 0, 0); }
          sg.drawImage(t, pad, pad, rw, rh, rx, ry, rw, rh);
        } else {
          /* default 'fill': paint the rect with the median colour of a 4 px column just right of it (in-paints a flat header) */
          const col = sg.getImageData(Math.min(s.width - 4, rx + rw + 4), ry, 4, rh).data, ch = [[], [], []];
          for (let i = 0; i < col.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(col[i + k]);
          const med = ch.map((a) => a.sort((m, n) => m - n)[a.length >> 1]);
          sg.fillStyle = 'rgb(' + med.join(',') + ')'; sg.fillRect(rx, ry, rw, rh);
        }
      }
      source = s;
    }
    const W = ${width || 0} || w, H = Math.round(W * h / w);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(source, x, y, w, h, 0, 0, W, H);
    const L = ${alphaLevels | 0};
    if (L > 1) {
      const d = g.getImageData(0, 0, W, H), a = d.data, st = 255 / (L - 1);
      for (let i = 0; i < a.length; i += 4) {
        let al = a[i + 3]; al = al < 6 ? 0 : Math.min(255, Math.round(Math.round(al / st) * st));
        a[i + 3] = al; if (!al) a[i] = a[i + 1] = a[i + 2] = 0;
      }
      g.putImageData(d, 0, 0);
    }
    return c.toDataURL(${JSON.stringify(type)}, ${quality});
  })()`);
  if (!url || !url.startsWith('data:' + type)) throw new Error('encode: the browser did not produce ' + type);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

/** Encode with the budget rule: quality q, then one retry at 0.72. Throws if still over. */
export async function encodeWithin(page, src, opts, budget, label) {
  let buf = await encode(page, src, opts);
  if (buf.length > budget && opts.quality > 0.72) {
    console.warn(`  ${label}: ${(buf.length / KB).toFixed(1)} KB > ${(budget / KB) | 0} KB at q${opts.quality}, retrying at q0.72`);
    buf = await encode(page, src, Object.assign({}, opts, { quality: 0.72 }));
  }
  if (buf.length > budget) throw new Error(`${label}: ${(buf.length / KB).toFixed(1)} KB is over the ${(budget / KB) | 0} KB budget`);
  return buf;
}

const dataUrl = (file) => {
  const mime = file.endsWith('.webp') ? 'image/webp' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,` + readFileSync(join(ROOT, file)).toString('base64');
};

/** Cut-out variants: alpha kept, alpha quantised to 24 levels (the hair edge stays soft). */
export async function cutouts(page) {
  if (!existsSync(join(ROOT, CUTOUT.src))) throw new Error(CUTOUT.src + ' not found');
  const src = dataUrl(CUTOUT.src);
  for (const [w, budget, out] of CUTOUT.out) {
    const buf = await encodeWithin(page, src, { width: w, quality: 0.9, alphaLevels: 24 }, budget, out);
    writeFileSync(join(ROOT, out), buf);
    console.log(`  ${out}  ${w} w  ${(buf.length / KB).toFixed(1)} KB`);
  }
}

/** Work screenshots with their redact rects (plus extra ones from --redact=name:x,y,w,h;x,y,w,h). */
export async function work(page, extra = {}) {
  mkdirSync(join(ROOT, 'img/work'), { recursive: true });
  let failed = 0;
  for (const w of WORK) {
    const file = w.src || 'img/' + w.name + '.jpg';
    if (!existsSync(join(ROOT, file))) { console.warn(`skip ${w.name}: ${file} not found (already converted and deleted?)`); continue; }
    const src = dataUrl(file), redact = (w.redact || []).concat(extra[w.name] || []);
    for (const width of w.widths) {
      const out = `img/work/${w.name}-${width}.webp`;
      try {
        const buf = await encodeWithin(page, src, { crop: w.crop, width, quality: 0.8, redact }, BUDGET[width], out);
        writeFileSync(join(ROOT, out), buf);
        console.log(`  ${out}  ${(buf.length / KB).toFixed(1)} KB  (crop ${w.crop.join(',')}${redact.length ? ' · redacted ' + redact.length : ''})`);
      } catch (e) { failed++; console.error('  FAIL ' + e.message); }
    }
  }
  return failed;
}

function parseRedact(v) {
  const out = {};
  if (!v) return out;
  const [name, rects] = String(v).split(':');
  out[name] = (rects || '').split(';').filter(Boolean).map((r) => r.split(',').map(Number)).filter((r) => r.length === 4 && r.every(Number.isFinite));
  return out;
}

async function main() {
  const has = (k) => process.argv.some((a) => a === '--' + k || a.startsWith('--' + k + '='));
  const val = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
  const all = !has('cutout') && !has('work');
  const page = await cdp.open('about:blank', { width: 400, height: 300 });
  let failed = 0;
  try {
    if (all || has('cutout')) { try { await cutouts(page); } catch (e) { failed++; console.error('  FAIL ' + e.message); } }
    if (all || has('work')) failed += await work(page, parseRedact(val('redact')));
  } finally { await cdp.close(); }
  if (failed) { console.error(failed + ' image(s) failed'); process.exit(1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e.message || e); cdp.close().finally(() => process.exit(1)); });
}
