/* engine/core/player.js — the Player (spec §4.10, §4.13): owns the window around one PD.Stage — the canvas and its
 * size, input, the URL hash, the HUD, sync with the presenter window and window.PixelDeck. The live-presentation code
 * (next / prev / goTo / replay / blackout, the frame loop, the keys, the hash) is the body of the pre-v2 Show
 * (cinema/engine/stage.js), verbatim except where noted; M6 turned the one-per-page Show into PD.boot / PD.start.
 *
 *   PD.start(deckId?, opts?) → Promise<Player | Notes | null>     (the kernel's PD.start checks PD.missing() first)
 *     mode = opts.mode || (?notes → 'notes') || (?export → 'register-only') || 'stage'
 *       'stage'          PD.boot({ deck: deckId, ...opts })
 *       'notes'          PD.notes({ deck: deckId, ...opts })        (core/notes.js, the presenter window)
 *       'register-only'  resolves null: everything is registered, nothing boots (tools/export.js, spec §3.6)
 *     window.PD_SELFTEST: the export self-test (spec §3.6) instead — no RAF, input, hash or sync; assets, compile, then
 *       stage.still(si, step) for every state; posts { type: 'pd-selftest', ok, errors: [{ slide, step, msg }], ms }
 *       to the parent window (slide -1: the deck did not boot), then destroys that player. Never rejects.
 *     A deck that cannot boot shows the on-screen panel (PD.fail) and the promise rejects.
 *   PD.boot(opts) → Promise<Player>
 *     opts = { deck?, compiled?, canvas?, container?, input = true, hash = true, hud = true, sync = true, api = true,
 *              raf = true, quality? (default 1.5; ?quality= overrides) }
 *   Player = { stage, ready, next(), prev(), goTo(si, step), replay(), blackout(), home(), end(), openNotes(),
 *              setManualClock(on), tick(dt), info(), state(), onState(fn) → off(), destroy(), api, sync }
 *
 * Boot sequence (spec §4.10; today's order plus the asset wait): 1 hud.install (CSS, canvas, HUD) · 2 Sync(deckId,
 * { role: 'stage' }) — the only random number drawn before the first enter · 3 resolve the theme, await PD.assets.ready ·
 * 4 compile · 5 new Stage · 6 URL params · 7 world preload, Glow.prebuild · 8 world prepare(first scene) · 9 resize ·
 * 10 listeners · 11 setWorld(first state's world, instant) · 12 enter · 13 RAF loop · 14 window.PixelDeck.
 *
 * Keys (today's set): → ↓ PageDown Space / click next · ← ↑ PageUp / right-click prev · G n[.m] Enter go to · Home ·
 * End · F fps · B . blackout · R replay · Q quality · N presenter notes. Key events whose target is an input,
 * textarea, select or [contenteditable] are ignored; with a container, keys count only when the focus is inside it or
 * on <body>. N opens <page>?notes with noopener (its own process, synced over BroadcastChannel), never a same-thread
 * popup (spec §1.3, R2), through a shift-clicked link rather than window.open() so the stage never waits for the new
 * window. That departs from the window.open call written in §4.10 and awaits the lead's amendment (see openNotes).
 *
 * window.PixelDeck (spec §4.13): info() → [{ id, steps, dwell, stepDwell?, beat? }], isBusy(), next(), prev(),
 * goTo(si, step), finish(), state() → { slide, step, particles, busy, fps, workMs, ready }, setManualClock(on),
 * tick(dt) (tick + draw), ready (getter: booted and every warm-up done), deck() → { id, meta }, advance(dt) (tick, no
 * draw), warmAll(), snapshot(type = 'image/png') → data URL.
 * The Player never draws a random number itself; in manual-clock mode it never calls the worlds' adapt (as today). */
PD.module('core/player', ['core/util', 'core/glow', 'core/theme', 'core/assets', 'core/compile', 'core/stage', 'core/sync', 'core/hud'], function (PD, util, glow, theme, assets, compile, stage, sync, hud) {
  var U = util.U, Glow = glow.Glow, Stage = stage.Stage, Sync = sync.Sync;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // key events from form fields and editable content never drive the deck (spec §4.10)
  function editable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return true;
    return !!(t.closest && t.closest('input, textarea, select, [contenteditable]'));
  }
  function onlyDeck(what) {
    var ids = PD.deck.list();
    if (ids.length === 1) return ids[0];
    throw new Error('pixeldeck: ' + what + ' needs a deck id (' + (ids.length ? ids.length + ' decks are registered: ' + ids.join(', ') : 'no deck is registered') + ')');
  }
  // boot step 3: the deck's theme, resolved before the assets so its fontFaces can load with them
  function fontFacesOf(deckId) {
    try {
      var src = PD.deck.get(deckId), meta = src && typeof src === 'object' && !Array.isArray(src) ? src.meta || {} : {};
      var id = meta.theme || (PD.theme.has(deckId) ? deckId : PD.theme.list().length === 1 ? PD.theme.list()[0] : null);
      if (!id) return null;
      var t = PD.theme.resolve(id, meta.themePatch);
      return t.fontFaces && t.fontFaces.length ? t.fontFaces : null;
    } catch (e) { return null; }       // compile reports a bad theme properly
  }
  function stepDwellOf(s) {             // info()[i].stepDwell[k] = the dwell of state k (k < steps), when the deck sets one
    var n = s.steps ? s.steps.length : 0, out = [], any = false;
    for (var k = 0; k < n; k++) {
      var v = s.stepDwell && s.stepDwell[k] != null ? s.stepDwell[k] : s.steps[k] && s.steps[k].dwell != null ? s.steps[k].dwell : null;
      if (v != null) any = true;
      out.push(v);
    }
    return any ? out : null;
  }
  function problems(compiled, report) {   // what the on-screen error box lists (the show goes on)
    var out = [];
    (compiled.errors || []).forEach(function (is) { out.push('scene ' + (is.scene + 1) + (is.sceneId ? ' (' + is.sceneId + ')' : '') + ': ' + is.msg); });
    ((report && report.failed) || []).forEach(function (f) { out.push('asset "' + f.id + '": ' + f.reason); });
    return out;
  }

  /* ------------------------------------------------------------ PD.boot */
  function boot(opts) {
    opts = opts || {};
    var on = function (k) { return opts[k] !== false; };
    var compiled0 = opts.compiled || null;
    var deckId;
    try { deckId = compiled0 ? compiled0.id : opts.deck != null ? String(opts.deck) : onlyDeck('PD.boot'); }
    catch (e) { return Promise.reject(e); }
    var container = opts.container || null, ownCanvas = !opts.canvas;
    var canvas = opts.canvas || document.createElement('canvas');
    if (ownCanvas && !container) canvas.id = 'stage';
    var H = hud.install({ canvas: canvas, container: container, hud: on('hud') });                // 1
    var sy = on('sync') ? Sync(deckId, { role: 'stage' }) : null;                                     // 2
    var aid = compiled0 ? compiled0.assetsDeckId || compiled0.id : deckId;
    var faces = compiled0 ? (compiled0.theme && compiled0.theme.fontFaces && compiled0.theme.fontFaces.length ? compiled0.theme.fontFaces : null) : fontFacesOf(deckId);
    return PD.assets.ready(aid, faces ? { fontFaces: faces } : undefined).then(function (report) {   // 3
      var compiled = compiled0 || PD.compile(deckId);                                                 // 4
      return play(compiled, report);
    }).catch(function (e) {
      if (sy) sy.close();
      H.remove();
      throw e;
    });

    function play(compiled, report) {
      /* ---------------------------------------------------------- the live presentation (pre-v2 Show) */
      var stage, manual = false, lastTs = 0, showFps = false;
      var frames = 0, acc = 0, fps = 0, work = 0, auto = 0, autoT = 0, loop = false;
      var dead = false, booted = false, readySent = false, rafId = 0, listeners = [], stateFns = [], timers = [], curT = 0;
      function deck() { return stage.deck.scenes; }
      function steps(si) { return stage.stepsOf(si); }
      function listen(target, ev, fn, o) { target.addEventListener(ev, fn, o); listeners.push([target, ev, fn, o]); }
      function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
      function isReady() { return !!(booted && !dead && stage.isWarm()); }

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
      function blackout() { stage.blackout = !stage.blackout; toast(stage.blackout ? 'BLACKOUT' : ''); broadcast(); notify(); }
      function home() { stage.field.clear(); stage.layers = []; stage.cur = { slide: -1, step: 0 }; stage.enter(0, 0, 'live'); }
      function end() { goTo(deck().length - 1, steps(deck().length - 1)); }

      function toast(m) { H.toast(m); }

      function afterEnter() {
        if (on('hash')) {
          var h = '#' + (stage.cur.slide + 1) + '.' + stage.cur.step;
          try { if (location.hash !== h) history.replaceState(null, '', h); } catch (e) { }
        }
        broadcast(); autoT = 0;
        notify();
      }
      function broadcast() {
        if (!sy || dead) return;
        var s = deck()[stage.cur.slide] || {};
        sy.send({ type: 'state', inst: sy.id, slide: stage.cur.slide, step: stage.cur.step, steps: steps(stage.cur.slide), total: deck().length,
                  id: s.id || '', beat: s.beat || '', blackout: stage.blackout, ready: isReady() });
      }
      function notify() {
        if (!booted) return;
        var st = api.state(), fs = stateFns.slice();
        for (var i = 0; i < fs.length; i++) fs[i](st);
      }
      function checkReady() {           // tell the presenter window once when warm-up is done
        if (!readySent && isReady()) { readySent = true; broadcast(); }
      }

      function size() {
        if (container) { var r = container.getBoundingClientRect(); return [r.width, r.height]; }
        return [window.innerWidth, window.innerHeight];
      }
      function resize() {
        if (dead) return;
        var wh = size(), dpr = Math.min(window.devicePixelRatio || 1, stage.quality);
        stage.resize(wh[0], wh[1], dpr);
        stage.canvas.style.width = wh[0] + 'px'; stage.canvas.style.height = wh[1] + 'px';
      }

      function frame(ts) {
        if (dead) return;
        rafId = requestAnimationFrame(frame);
        var raw = lastTs ? ts - lastTs : 16.7;
        var dt = Math.min(0.05, raw / 1000);
        lastTs = ts;
        var w0 = performance.now();
        if (manual) { lastTs = ts; return; }   // recorder drives tick()+draw() itself
        stage.tick(dt);
        if (auto && !stage.busy()) { autoT += dt; if (autoT > auto) { autoT = 0; next(); } }
        stage.draw();
        work = work * 0.93 + (performance.now() - w0) * 0.07;
        // adaptive safety net: if frames get heavy, render the Earth at lower resolution (worlds' adapt hooks)
        stage.adapt(work);
        frames++; acc += raw;
        if (acc > 500) {
          fps = frames * 1000 / acc; frames = 0; acc = 0;
          if (showFps) H.fps(fps.toFixed(0) + ' fps · ' + work.toFixed(1) + ' ms · ' + stage.field.list.length + ' particles · ' +
            (stage.cur.slide + 1) + '.' + stage.cur.step + ' · q' + stage.quality + (stage.busy() ? ' · anim' : ''));
        }
        if (!readySent) { checkReady(); if (!idleId && !readySent) idleId = requestIdle(idleWarm); }
      }
      /* Real time only: the warm-up (stage.warmTick: Earth texture, then glyph caches and particle targets) also runs in
       * the idle time between frames, a slice at a time while the frame budget allows, so `ready` comes sooner
       * (spec §4.15). It starts from frame(), i.e. after a real animation frame, and stops in manual-clock mode, so the
       * golden runs (RAF stubbed, manual clock) and the stage's tick order are untouched.
       * ADDITION to spec §4.10's boot sequence, pending the lead's amendment: with the warm-up only inside stage.tick
       * (§4.5 step 9, one slice per frame as today) `ready` came 2.5–3.4 s after the page opened on this M2 (median
       * 3.15 s at 1920×1080, over the 3 s budget of §4.15 in 8 of 16 runs). With the idle slices it is 1.02–1.10 s. */
      var idleId = 0;
      function requestIdle(fn) {
        return typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(function () { fn(null); }, 50);
      }
      function cancelIdle() {
        if (!idleId) return;
        try { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId); else clearTimeout(idleId); } catch (e) { }
        idleId = 0;
      }
      function idleWarm(dl) {
        idleId = 0;
        if (dead || manual || stage.isWarm()) return;
        var t0 = performance.now(), left = function () { return dl ? dl.timeRemaining() : 8 - (performance.now() - t0); };
        while (!stage.isWarm() && left() > 6) stage.warmTick();      // one slice is ≤ 4 ms of work
        if (!stage.isWarm()) idleId = requestIdle(idleWarm);
      }

      var gotoBuf = null, gotoTimer;
      function showGoto() {
        clearTimeout(gotoTimer);
        if (gotoBuf == null) { H.goto(null); return; }
        H.goto('GO TO ' + gotoBuf + '_  / ' + deck().length);
        gotoTimer = setTimeout(function () { gotoBuf = null; showGoto(); }, 5000);
      }
      function keysHere() {              // with a container: only when the focus is inside it or on <body>
        if (!container) return true;
        var ae = document.activeElement;
        return !ae || ae === document.body || ae === document.documentElement || container.contains(ae);
      }
      function onKey(e) {
        if (editable(e.target) || !keysHere()) return;
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
          case 'Home': e.preventDefault(); home(); return;
          case 'End': e.preventDefault(); end(); return;
          case 'f': case 'F': showFps = !showFps; H.showFps(showFps); return;
          case 'b': case 'B': case '.': blackout(); return;
          case 'r': case 'R': replay(); return;
          case 'n': case 'N': openNotes(); return;
          case 'g': case 'G': gotoBuf = ''; showGoto(); return;
          case 'q': case 'Q': stage.quality = stage.quality >= 2 ? 1 : stage.quality + 0.5; resize(); toast('QUALITY ' + stage.quality + 'x'); return;
        }
      }
      /* N: the same page with ?notes, in a window of its own with no opener (noopener), so it runs in its own process
       * and talks to this stage over BroadcastChannel. Not with sync off (nothing could drive it).
       * DEVIATION from the letter of spec §4.10, pending the lead's amendment (R18): §4.10 says
       * window.open(url, '_blank', 'noopener,popup,width=1200,height=760'). That call blocks the calling page until the
       * browser has built the new window: 52–216 ms per call (Playwright's Chromium 141 and Google Chrome 155, headless
       * and headed). The stage's frame gap at that moment was 33–333 ms, over the 50 ms limit of WP1 acceptance #4 and
       * stall.js in 5 of 8 runs.
       * Instead N shift-clicks a target="_blank" rel="noopener" link. That is a "new window" link navigation the browser
       * opens on its own, asynchronously: the stage keeps its normal frame gaps (under 19 ms in both browsers). It passes
       * the popup blocker on the key press's user activation, like window.open, and is blocked without one. The cost: the
       * window opens at the browser's normal size, not as a 1200×760 popup (a normal window cannot resizeTo itself). A
       * browser that ignores the modifier on a synthetic click still opens the link in a new tab with no opener. */
      function openNotes() {
        if (!sy || dead) return;
        var a = document.createElement('a'), host = document.body || document.documentElement;
        a.href = location.href.split(/[?#]/)[0] + '?notes';
        a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
        host.appendChild(a);
        try { a.dispatchEvent(new MouseEvent('click', { shiftKey: true, cancelable: true, view: window })); } catch (e) { }
        if (a.parentNode) a.parentNode.removeChild(a);
        later(broadcast, 500); later(broadcast, 1500);
      }
      function parseHash() {
        var m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash || '');
        if (!m) return null;
        var si = U.clamp(+m[1] - 1, 0, deck().length - 1);
        return { slide: si, step: U.clamp(+(m[2] || 0), 0, steps(si)) };
      }

      var api = {
        info: function () {
          return deck().map(function (s, i) {
            var o = { id: s.id, steps: steps(i), dwell: s.dwell }, sd = stepDwellOf(s);
            if (sd) o.stepDwell = sd;
            if (s.beat != null) o.beat = s.beat;
            return o;
          });
        },
        isBusy: function () { return stage.busy(); },
        next: next, prev: prev, goTo: goTo, finish: function () { stage.finishAll(); },
        state: function () { return { slide: stage.cur.slide, step: stage.cur.step, particles: stage.field.list.length, busy: stage.busy(), fps: fps, workMs: work, ready: isReady() }; },
        setManualClock: function (v) { manual = !!v; },
        tick: function (dt) { stage.tick(dt); stage.draw(); if (!readySent) checkReady(); },
        advance: function (dt) { stage.tick(dt); if (!readySent) checkReady(); },
        warmAll: function () { stage.warmAll(); checkReady(); },
        snapshot: function (type) { return stage.canvas.toDataURL(type || 'image/png'); },
        deck: function () { return { id: stage.deck.id, meta: stage.deck.meta }; }
      };
      Object.defineProperty(api, 'ready', { enumerable: true, get: isReady });

      function destroy() {
        if (dead) return;
        dead = true;
        if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) { } }
        cancelIdle();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = []; stateFns = [];
        timers.forEach(clearTimeout); clearTimeout(gotoTimer); clearTimeout(curT);
        if (ro) { try { ro.disconnect(); } catch (e) { } }
        if (sy) sy.close();
        H.remove();
        stage.destroy();
        if (ownCanvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (window.PixelDeck === api) { try { delete window.PixelDeck; } catch (e) { window.PixelDeck = undefined; } }
      }

      var player = {
        stage: null, api: api, sync: sy, hud: H,
        next: next, prev: prev, goTo: goTo, replay: replay, blackout: blackout, home: home, end: end, openNotes: openNotes,
        setManualClock: api.setManualClock, tick: api.tick, advance: api.advance, info: api.info, state: api.state,
        onState: function (fn) {
          stateFns.push(fn);
          return function off() { var i = stateFns.indexOf(fn); if (i >= 0) stateFns.splice(i, 1); };
        },
        destroy: destroy
      };
      Object.defineProperty(player, 'ready', { enumerable: true, get: isReady });

      var ro = null;
      try {
        stage = player.stage = new Stage(canvas, { deck: compiled });                                    // 5
        var q = new URLSearchParams(location.search);                                                    // 6
        if (opts.quality != null) stage.quality = +opts.quality;
        if (q.get('quality')) stage.quality = +q.get('quality');
        if (q.get('auto')) auto = +q.get('auto') || 4;
        if (q.get('loop')) loop = true;
        if (q.get('fps')) { showFps = true; H.showFps(true); }
        var h = (on('hash') && parseHash()) || { slide: 0, step: 0 };
        stage.preload();              // 7: each world's preload (cosmos: the theme's nebula palettes, galaxy)
        Glow.prebuild();
        stage.prepare(deck()[h.slide]);   // 8: each world's prepare (planet: Earth buffer; generated now if this scene shows it)
        resize();                                                                                        // 9
        listen(window, 'resize', resize);                                                                // 10
        if (container && typeof ResizeObserver === 'function') { ro = new ResizeObserver(resize); ro.observe(container); }
        if (on('input')) {
          listen(window, 'keydown', onKey);
          listen(canvas, 'click', function (e) { e.preventDefault(); next(); });
          listen(canvas, 'contextmenu', function (e) { e.preventDefault(); prev(); });
          listen(window, 'mousemove', function () {   // the pointer shows while it moves, and hides again after 1.5 s
            canvas.style.cursor = 'default'; clearTimeout(curT);
            curT = setTimeout(function () { canvas.style.cursor = 'none'; }, 1500);
          });
        }
        if (on('hash')) listen(window, 'hashchange', function () { var h = parseHash(); if (h && (h.slide !== stage.cur.slide || h.step !== stage.cur.step)) goTo(h.slide, h.step); });
        if (sy) sy.on(function (msg) {
          if (msg.type === 'hello') { broadcast(); return; }
          if (msg.type !== 'cmd') return;
          if (msg.target != null && msg.target !== sy.id) return;      // a command for another stage of this deck
          if (msg.cmd === 'next') next(); else if (msg.cmd === 'prev') prev(); else if (msg.cmd === 'blackout') blackout();
          else if (msg.cmd === 'replay') replay(); else if (msg.cmd === 'goto') goTo(msg.slide, msg.step || 0);
        });
        stage.onEnter = afterEnter;
        stage.cur = { slide: -1, step: 0 };
        stage.setWorld(stage.resolve(h.slide, h.step).world, null, 0, null, true);   // 11: open on the right sky, no fade from defaults
        if (h.step === 0) stage.enter(h.slide, 0, 'live');                                               // 12
        else stage.enter(h.slide, h.step, 'settled');
        if (on('raf')) rafId = requestAnimationFrame(frame);                                             // 13
        booted = true;
        if (on('api')) window.PixelDeck = api;                                                           // 14
        var issues = problems(compiled, report);
        if (issues.length) { try { console.warn(issues.join('\n')); } catch (e) { } H.error(issues); }
        return player;
      } catch (e) {           // a boot that throws half-way leaves no listener, loop or stage behind
        dead = true;
        if (rafId) { try { cancelAnimationFrame(rafId); } catch (e2) { } }
        cancelIdle();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = [];
        if (ro) { try { ro.disconnect(); } catch (e2) { } }
        if (stage) stage.destroy();
        throw e;
      }
    }
  }

  /* ------------------------------------------------------------ PD.start */
  function modeOf(opts) {
    var q = (typeof location !== 'undefined' && location.search) || '';
    return opts.mode || (/[?&]notes\b/.test(q) ? 'notes' : /[?&]export\b/.test(q) ? 'register-only' : 'stage');
  }
  function start(deckId, opts) {
    opts = opts || {};
    var mode = modeOf(opts), o = {}, k;
    for (k in opts) if (has(opts, k) && k !== 'mode') o[k] = opts[k];
    if (deckId != null) o.deck = deckId;
    if (mode === 'register-only') return Promise.resolve(null);
    if (window.PD_SELFTEST) return selfTest(o);
    var label = o.deck != null ? 'deck "' + o.deck + '"' : 'the deck';
    var run = mode === 'notes' ? function () {
      if (typeof PD.notes !== 'function') throw new Error('pixeldeck: the presenter notes (engine/core/notes.js) are not loaded');
      return PD.notes(o);
    } : function () { return boot(o); };
    return Promise.resolve().then(run).catch(function (e) {
      PD.fail('pixeldeck: ' + (mode === 'notes' ? 'the presenter page for ' + label : label) + ' could not start\n\n' + (e && e.stack ? e.stack : String(e)));
      throw e;
    });
  }

  /* The export self-test (spec §3.6): render every state once, report what threw. Never rejects. */
  function selfTest(o) {
    var t0 = performance.now(), errors = [];
    function post(ok) {
      var msg = { type: 'pd-selftest', ok: ok, errors: errors, ms: Math.round(performance.now() - t0) };
      try { (window.parent && window.parent !== window ? window.parent : window).postMessage(msg, '*'); } catch (e) { }
      return msg;
    }
    var b = { raf: false, input: false, hash: false, sync: false, api: false, hud: false };
    for (var k in o) if (has(o, k) && !has(b, k)) b[k] = o[k];
    return Promise.resolve().then(function () { return boot(b); }).then(function (p) {
      var st = p.stage, sc = st.deck.scenes;
      (st.deck.errors || []).forEach(function (is) { errors.push({ slide: is.scene, step: 0, msg: is.msg }); });
      for (var si = 0; si < sc.length; si++) {
        for (var k = 0; k <= st.stepsOf(si); k++) {
          try { st.still(si, k); } catch (e) { errors.push({ slide: si, step: k, msg: String(e && e.message || e) }); }
        }
      }
      p.destroy();
      return post(!errors.length);
    }, function (e) {
      errors.push({ slide: -1, step: 0, msg: String(e && e.message || e) });
      return post(false);
    });
  }

  PD.boot = boot;
  return { boot: boot, start: start, selfTest: selfTest, editable: editable };
});
