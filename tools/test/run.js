#!/usr/bin/env node
/* tools/test/run.js — browser unit-test runner (WP0, spec §9).
 *
 *   node tools/test/run.js [--grep re] [--headed] [--spec file]... [--timeout ms]
 *
 * Generates tools/test/.harness.html from harness.tpl.html with this load order, each group
 * alphabetical:
 *   1. engine/pixeldeck.js (when it exists; its document.write loader pulls in the engine modules)
 *   2. themes/*\/theme.js   3. decks/*\/theme.js   4. decks/*\/assets.js   5. decks/*\/deck.js
 *   6. tools/test/assert.js 7. tools/test/specs/*.test.js (or only the --spec files given)
 * then opens the harness from file:// in Chromium, runs every T.test in order and prints
 * `ok n - <file> › <name>` / `not ok n - …` lines (TAP style).
 *
 * --grep re      run only tests whose "<file> › <name>" matches the regular expression
 * --spec file    load this spec file instead of specs/*.test.js (repeatable; any path)
 * --timeout ms   default per-test timeout (10000); a test may pass T.test(name, fn, { timeout })
 * --headed       show the browser window
 *
 * Exit 0 when every selected test passed; 1 on any failure, on an uncaught error while the
 * harness loads or runs, or when no test was selected; 2 on usage errors.
 */
'use strict';
const path = require('path'), fs = require('fs'), url = require('url');
const G = require('../regression/golden.js');

const ROOT = G.ROOT, TEST_DIR = __dirname;
const HARNESS = path.join(TEST_DIR, '.harness.html');

function sub(dir, name) {          // <dir>/*/<name>, alphabetical by folder
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).sort().map(f => path.join(d, f, name)).filter(p => fs.existsSync(p) && fs.statSync(p).isFile());
}

function scriptGroups(specFiles) {
  const kernel = path.join(ROOT, 'engine', 'pixeldeck.js');
  const specs = specFiles && specFiles.length ? specFiles.map(f => path.resolve(f))
    : fs.existsSync(path.join(TEST_DIR, 'specs')) ? fs.readdirSync(path.join(TEST_DIR, 'specs')).filter(f => /\.test\.js$/.test(f)).sort().map(f => path.join(TEST_DIR, 'specs', f)) : [];
  specs.forEach(f => { if (!fs.existsSync(f)) G.die('spec not found: ' + f); });
  return [
    ['engine', fs.existsSync(kernel) ? [kernel] : []],
    ['themes', sub('themes', 'theme.js')],
    ['deck themes', sub('decks', 'theme.js')],
    ['deck assets', sub('decks', 'assets.js')],
    ['decks', sub('decks', 'deck.js')],
    ['assert', [path.join(TEST_DIR, 'assert.js')]],
    ['specs', specs]
  ];
}

function srcFor(abs) {
  const r = path.relative(TEST_DIR, abs);
  if (r.startsWith('..' + path.sep + '..' + path.sep + '..') || path.isAbsolute(r)) return url.pathToFileURL(abs).href;
  return r.split(path.sep).map(encodeURIComponent).join('/');
}

function writeHarness(groups) {
  const tpl = fs.readFileSync(path.join(TEST_DIR, 'harness.tpl.html'), 'utf8');
  const tags = [];
  for (const [label, files] of groups) {
    for (const f of files) tags.push(`<script src="${srcFor(f)}" data-group="${label}"></script>`);
  }
  fs.writeFileSync(HARNESS, tpl.replace('{{SCRIPTS}}', tags.join('\n')));
}

async function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['headed', 'help'], values: ['grep', 'timeout'], multi: ['spec'] });
  if (a.help || a._.length) { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0]); return a.help ? 0 : 2; }
  if (a.grep) { try { new RegExp(a.grep); } catch (e) { G.die('bad --grep: ' + e.message); } }
  const groups = scriptGroups(a.spec);
  writeHarness(groups);
  const count = g => (groups.find(x => x[0] === g) || [0, []])[1].length;
  console.log('TAP version 13');
  console.log(`# harness ${G.rel(HARNESS)}: engine ${count('engine') ? 'loaded' : 'absent (engine/pixeldeck.js not found)'}, ` +
    `${count('themes')} themes, ${count('deck themes')} deck themes, ${count('deck assets')} asset files, ${count('decks')} decks, ${count('specs')} spec files`);

  const browser = await G.launch({ headed: a.headed });
  let failed = 0, passed = 0, skipped = 0, n = 0;
  const loadErrors = [], consoleErrors = [];
  let phase = 'load';
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => {
      const msg = String(e && e.stack || e);
      if (phase !== 'run') loadErrors.push(phase + ': ' + msg);
      else msg.split('\n').slice(0, 8).forEach((l, i) => console.log((i ? '  #   ' : '  # page error: ') + l));   // the test is failed in-page
    });
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('crash', () => loadErrors.push('page crashed'));
    await page.exposeBinding('__pdReport', (src, r) => {
      n = Math.max(n, r.n);
      if (r.skip) { skipped++; console.log(`ok ${r.n} - ${r.file} › ${r.name} # SKIP`); return; }
      if (r.ok) { passed++; console.log(`ok ${r.n} - ${r.file} › ${r.name} (${r.ms} ms)`); return; }
      failed++;
      console.log(`not ok ${r.n} - ${r.file} › ${r.name} (${r.ms} ms)`);
      String(r.error || 'failed').split('\n').slice(0, 12).forEach(l => console.log('  # ' + l));
    });
    await page.goto(url.pathToFileURL(HARNESS).href, { waitUntil: 'load' });
    const hasT = await page.evaluate(() => typeof window.T === 'object' && typeof T.run === 'function');
    if (!hasT) loadErrors.push('assert.js did not define T');
    for (const m of consoleErrors) console.log('# console.error during load: ' + m);
    consoleErrors.length = 0;
    if (hasT) {
      phase = 'run';
      const res = await page.evaluate(o => T.run({ grep: o.grep, timeout: o.timeout, report: r => window.__pdReport(r) }),
        { grep: a.grep || null, timeout: a.timeout ? +a.timeout : 10000 });
      phase = 'after run';
      res.stray.forEach(s => loadErrors.push('during the run, outside any test: ' + s));
      if (!res.results.length) { console.log(`# no tests selected (${res.total} registered${a.grep ? ', --grep ' + a.grep : ''})`); failed++; }
      await page.waitForTimeout(50);
    }
    for (const m of consoleErrors) console.log('# console.error: ' + m);
    await ctx.close();
  } finally { await browser.close(); }

  loadErrors.forEach((e, i) => {
    failed++;
    console.log(`not ok ${n + i + 1} - harness: uncaught error`);
    String(e).split('\n').slice(0, 8).forEach(l => console.log('  # ' + l));
  });
  console.log(`1..${n + loadErrors.length}`);
  console.log(`# pass ${passed}  fail ${failed}  skip ${skipped}`);
  return failed ? 1 : 0;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
