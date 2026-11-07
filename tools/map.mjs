#!/usr/bin/env node
// tools/map.mjs (B5): build-time North Atlantic pipeline for the map world. Zero dependencies (Node >= 18).
//   node tools/map.mjs            uses the cached tools/data/land-50m.json (downloads it once if missing)
//   node tools/map.mjs --check    also prints ring stats and validates every ring
// Source: world-atlas@2.0.2 land-50m.json (Natural Earth, public domain), pinned and cached.
// Steps: TopoJSON decode → clip lon −135…48 / lat 12…74 (Sutherland–Hodgman per ring) → Douglas–Peucker
// (.25° desktop LOD "d", .5° phone/SVG LOD "m") → drop rings < .4 deg² except the KEEP islands → fix windings
// (outer CCW, holes CW, in shape space x / s) → self-intersection check → outputs:
//   assets/data/atlantic.json        quantised (×400) delta-encoded int rings, both LODs + projected points
//   src/partials/gen-map-svg.html    inline SVG twin (same projection, LOD m)
//   src/partials/gen-map-pins.html   the real .pin buttons + 'your company?' tips at baked %
// Projection (shared with w-map.js through atlantic.json): x = (lon + 43.5)·cos 42°·k, s = (lat − 43)·k,
// world z = −s, k = .068 → land box ≈ 9.25 × 4.22 board units centred on 0.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json';
const CACHE = path.join(ROOT, 'tools/data/land-50m.json');
const CHECK = process.argv.includes('--check');

export const BOX = { lon0: -135, lon1: 48, lat0: 12, lat1: 74 };
export const K = 0.068;
export const LON_C = -43.5;
export const LAT_C = 43;
export const COS = Math.cos((42 * Math.PI) / 180);
export const Q = 400; // JSON quantisation: 1 unit = 400 steps (≈ 1/4000 of the board width)
export const proj = (lon, lat) => [(lon - LON_C) * COS * K, (lat - LAT_C) * K]; // [x, s]; world z = −s

// Points (no city named at the two targets).
export const POINTS = {
  mollet: [2.21, 41.54],
  ireland: [-6.3, 53.3],
  texas: [-99.0, 31.0],
  eu: [19.5, 48.5], // central Europe, clear of the Ireland label (round 4)
  am: [-76.0, 40.5],
};
// Islands that must survive the area filter (reference point inside each).
const KEEP = [
  [-18.6, 64.9], [-8.0, 53.4], [-1.5, 53.0], [-56.0, 48.7], [-79.0, 21.8], [-71.0, 19.0],
  [2.95, 39.6], [4.1, 39.95], [1.43, 38.98], [9.1, 42.15], [9.0, 40.1], [14.1, 37.5], [24.9, 35.2],
];
const LODS = { d: 0.25, m: 0.5 };
const MIN_AREA = 0.4;

/* ------------------------------------------------------------------ data */
async function loadTopo() {
  if (!fs.existsSync(CACHE)) {
    console.log('  downloading ' + SRC_URL);
    const r = await fetch(SRC_URL);
    if (!r.ok) throw new Error('download failed: ' + r.status);
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
}

// In-house TopoJSON decoder (delta + quantize) → array of polygons, each [outer, ...holes] in [lon, lat].
function decode(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((a) => {
    let x = 0, y = 0;
    return a.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });
  const ring = (ids) => {
    const out = [];
    for (const i of ids) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      a.forEach((p, j) => { if (j || !out.length) out.push(p); });
    }
    if (out.length > 1) {
      const f = out[0], l = out[out.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) out.pop();
    }
    return out;
  };
  const polys = [];
  const walk = (g) => {
    if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else if (g.type === 'Polygon') polys.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') g.arcs.forEach((p) => polys.push(p.map(ring)));
  };
  for (const o of Object.values(topo.objects)) walk(o);
  return polys;
}

/* ------------------------------------------------------------- geometry */
function clipRing(ring) {
  // Eurasia crosses the antimeridian: unwrap it (lon < −90 → +360) so the clipper never bridges Chukotka.
  let lo = 180, hi = -180;
  for (const p of ring) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
  if (hi - lo > 270) ring = ring.map((p) => (p[0] < -90 ? [p[0] + 360, p[1]] : p));
  const edges = [
    [(p) => p[0] >= BOX.lon0, (a, b) => cutX(a, b, BOX.lon0)],
    [(p) => p[0] <= BOX.lon1, (a, b) => cutX(a, b, BOX.lon1)],
    [(p) => p[1] >= BOX.lat0, (a, b) => cutY(a, b, BOX.lat0)],
    [(p) => p[1] <= BOX.lat1, (a, b) => cutY(a, b, BOX.lat1)],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i], prev = src[(i + src.length - 1) % src.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cut(prev, cur)); out.push(cur); }
      else if (pi) out.push(cut(prev, cur));
    }
  }
  return cleanRing(out);
}
function cutX(a, b, x) { const t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + (b[1] - a[1]) * t]; }
function cutY(a, b, y) { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, y]; }

// Remove duplicates, collinear points and zero-width spikes (A→B→A) left by the clipper.
function cleanRing(r) {
  let pts = r.slice();
  let changed = true;
  while (changed && pts.length > 2) {
    changed = false;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = out.length ? out[out.length - 1] : pts[pts.length - 1];
      const b = pts[i], c = pts[(i + 1) % pts.length];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) { changed = true; continue; }
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cr) < 1e-10) { changed = true; continue; } // collinear (incl. spikes along the clip edge)
      out.push(b);
    }
    pts = out;
  }
  return pts.length >= 3 ? pts : [];
}
const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return s / 2; }; // >0 = CCW (y up)
function inRing(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}
const onEdge = (p) => p[0] <= BOX.lon0 + 1e-9 || p[0] >= BOX.lon1 - 1e-9 || p[1] <= BOX.lat0 + 1e-9 || p[1] >= BOX.lat1 - 1e-9;

// Douglas–Peucker on a closed ring → keep mask. Points on the clip box are always kept so cut edges stay straight.
function dpMask(ring, tol) {
  const n = ring.length;
  const keep = new Uint8Array(n);
  if (n < 5) { keep.fill(1); return keep; }
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[0] = keep[far] = 1;
  ring.forEach((p, i) => { if (onEdge(p)) keep[i] = 1; });
  const anchors = [...keep].map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  const t2 = tol * tol;
  const seg = (a, b) => {
    const A = ring[a % n], B = ring[b % n];
    let best = -1, bd = t2;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const P = ring[i % n];
      let t = L ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      const d = (P[0] - A[0] - t * dx) ** 2 + (P[1] - A[1] - t * dy) ** 2;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best % n] = 1; seg(a, best); seg(best, b); }
  };
  for (let k = 0; k < anchors.length; k++) seg(anchors[k], k + 1 < anchors.length ? anchors[k + 1] : anchors[0] + n);
  return keep;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// indices k of segments (r[k] → r[k+1]) that cross another segment of the same ring
function crossings(r) {
  const n = r.length, bad = new Set();
  const bb = r.map((a, i) => { const b = r[(i + 1) % n]; return [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]; });
  for (let i = 0; i < n; i++) {
    const A = bb[i];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const B = bb[j];
      if (A[1] < B[0] || B[1] < A[0] || A[3] < B[2] || B[3] < A[2]) continue;
      if (segsCross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) { bad.add(i); bad.add(j); }
    }
  }
  return bad;
}
const selfIntersects = (r) => crossings(r).size > 0;
// Simplify with tol, then refine locally: every simplified segment that crosses another one gets the
// original points back (split at its middle) until the ring is simple again (topology-preserving DP).
function simplify(ring, tol) {
  const n = ring.length;
  const keep = dpMask(ring, tol);
  for (let iter = 0; iter < 60; iter++) {
    const idx = [];
    keep.forEach((k, i) => { if (k) idx.push(i); });
    const r = idx.map((i) => ring[i]);
    const bad = crossings(r);
    if (!bad.size) break;
    let added = 0;
    for (const k of bad) {
      const a = idx[k], b = k + 1 < idx.length ? idx[k + 1] : idx[0] + n;
      if (b - a > 1) { keep[((a + b) >> 1) % n] = 1; added++; }
    }
    if (!added) break;
  }
  const out = cleanRing(ring.filter((_, i) => keep[i]));
  return out.length >= 3 ? out : ring;
}

/* ---------------------------------------------------------------- build */
function build(polys) {
  const clipped = [];
  for (const poly of polys) {
    const outer = clipRing(poly[0]);
    if (!outer.length) continue;
    const holes = poly.slice(1).map(clipRing).filter((h) => h.length && Math.abs(area(h)) > 0.05);
    clipped.push([outer, ...holes]);
  }
  const kept = clipped.filter(([o]) => Math.abs(area(o)) >= MIN_AREA || KEEP.some((p) => inRing(p, o)));
  const lod = {};
  for (const [name, tol] of Object.entries(LODS)) {
    lod[name] = kept.map((poly) => poly.map((r, i) => {
      // islands smaller than ~1.5 deg² keep more detail so they stay recognisable
      const small = Math.abs(area(r)) < 1.5;
      let s = simplify(r, small ? tol / 3 : tol);
      if (s.length < 4) s = r;
      // windings in shape space (lon→x, lat→s, both increasing): outer CCW, holes CW
      const ccw = area(s) > 0;
      if ((i === 0) !== ccw) s = s.slice().reverse();
      return s;
    }));
  }
  return { clipped, kept, lod };
}

/* --------------------------------------------------------------- output */
const r1 = (v) => Math.round(v * 10) / 10;
function encodeRing(r) {
  const out = [];
  let px = 0, py = 0;
  r.forEach(([lon, lat], i) => {
    const [x, s] = proj(lon, lat);
    const X = Math.round(x * Q), Y = Math.round(s * Q);
    if (i && X === px && Y === py) return;
    out.push(X - px, Y - py);
    px = X; py = Y;
  });
  return out;
}
function svgPath(polys) {
  // units ×100, SVG y = −s; relative commands, integer coordinates
  let d = '';
  for (const poly of polys) {
    for (const r of poly) {
      const pts = [];
      for (const [lon, lat] of r) {
        const [x, s] = proj(lon, lat);
        const X = Math.round(x * 100), Y = Math.round(-s * 100);
        if (pts.length && pts[pts.length - 1][0] === X && pts[pts.length - 1][1] === Y) continue;
        pts.push([X, Y]);
      }
      if (pts.length < 3) continue;
      // puffy coast: quadratic segments through edge midpoints (vertices become control points)
      const n = pts.length, mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
      const join = (a) => a.reduce((s, v, i) => s + (i && v >= 0 ? ' ' : '') + v, '');
      let cur = mid(pts[n - 1], pts[0]);
      const nums = [];
      for (let i = 0; i < n; i++) {
        const c = pts[i], e = mid(pts[i], pts[(i + 1) % n]);
        nums.push(c[0] - cur[0], c[1] - cur[1], e[0] - cur[0], e[1] - cur[1]);
        cur = e;
      }
      d += `M${join(mid(pts[n - 1], pts[0]))}q${join(nums)}z`;
    }
  }
  return d;
}

// The 2D plane = viewBox at 2.1:1 around the land box (units ×100).
const LAND = { x0: proj(BOX.lon0, 0)[0] * 100, x1: proj(BOX.lon1, 0)[0] * 100, y0: -proj(0, BOX.lat1)[1] * 100, y1: -proj(0, BOX.lat0)[1] * 100 };
const VB_W = 965, VB_H = VB_W / 2.1, VB_X = -VB_W / 2, VB_Y = -VB_H / 2;
const pct = (lon, lat) => {
  const [x, s] = proj(lon, lat);
  return [((x * 100 - VB_X) / VB_W) * 100, ((-s * 100 - VB_Y) / VB_H) * 100];
};

// 2D arcs: BCN → target, lifted toward screen-up like the 3D arcs seen through the tilted camera,
// drawn to 75 % (open), the tip hangs over the target. Returns the SVG path and the tip point.
function arc2d(to, apex) {
  const [ax, as] = proj(...POINTS.mollet), [bx, bs] = proj(...to);
  const A = [ax * 100, -as * 100], B = [bx * 100, -bs * 100];
  const H = apex * 100 * 0.62 / 0.75;
  const P1 = [A[0] + (B[0] - A[0]) * 0.12, A[1] - H], P2 = [B[0] - (B[0] - A[0]) * 0.12, B[1] - H];
  const at = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * A[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * B[k]);
  };
  // split the cubic at t = .75 (de Casteljau) so the drawn path ends open at the tip
  const t = 0.75, L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const Q0 = L(A, P1), Q1 = L(P1, P2), R0 = L(Q0, Q1), tip = at(t);
  const f = (p) => `${r1(p[0])} ${r1(p[1])}`;
  return { d: `M${f(A)}C${f(Q0)} ${f(R0)} ${f(tip)}`, tip, ground: B, A };
}

function graticule() {
  let d = '';
  for (let lon = -130; lon <= 40; lon += 10) {
    const [x] = proj(lon, 0);
    d += `M${r1(x * 100)} ${r1(LAND.y0)}V${r1(LAND.y1)}`;
  }
  for (let lat = 20; lat <= 70; lat += 10) {
    const [, s] = proj(0, lat);
    d += `M${r1(LAND.x0)} ${r1(-s * 100)}H${r1(LAND.x1)}`;
  }
  return d;
}

function writeOutputs({ lod }) {
  const pts = {};
  for (const [id, [lon, lat]] of Object.entries(POINTS)) {
    const [x, s] = proj(lon, lat);
    pts[id] = [Math.round(x * 1000) / 1000, Math.round(-s * 1000) / 1000]; // [x, z] world units
  }
  const json = {
    v: 1,
    src: 'world-atlas@2.0.2 land-50m (Natural Earth, public domain)',
    k: K, q: Q,
    box: [BOX.lon0, BOX.lat0, BOX.lon1, BOX.lat1],
    land: [r1(LAND.x0) / 100, r1(-LAND.y1) / 100, r1(LAND.x1) / 100, r1(-LAND.y0) / 100], // [x0, s0, x1, s1]
    pts,
    // polygons: [outer, ...holes]; each ring = [X0, Y0, dX1, dY1, …] in shape space (x, s) × q
    d: lod.d.map((p) => p.map(encodeRing)),
    m: lod.m.map((p) => p.map(encodeRing)),
  };
  const jsonStr = JSON.stringify(json);
  fs.mkdirSync(path.join(ROOT, 'assets/data'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets/data/atlantic.json'), jsonStr);

  // -------- SVG twin
  const land = svgPath(lod.m);
  const eu = arc2d(POINTS.eu, 1.2), am = arc2d(POINTS.am, 2.0);
  const vb = `${r1(VB_X)} ${r1(VB_Y)} ${VB_W} ${r1(VB_H)}`;
  const bw = VB_W - 24, bh = VB_H - 24;
  const shadow = (a) => `M${r1(a.A[0])} ${r1(a.A[1])}L${r1(a.ground[0])} ${r1(a.ground[1])}`;
  const drop = (a) => `M${r1(a.tip[0])} ${r1(a.tip[1] + 9)}V${r1(a.ground[1])}`;
  const ring = (a) => `<circle class="mp-ring" cx="${r1(a.tip[0])}" cy="${r1(a.tip[1])}" r="13"/><circle class="mp-bead" cx="${r1(a.tip[0])}" cy="${r1(a.tip[1])}" r="5.5"/><circle class="mp-target" cx="${r1(a.ground[0])}" cy="${r1(a.ground[1])}" r="3"/>`;
  const box = `x="${r1(LAND.x0)}" y="${r1(LAND.y0)}" width="${r1(LAND.x1 - LAND.x0)}" height="${r1(LAND.y1 - LAND.y0)}"`;
  const board = `x="${r1(VB_X + 12)}" y="${r1(VB_Y + 10)}" width="${r1(bw)}" height="${r1(bh)}" rx="26"`;
  const svg = [
    `<svg class="map-svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="mp-t mp-d" focusable="false"><title id="mp-t">{{t europe.mapT}}</title><desc id="mp-d">{{t europe.mapD}}</desc>`,
    `<defs><pattern id="mp-hatch" width="8" height="6" patternUnits="userSpaceOnUse"><path d="M0 5.5H8" class="mp-hatch-l"/></pattern>`,
    `<path id="mp-land" d="${land}"/><clipPath id="mp-clip"><rect ${box}/></clipPath>`,
    `<mask id="mp-mask" maskUnits="userSpaceOnUse" x="${r1(VB_X)}" y="${r1(VB_Y)}" width="${VB_W}" height="${r1(VB_H)}"><path class="mp-rev" pathLength="1" d="${eu.d}"><animate attributeName="stroke-dashoffset" values="1;0" dur=".9s" begin="indefinite" fill="freeze" calcMode="spline" keySplines=".65 0 .35 1"/></path><path class="mp-rev mp-rev--am" pathLength="1" d="${am.d}"><animate attributeName="stroke-dashoffset" values="1;0" dur="1.1s" begin="indefinite" fill="freeze" calcMode="spline" keySplines=".65 0 .35 1"/></path></mask></defs>`,
    `<rect class="mp-plinth" ${board} transform="translate(0 7)"/><rect class="mp-board" ${board}/><rect class="mp-sea" ${board} fill="url(#mp-hatch)"/>`,
    `<path class="mp-grat" d="${graticule()}"/><rect class="mp-neat" ${box}/>`,
    `<g clip-path="url(#mp-clip)" fill-rule="evenodd"><use href="#mp-land" class="mp-wl mp-wl1"/><use href="#mp-land" class="mp-wl mp-gap1"/><use href="#mp-land" class="mp-wl mp-wl2"/><use href="#mp-land" class="mp-wl mp-gap2"/>`,
    `<use href="#mp-land" class="mp-side" y="4"/><use href="#mp-land" class="mp-cap"/></g>`,
    `<g class="mp-arcs"><path class="mp-shadow" d="${shadow(eu)}"/><path class="mp-shadow" d="${shadow(am)}"/>`,
    `<g mask="url(#mp-mask)"><path class="mp-dash" d="${eu.d}"/><path class="mp-dash" d="${am.d}"/></g>`,
    `<g class="mp-tipg"><path class="mp-drop" d="${drop(eu)}"/>${ring(eu)}</g><g class="mp-tipg mp-tipg--am"><path class="mp-drop" d="${drop(am)}"/>${ring(am)}</g></g>`,
    `</svg>`,
  ].join('');
  fs.writeFileSync(path.join(ROOT, 'src/partials/gen-map-svg.html'), `<!-- generated by tools/map.mjs — do not edit -->\n${svg}\n`);

  // -------- pins + tips at baked % of the 2.1:1 plane
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const pin = (id) => {
    const [x, y] = pct(...POINTS[id]);
    return `<button type="button" class="pin pin--${id}" data-pin="${id}" data-hotspot style="--x:${f2(x)}%;--y:${f2(y)}%" aria-pressed="false" aria-controls="pin-card" data-name="{{t europe.pins.${id}.name}}" data-line="{{t europe.pins.${id}.line}}"><span class="pin-dot" aria-hidden="true"></span><span class="pin-label">{{t europe.pins.${id}.label}}</span></button>`;
  };
  const tipPct = (a) => [((a.tip[0] - VB_X) / VB_W) * 100, ((a.tip[1] - VB_Y) / VB_H) * 100];
  const tip = (id, a) => {
    const [x, y] = tipPct(a);
    return `<a class="map-tip" data-tip="${id}" data-hotspot href="#contact" tabindex="-1" aria-hidden="true" style="--x:${f2(x)}%;--y:${f2(y)}%">{{t ui.w.map.tip}}</a>`;
  };
  const pins = [
    '<!-- generated by tools/map.mjs — do not edit -->',
    pin('mollet'), pin('ireland'), pin('texas'),
    tip('eu', eu), tip('am', am),
    '<a class="map-tip map-tip--drop" data-tip="drop" data-hotspot href="#contact" tabindex="-1" aria-hidden="true" hidden>{{t ui.w.map.tip}}</a>',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'src/partials/gen-map-pins.html'), pins + '\n');

  const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`  atlantic.json   ${kb(jsonStr.length)} raw / ${kb(gz(jsonStr))} gzip  (d: ${json.d.length} polys, m: ${json.m.length})`);
  console.log(`  gen-map-svg     ${kb(svg.length)} raw / ${kb(gz(svg))} gzip`);
  console.log(`  pins: ` + Object.keys(POINTS).map((k) => k + ' ' + pct(...POINTS[k]).map(f2).join('/')).join(' · '));
  return { json, svg };
}

/* ----------------------------------------------------------------- main */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const topo = await loadTopo();
  const polys = decode(topo);
  const res = build(polys);
  if (CHECK) {
    for (const [name, list] of Object.entries(res.lod)) {
      let bad = 0, pts = 0;
      list.forEach((poly) => poly.forEach((r) => { pts += r.length; if (selfIntersects(r)) bad++; }));
      console.log(`  LOD ${name}: ${list.length} polygons, ${pts} points, ${bad} self-intersecting rings`);
    }
    const missing = KEEP.filter((p) => !res.kept.some(([o]) => inRing(p, o)));
    if (missing.length) console.warn('  ! keep-islands not found: ' + JSON.stringify(missing));
  }
  writeOutputs(res);
}
