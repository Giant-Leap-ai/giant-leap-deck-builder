/* engine/elements/counter.js — element 'counter' (spec §4.6): a number that counts up (or down) on screen.
 *   { kind: 'counter', from = 0, to, decimals = 0, prefix = '', suffix = '', sep = ',', style = 'mega', x, y, align,
 *     countTime = 1.8, ease = 'outCubic', at, exit?, exitTime?, id? }      (any text-style field, e.g. size or color, works too)
 * It reads the theme like text does (theme.styles[style], theme.fonts.display, theme.colors); (x, y) place it the way
 * text is placed (y is the vertical centre of the line, align 'center' | 'left' | 'right' picks which edge x is).
 * The number fades in over 0.4 s while it counts from `from` to `to` along `ease` (any Ease name) in `countTime`
 * seconds, then holds `to`; the value is rounded to `decimals` places and grouped with `sep` ('' = no grouping), so
 * to = 1234.5, decimals = 1, suffix = '%' reads 1,234.5%. The text is never rendered per frame: the glyphs the number
 * can use (digits, the separator, the point, the minus sign) and the prefix and suffix are painted once per style and
 * render scale into a glyph atlas (a sharp bitmap and, when the style has a glow, a half-resolution glow bitmap), and
 * a frame blits one cell per character, glows first so a neighbour's halo never covers a letter. Digits are tabular
 * (every digit advances like the widest one), so the number never shimmers while it counts; the whole group is laid
 * out again each frame from the digit count (it grows to the left as digits are added).
 *
 * finishAll and settled entries show `to`: finishAll through the stage's usual rule (the layer's start is moved into
 * the past), settled entries (Prev, Go-to, reload, and every edit in the Studio) because the layer recognises one:
 * the stage gives such a layer a start of exactly theme.timing.settledTextDelay from now. (If a stage exposes
 * stage.entryMode - 'live' | 'settled' | 'instant' - that is used instead.) A live scene that sets textDelay to the
 * same number as settledTextDelay would be mistaken for a settled one and show `to` at once; give it another delay.
 * `reveal: 'particles'` is not supported: the counter ignores it and fades in (PD.validate warns).
 * Registration allocates nothing; the atlas is built by ensureCache (the stage calls it from warm-up). */
PD.module('elements/counter', ['core/util', 'core/ease'], function (PD, util, ease) {
  var CX = util.CX, CY = util.CY, U = util.U, Ease = ease.Ease;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var EXITS = { fade: 1, rise: 1, sink: 1, blur: 1 };
  var SEP = 10, DOT = 11, MINUS = 12, PRE = 13, SUF = 14;     // glyph slots after the ten digits
  var CHARS = '0123456789';

  var measureCtx = null;
  function mctx() { return measureCtx || (measureCtx = U.canvas(4, 4).getContext('2d')); }

  /* ---------------------------------------------------------- number → glyph slots
   * fill(v) writes the slots of the formatted number into `out` (left to right) and returns how many. The same code
   * serves drawing and format(), so what is measured is what is drawn. No strings are made on the drawing path. */
  function fill(out, tmp, v, dec, p10, sep) {
    var n = Math.round(Math.abs(v) * p10), neg = v < 0 && n > 0, k = 0, d, g = 0;
    if (!(n <= 9e15)) n = 9e15;
    for (d = 0; d < dec; d++) { tmp[k++] = n % 10; n = Math.floor(n / 10); }
    if (dec > 0) tmp[k++] = DOT;
    do {
      if (sep && g === 3) { tmp[k++] = SEP; g = 0; }
      tmp[k++] = n % 10; n = Math.floor(n / 10); g++;
    } while (n > 0);
    if (neg) tmp[k++] = MINUS;
    for (d = 0; d < k; d++) out[d] = tmp[k - 1 - d];
    return k;
  }

  /* ---------------------------------------------------------- the glyph atlas (page-wide, a few kept) */
  var atlases = [];                // [{ key, atlas }], most recent last
  function colorOf(theme, c) { return (theme.colors && theme.colors[c]) || c; }

  function CounterLayer(spec, env) {
    this.kind = 'counter';
    this.spec = spec;
    this.env = env || {};
    this.theme = this.env.theme;
    this.col = this.env.col || util.colFor((this.theme && this.theme.colors) || {});
    var STYLES = this.theme.styles, st = STYLES[spec.style || 'mega'] || STYLES.mega || STYLES.title || { weight: 600, size: 100, track: 0.05, fill: '#ffffff' };
    var o = {};
    for (var k in st) o[k] = st[k];
    for (k in spec) if (spec[k] !== undefined) o[k] = spec[k];
    if (spec.color) o.fill = spec.color;
    o.size = +o.size > 0 ? +o.size : 100; o.track = +o.track || 0;
    o.from = +o.from || 0; o.to = +o.to || 0;
    o.decimals = Math.max(0, Math.min(6, o.decimals | 0));
    o.prefix = o.prefix == null ? '' : String(o.prefix); o.suffix = o.suffix == null ? '' : String(o.suffix);
    o.sep = o.sep == null ? ',' : String(o.sep);
    o.countTime = o.countTime == null ? 1.8 : Math.max(0, +o.countTime);
    o.x = o.x == null ? CX : o.x; o.y = o.y == null ? CY : o.y;
    this.o = o;
    this.id = spec.id || null;
    this.reveal = 'fade';
    this.exitKind = o.exit || 'fade';
    this.xv = has(EXITS, this.exitKind) ? null : (PD.exitFx.get(this.exitKind) || null);
    this.ease = Ease.get(o.ease || 'outCubic');
    this._in = Infinity; this.settled = false;
    this.inDur = Math.max(0.4, o.countTime);           // the stage's finishAll moves the start 1.7 x inDur into the past
    this.outStart = Infinity; this.outDur = o.exitTime || 0.7;
    this.arriveAt = Infinity; this.particleAlpha = 1;
    this.p10 = Math.pow(10, o.decimals);
    this.slots = new Int8Array(48); this.tmp = new Int8Array(48);        // the number's glyphs, left to right
    this.px = new Float32Array(52); this.pi = new Int8Array(52);         // pen position and glyph per drawn cell
    this.atlas = null; this.rs = 0;
    this.layout();
  }
  var P = CounterLayer.prototype;

  // the start time, with the settled-entry check (see the header): assigned by the stage on every enter
  Object.defineProperty(P, 'inStart', {
    enumerable: true, configurable: true,
    get: function () { return this._in; },
    set: function (v) {
      this._in = v;
      var s = this.env.stage;
      if (v === Infinity || !s || typeof v !== 'number') { this.settled = false; return; }
      if (s.entryMode) { this.settled = s.entryMode !== 'live'; return; }
      var d = v - s.T, TM = this.theme.timing || {};
      this.settled = Math.abs(d - TM.settledTextDelay) < 1e-6 && Math.abs(d - TM.textDelay) > 1e-6 && Math.abs(d - TM.stepTextDelay) > 1e-6;
    }
  });

  P.font = function () { return this.o.weight + ' ' + this.o.size + 'px ' + this.theme.fonts.display; };

  // metrics in design units: tabular digit width, separator, point, minus, prefix, suffix
  P.layout = function () {
    var o = this.o, c = mctx(), i;
    c.font = this.font();
    var upper = !!o.upper, dw = 0;
    for (i = 0; i < 10; i++) dw = Math.max(dw, c.measureText(CHARS[i]).width);
    var track = o.track * o.size, trackOn = o.track >= 0.03;
    function word(s) {
      if (!s) return 0;
      if (!trackOn) return c.measureText(s).width;
      var w = 0;
      for (var j = 0; j < s.length; j++) w += c.measureText(s[j]).width + (j < s.length - 1 ? track : 0);
      return w;
    }
    this.pre = upper ? o.prefix.toUpperCase() : o.prefix;
    this.suf = upper ? o.suffix.toUpperCase() : o.suffix;
    var w = this.gw = [dw, dw, dw, dw, dw, dw, dw, dw, dw, dw, o.sep ? c.measureText(o.sep).width : 0, c.measureText('.').width, c.measureText('-').width, word(this.pre), word(this.suf)];
    this.track = track;
    // the group's width for a slot list (digits, prefix, suffix) with the tracking between the cells
    this.h = o.size;
    this.top = o.y - this.h / 2;
    this.fmtTo = this.format(o.to);
    this.w = this.widthOf(o.to);
    var left = o.align === 'left' ? o.x : o.align === 'right' ? o.x - this.w : o.x - this.w / 2;
    this.left = left;
  };
  // the gap after a cell: the style's tracking, tightened to a third around the separator and the point so that
  // 2,847,300 reads as one number and not as three
  P.gap = function (a, b) { return (a === SEP || a === DOT || b === SEP || b === DOT) ? this.track * 0.35 : this.track; };
  // width of the whole line (prefix + number + suffix) for the value v
  P.widthOf = function (v) {
    var n = fill(this.slots, this.tmp, v, this.o.decimals, this.p10, this.o.sep), w = 0, gw = this.gw, prev = -1, first = true, g;
    var add = function (self, k) { w += gw[k] + (first ? 0 : self.gap(prev, k)); first = false; prev = k; };
    if (this.pre) add(this, PRE);
    for (var i = 0; i < n; i++) { g = this.slots[i]; add(this, g); }
    if (this.suf) add(this, SUF);
    return w;
  };
  // the number as text, e.g. 1,234.5% (prefix and suffix included)
  P.format = function (v) {
    var n = fill(this.slots, this.tmp, v, this.o.decimals, this.p10, this.o.sep), s = this.pre || '';
    for (var i = 0; i < n; i++) { var g = this.slots[i]; s += g < 10 ? g : g === SEP ? this.o.sep : g === DOT ? '.' : '-'; }
    return s + (this.suf || '');
  };

  /* ---------------------------------------------------------- the atlas */
  P.ensureCache = function (rs) {
    if (this.atlas && this.rs === rs) return;
    this.rs = rs;
    var o = this.o, glowOn = !!(o.glow && o.glowAlpha > 0);
    var theme = this.theme, f = o.fill;
    var fillKey = JSON.stringify(Array.isArray(f) ? f.map(function (c) { return colorOf(theme, c); }) : colorOf(theme, f));
    var key = [this.font(), fillKey, glowOn ? U.rgba(this.col(o.glow), 1) + '/' + o.glowSize + '/' + o.glowAlpha : '', o.track, rs, this.pre, this.suf,
      o.sep, this.gw.join(',')].join('|');
    for (var i = atlases.length - 1; i >= 0; i--) if (atlases[i].key === key) { this.atlas = atlases[i].atlas; return; }
    this.atlas = this.buildAtlas(rs, glowOn);
    atlases.push({ key: key, atlas: this.atlas });
    if (atlases.length > 8) atlases.shift();
  };

  P.buildAtlas = function (rs, glowOn) {
    var o = this.o, theme = this.theme, size = o.size, sp = 3, trackOn = o.track >= 0.03, track = this.track;
    var gp = glowOn ? Math.ceil((o.glowSize || 0) * 1.6 + 12) : 0;
    var cs = Math.min(rs, 2400 / (size * 1.3)), gs = cs * 0.5;
    var font = this.font(), self = this;
    var chH = size * 1.25, base = size * 0.95;                       // cell height and the baseline's place in it
    var out = { sp: sp, gp: gp, ch: chH, base: base, items: [] };
    var f = o.fill, fillStops = Array.isArray(f) ? f.map(function (s) { return colorOf(theme, s); }) : null, fillOne = fillStops ? null : colorOf(theme, f);
    function paint(x, str, isDigit, w, ox, oy) {                       // glyph(s) with the baseline at (.., oy)
      x.font = font; x.textBaseline = 'alphabetic';
      if (isDigit) { x.textAlign = 'center'; x.fillText(str, ox + w / 2, oy); return; }
      x.textAlign = 'left';
      if (!trackOn || str.length < 2) { x.fillText(str, ox, oy); return; }
      var xx = ox;
      for (var j = 0; j < str.length; j++) { x.fillText(str[j], xx, oy); xx += x.measureText(str[j]).width + track; }
    }
    function sharp(str, isDigit, w) {
      var W = w + sp * 2, c = U.canvas(W * cs, chH * cs + 2 * sp * cs), x = c.getContext('2d');
      x.scale(cs, cs);
      var top = sp + base - size * 0.78;                               // the text block, as TextLayer lays it out
      if (fillStops) {
        var g = x.createLinearGradient(0, top, 0, top + size);
        for (var i = 0; i < fillStops.length; i++) g.addColorStop(fillStops.length < 2 ? 0 : i / (fillStops.length - 1), fillStops[i]);
        x.fillStyle = g;
      } else x.fillStyle = fillOne;
      paint(x, str, isDigit, w, sp, sp + base);
      return c;
    }
    function glow(str, isDigit, w) {
      var W = w + gp * 2, H = chH + gp * 2, c = U.canvas(W * gs, H * gs), x = c.getContext('2d');
      var off = Math.ceil(W * gs) + 40;                                // draw the glyph off the bitmap: only its shadow lands
      x.scale(gs, gs);
      x.fillStyle = '#000';
      x.shadowColor = U.rgba(self.col(o.glow), o.glowAlpha);
      x.shadowBlur = o.glowSize * gs;
      x.shadowOffsetX = off;
      x.globalAlpha = 0.9;
      paint(x, str, isDigit, w, gp - off / gs, gp + base);
      return c;
    }
    for (var i = 0; i < 15; i++) {
      var w = this.gw[i], str = i < 10 ? CHARS[i] : i === SEP ? o.sep : i === DOT ? '.' : i === MINUS ? '-' : i === PRE ? this.pre : this.suf;
      if (!str || w <= 0) { out.items.push(null); continue; }
      out.items.push({ w: w, sharp: sharp(str, i < 10, w), glow: glowOn ? glow(str, i < 10, w) : null });
    }
    return out;
  };

  // value at time t
  P.valueAt = function (t) {
    var o = this.o, el = t - this._in;
    if (this.settled || o.countTime <= 0) return o.to;
    var p = U.clamp(el / o.countTime, 0, 1);
    return p >= 1 ? o.to : o.from + (o.to - o.from) * this.ease(p);
  };

  P.reset = function () { this.inStart = Infinity; this.outStart = Infinity; this.arriveAt = Infinity; this.particleAlpha = 1; };
  P.startIn = function (t) { this.inStart = t; this.outStart = Infinity; };
  P.startOut = function (t) { if (this.outStart === Infinity) this.outStart = t; };
  P.finishIn = function () { if (this._in === Infinity) return; this.inStart = -1e6; };
  P.animating = function (t) {
    if (this.outStart !== Infinity) return t < this.outStart + this.outDur;
    if (this._in === Infinity) return true;
    return t < this._in + (this.settled ? 0.4 : Math.max(0.4, this.o.countTime));
  };
  P.gone = function (t) { return this.outStart !== Infinity && t >= this.outStart + this.outDur; };

  P.draw = function (ctx, t, rs) {
    if (t < this._in) { this.particleAlpha = 1; return; }
    this.ensureCache(rs);
    var o = this.o, A = this.atlas, el = t - this._in;
    var pOut = this.outStart === Infinity ? 0 : U.clamp((t - this.outStart) / this.outDur, 0, 1);
    var eOut = Ease.inOutQuad(pOut);
    var alpha = Ease.outCubic(U.clamp(el / 0.4, 0, 1)), dy = 0, scale = 1 + (o.push || 0) * Math.min(1, Math.max(0, el) / 12);
    if (pOut > 0) {
      var k = this.exitKind;
      if (k === 'rise') { alpha *= 1 - eOut; dy -= eOut * 50; }
      else if (k === 'blur') { alpha *= 1 - eOut; scale *= 1 + eOut * 0.15; }
      else if (k === 'sink') { alpha *= 1 - eOut; dy += eOut * 40; }
      else if (this.xv) {
        var pose = { alpha: alpha, dy: dy, scale: scale };
        this.xv.apply(this, pOut, eOut, pose);
        alpha = pose.alpha; dy = pose.dy; scale = pose.scale;
      }
      else alpha *= 1 - eOut;
    }
    alpha *= o.opacity == null ? 1 : o.opacity;
    if (alpha <= 0.004) return;

    // the cells of this frame: [prefix] digits [suffix], with their pen positions
    var n = fill(this.slots, this.tmp, this.valueAt(t), o.decimals, this.p10, o.sep), gw = this.gw, pi = this.pi, px = this.px, c = 0, i;
    if (this.pre) pi[c++] = PRE;
    for (i = 0; i < n; i++) pi[c++] = this.slots[i];
    if (this.suf) pi[c++] = SUF;
    var W = 0;
    for (i = 0; i < c; i++) W += gw[pi[i]] + (i ? this.gap(pi[i - 1], pi[i]) : 0);
    var pen = o.align === 'left' ? o.x : o.align === 'right' ? o.x - W : o.x - W / 2;
    for (i = 0; i < c; i++) { if (i) pen += this.gap(pi[i - 1], pi[i]); px[i] = pen; pen += gw[pi[i]]; }

    var by = this.top + o.size * 0.78;                                   // baseline, as TextLayer places it
    ctx.save();
    ctx.translate(o.x, o.y + dy); ctx.scale(scale, scale); ctx.translate(-o.x, -o.y);
    ctx.globalAlpha = alpha;
    var items = A.items, sp = A.sp, gp = A.gp, it;
    if (gp) {
      for (i = 0; i < c; i++) {
        it = items[pi[i]];
        if (it && it.glow) ctx.drawImage(it.glow, px[i] - gp, by - A.base - gp, it.w + gp * 2, A.ch + gp * 2);
      }
    }
    for (i = 0; i < c; i++) {
      it = items[pi[i]];
      if (it) ctx.drawImage(it.sharp, px[i] - sp, by - A.base - sp, it.w + sp * 2, A.ch + sp * 2);
    }
    ctx.restore();
  };

  PD.element('counter', {
    create: function (spec, env) { return new CounterLayer(spec, env); },
    measure: function (spec, env) {
      var L = new CounterLayer(spec, env);
      return { x: L.left, y: L.top, w: L.w, h: L.h, lines: [L.fmtTo] };
    },
    particleCount: function (spec, env) { return 0; }
  });

  return { CounterLayer: CounterLayer, formatNumber: function (v, decimals, sep) {
    var slots = new Int8Array(48), tmp = new Int8Array(48), dec = Math.max(0, Math.min(6, decimals | 0)), s = '';
    var sp = sep == null ? ',' : String(sep), n = fill(slots, tmp, +v || 0, dec, Math.pow(10, dec), sp);
    for (var i = 0; i < n; i++) { var g = slots[i]; s += g < 10 ? g : g === SEP ? sp : g === DOT ? '.' : '-'; }
    return s;
  } };
});
