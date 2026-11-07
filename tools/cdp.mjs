// tools/cdp.mjs (B3; first written by B4): headless Chrome/Edge over the DevTools protocol, zero dependencies (Node ≥22: global WebSocket).
//
//   import * as cdp from './cdp.mjs';
//   const page = await cdp.open('http://127.0.0.1:4790/en.html', { width: 1000, height: 1000, dpr: 1 });
//   await page.evaluate('document.title');
//   const png = await page.screenshot({ format: 'png', transparent: true });   // Buffer
//   const pdf = await page.printPDF();                                         // Buffer
//   await cdp.close();
//
// Module-level screenshot/evaluate/printPDF act on the last opened page. Options for open():
//   width, height, dpr, mobile (emulate a touch phone), headless (default true), cpu (CPU throttle rate), media ({name,value}[]),
//   init (a script evaluated in every new document before the page's own scripts, e.g. to make stills deterministic),
//   nojs (INT: disable JavaScript for the page, for the no-JS QA pass)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);

export function findBrowser(prefer) {
  const list = prefer === 'edge' ? CANDIDATES.filter(p => /msedge/i.test(p)).concat(CANDIDATES) : CANDIDATES;
  return list.find(p => existsSync(p)) || null;
}

let browser = null;   // { proc, ws, dir, seq, pending, handlers }
let current = null;   // last page

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => res(ws), { once: true });
    ws.addEventListener('error', e => rej(new Error('CDP websocket error: ' + (e.message || url))), { once: true });
  });
}

/** Launch the browser (called by open() when needed). */
export async function launch({ headless = true, prefer } = {}) {
  if (browser) return browser;
  const exe = findBrowser(prefer);
  if (!exe) throw new Error('cdp.mjs: Chrome or Edge not found. Install Chrome (C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe) or set CHROME_PATH. Fallback: capture the stills manually in DevTools (Capture node screenshot) at the same sizes.');
  const dir = mkdtempSync(join(tmpdir(), 'aa-cdp-'));
  const args = [
    '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync', '--mute-audio', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb', 'about:blank'
  ];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const to = setTimeout(() => rej(new Error('cdp.mjs: browser did not start (no DevTools URL after 20 s): ' + exe)), 20000);
    proc.stderr.on('data', d => {
      buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(to); res(m[1]); }
    });
    proc.on('exit', c => { clearTimeout(to); rej(new Error('cdp.mjs: browser exited early (' + c + ')')); });
  });
  const ws = await connect(wsUrl);
  const b = browser = { proc, ws, dir, exe, seq: 0, pending: new Map(), handlers: new Set() };
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (msg.id && b.pending.has(msg.id)) {
      const { res, rej } = b.pending.get(msg.id); b.pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message + (msg.error.data ? ' ' + msg.error.data : ''))) : res(msg.result);
    } else if (msg.method) b.handlers.forEach(h => h(msg));
  });
  return browser;
}

function send(method, params = {}, sessionId) {
  if (!browser) throw new Error('cdp.mjs: not launched');
  const id = ++browser.seq;
  const p = new Promise((res, rej) => browser.pending.set(id, { res, rej }));
  browser.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  return p;
}

function waitEvent(sessionId, method, timeout = 30000) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => { browser.handlers.delete(h); rej(new Error('timeout waiting for ' + method)); }, timeout);
    const h = m => { if (m.method === method && m.sessionId === sessionId) { clearTimeout(to); browser.handlers.delete(h); res(m.params); } };
    browser.handlers.add(h);
  });
}

/** Open a new tab at url. Returns a page object (also stored as the current page). */
export async function open(url, { width = 1280, height = 800, dpr = 1, mobile = false, headless = true, prefer, cpu, media, init, nojs = false, timeout = 45000 } = {}) {
  await launch({ headless, prefer });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const logs = [];
  browser.handlers.add(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled') logs.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
    if (m.method === 'Runtime.exceptionThrown') logs.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
  });
  await s('Page.enable'); await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile, screenWidth: width, screenHeight: height });
  if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu) await s('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (media) await s('Emulation.setEmulatedMedia', { features: media });
  if (init) await s('Page.addScriptToEvaluateOnNewDocument', { source: init });
  if (nojs) await s('Emulation.setScriptExecutionDisabled', { value: true });
  const loaded = waitEvent(sessionId, 'Page.loadEventFired', timeout);
  await s('Page.navigate', { url });
  await loaded;
  const page = {
    targetId, sessionId, logs, send: s,
    async evaluate(expr) {
      const r = await s('Runtime.evaluate', { expression: typeof expr === 'function' ? '(' + expr + ')()' : expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expr, ms = 30000, every = 100) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await page.evaluate(expr)) return true; await new Promise(r => setTimeout(r, every)); }
      throw new Error('waitFor timed out: ' + expr);
    },
    async screenshot({ clip, format = 'png', quality, transparent = false } = {}) {
      if (transparent) await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      const p = { format, captureBeyondViewport: false, fromSurface: true };
      if (quality != null && format !== 'png') p.quality = Math.round(quality <= 1 ? quality * 100 : quality);
      if (clip) p.clip = Object.assign({ scale: 1 }, clip);
      const { data } = await s('Page.captureScreenshot', p);
      return Buffer.from(data, 'base64');
    },
    async printPDF(opts = {}) {
      const { data } = await s('Page.printToPDF', Object.assign({ printBackground: true, preferCSSPageSize: true }, opts));
      return Buffer.from(data, 'base64');
    },
    async close() { try { await send('Target.closeTarget', { targetId }); } catch (e) {} if (current === page) current = null; }
  };
  current = page;
  return page;
}

const cur = () => { if (!current) throw new Error('cdp.mjs: no open page'); return current; };
export const evaluate = expr => cur().evaluate(expr);
export const screenshot = opts => cur().screenshot(opts);
export const printPDF = opts => cur().printPDF(opts);
export const waitFor = (expr, ms) => cur().waitFor(expr, ms);

/** Close the browser and remove its temporary profile. */
export async function close() {
  if (!browser) return;
  const b = browser; browser = null; current = null;
  try { await new Promise(r => { b.ws.addEventListener('close', r, { once: true }); b.ws.send(JSON.stringify({ id: ++b.seq, method: 'Browser.close' })); setTimeout(r, 3000); }); } catch (e) {}
  try { b.proc.kill(); } catch (e) {}
  await new Promise(r => setTimeout(r, 300));
  try { rmSync(b.dir, { recursive: true, force: true }); } catch (e) {}
}
