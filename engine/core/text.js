/* engine/core/text.js — typography: the text element (TextLayer) (body verbatim from cinema/engine/type.js),
 * registered as element 'text' (spec §4.6); reveal and exit names that are not built in come from PD.reveal / PD.exitFx (§4.7). */
PD.module('core/text', ['core/util', 'core/ease'], function (PD, util, ease) {
  var CX = util.CX, CY = util.CY, U = util.U, colFor = util.colFor, Ease = ease.Ease;
  /* cinema — typography.
   * Each text layer is rendered once (gradient fill + soft glow, manual tracking)
   * into an offscreen canvas at the current screen resolution, then animated
   * cheaply every frame: letter-by-letter rises, focus pulls, light wipes, or a
   * hand-off from particles (particles assemble the word, crisp type fades in). */
  /* M3 (spec §4.6): the font family, the style table and the named colours are no longer module values.
   * A layer reads them from the stage's resolved theme: env.theme.fonts.display, .styles and .colors
   * (env = { theme, col, stage }; env.col is the theme-bound col()). The maths below is unchanged. */
  /* M4 (spec §4.6, §4.7): a reveal or exit name that is not built in goes to the registry, looked up once per layer:
   *   PD.reveal(name, { inDur, animSpan = 1, pose(layer, t, pIn, eIn) → { alpha, dy, scale }, paint?(layer, ctx, rs, pIn, eIn, alpha) })
   *     inDur is the default reveal time (spec.revealTime still wins); the layer animates for inDur × animSpan;
   *     pose gives the reveal's alpha and dy, and a scale that multiplies the push-in; while pIn < 1, paint (if given)
   *     draws the layer instead of the plain cache blit (ctx is already translated/scaled by the pose).
   *   PD.exitFx(name, { apply(layer, pOut, eOut, pose) }) mutates pose { alpha, dy, scale } in place.
   * A built-in name never consults the registry. An unknown, unregistered name behaves as before: a reveal shows the
   * text at once (at its start time), an exit fades. Built-in names only run the code below unchanged. */
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var REVEALS = { letters: 1, focus: 1, rise: 1, fade: 1, wipe: 1, particles: 1 };
  var EXITS = { fade: 1, rise: 1, sink: 1, blur: 1, particles: 1 };

  function TextLayer(spec, env) {
    this.theme = env.theme;
    this.col = env.col || colFor(env.theme.colors);
    var STYLES = this.theme.styles;
    var st = STYLES[spec.style || 'title'] || STYLES.title;
    var o = {};
    for (var k in st) o[k] = st[k];
    for (k in spec) if (spec[k] !== undefined) o[k] = spec[k];
    if (spec.color) o.fill = spec.color;
    this.o = o;
    this.spec = spec;
    this.id = spec.id || null;
    this.str = o.upper ? String(o.str).toUpperCase() : String(o.str);
    this.reveal = o.reveal || 'letters';
    this.exitKind = o.exit || (this.reveal === 'particles' ? 'particles' : 'fade');
    this.rv = has(REVEALS, this.reveal) ? null : (PD.reveal.get(this.reveal) || null);    // M4: registry reveal / exit
    this.xv = has(EXITS, this.exitKind) ? null : (PD.exitFx.get(this.exitKind) || null);
    this.inStart = Infinity; this.inDur = o.revealTime || (this.reveal === 'letters' ? 1.4 : this.reveal === 'particles' ? 0.9 : this.rv && this.rv.inDur ? this.rv.inDur : 1.1);
    this.outStart = Infinity; this.outDur = o.exitTime || 0.7;
    this.arriveAt = Infinity;   // particles reveal: when crisp text starts fading in
    this.particleAlpha = 1;
    this.cache = null; this.rs = 0;
    this.layout();
  }

  TextLayer.prototype.font = function () { return this.o.weight + ' ' + this.o.size + 'px ' + this.theme.fonts.display; };

  // Measure/wrap in design units (independent of screen scale).
  TextLayer.prototype.layout = function () {
    var o = this.o, c = TextLayer.measureCtx || (TextLayer.measureCtx = U.canvas(4, 4).getContext('2d'));
    c.font = this.font();
    var trackPx = o.track * o.size;
    var self = this;
    function width(s) {
      if (o.track < 0.03) return c.measureText(s).width;
      var w = 0;
      for (var i = 0; i < s.length; i++) w += c.measureText(s[i]).width + (i < s.length - 1 ? trackPx : 0);
      return w;
    }
    var maxW = o.maxWidth || 1700;
    var lines = [];
    String(this.str).split('\n').forEach(function (para) {
      var words = para.split(' '), line = '';
      for (var i = 0; i < words.length; i++) {
        var cand = line ? line + ' ' + words[i] : words[i];
        if (line && width(cand) > maxW) { lines.push(line); line = words[i]; } else line = cand;
      }
      lines.push(line);
    });
    var lh = o.size * (o.lineHeight || 1.12);
    this.lines = lines.map(function (s) {
      var w = width(s), letters = [], x = 0;
      for (var i = 0; i < s.length; i++) {
        var cw;
        if (o.track < 0.03) { var x2 = c.measureText(s.slice(0, i + 1)).width; cw = x2 - x; letters.push([x, cw, s[i]]); x = x2; }
        else { cw = c.measureText(s[i]).width; letters.push([x, cw, s[i]]); x += cw + trackPx; }
      }
      return { s: s, w: w, letters: letters };
    });
    this.w = Math.max.apply(null, this.lines.map(function (l) { return l.w; }));
    this.lh = lh;
    this.h = lh * (lines.length - 1) + o.size;
    this.pad = Math.ceil((o.glowSize || 0) * 1.6 + 12);
    // anchor: x by align, y = vertical center of the block
    var align = o.align || 'center';
    var ax = o.x == null ? CX : o.x;
    this.left = align === 'left' ? ax : align === 'right' ? ax - this.w : ax - this.w / 2;
    this.top = (o.y == null ? CY : o.y) - this.h / 2;
    this.nLetters = this.lines.reduce(function (n, l) { return n + l.letters.length; }, 0);
  };

  TextLayer.prototype.fillStyle = function (ctx, x0, y0, w, h) {
    var COLORS = this.theme.colors;
    var f = this.o.fill;
    if (Array.isArray(f)) {
      var g = this.o.fillDir === 'h' ? ctx.createLinearGradient(x0, 0, x0 + w, 0) : ctx.createLinearGradient(0, y0, 0, y0 + h);
      for (var i = 0; i < f.length; i++) g.addColorStop(i / (f.length - 1), COLORS[f[i]] || f[i]);
      return g;
    }
    return COLORS[f] || f;
  };

  TextLayer.prototype.paint = function (ctx, scale, glow) {
    var o = this.o;
    ctx.font = this.font();
    ctx.textBaseline = 'alphabetic';
    var pad = this.pad;
    var asc = o.size * 0.78;
    ctx.fillStyle = this.fillStyle(ctx, pad, pad, this.w, this.h);
    for (var li = 0; li < this.lines.length; li++) {
      var L = this.lines[li];
      var lx = (o.align === 'left' ? 0 : o.align === 'right' ? this.w - L.w : (this.w - L.w) / 2) + pad;
      var ly = pad + li * this.lh + asc;
      if (o.track < 0.03) ctx.fillText(L.s, lx, ly);
      else for (var i = 0; i < L.letters.length; i++) ctx.fillText(L.letters[i][2], lx + L.letters[i][0], ly);
    }
  };

  TextLayer.prototype.ensureCache = function (rs) {
    if (this.cache && this.rs === rs) return;
    this.rs = rs;
    var W = (this.w + this.pad * 2) * rs, H = (this.h + this.pad * 2) * rs;
    var c = U.canvas(W, H), x = c.getContext('2d');
    x.scale(rs, rs);
    var o = this.o;
    if (o.glow && o.glowAlpha > 0) {
      x.save();
      x.shadowColor = U.rgba(this.col(o.glow), o.glowAlpha);
      x.shadowBlur = o.glowSize * rs;
      x.globalAlpha = 0.9;
      this.paint(x, rs, true);
      x.restore();
    }
    this.paint(x, rs, false);
    this.cache = c;
  };

  /* Points for particle assembly, sampled from the real glyph shapes. */
  TextLayer.prototype.points = function (stride, size) {
    var col = this.col;
    var o = this.o, W = Math.ceil(this.w + this.pad * 2), H = Math.ceil(this.h + this.pad * 2);
    var c = U.canvas(W, H), x = c.getContext('2d');
    this.paint(x, 1, false);
    var d = x.getImageData(0, 0, W, H).data;
    var fill = Array.isArray(o.fill) ? o.fill.map(function (f) { return col(f); }) : [col(o.fill)];
    stride = stride || Math.max(4, Math.round(o.size / 22));
    var pts = [], r = U.rng(this.str.length * 31 + (o.size | 0));
    for (var y = 0; y < H; y += stride) {
      for (var xx = (y / stride) % 2 ? stride / 2 : 0; xx < W; xx += stride) {
        var sx = U.clamp(Math.round(xx + (r() - 0.5) * stride * 0.5), 0, W - 1), sy = U.clamp(Math.round(y + (r() - 0.5) * stride * 0.5), 0, H - 1);
        if (d[(sy * W + sx) * 4 + 3] < 140) continue;
        var tcol = o.fillDir === 'h' ? sx / W : (sy - this.pad) / Math.max(1, this.h);
        var cc = U.ramp(fill, tcol);
        pts.push({ x: this.left - this.pad + sx, y: this.top - this.pad + sy, r: cc[0], g: cc[1], b: cc[2], a: 1, s: size || Math.max(5, stride * 1.5), key: null });
      }
    }
    return pts;
  };

  // Re-use a prepared layer (keeps its cached bitmap + particle targets).
  TextLayer.prototype.reset = function () {
    this.inStart = Infinity; this.outStart = Infinity; this.arriveAt = Infinity; this.particleAlpha = 1;
  };
  TextLayer.prototype.startIn = function (t) { this.inStart = t; this.outStart = Infinity; };
  TextLayer.prototype.startOut = function (t) { if (this.outStart === Infinity) this.outStart = t; };
  TextLayer.prototype.finishIn = function () { if (this.inStart === Infinity) return; this.inStart = -1e6; this.arriveAt = Math.min(this.arriveAt, -1e6); };
  TextLayer.prototype.animating = function (t) {
    if (this.outStart !== Infinity) return t < this.outStart + this.outDur;
    if (this.inStart === Infinity) return true;
    if (this.reveal === 'particles') return t < this.arriveAt + 1.0;
    return t < this.inStart + this.inDur * (this.reveal === 'letters' ? 1.6 : this.rv && this.rv.animSpan ? this.rv.animSpan : 1);
  };
  TextLayer.prototype.gone = function (t) { return this.outStart !== Infinity && t >= this.outStart + this.outDur; };

  TextLayer.prototype.draw = function (ctx, t, rs) {
    if (t < this.inStart) { this.particleAlpha = 1; return; }
    this.ensureCache(rs);
    var o = this.o;
    var pIn = U.clamp((t - this.inStart) / this.inDur, 0, 1);
    var pOut = this.outStart === Infinity ? 0 : U.clamp((t - this.outStart) / this.outDur, 0, 1);
    var eIn = Ease.outCubic(pIn), eOut = Ease.inOutQuad(pOut);
    var alpha = 1, dy = 0, scale = 1;
    // slow cinematic push-in while on screen
    var life = Math.max(0, t - this.inStart);
    scale *= 1 + (o.push || 0) * Math.min(1, life / 12);

    if (this.reveal === 'particles') {
      var pa = U.clamp((t - this.arriveAt) / 1.0, 0, 1);
      alpha = Ease.inOutQuad(pa);
      this.particleAlpha = 1 - 0.82 * alpha;
    } else if (this.reveal === 'fade') alpha = eIn;
    else if (this.reveal === 'rise') { alpha = eIn; dy = (1 - eIn) * 46; }
    else if (this.reveal === 'focus') { alpha = eIn; scale *= 1 + (1 - eIn) * 0.12; }
    else if (this.rv) {
      var ps = this.rv.pose(this, t, pIn, eIn) || {};
      if (ps.alpha != null) alpha = ps.alpha;
      if (ps.dy != null) dy = ps.dy;
      if (ps.scale != null) scale *= ps.scale;
    }

    if (pOut > 0) {
      var k = this.exitKind;
      if (k === 'particles') { alpha *= 1 - U.clamp(pOut * 2.2, 0, 1); this.particleAlpha = 1; }
      else if (k === 'rise') { alpha *= 1 - eOut; dy -= eOut * 50; }
      else if (k === 'blur') { alpha *= 1 - eOut; scale *= 1 + eOut * 0.15; }
      else if (k === 'sink') { alpha *= 1 - eOut; dy += eOut * 40; }
      else if (this.xv) {
        var pose = { alpha: alpha, dy: dy, scale: scale };
        this.xv.apply(this, pOut, eOut, pose);
        alpha = pose.alpha; dy = pose.dy; scale = pose.scale;
      }
      else alpha *= 1 - eOut;
    }
    if (alpha <= 0.004) return;

    var c = this.cache, pad = this.pad;
    var ox = this.left - pad, oy = this.top - pad, W = this.w + pad * 2, H = this.h + pad * 2;
    var cx = this.left + this.w / 2, cy = this.top + this.h / 2;
    ctx.save();
    ctx.translate(cx, cy + dy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);

    if (this.reveal === 'letters' && pIn < 1) {
      // per-letter rise + fade, sliced from the cache
      var spread = 0.6, idx = 0, n = Math.max(1, this.nLetters);
      var raw = U.clamp((t - this.inStart) / (this.inDur * (1 + spread)), 0, 1) * (1 + spread);
      for (var li = 0; li < this.lines.length; li++) {
        var L = this.lines[li];
        var lx = (o.align === 'left' ? 0 : o.align === 'right' ? this.w - L.w : (this.w - L.w) / 2) + pad;
        var ly0 = li * this.lh;
        var lineH = (li === this.lines.length - 1 ? this.h - ly0 : this.lh) + pad * 2;
        for (var i = 0; i < L.letters.length; i++, idx++) {
          var lp = Ease.outCubic(U.clamp(raw - spread * idx / n, 0, 1));
          if (lp <= 0) continue;
          var Lt = L.letters[i];
          var x0 = lx + Lt[0] - (i === 0 ? pad : (o.track * o.size) / 2);
          var x1 = lx + Lt[0] + Lt[1] + (i === L.letters.length - 1 ? pad : (o.track * o.size) / 2);
          if (o.track < 0.03 && i < L.letters.length - 1) x1 = lx + L.letters[i + 1][0];
          ctx.globalAlpha = alpha * lp;
          var ldy = (1 - lp) * 28;
          ctx.drawImage(c, x0 * this.rs, ly0 * this.rs, (x1 - x0) * this.rs, lineH * this.rs,
            ox + x0, oy + ly0 + ldy, x1 - x0, lineH);
        }
      }
    } else if (this.reveal === 'wipe' && pIn < 1) {
      var ww = W * eIn;
      ctx.globalAlpha = alpha;
      ctx.drawImage(c, 0, 0, ww * this.rs, H * this.rs, ox, oy, ww, H);
      // light leading edge
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createLinearGradient(ox + ww - 60, 0, ox + ww + 4, 0);
      g.addColorStop(0, 'rgba(160,220,255,0)'); g.addColorStop(1, 'rgba(200,240,255,' + 0.7 * (1 - eIn) + ')');
      ctx.fillStyle = g; ctx.fillRect(ox + ww - 60, oy + pad * 0.6, 64, H - pad * 1.2);
    } else if (this.rv && this.rv.paint && pIn < 1) {
      this.rv.paint(this, ctx, this.rs, pIn, eIn, alpha);
    } else {
      ctx.globalAlpha = alpha;
      if (this.reveal === 'focus' && pIn < 1) {
        // fake defocus: a few offset ghost copies converging
        var spreadPx = (1 - eIn) * 14;
        ctx.globalAlpha = alpha * 0.35;
        ctx.drawImage(c, ox - spreadPx, oy, W, H); ctx.drawImage(c, ox + spreadPx, oy, W, H);
        ctx.drawImage(c, ox, oy - spreadPx * 0.6, W, H); ctx.drawImage(c, ox, oy + spreadPx * 0.6, W, H);
        ctx.globalAlpha = alpha * eIn;
      }
      ctx.drawImage(c, ox, oy, W, H);
    }
    ctx.restore();
  };
  /* M4: the element registry's 'text' kind (spec §4.6). env = { theme, assets, stage, col }.
   * measure and particleCount build a throw-away layer (no drawing; particleCount samples the glyphs only for a
   * 'particles' reveal). Registration allocates nothing, touches no DOM and draws no random number. */
  PD.element('text', {
    create: function (spec, env) { return new TextLayer(spec, env); },
    measure: function (spec, env) {
      var L = new TextLayer(spec, env);
      return { x: L.left, y: L.top, w: L.w, h: L.h, lines: L.lines.map(function (l) { return l.s; }) };
    },
    particleCount: function (spec, env) {
      var L = new TextLayer(spec, env);
      return L.reveal === 'particles' ? L.points(L.o.stride, L.o.particleSize).length : 0;
    }
  });

  // The font and the text styles are theme values (theme.fonts.display, theme.styles, spec §4.4); there are no FONT / STYLES globals.
  return { TextLayer: TextLayer, REVEALS: Object.keys(REVEALS), EXITS: Object.keys(EXITS) };
});
