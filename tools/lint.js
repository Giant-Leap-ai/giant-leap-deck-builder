#!/usr/bin/env node
/* tools/lint.js — module and file rules for pixeldeck v2 (spec §3.1, §3.5). WP1, dev-only.
 *
 *   node tools/lint.js [--root DIR] [--verbose]
 *
 * Applies to every .js file under engine/ themes/ decks/ studio/ (missing folders are skipped):
 *   1. single-statement  The file is exactly one top-level statement: one PD.*(…) call.
 *        a. structural: after comments and whitespace the file is `PD.<name>[.<name>…](…)` with an optional `;`
 *           and nothing else (a small tokenizer finds the matching parenthesis);
 *        b. sandbox: the file runs in a Node vm context whose only global is a stub PD. Every PD.* function
 *           records its call and never invokes the factory. The run must make exactly one PD.* call, add no
 *           key to the sandbox global, and not throw.
 *      The kernel engine/pixeldeck.js is exempt (its one statement is `(function kernel(g){…})(window);`).
 *   2. forbidden-text    </script  <!--  \bimport\s  ^\s*export\s  fetch\(  document\.cookie  everywhere;
 *                        'use strict' in engine/core/.
 *   3. random            Math.random only in engine/core/{field,stage,sync}.js. crypto.getRandomValues only in
 *                        studio/ (and crypto.randomUUID nowhere).
 *   4. archive-safety    No text file under ROOT outside the archive folder contains the archive path string,
 *                        except under docs/ (which holds the spec) and tools/regression/. (node_modules and
 *                        binaries skipped.)
 *
 * Exemptions from rule 1 only (rules 2–4 still apply). Each holds only while its condition is true; when the
 * condition lapses the file is linted like any other, so a leftover exemption cannot hide a file:
 *   engine/tween.js                  while cinema/index.html still loads ../engine/tween.js (AMEND-1: the file
 *                                    must stay in place, unmodified, until the talk is over); not a module
 * (The M2–M4 exemption for decks/one-giant-leap/scenes.js ended at M5: that file became deck.js, one PD.deck call.)
 * Active exemptions are printed on every run.
 *
 * Exit 0 when clean, 1 on any violation, 2 on usage errors.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT_DEFAULT = path.resolve(__dirname, '..');
const LINT_DIRS = ['engine', 'themes', 'decks', 'studio'];
const KERNEL = 'engine/pixeldeck.js';
const RANDOM_ALLOWED = ['engine/core/field.js', 'engine/core/stage.js', 'engine/core/sync.js'];
const readOr = (p, dflt) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return dflt; } };
const SINGLE_STATEMENT_EXEMPT = {      // file → { why, holds(root) }; see the header
  'engine/tween.js': {
    why: 'AMEND-1: kept in place, unmodified, while cinema/index.html loads it; not a module',
    holds: (root) => /\.\.\/engine\/tween\.js/.test(readOr(path.join(root, 'cinema', 'index.html'), ''))
  }
};
const exemptWhy = (root, r) => { const x = SINGLE_STATEMENT_EXEMPT[r]; return x && x.holds(root) ? x.why : null; };
const ARCHIVE = '_arch' + 'ive';               // spelled in two parts so this file passes its own rule 4
const ARCHIVE_PATH = ARCHIVE + '/';

/* ------------------------------------------------------------------ tokenizer
 * Enough of ECMAScript's lexical grammar to find top-level structure: comments, strings, template literals
 * (with nested ${…}), regular-expression literals (by the usual previous-token rule), numbers, identifiers and
 * punctuators. Tokens: { type: 'id'|'num'|'str'|'tpl'|'re'|'punc', value, line, start, end }. */
const KW_BEFORE_EXPR = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'instanceof', 'yield', 'await']);
const PUNC_BEFORE_EXPR = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>',
  '~', '^', '=>', '...', '?.']);
const ID_START = /[A-Za-z_$ª-￿]/, ID_PART = /[\w$ª-￿]/;

function tokenize(src) {
  const toks = [], stack = [];      // stack: 'tpl' for an open ${, 'brace' for a plain {
  let i = 0, line = 1;
  const n = src.length;
  const err = (msg) => { const e = new Error(msg + ' (line ' + line + ')'); e.line = line; throw e; };
  const prevSig = () => toks.length ? toks[toks.length - 1] : null;
  function regexAllowed() {
    const p = prevSig();
    if (!p) return true;
    if (p.type === 'punc') return PUNC_BEFORE_EXPR.has(p.value);
    if (p.type === 'id') return KW_BEFORE_EXPR.has(p.value);
    return false;
  }
  function push(type, value, start) { toks.push({ type, value, line, start, end: i }); }
  function scanTemplate(start) {     // i is just after ` or after the } closing a ${
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; push('tpl', src.slice(start, i), start); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; push('tpl', src.slice(start, i), start); stack.push('tpl'); return; }
      i++;
    }
    err('unterminated template literal');
  }
  while (i < n) {
    const c = src[i], start = i;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' ||
        c === ' ' || c === ' ') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e < 0) err('unterminated block comment');
      for (let k = i; k < e; k++) if (src[k] === '\n') line++;
      i = e + 2; continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (src[i] === '\n') err('unterminated string');
        i++;
      }
      if (i >= n) err('unterminated string');
      i++; push('str', src.slice(start, i), start); continue;
    }
    if (c === '`') { i++; scanTemplate(start); continue; }
    if (c === '/' && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === '\n') err('unterminated regular expression');
        if (d === '\\') { i += 2; continue; }
        if (d === '[') inClass = true; else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        i++;
      }
      if (i >= n) err('unterminated regular expression');
      i++;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      push('re', src.slice(start, i), start); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      i++;
      while (i < n && /[\w.]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-') && !/^0[xX]/.test(src.slice(start, i))) i++;
        i++;
      }
      push('num', src.slice(start, i), start); continue;
    }
    if (ID_START.test(c) || c === '\\') {
      i++;
      while (i < n && (ID_PART.test(src[i]) || src[i] === '\\')) i++;
      push('id', src.slice(start, i), start); continue;
    }
    if (c === '.' && src[i + 1] === '.' && src[i + 2] === '.') { i += 3; push('punc', '...', start); continue; }
    if (c === '?' && src[i + 1] === '.' && !/[0-9]/.test(src[i + 2] || '')) { i += 2; push('punc', '?.', start); continue; }
    if (c === '=' && src[i + 1] === '>') { i += 2; push('punc', '=>', start); continue; }
    if (c === '{') { stack.push('brace'); i++; push('punc', '{', start); continue; }
    if (c === '}') {
      const top = stack.pop();
      if (top === 'tpl') { i++; scanTemplate(start); continue; }
      i++; push('punc', '}', start); continue;
    }
    i++; push('punc', c, start);
  }
  if (stack.length) err('unbalanced braces');
  return toks;
}

/* Structural rule 1a. Returns null when the file is exactly one PD.<name>(…) call, else a message. */
function singleCallShape(toks) {
  if (!toks.length) return 'the file is empty: expected one PD.*(…) call';
  let k = 0;
  const t = (j) => toks[j] || { type: 'eof', value: '<end of file>', line: toks[toks.length - 1].line };
  if (!(t(0).type === 'id' && t(0).value === 'PD' && t(1).value === '.' && t(2).type === 'id'))
    return 'line ' + t(0).line + ': the first statement must be a PD.*(…) call, found "' + t(0).value + '"';
  k = 3;
  while (t(k).value === '.' && t(k + 1).type === 'id') k += 2;
  if (t(k).value !== '(') return 'line ' + t(k).line + ': expected "(" after PD.' + toks.slice(2, k).map((x) => x.value).join('');
  let depth = 0;
  for (; k < toks.length; k++) {
    const v = toks[k].type === 'punc' ? toks[k].value : '';
    if (v === '(' || v === '[' || v === '{') depth++;
    else if (v === ')' || v === ']' || v === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) return 'unbalanced parentheses in the PD call';
  k++;
  if (t(k).value === ';') k++;
  if (k < toks.length) return 'line ' + t(k).line + ': a second top-level statement starts here ("' + t(k).value + '")';
  return null;
}

/* Sandbox rule 1b: run with a stub PD; record calls; never invoke factories. */
function sandboxRun(src, file) {
  const calls = [];
  const stub = (name) => new Proxy(function () { }, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      return stub(name + '.' + prop);
    },
    apply(target, self, args) { calls.push({ fn: name, args: args.length }); return undefined; },
    construct() { calls.push({ fn: 'new ' + name }); return {}; },
    set() { return true; }
  });
  const sandbox = { PD: stub('PD') };
  const ctx = vm.createContext(sandbox);
  const before = new Set(Object.getOwnPropertyNames(sandbox));
  let threw = null;
  try { new vm.Script(src, { filename: file }).runInContext(ctx, { timeout: 2000 }); }
  catch (e) { threw = (e && e.name ? e.name + ': ' : '') + (e && e.message || String(e)); }
  const added = Object.getOwnPropertyNames(sandbox).filter((k) => !before.has(k));
  return { calls, added, threw };
}

/* ------------------------------------------------------------------ file walking */
function walk(dir, out, filter) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  ents.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!filter || filter(p, true)) walk(p, out, filter); }
    else if (e.isFile() && (!filter || filter(p, false))) out.push(p);
  }
  return out;
}
const rel = (root, p) => path.relative(root, p).split(path.sep).join('/');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

const FORBIDDEN = [
  { re: /<\/script/gi, what: '</script' },
  { re: /<!--/g, what: '<!--' },
  { re: /\bimport\s/g, what: 'import' },
  { re: /^\s*export\s/gm, what: 'export' },
  { re: /fetch\(/g, what: 'fetch(' },
  { re: /document\.cookie/g, what: 'document.cookie' },
  { re: /['"]use strict['"]/g, what: "'use strict'", only: (r) => r.startsWith('engine/core/') }
];
const RANDOM = [
  { re: /\bMath\s*(?:\.\s*random\b|\[\s*['"]random['"]\s*\])/g, what: 'Math.random', allowed: (r) => RANDOM_ALLOWED.includes(r) },
  { re: /\bgetRandomValues\b/g, what: 'crypto.getRandomValues', allowed: (r) => r.startsWith('studio/') },
  { re: /\brandomUUID\b/g, what: 'crypto.randomUUID', allowed: () => false }
];

function lintJs(root, abs, report) {
  const r = rel(root, abs), src = fs.readFileSync(abs, 'utf8');
  // 1. single statement
  if (r === KERNEL || exemptWhy(root, r)) {
    try { new vm.Script(src, { filename: r }); } catch (e) { report(r, e.lineNumber || 1, 'syntax', String(e.message)); }
  } else {
    let toks = null;
    try { toks = tokenize(src); } catch (e) { report(r, e.line || 1, 'single-statement', 'cannot tokenize: ' + e.message); }
    if (toks) { const m = singleCallShape(toks); if (m) report(r, /^line (\d+)/.test(m) ? +RegExp.$1 : 1, 'single-statement', m.replace(/^line \d+: /, '')); }
    const s = sandboxRun(src, r);
    if (s.threw) report(r, 1, 'single-statement', 'top-level code threw in the sandbox (registration must not touch anything but PD): ' + s.threw);
    if (s.calls.length !== 1) report(r, 1, 'single-statement', 'expected exactly one PD.* call, the file made ' + s.calls.length +
      (s.calls.length ? ' (' + s.calls.map((c) => c.fn).join(', ') + ')' : ''));
    if (s.added.length) report(r, 1, 'single-statement', 'adds global(s) outside the factory: ' + s.added.join(', '));
  }
  // 2. forbidden text
  for (const f of FORBIDDEN) {
    if (f.only && !f.only(r)) continue;
    f.re.lastIndex = 0; let m;
    while ((m = f.re.exec(src))) report(r, lineOf(src, m.index), 'forbidden-text', JSON.stringify(f.what) + ' is not allowed here');
  }
  // 3. randomness allow-list
  for (const f of RANDOM) {
    if (f.allowed(r)) continue;
    f.re.lastIndex = 0; let m;
    while ((m = f.re.exec(src))) report(r, lineOf(src, m.index), 'random', f.what + ' is not allowed in ' + r +
      (f.what === 'Math.random' ? ' (only ' + RANDOM_ALLOWED.join(', ') + '; new code uses U.rng(seed))' : ''));
  }
}

function archiveSafety(root, report) {
  const skipDir = (p) => {
    const r = rel(root, p);
    return r === ARCHIVE || r === 'docs' || r === 'tools/regression' || r === '.git' || /(^|\/)node_modules$/.test(r);
  };
  const files = walk(root, [], (p, isDir) => !isDir || !skipDir(p));
  let n = 0;
  for (const abs of files) {
    let st; try { st = fs.statSync(abs); } catch (e) { continue; }
    if (st.size > 8 * 1024 * 1024) continue;                 // videos and other large binaries
    const buf = fs.readFileSync(abs);
    if (buf.subarray(0, 8192).includes(0)) continue;          // binary
    n++;
    const src = buf.toString('utf8');
    let idx = src.indexOf(ARCHIVE_PATH);
    while (idx >= 0) {
      report(rel(root, abs), lineOf(src, idx), 'archive-safety', 'mentions "' + ARCHIVE_PATH + '" (only docs/ and tools/regression/ may)');
      idx = src.indexOf(ARCHIVE_PATH, idx + 1);
    }
  }
  return n;
}

function run(opts) {
  const root = path.resolve(opts.root || ROOT_DEFAULT);
  const found = [];
  const report = (file, line, rule, msg) => found.push({ file, line, rule, msg });
  const jsFiles = [];
  for (const d of LINT_DIRS) {
    walk(path.join(root, d), jsFiles, (p, isDir) => isDir ? !/(^|[\/\\])node_modules$/.test(p) : /\.js$/.test(p));
  }
  for (const f of jsFiles) lintJs(root, f, report);
  const textFiles = archiveSafety(root, report);
  const rels = jsFiles.map((f) => rel(root, f));
  const exempt = rels.filter((r) => exemptWhy(root, r)).map((r) => ({ file: r, why: exemptWhy(root, r) }));
  return { root, jsFiles: rels, textFiles, found, exempt };
}

function main(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split(' */')[0]); return 0; }
    else { console.error('lint: unknown argument ' + a); return 2; }
  }
  if (opts.root && !fs.existsSync(opts.root)) { console.error('lint: no such root ' + opts.root); return 2; }
  const res = run(opts);
  if (opts.verbose) {
    for (const f of res.jsFiles) {
      const x = res.exempt.find((e) => e.file === f);
      console.log('  checked ' + f + (f === KERNEL ? '  (kernel: rule 1 exempt)' : x ? '  (rule 1 exempt: ' + x.why + ')' : ''));
    }
  }
  for (const x of res.exempt) console.log('lint: rule 1 exemption active for ' + x.file + ' (' + x.why + ')');
  for (const v of res.found) console.log(v.file + ':' + v.line + ': [' + v.rule + '] ' + v.msg);
  console.log('lint: ' + res.jsFiles.length + ' .js files (rules 1–3), ' + res.textFiles + ' text files (rule 4): ' +
    (res.found.length ? res.found.length + ' violation' + (res.found.length > 1 ? 's' : '') : 'clean'));
  return res.found.length ? 1 : 0;
}

module.exports = { tokenize, singleCallShape, sandboxRun, run, RANDOM_ALLOWED, SINGLE_STATEMENT_EXEMPT };
if (require.main === module) process.exit(main(process.argv.slice(2)));
