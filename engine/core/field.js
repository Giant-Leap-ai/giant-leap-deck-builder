/* engine/core/field.js — glowing particle field (body verbatim from cinema/engine/particles.js (Field)). */
PD.module('core/field', ['core/util', 'core/ease', 'core/glow'], function (PD, util, ease, glow) {
  var DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, U = util.U, Ease = ease.Ease, Glow = glow.Glow;
  /* --------------------------------------------------------------- the field */
  function Field() {
    this.list = [];
    this.now = 0;
    this.alpha = 1;
    this.MAX = 9000;
  }

  (function () {
    var F = Field.prototype;

    function make(x, y, rgb, a, s) {
      return {
        x: x, y: y, sx: x, sy: y, tx: x, ty: y, cx: x, cy: y,
        r0: rgb[0], g0: rgb[1], b0: rgb[2], r1: rgb[0], g1: rgb[1], b1: rgb[2],
        a0: a, a1: a, s0: s, s1: s, k: 1, t0: 0, dur: 1, ease: Ease.linear,
        ph: 0, tgt: false, key: null, group: null, dyn: null, di: 0, mode: 0,
        tw: Math.random() * 6.28, dead: false
      };
    }

    F.spawn = function (x, y, rgb, a, s) {
      if (this.list.length >= this.MAX) return null;
      var p = make(x, y, rgb, a == null ? 1 : a, s || 8);
      this.list.push(p);
      return p;
    };

    function cur(p, field) {
      // current interpolated color/alpha/size (for re-targeting mid-flight)
      var k = p.ph === 0 ? 1 : U.clamp(p.k, 0, 1);
      return {
        r: p.r0 + (p.r1 - p.r0) * k, g: p.g0 + (p.g1 - p.g0) * k, b: p.b0 + (p.b1 - p.b0) * k,
        a: p.a0 + (p.a1 - p.a0) * k, s: p.s0 + (p.s1 - p.s0) * k
      };
    }

    F.fly = function (p, tx, ty, rgb, a, s, delay, dur, ease, arc) {
      var c = cur(p, this);
      p.r0 = c.r; p.g0 = c.g; p.b0 = c.b; p.a0 = c.a; p.s0 = c.s;
      p.r1 = rgb[0]; p.g1 = rgb[1]; p.b1 = rgb[2]; p.a1 = a; p.s1 = s;
      p.sx = p.x; p.sy = p.y; p.tx = tx; p.ty = ty;
      p.t0 = this.now + delay; p.dur = Math.max(0.001, dur); p.ease = ease; p.k = 0;
      var dx = tx - p.x, dy = ty - p.y;
      var off = arc ? (Math.random() * 2 - 1) * arc : 0;
      p.cx = (p.x + tx) / 2 - dy * off; p.cy = (p.y + ty) / 2 + dx * off;
    };

    function staggerKey(mode, t) {
      switch (mode) {
        case 'leftToRight': return t.x + Math.random() * 30;
        case 'rightToLeft': return -t.x + Math.random() * 30;
        case 'topDown': return t.y + Math.random() * 20;
        case 'bottomUp': return -t.y + Math.random() * 20;
        case 'radial': var dx = t.x - (t.ox == null ? CX : t.ox), dy = t.y - (t.oy == null ? CY : t.oy); return Math.sqrt(dx * dx + dy * dy) + Math.random() * 40;
        case 'none': return 0;
        default: return Math.random();
      }
    }

    F.exit = function (p, style, o) {
      p.tgt = false; p.key = null; p.group = null; p.dyn = null;
      var c = cur(p), ang, d;
      var rgb = [c.r, c.g, c.b];
      p.ph = 2; p.mode = 0;
      switch (style) {
        case 'warp':
          ang = Math.atan2(p.y - CY, p.x - CX);
          d = 1400 + Math.random() * 600;
          this.fly(p, CX + Math.cos(ang) * d, CY + Math.sin(ang) * d * 0.7, rgb, c.a, c.s, Math.random() * 0.25, 0.9 + Math.random() * 0.6, Ease.inCubic, 0);
          p.mode = 1;
          break;
        case 'scatter':
          ang = Math.atan2(p.y - CY, p.x - CX) + (Math.random() - 0.5) * 1.2;
          d = 250 + Math.random() * 500;
          this.fly(p, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, rgb, 0, c.s * 0.5, Math.random() * 0.2, 1.0 + Math.random() * 0.6, Ease.outCubic, 0.2);
          break;
        case 'fade':
          this.fly(p, p.x, p.y, rgb, 0, c.s, Math.random() * 0.3, 0.4 + Math.random() * 0.4, Ease.linear, 0);
          break;
        case 'rise':
          this.fly(p, p.x + (Math.random() - 0.5) * 120, p.y - 120 - Math.random() * 260, [255, 190, 120], 0, c.s * 0.6, Math.random() * 0.5, 1.6 + Math.random() * 1.2, Ease.outQuad, 0.1);
          break;
        case 'implode':
          this.fly(p, CX + (Math.random() - 0.5) * 8, CY + (Math.random() - 0.5) * 8, [255, 255, 255], 0, 2, Math.random() * 0.4, 0.9, Ease.inCubic, 0.3);
          break;
        default: // drift: dissolve into the dark like dust
          ang = Math.random() * 6.283;
          d = 60 + Math.random() * 180;
          this.fly(p, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, rgb, 0, c.s * 0.6, Math.random() * 0.4, 1.6 + Math.random() * 1.4, Ease.outCubic, 0.2);
      }
    };

    function entry(field, mode, t, o) {
      var rgb = [t.r, t.g, t.b], ang, d;
      switch (mode) {
        case 'spark':
          var sx = o.sparkX == null ? CX : o.sparkX, sy = o.sparkY == null ? CY : o.sparkY;
          return { x: sx + U.gauss(Math.random) * 10, y: sy + U.gauss(Math.random) * 10, rgb: [255, 240, 210], a: 0, s: 4 };
        case 'center':
          return { x: CX + (Math.random() - 0.5) * 20, y: CY + (Math.random() - 0.5) * 20, rgb: rgb, a: 0, s: 3 };
        case 'stars':
          return { x: Math.random() * DW, y: Math.random() * DH, rgb: [200, 220, 255], a: 0, s: 3 };
        case 'below':
          return { x: t.x + (Math.random() - 0.5) * 200, y: DH + 40 + Math.random() * 200, rgb: rgb, a: 0, s: t.s };
        case 'edges':
          ang = Math.atan2(t.y - CY, t.x - CX) + (Math.random() - 0.5) * 0.4;
          d = 1200 + Math.random() * 300;
          return { x: CX + Math.cos(ang) * d, y: CY + Math.sin(ang) * d * 0.62, rgb: rgb, a: 0.6, s: t.s };
        default: // void: materialize out of nothing near the target
          ang = Math.random() * 6.283;
          d = 120 + Math.random() * 380;
          return { x: t.x + Math.cos(ang) * d, y: t.y + Math.sin(ang) * d * 0.6, rgb: rgb, a: 0, s: t.s * 0.3 };
      }
    }

    /* targets: [{x,y,r,g,b,a,s, key?, group?, dyn?, di?}] */
    F.morph = function (targets, o) {
      o = o || {};
      var ease = Ease.get(o.ease || 'easeInOutCubic');
      var dur = o.dur == null ? 1.6 : o.dur, spread = o.spread == null ? 0.9 : o.spread;
      var arc = o.arc == null ? 0.3 : o.arc;
      var list = this.list, i, p, t;
      var cand = [];
      for (i = 0; i < list.length; i++) { p = list[i]; if (!p.dead && p.ph !== 2) cand.push(p); }

      var moves = [], free = [];
      var byKey = new Map();
      if (o.keep !== false) for (i = 0; i < cand.length; i++) if (cand[i].key) byKey.set(cand[i].key, cand[i]);
      var used = new Set();
      for (i = 0; i < targets.length; i++) {
        t = targets[i];
        if (t.key && byKey.has(t.key)) {
          p = byKey.get(t.key);
          byKey.delete(t.key);
          used.add(p);
          moves.push({ p: p, t: t, kind: 1 });
        } else free.push(t);
      }
      var freeP = cand.filter(function (q) { return !used.has(q); });
      var pk = new Float64Array(freeP.length), tk = new Float64Array(free.length);
      var pi = [], tix = [];
      var keyFn = o.match === 'angle'
        ? function (x, y) { return Math.atan2(y - CY, x - CX); }
        : U.hilbert;
      for (i = 0; i < freeP.length; i++) { pk[i] = keyFn(freeP[i].x, freeP[i].y); pi.push(i); }
      for (i = 0; i < free.length; i++) { var q = free[i]; tk[i] = keyFn(q.dyn ? q.dyn.px[q.di] : q.x, q.dyn ? q.dyn.py[q.di] : q.y); tix.push(i); }
      pi.sort(function (a, b) { return pk[a] - pk[b]; });
      tix.sort(function (a, b) { return tk[a] - tk[b]; });
      var n = freeP.length, m = free.length;
      if (n >= m) {
        var taken = new Uint8Array(n);
        for (i = 0; i < m; i++) { var j = Math.floor((i + 0.5) * n / m); taken[j] = 1; moves.push({ p: freeP[pi[j]], t: free[tix[i]], kind: 0 }); }
        for (i = 0; i < n; i++) if (!taken[i]) this.exit(freeP[pi[i]], o.exit || 'drift', o);
      } else {
        var filled = new Uint8Array(m);
        for (i = 0; i < n; i++) { var tj = Math.floor((i + 0.5) * m / n); filled[tj] = 1; moves.push({ p: freeP[pi[i]], t: free[tix[tj]], kind: 0 }); }
        for (i = 0; i < m; i++) {
          if (filled[i]) continue;
          t = free[tix[i]];
          if (t.dyn) { t.x = t.dyn.px[t.di]; t.y = t.dyn.py[t.di]; }
          var e = entry(this, o.entry || 'void', t, o);
          var np = this.spawn(e.x, e.y, e.rgb, e.a, e.s);
          if (np) moves.push({ p: np, t: t, kind: 2 });
        }
      }
      // stagger normalized across movers
      var kmin = 1e9, kmax = -1e9, keys = new Float64Array(moves.length);
      for (i = 0; i < moves.length; i++) {
        t = moves[i].t;
        if (t.dyn) { t.x = t.dyn.px[t.di]; t.y = t.dyn.py[t.di]; }
        keys[i] = staggerKey(o.stagger || 'random', t);
        if (keys[i] < kmin) kmin = keys[i]; if (keys[i] > kmax) kmax = keys[i];
      }
      var range = kmax - kmin || 1;
      for (i = 0; i < moves.length; i++) {
        var mv = moves[i]; p = mv.p; t = mv.t;
        var delay = (keys[i] - kmin) / range * spread;
        var rgb = [t.r, t.g, t.b], a = t.a == null ? 1 : t.a, s = t.s || 8;
        if (mv.kind === 1) {
          // same cell: only restyle (no flight) unless it is still travelling
          if (p.ph === 0) this.fly(p, p.tx, p.ty, rgb, a, s, delay * 0.5, 0.8, Ease.inOutQuad, 0);
          else { p.r1 = rgb[0]; p.g1 = rgb[1]; p.b1 = rgb[2]; p.a1 = a; p.s1 = s; }
        } else {
          this.fly(p, t.x, t.y, rgb, a, s, delay, dur * (0.8 + Math.random() * 0.4), ease, arc);
        }
        p.ph = 1; p.tgt = true; p.mode = 0;
        p.key = t.key || null; p.group = t.group || null; p.dyn = t.dyn || null; p.di = t.di || 0;
      }
      return moves.length;
    };

    /* Blow everything outward; particles become loose and get re-used by the next morph. */
    F.explode = function (power) {
      power = power || 1;
      for (var i = 0; i < this.list.length; i++) {
        var p = this.list[i];
        if (p.dead || p.ph === 2) continue;
        var ang = Math.atan2(p.y - CY, p.x - CX) + (Math.random() - 0.5) * 0.6;
        var d = (120 + Math.random() * 520) * power;
        var c = cur(p);
        p.tgt = false; p.key = null; p.group = null; p.dyn = null;
        this.fly(p, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.7, [c.r, c.g, c.b], c.a, c.s, Math.random() * 0.06, 0.7 + Math.random() * 0.5, Ease.outCubic, 0.15);
        p.ph = 3;
      }
    };

    F.land = function (p) {
      p.x = p.tx; p.y = p.ty; p.k = 1;
      p.r0 = p.r1; p.g0 = p.g1; p.b0 = p.b1; p.a0 = p.a1; p.s0 = p.s1;
      if (p.ph === 2) { p.dead = true; return; }
      p.ph = 0;
    };

    F.finishAll = function () {
      for (var i = 0; i < this.list.length; i++) { var p = this.list[i]; if (p.ph !== 0 && !p.dead) this.land(p); }
      this.compact();
    };
    F.compact = function () {
      var L = this.list, w = 0;
      for (var i = 0; i < L.length; i++) if (!L[i].dead) L[w++] = L[i];
      L.length = w;
    };
    F.busy = function () {
      for (var i = 0; i < this.list.length; i++) if (this.list[i].ph === 1 || this.list[i].ph === 3) return true;
      return false;
    };
    F.clear = function () { this.list.length = 0; };

    F.update = function (now) {
      this.now = now;
      var L = this.list, dead = false;
      for (var i = 0; i < L.length; i++) {
        var p = L[i];
        if (p.dead) { dead = true; continue; }
        var ex, ey;
        if (p.dyn) { ex = p.dyn.px[p.di]; ey = p.dyn.py[p.di]; }
        if (p.ph === 0) {
          if (p.dyn) { p.x = ex; p.y = ey; p.tx = ex; p.ty = ey; }
          continue;
        }
        if (p.dyn) { p.tx = ex; p.ty = ey; }
        var u = (now - p.t0) / p.dur;
        if (u <= 0) { p.x = p.sx; p.y = p.sy; p.k = 0; continue; }
        if (u >= 1) { this.land(p); if (p.dead) dead = true; continue; }
        var e = p.ease(u), o = 1 - e;
        p.k = u;
        p.x = o * o * p.sx + 2 * o * e * p.cx + e * e * p.tx;
        p.y = o * o * p.sy + 2 * o * e * p.cy + e * e * p.ty;
      }
      if (dead) this.compact();
    };

    F.draw = function (ctx, t) {
      var L = this.list, A = this.alpha;
      if (A <= 0.003) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var warps = [];
      for (var i = 0; i < L.length; i++) {
        var p = L[i];
        var k = p.ph === 0 ? 1 : (p.k < 0 ? 0 : p.k > 1 ? 1 : p.k);
        var a = (p.a0 + (p.a1 - p.a0) * k) * A;
        if (p.group) a *= p.group.particleAlpha;
        if (p.ph === 0) a *= 0.82 + 0.18 * Math.sin(t * 2.3 + p.tw * 3);
        if (a < 0.01) continue;
        var r = p.r0 + (p.r1 - p.r0) * k, g = p.g0 + (p.g1 - p.g0) * k, b = p.b0 + (p.b1 - p.b0) * k;
        var s = p.s0 + (p.s1 - p.s0) * k;
        var x = p.x, y = p.y;
        if (p.ph === 0 && !p.dyn) { x += Math.sin(t * 0.9 + p.tw * 5) * 0.8; y += Math.cos(t * 0.7 + p.tw * 4) * 0.8; }
        if (p.mode === 1 && p.ph === 2) { warps.push(p, r, g, b, a); continue; }
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.drawImage(Glow.sprite(Glow.key(r | 0, g | 0, b | 0)), x - s, y - s, s * 2, s * 2);
      }
      // warp-exit particles render as light streaks
      if (warps.length) {
        ctx.lineCap = 'round';
        for (i = 0; i < warps.length; i += 5) {
          p = warps[i];
          var u2 = Math.max(0, (this.now - p.t0) / p.dur);
          var len = 6 + u2 * u2 * 260;
          var ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
          ctx.globalAlpha = warps[i + 4];
          ctx.strokeStyle = 'rgb(' + (warps[i + 1] | 0) + ',' + (warps[i + 2] | 0) + ',' + (warps[i + 3] | 0) + ')';
          ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
      }
      ctx.restore();
    };
  })();
  return { Field: Field };
});
