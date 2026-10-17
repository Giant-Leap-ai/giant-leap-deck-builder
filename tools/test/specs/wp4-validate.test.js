/* tools/test/specs/wp4-validate.test.js — WP4: PD.validate (spec §4.3 "Validate codes"; engine/core/validate.js).
 * One positive and one negative case per code. Tests that register a reveal, exit, template or element run on a FRESH
 * engine (the harness factories replayed on PD.kernel(fakeGlobal)) so the harness registries are never changed. */
(function () {
  var seq = 0;
  function D(scenes, theme, meta, id) {
    var m = { title: 'wp4v', theme: theme || 'cosmos' };
    for (var k in meta || {}) m[k] = meta[k];
    return { id: id || 'wp4v-' + (++seq), meta: m, scenes: scenes };
  }
  function V(scenes, theme, meta, id) { return PD.validate(PD.compile(D(scenes, theme, meta, id))); }
  function codes(is) { return is.map(function (i) { return i.code; }); }
  function pick(is, code) { return is.filter(function (i) { return i.code === code; }); }
  function brief(is) { return is.map(function (i) { return i.level + ' ' + i.code + (i.path ? ' @' + i.path : '') + ': ' + i.msg; }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  function withAssets(map, fn) {
    var id = 'wp4v-assets-' + (++seq);
    PD.assets(id, map);
    try { return fn(id); } finally { Object.keys(map).forEach(function (k) { PD.assets.remove(id, k); }); }
  }
  function fresh() {                       // a fresh engine with the harness's modules and themes
    var g = {}; PD.kernel(g);
    var K = g.PD;
    PD.modules().forEach(function (m) {
      if (/^(core\/(hud|player|notes|sync|thumbs|export)|story\/|studio\/)/.test(m.name)) return;
      K.module(m.name, m.deps, m.factory, m.opts);
    });
    PD.theme.list().forEach(function (id) { K.theme(id, PD.theme.get(id)); });
    return K;
  }
  var HAS_IMAGE = function () { return PD.element.has('image'); };

  T.test('validate: One Giant Leap and the parity deck have no issues at all', function (a) {
    a.deepEqual(brief(PD.validate(PD.compile('one-giant-leap'))), []);
    a.deepEqual(brief(PD.validate(PD.compile('parity'))), []);
  });

  T.test('validate returns Issue[] with the §4.3 shape, in scene order, and never touches its input or the random source', function (a) {
    var deck = D([{ id: 'a', world: { nope: 1 }, text: [{ str: 'x', style: 'bogus' }] }, { id: 'a' }, { id: 'c', template: 'nope', props: {} }, 5]);
    var c = PD.compile(deck), before = JSON.stringify(c.scenes) + JSON.stringify(c.errors);
    var real = Math.random, calls = 0;
    Math.random = function () { calls++; return 0.5; };
    var one, two;
    try { one = PD.validate(c); two = PD.validate(c); } finally { Math.random = real; }
    a.equal(calls, 0, 'no random numbers'); a.deepEqual(one, two, 'deterministic'); a.equal(JSON.stringify(c.scenes) + JSON.stringify(c.errors), before, 'the compiled deck is unchanged');
    a.ok(one.length >= 5);
    var KNOWN = PD.get('core/validate').CODES;
    one.forEach(function (i) {
      a.ok(i.level === 'error' || i.level === 'warn', 'level ' + i.level);
      a.ok(KNOWN.indexOf(i.code) >= 0 || i.code === 'scene.invalid' || i.code === 'validate.failed', 'code ' + i.code);
      a.ok(i.scene === (i.scene | 0) && i.scene >= 0 && i.scene < c.scenes.length, 'scene index'); a.equal(typeof i.sceneId, 'string'); a.equal(typeof i.msg, 'string'); a.ok(i.msg.length > 0);
      a.ok(!('step' in i) || (i.step === (i.step | 0) && i.step > 0), 'step is a positive state index when present'); a.ok(!('path' in i) || typeof i.path === 'string');
    });
    a.deepEqual(one.map(function (i) { return i.scene; }), one.map(function (i) { return i.scene; }).slice().sort(function (x, y) { return x - y; }), 'in scene order');
    a.throws(function () { PD.validate(); }, /needs a CompiledDeck/); a.throws(function () { PD.validate({ scenes: [] }); }, /CompiledDeck/);
  });

  T.test('scene.duplicate-id (error): the second scene with an id', function (a) {
    var is = V([{ id: 'a', world: {} }, { id: 'b', world: {} }, { id: 'a', world: {} }, { id: 'a', world: {} }]);
    var d = pick(is, 'scene.duplicate-id');
    a.deepEqual(d.map(function (i) { return [i.level, i.scene, i.sceneId]; }), [['error', 2, 'a'], ['error', 3, 'a']]);
    a.ok(/scene 1/.test(d[0].msg), 'names the first scene'); a.equal(d[0].path, 'id');
    a.deepEqual(codes(V([{ id: 'a' }, { id: 'b' }])), [], 'distinct ids are fine');
  });

  T.test('world.unknown-param (warn) and world.needs-plugin (error), for world and timing keys, in the scene and in its steps', function (a) {
    var u = V([{ id: 'a', world: { bogus: 1 }, timing: { alsoBogus: [1] }, steps: [{ world: { stepBogus: 2 }, timing: { stepTiming: [1] } }] }]);
    var w = pick(u, 'world.unknown-param');
    a.deepEqual(w.map(function (i) { return [i.level, i.step || 0, i.path]; }).sort(), [['warn', 0, 'timing.alsoBogus'], ['warn', 0, 'world.bogus'], ['warn', 1, 'steps[0].timing.stepTiming'], ['warn', 1, 'steps[0].world.stepBogus']].sort());
    a.deepEqual(codes(V([{ id: 'a', world: { earth: 1, stars: 0.5, nebula: 'dawn', letterbox: 1 }, timing: { earthR: [3], nebula: [2] } }])), [], 'real params of enabled worlds are fine (nebula is a crossfade param)');
    if (PD.theme.has('slate')) {
      var s = V([{ id: 'a', world: { earth: 1, speed: 3 }, timing: { sun: [1] }, steps: [{ world: { galaxy: 1 } }] }], 'slate');
      var n = pick(s, 'world.needs-plugin');
      a.deepEqual(n.map(function (i) { return [i.level, i.path]; }).sort(), [['error', 'steps[0].world.galaxy'], ['error', 'timing.sun'], ['error', 'world.earth'], ['error', 'world.speed']].sort(), 'planet and cosmos params under slate');
      a.ok(/planet/.test(n.filter(function (i) { return i.path === 'world.earth'; })[0].msg), 'the message names the world that owns it');
      a.deepEqual(codes(V([{ id: 'a', world: { ambient: 1, bokeh: 0.4, spark: 1, photo: 0 } }], 'slate')), [], 'slate\'s own params are fine');
    }
    var flat = V([{ id: 'a', world: { earth: 1 } }], 'cosmos', { themePatch: { worlds: ['spark'] } });
    a.deepEqual(codes(flat), ['world.needs-plugin'], 'the same holds for any look whose worlds lack the owner');
    var extra = V([{ id: 'a', world: { earth: 1 } }], 'cosmos', { themePatch: { worlds: ['spark'] }, worlds: ['planet'] });
    a.deepEqual(codes(extra), [], 'meta.worlds can add a world');
  });

  T.test('style.unknown (error): a text style that the theme lacks; no style means the default and is fine', function (a) {
    var is = V([{ id: 'a', text: [{ str: 'x', style: 'bogus' }, { str: 'y', style: 'hero' }, { str: 'z' }], steps: [{ text: [{ str: 'w', style: 'nope' }] }] }]);
    var s = pick(is, 'style.unknown');
    a.deepEqual(s.map(function (i) { return [i.level, i.step || 0, i.path]; }), [['error', 0, 'text[0].style'], ['error', 1, 'steps[0].text[0].style']]);
    a.ok(/bogus/.test(s[0].msg) && /hero/.test(s[0].msg), 'names the style and lists the known ones');
    if (PD.theme.has('slate')) a.deepEqual(codes(V([{ id: 'a', text: [{ str: 'x', style: 'year' }] }], 'slate')), [], 'a style slate has');
    var noYear = V([{ id: 'a', text: [{ str: 'x', style: 'year' }] }], 'cosmos', { themePatch: { styles: { year: null }, } });
    a.deepEqual(codes(noYear), ['style.unknown'], 'a patched-away style');
  });

  T.test('reveal.unknown and exit.unknown (error): neither built in nor registered; registry names are accepted', function (a) {
    var built = ['letters', 'focus', 'rise', 'fade', 'wipe', 'particles'], exits = ['fade', 'rise', 'sink', 'blur', 'particles'];
    a.deepEqual(codes(V([{ id: 'a', text: built.map(function (r) { return { str: 'x', reveal: r }; }).concat(exits.map(function (e) { return { str: 'y', exit: e }; })) }])), [], 'every built-in name');
    var is = V([{ id: 'a', text: [{ str: 'x', reveal: 'sparkle', exit: 'vanish' }, { str: 'y', reveal: 'fade', exit: 'fade' }] }]);
    a.deepEqual(is.map(function (i) { return [i.level, i.code, i.path]; }), [['error', 'reveal.unknown', 'text[0].reveal'], ['error', 'exit.unknown', 'text[0].exit']]);
    var K = fresh();
    K.reveal('wp4-pop', { inDur: 1, pose: function () { return { alpha: 1, dy: 0, scale: 1 }; } });
    K.exitFx('wp4-poof', { apply: function () { } });
    var c = K.compile(D([{ id: 'a', text: [{ str: 'x', reveal: 'wp4-pop', exit: 'wp4-poof' }] }]));
    a.deepEqual(K.validate(c), [], 'registered names are accepted');
    a.deepEqual(codes(PD.validate(PD.compile(D([{ id: 'a', text: [{ str: 'x', reveal: 'wp4-pop' }] }])))), ['reveal.unknown'], 'but not on an engine that lacks them');
  });

  T.test('motion.unknown (warn): bad stagger, entry, exit or match, in the scene and in steps', function (a) {
    var is = V([{ id: 'a', motion: { stagger: 'zigzag', entry: 'void', exit: 'poof' }, steps: [{ motion: { entry: 'sideways', match: 'angle' } }] }]);
    a.deepEqual(is.map(function (i) { return [i.level, i.code, i.step || 0, i.path]; }), [['warn', 'motion.unknown', 0, 'motion.stagger'], ['warn', 'motion.unknown', 0, 'motion.exit'], ['warn', 'motion.unknown', 1, 'steps[0].motion.entry']]);
    var all = { stagger: ['random', 'radial', 'leftToRight', 'rightToLeft', 'topDown', 'bottomUp', 'none'], entry: ['void', 'spark', 'edges', 'stars', 'center', 'below'], exit: ['drift', 'warp', 'scatter', 'fade', 'rise', 'implode'] };
    Object.keys(all).forEach(function (k) { all[k].forEach(function (v) { var m = {}; m[k] = v; a.deepEqual(codes(V([{ id: 'a', motion: m }])), [], k + ' ' + v); }); });
  });

  T.test('shape.unknown and element.unknown-kind (error)', function (a) {
    var is = V([{ id: 'a', particles: [{ shape: 'ring' }, { shape: 'spark' }], elements: [{ kind: 'video' }, { kind: 'text', str: 'hi' }, {}], steps: [{ particles: [{ shape: 'sphere' }] }] }]);
    a.deepEqual(is.filter(function (i) { return i.code === 'shape.unknown'; }).map(function (i) { return [i.level, i.step || 0, i.path]; }), [['error', 0, 'particles[0].shape'], ['error', 1, 'steps[0].particles[0].shape']]);
    a.deepEqual(is.filter(function (i) { return i.code === 'element.unknown-kind'; }).map(function (i) { return [i.level, i.path]; }), [['error', 'elements[0].kind'], ['error', 'elements[2].kind']]);
    a.deepEqual(codes(V([{ id: 'a', particles: [{ shape: 'spark' }, { shape: 'cube', id: 'c' }, { shape: 'swarm', inside: 'c' }, { shape: 'points', points: [] }] }])), [], 'the built-in shapes');
    var K = fresh();
    K.shape('wp4-ring', { create: function () { return { id: 'r', n: 0, static: [] }; } });
    a.deepEqual(K.validate(K.compile(D([{ id: 'a', particles: [{ shape: 'wp4-ring' }] }]))), [], 'registered shapes are accepted');
  });

  T.test('asset.missing, asset.not-embedded, asset.wrong-type (error): image elements, world.photoAsset and the theme\'s font faces', function (a) {
    if (!HAS_IMAGE()) { a.ok(true, 'elements/image (WP3) is not registered yet: skipped'); return; }
    withAssets({
      ok: { type: 'image', src: PNG, w: 10, h: 10, name: 'ok.png', bytes: 70 },
      link: { type: 'image', src: 'file:///tmp/x.png', w: 10, h: 10, name: 'x.png', bytes: 1 },
      face: { type: 'font', src: 'data:font/woff2;base64,AAAA', family: 'F', name: 'f.woff2', bytes: 3 }
    }, function (aid) {
      var is = V([{ id: 'a', elements: [{ kind: 'image', asset: 'ok' }, { kind: 'image', asset: 'ghost' }, { kind: 'image', asset: 'link' }, { kind: 'image', asset: 'face' }, { kind: 'image' }] }], 'cosmos', null, aid);
      a.deepEqual(is.map(function (i) { return [i.level, i.code, i.path]; }), [
        ['error', 'asset.missing', 'elements[1].asset'], ['error', 'asset.not-embedded', 'elements[2].asset'], ['error', 'asset.wrong-type', 'elements[3].asset'], ['error', 'asset.missing', 'elements[4].asset']]);
      a.ok(/ghost/.test(is[0].msg));
      var w = V([{ id: 'a', world: { photo: 1, photoAsset: 'ok' }, steps: [{ world: { photoAsset: 'ghost' } }, { world: { photoAsset: 'face' } }] }], 'cosmos', null, aid);
      a.deepEqual(w.map(function (i) { return [i.code, i.step || 0, i.path]; }), [['asset.missing', 1, 'steps[0].world.photoAsset'], ['asset.wrong-type', 2, 'steps[1].world.photoAsset']]);
      a.deepEqual(codes(V([{ id: 'a', world: { photoAsset: '' } }], 'cosmos', null, aid)), [], 'an empty photoAsset means none');
      var ff = V([{ id: 'a' }], 'cosmos', { themePatch: { fontFaces: [{ family: 'F', asset: 'face' }, { family: 'G', asset: 'ok' }, { family: 'H', asset: 'ghost' }] } }, aid);
      a.deepEqual(ff.map(function (i) { return [i.code, i.scene, i.path]; }), [['asset.wrong-type', 0, 'theme.fontFaces[1].asset'], ['asset.missing', 0, 'theme.fontFaces[2].asset']], 'font faces are checked and attached to scene 0');
    });
  });

  T.test('template.unknown and the other compile errors appear once in validate; template.expand-failed from a throwing template', function (a) {
    var is = V([{ id: 'u', template: 'no-such-template', props: {} }, 7]);
    a.deepEqual(is.map(function (i) { return [i.level, i.code, i.scene]; }), [['error', 'template.unknown', 0], ['error', 'scene.invalid', 1]]);
    var K = fresh();
    K.template('wp4-boom', { props: {}, example: {}, requires: { worlds: [] }, expand: function () { throw new Error('kaput'); } });
    var ks = K.validate(K.compile(D([{ id: 'b', template: 'wp4-boom', props: {} }])));
    a.deepEqual(ks.map(function (i) { return [i.level, i.code, i.scene, i.sceneId]; }), [['error', 'template.expand-failed', 0, 'b']]);
    a.ok(/kaput/.test(ks[0].msg));
  });

  T.test('template.requires-world (error): the template needs a world the theme does not enable', function (a) {
    var bad = V([{ id: 'h', template: 'hyperspace', props: { lines: ['x'] } }], 'cosmos', { themePatch: { worlds: ['spark'] } });
    var r = pick(bad, 'template.requires-world');
    a.equal(r.length, 1); a.equal(r[0].level, 'error'); a.equal(r[0].sceneId, 'h'); a.ok(/cosmos/.test(r[0].msg));
    a.deepEqual(pick(V([{ id: 'h', template: 'hyperspace', props: { lines: ['x'] } }]), 'template.requires-world'), []);
    var K = fresh();
    K.template('wp4-needs', { props: {}, example: {}, requires: { worlds: ['wp4-ghost-world'] }, expand: function () { return { id: 'x', world: {} }; } });
    a.equal(pick(K.validate(K.compile(D([{ id: 'n', template: 'wp4-needs', props: {} }]))), 'template.requires-world').length, 1, 'a world that is not registered at all');
  });

  T.test('template.prop-required (error): a required prop that is missing, empty or an empty list', function (a) {
    var is = pick(V([{ id: 'a', template: 'cold-open', props: {} }]), 'template.prop-required');
    a.deepEqual(is.map(function (i) { return [i.level, i.path, i.scene, i.sceneId]; }), [['error', 'props.line', 0, 'a']], 'compile does not fill required props from the example');
    a.ok(/Opening line/.test(is[0].msg));
    a.deepEqual(pick(V([{ id: 'a', template: 'cold-open', props: { line: '' } }]), 'template.prop-required').length, 1, 'an empty string is missing');
    a.deepEqual(pick(V([{ id: 'a', template: 'cold-open', props: { line: 'ok' } }]), 'template.prop-required'), []);
    var lists = V([{ id: 'a', template: 'hyperspace', props: { lines: [] } }, { id: 'b', template: 'timeline', props: { title: 'T' } }]);
    a.deepEqual(pick(lists, 'template.prop-required').map(function (i) { return [i.sceneId, i.path]; }), [['a', 'props.lines'], ['b', 'props.milestones']]);
    var item = V([{ id: 'a', template: 'timeline', props: { title: 'T', milestones: [{ when: 'x', label: 'y' }, { label: 'no year' }, { when: 'z' }] } }]);
    a.deepEqual(pick(item, 'template.prop-required').map(function (i) { return i.path; }), ['props.milestones[1].when', 'props.milestones[2].label'], 'required sub-props of list items');
    a.deepEqual(pick(V([{ id: 'a', template: 'big-number', props: { label: 'L' } }]), 'template.prop-required').map(function (i) { return i.path; }), ['props.value'], 'a missing number');
    a.deepEqual(pick(V([{ id: 'a', template: 'big-number', props: { value: 0, label: 'L' } }]), 'template.prop-required'), [], 'zero is a value');
    a.deepEqual(pick(V([{ id: 'a', template: 'logo', props: { asset: '' } }]), 'template.prop-required').map(function (i) { return i.path; }), ['props.asset'], 'the seed\'s empty asset');
  });

  T.test('template.prop-type (error): wrong kind of value, bad enum, bad colour, unknown nebula, bad list', function (a) {
    var T1 = function (tpl, props) { return pick(V([{ id: 'a', template: tpl, props: props }]), 'template.prop-type'); };
    var p = function (is) { return is.map(function (i) { return i.path; }); };
    a.deepEqual(p(T1('cold-open', { line: 'x', lineAt: 'soon' })), ['props.lineAt'], 'text where a number goes (a numeric string is coerced by compile, "soon" is not)');
    a.deepEqual(T1('cold-open', { line: 'x', lineAt: '2.5' }), [], 'a numeric string is fine');
    a.deepEqual(p(T1('cold-open', { line: { oops: 1 } })), ['props.line'], 'an object where text goes');
    a.deepEqual(p(T1('brand-reveal', { title: 'x', entry: 'bogus' })), ['props.entry']); a.ok(/spark, void, edges, center/.test(T1('brand-reveal', { title: 'x', entry: 'bogus' })[0].msg));
    a.deepEqual(p(T1('cold-open', { line: 'x', sparkColor: 'notacolor' })), ['props.sparkColor']);
    a.deepEqual(T1('cold-open', { line: 'x', sparkColor: '#ff00aa' }), [], 'a #hex colour'); a.deepEqual(T1('cold-open', { line: 'x', sparkColor: '#fa0' }), [], 'a short #hex colour'); a.deepEqual(T1('cold-open', { line: 'x', sparkColor: 'rose' }), [], 'a theme colour');
    a.deepEqual(p(T1('sunrise', { line: 'x', nebula: 'nowhere' })), ['props.nebula']); a.deepEqual(T1('sunrise', { line: 'x', nebula: 'ember' }), []);
    a.deepEqual(p(T1('timeline', { title: 'T', milestones: [{ when: 'a', label: 'b' }, { when: 'c', label: 'd' }], curve: 5 })), ['props.curve'], 'a number where yes/no goes');
    a.deepEqual(T1('timeline', { title: 'T', milestones: [{ when: 'a', label: 'b' }, { when: 'c', label: 'd' }], curve: 'false' }), [], '"false" is coerced');
    a.deepEqual(p(T1('timeline', { title: 'T', milestones: [{ when: 'a', label: 'b' }, 'oops'] })), ['props.milestones[1]'], 'a list item that is not an object');
    a.deepEqual(p(T1('timeline', { title: 'T', milestones: [{ when: 'a', label: 'b', u: 'high' }, { when: 'c', label: 'd', pos: 'middle' }] })), ['props.milestones[0].u', 'props.milestones[1].pos']);
    a.deepEqual(p(T1('hyperspace', { lines: [{ x: 1 }] })), ['props.lines[0]']);
    a.deepEqual(p(T1('big-number', { value: 'many', label: 'L' })), ['props.value']);
  });

  T.test('template.prop-max (warn): text too long, number out of range, too many or too few list items, text that wraps too far', function (a) {
    var M = function (tpl, props) { return pick(V([{ id: 'a', template: tpl, props: props }]), 'template.prop-max'); };
    var p = function (is) { return is.map(function (i) { return i.level + ' ' + i.path; }); };
    var long = new Array(62).join('x');                                          // 61 characters
    a.deepEqual(p(M('cold-open', { line: long })), ['warn props.line']); a.ok(/61 characters/.test(M('cold-open', { line: long })[0].msg) && /60/.test(M('cold-open', { line: long })[0].msg));
    a.deepEqual(M('cold-open', { line: long.slice(0, 60) }), [], 'exactly at the limit is fine');
    a.deepEqual(p(M('cold-open', { line: 'x', lineAt: 7 })), ['warn props.lineAt']); a.deepEqual(p(M('cold-open', { line: 'x', lineAt: -1 })), ['warn props.lineAt']);
    a.deepEqual(M('cold-open', { line: 'x', lineAt: 6 }), []); a.deepEqual(M('cold-open', { line: 'x', lineAt: 0 }), []);
    a.deepEqual(p(M('cold-open', { line: 'x', sparkCount: 5000 })), ['warn props.sparkCount']); a.deepEqual(p(M('cold-open', { line: 'x', sparkCount: 100 })), ['warn props.sparkCount']);
    a.deepEqual(p(M('hyperspace', { lines: ['a', 'b', 'c', 'd'] })), ['warn props.lines'], 'four lines');
    a.deepEqual(p(M('hyperspace', { lines: [new Array(37).join('y')] })), ['warn props.lines[0]'], 'a 36-character line');
    a.deepEqual(p(M('timeline', { title: 'T', milestones: [{ when: 'a', label: 'b' }] })), ['warn props.milestones'], 'one milestone is below the minimum');
    a.deepEqual(p(M('timeline', { title: 'T', milestones: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return { when: 'w' + n, label: 'l' + n }; }) })), ['warn props.milestones'], 'nine milestones');
    a.deepEqual(p(M('timeline', { title: 'T', milestones: [{ when: 'a very long year', label: 'b' }, { when: 'c', label: 'd', u: 1.5 }] })), ['warn props.milestones[0].when', 'warn props.milestones[1].u']);
    a.deepEqual(p(M('image', { asset: 'a', zoom: 2 })), ['warn props.zoom']);
    a.deepEqual(p(M('big-number', { value: 1, label: 'L', decimals: 4 })), ['warn props.decimals']);
    // lines: measured wrapping against the style (a template on a fresh engine so its limit can be 1)
    var K = fresh();
    K.template('wp4-wrap', { props: { t: { type: 'text', label: 'Text', style: 'statement', lines: 1, default: '' } }, example: { t: '' }, requires: { worlds: [] }, expand: function () { return { id: 'x' }; } });
    var wrapped = K.validate(K.compile(D([{ id: 'w', template: 'wp4-wrap', props: { t: new Array(40).join('wide words ') } }, { id: 'n', template: 'wp4-wrap', props: { t: 'short' } }])));
    a.deepEqual(wrapped.map(function (i) { return [i.code, i.sceneId, i.path]; }), [['template.prop-max', 'w', 'props.t']]);
    a.ok(/lines/.test(wrapped[0].msg));
  });

  T.test('text.overflow (warn): wider than its limit, or the block leaves the 1920 × 1080 frame', function (a) {
    var wide = new Array(26).join('W');
    var is = V([{ id: 'a', text: [{ str: wide, style: 'hero' }, { str: 'fine', style: 'hero' }, { str: 'Left edge', style: 'statement', x: 20, align: 'right' }, { str: 'Bottom', style: 'statement', y: 1075 }, { str: 'Narrow limit', style: 'statement', maxWidth: 300 }], steps: [{ text: [{ str: wide, style: 'title' }] }] }]);
    var o = pick(is, 'text.overflow');
    a.deepEqual(o.map(function (i) { return [i.level, i.step || 0, i.path]; }), [['warn', 0, 'text[0]'], ['warn', 0, 'text[2]'], ['warn', 0, 'text[3]'], ['warn', 1, 'steps[0].text[0]']], 'wide word, off the left edge, off the bottom, and in a step');
    a.ok(/wide/.test(o[0].msg) && /frame/.test(o[1].msg), 'two kinds of message');
    a.deepEqual(codes(V([{ id: 'a', text: [{ str: 'Every giant leap begins with a single spark.', style: 'statement', y: 820 }, { str: 'One Giant Leap', style: 'hero', y: 470 }, { str: 'Home', style: 'statement', y: 975 }] }])), [], 'ordinary text is inside the frame');
    a.deepEqual(codes(V([{ id: 'a', text: [{ str: 'wraps nicely because there are many words in this sentence so it stays inside its limit', style: 'statement', maxWidth: 600 }] }])), [], 'wrapping within maxWidth is not overflow');
    var big = V([{ id: 'a', text: [{ str: 'x', style: 'statement' }] }], 'cosmos', null).length;
    a.equal(big, 0);
  });

  T.test('particles.budget: warn above 8000 and error above 9000 targets in any state (points, cube, spark, swarm, text, accumulating over steps)', function (a) {
    var pts = function (n) { var o = []; for (var i = 0; i < n; i++) o.push({ x: i % 1900, y: (i * 7) % 1070 }); return o; };
    var b = function (scenes) { return pick(V(scenes), 'particles.budget'); };
    var e = b([{ id: 'a', world: {}, particles: [{ shape: 'points', points: pts(9500) }] }]);
    a.deepEqual(e.map(function (i) { return [i.level, i.scene, i.step]; }), [['error', 0, undefined]]); a.ok(/9500/.test(e[0].msg) && /9000/.test(e[0].msg));
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: pts(9000) }] }]).map(function (i) { return i.level; }), ['warn'], '9000 is the limit itself: a warning');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: pts(9001) }] }]).map(function (i) { return i.level; }), ['error']);
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: pts(8500) }] }]).map(function (i) { return i.level; }), ['warn']);
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: pts(8000) }] }]), [], '8000 is fine');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: function () { return pts(9500); } }] }]).map(function (i) { return i.level; }), ['error'], 'a points function is called');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'cube', perEdge: 800 }] }]).map(function (i) { return i.level; }), ['error'], 'a cube has 12 × perEdge');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'cube', perEdge: 700 }] }]).map(function (i) { return i.level; }), ['warn'], '12 × 700 = 8400');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'cube', perEdge: 600 }] }]), [], '12 × 600 = 7200 is fine');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'spark', count: 5000 }, { shape: 'spark', count: 4500 }] }]).map(function (i) { return i.level; }), ['error'], 'two sparks add up');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'spark' }, { shape: 'cube', id: 'c' }, { shape: 'swarm', inside: 'c' }] }]), [], 'the defaults: 700 + 552 + 500');
    // accumulation over steps, and remove frees them
    var acc = b([{ id: 'a', particles: [{ shape: 'points', id: 'p1', points: pts(5000) }], steps: [{ particles: [{ shape: 'points', points: pts(5000) }] }] }]);
    a.deepEqual(acc.map(function (i) { return [i.level, i.step]; }), [['error', 1]], 'the second click pushes the state over the limit');
    a.ok(/after click 1/.test(acc[0].msg));
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', id: 'p1', points: pts(5000) }], steps: [{ remove: ['p1'], particles: [{ shape: 'points', points: pts(5000) }] }] }]), [], 'removing the first shape keeps the total at 5000');
    a.deepEqual(b([{ id: 'a', particles: [{ shape: 'points', points: pts(5000) }], steps: [{ clear: true, particles: [{ shape: 'points', points: pts(5000) }] }] }]), [], 'clear does too');
    // text with a particles reveal counts (a hero's glyph samples)
    var env = { theme: PD.compile(D([])).theme, col: function (c) { return PD.get('core/util').col(c); } };
    var spec = { str: 'HOLD', style: 'mega', reveal: 'particles' }, n = PD.element.get('text').particleCount(spec, env);
    a.ok(n > 200, 'a mega word makes particles (' + n + ')');
    var many = []; for (var i = 0; i < Math.ceil(9200 / n); i++) many.push({ str: 'HOLD', style: 'mega', reveal: 'particles', y: 100 + i });
    a.deepEqual(b([{ id: 'a', text: many }]).map(function (i) { return i.level; }), ['error'], 'texts with a particles reveal are counted (' + many.length + ' × ' + n + ')');
    a.deepEqual(b([{ id: 'a', text: many.map(function (m) { return { str: m.str, style: m.style, y: m.y }; }) }]), [], 'other reveals make no particles');
  });

  T.test('steps.remove-unknown (warn): a remove id that matches nothing visible', function (a) {
    var is = V([{
      id: 'a', text: [{ id: 't1', str: 'x' }], particles: [{ shape: 'spark', id: 's1' }],
      steps: [{ remove: ['t1', 'ghost'] }, { remove: ['t1'] }, { text: [{ id: 't2', str: 'y' }] }, { remove: ['t2', 's1'] }, { clear: true, remove: ['t2'] }]
    }]);
    var r = pick(is, 'steps.remove-unknown');
    a.deepEqual(r.map(function (i) { return [i.level, i.step, i.path]; }), [['warn', 1, 'steps[0].remove[1]'], ['warn', 2, 'steps[1].remove[0]'], ['warn', 5, 'steps[4].remove[0]']],
      'ghost; t1 again after it was removed; t2 after a clear');
    a.ok(/ghost/.test(r[0].msg));
    a.deepEqual(codes(V([{ id: 'a', text: [{ id: 'x', str: 'x' }], steps: [{ remove: ['x'] }, { remove: 'nothing-string-form' }] }])), ['steps.remove-unknown'], 'a bare string works like a list');
  });

  T.test('validate never throws on odd scenes: null specs, strings where lists go, a measuring failure', function (a) {
    var odd = [{ id: 'a', text: [null, 'x', 5], elements: [null], particles: [undefined], steps: [null, 'x', { text: 'x' }], world: 5, timing: 'x', motion: [] },
      { id: 'b', text: { str: 'single object', style: 'title' } }, { id: 'c', text: [{ str: null }, { str: undefined }, { }] }];
    var is;
    a.ok((function () { try { is = V(odd); return true; } catch (e) { a.fail('threw: ' + e.message); } })());
    a.ok(Array.isArray(is));
    var c = PD.compile(D([{ id: 'ok', text: [{ str: 'fine', style: 'title' }] }]));
    var hand = { id: c.id, meta: c.meta, source: c.source, theme: c.theme, themeKey: c.themeKey, worlds: c.worlds, scenes: [c.scenes[0], null, undefined, 'x'], sceneKeys: [], errors: [], assetsDeckId: c.assetsDeckId };
    a.deepEqual(PD.validate(hand), [], 'scenes that are not objects are skipped (compile reports them)');
  });

  T.test('compileScene results validate like any compiled deck, and a fixed scene clears its issues', function (a) {
    var c = PD.compile(D([{ id: 'a', template: 'cold-open', props: { line: 'ok' } }, { id: 'b', template: 'cold-open', props: {} }]));
    a.deepEqual(pick(PD.validate(c), 'template.prop-required').map(function (i) { return i.sceneId; }), ['b']);
    var fixed = PD.compileScene(c, 1, { id: 'b', template: 'cold-open', props: { line: 'now fine' } });
    a.deepEqual(brief(PD.validate(fixed)), []);
  });

  var haveFrameworks = PD.framework.list().length > 0;
  (haveFrameworks ? T.test : T.skip)('every template id named by a framework beat (spec §6.2) exists in the catalog, and each beat has an adaptive fallback', function (a) {
    PD.framework.list().forEach(function (fid) {
      var fw = PD.framework.get(fid);
      (fw.beats || []).forEach(function (b) {
        a.ok(b.templates && b.templates.length >= 1, fid + '.' + b.id + ' lists templates');
        b.templates.forEach(function (t) { a.ok(PD.template.has(t), fid + '.' + b.id + ' names the template "' + t + '"'); });
        a.ok(b.templates.some(function (t) { var tt = PD.template.get(t); return tt && tt.requires.worlds.length === 0; }), fid + '.' + b.id + ' has an adaptive template');
      });
    });
  });
})();
