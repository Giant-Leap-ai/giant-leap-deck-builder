/* engine/core/stage.js — the stage (body verbatim from cinema/engine/stage.js (Stage)), drawing through world plugins (spec §4.5, §4.9). */
PD.module('core/stage', ['core/util', 'core/ease', 'core/glow', 'core/shapes', 'core/field', 'core/text', 'core/theme', 'core/assets'], function (PD, util, ease, glow, shapes, field, text, theme, assets) {
  // core/shapes and core/text register the built-in shapes and the 'text' element that Stage looks up in the registries;
  // core/assets adds PD.asset, which the element env's assets(id) reads.
  var DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, U = util.U, colFor = util.colFor, Ease = ease.Ease, Timeline = ease.Timeline, Glow = glow.Glow, Field = field.Field;
  /* cinema — the stage: one continuous world whose parameters (camera speed,
   * warp, nebula, galaxy, Earth, sun, letterbox, exposure…) glide between the
   * values each slide asks for, plus text layers and the particle field.
   *
   * Next plays a state LIVE; Prev / Go-to / reload enter it SETTLED (quick
   * glide straight to how it looks once finished). Any input while something is
   * still moving fast-forwards it first, so mashing the clicker can't desync. */

  /* M4 (spec §4.5): the world is made of plugins. The parameters, their defaults, the per-stage state and the draw
   * passes belong to the world plugins (engine/worlds/{core,cosmos,planet,spark}.js, later ambient and photo); text
   * layers come from the element registry, particle shapes from the shape registry. WORLD_DEFAULTS is kept as a module
   * export for reference only (no global since M6): it equals the union of the core, cosmos, planet and spark defaults
   * (a unit test checks it). */
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

  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var warned = {};
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = 1;
    try { console.warn(msg); } catch (e) { }
  }

  /* ---------------------------------------------------------- world registry (spec §4.5)
   * PD.world(name, plugin) validates before it registers, so a bad plugin throws at registration and leaves nothing
   * behind: params are flat and globally unique (a duplicate param throws), crossfade params are string params of the
   * same plugin, hooks are functions (warmed and warm come together), passes are { z, space, name, draw }, and every
   * camera pass of every registered world forms ONE contiguous run in z order (registering a pass that would split
   * the run throws). Passes sort by z, then by registration order. get/has/list/kind are the kernel registry's. */
  var worldReg = PD.world, paramOwner = {}, allPasses = [], passSeq = 0;
  var SPACES = { screen: 1, camera: 1, post: 1 };
  var HOOKS = ['create', 'preload', 'prepare', 'warmed', 'warm', 'update', 'adapt'];
  function byZ(a, b) { return a.z - b.z || a.seq - b.seq; }
  function checkWorld(name, def) {
    if (typeof name !== 'string' || !name) throw new Error('pixeldeck: PD.world needs a name (string)');
    if (worldReg.has(name)) worldReg(name, def);           // throws the registry's "is registered twice"
    var bad = function (msg) { throw new Error('pixeldeck: world "' + name + '" ' + msg); };
    if (!def || typeof def !== 'object') bad('needs a plugin object');
    var params = def.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) bad('needs params (object)');
    for (var p in params) {
      if (!has(params, p)) continue;
      if (typeof params[p] !== 'number' && typeof params[p] !== 'string') bad('param "' + p + '" must default to a number or a string');
      if (has(paramOwner, p)) bad('param "' + p + '" is already owned by world "' + paramOwner[p] + '"');
    }
    var xf = def.crossfade || [];
    if (!Array.isArray(xf)) bad('crossfade must be an array of param names');
    xf.forEach(function (p) {
      if (typeof p !== 'string' || !has(params, p)) bad('crossfade param "' + p + '" is not one of its params');
      if (typeof params[p] !== 'string') bad('crossfade param "' + p + '" must default to a string');
    });
    HOOKS.forEach(function (h) { if (def[h] != null && typeof def[h] !== 'function') bad(h + ' must be a function'); });
    if (!def.warmed !== !def.warm) bad('needs both warmed and warm, or neither');
    if (!Array.isArray(def.passes)) bad('needs passes (array)');
    var names = {}, fresh = [];
    def.passes.forEach(function (ps, i) {
      if (!ps || typeof ps !== 'object') bad('pass ' + i + ' is not an object');
      if (typeof ps.name !== 'string' || !ps.name) bad('pass ' + i + ' needs a name');
      if (has(names, ps.name)) bad('has two passes named "' + ps.name + '"');
      names[ps.name] = 1;
      if (typeof ps.z !== 'number' || !isFinite(ps.z)) bad('pass "' + ps.name + '" needs a finite z');
      if (!has(SPACES, ps.space)) bad('pass "' + ps.name + '" space must be screen, camera or post');
      if (typeof ps.draw !== 'function') bad('pass "' + ps.name + '" needs draw()');
      fresh.push({ world: name, name: ps.name, z: ps.z, space: ps.space, seq: passSeq + i, pass: ps });
    });
    var all = allPasses.concat(fresh).sort(byZ), first = -1, last = -1, i;
    for (i = 0; i < all.length; i++) if (all[i].space === 'camera') { if (first < 0) first = i; last = i; }
    for (i = first + 1; i < last; i++) {
      if (all[i].space !== 'camera')
        bad('pass "' + all[i].world + '.' + all[i].name + '" (z ' + all[i].z + ', ' + all[i].space + ') would split the camera passes; ' +
            'camera passes must form one contiguous run in z order');
    }
    return fresh;
  }
  function world(name, def) {
    var fresh = checkWorld(name, def);
    worldReg(name, def);
    for (var p in def.params) if (has(def.params, p)) paramOwner[p] = name;
    passSeq += fresh.length;
    allPasses = allPasses.concat(fresh).sort(byZ);
    return def;
  }
  world.get = worldReg.get; world.has = worldReg.has; world.list = worldReg.list; world.kind = worldReg.kind;
  world.owner = function (param) { return has(paramOwner, param) ? paramOwner[param] : undefined; };   // param → world name
  world.passes = function () {     // every registered pass in draw order: { world, name, z, space }
    return allPasses.map(function (q) { return { world: q.world, name: q.name, z: q.z, space: q.space }; });
  };
  PD.world = world;

  /* The enabled worlds of a stage: the compiled deck's worlds ('core', then theme.worlds, then meta.worlds; 'core' is
   * implicit), de-duplicated. A world that is not registered (an optional engine file that is absent) is skipped with
   * one console warning. */
  function worldsFor(names) {
    var out = [], list = ['core'].concat(names || []);
    list.forEach(function (n) {
      if (out.indexOf(n) >= 0) return;
      if (!worldReg.has(n)) { warnOnce('world:' + n, 'pixeldeck: world "' + n + '" is not loaded; its passes are skipped'); return; }
      out.push(n);
    });
    return out;
  }
  var preloaded = {};              // world + '|' + themeKey → 1: preload runs once per page per theme

  /* M5 (spec §4.9): a stage plays ONE compiled deck: new PD.Stage(canvas, { deck: CompiledDeck, thumb? }). The deck
   * gives the scenes (deck.scenes; there is no window.DECK any more), the resolved theme (deck.theme: text layers, the
   * space world and enter() read it; theme.world overrides the plugin defaults) and the worlds (deck.worlds). A deck
   * that is not a compiled deck ({ theme, scenes: [] }) throws.
   * M4: the world plugins of the stage's worlds give the defaults (in worlds order, then theme.world), one state
   * each (create(stage), after the stage's own fields exist), the crossfade stacks stage.xf[param] and the passes.
   * Everything that depends on the deck's theme and worlds is set by loadDeck, which setDeck's full reset re-runs. */
  function checkDeck(deck, where) {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.scenes) || !deck.theme || typeof deck.theme !== 'object')
      throw new Error('pixeldeck: ' + where + ' needs a compiled deck { theme, worlds, scenes } (PD.compile(deckId))');
    return deck;
  }
  function Stage(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.opts = opts || {};
    this.thumb = !!this.opts.thumb;
    this.tl = new Timeline();
    this.T = 0;
    this.blackout = false; this.blackA = 0;
    this.S = 1; this.ox = 0; this.oy = 0;
    this.quality = 1.5;
    this.layerUid = 0;
    this.loadDeck(checkDeck(this.opts.deck, 'new PD.Stage(canvas, { deck })'));
  }

  (function () {
    var P = Stage.prototype;
    function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
    P.stepsOf = function (si) { var s = this.deck.scenes[si]; return s && s.steps ? s.steps.length : 0; };

    /* ---------------------------------------------------------- the deck (spec §4.9) */
    P.loadDeck = function (deck) {
      this.deck = deck;
      this.theme = deck.theme;
      this.col = colFor(this.theme.colors);
      var aid = deck.assetsDeckId || deck.id;
      this.env = { theme: this.theme, col: this.col, stage: this, assets: function (id) { return PD.asset(aid, id); } };
      this.worlds = worldsFor(deck.worlds || this.theme.worlds);
      var defs = this.worlds.map(function (n) { return worldReg.get(n); }), k;
      this.defaults = {};
      defs.forEach(function (d) { for (var p in d.params) if (has(d.params, p)) this.defaults[p] = d.params[p]; }, this);
      for (k in this.theme.world) this.defaults[k] = this.theme.world[k];
      this.field = new Field();
      this.layers = [];
      this.layerBySpec = new Map();
      this.shapeBySpec = new Map();
      this.W = {}; this.tw = {};
      for (k in this.defaults) this.W[k] = this.defaults[k];
      this.xf = {};                  // crossfade stacks (spec §4.5): param → [{ value, amount, from, to, t0, dur }]
      defs.forEach(function (d) {
        (d.crossfade || []).forEach(function (p) { this.xf[p] = [{ value: this.defaults[p], amount: 1, from: 1, to: 1, t0: 0, dur: 1 }]; }, this);
      }, this);
      this.tl.clear();
      this.flashV = 0; this.shakeV = 0;
      this.cur = { slide: 0, step: 0 };
      this.warmDone = false; this.warmQueue = null;
      this.worldStates = {};         // world name → its state
      this.worldList = [];           // [{ name, def, state }] in worlds order (update, warm, adapt, prepare, preload)
      for (var i = 0; i < defs.length; i++) {
        var st = defs[i].create ? defs[i].create(this) : {};
        this.worldStates[this.worlds[i]] = st;
        this.worldList.push({ name: this.worlds[i], def: defs[i], state: st });
      }
      var self = this, on = {};
      this.worlds.forEach(function (n) { on[n] = 1; });
      this.passes = allPasses.filter(function (q) { return has(on, q.world); }).map(function (q) {
        return { world: q.world, name: q.name, z: q.z, space: q.space, draw: q.pass.draw, state: self.worldStates[q.world] };
      });
      this.f = { T: 0, S: 1, thumb: this.thumb, stage: this, xf: this.xf, theme: this.theme };   // the passes' frame info
    };

    // every element and shape spec object a deck can show (scene and step text, elements, particles)
    function specsOf(scenes) {
      var live = new Set(), add = function (s) { if (s && typeof s === 'object') live.add(s); };
      scenes.forEach(function (sl) {
        if (!sl) return;
        arr(sl.text).forEach(add); arr(sl.elements).forEach(add); arr(sl.particles).forEach(add);
        arr(sl.steps).forEach(function (st) { if (st) { arr(st.text).forEach(add); arr(st.elements).forEach(add); arr(st.particles).forEach(add); } });
      });
      return live;
    }
    // the prewarm queue of some scenes: every element spec of the scenes and their steps, in deck order
    function warmList(scenes) {
      var q = [];
      var add = function (kind) { return function (spec) { q.push({ spec: spec, kind: kind || spec.kind }); }; };
      scenes.forEach(function (sl) {
        arr(sl.text).forEach(add('text')); arr(sl.elements).forEach(add(null));
        arr(sl.steps).forEach(function (st) { arr(st.text).forEach(add('text')); arr(st.elements).forEach(add(null)); });
      });
      return q;
    }

    /* setDeck eviction (spec §4.9). A changed theme key or world list is a FULL reset: loadDeck clears the layers,
     * layerBySpec, shapeBySpec, the field, xf, the world states, W (back to the defaults) and the warm flags, and
     * sets cur = { slide: 0, step: 0 }. Otherwise every spec object reachable from compiled.scenes is `live`: map
     * entries whose key is not live are deleted, visible layers whose spec is not live start their exit, and cur is
     * clamped to the new deck. Both maps stay bounded by the current deck. Warm-up then covers the new specs: the
     * changed scenes (opts.changed, scene ids) when the stage was already warm, else the whole deck again (specs
     * that are still cached cost nothing). The caller re-enters a state (the Studio: enter(si, step, 'settled')). */
    P.setDeck = function (compiled, opts) {
      checkDeck(compiled, 'stage.setDeck(compiled)');
      opts = opts || {};
      var old = this.deck;
      var key = function (d) { return d.themeKey != null ? d.themeKey : d.theme.key; };
      var wl = function (d) { return JSON.stringify(d.worlds || d.theme.worlds || []); };
      if (key(compiled) !== key(old) || wl(compiled) !== wl(old)) { this.loadDeck(compiled); return; }
      var live = specsOf(compiled.scenes), T = this.T, self = this;
      this.layerBySpec.forEach(function (L, spec) { if (!live.has(spec)) self.layerBySpec.delete(spec); });
      this.shapeBySpec.forEach(function (sh, spec) { if (!live.has(spec)) self.shapeBySpec.delete(spec); });
      this.layers.forEach(function (L) { if (!live.has(L.spec)) L.startOut(T); });
      this.deck = compiled;
      this.theme = this.env.theme = this.f.theme = compiled.theme;     // the same key: the same values
      var n = compiled.scenes.length, c = this.cur;
      if (c.slide > n - 1) c.slide = n - 1;                            // -1 (nothing entered yet) stays -1
      c.step = c.slide < 0 ? 0 : U.clamp(c.step, 0, this.stepsOf(c.slide));
      var changed = Array.isArray(opts.changed) ? opts.changed : null;
      if (this.warmDone && changed) {
        this.warmQueue = warmList(compiled.scenes.filter(function (sl) { return sl && changed.indexOf(sl.id) >= 0; }));
        this.warmDone = !this.warmQueue.length;
      } else { this.warmQueue = null; this.warmDone = false; }
    };

    /* ---------------------------------------------------------- resolution
     * spec §4.2: items start from scene.text (kind 'text'), then scene.elements (kind = spec.kind); for each step
     * up to `step`: clear empties items and shapes, remove drops matching ids, then step.text, step.elements and
     * step.particles are appended. `texts` = the items of kind 'text'. */
    P.resolve = function (si, step) {
      var slide = this.deck.scenes[si] || {};
      var world = {}, k, D = this.defaults;
      for (k in D) world[k] = D[k];
      for (k in (slide.world || {})) world[k] = slide.world[k];
      var items = arr(slide.text).map(function (t) { return { spec: t, kind: 'text', step: 0 }; });
      arr(slide.elements).forEach(function (e) { items.push({ spec: e, kind: e.kind, step: 0 }); });
      var shapes = arr(slide.particles).map(function (t) { return { spec: t, step: 0 }; });
      var motion = {};
      for (k in (slide.motion || {})) motion[k] = slide.motion[k];
      var timing = slide.timing || {};
      for (var s = 1; s <= step; s++) {
        var st = arr(slide.steps)[s - 1] || {};
        if (st.clear) { items = []; shapes = []; }
        if (st.remove) {
          var rm = arr(st.remove);
          items = items.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
          shapes = shapes.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
        }
        arr(st.text).forEach(function (t) { items.push({ spec: t, kind: 'text', step: s }); });
        arr(st.elements).forEach(function (e) { items.push({ spec: e, kind: e.kind, step: s }); });
        arr(st.particles).forEach(function (t) { shapes.push({ spec: t, step: s }); });
        for (k in (st.world || {})) world[k] = st.world[k];
        if (s === step) { for (k in (st.motion || {})) motion[k] = st.motion[k]; if (st.timing) timing = st.timing; }
      }
      var texts = items.filter(function (it) { return it.kind === 'text'; });
      return { scene: slide, slide: slide, world: world, items: items, texts: texts, shapes: shapes, motion: motion, timing: timing };
    };

    /* ---------------------------------------------------------- world tweens
     * Crossfade params (spec §4.5 `crossfade`) keep a stack in stage.xf[param]: the code that used to drive
     * stage.neb, unchanged, with .value for .preset. W[param] holds the newest value. */
    P.setWorld = function (target, timing, defDur, defEase, instant) {
      timing = timing || {};
      for (var k in target) {
        var v = target[k];
        if (has(this.xf, k)) {
          var stack = this.xf[k], top = stack[stack.length - 1];
          if (top.value !== v) {
            var dur = instant ? 0 : (timing[k] ? timing[k][0] : defDur);
            for (var i = 0; i < stack.length; i++) { var L = stack[i]; L.from = this.amountOf(L); L.to = 0; L.t0 = this.T; L.dur = dur; }
            stack.push({ value: v, amount: instant ? 1 : 0, from: instant ? 1 : 0, to: 1, t0: this.T, dur: dur });
            if (instant) this.xf[k] = [stack[stack.length - 1]];
            this.W[k] = v;
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
      for (var p in this.xf) {
        var X = this.xf[p];
        for (var i = 0; i < X.length; i++) X[i].amount = this.amountOf(X[i]);
        this.xf[p] = X.filter(function (L, idx, a) { return idx === a.length - 1 || L.amount > 0.001 || L.to > 0; });
      }
    };
    P.finishWorld = function () {
      for (var k in this.tw) this.W[k] = this.tw[k].to;
      this.tw = {};
      for (var p in this.xf) {
        var X = this.xf[p], top = X[X.length - 1];
        top.amount = top.from = top.to = 1;
        this.xf[p] = [top];
      }
    };

    /* ---------------------------------------------------------- elements (spec §4.6) */
    P.makeLayer = function (spec, kind) {
      var E = PD.element.get(kind);
      if (!E) { warnOnce('element:' + kind, 'pixeldeck: unknown element kind "' + kind + '"; it is not shown'); return null; }
      return E.create(spec, this.env);
    };

    /* ---------------------------------------------------------- particles (spec §4.7) */
    P.uid = function () { return String(this.layerUid++); };
    P.isContainer = function (name) { var d = PD.shape.get(name); return !!(d && d.container); };
    P.shapeFor = function (spec, byId) {
      if (this.shapeBySpec.has(spec)) return this.shapeBySpec.get(spec);
      var def = PD.shape.get(spec.shape), self = this, sh;
      if (def) sh = def.create(spec, { byId: byId || {}, theme: this.theme, col: this.col, uid: function () { return self.uid(); } });
      if (!sh) {
        if (!def) warnOnce('shape:' + spec.shape, 'pixeldeck: unknown shape "' + spec.shape + '"; it has no particles');
        sh = { id: 'none', n: 0, static: [] };
      }
      this.shapeBySpec.set(spec, sh);
      sh.update && sh.update(this.T);
      return sh;
    };
    P.shapeTargets = function (sh, spec) {
      var out = [], i;
      if (sh.static) {
        for (i = 0; i < sh.n; i++) {
          var q = sh.static[i], c = this.col(q.color || spec.color || 'white');
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
        var self = this, uid = this.uid();
        L.pts = L.points(L.o.stride, L.o.particleSize);
        L.pts.forEach(function (p, i) { p.key = 'L' + uid + ':' + i; p.group = L; });
      }
      return L.pts;
    };

    /* ---------------------------------------------------------- entering */
    P.enter = function (si, step, mode) {
      // mode: 'live' | 'settled' | 'instant'
      this.finishAll();
      var slide = this.deck.scenes[si];
      if (!slide) return;
      var isStep = mode === 'live' && si === this.cur.slide && step === this.cur.step + 1;
      if (mode === 'live' && step > 0 && !isStep) mode = 'settled';
      var R = this.resolve(si, step);
      var live = mode === 'live';
      var instant = mode === 'instant';
      var stepSpec = isStep ? slide.steps[step - 1] : null;
      var T = this.T, self = this;
      var TM = this.theme.timing, MO = this.theme.motion;   // M3: the former constants (spec §4.4, §4.9)
      this.tl.clear();

      // world
      var defDur = live ? ((stepSpec && stepSpec.worldTime) || slide.worldTime || TM.worldTime) : TM.settledWorldTime;
      var defEase = (stepSpec && stepSpec.worldEase) || slide.worldEase || TM.worldEase;
      this.setWorld(R.world, live ? R.timing : null, defDur, defEase, instant);

      // motion options for particles
      var m = R.motion;
      var mopt = {
        ease: m.ease || MO.ease, dur: m.dur == null ? MO.dur : m.dur, spread: m.spread == null ? MO.spread : m.spread,
        arc: m.arc == null ? MO.arc : m.arc, stagger: m.stagger || MO.stagger, entry: m.entry || MO.entry, exit: m.exit || MO.exit,
        match: m.match, sparkX: R.world.sparkX, sparkY: R.world.sparkY
      };
      if (!live) { mopt.dur = Math.min(mopt.dur, TM.settledDurMax); mopt.spread = Math.min(mopt.spread, TM.settledSpreadMax); }

      // element layers (M4: every item kind through the element registry; OGL's are all 'text')
      var wanted = new Set(R.items.map(function (it) { return it.spec; }));
      this.layers.forEach(function (L) { if (!wanted.has(L.spec)) L.startOut(T); });
      var delay = live ? (isStep ? (stepSpec.textDelay == null ? TM.stepTextDelay : stepSpec.textDelay) : (slide.textDelay == null ? TM.textDelay : slide.textDelay)) : TM.settledTextDelay;
      var prelude = live && !isStep && slide.prelude === 'explode' ? (slide.preludeTime || TM.preludeTime) : 0;
      var newLayers = [];
      R.items.forEach(function (it) {
        var L = self.layerBySpec.get(it.spec);
        var onScreen = L && self.layers.indexOf(L) >= 0;
        if (onScreen && L.outStart === Infinity) return; // already on screen
        if (L && !onScreen) L.reset();
        else { L = self.makeLayer(it.spec, it.kind); if (!L) return; self.layerBySpec.set(it.spec, L); }
        self.layers.push(L);
        var at = live && (!isStep || it.step === step) ? (it.spec.at || 0) : 0;
        L.inStart = T + delay + prelude + at;
        newLayers.push(L);
      });

      // shapes: containers first (spec §4.7 build order), then everything else
      var byId = {};
      R.shapes.forEach(function (it) { if (it.spec.id && self.isContainer(it.spec.shape)) byId[it.spec.id] = self.shapeFor(it.spec, byId); });
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
      for (var p in this.xf) { var X = this.xf[p]; for (var i = 0; i < X.length - 1; i++) if (X[i].amount > 0.001) return true; }
      for (i = 0; i < this.layers.length; i++) if (this.layers[i].animating(this.T)) return true;
      return this.field.busy();
    };

    /* ---------------------------------------------------------- frame
     * spec §4.5 "Order of work inside Stage.tick(dt)". The world updates run in worlds order (cosmos: stars,
     * nebula billboards, dust; planet: the spin accumulator). */
    P.tick = function (dt) {
      this.T += dt;
      this.tl.update(dt);
      this.updateWorld();
      var W = this.W, ws = this.worldList;
      for (var i = 0; i < ws.length; i++) if (ws[i].def.update) ws[i].def.update(ws[i].state, dt, W, this);
      var T = this.T;
      this.shapeBySpec.forEach(function (sh) { if (sh.update) sh.update(T); });
      this.field.update(T);
      this.layers = this.layers.filter(function (L) { return !L.gone(T); });
      this.flashV *= Math.pow(0.04, dt);
      this.shakeV *= Math.pow(0.2, dt);
      this.blackA += ((this.blackout ? 1 : 0) - this.blackA) * Math.min(1, dt * 10);
      if (!this.thumb) this.warmTick();
    };

    /* Time-sliced warm-up (spec §4.5): the FIRST world whose warmed(state) is false gets warm(state, 3) and nothing
     * else warms this tick; only when every world is warm does prewarm(4) run. For One Giant Leap this is today's
     * `if (!Earth.ready()) Earth.step(3); else if (!warmDone) prewarm(4)`. */
    P.warmTick = function () {
      var ws = this.worldList;
      for (var i = 0; i < ws.length; i++) {
        var d = ws[i].def;
        if (d.warmed && !d.warmed(ws[i].state)) { d.warm(ws[i].state, 3); return; }
      }
      if (!this.warmDone) this.prewarm(4);
    };
    P.isWarm = function () {
      var ws = this.worldList;
      for (var i = 0; i < ws.length; i++) if (ws[i].def.warmed && !ws[i].def.warmed(ws[i].state)) return false;
      return !!this.warmDone;
    };
    P.warmAll = function () {
      var ws = this.worldList;
      for (var i = 0; i < ws.length; i++) {
        var d = ws[i].def;
        for (var n = 0; d.warmed && !d.warmed(ws[i].state) && n < 10000; n++) d.warm(ws[i].state, 1e9);
      }
      this.prewarm(Infinity);
    };
    /* Player hooks (spec §4.10 boot steps 7–8; also usable by a stage without a Player). preload runs once per page
     * per world and theme key; prepare runs each world's prepare(state, firstScene, stage). adapt forwards the
     * Player's real-time frame cost (never called in manual-clock mode). */
    P.preload = function (compiled) {
      for (var i = 0; i < this.worldList.length; i++) {
        var w = this.worldList[i], key = w.name + '|' + this.theme.key;
        if (!w.def.preload || preloaded[key]) continue;
        preloaded[key] = 1;
        w.def.preload(this.theme, compiled || this.deck);
      }
    };
    P.prepare = function (firstScene) {
      for (var i = 0; i < this.worldList.length; i++) {
        var w = this.worldList[i];
        if (w.def.prepare) w.def.prepare(w.state, firstScene || {}, this);
      }
    };
    P.adapt = function (workMs) {
      for (var i = 0; i < this.worldList.length; i++) {
        var w = this.worldList[i];
        if (w.def.adapt) w.def.adapt(w.state, workMs);
      }
    };

    P.resize = function (cssW, cssH, dpr) {
      var cw = Math.round(cssW * dpr), ch = Math.round(cssH * dpr);
      if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
      this.S = Math.min(cw / DW, ch / DH);
      this.ox = Math.round((cw - DW * this.S) / 2);
      this.oy = Math.round((ch - DH * this.S) / 2);
    };

    /* The sorted pass list (spec §4.5 table). The stage clears to black at the identity transform, draws the shake
     * jitter (two Math.random calls, only when W.shake + shakeV ≠ 0), sets the design transform and clips; before
     * the first camera pass it applies the camera (translate CX+jx, CY+jy; rotate W.roll; translate back) and after
     * the last consecutive camera pass it restores; then the final restore. */
    P.draw = function () {
      Glow.frame();
      var ctx = this.ctx, W = this.W, S = this.S;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      var sh = (W.shake + this.shakeV);
      var jx = sh ? (Math.random() - 0.5) * sh * 10 : 0, jy = sh ? (Math.random() - 0.5) * sh * 10 : 0;
      ctx.setTransform(S, 0, 0, S, this.ox, this.oy);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, DW, DH); ctx.clip();
      var f = this.f, passes = this.passes, cam = false;
      f.T = this.T; f.S = S;
      for (var i = 0; i < passes.length; i++) {
        var p = passes[i];
        if (p.space === 'camera') {
          if (!cam) { ctx.save(); ctx.translate(CX + jx, CY + jy); ctx.rotate(W.roll); ctx.translate(-CX, -CY); cam = true; }
        } else if (cam) { ctx.restore(); cam = false; }
        p.draw(ctx, W, p.state, f);
      }
      if (cam) ctx.restore();
      ctx.restore();
    };

    /* Prepare every element layer in the deck (bitmap + particle targets) a few
     * at a time, so no slide pays that cost the first time it appears. */
    P.prewarm = function (budgetMs) {
      if (this.warmDone) return;
      if (!this.warmQueue) this.warmQueue = warmList(this.deck.scenes);
      var t0 = performance.now();
      while (this.warmQueue.length && performance.now() - t0 < budgetMs) {
        var it = this.warmQueue.shift();
        var L = this.layerBySpec.get(it.spec);
        if (!L) { L = this.makeLayer(it.spec, it.kind); if (!L) continue; this.layerBySpec.set(it.spec, L); }
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

    /* spec §4.9: release what this stage holds (layers, cached glyph bitmaps and particle targets, shapes, the field,
     * pending timeline events, the world states) and its canvas backing store. Page-wide caches (textures, the Earth,
     * glow sprites) are shared by every stage of the page and stay. The stage must not be used afterwards. */
    P.destroy = function () {
      this.tl.clear();
      this.field.clear();
      this.layers = [];
      this.layerBySpec.clear(); this.shapeBySpec.clear();
      this.warmQueue = null;
      this.worldStates = {}; this.worldList = []; this.passes = [];
      this.onEnter = null;
      this.destroyed = true;
      try { this.canvas.width = 0; this.canvas.height = 0; } catch (e) { }
    };
  })();

  PD.Stage = Stage;               // spec §4.9: new PD.Stage(canvas, { deck: compiled, thumb? })
  return { WORLD_DEFAULTS: WORLD_DEFAULTS, Stage: Stage };
});
