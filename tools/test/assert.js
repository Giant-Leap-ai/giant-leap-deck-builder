/* tools/test/assert.js — test registry + assertions for the pixeldeck unit-test harness (WP0, spec §9).
 *
 * Browser (loaded by tools/test/.harness.html after the engine and decks, before specs/*.test.js):
 *   T.test(name, fn(a) → void|Promise, opts?: { timeout: ms }; the default timeout is 10000 ms)
 *   T.skip(name, fn)                       registered but not run (reported as "# SKIP")
 *   a.ok(v, msg?)  a.equal(x, y, msg?)  a.deepEqual(x, y, msg?)  a.throws(fn, re?, msg?)  a.near(x, y, eps?, msg?)
 *   a.rejects(promiseOrFn, re?, msg?) → Promise     a.fail(msg)     a.count (assertions made)
 *   T.withTimeout(promise, ms, label?) → Promise (rejects with "timed out after ms ms")
 * Node (tools/test/e2e.js): module.exports = { makeAssert, diff, format, withTimeout }.
 *
 * equal: strict ===, except NaN equals NaN.
 * deepEqual: structural and strict. Arrays, plain objects (key order ignored; a missing key is not the
 * same as an undefined value), Map, Set, Date, RegExp, typed arrays, boxed primitives; cycles are
 * handled; functions compare by identity. The failure message names the path of the first difference.
 * throws: fn must throw synchronously; re (RegExp) must match the error message; re may also be a
 * constructor (instanceof). Returns the error.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T = api.T;
})(typeof window !== 'undefined' ? window : this, function () {
  var toStr = Object.prototype.toString;

  function AssertionError(msg) { var e = new Error(msg); e.name = 'AssertionError'; return e; }

  function format(v, depth) {
    depth = depth == null ? 2 : depth;
    if (typeof v === 'string') return JSON.stringify(v.length > 120 ? v.slice(0, 117) + '...' : v);
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (typeof v === 'bigint') return v + 'n';
    if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
    if (typeof v === 'symbol' || typeof v === 'boolean' || v == null) return String(v);
    var tag = toStr.call(v).slice(8, -1);
    if (v instanceof Date) return 'Date(' + (isNaN(v) ? 'Invalid' : v.toISOString()) + ')';
    if (v instanceof RegExp) return String(v);
    if (depth <= 0) return Array.isArray(v) ? '[Array(' + v.length + ')]' : '[' + tag + ']';
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      var items = Array.prototype.slice.call(v, 0, 8).map(function (x) { return format(x, depth - 1); });
      return (Array.isArray(v) ? '' : tag) + '[' + items.join(', ') + (v.length > 8 ? ', … ' + (v.length - 8) + ' more' : '') + ']';
    }
    if (v instanceof Map) return 'Map(' + v.size + ')';
    if (v instanceof Set) return 'Set(' + v.size + ')';
    var keys = Object.keys(v);
    var parts = keys.slice(0, 6).map(function (k) { return (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ': ' + format(v[k], depth - 1); });
    return (tag === 'Object' ? '' : tag + ' ') + '{' + parts.join(', ') + (keys.length > 6 ? ', … ' + (keys.length - 6) + ' more' : '') + '}';
  }

  function sameValue(x, y) { return x === y || (x !== x && y !== y); }
  function key(path, k) { return typeof k === 'number' ? path + '[' + k + ']' : /^[A-Za-z_$][\w$]*$/.test(k) ? path + '.' + k : path + '[' + JSON.stringify(k) + ']'; }

  /* Returns null when deep-equal, else "<path>: <reason>". */
  function diff(x, y, path, seen) {
    path = path || '';
    if (sameValue(x, y)) return null;
    var at = path || '(root)';
    if (typeof x !== typeof y) return at + ': ' + format(x) + ' !== ' + format(y) + ' (' + typeof x + ' vs ' + typeof y + ')';
    if (typeof x !== 'object' || x === null || y === null) return at + ': ' + format(x) + ' !== ' + format(y);
    var tx = toStr.call(x), ty = toStr.call(y);
    if (tx !== ty) return at + ': ' + tx + ' vs ' + ty;
    seen = seen || [];
    for (var s = 0; s < seen.length; s++) if (seen[s][0] === x) return seen[s][1] === y ? null : at + ': different cyclic structure';
    seen.push([x, y]);
    try {
      if (x instanceof Date) return sameValue(x.getTime(), y.getTime()) ? null : at + ': ' + format(x) + ' !== ' + format(y);
      if (x instanceof RegExp) return String(x) === String(y) ? null : at + ': ' + x + ' !== ' + y;
      if (tx === '[object Number]' || tx === '[object String]' || tx === '[object Boolean]')
        return sameValue(x.valueOf(), y.valueOf()) ? null : at + ': ' + format(x.valueOf()) + ' !== ' + format(y.valueOf());
      if (Array.isArray(x) || ArrayBuffer.isView(x)) {
        if (x.length !== y.length) return at + ': length ' + x.length + ' !== ' + y.length;
        for (var i = 0; i < x.length; i++) { var d = diff(x[i], y[i], key(path, i), seen); if (d) return d; }
        if (!Array.isArray(x)) return null;
      }
      if (x instanceof Map) {
        if (x.size !== y.size) return at + ': Map size ' + x.size + ' !== ' + y.size;
        var md = null;
        x.forEach(function (v, k) { if (md) return; if (!y.has(k)) md = at + ': Map key ' + format(k) + ' missing on the right'; else md = diff(v, y.get(k), path + '.get(' + format(k) + ')', seen); });
        return md;
      }
      if (x instanceof Set) {
        if (x.size !== y.size) return at + ': Set size ' + x.size + ' !== ' + y.size;
        var ys = Array.from(y), sd = null;
        x.forEach(function (v) {
          if (sd || y.has(v)) return;
          for (var j = 0; j < ys.length; j++) if (!diff(v, ys[j], '', seen.slice())) return;
          sd = at + ': Set value ' + format(v) + ' missing on the right';
        });
        return sd;
      }
      var kx = Object.keys(x), ky = Object.keys(y);
      for (var a = 0; a < kx.length; a++) if (!Object.prototype.hasOwnProperty.call(y, kx[a])) return key(path, kx[a]) + ': key missing on the right (left is ' + format(x[kx[a]]) + ')';
      for (var b = 0; b < ky.length; b++) if (!Object.prototype.hasOwnProperty.call(x, ky[b])) return key(path, ky[b]) + ': key missing on the left (right is ' + format(y[ky[b]]) + ')';
      if (kx.length !== ky.length) return at + ': different key sets';
      for (var c = 0; c < kx.length; c++) { var dd = diff(x[kx[c]], y[kx[c]], key(path, kx[c]), seen); if (dd) return dd; }
      return null;
    } finally { seen.pop(); }
  }

  function withTimeout(p, ms, label) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(AssertionError((label ? label + ' ' : '') + 'timed out after ' + ms + ' ms')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function makeAssert() {
    var a = { count: 0 };
    function fail(msg, extra) { throw AssertionError((msg ? msg + ': ' : '') + extra); }
    a.ok = function (v, msg) { a.count++; if (!v) fail(msg, 'expected a truthy value, got ' + format(v)); };
    a.equal = function (x, y, msg) { a.count++; if (!sameValue(x, y)) fail(msg, format(x) + ' !== ' + format(y)); };
    a.deepEqual = function (x, y, msg) { a.count++; var d = diff(x, y); if (d) fail(msg, 'deepEqual failed at ' + d); };
    a.near = function (x, y, eps, msg) {
      a.count++;
      if (eps == null) eps = 1e-9;
      if (typeof x !== 'number' || typeof y !== 'number' || !(Math.abs(x - y) <= eps)) fail(msg, format(x) + ' is not within ' + eps + ' of ' + format(y));
    };
    function check(err, re, msg) {
      if (re == null) return;
      if (typeof re === 'function' && !(re instanceof RegExp)) { if (!(err instanceof re)) fail(msg, 'error ' + format(String(err)) + ' is not an instance of ' + (re.name || 'the expected type')); return; }
      var text = err && err.message != null ? String(err.message) : String(err);
      if (!re.test(text)) fail(msg, 'error message ' + format(text) + ' does not match ' + re);
    }
    a.throws = function (fn, re, msg) {
      a.count++;
      if (typeof re === 'string') { msg = re; re = null; }
      try { fn(); } catch (e) { check(e, re, msg); return e; }
      fail(msg, 'expected the function to throw' + (re ? ' ' + re : ''));
    };
    a.rejects = function (p, re, msg) {
      a.count++;
      if (typeof re === 'string') { msg = re; re = null; }
      var pr;
      try { pr = Promise.resolve(typeof p === 'function' ? p() : p); } catch (e) { pr = Promise.reject(e); }
      return pr.then(function () { fail(msg, 'expected a rejection' + (re ? ' ' + re : '')); }, function (e) { check(e, re, msg); return e; });
    };
    a.fail = function (msg) { a.count++; throw AssertionError(msg || 'failed'); };
    return a;
  }

  /* ------------------------------------------------------------ browser registry + runner */
  var T = { version: 1 };
  var tests = [], current = null;
  function currentFile() {
    var s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
    if (!s) return '(unknown)';
    try { s = decodeURIComponent(s); } catch (e) { }
    return s.split(/[?#]/)[0].split('/').pop();
  }
  T.test = function (name, fn, opts) {
    if (typeof name !== 'string' || typeof fn !== 'function') throw new Error('T.test(name, fn): bad arguments');
    tests.push({ name: name, fn: fn, opts: opts || {}, file: currentFile(), skip: false });
  };
  T.skip = function (name, fn) { tests.push({ name: name, fn: fn, opts: {}, file: currentFile(), skip: true }); };
  T.tests = function () { return tests.map(function (t) { return { name: t.name, file: t.file, skip: t.skip }; }); };
  T.withTimeout = withTimeout;
  T.makeAssert = makeAssert;
  T.diff = function (x, y) { return diff(x, y); };
  T.format = format;

  if (typeof window !== 'undefined' && window.addEventListener) {
    var onErr = function (msg) { if (current) current.async.push(msg); else T.strayErrors.push(msg); };
    T.strayErrors = [];
    // file:// scripts are opaque origins, so Chrome may mute the message to "Script error."; the runner
    // prints the full error it receives from the browser next to the test.
    window.addEventListener('error', function (e) { onErr('uncaught: ' + (e.error && e.error.stack || e.message) + (/^Script error\.?$/.test(e.message) ? ' (full error printed by the runner above)' : '')); });
    window.addEventListener('unhandledrejection', function (e) { var r = e.reason; onErr('unhandled rejection: ' + (r && r.stack || r)); });
  }

  function out(line) {
    var el = typeof document !== 'undefined' && document.getElementById('pd-test-out');
    if (el) el.appendChild(document.createTextNode(line + '\n'));
  }

  /* run({ grep?: string (RegExp source, matched against "file › name"), timeout?: ms, report?: fn(result) }) */
  T.run = function (opts) {
    opts = opts || {};
    var re = opts.grep ? new RegExp(opts.grep) : null;
    var list = tests.filter(function (t) { return !re || re.test(t.file + ' › ' + t.name); });
    var results = [], i = 0, stray0 = T.strayErrors ? T.strayErrors.length : 0;   // load-time errors are reported by the runner
    function next() {
      if (i >= list.length) return Promise.resolve({ total: tests.length, results: results, stray: (T.strayErrors || []).slice(stray0) });
      var t = list[i++], n = i;
      var r = { n: n, file: t.file, name: t.name, ok: true, skip: t.skip, ms: 0, assertions: 0, error: null };
      if (t.skip) { results.push(r); if (opts.report) opts.report(r); out('ok ' + n + ' - ' + t.file + ' › ' + t.name + ' # SKIP'); return next(); }
      var a = makeAssert(), t0 = performance.now();
      current = { async: [] };
      var p;
      try { p = Promise.resolve(t.fn(a)); } catch (e) { p = Promise.reject(e); }
      return withTimeout(p, t.opts.timeout || opts.timeout || 10000, 'test')
        .then(function () { }, function (e) { r.ok = false; r.error = (e && e.stack) ? String(e.stack) : String(e); if (e && e.message && r.error.indexOf(e.message) < 0) r.error = e.message + '\n' + r.error; })
        .then(function () { return new Promise(function (res) { setTimeout(res, 0); }); })   // let stray async errors surface
        .then(function () {
          if (current.async.length) { r.ok = false; r.error = (r.error ? r.error + '\n' : '') + current.async.join('\n'); }
          current = null;
          r.ms = Math.round(performance.now() - t0); r.assertions = a.count;
          results.push(r);
          if (opts.report) opts.report(r);
          out((r.ok ? 'ok ' : 'not ok ') + n + ' - ' + t.file + ' › ' + t.name + (r.ok ? '' : '\n  ' + r.error));
          return next();
        });
    }
    return next();
  };

  return { T: T, makeAssert: makeAssert, diff: diff, format: format, withTimeout: withTimeout, AssertionError: AssertionError };
});
