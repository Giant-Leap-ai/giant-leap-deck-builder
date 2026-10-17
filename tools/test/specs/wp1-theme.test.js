/* tools/test/specs/wp1-theme.test.js — M3 theme extraction (spec §4.4, §4.5 cosmos specifics, §4.6 text, §4.9, §8.2 M3).
 * Theme resolution is tested on fresh kernels (the core/theme factory re-registered on PD.kernel(fakeGlobal)), so the
 * harness's registries are never modified. M5: Stage tests pass a compiled deck carrying the theme (m3Compiled). */

function m3Kit(themes) {
  var g = {}; PD.kernel(g);
  var K = g.PD, rec = PD.modules().filter(function (m) { return m.name === 'core/theme'; })[0];
  var mod = K.module('core/theme', rec.deps, rec.factory);
  for (var id in themes || {}) K.theme(id, themes[id]);
  return { g: g, K: K, mod: mod };
}
var M3_MOTION = { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' };
var M3_TIMING = { worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
                  settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9 };
function m3Base(extra) {
  var t = {
    label: 'Base', worlds: ['cosmos'], fonts: { display: 'Alpha, sans-serif' },
    colors: { red: '#ff0000', blue: '#0000ff' },
    styles: { title: { size: 10, fill: ['#111111', '#222222'], glow: '#333333' }, kicker: { size: 5, fill: '#444444' } },
    nebulae: { n1: ['#010101', '#020202', '#030303'] }, world: { speed: 1 },
    motion: JSON.parse(JSON.stringify(M3_MOTION)), timing: JSON.parse(JSON.stringify(M3_TIMING)),
    shots: { DRIFT: {} }, ui: { accent: '#abcabc' }
  };
  for (var k in extra || {}) t[k] = extra[k];
  return t;
}
function m3Walk(v, fn, path) {
  path = path || 'theme';
  fn(v, path);
  if (v && typeof v === 'object') for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) m3Walk(v[k], fn, path + '.' + k);
}
function m3Compiled(theme, scenes) {   // M5: a Stage takes { deck: CompiledDeck }; the smallest one carrying `theme`
  return { id: 'm3', meta: {}, source: null, theme: theme, themeKey: theme.key, worlds: ['core'].concat(theme.worlds || []),
           scenes: scenes || [], sceneKeys: [], errors: [] };
}

T.test('theme resolve: the extends chain merges root → leaf (styles per key), arrays replace, null deletes', function (a) {
  var base = m3Base();
  var child = { 'extends': 'base', label: 'Child', worlds: ['cosmos', 'planet'], colors: { blue: '#0000fe', green: '#00ff00' },
                styles: { title: { size: 20, fill: ['#999999'] }, kicker: null } };
  var grand = { 'extends': 'child', label: 'Grand', styles: { title: { glow: '#777777' }, caption: { size: 3, fill: '#888888' } } };
  var before = JSON.stringify([base, child, grand]);
  var kit = m3Kit({ base: base, child: child, grand: grand });
  var t = kit.K.theme.resolve('grand');
  a.equal(t.id, 'grand');
  a.deepEqual(t.chain, ['base', 'child', 'grand'], 'chain is root first');
  a.equal(t.label, 'Grand', 'the leaf wins');
  a.ok(!('extends' in t), 'extends is not part of the resolved theme');
  a.deepEqual(t.worlds, ['cosmos', 'planet'], 'arrays replace');
  a.deepEqual(t.colors, { red: '#ff0000', blue: '#0000fe', green: '#00ff00' }, 'objects merge key by key');
  a.deepEqual(t.styles.title, { size: 20, fill: ['#999999'], glow: '#777777' }, 'a style merges per key along the chain');
  a.ok(!('kicker' in t.styles), 'null deletes');
  a.deepEqual(t.styles.caption, { size: 3, fill: '#888888' });
  a.equal(t.fonts.display, 'Alpha, sans-serif', 'inherited from the root');
  a.deepEqual(kit.K.theme.resolve('base').styles.kicker, { size: 5, fill: '#444444' }, 'resolving a child leaves its parent alone');
  a.equal(JSON.stringify([base, child, grand]), before, 'registered sources are not mutated');
  a.ok(!Object.isFrozen(base) && !Object.isFrozen(base.styles.title.fill), 'registered sources are not frozen');
  var p = kit.K.theme.resolve('base', { styles: { title: { size: 99 } }, worlds: ['spark'], 'extends': 'grand', id: 'x', chain: [], key: 'k' });
  a.equal(p.styles.title.size, 99, 'the patch deep-merges last');
  a.deepEqual(p.styles.title.fill, ['#111111', '#222222']);
  a.deepEqual(p.worlds, ['spark']);
  a.equal(p.id, 'base'); a.deepEqual(p.chain, ['base'], 'a patch cannot set extends, id, chain or key');
  var evil = JSON.parse('{"__proto__": {"polluted": 1}, "styles": {"__proto__": {"polluted": 1}}}');
  kit.K.theme.resolve('base', evil);
  a.equal(({}).polluted, undefined, 'a __proto__ key in a patch pollutes nothing');
});

T.test('theme resolve: @role strings in styles become copies of the role (after the patch); unknown roles throw', function (a) {
  var base = m3Base({ label: '@notARole', roles: { accent: '#ffff00', future: ['#aaaaaa', '#bbbbbb'] },
    styles: { title: { fill: '#ffffff' }, kicker: { fill: '@accent', glow: '@accent' }, year: { fill: '@future', glow: '@accent' },
              mix: { fill: ['@accent', '#ffffff'] } } });
  var kit = m3Kit({ base: base, bad: m3Base({ styles: { title: { fill: '@nope' } } }) });
  var t = kit.K.theme.resolve('base');
  a.equal(t.styles.kicker.fill, '#ffff00');
  a.equal(t.styles.kicker.glow, '#ffff00');
  a.deepEqual(t.styles.year.fill, ['#aaaaaa', '#bbbbbb']);
  a.ok(t.styles.year.fill !== t.roles.future, 'an array role is copied');
  a.deepEqual(t.styles.mix.fill, ['#ffff00', '#ffffff'], 'roles inside arrays');
  a.equal(t.label, '@notARole', 'only styles are substituted');
  a.deepEqual(t.roles.future, ['#aaaaaa', '#bbbbbb'], 'roles stay in the resolved theme');
  var p = kit.K.theme.resolve('base', { roles: { accent: '#0000ff' } });
  a.equal(p.styles.kicker.fill, '#0000ff', 'a patched role flows into the styles (Studio Look)');
  a.throws(function () { kit.K.theme.resolve('bad'); }, /theme "bad" styles\.title\.fill uses unknown role "@nope"/);
});

T.test('theme resolve: the output is deep-frozen, a new object per call, and its key is a hash of the values', function (a) {
  var kit = m3Kit({ base: m3Base() });
  var t = kit.K.theme.resolve('base'), t2 = kit.K.theme.resolve('base');
  var n = 0;
  m3Walk(t, function (v, path) { if (v && typeof v === 'object') { n++; a.ok(Object.isFrozen(v), path + ' is frozen'); } });
  a.ok(n > 10, 'walked ' + n + ' objects');
  a.throws(function () { 'use strict'; t.styles.title.size = 1; }, TypeError);
  a.throws(function () { 'use strict'; t.styles.title.fill.push('#000000'); }, TypeError);
  a.ok(t !== t2, 'a new object per call');
  a.deepEqual(t, t2);
  a.ok(/^[0-9a-f]{16}$/.test(t.key), 'key ' + t.key);
  a.equal(t2.key, t.key, 'stable');
  var p1 = kit.K.theme.resolve('base', { timing: { textDelay: 0.75 } }), p2 = kit.K.theme.resolve('base', { timing: { textDelay: 0.75 } });
  a.ok(p1.key !== t.key, 'the key changes with the patch');
  a.equal(p2.key, p1.key, 'equal patches give equal keys');
  a.equal(kit.K.theme.resolve('base', { world: { speed: 1 } }).key, t.key, 'a patch that changes no value keeps the key');
  a.ok(kit.K.theme.resolve('base', { styles: { kicker: { size: 6 } } }).key !== t.key);
  a.equal(kit.mod.hash('abc'), kit.mod.hash('abc'));
  a.ok(kit.mod.hash('abc') !== kit.mod.hash('abd'));
});

T.test('theme resolve: factories run once with PD; unknown ids, unknown parents, cycles and missing sections throw', function (a) {
  var calls = 0, seen = null;
  var kit = m3Kit({
    fac: function (P) { calls++; seen = P; return m3Base({ label: 'Fac' }); },
    notObj: function () { return 42; },
    orphan: { 'extends': 'missing', label: 'x' },
    c1: { 'extends': 'c2' }, c2: { 'extends': 'c1' },
    noTiming: m3Base({ timing: { worldTime: 2.6 } }),
    noUi: m3Base({ ui: null })
  });
  a.equal(kit.K.theme.resolve('fac').label, 'Fac');
  kit.K.theme.resolve('fac', { label: 'Again' });
  a.equal(calls, 1, 'the factory ran once');
  a.equal(seen, kit.K, 'with PD');
  a.throws(function () { kit.K.theme.resolve('zzz'); }, /pixeldeck: no theme "zzz"/);
  a.throws(function () { kit.K.theme.resolve(); }, /needs a theme id/);
  a.throws(function () { kit.K.theme.resolve('notObj'); }, /theme "notObj" is not an object \(its factory returned number\)/);
  a.throws(function () { kit.K.theme.resolve('orphan'); }, /theme "orphan" extends unknown theme "missing"/);
  a.throws(function () { kit.K.theme.resolve('c1'); }, /theme "c1" has an extends cycle \(c1 → c2 → c1\)/);
  a.throws(function () { kit.K.theme.resolve('noTiming'); }, /theme "noTiming" needs timing\.worldEase \(string\)/);
  a.throws(function () { kit.K.theme.resolve('noUi'); }, /theme "noUi" needs ui \(object\)/);
  a.throws(function () { kit.K.theme.resolve('fac', 'patch'); }, /patch for "fac" must be an object/);
});

T.test('core/theme registration has no side effects (§3.1 rule 4): no random, no global, no DOM, registers nothing', function (a) {
  var rec = PD.modules().filter(function (m) { return m.name === 'core/theme'; })[0];
  a.deepEqual(rec.deps, []);
  var fr = document.createElement('iframe');
  fr.style.display = 'none';
  document.body.appendChild(fr);
  try {
    var w = fr.contentWindow, g = {}, calls = 0;
    PD.kernel(g);
    w.Math.random = function () { calls++; return 0.5; };
    var keys = Object.keys(w).join(','), html = w.document.documentElement.outerHTML;
    var out = w.eval('(' + rec.factory.toString() + ')')(g.PD);
    a.equal(typeof out.resolve, 'function');
    a.equal(g.PD.theme.resolve, out.resolve, 'PD.theme.resolve is the module\'s resolve');
    a.equal(calls, 0, 'Math.random calls');
    a.equal(Object.keys(w).join(','), keys, 'no global');
    a.equal(w.document.documentElement.outerHTML, html, 'no DOM change');
    a.deepEqual(Object.keys(g).sort(), ['PD'], 'no compat global at registration');
    ['world', 'element', 'shape', 'reveal', 'exitFx', 'template', 'framework', 'theme', 'deck'].forEach(function (r) { a.deepEqual(g.PD[r].list(), [], r); });
    a.deepEqual(g.PD.modules(), []);
  } finally { fr.remove(); }
  a.equal(PD.theme.resolve, PD.get('core/theme').resolve, 'the harness PD.theme.resolve');
});

T.test('cosmos and one-giant-leap themes (§4.4): values, roles, shots, and OGL is a self-contained snapshot', function (a) {
  // AMEND-11: other packages (WP3 slate) legitimately add themes; require the two WP1 themes and that every theme resolves.
  var themeIds = PD.theme.list();
  a.ok(themeIds.indexOf('cosmos') >= 0 && themeIds.indexOf('one-giant-leap') >= 0, 'cosmos and one-giant-leap are registered');
  themeIds.forEach(function (id) { var r = PD.theme.resolve(id); a.ok(r && r.id === id && typeof r.key === 'string', id + ' resolves'); });
  var ogl = PD.theme.get('one-giant-leap'), cosmos = PD.theme.get('cosmos');
  a.equal(typeof cosmos, 'function', 'cosmos is a factory (shots composed with W)');
  a.ok(ogl && typeof ogl === 'object', 'OGL is a literal object');
  a.ok(!('extends' in ogl) && !('roles' in ogl) && !('shots' in ogl), 'OGL: no extends, no roles, no shots');
  a.ok(!/"@/.test(JSON.stringify(ogl)), 'OGL: no @role reference anywhere');
  var C = PD.theme.resolve('cosmos'), G = PD.theme.resolve('one-giant-leap');
  a.deepEqual(G.chain, ['one-giant-leap']);
  a.deepEqual(C.chain, ['cosmos']);
  a.deepEqual(G.worlds, ['cosmos', 'planet', 'spark']);
  a.deepEqual(C.worlds, ['cosmos', 'planet', 'spark', 'photo']);
  a.deepEqual(C.motion, M3_MOTION); a.deepEqual(G.motion, M3_MOTION);
  a.deepEqual(C.timing, M3_TIMING); a.deepEqual(G.timing, M3_TIMING);
  a.deepEqual(C.roles, { accent: '#ffd27a', accentGlow: '#ff9a3d', future: ['#fff1c9', '#ffb347'], futureGlow: '#ff8a3d',
                         past: ['#dfe6f2', '#8c9bb6'], pastGlow: '#5a6b8a' });
  var cs = cosmos(PD).styles;
  a.deepEqual([cs.kicker.fill, cs.kicker.glow, cs.year.fill, cs.year.glow], ['@accent', '@accentGlow', '@future', '@futureGlow']);
  a.deepEqual([C.styles.kicker.fill, C.styles.kicker.glow, C.styles.year.fill, C.styles.year.glow],
              ['#ffd27a', '#ff9a3d', ['#fff1c9', '#ffb347'], '#ff8a3d'], 'the roles resolve to today\'s literals');
  ['fonts', 'colors', 'styles', 'nebulae', 'motion', 'timing', 'ui'].forEach(function (k) {
    a.deepEqual(C[k], G[k], 'cosmos.' + k + ' equals the OGL snapshot (both are today\'s values)');
  });
  a.deepEqual(Object.keys(G.world), Object.keys(PD.get('core/stage').WORLD_DEFAULTS), 'OGL pins every world default');
  a.deepEqual(G.world, PD.get('core/stage').WORLD_DEFAULTS, '... with today\'s values');
  a.deepEqual(C.world, {}, 'cosmos overrides no plugin default');
  a.deepEqual(Object.keys(C.shots), ['DRIFT', 'HORIZON', 'BELOW', 'SPARK', 'BLOOM', 'HYPERSPACE', 'GALAXY', 'HOME', 'SUNRISE',
                                     'LEAPS', 'BOX', 'PIVOT', 'FINALE']);
  a.deepEqual(C.shots.DRIFT, {});
  a.equal(C.shots.BELOW.earthY, 3900); a.equal(C.shots.BELOW.earthR, 2600, 'BELOW = W(HORIZON, …)');
  a.equal(C.shots.SUNRISE.earthR, 2600); a.equal(C.shots.SUNRISE.sun, 1);
  a.equal(C.fonts.display, '"Avenir Next", "Avenir", "Helvetica Neue", "Segoe UI", system-ui, sans-serif');
  a.equal(Object.keys(C.nebulae)[0], 'aurora', 'the first preset (the unknown-name fallback) is aurora');
  a.ok(C.key !== G.key);
});

T.test('util.colFor binds col() to a theme\'s colours; base COLORS fill gaps; same results as col() for OGL', function (a) {
  var util = PD.get('core/util');
  var c = util.colFor({ gold: '#010203' });
  a.deepEqual(c('gold'), [1, 2, 3]);
  a.deepEqual(c('cyan'), util.col('cyan'), 'a name the theme lacks falls back to the base table');
  a.deepEqual(c('#ff0000'), [255, 0, 0]);
  a.deepEqual(c(undefined), [255, 255, 255]);
  a.deepEqual(c([9, 8, 7]), [9, 8, 7]);
  var G = PD.theme.resolve('one-giant-leap'), cg = util.colFor(G.colors);
  Object.keys(util.COLORS).forEach(function (n) { a.deepEqual(cg(n), util.col(n), n); });
});

T.test('Stage (M3, M5): stage.theme is the compiled deck\'s theme; no compiled deck throws; theme.world overrides defaults', function (a) {
  var Stage = PD.get('core/stage').Stage, D = PD.get('core/stage').WORLD_DEFAULTS;
  var T1 = PD.theme.resolve('one-giant-leap', { world: { speed: 99, nebula: 'deep' } });
  var st = new Stage(document.createElement('canvas'), { thumb: true, deck: m3Compiled(T1, [{ id: 'a', world: { warp: 0.5 } }]) });
  a.equal(st.theme, T1);
  a.equal(st.env.theme, T1); a.equal(st.env.stage, st); a.equal(typeof st.col, 'function'); a.equal(st.env.col, st.col);
  a.equal(st.W.speed, 99); a.equal(st.W.nebula, 'deep');
  a.equal(st.xf.nebula.length, 1); a.equal(st.xf.nebula[0].value, 'deep', 'the starting nebula is the theme default (M4: stage.xf.nebula)');
  a.equal(st.W.warp, D.warp);
  var w = st.resolve(0, 0).world;
  a.equal(w.speed, 99, 'resolve: theme.world over the defaults');
  a.equal(w.warp, 0.5, 'resolve: scene.world over theme.world');
  [undefined, {}, { theme: T1 }, { scenes: [] }, { theme: 'one-giant-leap', scenes: [] }].forEach(function (d, i) {
    a.throws(function () { new Stage(document.createElement('canvas'), { thumb: true, deck: d }); },
             /new PD\.Stage\(canvas, \{ deck \}\) needs a compiled deck \{ theme, worlds, scenes \} \(PD\.compile\(deckId\)\)/, 'case ' + i);
  });
  a.throws(function () { new Stage(document.createElement('canvas'), { thumb: true, theme: T1 }); }, /needs a compiled deck/, 'opts.theme is gone (M5)');
  var G = PD.theme.resolve('one-giant-leap');
  a.equal(new Stage(document.createElement('canvas'), { thumb: true, deck: PD.compile('one-giant-leap') }).theme.key, G.key, 'OGL: the deck theme');
});

T.test('Stage.enter (M3) reads its former constants from theme.timing and theme.motion', function (a) {
  var Stage = PD.get('core/stage').Stage, Ease = PD.get('core/ease').Ease;
  var th = PD.theme.resolve('one-giant-leap', {
    timing: { worldTime: 4, worldEase: 'linear', settledWorldTime: 2, textDelay: 1.25, stepTextDelay: 0.75, settledTextDelay: 0.4,
              settledDurMax: 1.0, settledSpreadMax: 0.25, preludeTime: 0.6 },
    motion: { ease: 'outQuad', dur: 2.2, spread: 0.8, arc: 0.1, stagger: 'radial', entry: 'center', exit: 'fade' } });
  var slides = [
    { id: 'a', world: { speed: 50 }, text: [{ str: 'Kick', style: 'kicker', reveal: 'fade' }],
      steps: [{ text: [{ str: 'Step', style: 'caption', reveal: 'fade' }] }] },
    { id: 'b', prelude: 'explode', text: [{ str: 'Boom', style: 'title', reveal: 'fade' }] },
    { id: 'c', worldTime: 3, worldEase: 'inQuad', textDelay: 0.05, motion: { dur: 0.5, stagger: 'none' }, world: { speed: 70 },
      text: [{ str: 'Own', style: 'title', reveal: 'fade' }] }
  ];
  var st = new Stage(document.createElement('canvas'), { thumb: true, deck: m3Compiled(th, slides) });
  var morphs = [], explodes = 0;
  st.field.morph = function (targets, o) { morphs.push(o); };
  st.field.explode = function () { explodes++; };
  (function () {
    var L = function (str) { return st.layers.filter(function (l) { return l.str === str.toUpperCase() || l.str === str; })[0]; };
    st.enter(0, 0, 'live');
    var T0 = st.T;
    a.near(L('Kick').inStart, T0 + 1.25, 1e-9, 'live: timing.textDelay');
    a.equal(st.tw.speed.dur, 4, 'live: timing.worldTime');
    a.equal(st.tw.speed.ease, Ease.get('linear'), 'timing.worldEase');
    var m = morphs[morphs.length - 1];
    a.deepEqual([m.ease, m.dur, m.spread, m.arc, m.stagger, m.entry, m.exit], ['outQuad', 2.2, 0.8, 0.1, 'radial', 'center', 'fade'], 'live: theme.motion');
    st.enter(0, 1, 'live');
    a.near(L('Step').inStart, st.T + 0.75, 1e-9, 'step: timing.stepTextDelay');
    st.enter(1, 0, 'live');
    a.near(L('Boom').inStart, st.T + 1.25 + 0.6, 1e-9, 'prelude: timing.preludeTime');
    a.equal(explodes, 1);
    st.enter(0, 0, 'settled');
    a.near(L('Kick').inStart, st.T + 0.4, 1e-9, 'settled: timing.settledTextDelay');
    a.equal(st.tw.speed.dur, 2, 'settled: timing.settledWorldTime');
    m = morphs[morphs.length - 1];
    a.deepEqual([m.dur, m.spread], [1.0, 0.25], 'settled: timing.settledDurMax / settledSpreadMax');
    st.enter(2, 0, 'live');
    a.near(L('Own').inStart, st.T + 0.05, 1e-9, 'a scene value still wins');
    a.equal(st.tw.speed.dur, 3); a.equal(st.tw.speed.ease, Ease.get('inQuad'));
    m = morphs[morphs.length - 1];
    a.deepEqual([m.dur, m.stagger, m.ease], [0.5, 'none', 'outQuad'], 'scene motion over theme motion, per key');
  })();
});

T.test('TextLayer (M3) reads env.theme: font family, style table and named colours', function (a) {
  var TextLayer = PD.get('core/text').TextLayer, Stage = PD.get('core/stage').Stage;
  var th = PD.theme.resolve('one-giant-leap', { fonts: { display: 'Georgia, serif' }, colors: { gold: '#010203' },
    styles: { kicker: { size: 33 }, plain: { weight: 400, size: 30, track: 0.01, fill: 'gold' } } });
  var st = new Stage(document.createElement('canvas'), { thumb: true, deck: m3Compiled(th) });
  var L = new TextLayer({ str: 'Hello', style: 'kicker', color: 'gold' }, st.env);
  a.equal(L.theme, th);
  a.equal(L.font(), '600 33px Georgia, serif');
  a.equal(L.o.size, 33);
  a.equal(L.o.glow, '#ff9a3d', 'the rest of the style comes from the theme');
  a.equal(L.fillStyle(document.createElement('canvas').getContext('2d'), 0, 0, 10, 10), '#010203', 'named fill → theme colour');
  var P = new TextLayer({ str: 'II', style: 'plain' }, { theme: th });
  a.equal(typeof P.col, 'function', 'env.col is optional');
  var pts = P.points(4, 5);
  a.ok(pts.length > 0, pts.length + ' points');
  a.deepEqual([pts[0].r, pts[0].g, pts[0].b], [1, 2, 3], 'points use the theme colours');
  var U = new TextLayer({ str: 'x', style: 'nope' }, st.env);
  a.equal(U.o.size, th.styles.title.size, 'an unknown style falls back to the theme\'s title');
  var G = PD.theme.resolve('one-giant-leap');
  a.equal(new TextLayer({ str: 'x', style: 'statement' }, { theme: G }).font(),
          '500 64px "Avenir Next", "Avenir", "Helvetica Neue", "Segoe UI", system-ui, sans-serif', 'OGL: today\'s font string');
});

T.test('Space (M3): nebula textures are cached by palette, not preset name; the world reads the theme', function (a) {
  var Space = PD.get('core/space').Space, U = PD.get('core/util').U;
  var palA = ['#123401', '#123402', '#123403'], palB = ['#123404', '#123405', '#123406'];
  var built = 0, orig = U.canvas;
  U.canvas = function (w, h) { if (w === 256 && h === 256) built++; return orig.apply(this, arguments); };
  try {
    var t0 = Space.nebulaTexture(palA, 0);
    a.equal(built, 1);
    a.equal(Space.nebulaTexture(palA.slice(), 0), t0, 'an equal palette (another array) shares the texture');
    a.equal(built, 1);
    a.ok(Space.nebulaTexture(palA, 1) !== t0, 'per seed');
    a.ok(Space.nebulaTexture(palB, 0) !== t0, 'per palette');
    a.equal(built, 3);
    var th1 = PD.theme.resolve('one-giant-leap', { nebulae: { aurora: palA, extra: palB } });
    var th2 = PD.theme.resolve('cosmos', { nebulae: { aurora: palB } });
    var w1 = new Space.World(7, th1), w2 = new Space.World(7, th2);
    a.deepEqual(w1.palette('aurora'), palA);
    a.deepEqual(w2.palette('aurora'), palB, 'the same preset name, another theme, another palette');
    a.ok(Space.nebulaTexture(w1.palette('aurora'), 0) !== Space.nebulaTexture(w2.palette('aurora'), 0), 'so no stale texture');
    a.deepEqual(w1.palette('no-such-preset'), palA, 'an unknown name falls back to the theme\'s first preset');
    a.deepEqual(w1.col('cyan'), PD.get('core/util').col('cyan'));
    var before = built;
    Space.preload({ nebulae: { p: ['#123407', '#123408', '#123409'] } });
    a.equal(built - before, 3, 'preload builds every palette × seeds 0–2');
    var after = built;
    for (var s = 0; s < 3; s++) Space.nebulaTexture(['#123407', '#123408', '#123409'], s);
    a.equal(built, after, 'and later draws reuse them');
  } finally { U.canvas = orig; }
});

T.test('theme values are reached through the theme only (M6): core/theme exports resolve and hash; no STYLES FONT COLORS NEBULA_PRESETS globals', function (a) {
  var one = m3Kit({ only: m3Base({ nebulae: { n1: ['#010101', '#020202', '#030303'] } }) });
  a.deepEqual(Object.keys(one.mod).sort(), ['hash', 'resolve'], 'core/theme exports (compatFor is gone at M6)');
  one.K.theme.resolve('only');
  a.deepEqual(Object.keys(one.g).sort(), ['PD'], 'resolving binds nothing');
  ['FONT', 'STYLES', 'COLORS', 'NEBULA_PRESETS'].forEach(function (n) {
    a.ok(!(n in window), n + ' is not a global (the deck page binds nothing since M6)');
    ['core/util', 'core/text', 'core/space', 'core/stage', 'core/player'].forEach(function (m) {
      if (n === 'COLORS' && m === 'core/util') return;     // util keeps the base table as a module export
      a.ok(!(n in PD.get(m)), m + ' does not export ' + n);
    });
  });
  a.ok(!/compat/i.test(PD.get('core/player').boot.toString()), 'the Player binds no compat global');
});
