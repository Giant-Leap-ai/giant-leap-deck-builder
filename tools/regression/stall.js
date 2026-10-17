#!/usr/bin/env node
/* tools/regression/stall.js — stage frame-gap check with the presenter window open (spec §8.1 step 6).
 *
 *   node tools/regression/stall.js --deck <html|folder|alias> [--notes key|separate|none] [--notes-page <html>]
 *        [--passes 1] [--max-gap 50] [--report-only] [--out file.json] [--size 1920x1080] [--dpr 1]
 *        [--quality Q] [--dwell 1] [--headed] [--write-baseline]
 *
 * Real-time GPU run. The stage page records the gap between consecutive requestAnimationFrame
 * timestamps of its own frame loop (a RAF wrapper installed before any page script), labelled by
 * the state that was current when the frame ran. Procedure:
 *   1. open the deck (#1.0; ?quality=Q only if given), wait for PixelDeck.ready (legacy decks: 2.5 s)
 *   2. start recording (label "open") and open the presenter window:
 *        --notes key       press N on the stage (v2: ?notes with noopener; archive: same-thread popup)
 *        --notes separate  open --notes-page as its own page (default: notes.html next to the deck,
 *                          else <deck>?notes), as when it is double-clicked
 *        --notes none      no presenter window
 *      bring the stage to the front and wait 3 s for the notes window to link and draw its previews
 *   3. hold 1.0 (until !isBusy() + --dwell s), then next() through every state, holding each one
 *   4. with --passes N > 1: press Home and run the states again (warm notes caches)
 * Reports the maximum gap per state, the frames over 50 and 100 ms, and the worst state.
 * Gate: exit 1 when any gap after ready (including "open") is above --max-gap ms (default 50),
 * unless --report-only (used to record the archive's numbers). Exit 2 on usage errors.
 */
'use strict';
const path = require('path'), fs = require('fs');
const G = require('./golden.js');

const STALL_SCRIPT = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const S = window.__stall = { on: false, label: '', s: {}, last: 0 };
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      if (S.on && S.last && ts !== S.last) (S.s[S.label] || (S.s[S.label] = [])).push(ts - S.last);
      if (ts !== S.last) S.last = ts;
      cb(ts);
    });
  };
})();`;

async function waitReady(p) {
  const r = await p.evaluate(() => PixelDeck.ready);
  if (r === undefined) { await p.waitForTimeout(2500); return 'legacy (no ready flag): waited 2.5 s'; }
  await p.waitForFunction(() => PixelDeck.ready === true, null, { timeout: 30000, polling: 100 });
  return 'PixelDeck.ready';
}

function summarize(gaps, order) {
  const out = {};
  let worst = { state: null, gap: 0 };
  for (const k of order) {
    const g = gaps[k] || [];
    const max = g.length ? Math.max(...g) : null;
    out[k] = { maxGap: max == null ? null : Math.round(max * 10) / 10, frames: g.length, over50: g.filter(v => v > 50).length, over100: g.filter(v => v > 100).length,
      top: g.slice().sort((a, b) => b - a).slice(0, 3).map(v => Math.round(v * 10) / 10) };
    if (max != null && max > worst.gap) worst = { state: k, gap: Math.round(max * 10) / 10 };
  }
  return { states: out, worst };
}

async function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['headed', 'report-only', 'write-baseline', 'help'],
    values: ['deck', 'notes', 'notes-page', 'passes', 'max-gap', 'out', 'size', 'dpr', 'quality', 'dwell'] });
  if (a.help || a._.length) { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0]); return a.help ? 0 : 2; }
  const deck = G.resolveDeck(a.deck);
  const mode = a.notes || 'key';
  if (['key', 'separate', 'none'].indexOf(mode) < 0) G.die('--notes must be key, separate or none');
  const size = a.size || '1920x1080';
  const [w, h] = G.SIZES[size] || (/^\d+x\d+$/.test(size) ? size.split('x').map(Number) : G.die('bad --size ' + size));
  const dpr = +(a.dpr || 1), dwell = +(a.dwell == null ? 1 : a.dwell), passes = Math.max(1, +(a.passes || 1));
  const limit = +(a['max-gap'] || 50);
  const label = path.basename(path.dirname(deck)) + '-' + mode;
  const outFile = G.guardOut(a.out || path.join(G.OUT_DEFAULT, 'stall-' + label + '.json'), { writeBaseline: a['write-baseline'], deck });
  let notesUrl = null;
  if (mode === 'separate') {
    const sib = path.join(path.dirname(deck), 'notes.html');
    notesUrl = a['notes-page'] ? G.fileUrl(G.resolveDeck(a['notes-page'])) : fs.existsSync(sib) ? G.fileUrl(sib) : G.fileUrl(deck, '?notes');
  }

  const browser = await G.launch({ headed: a.headed });
  const bver = 'chromium ' + browser.version() + (a.headed ? ' headed' : ' headless');
  const relUrl = u => { try { const x = new URL(u); return x.protocol === 'file:' ? G.rel(require('url').fileURLToPath('file://' + x.pathname)) + x.search : u; } catch (e) { return u; } };
  const result = { tool: 'tools/regression/stall.js', deck: G.rel(deck), notes: { mode, url: null },
    size: w + 'x' + h, dpr, quality: a.quality ? +a.quality : 'default', dwell, maxGapLimit: limit, browser: bver, recorded: G.localStamp(), passes: [] };
  const errs = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const stage = await ctx.newPage();
    await stage.addInitScript(STALL_SCRIPT);
    stage.on('pageerror', e => errs.push('stage: ' + (e && e.message || e)));
    await stage.goto(G.fileUrl(deck, (a.quality ? '?quality=' + a.quality : '') + '#1.0'));
    await stage.waitForFunction(() => window.PixelDeck, null, { timeout: 30000 });
    result.readiness = await waitReady(stage);
    const info = await stage.evaluate(() => PixelDeck.info());
    const states = G.stateList(info).map(([si, st]) => `${si + 1}.${st}`);
    const hold = async () => {
      await stage.waitForFunction(() => !PixelDeck.isBusy(), null, { timeout: 20000, polling: 100 }).catch(() => { });
      await stage.waitForTimeout(dwell * 1000);
    };

    await stage.evaluate(() => { __stall.label = 'open'; __stall.on = true; });
    let notes = null;
    if (mode === 'key') {
      [notes] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), stage.keyboard.press('n')]);
    } else if (mode === 'separate') {
      notes = await ctx.newPage();
      await notes.goto(notesUrl);
    }
    if (notes) {
      notes.on('pageerror', e => errs.push('notes: ' + (e && e.message || e)));
      await notes.waitForLoadState('load');
      result.notes.url = relUrl(notes.url());
      result.notes.opener = await notes.evaluate(() => !!window.opener);
    }
    await stage.bringToFront();
    await stage.waitForTimeout(3000);

    for (let pass = 1; pass <= passes; pass++) {
      if (pass > 1) {
        await stage.evaluate(() => { __stall.s = {}; __stall.label = '1.0'; });
        await stage.keyboard.press('Home');
      } else await stage.evaluate(() => { __stall.label = '1.0'; });
      await hold();
      for (const s of states.slice(1)) {
        await stage.evaluate(l => { __stall.label = l; PixelDeck.next(); }, s);
        await hold();
      }
      const gaps = await stage.evaluate(() => __stall.s);
      const sum = summarize(gaps, pass === 1 ? ['open'].concat(states) : states);
      result.passes.push(sum);
    }
    if (notes) {
      result.notes.finalText = await notes.evaluate(() => {
        const t = id => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
        return { pos: t('pos'), link: t('link') };
      }).catch(() => null);
      result.notes.visibility = await notes.evaluate(() => document.visibilityState).catch(() => null);
    }
    result.stageVisibility = await stage.evaluate(() => document.visibilityState);
    await ctx.close();
  } finally { await browser.close(); }

  result.pageErrors = errs;
  const worst = result.passes.reduce((m, p) => p.worst.gap > m.gap ? p.worst : m, { state: null, gap: 0 });
  result.worst = worst;
  result.verdict = worst.gap > limit ? `FAIL: ${worst.gap} ms gap at ${worst.state} (> ${limit} ms)` : `OK: every gap ≤ ${limit} ms`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');

  console.log(`# deck ${result.deck}, notes ${mode}${result.notes.url ? ' (' + result.notes.url + ')' : ''}${result.notes.opener != null ? ', notes window.opener: ' + result.notes.opener : ''}, ${result.readiness}`);
  result.passes.forEach((p, i) => {
    console.log(`pass ${i + 1}: state  maxGap ms  frames  >50  >100  top gaps`);
    for (const k of Object.keys(p.states)) {
      const s = p.states[k];
      console.log(`        ${k.padEnd(6)}${(s.maxGap == null ? '-' : s.maxGap.toFixed(1)).padStart(9)}${String(s.frames).padStart(8)}${String(s.over50).padStart(5)}${String(s.over100).padStart(6)}  ${s.top.join(' ')}`);
    }
    console.log(`        worst: ${p.worst.gap} ms at ${p.worst.state}`);
  });
  if (result.notes.finalText) console.log('# notes window at the end: ' + JSON.stringify(result.notes.finalText));
  if (errs.length) console.log('# PAGE ERRORS: ' + errs.join(' | '));
  console.log((a['report-only'] ? 'REPORT ONLY — ' : '') + 'STALL ' + result.verdict);
  console.log('# wrote ' + outFile);
  return (worst.gap > limit && !a['report-only']) || errs.length ? 1 : 0;
}

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
module.exports = { STALL_SCRIPT };
