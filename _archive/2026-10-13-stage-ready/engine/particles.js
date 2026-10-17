/* pixeldeck — particle field, morph solver, starfield.
 *
 * Every visible "pixel" of a slide's text/shapes/images is a particle living on
 * the 320x180 logical grid. Particles at rest sit on integer cells; in flight
 * they follow an eased quadratic bezier (the arc) and lerp color along a
 * precomputed palette ramp. The morph solver pairs existing particles with the
 * next slide's target cells in O(n log n):
 *   1. keep-pass   — a particle already at (or flying to) a target cell keeps it
 *                    (only its color may change). Makes steps/highlights stable.
 *   2. curve-pass  — remaining particles and targets are both sorted along a
 *                    Hilbert curve (or by angle) and paired by evenly spread index.
 *   3. surplus particles exit (scatter | fall | fade | swirl);
 *      missing particles spawn from an entry source (edges | center | stars | ...).
 */
var GRID_W = 320, GRID_H = 180;

var Hilbert = {
  // Distance along a 512x512 Hilbert curve. Off-screen coords are clamped.
  key: function (x, y) {
    x = Math.max(0, Math.min(511, Math.round(x) + 96));
    y = Math.max(0, Math.min(511, Math.round(y) + 166));
    var d = 0, rx, ry, t, n = 512;
    for (var s = 256; s > 0; s >>= 1) {
      rx = (x & s) > 0 ? 1 : 0;
      ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
        t = x; x = y; y = t;
      }
    }
    return d;
  }
};

/* ---------------------------------------------------------------- Starfield */
var Starfield = (function () {
  var stars = [];
  var LEVELS = ['black', 'slate', 'gray', 'silver', 'white'];
  var seed = 1337;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  for (var i = 0; i < 150; i++) {
    var b = rnd();
    stars.push({
      x: Math.floor(rnd() * GRID_W), y: Math.floor(rnd() * GRID_H),
      base: b < 0.55 ? 1 : b < 0.85 ? 2 : b < 0.97 ? 3 : 4,
      ph: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 2.2, big: b > 0.985
    });
  }
  var lv = LEVELS.map(function (n) { return PALETTE.hex[PALETTE.index(n)]; });

  function level(s, now, twinkle) {
    if (!twinkle) return s.base;
    var l = s.base + Math.round(Math.sin(now * s.sp + s.ph) * 1.25 - 0.25);
    return l < 0 ? 0 : l > 4 ? 4 : l;
  }
  return {
    stars: stars,
    // ctx is already transformed so 1 unit = 1 cell? No: we draw via R helpers.
    draw: function (R, now, twinkle, alpha) {
      var ctx = R.ctx;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], l = level(s, now, twinkle);
        if (l <= 0) continue;
        ctx.fillStyle = lv[l];
        R.cell(s.x, s.y);
        if (s.big && l >= 3) {
          ctx.fillStyle = lv[l - 2];
          R.cell(s.x - 1, s.y); R.cell(s.x + 1, s.y); R.cell(s.x, s.y - 1); R.cell(s.x, s.y + 1);
        }
      }
    },
    // for thumbnails: draw directly at 1px per cell
    drawThumb: function (ctx) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.fillStyle = lv[s.base];
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }
  };
})();

/* -------------------------------------------------------------------- Field */
var Field = (function () {
  var list = [];
  var now = 0;
  var MAX = 14000;
  var BG = PALETTE.BG;
  var S1 = PALETTE.STEPS1, STEPS = PALETTE.STEPS;
  var grid = new Int32Array(GRID_W * GRID_H);   // keep-pass lookup
  var gridStamp = new Int32Array(GRID_W * GRID_H);
  var stamp = 1;
  var buckets = [], bucketKeys = [];
  for (var b = 0; b < 16 * 16 * S1; b++) buckets.push([]);

  var F = {
    list: list,
    breathe: false,
    breatheRate: 0.04,   // fraction of resting particles nudged per second
    bg: BG,
    get now() { return now; },
    count: function () { return list.length; }
  };

  function make(x, y, c) {
    return {
      x: x, y: y, sx: x, sy: y, tx: x, ty: y, cx: x, cy: y,
      c0: c, c1: c, k: 1, t0: 0, dur: 0, ease: null,
      ph: 0,        // 0 rest | 1 flying to target | 2 exiting (dies) | 3 loose flight
      tgt: false,   // has a target cell (part of the slide content)
      owner: null,  // sprite actor this particle is assembling
      swirl: 0, sa: 0, sr: 0,
      jx: 0, jy: 0, jt: 0, dead: false
    };
  }
  F.spawn = function (x, y, c) {
    if (list.length >= MAX) return null;
    var p = make(x, y, c);
    list.push(p);
    return p;
  };

  function colorNow(p) {
    if (p.ph === 0) return p.c1;
    return p.k > 0.5 ? p.c1 : p.c0;
  }

  // Start a flight from the particle's current position.
  function fly(p, tx, ty, c1, delay, dur, ease, arc) {
    p.c0 = colorNow(p);
    p.sx = p.x; p.sy = p.y;
    p.tx = tx; p.ty = ty; p.c1 = c1;
    p.t0 = now + delay; p.dur = Math.max(0.001, dur); p.ease = ease; p.k = 0;
    p.swirl = 0;
    var dx = tx - p.x, dy = ty - p.y;
    var off = arc ? (Math.random() * 2 - 1) * arc : 0;
    p.cx = (p.x + tx) / 2 - dy * off;
    p.cy = (p.y + ty) / 2 + dx * off;
  }

  /* ------------------------------------------------------------- stagger */
  function staggerKey(mode, t) {
    switch (mode) {
      case 'leftToRight': return t.x + Math.random() * 3;
      case 'rightToLeft': return -t.x + Math.random() * 3;
      case 'topDown': return t.y + Math.random() * 2;
      case 'bottomUp': return ((t.base == null ? GRID_H : t.base) - t.y) + Math.random() * 0.5;
      case 'radial': var dx = t.x - 160, dy = (t.y - 90) * 1.6; return Math.sqrt(dx * dx + dy * dy) + Math.random() * 6;
      case 'byLetter': return (t.letter == null ? t.x / 6 : t.letter) + Math.random() * 0.35;
      case 'byWord': return (t.word == null ? t.x / 30 : t.word) + Math.random() * 0.35;
      case 'none': return 0;
      default: return Math.random();
    }
  }

  /* --------------------------------------------------------------- exits */
  function exitParticle(p, style, o) {
    p.tgt = false;
    var ang, d;
    switch (style) {
      case 'fall':
        p.ph = 2;
        fly(p, p.x + (Math.random() - 0.5) * 24, GRID_H + 8 + Math.random() * 40, colorNow(p),
          Math.random() * 0.5, 0.8 + Math.random() * 0.6, Ease.inQuad, 0.05);
        break;
      case 'fade':
        p.ph = 2;
        fly(p, p.x, p.y, F.bg, Math.random() * 0.4, 0.25 + Math.random() * 0.35, Ease.linear, 0);
        break;
      case 'swirl':
        p.ph = 2;
        fly(p, p.x, p.y, colorNow(p), Math.random() * 0.35, 1.0 + Math.random() * 0.5, Ease.inCubic, 0);
        p.swirl = 1;
        p.sa = Math.atan2(p.y - 90, p.x - 160);
        p.sr = Math.sqrt((p.x - 160) * (p.x - 160) + (p.y - 90) * (p.y - 90));
        break;
      case 'cut':
        p.dead = true;
        break;
      default: // scatter
        p.ph = 2;
        ang = Math.atan2(p.y - 90, p.x - 160) + (Math.random() - 0.5) * 0.9;
        d = 230 + Math.random() * 90;
        fly(p, 160 + Math.cos(ang) * d, 90 + Math.sin(ang) * d, colorNow(p),
          Math.random() * 0.3, 0.7 + Math.random() * 0.5, Ease.inQuad, 0.15);
    }
  }

  /* -------------------------------------------------------------- entries */
  // Returns {x, y, c} start point for a new particle heading to target t.
  function entryPoint(entry, t, o) {
    var dx, dy, len;
    if (entry && entry.indexOf('fromSprite') === 0) {
      var cells = o.spriteCells && o.spriteCells[entry.split(':')[1]];
      if (cells && cells.length) {
        var cc = cells[(Math.random() * cells.length) | 0];
        return { x: cc.x, y: cc.y, c: cc.c };
      }
      entry = 'center';
    }
    switch (entry) {
      case 'center':
        return { x: 160 + (Math.random() - 0.5) * 6, y: 90 + (Math.random() - 0.5) * 4, c: t.c };
      case 'stars':
        var st = Starfield.stars, best = null, bd = 1e9;
        for (var i = 0; i < 4; i++) {
          var s = st[(Math.random() * st.length) | 0];
          var dd = (s.x - t.x) * (s.x - t.x) + (s.y - t.y) * (s.y - t.y);
          if (dd < bd) { bd = dd; best = s; }
        }
        return { x: best.x, y: best.y, c: PALETTE.index('white') };
      case 'bottom': return { x: t.x + (Math.random() - 0.5) * 30, y: GRID_H + 4 + Math.random() * 30, c: t.c };
      case 'top': return { x: t.x + (Math.random() - 0.5) * 30, y: -4 - Math.random() * 30, c: t.c };
      case 'left': return { x: -4 - Math.random() * 40, y: t.y + (Math.random() - 0.5) * 20, c: t.c };
      case 'right': return { x: GRID_W + 4 + Math.random() * 40, y: t.y + (Math.random() - 0.5) * 20, c: t.c };
      case 'base': return { x: t.x, y: t.base == null ? GRID_H : t.base, c: t.c };
      case 'random': return { x: Math.random() * GRID_W, y: Math.random() * GRID_H, c: F.bg };
      default: // edges
        dx = t.x - 160; dy = (t.y - 90) * 1.78;
        len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) { var a = Math.random() * 6.283; dx = Math.cos(a); dy = Math.sin(a); len = 1; }
        var r = 200 + Math.random() * 60;
        return { x: 160 + dx / len * r, y: 90 + dy / len * r * 0.6, c: t.c };
    }
  }

  /* ---------------------------------------------------------------- morph
   * targets: [{x,y,c, letter?, word?, base?, owner?}]  (integer, on-grid, unique cells)
   * o: { stagger, spread, dur, ease, arc, match, entry, exit, keep, spriteCells }
   */
  F.morph = function (targets, o) {
    o = o || {};
    var ease = Ease.get(o.ease || 'easeInOutCubic');
    var dur = o.dur == null ? 1.0 : o.dur;
    var spread = o.spread == null ? 0.8 : o.spread;
    var arc = o.arc == null ? 0.25 : o.arc;
    var exitStyle = o.exit || 'scatter';
    var entry = o.entry || 'edges';
    var stagger = o.stagger || 'random';

    // Candidates: everything that isn't already leaving or assembling a sprite.
    var cand = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.dead || p.ph === 2 || p.owner) continue;
      cand.push(p);
    }

    var moves = []; // {p, t, kind}  kind: 0 move, 1 color-only, 2 spawn
    var freeTargets = [];
    stamp++;
    if (o.keep !== false) {
      for (i = 0; i < cand.length; i++) {
        p = cand[i];
        if (!p.tgt) continue;
        var gx = p.tx, gy = p.ty;
        if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
        var gi = gy * GRID_W + gx;
        if (gridStamp[gi] === stamp) continue; // duplicate — let it be re-matched
        gridStamp[gi] = stamp; grid[gi] = i;
      }
    }
    var used = new Uint8Array(cand.length);
    for (i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (o.keep !== false && !t.owner) {
        var ti = t.y * GRID_W + t.x;
        if (gridStamp[ti] === stamp && !used[grid[ti]]) {
          p = cand[grid[ti]];
          used[grid[ti]] = 1;
          if (p.c1 !== t.c || p.ph !== 0) moves.push({ p: p, t: t, kind: p.ph === 0 ? 1 : 3 });
          continue;
        }
      }
      freeTargets.push(t);
    }
    var freeP = [];
    for (i = 0; i < cand.length; i++) if (!used[i]) freeP.push(cand[i]);

    // Sort both along the curve.
    var keyFn;
    if (o.match === 'angle') {
      keyFn = function (x, y) { return Math.atan2(y - 90, (x - 160) / 1.78) + Math.random() * 0.15; };
    } else {
      keyFn = Hilbert.key;
    }
    var pk = new Float64Array(freeP.length), tk = new Float64Array(freeTargets.length);
    var pi = new Array(freeP.length), tix = new Array(freeTargets.length);
    for (i = 0; i < freeP.length; i++) { pk[i] = keyFn(freeP[i].x, freeP[i].y); pi[i] = i; }
    for (i = 0; i < freeTargets.length; i++) { tk[i] = keyFn(freeTargets[i].x, freeTargets[i].y); tix[i] = i; }
    pi.sort(function (a, b) { return pk[a] - pk[b]; });
    tix.sort(function (a, b) { return tk[a] - tk[b]; });

    var n = freeP.length, m = freeTargets.length;
    if (n >= m) {
      var taken = new Uint8Array(n);
      for (i = 0; i < m; i++) {
        var j = m ? Math.floor((i + 0.5) * n / m) : 0;
        taken[j] = 1;
        moves.push({ p: freeP[pi[j]], t: freeTargets[tix[i]], kind: 0 });
      }
      for (i = 0; i < n; i++) if (!taken[i]) exitParticle(freeP[pi[i]], exitStyle, o);
    } else {
      var filled = new Uint8Array(m);
      for (i = 0; i < n; i++) {
        var tj = Math.floor((i + 0.5) * m / n);
        filled[tj] = 1;
        moves.push({ p: freeP[pi[i]], t: freeTargets[tix[tj]], kind: 0 });
      }
      for (i = 0; i < m; i++) {
        if (filled[i]) continue;
        t = freeTargets[tix[i]];
        var ep = entryPoint(entry, t, o);
        var np = F.spawn(ep.x, ep.y, ep.c);
        if (np) moves.push({ p: np, t: t, kind: 2 });
      }
    }

    // Stagger: normalize the chosen key across the particles that actually move.
    var kmin = 1e9, kmax = -1e9, keys = new Float64Array(moves.length);
    for (i = 0; i < moves.length; i++) {
      var k = staggerKey(stagger, moves[i].t);
      keys[i] = k;
      if (k < kmin) kmin = k;
      if (k > kmax) kmax = k;
    }
    var range = kmax - kmin || 1;
    var owners = [];
    for (i = 0; i < moves.length; i++) {
      var mv = moves[i];
      p = mv.p; t = mv.t;
      var delay = (keys[i] - kmin) / range * spread;
      if (mv.kind === 1) {
        fly(p, t.x, t.y, t.c, delay * 0.8, Math.min(0.45, dur * 0.5), Ease.inOutQuad, 0);
      } else if (mv.kind === 3) {
        // already heading here mid-flight; just update destination color
        p.c1 = t.c;
        continue;
      } else {
        var d = dur * (0.85 + Math.random() * 0.3);
        fly(p, t.x, t.y, t.c, delay, d, ease, arc);
      }
      p.ph = 1; p.tgt = true;
      if (t.owner) {
        p.owner = t.owner;
        if (owners.indexOf(t.owner) < 0) { owners.push(t.owner); t.owner.pending = 0; }
        t.owner.pending++;
      }
    }
    // Owners with every target kept (nothing to fly) are assembled immediately.
    for (i = 0; i < targets.length; i++) {
      var ow = targets[i].owner;
      if (ow && owners.indexOf(ow) < 0 && !ow.assembled) { owners.push(ow); assemble(ow); }
    }
    return moves.length;
  };

  /* Quick crossfade: cells that stay stay, the rest fade out / fade in in place. */
  F.dissolveTo = function (targets, o) {
    o = o || {};
    var dur = o.dur || 0.25;
    stamp++;
    var idx = new Map();
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.owner) { assemble(t.owner); continue; }
      idx.set(t.y * GRID_W + t.x, t);
    }
    var claimed = new Set();
    for (i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.dead || p.ph === 2 || p.owner) continue;
      var key = Math.round(p.y) * GRID_W + Math.round(p.x);
      var tt = p.ph === 0 && idx.get(key);
      if (tt && !claimed.has(key)) {
        claimed.add(key);
        p.tgt = true; p.x = tt.x; p.y = tt.y;
        if (p.c1 !== tt.c) { fly(p, tt.x, tt.y, tt.c, Math.random() * dur * 0.6, dur * 0.4, Ease.linear, 0); p.ph = 1; }
      } else {
        p.tgt = false; p.ph = 2;
        fly(p, p.x, p.y, F.bg, Math.random() * dur * 0.6, dur * 0.4, Ease.linear, 0);
      }
    }
    idx.forEach(function (t, key) {
      if (claimed.has(key)) return;
      var np = F.spawn(t.x, t.y, F.bg);
      if (!np) return;
      fly(np, t.x, t.y, t.c, Math.random() * dur * 0.6, dur * 0.4, Ease.linear, 0);
      np.ph = 1; np.tgt = true;
    });
  };

  /* Instant: particles become exactly the targets. */
  F.cutTo = function (targets) {
    for (var i = 0; i < list.length; i++) if (!list[i].owner) list[i].dead = true;
    compact();
    for (i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.owner) { assemble(t.owner); continue; }
      var p = F.spawn(t.x, t.y, t.c);
      if (p) p.tgt = true;
    }
  };

  /* Everything flies outward and becomes loose (recruited by the next morph). */
  F.explode = function (o) {
    o = o || {};
    var power = o.power || 1;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.dead || p.owner || p.ph === 2) continue;
      var ang = Math.atan2((p.y - 90) * 1.78, p.x - 160) + (Math.random() - 0.5) * 0.7;
      var d = (30 + Math.random() * 110) * power;
      p.tgt = false; p.ph = 3;
      fly(p, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.6, colorNow(p),
        Math.random() * 0.08, 0.55 + Math.random() * 0.35, Ease.outCubic, 0.1);
    }
  };

  /* A sprite's pixels join the field as loose particles with a small burst. */
  F.addLoose = function (cells, o) {
    o = o || {};
    var burst = o.burst == null ? 3 : o.burst;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var p = F.spawn(c.x, c.y, c.c);
      if (!p) break;
      p.ph = 3;
      var a = Math.random() * 6.283, r = Math.random() * burst;
      fly(p, Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r * 0.8), c.c,
        Math.random() * 0.05, 0.25 + Math.random() * 0.2, Ease.outCubic, 0);
    }
  };

  function assemble(owner) {
    owner.assembled = true;
    owner.pending = 0;
    for (var i = 0; i < list.length; i++) if (list[i].owner === owner) list[i].dead = true;
    if (owner.onAssembled) owner.onAssembled();
  }

  function land(p) {
    p.x = p.tx; p.y = p.ty; p.k = 1; p.c0 = p.c1;
    if (p.ph === 2) { p.dead = true; return; }
    if (p.ph === 3) { p.ph = 0; p.tgt = false; return; }
    p.ph = 0;
    if (p.owner && !p.dead) {
      var ow = p.owner;
      if (--ow.pending <= 0 && !ow.assembled) assemble(ow);
    }
  }

  function compact() {
    var w = 0;
    for (var i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
    list.length = w;
  }

  F.finishAll = function () {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.ph !== 0 && !p.dead) land(p);
    }
    compact();
  };

  F.busy = function () {
    for (var i = 0; i < list.length; i++) if (list[i].ph !== 0) return true;
    return false;
  };

  F.clear = function () { list.length = 0; };

  F.update = function (t) {
    now = t;
    var anyDead = false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.dead) { anyDead = true; continue; }
      if (p.ph === 0) continue;
      var u = (now - p.t0) / p.dur;
      if (u <= 0) { p.x = p.sx; p.y = p.sy; p.k = 0; continue; }
      if (u >= 1) { land(p); if (p.dead) anyDead = true; continue; }
      var e = p.ease(u);
      p.k = u;
      if (p.swirl) {
        var a = p.sa + e * 2.6, r = p.sr + e * 260;
        p.x = 160 + Math.cos(a) * r; p.y = 90 + Math.sin(a) * r * 0.6;
      } else {
        var o = 1 - e;
        p.x = o * o * p.sx + 2 * o * e * p.cx + e * e * p.tx;
        p.y = o * o * p.sy + 2 * o * e * p.cy + e * e * p.ty;
      }
    }
    if (anyDead) compact();
  };

  // Idle breathing: nudge a few resting pixels by one cell for a moment.
  F.idle = function (dt) {
    if (!F.breathe || !list.length) return;
    var n = list.length * F.breatheRate * dt;
    var count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    for (var i = 0; i < count; i++) {
      var p = list[(Math.random() * list.length) | 0];
      if (p.ph !== 0 || !p.tgt) continue;
      var d = (Math.random() * 4) | 0;
      p.jx = d === 0 ? 1 : d === 1 ? -1 : 0;
      p.jy = d === 2 ? 1 : d === 3 ? -1 : 0;
      p.jt = now + 0.25 + Math.random() * 0.5;
    }
  };

  /* Draw all particles. R = {ctx, S, ox, oy}. Buckets by color to minimize
   * fillStyle switches; rect edges are rounded so cells tile seamlessly at any
   * (non-integer) scale. */
  F.draw = function (R) {
    var ctx = R.ctx, S = R.S, ox = R.ox, oy = R.oy;
    var i, p, key, nk = 0;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.ph === 0) key = (p.c1 * 17) * S1 + STEPS;
      else key = (p.c0 * 16 + p.c1) * S1 + ((p.k * STEPS + 0.5) | 0);
      var bk = buckets[key];
      if (bk.length === 0) bucketKeys[nk++] = key;
      bk.push(p);
    }
    var ramp = PALETTE.RAMP;
    for (var b = 0; b < nk; b++) {
      key = bucketKeys[b];
      var arr = buckets[key];
      ctx.fillStyle = ramp[key];
      for (i = 0; i < arr.length; i++) {
        p = arr[i];
        var x = p.x, y = p.y;
        if (p.jt > now) { x += p.jx; y += p.jy; }
        var px = Math.round(x * S), py = Math.round(y * S);
        ctx.fillRect(ox + px, oy + py, Math.round((x + 1) * S) - px, Math.round((y + 1) * S) - py);
      }
      arr.length = 0;
    }
  };

  // Thumbnail draw (1px per cell, resting positions)
  F.drawThumb = function (ctx) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.fillStyle = PALETTE.hex[p.c1];
      ctx.fillRect(Math.round(p.tx), Math.round(p.ty), 1, 1);
    }
  };

  return F;
})();
