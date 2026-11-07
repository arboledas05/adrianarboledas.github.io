# Adrián Arboledas — interactive web CV

Trilingual (ES / CA / EN) static CV: https://arboledas05.github.io/adrianarboledas.github.io/ (English: `/en.html`, Català: `/ca.html`). One-page PDF CVs are in `cv/`.

## What it is
- Plain HTML, CSS and JavaScript, no framework. three.js is loaded from a CDN.
- Six procedural three.js "clay" worlds that share **one** WebGL context, with static 2D fallbacks (no JavaScript, three.js unavailable, reduced motion).
- A document view (`?doc`) and a print stylesheet for a plain, printable CV.
- The 3D scenes are illustrations, not client material.

## How it is built
```
src/page.html + src/partials/*.html + src/css/*.css + content/{es,ca,en}/*.json
  └─ node tools/build.mjs --release  →  index.html (ES), ca.html, en.html, assets/css/app.css
```
- Readable sources of the minified modules are in `src/js/*.src.js`; `node tools/minify.mjs [name]` writes `assets/js/*.js`.
- Built pages and minified files are never edited by hand.

## Quality gates
- `tools/audit.mjs` runs with the build: size budgets for the CSS, own JavaScript and each page, plus content rules (every number on a page must be listed in `content/facts-whitelist.json`; private data is blocked). A release build must end with 0 errors and 0 warnings.
- `node tools/qa.mjs --out <dir>` drives headless Chrome or Edge over the DevTools Protocol for each language and viewport: screenshots of every world, console errors, horizontal overflow, at most one WebGL context, frame times, and reduced-motion, no-JS, document-view, print-to-PDF, no-CDN and in-page-jump passes.

## Run locally
```
node tools/serve.mjs        # http://127.0.0.1:4790/adrianarboledas.github.io/
```
Requires Node.js 22 or later (Chrome or Edge for the QA script).
