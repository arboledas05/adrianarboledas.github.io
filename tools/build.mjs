#!/usr/bin/env node
// tools/build.mjs — web CV v14 static builder (Node >= 18, zero dependencies).
// Renders index.html (ES), ca.html and en.html (EN = x-default) from src/page.html + src/partials/*.html
// + content/<lang>/*.json + src/flags.json. Also writes assets/css/app.css and sitemap.xml.
//   node tools/build.mjs            dev build: missing partials/files are warnings
//   node tools/build.mjs --release  strict build + tools/audit.mjs
//
// Template syntax (see SPEC modules → tools/build.mjs):
//   {{t key.path}}  escaped text          {{h key.path}}  whitelisted HTML from the dictionary
//   {{url key.path}} the string URL-encoded (encodeURIComponent), for a query value such as a mailto subject
//   {{json key}}    JSON for an attribute {{> name}}      partial src/partials/name.html (nestable)
//   {{if cond}}…{{else}}…{{/if}}   cond = flag | !flag | flag path (worlds.hero) | ns:key (live:domain,
//                                   nexaStatus:delivered, file:path or file:.field → that repo file exists)
//                                   | a=b / a==b / a!=b | .field (current {{each}} item)
//   {{each key}}…{{/each}}  inside: {{t .field}} {{t .}} {{@index}}; key paths may use [.field]
//   {{lang}} {{locale}} {{page es}} {{abs es}} {{self}} {{base}} {{asset path}} {{size path}}
//   {{jsonld}} {{boot-json}}
// Dictionary strings may contain {size:path/to/file.pdf} (replaced by the locale file size) and
// {name} placeholders filled by {{t key name=value}}.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = process.argv.includes('--release');
const BASE = 'https://arboledas05.github.io/adrianarboledas.github.io/';
const LANGS = ['es', 'ca', 'en'];
const PAGE = { es: 'index.html', ca: 'ca.html', en: 'en.html' };
const LOCALE = { es: 'es_ES', ca: 'ca_ES', en: 'en_GB' };
const CSS_ORDER = ['site', 'stage', 'hero', 'bugphone', 'cloudlab', 'board', 'drone', 'map'];
// #aa-i18n: whole namespaces, or dotted sub-trees (only what the runtime and the 3D worlds read through ctx.t)
// INT (5 Nov): pruned to what the shipped JS actually reads (grep of every t() / ctx.t() call in assets/js):
//   site.js ui.* · stage.js ui.w.mode* · bugphone.js bug.* · cloudlab.js lab.c.* / lab.i.* / lab.ld.asgR|asgV
//   board.js board.how|back · w-build.js build.acc.sprints.N.k, bug.stN, ui.w.build.* · w-hero.js ui.w.hero.bN
// drone.*, europe.* and the long lab / board copy are DOM-only (templates, data-* attributes), so they stay out.
const BOOT_NS = ['ui', 'bug', 'lab.c', 'lab.i', 'lab.ld.asgR', 'lab.ld.asgV', 'board.how', 'board.back', 'build.acc.sprints'];
// long strings rendered only into the HTML (sr-only lists, fact lists): kept out of #aa-i18n to save bytes.
// JS must never read these keys (they stay in the dictionaries for the templates).
const BOOT_OMIT = ['lab.nexa.desc', 'lab.nexa.facts', 'lab.nexa.svgD', 'lab.ld.desc', 'lab.ld.facts', 'lab.ld.svgD'];
const BUILD_ONLY_FLAGS = ['liveTags'];
// non-JS files hashed into #aa-assets (key = repo path); a missing one is skipped with a warning
const EXTRA_ASSETS = ['assets/data/atlantic.json', 'img/adrian-cutout-760.webp', 'img/adrian-cutout-480.webp'];
// retired modules: never shipped in #aa-assets nor counted in the size table, even while still on disk
const RETIRED_JS = ['planet.js', 'bg.js'];

let errors = 0;
let warnings = 0;
const seen = new Set();
const err = (m) => { errors++; console.error('  ✕ ' + m); };
const warn = (m) => { if (seen.has(m)) return; seen.add(m); warnings++; console.warn('  ! ' + m); };
const soft = (m) => (RELEASE ? err(m) : warn(m));
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const readText = (p) => fs.readFileSync(abs(p), 'utf8').replace(/^\uFEFF/, '');

function readJSON(p) {
  try { return JSON.parse(readText(p)); } catch (e) { err(`${p}: invalid JSON (${e.message})`); return null; }
}

/* ---------------------------------------------------------------- flags */
const flags = readJSON('src/flags.json') || {};

/* ---------------------------------------------------------- dictionaries */
function stripPrivate(v) {
  if (Array.isArray(v)) return v.map(stripPrivate);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) o[k] = stripPrivate(x);
    return o;
  }
  return v;
}
const sameAllow = new Set();
const dict = {};
for (const lang of LANGS) {
  const dir = `content/${lang}`;
  const d = {};
  if (!exists(dir)) { err(`missing ${dir}/`); dict[lang] = d; continue; }
  for (const f of fs.readdirSync(abs(dir)).filter((x) => x.endsWith('.json')).sort()) {
    let obj = readJSON(`${dir}/${f}`);
    if (!obj || typeof obj !== 'object') continue;
    const ns = f.replace(/\.json$/, '');
    if (Array.isArray(obj._same)) obj._same.forEach((s) => sameAllow.add(String(s)));
    // a namespace file may be {"bug":{…}} or the bare namespace object {…}
    if (ns !== 'core' && !(ns in obj)) obj = { [ns]: obj };
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      if (k in d) err(`${dir}/${f}: duplicate top-level key "${k}"`);
      d[k] = stripPrivate(v);
    }
  }
  dict[lang] = d;
}

/* ------------------------------------------- typography: no-break spaces (U+00A0) */
// A number never parts from its unit or symbol (9,3 % · ≈8 months · 41 ECTS · 1,6 TB · 18 Sep 2025 · November 2026),
// 'EE. UU.' stays one unit, and a range never breaks after its en dash (2026–27, abr–jul: U+2060 word joiner).
// Applied once to every dictionary string (pages, meta, JSON-LD and #aa-i18n alike) and to the text nodes of the
// rendered templates. Never to tags or template attributes, nor to keys that hold URLs, ids or classes.
const NB = '\u00A0', WJ = '\u2060';
const NB_UNIT = '%|€|kB|KB|MB|GB|TB|h|ECTS|months?|meses|mes|mesos|hours?|horas|hores|years?|años|anys|weeks?|semanas|setmanes|days?|días|dies|minutes?|minutos|minuts|min|phases|fases|instances|instancias|instàncies|clicks|clics|pages|páginas|pàgines';
const NB_MON = 'jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|ene|abr|ago|dic|gen\\.|febr\\.|març|maig|juny|ag\\.|set\\.|des\\.';
const NB_MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|gener|febrer|març|maig|juny|juliol|agost|setembre|novembre|desembre';
const NB_RULES = [
  [new RegExp(`([\\d}+]) (?=(?:${NB_UNIT})(?![\\p{L}\\p{N}]))`, 'gu'), `$1${NB}`],
  [new RegExp(`(\\d) (?=(?:${NB_MON})\\.?(?![\\p{L}]))`, 'giu'), `$1${NB}`],
  [new RegExp(`(?<![\\p{L}])((?:${NB_MON}|${NB_MONTH})\\.?) (?=\\d)`, 'giu'), `$1${NB}`],
  [new RegExp(`(?<![\\p{L}])(${NB_MONTH}) (de|del) (?=\\d)`, 'giu'), `$1${NB}$2${NB}`],
  [/EE\. UU\./g, `EE.${NB}UU.`],
  [/\b(EQF|level|nivel|nivell) (?=\d)/g, `$1${NB}`], // 'EQF 5' / 'level 5' never split across two lines
  [/(\d)–(?=\d)/g, `$1–${WJ}`],
  [new RegExp(`(?<![\\p{L}])((?:${NB_MON})\\.?)–(?=(?:${NB_MON}))`, 'giu'), `$1–${WJ}`],
];
// the word joiner only goes where text wraps on screen: never into meta tags or JSON-LD (share cards, search snippets)
const nbsp = (s, wj = true) => (/[ –]/.test(s) ? NB_RULES.reduce((t, [re, to]) => (!wj && to.includes(WJ) ? t : t.replace(re, to)), s) : s);
const NB_SKIP = /^(href|src|srcset|id|ids|uses|ev|cls|shot2?|illus|dt|hreflang|link|\w*Href)$/;
function nbspDeep(v, k, wj) {
  if (typeof v === 'string') return NB_SKIP.test(k) ? v : nbsp(v, wj);
  if (Array.isArray(v)) return v.map((x) => nbspDeep(x, k, wj));
  if (v && typeof v === 'object') { for (const [kk, x] of Object.entries(v)) v[kk] = nbspDeep(x, kk, wj); return v; }
  return v;
}
for (const lang of LANGS) for (const [ns, v] of Object.entries(dict[lang])) dict[lang][ns] = nbspDeep(v, ns, ns !== 'meta' && ns !== 'ld');
// text nodes of a rendered page (script and style blocks untouched)
function nbspHtml(html) {
  const keep = [];
  const masked = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0001`; });
  return masked.replace(/>([^<]+)</g, (m, t) => '>' + nbsp(t) + '<').replace(/\u0001(\d+)\u0001/g, (_, i) => keep[+i]);
}

function flatten(v, pre, out) {
  if (Array.isArray(v)) v.forEach((x, i) => flatten(x, pre ? `${pre}.${i}` : String(i), out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flatten(x, pre ? `${pre}.${k}` : k, out);
  else out.set(pre, v);
  return out;
}
const flat = Object.fromEntries(LANGS.map((l) => [l, flatten(dict[l], '', new Map())]));
const allKeys = new Set(LANGS.flatMap((l) => [...flat[l].keys()]));
for (const k of allKeys) for (const l of LANGS) if (!flat[l].has(k)) soft(`content/${l}: missing key "${k}"`);
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^.]+').replace(/\u0000/g, '.*') + '$');
const sameRes = [...sameAllow].map(globRe);
let sameCount = 0;
for (const [k, v] of flat.en) {
  if (typeof v !== 'string' || flat.es.get(k) !== v) continue;
  if (!/[a-zà-ÿ]{4,}/i.test(v.replace(/\{size:[^}]*\}|https?:\S+|[\w.-]+@[\w.-]+|[\w-]+\.(com|html|pdf|webp|jpg)/g, ''))) continue;
  if (sameRes.some((r) => r.test(k)) || sameAllow.has(v)) continue;
  sameCount++;
  warn(`en == es for "${k}": ${JSON.stringify(v).slice(0, 90)}`);
}

/* ------------------------------------------------------------ helpers */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const hashCache = new Map();
function hashOf(p) {
  if (!hashCache.has(p)) {
    hashCache.set(p, exists(p) ? crypto.createHash('sha1').update(fs.readFileSync(abs(p))).digest('hex').slice(0, 8) : null);
  }
  return hashCache.get(p);
}
function assetUrl(p) {
  const h = hashOf(p);
  if (!h) { soft(`asset missing: ${p}`); return `${p}?v=00000000`; }
  return `${p}?v=${h}`;
}
function sizeOf(p, lang) {
  if (!exists(p)) { soft(`size: file missing ${p}`); return '… KB'; }
  const kb = Math.max(1, Math.round(fs.statSync(abs(p)).size / 1024));
  return new Intl.NumberFormat(lang).format(kb) + (lang === 'en' ? NB + 'KB' : NB + 'kB');
}
function getPath(obj, p) {
  if (p === '' || p == null) return obj;
  if (obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, p)) return obj[p];
  const parts = p.split('.');
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join('.');
    if (obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, head)) {
      const r = getPath(obj[head], parts.slice(i).join('.'));
      if (r !== undefined) return r;
    }
  }
  return undefined;
}
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);

/* ---------------------------------------------------------- {{h}} guard */
const H_OK = {
  em: [], b: [], strong: [], br: [], sup: [],
  span: ['class'], abbr: ['title'], time: ['datetime'],
  a: ['href', 'target', 'rel', 'hreflang', 'lang', 'class'],
};
function checkHtml(s, key) {
  const tagRe = /<\/?([a-zA-Z][\w-]*)([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(s))) {
    const tag = m[1].toLowerCase();
    if (!(tag in H_OK)) { soft(`{{h ${key}}}: tag <${tag}> not allowed`); continue; }
    const attrRe = /([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    let a;
    while ((a = attrRe.exec(m[2]))) {
      const name = a[1].toLowerCase();
      if (name === '/') continue;
      if (!H_OK[tag].includes(name)) { soft(`{{h ${key}}}: attribute ${name} not allowed on <${tag}>`); continue; }
      if (tag === 'a' && name === 'href') {
        const v = (a[2] || '').replace(/^["']|["']$/g, '');
        if (!/^(#|https:\/\/|mailto:|tel:)/.test(v)) soft(`{{h ${key}}}: href "${v}" not allowed`);
      }
    }
  }
  return s;
}

/* ------------------------------------------------------------- parser */
function parse(src, name) {
  const root = { type: 'root', kids: [] };
  const stack = [root];
  const sink = () => {
    const n = stack[stack.length - 1];
    return n.type === 'if' ? (n.inElse ? n.no : n.yes) : n.kids;
  };
  const re = /\{\{\s*([^{}]*?)\s*\}\}/g;
  let m;
  let last = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) sink().push({ type: 'text', v: src.slice(last, m.index) });
    last = re.lastIndex;
    const tag = m[1];
    if (/^if\s/.test(tag)) {
      const n = { type: 'if', cond: tag.slice(3).trim(), yes: [], no: [], inElse: false };
      sink().push(n); stack.push(n);
    } else if (tag === 'else') {
      const n = stack[stack.length - 1];
      if (n.type !== 'if') throw new Error(`${name}: {{else}} outside {{if}}`);
      n.inElse = true;
    } else if (tag === '/if') {
      if (stack[stack.length - 1].type !== 'if') throw new Error(`${name}: unexpected {{/if}}`);
      stack.pop();
    } else if (/^each\s/.test(tag)) {
      const n = { type: 'each', key: tag.slice(5).trim(), kids: [] };
      sink().push(n); stack.push(n);
    } else if (tag === '/each') {
      if (stack[stack.length - 1].type !== 'each') throw new Error(`${name}: unexpected {{/each}}`);
      stack.pop();
    } else {
      sink().push({ type: 'tag', v: tag });
    }
  }
  if (last < src.length) sink().push({ type: 'text', v: src.slice(last) });
  if (stack.length > 1) throw new Error(`${name}: unclosed {{${stack[stack.length - 1].type}}}`);
  return root.kids;
}

const partialCache = new Map();
function loadPartial(name) {
  if (!partialCache.has(name)) {
    const p = `src/partials/${name}.html`;
    if (!exists(p)) partialCache.set(name, null);
    else {
      try { partialCache.set(name, parse(readText(p), p)); } catch (e) { err(e.message); partialCache.set(name, null); }
    }
  }
  return partialCache.get(name);
}

/* ------------------------------------------------------------- render */
function makeRenderer(lang) {
  const D = dict[lang];
  const self = lang === 'es' ? BASE : BASE + PAGE[lang];
  const absOf = (l) => (l === 'es' ? BASE : BASE + PAGE[l]);
  const vars = { lang, locale: LOCALE[lang] };

  function expandKey(key, scope) {
    return key.replace(/\[(\.[\w.-]*)\]/g, (_, f) => '.' + String(lookup(f, scope)));
  }
  function lookup(key, scope) {
    if (key === '.') return scope ? scope.item : undefined;
    if (key === '@index') return scope ? scope.index : undefined;
    if (key.startsWith('.')) return scope ? getPath(scope.item, key.slice(1)) : undefined;
    return getPath(D, expandKey(key, scope));
  }
  function value(name, scope) {
    if (name in vars) return vars[name];
    const f = getPath(flags, name);
    if (f !== undefined) return f;
    return lookup(name, scope);
  }
  function cond(c, scope) {
    c = c.trim();
    if (c.startsWith('!')) return !cond(c.slice(1), scope);
    const cmp = /^([^=!]+?)\s*(==|!=|=)\s*(.+)$/.exec(c);
    if (cmp) {
      const left = value(cmp[1].trim(), scope);
      const eq = String(left) === cmp[3].trim().replace(/^["']|["']$/g, '');
      return cmp[2] === '!=' ? !eq : eq;
    }
    if (c.startsWith('.')) return truthy(lookup(c, scope));
    const colon = c.indexOf(':');
    if (colon > 0) {
      const ns = c.slice(0, colon);
      let key = c.slice(colon + 1);
      if (key.startsWith('.')) key = String(lookup(key, scope));
      if (ns === 'file') return !!key && key !== 'undefined' && exists(key.split(/[?#]/)[0]);
      const obj = ns === 'live' ? flags.liveTags : flags[ns] !== undefined ? flags[ns] : flags[ns + 'Tags'];
      if (obj && typeof obj === 'object') return !!obj[key];
      if (typeof obj === 'string') return obj === key;
      if (obj === undefined) warn(`{{if ${c}}}: unknown flag "${ns}"`);
      return !!obj;
    }
    const f = getPath(flags, c);
    if (f !== undefined) return truthy(f);
    const d = lookup(c, scope);
    if (d !== undefined) return truthy(d);
    warn(`{{if ${c}}}: unknown flag`);
    return false;
  }
  function str(key, scope, args) {
    const v = lookup(key, scope);
    if (v === undefined || v === null) { soft(`[${lang}] missing key "${expandKey(key, scope)}"`); return key; }
    if (typeof v === 'object') { soft(`[${lang}] key "${key}" is not a string`); return key; }
    let s = String(v).replace(/\{size:([^}]+)\}/g, (_, p) => sizeOf(p.trim(), lang));
    if (args) for (const [k, x] of Object.entries(args)) s = s.split(`{${k}}`).join(x);
    return s;
  }
  function parseArgs(rest, scope) {
    const args = {};
    for (const m of rest.matchAll(/([\w-]+)=("[^"]*"|'[^']*'|\S+)/g)) {
      let v = m[2].replace(/^["']|["']$/g, '');
      if (v.startsWith('.') || /^[a-z]+\.[\w.]+$/i.test(v)) { const r = lookup(v, scope); if (r !== undefined) v = String(r); }
      args[m[1]] = v;
    }
    return args;
  }

  function tag(t, scope, depth) {
    const sp = t.indexOf(' ');
    const op = sp < 0 ? t : t.slice(0, sp);
    const rest = sp < 0 ? '' : t.slice(sp + 1).trim();
    switch (op) {
      case 't': {
        const [key, ...more] = rest.split(/\s+/);
        return esc(str(key, scope, more.length ? parseArgs(more.join(' '), scope) : null));
      }
      case 'h': return checkHtml(str(rest, scope), rest);
      case 'url': return esc(encodeURIComponent(str(rest, scope))); /* 8-nov-2026: a dictionary string inside a URL (the mailto subject) */
      case 'json': {
        const v = lookup(rest, scope);
        if (v === undefined) soft(`[${lang}] missing key "${rest}" for {{json}}`);
        return esc(JSON.stringify(v ?? null));
      }
      case '>': {
        const nodes = loadPartial(rest);
        if (!nodes) { soft(`partial missing: src/partials/${rest}.html`); return `<!-- partial ${rest} pending -->`; }
        if (depth > 12) { err(`partial recursion at ${rest}`); return ''; }
        return render(nodes, scope, depth + 1);
      }
      case '@index': return String(scope ? scope.index : 0);
      case 'lang': return lang;
      case 'locale': return LOCALE[lang];
      case 'self': return self;
      case 'base': return BASE;
      case 'page': return rest === 'es' ? './' : PAGE[rest] || (soft(`{{page ${rest}}}: unknown language`), '');
      case 'abs': return LANGS.includes(rest) ? absOf(rest) : (soft(`{{abs ${rest}}}: unknown language`), '');
      case 'asset': return esc(assetUrl(rest.replace('@lang', lang))); /* per-language files: hero-d-@lang.webp */
      case 'size': return esc(sizeOf(rest.startsWith('.') ? String(lookup(rest, scope)) : rest, lang));
      case 'jsonld': return jsonld(lang, self);
      case 'boot-json': return bootJson(lang);
      default:
        soft(`unknown template tag {{${t}}}`);
        return '';
    }
  }
  function render(nodes, scope, depth = 0) {
    let out = '';
    for (const n of nodes) {
      if (n.type === 'text') out += n.v;
      else if (n.type === 'tag') out += tag(n.v, scope, depth);
      else if (n.type === 'if') out += render(cond(n.cond, scope) ? n.yes : n.no, scope, depth);
      else if (n.type === 'each') {
        const arr = lookup(n.key, scope);
        if (!Array.isArray(arr)) { soft(`[${lang}] {{each ${n.key}}}: not an array`); continue; }
        arr.forEach((item, index) => { out += render(n.kids, { item, index, parent: scope }, depth); });
      }
    }
    return out;
  }
  return render;
}

/* ---------------------------------------------------------- JSON-LD */
const scriptJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
function jsonld(lang, self) {
  const L = dict[lang].ld || {};
  const need = (k) => { if (L[k] === undefined) soft(`[${lang}] missing ld.${k}`); return L[k]; };
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateModified: today,
    inLanguage: lang,
    mainEntity: {
      '@type': 'Person',
      '@id': BASE + '#person',
      name: 'Adrián Arboledas Azañón',
      givenName: 'Adrián',
      familyName: 'Arboledas Azañón',
      jobTitle: need('jobTitle'),
      description: need('description'),
      // FACTS §11: what he is looking for and from when (full-time once the ITB course ends, April 2027)
      seeks: { '@type': 'Demand', description: need('seeks'), availabilityStarts: '2026-11' /* 7-nov-2026: part-time now, full-time from 2027-04 */ },
      url: self,
      image: BASE + 'img/adrian.webp',
      email: 'mailto:arboledasadrian05@gmail.com',
      telephone: '+34647985945',
      address: { '@type': 'PostalAddress', addressLocality: 'Mollet del Vallès', addressRegion: 'Barcelona', addressCountry: 'ES' },
      affiliation: {
        '@type': 'EducationalOrganization',
        name: 'Institut Tecnològic de Barcelona (ITB)',
        address: { '@type': 'PostalAddress', addressLocality: 'Barcelona', addressCountry: 'ES' },
      },
      alumniOf: [
        { '@type': 'EducationalOrganization', name: 'Institut La Ferreria', address: { '@type': 'PostalAddress', addressLocality: 'Montcada i Reixac', addressCountry: 'ES' } },
        { '@type': 'EducationalOrganization', name: 'Educem', address: { '@type': 'PostalAddress', addressLocality: 'Granollers', addressCountry: 'ES' } },
      ],
      hasCredential: [
        { '@type': 'EducationalOccupationalCredential', name: need('credDam'), educationalLevel: L.eqf || 'EQF level 5' },
        { '@type': 'EducationalOccupationalCredential', name: 'Cambridge C1 Advanced (CAE)', credentialCategory: need('credLangCat') },
      ],
      knowsLanguage: (need('langs') || ['Spanish', 'Catalan', 'English']).map((n, i) => ({ '@type': 'Language', name: n, alternateName: ['es', 'ca', 'en'][i] })),
      knowsAbout: ['Flutter', 'Dart', 'GetX', L.restApi || 'REST APIs', 'Java', 'TypeScript', 'JavaScript', 'SQL', 'Astro', 'React', 'Tailwind CSS', 'Three.js', 'AWS', 'Amazon EC2', 'Amazon VPC', 'Amazon S3', 'Amazon RDS', 'AWS CloudFormation', 'Git', 'Scrum', 'Google Ads', 'GA4', 'Consent Mode v2', L.localSeo || 'Local SEO'],
      sameAs: ['https://www.linkedin.com/in/adrian-arboledas-1b33b5302', 'https://github.com/arboledas05'],
    },
  };
  return `<script type="application/ld+json">${scriptJson(data)}</script>`;
}

/* ------------------------------------------------------- boot JSON */
function assetMap() {
  const map = {};
  const jsDir = 'assets/js';
  if (exists(jsDir)) {
    for (const f of fs.readdirSync(abs(jsDir)).filter((x) => /\.m?js$/.test(x) && !RETIRED_JS.includes(x)).sort()) map['js/' + f] = `${jsDir}/${f}?v=${hashOf(`${jsDir}/${f}`)}`;
  }
  if (exists('assets/css/app.css')) map['css/app.css'] = assetUrl('assets/css/app.css');
  for (const t of EXTRA_ASSETS) {
    if (exists(t)) map[t] = `${t}?v=${hashOf(t)}`;
    else warn(`#aa-assets: ${t} is not on disk yet (skipped)`);
  }
  return map;
}
function bootJson(lang) {
  const i18n = {};
  for (const ns of BOOT_NS) {
    const v = getPath(dict[lang], ns);
    if (v === undefined) { soft(`[${lang}] BOOT_NS "${ns}" is not in the dictionary`); continue; }
    const parts = ns.split('.');
    let o = i18n;
    for (const k of parts.slice(0, -1)) o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
    o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v));
  }
  for (const k of BOOT_OMIT) {
    const parts = k.split('.');
    const parent = getPath(i18n, parts.slice(0, -1).join('.'));
    if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
  }
  if (flags.adspend === false && i18n.board) {
    // ADDENDUM: no money figure about the ads may reach the page, not even as a JS string.
    const prune = (o, pre) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && /€/.test(v)) { delete o[k]; warn(`[${lang}] adspend=false: dropped board.${pre}${k} from #aa-i18n`); }
        else if (v && typeof v === 'object') prune(v, `${pre}${k}.`);
      }
    };
    prune(i18n.board, '');
  }
  const runtime = {};
  for (const [k, v] of Object.entries(flags)) if (!BUILD_ONLY_FLAGS.includes(k)) runtime[k] = v;
  return [
    `<script type="application/json" id="aa-i18n">${scriptJson(i18n)}</script>`,
    `<script type="application/json" id="aa-flags">${scriptJson(runtime)}</script>`,
    `<script type="application/json" id="aa-assets">${scriptJson(assetMap())}</script>`,
  ].join('\n');
}

/* --------------------------------------------------------- whitespace */
function tidy(html) {
  const keep = [];
  const masked = html.replace(/<(pre|textarea)\b[\s\S]*?<\/\1>/gi, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  const out = masked
    .replace(/<!--(?!\s*partial)[\s\S]*?-->/g, (m) => (/^<!--\s*\[if/.test(m) ? m : ''))
    .replace(/[ \t]*\r?\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]).trim() + '\n';
}

/* -------------------------------------------------------------- build */
console.log(`build ${RELEASE ? '--release' : '(dev)'} · ${ROOT}`);

// 1. CSS bundle (written first so its hash is known)
const cssParts = [];
for (const n of CSS_ORDER) {
  const p = `src/css/${n}.css`;
  if (exists(p)) cssParts.push(`/* ${p} */\n` + readText(p).trim());
  else { soft(`css missing: ${p}`); cssParts.push(`/* ${p} pending */`); }
}
if (cssParts.some((c) => /@import\b/.test(c))) err('app.css: @import is not allowed');
fs.mkdirSync(abs('assets/css'), { recursive: true });
// INT: a conservative CSS minifier (strings and unquoted url() masked; no rule rewriting). Used for --release / --min.
function minCss(css) {
  const keep = [];
  const mask = (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; };
  let o = css.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|url\((?!["'])[^)]*\)/g, mask);
  o = o.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s*!important/g, '!important');
  // property values lose the space after ':' ("color: red" → "color:red"); selectors such as ".a :hover" keep theirs
  o = o.replace(/([{;])([\w-]+):\s+/g, '$1$2:');
  return o.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]).trim() + '\n';
}
const cssOut = cssParts.join('\n\n') + '\n';
fs.writeFileSync(abs('assets/css/app.css'), RELEASE || process.argv.includes('--min') ? minCss(cssOut) : cssOut);
hashCache.delete('assets/css/app.css');

// 2. pages
let pageNodes = null;
try { pageNodes = parse(readText('src/page.html'), 'src/page.html'); } catch (e) { err(e.message); }
const outputs = [];
if (pageNodes) {
  for (const lang of LANGS) {
    const html = tidy(nbspHtml(makeRenderer(lang)(pageNodes, null)));
    fs.writeFileSync(abs(PAGE[lang]), html);
    outputs.push(PAGE[lang]);
  }
}

// 3. sitemap
const today = new Date().toISOString().slice(0, 10);
const urlOf = (l) => (l === 'es' ? BASE : BASE + PAGE[l]);
const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(l)}"/>`).join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf('en')}"/>`;
fs.writeFileSync(abs('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => `  <url>\n    <loc>${urlOf(l)}</loc>\n${alts}\n    <lastmod>${today}</lastmod>\n  </url>`).join('\n')}
</urlset>
`);

// 4. size table, with the DELTA_SPEC perf budgets (single source: tools/audit.mjs)
const { budgetOf, JS_TOTAL_KB, HTML_BUDGET, CSS_BUDGET } = await import('./audit.mjs');
const files = [...outputs, 'assets/css/app.css'];
if (exists('assets/js')) for (const f of fs.readdirSync(abs('assets/js')).filter((x) => /\.m?js$/.test(x) && !RETIRED_JS.includes(x)).sort()) files.push('assets/js/' + f);
for (const t of EXTRA_ASSETS) if (exists(t) && t.endsWith('.json')) files.push(t);
console.log('\n  file                              raw KB   gzip KB   budget (raw KB)');
let jsTotal = 0;
for (const f of files) {
  const buf = fs.readFileSync(abs(f));
  const isJs = f.startsWith('assets/js/');
  if (isJs) jsTotal += buf.length;
  const b = f.endsWith('.html') ? HTML_BUDGET.raw : f.endsWith('app.css') ? CSS_BUDGET.raw : isJs ? budgetOf(path.basename(f)) : null;
  const over = b && buf.length > b * 1024 ? '  ✕ over budget' : '';
  console.log(`  ${f.padEnd(32)} ${(buf.length / 1024).toFixed(1).padStart(7)} ${(zlib.gzipSync(buf, { level: 9 }).length / 1024).toFixed(1).padStart(9)} ${b ? String(b).padStart(9) : ''}${over}`);
}
console.log(`  ${'own JS (total)'.padEnd(32)} ${(jsTotal / 1024).toFixed(1).padStart(7)} ${''.padStart(9)} ${String(JS_TOTAL_KB).padStart(9)}${jsTotal > JS_TOTAL_KB * 1024 ? '  ✕ over budget' : ''}`);
if (sameCount) console.log(`\n  ${sameCount} en==es warning(s) (add intentional ones to core.json "_same")`);

// 5. audit
if (RELEASE && outputs.length) {
  const r = spawnSync(process.execPath, [abs('tools/audit.mjs'), ...outputs], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) err('audit failed');
}
console.log(`\n${errors ? '✕' : '✓'} ${outputs.length} page(s) · ${errors} error(s) · ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
