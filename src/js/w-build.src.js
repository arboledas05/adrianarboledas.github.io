/* w-build.js (B3) · FIG. 01 THE SPRINT BENCH. A graphite clay phone on a peach stand rides a seven-tile sprint track:
   the seven real work periods of the Accenture internship (FACTS §3b). Beats come from the DOM sprint log
   (li[data-beat] → input.beat); the screen shows that period's work, a prop springs up beside the phone, and the Bugphone
   toggles (bp:state, the single source of truth) drive the bug overlays. Contract: DELTA_SPEC engine_spec §12.
   Never a bank, retailer or person; the screens carry bars, never digits or currency. */
const IND = '#3A2BE0', TEAL = '#12A38A', P = Math.PI, N = 7;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const s5 = (x) => { x = cl(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const spr = (u, to, k, c, dt) => { for (let h = dt; h > 0; h -= 1 / 120) { const s = Math.min(h, 1 / 120); u.v += ((to - u.s) * k - u.v * c) * s; u.s += u.v * s; } };
const rect = (g, x, y, w, h, r, fill, stroke) => { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } };
const dot = (g, x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, P * 2); g.fillStyle = fill; g.fill(); };
const ink = (a) => `rgba(23,21,15,${a})`;

export async function create(THREE, kit, ctx, slot, opt = {}) {
  const T = THREE, bus = opt.bus || ctx.bus, still = opt.still, mob = !!opt.mobile, V = (x, y, z) => new T.Vector3(x, y, z);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1, .1, 80);
  kit.rig(scene, { hemi: ['#F3FBFF', '#BFE8DA', .9], key: ['#FFFFFF', 2.1, [-4, 5, 5]], rim: ['#54C5F8', 1.1, [3, 3, -4]], fog: ['#E9F4EF', 1e3, 1e4] });
  try { scene.environment = kit.env(['#FFFFFF', '#BDEBDD', '#2C5A52']); } catch (e) { /* no env: a duller coat only */ }
  /* this world's clay: cool screen-lit rim, light wrap (rich colours, not pastel); kit.slab + vertex-coloured bakes */
  const cm = (o, c = '#ffffff') => kit.clay(c, Object.assign({ rim: '#54C5F8', rimK: .3, wrap: .05, env: .5 }, o));
  /* every non-instanced clay part is vertex-coloured (tint / bake), so the whole bench links ONE clay program, plus the
     instanced one (tiles, studs) and the unlit map one: 3 programs, all shared with the hero deck on desktop */
  const VC = cm({ coat: .3, vertexColors: true }), INDM = cm({ coat: .6, vertexColors: true }), GRM = cm({ coat: .12, rough: .62, vertexColors: true });
  const slab = (w, h, d, r, b) => kit.slab(w, h, d, { r, bevel: b });
  const M = new T.Matrix4(), E = new T.Euler(), Q = new T.Quaternion(), C = new T.Color();
  /* layoutTiles' scratch (it runs on every scroll frame of the entry): no Vector3 / Color allocated per tile */
  const LT = { S: V(1, 1, 1), Y: V(0, 1, 0), p: V(0, 0, 0), c1: new T.Color('#FFFFFF'), c2: new T.Color('#DDF4EA'), ti: new T.Color(TEAL), il: new T.Color(IND), tl: new T.Color('#BFE7DC') };
  const tint = (g, hex) => {
    C.set(hex); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n * 3; i += 3) { c[i] = C.r; c[i + 1] = C.g; c[i + 2] = C.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); return g;
  };
  const bake = (parts) => kit.merge(parts.map(([g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx]) => tint(g.applyMatrix4(M.compose(V(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), V(sx, sy, sz))), hex)));
  const add = (g, m, x = 0, y = 0, z = 0, p = scene) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
  const basic = (o) => new T.MeshBasicMaterial(Object.assign({ toneMapped: false, transparent: true }, o));
  const blob = (w, h, a, p) => { const b = kit.blob(w, h, a); b.position.y = .006; p.add(b); };
  const Cy = (r, h, s = 12) => new T.CylinderGeometry(r, r, h, s), ac = new AbortController(), offs = [];
  const SW = mob ? 288 : 384, SH = mob ? 624 : 832, SC = SW / 384;

  /* the sprint track through the seven tiles (x = −3 + i, z = .35 sin .9i − .1) */
  const pts = [], tyaw = [];
  for (let i = 0; i < N; i++) pts.push(V(-3 + i, .215, .35 * Math.sin(.9 * i) - .1));
  const track = new T.CatmullRomCurve3(pts);
  for (let i = 0; i < N; i++) { const tg = track.getTangent(i / 6); tyaw.push(-Math.atan2(tg.z, tg.x)); }

  const st = { s: 0, kb: 0, of: 0, ofT: 9, rip: null, caret: 0, land: false }, bugs = { rot: false, kb: false };
  let dirty = 1, awake = 1;
  const bench = new T.Group(), ph = new T.Group(), pg = new T.Group(); scene.add(bench, ph); ph.add(pg);
  const props = [], layers = [];
  let rail, tiles, studs, scr, tab, bead, screen, proxy;

  await kit.idleChunks([
    () => { /* bench + the indigo plinth lip + the rail (build = a solid line) */
      add(tint(slab(7.2, .26, 2.8, .3, .06), '#A6DEC7'), cm({ coat: .25, rough: .6, vertexColors: true }), 0, 0, 0, bench); /* mint, not grey */
      const lip = kit.lip(7.2, 2.8, .3, .035, INDM); tint(lip.geometry, IND); lip.position.y = -.1; bench.add(lip);
      rail = add(tint(new T.TubeGeometry(track, 200, .018, 6), IND), INDM, 0, .004, 0, bench);
    },
    () => { /* tiles (instanced) + 70 studs (2 rows of 5 per tile: the working days of a two-week sprint; desktop) */
      tiles = new T.InstancedMesh(slab(.78, .08, .92, .12, .03), cm({ coat: .3 }), N); tiles.frustumCulled = false; bench.add(tiles);
      if (!mob) { studs = new T.InstancedMesh(Cy(.03, .03, 10), cm({ coat: .4 }), N * 10); studs.frustumCulled = false; bench.add(studs); }
      layoutTiles(0, 0);
    },
    async () => { /* tile labels: one 512×512 atlas (the sprint periods, build.acc.sprints[i].k), one merged geometry */
      const rh = 512 / N, t = await kit.canvasTex(512, 512, (g) => {
        g.font = '600 40px "JetBrains Mono",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#0B7A67';
        for (let i = 0; i < N; i++) g.fillText(String(ctx.t('build.acc.sprints.' + i + '.k')).toUpperCase(), 256, rh * (i + .5), 500);
      });
      add(kit.merge(pts.map((o, i) => {
        const g = new T.PlaneGeometry(.72, .1), uv = g.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setY(j, 1 - (i + 1 - uv.getY(j)) * rh / 512);
        return g.rotateX(-P / 2).translate(0, 0, .61).rotateY(tyaw[i]).translate(o.x, .132, o.z);
      })), basic({ map: t, depthWrite: false }), 0, 0, 0, bench);
    },
    async () => { /* the phone: graphite soft-touch body + indigo buttons + camera bump (one mesh), peach stand, screen */
      const G = '#26242E', parts = [[slab(1, 2.06, .12, .17, .035), G]];
      for (const [x, y, l] of [[.505, .5, .14], [-.505, .62, .22], [-.505, .3, .22]]) parts.push([new T.CapsuleGeometry(.011, l, 3, 8), IND, x, y]);
      parts.push([slab(.34, .34, .03, .08, .01), '#34323D', -.24, .74, -.07], [Cy(.06, .02, 24), '#121118', -.31, .81, -.09, P / 2], [Cy(.06, .02, 24), '#121118', -.17, .67, -.09, P / 2], [Cy(.022, .02, 12), '#FFF1C9', -.17, .81, -.088, P / 2]);
      add(bake(parts), GRM, 0, 0, 0, pg);
      proxy = add(new T.BoxGeometry(1.05, 2.1, .2), new T.MeshBasicMaterial(), 0, 0, 0, pg); proxy.visible = false;
      add(bake([[slab(.9, .08, .5, .1, .03), '#FFB98A', 0, .04, .05], [slab(.9, .5, .08, .1, .03), '#FFB98A', 0, .3, -.26, -.35]]), VC, 0, 0, 0, ph);
      blob(1.7, 1.1, .2, ph);
      scr = await kit.canvasTex(SW, SH, draw);
      screen = add(new T.PlaneGeometry(.92, 1.98), basic({ map: scr }), 0, 0, .0605, pg);
      /* widget-tree layers (station 4): the same texture cut by UV — AppBar / ListView / Row / footer */
      for (const [y0, y1] of [[0, 120], [132, 640], [652, 712], [730, 810]]) {
        const g = new T.PlaneGeometry(.92, (y1 - y0) / 832 * 1.98), uv = g.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setY(j, 1 - (uv.getY(j) ? y0 : y1) / 832);
        const l = add(g, screen.material, 0, .99 - (y0 + y1) / 832 * .99, .0605, pg); l.visible = false; layers.push(l);
      }
      bead = add(tint(new T.SphereGeometry(.1, 20, 12), IND), cm({ coat: .6, emissive: IND, emissiveIntensity: .12, vertexColors: true }), -.62, .1, .3, ph); /* rests on the tile, clear of the phone */
    },
    () => { /* s0 GetX: controller / route / binding blocks on posts, linked */
      const c = [[TEAL, -.32, .42], ['#54C5F8', 0, .66], ['#FFD166', .32, .5]], parts = [];
      c.forEach(([h, x, y]) => parts.push([slab(.28, .16, .12, .05, .02), h, x, y], [Cy(.018, y, 8), '#E7EFEC', x, y / 2]));
      for (let k = 0; k < 2; k++) { const [, x0, y0] = c[k], [, x1, y1] = c[k + 1]; parts.push([new T.CapsuleGeometry(.018, Math.hypot(x1 - x0, y1 - y0) - .1, 4, 8), IND, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, -Math.atan2(x1 - x0, y1 - y0)]); }
      prop([new T.Mesh(bake(parts), VC)], .95, .15, (g, t) => { g.children[0].position.y = .03 * Math.sin(t * 2); });
    },
    () => { /* s1 components + the Lottie ring */
      const ring = new T.Mesh(tint(new T.TorusGeometry(.09, .018, 8, 32, 1.6 * P), IND), INDM); ring.position.y = .62;
      prop([new T.Mesh(bake(['#ffffff', '#E9E6FD', '#DDF3EC', '#FFF0C7'].map((h, k) => [slab(.36, .04, .24, .06, .015), h, (k % 2) * .05 - .02, .08 + k * .08, (k % 2) * -.04])), VC), ring], .9, .2, (g, t) => { ring.rotation.z = -t * 4; });
    },
    async () => { /* s2 tablet (two-column reflow) + a keyboard whose 40 keys drop in */
      const tg = new T.Group(); tg.position.set(.2, .58, -.4); tg.rotation.set(-.2, -.35, 0);
      add(tint(slab(1.5, 1.1, .08, .12, .03), '#26242E'), GRM, 0, 0, 0, tg);
      tab = await kit.canvasTex(mob ? 256 : 512, mob ? 192 : 384, (g, w) => {
        g.scale(w / 512, w / 512); g.fillStyle = '#FBF9F4'; g.fillRect(0, 0, 512, 384); g.fillStyle = TEAL; g.fillRect(0, 0, 512, 60);
        rect(g, 20, 22, 120, 16, 8, '#ffffffd0'); rows(g, 16, 76, 232, 4, 1); rows(g, 264, 76, 232, 4);
      });
      add(new T.PlaneGeometry(1.4, 1), basic({ map: tab }), 0, 0, .041, tg);
      const kb = new T.Group(); kb.position.set(.15, 0, .5); kb.rotation.y = -.25;
      const keys = [[slab(.9, .05, .36, .06, .02), '#EDEAF7', 0, .025]];
      for (let j = 0; j < 40; j++) keys.push([new T.BoxGeometry(.064, .022, .064), '#ffffff', -.36 + (j % 10) * .08, .06, -.12 + (j / 10 | 0) * .08]);
      add(bake(keys), VC, 0, 0, 0, kb);
      prop([tg, kb], 1.2, -.05, (g, t, s) => { kb.position.y = (1 - s) * .4; }, 1.1);
    },
    () => { /* s3 JSON → Dart: two braces orbit, then fly into a model card */
      const card = new T.Mesh(bake([[slab(.5, .32, .04, .05, .015), '#ffffff'], ...[0, 1, 2].map((k) => [slab(.3 - k * .06, .035, .012, .015, .004), IND, -.06 - k * .03, .08 - k * .08, .025])]), VC);
      card.position.y = .5; card.rotation.x = -.15;
      const br = (s) => new T.Mesh(tint(new T.TubeGeometry(new T.CatmullRomCurve3([[.06, .2], [.01, .17], [.01, .05], [-.05, 0], [.01, -.05], [.01, -.17], [.06, -.2]].map(([x, y]) => V(x * s, y, 0))), 40, .02, 6), IND), INDM);
      const b1 = br(1), b2 = br(-1);
      prop([card, b1, b2], .92, .2, (g, t) => {
        const c = t % 4, fly = ss(2.6, 3.3, c) * (1 - ss(3.6, 4, c)), r = .38 * (1 - fly) + .02;
        [b1, b2].forEach((b, k) => { const a = t * 1.6 + k * P; b.position.set(Math.cos(a) * r, .5 + Math.sin(a) * r * .5, Math.sin(a) * .1 + .05); b.scale.setScalar(1 - .7 * fly); });
        card.scale.setScalar(1 + .08 * Math.sin(P * ss(3, 3.6, c)));
      });
    },
    () => { prop([], 0, 0); /* s4 = the widget-tree explode, on the phone itself */ },
    () => { /* s5 three flow cards fan out ±18° behind the phone (1 / 2 / 3 step dots) */
      const cards = [0, 1, 2].map((k) => {
        const parts = [[slab(.42, .78, .03, .06, .01), '#ffffff']];
        for (let j = 0; j <= k; j++) parts.push([new T.SphereGeometry(.026, 10, 8), IND, -.12 + j * .08, .28, .02]);
        const m = new T.Mesh(bake(parts), VC); m.position.y = .5; return m;
      });
      prop(cards, 0, -.42, (g, t, s) => cards.forEach((c, k) => { c.rotation.z = (1 - k) * .31 * s; c.position.x = (1 - k) * -.38 * s; }));
    },
    async () => { /* s6 an APK / AAB box + a paper plane relaunched every 6 s (distribution) */
      const d = await kit.canvasTex(256, 64, (g) => {
        g.font = '600 40px "JetBrains Mono",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#17150F';
        g.fillText(ctx.t('ui.w.build.apk'), 64, 34); g.fillText(ctx.t('ui.w.build.aab'), 192, 34);
      });
      const box = new T.Group(); box.position.y = .15;
      add(tint(slab(.4, .3, .3, .06, .03), '#FFD166'), cm({ coat: .35, vertexColors: true }), 0, 0, 0, box);
      const dm = basic({ map: d, depthWrite: false }), f1 = new T.PlaneGeometry(.3, .075), f2 = f1.clone();
      for (const [g, u0] of [[f1, 0], [f2, .5]]) { const uv = g.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, u0 + uv.getX(j) * .5); }
      add(f1, dm, 0, .02, .152, box); add(f2, dm, .202, .02, 0, box).rotation.y = P / 2;
      const sh = new T.Shape(); sh.moveTo(0, .16); sh.lineTo(-.09, -.06); sh.lineTo(0, -.02); sh.lineTo(.09, -.06); sh.closePath();
      const front = new T.ShapeGeometry(sh).rotateX(-P / 2 + .25), back = front.clone(); back.index.array.reverse();
      const plane = new T.Mesh(bake([[front, '#ffffff'], [back, '#ffffff']]), VC);
      const fl = new T.QuadraticBezierCurve3(V(0, .35, 0), V(.2, 1.4, .3), V(1.6, 1.9, -.6));
      prop([box, plane], -.95, .2, (g, t) => { const k = (t % 6) / 2.4; plane.visible = k < 1; fl.getPoint(cl(k), plane.position); plane.rotation.set(0, -.9 * k, .3 * Math.sin(k * 6)); plane.scale.setScalar(Math.max(.001, 1 - ss(.7, 1, k))); });
    }
  ]);

  /* one prop per station: spring-scaled (k 200) when |beat − i| < .5, micro-move while it shows */
  function prop(objs, x, z, tick, sc = 1) {
    const g = new T.Group(); objs.forEach((o) => g.add(o)); g.scale.setScalar(.001); g.visible = false; scene.add(g);
    if (objs.length) blob(.95, .7, .16, g);
    props.push({ g, x, z, tick, sc, s: 0, v: 0 });
  }
  function layoutTiles(e, lit) {
    const { S, Y, p, c1, c2, ti, il, tl } = LT;
    for (let i = 0; i < N; i++) {
      const drop = (1 - s5(ss(.15 + .06 * i, .45 + .06 * i, e))) * 1.2, o = pts[i], on = i < lit, c = Math.cos(tyaw[i]), sn = Math.sin(tyaw[i]);
      Q.setFromAxisAngle(Y, tyaw[i]);
      tiles.setMatrixAt(i, M.compose(p.set(o.x, .17 + drop, o.z), Q, S)); tiles.setColorAt(i, mob && on ? tl : i % 2 ? c2 : c1);
      if (studs) for (let k = 0; k < 10; k++) {
        const lx = -.28 + (k % 5) * .14, lz = k < 5 ? -.33 : .33;
        studs.setMatrixAt(i * 10 + k, M.compose(p.set(o.x + lx * c + lz * sn, .225 + drop, o.z - lx * sn + lz * c), Q, S)); studs.setColorAt(i * 10 + k, on ? il : ti);
      }
    }
    for (const m of [tiles, studs]) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  /* ---------- the screen: 384×832 design space (832×384 when rotated), redrawn ≤30 Hz only while something changes ---------- */
  function rows(g, x, y, w, n, hi = -1, off = 0) {
    for (let k = 0; k < n; k++) {
      const yy = y + k * 64 - off; if (yy < y - 60) continue;
      rect(g, x, yy, w, 52, 12, k === hi ? '#E9E6FD' : '#fff'); dot(g, x + 26, yy + 26, 11, k === hi ? IND : '#C7B8FF');
      rect(g, x + 48, yy + 15, w * .5, 8, 4, ink(.22)); rect(g, x + 48, yy + 30, w * .3, 7, 3.5, ink(.11));
    }
  }
  function body(g, s, W) { /* portrait station screens: X = 20, Y = 134, width W */
    const X = 20, Y = 134, mono = (px) => { g.font = `600 ${px}px "JetBrains Mono",monospace`; g.textBaseline = 'middle'; g.textAlign = 'left'; };
    mono(22); g.lineWidth = 3;
    if (s === 0) { /* GetX: controller → route / binding */
      g.strokeStyle = IND; g.beginPath(); g.moveTo(X + W / 2, Y + 80); g.lineTo(X + W / 4, Y + 120); g.moveTo(X + W / 2, Y + 80); g.lineTo(X + W * .75, Y + 120); g.stroke();
      [['c', X, Y + 10, W, TEAL], ['r', X, Y + 120, W / 2 - 8, '#54C5F8'], ['b', X + W / 2 + 8, Y + 120, W / 2 - 8, '#FFD166']].forEach(([k, x, y, ww, c]) => {
        rect(g, x, y, ww, 70, 16, '#fff', c); dot(g, x + 24, y + 35, 8, c); g.fillStyle = '#17150F'; g.fillText(ctx.t('ui.w.build.getx.' + k), x + 42, y + 35, ww - 52);
      });
      rows(g, X, Y + 230, W, 5);
    } else if (s === 1) { /* components grid + a Lottie arc */
      const cw = (W - 16) / 2, a = performance.now() / 300;
      for (let k = 0; k < 6; k++) {
        const x = X + (k % 2) * (cw + 16), y = Y + (k >> 1) * 132; rect(g, x, y, cw, 116, 18, '#fff');
        if (k === 1) { g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = IND; g.beginPath(); g.arc(x + cw / 2, y + 58, 30, a, a + 4.6); g.stroke(); }
        else { rect(g, x + 16, y + 18, 34, 34, 10, ['#C7B8FF', 0, '#DDF3EC', '#FFF0C7', '#FFE2D6', '#E9E6FD'][k]); rect(g, x + 16, y + 68, cw * .6, 8, 4, ink(.2)); rect(g, x + 16, y + 84, cw * .4, 7, 3.5, ink(.1)); }
      }
    } else if (s === 3) { /* JSON braces → arrow → Dart model card */
      rect(g, X, Y, W, 196, 16, '#26242E'); mono(26); g.fillStyle = '#FFD166'; g.fillText('{', X + 16, Y + 30); g.fillText('}', X + 16, Y + 168);
      for (let k = 0; k < 4; k++) { rect(g, X + 46, Y + 54 + k * 28, 70, 9, 4.5, '#7FE3CC'); rect(g, X + 128, Y + 54 + k * 28, 60 + k * 22, 9, 4.5, '#C7B8FF'); }
      mono(18); g.textAlign = 'right'; g.fillStyle = '#ffffff99'; g.fillText(ctx.t('ui.w.build.json'), X + W - 14, Y + 30);
      g.fillStyle = TEAL; g.beginPath(); g.moveTo(X + W / 2 - 14, Y + 214); g.lineTo(X + W / 2 + 14, Y + 214); g.lineTo(X + W / 2, Y + 240); g.fill();
      g.lineWidth = 3; rect(g, X, Y + 258, W, 170, 16, '#fff', IND); rect(g, X + 18, Y + 276, 90, 12, 6, IND); g.fillStyle = IND; g.fillText(ctx.t('ui.w.build.model'), X + W - 16, Y + 282);
      for (let k = 0; k < 3; k++) { rect(g, X + 18, Y + 310 + k * 34, 60, 10, 5, ink(.25)); rect(g, X + 92, Y + 310 + k * 34, W * .5 - k * 30, 10, 5, '#C7B8FF'); }
    } else if (s === 4) { rows(g, X, Y + 6, W, 7); for (let k = 0; k < 3; k++) rect(g, X + k * (W / 3), 652, W / 3 - 10, 60, 14, ['#E9E6FD', '#DDF3EC', '#FFF0C7'][k]); } /* layers that explode */
    else if (s === 5) { /* financing flow: stepper, slider, two options, confirm (no digits, no currency) */
      for (let k = 0; k < 3; k++) { dot(g, X + 30 + k * (W - 60) / 2, Y + 24, 14, k < 2 ? IND : '#E3E0D8'); if (k < 2) rect(g, X + 44 + k * (W - 60) / 2, Y + 21, (W - 60) / 2 - 28, 6, 3, k ? '#E3E0D8' : IND); }
      rect(g, X, Y + 74, W, 12, 6, '#E3E0D8'); rect(g, X, Y + 74, W * .62, 12, 6, TEAL); dot(g, X + W * .62, Y + 80, 16, TEAL); dot(g, X + W * .62, Y + 80, 10, '#fff');
      for (let k = 0; k < 2; k++) { const y = Y + 130 + k * 128; g.lineWidth = k ? 2 : 5; rect(g, X, y, W, 108, 18, '#fff', k ? ink(.15) : IND); dot(g, X + 34, y + 54, 13, k ? '#E3E0D8' : IND); rect(g, X + 64, y + 36, W * .45, 10, 5, ink(.25)); rect(g, X + 64, y + 60, W * .3, 9, 4.5, ink(.12)); }
    } else if (s === 6) { /* release: build bar → APK / AAB chips → paper plane */
      rect(g, X, Y + 10, W, 18, 9, TEAL); mono(28); g.textAlign = 'center';
      ['apk', 'aab'].forEach((k, i) => { const x = X + i * (W / 2 + 8); rect(g, x, Y + 56, W / 2 - 8, 70, 35, i ? '#E9E6FD' : '#DDF3EC'); g.fillStyle = '#17150F'; g.fillText(ctx.t('ui.w.build.' + k), x + W / 4 - 4, Y + 92); });
      const px = X + W / 2, py = Y + 260; g.fillStyle = IND; g.beginPath(); g.moveTo(px + 70, py - 40); g.lineTo(px - 70, py + 4); g.lineTo(px - 10, py + 18); g.lineTo(px + 6, py + 64); g.fill();
    } else rows(g, X, Y, W, 8, 1);
  }
  function draw(g) {
    const L = st.land, w = L ? 832 : 384, h = L ? 384 : 832, now = performance.now();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, SW, SH);
    g.save(); g.beginPath(); g.roundRect(0, 0, SW, SH, 58 * SC); g.clip();
    if (L) g.setTransform(0, -SC, SC, 0, 0, SH); else g.setTransform(SC, 0, 0, SC, 0, 0);
    g.fillStyle = '#FBF9F4'; g.fillRect(0, 0, w, h);
    rect(g, 26, 14, 50, 9, 4.5, ink(.55)); rect(g, w - 70, 14, 44, 9, 4.5, ink(.4));
    g.fillStyle = TEAL; g.fillRect(0, 36, w, 86);
    g.font = '600 26px "JetBrains Mono",monospace'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
    const title = ctx.t('bug.st' + st.s); g.fillText(title, 26, 80, w - 80);
    if (st.caret) g.fillRect(30 + Math.min(g.measureText(title).width, w - 80), 66, 3, 28);
    g.save(); g.beginPath(); g.rect(0, 124, w, h - 124); g.clip();
    if (st.of && st.ofT > .65) { const off = (Math.sin(now / 700) * .5 + .5) * 240; rows(g, 20, 134, w - 52, 12, -1, off); rect(g, w - 18, 140 + off * .4, 6, 120, 3, IND); } /* fixed: it scrolls */
    else if (L) { rows(g, 20, 134, 376, 3, 1); rows(g, 436, 134, 376, 3); } /* landscape: the list reflows into two columns */
    else body(g, st.s, 344);
    if (st.of && st.ofT <= .65) { /* the bug: Flutter's yellow/black overflow stripe + a coral dashed bracket, for 650 ms */
      g.fillStyle = '#17150F'; g.fillRect(w - 34, 124, 34, h); g.fillStyle = '#FFD600';
      for (let y = 100; y < h + 40; y += 24) { g.beginPath(); g.moveTo(w - 34, y); g.lineTo(w, y - 34); g.lineTo(w, y - 22); g.lineTo(w - 34, y + 12); g.fill(); }
      g.setLineDash([12, 8]); g.lineWidth = 5; rect(g, 12, 128, w - 52, h - 248, 14, null, '#FF6A3D'); g.setLineDash([]);
    }
    g.restore();
    const ky = h - h * .4 * st.kb, fy = Math.min(h - 92, ky - 80);
    if (st.kb > .01) { g.fillStyle = '#E8E4DA'; g.fillRect(0, ky, w, h * .4); for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) rect(g, 10 + c * (w - 20) / 10, ky + 14 + r * (h * .4 - 24) / 4, (w - 20) / 10 - 8, (h * .4 - 24) / 4 - 10, 7, '#fff'); }
    rect(g, 28, fy, w - 56, 60, 30, IND); rect(g, w / 2 - 50, fy + 25, 100, 10, 5, '#ffffffcc'); /* the sticky footer pill rides above the keyboard */
    if (st.rip) { const k = cl((now - st.rip.t) / 450); if (k < 1) { g.lineWidth = 5; g.strokeStyle = `rgba(58,43,224,${1 - k})`; g.beginPath(); g.arc(st.rip.x * w, st.rip.y * h, 14 + 70 * k, 0, P * 2); g.stroke(); } else st.rip = null; }
    g.restore();
  }

  /* hotspots handed to us: the station chip + the four widget-tree layer labels (aria-hidden; the sprint log is the twin) */
  const H = (id) => slot.querySelector(`.slot-ui [data-hotspot="${id}"]`), hotspots = [], chip = H('station');
  const chipA = new T.Object3D(); chipA.position.set(0, 1.28, 0); pg.add(chipA);
  if (chip) hotspots.push({ el: chip, anchor: chipA });
  ['appbar', 'listview', 'row', 'footer'].forEach((id, k) => { const el = H(id); if (el) { const a = new T.Object3D(); a.position.set(-.98, 0, 0); layers[k].add(a); hotspots.push({ el, anchor: a }); } });

  /* bug state from the DOM Bugphone (bus.last on create) */
  const applyBugs = (d) => { const o = (d && d.order) || [], of = o.includes('overflow'); if (of && !st.of) st.ofT = 0; st.of = of; bugs.rot = o.includes('rotate'); bugs.kb = o.includes('keyboard'); dirty = awake = 1; };
  offs.push(bus.on('bp:state', applyBugs)); applyBugs(bus.last('bp:state'));

  /* pointer on the slot: hover tilt, drag-to-spin (mouse), taps (screen ripple, the overflow stripe, sprint tiles) */
  const Pt = { x: 0, y: 0, in: false, moved: false }, rc = new T.Raycaster();
  const drag = { on: 0, x: 0, y: 0, x0: 0, y0: 0, t: 0, vy: 0, yaw: 0, pitch: 0, rel: 9, sv: 0 };
  const ndc = (e) => { const r = slot.getBoundingClientRect(); Pt.x = cl((e.clientX - r.left) / r.width * 2 - 1, -1, 1); Pt.y = cl(1 - (e.clientY - r.top) / r.height * 2, -1, 1); Pt.moved = true; awake = 1; };
  const L = (n, f) => slot.addEventListener(n, f, { passive: true, signal: ac.signal });
  const pick = () => { rc.setFromCamera(Pt, camera); const h = rc.intersectObjects([proxy, screen, tiles], false); return h[0] && h[0].object === proxy ? h.find((x) => x.object === screen) || h[0] : h[0]; };
  L('pointermove', (e) => {
    ndc(e); Pt.in = true;
    if (drag.on) { const dx = e.clientX - drag.x, ts = e.timeStamp / 1000; drag.vy = cl(dx * .012 / Math.max(.008, ts - drag.t), -4, 4); drag.t = ts; drag.yaw += dx * .012; drag.pitch = cl(drag.pitch + (e.clientY - drag.y) * .006, -.35, .35); drag.x = e.clientX; drag.y = e.clientY; }
  });
  L('pointerleave', () => { Pt.in = false; Pt.moved = true; });
  L('pointerdown', (e) => { ndc(e); drag.x0 = drag.x = e.clientX; drag.y0 = drag.y = e.clientY; drag.t = e.timeStamp / 1000; if (!mob && e.pointerType === 'mouse' && (pick() || {}).object !== tiles) { drag.on = 1; drag.vy = 0; } });
  L('pointerup', (e) => {
    if (drag.on) { drag.on = 0; drag.rel = 0; }
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) return;
    ndc(e); const h = pick(); if (!h) return;
    if (h.object === tiles && h.instanceId != null) bus.emit('aa:goto', { hash: '#sprint-' + h.instanceId });
    else if (h.object === screen && h.uv) { if (st.land ? h.uv.y > .9 : h.uv.x > .86) bus.emit('bp:toggle', { bug: 'overflow' }); tap(h.uv); }
    else tap({ x: .5, y: .55 });
  });
  function tap(uv) { st.rip = { x: st.land ? uv.y : uv.x, y: st.land ? uv.x : 1 - uv.y, t: performance.now() }; dirty = awake = 1; }

  /* ---------- motion: every scrubbed effect is a pure f(p, beat); idle loops add on top ---------- */
  let t = 0, aspect = 1, lastDraw = 0, prevS = -1, hop = 9, p6 = -1, cursor = null, eL = -1, litL = -1;
  const rs = { s: 0, v: 0 }, cam = { p: V(0, 3.4, 9), q: V(0, .3, 0) }, tp = V(0, 0, 0), fp = V(0, 0, 0), fq = V(0, 0, 0), wq = V(0, .3, 0);
  function update(_t, dt, p, input) {
    dt = Math.min(dt > 1 ? dt / 1000 : dt || 0, .1);
    const paused = !!still || slot.classList.contains('is-paused');
    if (!paused) t += dt;
    const beat = cl(still ? still.beat : input && Number.isFinite(input.beat) ? input.beat : 0, 0, 7.5), e = still ? 1 : ss(0, .26, p);
    /* after the last sprint: the stage holds beat at 6 while the sticky stage pins, so the outro rides on p from there */
    if (beat >= 5.99 && p6 < 0) p6 = p; else if (beat < 5.9) p6 = -1;
    const o = still ? ss(6.25, 6.9, beat) : p6 >= 0 ? ss(p6 + .02, p6 + .14, p) : 0;
    const si = Math.min(6, Math.floor(beat)), f = beat - si, mv = si < 6 ? s5(ss(.35, .85, f)) : 0, u = (si + mv) / 6;
    const scrS = mv < .5 ? si : si + 1, lit = o > .5 ? N : Math.floor(si + mv + .5);
    bench.position.y = -.6 * (1 - s5(ss(0, .35, e)));
    if (Math.abs(e - eL) > 1e-4 || lit !== litL) { layoutTiles(e, lit); eL = e; litL = lit; }
    rail.geometry.setDrawRange(0, Math.floor(rail.geometry.index.count * ss(.4, .75, e) / 6) * 6);
    /* station props (spring k 200) and the station-4 widget-tree explode */
    props.forEach((q, i) => {
      const on = e >= 1 && o < .5 && Math.abs(beat - i) < .5 ? 1 : 0;
      spr(q, on, 200, 19, dt); if (still) { q.s = on; q.v = 0; }
      const s = cl(q.s, 0, 1.2);
      if (i === 4) { layers.forEach((l, j) => { l.visible = s > .02; l.position.z = .0605 + j * .16 * s; }); screen.visible = s <= .02; hotspots.forEach((h, j) => j && h.el.classList.toggle('is-on', s > .6)); return; }
      q.g.visible = s > .01; if (!q.g.visible) return;
      const po = pts[i]; q.g.position.set(po.x + q.x, .21, po.z + q.z); q.g.rotation.y = .31; q.g.scale.setScalar(Math.max(.001, s) * q.sc);
      if (q.tick) q.tick(q.g, t, cl(s));
    });
    /* the phone along the track: spins in on entry, breathes, tilts to the pointer, turns to its back at the end */
    track.getPoint(cl(u), tp); const sp = s5(ss(.6, 1, e));
    ph.position.set(tp.x, tp.y - .005 + (1 - sp) * 1.6 + .02 * Math.sin(t * P / 2), tp.z);
    spr(rs, bugs.rot ? 1 : 0, 180, 20, dt); if (still) rs.s = bugs.rot ? 1 : 0;
    if (!drag.on) {
      drag.rel += dt; drag.yaw += drag.vy * dt; drag.vy *= Math.pow(.92, dt * 60);
      if (drag.rel > 2.5) { const tg = Math.round(drag.yaw / (P * 2)) * P * 2; drag.sv += ((tg - drag.yaw) * 40 - drag.sv * 9) * dt; drag.yaw += drag.sv * dt; drag.pitch *= Math.exp(-4 * dt); } else drag.sv = 0;
    }
    const hv = Pt.in && !mob ? 1 : 0;
    ph.rotation.y = .31 + (1 - sp) * P * 2 + P * o + drag.yaw + .14 * Pt.x * hv + .45 * cl(props[4].s);
    pg.rotation.set(-.21 + .021 * Math.sin(t * P / 2) + drag.pitch - .1 * Pt.y * hv, 0, -P / 2 * rs.s);
    pg.position.set(0, 1.11 - .53 * rs.s, .05);
    /* the bead hops from the stand onto the screen and taps on each arrival, and every 6 s */
    if (scrS !== prevS) { if (prevS >= 0 && !still) hop = 0; prevS = scrS; st.s = scrS; dirty = 1; if (chip) chip.textContent = ctx.t('bug.st' + scrS); }
    if (!paused && Math.floor(t / 6) !== Math.floor((t - dt) / 6) && hop > 1) hop = 0;
    if (hop <= 1) { hop += dt / .7; const a = Math.sin(P * cl(hop)); bead.position.set(-.62 + .5 * a, .1 + 1.05 * a, .3 + .1 * a); if (hop > .5 && hop < .6 && !st.rip) tap({ x: .38, y: .52 }); } else bead.position.set(-.62, .1, .3);
    /* camera: wide entry shot → follows the phone (damped λ 4) → pulls back over the whole bench after the last beat */
    /* the follow shot aims at the bench beside the phone (not the phone itself) and backs off on narrow slots, so the
       set stays framed; the slot-ui only feathers the last 5 % of each side */
    const mix = ss(.55, 1, e) * (1 - o), far = Math.max(1.12, 4.3 / (aspect * 9.6 * .268));
    const cx = ph.position.x * .35, zb = 10 * Math.max(1, 1.25 / aspect);
    fp.set(cx + .8, ph.position.y + 3.6, ph.position.z + zb).lerp(tp.set(0, 4.6 * far, 8.4 * far), 1 - mix);
    fq.set(cx + .1, ph.position.y + .75, ph.position.z - .2).lerp(wq, 1 - mix);
    const kd = still ? 1 : 1 - Math.exp(-4 * dt); cam.p.lerp(fp, kd); cam.q.lerp(fq, kd);
    camera.position.copy(cam.p); camera.lookAt(cam.q);
    /* screen state */
    const land = rs.s > .5; if (land !== st.land) { st.land = land; dirty = 1; }
    const kb = bugs.kb ? 1 : 0; if (Math.abs(st.kb - kb) > .001) { st.kb += (kb - st.kb) * (still ? 1 : 1 - Math.exp(-10 * dt)); dirty = 1; }
    if (st.of) { st.ofT += dt; dirty = 1; }
    const caret = !still && t % 1 < .5 ? 1 : 0; if (caret !== st.caret) { st.caret = caret; dirty = 1; }
    if (st.rip || (st.s === 1 && !still)) dirty = 1;
    const now = performance.now();
    if (dirty && (still || now - lastDraw > 33)) { scr.redraw(); lastDraw = now; dirty = 0; }
    /* the cursor pill reads Spin over the phone (fine pointers), Open over a sprint tile */
    if (Pt.moved && !still) { Pt.moved = false; const h = Pt.in ? pick() : null; cursor = !h ? '' : h.object === tiles ? 'open' : mob ? '' : 'spin'; }
    if (chip) chip.classList.toggle('is-on', e >= 1 && o < .5 && !still);
    awake = !paused || drag.on || Math.abs(rs.v) > .01 || hop <= 1 ? 1 : 0;
  }

  return {
    id: 'build', scene, camera, exposure: 1.06, hotspots, update,
    get cursor() { return cursor; },
    resize(w, h) { aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix(); },
    pointer(ev) { if (ev && ev.type === 'leave') { Pt.in = false; Pt.moved = true; } },
    needsFrame: () => !!awake,
    setQuality(q) { if (studs) studs.visible = +q > 1; },
    dispose() { ac.abort(); offs.forEach((f) => f && f()); hotspots.forEach((s) => s.el.classList.remove('is-on')); kit.dispose(scene); }
  };
}
