#!/usr/bin/env node
/* tools/regression/perf.js — real-time frame-cost check (spec §8.1 step 5, §4.15).
 *
 *   node tools/regression/perf.js --deck <html|folder|alias> [--out file.json] [--baseline file.json]
 *        [--runs 3] [--size 1920x1080] [--dpr 1] [--quality 1.5] [--dwell 1] [--headed] [--write-baseline]
 *
 * Plays the deck in real time on the GPU (no RAF stub, no manual clock, seeded Math.random so every
 * run builds the same particles). After PixelDeck.ready (legacy decks: 2.5 s, like record.js) it
 * presses Home to replay 1.0 live, then calls next() through every state, holding each state until
 * !isBusy() plus --dwell seconds. A requestAnimationFrame wrapper samples PixelDeck.state().workMs
 * after every frame (the gated metric), plus the raw duration of the deck's frame callback and the
 * frame gap (informational). Per state it reports p95 workMs; with --runs N each statistic is the
 * median over N fresh pages.
 *
 * --baseline FILE  fail (exit 1) when any state's p95 > baseline p95 × 1.10 + 0.5 ms
 * --out FILE       write the JSON result (default tools/regression/out/perf-<deck>.json); writing
 *                  into tools/regression/baselines/ needs --write-baseline and the archive deck
 * Exit: 0 ok · 1 over budget (or page errors) · 2 usage.
 */
'use strict';
const path = require('path'), fs = require('fs');
const G = require('./golden.js');

const PERF_SCRIPT = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const P = window.__perf = { on: false, label: '', s: {} };
  let last = 0;
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      const t0 = performance.now();
      cb(ts);
      const work = performance.now() - t0;
      if (P.on) {
        const b = P.s[P.label] || (P.s[P.label] = { ema: [], raw: [], gap: [] });
        b.raw.push(work);
        if (last && ts !== last) b.gap.push(ts - last);
        try { b.ema.push(window.PixelDeck.state().workMs); } catch (e) { }
      }
      if (ts !== last) last = ts;
    });
  };
})();`;

const q = (arr, p) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
const median = arr => q(arr.filter(v => v != null), 0.5);
const r2 = v => v == null ? null : Math.round(v * 100) / 100;

async function waitReady(p) {
  const r = await p.evaluate(() => PixelDeck.ready);
  if (r === undefined) { await p.waitForTimeout(2500); return 'legacy (no ready flag): waited 2.5 s'; }
  await p.waitForFunction(() => PixelDeck.ready === true, null, { timeout: 30000, polling: 100 });
  return 'PixelDeck.ready';
}

async function oneRun(browser, deck, o) {
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.dpr });
  await ctx.addInitScript(G.RNG_SCRIPT);
  await ctx.addInitScript(PERF_SCRIPT);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message || e)));
  await p.goto(G.fileUrl(deck, '?quality=' + o.quality + '#1.0'));
  await p.waitForFunction(() => window.PixelDeck, null, { timeout: 30000 });
  const readiness = await waitReady(p);
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => PixelDeck.info());
  const states = G.stateList(info);
  const hold = async () => {
    await p.waitForFunction(() => !PixelDeck.isBusy(), null, { timeout: 20000, polling: 100 }).catch(() => { });
    await p.waitForTimeout(o.dwell * 1000);
  };
  await p.evaluate(() => { __perf.label = '1.0'; __perf.on = true; });
  await p.keyboard.press('Home');               // replay 1.0 live (same key handling on archive and v2)
  await hold();
  for (const [si, st] of states.slice(1)) {
    await p.evaluate(l => { __perf.label = l; PixelDeck.next(); }, `${si + 1}.${st}`);
    await hold();
  }
  const raw = await p.evaluate(() => { __perf.on = false; return __perf.s; });
  await ctx.close();
  const out = {};
  for (const [si, st] of states) {
    const b = raw[`${si + 1}.${st}`] || { ema: [], raw: [], gap: [] };
    out[`${si + 1}.${st}`] = { p95: q(b.ema, 0.95), p50: q(b.ema, 0.5), max: q(b.ema, 1), rawP95: q(b.raw, 0.95), rawMax: q(b.raw, 1), gapMax: q(b.gap, 1), frames: b.raw.length };
  }
  return { states: out, errs, readiness };
}

function table(res, base) {
  const rows = [];
  let fails = 0;
  rows.push('state   p95 workMs   p50     max   rawP95  rawMax  gapMax frames' + (base ? '   base p95   limit   verdict' : ''));
  for (const k of Object.keys(res.states)) {
    const s = res.states[k], f = v => (v == null ? '-' : v.toFixed(2)).padStart(7);
    let line = k.padEnd(6) + f(s.p95).padStart(12) + f(s.p50) + f(s.max) + f(s.rawP95) + f(s.rawMax) + f(s.gapMax) + String(s.frames).padStart(7);
    if (base) {
      const b = base.states[k];
      if (!b || b.p95 == null) { line += '          -        -   (no baseline)'; }
      else {
        const lim = b.p95 * 1.10 + 0.5, bad = s.p95 == null || s.p95 > lim;
        if (bad) fails++;
        line += b.p95.toFixed(2).padStart(11) + lim.toFixed(2).padStart(8) + (bad ? '   FAIL' : '   ok');
      }
    }
    rows.push(line);
  }
  return { text: rows.join('\n'), fails };
}

async function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['headed', 'write-baseline', 'help'], values: ['deck', 'out', 'baseline', 'runs', 'size', 'dpr', 'quality', 'dwell'] });
  if (a.help || a._.length) { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0]); return a.help ? 0 : 2; }
  const deck = G.resolveDeck(a.deck);
  const size = a.size || '1920x1080';
  const [w, h] = G.SIZES[size] || (/^\d+x\d+$/.test(size) ? size.split('x').map(Number) : G.die('bad --size ' + size));
  const o = { w, h, dpr: +(a.dpr || 1), quality: +(a.quality || 1.5), dwell: +(a.dwell == null ? 1 : a.dwell), runs: Math.max(1, +(a.runs || 3)) };
  const label = path.basename(path.dirname(deck)) + '-' + path.basename(deck, '.html');
  const outFile = G.guardOut(a.out || path.join(G.OUT_DEFAULT, 'perf-' + label + '.json'), { writeBaseline: a['write-baseline'], deck });
  const base = a.baseline ? JSON.parse(fs.readFileSync(path.resolve(a.baseline), 'utf8')) : null;

  const browser = await G.launch({ headed: a.headed });
  const bver = 'chromium ' + browser.version() + (a.headed ? ' headed' : ' headless') + ', playwright ' + require(path.join(__dirname, '..', 'node_modules', 'playwright', 'package.json')).version;
  const runs = [];
  try {
    for (let i = 0; i < o.runs; i++) {
      const t0 = Date.now();
      const r = await oneRun(browser, deck, o);
      runs.push(r);
      console.log(`# run ${i + 1}/${o.runs}: ${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.readiness}${r.errs.length ? ', PAGE ERRORS: ' + r.errs.join(' | ') : ''}`);
    }
  } finally { await browser.close(); }

  const keys = Object.keys(runs[0].states);
  const states = {};
  for (const k of keys) {
    const pick = f => runs.map(r => r.states[k] && r.states[k][f]);
    states[k] = { p95: r2(median(pick('p95'))), p50: r2(median(pick('p50'))), max: r2(median(pick('max'))), rawP95: r2(median(pick('rawP95'))),
      rawMax: r2(median(pick('rawMax'))), gapMax: r2(median(pick('gapMax'))), frames: Math.round(median(pick('frames'))), runsP95: pick('p95').map(r2) };
  }
  const res = {
    tool: 'tools/regression/perf.js', deck: G.rel(deck), size: w + 'x' + h, dpr: o.dpr, quality: o.quality, dwell: o.dwell, runs: o.runs,
    browser: bver,
    metric: 'p95 of PixelDeck.state().workMs sampled after every frame; median over runs',
    gate: 'candidate p95 <= baseline p95 * 1.10 + 0.5 ms, per state',
    recorded: G.localStamp(),
    states
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(res, null, 2) + '\n');
  const t = table(res, base);
  console.log(t.text);
  console.log('# wrote ' + outFile);
  const errs = runs.reduce((n, r) => n + r.errs.length, 0);
  if (base) console.log(t.fails ? `PERF FAIL: ${t.fails} state(s) over baseline × 1.10 + 0.5 ms` : 'PERF OK: every state within baseline × 1.10 + 0.5 ms');
  return t.fails || errs ? 1 : 0;
}

if (require.main === module) main().then(c => process.exit(c), e => { console.error(e); process.exit(1); });
module.exports = { PERF_SCRIPT };
