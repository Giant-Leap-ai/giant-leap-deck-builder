/* tools/test/specs/wp3-engine.test.js — WP3: the ambient and photo worlds, the image and counter elements, the Slate
 * theme and the gallery deck (spec §4.4 slate, §4.5 ambient and photo, §4.6 image and counter, §9 WP3 acceptance).
 * Pixel checks run on small canvases (480 x 270, scale 0.25) with the backdrop, vignette and grain switched off where
 * an exact colour matters. Every helper is prefixed w3 (the specs share one global scope). The per-frame cost budgets
 * are in wp3-perf.test.js. */

var w3N = 0;
function w3Canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function w3Img(w, h, draw, type) {          // an embedded image asset (a data: URL), drawn by draw(ctx, w, h)
  var c = w3Canvas(w, h), x = c.getContext('2d');
  draw(x, w, h);
  var src = c.toDataURL(type || 'image/png');
  return { type: 'image', src: src, w: w, h: h, name: 'w3', bytes: src.length };
}
function w3Solid(color, w, h) { return w3Img(w || 1920, h || 1080, function (x, W, H) { x.fillStyle = color; x.fillRect(0, 0, W, H); }); }
function w3Assets(map) {                    // registers an assets map under a fresh deck id and decodes it
  var id = 'wp3-t' + (w3N++);
  PD.assets(id, map || {});
  return PD.assets.ready(id).then(function (rep) { return { id: id, rep: rep }; });
}
var W3_QUIET = { vignette: 0, grain: 0, letterbox: 0 };
function w3World(o) { var w = {}, k; for (k in W3_QUIET) w[k] = W3_QUIET[k]; for (k in o || {}) w[k] = o[k]; return w; }
function w3Stage(assetsId, scenes, opts) {  // a warmed slate stage over a one-off deck, 480 x 270
  opts = opts || {};
  var deck = { format: 2, id: 'w3d' + (w3N++), meta: { title: 'w3', theme: opts.theme || 'slate', story: {} }, scenes: scenes };
  var compiled = PD.compile(deck, { assetsDeckId: assetsId });
  var cv = w3Canvas(opts.w || 480, opts.h || 270), stage = new PD.Stage(cv, { deck: compiled, thumb: !!opts.thumb });
  stage.resize(cv.width, cv.height, 1);
  stage.preload(compiled); stage.prepare(compiled.scenes[0]);
  if (!opts.cold) stage.warmAll();
  return stage;
}
function w3Px(stage, x, y) { var d = stage.ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }
function w3Mean(stage) {                    // the mean of every channel over the frame
  var d = stage.ctx.getImageData(0, 0, stage.canvas.width, stage.canvas.height).data, s = 0, n = 0;
  for (var i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] + d[i + 2]; n += 3; }
  return s / n;
}
function w3Settle(stage, si, step) { stage.enter(si, step || 0, 'instant'); stage.tick(0.05); stage.draw(); }
function w3Boot(stage) { stage.setWorld(stage.resolve(0, 0).world, null, 0, null, true); }      // the Player's boot step 11
function w3Run(stage, seconds, dt) { for (var t = 0; t < seconds - 1e-9; t += dt || 1 / 30) stage.tick(dt || 1 / 30); stage.draw(); }
function w3Near(a, p, q, eps, msg) { for (var i = 0; i < 3; i++) a.near(p[i], q[i], eps, (msg || 'pixel') + ' channel ' + i + ' ' + JSON.stringify(p) + ' vs ' + JSON.stringify(q)); }
function w3Spy(obj, name, fn) {             // replaces obj[name]; returns { calls, restore() }
  var orig = obj[name], rec = { calls: [], restore: function () { obj[name] = orig; } };
  obj[name] = function () { rec.calls.push(Array.prototype.slice.call(arguments)); return fn ? fn.apply(this, arguments) : orig.apply(this, arguments); };
  return rec;
}
var W3_CORE = ['core/util', 'core/ease', 'core/glow', 'core/fx', 'core/space', 'core/earth', 'core/shapes', 'core/field', 'core/text', 'core/theme', 'core/assets', 'core/stage'];
function w3Engine(names) {                  // a fresh kernel with the harness's factories re-registered, in this order
  var g = {}; PD.kernel(g);
  var K = g.PD, all = PD.modules();
  names.forEach(function (n) {
    var rec = all.filter(function (m) { return m.name === n; })[0];
    if (!rec) throw new Error('w3Engine: no module ' + n);
    K.module(n, rec.deps, rec.factory, rec.opts);
  });
  return K;
}
function w3Logo() {                         // a 1200 x 400 transparent logo: warm lettering and a white ring
  return w3Img(1200, 400, function (x, w, h) {
    x.fillStyle = '#ffb35c'; x.font = '700 250px sans-serif'; x.textBaseline = 'middle'; x.fillText('LOGO', 40, h / 2 + 12);
    x.strokeStyle = '#ffffff'; x.lineWidth = 36; x.beginPath(); x.arc(1010, 200, 120, 0, Math.PI * 2); x.stroke();
  });
}
function w3Layer(stage, spec) { return stage.makeLayer(spec, spec.kind); }

/* ---------------------------------------------------------------- registration */
T.test('wp3 registration: ambient, photo, image and counter follow the §4.5 / §4.6 contracts', function (a) {
  var amb = PD.world.get('ambient'), ph = PD.world.get('photo');
  a.ok(amb && ph, 'ambient and photo are registered (optional manifest files that landed)');
  a.deepEqual(Object.keys(amb.params).sort(), 'ambient ambientPreset ambientDrift bokeh bokehSize horizonGlow'.split(' ').sort(), 'ambient params');
  a.deepEqual(Object.keys(ph.params).sort(), 'photo photoAsset photoZoom photoX photoY photoDim photoTint'.split(' ').sort(), 'photo params');
  a.deepEqual(amb.crossfade, ['ambientPreset']); a.deepEqual(ph.crossfade, ['photoAsset']);
  Object.keys(amb.params).forEach(function (p) { a.equal(PD.world.owner(p), 'ambient', p); });
  Object.keys(ph.params).forEach(function (p) { a.equal(PD.world.owner(p), 'photo', p); });
  var passes = PD.world.passes(), find = function (w, n) { return passes.filter(function (q) { return q.world === w && q.name === n; })[0]; };
  a.deepEqual(find('ambient', 'base'), { world: 'ambient', name: 'base', z: 2, space: 'screen' });
  a.deepEqual(find('photo', 'image'), { world: 'photo', name: 'image', z: 4, space: 'screen' });
  var order = passes.map(function (q) { return q.world + '.' + q.name; });
  a.ok(order.indexOf('ambient.base') < order.indexOf('photo.image') && order.indexOf('photo.image') < order.indexOf('cosmos.backdrop'), 'draw order: ambient, photo, then cosmos');
  ['image', 'counter'].forEach(function (k) {
    var E = PD.element.get(k);
    a.ok(E && typeof E.create === 'function' && typeof E.measure === 'function' && typeof E.particleCount === 'function', k + ' element: create, measure, particleCount');
  });
  a.ok(PD.theme.has('slate'), 'slate is registered');
});

T.test('wp3 registration has no side effects (§3.1 rule 4): no canvas, no DOM, no random number', function (a) {
  var K = w3Engine(W3_CORE), mods = ['worlds/ambient', 'worlds/photo', 'elements/image', 'elements/counter'];
  var all = PD.modules(), mk = document.createElement, made = 0, rnd = 0, mr = Math.random;
  document.createElement = function () { made++; return mk.apply(document, arguments); };
  Math.random = function () { rnd++; return mr(); };
  try {
    mods.forEach(function (n) {
      var rec = all.filter(function (m) { return m.name === n; })[0];
      a.ok(rec, n + ' is loaded');
      K.module(n, rec.deps, rec.factory, rec.opts);
    });
  } finally { document.createElement = mk; Math.random = mr; }
  a.equal(made, 0, 'no element created while registering');
  a.equal(rnd, 0, 'no random number drawn while registering');
  a.ok(K.world.has('ambient') && K.world.has('photo') && K.element.has('image') && K.element.has('counter'), 'registered on the fresh kernel');
});

/* ---------------------------------------------------------------- the slate theme */
T.test('slate theme (§4.4): worlds, ambients, roles, shots, font; the numbers follow cosmos x the specified factors', function (a) {
  var S = PD.theme.resolve('slate'), C = PD.theme.resolve('cosmos');
  a.deepEqual(S.worlds, ['ambient', 'photo', 'spark']);
  a.deepEqual(Object.keys(S.ambients), ['charcoal', 'ember', 'steel', 'dusk']);
  a.deepEqual(S.ambients.charcoal.base, ['#121318', '#1c1e26'], 'charcoal base colours');
  Object.keys(S.ambients).forEach(function (k) {
    var p = S.ambients[k];
    a.ok(p.base.length === 2 && p.blobs.length >= 3 && typeof p.bokeh === 'string', k + ' preset shape { base[2], blobs, bokeh }');
  });
  a.equal(S.roles.accent, '#ffb35c', 'the warm accent');
  ['accent', 'accentGlow', 'future', 'futureGlow', 'past', 'pastGlow'].forEach(function (r) { a.ok(S.roles[r] != null, 'role ' + r + ' (templates use it)'); });
  a.deepEqual(Object.keys(S.shots).sort(), ['COOL', 'DARK', 'DRIFT', 'WARM']);
  a.deepEqual(S.shots.DRIFT, {}, 'DRIFT is the plain default');
  ['WARM', 'COOL', 'DARK'].forEach(function (s) {
    for (var p in S.shots[s]) a.equal(PD.world.owner(p) != null, true, s + '.' + p + ' is a known world param');
  });
  a.ok(!/avenir/i.test(S.fonts.display) && /system-ui/.test(S.fonts.display), 'the system font stack');
  a.deepEqual(Object.keys(S.styles).sort(), Object.keys(C.styles).sort(), 'the same styles as cosmos');
  Object.keys(C.styles).forEach(function (k) {
    var s = S.styles[k], c = C.styles[k];
    ['weight', 'size', 'lineHeight', 'maxWidth', 'push', 'upper', 'fillDir'].forEach(function (f) { a.equal(s[f], c[f], k + '.' + f + ' equals cosmos'); });
    if (c.glowSize != null) a.equal(s.glowSize, c.glowSize * 0.6, k + '.glowSize = cosmos x 0.6');
    if (c.glowAlpha != null) a.equal(s.glowAlpha, c.glowAlpha * 0.3, k + '.glowAlpha = cosmos x 0.3');
    a.equal(s.track, k === 'hero' || k === 'title' ? c.track * 0.7 : c.track, k + '.track');
    // the fill and glow colours are slate's own (AMEND-11 accepts the warm retune); the kicker and year styles name roles,
    // which resolve to slate's warm accent, and every style keeps cosmos' set of fields
    var role = { kicker: ['accent', 'accentGlow'], year: ['future', 'futureGlow'] }[k];
    if (role) { a.deepEqual(s.fill, S.roles[role[0]], k + '.fill is the role ' + role[0]); a.deepEqual(s.glow, S.roles[role[1]], k + '.glow is the role ' + role[1]); }
    a.deepEqual(Object.keys(s).sort(), Object.keys(c).sort(), k + ' has the same fields as cosmos');
  });
  a.ok(Object.isFrozen(S) && Object.isFrozen(S.styles.hero), 'the resolved theme is frozen');
  a.deepEqual(S.chain, ['slate'], 'self-contained: no extends');
});

/* ---------------------------------------------------------------- the ambient world */
T.test('ambient: off at ambient 0, graded and lit at 1, deterministic, no random numbers', function (a) {
  return w3Assets({}).then(function (A) {
    var off = [{ id: 'off', world: w3World({ ambient: 0 }) }], on = [{ id: 'on', world: w3World({ ambient: 1 }) }];
    var z = w3Stage(A.id, off), s = w3Stage(A.id, on), s2 = w3Stage(A.id, on), rnd = 0, mr = Math.random;
    Math.random = function () { rnd++; return mr(); };
    try {
      w3Settle(z, 0); w3Near(a, w3Px(z, 240, 135), [0, 0, 0], 0, 'ambient 0 draws nothing');
      w3Settle(s, 0); w3Settle(s2, 0);
      var c = w3Px(s, 240, 135), e = w3Px(s, 2, 2);
      a.ok(c[0] > 12 && c[1] > 12 && c[2] > 12, 'the centre is lit: ' + JSON.stringify(c));
      a.ok(c[0] + c[1] + c[2] > e[0] + e[1] + e[2], 'brighter in the middle than in the corner');
      a.equal(s.canvas.toDataURL(), s2.canvas.toDataURL(), 'two stages draw the same pixels');
      w3Run(s, 3); w3Run(s2, 3);
      a.equal(s.canvas.toDataURL(), s2.canvas.toDataURL(), 'and still do after 3 s of drift');
    } finally { Math.random = mr; }
    a.equal(rnd, 0, 'no Math.random call from construction, preload, update or draw');
  });
});

T.test('ambient: bokeh, drift and horizon glow change the picture; drift 0 freezes it', function (a) {
  return w3Assets({}).then(function (A) {
    var base = { ambientDrift: 1, bokeh: 0, horizonGlow: 0 };
    function frame(world, secs) {
      var s = w3Stage(A.id, [{ id: 'x', world: w3World(world) }]);
      w3Settle(s, 0); if (secs) w3Run(s, secs);
      return s;
    }
    var plain = frame(base, 0), bokeh = frame({ bokeh: 1, ambientDrift: 1, horizonGlow: 0 }, 0), glow = frame({ bokeh: 0, ambientDrift: 1, horizonGlow: 1 }, 0);
    a.ok(w3Mean(bokeh) > w3Mean(plain), 'bokeh adds light');
    a.ok(w3Mean(glow) > w3Mean(plain), 'the horizon glow adds light');
    var bottom = function (s) { var p = w3Px(s, 240, 262); return p[0] + p[1] + p[2]; };
    a.ok(bottom(glow) > bottom(plain), 'the glow sits along the bottom');
    var moving = frame(base, 20), still0 = frame({ bokeh: 0, horizonGlow: 0, ambientDrift: 0 }, 20), still1 = frame({ bokeh: 0, horizonGlow: 0, ambientDrift: 0 }, 0);
    a.ok(moving.canvas.toDataURL() !== plain.canvas.toDataURL(), 'the lights drift');
    a.equal(still0.canvas.toDataURL(), still1.canvas.toDataURL(), 'ambientDrift 0 freezes the picture');
  });
});

T.test('ambient: strength mixes the backdrop with black in proportion, and it is composed in one small buffer, drawn once per frame', function (a) {
  return w3Assets({}).then(function (A) {
    var q = { ambientDrift: 0, bokeh: 0, horizonGlow: 0.3 };
    function frame(strength) { var s = w3Stage(A.id, [{ id: 'x', world: w3World(Object.assign({ ambient: strength }, q)) }]); w3Settle(s, 0); return w3Mean(s); }
    var full = frame(1), half = frame(0.5), quarter = frame(0.25);
    a.near(half / full, 0.5, 0.03, 'strength 0.5 gives half the light (' + half.toFixed(2) + ' / ' + full.toFixed(2) + ')');
    a.near(quarter / full, 0.25, 0.03, 'strength 0.25 gives a quarter');
    // the backdrop reaches the frame in ONE draw of the small buffer (the part that costs on a big canvas), also mid-crossfade
    var s = w3Stage(A.id, [{ id: 'x', world: w3World({ ambientPreset: 'charcoal', bokeh: 0 }) }]);
    w3Settle(s, 0);
    s.setWorld({ ambientPreset: 'ember' }, { ambientPreset: [400, 'linear'] }, 400, 'linear', false); s.tick(200);
    var big = [], di = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img) {
      if (this === s.ctx && img && img.width > 100) big.push(img.width + 'x' + img.height);
      return di.apply(this, arguments);
    };
    try { s.draw(); } finally { CanvasRenderingContext2D.prototype.drawImage = di; }
    a.deepEqual(big, ['512x288'], 'one draw of a 512 x 288 buffer onto the frame, mid-crossfade (got ' + big.join(', ') + ')');
  });
});

T.test('ambient: a preset change is a crossfade with no dip, busy until it ends, finished by finishAll', function (a) {
  return w3Assets({}).then(function (A) {
    var q = { ambientDrift: 0, bokeh: 0, horizonGlow: 0 };
    var scenes = [{ id: 'a', world: w3World(Object.assign({ ambientPreset: 'charcoal' }, q)) }, { id: 'b', world: w3World(Object.assign({ ambientPreset: 'steel' }, q)) }];
    var one = w3Stage(A.id, scenes); w3Settle(one, 0); var mA = w3Mean(one);
    var two = w3Stage(A.id, scenes); w3Settle(two, 1); var mB = w3Mean(two);
    a.ok(Math.abs(mA - mB) > 0.5, 'the two presets differ in brightness here (' + mA.toFixed(2) + ' vs ' + mB.toFixed(2) + ')');
    var s = w3Stage(A.id, scenes); w3Settle(s, 0);
    s.enter(1, 0, 'live');
    a.ok(s.busy(), 'busy while the world glides');
    var mids = [];
    for (var i = 0; i < 90; i++) { s.tick(1 / 30); if (i % 6 === 5) { s.draw(); mids.push(w3Mean(s)); } }
    var lo = Math.min(mA, mB) - 2.5;
    mids.forEach(function (m, k) { a.ok(m >= lo, 'no dip below both presets at sample ' + k + ': ' + m.toFixed(2) + ' >= ' + lo.toFixed(2)); });
    s.enter(0, 0, 'live'); s.enter(1, 0, 'live');         // restart a transition, then end it at once
    s.finishAll();
    a.equal(s.busy(), false, 'not busy after finishAll');
    a.equal(s.xf.ambientPreset.length, 1, 'one layer is left in the crossfade stack');
    s.draw();
    a.near(w3Mean(s), mB, 0.6, 'ends on the new preset');
  });
});

T.test('ambient: an unknown preset falls back to the theme\'s first one; a theme with no ambients still draws', function (a) {
  return w3Assets({}).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'x', world: w3World({ ambientPreset: 'nope', ambientDrift: 0, bokeh: 0, horizonGlow: 0 }) }, { id: 'y', world: w3World({ ambientPreset: 'charcoal', ambientDrift: 0, bokeh: 0, horizonGlow: 0 }) }]);
    w3Settle(s, 0); var m1 = w3Mean(s); w3Settle(s, 1); var m2 = w3Mean(s);
    a.near(m1, m2, 0.01, 'unknown name = first preset (charcoal)');
    // a custom theme that enables the ambient world but defines no ambients: the built-in preset (a fresh kernel keeps
    // the harness's theme registry clean)
    var K = w3Engine(W3_CORE.concat(['worlds/core', 'worlds/ambient'])), sl = PD.theme.resolve('slate');
    K.theme('w3-bare', { label: 'bare', worlds: ['ambient'], fonts: { display: 'sans-serif' }, colors: { white: '#fff' },
      styles: { title: { weight: 600, size: 40, track: 0.1, fill: '#fff' } }, world: { vignette: 0, grain: 0 }, motion: sl.motion, timing: sl.timing, ui: { accent: '#fff' } });
    var th = K.theme.resolve('w3-bare');
    var compiled = { id: 'w3b', meta: {}, source: null, theme: th, themeKey: th.key, worlds: ['core', 'ambient'], scenes: [{ id: 'x', world: {} }], sceneKeys: [], errors: [] };
    var cv = w3Canvas(480, 270), b = new K.Stage(cv, { deck: compiled });
    b.resize(480, 270, 1); b.preload(compiled); b.prepare(compiled.scenes[0]);
    w3Settle(b, 0);
    a.ok(w3Mean(b) > 10, 'the built-in preset draws: ' + w3Mean(b).toFixed(1));
  });
});

T.test('ambient: preset colours may be theme colour names; an unreadable colour is mid grey and never throws', function (a) {
  var K = w3Engine(W3_CORE.concat(['worlds/core', 'worlds/ambient'])), sl = PD.theme.resolve('slate');
  K.theme('w3-names', { label: 'names', worlds: ['ambient'], fonts: { display: 'sans-serif' }, colors: { white: '#fff', ink: '#101820', glowy: '#ff8800' },
    styles: { title: { weight: 600, size: 40, track: 0.1, fill: '#fff' } }, world: { vignette: 0, grain: 0, ambientPreset: 'named' }, motion: sl.motion, timing: sl.timing, ui: { accent: '#fff' },
    ambients: { named: { base: ['ink', 'amber'], blobs: ['glowy', 'gold'], bokeh: 'white' }, broken: { base: ['nonsense', '#xyz'], blobs: ['', 'not a colour'], bokeh: '??' } } });
  var th = K.theme.resolve('w3-names');
  function frame(preset) {
    var compiled = { id: 'w3n', meta: {}, source: null, theme: th, themeKey: th.key, worlds: ['core', 'ambient'], scenes: [{ id: 'x', world: { ambientPreset: preset, bokeh: 1 } }], sceneKeys: [], errors: [] };
    var st = new K.Stage(w3Canvas(480, 270), { deck: compiled });
    st.resize(480, 270, 1); st.preload(compiled); st.prepare(compiled.scenes[0]);
    w3Settle(st, 0);
    return st;
  }
  var named = frame('named'), broken = frame('broken');
  a.ok(w3Mean(named) > 15, 'named colours draw: ' + w3Mean(named).toFixed(1));
  a.ok(w3Mean(broken) > 5, 'unreadable colours draw too: ' + w3Mean(broken).toFixed(1));
  var c = w3Px(named, 240, 135);
  a.ok(c[0] > c[2], 'the warm named colours win over blue: ' + JSON.stringify(c));
});

/* ---------------------------------------------------------------- the photo world */
T.test('photo: fills the frame, honours opacity and dim, and the focus point decides what stays on screen', function (a) {
  var red = w3Solid('#ff0000'), wide = w3Img(3840, 1080, function (x, w, h) { x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h); x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h); });
  return w3Assets({ red: red, wide: wide, grey: w3Solid('#808080') }).then(function (A) {
    var P = { photo: 1, photoDim: 0, ambient: 0, photoAsset: 'red' };
    function at(world, x, y) { var s = w3Stage(A.id, [{ id: 'p', world: w3World(Object.assign({}, P, world)) }]); w3Settle(s, 0); return w3Px(s, x, y); }
    w3Near(a, at({}, 240, 40), [255, 0, 0], 1, 'a full picture');
    w3Near(a, at({ photo: 0.5 }, 240, 40), [127, 0, 0], 2, 'half opacity over black');
    w3Near(a, at({ photoDim: 0.5 }, 240, 40), [127, 0, 0], 2, 'dim 0.5');
    w3Near(a, at({ photo: 0 }, 240, 40), [0, 0, 0], 0, 'photo 0 draws nothing');
    var low = at({}, 240, 250), top = at({}, 240, 40);
    a.ok(low[0] < top[0] - 20, 'a scrim darkens the lower part for captions (' + low[0] + ' vs ' + top[0] + ')');
    // the wide picture: red | blue, 3840 x 1080 -> cover scale 1, 1920 of it on screen
    var W = { photoAsset: 'wide' };
    w3Near(a, at(Object.assign({ photoX: 0 }, W), 240, 40), [255, 0, 0], 1, 'photoX 0 keeps the left edge (red)');
    w3Near(a, at(Object.assign({ photoX: 1 }, W), 240, 40), [0, 0, 255], 1, 'photoX 1 keeps the right edge (blue)');
    w3Near(a, at(Object.assign({ photoX: 0.5 }, W), 100, 40), [255, 0, 0], 1, 'centred: red on the left of the middle');
    w3Near(a, at(Object.assign({ photoX: 0.5 }, W), 380, 40), [0, 0, 255], 1, 'centred: blue on the right of the middle');
    // zoom grows from the focus point: at photoX 0 the left edge stays red however far in
    w3Near(a, at(Object.assign({ photoX: 0, photoZoom: 1.6 }, W), 10, 40), [255, 0, 0], 1, 'zoom anchored at the focus');
    var grey = at({ photoAsset: 'grey', photoTint: '#ff8800' }, 240, 40), plain = at({ photoAsset: 'grey' }, 240, 40);
    w3Near(a, plain, [128, 128, 128], 2, 'a grey picture, no tint');
    a.ok(grey[0] > grey[2] + 12 && grey[0] > plain[0], 'a warm tint grades the picture: ' + JSON.stringify(grey));
    w3Near(a, at({ photoAsset: 'ghost' }, 240, 40), [0, 0, 0], 0, 'a missing asset draws nothing, and does not throw');
  });
});

T.test('photo: photoAsset crossfades picture to picture without a dip; an empty asset takes no share; finishAll ends it', function (a) {
  return w3Assets({ red: w3Solid('#ff0000'), blue: w3Solid('#0000ff') }).then(function (A) {
    var P = { photo: 1, photoDim: 0, ambient: 0 };
    var s = w3Stage(A.id, [{ id: 'a', world: w3World(Object.assign({ photoAsset: 'red' }, P)) }]);
    w3Settle(s, 0);
    s.setWorld({ photoAsset: 'blue' }, { photoAsset: [1, 'linear'] }, 1, 'linear', false);
    a.ok(s.busy(), 'busy during the crossfade');
    for (var i = 0; i < 15; i++) s.tick(1 / 30);          // half way: the eased amounts are 0.5 / 0.5
    s.draw();
    w3Near(a, w3Px(s, 240, 40), [127, 0, 127], 5, 'half way: an even mix, no dark dip');
    s.finishAll(); s.draw();
    w3Near(a, w3Px(s, 240, 40), [0, 0, 255], 1, 'finishAll: the new picture');
    a.equal(s.busy(), false, 'photoAsset is not busy after finishAll');
    a.equal(s.xf.photoAsset.length, 1);
    // nothing -> picture: the photo param fades it in, the crossfade does not slow it down
    var e = w3Stage(A.id, [{ id: 'e', world: w3World(Object.assign({ photoAsset: '' }, P)) }]);
    w3Settle(e, 0);
    e.setWorld({ photoAsset: 'red' }, { photoAsset: [2, 'linear'] }, 2, 'linear', false);
    e.tick(0.1); e.draw();
    w3Near(a, w3Px(e, 240, 40), [255, 0, 0], 1, 'an empty asset takes no share: full opacity at once');
  });
});

T.test('photo: warm-up touches each picture the deck shows (warmed turns true), and stays out of thumbnails', function (a) {
  return w3Assets({ red: w3Solid('#ff0000') }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'a', world: w3World({ photo: 1, photoAsset: 'red', photoDim: 0 }) }], { cold: true });
    var def = PD.world.get('photo'), st = s.worldStates.photo;
    a.equal(def.warmed(st), false, 'a picture is waiting to be warmed');
    s.warmTick();
    a.equal(def.warmed(st), true, 'one warm call does it');
    a.equal(s.isWarm() || (s.warmAll(), s.isWarm()), true, 'the stage becomes warm');
    var th = w3Stage(A.id, [{ id: 'a', world: w3World({ photo: 1, photoAsset: 'red', photoDim: 0 }) }], { thumb: true, cold: true });
    th.tick(0.05);
    a.equal(PD.world.get('photo').warmed(th.worldStates.photo), false, 'a thumbnail stage does not warm');
    th.still(0, 0);
    w3Near(a, w3Px(th, 120, 20), [255, 0, 0], 1, 'but it draws the picture');
  });
});

/* ---------------------------------------------------------------- the image element */
T.test('image: a transparent logo gives at most 3500 points, deterministic, no random numbers, inside its box', function (a) {
  return w3Assets({ logo: w3Logo() }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'l', world: w3World({ ambient: 0 }) }]);
    var spec = { kind: 'image', asset: 'logo', x: 960, y: 540, w: 900, reveal: 'particles', sample: { mode: 'alpha', maxPoints: 3500 } };
    var L = w3Layer(s, spec), rnd = 0, mr = Math.random;
    Math.random = function () { rnd++; return mr(); };
    var p1, p2;
    try { p1 = L.points(L.o.stride, L.o.particleSize); p2 = L.points(L.o.stride, L.o.particleSize); } finally { Math.random = mr; }
    a.equal(rnd, 0, 'no Math.random in points()');
    a.ok(p1.length > 300 && p1.length <= 3500, 'points: ' + p1.length);
    a.deepEqual(p1, p2, 'the same points every time');
    var dr = L.dr;
    a.near(dr.w, 900, 1e-9); a.near(dr.h, 300, 1e-9, '1200 x 400 at width 900');
    p1.forEach(function (p) {
      if (p.x < dr.x - 1 || p.x > dr.x + dr.w + 1 || p.y < dr.y - 1 || p.y > dr.y + dr.h + 1) a.fail('a point outside the picture: ' + p.x + ',' + p.y);
    });
    a.equal(PD.element.get('image').particleCount(spec, s.env), p1.length, 'particleCount is the exact count');
    var few = w3Layer(s, Object.assign({}, spec, { sample: { maxPoints: 400 } })).points();
    a.ok(few.length > 50 && few.length <= 400, 'maxPoints caps the count: ' + few.length);
    var lowRes = L.points(30);
    a.ok(lowRes.length < p1.length, 'a larger stride gives fewer points');
    // colours come from the picture: warm lettering and a white ring
    var warm = p1.filter(function (p) { return p.r > 200 && p.g > 130 && p.g < 200 && p.b < 130; }).length;
    var white = p1.filter(function (p) { return p.r > 230 && p.g > 230 && p.b > 230; }).length;
    a.ok(warm > 100 && white > 50, 'sampled colours: ' + warm + ' warm, ' + white + ' white');
  });
});

T.test('image: luma mode samples the bright part of a picture that has no transparency; a single colour can be forced', function (a) {
  var photo = w3Img(600, 300, function (x, w, h) { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffffff'; x.fillRect(300, 0, 300, h); });
  return w3Assets({ photo: photo }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'l', world: w3World({ ambient: 0 }) }]);
    var base = { kind: 'image', asset: 'photo', x: 960, y: 540, w: 600, reveal: 'particles' };
    var alpha = w3Layer(s, Object.assign({ sample: { mode: 'alpha' } }, base)).points();
    var luma = w3Layer(s, Object.assign({ sample: { mode: 'luma' } }, base)).points();
    var L = w3Layer(s, Object.assign({ sample: { mode: 'luma' } }, base));
    a.ok(luma.length > 100 && alpha.length > 100, 'both sample something');
    a.ok(luma.every(function (p) { return p.x >= L.dr.x + L.dr.w / 2 - 6; }), 'luma: only the bright right half');
    a.ok(alpha.some(function (p) { return p.x < L.dr.x + L.dr.w / 2 - 20; }), 'alpha: the opaque black half counts too');
    var gold = w3Layer(s, Object.assign({ sample: { mode: 'luma', color: '#ffb35c', size: 9 } }, base)).points();
    a.ok(gold.every(function (p) { return p.r === 255 && p.g === 179 && p.b === 92 && p.s === 9; }), 'sample.color and sample.size apply');
  });
});

T.test('image: a particles logo never pushes the field past 9000, and plays without errors', function (a) {
  return w3Assets({ logo: w3Logo() }).then(function (A) {
    var els = [0, 1, 2].map(function (i) { return { kind: 'image', asset: 'logo', x: 480 + i * 480, y: 300 + i * 220, w: 1500, reveal: 'particles', sample: { maxPoints: 3500 } }; });
    var s = w3Stage(A.id, [{ id: 'l', world: w3World({}), elements: els, motion: { entry: 'void', dur: 1, spread: 0.5 } }]);
    w3Boot(s); s.enter(0, 0, 'live');
    var max = 0;
    for (var i = 0; i < 240; i++) { s.tick(1 / 30); if (i % 8 === 0) s.draw(); max = Math.max(max, s.field.list.length); a.ok(s.field.list.length <= 9000, 'field size at tick ' + i + ': ' + s.field.list.length); }
    a.ok(max >= 8900, 'three logos ask for ~10500 particles; the field holds ' + max);
    s.finishAll();
    a.ok(s.field.list.length <= 9000);
  });
});

T.test('image: a picture that cannot be sampled (a file: source) falls back to fade, with one warning and no exception', function (a) {
  var id = 'w3-bad-' + (w3N++), map = {}; map[id] = { type: 'image', src: 'file:///definitely/not/here.png', w: 1200, h: 400, name: 'bad', bytes: 1 };
  return w3Assets(map).then(function (A) {
    a.equal(A.rep.failed.length, 1); a.equal(A.rep.failed[0].reason, 'not-embedded');
    var ra = PD.asset(A.id, id);
    a.equal(ra.ok, false); a.equal(ra.error, 'not-embedded');
    var warn = w3Spy(console, 'warn', function () { });
    try {
      var spec = { kind: 'image', asset: id, x: 960, y: 540, w: 900, reveal: 'particles' };
      var s = w3Stage(A.id, [{ id: 'l', world: w3World({}), elements: [spec] }]);
      var L = w3Layer(s, spec);
      a.equal(L.reveal, 'fade', 'the reveal fell back to fade');
      a.deepEqual(L.points(), [], 'points() is empty and does not throw');
      s.enter(0, 0, 'live');
      for (var i = 0; i < 150; i++) { s.tick(1 / 30); s.draw(); }
      a.equal(s.field.list.length, 0, 'no particles');
      s.finishAll(); s.draw();
      var mine = warn.calls.filter(function (c) { return String(c[0]).indexOf(id) >= 0; });
      a.equal(mine.length, 1, 'exactly one warning for this asset: ' + JSON.stringify(mine.map(function (c) { return c[0]; })));
      a.equal(PD.element.get('image').particleCount(spec, s.env), 0, 'it makes no particles in the budget either');
    } finally { warn.restore(); }
  });
});

T.test('image: a particles reveal whose picture is sampled but unreadable (a tainted read) falls back to fade', function (a) {
  return w3Assets({ pic: w3Solid('#ff8800', 400, 225) }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'l', world: w3World({}) }]), spec = { kind: 'image', asset: 'pic', x: 960, y: 540, w: 400, reveal: 'particles' };
    var L = w3Layer(s, spec), warn = w3Spy(console, 'warn', function () { });
    var gid = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function () { throw new DOMException('The canvas has been tainted by cross-origin data.', 'SecurityError'); };
    try {
      a.equal(L.reveal, 'particles', 'before: particles');
      a.deepEqual(L.points(), [], 'no exception');
      a.equal(L.reveal, 'fade', 'after: fade');
      a.ok(warn.calls.length >= 1, 'a console warning');
    } finally { CanvasRenderingContext2D.prototype.getImageData = gid; warn.restore(); }
  });
});

T.test('image: geometry (contain, cover, one dimension, align), measure, rounded corners and glow', function (a) {
  var sq = w3Img(100, 100, function (x, w, h) { x.fillStyle = '#ff0000'; x.fillRect(0, 0, w, h); });
  return w3Assets({ sq: sq }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'g', world: w3World({ ambient: 0 }) }]), E = PD.element.get('image');
    function m(o) { return E.measure(Object.assign({ kind: 'image', asset: 'sq', x: 960, y: 540 }, o), s.env); }
    var c = m({ w: 600, h: 300 }); a.deepEqual([c.x, c.y, c.w, c.h], [810, 390, 300, 300], 'contain: the whole square, centred in the box');
    var v = m({ w: 600, h: 300, fit: 'cover' }); a.deepEqual([v.x, v.y, v.w, v.h], [660, 390, 600, 300], 'cover: the box');
    var w = m({ w: 400 }); a.deepEqual([w.w, w.h], [400, 400], 'width only: the height follows');
    var h = m({ h: 200 }); a.deepEqual([h.w, h.h], [200, 200], 'height only: the width follows');
    var n = m({}); a.deepEqual([n.w, n.h], [100, 100], 'no size: the pixel size');
    var l = m({ w: 400, align: 'left' }); a.equal(l.x, 960, 'align left: x is the left edge');
    var r = m({ w: 400, align: 'right' }); a.equal(r.x, 560, 'align right: x is the right edge');
    // pixels: a 400 x 225 box at the centre, corners rounded by 40 units (10 px at this scale)
    var spec = { kind: 'image', asset: 'sq', x: 960, y: 540, w: 400, h: 225, fit: 'cover', radius: 40, reveal: 'fade' };
    var st = w3Stage(A.id, [{ id: 'r', world: w3World({ ambient: 0 }), elements: [spec] }]);
    w3Settle(st, 0);
    w3Near(a, w3Px(st, 200, 120), [255, 0, 0], 1, 'inside');
    w3Near(a, w3Px(st, 191, 108), [0, 0, 0], 0, 'the corner is cut away');
    var gl = Object.assign({}, spec, { radius: 0, glow: '#ff8800', glowSize: 60 });
    var sg = w3Stage(A.id, [{ id: 'g', world: w3World({ ambient: 0 }), elements: [gl] }]);
    w3Settle(sg, 0);
    var halo = w3Px(sg, 186, 135);
    a.ok(halo[0] > 8, 'a glow halo outside the picture: ' + JSON.stringify(halo));
    w3Near(a, w3Px(st, 186, 135), [0, 0, 0], 0, 'no glow, no halo');
  });
});

T.test('image: every reveal and exit runs; the picture is complete after finishAll and gone after its exit', function (a) {
  return w3Assets({ pic: w3Solid('#00ff00', 400, 225) }).then(function (A) {
    ['fade', 'rise', 'focus', 'wipe'].forEach(function (rv) {
      var spec = { kind: 'image', asset: 'pic', x: 960, y: 540, w: 800, h: 450, reveal: rv, revealTime: 1 };
      var s = w3Stage(A.id, [{ id: 'a', world: w3World({ ambient: 0 }), elements: [spec] }, { id: 'b', world: w3World({ ambient: 0 }) }]);
      w3Boot(s); s.enter(0, 0, 'live');
      s.tick(0.2); s.draw();
      w3Near(a, w3Px(s, 240, 135), [0, 0, 0], 0, rv + ': nothing before its start (0.5 s delay)');
      for (var i = 0; i < 24; i++) s.tick(1 / 30);       // 0.9 s in: 0.4 s into a 1 s reveal
      s.draw();
      var mid = w3Px(s, 240, 135);
      a.ok(rv === 'wipe' ? true : mid[1] > 0 && mid[1] < 255, rv + ': partway at 0.9 s: ' + JSON.stringify(mid));
      s.finishAll(); s.draw();
      w3Near(a, w3Px(s, 240, 135), [0, 255, 0], 1, rv + ': complete after finishAll');
      a.equal(s.busy(), false, rv + ': not busy');
      s.enter(1, 0, 'live');                              // the picture leaves with the scene
      for (i = 0; i < 40; i++) s.tick(1 / 30);
      s.draw();
      w3Near(a, w3Px(s, 240, 135), [0, 0, 0], 0, rv + ': gone after its exit');
    });
    ['fade', 'rise', 'sink', 'blur'].forEach(function (ex) {
      var spec = { kind: 'image', asset: 'pic', x: 960, y: 540, w: 800, h: 450, exit: ex };
      var s = w3Stage(A.id, [{ id: 'a', world: w3World({ ambient: 0 }), elements: [spec] }, { id: 'b', world: w3World({ ambient: 0 }) }]);
      w3Settle(s, 0); s.enter(1, 0, 'live');
      for (var i = 0; i < 60; i++) s.tick(1 / 30);
      s.draw();
      w3Near(a, w3Px(s, 240, 135), [0, 0, 0], 0, ex + ' exit completes');
    });
  });
});

T.test('image: a registered reveal and exit (the registry fallback) work on pictures like they do on text', function (a) {
  return w3Assets({ pic: w3Solid('#00ff00', 400, 225) }).then(function (A) {
    var K = w3Engine(W3_CORE.concat(['elements/image']));    // a fresh registry: the harness's stays clean
    K.reveal('w3-half', { inDur: 1, pose: function (L, t, p) { return { alpha: 0.5, dy: 0, scale: 1 }; } });
    K.exitFx('w3-gone', { apply: function (L, p, e, pose) { pose.alpha = 0; } });
    var env = { theme: PD.theme.resolve('slate'), col: function () { return [0, 0, 0]; }, assets: function (id) { return PD.asset(A.id, id); } };
    var L = K.element.get('image').create({ kind: 'image', asset: 'pic', w: 400, reveal: 'w3-half', exit: 'w3-gone' }, env);
    a.equal(L.inDur, 1, 'the registry reveal sets the default time');
    L.inStart = 0; L.ensureCache(1);
    var cv = w3Canvas(1920, 1080), cx = cv.getContext('2d');
    L.draw(cx, 0.2, 1);
    var px = cx.getImageData(960, 540, 1, 1).data;
    a.near(px[3], 127.5, 2, 'pose alpha 0.5 applied');
    L.startOut(1); cx.clearRect(0, 0, 1920, 1080); L.draw(cx, 2, 1);
    a.equal(cx.getImageData(960, 540, 1, 1).data[3], 0, 'registry exit applied');
  });
});

/* An image's reveals and exits are the text layer's maths (§4.6: "Reveal maths are shared with TextLayer"). text.js keeps
 * its maths inline in draw (it is verbatim from cinema, which the OGL golden gate pins), so the image layer carries
 * its own copy of the same constants; this test is what keeps the two from drifting: both layers are drawn through a
 * recording context and must make the same transform, opacity and copies at every point of every shared reveal and exit. */
function w3Rec() {                          // a 2D context that records drawImage calls in design space (centre, scale, opacity)
  var m = [1, 0, 0, 1, 0, 0], stack = [], calls = [], alpha = 1;
  var g = { addColorStop: function () { } };
  return {
    calls: calls,
    save: function () { stack.push([m.slice(), alpha]); }, restore: function () { var q = stack.pop(); m = q[0]; alpha = q[1]; },
    translate: function (x, y) { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale: function (x, y) { m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    createLinearGradient: function () { return g; }, fillRect: function () { },
    drawImage: function (img, a1, a2, a3, a4, a5, a6, a7, a8) {
      var nine = arguments.length === 9, x = nine ? a5 : a1, y = nine ? a6 : a2, w = nine ? a7 : a3, h = nine ? a8 : a4;
      calls.push({ cx: m[0] * (x + w / 2) + m[4], cy: m[3] * (y + h / 2) + m[5], s: m[0], w: w * m[0], a: alpha, nine: nine });
    },
    set globalAlpha(v) { alpha = v; }, get globalAlpha() { return alpha; },
    globalCompositeOperation: 'source-over', fillStyle: ''
  };
}
T.test('image: reveals and exits make the same pose as the text layer (the two copies of the maths do not drift)', function (a) {
  return w3Assets({ pic: w3Solid('#808080', 800, 450) }).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'x', world: w3World({ ambient: 0 }) }]);
    function calls(kind, spec, t, outAt) {
      var L = w3Layer(s, spec); L.inStart = 0; if (outAt != null) L.startOut(outAt);
      var rec = w3Rec(); L.draw(rec, t, 1);
      return rec.calls;
    }
    var TXT = { kind: 'text', str: 'Wide wide words', style: 'hero', x: 960, y: 540, push: 0 };
    var IMG = { kind: 'image', asset: 'pic', x: 960, y: 540, w: 800, h: 450, push: 0 };
    function same(reveal, exit, t, outAt) {
      var tx = calls('text', Object.assign({}, TXT, { reveal: reveal, exit: exit || 'fade' }), t, outAt);
      var im = calls('image', Object.assign({}, IMG, { reveal: reveal, exit: exit || 'fade' }), t, outAt);
      var label = reveal + (outAt != null ? '/' + exit : '') + ' at t=' + t;
      a.ok(tx.length > 0 && tx.length === im.length, label + ': the same number of copies drawn (' + tx.length + ' vs ' + im.length + ')');
      for (var i = 0; i < Math.min(tx.length, im.length); i++) {
        a.near(im[i].cx, tx[i].cx, 1e-6, label + ' copy ' + i + ' x'); a.near(im[i].cy, tx[i].cy, 1e-6, label + ' copy ' + i + ' y (the rise)');
        a.near(im[i].s, tx[i].s, 1e-9, label + ' copy ' + i + ' scale'); a.near(im[i].a, tx[i].a, 1e-9, label + ' copy ' + i + ' opacity');
      }
    }
    ['fade', 'rise', 'focus'].forEach(function (rv) { [0.1, 0.35, 0.7, 1.05].forEach(function (t) { same(rv, null, t); }); });
    ['fade', 'rise', 'sink', 'blur'].forEach(function (ex) { [0.15, 0.4, 0.65].forEach(function (d) { same('fade', ex, 3 + d, 3); }); });
    // wipe: both reveal by sliding a clip edge; the revealed width fraction must match (the leading-edge light is each look's own)
    [0.2, 0.5, 0.8].forEach(function (t) {
      var tw = calls('text', Object.assign({}, TXT, { reveal: 'wipe' }), t), iw = calls('image', Object.assign({}, IMG, { reveal: 'wipe' }), t);
      var L1 = w3Layer(s, Object.assign({}, TXT, { reveal: 'wipe' })), L2 = w3Layer(s, Object.assign({}, IMG, { reveal: 'wipe' }));
      a.near(iw[0].w / (L2.dr.w + L2.pad * 2), tw[0].w / (L1.w + L1.pad * 2), 1e-9, 'wipe at t=' + t + ': the same fraction of the layer is revealed');
    });
  });
});

/* ---------------------------------------------------------------- the counter element */
T.test('counter: formatting (decimals, prefix, suffix, separator, negatives)', function (a) {
  var f = PD.get('elements/counter').formatNumber;
  a.equal(f(1234.5, 1, ','), '1,234.5');
  a.equal(f(0, 0, ','), '0');
  a.equal(f(999, 0, ','), '999'); a.equal(f(1000, 0, ','), '1,000');
  a.equal(f(1234567.891, 2, ','), '1,234,567.89');
  a.equal(f(1234567, 0, ''), '1234567', 'no grouping with an empty separator');
  a.equal(f(1234567, 0, ' '), '1 234 567');
  a.equal(f(-1234.5, 1, ','), '-1,234.5');
  a.equal(f(-0.04, 1, ','), '0.0', 'a rounded zero has no minus sign');
  a.equal(f(0.5, 3, ','), '0.500');
  a.equal(f(62, 0, ','), '62');
  return w3Assets({}).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'c', world: w3World({}) }]);
    var L = w3Layer(s, { kind: 'counter', to: 1234.5, decimals: 1, suffix: '%' });
    a.equal(L.format(1234.5), '1,234.5%');
    var M = w3Layer(s, { kind: 'counter', to: 2847300, prefix: '$', style: 'hero' });
    a.equal(M.format(2847300), '$2,847,300');
    a.deepEqual(PD.element.get('counter').measure({ kind: 'counter', to: 1234.5, decimals: 1, suffix: '%' }, s.env).lines, ['1,234.5%'], 'measure reports the final text');
  });
});

T.test('counter: counts from `from` to `to`, shows exactly `to` after finishAll, on settled and instant entries', function (a) {
  return w3Assets({}).then(function (A) {
    var spec = { kind: 'counter', from: 0, to: 1234.5, decimals: 1, suffix: '%', countTime: 2 };
    function fresh() { return w3Stage(A.id, [{ id: 'c', world: w3World({ ambient: 0 }), elements: [spec] }, { id: 'd', world: w3World({ ambient: 0 }) }]); }
    var s = fresh();
    s.enter(0, 0, 'live');
    var L = s.layers.filter(function (l) { return l.kind === 'counter'; })[0];
    a.equal(L.settled, false, 'a live entry counts');
    a.equal(L.valueAt(L.inStart - 1), 0, 'starts at `from`');
    var half = L.valueAt(L.inStart + 1);
    a.ok(half > 0 && half < 1234.5, 'on its way: ' + half);
    a.equal(L.valueAt(L.inStart + 2), 1234.5, 'arrives exactly at countTime');
    a.ok(s.busy(), 'busy while counting');
    s.finishAll();
    a.equal(L.valueAt(s.T), 1234.5, 'finishAll: exactly `to`');
    a.equal(s.busy(), false);
    var settled = fresh(); settled.enter(0, 0, 'settled');
    var S = settled.layers.filter(function (l) { return l.kind === 'counter'; })[0];
    a.equal(S.settled, true, 'a settled entry is recognised');
    a.equal(S.valueAt(S.inStart), 1234.5, 'settled: `to` from the first frame');
    var inst = fresh(); inst.enter(0, 0, 'instant');
    var I = inst.layers.filter(function (l) { return l.kind === 'counter'; })[0];
    a.equal(I.valueAt(inst.T), 1234.5, 'instant: `to`');
    var count = fresh(); count.enter(0, 0, 'live'); count.enter(1, 0, 'live');
    a.ok(true, 'leaving does not throw');
    // counting down, negatives, and a stage that says what the entry is
    var dn = w3Layer(s, { kind: 'counter', from: 100, to: -20, countTime: 1 }); dn.inStart = 0;
    a.equal(dn.valueAt(1), -20); a.ok(dn.valueAt(0.5) < 100 && dn.valueAt(0.5) > -20);
    var fake = { T: 5, entryMode: 'settled' }, env = { theme: s.theme, col: s.col, assets: s.env.assets, stage: fake };
    var E = PD.element.get('counter').create({ kind: 'counter', to: 7 }, env);
    E.inStart = 5.5; a.equal(E.settled, true, 'stage.entryMode settled');
    fake.entryMode = 'live'; E.inStart = 5.2; a.equal(E.settled, false, 'stage.entryMode live');
  });
});

T.test('counter: draws from its glyph atlas, never rendering text per frame, and is visible', function (a) {
  return w3Assets({}).then(function (A) {
    var spec = { kind: 'counter', to: 1234.5, decimals: 1, suffix: '%', style: 'mega', y: 540, countTime: 2 };
    var s = w3Stage(A.id, [{ id: 'c', world: w3World({ ambient: 0 }), elements: [spec] }]);
    w3Boot(s); s.enter(0, 0, 'live');
    s.tick(0.1); s.draw();
    w3Near(a, w3Px(s, 240, 135), [0, 0, 0], 0, 'nothing before its start');
    var ft = w3Spy(CanvasRenderingContext2D.prototype, 'fillText');
    try {
      for (var i = 0; i < 90; i++) { s.tick(1 / 30); s.draw(); }
      a.equal(ft.calls.length, 0, 'no fillText call while counting and drawing 90 frames');
    } finally { ft.restore(); }
    s.finishAll(); s.draw();
    var d = s.ctx.getImageData(40, 100, 400, 70).data, lit = 0;
    for (var k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 150) lit++;
    a.ok(lit > 400, 'the number is on screen: ' + lit + ' bright pixels');
    var live = w3Stage(A.id, [{ id: 'c', world: w3World({ ambient: 0 }), elements: [spec] }]);
    w3Boot(live); live.enter(0, 0, 'live'); live.tick(0.5 + 0.2 + 1.0); live.draw();                // 1.0 s into a 2 s count
    a.ok(live.canvas.toDataURL() !== s.canvas.toDataURL(), 'mid-count differs from the final number');
  });
});

T.test('counter: alignment, exits, a style from the theme, and the atlas is shared between layers', function (a) {
  return w3Assets({}).then(function (A) {
    var s = w3Stage(A.id, [{ id: 'c', world: w3World({ ambient: 0 }) }]);
    var E = PD.element.get('counter');
    var c = E.measure({ kind: 'counter', to: 1234, x: 960, align: 'center' }, s.env), l = E.measure({ kind: 'counter', to: 1234, x: 400, align: 'left' }, s.env), r = E.measure({ kind: 'counter', to: 1234, x: 1500, align: 'right' }, s.env);
    a.near(c.x + c.w / 2, 960, 1e-6, 'centre'); a.near(l.x, 400, 1e-6, 'left edge'); a.near(r.x + r.w, 1500, 1e-6, 'right edge');
    var big = E.measure({ kind: 'counter', to: 1234, style: 'mega' }, s.env), small = E.measure({ kind: 'counter', to: 1234, style: 'hero' }, s.env);
    a.ok(big.w > small.w && big.h === 210 && small.h === 148, 'the style sets the size');
    ['fade', 'rise', 'sink', 'blur'].forEach(function (ex) {
      var st = w3Stage(A.id, [{ id: 'a', world: w3World({ ambient: 0 }), elements: [{ kind: 'counter', to: 9, exit: ex }] }, { id: 'b', world: w3World({ ambient: 0 }) }]);
      w3Settle(st, 0); st.enter(1, 0, 'live');
      for (var i = 0; i < 60; i++) st.tick(1 / 30);
      st.draw();
      w3Near(a, w3Px(st, 240, 135), [0, 0, 0], 0, ex + ' exit completes');
    });
    var L1 = w3Layer(s, { kind: 'counter', to: 5, style: 'hero' }), L2 = w3Layer(s, { kind: 'counter', to: 8, style: 'hero' });
    L1.ensureCache(0.25); L2.ensureCache(0.25);
    a.ok(L1.atlas === L2.atlas, 'the same style and scale share one atlas');
  });
});

/* ---------------------------------------------------------------- the gallery deck */
T.test('gallery: compiles under slate with no errors; every world key, style, element, reveal and asset is valid', function (a) {
  return PD.assets.ready('gallery').then(function (rep) {
    a.deepEqual(rep.failed, [], 'every asset decodes: ' + JSON.stringify(rep.failed));
    var c = PD.compile('gallery'), th = c.theme;
    a.equal(c.errors.length, 0); a.equal(c.id, 'gallery'); a.equal(th.id, 'slate');
    a.deepEqual(c.worlds, ['core', 'ambient', 'photo', 'spark']);
    var assets = PD.assets.get('gallery'), REV = PD.get('core/text').REVEALS, EX = PD.get('core/text').EXITS, bad = [];
    function chk(cond, msg) { if (!cond) bad.push(msg); }
    function world(w, where) { for (var k in w || {}) chk(PD.world.owner(k) != null && c.worlds.indexOf(PD.world.owner(k)) >= 0, where + ': world key "' + k + '" is not owned by an enabled world'); }
    function stuff(o, where) {
      (o.text || []).forEach(function (t, i) {
        chk(th.styles[t.style || 'title'], where + ': text style ' + t.style);
        chk(REV.indexOf(t.reveal || 'letters') >= 0, where + ': reveal ' + t.reveal);
        chk(!t.exit || EX.indexOf(t.exit) >= 0, where + ': exit ' + t.exit);
      });
      (o.elements || []).forEach(function (e) {
        chk(PD.element.has(e.kind), where + ': element kind ' + e.kind);
        if (e.kind === 'image') chk(assets[e.asset] && assets[e.asset].type === 'image' && /^data:image\//.test(assets[e.asset].src), where + ': image asset ' + e.asset);
        if (e.kind === 'image') chk(!e.reveal || ['fade', 'rise', 'focus', 'wipe', 'particles'].indexOf(e.reveal) >= 0, where + ': image reveal ' + e.reveal);
        if (e.kind === 'counter') chk(!e.reveal || e.reveal !== 'particles', where + ': counter has no particles reveal');
        chk(th.styles[e.style || (e.kind === 'counter' ? 'mega' : 'title')] || e.kind === 'image', where + ': element style ' + e.style);
      });
    }
    var ids = {};
    c.scenes.forEach(function (sc, i) {
      chk(!ids[sc.id], 'duplicate scene id ' + sc.id); ids[sc.id] = 1;
      world(sc.world, sc.id); world(sc.timing, sc.id + ' timing'); stuff(sc, sc.id);
      var pa = (sc.world || {}).photoAsset; if (pa) chk(assets[pa] && assets[pa].type === 'image' && /^data:image\//.test(assets[pa].src), sc.id + ': photoAsset ' + pa);
      (sc.steps || []).forEach(function (st, k) {
        world(st.world, sc.id + '.' + (k + 1)); world(st.timing, sc.id + '.' + (k + 1) + ' timing'); stuff(st, sc.id + '.' + (k + 1));
        var sp = (st.world || {}).photoAsset; if (sp) chk(assets[sp] && assets[sp].type === 'image', sc.id + '.' + (k + 1) + ': photoAsset ' + sp);
      });
      chk((sc.notes || '').trim().split(/\s+/).length >= 3, sc.id + ': speaker notes');
    });
    a.deepEqual(bad, [], 'problems: ' + bad.join('; '));
    if (typeof PD.validate === 'function') {
      var errs = PD.validate(c).filter(function (i) { return i.level === 'error'; });
      a.deepEqual(errs, [], 'PD.validate: 0 errors');
    }
  });
});

T.test('gallery: every state renders under slate (full size and thumbnail), text stays inside the frame, no particle overflow', function (a) {
  return PD.assets.ready('gallery').then(function () {
    var c = PD.compile('gallery'), cv = w3Canvas(480, 270);
    {
      var s = new PD.Stage(cv, { deck: c, thumb: true });
      s.resize(480, 270, 1);
      var n = 0;
      c.scenes.forEach(function (sc, si) {
        for (var st = 0; st <= s.stepsOf(si); st++) {
          s.still(si, st); n++;
          var d = s.ctx.getImageData(0, 0, 480, 270).data, sum = 0;
          for (var i = 0; i < d.length; i += 97) sum += d[i];
          a.ok(sum > 0, 'state ' + (si + 1) + '.' + st + ' is not black');
          var R = s.resolve(si, st), E = PD.element.get('text');
          R.texts.forEach(function (it) {
            var mm = E.measure(it.spec, s.env);
            a.ok(mm.x >= 0 && mm.x + mm.w <= 1920 && mm.y >= 0 && mm.y + mm.h <= 1080, 'text inside the frame: "' + it.spec.str + '" ' + JSON.stringify([mm.x | 0, mm.y | 0, mm.w | 0, mm.h | 0]));
          });
          var parts = 0;
          R.items.forEach(function (it) { var K = PD.element.get(it.kind); if (K && K.particleCount) parts += K.particleCount(it.spec, s.env); });
          a.ok(parts <= 8000, 'particle budget of state ' + (si + 1) + '.' + st + ': ' + parts);
        }
      });
      a.equal(n, 12, 'states: 8 scenes + 4 steps (' + n + ')');
    }
  });
}, { timeout: 60000 });

T.test('gallery: states play live, in order, with no pending work at the end of each (busy ends) on a full stage', function (a) {
  return PD.assets.ready('gallery').then(function () {
    var c = PD.compile('gallery'), cv = w3Canvas(480, 270), s = new PD.Stage(cv, { deck: c });
    s.resize(480, 270, 1); s.preload(c); s.prepare(c.scenes[0]); s.warmAll();
    a.equal(s.isWarm(), true, 'warm after warmAll');
    var first = true, maxField = 0;
    c.scenes.forEach(function (sc, si) {
      for (var st = 0; st <= s.stepsOf(si); st++) {
        s.enter(si, st, 'live');
        var t = 0;
        while (s.busy() && t < 40) { s.tick(1 / 30); t += 1 / 30; if (Math.round(t * 30) % 10 === 0) s.draw(); maxField = Math.max(maxField, s.field.list.length); }
        a.ok(t < 40, 'state ' + (si + 1) + '.' + st + ' settles (' + t.toFixed(1) + ' s)');
      }
    });
    a.ok(maxField > 1000 && maxField <= 9000, 'the logo particles peak at ' + maxField);
  });
}, { timeout: 120000 });
