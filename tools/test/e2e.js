#!/usr/bin/env node
/* tools/test/e2e.js — Playwright end-to-end runner (WP0, spec §9).
 *
 *   node tools/test/e2e.js [file...] [--grep re] [--headed] [--timeout ms]
 *
 * Runs every tools/test/e2e/*.e2e.js (alphabetical), or only the files given (a path, or a name
 * inside tools/test/e2e/). Each file is a CommonJS module that exports either
 *   module.exports = async function (page, ctx) { … }                 one test, named after the file
 *   module.exports = { 'name': async (page, ctx) => { … }, … }         several tests, run in order
 * Every test gets a fresh browser context (1280×720, DPR 1) and a fresh page, in Chromium with
 * the GPU (channel 'chromium', --use-angle=metal). ctx:
 *   root                      ROOT (absolute)
 *   path(...parts)            absolute path inside ROOT
 *   url(rel, suffix?)         file:// URL of a ROOT-relative path, suffix appended ('?notes', '#7.3')
 *   browser, context, page    Playwright objects; newPage() opens another page in the same context
 *   newContext(opts?)         another context (closed automatically after the test)
 *   assert                    the same assertions as the unit tests (ok, equal, deepEqual, throws,
 *                             rejects, near, fail), from tools/test/assert.js
 *   seedScript, rngScript     the golden init scripts (RAF stub + seeded Math.random / seeded only)
 *   sleep(ms), log(...msg)    log prints "# …" lines
 *   tmp                       an empty temporary directory for this test (outside ROOT)
 *   pageErrors                uncaught page errors seen in this test's contexts; the test fails if any
 *                             occurred, unless it sets ctx.expectPageErrors = true
 * Prints ok/not ok lines (TAP style). Exit 0 when all pass (or there are no e2e files), 1 on any failure.
 */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), url = require('url');
const G = require('../regression/golden.js');
const { makeAssert, withTimeout } = require('./assert.js');

const E2E_DIR = path.join(__dirname, 'e2e');

function findFiles(args) {
  if (args.length) return args.map(f => {
    const cands = [path.resolve(f), path.join(E2E_DIR, f), path.join(E2E_DIR, f + '.e2e.js')];
    const hit = cands.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!hit) G.die('e2e file not found: ' + f);
    return hit;
  });
  return fs.existsSync(E2E_DIR) ? fs.readdirSync(E2E_DIR).filter(f => /\.e2e\.js$/.test(f)).sort().map(f => path.join(E2E_DIR, f)) : [];
}

async function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['headed', 'help'], values: ['grep', 'timeout'] });
  if (a.help) { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0]); return 0; }
  const files = findFiles(a._);
  const re = a.grep ? new RegExp(a.grep) : null;
  const timeout = a.timeout ? +a.timeout : 120000;
  console.log('TAP version 13');
  if (!files.length) { console.log('# no e2e files in ' + G.rel(E2E_DIR)); console.log('1..0'); return 0; }

  const tmpRoot = fs.mkdtempSync(path.join(process.env.PD_TMP || os.tmpdir(), 'pixeldeck-e2e-'));
  const browser = await G.launch({ headed: a.headed });
  let n = 0, failed = 0, passed = 0;
  try {
    for (const file of files) {
      let mod;
      try { mod = require(file); } catch (e) { n++; failed++; console.log(`not ok ${n} - ${path.basename(file)} (load)`); console.log('  # ' + (e && e.stack || e).split('\n').slice(0, 6).join('\n  # ')); continue; }
      if (mod && typeof mod === 'object' && typeof mod.default === 'function') mod = mod.default;
      const tests = typeof mod === 'function' ? [[null, mod]] : Object.keys(mod || {}).filter(k => typeof mod[k] === 'function').map(k => [k, mod[k]]);
      if (!tests.length) { n++; failed++; console.log(`not ok ${n} - ${path.basename(file)}: exports no test function`); continue; }
      for (const [name, fn] of tests) {
        const label = path.basename(file) + (name ? ' › ' + name : '');
        if (re && !re.test(label)) continue;
        n++;
        const contexts = [], pageErrors = [];
        const track = c => { contexts.push(c); c.on('page', p => p.on('pageerror', e => pageErrors.push(String(e && e.stack || e)))); return c; };
        const context = track(await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }));
        const page = await context.newPage();
        const tmp = fs.mkdtempSync(path.join(tmpRoot, 't'));
        const ctx = {
          root: G.ROOT, file,
          path: (...p) => path.join(G.ROOT, ...p),
          url: (rel, suffix) => url.pathToFileURL(path.resolve(G.ROOT, rel)).href + (suffix || ''),
          browser, context, page,
          newPage: () => context.newPage(),
          newContext: async o => track(await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, o))),
          assert: makeAssert(),
          seedScript: G.SEED_SCRIPT, rngScript: G.RNG_SCRIPT,
          sleep: ms => new Promise(r => setTimeout(r, ms)),
          log: (...m) => console.log('# ' + m.join(' ')),
          tmp, pageErrors, expectPageErrors: false
        };
        const t0 = Date.now();
        let err = null;
        try { await withTimeout(Promise.resolve().then(() => fn(page, ctx)), timeout, 'e2e test'); }
        catch (e) { err = e; }
        if (!err && pageErrors.length && !ctx.expectPageErrors) err = new Error('uncaught page error(s):\n' + pageErrors.join('\n'));
        for (const c of contexts) await c.close().catch(() => { });
        const ms = Date.now() - t0;
        if (!err) { passed++; console.log(`ok ${n} - ${label} (${ms} ms)`); }
        else { failed++; console.log(`not ok ${n} - ${label} (${ms} ms)`); String(err && err.stack || err).split('\n').slice(0, 12).forEach(l => console.log('  # ' + l)); }
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log(`1..${n}`);
  console.log(`# pass ${passed}  fail ${failed}`);
  return failed || (re && !n) ? 1 : 0;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
