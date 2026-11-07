/* w-grow.js (B4) · 03 Grow · The Marble-Run Garden. Readable source; assets/js/w-grow.js is its esbuild --minify output.
   43 marbles = 430 clicks (8–23 Oct 2026, 1 marble = 10 clicks) · exactly 19 beads = contacts · exactly 170 teeth = 170+ negatives.
   Counted pieces are pure functions of f (scroll p .16–.44, or the 6 s board:replay); nothing counted moves at rest.
   Towers stack at p .30–.48 and the sprout pops by .55, so the CTR contrast is complete while the stage is centred.
   Towers: CTR 9.3 % (gloss lacquer, his result) vs ≈6 % sector average (matte, dotted), 21 Apr – 27 Jul 2026, never combined with f. */
export async function create(THREE, kit, ctx, slot, opt = {}) {
  const { Vector3: V, Vector2, Mesh, Group, Object3D, InstancedMesh, LatheGeometry, BoxGeometry, CylinderGeometry, TorusGeometry, SphereGeometry, MeshBasicMaterial, Color, CatmullRomCurve3, TubeGeometry, QuadraticBezierCurve3, ExtrudeGeometry, Shape, PerspectiveCamera, Raycaster, Scene } = THREE;
  const bus = opt.bus || ctx.bus, mob = !!opt.mobile, PI = Math.PI, abs = Math.abs;
  const tq = (q) => (typeof q == 'number' ? q : parseInt(String(q == null ? 3 : q).replace(/\D/g, '')) || 3);
  let Q = mob ? 1 : tq(opt.tier);
  const C = (a) => (a < 0 ? 0 : a > 1 ? 1 : a), eo = (t) => 1 - (1 - t) ** 3, eb = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const clay = (h, o) => kit.clay(h, o), lac = (h) => kit.lacquer(h);
  const scene = new Scene(), turn = new Group(), root = new Group();
  scene.add(turn); turn.add(root);
  const STOPS = ['#FFF6EA', '#FFFFFF', '#FFC79E', '#5B3A8A'];
  const keyL = kit.rig(scene, { hemi: ['#FFF3E2', '#F2C7A8', 0.8], key: ['#FFE1BD', 2.5, [-5, 4, 3]], rim: ['#FF7A3D', 0.8, [3, 2, -4]], fog: ['#FCEFE2', 40, 1e4] }).key, keyP = keyL.position.clone();
  scene.environment = kit.env(STOPS); // one bright band in the gradient for lacquer streaks
  const cam = new PerspectiveCamera(30, 2, 0.1, 80), o3 = new Object3D(), TOP = 0.3, UP = new V(0, 1, 0);
  const add = (g, m, x = 0, y = 0, z = 0, p = root) => { const o = new Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
  const grp = (x, y, z, p = root) => { const g = new Group(); g.position.set(x, y, z); p.add(g); return g; };
  const inst = (g, m, n, p = root) => { const o = new InstancedMesh(g, m, n); o.frustumCulled = false; p.add(o); return o; }; // instances move: never cull on a stale bound
  const setI = (im, i, x, y, z, s = 1, sy = s, ry = 0, rx = 0) => { o3.position.set(x, y, z); o3.rotation.set(rx, ry, 0); o3.scale.set(s, sy, s); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); im.instanceMatrix.needsUpdate = true; };
  const lathe = (pts, seg = 48) => new LatheGeometry(pts.map(([a, b]) => new Vector2(a, b)), seg);
  const puck = (r, h, e, seg = 48) => { // rounded disc profile, base at y 0
    const p = [[0, 0]];
    for (let k = 0; k < 5; k++) { const a = (k / 4) * PI / 2; p.push([r - e + Math.sin(a) * e, e - Math.cos(a) * e]); }
    for (let k = 0; k < 5; k++) { const a = (k / 4) * PI / 2; p.push([r - e + Math.cos(a) * e, h - e + Math.sin(a) * e]); }
    p.push([0, h]); return lathe(p, seg);
  };
  const slab = (w, h, d, r = 0.04) => kit.slab(w, h, d, { r });
  const blob = (w, h, a, x, z) => { const b = kit.blob(w, h, a); b.rotation.z = 0.6; b.position.set(x + 0.12, TOP + 0.004, z - 0.08); root.add(b); }; // stretched away from the low key light
  const hit = [], proxy = (id, w, h, d, x, y, z) => { const m = add(new BoxGeometry(w, h, d), new MeshBasicMaterial(), x, y, z); m.visible = false; m.userData.id = id; hit.push(m); };
  const tips = {}, anchors = {}, anchor = (k, x, y, z) => { anchors[k] = grp(x, y, z); };
  slot.querySelectorAll('[data-hotspot]').forEach((el) => { tips[el.dataset.hotspot] = el; });
  for (const k of ['us', 'sector']) { const el = tips[k], t = el && el.firstChild, i = t && t.nodeType == 3 ? t.data.indexOf(' · ') : -1; if (i > 0) { const x = document.createElement('span'); x.className = 'hs-x'; x.textContent = t.data.slice(i); t.data = t.data.slice(0, i); el.appendChild(x); } } // the tower chips: value + its tail (dates / 'sector average'); phones show only the value, right on its tower

  /* layout */
  const HOP = new V(-2.3, 2.55, -0.4), HOUSE = new V(2, TOP, -0.05), BOWL = new V(0.55, TOP, 1.95), TRAY = new V(3.05, TOP, -0.35); // tray beside the house (long side along z)
  const TW = [new V(2.0, TOP, 2.15), new V(2.75, TOP, 1.65)]; // front right, in front of the house (phones too: the higher phone camera keeps them clear of the run)
  const pieces = [], piece = (x, y, z) => { const g = grp(x, y, z); pieces.push([g, y]); return g; };
  let teeth, rails = [], marbles, beads, dUs, dSec, cap, sprout, grass, caret, matchM, curve, uOfTau, posts;

  const build = [
    () => { // plinth: terracotta band, apricot top, indigo lip, grass tufts
      add(puck(3.6, 0.28, 0.08, 96), clay('#E0784F'));
      add(puck(3.5, 0.03, 0.014, 96), clay('#F4C08E', { rim: '#FFD9B8' }), 0, 0.27);
      add(new TorusGeometry(3.55, 0.03, 8, 192), clay('#3A2BE0', { coat: 0.6 }), 0, TOP - 0.01).rotation.x = PI / 2;
      grass = inst(new THREE.ConeGeometry(0.04, 0.14, 5), clay('#3FB57A'), 40);
      const rnd = kit.rng ? kit.rng(7) : Math.random, far = (x, z, c, d) => Math.hypot(x - c.x, z - c.z) > d;
      grass.userData.p = [];
      const ok = (x, z) => Math.hypot(x, z) < 3.38 && far(x, z, HOUSE, 1) && far(x, z, BOWL, 0.8) && far(x, z, TRAY, 0.8) && TW.every((t) => far(x, z, t, 0.5));
      for (let i = 0, n = 0; n < 8 && i < 400; i++) { // 8 tufts near the rim, 5 blades each
        const a = rnd() * 6.283, r = 2.6 + rnd() * 0.7, cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        if (!ok(cx, cz) || grass.userData.p.some(([x, z]) => Math.hypot(x - cx, z - cz) < 0.9)) continue;
        for (let k = 0; k < 5; k++) { const b = rnd() * 6.283, d = k ? 0.06 + rnd() * 0.12 : 0; grass.userData.p.push([cx + Math.cos(b) * d, cz + Math.sin(b) * d, rnd() * 6, (k ? 0.65 : 1.05) + rnd() * 0.35]); }
        n++;
      }
    },
    () => { // search sign + lacquer hopper + exactly 170 teeth + stand
      const g = piece(HOP.x, HOP.y, HOP.z), tg = grp(0, 0, 0, g), s = grp(0, 0.95, -0.05, g);
      add(lathe([[0.15, -0.14], [0.15, 0], [0.6, 0.5], [0.63, 0.55], [0.6, 0.585], [0.57, 0.55], [0.12, 0.03], [0.12, -0.14]], 40), lac('#FF6A3D'), 0, 0, 0, g);
      teeth = inst(new BoxGeometry(0.016, 0.1, 0.03), clay('#FFD166'), 170, tg);
      for (let i = 0; i < 170; i++) { const a = (i / 170) * 2 * PI; setI(teeth, i, Math.cos(a) * 0.65, 0.6, Math.sin(a) * 0.65, 1, 1, -a); }
      add(new CylinderGeometry(0.035, 0.05, HOP.y - TOP - 0.14, 12), clay('#B8501D'), 0, -(HOP.y - TOP + 0.14) / 2, 0, g);
      add(slab(1, 0.24, 0.05, 0.02), clay('#FFFFFF'), 0, 0, 0, s);
      matchM = clay('#CFC6BA');
      add(slab(0.5, 0.05, 0.012, 0.005), matchM, 0.06, 0, 0.03, s);
      add(new TorusGeometry(0.05, 0.012, 6, 20), clay('#3A2BE0'), -0.33, 0.01, 0.03, s);
      add(new CylinderGeometry(0.011, 0.011, 0.06, 6), clay('#3A2BE0'), -0.29, -0.035, 0.03, s).rotation.z = 0.8;
      caret = add(new THREE.PlaneGeometry(0.012, 0.11), new MeshBasicMaterial({ color: 0x3a2be0 }), 0.36, 0, 0.032, s);
      proxy('sign', 1.05, 0.3, 0.2, HOP.x, HOP.y + 0.95, HOP.z);
      proxy('teeth', 1.4, 0.22, 1.4, HOP.x, HOP.y + 0.57, HOP.z);
      anchor('teeth', HOP.x - 0.66, HOP.y + 0.62, HOP.z); anchor('sign', HOP.x, HOP.y + 1.1, HOP.z);
      blob(0.7, 0.7, 0.35, HOP.x, HOP.z);
    },
    () => { // two-rail troughs: rails offset on a fixed-up side normal (no Frenet twist) + posts
      const P = [[-2.3, 2.2, -0.4], [-1.3, 2, -1.1], [0.2, 1.78, -1.3], [1.15, 1.56, -0.75], [0.35, 1.32, -0.15], [-1.15, 1.08, 0.15], [-1.75, 0.86, 0.85], [-0.45, 0.64, 1.15], [1.72, 0.44, 0.5]];
      curve = new CatmullRomCurve3(P.map((p) => new V(...p)), false, 'centripetal');
      const N = 256, T = [0], h0 = curve.getPointAt(0).y; // gravity timing table: speed ∝ sqrt(2g·drop)
      for (let k = 1; k < N; k++) T.push(T[k - 1] + 1 / Math.sqrt(0.36 + 19.6 * (h0 - curve.getPointAt(k / (N - 1)).y)));
      uOfTau = (t) => { t *= T[N - 1]; let lo = 0, hi = N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m; else hi = m; } return (lo + (t - T[lo]) / (T[hi] - T[lo] || 1)) / (N - 1); };
      const railM = lac('#FFD166');
      for (const sd of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 64; k++) { const u = k / 64; pts.push(curve.getPointAt(u).addScaledVector(new V().crossVectors(curve.getTangentAt(u), UP).normalize(), 0.075 * sd)); }
        rails.push(add(new TubeGeometry(new CatmullRomCurve3(pts), mob ? 140 : 220, 0.022, 6), railM));
      }
      posts = inst(new CylinderGeometry(0.026, 0.026, 1, 8), clay('#E0784F'), 16);
      for (let i = 0; i < 16; i++) { const c = curve.getPointAt((i + 0.5) / 16), h = c.y - 0.05 - TOP; setI(posts, i, c.x, TOP + h / 2, c.z, 1, h); }
    },
    () => { // landing-page house (front plate = message match), marble tray behind it, terracotta bowl
      const g = piece(HOUSE.x, HOUSE.y, HOUSE.z), t = piece(TRAY.x, TRAY.y, TRAY.z), b = piece(BOWL.x, BOWL.y, BOWL.z), sh = new Shape();
      add(slab(1, 0.8, 0.8, 0.06), clay('#FFF8EE'), 0, 0.4, 0, g);
      sh.moveTo(-0.58, 0); sh.lineTo(0, 0.42); sh.lineTo(0.58, 0); sh.closePath();
      add(new ExtrudeGeometry(sh, { depth: 0.9, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), clay('#FFCCA3'), 0, 0.8, -0.45, g);
      add(slab(0.14, 0.3, 0.14, 0.03), clay('#E0784F'), 0.28, 1.12, -0.15, g);
      add(slab(0.22, 0.36, 0.03, 0.012), clay('#B8501D'), -0.25, 0.18, 0.41, g);
      add(slab(0.4, 0.3, 0.02, 0.01), clay('#FFFFFF'), 0.18, 0.5, 0.41, g);
      add(slab(0.28, 0.045, 0.012, 0.005), matchM, 0.18, 0.58, 0.425, g);
      for (const y of [0.49, 0.44]) add(slab(0.26, 0.016, 0.01, 0.004), clay('#E8E0D4'), 0.17, y, 0.425, g);
      proxy('house', 0.45, 0.35, 0.1, HOUSE.x + 0.18, HOUSE.y + 0.5, HOUSE.z + 0.42);
      anchor('house', HOUSE.x + 0.18, HOUSE.y + 0.75, HOUSE.z + 0.42);
      blob(1.3, 1.1, 0.45, HOUSE.x, HOUSE.z);
      add(slab(0.66, 0.08, 1.04, 0.03), clay('#FFCCA3'), 0, 0.04, 0, t);
      add(lathe([[0, 0], [0.32, 0], [0.47, 0.08], [0.55, 0.24], [0.57, 0.3], [0.53, 0.32], [0.5, 0.28], [0.42, 0.12], [0.3, 0.05], [0, 0.05]]), clay('#E0784F'), 0, 0, 0, b);
      proxy('tray', 0.7, 0.3, 1.1, TRAY.x, TRAY.y + 0.1, TRAY.z);
      proxy('bowl', 1.2, 0.6, 1.2, BOWL.x, BOWL.y + 0.25, BOWL.z);
      anchor('bowl', BOWL.x, BOWL.y, BOWL.z + 0.62); // the bowl's front lip: the label hangs below it, on the empty plinth, clear of the run
      blob(1.3, 1.3, 0.4, BOWL.x, BOWL.z);
    },
    () => { // CTR towers on pots: his 9 lacquer discs + cap (= 9.3) vs 6 matte, gapped discs (≈6)
      for (const t of TW) { add(lathe([[0, 0], [0.24, 0], [0.31, 0.2], [0.3, 0.23], [0, 0.23]], 32), clay('#E0784F'), t.x, t.y, t.z); blob(0.8, 0.8, 0.35, t.x, t.z); }
      dUs = inst(puck(0.22, 0.1, 0.03, 40), lac('#FFFFFF'), 9);
      for (let i = 0; i < 9; i++) dUs.setColorAt(i, new Color(i % 2 ? '#FFD166' : '#FF6A3D'));
      dSec = inst(puck(0.22, 0.07, 0.02, 40), clay('#CFC6BA', { rough: 0.9, coat: 0 }), 6);
      cap = add(puck(0.22, 0.03, 0.012, 40), clay('#3A2BE0', { coat: 0.6 }), TW[0].x, 0, TW[0].z);
      sprout = grp(TW[0].x, TOP + 1.16, TW[0].z);
      add(new CylinderGeometry(0.012, 0.016, 0.16, 6), clay('#3FB57A'), 0, 0.08, 0, sprout);
      for (const s of [-1, 1]) { const l = add(new SphereGeometry(0.07, 12, 8), clay('#3FB57A'), 0.06 * s, 0.17, 0, sprout); l.scale.set(1, 0.35, 0.6); l.rotation.z = -0.5 * s; }
      proxy('us', 0.6, 1.3, 0.6, TW[0].x, TOP + 0.75, TW[0].z); proxy('sector', 0.6, 0.9, 0.6, TW[1].x, TOP + 0.6, TW[1].z);
      anchor('us', TW[0].x, TOP + 1.45, TW[0].z); anchor('sector', TW[1].x, TOP + (mob ? 0.9 : 0.98), TW[1].z); // each chip right above its own tower
    },
    () => { // fact counts, never scaled by tier
      marbles = inst(new SphereGeometry(0.07, mob ? 10 : 16, mob ? 6 : 10), lac('#FFF8EE'), 43);
      beads = inst(new SphereGeometry(0.075, 14, 10), clay('#3A2BE0', { coat: 0.8 }), 19);
    }
  ];
  await kit.idleChunks(build);

  /* pure positions of f */
  const mOf = (j) => Math.floor(((j + 1) * 43) / 19) - 1; // bead j pops when marble mOf(j) enters the house
  const trayP = (i) => { const r = (i / 8) | 0, c = i % 8; return [TRAY.x - 0.26 + r * 0.104, TRAY.y + 0.13, TRAY.z - 0.42 + c * 0.12 + (r % 2) * 0.06]; };
  const bowlP = (j) => { for (const [n, r, y] of [[8, 0.21, 0.12], [7, 0.3, 0.22], [4, 0.13, 0.25]]) { if (j < n) { const a = (j / n) * 2 * PI + y * 9; return [BOWL.x + Math.cos(a) * r, BOWL.y + y, BOWL.z + Math.sin(a) * r]; } j -= n; } };
  const CH = new V(HOUSE.x + 0.28, HOUSE.y + 1.3, HOUSE.z - 0.15), bz = new QuadraticBezierCurve3(CH, new V(), new V()), tmp = new V(), door = curve.getPointAt(1);
  function place(f) {
    for (let i = 0; i < 43; i++) {
      const s = C((f - (0.8 * i) / 43) / 0.2);
      if (s <= 0) setI(marbles, i, 0, -9, 0, 0);
      else if (s < 0.12) { const q = s / 0.12; setI(marbles, i, HOP.x, HOP.y + 0.9 - 0.9 * q * q - 0.25 * q, HOP.z); } // drop from the search sign
      else if (s < 0.85) { const c = curve.getPointAt(uOfTau((s - 0.12) / 0.73)); setI(marbles, i, c.x, c.y + 0.053, c.z); } // roll between the rails
      else if (s < 0.9) { const q = (s - 0.85) / 0.05; setI(marbles, i, door.x + 0.12 * q, door.y + 0.053, door.z - 0.12 * q, 1 - q); } // into the door
      else { const q = (s - 0.9) / 0.1, [x, y, z] = trayP(i); setI(marbles, i, x, y - 0.12 * (1 - eb(q)), z, C(q * 1.6)); } // rests in tray slot i
    }
    for (let j = 0; j < 19; j++) {
      const b = C((f - (0.8 * mOf(j)) / 43 - 0.17) / 0.045);
      if (b <= 0) { setI(beads, j, 0, -9, 0, 0); continue; }
      const [x, y, z] = bowlP(j), sq = b > 0.88 ? 1 - 0.3 * Math.sin(((b - 0.88) / 0.12) * PI) : 1, a = C(b * 5);
      bz.v2.set(x, y, z); bz.v1.set((CH.x + x) / 2, CH.y + 0.9, (CH.z + z) / 2); bz.getPoint(Math.min(1, b / 0.88), tmp);
      setI(beads, j, tmp.x, tmp.y - (1 - sq) * 0.03, tmp.z, a * (2 - sq), a * sq); // chimney → bowl slot j, squash on landing
    }
  }
  function assemble(a) {
    pieces.forEach(([g, y0], k) => { const q = C((a - 0.2 - k * 0.07) / 0.35); g.position.y = y0 + 1.1 * (1 - eb(q)); g.scale.setScalar(Math.max(1e-3, C(q * 3))); g.visible = q > 0; });
    const r = C((a - 0.3) / 0.6);
    rails.forEach((t) => t.geometry.setDrawRange(0, Math.floor((t.geometry.index.count * r) / 3) * 3));
    teeth.count = Math.round(170 * C((a - 0.2) / 0.8));
    posts.visible = r > 0;
    root.position.y = -0.5 * (1 - eo(C(a / 0.4)));
  }
  function towers(t) { // t: p .30 → .55. Disc k lands when the stack phase d passes k/10: his stops at 9 + cap (9.3), the sector at 6; then the sprout
    const d = C(t / 0.72);
    [[dUs, 9, 0.1], [dSec, 6, 0.1]].forEach(([m, n], w) => { for (let i = 0; i < n; i++) { const q = C(d * 10 - i); setI(m, i, TW[w].x, TOP + 0.23 + i * 0.1 + 0.25 * (1 - eo(q)), TW[w].z, q > 0 ? 1 : 0); } });
    cap.position.y = TOP + 1.13 + 0.2 * (1 - eo(C((d - 0.9) / 0.1))); cap.visible = d >= 0.9;
    const qs = C((t - 0.72) / 0.28); sprout.scale.setScalar(Math.max(1e-3, eb(qs))); sprout.visible = qs > 0;
  }

  /* state + bus (board.js is the single source of truth for the replay) */
  let clock = 0, rp = null, hold = false, lastP = -1, hov = null, tx = 0, ty = 0, gx = 0, gy = 0, gDone = 0, L = [-1, -1, -1];
  const offs = [], cOn = new Color('#3A2BE0'), cOff = new Color('#CFC6BA');
  if (bus) offs.push(bus.on('board:replay', (d) => { rp = { t0: clock, dur: ((d && d.dur) || 6000) / 1000 }; hold = true; }));
  const FLASH = { us: 'ctr', sector: 'ctr', teeth: 'discipline', sign: 'match', house: 'match' };
  const TIP = { tray: 'bowl' };
  function hover(id) {
    if (id === hov) return;
    hov = id;
    api.cursor = mob || id == 'bowl' || id == 'tray' ? 'replay' : 'drag'; // stage.js writes .slot-hit[data-cursor]
    if (FLASH[id] && bus) bus.emit('board:cmd', { flash: FLASH[id] });
  }
  const ray = new Raycaster(), nv = new Vector2();
  const pick = (nx, ny) => { nv.set(nx, ny); ray.setFromCamera(nv, cam); const h = ray.intersectObjects(hit, false)[0]; return h ? h.object.userData.id : null; };
  let want = null;

  const api = {
    id: 'grow', scene, camera: cam, exposure: 1.15, hotspots: [],
    resize(w, h) { cam.aspect = w / h; cam.fov = w / h < 1.2 ? 34 : 30; cam.updateProjectionMatrix(); },
    update(t, dt, p, input = {}) {
      dt = dt > 2 ? dt / 1000 : dt || 0;
      if (!opt.still) clock += dt;
      p = C(p || 0);
      if (want) { hover(pick(...want)); want = null; }
      if (abs(p - lastP) > 0.004) { if (lastP >= 0 && !rp) hold = false; lastP = p; } // a real scroll releases the replay hold
      let f = C((p - 0.16) / 0.28); // marbles roll as the stage comes into view
      if (rp) { f = C((clock - rp.t0) / rp.dur); if (f >= 1) rp = null; } else if (hold) f = 1;
      const v = [f, C(p / 0.2), C((p - 0.3) / 0.25)], ht = TIP[hov] || hov, hm = hov == 'sign' || hov == 'house';
      // labels: the hovered piece; the bowl and the two towers stay labelled once they are complete (readable without hover)
      for (const k in tips) tips[k].classList.toggle('is-on', k == ht || (hm && (k == 'sign' || k == 'house')) || (k == 'bowl' ? f > 0.99 : (k == 'us' || k == 'sector') && v[2] > 0.71));
      [place, assemble, towers].forEach((fn, i) => { if (abs(v[i] - L[i]) > 1e-5) { fn(v[i]); L[i] = v[i]; } });
      // idle (decorative only): teeth ring counter-rotates, caret blinks, grass + sprout sway (Q3), key light orbits for glints
      teeth.parent.rotation.y = -0.06 * clock;
      caret.visible = ((clock * 1.6) | 0) % 2 == 0;
      const gp = grass.userData.p, sw = Q >= 3 && !opt.still;
      if (sw || !gDone) { gp.forEach(([x, z, ph, s], i) => setI(grass, i, x, TOP + 0.06 * s, z, s, s, ph, sw ? 0.12 * Math.sin(clock * 1.3 + ph) : 0)); gDone = !sw; }
      grass.count = Q <= 1 ? 0 : Q == 2 ? 25 : gp.length; // whole tufts
      sprout.rotation.z = sw ? 0.08 * Math.sin(clock * 1.1) : 0;
      if (keyP) { const g = 0.02 * clock, c = Math.cos(g), s = Math.sin(g); keyL.position.set(keyP.x * c - keyP.z * s, keyP.y, keyP.x * s + keyP.z * c); }
      matchM.color.lerp(hov == 'sign' || hov == 'house' ? cOn : cOff, 1 - Math.exp(-12 * dt) || 1); // sign + page H1 highlight together
      // drag: turn ±12° and tilt, spring back (visual only, f unchanged)
      const d = !mob && input.down, k = 1 - Math.exp(-(d ? 14 : 5) * dt) || 1;
      tx += ((d ? Math.max(-0.21, Math.min(0.21, gx / 400)) : 0) - tx) * k;
      ty += ((d ? Math.max(-0.1, Math.min(0.1, gy / 900)) : 0) - ty) * k;
      turn.rotation.set(ty, tx + (input.inside && !d && !mob ? (input.nx || 0) * 0.03 : 0), 0);
      if (mob) { cam.position.set(3.2, 7.1, 10); cam.lookAt(0.1, 0.9, -0.2); } else { cam.position.set(3.3, 4.7, 10.6); cam.lookAt(0.2, 1.3, 0); } // phones: higher, so the round plinth fills the square slot
    },
    pointer(e) {
      if (!e) return;
      if (e.type == 'move') want = [e.nx, e.ny];
      else if (e.type == 'leave') { want = null; hover(null); }
      else if (e.type == 'down') gx = gy = 0;
      else if (e.type == 'drag') { gx += e.dx || 0; gy += e.dy || 0; } // per-event deltas, summed while down
      else if (e.type == 'tap') {
        const id = pick(e.nx, e.ny);
        if (id == 'bowl' || id == 'tray' || (mob && id)) {
          rp = null;
          if (bus) bus.emit('board:cmd', { replay: true });
          if (!rp) { rp = { t0: clock, dur: 6 }; hold = true; } // board.js not running: replay locally
        } else if (FLASH[id] && bus) bus.emit('board:cmd', { flash: FLASH[id] });
      }
    },
    needsFrame: () => !opt.still,
    setQuality(q) { Q = mob ? 1 : tq(q); },
    dispose() { offs.forEach((f) => f()); } // stage.js then kit.dispose()s the scene
  };
  for (const k in tips) if (anchors[k]) api.hotspots.push({ el: tips[k], anchor: anchors[k] });
  hover(null); api.cursor = mob ? 'replay' : 'drag';
  api.resize(slot.clientWidth || 2, slot.clientHeight || 1);
  api.update(0, 0, opt.still ? opt.still.p : 0, {});
  return api;
}
