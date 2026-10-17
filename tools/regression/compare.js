#!/usr/bin/env node
/* tools/regression/compare.js — EXACT gate (spec §8.1 step 4).
 *
 *   node tools/regression/compare.js <baselineDir> <candidateDir> [--out diffDir] [--subset] [--only 1280,thumbs]
 *
 * Compares SHA-1 per PNG and the Math.random call count per capture (rng.json, matched by file).
 * Capture dirs hold PNGs directly; a dir with no PNGs is treated as a root and every
 * sub-directory of the baseline that holds PNGs is compared (e.g. baselines/ogl → 1280, 1920, thumbs).
 * A sub-directory missing from the candidate fails, unless --only leaves it out.
 *
 * On any mismatch it runs diff.py --out <diffDir> (tolerance report) and prints
 *   EXACT FAIL (n frames; RNG drift at capture k)
 * Exit codes: 0 exact · 1 different · 2 not exact but every frame within diff.py thresholds
 *             (mean < 1.5, big% < 0.5) and the same frame list · 3 usage error.
 *
 *   --subset   compare only the files present in the baseline dir (extra candidate files are
 *              ignored; RNG compared only if the baseline has rng.json). Used for the historical
 *              84-frame baseline, which predates rng.json and the extra paths.
 *   --out DIR  where diff.py writes amplified difference images (default tools/regression/out/diff/<name>)
 */
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawnSync } = require('child_process');
const G = require('./golden.js');
G.DIE_CODE = 3;                     // usage errors must not look like exit 2 (= within tolerance)

const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const pngs = d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.png$/i.test(f)).sort() : [];
const readRng = d => { const f = path.join(d, 'rng.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };

function compareDir(base, cand, label, opts) {
  const A = pngs(base), B = pngs(cand);
  if (!A.length) { console.log(`FAIL  ${label}: baseline has no frames (${base})`); return 1; }
  if (!fs.existsSync(cand)) { console.log(`FAIL  ${label}: candidate dir missing (${cand})`); return 1; }
  const inB = new Set(B), inA = new Set(A);
  const missing = A.filter(f => !inB.has(f));
  const extra = opts.subset ? [] : B.filter(f => !inA.has(f));
  const changed = A.filter(f => inB.has(f) && sha1(path.join(base, f)) !== sha1(path.join(cand, f)));
  const same = A.length - missing.length - changed.length;

  // RNG: per capture, in baseline capture order
  const rb = readRng(base), rc = readRng(cand);
  let rngNote = '', drift = null, rngBad = 0;
  if (!rb) {
    if (opts.subset) rngNote = 'RNG not compared (baseline has no rng.json)';
    else { rngNote = 'baseline has no rng.json'; drift = 1; rngBad = 1; }
  } else if (!rc) { rngNote = 'candidate has no rng.json'; drift = 1; rngBad = rb.length; }
  else {
    const byFile = new Map(rc.map(e => [e.file, e.rng]));
    rb.forEach((e, i) => {
      if (opts.subset && !inA.has(e.file)) return;
      if (byFile.get(e.file) !== e.rng) { rngBad++; if (drift == null) drift = { k: i + 1, file: e.file, base: e.rng, cand: byFile.get(e.file) }; }
    });
    if (!opts.subset && rc.length !== rb.length && drift == null) { drift = { k: Math.min(rb.length, rc.length) + 1, file: '(capture count differs)', base: rb.length, cand: rc.length }; rngBad++; }
    rngNote = drift == null ? `RNG equal at all ${rb.length} captures` : '';
  }

  if (!missing.length && !extra.length && !changed.length && drift == null) {
    console.log(`EXACT OK  ${label}: ${same}/${A.length} frames identical (SHA-1); ${rngNote}`);
    return 0;
  }

  const nBad = changed.length + missing.length + extra.length;
  const driftTxt = drift == null ? (rngNote || 'RNG equal')
    : typeof drift === 'number' ? `RNG drift at capture ${drift} (${rngNote})`
    : `RNG drift at capture ${drift.k} (${drift.file}: ${drift.base} → ${drift.cand}; ${rngBad} captures differ)`;
  console.log(`EXACT FAIL (${nBad} frames; ${driftTxt})  ${label}: exact ${same}/${A.length}`);
  const show = (tag, list) => { list.slice(0, 12).forEach(f => console.log(`  ${tag} ${f}`)); if (list.length > 12) console.log(`  … ${list.length - 12} more ${tag.trim()}`); };
  show('changed', changed); show('missing', missing); show('extra  ', extra);

  // tolerance report
  const out = G.guardOut(opts.out ? (opts.multi ? path.join(opts.out, label) : opts.out) : path.join(G.OUT_DEFAULT, 'diff', label));
  const r = spawnSync('python3', [path.join(__dirname, 'diff.py'), base, cand, '--out', out], { encoding: 'utf8' });
  if (r.error || r.status == null || r.status > 1 || /Traceback/.test(r.stderr || '')) {
    console.log('  diff.py could not run: ' + (r.error ? r.error.message : (r.stderr || '').trim().split('\n').pop()));
    return 1;
  }
  const lines = (r.stdout || '').split('\n');
  lines.filter(l => /^DIFF |^frame lists differ/.test(l)).slice(0, 30).forEach(l => console.log('  ' + l));
  const summary = lines.filter(l => /differing frames of/.test(l)).pop();
  if (summary) console.log('  diff.py: ' + summary.trim() + '  (difference images: ' + out + ')');
  if (r.status === 0 && !missing.length && !extra.length) { console.log(`WITHIN TOLERANCE  ${label}`); return 2; }
  console.log(`DIFFERENT  ${label}`);
  return 1;
}

function main() {
  const a = G.parseArgs(process.argv.slice(2), { flags: ['subset', 'help'], values: ['out', 'only'] });
  if (a.help || a._.length !== 2) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); return a.help ? 0 : 3; }
  const [base, cand] = a._.map(p => path.resolve(p));
  if (!fs.existsSync(base)) G.die('baseline not found: ' + base);
  const only = a.only ? a.only.split(',') : null;
  let jobs;
  if (pngs(base).length) jobs = [[base, cand, path.basename(cand)]];
  else {
    const subs = fs.readdirSync(base).filter(d => fs.statSync(path.join(base, d)).isDirectory() && pngs(path.join(base, d)).length).sort();
    jobs = subs.filter(d => !only || only.indexOf(d) >= 0).map(d => [path.join(base, d), path.join(cand, d), d]);
    if (only) only.filter(d => subs.indexOf(d) < 0).forEach(d => G.die('--only ' + d + ': not a capture dir in ' + base));
    if (!jobs.length) G.die('no capture directories in ' + base);
  }
  let worst = 0;
  for (const [b, c, label] of jobs) {
    const code = compareDir(b, c, label, { subset: a.subset, out: a.out, multi: jobs.length > 1 });
    worst = code === 1 || worst === 1 ? 1 : Math.max(worst, code);
  }
  if (jobs.length > 1) console.log(worst === 0 ? 'overall: EXACT' : worst === 2 ? 'overall: WITHIN TOLERANCE (not exact)' : 'overall: DIFFERENT');
  return worst;
}

process.exit(main());
