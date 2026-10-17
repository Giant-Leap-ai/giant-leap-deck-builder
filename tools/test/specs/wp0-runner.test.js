/* tools/test/specs/wp0-runner.test.js — self-test of the WP0 unit-test harness: the assertion
 * library, the test registry and the generated harness's load order. Needs no engine. */

T.test('a.ok accepts truthy values and rejects falsy ones', function (a) {
  var b = T.makeAssert();
  b.ok(1); b.ok('x'); b.ok({}); b.ok([]);
  [0, '', null, undefined, NaN, false].forEach(function (v) {
    a.throws(function () { b.ok(v); }, /expected a truthy value/);
  });
  a.throws(function () { b.ok(false, 'my label'); }, /^my label: /);
});

T.test('a.equal is strict, and NaN equals NaN', function (a) {
  var b = T.makeAssert();
  b.equal(1, 1); b.equal('a', 'a'); b.equal(NaN, NaN); b.equal(null, null);
  var o = {}; b.equal(o, o);
  a.throws(function () { b.equal(1, '1'); }, /1 !== "1"/);
  a.throws(function () { b.equal({}, {}); }, /!==/);
  a.throws(function () { b.equal(null, undefined); }, /null !== undefined/);
});

T.test('a.deepEqual accepts structurally equal values', function (a) {
  var b = T.makeAssert();
  b.deepEqual({ x: 1, y: [1, 2, { z: 'q' }] }, { y: [1, 2, { z: 'q' }], x: 1 });   // key order ignored
  b.deepEqual([NaN, -1, 'a'], [NaN, -1, 'a']);
  b.deepEqual(new Map([['k', { v: 1 }]]), new Map([['k', { v: 1 }]]));
  b.deepEqual(new Set([1, 'two', 3]), new Set([3, 1, 'two']));
  b.deepEqual(new Set([{ a: 1 }]), new Set([{ a: 1 }]));
  b.deepEqual(new Date(5), new Date(5));
  b.deepEqual(/a+/g, /a+/g);
  b.deepEqual(new Float32Array([1, 2.5]), new Float32Array([1, 2.5]));
  var c1 = { name: 'c' }; c1.self = c1;
  var c2 = { name: 'c' }; c2.self = c2;
  b.deepEqual(c1, c2);                                                                 // cycles
  var f = function () { }; b.deepEqual({ f: f }, { f: f });
  a.equal(b.count, 10);
});

T.test('a.deepEqual rejects differences and names the path of the first one', function (a) {
  var b = T.makeAssert();
  a.throws(function () { b.deepEqual({ s: [{ t: 'a' }] }, { s: [{ t: 'b' }] }); }, /at \.s\[0\]\.t: "a" !== "b"/);
  a.throws(function () { b.deepEqual([], {}); }, /Array.*Object/);
  a.throws(function () { b.deepEqual({ a: undefined }, {}); }, /\.a: key missing on the right/);
  a.throws(function () { b.deepEqual({}, { a: 1 }); }, /\.a: key missing on the left/);
  a.throws(function () { b.deepEqual([1], ['1']); }, /\[0\]/);
  a.throws(function () { b.deepEqual([1, 2], [1, 2, 3]); }, /length 2 !== 3/);
  a.throws(function () { b.deepEqual(new Map([['k', 1]]), new Map([['k', 2]])); }, /get\("k"\)/);
  a.throws(function () { b.deepEqual(new Set([1]), new Set([2])); }, /Set value 1 missing/);
  a.throws(function () { b.deepEqual(new Float32Array([1]), new Float64Array([1])); }, /Float32Array.*Float64Array/);
  a.throws(function () { b.deepEqual(function () { }, function () { }); }, /!==/);
  a.throws(function () { b.deepEqual({ 'odd key': 1 }, { 'odd key': 2 }); }, /\["odd key"\]: 1 !== 2/);
});

T.test('a.throws checks the message, the type, and that something was thrown', function (a) {
  var b = T.makeAssert();
  var e = b.throws(function () { throw new TypeError('bad thing 42'); }, /thing \d+/);
  a.ok(e instanceof TypeError, 'returns the error');
  b.throws(function () { throw new TypeError('x'); }, TypeError);
  b.throws(function () { throw 'a string'; }, /a string/);
  a.throws(function () { b.throws(function () { }); }, /expected the function to throw/);
  a.throws(function () { b.throws(function () { throw new Error('nope'); }, /yes/); }, /does not match \/yes\//);
  a.throws(function () { b.throws(function () { throw new Error('x'); }, RangeError); }, /not an instance of RangeError/);
});

T.test('a.near compares within eps', function (a) {
  var b = T.makeAssert();
  b.near(0.1 + 0.2, 0.3);
  b.near(1, 1.04, 0.05);
  a.throws(function () { b.near(1, 1.1, 0.05); }, /not within 0\.05/);
  a.throws(function () { b.near(NaN, NaN, 1); }, /not within/);
  a.throws(function () { b.near('1', 1, 1); }, /not within/);
});

T.test('async tests: a returned promise is awaited', function (a) {
  var t0 = performance.now();
  return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
    a.ok(performance.now() - t0 >= 25, 'the runner waited for the promise');
  });
});

T.test('a.rejects and T.withTimeout', async function (a) {
  var b = T.makeAssert();
  var e = await b.rejects(Promise.reject(new Error('boom 7')), /boom \d/);
  a.equal(e.message, 'boom 7');
  await b.rejects(function () { throw new Error('sync throw counts'); }, /sync throw/);
  await a.rejects(b.rejects(Promise.resolve(1)), /expected a rejection/);
  await a.rejects(T.withTimeout(new Promise(function () { }), 30, 'never'), /never timed out after 30 ms/);
  a.equal(await T.withTimeout(Promise.resolve(5), 1000), 5);
});

T.test('T.test records the spec file of each test', function (a) {
  var mine = T.tests().filter(function (t) { return t.name === 'T.test records the spec file of each test'; });
  a.equal(mine.length, 1);
  a.equal(mine[0].file, 'wp0-runner.test.js');
  a.throws(function () { T.test('no function'); }, /bad arguments/);
});

T.test('harness runs from file:// as a secure context with no network', function (a) {
  a.equal(location.protocol, 'file:');
  a.ok(/\/tools\/test\/\.harness\.html$/.test(location.pathname), 'generated harness path: ' + location.pathname);
  a.equal(window.isSecureContext, true);
});

T.test('harness load order: engine, themes, deck themes, deck assets, decks, assert.js, specs (each alphabetical)', function (a) {
  var order = ['engine', 'themes', 'deck themes', 'deck assets', 'decks', 'assert', 'specs'];
  var tags = Array.prototype.filter.call(document.scripts, function (s) { return s.getAttribute('data-group'); });
  var groups = tags.map(function (s) { return s.getAttribute('data-group'); });
  var srcs = tags.map(function (s) { return s.getAttribute('src'); });
  for (var i = 1; i < groups.length; i++) a.ok(order.indexOf(groups[i - 1]) <= order.indexOf(groups[i]), 'group order at ' + srcs[i]);
  order.forEach(function (g) {
    var list = srcs.filter(function (s, i) { return groups[i] === g; });
    a.deepEqual(list, list.slice().sort(), g + ' scripts are alphabetical');
  });
  a.equal(groups.filter(function (g) { return g === 'assert'; }).length, 1, 'assert.js once');
  a.ok(srcs.every(function (s, i) {
    var g = groups[i];
    return g === 'engine' ? /engine\/pixeldeck\.js$/.test(s) : g === 'themes' ? /^\.\.\/\.\.\/themes\/[^/]+\/theme\.js$/.test(s)
      : g === 'deck themes' ? /^\.\.\/\.\.\/decks\/[^/]+\/theme\.js$/.test(s) : g === 'deck assets' ? /^\.\.\/\.\.\/decks\/[^/]+\/assets\.js$/.test(s)
      : g === 'decks' ? /^\.\.\/\.\.\/decks\/[^/]+\/deck\.js$/.test(s) : g === 'assert' ? s === 'assert.js' : /\.test\.js$/.test(s);
  }), 'every script is in the right group: ' + srcs.join(' '));
  a.ok(document.querySelector('script[data-group="specs"]'), 'at least one spec loaded');
});

T.test('when the engine kernel is present, every required engine module loaded', function (a) {
  if (!window.PD || !PD.kernel) { a.ok(!document.querySelector('script[data-group="engine"]'), 'no kernel script, no PD'); return; }
  a.equal(typeof PD.missing, 'function');
  a.deepEqual(PD.missing(), [], 'PD.missing()');
});
