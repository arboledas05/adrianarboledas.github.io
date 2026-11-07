/* bugphone.js (B3): the Bugphone controls, the single source of truth for the bug state (2D wireframe twin and the
   3D Sprint Bench). Three aria-pressed toggles; class swaps + one WAAPI FLIP (rotate, 320 ms, transform only).
   Bus: emits bp:state {bug, on, order} on every change; bp:toggle {bug} runs the same handler (3D clicks). */
export function init(root, ctx) {
  const dev = root.querySelector('.bp-device'), cap = root.querySelector('.bp-caption');
  const btns = [...root.querySelectorAll('[data-bug]')];
  if (!dev || !cap || !btns.length) return { destroy() {} };
  const ac = new AbortController(), html = document.documentElement, bus = ctx.bus;
  const CAP = { rotate: 'cRotate', keyboard: 'cKeyboard', overflow: 'cOverflow' };
  const rm = () => !!(ctx.env && ctx.env.reduce) || html.classList.contains('rm');
  let order = [], tm = 0, dead = false;

  const say = () => {
    const k = order[order.length - 1];
    cap.textContent = ctx.t('bug.' + (k ? CAP[k] : 'idle'));
  };

  function set(k, on) {
    if (k === 'rotate') {
      dev.classList.toggle('is-rotate', on);
      // FLIP: the new box rotated by ±90° has the old silhouette, so animate that rotation back to none
      if (!rm() && dev.animate) dev.animate([{ transform: `rotate(${on ? 90 : -90}deg)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
    } else if (k === 'overflow') {
      clearTimeout(tm);
      dev.classList.remove('is-bug');
      if (on && !rm()) {
        // the bug for a beat (Flutter's overflow stripe + bracket), then the fix: it scrolls
        dev.classList.remove('is-overflow');
        dev.classList.add('is-bug');
        tm = setTimeout(() => { if (dead) return; dev.classList.remove('is-bug'); dev.classList.add('is-overflow'); }, 650);
      } else dev.classList.toggle('is-overflow', on);
    } else dev.classList.toggle('is-' + k, on);
  }

  function toggle(b) {
    const k = b.dataset.bug, on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    order = order.filter((x) => x !== k);
    if (on) order.push(k);
    set(k, on);
    say();
    if (bus) bus.emit('bp:state', { bug: k, on, order: order.slice() });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bug]');
    if (b && root.contains(b)) toggle(b);
  }, { signal: ac.signal });

  const offs = [];
  if (bus) {
    offs.push(bus.on('bp:toggle', (d) => { const b = d && btns.find((x) => x.dataset.bug === d.bug); if (b && !dead) toggle(b); }));
    offs.push(bus.on('aa:doc', (d) => { if (d && d.on) destroy(); }));
  }
  root.classList.add('is-live');

  function destroy() {
    if (dead) return;
    dead = true;
    ac.abort();
    clearTimeout(tm);
    offs.forEach((f) => f && f());
    if (dev.getAnimations) dev.getAnimations().forEach((a) => a.cancel());
  }
  return { destroy };
}
