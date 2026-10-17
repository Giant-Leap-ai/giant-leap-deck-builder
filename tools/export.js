#!/usr/bin/env node
/* tools/export.js — headless standalone export of a deck (WP2, spec §3.6 "CLI").
 *
 *   node tools/export.js <deck folder | index.html | alias> [--out file] [--id deckId] [--self-test] [--headed]
 *
 * Opens <folder>/index.html?export in headless Chromium (with ?export the page registers everything and boots
 * nothing), evaluates PD.exportHTML(id) in it and writes the bytes. The Studio calls the same function, so the CLI and
 * the Studio produce the same bytes for the same inputs; the file contains no date or other run-dependent text.
 *
 *   <deck folder>   a deck folder (→ its index.html), an .html page, or an alias of tools/regression/golden.js
 *                   (one-giant-leap, ogl, …)
 *   --out file      where to write (default <folder>/export/<deck id>.html; decks/*\/export/ is git-ignored)
 *   --id deckId     the deck to export when the page registers more than one (default: the only one)
 *   --self-test     before writing, play the file once in a hidden iframe (every state is rendered once, spec §3.6);
 *                   when that fails nothing is written and the exit code is 1
 *   --headed        show the browser
 *
 * The page must load the deck's theme.js, assets.js and deck.js (every deck folder's index.html does). Console errors
 * for absent OPTIONAL engine files (AMEND-8) are expected while parallel packages land and are not failures.
 * Never writes under the talk archive or the baselines (the same guards as tools/regression/golden.js).
 * Exit: 0 written · 1 the page threw, the export threw or the self-test failed · 2 usage error. */
'use strict';
const path = require('path'), fs = require('fs');
const G = require('./regression/golden.js');

const HELP = fs.readFileSync(__filename, 'utf8').split(' */')[0];

async function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['help', 'headed', 'self-test'], values: ['out', 'id'] });
  if (a.help) { console.log(HELP); return 0; }
  if (a._.length !== 1) { console.error(HELP); G.die('expected exactly one deck folder (see --help)'); }
  const page = G.resolveDeck(a._[0]);                       // folder → index.html; exits 2 when missing

  const browser = await G.launch({ headed: a.headed });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [], cerrs = [];
    p.on('pageerror', e => errs.push(String(e && e.message || e)));
    p.on('console', m => { if (m.type() === 'error') cerrs.push(m.text()); });
    await p.goto(G.fileUrl(page, '?export'), { waitUntil: 'load' });

    const failed = await p.evaluate(() => { const f = document.querySelector('[data-pd-fail]'); return f ? f.textContent : null; });
    if (failed) { console.error('export: the page could not start:\n' + failed); return 1; }
    if (errs.length) { console.error('export: the page threw while loading:\n  ' + errs.join('\n  ')); return 1; }
    const has = await p.evaluate(() => typeof window.PD === 'object' && typeof PD.exportHTML === 'function');
    if (!has) { console.error('export: ' + G.rel(page) + ' does not load the engine\'s export module (engine/core/export.js)'); return 1; }

    const ids = await p.evaluate(() => PD.deck.list());
    let id = a.id;
    if (id == null) {
      if (ids.length !== 1) { console.error('export: ' + (ids.length ? 'the page registers ' + ids.length + ' decks (' + ids.join(', ') + '); pick one with --id' : 'the page registers no deck (does it load deck.js?)')); return 1; }
      id = ids[0];
    } else if (ids.indexOf(id) < 0) { console.error('export: no deck "' + id + '" on this page (registered: ' + (ids.join(', ') || 'none') + ')'); return 1; }

    const out = G.guardOut(a.out ? path.resolve(a.out) : path.join(path.dirname(page), 'export', id + '.html'));
    let html;
    try { html = await p.evaluate(id => PD.exportHTML(id), id); }
    catch (e) { console.error('export: ' + (e && e.message || e).replace(/^Error: /, '')); return 1; }

    const issues = await p.evaluate(id => { try { return PD.compile(id).errors; } catch (e) { return []; } }, id);
    issues.forEach(is => console.warn('export: warning: scene ' + (is.scene + 1) + (is.sceneId ? ' (' + is.sceneId + ')' : '') + ': ' + is.msg));

    if (a['self-test']) {
      const r = await p.evaluate(h => PD.exportHTML.selfTest(h), html);
      if (!r.ok) {
        console.error('export: the self-test failed (' + r.ms + ' ms); nothing was written');
        r.errors.forEach(e => console.error('  ' + (e.slide < 0 ? 'the deck did not start' : 'scene ' + (e.slide + 1) + ', step ' + e.step) + ': ' + e.msg));
        return 1;
      }
      console.log('self-test ok (' + r.ms + ' ms)');
    }

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html, 'utf8');
    console.log('wrote ' + G.rel(out) + ' (' + Buffer.byteLength(html, 'utf8') + ' bytes, deck "' + id + '")');
  } finally { await browser.close(); }
  return 0;
}

main().then(c => process.exit(c), e => { console.error(e && e.stack || e); process.exit(1); });
