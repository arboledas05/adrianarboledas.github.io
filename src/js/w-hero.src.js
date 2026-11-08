/* w-hero.js (B3) · FIG. 00 THE WORLD DECK: five riveted clay blades fanned behind his cut-out portrait (a DOM layer
   above the canvas); each blade is a chapter in its world colour with a live miniature at its tip. The indigo bead
   marks the chapter you are about to open: it perches on the Build blade and hops to the blade you point at.
   Contract: DELTA_SPEC engine_spec §12 (create → world). Strings only via ctx.t('ui.w.hero.b0…b4'). */
const BL = [['build', '#22B29A'], ['deploy', '#6A86FF'], ['grow', '#FF7A45'], ['drone', '#8CBF5A'], ['europe', '#45A6E6']];
const IND = '#3A2BE0', SP = .40, DY = .62, DS = .86, P = Math.PI;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const bump = (k) => Math.sin(P * cl(k));
const eob = (k) => { k = cl(k) - 1; return 1 + 2.70158 * k ** 3 + 1.70158 * k * k; };
const spr = (u, to, k, c, dt) => { for (let h = dt; h > 0; h -= 1 / 120) { const s = Math.min(h, 1 / 120); u.v += ((to - u.s) * k - u.v * c) * s; u.s += u.v * s; } };
const rect = (g, x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };

/* the blade: a rounded rect with the rivet hole, extruded with a bevel; smooth normals except the two flat faces
   (kit.smoothNormals would smear the long face triangles) */
function blade(T) {
  const s = new T.Shape(), x = .43, y = 1.6, q = .15;
  s.moveTo(-x + q, -y); s.absarc(x - q, -y + q, q, -P / 2, 0); s.absarc(x - q, y - q, q, 0, P / 2); s.absarc(-x + q, y - q, q, P / 2, P); s.absarc(-x + q, -y + q, q, P, P * 1.5);
  s.holes.push(new T.Path().absarc(0, -1.35, .09, 0, P * 2, true));
  const d = .2, b = .03, g = new T.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 7 });
  g.translate(0, 1.35, b - d / 2); g.deleteAttribute('uv');
  const p = g.attributes.position.array, n = g.attributes.normal.array, m = new Map(), f = [0, 0, 0];
  const key = (i) => ((Math.round(p[i] * 1e4) + 65536) * 131072 + Math.round(p[i + 1] * 1e4) + 65536) * 131072 + Math.round(p[i + 2] * 1e4) + 65536;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    f[0] = ay * bz - az * by; f[1] = az * bx - ax * bz; f[2] = ax * by - ay * bx;
    for (let j = i; j < i + 9; j += 3) { const k = key(j), a = m.get(k) || m.set(k, [0, 0, 0]).get(k); a[0] += f[0]; a[1] += f[1]; a[2] += f[2]; }
  }
  for (let i = 0; i < p.length; i += 3) {
    if (Math.abs(p[i + 2]) > d / 2 - 1e-4) { n[i] = n[i + 1] = 0; n[i + 2] = Math.sign(p[i + 2]); continue; }
    const a = m.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; n[i] = a[0] / l; n[i + 1] = a[1] / l; n[i + 2] = a[2] / l;
  }
  return g;
}

export async function create(THREE, kit, ctx, slot, opt = {}) {
  const T = THREE, bus = opt.bus || ctx.bus, still = opt.still, V = (x, y, z) => new T.Vector3(x, y, z);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1 / 1.08, .1, 60);
  camera.position.set(0, 1.55, 9.2); camera.lookAt(0, 1.95, 0); /* the spec's .40 fan, fitted to the 1:1.08 slot */
  kit.rig(scene, { hemi: ['#FFF6EA', '#C9BFEA', .9], key: ['#FFF1DF', 2.2, [-3, 5, 6]], rim: ['#8E7CFF', 1, [4, 3, -5]], fog: ['#F4F1EA', 1e3, 1e4] });
  try { scene.environment = kit.env(['#FFF4E0', '#E9E6FD', IND]); } catch (e) { /* no env: a duller coat only */ }
  /* kit.slab (plan corners r, bevel b) and vertex-coloured bakes through kit.merge: one draw call per part group */
  const slab = (w, h, d, r, b) => kit.slab(w, h, d, { r, bevel: b });
  const M = new T.Matrix4(), E = new T.Euler(), Q = new T.Quaternion(), C = new T.Color();
  /* every non-instanced clay part is vertex-coloured (tint / bake): the deck links one clay program + the instanced one */
  const tint = (g, hex) => {
    C.set(hex); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n * 3; i += 3) { c[i] = C.r; c[i + 1] = C.g; c[i + 2] = C.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); return g;
  };
  const bake = (parts) => kit.merge(parts.map(([g, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx]) => tint(g.applyMatrix4(M.compose(V(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), V(sx, sy, sz))), hex)));
  /* saturated toy clay: a lighter rim and wrap than the kit default so the world colours stay rich, not pastel */
  const LOOK = { rimK: .2, wrap: .04, env: .45 }, MC = new Map(), clay = (c, o) => { const k = c + JSON.stringify(o || 0); if (!MC.has(k)) MC.set(k, kit.clay(c, Object.assign({}, LOOK, o))); return MC.get(k); };
  const VC = clay('#ffffff', { coat: .4, vertexColors: true });
  const add = (g, m, x = 0, y = 0, z = 0, p) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); p.add(o); return o; };
  const basic = (o) => new T.MeshBasicMaterial(Object.assign({ toneMapped: false, transparent: true, depthWrite: false }, o));
  const ac = new AbortController(), offs = [], Cy = (r, h, s = 12) => new T.CylinderGeometry(r, r, h, s), Sp = (r, a = 16, b = 10) => new T.SphereGeometry(r, a, b);
  const deck = new T.Group(); deck.position.y = DY; scene.add(deck);
  const blades = [], minis = [];
  let inst, scr, disc, bead, shim = 0;

  /* phone miniature screen: status bar, teal header, four rows (one shimmers), indigo footer pill */
  const phone = (g) => {
    g.save(); g.beginPath(); g.roundRect(0, 0, 128, 256, 18); g.clip();
    g.fillStyle = '#FBF9F4'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#12A38A'; g.fillRect(0, 0, 128, 58);
    rect(g, 12, 8, 22, 5, 2.5, '#ffffffb3'); rect(g, 98, 8, 18, 5, 2.5, '#ffffffb3'); rect(g, 12, 30, 62, 10, 5, '#ffffffeb');
    for (let k = 0; k < 4; k++) {
      const y = 70 + k * 36; rect(g, 10, y, 108, 28, 7, k === shim ? '#E9E6FD' : '#fff');
      g.fillStyle = k === shim ? IND : '#C7B8FF'; g.beginPath(); g.arc(24, y + 14, 6, 0, P * 2); g.fill();
      rect(g, 36, y + 8, 58, 5, 2.5, '#17150F38'); rect(g, 36, y + 17, 36, 4, 2, '#17150F1c');
    }
    rect(g, 14, 222, 100, 22, 11, IND); g.restore();
  };

  await kit.idleChunks([
    () => { /* one shared blade geometry (rivet hole at the origin), one instanced draw */
      inst = new T.InstancedMesh(blade(T), clay('#ffffff', { coat: .35 }), 5); inst.frustumCulled = false; deck.add(inst);
      BL.forEach(([, c], i) => {
        inst.setColorAt(i, new T.Color(c));
        const b = new T.Group(), px = new T.Mesh(new T.BoxGeometry(.9, 3.3, .3));
        b.userData = { s: 0, v: 0, dim: 0, sig: 9, c: new T.Color(c), px }; px.visible = false; px.position.y = 1.4; px.userData.i = i;
        b.add(px); deck.add(b); blades.push(b);
      });
    },
    async () => { /* decals: 256×512 atlas, one mono label per row (ui.w.hero.b0–b4), read along each blade */
      const rh = 512 / 6.2, t = await kit.canvasTex(256, 512, (g) => {
        g.font = '600 34px "JetBrains Mono",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.95)';
        for (let i = 0; i < 5; i++) g.fillText(String(ctx.t('ui.w.hero.b' + i)).toUpperCase(), 128, rh * (i + .5), 236);
      });
      const mat = basic({ map: t });
      blades.forEach((b, i) => {
        const pg = new T.PlaneGeometry(.78, .25), uv = pg.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setY(j, 1 - (i + 1 - uv.getY(j)) * rh / 512);
        const d = add(pg, mat, i < 2 ? -.2 : i > 2 ? .2 : 0, 1.95, .101, b); d.rotation.z = i < 2 ? -P / 2 : P / 2; d.renderOrder = 2;
      });
    },
    () => { /* rivet + caps (one mesh), the bead (no floor shadow: the deck stands behind him, the paper fade grounds it) */
      deck.add(new T.Mesh(bake([[Cy(.13, .3, 24), IND, 0, 0, -.04, P / 2], [Cy(.15, .045, 28), IND, 0, 0, .125, P / 2], [Cy(.15, .045, 28), IND, 0, 0, -.225, P / 2]]), clay('#ffffff', { coat: .6, vertexColors: true })));
      bead = add(tint(Sp(.12, 24, 14), IND), clay('#ffffff', { coat: .6, emissive: IND, emissiveIntensity: .12, vertexColors: true }), 0, 0, .27, deck);
      bead.userData = { at: 0, from: V(0, 0, 0), k: 1 };
    },
    async () => { /* BUILD: graphite phone with a lit screen */
      const m = new T.Group();
      add(tint(slab(.34, .64, .05, .07, .016), '#26242E'), clay('#ffffff', { rough: .62, coat: .1, rim: '#54C5F8', vertexColors: true }), 0, 0, 0, m);
      scr = await kit.canvasTex(128, 256, phone);
      m.userData.scr = add(new T.PlaneGeometry(.3, .6), basic({ map: scr, depthWrite: true }), 0, 0, .0255, m);
      minis.push(m);
    },
    () => { /* DEPLOY: cloud over three server tiles on a frosted plate; one LED slit travels along them */
      const m = new T.Group(), w = '#ffffff';
      const cloud = new T.Mesh(bake([[new T.IcosahedronGeometry(.15, 2), w, 0, .05], [new T.IcosahedronGeometry(.11, 2), w, -.14, -.02], [new T.IcosahedronGeometry(.11, 2), w, .14, -.01], [new T.IcosahedronGeometry(.1, 1), w, -.05, -.07, .03], [new T.IcosahedronGeometry(.1, 1), w, .07, -.08, .03]]), VC);
      cloud.position.y = .17; m.add(cloud);
      const parts = [[slab(.5, .03, .32, .06, .01), '#CFE0F5', 0, -.23]];
      for (let k = 0; k < 3; k++) parts.push([slab(.12, .14, .1, .03, .012), w, (k - 1) * .15, -.13]);
      add(bake(parts), VC, 0, 0, 0, m);
      const led = add(tint(new T.BoxGeometry(.08, .014, .006), '#B9B3F2'), clay('#ffffff', { coat: .2, emissive: IND, emissiveIntensity: 1.2, vertexColors: true }), 0, -.11, .052, m);
      Object.assign(m.userData, { cloud, led }); minis.push(m);
    },
    () => { /* GROW: three lacquer bars (one mesh) + a sprout */
      const m = new T.Group(), bars = [];
      [[.18, '#FF7A45'], [.3, '#FFD166'], [.46, IND]].forEach(([h, c], k) => { const g = slab(.1, h, .1, .025, .012); g.translate(0, h / 2, 0); bars.push([g, c, (k - 1) * .14]); });
      const bm = add(bake(bars), kit.lacquer('#ffffff', { vertexColors: true, rimK: .15, wrap: .04 }), 0, -.27, 0, m);
      const sp = new T.Mesh(bake([[Cy(.008, .12, 6), '#3FB57A', 0, .06], [Sp(.045), '#3FB57A', -.04, .12, 0, 0, 0, -.5, 1, .45, .7], [Sp(.045), '#3FB57A', .04, .12, 0, 0, 0, .5, 1, .45, .7]]), VC);
      sp.position.set(.14, .19, 0); m.add(sp);
      Object.assign(m.userData, { bm, sp }); minis.push(m);
    },
    async () => { /* DRONE: white body + coral stripe + X arms + motors + gimbal (one mesh), four blur discs (one mesh) */
      const m = new T.Group(), d = new T.Group(); m.add(d); d.rotation.x = .38;
      const parts = [[slab(.26, .06, .2, .05, .015), '#ffffff'], [slab(.2, .02, .21, .04, .006), '#FF8F6B', 0, .035], [Sp(.03, 12, 8), '#2B2B33', 0, -.05, .05]], dg = [];
      for (let k = 0; k < 4; k++) {
        const a = P / 4 + k * P / 2, x = Math.cos(a) * .16, z = Math.sin(a) * .16;
        parts.push([Cy(.01, .18, 6), '#ffffff', x / 2, 0, z / 2, 0, -a, P / 2], [Cy(.025, .03), '#2B2B33', x, .02, z]);
        dg.push(new T.CircleGeometry(.075, 24).rotateX(-P / 2).translate(x, .04, z));
      }
      add(bake(parts), VC, 0, 0, 0, d);
      disc = await kit.canvasTex(64, 64, (g) => {
        const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(43,43,51,.3)';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(32 + s * 15, 32, 13, 3.4, 0, 0, P * 2); g.fill(); }
      });
      disc.center.set(.5, .5);
      add(kit.merge(dg), basic({ map: disc }), 0, 0, 0, d);
      Object.assign(m.userData, { d }); minis.push(m);
    },
    () => { /* ABROAD: folded map + pin (one mesh), an open dashed arc */
      const m = new T.Group(), parts = [];
      [['#FBF4E6', .14], ['#CFE3F1', -.14], ['#FBF4E6', .14]].forEach(([c, a], k) => parts.push([slab(.15, .012, .3, .02, .004), c, (k - 1) * .146, 0, 0, 0, 0, a]));
      const f = new T.Mesh(bake(parts), VC); f.rotation.x = 1.05; f.position.y = -.12; m.add(f);
      add(bake([[Sp(.04), IND, 0, .1], [new T.ConeGeometry(.016, .08, 10), IND, 0, .045, 0, P]]), VC, .02, -.1, .06, m);
      const dash = kit.dashMat(IND, { rep: 18, speed: .5 }), u = dash.uniforms || {}; if (u.uDraw) u.uDraw.value = .75;
      add(new T.TubeGeometry(new T.QuadraticBezierCurve3(V(.02, .04, .06), V(-.06, .46, 0), V(-.26, .3, 0)), 24, .006, 6), dash, 0, 0, 0, m);
      Object.assign(m.userData, { u }); minis.push(m);
    },
    () => { minis.forEach((m, i) => { m.position.set(0, 2.75, .2); m.scale.setScalar(i === 3 ? 1.6 : 1.3); blades[i].add(m); }); }
  ]);

  /* hotspot pills handed to us (aria-hidden; the glance list is their DOM twin) */
  const hotspots = [];
  BL.forEach(([id], i) => { const el = slot.querySelector(`.slot-ui [data-hotspot="${id}"]`); if (el) hotspots.push({ el, anchor: minis[i], offset: V(0, .55, 0) }); });

  /* pointer: read on the slot itself (y-up NDC); raycast at most once per frame, only after the pointer moved */
  const Pt = { x: 0, y: 0, in: false, moved: false, click: false, tap: false }, rc = new T.Raycaster();
  const ndc = (e) => { const r = slot.getBoundingClientRect(); Pt.x = cl((e.clientX - r.left) / r.width * 2 - 1, -1, 1); Pt.y = cl(1 - (e.clientY - r.top) / r.height * 2, -1, 1); Pt.moved = true; awake = 1; };
  const L = (n, f) => slot.addEventListener(n, f, { passive: true, signal: ac.signal });
  L('pointermove', (e) => { ndc(e); Pt.in = true; });
  L('pointerleave', () => { Pt.in = false; Pt.moved = true; awake = 1; });
  /* a touch/pen tap fires no pointermove and its pointerleave lands before the click: the click itself puts the pointer
     in for that one raycast, then a tap lets go again (no stuck pill or parallax) */
  L('click', (e) => { ndc(e); Pt.in = true; Pt.click = true; Pt.tap = e.pointerType !== 'mouse'; });

  let hov = -1, ext = -1, hop = 0, hops = 0, puff = 0, puffT = 9, t = 0, it = 0, hx = 0, hy = 0, wx = 9, wy = 9, p0 = .5, awake = 1, cursor = ''; /* '' = no pill until a blade is under the pointer (null would fall back to the slot's "open") */
  offs.push(bus.on('aa:glance-hover', (d) => { ext = d && d.id ? BL.findIndex((b) => b[0] === d.id) : -1; awake = 1; }));
  if (bus.last('aa:intro-deploy')) puff = 1; else offs.push(bus.on('aa:intro-deploy', () => { puff = 1; awake = 1; }));
  let first = true; try { first = !sessionStorage.getItem('aa-deck'); sessionStorage.setItem('aa-deck', '1'); } catch (e) {}
  const DUR = still ? 0 : first ? 1.46 : .4;
  const measure = () => { const r = slot.getBoundingClientRect(), vh = innerHeight || 1; p0 = cl((vh - r.top - scrollY) / (vh + r.height), 0, .95); };
  measure();
  const tmp = new T.Color(), paper = new T.Color('#F4F1EA'), PER = V(0, 0, 0);

  function update(_t, dt, p, input) {
    dt = Math.min(dt > 1 ? dt / 1000 : dt || 0, .1);
    const paused = !!still || slot.classList.contains('is-paused');
    if (!paused) t += dt;
    it += still ? 9 : dt;
    const e = cl((p - p0) / (1 - p0)), ik = DUR ? cl(it / DUR) : 1;
    const px = Pt.in ? Pt.x : input && input.inside ? input.nx || 0 : 0, py = Pt.in ? Pt.y : 0, kd = 1 - Math.exp(-6 * dt);
    hx += (px - hx) * kd; hy += (py - hy) * kd;
    if (!still && (Math.abs(hx - wx) > .002 || Math.abs(hy - wy) > .002)) { wx = hx; wy = hy; slot.style.setProperty('--hx', hx.toFixed(3)); slot.style.setProperty('--hy', (-hy).toFixed(3)); }
    if (Pt.moved && !still) {
      Pt.moved = false; let h = -1;
      if (Pt.in) {
        rc.setFromCamera(Pt, camera);
        const hb = rc.intersectObject(bead, false).length, hs = rc.intersectObjects(blades.map((b) => b.userData.px), false);
        if (hs.length && !hb) h = hs[0].object.userData.i;
        if (Pt.click) { if (hb) { hop = 0; hops = 2; } else if (h >= 0) bus.emit('aa:goto', { hash: '#' + BL[h][0] }); }
      }
      Pt.click = false;
      if (Pt.tap) { Pt.tap = false; Pt.in = false; Pt.moved = true; }
      if (h !== hov) {
        hov = h; if (h >= 0) blades[h].userData.sig = 0;
        bus.emit('aa:world-hover', { id: h >= 0 ? BL[h][0] : null });
        cursor = h >= 0 ? 'open' : '';
        hotspots.forEach((s, i) => s.el.classList.toggle('is-on', i === h));
      }
    }
    const lift = hov >= 0 ? hov : ext;
    deck.rotation.set(-.07 * hy, .14 * hx + .07 * Math.sin(P * .24 * t), -.1745 * e);
    deck.position.y = DY - .6 * e;
    deck.scale.setScalar(DS * (1 - .12 * e) * (DUR > 1 ? .9 + .1 * eob(ik) : 1));
    let moving = ik < 1;
    blades.forEach((b, i) => {
      const u = b.userData, on = i === lift ? 1 : 0;
      spr(u, on, 220, 18, dt); if (still) u.s = u.v = 0;
      u.dim += ((lift >= 0 && !on ? 1 : 0) - u.dim) * (1 - Math.exp(-10 * dt));
      const deal = DUR > 1 ? eob((it - i * .09) / 1.1) : .82 + .18 * eob(ik);
      const a = (SP * deal * (1 - .45 * e) + .0436 * Math.sin(.55 * t + .5 * i)) * (2 - i);
      b.rotation.set(-.08, 0, a);
      b.position.set(-Math.sin(a) * .22 * u.s, Math.cos(a) * .22 * u.s, -.05 * Math.abs(2 - i) + .08 * u.s);
      b.updateMatrix(); inst.setMatrixAt(i, b.matrix); inst.setColorAt(i, tmp.copy(u.c).lerp(paper, .15 * u.dim));
      if (Math.abs(u.v) > .01 || u.sig < .6) moving = true;
      /* the miniature stays upright and plays its 600 ms signature when its blade lifts */
      const m = minis[i], md = m.userData; m.rotation.set(0, -.14 * hx, -a);
      u.sig += dt; const k = cl(u.sig / .6), s = bump(k);
      if (i === 0) {
        md.scr.material.color.setScalar(1 + .3 * s); m.scale.setScalar(1.3 + .13 * s);
        const row = Math.floor(t / 3) % 4; if (row !== shim && !still) { shim = row; scr.redraw(); }
      } else if (i === 1) {
        md.cloud.scale.setScalar(1 + .25 * Math.max(s, puffT < .8 ? bump(puffT / .8) : 0));
        const j = Math.floor((t % 2.4) / 2.4 * 4); md.led.visible = j < 3 && !still; md.led.position.x = (j - 1) * .15;
      } else if (i === 2) { md.bm.scale.y = 1 + .3 * s; md.sp.position.y = .19 + .09 * s; md.sp.rotation.z = .07 * Math.sin(1.3 * t); }
      else if (i === 3) md.d.position.y = .02 * Math.sin(2 * t) + .1 * s;
      else { if (md.u.uTime) md.u.uTime.value = t; if (md.u.uDraw) md.u.uDraw.value = .75 * (u.sig < .6 ? k : 1); }
    });
    disc.rotation = -t * 22;
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (puff && ik >= 1 && !still) { puff = 0; puffT = 0; }
    puffT += dt; if (puffT < .8) moving = true;
    /* the bead perches on the top edge of the Build blade (or the lifted one) and hops along; a small hop every
       6 s (squash .8 / 1.15), a double hop when clicked */
    const bu = bead.userData, to = lift >= 0 ? lift : 0;
    if (to !== bu.at) { bu.from.copy(bead.position); bu.at = to; bu.k = 0; }
    PER.set(to > 2 ? -.36 : .36, 3.02, .1).applyMatrix4(blades[to].matrix); /* the blade's upper corner, inside the frame */
    if (bu.k < 1) { bu.k = Math.min(1, bu.k + dt / .38); moving = true; }
    const kk = still ? 1 : bu.k * bu.k * (3 - 2 * bu.k);
    bead.position.lerpVectors(bu.from, PER, kk); bead.position.y += Math.sin(P * kk) * .45;
    if (!paused && Math.floor(t / 6) !== Math.floor((t - dt) / 6) && !hops) hops = 1;
    if (hops) { hop += dt / .52; moving = true; if (hop >= 1) { hop = 0; hops--; } }
    const air = hops && hop > .12 && hop < .82 ? (hop - .12) / .7 : -1, sq = hops && air < 0 ? .2 * Math.sin(P * (hop < .12 ? hop / .12 : (hop - .82) / .18)) : 0;
    bead.position.y += air >= 0 ? .34 * 4 * air * (1 - air) : 0; bead.scale.set(1 + .75 * sq, 1 - sq, 1 + .75 * sq);
    bead.visible = !still;
    awake = moving || !paused ? 1 : 0;
  }

  return {
    id: 'hero', scene, camera, exposure: 1.02, hotspots, update,
    get cursor() { return cursor; },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); measure(); },
    pointer(ev) { if (ev && ev.type === 'leave') { Pt.in = false; Pt.moved = true; } },
    needsFrame: () => !!awake || hov >= 0,
    setQuality() {},
    dispose() {
      ac.abort(); offs.forEach((f) => f && f());
      slot.style.removeProperty('--hx'); slot.style.removeProperty('--hy');
      hotspots.forEach((s) => s.el.classList.remove('is-on'));
      kit.dispose(scene);
    }
  };
}
