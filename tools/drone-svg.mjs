#!/usr/bin/env node
// tools/drone-svg.mjs (B5): the 2D twin of the Viewfinder Valley. Zero dependencies.
//   node tools/drone-svg.mjs
// Imports the SAME seeded heightfield, river, flight path, trees and houses as assets/js/w-drone.js,
// runs marching squares at 8 levels (filled hypsometric bands + contour lines) and writes
// src/partials/gen-contours.html (≤ 10 KB): terrain, river, trees, village, pad, bead, the dash-dot
// flight path (revealed by the section --p from site.js [data-track]) and a flat top-down drone.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = await import(pathToFileURL(path.join(ROOT, 'assets/js/w-drone.js')).href);
const { TER, RIVER, PATH, height, spline, trees, houses } = W;

const NX = 96, NZ = 60, LEVELS = 8;
const S = 100; // 1 world unit = 100 SVG units
const X0 = -TER.w / 2, Z0 = -TER.d / 2;
const sx = (x) => (x - X0) * S, sz = (z) => (z - Z0) * S;
const r0 = (v) => Math.round(v);

/* ---------------------------------------------------------- heightfield */
const G = [];
let lo = Infinity, hi = -Infinity;
for (let j = 0; j <= NZ; j++) {
  const row = [];
  for (let i = 0; i <= NX; i++) {
    const h = height(X0 + (i / NX) * TER.w, Z0 + (j / NZ) * TER.d);
    row.push(h); lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  G.push(row);
}
const levels = Array.from({ length: LEVELS }, (_, k) => lo + ((k + 1) * (hi - lo)) / (LEVELS + 1));

/* ------------------------------------------- marching squares (closed loops) */
// padded grid: one ring of −∞ around so every iso-loop closes along the frame
const P = (i, j) => (i < 0 || j < 0 || i > NX || j > NZ ? -1e9 : G[j][i]);
const px = (i) => X0 + (Math.max(-0.5, Math.min(NX + 0.5, i)) / NX) * TER.w;
const pz = (j) => Z0 + (Math.max(-0.5, Math.min(NZ + 0.5, j)) / NZ) * TER.d;
function isoLoops(L) {
  const segs = [];
  const lerp = (a, b, va, vb) => { const t = (L - va) / (vb - va); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  for (let j = -1; j <= NZ; j++) {
    for (let i = -1; i <= NX; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const v = c.map(([a, b]) => P(a, b));
      const code = (v[0] > L ? 1 : 0) | (v[1] > L ? 2 : 0) | (v[2] > L ? 4 : 0) | (v[3] > L ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const E = (k) => lerp(c[k], c[(k + 1) % 4], v[k], v[(k + 1) % 4]); // edge k between corner k and k+1
      const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
      let list = T[code];
      if (code === 5 || code === 10) {
        const mid = (v[0] + v[1] + v[2] + v[3]) / 4 > L;
        list = code === 5 ? (mid ? [[3, 2], [1, 0]] : [[3, 0], [1, 2]]) : (mid ? [[0, 3], [2, 1]] : [[0, 1], [2, 3]]);
      }
      for (const [a, b] of list) segs.push([E(a), E(b)]);
    }
  }
  // stitch, orientation-agnostic: walk the undirected segment graph by endpoint key
  const key = (p) => p[0].toFixed(5) + ',' + p[1].toFixed(5);
  const at = new Map();
  segs.forEach((sg, k) => sg.forEach((p) => { const q = key(p); if (!at.has(q)) at.set(q, []); at.get(q).push(k); }));
  const used = new Uint8Array(segs.length), loops = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const loop = [segs[k][0]];
    let tail = segs[k][1];
    for (;;) {
      const next = (at.get(key(tail)) || []).find((n) => !used[n]);
      if (next === undefined) break;
      used[next] = 1; loop.push(tail);
      const sg = segs[next];
      tail = key(sg[0]) === key(tail) ? sg[1] : sg[0];
    }
    if (loop.length > 2) loops.push(loop.map(([gi, gj]) => [sx(px(gi)), sz(pz(gj))]));
  }
  return loops;
}

/* ---------------------------------------------------------- path output */
function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const rec = (a, b) => {
    let best = -1, bd = tol * tol;
    const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - A[0]) * dx + (pts[i][1] - A[1]) * dy) / L));
      const d = (pts[i][0] - A[0] - t * dx) ** 2 + (pts[i][1] - A[1] - t * dy) ** 2;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; rec(a, best); rec(best, b); }
  };
  rec(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}
const nums = (a) => a.reduce((s, n, i) => s + (i && n >= 0 ? ' ' : '') + n, '');
function rel(pts, close) {
  const q = pts.map(([x, y]) => [r0(x), r0(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (q.length < 2) return '';
  const d = [];
  for (let i = 1; i < q.length; i++) d.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  return `M${nums(q[0])}l${nums(d)}${close ? 'z' : ''}`;
}
const loopPath = (loops, tol) => loops.map((l) => {
  const s = dp([...l, l[0]], tol);
  return s.length > 3 ? rel(s.slice(0, -1), true) : '';
}).join('');

/* ---------------------------------------------------------------- build */
const RAMP = ['#E3D3A6', '#CBDA9C', '#B7D08F', '#A6C687', '#93B97C', '#80A86E', '#8FA27A', '#A9A58D', '#C4BEAC'];
let bands = `<rect class="dv-base" width="1600" height="1000" fill="${RAMP[0]}"/>`;
let lines = '';
levels.forEach((L, k) => {
  const d = loopPath(isoLoops(L), k < 2 ? 3.2 : 2.6);
  bands += `<path fill="${RAMP[k + 1]}" d="${d}"/>`;
  lines += d;
});

// river
const riv = spline(RIVER, 60).map(([x, z]) => [sx(x), sz(z)]);
const river = rel(dp(riv, 1.5), false);

// trees: little two-tone triangles (shared seeded positions)
const T = trees(64);
let treeD = '', treeL = '';
for (const [x, z, s] of T) {
  const X = r0(sx(x)), Y = r0(sz(z)), w = r0(10 * s), h = r0(26 * s);
  treeD += `M${X} ${Y - h}l${w} ${h}h${-2 * w}z`;
  treeL += `M${X} ${Y - h}l${w} ${h}h${-w}z`;
}

// village: roofs seen from above (two pitches), a tower
let roofA = '', roofB = '';
for (const [x, z, a, s] of houses()) {
  const c = Math.cos(a), n = Math.sin(a), L = 16 * s, Wd = 11 * s, X = sx(x), Y = sz(z);
  const pt = (u, v) => [X + u * c - v * n, Y + u * n + v * c];
  const quad = (p) => rel(p, true);
  roofA += quad([pt(-L, -Wd), pt(L, -Wd), pt(L, 0), pt(-L, 0)]);
  roofB += quad([pt(-L, 0), pt(L, 0), pt(L, Wd), pt(-L, Wd)]);
}
const vil = [sx(TER.vil[0] + 0.15), sz(TER.vil[1] - 0.1)].map(r0);

// flight path (dash-dot), pad, bead, drone
const fp = spline(PATH, 70).map(([x, z]) => [sx(x), sz(z) - 34]);
const flight = rel(dp(fp, 1), false);
const pad = [sx(TER.pad[0]), sz(TER.pad[1])].map(r0);
const end = fp[fp.length - 1].map(r0);

const drone = (() => {
  const [cx, cy] = [pad[0] - 92, pad[1] - 96];
  const arms = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const rotors = arms.map(([a, b]) => `<g class="dv-rotor" style="--rx:${cx + a * 38}px;--ry:${cy + b * 30}px"><ellipse cx="${cx + a * 38}" cy="${cy + b * 30}" rx="23" ry="23"/><path d="M${cx + a * 38 - 20} ${cy + b * 30}h40"/></g>`).join('');
  return `<g class="dv-drone"><ellipse class="dv-dshadow" cx="${cx + 26}" cy="${cy + 58}" rx="54" ry="20"/>` +
    `<g class="dv-hover"><path class="dv-arm" d="M${cx - 38} ${cy - 30}L${cx + 38} ${cy + 30}M${cx + 38} ${cy - 30}L${cx - 38} ${cy + 30}"/>` +
    `<rect class="dv-body" x="${cx - 26}" y="${cy - 18}" width="52" height="36" rx="11"/><rect class="dv-stripe" x="${cx - 16}" y="${cy - 10}" width="32" height="20" rx="6"/>` +
    `<circle class="dv-gimbal" cx="${cx + 30}" cy="${cy}" r="7"/>${rotors}</g></g>`;
})();

const svg = [
  '<svg class="dv-svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="dv-t dv-d" focusable="false"><title id="dv-t">{{t drone.svgT}}</title><desc id="dv-d">{{t drone.svgD}}</desc>',
  `<defs><mask id="dv-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><path class="dv-rev" pathLength="1" d="${flight}"/></mask></defs>`,
  `<g class="dv-bands">${bands}</g>`,
  `<path class="dv-river" d="${river}"/><path class="dv-river-hi" d="${river}"/>`,
  `<path class="dv-tree" d="${treeD}"/><path class="dv-tree-l" d="${treeL}"/>`,
  `<path class="dv-roof-a" d="${roofA}"/><path class="dv-roof-b" d="${roofB}"/><rect class="dv-tower" x="${vil[0] - 7}" y="${vil[1] - 7}" width="14" height="14" rx="3"/>`,
  `<circle class="dv-pad" cx="${pad[0]}" cy="${pad[1]}" r="48"/><path class="dv-h" d="M${pad[0] - 13} ${pad[1] - 17}v34M${pad[0] + 13} ${pad[1] - 17}v34M${pad[0] - 13} ${pad[1]}h26"/>`,
  `<circle class="dv-bead" cx="${pad[0] + 32}" cy="${pad[1] + 22}" r="11"/>`,
  `<g mask="url(#dv-mask)"><path class="dv-path-s" d="${flight}"/><path class="dv-path" d="${flight}"/></g>`,
  `<circle class="dv-home" cx="${end[0]}" cy="${end[1]}" r="7"/>`,
  drone,
  '</svg>',
].join('');

const out = `<!-- generated by tools/drone-svg.mjs from the w-drone.js heightfield — do not edit -->\n${svg}\n`;
fs.writeFileSync(path.join(ROOT, 'src/partials/gen-contours.html'), out);
const gz = zlib.gzipSync(Buffer.from(out), { level: 9 }).length;
console.log(`  gen-contours.html ${(out.length / 1024).toFixed(1)} KB raw / ${(gz / 1024).toFixed(1)} KB gzip · h ${lo.toFixed(2)}…${hi.toFixed(2)} · ${T.length} trees`);
if (out.length > 10 * 1024) console.warn('  ! over the 10 KB budget');
