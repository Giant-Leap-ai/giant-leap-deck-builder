/* tools/test/e2e/wp2-export.e2e.js — standalone export and the starter deck on real pages (WP2, spec §3.6, §9 WP2 acceptance).
 *   node tools/test/e2e.js wp2-export
 * Covers: the CLI (#1, #6), the file itself (#2), the golden gate on it (#1), notes from the exported file (#4), the round
 * trip through a real browser parse (#3), the self-test on good and broken decks (#5), the starter deck (#7).
 * Scratch pages live in ctx.tmp (outside ROOT) and load the engine from ROOT by file:// URL. The only thing written inside
 * ROOT is decks/one-giant-leap/export/one-giant-leap.html (generated, git-ignored), by the first test. */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process'), url = require('url');

const OGL_PAGE = 'decks/one-giant-leap/index.html';
const OGL_EXPORT = 'decks/one-giant-leap/export/one-giant-leap.html';
const CLOSE = '<' + '/script>';
const HOSTILE = '</script><!-- */ * &';

/* ------------------------------------------------------------------ helpers */
function cli(ctx, args) {
  return cp.spawnSync(process.execPath, [ctx.path('tools', 'export.js'), ...args], { cwd: ctx.root, encoding: 'utf8', timeout: 110000 });
}
function watch(page) {
  const w = { requests: [], consoleErrors: [], pageErrors: [] };
  page.on('request', r => w.requests.push(r.url()));
  page.on('console', m => { if (m.type() === 'error') w.consoleErrors.push(m.text() + ' @ ' + (m.location().url || '')); });
  page.on('pageerror', e => w.pageErrors.push(String(e && e.stack || e)));
  return w;
}
// AMEND-8: an absent OPTIONAL engine file logs one ERR_FILE_NOT_FOUND on pages that autoload the manifest
const notMissingOptional = e => !(/ERR_FILE_NOT_FOUND/.test(e) && /\/engine\/[^ ]+\.js$/.test(e));
const fileUrl = p => url.pathToFileURL(p).href;
const shot = (ctx, name) => path.join(process.env.PD_SHOTS || ctx.tmp, name);      // PD_SHOTS keeps the screenshots for a look (ctx.tmp is deleted)
const ready = (p, ms) => p.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: ms || 30000 });

function crc(buf) { return zlib.crc32 ? zlib.crc32(buf) : (() => { let c, t = [], n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } let x = 0xffffffff; for (let i = 0; i < buf.length; i++) x = t[(x ^ buf[i]) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; })(); }
function png(w, h, rgba) {          // a valid w×h RGBA PNG
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Buffer.from(rgba).copy(raw, y * (w * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// What the release step does to the kernel (spec §3.2): every optional MANIFEST flag becomes 1. Only the MANIFEST literal is touched.
function flipFlags(html) {
  const at = html.indexOf('PD.MANIFEST = ['), end = html.indexOf('];', at);
  if (at < 0 || end < 0) throw new Error('the exported kernel has no MANIFEST literal');
  const head = html.slice(0, at), lit = html.slice(at, end), tail = html.slice(end);
  return { html: head + lit.replace(/(\['[^']+',\s*)0(\s*\])/g, '$11$2') + tail, flipped: (lit.match(/(\['[^']+',\s*)0(\s*\])/g) || []).length };
}

/* The object deck of the round trip: hostile text wherever a Studio user can type, a theme chain
 * (object root + factory child), an image asset that really decodes. */
function objectDeck() {
  return {
    format: 2, id: 'wp2-e2e',
    meta: { title: 'Round </script> & trip \u{1F680}', theme: 'wp2-child', generator: 'studio@2.0.0', updated: '2026-10-14T00:00:00.000Z',
      story: { framework: 'blank', goal: null, audience: HOSTILE, targetMin: null, bigIdea: 'a & b', shortIdea: '', oldWay: '', newWay: '', ask: '', proof: [], brand: '\u{1F680}', tagline: '', tone: null } },
    scenes: [
      { id: 'a', text: [{ str: 'Hello ' + HOSTILE + ' \u{1F680}', style: 'statement', y: 540 }], notes: HOSTILE + ' \u{1F680} line sep end',
        steps: [{ text: [{ str: 'two *\/ <!-- &', style: 'kicker', y: 300 }], notes: '-->' + CLOSE }] },
      { id: 'b', text: [{ str: 'b', style: 'hero', y: 540, glowAlpha: 0.35 }], notes: '', dwell: 4.5, lint: { ignore: ['copy.notes'] } }
    ]
  };
}
function objectAssets() {
  return { pic: { type: 'image', src: 'data:image/png;base64,' + png(4, 3, [255, 128, 0, 255]).toString('base64'), w: 4, h: 3, name: 'p<q>&r.png', bytes: 100 } };
}

/* A scratch deck page (like a deck folder's index.html): the engine and cosmos from ROOT, then registrations.
 * fac.js is a separate file so a factory deck can hold a literal script end and comment opener in its source. */
function scratch(ctx, name) {
  const dir = path.join(ctx.tmp, name || 'scratch');
  fs.mkdirSync(dir, { recursive: true });
  const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
  fs.writeFileSync(path.join(dir, 'fac.js'),
    "PD.deck('wp2-fac', function (PD, h) {\n" +
    "  var note = '" + HOSTILE + " \u{1F680}', tpl = `a " + '<' + "/Script> b <!-- c`, re = /<\\/script>/i; // " + '<' + "/script><!-- */\n" +
    "  return { format: 2, id: 'wp2-fac', meta: { title: 'Factory " + '<' + "/script> deck <!--', theme: 'wp2-child' },\n" +
    "    scenes: [ { id: 'one', text: [{ str: 'Factory deck', style: 'hero', y: 540 }], notes: note + tpl + re.source } ] };\n" +
    "});\n");
  fs.writeFileSync(path.join(dir, 'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>wp2 scratch</title></head><body>\n' +
    `<script src="${ctx.url('engine/pixeldeck.js')}">${CLOSE}\n` +
    `<script src="${ctx.url('themes/cosmos/theme.js')}">${CLOSE}\n` +
    '<script>\n' +
    "var WP2_OUTSIDE = [{ x: 960, y: 540, color: '#ffffff', s: 8 }], WP2_TOP = 'only this page has me';\n" +
    "var dec = function (b) { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); }))); };\n" +
    "var base = JSON.parse(JSON.stringify(PD.theme.resolve('cosmos')));\n" +
    "delete base.id; delete base.chain; delete base.key; base.label = 'wp2 base'; base.worlds = ['cosmos', 'planet', 'spark'];\n" +
    "PD.theme('wp2-base', base);\n" +
    "PD.theme('wp2-child', function (PD) { return { 'extends': 'wp2-base', label: 'wp2 child', ui: { accent: '#7ee787' } }; });\n" +
    "PD.deck('wp2-e2e', dec('" + b64(objectDeck()) + "'));\n" +
    "PD.assets('wp2-e2e', dec('" + b64(objectAssets()) + "'));\n" +
    "PD.assets('wp2-fac', {});\n" +
    // a factory that only works on THIS page: the points function reads a variable the exported file does not have
    "PD.deck('wp2-bad-lazy', function (PD, h) { return { format: 2, id: 'wp2-bad-lazy', meta: { title: 'Lazy', theme: 'wp2-child' }, scenes: [\n" +
    "  { id: 'fine', text: [{ str: 'fine', style: 'statement', y: 540 }] },\n" +
    "  { id: 'broken', particles: [{ shape: 'points', points: function () { return WP2_OUTSIDE; } }] } ] }; });\n" +
    "PD.assets('wp2-bad-lazy', {});\n" +
    // a factory that reads such a variable while it builds the deck: the exported deck cannot even compile
    "PD.deck('wp2-bad-eager', function (PD, h) { return { format: 2, id: 'wp2-bad-eager', meta: { title: WP2_TOP, theme: 'wp2-child' }, scenes: [\n" +
    "  { id: 'one', text: [{ str: WP2_TOP, style: 'statement', y: 540 }] } ] }; });\n" +
    "PD.assets('wp2-bad-eager', {});\n" +
    // sources the exporter must refuse
    "PD.deck('wp2-mark', function (PD, h) { var m = '/*PD:DECK-JSON:BEGIN'; return { format: 2, id: 'wp2-mark', meta: { title: m, theme: 'wp2-child' }, scenes: [{ id: 'one', text: [{ str: m, style: 'statement', y: 540 }] }] }; });\n" +
    "PD.assets('wp2-mark', {});\n" +
    "PD.deck('wp2-bound', (function (PD, h) { return { format: 2, id: 'wp2-bound', meta: { title: 'Bound', theme: 'wp2-child' }, scenes: [{ id: 'one', text: [{ str: 'x', style: 'statement', y: 540 }] }] }; }).bind(null));\n" +
    "PD.assets('wp2-bound', {});\n" +
    `${CLOSE}\n` +
    '<script src="fac.js">' + CLOSE + '\n' +
    '</body></html>\n');
  return { dir, page: path.join(dir, 'index.html'), url: fileUrl(path.join(dir, 'index.html')) };
}

/* ------------------------------------------------------------------ tests */
module.exports = {
  'CLI (acceptance #1, #2): node tools/export.js decks/one-giant-leap writes decks/one-giant-leap/export/one-giant-leap.html; under 400 KB; no src/href/fetch; plays from file:// with no network': async (page, ctx) => {
    const A = ctx.assert;
    const r = cli(ctx, ['decks/one-giant-leap']);
    A.equal(r.status, 0, 'exit ' + r.status + '\n' + r.stdout + r.stderr);
    A.ok(/^wrote decks\/one-giant-leap\/export\/one-giant-leap\.html \(\d+ bytes, deck "one-giant-leap"\)$/m.test(r.stdout), r.stdout);
    const file = ctx.path(OGL_EXPORT), html = fs.readFileSync(file, 'utf8');
    ctx.log('exported OGL: ' + Buffer.byteLength(html) + ' bytes');
    A.ok(Buffer.byteLength(html) < 400 * 1024, 'under 400 KB');
    A.ok(html.indexOf('fetch(') < 0, 'no fetch(');
    A.ok(!/\b(src|href)\s*=/i.test(html.replace(/<script>[\s\S]*?<\/script>/g, '')), 'no src= or href= outside the script bodies');
    const w = watch(page);
    await page.goto(fileUrl(file) + '#1.0');
    await ready(page);
    const info = await page.evaluate(() => ({
      attrs: document.querySelectorAll('[src],[href]').length, canvases: document.querySelectorAll('canvas').length, first: document.querySelector('canvas').id,
      missing: PD.missing(), deck: PixelDeck.deck().id, scenes: PixelDeck.info().length, base: PD.base, title: document.title,
      decks: PD.deck.list(), themes: PD.theme.list()
    }));
    A.deepEqual(info, { attrs: 0, canvases: 1, first: 'stage', missing: [], deck: 'one-giant-leap', scenes: 10, base: '', title: 'One Giant Leap', decks: ['one-giant-leap'], themes: ['one-giant-leap'] },
      'one canvas, the one deck, only its own theme, no loader (PD.base is empty)');
    A.equal(w.requests.length, 1, 'exactly one request, for the file itself: ' + w.requests.join(', '));
    A.ok(w.requests[0].startsWith(fileUrl(file)), w.requests[0]);
    A.deepEqual(w.consoleErrors, [], 'zero console errors (an exported file loads no optional engine file)');
    A.deepEqual(w.pageErrors, []);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot(ctx, 'ogl-export-1.0.png') });
  },

  'CLI and in-page PD.exportHTML give byte-identical output (acceptance #6); the CLI is deterministic': async (page, ctx) => {
    const A = ctx.assert;
    const out1 = path.join(ctx.tmp, 'a.html'), out2 = path.join(ctx.tmp, 'b.html');
    A.equal(cli(ctx, ['decks/one-giant-leap', '--out', out1]).status, 0);
    A.equal(cli(ctx, ['one-giant-leap', '--out', out2]).status, 0, 'the alias works too');
    const w = watch(page);
    await page.goto(ctx.url(OGL_PAGE, '?export'));
    const html = await page.evaluate(() => PD.exportHTML('one-giant-leap'));
    const a = fs.readFileSync(out1), b = fs.readFileSync(out2);
    A.ok(a.equals(b), 'two CLI runs are byte-identical');
    A.ok(a.equals(Buffer.from(html, 'utf8')), 'the CLI file equals the in-page PD.exportHTML bytes (' + a.length + ')');
    A.equal(await page.evaluate(() => document.querySelectorAll('canvas').length), 0, '?export registers everything and boots nothing');
    A.deepEqual(w.pageErrors, []);
  },

  'golden gate (acceptance #1): the exported OGL file is EXACT against the archive baseline — 1280 frames and thumbs': async (page, ctx) => {
    const A = ctx.assert;
    const G = require(ctx.path('tools', 'regression', 'golden.js'));
    const exp = path.join(ctx.tmp, 'gate.html');
    A.equal(cli(ctx, ['decks/one-giant-leap', '--out', exp]).status, 0);
    const cand = path.join(ctx.tmp, 'cand');
    const r = await G.captureFrames(ctx.browser, exp, '1280x720', path.join(cand, '1280'));
    const t = await G.captureThumbs(ctx.browser, exp, path.join(cand, 'thumbs'));
    A.deepEqual([r.errs, t.errs], [[], []], 'no page errors while capturing');
    const c = cp.spawnSync(process.execPath, [ctx.path('tools', 'regression', 'compare.js'), ctx.path('tools', 'regression', 'baselines', 'ogl'), cand, '--only', '1280,thumbs'], { encoding: 'utf8' });
    ctx.log(c.stdout.trim().split('\n').join(' | '));
    A.equal(c.status, 0, c.stdout + c.stderr);
    A.ok(/EXACT OK\s+1280: 88\/88/.test(c.stdout) && /EXACT OK\s+thumbs: 21\/21/.test(c.stdout), 'all 88 frames and 21 thumbs identical, RNG equal');
  },

  'RELEASE FLIP (spec §3.2): with every MANIFEST flag set to 1 the exported OGL file still starts (zero console errors); a module genuinely missing from it is still named on screen': async (page, ctx) => {
    const A = ctx.assert;
    const exp = path.join(ctx.tmp, 'flip-src.html');
    A.equal(cli(ctx, ['decks/one-giant-leap', '--out', exp]).status, 0);
    const src = fs.readFileSync(exp, 'utf8');
    const f = flipFlags(src);
    A.ok(f.flipped >= 1, 'the flip changed ' + f.flipped + ' optional flags in the file\'s kernel');
    const file = path.join(ctx.tmp, 'flip.html');
    fs.writeFileSync(file, f.html, 'utf8');
    const w = watch(page);
    await page.goto(fileUrl(file) + '#1.0');
    await ready(page);
    const info = await page.evaluate(() => ({
      optional: PD.MANIFEST.filter(m => !m[1]).length, notCarried: PD.MANIFEST.filter(m => !PD.has(m[0])).map(m => m[0]), missing: PD.missing(), canvases: document.querySelectorAll('canvas').length,
      fail: !!document.querySelector('[data-pd-fail]'), deck: PixelDeck.deck().id
    }));
    A.equal(info.optional, 0, 'every flag in the file\'s manifest is 1');
    A.deepEqual([info.missing, info.canvases, info.fail, info.deck], [[], 1, false, 'one-giant-leap'], 'nothing is missing; the stage booted');
    A.deepEqual(info.notCarried, [], 'every entry left in the file\'s manifest is a module the file carries (the by-design ones were trimmed)');
    A.deepEqual(w.consoleErrors, [], 'zero console errors');
    A.deepEqual(w.pageErrors, []);
    A.equal(w.requests.length, 1, 'no network');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: shot(ctx, 'ogl-flipped.png') });

    // the trim removes only by-design entries: cut worlds/photo (nothing depends on it) out of the flipped file
    const at = f.html.indexOf('<script>PD.module("worlds/photo"'), end = f.html.indexOf('\n', at);
    A.ok(at > 0 && end > at, 'worlds/photo is a script of its own in the file');
    const cut = path.join(ctx.tmp, 'flip-cut.html');
    fs.writeFileSync(cut, f.html.slice(0, at) + f.html.slice(end + 1), 'utf8');
    const p2 = await ctx.newPage(), w2 = watch(p2);
    await p2.goto(fileUrl(cut));
    await p2.waitForSelector('[data-pd-fail]', { timeout: 10000 });
    const bad = await p2.evaluate(() => ({ missing: PD.missing(), text: document.querySelector('[data-pd-fail]').textContent, boot: typeof window.PixelDeck, canvases: document.querySelectorAll('canvas').length }));
    A.deepEqual(bad.missing, ['worlds/photo'], 'PD.missing() names the genuinely absent module and nothing else');
    A.equal(bad.text, 'pixeldeck: missing engine files: worlds/photo');
    A.deepEqual([bad.boot, bad.canvases], ['undefined', 0], 'and the deck did not boot');
    A.deepEqual(w2.pageErrors, []);
  },

  'N in the exported file (acceptance #4) opens the same file with ?notes as a separate page with no opener; Next and Prev from it drive the stage': async (page, ctx) => {
    const A = ctx.assert;
    const exp = path.join(ctx.tmp, 'notes.html');
    A.equal(cli(ctx, ['decks/one-giant-leap', '--out', exp]).status, 0);
    const w = watch(page);
    await page.goto(fileUrl(exp) + '#1.0');
    await ready(page);
    const [notes] = await Promise.all([ctx.context.waitForEvent('page', { timeout: 15000 }), page.keyboard.press('n')]);
    const nw = watch(notes);
    await notes.waitForLoadState('load');
    A.equal(notes.url(), fileUrl(exp) + '?notes', 'opens the same file with ?notes');
    A.equal(await notes.evaluate(() => window.opener), null, 'noopener: its own process');
    A.equal(ctx.context.pages().length, 2);
    await notes.waitForFunction(() => document.getElementById('link') && document.getElementById('link').className === 'on', null, { timeout: 15000 });
    A.ok(/^1 \/ 10/.test(await notes.evaluate(() => document.getElementById('pos').innerText)), 'the presenter window shows the stage position');
    const at = () => page.evaluate(() => { const s = PixelDeck.state(); return s.slide + '.' + s.step; });
    await notes.click('#bNext');
    await page.waitForFunction(() => location.hash === '#2.0', null, { timeout: 5000 });
    await notes.keyboard.press('ArrowRight');
    await page.waitForFunction(() => location.hash === '#3.0', null, { timeout: 5000 });
    A.equal(await at(), '2.0');
    await notes.click('#bPrev');
    await page.waitForFunction(() => location.hash === '#2.0', null, { timeout: 5000 });
    await notes.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => location.hash === '#1.0', null, { timeout: 5000 });
    A.equal(await at(), '0.0');
    A.equal(await notes.evaluate(() => document.title), 'One Giant Leap — presenter');
    A.deepEqual([w.consoleErrors, w.pageErrors, nw.consoleErrors, nw.pageErrors], [[], [], [], []], 'no errors on either page');
  },

  'ROUND TRIP in a real browser (acceptance #3): hostile object deck + theme chain + image asset export, open from file:// and play; parse gives the same deck and assets': async (page, ctx) => {
    const A = ctx.assert;
    const s = scratch(ctx);
    await page.goto(s.url + '?export');
    const out = await page.evaluate(() => ({
      html: PD.exportHTML('wp2-e2e'),
      parsed: PD.exportHTML.parse(PD.exportHTML('wp2-e2e')),
      key: PD.theme.resolve('wp2-child').key, chain: PD.theme.resolve('wp2-child').chain,
      deck: PD.deck.get('wp2-e2e'), assets: PD.assets.get('wp2-e2e')
    }));
    A.deepEqual(out.parsed.deck, objectDeck(), 'parse → the deck, deepEqual to what was written (hostile text and emoji included)');
    A.deepEqual(out.parsed.assets, objectAssets(), 'parse → the assets');
    A.deepEqual(out.parsed.deck, out.deck, 'and to what the page held');
    A.deepEqual(out.chain, ['wp2-base', 'wp2-child']);
    const themeAt = id => out.html.indexOf('<script>PD.theme("' + id + '"');
    A.ok(themeAt('wp2-base') > 0 && themeAt('wp2-base') < themeAt('wp2-child'), 'the theme chain is written root first');
    A.ok(/<script>PD\.theme\("wp2-base",\{/.test(out.html) && /<script>PD\.theme\("wp2-child",function \(PD\)/.test(out.html), 'object theme as JSON, factory theme as its source');
    A.equal((out.html.match(/<\/script/gi) || []).length, (out.html.match(/<script>/g) || []).length, 'the hostile text ended no script');

    const file = path.join(ctx.tmp, 'wp2-e2e.html');
    fs.writeFileSync(file, out.html, 'utf8');
    const p2 = await ctx.newPage();
    const w = watch(p2);
    await p2.goto(fileUrl(file) + '#1.0');
    await ready(p2);
    const live = await p2.evaluate(() => ({
      deck: PD.deck.get('wp2-e2e'), assets: PD.assets.get('wp2-e2e'), key: PD.theme.resolve('wp2-child').key, chain: PD.theme.resolve('wp2-child').chain,
      info: PixelDeck.info(), meta: PixelDeck.deck(), pic: (a => a && { ok: a.ok, w: a.img && a.img.naturalWidth, h: a.img && a.img.naturalHeight })(PD.asset('wp2-e2e', 'pic')),
      title: document.title, canvas: document.querySelectorAll('canvas').length
    }));
    A.deepEqual(live.deck, objectDeck(), 'the exported page runs the same DeckSource');
    A.deepEqual(live.assets, objectAssets());
    A.equal(live.key, out.key, 'the theme resolves to the same key there (same values, same order)');
    A.deepEqual(live.chain, ['wp2-base', 'wp2-child']);
    A.deepEqual(live.info.map(i => [i.id, i.steps]), [['a', 1], ['b', 0]], 'two scenes, the first with a step');
    A.equal(live.info[1].dwell, 4.5, 'the dwell of scene b');
    A.deepEqual(live.pic, { ok: true, w: 4, h: 3 }, 'the embedded image decoded');
    A.equal(live.title, 'Round </script> & trip \u{1F680}', 'the title round-trips through HTML escaping');
    A.equal(live.canvas, 1);
    A.deepEqual(w.consoleErrors, []); A.deepEqual(w.pageErrors, []);
    A.equal(w.requests.length, 1, 'no network');
    await p2.waitForTimeout(2500);
    await p2.screenshot({ path: shot(ctx, 'round-trip-1.0.png') });
    await p2.keyboard.press('ArrowRight');
    await p2.waitForTimeout(2500);
    await p2.screenshot({ path: shot(ctx, 'round-trip-1.1.png') });
  },

  'factory deck: its source is re-emitted with the script-end and comment-opener broken, and means the same; it parses as handWritten': async (page, ctx) => {
    const A = ctx.assert;
    const s = scratch(ctx, 'fac');
    await page.goto(s.url + '?export');
    const html = await page.evaluate(() => PD.exportHTML('wp2-fac'));
    A.ok(html.indexOf('DECK-JSON') < 0, 'no deck markers for a factory deck');
    A.ok(html.indexOf('PD.deck("wp2-fac",function (PD, h) {') > 0, 'the factory source');
    A.equal((html.match(/<\/script/gi) || []).length, (html.match(/<script>/g) || []).length, 'no stray script end');
    A.ok(html.indexOf('<\\/script') > 0 && html.indexOf('<\\!--') > 0, 'the safety net rewrote them: ' + html.slice(html.indexOf('PD.deck("wp2-fac"'), html.indexOf('PD.deck("wp2-fac"') + 40));
    const parsed = await page.evaluate(h => PD.exportHTML.parse(h), html);
    A.deepEqual([parsed.handWritten, parsed.deck, parsed.id, parsed.title], [true, null, 'wp2-fac', 'Factory </script> deck <!--']);
    const file = path.join(ctx.tmp, 'fac.html');
    fs.writeFileSync(file, html, 'utf8');
    const p2 = await ctx.newPage(), w = watch(p2);
    await p2.goto(fileUrl(file));
    await ready(p2);
    const got = await p2.evaluate(() => ({ notes: PD.compile('wp2-fac').scenes[0].notes, title: PD.compile('wp2-fac').meta.title, doc: document.title }));
    A.equal(got.notes, HOSTILE + ' \u{1F680}' + 'a </Script> b <!-- c' + '<\\/script>', 'the strings in the source mean the same as before the rewrite (string, template literal, regex source)');
    A.equal(got.title, 'Factory </script> deck <!--');
    A.equal(got.doc, 'Factory </script> deck <!--', 'document.title: the escaped title text reads back as typed');
    A.deepEqual(w.consoleErrors, []); A.deepEqual(w.pageErrors, []);
  },

  'the exporter refuses what would not survive: a marker in a factory, a bound function, a missing deck; nothing is returned': async (page, ctx) => {
    const A = ctx.assert;
    const s = scratch(ctx, 'refuse');
    await page.goto(s.url + '?export');
    A.ok(/contains the text \/\*PD:DECK-JSON:, which only the export may write/.test(await page.evaluate(() => { try { PD.exportHTML('wp2-mark'); return 'no throw'; } catch (e) { return e.message; } })));
    A.ok(/is a native or bound function/.test(await page.evaluate(() => { try { PD.exportHTML('wp2-bound'); return 'no throw'; } catch (e) { return e.message; } })));
    A.ok(/no deck "nope"/.test(await page.evaluate(() => { try { PD.exportHTML('nope'); return 'no throw'; } catch (e) { return e.message; } })));
    A.ok(/needs a deck id \(\d+ decks are registered/.test(await page.evaluate(() => { try { PD.exportHTML(); return 'no throw'; } catch (e) { return e.message; } })));
  },

  'self-test (acceptance #5): ok:true for the exported OGL; ok:false with the scene index when a factory reads a variable the file does not have; slide -1 when the deck cannot even compile': async (page, ctx) => {
    const A = ctx.assert;
    const s = scratch(ctx, 'selftest');
    const w = watch(page);
    await page.goto(s.url + '?export');
    const res = await page.evaluate(async () => ({
      fac: await PD.exportHTML.selfTest(PD.exportHTML('wp2-fac')),
      obj: await PD.exportHTML.selfTest(PD.exportHTML('wp2-e2e')),
      lazy: await PD.exportHTML.selfTest(PD.exportHTML('wp2-bad-lazy')),
      eager: await PD.exportHTML.selfTest(PD.exportHTML('wp2-bad-eager')),
      // the same lazy deck is fine on this very page: it is the exported file that lacks the variable
      here: (() => { const cv = document.createElement('canvas'), st = new PD.Stage(cv, { deck: PD.compile('wp2-bad-lazy'), thumb: true }); st.resize(480, 270, 1); try { st.still(1, 0); return 'ok'; } catch (e) { return String(e); } })()
    }));
    ctx.log('lazy →', JSON.stringify(res.lazy), ' eager →', JSON.stringify(res.eager));
    A.deepEqual([res.fac.ok, res.fac.errors], [true, []], 'a good factory deck');
    A.deepEqual([res.obj.ok, res.obj.errors], [true, []], 'a good object deck with an asset');
    A.equal(res.here, 'ok', 'on this page the lazy deck renders');
    A.equal(res.lazy.ok, false, 'lazy: ok:false');
    A.equal(res.lazy.errors.length, 1);
    A.equal(res.lazy.errors[0].slide, 1, 'lazy: the scene index of the broken scene');
    A.equal(res.lazy.errors[0].step, 0);
    A.ok(/WP2_OUTSIDE is not defined/.test(res.lazy.errors[0].msg), res.lazy.errors[0].msg);
    A.equal(res.eager.ok, false, 'eager: ok:false');
    A.equal(res.eager.errors[0].slide, -1, 'eager: slide -1 means the deck did not start');
    A.ok(/WP2_TOP is not defined/.test(res.eager.errors[0].msg), res.eager.errors[0].msg);
    A.deepEqual(w.pageErrors, [], 'the broken decks reported through the message, with no uncaught error');
  },

  'CLI: --self-test writes nothing for a broken deck (exit 1, names the scene); --id picks one of several decks; an unknown id and a missing page fail clearly': async (page, ctx) => {
    const A = ctx.assert;
    const s = scratch(ctx, 'cli');
    const out = path.join(ctx.tmp, 'cli-out.html');
    let r = cli(ctx, [s.page]);
    A.equal(r.status, 1, 'several decks and no --id');
    A.ok(/registers \d+ decks \(.*wp2-e2e.*\); pick one with --id/.test(r.stderr), r.stderr);
    r = cli(ctx, [s.page, '--id', 'wp2-bad-lazy', '--self-test', '--out', out]);
    A.equal(r.status, 1, r.stdout + r.stderr);
    A.ok(/the self-test failed/.test(r.stderr) && /scene 2, step 0: .*WP2_OUTSIDE is not defined/.test(r.stderr), r.stderr);
    A.ok(!fs.existsSync(out), 'nothing was written');
    r = cli(ctx, [s.page, '--id', 'wp2-e2e', '--self-test', '--out', out]);
    A.equal(r.status, 0, r.stdout + r.stderr);
    A.ok(/self-test ok/.test(r.stdout) && fs.existsSync(out), r.stdout);
    r = cli(ctx, [s.page, '--id', 'nope', '--out', out]);
    A.deepEqual([r.status, /no deck "nope" on this page \(registered: .*wp2-e2e/.test(r.stderr)], [1, true]);
    r = cli(ctx, [path.join(ctx.tmp, 'no-such-folder')]);
    A.equal(r.status, 2, 'a missing deck page is a usage error');
    r = cli(ctx, []);
    A.equal(r.status, 2);
    r = cli(ctx, [s.page, '--id', 'wp2-mark', '--out', out]);
    A.deepEqual([r.status, /only the export may write/.test(r.stderr)], [1, true], 'the exporter\'s refusal comes through');
  },

  'starter deck (acceptance #7): decks/_starter runs and shows one statement scene under slate; exports and plays; the Studio copy-and-replace flow works': async (page, ctx) => {
    const A = ctx.assert;
    const need = ['themes/slate/theme.js', 'engine/worlds/ambient.js', 'engine/templates/essentials.js'].filter(f => !fs.existsSync(ctx.path(f)));
    if (need.length) { ctx.log('SKIPPED, acceptance #7 needs WP3/WP4 files that are not there yet: ' + need.join(', ')); return; }
    const w = watch(page);
    await page.goto(ctx.url('decks/_starter/index.html'));
    await ready(page, 20000);
    const st = await page.evaluate(() => ({
      info: PixelDeck.info(), deck: PixelDeck.deck(), themes: PD.theme.list(), decks: PD.deck.list(), tpl: PD.template.has('statement'),
      scene: PD.compile('starter').scenes[0], errors: PD.compile('starter').errors, theme: PD.compile('starter').theme.id,
      issues: PD.validate ? PD.validate(PD.compile('starter')).map(i => i.level + ' ' + i.code) : null,
      fail: !!document.querySelector('[data-pd-fail]'), errbox: !!document.querySelector('.pd-err')
    }));
    A.equal(st.info.length, 1, 'one scene');
    A.equal(st.info[0].id, 'hello');
    A.equal(st.info[0].steps, 0);
    A.equal(st.scene.like, 'statement', 'it is the statement template');
    A.equal(st.theme, 'slate', 'under slate');
    A.deepEqual(st.errors, [], 'compiles without errors');
    A.deepEqual(st.decks, ['starter']);
    A.deepEqual([st.fail, st.errbox], [false, false], 'no on-screen error');
    if (st.issues) A.deepEqual(st.issues.filter(i => /^error/.test(i)), [], 'PD.validate: 0 errors');
    A.deepEqual(w.pageErrors, []);
    A.deepEqual(w.consoleErrors.filter(notMissingOptional), [], 'no console errors other than absent optional engine files (AMEND-8)');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: shot(ctx, 'starter.png') });
    const text = await page.evaluate(() => PD.compile('starter').scenes[0].text.map(t => t.str));
    A.deepEqual(text, ['Your first scene', 'Say one thing, and say it big.'], 'kicker and line on screen');

    // notes shim
    const np = await ctx.newPage();
    await np.goto(ctx.url('decks/_starter/notes.html'));
    await np.waitForFunction(() => document.title === 'Starter deck — presenter', null, { timeout: 15000 });
    A.equal(await np.evaluate(() => document.querySelectorAll('canvas').length), 2, 'presenter page: two preview canvases, no stage');

    // export + play
    const exp = path.join(ctx.tmp, 'starter.html');
    const r = cli(ctx, ['decks/_starter', '--out', exp, '--self-test']);
    A.equal(r.status, 0, r.stdout + r.stderr);
    A.ok(/self-test ok/.test(r.stdout));
    const p2 = await ctx.newPage(), w2 = watch(p2);
    await p2.goto(fileUrl(exp));
    await ready(p2);
    A.equal(await p2.evaluate(() => PixelDeck.deck().id), 'starter');
    A.deepEqual([w2.consoleErrors, w2.pageErrors, w2.requests.length], [[], [], 1], 'the exported starter: no errors, no network');
    // the same file after the release flip (spec §3.2) starts too: no module is reported missing that the file leaves out by design
    const flipFile = path.join(ctx.tmp, 'starter-flipped.html');
    fs.writeFileSync(flipFile, flipFlags(fs.readFileSync(exp, 'utf8')).html, 'utf8');
    const p4 = await ctx.newPage(), w4 = watch(p4);
    await p4.goto(fileUrl(flipFile));
    await ready(p4);
    A.deepEqual(await p4.evaluate(() => [PD.missing(), PD.MANIFEST.filter(m => !m[1]).length, PixelDeck.deck().id]), [[], 0, 'starter'], 'the flipped starter file starts');
    A.deepEqual([w4.consoleErrors, w4.pageErrors], [[], []], 'the flipped starter file: no errors');
    const parsed = await page.evaluate(h => PD.exportHTML.parse(h), fs.readFileSync(exp, 'utf8'));      // the engine page re-opens it (an exported file does not carry core/export)
    A.deepEqual([parsed.handWritten, parsed.deck && parsed.deck.id, parsed.deck && parsed.deck.scenes.length], [false, 'starter', 1], 'the starter is an object deck: the Studio can re-open its export');

    // the Studio's "Export source" flow: copy the folder, replace deck.js and assets.js, keep index.html (paths pointed back at ROOT)
    const copy = path.join(ctx.tmp, 'my-talk');
    fs.mkdirSync(copy, { recursive: true });
    for (const f of ['index.html', 'notes.html']) {
      fs.writeFileSync(path.join(copy, f), fs.readFileSync(ctx.path('decks', '_starter', f), 'utf8').replace(/\.\.\/\.\.\//g, fileUrl(ctx.root) + '/'));
    }
    fs.writeFileSync(path.join(copy, 'deck.js'),
      "PD.deck('my-talk-a1b2', { format: 2, id: 'my-talk-a1b2', meta: { title: 'My talk', theme: 'slate', story: { framework: 'blank' } }, scenes: [" +
      "{ id: 'one', template: 'statement', props: { kicker: 'Replaced', line: 'The Studio wrote this deck.js' } }] });\n");
    fs.writeFileSync(path.join(copy, 'assets.js'), "PD.assets('my-talk-a1b2', {});\n");
    const p3 = await ctx.newPage(), w3 = watch(p3);
    await p3.goto(fileUrl(path.join(copy, 'index.html')));
    await ready(p3, 20000);
    A.deepEqual(await p3.evaluate(() => [PixelDeck.deck().id, PD.compile().scenes[0].text.map(t => t.str)]), ['my-talk-a1b2', ['Replaced', 'The Studio wrote this deck.js']], 'PD.start() plays whichever single deck the page registers');
    A.deepEqual(w3.pageErrors, []);
    A.deepEqual(w3.consoleErrors.filter(notMissingOptional), []);
  }
};
