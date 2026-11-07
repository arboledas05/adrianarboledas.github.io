/* kit.js (B2): shared toy kit, no imports. stage.js calls init(THREE, renderer, {mobile}) once.
   Pure helpers (noise2, fbm, rng, clamp, ease, smoother, damp, spring) also run in Node. Units: seconds. */
let T, R, M = 0, ok = 0, V, FP, PM;
const C = new Map(), { PI, cos, sin, min, max, round, floor, imul } = Math, INC = '#include <opaque_fragment>';
export function init(three, renderer, o = {}) { T = three; R = renderer; M = !!o.mobile; PM = null; }
const f32 = (a, n) => new T.Float32BufferAttribute(a, n), cnv = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/* geometry. ring: rounded rect [x, y, nx, ny], half a×b, corner r */
function ring(a, b, r, n) {
 const o = [];
 for (let k = 0; k < 4; k++) for (let j = 0; j <= n; j++) {
  const q = (k + j / n) * PI / 2, c = cos(q), s = sin(q);
  o.push([(k % 3 ? -1 : 1) * (a - r) + r * c, (k < 2 ? 1 : -1) * (b - r) + r * s, c, s]);
 }
 return o;
}
/* sweep profile [[dn, dt, nn, nt]] around a ring; ax = [u, v, thickness] axis indices; triangles wound to their normals */
function sweep(per, pr, ax, cap) {
 const P = [], N = [], U = [], I = [], np = per.length, nr = pr.length;
 const put = (u, v, t, nu, nv, nt, a, b) => { const i = P.length; P.push(0, 0, 0); N.push(0, 0, 0); P[i + ax[0]] = u; P[i + ax[1]] = v; P[i + ax[2]] = t; N[i + ax[0]] = nu; N[i + ax[1]] = nv; N[i + ax[2]] = nt; U.push(a, b); };
 per.forEach(([x, y, nx, ny], i) => pr.forEach(([dn, dt, nn, nt], j) => put(x + nx * dn, y + ny * dn, dt, nx * nn, ny * nn, nt, i / (np - 1), j / (nr - 1))));
 for (let i = 0; i < np; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = ((i + 1) % np) * nr + j; I.push(a, b, b + 1, a, b + 1, a + 1); }
 if (cap) for (const [j, s] of [[0, -1], [nr - 1, 1]]) { const c = P.length / 3; put(0, 0, pr[j][1], 0, 0, s, .5, .5); for (let i = 0; i < np; i++) I.push(c, i * nr + j, ((i + 1) % np) * nr + j); }
 for (let k = 0; k < I.length; k += 3) {
  const [a, b, c] = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3], d = (i) => P[b + i] - P[a + i], e = (i) => P[c + i] - P[a + i], n = (i) => N[a + i] + N[b + i] + N[c + i];
  if ((d(1) * e(2) - d(2) * e(1)) * n(0) + (d(2) * e(0) - d(0) * e(2)) * n(1) + (d(0) * e(1) - d(1) * e(0)) * n(2) < 0) [I[k + 1], I[k + 2]] = [I[k + 2], I[k + 1]];
 }
 const g = new T.BufferGeometry();
 g.setAttribute('position', f32(P, 3)); g.setAttribute('normal', f32(N, 3)); g.setAttribute('uv', f32(U, 2)); g.setIndex(I); g.computeBoundingSphere();
 return g;
}
/* slab: rounded box; corners (r) round the THINNEST axis, edges bevelled (bevel); analytic smooth normals */
export function slab(w, h = w, d = w, o = {}) {
 const D = [w, h, d]; let t = 1; if (d < D[t]) t = 2; if (w < D[t]) t = 0;
 const pa = [[2, 1], [0, 2], [0, 1]][t], A = D[pa[0]] / 2, B = D[pa[1]] / 2, H = D[t] / 2, pr = [];
 const r = min(o.r ?? min(.08, min(A, B) * .5), A, B), b = min(o.bevel ?? min(r, H * .7), H, r), bs = o.seg ?? 3;
 for (const y of [-1, 1]) for (let i = 0; i <= bs; i++) { const f = (y < 0 ? -PI / 2 : 0) + i / bs * PI / 2; pr.push([b * cos(f), y * (H - b) + b * sin(f), cos(f), sin(f)]); }
 return sweep(ring(A - b, B - b, r - b, o.cseg ?? max(bs, min(12, round(3 + r * 30)))), pr, [...pa, t], 1);
}
export function rrShape(w, h, r) {
 const s = new T.Shape(), x = -w / 2, y = -h / 2; r = min(r, w / 2, h / 2);
 s.moveTo(x + r, y); s.absarc(x + w - r, y + r, r, -PI / 2, 0); s.absarc(x + w - r, y + h - r, r, 0, PI / 2);
 s.absarc(x + r, y + h - r, r, PI / 2, PI); s.absarc(x + r, y + r, r, PI, PI * 1.5);
 return s;
}
/* extrude centred on z; bevelOffset −bevel keeps the outline at the shape size */
export function extrude(sh, { depth = .1, bevel = 0, bevelSeg = 3, curveSeg = 8 } = {}) {
 const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: bevelSeg, curveSegments: curveSeg });
 g.translate(0, 0, -depth / 2);
 return g;
}
/* position-hash mergeVertices + computeVertexNormals → new indexed geometry (input disposed) */
export function smoothNormals(g, eps = 1e-4) {
 const p = g.attributes.position, uv = g.attributes.uv, ix = g.index, m = new Map(), P = [], U = [], I = [];
 for (let i = 0; i < (ix ? ix.count : p.count); i++) {
  const v = ix ? ix.getX(i) : i, x = p.getX(v), y = p.getY(v), z = p.getZ(v), k = round(x / eps) + ',' + round(y / eps) + ',' + round(z / eps);
  let j = m.get(k);
  if (j === undefined) { m.set(k, j = P.length / 3); P.push(x, y, z); uv && U.push(uv.getX(v), uv.getY(v)); }
  I.push(j);
 }
 const o = new T.BufferGeometry();
 o.setAttribute('position', f32(P, 3)); uv && o.setAttribute('uv', f32(U, 2)); o.setIndex(I); o.computeVertexNormals(); o.computeBoundingSphere(); g.dispose();
 return o;
}
/* merge geometries (shared attributes only; transform them first) */
export function merge(gs) {
 gs = gs.filter(Boolean); if (!gs.every((g) => g.index)) gs = gs.map((g) => (g.index ? g.toNonIndexed() : g));
 const o = new T.BufferGeometry(), sum = (f) => gs.reduce((s, g) => s + f(g), 0);
 for (const k of Object.keys(gs[0].attributes).filter((k) => gs.every((g) => g.attributes[k]))) {
  const it = gs[0].attributes[k].itemSize, a = new Float32Array(sum((g) => g.attributes[k].count * it)); let off = 0;
  for (const g of gs) { a.set(g.attributes[k].array, off); off += g.attributes[k].count * it; }
  o.setAttribute(k, new T.BufferAttribute(a, it));
 }
 if (gs[0].index) {
  const I = new Uint32Array(sum((g) => g.index.count)); let off = 0, base = 0;
  for (const g of gs) { for (let i = 0; i < g.index.count; i++) I[off++] = g.index.getX(i) + base; base += g.attributes.position.count; }
  o.setIndex(new T.BufferAttribute(I, 1));
 }
 o.computeBoundingSphere();
 return o;
}
/* the indigo plinth lip: tube along a rounded rect in the xz plane at y 0 → Mesh */
export function lip(w, d, r = .2, rad = .035, mat) {
 const pr = []; for (let i = 0; i <= 8; i++) { const f = i * PI / 4; pr.push([rad * cos(f), rad * sin(f), cos(f), sin(f)]); }
 return new T.Mesh(sweep(ring(w / 2, d / 2, min(r, w / 2, d / 2), 8), pr, [0, 2, 1]), mat || clay('#3A2BE0', { coat: .6 }));
}
/* instanced pills along a curve (short > 0: dash-dot); mesh.userData.draw(f) reveals 0..1 */
export function dashes(cu, n, { long = .1, short = 0, r = .014, mat } = {}) {
 const m = new T.InstancedMesh(new T.CapsuleGeometry(r, long, 3, 8), mat || clay('#3A2BE0', { coat: .6 }), n), o = new T.Object3D(), up = new T.Vector3(0, 1, 0);
 for (let i = 0; i < n; i++) {
  const u = (i + .5) / n; o.position.copy(cu.getPointAt(u)); o.quaternion.setFromUnitVectors(up, cu.getTangentAt(u).normalize());
  o.scale.set(1, short && i % 2 ? max(.05, short / long) : 1, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
 }
 m.userData.draw = (f) => { m.count = round(n * clamp(f)); };
 return m;
}

/* materials. clay: Physical (desktop) / Standard (phones); rim + soft wrap before <opaque_fragment>; cache key 'clay' */
export function clay(hex, o = {}) {
 const { rough = .55, coat = .3, rim = '#C7B8FF', rimK = .35, wrap = .12, ccr = .45, env = .9, key = 'clay', patch, ...x } = o;
 const m = M ? new T.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, envMapIntensity: env, ...x })
  : new T.MeshPhysicalMaterial({ color: hex, roughness: rough, metalness: 0, clearcoat: max(coat, .02), clearcoatRoughness: ccr, envMapIntensity: env, ...x });
 const u = m.userData.u = { rimColor: { value: new T.Color(rim) }, rimK: { value: rimK }, wrapK: { value: wrap } };
 m.onBeforeCompile = (s, r) => {
  Object.assign(s.uniforms, u);
  if (s.fragmentShader.includes(INC)) {
   ok = 1;
   s.fragmentShader = 'uniform vec3 rimColor;uniform float rimK,wrapK;\n' + s.fragmentShader.replace(INC, 'outgoingLight+=rimColor*pow(1.-saturate(dot(normal,isOrthographic?vec3(0,0,1):normalize(vViewPosition))),2.5)*rimK+diffuseColor.rgb*wrapK*(.5+.5*normal.y);\n' + INC);
  }
  patch && patch(s, r);
 };
 m.customProgramCacheKey = () => key;
 return m;
}
export const lacquer = (hex, o = {}) => clay(hex, { rough: .25, coat: 1, ccr: .06, rimK: .2, env: M ? 1.2 : 1, ...o });
export const frosted = (hex, opacity = .5) => new T.MeshStandardMaterial({ color: hex, transparent: true, opacity, depthWrite: false, roughness: .2, metalness: 0, envMapIntensity: .7 });
export function hull(geo, hex = '#1F4FB8', s = 1.03) { const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: hex, side: T.BackSide })); m.scale.setScalar(s); return m; }
/* unlit dashed tube: uColor, uDraw (reveal along uv.x), uTime, uRep, uSpeed, uDuty, uOpacity */
export function dashMat(hex = '#3A2BE0', o = {}) {
 const v = (x) => ({ value: x });
 return new T.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { uColor: v(new T.Color(hex)), uDraw: v(1), uTime: v(0), uRep: v(o.rep ?? 34), uSpeed: v(o.speed ?? .6), uDuty: v(o.duty ?? .5), uOpacity: v(o.opacity ?? 1) },
  vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform vec3 uColor;uniform float uDraw,uTime,uRep,uSpeed,uDuty,uOpacity;varying vec2 vU;void main(){if(vU.x>uDraw||fract(vU.x*uRep-uTime*uSpeed)>uDuty)discard;gl_FragColor=vec4(uColor,uOpacity);\n#include <colorspace_fragment>\n}'
 });
}

/* lighting: EVERY scene = 1 Hemisphere + 2 Directional + Fog (same programs everywhere) */
export function rig(sc, { hemi = ['#fff', '#ccc', 1], key = ['#fff', 2, [-3, 5, 6]], rim = ['#C7B8FF', 1, [4, 3, -5]], fog = [] } = {}) {
 const o = { hemi: new T.HemisphereLight(...hemi), key: new T.DirectionalLight(key[0], key[1]), rim: new T.DirectionalLight(rim[0], rim[1]) };
 o.key.position.set(...key[2]); o.rim.position.set(...rim[2]); sc.add(o.hemi, o.key, o.rim);
 sc.fog = new T.Fog(fog[0] || hemi[0], fog[1] ?? 1, fog[2] ?? 1e4);
 return o;
}
/* PMREM of a vertical gradient (stops top → bottom, '#hex' or [offset, '#hex']), cached per stops.
   One page-wide generator fed a small equirect (cube 64, < 1 MB each): its programs compile once, freed by destroy(). */
function equi(stops) {
 const cv = cnv(256, 128), g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
 stops.forEach((s, i) => (Array.isArray(s) ? gr.addColorStop(...s) : gr.addColorStop(i / max(1, stops.length - 1), s)));
 g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
 const tx = new T.CanvasTexture(cv);
 tx.mapping = T.EquirectangularReflectionMapping; tx.colorSpace = T.SRGBColorSpace;
 return tx;
}
export function env(renderer, stops) {
 if (Array.isArray(renderer)) stops = renderer;
 const k = 'e' + stops; if (C.has(k)) return C.get(k);
 const tx = equi(stops), t = (PM = PM || new T.PMREMGenerator(R)).fromEquirectangular(tx).texture; tx.dispose();
 t.userData.shared = 1; C.set(k, t);
 return t;
}
/* envSteps(stops): env(stops) as a generator, for idle slices: the same passes as PMREMGenerator.fromEquirectangular (r160
   internals, three is pinned: the cube-UV pass, then the blur passes, two per step), the renderer's target restored after
   every step; the map lands in the same cache, so a later env(stops) returns it. it.return() (or a throw) frees the target. */
const PHI = (1 + Math.sqrt(5)) / 2, AX = [[1, 1, 1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, PHI, 1 / PHI], [0, PHI, -1 / PHI], [1 / PHI, 0, PHI], [-1 / PHI, 0, PHI], [PHI, 1 / PHI, 0], [-PHI, 1 / PHI, 0]];
export function* envSteps(stops) {
 const k = 'e' + stops; if (C.has(k)) return C.get(k);
 const g = (PM = PM || new T.PMREMGenerator(R)), tx = equi(stops), o = [R.getRenderTarget(), R.getActiveCubeFace(), R.getActiveMipmapLevel()];
 g._setSize(tx.image.width / 4);
 const rt = g._allocateTargets(), back = () => R.setRenderTarget(...o);
 let done = 0;
 try {
  g._textureToCubeUV(tx, rt); back(); yield;
  for (let i = 1; i < g._lodPlanes.length; i++) {
   const ac = R.autoClear; R.autoClear = false;
   try { g._blur(rt, i - 1, i, Math.sqrt(g._sigmas[i] * g._sigmas[i] - g._sigmas[i - 1] * g._sigmas[i - 1]), new T.Vector3(...AX[(i - 1) % AX.length])); }
   finally { R.autoClear = ac; back(); }
   if (i % 2 === 0 && i < g._lodPlanes.length - 1) yield;
  }
  rt.scissorTest = false; rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height);
  const t = rt.texture; t.userData.shared = 1; C.set(k, t); done = 1;
  return t;
 } finally { tx.dispose(); done || rt.dispose(); }
}
/* envPrep(): the two PMREM programs (equirect → cube-UV, blur) compiled and linked in parallel (KHR_parallel_shader_compile)
   before the first env(), which then only renders: no 150 ms synchronous compile + link in one task. r160 internals (three
   is pinned): the same cube size and the same half-float target as env(), so three reuses these programs (same keys). */
export function envPrep() {
 PM = PM || new T.PMREMGenerator(R);
 if (PM._equirectMaterial || !R.compileAsync) return Promise.resolve();
 PM._setSize(64); /* env(): a 256-wide equirect → cube 64 */
 const rt = PM._allocateTargets(), sc = new T.Scene(), cam = new T.OrthographicCamera(), prev = R.getRenderTarget();
 PM._compileMaterial = () => {}; PM.compileEquirectangularShader(); delete PM._compileMaterial; /* create, do not compile */
 for (const m of [PM._equirectMaterial, PM._blurMaterial]) sc.add(new T.Mesh(PM._lodPlanes[0], m));
 let p;
 try { R.setRenderTarget(rt); p = R.compileAsync(sc, cam); } finally { R.setRenderTarget(prev); }
 const done = () => rt.dispose();
 return p.then(done, done);
}
/* engine teardown: the shared generator and every cached texture */
export function destroy() { if (PM) PM.dispose(); PM = null; C.forEach((t) => t && t.dispose && t.dispose()); C.clear(); }
/* soft contact shadow: flat radial-gradient plane (shared texture) */
export function blob(w, h, a = .2, color = '#2B2347') {
 let t = C.get('b');
 if (!t) {
  const cv = cnv(64, 64), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#fff'); gr.addColorStop(.45, '#ffffff8c'); gr.addColorStop(1, '#fff0'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  C.set('b', t = new T.CanvasTexture(cv)); t.userData.shared = 1;
 }
 const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color, map: t, transparent: true, opacity: a, depthWrite: false, toneMapped: false }));
 m.rotation.x = -PI / 2; m.renderOrder = -1;
 return m;
}
/* await canvasTex(w, h, (g, w, h) => …) after the site fonts; tex.redraw(fn?) repaints. Use toneMapped:false. */
export async function canvasTex(w, h, draw) {
 await (FP = FP || Promise.race([Promise.all(['700 16px "Bricolage Grotesque"', '600 16px "JetBrains Mono"'].map((f) => document.fonts.load(f).catch(() => 0))), new Promise((r) => setTimeout(r, 1500))]));
 const cv = cnv(w, h), g = cv.getContext('2d'), t = new T.CanvasTexture(cv);
 draw(g, w, h); t.colorSpace = T.SRGBColorSpace;
 t.redraw = (fn = draw) => { g.clearRect(0, 0, w, h); fn(g, w, h); t.needsUpdate = true; };
 return t;
}

/* noise (pure): value noise2 in [-1, 1]; fbm(x·freq, y·freq, oct, seed) in [-1, 1]; rng = mulberry32 */
const hash = (x, y, s) => { let h = (imul(x, 374761393) + imul(y, 668265263) + imul(s, 1442695041)) | 0; h = imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function noise2(x, y, s = 0) {
 const ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
 const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
 return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, y, oct = 4, s = 0) {
 let t = 0, a = .5, n = 0;
 for (let i = 0; i < oct; i++) { t += a * noise2(x, y, s + i * 17); n += a; x = x * 2.03 + 1.7; y = y * 2.03 - 3.1; a /= 2; }
 return t / n;
}
export function rng(seed = 1) {
 let a = seed >>> 0;
 return () => { a = (a + 0x6D2B79F5) | 0; let t = imul(a ^ (a >>> 15), 1 | a); t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* motion (seconds), mirroring the CSS easing tokens */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smoother = (t) => (t = clamp(t), t * t * t * (t * (t * 6 - 15) + 10));
export const damp = (a, b, l, dt) => b + (a - b) * Math.exp(-l * dt);
export const ease = {
 out: (t) => 1 - (1 - clamp(t)) ** 4.5,
 back: (t) => (t = clamp(t) - 1, 1 + 2.70158 * t ** 3 + 1.70158 * t * t),
 inout: (t) => (t = clamp(t), t < .5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2)
};
/* s = spring(k, c, x0); s.t = target; s.step(dt) → x; s.set(x); s.rest() */
export function spring(k = 170, c = 26, x = 0) {
 return {
  x, v: 0, t: x,
  step(dt) { dt = min(dt, .1); const n = max(1, Math.ceil(dt * 120)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (k * (this.t - this.x) - c * this.v) * h; this.x += this.v * h; } return this.x; },
  set(v) { this.x = this.t = v; this.v = 0; return this; },
  rest() { return Math.abs(this.t - this.x) + Math.abs(this.v) < 1e-4; }
 };
}

/* idleChunks(tasks, ms = 8): tasks (sync, async or generator) in idle slices of ≤ ms, in order → Promise(results).
   A generator task (function*) yields between rows of a big loop and resumes in the next slice. The budget is checked
   before every task / step; a fresh slice always runs ≥ 1 step; a timed-out callback (no idle for 1 s) gets 4 ms.
   Without requestIdleCallback (Safari): right after a frame, 6 ms. */
export async function idleChunks(tasks, ms = 8) {
 const now = () => performance.now(), out = [];
 const ric = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 1000 })
  : (f) => requestAnimationFrame(() => setTimeout(() => f({ didTimeout: false, timeRemaining: () => 6 })));
 let end = 0;
 const gate = () => (end - now() >= 2 ? 0 : new Promise((r) => ric((dl) => { end = now() + (dl.didTimeout ? 4 : min(ms, dl.timeRemaining())); r(); })));
 for (let i = 0; i < tasks.length; i++) {
  await gate();
  let r = tasks[i]();
  if (r && typeof r.next === 'function') { let s; while (!(s = r.next()).done) await gate(); r = s.value; }
  out[i] = await r;
 }
 await gate(); /* the caller's code after the last task starts in a fresh slice, not at the end of a spent one */
 return out;
}
/* world point → slot pixels {x, y, z, vis} */
export function project(v, cam, w, h, o = {}) {
 const p = (V = V || new T.Vector3()).copy(v).project(cam);
 o.x = (p.x + 1) * w / 2; o.y = (1 - p.y) * h / 2; o.z = p.z; o.vis = p.z > -1 && p.z < 1;
 return o;
}
/* dispose geometries, materials and their own textures (shared kit textures are kept) */
export function dispose(root) {
 const own = (v) => v && v.isTexture && !v.userData.shared && v.dispose();
 root && root.traverse((x) => {
  x.geometry && x.geometry.dispose();
  if (x.isInstancedMesh) x.dispose(); /* r160: instanceMatrix / instanceColor buffers are only freed by the mesh's own dispose */
  for (const m of [].concat(x.material || [])) {
   for (const k in m) own(m[k]);
   for (const u of Object.values(m.uniforms || {})) own(u && u.value);
   m.dispose();
  }
 });
}
/* compile clay once; warn when the r160 include marker is missing */
export function selfTest() {
 const sc = new T.Scene(); sc.add(new T.Mesh(new T.BoxGeometry(), clay('#fff'))); rig(sc); ok = 0;
 try { R.compile(sc, new T.PerspectiveCamera()); } catch (e) {}
 ok || console.warn('[aa] kit: no ' + INC);
 dispose(sc);
 return !!ok;
}
