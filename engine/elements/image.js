/* engine/elements/image.js — element 'image' (spec §4.6): a picture from the deck's assets, placed and revealed like
 * text. Spec:
 *   { kind: 'image', asset, x = CX, y = CY, w?, h?, fit: 'contain' | 'cover' = 'contain', align = 'center', radius = 0,
 *     opacity = 1, glow?: color, reveal: 'fade' | 'rise' | 'focus' | 'wipe' | 'particles' = 'fade', revealTime?, exit?,
 *     exitTime?, at?, push?, id?,
 *     sample?: { mode: 'alpha' | 'luma' = 'alpha', threshold?, maxPoints = 3500, color?, size?, stride? } }
 *   (x, y) is the centre of the box ('left': x is the left edge, 'right': x is the right edge; y is always the centre).
 *   The box is w x h; with one of them the other follows the picture's aspect; with neither the picture keeps its
 *   pixel size, shrunk to fit 1500 x 800. 'contain' shows the whole picture inside the box, 'cover' fills the box and
 *   crops the centre. radius rounds the corners of what is shown. glow bakes a soft halo of that colour behind it.
 *
 * Reveals and exits are the text layer's: the same maths, the same registry fallback (PD.reveal / PD.exitFx), so a
 * registered reveal works on both. text.js keeps its maths inline in draw (it is verbatim from cinema, pinned by the
 * OGL golden gate), so draw below carries a copy of the same constants for fade, rise, focus and wipe and the exits;
 * the spec 'image: reveals and exits make the same pose as the text layer' (tools/test/specs/wp3-engine.test.js) draws
 * both layers through a recording context and fails if the two ever differ. (The wipe's leading-edge light is warm
 * here and cool in text.js.) 'particles' dissolves the picture into the glowing field: points() samples the
 * decoded picture (alpha: where it is opaque; luma: where it is bright, for logos on a solid background), picks the
 * stride itself so at most maxPoints (3500) particles are made, jitters the samples with U.rng(hash of the asset id)
 * (no global random), and the crisp picture fades in as the particles arrive. If the picture cannot be sampled
 * (the asset failed to load or is not a data: URL, so a canvas read would be refused) the reveal falls back to 'fade'
 * and one console warning is logged; nothing throws.
 *
 * The layer is cached once per render scale: ensureCache paints the picture (rounded, with its glow) into an offscreen
 * canvas, and a frame is one drawImage. Registration allocates nothing. The runtime asset comes from env.assets(id)
 * and is looked up again until it is usable. */
PD.module('elements/image', ['core/util', 'core/ease', 'core/glow'], function (PD, util, ease, glow) {
  var CX = util.CX, CY = util.CY, U = util.U, Ease = ease.Ease, Glow = glow.Glow;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var REVEALS = { fade: 1, rise: 1, focus: 1, wipe: 1, particles: 1 };
  var EXITS = { fade: 1, rise: 1, sink: 1, blur: 1, particles: 1 };
  var warned = {};
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = 1;
    try { console.warn(msg); } catch (e) { }
  }
  function hashStr(s) {            // FNV-1a, 32 bit
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t); x.lineTo(l + w - r, t); x.arcTo(l + w, t, l + w, t + r, r);
    x.lineTo(l + w, t + h - r); x.arcTo(l + w, t + h, l + w - r, t + h, r);
    x.lineTo(l + r, t + h); x.arcTo(l, t + h, l, t + h - r, r);
    x.lineTo(l, t + r); x.arcTo(l, t, l + r, t, r);
    x.closePath();
  }

  function ImageLayer(spec, env) {
    this.kind = 'image';
    this.spec = spec;
    this.env = env || {};
    this.theme = this.env.theme;
    this.col = this.env.col || util.colFor((this.theme && this.theme.colors) || {});
    var o = { x: CX, y: CY, fit: 'contain', align: 'center', radius: 0, opacity: 1, push: 0.012 };
    for (var k in spec) if (spec[k] !== undefined) o[k] = spec[k];
    this.o = o;
    this.id = spec.id || null;
    this.want = o.reveal || 'fade';
    this.exitKind = o.exit || (this.want === 'particles' ? 'particles' : 'fade');
    this.reveal = this.want;
    this.rv = has(REVEALS, this.want) ? null : (PD.reveal.get(this.want) || null);
    this.xv = has(EXITS, this.exitKind) ? null : (PD.exitFx.get(this.exitKind) || null);
    this.inStart = Infinity; this.inDur = o.revealTime || (this.want === 'particles' ? 0.9 : this.rv && this.rv.inDur ? this.rv.inDur : 1.1);
    this.outStart = Infinity; this.outDur = o.exitTime || 0.7;
    this.arriveAt = Infinity;
    this.particleAlpha = 1;
    var sm = o.sample || {};
    o.stride = o.stride != null ? o.stride : sm.stride;
    o.particleSize = o.particleSize != null ? o.particleSize : sm.size;
    this.cache = null; this.rs = 0; this.cs = 1; this.pad = 0; this.failed = false;
    this.resolve();
  }
  var P = ImageLayer.prototype;

  // (Re)read the runtime asset until it is usable, then lay the picture out. A particles reveal needs a decoded,
  // embedded picture: without one it is a fade (and becomes a particles reveal again if the picture turns up).
  P.resolve = function () {
    var ra = this.env.assets ? this.env.assets(this.o.asset) : null;
    if (ra && ra.type !== 'image') ra = null;
    this.ra = ra;
    this.ok = !!(ra && ra.ok && ra.img);
    this.img = this.ok ? ra.img : null;
    if (this.want === 'particles') {
      this.reveal = this.ok && !this.failed ? 'particles' : 'fade';
      if (!this.ok) warnOnce('image-fall:' + this.o.asset, 'pixeldeck: image "' + this.o.asset + '" cannot be shown as particles' +
        (ra ? ' (' + (ra.error || 'not decoded') + ')' : ' (the asset is missing)') + '; it fades in instead');
    }
    this.layout();
  };

  // the box, then the rectangle the picture really occupies (design units)
  P.layout = function () {
    var o = this.o, ra = this.ra, nw = (ra && ra.w) || (this.img && this.img.naturalWidth) || 0, nh = (ra && ra.h) || (this.img && this.img.naturalHeight) || 0;
    if (!(nw > 0 && nh > 0)) { nw = +o.w || 0; nh = +o.h || 0; }
    var bw, bh;
    if (o.w > 0 && o.h > 0) { bw = +o.w; bh = +o.h; }
    else if (o.w > 0) { bw = +o.w; bh = nw > 0 ? bw * nh / nw : bw; }
    else if (o.h > 0) { bh = +o.h; bw = nh > 0 ? bh * nw / nh : bh; }
    else { var k = nw > 0 ? Math.min(1, 1500 / nw, 800 / nh) : 0; bw = nw * k; bh = nh * k; }
    var bl = o.align === 'left' ? o.x : o.align === 'right' ? o.x - bw : o.x - bw / 2, bt = o.y - bh / 2;
    var dw = bw, dh = bh;
    if (o.fit !== 'cover' && nw > 0 && nh > 0) {
      var sc = Math.min(bw / nw, bh / nh);
      dw = nw * sc; dh = nh * sc;
    }
    this.nw = nw; this.nh = nh;
    this.dr = { x: bl + (bw - dw) / 2, y: bt + (bh - dh) / 2, w: dw, h: dh };
    this.w = dw; this.h = dh; this.left = this.dr.x; this.top = this.dr.y;
    this.pad = o.glow ? Math.ceil((o.glowSize || 44) * 1.6 + 12) : 2;
  };

  // the picture (rounded, cropped) painted with its top-left at (ox, oy) in the current transform
  P.paintImage = function (x, ox, oy) {
    var dr = this.dr, o = this.o;
    x.save();
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    if (o.radius > 0) { roundRect(x, ox, oy, dr.w, dr.h, Math.min(o.radius, dr.w / 2, dr.h / 2)); x.clip(); }
    if (o.fit === 'cover') {
      var sc = Math.max(dr.w / this.nw, dr.h / this.nh), sw = dr.w / sc, sh = dr.h / sc;
      x.drawImage(this.img, (this.nw - sw) / 2, (this.nh - sh) / 2, sw, sh, ox, oy, dr.w, dr.h);
    } else x.drawImage(this.img, ox, oy, dr.w, dr.h);
    x.restore();
  };

  P.ensureCache = function (rs) {
    if (!this.ok) {               // not usable (yet): look again now and then (the lookup compares the whole data: URL)
      if ((this.miss = (this.miss | 0) + 1) % 45 === 1) this.resolve();
      if (!this.ok) return;
    }
    if (this.cache && this.rs === rs) return;
    this.rs = rs;
    var dr = this.dr, pad = this.pad, big = Math.max(dr.w, dr.h) + pad * 2;
    var cs = big * rs > 3200 ? 3200 / big : rs;                // cap the bitmap (a full-bleed picture at quality 2)
    this.cs = cs;
    var c = U.canvas((dr.w + pad * 2) * cs, (dr.h + pad * 2) * cs), x = c.getContext('2d');
    x.scale(cs, cs);
    var o = this.o;
    if (o.glow) {
      // the halo: a shadow is clipped by the clip path, so a rounded picture casts its shadow from the rounded
      // rectangle itself, and an unrounded one (a logo with transparency) from the picture, following its alpha
      x.save();
      x.shadowColor = U.rgba(this.col(o.glow), 0.6);
      x.shadowBlur = (o.glowSize || 44) * cs;
      if (o.radius > 0) {
        roundRect(x, pad, pad, dr.w, dr.h, Math.min(o.radius, dr.w / 2, dr.h / 2));
        x.fillStyle = '#000'; x.fill();
      } else this.paintImage(x, pad, pad);
      x.restore();
    }
    this.paintImage(x, pad, pad);
    this.cache = c;
  };

  /* Points for particle assembly, sampled from the decoded picture. Targets are { x, y, r, g, b, a, s, key }. */
  P.points = function (stride, size) {
    if (!this.ok) this.resolve();
    if (!this.ok || this.failed) { this.reveal = 'fade'; return []; }
    try { return sample(this, stride, size); }
    catch (e) {
      this.failed = true; this.reveal = 'fade';
      warnOnce('image-sample:' + this.o.asset, 'pixeldeck: image "' + this.o.asset + '" cannot be sampled for particles (' + (e && e.message ? e.message : e) + '); it fades in instead');
      return [];
    }
  };

  var counts = typeof WeakMap === 'function' ? new WeakMap() : null;     // runtime asset → { key → particle count }

  function sample(L, stride, size) {
    var o = L.o, sm = o.sample || {}, dr = L.dr, col = L.col;
    var mode = sm.mode === 'luma' ? 'luma' : 'alpha';
    var maxPoints = sm.maxPoints != null ? Math.max(50, Math.min(9000, sm.maxPoints | 0)) : 3500;
    var thr = sm.threshold != null ? +sm.threshold : (mode === 'luma' ? 0.28 : 0.55);
    if (thr > 1) thr /= 255;
    // the picture at up to 1400 px, read back once
    var q = Math.min(1, 1400 / Math.max(dr.w, dr.h)), SW = Math.max(1, Math.ceil(dr.w * q)), SH = Math.max(1, Math.ceil(dr.h * q));
    var c = U.canvas(SW, SH), x = c.getContext('2d', { willReadFrequently: true });
    if (mode === 'luma') { x.fillStyle = '#000'; x.fillRect(0, 0, SW, SH); }
    x.scale(q, q);
    L.paintImage(x, 0, 0);
    var d = x.getImageData(0, 0, SW, SH).data;                     // throws SecurityError on a tainted canvas
    var fill = sm.color ? col(sm.color) : null, i;
    // how much of the picture counts: sample a coarse grid, then size the stride so about 94% of maxPoints fit
    var on = 0, tot = 0, step = Math.max(1, Math.round(Math.min(SW, SH) / 60));
    for (var yy = 0; yy < SH; yy += step) for (var xx = 0; xx < SW; xx += step, tot++) if (passes(d, (yy * SW + xx) * 4, mode, thr)) on++;
    var area = (on / Math.max(1, tot)) * dr.w * dr.h;
    var auto = Math.sqrt(Math.max(1, area) / (maxPoints * 0.94));
    stride = Math.max(3, auto, +stride || 0);               // never finer than 3 units, never more than maxPoints
    var r = U.rng(hashStr(String(o.asset))), pts = [], seen = {}, nSeen = 0;
    var half = stride / 2, jit = stride * 0.5;
    for (var y = 0, row = 0; y < dr.h; y += stride, row++) {
      for (var xp = row % 2 ? half : 0; xp < dr.w; xp += stride) {
        var sx = U.clamp(Math.round((xp + (r() - 0.5) * jit) * q), 0, SW - 1), sy = U.clamp(Math.round((y + (r() - 0.5) * jit) * q), 0, SH - 1);
        var oi = (sy * SW + sx) * 4;
        if (!passes(d, oi, mode, thr)) continue;
        var luma = (0.2126 * d[oi] + 0.7152 * d[oi + 1] + 0.0722 * d[oi + 2]) / 255;
        var cr = fill ? fill[0] : d[oi], cg = fill ? fill[1] : d[oi + 1], cb = fill ? fill[2] : d[oi + 2];
        var a = (mode === 'luma' ? Math.min(1, luma * 1.15) : 1) * (o.opacity == null ? 1 : o.opacity);
        pts.push({ x: dr.x + (sx / q), y: dr.y + (sy / q), r: cr, g: cg, b: cb, a: a, s: size || sm.size || Math.max(5, stride * 1.5), key: null });
      }
    }
    if (pts.length > maxPoints) {                                    // the estimate was off: thin evenly, never past the cap
      var thin = [], n = pts.length;
      for (i = 0; i < maxPoints; i++) thin.push(pts[Math.floor(i * n / maxPoints)]);
      pts = thin;
    }
    // glow sprites for the picture's palette are built now (Glow builds at most 6 new colours a frame), so colours
    // do not pop in; a palette that is too rich snaps to the coarse sprites, which exist from boot
    for (i = 0; i < pts.length; i++) { var k0 = Glow.key(pts[i].r | 0, pts[i].g | 0, pts[i].b | 0); if (!has(seen, k0)) { seen[k0] = 1; nSeen++; } }
    if (nSeen > 200) {
      for (i = 0; i < pts.length; i++) {
        pts[i].r = (((pts[i].r | 0) >> 5) * 2 + 1) * 17; pts[i].g = (((pts[i].g | 0) >> 5) * 2 + 1) * 17; pts[i].b = (((pts[i].b | 0) >> 5) * 2 + 1) * 17;
      }
    } else {
      for (var ks in seen) { Glow.frame(); Glow.sprite(+ks); }
    }
    return pts;
  }
  function passes(d, oi, mode, thr) {
    if (mode === 'luma') return (0.2126 * d[oi] + 0.7152 * d[oi + 1] + 0.0722 * d[oi + 2]) / 255 * (d[oi + 3] / 255) >= thr;
    return d[oi + 3] / 255 >= thr;
  }

  // Re-use a prepared layer (keeps its cached bitmap + particle targets).
  P.reset = function () { this.inStart = Infinity; this.outStart = Infinity; this.arriveAt = Infinity; this.particleAlpha = 1; };
  P.startIn = function (t) { this.inStart = t; this.outStart = Infinity; };
  P.startOut = function (t) { if (this.outStart === Infinity) this.outStart = t; };
  P.finishIn = function () { if (this.inStart === Infinity) return; this.inStart = -1e6; this.arriveAt = Math.min(this.arriveAt, -1e6); };
  P.animating = function (t) {
    if (this.outStart !== Infinity) return t < this.outStart + this.outDur;
    if (this.inStart === Infinity) return true;
    if (this.reveal === 'particles') return t < this.arriveAt + 1.0;
    return t < this.inStart + this.inDur * (this.rv && this.rv.animSpan ? this.rv.animSpan : 1);
  };
  P.gone = function (t) { return this.outStart !== Infinity && t >= this.outStart + this.outDur; };

  P.draw = function (ctx, t, rs) {
    if (t < this.inStart) { this.particleAlpha = 1; return; }
    this.ensureCache(rs);
    if (!this.cache) { this.particleAlpha = 1; return; }
    var o = this.o;
    var pIn = U.clamp((t - this.inStart) / this.inDur, 0, 1);
    var pOut = this.outStart === Infinity ? 0 : U.clamp((t - this.outStart) / this.outDur, 0, 1);
    var eIn = Ease.outCubic(pIn), eOut = Ease.inOutQuad(pOut);
    var alpha = 1, dy = 0, scale = 1;
    var life = Math.max(0, t - this.inStart);
    scale *= 1 + (o.push || 0) * Math.min(1, life / 12);          // slow cinematic push-in while on screen

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
    alpha *= o.opacity == null ? 1 : o.opacity;
    if (alpha <= 0.004) return;

    var c = this.cache, pad = this.pad, dr = this.dr;
    var ox = dr.x - pad, oy = dr.y - pad, W = dr.w + pad * 2, H = dr.h + pad * 2;
    var cx = dr.x + dr.w / 2, cy = dr.y + dr.h / 2;
    ctx.save();
    ctx.translate(cx, cy + dy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
    if (this.reveal === 'wipe' && pIn < 1) {
      var ww = W * eIn;
      ctx.globalAlpha = alpha;
      if (ww > 0.5) ctx.drawImage(c, 0, 0, ww * this.cs, H * this.cs, ox, oy, ww, H);
      // a soft light on the leading edge
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createLinearGradient(ox + ww - 60, 0, ox + ww + 4, 0);
      g.addColorStop(0, 'rgba(255,236,210,0)'); g.addColorStop(1, 'rgba(255,240,222,' + 0.6 * (1 - eIn) + ')');
      ctx.fillStyle = g; ctx.fillRect(ox + ww - 60, dr.y, 64, dr.h);
    } else if (this.rv && this.rv.paint && pIn < 1 && this.reveal !== 'particles') {
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

  PD.element('image', {
    create: function (spec, env) { return new ImageLayer(spec, env); },
    measure: function (spec, env) {
      var L = new ImageLayer(spec, env), dr = L.dr;
      return { x: dr.x, y: dr.y, w: dr.w, h: dr.h, lines: [] };
    },
    // the exact count when the picture is decoded (cached per asset and sampling options), else 0: an image that
    // cannot be sampled fades in and makes no particles
    particleCount: function (spec, env) {
      var L = new ImageLayer(spec, env);
      if (L.reveal !== 'particles') return 0;
      var sm = L.o.sample || {}, key = [sm.mode, sm.threshold, sm.maxPoints, sm.color, L.o.stride, L.o.w, L.o.h, L.o.fit, L.o.radius].join('|');
      var memo = counts && L.ra ? (counts.get(L.ra) || (counts.set(L.ra, {}), counts.get(L.ra))) : null;
      if (memo && has(memo, key)) return memo[key];
      var n = L.points(L.o.stride, L.o.particleSize).length;
      if (memo && L.reveal === 'particles') memo[key] = n;
      return n;
    }
  });

  return { ImageLayer: ImageLayer };
});
