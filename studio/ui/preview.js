/* studio/ui/preview.js — the live preview of the storyboard workspace (spec §7.3 "Preview", WP7).
 *
 *   PD.get('studio/ui/preview').create(opts) → Preview
 *     opts = { onRehearse(), onStep(step) → called when a pip is clicked, readOnly?: bool }
 *   Preview = {
 *     el                      the root element (the 16:9 frame and the transport bar below it)
 *     bindColumn(colEl, reservePx)   keep the frame small enough that reservePx of the column stays free below it
 *     setDeck(compiled, evt?) → Promise    a changed deck: same theme → stage.setDeck(compiled, { changed }); a new theme or
 *                                          world list → the Stage is recreated. Resolves when the stage shows the new deck.
 *     show(si, step, mode)    enter a state: 'settled' (default) | 'instant' | 'live'
 *     playIn(si)              enter(si-1, last, 'instant'), then enter(si, 0, 'live'): the real transition from the last shot
 *     replayStep()            play the current click again (state 0: the same as playIn)
 *     nextClick()             enter(si, step+1, 'live') while the scene has clicks left
 *     cur() → { slide, step } | null      where the stage is now
 *     safeArea(on?) → bool    the 5% title-safe box, the letterbox lines at 138 px and the measured text boxes (red on overflow)
 *     stats() → { fps, ms, particles, busy }     fps overlay: press F
 *     whenIdle() → Promise    the stage has settled
 *     stage                   the PD.Stage (or null while the first build waits for assets)
 *     destroy() }
 * The preview owns a PD.Stage directly (no Player, no window listeners) and its own animation-frame loop, which stops while the
 * page is hidden. The Stage is recreated whenever the theme changes (spec §7.3). */
PD.module('studio/ui/preview', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var DW = 1920, DH = 1080;

  var CSS = [
    '.pv { display: flex; flex-direction: column; gap: 10px; min-width: 0; --pv-maxh: 420px; }',
    '.pv-frame { position: relative; width: min(100%, calc(var(--pv-maxh) * 16 / 9)); aspect-ratio: 16 / 9; margin: 0 auto; border-radius: 14px; overflow: hidden; background: #000;',
    '  box-shadow: 0 0 0 1px rgba(148, 176, 194, .14), 0 22px 60px rgba(2, 4, 12, .55); isolation: isolate; }',
    '.pv-frame canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }',
    '.pv-safe { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; transition: opacity .22s var(--pdx-ease); }',
    '.pv-frame.is-safe .pv-safe { opacity: 1; }',
    '.pv-load { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(110deg, #0b0d1a 30%, #151a30 50%, #0b0d1a 70%); background-size: 220% 100%; animation: pv-shimmer 1.6s linear infinite; color: var(--pdx-muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; transition: opacity .3s; }',
    '.pv-load.is-off { opacity: 0; pointer-events: none; animation: none; }',
    '@keyframes pv-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }',
    '.pv-fps { position: absolute; left: 10px; top: 10px; padding: 4px 9px; border-radius: 6px; font: 600 11px var(--pdx-mono); color: #b6ff6b; background: rgba(5, 8, 20, .8); border: 1px solid #26304a; display: none; }',
    '.pv-frame.is-fps .pv-fps { display: block; }',
    '.pv-live { position: absolute; right: 12px; top: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--pdx-accent); box-shadow: 0 0 0 0 var(--pdx-accent); opacity: 0; transition: opacity .3s; }',
    '.pv-frame.is-busy .pv-live { opacity: .9; animation: pv-pulse 1.2s ease-out infinite; }',
    '@keyframes pv-pulse { to { box-shadow: 0 0 0 9px transparent; } }',
    '.pv-empty { position: absolute; inset: 0; display: none; place-items: center; text-align: center; padding: 24px; color: var(--pdx-muted); background: radial-gradient(120% 120% at 50% 0%, #1b1f38, #0b0d1a); }',
    '.pv-frame.is-empty .pv-empty { display: grid; }',
    '.pv-bar { display: flex; align-items: center; gap: 8px; min-height: 40px; flex-wrap: wrap; }',
    '.pv-bar .sp { flex: 1; min-width: 4px; }',
    '.pv { container-type: inline-size; }',
    '.pv-reh .lb { display: none; } .pv-reh { padding: 0; width: 34px; }',
    '@container (min-width: 560px) { .pv-reh .lb { display: inline; } .pv-reh { padding: 0 14px; width: auto; } }',
    '.pv-pips { display: flex; align-items: center; gap: 2px; padding: 0 6px; }',
    '.pv-pips button { all: unset; box-sizing: border-box; position: relative; width: 22px; height: 28px; display: grid; place-items: center; cursor: pointer; }',
    '.pv-pips button::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--pdx-line); transition: transform .16s var(--pdx-ease), background .16s; }',
    '.pv-pips button::after { content: ""; position: absolute; inset: -8px -1px; }',
    '.pv-pips button:hover::before { transform: scale(1.3); background: var(--pdx-muted); }',
    '.pv-pips button[aria-current="true"]::before { background: var(--pdx-accent); transform: scale(1.25); box-shadow: 0 0 0 4px color-mix(in srgb, var(--pdx-accent) 25%, transparent); }',
    '.pv-pips button.is-past::before { background: color-mix(in srgb, var(--pdx-accent) 45%, var(--pdx-line)); }',
    '.pv-pips button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: -2px; border-radius: 6px; }',
    '.pv-pips .lbl { font: 600 11px var(--pdx-mono); color: var(--pdx-faint); margin-left: 4px; display: none; }',
    '@container (min-width: 600px) { .pv-pips .lbl { display: inline; } }'
  ].join('\n');

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, icon = f.icon;
    f.ensureBase(); f.css('preview', CSS);
    var util = PD.get('core/util'), glow = PD.get('core/glow');

    var canvas = h('canvas', { 'aria-label': 'Scene preview' });
    var safe = f.svg('svg', { class: 'pv-safe', viewBox: '0 0 ' + DW + ' ' + DH, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    var load = h('div', { class: 'pv-load', text: 'Warming up the stage' });
    var fpsEl = h('div', { class: 'pv-fps' });
    var empty = h('div', { class: 'pv-empty' }, [h('div', null, [h('div', { style: 'font-size:15px;font-weight:600;color:var(--pdx-text);margin-bottom:6px', text: 'Nothing to show yet' }), h('div', { text: 'Add a scene and it plays here.' })])]);
    var frame = h('div', { class: 'pv-frame' }, [canvas, safe, h('div', { class: 'pv-live' }), fpsEl, load, empty]);

    var bPlay = h('button', { type: 'button', class: 'pdx-btn is-primary', title: 'Play this scene from the shot before it (Space)', onclick: function () { api.playIn(); } }, [icon('play', 15), h('span', { text: 'Play in' })]);
    var bReplay = h('button', { type: 'button', class: 'pdx-btn is-icon', title: 'Replay: play the current click again', 'aria-label': 'Replay', onclick: function () { api.replayStep(); } }, icon('replay', 16));
    var bNext = h('button', { type: 'button', class: 'pdx-btn', title: 'Play the next click of this scene', onclick: function () { api.nextClick(); } }, [icon('next', 16), h('span', { text: 'Click' })]);
    var pips = h('div', { class: 'pv-pips', role: 'group', 'aria-label': 'Clicks in this scene' });
    var bSafe = h('button', { type: 'button', class: 'pdx-btn is-icon', title: 'Safe area and text boxes', 'aria-pressed': 'false', onclick: function () { api.safeArea(!safeOn); } }, icon('safe', 18));
    var bRehearse = h('button', { type: 'button', class: 'pdx-btn pv-reh', title: 'Rehearse full screen', 'aria-label': 'Rehearse full screen', onclick: function () { if (opts.onRehearse) opts.onRehearse(); } }, [icon('expand', 16), h('span', { class: 'lb', text: 'Rehearse' })]);
    var bar = h('div', { class: 'pv-bar' }, [bPlay, bReplay, bNext, pips, h('span', { class: 'sp' }), bSafe, bRehearse]);
    var root = h('div', { class: 'pdx pv' }, [frame, bar]);

    var stage = null, deck = null, dead = false, raf = 0, last = 0, token = 0, safeOn = false, fpsOn = false;
    var fps = 0, ms = 0, frames = 0, acc = 0, ro = null, building = null, wanted = null, waiters = [];

    /* ---------------------------------------------------------- the pips (one per state) */
    function steps(si) { return stage && stage.deck.scenes[si] ? stage.stepsOf(si) : 0; }
    function paintPips() {
      f.clear(pips);
      var c = stage && stage.cur;
      if (!stage || !c || c.slide < 0 || !deck || !deck.scenes[c.slide]) { bPlay.disabled = bReplay.disabled = bNext.disabled = true; return; }
      var n = steps(c.slide);
      for (var k = 0; k <= n; k++) {
        (function (k2) {
          pips.appendChild(h('button', { type: 'button', 'aria-label': k2 === 0 ? 'Opening state' : 'After click ' + k2, 'aria-current': String(k2 === c.step), class: k2 < c.step ? 'is-past' : '',
            title: k2 === 0 ? 'Opening state' : 'After click ' + k2, onclick: function () { if (opts.onStep) opts.onStep(k2); } }));
        })(k);
      }
      pips.appendChild(h('span', { class: 'lbl', text: n ? c.step + '/' + n : '' }));
      bPlay.disabled = bReplay.disabled = false;
      bNext.disabled = c.step >= n;
    }

    /* ---------------------------------------------------------- safe area */
    function paintSafe() {
      f.clear(safe);
      if (!safeOn || !stage || !deck || !stage.cur || stage.cur.slide < 0) return;
      var S = f.svg;
      safe.appendChild(S('rect', { x: DW * 0.05, y: DH * 0.05, width: DW * 0.9, height: DH * 0.9, fill: 'none', stroke: 'rgba(255,255,255,.42)', 'stroke-width': 3, 'stroke-dasharray': '14 10', rx: 6 }));
      [138, DH - 138].forEach(function (y) { safe.appendChild(S('line', { x1: 0, x2: DW, y1: y, y2: y, stroke: 'rgba(255,205,117,.5)', 'stroke-width': 2.5, 'stroke-dasharray': '4 9' })); });
      safe.appendChild(S('text', { x: DW * 0.05 + 14, y: DH * 0.05 + 40, fill: 'rgba(255,255,255,.6)', 'font-size': 26, 'font-family': 'ui-monospace, Menlo, monospace', text: 'TITLE SAFE 5%' }));
      var E = PD.element.get('text');
      if (!E) return;
      var th = deck.theme, env = { theme: th, col: util.colFor(th.colors), assets: function () { return null; } };
      var R;
      try { R = stage.resolve(stage.cur.slide, stage.cur.step); } catch (e) { return; }
      R.texts.forEach(function (it) {
        try {
          var m = E.measure(it.spec, env), st = th.styles[it.spec.style || 'title'] || {}, maxW = it.spec.maxWidth != null ? it.spec.maxWidth : st.maxWidth != null ? st.maxWidth : 1700;
          var bad = m.w > maxW + 0.5 || m.x < 0 || m.y < 0 || m.x + m.w > DW || m.y + m.h > DH;
          var out = m.x < DW * 0.05 || m.y < DH * 0.05 || m.x + m.w > DW * 0.95 || m.y + m.h > DH * 0.95;
          var col = bad ? '#ff7b8a' : out ? '#ffcd75' : '#73eff7';
          safe.appendChild(S('rect', { x: m.x - 8, y: m.y - 8, width: m.w + 16, height: m.h + 16, fill: bad ? 'rgba(255,123,138,.12)' : 'none', stroke: col, 'stroke-width': bad ? 4 : 2.5, rx: 6, 'stroke-dasharray': bad ? null : '3 6' }));
        } catch (e) { }
      });
    }

    /* ---------------------------------------------------------- the stage */
    function dprFor() { return Math.min(window.devicePixelRatio || 1, stage ? stage.quality : 1.5); }
    function resize() {
      if (!stage || dead) return;
      var r = frame.getBoundingClientRect();
      if (r.width < 8) return;
      stage.resize(r.width, r.height, dprFor());
    }
    function themeChanged(next) {
      if (!deck) return true;
      return next.themeKey !== deck.themeKey || JSON.stringify(next.worlds) !== JSON.stringify(deck.worlds);
    }
    function settle() { var w = waiters; waiters = []; w.forEach(function (fn) { fn(); }); }

    function build(compiled, at) {
      var mine = ++token;
      load.classList.remove('is-off');
      var aid = compiled.assetsDeckId || compiled.id, faces = compiled.theme.fontFaces && compiled.theme.fontFaces.length ? compiled.theme.fontFaces : null;
      return PD.assets.ready(aid, faces ? { fontFaces: faces } : undefined).then(function () {
        if (dead || mine !== token) return;
        if (stage) { try { stage.destroy(); } catch (e) { } }
        deck = compiled;
        stage = new PD.Stage(canvas, { deck: compiled });
        var want = wanted || at; wanted = null;                          // a selection made while the assets were loading wins
        if (want.id != null) { var wi = compiled.scenes.findIndex(function (x) { return x.id === want.id; }); if (wi >= 0) want = { slide: wi, step: want.step }; }
        var n = compiled.scenes.length, si = Math.max(0, Math.min(want.slide, n - 1)), st = n ? Math.max(0, Math.min(want.step, stage.stepsOf(si))) : 0;
        stage.preload(); glow.Glow.prebuild(); stage.prepare(n ? compiled.scenes[si] : {});
        resize();
        frame.classList.toggle('is-empty', !n);
        if (n) {
          stage.setWorld(stage.resolve(si, st).world, null, 0, null, true);
          stage.onEnter = onEnter;
          stage.enter(si, st, 'settled');
        } else { stage.onEnter = onEnter; paintPips(); }
        load.classList.add('is-off');
        startLoop();
      });
    }
    function onEnter() { paintPips(); paintSafe(); }
    // Nothing on stage, on the first scene's sky: how a talk opens (the Player's boot does the same: "no fade from defaults").
    // Public Stage API only: swap in a deck of one empty scene, still() it (that resets layers, particles and caches), swap the
    // real deck back and put the world straight to scene 1. onEnter is muted so the pips and the safe-area boxes do not repaint
    // for the empty scene.
    function blankStage() {
      var keep = stage.onEnter, blank = {}, k;
      for (k in deck) if (Object.prototype.hasOwnProperty.call(deck, k)) blank[k] = deck[k];
      blank.scenes = [{ id: '__blank', text: [] }];
      stage.onEnter = null;
      try { stage.setDeck(blank); stage.still(0, 0); stage.setDeck(deck); stage.setWorld(stage.resolve(0, 0).world, null, 0, null, true); }
      finally { stage.onEnter = keep; }
    }

    function frameFn(ts) {
      raf = requestAnimationFrame(frameFn);
      if (!stage || dead) return;
      if (document.hidden) { last = 0; return; }
      var raw = last ? ts - last : 16.7;
      last = ts;
      var dt = Math.min(0.05, raw / 1000), t0 = performance.now();
      stage.tick(dt);
      stage.draw();
      ms = ms * 0.93 + (performance.now() - t0) * 0.07;
      stage.adapt(ms);
      frames++; acc += raw;
      if (acc > 500) {
        fps = frames * 1000 / acc; frames = 0; acc = 0;
        if (fpsOn) fpsEl.textContent = fps.toFixed(0) + ' fps · ' + ms.toFixed(1) + ' ms · ' + stage.field.list.length + ' particles';
        var busy = stage.busy();
        frame.classList.toggle('is-busy', busy);
        if (!busy && waiters.length) settle();
      }
    }
    function startLoop() { if (!raf) raf = requestAnimationFrame(frameFn); }

    /* ---------------------------------------------------------- the API */
    var api = {
      el: root, frame: frame, canvas: canvas,
      get stage() { return stage; },
      bindColumn: function (col, reserve, extra) {
        if (ro) ro.disconnect();
        function size() {
          var r = col.getBoundingClientRect(), res = typeof reserve === 'function' ? reserve() : (reserve || 0);
          root.style.setProperty('--pv-maxh', Math.max(140, r.height - res - bar.offsetHeight - 10) + 'px'); resize(); paintSafe();
        }
        ro = new ResizeObserver(size); ro.observe(col); ro.observe(frame); if (extra) ro.observe(extra);
        size();
      },
      setDeck: function (compiled, evt) {
        evt = evt || {};
        var shown = stage && stage.cur && stage.cur.slide >= 0 && deck && deck.scenes[stage.cur.slide] ? deck.scenes[stage.cur.slide].id : null;     // the scene on stage now, by id
        var at = stage && stage.cur && stage.cur.slide >= 0 ? { slide: stage.cur.slide, step: stage.cur.step } : { slide: 0, step: 0 };
        if (evt.at) at = evt.at;
        if (!stage || themeChanged(compiled) || evt.rebuild) { if (!stage && wanted) at = wanted; else wanted = null; building = build(compiled, at); return building; }
        deck = compiled;
        stage.setDeck(compiled, { changed: evt.changedSceneIds || null });
        frame.classList.toggle('is-empty', !compiled.scenes.length);
        if (compiled.scenes.length) {
          var si = Math.max(0, Math.min(at.slide, compiled.scenes.length - 1)), st = Math.max(0, Math.min(at.step, stage.stepsOf(si)));
          var id = compiled.scenes[si].id, same = shown != null && shown === id, edited = (evt.changedSceneIds || []).indexOf(id) >= 0;
          // the scene on stage is untouched by this change: leave it playing; an edit (or a move to another scene) re-enters it settled
          // (spec §7.3 "Field edit"), which morphs the old words into the new ones in a moment; only an explicit evt.instant snaps
          if (!(same && !edited && !evt.structural && !evt.theme && stage.cur.slide === si)) stage.enter(si, st, evt.instant ? 'instant' : 'settled');
          else paintPips();
        } else { stage.still(0, 0); paintPips(); }          // no scene left: still() resets layers and particles, and enters nothing
        return Promise.resolve();
      },
      show: function (si, step, mode) {
        if (!stage) { wanted = { slide: si, step: step }; return; }
        if (!deck || !deck.scenes.length) return;
        si = Math.max(0, Math.min(si, deck.scenes.length - 1)); step = Math.max(0, Math.min(step || 0, stage.stepsOf(si)));
        if (mode === 'live') { stage.finishAll(); stage.enter(si, step, 'live'); return; }
        stage.enter(si, step, mode || 'settled');
      },
      showId: function (id, step, mode) {          // a scene by id: safe while the deck is about to change under the selection
        if (!stage) { wanted = { slide: 0, step: step || 0, id: id }; return; }
        var si = deck.scenes.findIndex(function (x) { return x.id === id; });
        if (si >= 0) api.show(si, step, mode);
      },
      deck: function () { return deck; },
      playIn: function (si) {
        if (!stage || !deck || !deck.scenes.length) return;
        si = si == null ? stage.cur.slide : si;
        if (si < 0) si = 0;
        stage.finishAll();
        if (si > 0) stage.enter(si - 1, stage.stepsOf(si - 1), 'instant');
        else blankStage();
        stage.enter(si, 0, 'live');
        if (opts.onPlayed) opts.onPlayed(si, 0);
      },
      replayStep: function () {
        if (!stage || !deck || !deck.scenes.length) return;
        var si = stage.cur.slide, k = stage.cur.step;                  // stage.cur is one object the stage rewrites on every enter
        if (k === 0) return api.playIn(si);
        stage.finishAll();
        stage.enter(si, k - 1, 'instant');
        stage.enter(si, k, 'live');
      },
      nextClick: function () {
        if (!stage || !deck || !deck.scenes.length) return;
        var si = stage.cur.slide, k = stage.cur.step;
        if (k >= stage.stepsOf(si)) return;
        stage.finishAll();
        stage.enter(si, k + 1, 'live');
        if (opts.onPlayed) opts.onPlayed(si, k + 1);
      },
      cur: function () { return stage && stage.cur && stage.cur.slide >= 0 ? { slide: stage.cur.slide, step: stage.cur.step } : null; },
      safeArea: function (on) {
        if (on === undefined) return safeOn;
        safeOn = !!on; frame.classList.toggle('is-safe', safeOn); bSafe.setAttribute('aria-pressed', String(safeOn)); bSafe.classList.toggle('is-on', safeOn);
        paintSafe(); return safeOn;
      },
      toggleFps: function () { fpsOn = !fpsOn; frame.classList.toggle('is-fps', fpsOn); if (fpsOn) fpsEl.textContent = '…'; return fpsOn; },
      stats: function () { return { fps: fps, ms: ms, particles: stage ? stage.field.list.length : 0, busy: stage ? stage.busy() : false }; },
      whenIdle: function () { return new Promise(function (res) { if (!stage || !stage.busy()) res(); else waiters.push(res); }); },
      whenReady: function () { return building || Promise.resolve(); },
      refreshSafe: paintSafe, paintPips: paintPips,
      destroy: function () {
        dead = true; token++;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (ro) ro.disconnect();
        if (stage) { try { stage.destroy(); } catch (e) { } stage = null; }
        deck = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    paintPips();
    window.addEventListener('resize', onWin);
    function onWin() { resize(); }
    var destroy0 = api.destroy;
    api.destroy = function () { window.removeEventListener('resize', onWin); destroy0(); };
    return api;
  }

  return { create: create };
}, { export: false });
