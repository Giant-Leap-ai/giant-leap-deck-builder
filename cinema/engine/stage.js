/* cinema — the stage: one continuous world whose parameters (camera speed,
 * warp, nebula, galaxy, Earth, sun, letterbox, exposure…) glide between the
 * values each slide asks for, plus text layers and the particle field.
 *
 * Next plays a state LIVE; Prev / Go-to / reload enter it SETTLED (quick
 * glide straight to how it looks once finished). Any input while something is
 * still moving fast-forwards it first, so mashing the clicker can't desync. */

var WORLD_DEFAULTS = {
  speed: 16, warp: 0, warpColor: 'cyan', stars: 1, roll: 0, shake: 0,
  nebula: 'aurora', nebulaAmount: 0.75, backdrop: 0.75,
  galaxy: 0, galaxyX: 1250, galaxyY: 520, galaxyScale: 1, galaxyTilt: 0.42,
  earth: 0, earthX: 960, earthY: 540, earthR: 380, earthPitch: 0.35, earthRot: -1.2, earthSpin: 0.02,
  lightX: -0.7, lightY: 0.35, lightZ: 0.62,
  sun: 0, sunX: 1500, sunY: 260, sunScale: 1,
  letterbox: 0, exposure: 1, vignette: 0.6, grain: 0.05, dust: 0.35, particles: 1,
  spark: 0, sparkX: 960, sparkY: 540
};

function Stage(canvas, opts) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d', { alpha: false });
  this.opts = opts || {};
  this.thumb = !!this.opts.thumb;
  this.space = new Space.World(7);
  this.field = new Field();
  this.layers = [];
  this.layerBySpec = new Map();
  this.shapeBySpec = new Map();
  this.W = {}; this.tw = {};
  for (var k in WORLD_DEFAULTS) this.W[k] = WORLD_DEFAULTS[k];
  this.neb = [{ preset: WORLD_DEFAULTS.nebula, amount: 1, from: 1, to: 1, t0: 0, dur: 1 }];
  this.tl = new Timeline();
  this.T = 0;
  this.spinAcc = 0;
  this.flashV = 0; this.shakeV = 0;
  this.cur = { slide: 0, step: 0 };
  this.blackout = false; this.blackA = 0;
  this.S = 1; this.ox = 0; this.oy = 0;
  this.quality = 1.5;
  this.layerUid = 0;
  this.earthBudget = 240000;
}

(function () {
  var P = Stage.prototype;
  function deck() { return window.DECK || []; }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function stepsOf(si) { var s = deck()[si]; return s && s.steps ? s.steps.length : 0; }
  P.stepsOf = stepsOf;

  /* ---------------------------------------------------------- resolution */
  P.resolve = function (si, step) {
    var slide = deck()[si] || {};
    var world = {}, k;
    for (k in WORLD_DEFAULTS) world[k] = WORLD_DEFAULTS[k];
    for (k in (slide.world || {})) world[k] = slide.world[k];
    var texts = arr(slide.text).map(function (t) { return { spec: t, step: 0 }; });
    var shapes = arr(slide.particles).map(function (t) { return { spec: t, step: 0 }; });
    var motion = {};
    for (k in (slide.motion || {})) motion[k] = slide.motion[k];
    var timing = slide.timing || {};
    for (var s = 1; s <= step; s++) {
      var st = slide.steps[s - 1] || {};
      if (st.clear) { texts = []; shapes = []; }
      if (st.remove) {
        var rm = arr(st.remove);
        texts = texts.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
        shapes = shapes.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
      }
      arr(st.text).forEach(function (t) { texts.push({ spec: t, step: s }); });
      arr(st.particles).forEach(function (t) { shapes.push({ spec: t, step: s }); });
      for (k in (st.world || {})) world[k] = st.world[k];
      if (s === step) { for (k in (st.motion || {})) motion[k] = st.motion[k]; if (st.timing) timing = st.timing; }
    }
    return { slide: slide, world: world, texts: texts, shapes: shapes, motion: motion, timing: timing };
  };

  /* ---------------------------------------------------------- world tweens */
  P.setWorld = function (target, timing, defDur, defEase, instant) {
    timing = timing || {};
    for (var k in target) {
      var v = target[k];
      if (k === 'nebula') {
        var top = this.neb[this.neb.length - 1];
        if (top.preset !== v) {
          var dur = instant ? 0 : (timing.nebula ? timing.nebula[0] : defDur);
          for (var i = 0; i < this.neb.length; i++) { var L = this.neb[i]; L.from = this.amountOf(L); L.to = 0; L.t0 = this.T; L.dur = dur; }
          this.neb.push({ preset: v, amount: instant ? 1 : 0, from: instant ? 1 : 0, to: 1, t0: this.T, dur: dur });
          if (instant) this.neb = [this.neb[this.neb.length - 1]];
        }
        continue;
      }
      if (typeof v !== 'number') { this.W[k] = v; continue; }
      if (instant) { this.W[k] = v; delete this.tw[k]; continue; }
      if (this.W[k] === v && !this.tw[k]) continue;
      var tm = timing[k] || [];
      this.tw[k] = { from: this.W[k], to: v, t0: this.T + (tm[2] || 0), dur: tm[0] == null ? defDur : tm[0], ease: Ease.get(tm[1] || defEase) };
    }
  };
  P.amountOf = function (L) { return L.dur <= 0 ? L.to : L.from + (L.to - L.from) * Ease.inOutQuad(U.clamp((this.T - L.t0) / L.dur, 0, 1)); };
  P.updateWorld = function () {
    for (var k in this.tw) {
      var t = this.tw[k], u = (this.T - t.t0) / Math.max(0.0001, t.dur);
      if (u <= 0) continue;
      if (u >= 1) { this.W[k] = t.to; delete this.tw[k]; continue; }
      this.W[k] = t.from + (t.to - t.from) * t.ease(u);
    }
    for (var i = 0; i < this.neb.length; i++) this.neb[i].amount = this.amountOf(this.neb[i]);
    this.neb = this.neb.filter(function (L, idx, a) { return idx === a.length - 1 || L.amount > 0.001 || L.to > 0; });
  };
  P.finishWorld = function () {
    for (var k in this.tw) this.W[k] = this.tw[k].to;
    this.tw = {};
    var top = this.neb[this.neb.length - 1];
    top.amount = top.from = top.to = 1;
    this.neb = [top];
  };

  /* ---------------------------------------------------------- particles */
  P.shapeFor = function (spec, byId) {
    if (this.shapeBySpec.has(spec)) return this.shapeBySpec.get(spec);
    var sh;
    if (spec.shape === 'spark') sh = new Shapes.Spark(spec);
    else if (spec.shape === 'cube') sh = new Shapes.Cube(spec);
    else if (spec.shape === 'swarm') sh = new Shapes.Swarm(spec, byId[spec.inside] || new Shapes.Cube({}));
    else if (spec.shape === 'points') {
      var pts = typeof spec.points === 'function' ? spec.points() : spec.points;
      sh = { id: 'pts' + (this.layerUid++), n: pts.length, static: pts };
    }
    this.shapeBySpec.set(spec, sh);
    sh.update && sh.update(this.T);
    return sh;
  };
  P.shapeTargets = function (sh, spec) {
    var out = [], i;
    if (sh.static) {
      for (i = 0; i < sh.n; i++) {
        var q = sh.static[i], c = col(q.color || spec.color || 'white');
        out.push({ x: q.x, y: q.y, r: c[0], g: c[1], b: c[2], a: q.a == null ? 1 : q.a, s: q.s || spec.size || 8, key: sh.id + ':' + i });
      }
      return out;
    }
    for (i = 0; i < sh.n; i++) {
      var cc = sh.color(i);
      out.push({ dyn: sh, di: i, x: sh.px[i], y: sh.py[i], r: cc[0], g: cc[1], b: cc[2], a: sh.alpha ? sh.alpha(i) : 1, s: sh.size(i), key: sh.id + ':' + i });
    }
    return out;
  };
  P.layerTargets = function (L) {
    if (!L.pts) {
      var self = this, uid = this.layerUid++;
      L.pts = L.points(L.o.stride, L.o.particleSize);
      L.pts.forEach(function (p, i) { p.key = 'L' + uid + ':' + i; p.group = L; });
    }
    return L.pts;
  };

  /* ---------------------------------------------------------- entering */
  P.enter = function (si, step, mode) {
    // mode: 'live' | 'settled' | 'instant'
    this.finishAll();
    var slide = deck()[si];
    if (!slide) return;
    var isStep = mode === 'live' && si === this.cur.slide && step === this.cur.step + 1;
    if (mode === 'live' && step > 0 && !isStep) mode = 'settled';
    var R = this.resolve(si, step);
    var live = mode === 'live';
    var instant = mode === 'instant';
    var stepSpec = isStep ? slide.steps[step - 1] : null;
    var T = this.T, self = this;
    this.tl.clear();

    // world
    var defDur = live ? ((stepSpec && stepSpec.worldTime) || slide.worldTime || 2.6) : 1.4;
    var defEase = (stepSpec && stepSpec.worldEase) || slide.worldEase || 'inOutCubic';
    this.setWorld(R.world, live ? R.timing : null, defDur, defEase, instant);

    // motion options for particles
    var m = R.motion;
    var mopt = {
      ease: m.ease || 'easeInOutCubic', dur: m.dur == null ? 1.7 : m.dur, spread: m.spread == null ? 1.0 : m.spread,
      arc: m.arc == null ? 0.3 : m.arc, stagger: m.stagger || 'random', entry: m.entry || 'void', exit: m.exit || 'drift',
      match: m.match, sparkX: R.world.sparkX, sparkY: R.world.sparkY
    };
    if (!live) { mopt.dur = Math.min(mopt.dur, 1.2); mopt.spread = Math.min(mopt.spread, 0.5); }

    // text layers
    var wanted = new Set(R.texts.map(function (it) { return it.spec; }));
    this.layers.forEach(function (L) { if (!wanted.has(L.spec)) L.startOut(T); });
    var delay = live ? (isStep ? (stepSpec.textDelay == null ? 0.15 : stepSpec.textDelay) : (slide.textDelay == null ? 0.5 : slide.textDelay)) : 0.2;
    var prelude = live && !isStep && slide.prelude === 'explode' ? (slide.preludeTime || 0.9) : 0;
    var newLayers = [];
    R.texts.forEach(function (it) {
      var L = self.layerBySpec.get(it.spec);
      var onScreen = L && self.layers.indexOf(L) >= 0;
      if (onScreen && L.outStart === Infinity) return; // already on screen
      if (L && !onScreen) L.reset();
      else { L = new TextLayer(it.spec); self.layerBySpec.set(it.spec, L); }
      self.layers.push(L);
      var at = live && (!isStep || it.step === step) ? (it.spec.at || 0) : 0;
      L.inStart = T + delay + prelude + at;
      newLayers.push(L);
    });

    // shapes
    var byId = {};
    R.shapes.forEach(function (it) { if (it.spec.id && it.spec.shape === 'cube') byId[it.spec.id] = self.shapeFor(it.spec, byId); });
    R.shapes.forEach(function (it) { self.shapeFor(it.spec, byId); });

    // particle morph passes, one per distinct start time
    var events = [];
    var particleLayers = this.layers.filter(function (L) { return L.reveal === 'particles' && L.outStart === Infinity && wanted.has(L.spec); });
    particleLayers.forEach(function (L) {
      var t0 = Math.max(0, L.inStart - T);
      events.push(t0);
      if (L.arriveAt === Infinity || newLayers.indexOf(L) >= 0) L.arriveAt = L.inStart + mopt.dur * 0.95 + mopt.spread * 0.7;
    });
    R.shapes.forEach(function (it) {
      var at = live && (!isStep || it.step === step) ? (it.spec.at || 0) + prelude : 0;
      it.when = at; events.push(at);
    });
    if (!events.length) events.push(prelude);
    events = events.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var first = true;
    events.forEach(function (when) {
      var run = function () {
        var targets = [];
        particleLayers.forEach(function (L) { if (L.inStart - T <= when + 1e-6) targets = targets.concat(self.layerTargets(L)); });
        R.shapes.forEach(function (it) { if (it.when <= when + 1e-6) targets = targets.concat(self.shapeTargets(self.shapeFor(it.spec, byId), it.spec)); });
        self.field.morph(targets, mopt);
      };
      if (when <= 0) run(); else self.tl.at(when, run, 1);
    });
    if (prelude) { this.field.explode(slide.explodePower || 1); }

    // cues (live only)
    if (live) {
      arr(isStep ? stepSpec.cues : slide.cues).forEach(function (c) {
        self.tl.at(c.at || 0, function () {
          if (c.flash) self.flashV = Math.max(self.flashV, c.flash);
          if (c.shake) self.shakeV = Math.max(self.shakeV, c.shake);
        }, 0);
      });
    }

    this.cur.slide = si; this.cur.step = step;
    if (instant) this.finishAll();
    if (this.onEnter) this.onEnter();
  };

  P.finishAll = function () {
    this.tl.finish();
    this.finishWorld();
    var T = this.T;
    this.layers.forEach(function (L) {
      if (L.outStart !== Infinity) L.outStart = -1e6;
      else {
        var done = T - L.inDur * 1.7 - 0.01;
        if (L.inStart > done) L.inStart = done;
        if (L.arriveAt > T - 1.01) L.arriveAt = T - 1.01;
      }
    });
    this.layers = this.layers.filter(function (L) { return !L.gone(T); });
    this.field.finishAll();
    this.flashV = 0;
  };

  P.busy = function () {
    if (this.tl.pending()) return true;
    for (var k in this.tw) return true;
    for (var i = 0; i < this.neb.length - 1; i++) if (this.neb[i].amount > 0.001) return true;
    for (i = 0; i < this.layers.length; i++) if (this.layers[i].animating(this.T)) return true;
    return this.field.busy();
  };

  /* ---------------------------------------------------------- frame */
  P.tick = function (dt) {
    this.T += dt;
    this.tl.update(dt);
    this.updateWorld();
    var W = this.W;
    this.spinAcc += W.earthSpin * dt;
    this.space.update(dt, W);
    var T = this.T;
    this.shapeBySpec.forEach(function (sh) { if (sh.update) sh.update(T); });
    this.field.update(T);
    this.layers = this.layers.filter(function (L) { return !L.gone(T); });
    this.flashV *= Math.pow(0.04, dt);
    this.shakeV *= Math.pow(0.2, dt);
    this.blackA += ((this.blackout ? 1 : 0) - this.blackA) * Math.min(1, dt * 10);
    if (!this.thumb && !Earth.ready()) Earth.step(3);
    else if (!this.thumb && !this.warmDone) this.prewarm(4);
  };

  P.resize = function (cssW, cssH, dpr) {
    var cw = Math.round(cssW * dpr), ch = Math.round(cssH * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.S = Math.min(cw / DW, ch / DH);
    this.ox = Math.round((cw - DW * this.S) / 2);
    this.oy = Math.round((ch - DH * this.S) / 2);
  };

  P.draw = function () {
    Glow.frame();
    var ctx = this.ctx, W = this.W, T = this.T, S = this.S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    var sh = (W.shake + this.shakeV);
    var jx = sh ? (Math.random() - 0.5) * sh * 10 : 0, jy = sh ? (Math.random() - 0.5) * sh * 10 : 0;
    ctx.setTransform(S, 0, 0, S, this.ox, this.oy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, DW, DH); ctx.clip();
    this.space.drawBackground(ctx);

    // camera roll applies to the cosmos
    ctx.save();
    ctx.translate(CX + jx, CY + jy); ctx.rotate(W.roll); ctx.translate(-CX, -CY);
    this.space.drawBackdrop(ctx, this.neb, W.backdrop * W.nebulaAmount);
    this.space.drawGalaxy(ctx, W);
    this.space.drawNebulae(ctx, this.neb, W.nebulaAmount);
    this.space.drawStars(ctx, W);

    // Earth + sun
    if (W.earth > 0.01) {
      var view = { cx: W.earthX, cy: W.earthY, R: W.earthR, rot: W.earthRot + this.spinAcc, cloudRot: this.spinAcc * 0.3 + T * 0.003,
        pitch: W.earthPitch, light: [W.lightX, W.lightY, W.lightZ], alpha: U.clamp(W.earth, 0, 1), syncGen: this.thumb };
      // a dark disc first so the planet occludes stars & nebula
      ctx.save(); ctx.globalAlpha = U.clamp(W.earth, 0, 1); ctx.fillStyle = '#01030a';
      ctx.beginPath(); ctx.arc(view.cx, view.cy, view.R * 0.995, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      Earth.render(ctx, view, S, this.earthBudget);
    }
    if (W.sun > 0.01) {
      var vis = 1;
      if (W.earth > 0.01) {
        var dd = Math.sqrt((W.sunX - W.earthX) * (W.sunX - W.earthX) + (W.sunY - W.earthY) * (W.sunY - W.earthY));
        vis = U.lerp(1, U.smooth(W.earthR - 90, W.earthR + 30, dd), U.clamp(W.earth, 0, 1));
      }
      FX.sun(ctx, W.sunX, W.sunY, W.sun * vis, W.sunScale, T);
    }
    ctx.restore();

    this.space.drawDust(ctx, W.dust);
    this.field.alpha = W.particles;
    this.field.draw(ctx, T);

    if (W.spark > 0.01) {
      var fl = W.spark * (0.85 + 0.15 * Math.sin(T * 9) * Math.sin(T * 5.3));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      FX.radial(ctx, W.sparkX, W.sparkY, 260, [[0, 'rgba(255,240,210,' + 0.5 * fl + ')'], [0.2, 'rgba(255,170,80,' + 0.18 * fl + ')'], [1, 'rgba(0,0,0,0)']]);
      FX.radial(ctx, W.sparkX, W.sparkY, 26, [[0, 'rgba(255,255,255,' + fl + ')'], [1, 'rgba(255,220,180,0)']]);
      ctx.restore();
    }

    for (var i = 0; i < this.layers.length; i++) this.layers[i].draw(ctx, T, S);

    if (this.flashV > 0.005) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, this.flashV);
      ctx.fillStyle = '#dff1ff'; ctx.fillRect(0, 0, DW, DH); ctx.restore();
    }
    FX.vignette(ctx, W.vignette);
    if (!this.thumb) FX.grain(ctx, W.grain, T);
    if (W.exposure < 0.999) { ctx.fillStyle = 'rgba(0,0,0,' + U.clamp(1 - W.exposure, 0, 1) + ')'; ctx.fillRect(0, 0, DW, DH); }
    FX.letterbox(ctx, W.letterbox);
    if (this.blackA > 0.002) { ctx.fillStyle = 'rgba(0,0,0,' + this.blackA + ')'; ctx.fillRect(0, 0, DW, DH); }
    ctx.restore();
  };

  /* Prepare every text layer in the deck (bitmap + particle targets) a few
   * at a time, so no slide pays that cost the first time it appears. */
  P.prewarm = function (budgetMs) {
    if (this.warmDone) return;
    if (!this.warmQueue) {
      var q = [];
      deck().forEach(function (sl) {
        arr(sl.text).forEach(function (t) { q.push(t); });
        arr(sl.steps).forEach(function (st) { arr(st.text).forEach(function (t) { q.push(t); }); });
      });
      this.warmQueue = q;
    }
    var t0 = performance.now();
    while (this.warmQueue.length && performance.now() - t0 < budgetMs) {
      var spec = this.warmQueue.shift();
      var L = this.layerBySpec.get(spec);
      if (!L) { L = new TextLayer(spec); this.layerBySpec.set(spec, L); }
      L.ensureCache(this.S);
      if (L.reveal === 'particles') this.layerTargets(L);
    }
    if (!this.warmQueue.length) this.warmDone = true;
  };

  /* still frame for presenter thumbnails */
  P.still = function (si, step) {
    this.layers = []; this.layerBySpec = new Map(); this.field.clear();
    this.enter(si, step, 'instant');
    for (var i = 0; i < 3; i++) this.tick(0.05);
    this.draw();
  };
})();

/* ------------------------------------------------------------ Sync (stage <-> notes) */
var Sync = (function () {
  var me = Math.random().toString(36).slice(2), seq = 0, handlers = [], seen = {}, peers = [], bc = null;
  function recv(msg) {
    if (!msg || !msg.__cinema || msg.from === me || seen[msg.mid]) return;
    seen[msg.mid] = 1;
    for (var i = 0; i < handlers.length; i++) handlers[i](msg);
  }
  try { bc = new BroadcastChannel('pixeldeck-cinema'); bc.onmessage = function (e) { recv(e.data); }; } catch (e) { bc = null; }
  window.addEventListener('storage', function (e) { if (e.key === 'cinema:msg' && e.newValue) { try { recv(JSON.parse(e.newValue)); } catch (err) { } } });
  window.addEventListener('message', function (e) { if (e.data && e.data.__cinema) recv(e.data); });
  function send(msg) {
    msg.__cinema = 1; msg.from = me; msg.mid = me + ':' + (++seq);
    if (bc) { try { bc.postMessage(msg); } catch (e) { } }
    try { localStorage.setItem('cinema:msg', JSON.stringify(msg)); } catch (e) { }
    var t = peers.slice(); if (window.opener) t.push(window.opener);
    for (var i = 0; i < t.length; i++) { try { if (t[i] && !t[i].closed) t[i].postMessage(msg, '*'); } catch (e) { } }
  }
  return { send: send, on: function (fn) { handlers.push(fn); }, addPeer: function (w) { if (w && peers.indexOf(w) < 0) peers.push(w); } };
})();

/* ------------------------------------------------------------ Show: the live presentation */
var Show = (function () {
  var stage, manual = false, lastTs = 0, fpsEl, gotoEl, toastEl, showFps = false;
  var frames = 0, acc = 0, fps = 0, work = 0, auto = 0, autoT = 0, loop = false;
  function deck() { return window.DECK || []; }
  function steps(si) { return stage.stepsOf(si); }

  function next() {
    stage.finishAll();
    var c = stage.cur;
    if (c.step < steps(c.slide)) stage.enter(c.slide, c.step + 1, 'live');
    else if (c.slide < deck().length - 1) stage.enter(c.slide + 1, 0, 'live');
    else if (loop) stage.enter(0, 0, 'live');
  }
  function prev() {
    stage.finishAll();
    var c = stage.cur;
    if (c.step > 0) stage.enter(c.slide, c.step - 1, 'settled');
    else if (c.slide > 0) stage.enter(c.slide - 1, steps(c.slide - 1), 'settled');
  }
  function goTo(si, st) {
    si = U.clamp(si | 0, 0, deck().length - 1); st = U.clamp(st | 0, 0, steps(si));
    var c = stage.cur;
    if (st === 0 && si === c.slide + 1 && c.step === steps(c.slide)) return next();
    stage.enter(si, st, 'settled');
  }
  function replay() {
    var si = stage.cur.slide;
    if (si > 0) stage.enter(si - 1, steps(si - 1), 'instant');
    else { stage.finishAll(); stage.field.clear(); stage.layers = []; }
    stage.enter(si, 0, 'live');
  }
  function blackout() { stage.blackout = !stage.blackout; toast(stage.blackout ? 'BLACKOUT' : ''); broadcast(); }

  function toast(m) {
    toastEl.textContent = m; toastEl.style.opacity = m ? 1 : 0;
    clearTimeout(toast.t); if (m && m !== 'BLACKOUT') toast.t = setTimeout(function () { toastEl.style.opacity = 0; }, 1200);
  }

  function afterEnter() {
    var h = '#' + (stage.cur.slide + 1) + '.' + stage.cur.step;
    try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { }
    broadcast(); autoT = 0;
  }
  function broadcast() {
    var s = deck()[stage.cur.slide] || {};
    Sync.send({ type: 'state', slide: stage.cur.slide, step: stage.cur.step, steps: steps(stage.cur.slide), total: deck().length, id: s.id || '', blackout: stage.blackout });
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, stage.quality);
    stage.resize(window.innerWidth, window.innerHeight, dpr);
    stage.canvas.style.width = window.innerWidth + 'px'; stage.canvas.style.height = window.innerHeight + 'px';
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    var raw = lastTs ? ts - lastTs : 16.7;
    var dt = Math.min(0.05, raw / 1000);
    lastTs = ts;
    var w0 = performance.now();
    if (manual) { lastTs = ts; return; }   // recorder drives tick()+draw() itself
    stage.tick(dt);
    if (auto && !stage.busy()) { autoT += dt; if (autoT > auto) { autoT = 0; next(); } }
    stage.draw();
    work = work * 0.93 + (performance.now() - w0) * 0.07;
    // adaptive safety net: if frames get heavy, render the Earth at lower resolution
    if (work > 13 && stage.earthBudget > 90000) stage.earthBudget *= 0.97;
    else if (work < 8 && stage.earthBudget < 240000) stage.earthBudget *= 1.01;
    frames++; acc += raw;
    if (acc > 500) {
      fps = frames * 1000 / acc; frames = 0; acc = 0;
      if (showFps) fpsEl.textContent = fps.toFixed(0) + ' fps · ' + work.toFixed(1) + ' ms · ' + stage.field.list.length + ' particles · ' +
        (stage.cur.slide + 1) + '.' + stage.cur.step + ' · q' + stage.quality + (stage.busy() ? ' · anim' : '');
    }
  }

  var gotoBuf = null, gotoTimer;
  function showGoto() {
    clearTimeout(gotoTimer);
    if (gotoBuf == null) { gotoEl.style.opacity = 0; return; }
    gotoEl.textContent = 'GO TO ' + gotoBuf + '_  / ' + deck().length;
    gotoEl.style.opacity = 1;
    gotoTimer = setTimeout(function () { gotoBuf = null; showGoto(); }, 5000);
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (gotoBuf != null) {
      if (/^[0-9.]$/.test(k)) { gotoBuf += k; showGoto(); e.preventDefault(); return; }
      if (k === 'Backspace') { gotoBuf = gotoBuf.slice(0, -1); showGoto(); e.preventDefault(); return; }
      if (k === 'Enter') { var p = gotoBuf.split('.'); gotoBuf = null; showGoto(); if (+p[0] > 0) goTo(+p[0] - 1, +(p[1] || 0)); e.preventDefault(); return; }
      gotoBuf = null; showGoto(); if (k === 'Escape') return;
    }
    var nav = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 };
    if (nav[k]) { e.preventDefault(); if (!e.repeat) (nav[k] > 0 ? next : prev)(); return; }
    switch (k) {
      case 'Home': e.preventDefault(); stage.field.clear(); stage.layers = []; stage.cur = { slide: -1, step: 0 }; stage.enter(0, 0, 'live'); return;
      case 'End': e.preventDefault(); goTo(deck().length - 1, steps(deck().length - 1)); return;
      case 'f': case 'F': showFps = !showFps; fpsEl.style.display = showFps ? 'block' : 'none'; return;
      case 'b': case 'B': case '.': blackout(); return;
      case 'r': case 'R': replay(); return;
      case 'n': case 'N': openNotes(); return;
      case 'g': case 'G': gotoBuf = ''; showGoto(); return;
      case 'q': case 'Q': stage.quality = stage.quality >= 2 ? 1 : stage.quality + 0.5; resize(); toast('QUALITY ' + stage.quality + 'x'); return;
    }
  }
  function openNotes() {
    try { Sync.addPeer(window.open('notes.html', 'cinema-notes', 'width=1200,height=760')); } catch (e) { }
    setTimeout(broadcast, 500); setTimeout(broadcast, 1500);
  }
  function parseHash() {
    var m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash || '');
    if (!m) return null;
    var si = U.clamp(+m[1] - 1, 0, deck().length - 1);
    return { slide: si, step: U.clamp(+(m[2] || 0), 0, steps(si)) };
  }

  function boot(canvas) {
    fpsEl = document.getElementById('fps'); gotoEl = document.getElementById('goto'); toastEl = document.getElementById('toast');
    stage = new Stage(canvas);
    var q = new URLSearchParams(location.search);
    if (q.get('quality')) stage.quality = +q.get('quality');
    if (q.get('auto')) auto = +q.get('auto') || 4;
    if (q.get('loop')) loop = true;
    if (q.get('fps')) { showFps = true; fpsEl.style.display = 'block'; }
    Space.preload();
    Glow.prebuild();
    Earth.alloc();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('click', function (e) { e.preventDefault(); next(); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); prev(); });
    window.addEventListener('hashchange', function () { var h = parseHash(); if (h && (h.slide !== stage.cur.slide || h.step !== stage.cur.step)) goTo(h.slide, h.step); });
    Sync.on(function (msg) {
      if (msg.type === 'hello') broadcast();
      if (msg.type !== 'cmd') return;
      if (msg.cmd === 'next') next(); else if (msg.cmd === 'prev') prev(); else if (msg.cmd === 'blackout') blackout();
      else if (msg.cmd === 'replay') replay(); else if (msg.cmd === 'goto') goTo(msg.slide, msg.step || 0);
    });
    stage.onEnter = afterEnter;
    var h = parseHash() || { slide: 0, step: 0 };
    if (deck()[h.slide] && (deck()[h.slide].world || {}).earth) Earth.step(1e9);
    stage.cur = { slide: -1, step: 0 };
    stage.setWorld(stage.resolve(h.slide, h.step).world, null, 0, null, true);   // open on the right sky, no fade from defaults
    if (h.step === 0) stage.enter(h.slide, 0, 'live');
    else stage.enter(h.slide, h.step, 'settled');
    requestAnimationFrame(frame);
  }

  return {
    boot: boot, next: next, prev: prev, goTo: goTo, replay: replay,
    stage: function () { return stage; },
    // recorder / automation API (same shape as pixeldeck's)
    api: {
      info: function () { return deck().map(function (s, i) { return { id: s.id, steps: steps(i), dwell: s.dwell }; }); },
      isBusy: function () { return stage.busy(); },
      next: next, prev: prev, goTo: goTo, finish: function () { stage.finishAll(); },
      state: function () { return { slide: stage.cur.slide, step: stage.cur.step, particles: stage.field.list.length, busy: stage.busy(), fps: fps, workMs: work }; },
      setManualClock: function (v) { manual = !!v; },
      tick: function (dt) { stage.tick(dt); stage.draw(); }
    }
  };
})();
