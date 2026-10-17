/* engine/core/util.js — math, noise and colour helpers; design space constants (body verbatim from cinema/engine/util.js). */
PD.module('core/util', [], function (PD) {
  /* cinema — math, noise, color helpers. Design space is 1920 x 1080 units. */
  var DW = 1920, DH = 1080, CX = 960, CY = 540;

  var U = (function () {
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

    // Seeded RNG (mulberry32)
    function rng(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function gauss(r) { return (r() + r() + r() + r() - 2) / 2; }

    // Value noise (3D) + fbm.
    var P = new Uint8Array(512);
    (function () {
      var r = rng(9001), p = [];
      for (var i = 0; i < 256; i++) p.push(i);
      for (i = 255; i > 0; i--) { var j = (r() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
      for (i = 0; i < 512; i++) P[i] = p[i & 255];
    })();
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function h3(x, y, z) { return P[P[P[x & 255] + (y & 255)] + (z & 255)] / 255; }
    function noise3(x, y, z) {
      var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      var xf = x - xi, yf = y - yi, zf = z - zi;
      var u = fade(xf), v = fade(yf), w = fade(zf);
      var a = lerp(lerp(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), lerp(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v);
      var b = lerp(lerp(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), lerp(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v);
      return lerp(a, b, w);
    }
    function fbm3(x, y, z, oct) {
      var s = 0, a = 0.5, f = 1, n = 0;
      for (var i = 0; i < (oct || 5); i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
      return s / n;
    }

    function hex(c) {
      if (Array.isArray(c)) return c;
      var h = String(c).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    }
    function rgba(c, a) { c = hex(c); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
    function mix(a, b, t) { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    // Sample a multi-stop gradient [c0, c1, ...] at t in 0..1
    function ramp(stops, t) {
      if (!Array.isArray(stops) || typeof stops[0] === 'number') return hex(stops);
      if (stops.length === 1) return hex(stops[0]);
      t = clamp(t, 0, 1) * (stops.length - 1);
      var i = Math.min(stops.length - 2, Math.floor(t));
      return mix(stops[i], stops[i + 1], t - i);
    }

    // Hilbert distance on a 1024 grid (for O(n log n) particle matching).
    function hilbert(x, y) {
      x = clamp(Math.round(x * 0.5 + 256), 0, 1023); y = clamp(Math.round(y * 0.5 + 240), 0, 1023);
      var d = 0, rx, ry, t, n = 1024;
      for (var s = 512; s > 0; s >>= 1) {
        rx = (x & s) > 0 ? 1 : 0; ry = (y & s) > 0 ? 1 : 0;
        d += s * s * ((3 * rx) ^ ry);
        if (ry === 0) { if (rx === 1) { x = n - 1 - x; y = n - 1 - y; } t = x; x = y; y = t; }
      }
      return d;
    }

    // Fast atan2 (max error ~0.005 rad)
    function atan2(y, x) {
      var ax = Math.abs(x), ay = Math.abs(y);
      var a = Math.min(ax, ay) / (Math.max(ax, ay) + 1e-12);
      var s = a * a;
      var r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
      if (ay > ax) r = 1.57079637 - r;
      if (x < 0) r = 3.14159274 - r;
      if (y < 0) r = -r;
      return r;
    }

    function canvas(w, h) {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
      return c;
    }

    return {
      clamp: clamp, lerp: lerp, smooth: smooth, rng: rng, gauss: gauss,
      noise3: noise3, fbm3: fbm3, hex: hex, rgba: rgba, mix: mix, ramp: ramp,
      hilbert: hilbert, atan2: atan2, canvas: canvas
    };
  })();

  /* Named colors for authoring (any '#hex' also works). */
  var COLORS = {
    white: '#ffffff', ice: '#d6ecff', silver: '#aab7cf', mist: '#7f8db0',
    cyan: '#5ef1ff', teal: '#2fd4c4', sky: '#53a8ff', blue: '#3d6bff', indigo: '#5b4bff',
    violet: '#8b5cf6', purple: '#b04dff', magenta: '#ff4fd8', rose: '#ff6b9a',
    red: '#ff4d5e', orange: '#ff8a3d', amber: '#ffb347', gold: '#ffd27a', sun: '#fff1c9',
    lime: '#b6ff6b', green: '#3ee08f'
  };
  function col(c) { return U.hex(COLORS[c] || c || '#ffffff'); }
  /* col() bound to a theme's named colours (spec §2 "colFor"); the base COLORS above fill any gap. */
  function colFor(colors) { return function (c) { return U.hex(colors[c] || COLORS[c] || c || '#ffffff'); }; }
  // A theme's colours live in the theme (theme.colors); util keeps the base table that colFor falls back on.
  return { DW: DW, DH: DH, CX: CX, CY: CY, U: U, COLORS: COLORS, col: col, colFor: colFor };
});
