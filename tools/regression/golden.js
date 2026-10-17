#!/usr/bin/env node
/* tools/regression/golden.js — deterministic golden capture (spec §8.1 step 2, §8.3).
 *
 *   node tools/regression/golden.js --deck <html|folder|alias> [--size 1280x720|1920x1080] --out <dir>
 *   node tools/regression/golden.js --deck <html|folder|alias> --thumbs --out <dir>
 *   node tools/regression/golden.js --deck <html|folder|alias> --all --out <root>   → <root>/{1280,1920,thumbs}
 *   node tools/regression/golden.js <index.html> <outdir>                           (legacy form = --size 1280x720)
 *
 * Options
 *   --deck X        an .html file, a deck folder (→ X/index.html) or an alias:
 *                   archive (the talk deck, baseline only) | cinema | one-giant-leap | ogl
 *   --size WxH      1280x720 (default) or 1920x1080. Viewport at DPR 1, URL ?quality=1#1.0.
 *   --thumbs        capture the 480×270 thumbnail stills instead of frames (§8.3 step 6)
 *   --all           1280 frames + 1920 frames + thumbs into <out>/{1280,1920,thumbs}
 *   --out DIR       output directory (default tools/regression/out/capture). Existing *.png,
 *                   rng.json and meta.json in it are replaced. Never under _archive/.
 *   --no-extra      skip the extra paths (goTo 7.4, prev from 8.1, R on 10, Home from 6.0)
 *   --adapter JS    thumbs only: JS expression building the thumb stage from `cv`
 *                   (default: v2 `new PD.Stage(cv,{deck:PD.compile(id),thumb:true})` when PD.Stage
 *                   exists, else the archive global `new Stage(cv,{thumb:true})`)
 *   --write-baseline  required to write into tools/regression/baselines/ (archive deck only)
 *   --headed        show the browser
 *
 * Every capture directory gets rng.json: [{file, rng}] in capture order, where rng is the
 * cumulative Math.random call count (window.__rng) at that capture, and meta.json (provenance,
 * no timestamps, so two captures of the same deck are byte-identical directories).
 * Exit: 0 ok, 1 page errors during capture (frames are still written), 2 usage.
 *
 * Also a library for perf.js / stall.js / compare.js / tools/test/e2e.js (require('./golden.js')).
 */
'use strict';
const path = require('path'), fs = require('fs'), url = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const ARCHIVE = path.join(ROOT, '_archive');
const OLD_BASELINE = path.join(__dirname, 'baseline-one-giant-leap');
const BASELINES = path.join(__dirname, 'baselines');
const OUT_DEFAULT = path.join(__dirname, 'out');
const PROCEDURE = 'pixeldeck golden v2 (spec §8.3)';
const ALIASES = {
  archive: '_archive/2026-10-13-stage-ready/cinema/index.html',
  cinema: 'cinema/index.html',
  'one-giant-leap': 'decks/one-giant-leap/index.html',
  ogl: 'decks/one-giant-leap/index.html',
  pixel: 'legacy/pixel/index.html'
};
const SIZES = { '1280x720': [1280, 720], '1920x1080': [1920, 1080] };
const THUMB_W = 480, THUMB_H = 270;
const SEED = 1234567;

/* Seeded Math.random (mulberry32, seed 1234567) with a call counter. The generator body is the
 * one the historical 84-frame baseline was captured with; only the counter is new. */
const RNG_SCRIPT = `(() => {
  let s = ${SEED};
  Math.random = function () {
    window.__rng = (window.__rng | 0) + 1;
    s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
/* Only the harness advances time: no real-time animation frames at all. */
const RAF_STUB = `window.requestAnimationFrame = function () { return 0; };`;
const SEED_SCRIPT = RAF_STUB + '\n' + RNG_SCRIPT;

/* ------------------------------------------------------------------ shared helpers */
function die(msg, code) { console.error(path.basename(process.argv[1] || 'golden') + ': ' + msg); process.exit(code == null ? (module.exports.DIE_CODE || 2) : code); }

function parseArgs(argv, spec) {
  // spec: { flags: ['thumbs', ...], values: ['deck', ...], multi: ['spec'] }
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    let k = a.slice(2), v = null;
    const eq = k.indexOf('=');
    if (eq >= 0) { v = k.slice(eq + 1); k = k.slice(0, eq); }
    if (spec.flags && spec.flags.indexOf(k) >= 0) { out[k] = v == null ? true : v !== 'false'; continue; }
    if (spec.values && spec.values.indexOf(k) >= 0 || spec.multi && spec.multi.indexOf(k) >= 0) {
      if (v == null) { v = argv[++i]; if (v == null) die('--' + k + ' needs a value'); }
      if (spec.multi && spec.multi.indexOf(k) >= 0) (out[k] = out[k] || []).push(v); else out[k] = v;
      continue;
    }
    die('unknown option --' + k);
  }
  return out;
}

function resolveDeck(arg) {
  if (!arg) die('--deck is required');
  let p = ALIASES[arg] ? path.join(ROOT, ALIASES[arg]) : path.resolve(arg);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) die('deck not found: ' + p);
  return p;
}
function localStamp() {             // local wall-clock time with zone, e.g. "2026-10-13 21:07 America/Los_Angeles"
  const d = new Date(), z = n => String(n).padStart(2, '0');
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { }
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())} ${tz}`.trim();
}
function rel(p) { const r = path.relative(ROOT, p); return r.startsWith('..') ? p : r.split(path.sep).join('/'); }
function fileUrl(p, suffix) { return url.pathToFileURL(p).href + (suffix || ''); }

function realish(p) {               // realpath of the deepest existing ancestor + the rest
  let cur = path.resolve(p), rest = [];
  while (!fs.existsSync(cur)) { rest.unshift(path.basename(cur)); const up = path.dirname(cur); if (up === cur) break; cur = up; }
  return path.join(fs.realpathSync(cur), ...rest);
}
function inside(p, dir) {
  const norm = s => (process.platform === 'darwin' || process.platform === 'win32') ? s.toLowerCase() : s;
  const a = norm(realish(p)), b = norm(realish(dir));
  return a === b || a.startsWith(b + path.sep);
}
function isArchiveDeck(deck) { return inside(deck, ARCHIVE); }
/* P2: no tool writes under _archive/. The historical baseline is read-only. baselines/ needs an
 * explicit --write-baseline and an archive deck (the talk deck is only ever the baseline). */
function guardOut(target, opts) {
  opts = opts || {};
  const abs = path.resolve(target);
  if (inside(abs, ARCHIVE)) die('refusing to write under _archive/ (spec P2): ' + abs);
  if (inside(abs, OLD_BASELINE)) die('refusing to write into the historical baseline: ' + abs);
  if (inside(abs, BASELINES)) {
    if (!opts.writeBaseline) die('refusing to write into tools/regression/baselines/ without --write-baseline: ' + abs);
    if (opts.deck && !isArchiveDeck(opts.deck)) die('baselines are captured from the archive deck only, not ' + rel(opts.deck));
  }
  return abs;
}

function playwright() { return require(path.join(__dirname, '..', 'node_modules', 'playwright')); }
async function launch(opts) {
  opts = opts || {};
  const { chromium } = playwright();
  return chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'], headless: !opts.headed });
}

function writeJSON(file, value) {
  // one array entry per line keeps diffs of rng.json readable; output is deterministic
  let s;
  if (Array.isArray(value)) s = '[\n' + value.map(v => '  ' + JSON.stringify(v)).join(',\n') + '\n]\n';
  else s = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(file, s);
}

function prepareDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/\.png$/.test(f) || f === 'rng.json' || f === 'meta.json') fs.unlinkSync(path.join(dir, f));
}

function stateList(info) {
  const out = [];
  info.forEach((s, si) => { for (let st = 0; st <= (s.steps | 0); st++) out.push([si, st]); });
  return out;
}

/* §8.3 step 3: navigate, manual clock, deterministic warm-up. Returns the page-error list. */
async function openDeck(ctx, deck, opts) {
  const p = await ctx.newPage();
  const errs = [], cerrs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e)));
  p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
  await p.goto(fileUrl(deck, '?quality=1#1.0'));
  await p.waitForFunction(() => window.PixelDeck, null, { timeout: 30000 });
  await p.evaluate(() => PixelDeck.setManualClock(true));
  await p.waitForTimeout(300);
  let readyTicks = null;
  if (opts && opts.warm) {
    await p.evaluate(() => { for (let i = 0; i < 400; i++) PixelDeck.tick(0); });
    readyTicks = await p.evaluate(() => { let i = 0; for (; i < 2000 && PixelDeck.ready === false; i++) PixelDeck.tick(0); return { ticks: i, ready: PixelDeck.ready === undefined ? 'undefined (legacy deck: loop skipped)' : PixelDeck.ready }; });
  }
  return { p, errs, cerrs, readyTicks };
}

async function meta(browser, deck, extra) {
  let pw = '';
  try { pw = require(path.join(__dirname, '..', 'node_modules', 'playwright', 'package.json')).version; } catch (e) { }
  return Object.assign({ procedure: PROCEDURE, deck: rel(deck), browser: 'chromium ' + browser.version(), playwright: pw, seed: SEED }, extra);
}

/* ------------------------------------------------------------------ frames (§8.3 steps 1–5) */
async function captureFrames(browser, deck, size, outDir, opts) {
  opts = opts || {};
  const [w, h] = SIZES[size] || die('unknown --size ' + size + ' (use 1280x720 or 1920x1080)');
  prepareDir(outDir);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SEED_SCRIPT);
  const { p, errs, cerrs, readyTicks } = await openDeck(ctx, deck, { warm: true });

  const info = await p.evaluate(() => PixelDeck.info());
  const rng = [];
  let n = 0;
  const shot = async label => {
    const file = `${String(++n).padStart(3, '0')}_${label}.png`;
    await p.screenshot({ path: path.join(outDir, file) });
    rng.push({ file, rng: await p.evaluate(() => window.__rng | 0) });
  };
  // "advance a" = tick(1/30) until a − 1e-9
  const adv = a => p.evaluate(a => { for (let t = 0; t < a - 1e-9; t += 1 / 30) PixelDeck.tick(1 / 30); }, a);
  // while busy (≤ 600×) advance 0.2 s, then advance 0.5 s
  const settle = () => p.evaluate(() => {
    const adv = a => { for (let t = 0; t < a - 1e-9; t += 1 / 30) PixelDeck.tick(1 / 30); };
    for (let k = 0; k < 600 && PixelDeck.isBusy(); k++) adv(0.2);
    adv(0.5);
  });

  for (const [si, st] of stateList(info)) {
    if (si || st) await p.evaluate(() => PixelDeck.next());
    for (const t of [0.6, 1.5, 3.0]) {
      await adv(t === 0.6 ? 0.6 : t === 1.5 ? 0.9 : 1.5);
      await shot(`${si + 1}.${st}_t${t}`);
    }
    await settle();
    await shot(`${si + 1}.${st}_rest`);
  }

  // §8.1 extra paths, each followed by `rest`. Setup moves settle without a capture.
  const extras = [];
  const has = (si, st) => info[si] && (info[si].steps | 0) >= st;
  if (!opts.noExtra && has(6, 4) && has(7, 1) && has(9, 0) && has(5, 0)) {
    extras.push(['goto-7.4', async () => { await p.evaluate(() => PixelDeck.goTo(6, 4)); }]);
    extras.push(['prev-from-8.1', async () => { await p.evaluate(() => PixelDeck.goTo(7, 1)); await settle(); await p.evaluate(() => PixelDeck.prev()); }]);
    extras.push(['replay-10', async () => { await p.evaluate(() => PixelDeck.goTo(9, 0)); await settle(); await p.keyboard.press('r'); }]);
    extras.push(['home-from-6.0', async () => { await p.evaluate(() => PixelDeck.goTo(5, 0)); await settle(); await p.keyboard.press('Home'); }]);
  }
  for (const [label, run] of extras) {
    await run();
    await settle();
    await shot(`${label}_rest`);
  }
  const end = await p.evaluate(() => PixelDeck.state());
  writeJSON(path.join(outDir, 'rng.json'), rng);
  writeJSON(path.join(outDir, 'meta.json'), await meta(browser, deck, {
    kind: 'frames', size, url: '?quality=1#1.0', frames: n, states: stateList(info).length,
    extraPaths: extras.map(e => e[0]), warmup: { tick0: 400, ready: readyTicks }, endState: { slide: end.slide, step: end.step },
    pageErrors: errs, consoleErrors: cerrs
  }));
  await ctx.close();
  return { n, errs, cerrs };
}

/* ------------------------------------------------------------------ thumbs (§8.3 step 6) */
async function captureThumbs(browser, deck, outDir, opts) {
  opts = opts || {};
  prepareDir(outDir);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SEED_SCRIPT);
  const { p, errs, cerrs } = await openDeck(ctx, deck, { warm: false });
  const info = await p.evaluate(() => PixelDeck.info());
  const adapter = await p.evaluate(([src, w, h]) => {
    const cv = document.createElement('canvas');
    let st, kind;
    if (src) { st = (new Function('cv', 'return (' + src + ');'))(cv); kind = 'custom: ' + src; }
    else if (window.PD && PD.Stage && PD.compile) {
      const id = (window.PixelDeck && PixelDeck.deck && PixelDeck.deck().id) || PD.deck.list()[0];
      st = new PD.Stage(cv, { deck: PD.compile(id), thumb: true }); kind = "v2: new PD.Stage(cv, {deck: PD.compile('" + id + "'), thumb: true})";
    } else { st = new Stage(cv, { thumb: true }); kind = 'archive: new Stage(cv, {thumb: true})'; }
    st.resize(w, h, 1);
    window.__thumb = { st: st, cv: cv };
    return kind;
  }, [opts.adapter || null, THUMB_W, THUMB_H]);
  const rng = [];
  let n = 0;
  for (const [si, st] of stateList(info)) {
    const r = await p.evaluate(([si, st]) => { __thumb.st.still(si, st); return { url: __thumb.cv.toDataURL(), rng: window.__rng | 0 }; }, [si, st]);
    const file = `${String(++n).padStart(3, '0')}_${si + 1}.${st}.png`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(r.url.slice(r.url.indexOf(',') + 1), 'base64'));
    rng.push({ file, rng: r.rng });
  }
  writeJSON(path.join(outDir, 'rng.json'), rng);
  writeJSON(path.join(outDir, 'meta.json'), await meta(browser, deck, {
    kind: 'thumbs', size: THUMB_W + 'x' + THUMB_H, url: '?quality=1#1.0', frames: n, adapter, pageErrors: errs, consoleErrors: cerrs
  }));
  await ctx.close();
  return { n, errs, cerrs };
}

/* ------------------------------------------------------------------ CLI */
async function main() {
  const a = parseArgs(process.argv.slice(2), { flags: ['thumbs', 'all', 'no-extra', 'headed', 'write-baseline', 'help'], values: ['deck', 'size', 'out', 'adapter'] });
  if (a.help) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return 0; }
  if (!a.deck && a._.length === 2) { a.deck = a._[0]; a.out = a._[1]; }        // legacy: golden.js <index.html> <outdir>
  else if (a._.length) die('unexpected argument ' + a._[0] + ' (see --help)');
  const deck = resolveDeck(a.deck);
  const out = guardOut(a.out || path.join(OUT_DEFAULT, 'capture'), { writeBaseline: a['write-baseline'], deck });
  const jobs = a.all ? [['frames', '1280x720', path.join(out, '1280')], ['frames', '1920x1080', path.join(out, '1920')], ['thumbs', null, path.join(out, 'thumbs')]]
    : a.thumbs ? [['thumbs', null, out]] : [['frames', a.size || '1280x720', out]];
  if (!a.all && !a.thumbs && !SIZES[a.size || '1280x720']) die('unknown --size ' + a.size);
  const browser = await launch({ headed: a.headed });
  let bad = 0;
  try {
    for (const [kind, size, dir] of jobs) {
      const t0 = Date.now();
      const r = kind === 'thumbs' ? await captureThumbs(browser, deck, dir, { adapter: a.adapter }) : await captureFrames(browser, deck, size, dir, { noExtra: a['no-extra'] });
      console.log(`captured ${r.n} ${kind === 'thumbs' ? 'thumbs' : size + ' frames'} → ${dir} (${((Date.now() - t0) / 1000).toFixed(1)} s)` +
        (r.errs.length ? '  PAGE ERRORS: ' + r.errs.join(' | ') : '  no page errors') + (r.cerrs.length ? '  console errors: ' + r.cerrs.length : ''));
      if (r.errs.length) bad = 1;
    }
  } finally { await browser.close(); }
  return bad;
}

module.exports = { ROOT, ARCHIVE, BASELINES, OUT_DEFAULT, ALIASES, SIZES, SEED, SEED_SCRIPT, RNG_SCRIPT, RAF_STUB,
  parseArgs, resolveDeck, rel, fileUrl, localStamp, guardOut, isArchiveDeck, inside, launch, playwright, writeJSON, stateList, die,
  captureFrames, captureThumbs };

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
