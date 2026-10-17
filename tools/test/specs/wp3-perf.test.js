/* tools/test/specs/wp3-perf.test.js — WP3 per-frame cost (spec §4.15, §9 WP3 acceptance #2): at 1920 x 1080, quality 1.5
 * (a 2880 x 1620 canvas) the ambient pass costs at most 1.0 ms (p95), the photo pass at most 1.5 ms, and the new
 * elements (image, counter) at most 1.5 ms per frame. Two methods, because they answer different questions:
 *  1. CPU: the same number the Player reports as workMs, the main-thread time of the work. For every frame, tick the
 *     stage, then time one call of the pass (or of the element's draw) with performance.now(); p95 over 240 frames
 *     after 40 warm-up frames. This is the spec's own metric (and what tools/regression/perf.js reports), but it only
 *     times the submission of the drawing commands, not the GPU work behind them.
 *  2. GPU in the loop: the cost of a whole frame with the GPU waited for (every frame is drawn into a 4 x 4 canvas
 *     that is then read back, which forces the big canvas to finish; the big canvas itself stays on the GPU), minus
 *     the same frame with the world switched off. Each round runs the two stages interleaved, frame for frame, so
 *     the machine's drift cancels, and the median difference is the cost (the p95 is reported). Up to five rounds,
 *     a quarter of a second apart, are run and the best one counts, so a busy GPU (another app, a screen
 *     recording) cannot fail the test, while a pass that really got slower fails every round. Scenes: the steady state, a preset or picture crossfade (every layer drawn twice) and the
 *     heaviest gallery state (dusk: large bokeh, strong horizon glow).
 * All helpers are prefixed w3p (the specs share one global scope). */

function w3pCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function w3pImg(w, h) {          // a busy 1920 x 1080 picture (gradient + noise-like stripes), as a data: URL asset
  var c = w3pCanvas(w, h), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a1c4a'); g.addColorStop(0.5, '#d8704a'); g.addColorStop(1, '#10223a');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (var i = 0; i < 400; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.02 + (i % 7) * 0.01) + ')'; x.fillRect((i * 97) % w, (i * 53) % h, 60 + (i % 13) * 20, 3 + (i % 5)); }
  var src = c.toDataURL('image/jpeg', 0.85);
  return { type: 'image', src: src, w: w, h: h, name: 'w3p', bytes: src.length };
}
function w3pP95(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; }
function w3pMedian(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }

function w3pRun(aid, scene, what) {
  var deck = { format: 2, id: 'w3p' + Math.random().toString(36).slice(2, 7), meta: { title: 'w3p', theme: 'slate', story: {} }, scenes: [scene] };
  var compiled = PD.compile(deck, { assetsDeckId: aid });
  var cv = w3pCanvas(10, 10), stage = new PD.Stage(cv, { deck: compiled });
  stage.resize(1920, 1080, 1.5);
  stage.preload(compiled); stage.prepare(compiled.scenes[0]); stage.warmAll();
  stage.enter(0, 0, 'instant');
  if (what.setup) what.setup(stage);
  var ctx = stage.ctx, f = stage.f;
  var run;
  if (what.pass) {
    var p = stage.passes.filter(function (q) { return q.world === what.world && q.name === what.pass; })[0];
    if (!p) throw new Error('no pass ' + what.world + '.' + what.pass);
    run = function () { ctx.setTransform(stage.S, 0, 0, stage.S, stage.ox, stage.oy); f.T = stage.T; f.S = stage.S; p.draw(ctx, stage.W, p.state, f); };
  } else {
    var L = stage.layers.filter(function (l) { return l.kind === what.kind; })[0];
    if (!L) throw new Error('no layer ' + what.kind);
    run = function () { ctx.setTransform(stage.S, 0, 0, stage.S, stage.ox, stage.oy); L.draw(ctx, stage.T, stage.S); };
  }
  var cost = [], i, t0;
  for (i = 0; i < 280; i++) {
    stage.tick(1 / 60);
    t0 = performance.now(); run(); var c = performance.now() - t0;
    if (i >= 40) cost.push(c);
    if (i % 4 === 3) stage.draw();                          // let the real frame go through now and then (flushes the queue)
  }
  return { p95: w3pP95(cost), median: w3pMedian(cost), max: Math.max.apply(null, cost), canvas: cv.width + 'x' + cv.height };
}

var w3pAssets = null;
function w3pReady() {
  if (w3pAssets) return w3pAssets;
  var id = 'wp3-perf-assets';
  PD.assets(id, { photo: w3pImg(1920, 1080), photo2: w3pImg(1600, 900) });
  return (w3pAssets = PD.assets.ready(id).then(function () { return id; }));
}

/* GPU in the loop: median cost of a frame over the same frame with every world off, interleaved (see the header).
 * Returns a promise of { cost, p95, base, rounds } for the best round; it stops at the first round within the budget. */
function w3pGpuCost(aid, world, xfade, budget) {
  var Q = { vignette: 0, grain: 0, letterbox: 0, exposure: 1 }, k;
  function full(o) { var w = { ambient: 0, photo: 0 }; for (k in Q) w[k] = Q[k]; for (k in o) w[k] = o[k]; return w; }
  var small = w3pCanvas(4, 4), sx = small.getContext('2d', { willReadFrequently: true });
  function flush(cv) { sx.drawImage(cv, 0, 0, 4, 4); sx.getImageData(0, 0, 1, 1); }
  function make(w, x) {
    var deck = { format: 2, id: 'w3pg' + Math.random().toString(36).slice(2, 8), meta: { title: 'w3p', theme: 'slate', story: {} }, scenes: [{ id: 's', world: w }] };
    var compiled = PD.compile(deck, { assetsDeckId: aid }), cv = w3pCanvas(10, 10), st = new PD.Stage(cv, { deck: compiled });
    document.body.appendChild(cv);
    st.resize(1920, 1080, 1.5);
    st.preload(compiled); st.prepare(compiled.scenes[0]); st.warmAll();
    st.setWorld(st.resolve(0, 0).world, null, 0, null, true);
    st.enter(0, 0, 'instant');
    if (x) {                                   // the next value is on its way for 400 s: every frame draws both layers
      var tm = {}; for (k in x) tm[k] = [400, 'linear'];
      st.setWorld(x, tm, 400, 'linear', false); st.tick(200);
    }
    return { st: st, cv: cv };
  }
  var rounds = [], best = null;
  function round() {
    var B = make(full({})), V = make(full(world), xfade), tb = [], tv = [], t0, i;
    for (i = 0; i < 280; i++) {
      t0 = performance.now(); B.st.tick(1 / 60); B.st.draw(); flush(B.cv); var cb = performance.now() - t0;
      t0 = performance.now(); V.st.tick(1 / 60); V.st.draw(); flush(V.cv); var cv2 = performance.now() - t0;
      if (i >= 40) { tb.push(cb); tv.push(cv2); }
    }
    B.cv.remove(); V.cv.remove();
    var m = { cost: w3pMedian(tv) - w3pMedian(tb), p95: w3pP95(tv) - w3pMedian(tb), base: w3pMedian(tb) };
    rounds.push(m.cost.toFixed(2));
    if (!best || m.cost < best.cost) best = m;
    if (best.cost <= budget || rounds.length >= 5) { best.rounds = rounds.join(', '); return best; }
    return new Promise(function (res) { setTimeout(res, 250); }).then(round);
  }
  return Promise.resolve().then(round);
}
function w3pGpuMsg(name, r) { return name + ': +' + r.cost.toFixed(2) + ' ms median over a ' + r.base.toFixed(2) + ' ms base frame (p95 +' + r.p95.toFixed(2) + '; rounds ' + r.rounds + ')'; }

T.test('perf: the ambient pass costs at most 1.0 ms (p95) at 1920 x 1080, quality 1.5', function (a) {
  return w3pReady().then(function (aid) {
    var r = w3pRun(aid, { id: 'a', world: { ambientPreset: 'charcoal', bokeh: 0.5, horizonGlow: 0.3 } }, { world: 'ambient', pass: 'base' });
    a.equal(r.canvas, '2880x1620');
    a.ok(r.p95 <= 1.0, 'ambient.base p95 ' + r.p95.toFixed(3) + ' ms (median ' + r.median.toFixed(3) + ', max ' + r.max.toFixed(2) + ')');
    // mid-crossfade (the next preset is on the way for 400 s, so every frame draws both layers of everything)
    var cross = w3pRun(aid, { id: 'a', world: { ambientPreset: 'charcoal', bokeh: 0.5, horizonGlow: 0.3 } },
      { world: 'ambient', pass: 'base', setup: function (st) { st.setWorld({ ambientPreset: 'ember' }, { ambientPreset: [400, 'linear'] }, 400, 'linear', false); st.tick(200); } });
    a.ok(cross.p95 <= 1.0, 'ambient.base mid-crossfade, p95 ' + cross.p95.toFixed(3) + ' ms');
  });
}, { timeout: 60000 });

T.test('perf: the photo pass costs at most 1.5 ms (p95) at 1920 x 1080, quality 1.5, with zoom, dim and tint', function (a) {
  return w3pReady().then(function (aid) {
    var r = w3pRun(aid, { id: 'p', world: { photo: 1, photoAsset: 'photo', photoZoom: 1.1, photoX: 0.4, photoY: 0.6, photoDim: 0.25, photoTint: '#ffb35c' } }, { world: 'photo', pass: 'image' });
    a.ok(r.p95 <= 1.5, 'photo.image p95 ' + r.p95.toFixed(3) + ' ms (median ' + r.median.toFixed(3) + ', max ' + r.max.toFixed(2) + ')');
  });
}, { timeout: 60000 });

T.test('perf: the image and counter elements cost at most 1.5 ms (p95) per frame at 1920 x 1080, quality 1.5', function (a) {
  return w3pReady().then(function (aid) {
    var img = w3pRun(aid, { id: 'i', world: {}, elements: [{ kind: 'image', asset: 'photo2', x: 960, y: 540, w: 1400, h: 760, radius: 18, glow: '#ffb35c', glowSize: 56, reveal: 'fade' }] }, { kind: 'image' });
    a.ok(img.p95 <= 1.5, 'image p95 ' + img.p95.toFixed(3) + ' ms (median ' + img.median.toFixed(3) + ')');
    var cnt = w3pRun(aid, { id: 'c', world: {}, elements: [{ kind: 'counter', to: 1234.5, decimals: 1, suffix: '%', style: 'mega', y: 450 }] }, { kind: 'counter' });
    a.ok(cnt.p95 <= 1.5, 'counter p95 ' + cnt.p95.toFixed(3) + ' ms (median ' + cnt.median.toFixed(3) + ')');
  });
}, { timeout: 60000 });

T.test('perf, GPU in the loop: ambient <= 1.0 ms and photo <= 1.5 ms over the same frame with the worlds off, steady and mid-crossfade', function (a) {
  var amb = { ambient: 1, bokeh: 0.5, horizonGlow: 0.3, ambientPreset: 'charcoal' };
  var big = { ambient: 1, bokeh: 0.85, bokehSize: 1.5, horizonGlow: 0.6, ambientPreset: 'dusk' };
  var pho = { photo: 1, photoAsset: 'photo', photoZoom: 1.1, photoX: 0.4, photoY: 0.6, photoDim: 0.25, photoTint: '#ffb35c' };
  var cases = [
    ['ambient steady', amb, null, 1.0], ['ambient mid-crossfade', amb, { ambientPreset: 'ember' }, 1.0],
    ['ambient, dusk with big bokeh, mid-crossfade', big, { ambientPreset: 'ember' }, 1.0],
    ['photo steady (zoom, dim, tint)', pho, null, 1.5], ['photo mid-crossfade', pho, { photoAsset: 'photo2' }, 1.5]
  ];
  return w3pReady().then(function (aid) {
    return cases.reduce(function (chain, c) {
      return chain.then(function () {
        return w3pGpuCost(aid, c[1], c[2], c[3]).then(function (r) { a.ok(r.cost <= c[3], w3pGpuMsg(c[0], r) + '; budget ' + c[3] + ' ms'); });
      });
    }, Promise.resolve());
  });
}, { timeout: 180000 });
