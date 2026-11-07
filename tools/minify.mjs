// Minify the readable sources in src/js/*.src.js into the shipped assets/js/*.js.
//   node tools/minify.mjs              -> every source
//   node tools/minify.mjs w-hero w-map -> only these
// Edit src/js/<name>.src.js, never the minified assets/js/<name>.js.
// Each file keeps the minifier it was built with, so a rebuild of unchanged code is byte-identical:
//   esbuild for the hero, build, deploy, grow and Cloud Lab modules; terser for the engine (stage, kit) and drone/map.
// Minifiers are looked up locally (no download). Override with ESBUILD=<.../esbuild/bin/esbuild> or TERSER=<.../terser/main.js>.
// If terser is missing, the file falls back to esbuild with a warning (same behaviour, a few hundred bytes larger).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/js');
const OUT = path.join(ROOT, 'assets/js');

const TERSER_ENGINE = { module: true, ecma: 2020, compress: { passes: 2, unsafe_arrows: true, ecma: 2020 }, mangle: true, format: { comments: false } };
const TERSER_WORLD = { module: true, compress: { passes: 2, pure_getters: true }, mangle: true, format: { comments: false, ascii_only: true, wrap_func_args: true } };
const FILES = {
  stage: ['terser', TERSER_ENGINE], kit: ['terser', TERSER_ENGINE],
  'w-hero': ['esbuild'], 'w-build': ['esbuild'], 'w-deploy': ['esbuild'], 'w-grow': ['esbuild'], cloudlab: ['esbuild'],
  'w-drone': ['terser', TERSER_WORLD], 'w-map': ['terser', TERSER_WORLD],
};

const first = (list) => list.filter(Boolean).find((p) => fs.existsSync(p));
const ESBUILD = first([
  process.env.ESBUILD,
  path.join(ROOT, 'node_modules/esbuild/bin/esbuild'),
  'C:/Users/adria/Desktop/ElevvaVisuals/arbolume/node_modules/esbuild/bin/esbuild',
]);
const TERSER = first([
  process.env.TERSER,
  path.join(ROOT, 'node_modules/terser/main.js'),
  'C:/Users/adria/AppData/Local/Temp/claude/ac7c6672e55b93b3/95da7411-5603-46dd-8674-8e687f86a1ea/scratchpad/b2tools/node_modules/terser/main.js',
]);
const terser = TERSER ? await import(pathToFileURL(TERSER).href) : null;

const want = process.argv.slice(2).map((a) => a.replace(/\.src\.js$|\.js$/, ''));
const names = want.length ? want : Object.keys(FILES);
let failed = 0;
for (const name of names) {
  const cfg = FILES[name];
  const src = path.join(SRC, name + '.src.js');
  if (!cfg || !fs.existsSync(src)) { console.error(`${name}: no source at src/js/${name}.src.js`); failed++; continue; }
  let tool = cfg[0];
  if (tool === 'terser' && !terser) { console.warn(`${name}: terser not found, using esbuild (set TERSER=<path to terser/main.js>)`); tool = 'esbuild'; }
  if (tool === 'esbuild' && !ESBUILD) { console.error(`${name}: esbuild not found (set ESBUILD=<path to esbuild/bin/esbuild>)`); failed++; continue; }
  let code;
  try {
    if (tool === 'terser') code = (await terser.minify(fs.readFileSync(src, 'utf8'), cfg[1])).code;
    else code = execFileSync(process.execPath, [ESBUILD, src, '--minify', '--format=esm', '--target=es2020', '--log-level=warning'], { encoding: 'utf8' });
  } catch (e) { console.error(`${name}: ${e.message.split('\n')[0]}`); failed++; continue; }
  const out = `/* min of src/js/${name}.src.js */\n` + code.trim() + '\n';
  fs.writeFileSync(path.join(OUT, name + '.js'), out);
  console.log(`${name}.js`.padEnd(14), String(Buffer.byteLength(out)).padStart(6), 'B ·', tool);
}
process.exit(failed ? 1 : 0);
