/* tools/test/specs/wp1-deck.test.js — M5 deck format (spec §4.2 DeckSource and helpers, §4.3 compile / compileScene,
 * §4.8 assets, §4.9 Stage { deck } and setDeck eviction, §6.10 OGL story metadata, §8.2 M5).
 * Anything that registers a theme, template or deck runs on a FRESH engine (the harness factories re-registered on
 * PD.kernel(fakeGlobal)), so the harness registries are never modified. Asset tests use their own deck ids and remove
 * what they add. */

var M5_MODS = ['core/util', 'core/ease', 'core/glow', 'core/fx', 'core/space', 'core/earth', 'core/shapes', 'core/field',
               'core/text', 'core/theme', 'core/assets', 'core/compile', 'core/stage',
               'worlds/core', 'worlds/cosmos', 'worlds/planet', 'worlds/spark'];
function m5Engine(names) {
  var g = {}; PD.kernel(g);
  var K = g.PD, all = PD.modules();
  (names || M5_MODS).forEach(function (n) {
    var rec = all.filter(function (m) { return m.name === n; })[0];
    if (!rec) throw new Error('m5Engine: no module ' + n);
    K.module(n, rec.deps, rec.factory, rec.opts);
  });
  return K;
}
function m5ThemeSrc(worlds, extra) {
  var t = {
    label: 'M5', worlds: worlds || ['cosmos'], fonts: { display: 'sans-serif' }, colors: { white: '#ffffff', red: '#ff0000' },
    roles: { accent: '#123456', future: ['#111111', '#222222'] },
    styles: { title: { weight: 600, size: 40, track: 0.1, fill: '#ffffff' }, kicker: { weight: 600, size: 20, track: 0.5, fill: '@accent' } },
    nebulae: { n1: ['#010101', '#020202', '#030303'] }, world: {},
    motion: { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' },
    timing: { worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
              settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9 },
    shots: { DRIFT: { speed: 1 }, WIDE: { speed: 2, stars: 0.5 } },
    ui: { accent: '#abcabc' }
  };
  for (var k in extra || {}) t[k] = extra[k];
  return t;
}
function m5Canvas(w, h) { var c = document.createElement('canvas'); c.width = w || 64; c.height = h || 36; return c; }
function m5Arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
function m5Live(scenes) {             // every element / shape spec object a deck can show (as setDeck computes it)
  var texts = new Set(), shapes = new Set();
  scenes.forEach(function (sl) {
    m5Arr(sl.text).forEach(function (s) { texts.add(s); }); m5Arr(sl.elements).forEach(function (s) { texts.add(s); });
    m5Arr(sl.particles).forEach(function (s) { shapes.add(s); });
    m5Arr(sl.steps).forEach(function (st) {
      m5Arr(st.text).forEach(function (s) { texts.add(s); }); m5Arr(st.elements).forEach(function (s) { texts.add(s); });
      m5Arr(st.particles).forEach(function (s) { shapes.add(s); });
    });
  });
  return { texts: texts, shapes: shapes };
}
function m5Clone(v) {                 // new objects all the way down; functions by reference
  if (Array.isArray(v)) return v.map(m5Clone);
  if (!v || typeof v !== 'object') return v;
  var o = {};
  for (var k in v) o[k] = m5Clone(v[k]);
  return o;
}
var M5_OGL = [['spark', 'spark', 'cold-open', 2], ['title', 'name', 'brand-reveal', 4], ['warp', 'zoom-out', 'hyperspace', 5],
  ['galaxy', 'you-are-here', 'galaxy-reveal', 3], ['home', 'you-are-here', 'planet', 2], ['sunrise', 'human-truth', 'sunrise', 4],
  ['leaps', 'pattern', 'timeline', 3], ['box', 'the-box', 'the-box', 3], ['next', 'the-leap', 'pivot', 5], ['thanks', 'callback', 'finale', 4]];

T.test('deck.js (M5): one-giant-leap is a PD.deck factory; compile gives the §4.3 CompiledDeck with meta.story and the §6.10 scene metadata', function (a) {
  var def = PD.deck.get('one-giant-leap');
  a.equal(typeof def, 'function', 'a factory (PD, h) → DeckSource');
  var c = PD.compile('one-giant-leap');
  a.deepEqual(Object.keys(c).sort(), ['assetsDeckId', 'errors', 'id', 'meta', 'sceneKeys', 'scenes', 'source', 'theme', 'themeKey', 'worlds']);
  a.equal(c.id, 'one-giant-leap'); a.equal(c.source.id, 'one-giant-leap'); a.equal(c.source.format, 2);
  a.equal(c.meta, c.source.meta);
  a.equal(c.meta.title, 'One Giant Leap'); a.equal(c.meta.theme, 'one-giant-leap'); a.equal(c.meta.generator, 'hand');
  a.deepEqual(c.meta.story, {
    framework: 'giant-leap', goal: 'inspire', tone: 'cinematic', audience: '', targetMin: null,
    bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
    shortIdea: 'Augmentation, not automation', oldWay: 'automation', newWay: 'augmentation', ask: '', proof: [],
    brand: 'One Giant Leap', tagline: 'Making work more human'
  }, 'meta.story = spec §6.10');
  a.equal(c.theme.id, 'one-giant-leap'); a.equal(c.themeKey, c.theme.key);
  a.equal(c.theme.key, PD.theme.resolve('one-giant-leap').key, 'the deck folder\'s theme, unpatched');
  a.deepEqual(c.worlds, ['core', 'cosmos', 'planet', 'spark']);
  a.equal(c.assetsDeckId, 'one-giant-leap');
  a.deepEqual(c.errors, []);
  a.deepEqual(c.scenes.map(function (s) { return [s.id, s.beat, s.like, s.energy]; }), M5_OGL, 'scene ids and §6.10 beat / like / energy');
  c.scenes.forEach(function (s, i) { a.equal(s, c.source.scenes[i], 'raw scene ' + i + ' passed by reference'); });
  a.equal(c.sceneKeys.length, 10);
  c.sceneKeys.forEach(function (k) { a.ok(/^[0-9a-f]{16}$/.test(k), k); });
  a.equal(new Set(c.sceneKeys).size, 10, 'scene keys are distinct');
  // spot checks of verbatim values (the full value-by-value comparison with the pre-v2 scenes.js was done in Node at M5)
  var leaps = c.scenes[6];
  a.equal(leaps.steps.length, 7); a.equal(leaps.particles[0].id, 'curve'); a.equal(typeof leaps.particles[0].points, 'function');
  var curve = leaps.particles[0].points();
  a.equal(curve.length, 421);
  a.deepEqual([curve[0].color, curve[420].color, curve[0].x, curve[420].y], ['#2fd4c4', '#ffd27a', 170, 270], 'curve: teal → gold, theme-bound col()');
  a.deepEqual(leaps.steps[6].text.map(function (t) { return t.str; }), ['Now', 'The next leap']);
  a.equal(leaps.steps[6].particles[0].points[0].color, '#ff8a3d');
  a.deepEqual([c.scenes[3].world.earthY, c.scenes[3].world.sunY, c.scenes[3].world.earthR, c.scenes[5].world.earthR], [700, 1000, 8, 2600], 'W(BELOW|HORIZON, …)');
  // the factory ran once: a second compile shares every scene object
  var c2 = PD.compile('one-giant-leap');
  a.ok(c2 !== c);
  c2.scenes.forEach(function (s, i) { a.equal(s, c.scenes[i], 'scene ' + i + ': the same object in a second compile'); });
  a.deepEqual(c2.sceneKeys, c.sceneKeys); a.equal(c2.theme, c.theme, 'the same resolved theme object');
  ['DECK', 'HORIZON', 'BELOW', 'curveXY', 'curvePoints', 'nodePoints', 'leap'].forEach(function (n) { a.ok(!(n in window), n + ' is not a global'); });
});

T.test('compile (§4.3): raw scenes by reference; template scenes: props normalized, expand, overrides, metadata, stepNotes/stepDwell; error cards', function (a) {
  var K = m5Engine();
  K.theme('t5', m5ThemeSrc(['cosmos', 'ghost']));
  var calls = 0, envs = [], outs = [];
  K.template('card', {
    props: { title: { type: 'text', required: true }, size: { type: 'number', 'default': 40 }, sub: { type: 'text' }, on: { type: 'bool' },
             req2: { type: 'text', required: true }, items: { type: 'list', of: { label: { type: 'text', 'default': '?' }, n: { type: 'number' } } },
             tags: { type: 'list', of: 'text' }, one: { type: 'list' } },
    example: { title: 'Example', req2: 'not used', sub: 'from example', on: false },
    expand: function (p, env) {
      calls++; envs.push(env);
      var out = { world: env.shot('WIDE'), text: [{ str: p.title, style: 'title', size: p.size }],
                  steps: [{ text: [{ str: 'a' }] }, { text: [{ str: 'b' }] }], motion: { dur: 1, ease: 'x' }, props: p };
      outs.push(out);
      return out;
    }
  });
  K.template('boom', { props: {}, example: {}, expand: function () { throw new Error('kaput'); } });
  K.template('nil', { props: {}, example: {}, expand: function () { return 'nope'; } });
  var raw = { id: 'raw', text: [{ str: 'R' }] };
  var src = { id: 'deck5', meta: { theme: 't5', title: 'T' }, scenes: [
    raw,
    { id: 'tpl', template: 'card', props: { title: 'Hello', size: '64', on: 'true', items: [{ n: '3' }, { label: 'x' }], tags: [5, 'y'], one: 'solo' },
      notes: 'N', dwell: 4, beat: 'b', energy: 3, point: 'P', lint: { ignore: ['x'] }, flashback: true,
      stepNotes: ['s1', null], stepDwell: [null, 9], overrides: { motion: { ease: 'y', dur: null }, text: [{ str: 'over' }], extra: { k: 1 } } },
    { id: 'unk', template: 'no-such-template', props: {} },
    { id: 'bad', template: 'boom', props: {} },
    'oops',
    { id: 'nil', template: 'nil' }
  ] };
  var before = JSON.stringify(src);
  var c = K.compile(src);
  a.equal(c.scenes[0], raw, 'a raw scene is passed by reference');
  a.equal(c.source, src); a.equal(c.meta, src.meta); a.equal(c.id, 'deck5');
  a.equal(calls, 1, 'expand ran once');
  var t = c.scenes[1];
  a.deepEqual(t.props, { title: 'Hello', size: 64, sub: 'from example', on: true, items: [{ label: '?', n: 3 }, { label: 'x' }], tags: ['5', 'y'], one: ['solo'] },
    'defaults (spec default, else example for optional props, never for required ones) and coercion (number, bool, text, list, list items)');
  a.ok(!('req2' in t.props), 'a required prop is not filled from the example (PD.validate reports it)');
  a.deepEqual(t.world, { speed: 2, stars: 0.5 }, 'env.shot');
  a.deepEqual(t.motion, { ease: 'y' }, 'overrides deep-merge; null deletes');
  a.deepEqual(t.text, [{ str: 'over' }], 'overrides: arrays replace');
  a.deepEqual(t.extra, { k: 1 });
  a.deepEqual([t.id, t.notes, t.dwell, t.beat, t.energy, t.point, t.flashback, t.like], ['tpl', 'N', 4, 'b', 3, 'P', true, 'card']);
  a.deepEqual(t.lint, { ignore: ['x'] });
  a.deepEqual(t.steps, [{ text: [{ str: 'a' }], notes: 's1' }, { text: [{ str: 'b' }], dwell: 9 }], 'stepNotes / stepDwell → steps[k]');
  a.ok(!('stepNotes' in t) && !('stepDwell' in t) && !('template' in t) && !('overrides' in t), 'TemplateScene fields do not leak');
  var o = outs[0];
  a.deepEqual(o.motion, { dur: 1, ease: 'x' }, 'the expansion itself is not mutated');
  a.ok(!('id' in o) && !('notes' in o.steps[0]) && o.text[0].str === 'Hello');
  a.deepEqual(c.scenes[2], { id: 'unk', world: {}, text: [{ str: '⚠ unknown template "no-such-template"', style: 'caption' }] }, 'unknown template → error card');
  a.deepEqual(c.scenes[3], { id: 'bad', world: {}, text: [{ str: '⚠ template "boom" failed: kaput', style: 'caption' }] }, 'expand throws → error card');
  a.equal(c.scenes[4].id, 'scene-5'); a.equal(c.scenes[5].id, 'nil');
  a.deepEqual(c.errors, [
    { level: 'error', code: 'template.unknown', scene: 2, sceneId: 'unk', msg: 'unknown template "no-such-template"' },
    { level: 'error', code: 'template.expand-failed', scene: 3, sceneId: 'bad', msg: 'template "boom" failed: kaput' },
    { level: 'error', code: 'scene.invalid', scene: 4, sceneId: '', msg: 'scene 5 is not a scene object (string)' },
    { level: 'error', code: 'template.expand-failed', scene: 5, sceneId: 'nil', msg: 'template "nil" failed: expand returned string, not a scene object' }
  ]);
  a.equal(JSON.stringify(src), before, 'the DeckSource is not mutated');
  var c2 = K.compile(src);
  a.equal(c2.scenes[0], raw); a.ok(c2.scenes[1] !== t, 'a template scene is expanded again per compile');
  a.equal(calls, 2); a.deepEqual(c2.sceneKeys, c.sceneKeys, 'scene keys are content hashes');
  a.ok(c.sceneKeys[1] !== c.sceneKeys[0]);
  var c3 = K.compile({ id: 'deck5', meta: src.meta, scenes: [raw, { id: 'tpl', template: 'card', props: { title: 'Other' } }] });
  a.ok(c3.sceneKeys[1] !== c.sceneKeys[1] && c3.sceneKeys[0] === c.sceneKeys[0]);
  // a raw scene with functions hashes by their source
  var f1 = { id: 'f', particles: [{ shape: 'points', points: function () { return [1]; } }] };
  var f2 = { id: 'f', particles: [{ shape: 'points', points: function () { return [2]; } }] };
  a.ok(K.compile({ id: 'h5', meta: { theme: 't5' }, scenes: [f1] }).sceneKeys[0] !== K.compile({ id: 'h5', meta: { theme: 't5' }, scenes: [f2] }).sceneKeys[0]);
  var cyc = { id: 'cyc' }; cyc.self = cyc;
  a.ok(/^[0-9a-f]{16}$/.test(K.compile({ id: 'h5', meta: { theme: 't5' }, scenes: [cyc] }).sceneKeys[0]), 'cycles do not hang the hash');
});

T.test('helpers h / template env (§4.2): W U col CX… theme shots shot role hasWorld hasParam measure fit asset', function (a) {
  var K = m5Engine();
  K.theme('t5', m5ThemeSrc(['cosmos', 'ghost']));
  var env = null;
  K.template('peek', { props: {}, example: {}, expand: function (p, e) { env = e; return {}; } });
  K.assets('deck5', { logo: { type: 'image', src: 'data:image/png;base64,AAAA', w: 1200, h: 400, name: 'logo.png', bytes: 3 } });
  var c = K.compile({ id: 'deck5', meta: { theme: 't5', worlds: ['spark'] }, scenes: [{ id: 'p', template: 'peek', props: {} }] });
  a.deepEqual(c.worlds, ['core', 'cosmos', 'ghost', 'spark'], 'core + theme.worlds + meta.worlds');
  a.deepEqual(Object.keys(env).sort(), ['CX', 'CY', 'DH', 'DW', 'U', 'W', 'asset', 'col', 'fit', 'hasParam', 'hasWorld', 'measure', 'role', 'shot', 'shots', 'theme']);
  a.equal(env.theme, c.theme); a.equal(env.shots, c.theme.shots);
  a.deepEqual([env.CX, env.CY, env.DW, env.DH], [960, 540, 1920, 1080]); a.equal(env.U, K.get('core/util').U);
  a.deepEqual(env.W({ a: 1, b: 1 }, { b: 2 }), { a: 1, b: 2 });
  var wide = env.shot('WIDE');
  a.deepEqual(wide, { speed: 2, stars: 0.5 }); wide.speed = 9;
  a.equal(c.theme.shots.WIDE.speed, 2, 'shot() returns a copy');
  a.deepEqual(env.shot('missing'), { speed: 1 }, 'falls back to DRIFT'); a.deepEqual(env.shot('missing', 'WIDE'), { speed: 2, stars: 0.5 });
  a.equal(env.role('accent'), '#123456');
  var fut = env.role('future');
  a.deepEqual(fut, ['#111111', '#222222']); a.ok(fut !== c.theme.roles.future, 'role arrays are copies');
  a.equal(env.role('nope'), undefined);
  a.deepEqual(env.col('red'), [255, 0, 0]); a.deepEqual(env.col('#010203'), [1, 2, 3]); a.deepEqual(env.col('cyan'), K.get('core/util').col('cyan'));
  a.ok(env.hasWorld('core') && env.hasWorld('cosmos') && env.hasWorld('spark'));
  a.ok(!env.hasWorld('planet'), 'registered but not enabled'); a.ok(!env.hasWorld('ghost'), 'listed but not loaded');
  a.ok(env.hasParam('speed') && env.hasParam('roll') && env.hasParam('sparkX'));
  a.ok(!env.hasParam('earth') && !env.hasParam('nope') && !env.hasParam('constructor'));
  var E = K.element.get('text'), th = { theme: c.theme };
  var m = env.measure('Hello world', 'title'), ref = E.measure({ str: 'Hello world', style: 'title' }, th);
  a.deepEqual(m, { w: ref.w, h: ref.h, lines: ref.lines });
  a.deepEqual(env.measure('Hi', 'title', 80).h, E.measure({ str: 'Hi', style: 'title', size: 80 }, th).h);
  var width = function (s) { return E.measure({ str: 'A long line of display text', style: 'title', size: s, maxWidth: 1e9 }, th).w; };
  a.equal(env.fit('A long line of display text', 'title', 40, 5000), 40, 'fits: the preferred size');
  var f = env.fit('A long line of display text', 'title', 40, 300);
  a.ok(f < 40 && width(f) <= 300 && width(f + 1) > 300, 'the largest size that fits: ' + f);
  a.deepEqual(env.asset('logo'), { type: 'image', src: 'data:image/png;base64,AAAA', w: 1200, h: 400, name: 'logo.png', bytes: 3 });
  a.equal(env.asset('none'), null);
  var c2 = K.compile({ id: 'other5', meta: { theme: 't5' }, scenes: [{ id: 'p', template: 'peek', props: {} }] }, { assetsDeckId: 'deck5' });
  a.equal(c2.assetsDeckId, 'deck5'); a.equal(env.asset('logo').w, 1200, 'opts.assetsDeckId picks the asset store');
});

T.test('compile: the theme (§4.3, §4.4) — meta.theme, else the theme named like the deck, else the only theme; meta + opts patches', function (a) {
  var K = m5Engine();
  K.theme('a5', m5ThemeSrc()); K.theme('b5', m5ThemeSrc(['cosmos'], { label: 'B' }));
  a.equal(K.compile({ id: 'x5', meta: { theme: 'b5' }, scenes: [] }).theme.id, 'b5');
  a.equal(K.compile({ id: 'a5', meta: {}, scenes: [] }).theme.id, 'a5', 'no meta.theme: the theme with the deck id');
  a.throws(function () { K.compile({ id: 'zz', meta: {}, scenes: [] }); },
           /pixeldeck: deck "zz" names no theme \(meta\.theme\), and 2 themes are registered \(a5, b5\) with none named "zz"; set meta\.theme/);
  a.throws(function () { K.compile({ id: 'x5', meta: { theme: 'nope' }, scenes: [] }); }, /pixeldeck: no theme "nope"/);
  var K1 = m5Engine(); K1.theme('only5', m5ThemeSrc());
  a.equal(K1.compile({ id: 'q', scenes: [] }).theme.id, 'only5', 'the page\'s only theme');
  var src = { id: 'p5', meta: { theme: 'a5', themePatch: { colors: { red: '#000001' }, ui: { accent: '#000002' } } }, scenes: [] };
  var p = K.compile(src, { themePatch: { colors: { red: '#000003' }, styles: { kicker: null } } });
  a.deepEqual([p.theme.colors.red, p.theme.ui.accent, 'kicker' in p.theme.styles], ['#000003', '#000002', false], 'meta.themePatch, then opts.themePatch (null deletes)');
  var q = K.compile(src);
  a.deepEqual([q.theme.colors.red, 'kicker' in q.theme.styles], ['#000001', true]);
  a.ok(p.themeKey !== q.themeKey && q.themeKey !== K.compile({ id: 'a5', meta: { theme: 'a5' }, scenes: [] }).themeKey);
  a.equal(K.compile(src).theme, q.theme, 'the same id + patch resolve to the same theme object');
  a.deepEqual(K.compile({ id: 'w5', meta: { theme: 'a5', worlds: ['spark', 'cosmos', 'planet'] }, scenes: [] }).worlds, ['core', 'cosmos', 'spark', 'planet']);
  a.throws(function () { K.compile('missing5'); }, /pixeldeck: no deck "missing5" \(load its deck\.js\)/);
  a.throws(function () { K.compile(5); }, /PD\.compile needs a deck id or a DeckSource, not number/);
  a.throws(function () { K.compile({ meta: {}, scenes: [] }); }, /a DeckSource needs an id/);
  a.throws(function () { K.compile({ id: 'n5', meta: {} }); }, /deck "n5" must be a DeckSource \{ meta, scenes: \[\] \}/);
  K.deck('reg5', { id: 'reg5', meta: { theme: 'a5' }, scenes: [] });
  K.deck('mis5', { id: 'other', meta: { theme: 'a5' }, scenes: [] });
  a.equal(K.compile('reg5').id, 'reg5', 'an object registered with PD.deck');
  a.throws(function () { K.compile('mis5'); }, /deck "mis5" says its id is "other"/);
  a.throws(function () { K.compile(); }, /PD\.compile\(\) needs a deck id: 2 decks are registered \(reg5, mis5\)/);
  var K2 = m5Engine(); K2.theme('a5', m5ThemeSrc()); K2.deck('solo5', { id: 'solo5', meta: { theme: 'a5' }, scenes: [] });
  a.equal(K2.compile().id, 'solo5', 'no id: the only registered deck');
});

T.test('deck factories (§4.2): run once per page and theme key; (PD, h); array results; ids; theme helpers inside the factory', function (a) {
  var K = m5Engine();
  K.theme('f5', m5ThemeSrc()); K.theme('g5', m5ThemeSrc(['cosmos'], { colors: { red: '#00ff00' } }));
  var runs = 0, hs = [];
  K.deck('f5', function (P, h) {
    runs++; hs.push(h);
    a.equal(P, K, 'factory gets the kernel');
    return { meta: { theme: 'f5', title: 'F' }, scenes: [{ id: 'one', text: [{ str: 'x' }], particles: [{ shape: 'points', points: function () { return [{ x: h.CX, y: 0, color: 'red' }]; } }] }] };
  });
  var c1 = K.compile('f5'), c2 = K.compile('f5');
  a.equal(runs, 1, 'once per page');
  a.equal(c1.scenes[0], c2.scenes[0]); a.equal(c1.source, c2.source);
  a.deepEqual([c1.source.format, c1.source.id, c1.meta.title], [2, 'f5', 'F'], 'compile fills format and id in');
  var c3 = K.compile('f5', { themePatch: { colors: { red: '#0000ff' } } });
  a.equal(runs, 2, 'another theme key: the factory runs again, with helpers bound to that theme');
  a.ok(c3.scenes[0] !== c1.scenes[0]);
  a.deepEqual(hs[1].col('red'), [0, 0, 255]); a.deepEqual(hs[0].col('red'), [255, 0, 0]);
  K.compile('f5'); a.equal(runs, 2, 'the first theme key is still cached');
  K.compile('f5', { assetsDeckId: 'elsewhere' }); a.equal(runs, 3, 'another assets id: again');
  // an array of raw scenes
  K.theme('arr5', m5ThemeSrc());
  K.deck('arr5', function () { return [{ id: 's' }]; });
  var ca = K.compile('arr5');
  a.deepEqual([ca.meta.theme, ca.meta.title, ca.source.format, ca.source.id, ca.scenes[0].id], ['arr5', 'arr5', 2, 'arr5', 's']);
  K.deck('mis5', function () { return { id: 'other', meta: { theme: 'f5' }, scenes: [] }; });
  a.throws(function () { K.compile('mis5'); }, /deck "mis5" says its id is "other"/);
  K.deck('bad5', function () { return { meta: {} }; });
  a.throws(function () { K.compile('bad5'); }, /deck "bad5": its factory must return a DeckSource \{ meta, scenes: \[\] \} or an array of scenes, not object/);
  K.deck('thr5', function () { throw new Error('factory broke'); });
  a.throws(function () { K.compile('thr5'); }, /factory broke/);
  // theme helpers used while the factory runs: the deck-id theme is bound early, and meta must agree
  var early = null;
  K.deck('g5', function (P, h) { early = h.col('red'); return { meta: { theme: 'g5' }, scenes: [] }; });
  a.equal(K.compile('g5').theme.id, 'g5'); a.deepEqual(early, [0, 255, 0]);
  K.deck('h5', function (P, h) { h.shot('WIDE'); return { meta: { theme: 'f5' }, scenes: [] }; });
  a.throws(function () { K.compile('h5'); }, /deck "h5" uses a theme helper inside its factory before its meta\.theme is known, and 3 themes are registered \(f5, g5, arr5\) with none named "h5"/);
  K.theme('h5', m5ThemeSrc(['cosmos'], { label: 'H' }));     // other values than f5, so another theme key
  a.throws(function () { K.compile('h5'); }, /deck "h5": its factory used theme "h5" through h before meta\.theme \("f5"\) was known/);
  K.deck('i5', function (P, h) { h.shot('WIDE'); return { meta: { theme: 'f5' }, scenes: [] }; });
  K.theme('i5', m5ThemeSrc());                                // the same values as f5: the same key, so no conflict
  a.equal(K.compile('i5').theme.id, 'f5', 'equal values are interchangeable');
});

T.test('compileScene (§4.3): a NEW CompiledDeck; only that scene is recompiled; keys, errors and source follow; the input is untouched', function (a) {
  var c = PD.compile('one-giant-leap');
  var keys = c.sceneKeys.slice(), scenes = c.scenes.slice(), srcScenes = c.source.scenes.slice();
  var edited = { id: 'home', world: { earth: 1 }, text: [{ str: 'Edited', style: 'statement' }] };
  var d = PD.compileScene(c, 4, edited);
  a.ok(d !== c);
  a.equal(d.scenes[4], edited, 'a raw scene by reference');
  d.scenes.forEach(function (s, i) { if (i !== 4) a.equal(s, c.scenes[i], 'scene ' + i + ' reused by reference'); });
  d.sceneKeys.forEach(function (k, i) { if (i === 4) a.ok(k !== keys[4]); else a.equal(k, keys[i]); });
  a.equal(d.source.scenes[4], edited); a.ok(d.source !== c.source); a.equal(d.source.meta, c.source.meta);
  a.equal(d.theme, c.theme); a.equal(d.meta, c.meta); a.deepEqual(d.worlds, c.worlds); a.equal(d.id, c.id);
  a.deepEqual(c.sceneKeys, keys); a.deepEqual(c.scenes, scenes); a.deepEqual(c.source.scenes, srcScenes, 'the input deck is untouched');
  var e = PD.compileScene(c, 10, { id: 'more' });
  a.equal(e.scenes.length, 11); a.equal(e.sceneKeys.length, 11); a.equal(e.source.scenes.length, 11, 'index = length appends');
  [-1, 12, 1.5, '2'].forEach(function (i) { a.throws(function () { PD.compileScene(c, i, edited); }, /PD\.compileScene index .* is outside 0\.\.10/); });
  a.throws(function () { PD.compileScene({}, 0, edited); }, /PD\.compileScene needs a CompiledDeck/);
  var f = PD.compileScene(c, 2, { id: 'x', template: 'wp1-no-such-template', props: {} });
  a.deepEqual(f.errors.map(function (er) { return [er.code, er.scene, er.sceneId]; }), [['template.unknown', 2, 'x']]);
  a.deepEqual(f.scenes[2].text[0].style, 'caption');
  var g = PD.compileScene(f, 2, c.source.scenes[2]);
  a.deepEqual(g.errors, [], 'recompiling the scene replaces its errors');
  a.equal(g.scenes[2], c.scenes[2]); a.equal(g.sceneKeys[2], keys[2]);
});

T.test('Stage (M5, §4.9): new PD.Stage(canvas, { deck }) reads the compiled deck — never window.DECK; env.assets reads PD.asset', function (a) {
  a.equal(PD.Stage, PD.get('core/stage').Stage);
  a.equal(PD.compile, PD.get('core/compile').compile); a.equal(PD.compileScene, PD.get('core/compile').compileScene);
  var c = PD.compile('one-giant-leap'), st = new PD.Stage(m5Canvas(), { deck: c, thumb: true });
  a.equal(st.deck, c); a.equal(st.theme, c.theme); a.equal(st.env.theme, c.theme);
  var had = Object.prototype.hasOwnProperty.call(window, 'DECK'), old = window.DECK;
  window.DECK = [{ id: 'bogus', steps: [{}, {}, {}, {}, {}, {}, {}, {}, {}] }];
  try {
    a.equal(st.stepsOf(0), 0); a.equal(st.stepsOf(6), 7); a.equal(st.stepsOf(42), 0);
    a.equal(st.resolve(0, 0).scene, c.scenes[0]);
    st.enter(9, 0, 'instant');
    a.deepEqual(st.cur, { slide: 9, step: 0 });
    a.equal(st.layers.length, 2, 'the finale\'s two texts');
    st.enter(20, 0, 'instant');
    a.deepEqual(st.cur, { slide: 9, step: 0 }, 'no such scene: nothing happens');
  } finally { if (had) window.DECK = old; else delete window.DECK; }
  a.equal(st.env.assets('anything'), null, 'OGL has no assets');
  var K = m5Engine(); K.theme('t5', m5ThemeSrc());
  var dk = K.compile({ id: 'as5', meta: { theme: 't5' }, scenes: [] }, { assetsDeckId: 'store5' });
  var s2 = new (K.get('core/stage').Stage)(m5Canvas(), { deck: dk, thumb: true }), asked = [];
  K.asset = function (d, id) { asked.push(d + '/' + id); return { id: id }; };
  a.deepEqual(s2.env.assets('logo'), { id: 'logo' }); a.deepEqual(asked, ['store5/logo'], 'the compiled deck\'s assetsDeckId');
});

T.test('setDeck (§4.9): a changed theme key or world list is a full reset', function (a) {
  var c = PD.compile('one-giant-leap'), st = new PD.Stage(m5Canvas(), { deck: c, thumb: true });
  st.enter(6, 3, 'instant');
  a.ok(st.layerBySpec.size > 0 && st.shapeBySpec.size > 0 && st.layers.length > 0 && st.field.list.length > 0, 'caches are filled');
  st.W.speed = 1234; st.warmDone = true; st.warmQueue = []; st.flashV = 0.5;
  var oldField = st.field, oldStates = st.worldStates, T0 = st.T, uid = st.layerUid;
  var c2 = PD.compile('one-giant-leap', { themePatch: { world: { speed: 77, nebula: 'deep' } } });
  st.setDeck(c2);
  a.equal(st.deck, c2); a.equal(st.theme, c2.theme); a.equal(st.env.theme, c2.theme); a.equal(st.f.theme, c2.theme);
  a.deepEqual([st.layerBySpec.size, st.shapeBySpec.size, st.layers.length], [0, 0, 0], 'maps and layers cleared');
  a.ok(st.field !== oldField && st.field.list.length === 0, 'a fresh field');
  a.ok(st.worldStates !== oldStates && st.worldStates.cosmos !== oldStates.cosmos, 'fresh world states');
  a.equal(st.W.speed, 77, 'W back to the (new) defaults'); a.equal(st.W.nebula, 'deep');
  a.deepEqual(st.xf.nebula, [{ value: 'deep', amount: 1, from: 1, to: 1, t0: 0, dur: 1 }]);
  a.deepEqual(st.cur, { slide: 0, step: 0 });
  a.deepEqual([st.warmDone, st.warmQueue, st.flashV], [false, null, 0]);
  a.equal(st.T, T0, 'the clock keeps running'); a.equal(st.layerUid, uid, 'uids stay unique');
  a.equal(st.f.xf, st.xf, 'the passes see the new crossfade stacks');
  st.enter(4, 0, 'instant');
  var fewer = {}; for (var k in c) fewer[k] = c[k];
  fewer.worlds = ['core', 'cosmos', 'spark'];
  st.setDeck(fewer);
  a.deepEqual(st.worlds, ['core', 'cosmos', 'spark'], 'another world list: a full reset with those worlds');
  a.ok(!('planet' in st.worldStates) && st.passes.every(function (q) { return q.world !== 'planet'; }), 'no planet state or passes');
  a.deepEqual([st.layerBySpec.size, st.layers.length, st.cur.slide], [0, 0, 0]);
  a.throws(function () { st.setDeck({ scenes: [] }); }, /stage\.setDeck\(compiled\) needs a compiled deck/);
});

T.test('setDeck (§4.9): the same theme — entries the new deck cannot reach are evicted, their layers exit, cur is clamped', function (a) {
  var c = PD.compile('one-giant-leap'), st = new PD.Stage(m5Canvas(), { deck: c, thumb: true });
  st.enter(7, 1, 'instant');
  var box = c.scenes[7], keepField = st.field, keepStates = st.worldStates;
  var visible = st.layers.slice();
  a.ok(visible.length >= 2 && visible.every(function (L) { return m5Live([box]).texts.has(L.spec); }), 'the box\'s layers are on screen');
  st.enter(3, 1, 'instant'); st.enter(7, 1, 'instant');
  a.ok(st.layerBySpec.size > visible.length, 'other scenes\' layers are cached too');
  var other = []; st.layerBySpec.forEach(function (L, spec) { if (!m5Live([box]).texts.has(spec)) other.push(spec); });
  var d = PD.compileScene(c, 7, m5Clone(box)), T = st.T;
  st.setDeck(d);
  var live = m5Live(d.scenes);
  st.layerBySpec.forEach(function (L, spec) { a.ok(live.texts.has(spec), 'layerBySpec key is live: ' + (spec.str || spec.kind)); });
  st.shapeBySpec.forEach(function (sh, spec) { a.ok(live.shapes.has(spec), 'shapeBySpec key is live: ' + spec.shape); });
  other.forEach(function (spec) { a.ok(st.layerBySpec.has(spec), 'a still-live entry is kept'); });
  m5Live([box]).texts.forEach(function (spec) { a.ok(!st.layerBySpec.has(spec), 'the old box text is evicted'); });
  m5Live([box]).shapes.forEach(function (spec) { a.ok(!st.shapeBySpec.has(spec), 'the old box shape is evicted'); });
  visible.forEach(function (L) { a.equal(L.outStart, T, 'a visible layer of an evicted spec starts its exit'); });
  a.deepEqual(st.cur, { slide: 7, step: 1 }, 'still in range');
  a.equal(st.field, keepField); a.equal(st.worldStates, keepStates, 'no full reset');
  st.enter(7, 1, 'settled');
  a.ok(st.layers.some(function (L) { return L.spec === d.scenes[7].steps[0].text[0]; }), 're-entering shows the new specs');
  // clamping
  st.enter(6, 5, 'instant');
  st.setDeck(PD.compileScene(d, 6, { id: 'leaps', steps: [{}, {}] }));
  a.deepEqual(st.cur, { slide: 6, step: 2 }, 'step clamped to the scene\'s steps');
  st.enter(9, 0, 'instant');
  st.setDeck(PD.compile({ id: 'wp1-short', meta: { theme: 'one-giant-leap' }, scenes: d.scenes.slice(0, 3) }));
  a.deepEqual(st.cur, { slide: 2, step: 0 }, 'slide clamped to the deck');
  st.cur = { slide: -1, step: 0 };
  st.setDeck(PD.compile({ id: 'wp1-empty', meta: { theme: 'one-giant-leap' }, scenes: [] }));
  a.deepEqual(st.cur, { slide: -1, step: 0 }, '-1 (nothing entered) stays');
  a.deepEqual([st.layerBySpec.size, st.shapeBySpec.size], [0, 0], 'an empty deck: empty maps');
  // re-warm: the changed scenes when the stage was already warm, else the whole deck
  st.setDeck(c); st.warmDone = true; st.warmQueue = [];
  st.setDeck(d, { changed: ['box'] });
  a.deepEqual(st.warmQueue.map(function (q) { return q.spec; }), [d.scenes[7].text[0], d.scenes[7].steps[0].text[0], d.scenes[7].steps[0].text[1]]);
  a.equal(st.warmDone, false);
  st.warmDone = true; st.setDeck(c, { changed: ['no-such-scene'] });
  a.deepEqual([st.warmDone, st.warmQueue], [true, []], 'nothing new to warm');
  st.setDeck(d);
  a.deepEqual([st.warmDone, st.warmQueue], [false, null], 'no changed list: warm the whole deck again');
});

T.test('setDeck eviction leaves the maps sized to the current deck after 200 random edits (WP1 acceptance)', function (a) {
  var U = PD.get('core/util').U, rnd = U.rng(20261014), pick = function (n) { return Math.floor(rnd() * n); };
  var base = PD.compile('one-giant-leap'), cur = base;
  var st = new PD.Stage(m5Canvas(160, 90), { deck: base, thumb: true });
  st.resize(160, 90, 1);
  var kinds = [0, 0, 0, 0, 0], maxLayers = 0, maxShapes = 0, bad = 0;
  var check = function (when) {
    var live = m5Live(cur.scenes);
    st.layerBySpec.forEach(function (L, spec) { if (!live.texts.has(spec)) { bad++; a.fail(when + ': layerBySpec holds a spec the deck cannot reach'); } });
    st.shapeBySpec.forEach(function (sh, spec) { if (!live.shapes.has(spec)) { bad++; a.fail(when + ': shapeBySpec holds a spec the deck cannot reach'); } });
    if (st.layerBySpec.size > live.texts.size || st.shapeBySpec.size > live.shapes.size) { bad++; a.fail(when + ': a map is larger than the deck'); }
    maxLayers = Math.max(maxLayers, st.layerBySpec.size); maxShapes = Math.max(maxShapes, st.shapeBySpec.size);
  };
  for (var e = 0; e < 200; e++) {
    var scenes = cur.source.scenes.slice(), n = scenes.length, i = pick(n), kind = pick(5), next;
    if (n <= 3 && kind === 2) kind = 3;
    if (n >= 14 && kind === 3) kind = 2;
    kinds[kind]++;
    if (kind === 0) next = PD.compileScene(cur, i, m5Clone(scenes[i]));                          // replace with new spec objects
    else if (kind === 1) {                                                                       // edit a text, drop a step
      var s = m5Clone(scenes[i]);
      if (s.text && s.text.length) s.text[pick(s.text.length)].str = 'edit ' + e;
      if (s.steps && s.steps.length) s.steps.splice(pick(s.steps.length), 1);
      next = PD.compileScene(cur, i, s);
    } else {
      if (kind === 2) scenes.splice(i, 1);                                                       // delete
      else if (kind === 3) scenes.splice(i, 0, m5Clone(base.source.scenes[pick(10)]));           // insert a copy
      else { var j = pick(n), t = scenes[i]; scenes[i] = scenes[j]; scenes[j] = t; }             // swap
      next = PD.compile({ id: 'wp1-edits', meta: { theme: 'one-giant-leap' }, scenes: scenes });
    }
    cur = next;
    st.setDeck(cur, { changed: [] });
    check('edit ' + e + ' after setDeck');
    var si = pick(cur.scenes.length);
    st.enter(si, pick(st.stepsOf(si) + 1), pick(2) ? 'instant' : 'settled');
    st.tick(0.05);
    if (e % 20 === 19) { st.warmQueue = null; st.warmDone = false; st.prewarm(Infinity); }
    check('edit ' + e + ' after enter');
  }
  a.equal(bad, 0, 'no edit left a stale or oversized map');
  a.ok(kinds.every(function (k) { return k > 10; }), 'every kind of edit ran: ' + kinds.join(' '));
  a.ok(maxLayers > 20 && maxShapes >= 3, 'the maps really were filled (max ' + maxLayers + ' layers, ' + maxShapes + ' shapes)');
}, { timeout: 120000 });

T.test('assets (§4.8): ready() decodes data: images, never loads other sources, never rejects; PD.asset gives the runtime asset', function (a) {
  var D = 'wp1-test-assets', cv = document.createElement('canvas');
  cv.width = 3; cv.height = 2;
  var png = cv.toDataURL('image/png');
  PD.assets(D, {
    good: { type: 'image', src: png, w: 30, h: 20, name: 'good.png', bytes: png.length },
    sized: { type: 'image', src: png, name: 'sized.png', bytes: png.length },
    file: { type: 'image', src: 'file:///tmp/logo.png', w: 1, h: 1, name: 'logo.png', bytes: 1 },
    broken: { type: 'image', src: 'data:image/png;base64,AAAA', w: 1, h: 1, name: 'broken.png', bytes: 3 },
    font: { type: 'font', src: 'data:font/woff2;base64,AAAA', family: 'Nope', name: 'nope.woff2', bytes: 3 },
    odd: { type: 'video', src: 'data:video/mp4;base64,AAAA', name: 'x.mp4', bytes: 3 }
  });
  a.equal(PD.asset(D, 'good'), null, 'nothing before ready()');
  return PD.assets.ready(D).then(function (r) {
    a.deepEqual(r.loaded.sort(), ['good', 'sized']);
    a.deepEqual(r.failed.sort(function (x, y) { return x.id < y.id ? -1 : 1; }),
      [{ id: 'broken', reason: 'decode' }, { id: 'file', reason: 'not-embedded' }, { id: 'font', reason: 'decode' }, { id: 'odd', reason: 'decode' }]);
    var g = PD.asset(D, 'good');
    a.deepEqual([g.id, g.type, g.src, g.w, g.h, g.ok, g.error], ['good', 'image', png, 30, 20, true, undefined]);
    a.ok(g.img instanceof HTMLImageElement && g.img.complete && g.img.naturalWidth === 3);
    var s = PD.asset(D, 'sized');
    a.deepEqual([s.w, s.h], [3, 2], 'no w/h in the source: the decoded size');
    var f = PD.asset(D, 'file');
    a.deepEqual([f.ok, f.error, f.img], [false, 'not-embedded', undefined], 'a file: source is never loaded');
    a.equal(PD.asset(D, 'nope'), null);
    return PD.assets.ready(D).then(function () {
      a.equal(PD.asset(D, 'good'), g, 'a second ready() reuses finished entries');
      PD.assets.put(D, 'good', { type: 'image', src: png + '', w: 31, h: 20, name: 'good.png', bytes: png.length });
      a.equal(PD.asset(D, 'good'), null, 'a changed source is stale until ready() runs again');
      return PD.assets.ready(D);
    }).then(function () {
      var g2 = PD.asset(D, 'good');
      a.ok(g2 && g2 !== g && g2.ok && g2.w === 31);
      PD.assets.remove(D, 'good');
      a.equal(PD.asset(D, 'good'), null, 'a removed asset is gone');
      return PD.assets.ready('wp1-test-nothing');
    }).then(function (r2) {
      a.deepEqual(r2, { loaded: [], failed: [] }, 'a deck without assets resolves at once');
    });
  }).then(function () {
    ['good', 'sized', 'file', 'broken', 'font', 'odd'].forEach(function (id) { PD.assets.remove(D, id); });
  });
});

T.test('assets.ready resolves within 3.2 s when a font never loads (a never-settling FontFace.load injected); fontFaces; late success', function (a) {
  var D = 'wp1-test-fonts', orig = window.FontFace, made = [], settle = [];
  window.FontFace = function (family, buf, desc) {
    made.push([family, buf instanceof ArrayBuffer ? buf.byteLength : -1, JSON.stringify(desc)]);
    this.family = family;
    var self = this;
    this.load = function () { return new Promise(function (res) { settle.push(function () { res(self); }); }); };   // never settles on its own
  };
  PD.assets(D, { brand: { type: 'font', src: 'data:font/woff2;base64,AAECAw==', family: 'Brand', weight: '700', name: 'b.woff2', bytes: 4 } });
  var t0 = performance.now();
  return PD.assets.ready(D, { fontFaces: [{ family: 'Theme Brand', asset: 'brand', weight: '400' }] }).then(function (r) {
    var ms = performance.now() - t0;
    a.ok(ms >= 2900 && ms <= 3200, 'resolved after ' + Math.round(ms) + ' ms (timeout 3000)');
    a.deepEqual(r, { loaded: [], failed: [{ id: 'brand', reason: 'timeout' }] });
    a.deepEqual(made, [['Brand', 4, '{"weight":"700"}'], ['Theme Brand', 4, '{"weight":"400"}']], 'the asset\'s family, and the theme fontFace family');
    var rt = PD.asset(D, 'brand');
    a.deepEqual([rt.ok, rt.error], [false, 'timeout']);
    settle.forEach(function (f) { f(); });                      // the font arrives late
    return new Promise(function (res) { setTimeout(res, 50); }).then(function () {
      a.deepEqual([rt.ok, rt.error, rt.face && rt.face.family], [true, undefined, 'Brand'], 'a late load still makes the asset usable');
      var t1 = performance.now();
      return PD.assets.ready(D, { timeoutMs: 100 }).then(function (r2) {
        a.ok(performance.now() - t1 < 100, 'a finished entry needs no wait');
        a.deepEqual(r2, { loaded: ['brand'], failed: [] });
      });
    });
  }).then(function () { window.FontFace = orig; PD.assets.remove(D, 'brand'); },
          function (e) { window.FontFace = orig; PD.assets.remove(D, 'brand'); throw e; });
}, { timeout: 8000 });
