/* tools/test/specs/wp1-plugins.test.js — M4 plugins (spec §4.5 worlds and passes, crossfade stacks, warmTick; §4.6 element
 * registry; §4.7 shape, reveal and exit registries; §8.2 M4). Anything that registers a plugin runs on a FRESH engine:
 * the module factories re-registered on PD.kernel(fakeGlobal), so the harness registries are never modified.
 * Tests that only read use the harness engine. M5: a Stage takes a compiled deck ({ deck }); on a fresh engine the tests
 * build the smallest CompiledDeck by hand (m4Compiled), on the harness engine they use PD.compile. */

var M4_CORE = ['core/util', 'core/ease', 'core/glow', 'core/fx', 'core/space', 'core/earth', 'core/shapes', 'core/field',
               'core/text', 'core/theme', 'core/assets', 'core/stage'];
var M4_WORLDS = ['worlds/core', 'worlds/cosmos', 'worlds/planet', 'worlds/spark'];
function m4Engine(names) {             // a fresh kernel with the harness's factories re-registered, in this order
  var g = {}; PD.kernel(g);
  var K = g.PD, all = PD.modules();
  (names || M4_CORE).forEach(function (n) {
    var rec = all.filter(function (m) { return m.name === n; })[0];
    if (!rec) throw new Error('m4Engine: no module ' + n);
    K.module(n, rec.deps, rec.factory, rec.opts);
  });
  return K;
}
function m4ThemeSrc(worlds, extra) {
  var t = {
    label: 'M4', worlds: worlds, fonts: { display: 'sans-serif' }, colors: { white: '#ffffff' },
    styles: { title: { weight: 600, size: 40, track: 0.1, fill: '#ffffff' } },
    nebulae: { n1: ['#010101', '#020202', '#030303'] }, world: {},
    motion: { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' },
    timing: { worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
              settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9 },
    ui: { accent: '#abcabc' }
  };
  for (var k in extra || {}) t[k] = extra[k];
  return t;
}
var m4ThemeN = 0;
function m4Theme(K, worlds, extra) { var id = 'm4t' + (m4ThemeN++); K.theme(id, m4ThemeSrc(worlds, extra)); return K.theme.resolve(id); }
function m4Compiled(theme, scenes, worlds) {   // the smallest CompiledDeck a Stage takes (spec §4.3, §4.9)
  return { id: 'm4', meta: {}, source: null, theme: theme, themeKey: theme.key,
           worlds: ['core'].concat(theme.worlds || [], worlds || []), scenes: scenes || [], sceneKeys: [], errors: [] };
}
function m4Canvas(w, h) { var c = document.createElement('canvas'); c.width = w || 64; c.height = h || 36; return c; }
function m4FakeLayer(spec) {           // the smallest Layer (spec §4.6) a custom element kind can return
  return {
    spec: spec, kind: spec.kind, id: spec.id || null, o: {}, reveal: 'fade', exitKind: 'fade',
    inStart: Infinity, inDur: 1, outStart: Infinity, outDur: 1, arriveAt: Infinity, particleAlpha: 1, drawn: 0,
    reset: function () { this.inStart = Infinity; this.outStart = Infinity; },
    startOut: function (t) { if (this.outStart === Infinity) this.outStart = t; },
    animating: function (t) { return this.outStart !== Infinity ? t < this.outStart + this.outDur : t < this.inStart + this.inDur; },
    gone: function (t) { return this.outStart !== Infinity && t >= this.outStart + this.outDur; },
    ensureCache: function () { }, draw: function () { this.drawn++; }
  };
}
function m4Warns(fn) {                 // console.warn calls made by fn
  var got = [], orig = console.warn;
  console.warn = function (m) { got.push(String(m)); };
  try { fn(); } finally { console.warn = orig; }
  return got;
}
var M4_PARAMS = {                      // spec §4.5 "Param ownership"
  core: 'roll shake letterbox exposure vignette grain particles',
  cosmos: 'speed warp warpColor stars nebula nebulaAmount backdrop dust galaxy galaxyX galaxyY galaxyScale galaxyTilt',
  planet: 'earth earthX earthY earthR earthPitch earthRot earthSpin lightX lightY lightZ sun sunX sunY sunScale',
  spark: 'spark sparkX sparkY'
};
var M4_TABLE = [                       // spec §4.5 "Draw order" for core + cosmos + planet + spark
  'cosmos.background 0 screen', 'cosmos.backdrop 10 camera', 'cosmos.galaxy 20 camera', 'cosmos.nebulae 30 camera',
  'cosmos.stars 40 camera', 'planet.earth 50 camera', 'planet.sun 60 camera', 'cosmos.dust 70 screen',
  'core.particles 80 screen', 'spark.glow 90 screen', 'core.elements 100 screen', 'core.flash 110 post',
  'core.vignette 120 post', 'core.grain 130 post', 'core.exposure 140 post', 'core.letterbox 150 post', 'core.blackout 160 post'
];

T.test('worlds (§4.5): core, cosmos, planet, spark own exactly the §4.5 params; their union is today\'s WORLD_DEFAULTS', function (a) {
  var D = PD.get('core/stage').WORLD_DEFAULTS, union = {}, n = 0;
  Object.keys(M4_PARAMS).forEach(function (w) {
    var def = PD.world.get(w);
    a.ok(def, w + ' is registered');
    a.deepEqual(Object.keys(def.params).sort(), M4_PARAMS[w].split(' ').sort(), w + ' params');
    for (var p in def.params) { union[p] = def.params[p]; n++; a.equal(PD.world.owner(p), w, p + ' is owned by ' + w); }
  });
  a.equal(n, 37);
  a.deepEqual(union, D, 'the union of the four plugins\' defaults equals WORLD_DEFAULTS, key by key');
  a.deepEqual(PD.world.get('cosmos').crossfade, ['nebula']);
  ['core', 'planet', 'spark'].forEach(function (w) { a.ok(!PD.world.get(w).crossfade, w + ' has no crossfade param'); });
  a.equal(PD.world.owner('nope'), undefined);
  a.equal(PD.world.owner('constructor'), undefined, 'prototype names are not params');
  ['get', 'has', 'list'].forEach(function (k) { a.equal(typeof PD.world[k], 'function', 'PD.world.' + k); });
  a.equal(PD.world.kind, 'world');
});

T.test('pass list (§4.5): the registered passes, and an OGL stage\'s sorted passes, are exactly the §4.5 table', function (a) {
  var mine = { core: 1, cosmos: 1, planet: 1, spark: 1 };
  var reg = PD.world.passes().filter(function (q) { return mine[q.world]; }).map(function (q) { return q.world + '.' + q.name + ' ' + q.z + ' ' + q.space; });
  a.deepEqual(reg, M4_TABLE, 'PD.world.passes() in draw order');
  var st = new (PD.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: PD.compile('one-giant-leap') });
  a.deepEqual(st.worlds, ['core', 'cosmos', 'planet', 'spark']);
  a.deepEqual(st.passes.map(function (q) { return q.world + '.' + q.name + ' ' + q.z + ' ' + q.space; }), M4_TABLE);
  st.passes.forEach(function (q) { a.equal(q.state, st.worldStates[q.world], q.name + ' gets its world\'s state'); });
  a.ok(!('neb' in st) && !('space' in st) && !('spinAcc' in st) && !('earthBudget' in st), 'the old stage fields are gone');
  a.ok(st.worldStates.cosmos.space instanceof PD.get('core/space').Space.World, 'cosmos state: a Space.World');
  a.deepEqual(st.worldStates.planet, { spinAcc: 0, budget: 240000 }, 'planet state: spin accumulator + Earth budget');
});

T.test('PD.world validation: duplicate world or param, bad params/crossfade/hooks/passes and a split camera run throw, registering nothing', function (a) {
  var K = m4Engine(M4_CORE.concat(M4_WORLDS));
  var before = K.world.list(), draw = function () { };
  var cam = function (z, name) { return { z: z, space: 'camera', name: name || 'c', draw: draw }; };
  a.throws(function () { K.world('cosmos', { params: {}, passes: [] }); }, /pixeldeck: world "cosmos" is registered twice/);
  a.throws(function () { K.world('x', { params: { mood: 'a', speed: 1 }, passes: [] }); }, /world "x" param "speed" is already owned by world "cosmos"/);
  a.throws(function () { K.world('x', { params: { mood: {} }, passes: [] }); }, /param "mood" must default to a number or a string/);
  a.throws(function () { K.world('x', { params: [], passes: [] }); }, /world "x" needs params/);
  a.throws(function () { K.world('x', null); }, /world "x" needs a plugin object/);
  a.throws(function () { K.world('x', { params: { mood: 'a' }, crossfade: ['other'], passes: [] }); }, /crossfade param "other" is not one of its params/);
  a.throws(function () { K.world('x', { params: { level: 1 }, crossfade: ['level'], passes: [] }); }, /crossfade param "level" must default to a string/);
  a.throws(function () { K.world('x', { params: {}, warmed: function () { return true; }, passes: [] }); }, /needs both warmed and warm, or neither/);
  a.throws(function () { K.world('x', { params: {}, update: 5, passes: [] }); }, /update must be a function/);
  a.throws(function () { K.world('x', { params: {} }); }, /needs passes \(array\)/);
  a.throws(function () { K.world('x', { params: {}, passes: [{ z: 1, space: 'world', name: 'p', draw: draw }] }); }, /space must be screen, camera or post/);
  a.throws(function () { K.world('x', { params: {}, passes: [{ z: NaN, space: 'screen', name: 'p', draw: draw }] }); }, /needs a finite z/);
  a.throws(function () { K.world('x', { params: {}, passes: [{ z: 1, space: 'screen', name: 'p' }] }); }, /pass "p" needs draw\(\)/);
  a.throws(function () { K.world('x', { params: {}, passes: [cam(41, 'p'), cam(42, 'p')] }); }, /has two passes named "p"/);
  a.throws(function () { K.world('x', { params: {}, passes: [{ z: 35, space: 'screen', name: 'mid', draw: draw }] }); },
           /pass "x\.mid" \(z 35, screen\) would split the camera passes/);
  a.throws(function () { K.world('x', { params: {}, passes: [cam(75)] }); }, /pass "cosmos\.dust" \(z 70, screen\) would split the camera passes/);
  a.throws(function () { K.world('x', { params: {}, passes: [{ z: 50, space: 'post', name: 'tie', draw: draw }] }); },
           /pass "x\.tie" \(z 50, post\) would split the camera passes/, 'an equal z sorts after the earlier registration (planet.earth), before planet.sun');
  a.deepEqual(K.world.list(), before, 'nothing was registered');
  a.equal(K.world.owner('mood'), undefined, 'no param was claimed');
  // allowed: inside the run, right before it, and anything outside it
  K.world('inner', { params: { mood: 'calm' }, crossfade: ['mood'], passes: [cam(45, 'haze'), cam(5, 'veil'), { z: 60, space: 'screen', name: 'late', draw: draw }] });
  a.equal(K.world.owner('mood'), 'inner');
  var order = K.world.passes().map(function (q) { return q.world + '.' + q.name; });
  a.deepEqual(order.slice(0, 9), ['cosmos.background', 'inner.veil', 'cosmos.backdrop', 'cosmos.galaxy', 'cosmos.nebulae', 'cosmos.stars',
    'inner.haze', 'planet.earth', 'planet.sun']);
  a.equal(order[9], 'inner.late', 'z 60 after planet.sun (registered earlier) ends the run without splitting it');
  a.throws(function () { K.world('again', { params: { mood: 'x' }, passes: [] }); }, /param "mood" is already owned by world "inner"/);
});

T.test('Stage.draw (§4.5): the camera transform wraps exactly the camera run; shake jitter = 2 randoms only when shaking', function (a) {
  var K = m4Engine(M4_CORE.concat(['worlds/core']));
  var seen = [], tf = function (ctx) { var m = ctx.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f]; };
  var rec = function (name) { return function (ctx, W, st, f) { seen.push({ name: name, m: tf(ctx), st: st, f: f }); }; };
  K.world('tw', { params: { twv: 1 }, create: function () { return { mine: 1 }; }, passes: [
    { z: 5, space: 'screen', name: 's5', draw: rec('s5') }, { z: 20, space: 'camera', name: 'c20', draw: rec('c20') },
    { z: 10, space: 'camera', name: 'c10', draw: rec('c10') }, { z: 30, space: 'screen', name: 's30', draw: rec('s30') },
    { z: 200, space: 'post', name: 'p200', draw: rec('p200') }] });
  K.world('unused', { params: { u: 1 }, passes: [{ z: 15, space: 'camera', name: 'u15', draw: rec('u15') }] });
  var th = m4Theme(K, ['tw'], { world: { roll: 0.4 } });
  var cv = m4Canvas(480, 270), st = new (K.get('core/stage').Stage)(cv, { thumb: true, deck: m4Compiled(th) });
  st.resize(480, 270, 1);
  a.deepEqual(st.passes.map(function (q) { return q.world + '.' + q.name; }), ['tw.s5', 'tw.c10', 'tw.c20', 'tw.s30', 'core.particles',
    'core.elements', 'core.flash', 'core.vignette', 'core.grain', 'core.exposure', 'core.letterbox', 'core.blackout', 'tw.p200'],
    'enabled passes only, by z then registration order');
  var expect = function (jx, jy) {
    var x = m4Canvas().getContext('2d'), base, cam;
    x.setTransform(st.S, 0, 0, st.S, st.ox, st.oy); base = tf(x);
    x.translate(960 + jx, 540 + jy); x.rotate(0.4); x.translate(-960, -540); cam = tf(x);
    return { base: base, cam: cam };
  };
  var near = function (m, e, msg) { for (var i = 0; i < 6; i++) a.near(m[i], e[i], 1e-9, msg + ' [' + i + ']'); };
  var calls = 0, orig = Math.random;
  Math.random = function () { calls++; return 0.75; };
  try { st.draw(); } finally { Math.random = orig; }
  a.equal(calls, 0, 'no shake: no random');
  var E = expect(0, 0), by = {};
  seen.forEach(function (s) { by[s.name] = s; });
  a.deepEqual(seen.map(function (s) { return s.name; }), ['s5', 'c10', 'c20', 's30', 'p200']);
  near(by.s5.m, E.base, 's5 sees the design transform'); near(by.s30.m, E.base, 's30 too (camera restored)');
  near(by.p200.m, E.base, 'post too');
  near(by.c10.m, E.cam, 'c10 sees the camera'); near(by.c20.m, E.cam, 'c20 too');
  a.deepEqual(by.c10.st, { mine: 1 }, 'a pass gets its world state');
  a.equal(by.c10.f.stage, st); a.equal(by.c10.f.xf, st.xf); a.equal(by.c10.f.theme, th); a.equal(by.c10.f.thumb, true);
  a.equal(by.c10.f.S, st.S); a.equal(by.c10.f.T, st.T);
  near(tf(cv.getContext('2d')), E.base, 'every save is restored');
  seen = []; st.W.shake = 0.3; calls = 0;
  Math.random = function () { calls++; return 0.75; };
  try { st.draw(); } finally { Math.random = orig; }
  a.equal(calls, 2, 'shaking: exactly two randoms');
  var j = (0.75 - 0.5) * 0.3 * 10;
  near(seen[1].m, expect(j, j).cam, 'the jitter moves the camera');
  near(seen[0].m, E.base, '... and nothing else');
});

T.test('crossfade stacks (§4.5): stage.xf[param] generalizes stage.neb — amounts, duration, filter, finish, busy, instant', function (a) {
  var Ease = PD.get('core/ease').Ease;
  var st = new (PD.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: PD.compile('one-giant-leap') });
  a.deepEqual(Object.keys(st.xf), ['nebula']);
  a.deepEqual(st.xf.nebula, [{ value: 'aurora', amount: 1, from: 1, to: 1, t0: 0, dur: 1 }]);
  a.ok(!st.busy());
  st.setWorld({ nebula: 'aurora' }, null, 2, 'linear', false);
  a.equal(st.xf.nebula.length, 1, 'the same value starts nothing');
  st.setWorld({ nebula: 'cosmic', speed: 16 }, { nebula: [2] }, 5, 'linear', false);
  a.equal(st.xf.nebula.length, 2);
  a.deepEqual(st.xf.nebula[1], { value: 'cosmic', amount: 0, from: 0, to: 1, t0: 0, dur: 2 }, 'timing[param][0] is the duration');
  a.deepEqual([st.xf.nebula[0].from, st.xf.nebula[0].to, st.xf.nebula[0].dur], [1, 0, 2]);
  a.equal(st.W.nebula, 'cosmic', 'W holds the newest value');
  a.ok(st.busy());
  st.tick(0.5);
  a.near(st.xf.nebula[1].amount, Ease.inOutQuad(0.25), 1e-12, 'amounts ease with inOutQuad');
  a.near(st.xf.nebula[0].amount, 1 - Ease.inOutQuad(0.25), 1e-12);
  st.setWorld({ nebula: 'dawn' }, null, 1, 'linear', false);
  a.equal(st.xf.nebula.length, 3, 'a third layer while two still fade');
  a.near(st.xf.nebula[1].from, Ease.inOutQuad(0.25), 1e-12, 'fading layers restart from their current amount');
  a.equal(st.xf.nebula[2].dur, 1, 'no timing: defDur');
  st.tick(1.0001);
  a.deepEqual(st.xf.nebula.map(function (L) { return L.value; }), ['dawn'], 'finished layers are filtered out');
  a.ok(!st.busy());
  var tDeep = st.T;
  st.setWorld({ nebula: 'deep' }, null, 3, 'linear', false);
  st.tick(0.1);
  st.finishAll();
  a.deepEqual(st.xf.nebula, [{ value: 'deep', amount: 1, from: 1, to: 1, t0: tDeep, dur: 3 }], 'finishAll collapses to the top layer');
  st.setWorld({ nebula: 'ember' }, null, 3, 'linear', true);
  a.deepEqual(st.xf.nebula, [{ value: 'ember', amount: 1, from: 1, to: 1, t0: st.T, dur: 0 }], 'instant: one full layer');
  a.ok(!st.busy());
  // any plugin's string param can crossfade
  var K = m4Engine(M4_CORE.concat(['worlds/core']));
  K.world('moody', { params: { mood: 'calm', level: 2 }, crossfade: ['mood'], passes: [] });
  var s2 = new (K.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: m4Compiled(m4Theme(K, ['moody'], { world: { mood: 'warm' } })) });
  a.deepEqual(Object.keys(s2.xf), ['mood']);
  a.equal(s2.xf.mood[0].value, 'warm', 'the theme default');
  s2.setWorld({ mood: 'cold' }, null, 1, 'linear', false);
  a.ok(s2.busy());
  s2.tick(1.01);
  a.deepEqual(s2.xf.mood.map(function (L) { return L.value; }), ['cold']);
  a.ok(!s2.busy());
});

T.test('Stage.tick (§4.5): order of work; warmTick warms the first unwarmed world only, then prewarm; thumbs never warm', function (a) {
  var K = m4Engine(M4_CORE.concat(['worlds/core'])), log = [];
  var mk = function (name) {
    var warm = { done: false };
    K.world(name, { params: {}, create: function () { return { name: name }; }, passes: [],
      update: function (st, dt, W, stage) { log.push(name + '.update ' + dt + (stage ? '' : ' (no stage)')); },
      warmed: function (st) { return warm.done; }, warm: function (st, b) { log.push(name + '.warm ' + b + ' ' + st.name); } });
    return warm;
  };
  var wa = mk('wa'), wb = mk('wb'), th = m4Theme(K, ['wa', 'wb']);
  var Stage = K.get('core/stage').Stage;
  (function () {
    var st = new Stage(m4Canvas(), { deck: m4Compiled(th) });
    st.tl.update = function () { log.push('tl'); };
    st.updateWorld = function () { log.push('updateWorld'); };
    st.shapeBySpec.set({}, { update: function (t) { log.push('shape ' + t); } });
    st.field.update = function (t) { log.push('field ' + t); };
    st.prewarm = function (b) { log.push('prewarm ' + b); };
    st.tick(0.5);
    a.deepEqual(log, ['tl', 'updateWorld', 'wa.update 0.5', 'wb.update 0.5', 'shape 0.5', 'field 0.5', 'wa.warm 3 wa'], 'tick order');
    log = []; st.tick(0);
    a.deepEqual(log.slice(-1), ['wa.warm 3 wa'], 'wa again: nothing else warms while wa is cold');
    a.ok(!st.isWarm());
    wa.done = true; log = []; st.tick(0);
    a.deepEqual(log.slice(-1), ['wb.warm 3 wb']);
    wb.done = true; log = []; st.tick(0);
    a.deepEqual(log.slice(-1), ['prewarm 4'], 'all worlds warm: prewarm(4)');
    a.ok(!st.isWarm(), 'not warm until prewarm is done');
    st.warmDone = true; log = []; st.tick(0);
    a.deepEqual(log, ['tl', 'updateWorld', 'wa.update 0', 'wb.update 0', 'shape 0.5', 'field 0.5'], 'nothing left to warm');
    a.ok(st.isWarm());
    wa.done = false; wb.done = false;
    var th2 = new Stage(m4Canvas(), { deck: m4Compiled(th), thumb: true });
    th2.prewarm = function (b) { log.push('prewarm ' + b); };
    log = []; th2.tick(0);
    a.deepEqual(log, ['wa.update 0', 'wb.update 0'], 'a thumb stage never warms');
    // warmAll: every world until warmed, then prewarm(Infinity)
    var n = 0;
    K.world('wc', { params: {}, passes: [], warmed: function () { return n >= 3; }, warm: function (st, b) { n++; log.push('wc.warm ' + b); } });
    var s3 = new Stage(m4Canvas(), { deck: m4Compiled(m4Theme(K, ['wc'])) });
    s3.prewarm = function (b) { log.push('prewarm ' + b); };
    log = []; s3.warmAll();
    a.deepEqual(log, ['wc.warm 1000000000', 'wc.warm 1000000000', 'wc.warm 1000000000', 'prewarm Infinity']);
  })();
});

T.test('planet (§4.5 planet specifics): prepare, warmed/warm, update and the adapt rule; stage.adapt forwards', function (a) {
  var K = m4Engine(M4_CORE.concat(['worlds/planet'])), Earth = K.get('core/earth').Earth, calls = [];
  Earth.alloc = function () { calls.push('alloc'); };
  Earth.step = function (b) { calls.push('step ' + b); return false; };
  var ready = false;
  Earth.ready = function () { return ready ? true : null; };
  var P = K.world.get('planet'), st = P.create({});
  a.deepEqual(st, { spinAcc: 0, budget: 240000 });
  P.prepare(st, { world: { earth: 1 } }); a.deepEqual(calls, ['alloc', 'step 1000000000'], 'first scene shows the Earth: generate now');
  calls = []; P.prepare(st, { world: { earth: 0 } }); a.deepEqual(calls, ['alloc']);
  calls = []; P.prepare(st, {}); a.deepEqual(calls, ['alloc']);
  a.equal(P.warmed(st), false, 'warmed is a boolean (Earth.ready() is null before generation starts)');
  ready = true; a.equal(P.warmed(st), true);
  calls = []; P.warm(st, 3); a.deepEqual(calls, ['step 3']);
  P.update(st, 0.5, { earthSpin: 0.02 }); a.near(st.spinAcc, 0.01, 1e-15);
  P.adapt(st, 13); a.equal(st.budget, 240000, '13 ms is not heavy');
  P.adapt(st, 14); a.equal(st.budget, 240000 * 0.97);
  P.adapt(st, 7.9); a.equal(st.budget, 240000 * 0.97 * 1.01);
  st.budget = 90000; P.adapt(st, 20); a.equal(st.budget, 90000, 'floor: only above 90000');
  st.budget = 240000; P.adapt(st, 2); a.equal(st.budget, 240000, 'ceiling: only below 240000');
  st.budget = 89000; P.adapt(st, 2); a.equal(st.budget, 89000 * 1.01);
  var s = new (PD.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: PD.compile('one-giant-leap') });
  s.adapt(30);
  a.equal(s.worldStates.planet.budget, 240000 * 0.97, 'stage.adapt → planet.adapt');
});

T.test('Stage (M4): enabled worlds = the deck\'s worlds (core + theme.worlds + meta.worlds), absent ones skipped once with a warning; plugin defaults, then theme.world', function (a) {
  var K = m4Engine(M4_CORE.concat(M4_WORLDS)), Stage = K.get('core/stage').Stage;
  var made = [];
  K.world('extra', { params: { ex: 5 }, create: function (stage) { made.push(stage); return { s: stage.W.ex }; }, passes: [] });
  var th = m4Theme(K, ['spark', 'ghost', 'cosmos', 'spark'], { world: { ex: 6, speed: 99 } });
  var st;
  var warns = m4Warns(function () { st = new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(th, [], ['extra', 'ghost']) }); });
  a.deepEqual(st.worlds, ['core', 'spark', 'cosmos', 'extra'], 'de-duplicated, in order, unregistered skipped');
  a.deepEqual(warns, ['pixeldeck: world "ghost" is not loaded; its passes are skipped'], 'one warning per page');
  a.equal(m4Warns(function () { new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(th) }); }).length, 0);
  a.deepEqual(Object.keys(st.defaults), ('roll shake letterbox exposure vignette grain particles spark sparkX sparkY speed warp warpColor stars nebula ' +
    'nebulaAmount backdrop dust galaxy galaxyX galaxyY galaxyScale galaxyTilt ex').split(' '), 'plugin params in worlds order');
  a.equal(st.defaults.speed, 99); a.equal(st.defaults.ex, 6, 'theme.world overrides plugin defaults');
  a.ok(!('earth' in st.W), 'a disabled world contributes no params');
  a.deepEqual(made, [st], 'create(stage) once per stage');
  a.deepEqual(st.worldStates.extra, { s: 6 }, 'create runs after W exists');
  a.deepEqual(st.worldList.map(function (w) { return w.name; }), st.worlds);
  a.ok(st.passes.every(function (q) { return q.world !== 'planet'; }), 'no planet passes');
  // the harness cosmos theme lists photo (WP3): skipped until it is loaded
  var cs = new (PD.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: PD.compile({ id: 'm4-cosmos', meta: { theme: 'cosmos' }, scenes: [] }) });
  a.deepEqual(cs.worlds, ['core', 'cosmos', 'planet', 'spark'].concat(PD.world.has('photo') ? ['photo'] : []));
});

T.test('stage.preload / stage.prepare (§4.10 steps 7–8): preload once per page per world and theme key; prepare gets the first scene', function (a) {
  var K = m4Engine(M4_CORE.concat(['worlds/core'])), Stage = K.get('core/stage').Stage, log = [];
  K.world('pw', { params: { pv: 1 }, passes: [], create: function () { return { id: 'pw' }; },
    preload: function (theme, compiled) { log.push('preload ' + theme.label + ' ' + (compiled && compiled.id)); },
    prepare: function (st, scene, stage) { log.push('prepare ' + st.id + ' ' + scene.id + ' ' + (stage instanceof Stage)); } });
  var t1 = m4Theme(K, ['pw'], { label: 'One' }), t2 = m4Theme(K, ['pw'], { label: 'Two' });
  var s1 = new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(t1) }), s1b = new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(t1) });
  s1.preload(); s1b.preload(); s1.preload();
  a.deepEqual(log, ['preload One m4'], 'same theme key: once; M5: the stage\'s compiled deck by default');
  var d2 = m4Compiled(t2); d2.id = 'other';
  new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(t2) }).preload(d2);
  a.deepEqual(log.slice(1), ['preload Two other'], 'another theme key: again, with the compiled deck passed in');
  log = []; s1.prepare({ id: 'first' }); s1.prepare();
  a.deepEqual(log, ['prepare pw first true', 'prepare pw undefined true']);
});

T.test('element registry (§4.6): "text" is built in (create/measure/particleCount); resolve/enter use the item kinds; unknown kinds are skipped', function (a) {
  a.ok(PD.element.list().indexOf('text') >= 0);
  var E = PD.element.get('text'), TL = PD.get('core/text').TextLayer, th = PD.theme.resolve('one-giant-leap');
  var env = { theme: th };
  a.ok(E.create({ str: 'Hi', style: 'title' }, env) instanceof TL, 'create → TextLayer');
  var m = E.measure({ str: 'Hello world', style: 'statement', x: 300, y: 500, align: 'left' }, env);
  var L = new TL({ str: 'Hello world', style: 'statement', x: 300, y: 500, align: 'left' }, env);
  a.deepEqual(m, { x: 300, y: L.top, w: L.w, h: L.h, lines: ['Hello world'] });
  a.ok(E.particleCount({ str: 'GO', style: 'hero', reveal: 'particles' }, env) > 50);
  a.equal(E.particleCount({ str: 'GO', style: 'hero' }, env), 0, 'only a particles reveal has targets');
  a.deepEqual(PD.get('core/text').REVEALS, ['letters', 'focus', 'rise', 'fade', 'wipe', 'particles']);
  a.deepEqual(PD.get('core/text').EXITS, ['fade', 'rise', 'sink', 'blur', 'particles']);
  // a custom kind on a fresh engine
  var K = m4Engine(M4_CORE.concat(['worlds/core'])), got = [];
  K.element('box', { create: function (spec, env2) { got.push(env2); return m4FakeLayer(spec); } });
  var A = { str: 'A', id: 'a' }, B = { kind: 'box', id: 'b' }, C = { str: 'C' }, D = { kind: 'box', id: 'd' }, N = { kind: 'nope', id: 'n' };
  var S = { shape: 'points', id: 's', points: [] }, Ep = { shape: 'points', points: [] }, F = { str: 'F' };
  var st = new (K.get('core/stage').Stage)(m4Canvas(), { thumb: true, deck: m4Compiled(m4Theme(K, []), [{ id: 'x', text: [A], elements: [B, N], particles: [S],
            steps: [{ text: [C], elements: [D], particles: [Ep] }, { remove: ['a', 's', 'n'] }, { clear: true, text: [F] }] }]) });
  (function () {
    var r0 = st.resolve(0, 0), r1 = st.resolve(0, 1), r2 = st.resolve(0, 2), r3 = st.resolve(0, 3);
    var specs = function (l) { return l.map(function (it) { return it.spec; }); };
    a.deepEqual(r0.items.map(function (it) { return it.kind + ':' + it.step; }), ['text:0', 'box:0', 'nope:0'], 'scene.text, then scene.elements');
    a.ok(specs(r1.items)[0] === A && specs(r1.items)[3] === C && specs(r1.items)[4] === D, 'then step.text, step.elements');
    a.deepEqual(r1.items.map(function (it) { return it.step; }), [0, 0, 0, 1, 1]);
    a.ok(specs(r1.shapes)[0] === S && specs(r1.shapes)[1] === Ep);
    a.ok(specs(r2.items).length === 3 && specs(r2.items)[0] === B, 'remove drops items by id');
    a.ok(specs(r2.shapes).length === 1 && specs(r2.shapes)[0] === Ep, '... and shapes');
    a.ok(specs(r3.items).length === 1 && specs(r3.items)[0] === F && r3.shapes.length === 0, 'clear empties both');
    a.ok(specs(r1.texts)[0] === A && specs(r1.texts)[1] === C && r1.texts.length === 2, 'texts = the text items');
    a.equal(r0.scene, st.deck.scenes[0], 'the scene object itself (M5: from the compiled deck)');
    var warns = m4Warns(function () { st.enter(0, 0, 'live'); });
    a.deepEqual(st.layers.map(function (l) { return l.spec; }), [A, B], 'layers for text and box; nope skipped');
    a.equal(got[0], st.env, 'create gets the stage env');
    a.ok(got[0].theme === st.theme && got[0].col === st.col && got[0].stage === st && got[0].assets('x') === null, 'env: theme, col, stage, assets');
    a.deepEqual(warns, ['pixeldeck: unknown element kind "nope"; it is not shown']);
    a.near(st.layers[1].inStart, st.T + 0.5, 1e-9, 'a custom layer is timed like text');
    st.draw();
    a.equal(st.layers[1].drawn, 1, 'core.elements draws every layer');
    st.enter(0, 1, 'live');
    a.equal(st.layers.filter(function (l) { return l.spec === D; }).length, 1, 'step elements enter');
  })();
});

T.test('shape registry (§4.7): built-ins; containers first; points uid from stage.uid(); custom shapes; unknown → empty', function (a) {
  a.deepEqual(PD.shape.list().slice(0, 4), ['spark', 'cube', 'swarm', 'points']);
  a.ok(PD.shape.get('cube').container && !PD.shape.get('spark').container && !PD.shape.get('swarm').container);
  var K = m4Engine(M4_CORE.concat(['worlds/core'])), Stage = K.get('core/stage').Stage, Shapes = K.get('core/shapes').Shapes, envs = [];
  K.shape('ring', { container: true, create: function (spec, env) {
    envs.push(env);
    return { id: 'ring' + env.uid(), n: 2, px: new Float32Array([1, 2]), py: new Float32Array([3, 4]), x: 0, y: 0, scale: 1, spin: 0, tilt: 0,
             color: function () { return [9, 9, 9]; }, size: function () { return 5; } };
  } });
  var th = m4Theme(K, [], { colors: { gold: '#010203', white: '#ffffff' } });
  var pcalls = 0, P = { shape: 'points', points: function () { pcalls++; return [{ x: 1, y: 2 }, { x: 3, y: 4, color: 'gold' }]; } };
  var SW = { shape: 'swarm', inside: 'r1', count: 3 }, R1 = { shape: 'ring', id: 'r1' }, SP = { shape: 'spark', count: 5 };
  var X = { shape: 'mystery' };
  var st = new Stage(m4Canvas(), { thumb: true, deck: m4Compiled(th, [{ id: 'x', particles: [SW, P, R1, SP, X] }]) });
  var targets = [];
  st.field.morph = function (t) { targets = t; };
  (function () {
    var warns = m4Warns(function () { st.enter(0, 0, 'instant'); });
    var swarm = st.shapeBySpec.get(SW), ring = st.shapeBySpec.get(R1), pts = st.shapeBySpec.get(P);
    a.ok(swarm instanceof Shapes.Swarm);
    a.equal(swarm.cube, ring, 'the container (listed after the swarm) was built first and handed over through byId');
    a.ok(envs[0].byId && typeof envs[0].byId === 'object', 'env.byId'); a.equal(envs[0].theme, th); a.equal(envs[0].col, st.col);
    a.equal(ring.id, 'ring0', 'uid() is stage.uid(): a string from the layer counter');
    a.equal(pts.id, 'pts1');
    a.deepEqual(pts.static, P.points());
    a.equal(pcalls, 2, 'the points function ran once for the stage (plus once here)');
    a.deepEqual(st.shapeBySpec.get(SP).c, [1, 2, 3], 'built-in shapes use the stage theme\'s colours');
    a.deepEqual(st.shapeBySpec.get(X), { id: 'none', n: 0, static: [] }, 'an unknown shape has no particles');
    a.deepEqual(warns, ['pixeldeck: unknown shape "mystery"; it has no particles']);
    a.equal(st.uid(), '2');
    var keys = targets.map(function (t) { return t.key; });
    a.ok(keys.indexOf('pts1:1') >= 0 && keys.indexOf('ring0:0') >= 0, 'targets keyed by shape id');
    var gold = targets.filter(function (t) { return t.key === 'pts1:1'; })[0];
    a.deepEqual([gold.r, gold.g, gold.b], [1, 2, 3], 'static targets use the theme colours');
  })();
  // the harness built-ins on a default (base) colour table still give today's colours
  var Sp = new (PD.get('core/shapes').Shapes.Spark)({});
  a.deepEqual(Sp.c, PD.get('core/util').col('gold'));
});

T.test('reveal / exit registries (§4.6, §4.7): built-in names never consult them; other names use pose, inDur, animSpan, paint, apply', function (a) {
  var K = m4Engine(), TL = K.get('core/text').TextLayer, Ease = K.get('core/ease').Ease;
  var th = m4Theme(K, []), env = { theme: th };
  var poses = [];
  K.reveal('drop', { inDur: 2, animSpan: 1.5, pose: function (L, t, pIn, eIn) { poses.push([L, t, pIn, eIn]); return { alpha: 0.25, dy: 10, scale: 2 }; } });
  K.reveal('fade', { inDur: 9, pose: function () { throw new Error('a built-in name must not reach the registry'); } });
  K.exitFx('rise', { apply: function () { throw new Error('a built-in exit must not reach the registry'); } });
  var cv = m4Canvas(800, 400), ctx = cv.getContext('2d'), log = [];
  var o = { translate: ctx.translate, scale: ctx.scale, drawImage: ctx.drawImage };
  ctx.translate = function (x, y) { log.push(['translate', x, y]); return o.translate.apply(this, arguments); };
  ctx.scale = function (x, y) { log.push(['scale', x, y]); return o.scale.apply(this, arguments); };
  ctx.drawImage = function () { log.push(['drawImage', this.globalAlpha]); return o.drawImage.apply(this, arguments); };
  var draw = function (L, t) { log = []; ctx.save(); L.draw(ctx, t, 1); ctx.restore(); return log; };

  var L = new TL({ str: 'Hi', reveal: 'drop', x: 400, y: 200 }, env);
  a.equal(L.inDur, 2, 'the plugin inDur');
  a.equal(new TL({ str: 'Hi', reveal: 'drop', revealTime: 3 }, env).inDur, 3, 'revealTime still wins');
  L.inStart = 0;
  a.ok(L.animating(2.99) && !L.animating(3.01), 'animates for inDur × animSpan');
  var cx = L.left + L.w / 2, cy = L.top + L.h / 2;
  var lg = draw(L, 1);
  a.equal(poses.length, 1); a.equal(poses[0][0], L); a.equal(poses[0][2], 0.5); a.near(poses[0][3], Ease.outCubic(0.5), 1e-12);
  a.deepEqual(lg[0], ['translate', cx, cy + 10], 'pose.dy');
  a.deepEqual(lg[1], ['scale', 2, 2], 'pose.scale multiplies the push-in (none here)');
  a.deepEqual(lg[3], ['drawImage', 0.25], 'pose.alpha');

  var F = new TL({ str: 'x', reveal: 'fade', exit: 'rise' }, env);
  a.equal(F.inDur, 1.1, 'built-in fade keeps its own inDur');
  F.inStart = 0; draw(F, 0.5); F.outStart = 1; draw(F, 1.2);
  a.ok(true, 'built-in reveal and exit ran without touching the registry');

  var got = null;
  K.exitFx('melt', { apply: function (Lx, pOut, eOut, pose) { got = [pOut, eOut, pose.alpha, pose.dy, pose.scale]; pose.alpha = 0.5; pose.dy = -7; pose.scale = 3; } });
  var M = new TL({ str: 'x', reveal: 'fade', exit: 'melt', x: 400, y: 200 }, env);
  M.inStart = -100; M.outStart = 0;
  lg = draw(M, 0.35);
  a.deepEqual(got, [0.5, Ease.inOutQuad(0.5), 1, 0, 1], 'apply(layer, pOut, eOut, pose) after the reveal pose');
  a.deepEqual(lg[0], ['translate', M.left + M.w / 2, M.top + M.h / 2 - 7]);
  a.deepEqual(lg[1], ['scale', 3, 3]);
  a.deepEqual(lg[3], ['drawImage', 0.5]);

  var painted = [];
  K.reveal('sweep', { inDur: 1, pose: function () { return { alpha: 0.7 }; }, paint: function (Lx, c, rs, pIn, eIn, alpha) { painted.push([Lx, c, rs, pIn, eIn, alpha]); } });
  var W2 = new TL({ str: 'x', reveal: 'sweep' }, env);
  W2.inStart = 0;
  lg = draw(W2, 0.5);
  a.equal(painted.length, 1);
  a.ok(painted[0][0] === W2 && painted[0][1] === ctx && painted[0][2] === 1 && painted[0][3] === 0.5 && painted[0][5] === 0.7, 'paint(layer, ctx, rs, pIn, eIn, alpha)');
  a.equal(lg.filter(function (e) { return e[0] === 'drawImage'; }).length, 0, 'paint replaces the blit while pIn < 1');
  lg = draw(W2, 2);
  a.equal(painted.length, 1, 'no paint once revealed');
  a.deepEqual(lg.filter(function (e) { return e[0] === 'drawImage'; }), [['drawImage', 0.7]]);

  var Z = new TL({ str: 'x', reveal: 'zzz', exit: 'yyy' }, env);
  a.equal(Z.inDur, 1.1); a.equal(Z.rv, null); a.equal(Z.xv, null);
  Z.inStart = 0;
  a.ok(!Z.animating(1.11), 'unknown reveal: span 1');
  a.deepEqual(draw(Z, 0.1).filter(function (e) { return e[0] === 'drawImage'; }), [['drawImage', 1]], 'unknown unregistered reveal: shown at once');
  Z.outStart = 0;
  a.deepEqual(draw(Z, 0.35).filter(function (e) { return e[0] === 'drawImage'; }), [['drawImage', 1 - Ease.inOutQuad(0.5)]], 'unknown unregistered exit: fade');
});

T.test('registration has no side effects (§3.1 rule 4): core/shapes, core/text, core/assets, core/compile, core/stage and worlds/* register only their own entries', function (a) {
  var EXPECT = {
    'core/shapes': { shape: ['spark', 'cube', 'swarm', 'points'] }, 'core/text': { element: ['text'] }, 'core/assets': {}, 'core/compile': {}, 'core/stage': {},
    'worlds/core': { world: ['core'] }, 'worlds/cosmos': { world: ['cosmos'] }, 'worlds/planet': { world: ['planet'] }, 'worlds/spark': { world: ['spark'] }
  };
  Object.keys(EXPECT).forEach(function (n) {
    var rec = PD.modules().filter(function (m) { return m.name === n; })[0];
    var fr = document.createElement('iframe');
    fr.style.display = 'none';
    document.body.appendChild(fr);
    try {
      var w = fr.contentWindow, g = {}, calls = 0;
      PD.kernel(g);
      var K = g.PD, deps = rec.deps.map(function (d) { return PD.get(d); });
      w.Math.random = function () { calls++; return 0.5; };
      var keys = Object.keys(w).join(','), html = w.document.documentElement.outerHTML;
      w.eval('(' + rec.factory.toString() + ')').apply(null, [K].concat(deps));
      a.equal(calls, 0, n + ': no Math.random');
      a.equal(Object.keys(w).join(','), keys, n + ': no new global');
      a.equal(w.document.documentElement.outerHTML, html, n + ': no DOM change');
      a.deepEqual(K.modules(), [], n + ': registers no module');
      ['world', 'element', 'shape', 'reveal', 'exitFx', 'template', 'framework', 'theme', 'deck'].forEach(function (r) {
        a.deepEqual(K[r].list(), EXPECT[n][r] || [], n + ': ' + r + ' registry');
      });
    } finally { fr.remove(); }
  });
});
