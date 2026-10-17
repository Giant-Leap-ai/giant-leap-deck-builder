/* engine/core/glow.js — additive glow sprites (body verbatim from cinema/engine/fx.js (Glow)). */
PD.module('core/glow', ['core/util'], function (PD, util) {
  var U = util.U;
  /* cinema — lens & film effects: glow sprites, sun flare, vignette, grain, letterbox. */
  var Glow = (function () {
    // Additive glow sprites keyed by quantized color (4 bits / channel).
    // A coarse 3-bit set is pre-built at boot; fine sprites are created lazily
    // but at most a few per frame (a burst of new colors used to cost ~60ms).
    var cache = new Array(4096), coarse = new Array(512), SIZE = 64;
    var made = 0, frameBudget = 6;
    function build(R, G, B) {
      var c = U.canvas(SIZE, SIZE);
      var x = c.getContext('2d'), h = SIZE / 2;
      var g = x.createRadialGradient(h, h, 0, h, h, h);
      var cr = Math.round(R + (255 - R) * 0.75), cg = Math.round(G + (255 - G) * 0.75), cb = Math.round(B + (255 - B) * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.09, 'rgba(' + cr + ',' + cg + ',' + cb + ',1)');
      g.addColorStop(0.2, 'rgba(' + R + ',' + G + ',' + B + ',0.55)');
      g.addColorStop(0.45, 'rgba(' + R + ',' + G + ',' + B + ',0.14)');
      g.addColorStop(1, 'rgba(' + R + ',' + G + ',' + B + ',0)');
      x.fillStyle = g;
      x.fillRect(0, 0, SIZE, SIZE);
      return c;
    }
    function key(r, g, b) { return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); }
    function coarseFor(k) {
      var r = (k >> 8) & 15, g = (k >> 4) & 15, b = k & 15;
      var ck = ((r >> 1) << 6) | ((g >> 1) << 3) | (b >> 1);
      var c = coarse[ck];
      if (!c) { var v = function (q) { return Math.min(255, (q * 2 + 1) * 17); }; c = coarse[ck] = build(v(r >> 1), v(g >> 1), v(b >> 1)); }
      return c;
    }
    function sprite(k) {
      var c = cache[k];
      if (c) return c;
      if (made >= frameBudget) return coarseFor(k);
      made++;
      c = cache[k] = build(((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17);
      return c;
    }
    function prebuild() { for (var i = 0; i < 512; i++) coarseFor(((i >> 6) << 9) | (((i >> 3) & 7) << 5) | ((i & 7) << 1)); }
    return {
      key: key, sprite: sprite, prebuild: prebuild,
      frame: function () { made = 0; },
      get: function (rgb) { return sprite(key(rgb[0] | 0, rgb[1] | 0, rgb[2] | 0)); }
    };
  })();

  return { Glow: Glow };
});
