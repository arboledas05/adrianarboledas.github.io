#!/usr/bin/env node
// tools/serve.mjs — zero-dependency static server for local preview and tooling.
//   node tools/serve.mjs [--port 4790] [--root <scratch copy of the repo>]
// Serves the repo at http://127.0.0.1:4790/ AND at http://127.0.0.1:4790/adrianarboledas.github.io/
// (the GitHub Pages project subpath), with correct MIME types and Cache-Control: no-store.
// Also importable: `const { url, close } = await serve({ port: 0 })` (port 0 = any free port).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/adrianarboledas.github.io';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
};
const NO_CACHE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' };

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...NO_CACHE, ...extra });
  res.end(body);
}

export function handler(root = ROOT, { quiet = false } = {}) {
  return (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'bad request'); }
    if (pathname === PREFIX) return send(res, 301, '', 'text/plain', { Location: PREFIX + '/' });
    if (pathname.startsWith(PREFIX + '/')) pathname = pathname.slice(PREFIX.length);
    if (pathname.split('/').some((seg) => seg === '.git' || seg === '..')) return send(res, 404, 'not found');
    let file = path.join(root, pathname);
    if (path.relative(root, file).startsWith('..')) return send(res, 403, 'forbidden');
    fs.stat(file, (e, st) => {
      if (!e && st.isDirectory()) {
        if (!pathname.endsWith('/')) return send(res, 301, '', 'text/plain', { Location: req.url.replace(/^([^?]*)/, '$1/') });
        file = path.join(file, 'index.html');
        try { st = fs.statSync(file); } catch { st = null; }
      }
      if (e || !st || !st.isFile()) {
        if (!quiet) console.log(`404 ${req.method} ${req.url}`);
        return send(res, 404, 'not found');
      }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', ...NO_CACHE });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  };
}

export function serve({ port = 4790, host = '127.0.0.1', root = ROOT, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler(root, { quiet }));
    server.on('error', reject);
    server.listen(port, host, () => {
      const p = server.address().port;
      resolve({ server, port: p, url: `http://${host}:${p}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const port = arg('--port') ? Number(arg('--port')) : 4790;
  // --root <dir>: serve a scratch copy of the repo (builders test their worlds without touching the real tree)
  const root = arg('--root') ? path.resolve(arg('--root')) : ROOT;
  serve({ port, root, quiet: false }).then(({ url }) => {
    console.log(`serving ${root}\n  ${url}\n  ${url}adrianarboledas.github.io/\n  (Ctrl+C to stop)`);
  }, (e) => { console.error(e.message); process.exit(1); });
}
