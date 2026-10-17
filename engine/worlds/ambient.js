/* engine/worlds/ambient.js — world plugin 'ambient' (spec §4.5): the non-space backdrop. A graded base (an edge and a
 * centre colour), a few huge soft coloured lights drifting on slow Lissajous paths, two faint diagonal light beams,
 * an optional warm horizon glow and a field of out-of-focus bokeh discs. Everything is composited from small
 * pre-rendered sprites, so a frame is a few dozen drawImage calls and allocates nothing.
 *
 *   params   ambient        0..1   strength; below 1 the backdrop is mixed with black
 *            ambientPreset  name   CROSSFADE param: a key of theme.ambients { base: [edge, centre], blobs: [colors],
 *                                  bokeh: color } (an unknown name falls back to the theme's first preset, and a theme
 *                                  with no ambients to a built-in charcoal)
 *            ambientDrift   >= 0   speed of every slow motion (1 = normal, 0 = frozen; the clock integrates, so
 *                                  tweening it never jumps)
 *            bokeh          0..1   amount of bokeh (0 = none)
 *            bokehSize      > 0    scale of the discs
 *            horizonGlow    0..1   warm band along the bottom of the frame
 *
 * Draw: one screen pass, ambient.base at z 2 (below photo.image at z 4, above nothing: the stage clears to black).
 * A preset change is a crossfade: the stage keeps a stack f.xf.ambientPreset of layers { value, amount, … } (spec
 * §4.5). The base layers are mixed so their weights always add up to one (no dip to black halfway), and the lights are
 * scaled the same way, so brightness stays constant through a transition.
 *
 * Cost: the whole soft backdrop (the base gradient, the lights, the beams, the horizon glow) is composed in a small
 * opaque per-stage buffer of 512 x 288 and put on the frame with ONE upscaled draw. These are gaussian blurs of sprites
 * of 256 px and below, and the base texture is 512 x 288 itself, so nothing is lost; a full-frame blended pass is the
 * expensive thing on a 2880 x 1620 canvas, and a preset crossfade, which composes every shape once per layer, now costs
 * a few small draws instead of a few frame-sized ones. Only the bokeh discs, which have crisp edges, are drawn at full
 * size, on top.
 *
 * The buffer starts black each frame, so the backdrop is the bottom layer: nothing visible may lie under it (the stage
 * clears to black, and cosmos.background, the only pass below it, is never enabled together with ambient).
 *
 * Registration allocates nothing. Textures (shared by every stage of the page, keyed by their colours) are built by
 * preload, once per page and theme, or on first use; the small buffer is made on a stage's first frame. The per-stage
 * state is plain numbers in typed arrays and is seeded with U.rng (no global random). Cost budget: ambient <= 1.0 ms
 * per frame at 1920 x 1080, quality 1.5, measured with the GPU in the loop (tools/test/specs/wp3-perf.test.js). */
PD.module('worlds/ambient', ['core/util'], function (PD, util) {
  var DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, U = util.U;
  var MAXL = 8;                    // crossfade layers drawn at once (older ones are dropped)
  var NB = 4, NK = 44;             // lights, bokeh discs
  var LW = 512, LH = 288, LS = LW / DW;          // the small buffer the backdrop is composed in (the size of the base texture)

  /* ---------------------------------------------------------- built-in preset (a theme with no ambients) */
  var BUILTIN = { base: ['#121318', '#1c1e26'], blobs: ['#ffb35c', '#6f86b8', '#c9774a', '#3d4a6b'], bokeh: '#ffd9a0' };

  /* ---------------------------------------------------------- textures */
  var tex = {};                    // key → canvas, page-wide
  function rgbKey(c) { return (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0); }
  // a theme colour as [r, g, b]: a named theme colour, '#rgb' or '#rrggbb'; anything unreadable becomes mid grey, so a
  // bad value in a theme (or a Studio patch) can never make a gradient stop throw
  function rgb3(col, c) {
    var v = col(c);
    return [v[0] >= 0 && v[0] <= 255 ? v[0] : 128, v[1] >= 0 && v[1] <= 255 ? v[1] : 128, v[2] >= 0 && v[2] <= 255 ? v[2] : 128];
  }
  function rgbaOf(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; }

  // the graded backdrop: centre light falling to the edge colour, weighted toward the top, a little darker low down,
  // with ±1 level of seeded dither so the dark ramp does not band
  function baseTexture(c0, c1) {
    var key = 'b|' + rgbKey(c0) + '|' + rgbKey(c1);
    if (tex[key]) return tex[key];
    var N = LW, M = LH, c = U.canvas(N, M), x = c.getContext('2d');
    x.fillStyle = rgbaOf(c0, 1); x.fillRect(0, 0, N, M);
    var g = x.createRadialGradient(N * 0.5, M * 0.38, 0, N * 0.5, M * 0.38, N * 0.78);
    var mid = U.mix(c1, c0, 0.55);
    g.addColorStop(0, rgbaOf(c1, 1)); g.addColorStop(0.42, rgbaOf(mid, 1)); g.addColorStop(1, rgbaOf(c0, 1));
    x.fillStyle = g; x.fillRect(0, 0, N, M);
    var v = x.createLinearGradient(0, M * 0.5, 0, M);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.30)');
    x.fillStyle = v; x.fillRect(0, M * 0.5, N, M * 0.5);
    var img = x.getImageData(0, 0, N, M), d = img.data, r = U.rng(5150);
    for (var i = 0; i < d.length; i += 4) {
      var n = (r() + r() - 1) * 1.6;
      d[i] = U.clamp(d[i] + n, 0, 255); d[i + 1] = U.clamp(d[i + 1] + n, 0, 255); d[i + 2] = U.clamp(d[i + 2] + n, 0, 255);
    }
    x.putImageData(img, 0, 0);
    return (tex[key] = c);
  }

  // a round light with a gaussian falloff (the same colour at every stop, only the alpha changes)
  function blobSprite(col) {
    var key = 'o|' + rgbKey(col);
    if (tex[key]) return tex[key];
    var N = 256, h = N / 2, c = U.canvas(N, N), x = c.getContext('2d');
    var g = x.createRadialGradient(h, h, 0, h, h, h);
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, a = Math.exp(-3.6 * t * t) * (1 - U.smooth(0.8, 1, t));
      g.addColorStop(t, rgbaOf(col, a.toFixed(4)));
    }
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    return (tex[key] = c);
  }

  // an out-of-focus lamp: a flat disc with a slightly brighter rim and a soft edge
  function bokehSprite(col) {
    var key = 'k|' + rgbKey(col);
    if (tex[key]) return tex[key];
    var N = 128, h = N / 2, c = U.canvas(N, N), x = c.getContext('2d');
    var g = x.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, rgbaOf(col, 0.50)); g.addColorStop(0.6, rgbaOf(col, 0.58)); g.addColorStop(0.86, rgbaOf(col, 0.86));
    g.addColorStop(0.95, rgbaOf(col, 0.52)); g.addColorStop(1, rgbaOf(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    return (tex[key] = c);
  }

  // a long soft beam of light: gaussian across, faded out at both ends
  function beamSprite(col) {
    var key = 'm|' + rgbKey(col);
    if (tex[key]) return tex[key];
    var W = 1024, H = 128, c = U.canvas(W, H), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H);
    for (var i = 0; i <= 16; i++) {
      var t = i / 16, u = t * 2 - 1;
      g.addColorStop(t, rgbaOf(col, Math.exp(-4.2 * u * u).toFixed(4)));
    }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-in';
    var m = x.createLinearGradient(0, 0, W, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.28, 'rgba(0,0,0,1)'); m.addColorStop(0.72, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(0, 0, W, H);
    return (tex[key] = c);
  }

  // a preset's colours and the sprites they need (all from the page-wide cache); col is the theme's colour lookup
  function buildPreset(src, col) {
    col = col || util.colFor({});
    var base = (src && src.base && src.base.length ? src.base : BUILTIN.base);
    var blobs = src && src.blobs && src.blobs.length ? src.blobs : BUILTIN.blobs;
    var c0 = rgb3(col, base[0]), c1 = rgb3(col, base[1] == null ? base[0] : base[1]);
    var lights = blobs.map(function (b) { return rgb3(col, b); }), bokeh = rgb3(col, (src && src.bokeh) || blobs[0]);
    var warm = U.mix(bokeh, [255, 244, 226], 0.7);
    var p = {
      base: baseTexture(c0, c1), lights: [], bokeh: [bokehSprite(bokeh), bokehSprite(lights[0]), bokehSprite(lights[1 % lights.length]), bokehSprite(warm)],
      beam: beamSprite(U.mix(lights[0], [255, 240, 220], 0.35)), glow: blobSprite(lights[0]), core: blobSprite(U.mix(lights[0], [255, 236, 210], 0.55))
    };
    for (var k = 0; k < NB; k++) p.lights.push(blobSprite(lights[k % lights.length]));
    return p;
  }

  /* ---------------------------------------------------------- the lights, the beams and the bokeh (constants) */
  // each light: centre x, y (design units), radius, squash (ellipse), tilt (rad), drift amplitude x, y, periods (s),
  // phases, strength
  var LIGHTS = [
    [1560, 240, 900, 0.62, -0.30, 130, 80, 83, 61, 0.0, 1.3, 0.30],      // the key light, high on the right
    [300, 880, 1020, 0.70, 0.45, 170, 100, 97, 71, 2.1, 0.4, 0.30],      // the cool fill, low on the left
    [1340, 780, 680, 0.95, 0.00, 250, 130, 67, 89, 4.2, 5.0, 0.12],      // a glow that wanders low on the right
    [260, 180, 800, 0.55, -0.90, 120, 80, 109, 79, 1.0, 3.3, 0.20]       // deep colour, top left
  ];
  // each beam: centre x, y, length, width, tilt, sweep amplitude, period, phase, strength
  var BEAMS = [
    [1010, 520, 3300, 820, -0.36, 560, 71, 0.4, 0.020],
    [620, 640, 3000, 440, -0.30, 420, 53, 2.6, 0.016]
  ];
  var TAU = Math.PI * 2;

  /* ---------------------------------------------------------- the plugin */
  var plugin = PD.world('ambient', {
    params: { ambient: 1, ambientPreset: 'charcoal', ambientDrift: 1, bokeh: 0.5, bokehSize: 1, horizonGlow: 0 },
    crossfade: ['ambientPreset'],
    create: function (stage) {
      var r = U.rng(20261014), st = {
        t: 0, presets: {}, lo: null, lox: null, pr: new Array(MAXL), pw: new Float32Array(MAXL), al: new Float32Array(MAXL),
        // bokeh discs: x0, y0, radius, vx, vy, phase, twinkle rate, strength, colour index
        kx: new Float32Array(NK), ky: new Float32Array(NK), kr: new Float32Array(NK), kvx: new Float32Array(NK),
        kvy: new Float32Array(NK), kph: new Float32Array(NK), kw: new Float32Array(NK), ka: new Float32Array(NK), kc: new Uint8Array(NK),
        bx: new Float32Array(NK), by: new Float32Array(NK), bs: new Float32Array(NK), bq: new Float32Array(NK)
      };
      for (var i = 0; i < NK; i++) {
        var u = r(), depth = Math.pow(r(), 1.4);
        st.kr[i] = 22 + 128 * Math.pow(u, 2.1);
        st.kx[i] = r() * DW; st.ky[i] = r() * DH;
        st.kvx[i] = (r() - 0.35) * 7 * (0.4 + depth); st.kvy[i] = -(2 + 9 * depth);
        st.kph[i] = r() * TAU; st.kw[i] = 0.12 + r() * 0.35;
        st.ka[i] = (0.05 + 0.09 * r()) * (1.15 - 0.55 * u);
        var q = r(); st.kc[i] = q < 0.4 ? 0 : q < 0.58 ? 1 : q < 0.72 ? 2 : 3;
      }
      return st;
    },
    // textures once per page and theme: every preset of theme.ambients (or the built-in one)
    preload: function (theme, compiled) {
      var a = theme && theme.ambients, names = a ? Object.keys(a) : [], col = util.colFor((theme && theme.colors) || {});
      if (!names.length) buildPreset(null, col);
      for (var i = 0; i < names.length; i++) buildPreset(a[names[i]], col);
    },
    update: function (st, dt, W, stage) { st.t += dt * W.ambientDrift; },
    passes: [
      { z: 2, space: 'screen', name: 'base', draw: function (ctx, W, st, f) {
        var a = W.ambient;
        if (a <= 0.003) return;
        var stack = f.xf.ambientPreset, n = stack.length, i0 = n > MAXL ? n - MAXL : 0, m = n - i0, pw = st.pw, al = st.al, i, k;
        // the layers' weights add up to one; the base alphas make the layers mix to exactly those weights
        var sum = 0;
        for (i = 0; i < m; i++) { var w = stack[i0 + i].amount; pw[i] = w > 0 ? w : 0; sum += pw[i]; }
        if (sum < 1e-6) { for (i = 0; i < m; i++) pw[i] = 0; pw[m - 1] = 1; sum = 1; }
        for (i = 0; i < m; i++) pw[i] /= sum;
        var suffix = 0;
        for (i = m - 1; i >= 0; i--) { var p = pw[i] * a, den = 1 - suffix; al[i] = den > 1e-6 ? p / den : 0; suffix += p; }

        var theme = f.theme, presets = st.presets, pr = st.pr;
        for (i = 0; i < m; i++) {
          var nm = stack[i0 + i].value, ps = presets[nm];
          if (!ps) {
            var A = theme && theme.ambients, src = A && (A[nm] || A[Object.keys(A)[0]]);
            ps = presets[nm] = buildPreset(src || null, f.stage.col);
          }
          pr[i] = ps;
        }
        var t = st.t;

        // the backdrop is composed in the small opaque buffer: black, the base layers, then the lights, the beams and
        // the horizon glow added on top
        var lo = st.lo;
        if (!lo) { lo = st.lo = U.canvas(LW, LH); st.lox = lo.getContext('2d', { alpha: false }); }
        var lc = st.lox;
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
        lc.fillStyle = '#000'; lc.fillRect(0, 0, LW, LH);
        for (i = 0; i < m; i++) {
          if (al[i] <= 0.002) continue;
          lc.globalAlpha = al[i];
          lc.drawImage(pr[i].base, 0, 0, LW, LH);
        }
        lc.globalCompositeOperation = 'lighter';
        lc.setTransform(LS, 0, 0, LS, 0, 0);

        // the lights
        for (k = 0; k < NB; k++) {
          var L = LIGHTS[k];
          var lx = L[0] + L[5] * Math.sin(t * TAU / L[7] + L[9]), ly = L[1] + L[6] * Math.cos(t * TAU / L[8] + L[10]);
          var br = L[11] * (0.84 + 0.16 * Math.sin(t * 0.21 + k * 1.7));
          var cs = Math.cos(L[4]), sn = Math.sin(L[4]), rad = L[2];
          lc.save();
          lc.transform(cs, sn, -sn * L[3], cs * L[3], lx, ly);
          for (i = 0; i < m; i++) {
            var q = pw[i] * a * br;
            if (q <= 0.002) continue;
            lc.globalAlpha = q > 1 ? 1 : q;
            lc.drawImage(pr[i].lights[k], -rad, -rad, rad * 2, rad * 2);
          }
          if (k === 0) {                                  // the key light has a hot core
            for (i = 0; i < m; i++) {
              var qc = pw[i] * a * 0.16 * br / L[11];
              if (qc <= 0.002) continue;
              lc.globalAlpha = qc > 1 ? 1 : qc;
              lc.drawImage(pr[i].core, -300, -300, 600, 600);
            }
          }
          lc.restore();
        }

        // the beams
        for (k = 0; k < BEAMS.length; k++) {
          var B = BEAMS[k], bx = B[0] + B[5] * Math.sin(t * TAU / B[6] + B[7]), bs = Math.cos(B[4]), bn = Math.sin(B[4]);
          var bb = B[8] * (0.8 + 0.2 * Math.sin(t * 0.17 + k * 2.3));
          lc.save();
          lc.transform(bs, bn, -bn, bs, bx, B[1]);
          for (i = 0; i < m; i++) {
            var qb = pw[i] * a * bb;
            if (qb <= 0.002) continue;
            lc.globalAlpha = qb;
            lc.drawImage(pr[i].beam, -B[2] / 2, -B[3] / 2, B[2], B[3]);
          }
          lc.restore();
        }

        // the horizon glow
        var hg = W.horizonGlow;
        if (hg > 0.003) {
          for (i = 0; i < m; i++) {
            var qh = pw[i] * a * hg;
            if (qh <= 0.002) continue;
            lc.globalAlpha = qh * 0.34;
            lc.drawImage(pr[i].glow, CX - 1750, DH - 400, 3500, 800);
            lc.globalAlpha = qh * 0.26;
            lc.drawImage(pr[i].core, CX - 980, DH - 125, 1960, 250);
          }
        }

        // the backdrop goes on the frame in one draw
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.drawImage(lo, 0, 0, DW, DH);

        // the bokeh: crisp discs, at full size. Positions first, then one run of discs per layer
        var bk = W.bokeh;
        if (bk > 0.003) {
          var sz = W.bokehSize, ex = DW + 360, ey = DH + 360, bX = st.bx, bY = st.by, bS = st.bs, bQ = st.bq;
          for (k = 0; k < NK; k++) {
            var x = (st.kx[k] + st.kvx[k] * t + 180) % ex, y = (st.ky[k] + st.kvy[k] * t + 180) % ey;
            if (x < 0) x += ex; if (y < 0) y += ey;
            var rr = st.kr[k] * sz;
            bX[k] = x - 180 - rr; bY[k] = y - 180 - rr; bS[k] = rr * 2;
            bQ[k] = bk * st.ka[k] * (0.62 + 0.38 * Math.sin(t * st.kw[k] + st.kph[k]));
          }
          ctx.globalCompositeOperation = 'lighter';
          for (i = 0; i < m; i++) {
            var pa = pw[i] * a, bokeh = pr[i].bokeh;
            if (pa <= 0.002) continue;
            for (k = 0; k < NK; k++) {
              var qk = pa * bQ[k];
              if (qk <= 0.002) continue;
              ctx.globalAlpha = qk;
              ctx.drawImage(bokeh[st.kc[k]], bX[k], bY[k], bS[k], bS[k]);
            }
          }
        }
        ctx.restore();
      } }
    ]
  });

  return { plugin: plugin, buildPreset: buildPreset };
});
