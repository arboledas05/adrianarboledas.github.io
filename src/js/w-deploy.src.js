/* w-deploy.js (B4) · 02 Deploy · The Blueprint Turntable. Readable source; assets/js/w-deploy.js is its esbuild --minify output.
   True-isometric orthographic clay diorama on a double-sided turntable: set A NexaRetail (module 5163), set B Logística Directa
   (module 5160). cloudlab.js is the single source of truth: this world mirrors lab:* (same routes, stops and durations) and
   asks for changes only through lab:cmd. Five module keycaps 5160–5164 tour their parts by scroll until the first interaction;
   their legends are DOM hotspots (text stays in the page). */
export async function create(THREE, kit, ctx, slot, opt = {}) {
  const { Vector3: V, Vector2, Mesh, Group, Object3D, InstancedMesh, CylinderGeometry, TorusGeometry, IcosahedronGeometry, CapsuleGeometry, PlaneGeometry, TubeGeometry, MeshBasicMaterial, ShaderMaterial, Color, CatmullRomCurve3, CurvePath, LineCurve3, QuadraticBezierCurve3, OrthographicCamera, Raycaster, Scene, Box3, Quaternion } = THREE;
  const bus = opt.bus || ctx.bus, mob = !!opt.mobile, still = !!opt.still, PI = Math.PI, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
  const tq = (q) => +String(q || 3).replace(/\D/g, '') || 3;
  let Q = mob ? 1 : tq(opt.tier);
  const C = (a) => (a < 0 ? 0 : a > 1 ? 1 : a), eo = (t) => 1 - (1 - t) ** 3, eb = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
  const io = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2); // the in-out cubic of cloudlab.js legs
  const clay = (h, o) => kit.clay(h, o);
  const INK = '#1F4FB8', IND = '#3A2BE0', W = '#fff', cInk = new Color(INK), cHi = new Color('#5B47FF'), cW = new Color(W), cInd = new Color(IND), cCoral = new Color('#FF7B6B');
  const scene = new Scene(), base = new Group(), tt = new Group(), A = new Group(), B = new Group();
  scene.add(base, tt); tt.add(A, B); B.rotation.y = PI; A.position.y = B.position.y = 0.4;
  const STOPS = [W, '#C8D3F5', '#26306A'];
  kit.rig(scene, { hemi: ['#F4F7FF', '#B9C4EE', 1], key: ['#F6F8FF', 1.6, [-2, 7, 3]], rim: ['#8FB8FF', 0.9, [0, 2, -6]], fog: ['#EEF1FB', 30, 60] });
  scene.environment = kit.env(STOPS);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 80), FH = 6.3; // desktop frame height in world units: the facing set fills the slot
  const FW = 10, FHM = 6.5; // phones + tablet: the whole r 4.6 ring (9.2 wide in true iso) + ~4% margin, the clouds above and the keycap arc below always fit
  const ROT = 0, CT = mob ? new V(0.1, -0.1, 0.1) : new V(0.2, 0.2, 0.2), o3 = new Object3D(), q4 = new Quaternion(), YV = new V(0, 1, 0), tmp = new V();
  const hulls = [], hullM = () => { // constant-width ink outline: back faces pushed out along the normal (one shared program)
    const m = new MeshBasicMaterial({ color: INK, side: 1 });
    m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=position+normal*.022;'); };
    m.customProgramCacheKey = () => 'aa-hull';
    return m;
  };
  const add = (g, m, x = 0, y = 0, z = 0, p = A) => { const o = new Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
  const grp = (x = 0, y = 0, z = 0, p = A) => { const g = new Group(); g.position.set(x, y, z); p.add(g); return g; };
  const inst = (g, m, n, p = A) => { const o = new InstancedMesh(g, m, n); o.frustumCulled = false; for (let i = 0; i < n; i++) o.setColorAt(i, cW); p.add(o); return o; }; // instances move: never cull on a stale bound; every instanced clay carries a colour so all share one program
  const setI = (im, i, x, y, z, s = 1, sy = s, ry = 0, q) => { o3.position.set(x, y, z); q ? o3.quaternion.copy(q) : o3.rotation.set(0, ry, 0); o3.scale.set(s, sy, s); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); im.instanceMatrix.needsUpdate = true; };
  const setC = (im, i, c) => { im.setColorAt(i, c); im.instanceColor.needsUpdate = true; };
  const slab = (w, h, d, r = 0.05) => kit.slab(w, h, d, { r });
  const disc = (r, h) => new CylinderGeometry(r, r, h, 40);
  const hullI = (im, hm) => { const h = inst(im.geometry, hm, im.count, im.parent); h.instanceMatrix = im.instanceMatrix; hulls.push(h); return im; };
  const rr = (w, d, r, y = 0) => { // closed rounded-rect path on the ground plane
    const p = new CurvePath(), c = [[1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new V((a * w) / 2, y, (b * d) / 2)), to = (a, b) => a.clone().add(b.clone().sub(a).setLength(r));
    c.forEach((k, i) => { const n = c[(i + 1) % 4], b = to(k, n); p.add(new QuadraticBezierCurve3(to(k, c[(i + 3) % 4]), k, b)); p.add(new LineCurve3(b, to(n, k))); });
    return p;
  };
  const pillG = new CapsuleGeometry(0.03, 0.14, 2, 6), pillM = clay(IND, { coat: 0.6 }), fences = [];
  const fence = (path, n, p) => { const im = inst(pillG, pillM, n, p); fences.push([im, path, n]); };

  /* parts: a lift group + its own hull material (highlight = a colour change, never a recompile) */
  const parts = {}, P = [], part = (id, set, x, y, z) => { const g = grp(x, y, z, set); g.userData.p = id; P.push((parts[id] = { id, g, hm: (g.hm = hullM()), set, y, l: 0, k: P.length % 11 })); return g; };
  const S = (w, h, d, r, col, x, y, z, p, hm) => { const m = add(slab(w, h, d, r), clay(col, { rim: '#8FB8FF' }), x, y, z, p); if (hm) hulls.push(add(m.geometry, hm, 0, 0, 0, m)); return m; };
  let div, grid, packets, crates, asgM, phases, flag, colAfter, colBefore, keys, chev, gates = [], tour = [], asg = [];
  const R = {}; // routes: { c: curve, s: [{c, u}] } through the same stop ids as the SVG data-stops

  const build = [
    () => { // blueprint grid, turntable, slab, divider
      grid = add(new PlaneGeometry(40, 40), new ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { uR: { value: 0 } },
        vertexShader: 'varying vec2 v;void main(){v=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float uR;varying vec2 v;float L(vec2 p){vec2 g=abs(fract(p-.5)-.5)/fwidth(p);return 1.-min(min(g.x,g.y),1.);}void main(){float r=length(v),a=L(v*4.)*.16,b=L(v)*.3;gl_FragColor=vec4(b>a?vec3(.14,.34,.77):vec3(.62,.72,.88),max(a,b)*smoothstep(uR,uR-3.,r)*smoothstep(11.,6.,r));}'
      }), 0, 0, 0, base);
      grid.rotation.x = -PI / 2; grid.renderOrder = -1;
      add(new CylinderGeometry(4.6, 4.6, 0.16, 96), clay('#C9D3F2'), 0, 0.08, 0, tt);
      add(new TorusGeometry(4.6, 0.03, 8, 192), clay(IND, { coat: 0.6 }), 0, 0.16, 0, tt).rotation.x = PI / 2;
      add(slab(7.8, 0.24, 5.0, 0.3), clay('#E3E8F8'), 0, 0.28, 0, tt); // fits inside the r 4.6 disc
      div = S(7.4, 0.3, 0.08, 0.04, '#DCE3F8', 0, 0.55, 0, tt, hullM()); // a low divider between the two sets, topped by a row of pills
      const pk = inst(pillG, pillM, 40, div); q4.setFromAxisAngle(new V(0, 0, 1), PI / 2);
      for (let i = 0; i < 40; i++) setI(pk, i, -3.6 + i * 0.1846, 0.18, 0, 0.8, 0.8, 0, q4); // lying end to end: a dashed rail like the VPC fence
    },
    function* () { // SET A · NexaRetail (a generator: it yields between its heavier groups, each step ≤ ~15 ms at 4x CPU)
      const v = part('vpc', A, 0, 0, 1.4);
      add(slab(7.6, 0.06, 2.3, 0.025), clay('#D3E2F6'), 0, 0.03, 0, v); // opaque clay: no extra transparent program
      fence(rr(7.4, 2.1, 0.3, 0.1), mob ? 32 : 64, v);
      [['web', -2.4, '#FFB98A'], ['app', 0, '#B9A6FF'], ['data', 2.4, '#9B84F2']].forEach(([id, x, col], t) => {
        const g = part(id, A, x, 0.11, 1.4), hm = g.hm;
        S(2.2, 0.1, 1.7, 0.14, col, 0, 0, 0, g, hm);
        if (t > 1) { const db = hullI(inst(disc(0.3, 0.12), clay(W), 3, g), hm); for (let i = 0; i < 3; i++) setI(db, i, 0, 0.11 + i * 0.15, 0); return; }
        const sv = hullI(inst(slab(0.44, 0.56, 0.38, 0.06), clay(W), 2, g), hm);
        const led = inst(slab(0.2, 0.05, 0.02, 0.012), clay(IND, { coat: 0.6 }), 4, g); // indigo status LEDs on the server fronts
        for (let i = 0; i < 2; i++) { setI(sv, i, i ? 0.35 : -0.35, 0.33, -0.2); for (const y of [0.42, 0.3]) setI(led, i * 2 + (y > 0.4), i ? 0.35 : -0.35, y, -0.004); }
      }); yield;
      const posts = inst(new CylinderGeometry(0.035, 0.035, 0.36, 10), clay(INK), 6);
      [-3.62, -1.2, 1.2].forEach((x, i) => {
        const id = ['sg-web', 'sg-app', 'sg-data'][i], bar = grp(0, 0.1, 0, part(id, A, x, 0.24, 1.09)), m = clay(IND);
        add(slab(0.06, 0.06, 0.62, 0.025), m, 0, 0, 0.31, bar);
        setI(posts, i * 2, x, 0.24, 1.09); setI(posts, i * 2 + 1, x, 0.24, 1.71);
        gates.push({ id, bar, m, o: 0, t: -9, d: -9 });
      });
      const n = part('nat', A, -2.4, 0.38, 1.98);
      S(0.36, 0.44, 0.26, 0.06, '#FFD166', 0, 0, 0, n, n.hm);
      chev = add(new CylinderGeometry(0, 0.11, 0.12, 3), clay(IND), 0, 0.3, 0, n); yield; // the one-way valve's chevron
      const cloud = (id, x, y, z, n, s) => { const g = part(id, A, x, y, z), gs = []; for (let k = 0; k < n; k++) gs.push(new IcosahedronGeometry(s * (k ? 0.72 - k * 0.04 : 1), 2).translate(k ? s * 0.8 * cos(k * 2.4) : 0, k ? -0.12 * s : 0, k ? s * 0.5 * sin(k * 2.4) : 0)); add(kit.merge(gs), clay(W), 0, 0, 0, g); return g; };
      cloud('internet', -4.4, 0.85, 1.5, 6, 0.5); yield;
      cloud('updates', -3.4, 1.5, 0.55, 4, 0.34);
      packets = inst(new CapsuleGeometry(0.06, 0.12, 2, 8), clay(IND, { coat: 0.8 }), 8);
      for (let i = 0; i < 8; i++) { setI(packets, i, 0, -9, 0, 0); setC(packets, i, cW); }
    },
    () => { // SET B · Logística Directa (local coords; the group is turned 180°)
      const op = part('onprem', B, -3.35, 0, 1.4);
      S(1.5, 0.62, 1.2, 0.08, '#CFC9DA', 0, 0.31, 0, op, op.hm);
      S(1.58, 0.08, 1.28, 0.04, '#FFCCA3', 0, 0.66, 0, op);
      for (const y of [0.2, 0.32, 0.44]) S(1.1, 0.04, 0.02, 0.01, '#8E86A8', 0, y, 0.61, op);
      S(1.9, 0.04, 0.34, 0.015, '#FFE3CF', 0, 0, 0, part('hybrid', B, -1.6, 0.03, 0.95));
      const rg = part('region', B, 1.6, 0, 1.4);
      S(4.4, 0.1, 2, 0.2, '#DCE6FF', 0, 0.05, 0, rg, rg.hm);
      fence(rr(4.3, 1.9, 0.25, 0.14), mob ? 28 : 40, rg);
      const as = part('asg', B, 1.6, 0.1, 0.95), pads = inst(slab(0.42, 0.03, 0.42, 0.012), clay('#C7B8FF'), 10, as);
      add(new TubeGeometry(rr(3, 1.1, 0.2), 96, 0.025, 6, true), pillM, 0, 0.02, 0, as);
      asgM = hullI(inst(slab(0.36, 0.44, 0.32, 0.05), clay(W), 10, as), as.hm);
      for (let i = 0; i < 10; i++) { setI(pads, i, -1.1 + (i % 5) * 0.55, 0.02, i < 5 ? -0.25 : 0.25); asg.push([i < 2, -9]); }
      for (const [id, x, cap] of [['rds-primary', 0.55, IND], ['rds-standby', 2.15, '#C7B8FF']]) {
        const g = part(id, B, x, 0.1, 1.95), b = hullI(inst(disc(0.26, 0.1), clay(W), 3, g), g.hm);
        for (let i = 0; i < 3; i++) setI(b, i, 0, 0.05 + i * 0.13, 0);
        add(disc(0.26, 0.05), clay(cap), 0, 0.415, 0, g);
      }
      const dm = part('dms', B, -1.55, 0.06, 1.75);
      S(2.1, 0.05, 0.32, 0.02, '#E3E8F8', 0, 0, 0, dm, dm.hm);
      crates = inst(slab(0.16, 0.12, 0.16, 0.025), clay('#FFD166'), 12, B);
      flag = grp(0, 0, 0, part('cutover', B, 3.55, 0.1, 0.62));
      add(new CylinderGeometry(0.015, 0.015, 0.7, 6), clay(INK), 0, 0.35, 0, flag);
      add(slab(0.3, 0.18, 0.02, 0.008), clay(IND), 0.16, 0.6, 0, flag);
      add(slab(0.3, 1.5, 0.3), clay('#FFCCA3'), 0, 0.75, 0, (colBefore = grp(-3.85, 0, 2.45, B))); // ≈150k € / yr (projected); both columns stand only while set B faces (from set A they read as a stray pole on the far rim)
      add(slab(0.3, 0.72, 0.3), clay(IND), 0, 0.36, 0, (colAfter = grp(-3.45, 0, 2.45, B))); // ≈72k € / yr: height ratio 72/150
      phases = inst(slab(0.5, 0.04, 0.12, 0.02), clay(W), 5, B); // 12 weeks · 5 phases
      for (let i = 0; i < 5; i++) { setI(phases, i, 0.48 + i * 0.56, 0.03, 2.62); setC(phases, i, cW); }
    },
    () => { // module keycaps on the fixed rim, routes, hit proxies (from each part's box)
      keys = inst(slab(0.5, 0.16, 0.38, 0.06), clay(W), 5, base); // the arc sits on the front rim, under the facing set
      for (let i = 0; i < 5; i++) { const a = PI / 4 + (2 - i) * 0.21; tour.push([5.25 * cos(a), 5.25 * sin(a), PI / 2 - a]); setC(keys, i, cW); }
      const mk = (name, pts) => { const c = new CatmullRomCurve3(pts.map((p) => new V(p[0], p[1], p[2])), false, 'centripetal'); R[name] = { c, s: pts.filter((p) => p[3]).map((p) => { let bu = 0, bd = 9; for (let k = 0; k <= 128; k++) { const d = c.getPointAt(k / 128).distanceTo(tmp.set(p[0], p[1], p[2])); if (d < bd) { bd = d; bu = k / 128; } } return { c: p[3], u: bu }; }) }; };
      mk('request', [[-4.4, 0.7, 1.5, 'internet'], [-3.95, 0.5, 1.4], [-3.62, 0.42, 1.4, 'sg-web'], [-2.4, 0.5, 1.68, 'web'], [-1.2, 0.42, 1.4, 'sg-app'], [0, 0.5, 1.68, 'app'], [1.2, 0.42, 1.4, 'sg-data'], [2.4, 0.78, 1.4, 'data']]);
      mk('updates', [[0, 0.5, 1.68, 'app'], [-1.2, 0.5, 2.05], [-2.4, 0.72, 1.98, 'nat'], [-3.7, 0.8, 1.85], [-4.4, 0.75, 1.5, 'internet'], [-4.05, 1.3, 0.95], [-3.4, 1.3, 0.55, 'updates']]);
      mk('blocked', [[-4.4, 0.7, 1.5, 'internet'], [-3.9, 0.85, 2.45, 'vpc'], [-1.2, 0.55, 2.62], [1.3, 0.45, 2.55], [2.4, 0.36, 2.3, 'data']]);
      mk('dms', [[-2.62, 0.3, 1.75, 'onprem'], [-1.55, 0.18, 1.75, 'dms'], [-0.5, 0.2, 1.8], [0.55, 0.62, 1.95, 'rds-primary']]);
      scene.updateMatrixWorld(true);
      for (const p of P) { const b = new Box3().setFromObject(p.g); p.a = p.set.worldToLocal(b.getCenter(new V()).setY(b.max.y + 0.05)); if (p.id == 'region') p.a.x -= 1.7, p.a.z += 0.8; } // label anchor: top centre, set-local
    }
  ];
  await kit.idleChunks(build);

  /* hotspots: callouts (aria-hidden), ul.lab-parts buttons (real controls), keycap legends + module captions */
  const hs = [];
  const anchor = (p, x, y, z) => { const o = new Object3D(); o.position.set(x, y, z); p.add(o); return o; };
  slot.querySelectorAll('[data-hotspot],[data-part]').forEach((el) => {
    const k = el.dataset.hotspot, p = parts[(k || el.dataset.part || '').slice(4)], t = /^m516\d$/.test(k) && tour[k[4]];
    if (p) hs.push({ el, anchor: anchor(p.set, p.a.x, p.a.y, p.a.z), s: k && p.set });
    else if (t) hs.push({ el, anchor: anchor(base, t[0], 0.17, t[1]), m: k.slice(1) });
  });

  /* state mirrored from cloudlab: the DOM once (it may have run before this world existed), then the bus */
  const lab = slot.closest('.lab') || document, q = (s) => lab.querySelector(s), MODS = {};
  document.querySelectorAll('.lab-mod[data-parts]').forEach((b) => (MODS[b.dataset.module] = b.dataset.parts.split(' ').map((x) => x.slice(4)))); // module → parts, from the chip row (the page's own map)
  let tab = q('#lab-tab-ld[aria-selected=true]') ? 1 : 0, sel = null, mod = null, hov = null, touched = 0;
  let cost = !!q('.lab-cost.is-after'), cut = !!q('.lab-cut.is-done'), leg = null, clock = 0;
  let spin = tab * PI, spinFrom = spin, spinT = -9, yaw = 0, dx = 0, want = null, colT = cost ? 1 : 0, fl = cut ? 1 : 0;
  const asgN = (n) => { let r = 0; asg.forEach((s, i) => { const o = i < max(2, min(10, +n || 2)); if (o != s[0]) { s[0] = o; s[1] = clock + 0.04 * r++; } }); };
  asgN(((bus && bus.last('lab:asg')) || {}).n); asg.forEach((s) => (s[1] = -9)); // cloudlab emits its state on init
  const offs = [], on = (n, f) => bus && offs.push(bus.on('lab:' + n, (d) => f(d || {})));
  const mapU = (r, d) => { // SVG fraction t → 3D arc-length u, piecewise linear through the matching stops
    const s = [[0, 0]];
    (d.stops || []).forEach((x) => R[r].s.forEach((y) => 'lab-' + y.c == x.c && s.push([x.t, y.u])));
    s.push([1, 1]);
    return (t) => { let i = 1; while (i < s.length - 1 && t > s[i][0]) i++; const [a, u] = s[i - 1], [b, v] = s[i]; return u + ((t - a) / (b - a || 1)) * (v - u); };
  };
  on('tab', (d) => { const t = d.id == 'ld' ? 1 : 0; if (t != tab) { tab = t; spinFrom = spin; spinT = clock; } leg = null; });
  on('run', (d) => { if (d.state == 'start') { touched = 1; leg = null; if (d.action == 'migrate') cut = 0; } if (d.state == 'cancel') leg = null; if (d.state == 'end' && d.action == 'migrate') cut = 1; });
  on('leg', (d) => { if (R[d.route]) leg = { r: d.route, a: +d.a || 0, b: d.b == null ? 1 : +d.b, dur: (d.dur || 1000) / 1000, t0: clock, n: d.small ? 1 : 12, m: mapU(d.route, d) }; });
  on('hit', (d) => { const c = (d.c || '').slice(4); gates.forEach((g) => g.id == c && (g.t = clock)); });
  on('deny', () => (gates[2].d = clock));
  on('asg', (d) => asgN(d.n));
  on('cost', () => { cost = true; colT = 0; });
  on('select', (d) => { sel = (d.c || '').slice(4); touched = 1; });
  on('module', (d) => { mod = d.id ? String(d.id) : null; if (mod) touched = 1; });

  const ray = new Raycaster(), nv = new Vector2();
  const pick = (nx, ny) => {
    nv.set(nx, ny); ray.setFromCamera(nv, cam);
    const h = ray.intersectObjects([tab ? B : A, keys])[0];
    let o = h && h.object;
    while (o && !o.userData.p) o = o.parent;
    return h && (h.object == keys ? { k: h.instanceId } : o && { id: o.userData.p });
  };
  const cmd = (d) => bus && bus.emit('lab:cmd', d);
  function hover(h) {
    hov = h && h.id;
    api.cursor = h ? '' : mob ? 'inspect' : 'drag'; // stage.js writes it to .slot-hit[data-cursor]; the pill reads ui.cursor.<value>. A hovered part shows its own label: no pill on top of it
  }
  /* tmp = the point at arc length u and the returned unit tangent: exactly getPointAt + getTangentAt (Curve's ±1e-4
     difference in t), without the two Vector3s per call that three allocates (~150 pills per frame) */
  const tA = new V(), tB = new V();
  const at = (c, u) => { const t = c.getUtoTmapping(u); c.getPoint(t, tmp); c.getPoint(max(0, t - 1e-4), tA); return c.getPoint(min(1, t + 1e-4), tB).sub(tA).normalize(); };
  const place = (i, c, u, s, col) => { q4.setFromUnitVectors(YV, at(c, u)); setI(packets, i, tmp.x, tmp.y, tmp.z, s, s, 0, q4); setC(packets, i, col); };
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt) || 1);

  function update(t, dt, p, input = {}) {
    dt = dt > 2 ? dt / 1000 : dt || 0;
    if (!still) clock += dt;
    p = C(p || 0);
    if (want) { hover(pick(...want)); want = null; }
    const a = C(p / 0.3), lite = Q <= 1, trail = lite ? 1 : 4, kr = C((a - 0.6) / 0.4);
    // assembly (pure function of p): grid draws in, slab drops, parts stagger in, fence pills appear, keycaps rise
    grid.material.uniforms.uR.value = 14 * eo(a) + 0.01;
    tt.position.y = 2 * (1 - eo(C(a / 0.5)));
    fences.forEach(([f, path, n]) => { f.count = Math.round(n * C((a - 0.4) / 0.5)); for (let k = 0; k < f.count; k++) { const u = (k / n + 0.003 * clock) % 1; q4.setFromUnitVectors(YV, at(path, u)); setI(f, k, tmp.x, tmp.y, tmp.z, 1, 1, 0, q4); } });
    // module: hover / pinned (lab:module) wins, else the scroll tour (p .3–.85) until the first interaction
    const tk = !touched && p >= 0.3 && p < 0.85 ? min(4, ((p - 0.3) / 0.11) | 0) : -1, m = mod || (tk < 0 ? null : '' + (5160 + tk)), mp = MODS[m] || [];
    tour.forEach(([x, z, ry], i) => { const o = m == 5160 + i; setI(keys, i, x, 0.08 - 0.3 * (1 - eo(kr)) + (o ? 0.05 : 0), z, 1, 1, ry); setC(keys, i, o ? cInd : cW); });
    const sp = C((clock - spinT) / 1.1);
    hs.forEach(({ el, m: k, s }) => { const c = el.classList; if (k) c.toggle('is-on', k == m && kr > 0.5), c.toggle('is-off', kr < 0.9); else if (s) c.toggle('is-off', s != (tab ? B : A) || sp < 1 || a < 0.8); });
    // parts: stagger in; lift .06 + #5B47FF hull when selected, hovered or in the active module
    for (const x of P) {
      const s = C((a - 0.3 - x.k * 0.03) / 0.3), o = sel == x.id || hov == x.id || mp.includes(x.id);
      x.g.scale.setScalar(max(1e-3, eb(s))); x.g.visible = s > 0;
      x.l = damp(x.l, o ? 0.06 : 0, 14, dt); x.g.position.y = x.y + x.l; x.hm.color.copy(o ? cHi : cInk);
      x.hm.visible = Q > 1 && (sp < 1 || x.set == (tab ? B : A)); // ink outlines on the facing set only (the back set stays plain clay: fewer draws)
    }
    // turntable (both sets always shown: the far one is the back of the toy): tab spin 1.1 s in-out, ±1° sway over 6 s, drag yaw ±25° springing back
    const d = !mob && input.down;
    spin = spinFrom + (tab * PI - spinFrom) * io(sp);
    yaw = damp(yaw, d ? max(-0.44, min(0.44, dx / 300)) : 0, d ? 12 : 4, dt);
    tt.rotation.y = ROT + spin + yaw + 0.0175 * sin(clock * 1.047);
    // idle: NAT chevron turns; gates swing on hits (0.9 s like the SVG pulse) and flash coral on deny
    chev.rotation.y = 0.3 * clock;
    gates.forEach((g) => { g.o = damp(g.o, clock - g.t < 0.9 ? 1 : 0, 10, dt); g.bar.rotation.y = -1.22 * g.o; g.m.color.copy(clock - g.d < 1 ? cCoral : cInd); });
    // packets: the current lab:leg (+ trail)
    for (let i = 0; i < 8; i++) setI(packets, i, 0, -9, 0, 0);
    for (let i = 0; i < 12; i++) setI(crates, i, 0, -9, 0, 0);
    const lq = leg ? (clock - leg.t0) / leg.dur : 0;
    if (leg && lq > 1.25) leg = null;
    if (leg && leg.r != 'dms') for (let j = 0; j < trail; j++) place(j, R[leg.r].c, C(leg.m(leg.a + (leg.b - leg.a) * io(C(lq - j * 0.025)))), 1 - j * 0.2, cInd);
    else if (leg) { const e = io(C(lq)); for (let i = 0; i < leg.n; i++) { const u = e * (1 + (leg.n - 1) * 0.06) - i * 0.06; if (u > 0 && u < 1) { R.dms.c.getPointAt(u, tmp); setI(crates, i, tmp.x, tmp.y, tmp.z, 1, 1, u * 2); } } } // full load = a train of 12 crates, CDC = one
    // phases strip fills during migrate; cutover flag pops at its end; after-cost column grows (ratio 72/150) like the 2D bar
    for (let i = 0; i < 5; i++) setC(phases, i, fl > i / 5 + 0.1 ? cInd : cW);
    fl = damp(fl, cut ? 1 : 0, 8, dt); flag.scale.set(1, max(1e-3, cut ? eb(fl) : fl), 1);
    const bv = eo(tab ? sp : 1 - sp); colBefore.scale.y = max(1e-3, bv); colBefore.visible = bv > 0.01;
    colT = cost ? min(1, colT + dt / 0.9) : 0; colAfter.scale.y = max(1e-3, eo(colT) * bv); colAfter.visible = colT > 0 && bv > 0.01;
    // Auto Scaling 2 → 10: pop in 0 → 1.12 → 1 (380 ms, 40 ms stagger), sink out
    asg.forEach(([o, t0], i) => { const s = o ? eb(C((clock - t0) / 0.38)) : 1 - eo(C((clock - t0) / 0.25)); setI(asgM, i, -1.1 + (i % 5) * 0.55, 0.26 * s + 0.03, i < 5 ? -0.25 : 0.25, max(1e-3, s)); });
    // camera: true isometric, centred on the facing set
    cam.position.set(11.547, 11.547, 11.547).add(CT); cam.lookAt(CT);
  }

  const api = {
    id: 'deploy', scene, camera: cam, exposure: 1.05, update,
    hotspots: hs,
    resize(w, h) { const a = w / h, f = mob ? max(FHM, FW / a) : a < 1 ? FH : FH * max(1, 1.6 / a); /* f = frame height; phones fit the ring's width */ cam.left = (-f * a) / 2; cam.right = (f * a) / 2; cam.top = f / 2; cam.bottom = -f / 2; cam.updateProjectionMatrix(); },
    pointer(e) {
      if (!e) return;
      if (e.type == 'move') want = [e.nx, e.ny];
      else if (e.type == 'leave') { want = null; hover(null); }
      else if (e.type == 'down') dx = 0;
      else if (e.type == 'drag') dx += e.dx || 0; // per-event deltas, summed while the pointer is down
      else if (e.type == 'tap') { touched = 1; const h = pick(e.nx, e.ny); if (h) cmd(h.id ? { inspect: 'lab-' + h.id } : { module: '' + (5160 + h.k), pin: true }); }
    },
    needsFrame: () => !still,
    setQuality(q) { Q = mob ? 1 : tq(q); hulls.forEach((h) => (h.visible = Q > 1)); grid.visible = Q > 1; }, // visibility only, never materials
    dispose() { offs.forEach((f) => f()); } // stage.js then kit.dispose()s the scene
  };
  hover(null); api.setQuality(Q);
  api.resize(slot.clientWidth || 2, slot.clientHeight || 1);
  update(0, 0, still ? opt.still.p : 0);
  return api;
}
