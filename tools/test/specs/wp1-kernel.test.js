/* tools/test/specs/wp1-kernel.test.js — the pixeldeck kernel (spec §3.2, §4.1) and the M2 module wrappers (§3.3).
 * Kernel behaviour is tested on fresh kernel instances (PD.kernel(fakeGlobal)), so the harness's PD is never
 * modified. */

function freshKernel(g) { g = g || {}; PD.kernel(g); return g.PD; }
function fakeDoc(extra) {
  var body = document.createElement('div');
  var d = { currentScript: null, readyState: 'complete', body: body, documentElement: body,
            createElement: function (t) { return document.createElement(t); } };
  for (var k in extra || {}) d[k] = extra[k];
  return d;
}

T.test('kernel: a fresh instance is independent of the page PD and re-entry keeps the existing PD', function (a) {
  var K = freshKernel();
  a.ok(K && K !== PD, 'new PD object');
  a.equal(K.kernel, PD.kernel);
  a.equal(K.version, '2.0.0');
  a.equal(K.base, '', 'no document → no base, no autoload');
  var before = window.PD;
  PD.kernel(window);
  a.equal(window.PD, before, 'PD.kernel(window) is a no-op when a kernel is present');
});

T.test('PD.module: factories run at registration with PD and the deps\' exports, in dep order', function (a) {
  var K = freshKernel(), calls = [];
  var ea = K.module('t/a', [], function (P) { calls.push('a'); a.equal(P, K); return { x: 1 }; });
  a.deepEqual(ea, { x: 1 });
  K.module('t/b', [], function () { calls.push('b'); return { y: 2 }; });
  var depsArg = ['t/b', 't/a'];
  var ec = K.module('t/c', depsArg, function (P, b, aa) { calls.push('c'); return { sum: b.y * 10 + aa.x }; });
  depsArg.push('mutated');
  a.equal(ec.sum, 21);
  a.deepEqual(calls, ['a', 'b', 'c']);
  a.deepEqual(K.module('t/empty', [], function () { }), {}, 'a factory returning nothing exports {}');
  a.equal(K.get('t/c'), ec);
  a.ok(K.has('t/a') && !K.has('t/none'));
  var list = K.modules();
  a.deepEqual(list.map(function (m) { return m.name; }), ['t/a', 't/b', 't/c', 't/empty']);
  a.deepEqual(list[2].deps, ['t/b', 't/a'], 'registration keeps a copy of the deps array');
  a.equal(typeof list[0].factory, 'function');
  a.deepEqual(list[0].opts, {});
  K.module('t/opt', [], function () { }, { export: false });
  a.deepEqual(K.modules()[4].opts, { export: false });
});

T.test('PD.module: a duplicate module throws; a missing dependency throws and registers nothing', function (a) {
  var K = freshKernel(), ran = 0;
  K.module('t/a', [], function () { return {}; });
  a.throws(function () { K.module('t/a', [], function () { ran++; }); }, /pixeldeck: module "t\/a" is registered twice/);
  a.throws(function () { K.module('t/b', ['t/a', 't/later'], function () { ran++; }); }, /pixeldeck: module "t\/b" needs "t\/later" loaded first/);
  a.equal(ran, 0, 'no factory ran');
  a.ok(!K.has('t/b'), 't/b was not registered');
  a.throws(function () { K.get('t/b'); }, /pixeldeck: no module "t\/b"/);
});

T.test('registries: reg(name, def) → def, get/has/list, duplicates throw, prototype names are not entries', function (a) {
  var K = freshKernel();
  var kinds = { world: 'world', element: 'element', shape: 'shape', reveal: 'reveal', exitFx: 'exit', template: 'template',
                framework: 'framework', theme: 'theme', deck: 'deck' };
  Object.keys(kinds).forEach(function (fn) {
    var reg = K[fn], d1 = { n: 1 }, d2 = function () { };
    a.equal(reg.kind, kinds[fn], fn + '.kind');
    a.equal(reg('one', d1), d1, fn + ' returns def');
    a.equal(reg('two', d2), d2);
    a.equal(reg.get('one'), d1);
    a.ok(reg.has('two') && !reg.has('three'));
    a.equal(reg.get('three'), undefined);
    a.ok(!reg.has('toString') && reg.get('toString') === undefined && !reg.has('__proto__'), fn + ': prototype names');
    a.deepEqual(reg.list(), ['one', 'two']);
    reg.list().push('x');
    a.deepEqual(reg.list(), ['one', 'two'], fn + '.list() is a copy');
    a.throws(function () { reg('one', {}); }, new RegExp('pixeldeck: ' + kinds[fn] + ' "one" is registered twice'));
    a.equal(reg.get('one'), d1, fn + ': the first registration wins');
  });
});

T.test('PD.assets: merge per deck, get/put/remove', function (a) {
  var K = freshKernel();
  a.deepEqual(K.assets.get('none'), {});
  K.assets('d', { a: 1 });
  K.assets('d', { b: 2 });
  a.deepEqual(K.assets.get('d'), { a: 1, b: 2 });
  K.assets.put('d', 'c', 3); K.assets.put('e', 'z', 9);
  K.assets.remove('d', 'a'); K.assets.remove('nope', 'a');
  a.deepEqual(K.assets.get('d'), { b: 2, c: 3 });
  a.deepEqual(K.assets.get('e'), { z: 9 });
});

T.test('PD.missing() lists absent required modules; PD.start then shows the on-screen panel instead of booting', function (a) {
  var doc = fakeDoc(), K = freshKernel({ document: doc });
  var required = K.MANIFEST.filter(function (m) { return m[1]; }).map(function (m) { return m[0]; });
  a.ok(required.length > 0);
  a.deepEqual(K.missing(), required);
  K.module('core/util', [], function () { return {}; });
  a.deepEqual(K.missing(), required.filter(function (n) { return n !== 'core/util'; }));
  var r = K.start('one-giant-leap');
  a.equal(r, undefined);
  var panel = doc.body.querySelector('[data-pd-fail]');
  a.ok(panel, 'panel shown');
  a.equal(panel.textContent, 'pixeldeck: missing engine files: ' + K.missing().join(', '));
  a.equal(panel.style.position, 'fixed');
  a.equal(panel.style.backgroundColor, 'rgb(0, 0, 0)');
  a.equal(panel.style.color, 'rgb(255, 255, 255)');
  a.ok(/monospace/.test(panel.style.fontFamily), 'monospace');
});

T.test('PD.fail never throws, and waits for <body> when called from <head>', function (a) {
  var K1 = freshKernel({ document: fakeDoc({ createElement: function () { throw new Error('no DOM'); } }) });
  K1.fail('x');
  K1.fail({ toString: function () { throw new Error('bad toString'); } });
  freshKernel({}).fail('no document at all');
  var cb = null, root = document.createElement('div');
  var K2 = freshKernel({ document: fakeDoc({ body: null, documentElement: root, addEventListener: function (ev, fn) { if (ev === 'DOMContentLoaded') cb = fn; } }) });
  K2.fail('later');
  a.ok(cb, 'deferred to DOMContentLoaded');
  a.equal(root.children.length, 0);
  cb();
  a.equal(root.firstChild.textContent, 'later');
});

T.test('loader: writes one <script> per MANIFEST entry in order; refuses defer/async; PD_NO_AUTOLOAD skips', function (a) {
  var written = [];
  var cs = { src: 'file:///x/y/engine/pixeldeck.js' };
  var K = freshKernel({ document: fakeDoc({ currentScript: cs, readyState: 'loading', write: function (s) { written.push(s); } }) });
  a.equal(K.base, 'file:///x/y/engine/');
  a.deepEqual(written, K.MANIFEST.map(function (m) { return '<script src="file:///x/y/engine/' + m[0] + '.js"><\/script>'; }));
  a.throws(function () { freshKernel({ document: fakeDoc({ currentScript: cs, readyState: 'interactive' }) }); }, /must be loaded by a plain <script src>/);
  var w2 = [];
  freshKernel({ PD_NO_AUTOLOAD: 1, document: fakeDoc({ currentScript: cs, readyState: 'loading', write: function (s) { w2.push(s); } }) });
  a.equal(w2.length, 0);
});

T.test('MANIFEST: unique names, files under engine/, the §3.2 list in order', function (a) {
  var names = PD.MANIFEST.map(function (m) { return m[0]; });
  a.deepEqual(names, ['core/util', 'core/ease', 'core/glow', 'core/fx', 'core/space', 'core/earth', 'core/shapes', 'core/field', 'core/text',
    'core/theme', 'core/assets', 'core/compile', 'core/stage', 'core/sync', 'core/thumbs', 'core/hud', 'core/player', 'core/notes',
    'core/export', 'worlds/core', 'worlds/cosmos', 'worlds/planet', 'worlds/spark', 'worlds/ambient', 'worlds/photo',
    'elements/image', 'elements/counter', 'templates/cinematic', 'templates/essentials', 'core/validate',
    'story/copy', 'story/frameworks', 'story/interview', 'story/timing', 'story/board', 'story/lint']);
  PD.MANIFEST.forEach(function (m) { a.ok(m[1] === 0 || m[1] === 1, m[0] + ' flag'); });
});

T.test('MANIFEST flags equal §3.2: every WP1 module is required; other packages\' files are optional until the release', function (a) {
  // §3.2 flags these 0 (files of parallel packages); the release flips every flag to 1.
  var SPEC_OPTIONAL = ['core/export', 'worlds/ambient', 'worlds/photo', 'elements/image', 'elements/counter',
    'templates/cinematic', 'templates/essentials', 'core/validate',
    'story/copy', 'story/frameworks', 'story/interview', 'story/timing', 'story/board', 'story/lint'];
  PD.MANIFEST.forEach(function (m) {
    a.equal(m[1], SPEC_OPTIONAL.indexOf(m[0]) >= 0 ? 0 : 1, m[0] + ': MANIFEST flag as in spec §3.2');
  });
});

T.test('M6: the M2 placeholders are gone; core/sync, thumbs, hud, player and notes register with no side effects (§3.1 rule 4)', function (a) {
  // Re-run each factory from its toString() in a fresh realm (as export re-emits it) on an isolated kernel, with the
  // harness's exports of its deps: it must draw no random number, add no global, touch no DOM, add no listener and
  // register nothing beyond its own PD.* entry points.
  var expect = {
    'core/sync': { exports: ['Sync'], pd: ['Sync'] }, 'core/thumbs': { exports: ['Thumbs'], pd: ['Thumbs'] },
    'core/hud': { exports: ['PAGE_CSS', 'SCOPED_CSS', 'install'], pd: [] },
    'core/player': { exports: ['boot', 'editable', 'selfTest', 'start'], pd: ['boot'] }, 'core/notes': { exports: ['notes'], pd: ['notes'] }
  };
  Object.keys(expect).forEach(function (n) {
    var rec = PD.modules().filter(function (m) { return m.name === n; })[0];
    a.ok(rec, n + ' is registered');
    if (!rec) return;
    a.deepEqual(Object.keys(PD.get(n)).sort(), expect[n].exports, n + ' exports (no longer the M2 placeholder {})');
    var fr = document.createElement('iframe');
    fr.style.display = 'none';
    document.body.appendChild(fr);
    try {
      var w = fr.contentWindow, K = freshKernel(), calls = 0, adds = 0;
      w.Math.random = function () { calls++; return 0.5; };
      w.addEventListener = function () { adds++; };
      w.document.addEventListener = function () { adds++; };
      var keys = Object.keys(w).join(','), html = w.document.documentElement.outerHTML, pdKeys = Object.keys(K).sort().join(',');
      var args = [K].concat(rec.deps.map(function (d) { return PD.get(d); }));
      var out = w.eval('(' + rec.factory.toString() + ')').apply(null, args);
      a.deepEqual(Object.keys(out).sort(), expect[n].exports, n + ' factory exports');
      a.equal(calls, 0, n + ' factory calls Math.random');
      a.equal(adds, 0, n + ' factory adds an event listener');
      a.equal(Object.keys(w).join(','), keys, n + ' factory adds no global');
      a.equal(w.document.documentElement.outerHTML, html, n + ' factory touches no DOM');
      a.deepEqual(K.modules(), [], n + ' factory registers no module');
      ['world', 'element', 'shape', 'reveal', 'exitFx', 'template', 'framework', 'theme', 'deck'].forEach(function (r) {
        a.deepEqual(K[r].list(), [], n + ' factory registers no ' + r);
      });
      var added = Object.keys(K).filter(function (k) { return pdKeys.split(',').indexOf(k) < 0; }).sort();
      a.deepEqual(added, expect[n].pd, n + ' adds exactly its PD entry points');
    } finally { fr.remove(); }
  });
});

T.test('engine (M2): every required module is registered, in MANIFEST order, each after its deps', function (a) {
  a.deepEqual(PD.missing(), []);
  var order = PD.MANIFEST.map(function (m) { return m[0]; });
  var mods = PD.modules().filter(function (m) { return order.indexOf(m.name) >= 0; });
  var idx = mods.map(function (m) { return order.indexOf(m.name); });
  a.deepEqual(idx, idx.slice().sort(function (x, y) { return x - y; }), 'registration order follows the MANIFEST');
  var seen = {};
  mods.forEach(function (m) {
    m.deps.forEach(function (d) { a.ok(seen[d], m.name + ' needs ' + d + ' registered earlier'); });
    seen[m.name] = 1;
  });
});

T.test('M6: PD.compat is deleted, and no engine name is a global any more (§3.3 list, Show, theme values)', function (a) {
  a.equal(PD.compat, undefined, 'PD.compat');
  a.ok(!/compat/.test(PD.kernel.toString()), 'the kernel source no longer mentions compat');
  var names = ['DW', 'DH', 'CX', 'CY', 'U', 'COLORS', 'col', 'Glow', 'FX', 'NEBULA_PRESETS', 'Space', 'Earth', 'Shapes', 'Field',
               'FONT', 'STYLES', 'TextLayer', 'WORLD_DEFAULTS', 'Stage', 'Sync', 'Show', 'Ease', 'Timeline'];
  a.equal(names.length, 23, 'the 23 names of the §3.3 compat table');
  a.deepEqual(names.filter(function (n) { return n in window; }), [], 'none is a global');
  PD.modules().forEach(function (m) {
    a.ok(!/PD\.compat\s*\(/.test(m.factory.toString()), m.name + ' calls no PD.compat');
  });
  // the engine is reached through PD only
  a.equal(PD.Stage, PD.get('core/stage').Stage);
  a.equal(PD.Sync, PD.get('core/sync').Sync);
  a.equal(PD.Thumbs, PD.get('core/thumbs').Thumbs);
  a.equal(PD.boot, PD.get('core/player').boot);
  a.equal(PD.notes, PD.get('core/notes').notes);
  a.deepEqual([PD.get('core/util').DW, PD.get('core/util').DH, PD.get('core/util').CX, PD.get('core/util').CY], [1920, 1080, 960, 540]);
});
