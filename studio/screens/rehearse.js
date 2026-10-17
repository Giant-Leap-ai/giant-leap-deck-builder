/* studio/screens/rehearse.js — step ⑤ Rehearse (spec §7.4, WP7).
 *
 *   Studio.screen('rehearse', { title: 'Rehearse', rail: 5, mount(el, ctx) → { unmount } })
 * The screen opens on a calm run-of-show: the scenes with their planned minutes, the keys, and two ways to begin (from the
 * start, or from the scene you were editing). Starting runs PD.boot({ compiled, container, hash: false, sync: false,
 * api: false, hud: true }) in a container that goes full screen (the Fullscreen API; a fixed full-window layer when the
 * browser refuses). The Player's own keys drive the deck (→ ↓ PageDown Space next, ← ↑ PageUp back, B blackout, R replay,
 * G go to, F fps), so a clicker works as it will on the day.
 *   N        toggle the overlay strip: the notes of this moment, the next scene, a stopwatch for this scene and the total
 *            against the slot (targetMin)
 *   Esc      back to the storyboard, with the selection set to the last state shown (browsers send Esc to the page only
 *            when not in full screen; leaving full screen does the same)
 * There is no presenter window here: blob: windows cannot use BroadcastChannel and about:blank shares this thread. To rehearse
 * with a presenter, rehearse the saved .html (spec §7.4).
 * The module exports { def, pending, current }: pending = true asks the next mount to start by itself (the board's Rehearse
 * button sets it, so the click that opened the screen also opens full screen). */
PD.module('studio/screens/rehearse', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var PREFS = 'pdstudio:v1:ui:rehearse';
  var api = { def: null, pending: false, current: null };

  var CSS = [
    '.rh { position: relative; height: 100%; min-height: 520px; display: grid; place-items: center; padding: 28px 24px; overflow: auto; background: radial-gradient(1000px 520px at 50% -12%, color-mix(in srgb, var(--pdx-accent) 10%, transparent), transparent 72%); }',
    '.rh-wrap { width: min(1040px, 100%); display: grid; grid-template-columns: minmax(300px, 420px) minmax(0, 1fr); gap: 28px; align-items: start; }',
    '.rh-card { display: flex; flex-direction: column; gap: 18px; }',
    '.rh-card h1 { margin: 0; font-size: 32px; line-height: 1.12; letter-spacing: -.025em; font-weight: 720; }',
    '.rh-card p { margin: 0; color: var(--pdx-muted); font-size: 14.5px; line-height: 1.55; }',
    '.rh-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }',
    '.rh-stat { padding: 12px 14px; border-radius: 13px; background: color-mix(in srgb, var(--pdx-panel) 70%, transparent); border: 1px solid var(--pdx-hair-2); }',
    '.rh-stat b { display: block; font: 700 22px var(--pdx-mono); letter-spacing: -.02em; } .rh-stat span { font-size: 11.5px; color: var(--pdx-faint); }',
    '.rh-stat.is-over b { color: var(--pdx-warn); }',
    '.rh-go { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }',
    '.rh-keys { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; font-size: 12.5px; color: var(--pdx-muted); padding: 14px 16px; border-radius: 13px; background: color-mix(in srgb, var(--pdx-panel) 55%, transparent); border: 1px solid var(--pdx-hair-2); }',
    '.rh-keys .k { display: flex; gap: 5px; flex-wrap: wrap; }',
    '.rh-run { border-radius: 16px; background: color-mix(in srgb, var(--pdx-panel) 62%, transparent); border: 1px solid var(--pdx-hair-2); overflow: hidden; display: flex; flex-direction: column; max-height: min(560px, calc(100vh - 220px)); min-height: 240px; }',
    '.rh-run > header { flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 18px 10px; } .rh-run > header .sp { flex: 1; } .rh-run > header small { font: 600 11px var(--pdx-mono); color: var(--pdx-faint); }',
    '.rh-list { overflow: auto; padding: 0 8px 12px; scrollbar-width: thin; scrollbar-color: var(--pdx-line) transparent; }',
    '.rh-row { display: grid; grid-template-columns: 26px 10px minmax(0, 1fr) 54px 54px; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; }',
    '.rh-row:hover { background: var(--pdx-raise); } .rh-row.is-from { background: color-mix(in srgb, var(--pdx-accent) 12%, transparent); }',
    '.rh-row .n { font: 600 11px var(--pdx-mono); color: var(--pdx-faint); } .rh-row i { display: block; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }',
    '.rh-row .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rh-row .t small { color: var(--pdx-faint); margin-left: 8px; }',
    '.rh-row .m { font: 500 11.5px var(--pdx-mono); color: var(--pdx-muted); text-align: right; } .rh-row .c { font: 500 11.5px var(--pdx-mono); color: var(--pdx-faint); text-align: right; }',
    // the host also gets the Player's class (.pd-player { position: relative }, injected by core/hud.js after this sheet), so the
    // layer rule names both classes to win on specificity, not on order; start() sets the same box inline as well
    '.pdx.rh-stage, .pdx.rh-stage.pd-player { position: fixed; inset: 0; z-index: 9000; background: #000; }',
    '.rh-strip { position: absolute; left: 22px; right: 22px; bottom: 20px; z-index: 5; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto; gap: 22px; align-items: stretch; padding: 16px 20px; border-radius: 18px;',
    '  background: rgba(14, 16, 32, .84); backdrop-filter: blur(14px); border: 1px solid rgba(148, 176, 194, .2); box-shadow: 0 20px 60px rgba(0,0,0,.6); color: #f4f4f4; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;',
    '  transition: opacity .25s ease, transform .3s cubic-bezier(.2,.8,.2,1); }',
    '.rh-strip.is-off { opacity: 0; transform: translateY(16px); pointer-events: none; }',
    '.rh-strip .cap { font: 650 10.5px/1.2 -apple-system, sans-serif; text-transform: uppercase; letter-spacing: .1em; color: #94b0c2; margin-bottom: 6px; display: flex; gap: 8px; }',
    '.rh-strip .cap em { font-style: normal; color: #8396b3; }',
    '.rh-notes .txt { font-size: 18px; line-height: 1.45; max-height: 4.4em; overflow: auto; white-space: pre-wrap; } .rh-notes .txt.is-empty { color: #8396b3; font-style: italic; font-size: 15px; }',
    '.rh-next .t { font-size: 15px; font-weight: 620; } .rh-next .s { color: #94b0c2; font-size: 12.5px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.rh-clock { text-align: right; min-width: 150px; } .rh-clock .big { font: 700 34px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }',
    '.rh-clock .big.is-over { color: #ffcd75; } .rh-clock small { display: block; margin-top: 6px; font: 500 12px ui-monospace, Menlo, monospace; color: #94b0c2; } .rh-clock small.is-over { color: #ffcd75; }',
    '.rh-exit { position: absolute; right: 22px; top: 18px; z-index: 6; opacity: 0; transition: opacity .25s; } .rh-stage:hover .rh-exit, .rh-exit:focus-visible { opacity: 1; }',
    '.rh-hint { position: absolute; left: 50%; top: 24px; transform: translateX(-50%); z-index: 6; width: max-content; max-width: min(720px, calc(100% - 48px)); text-align: center; padding: 8px 18px; border-radius: 20px; background: rgba(14,16,32,.82); color: #cfe0ee; font: 500 13px/1.45 -apple-system, sans-serif; border: 1px solid rgba(148,176,194,.2); transition: opacity .6s; pointer-events: none; }',
    '@media (max-width: 980px) { .rh-wrap { grid-template-columns: 1fr; } .rh-strip { grid-template-columns: 1fr auto; } .rh-next { display: none; } }'
  ].join('\n');

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { } }

  function mount(el, ctx) {
    var f = F(), h = f.h, icon = f.icon, store = ctx.store, ui = ctx.ui || {}, S = PD.story;
    f.ensureBase(); f.css('rehearse', CSS);
    var prefs = loadPrefs(), dead = false, running = null, offs = [];
    var wantAuto = api.pending; api.pending = false;

    var c = store.compiled(), infos = f.describeScenes(c, store.lint(), { readOnly: !!store.get().studio.readOnly });
    var tm = store.timing(), timing;
    try { timing = tm ? S.retime(c, tm) : S.estimate(c); } catch (e) { timing = null; }
    var fw = f.frameworkOf(c), tgt = (f.storyOf(c) || {}).targetMin ? +f.storyOf(c).targetMin : null;
    var sel = store.selection(), selIdx = Math.max(0, infos.findIndex(function (x) { return x.id === sel.sceneId; }));
    var total = timing ? timing.total : 0;

    /* ---------------------------------------------------------- the run of show */
    var rows = infos.map(function (inf, i) {
      var ts = timing && timing.scenes[i];
      return h('div', { class: 'rh-row' + (i === selIdx && selIdx > 0 ? ' is-from' : ''), dataset: { scene: inf.id } }, [
        h('span', { class: 'n', text: (i < 9 ? '0' : '') + (i + 1) }), h('i', { style: { '--c': inf.color } }),
        h('span', { class: 't' }, [inf.beat ? inf.beat.label : inf.label, h('small', { text: inf.beat ? inf.label : '' })]),
        h('span', { class: 'm', text: ts ? f.fmtClock(ts.sec) : '' }), h('span', { class: 'c', text: ts ? f.fmtClock(ts.start) : '' })]);
    });
    var over = tgt && total > tgt * 60 * 1.15;
    var stats = h('div', { class: 'rh-stats' }, [
      h('div', { class: 'rh-stat' }, [h('b', { text: String(infos.length) }), h('span', { text: infos.length === 1 ? 'scene' : 'scenes' })]),
      h('div', { class: 'rh-stat' + (over ? ' is-over' : '') }, [h('b', { text: (tm && timing && timing.exact ? '' : '≈ ') + f.fmtClock(total) }), h('span', { text: 'planned run' })]),
      h('div', { class: 'rh-stat' }, [h('b', { text: tgt ? f.fmtClock(tgt * 60) : '–' }), h('span', { text: tgt ? 'your slot' : 'no slot set' })])]);
    var startBtn = h('button', { type: 'button', class: 'pdx-btn is-primary is-lg', dataset: { act: 'start' }, onclick: function () { start(0); } }, [icon('play', 16), h('span', { text: 'Start from the beginning' })]);
    var fromBtn = selIdx > 0 ? h('button', { type: 'button', class: 'pdx-btn is-lg', dataset: { act: 'start-from' }, onclick: function () { start(selIdx); } }, [icon('next', 16), h('span', { text: 'Start from scene ' + (selIdx + 1) + (infos[selIdx].beat ? ', ' + infos[selIdx].beat.label : '') })]) : null;
    var backBtn = h('button', { type: 'button', class: 'pdx-btn is-quiet', onclick: function () { ctx.nav('board'); } }, [icon('chevL', 15), h('span', { text: 'Back to the storyboard' })]);
    function key(label) { return h('span', { class: 'pdx-kbd', text: label }); }
    var keys = h('div', { class: 'rh-keys' }, [
      h('span', { class: 'k' }, [key('→'), key('Space')]), h('span', { text: 'next click or scene' }),
      h('span', { class: 'k' }, [key('←')]), h('span', { text: 'back one' }),
      h('span', { class: 'k' }, [key('N')]), h('span', { text: 'show or hide the notes strip' }),
      h('span', { class: 'k' }, [key('B')]), h('span', { text: 'blackout, for questions' }),
      h('span', { class: 'k' }, [key('Esc')]), h('span', { text: 'back to the storyboard, right where you were' })]);
    var intro = !infos.length
      ? h('p', { text: 'There is nothing to rehearse yet. Build a few scenes first, then come back and say it out loud.' })
      : h('p', { text: 'Stand up, say it out loud, and click through it the way you will on the day. Your notes and a stopwatch sit on a strip you can hide.' });
    var card = h('div', { class: 'rh-card' }, [
      h('div', null, [h('div', { class: 'pdx-cap', style: 'margin-bottom:10px', text: 'Rehearse' }), h('h1', { text: f.storyOf(c) && f.storyOf(c).shortIdea ? f.storyOf(c).shortIdea : (c.meta.title || 'Your talk') })]),
      intro, stats, h('div', { class: 'rh-go' }, infos.length ? [startBtn, fromBtn, backBtn] : [backBtn]), keys]);
    var run = h('section', { class: 'rh-run', 'aria-label': 'Run of show' }, [
      h('header', null, [h('span', { class: 'pdx-cap', text: 'Run of show' }), h('span', { class: 'sp' }), h('small', { text: 'scene · length · starts' })]),
      h('div', { class: 'rh-list' }, rows)]);
    var root = h('div', { class: 'pdx rh', dataset: { screen: 'rehearse' } }, h('div', { class: 'rh-wrap' }, [card, infos.length ? run : null]));
    el.appendChild(root);
    var ac = c.theme && c.theme.ui && c.theme.ui.accent; if (ac) root.style.setProperty('--accent', ac);

    /* ---------------------------------------------------------- running */
    function exitRun(why) {
      var r = running; if (!r) return;
      running = null;
      var st = null;
      try { st = r.player.state(); } catch (e) { }
      document.removeEventListener('fullscreenchange', r.onFs); window.removeEventListener('keydown', r.onKey, true);
      clearInterval(r.timer); clearTimeout(r.hintTimer);
      try { r.off(); } catch (e) { }
      try { r.player.destroy(); } catch (e) { }
      if (r.host.parentNode) r.host.parentNode.removeChild(r.host);
      if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { } }
      var elapsed = (performance.now() - r.t0) / 1000;
      if (st && st.slide >= 0 && c.scenes[st.slide]) { try { store.select(c.scenes[st.slide].id, st.step); } catch (e) { } }
      api.current = null;
      if (!dead && ui.toast) ui.toast('Rehearsed ' + f.fmtClock(elapsed) + (total ? ' against about ' + f.fmtClock(total) + ' planned.' : '.'));
      if (!dead) ctx.nav('board');
    }
    function start(from) {
      if (running || dead || !infos.length) return;
      // a fixed full-window layer in its own right: when the browser refuses full screen it is the whole stage, and it must
      // not depend on which style sheet came last (the Player's HUD sheet makes the container position: relative)
      var host = h('div', { class: 'pdx rh-stage', dataset: { stage: 'rehearse' }, style: { position: 'fixed', top: '0', right: '0', bottom: '0', left: '0', zIndex: '9000' } });
      document.body.appendChild(host);
      var strip, noteTxt, nextT, nextS, clockBig, clockSmall, totBig, hint;
      var run0 = { host: host, t0: performance.now(), tScene: performance.now(), slide: -1, step: 0 };
      var showStrip = prefs.strip !== false;
      function build() {
        noteTxt = h('div', { class: 'txt is-empty', text: 'No notes for this moment.' });
        nextT = h('div', { class: 't' }); nextS = h('div', { class: 's' });
        clockBig = h('div', { class: 'big', text: '0:00' }); clockSmall = h('small'); totBig = h('small');
        strip = h('div', { class: 'rh-strip' + (showStrip ? '' : ' is-off'), dataset: { strip: 'on' } }, [
          h('div', { class: 'rh-notes' }, [h('div', { class: 'cap' }, [h('span', { text: 'Say' }), h('em', { class: 'where' })]), noteTxt]),
          h('div', { class: 'rh-next' }, [h('div', { class: 'cap', text: 'Next' }), nextT, nextS]),
          h('div', { class: 'rh-clock' }, [h('div', { class: 'cap', style: 'justify-content:flex-end', text: 'This scene' }), clockBig, clockSmall, totBig])]);
        host.appendChild(strip);
        host.appendChild(h('button', { type: 'button', class: 'pdx-btn rh-exit', onclick: function () { exitRun('button'); } }, [icon('x', 15), h('span', { text: 'Esc to leave' })]));
        hint = h('div', { class: 'rh-hint', text: 'Click or press → to advance. N shows the notes. Esc leaves.' }); host.appendChild(hint);
        run0.hintTimer = setTimeout(function () { if (hint) hint.style.opacity = '0'; }, 3600);
      }
      function notesOf(si, k) {
        var sc = c.scenes[si] || {}, n = k === 0 ? sc.notes : ((sc.steps || [])[k - 1] || {}).notes;
        return S.speech(n);
      }
      function paintState(st) {
        if (!strip || st.slide < 0) return;
        if (st.slide !== run0.slide) { run0.tScene = performance.now(); }
        run0.slide = st.slide; run0.step = st.step;
        var inf = infos[st.slide], nxt = infos[st.slide + 1], text = notesOf(st.slide, st.step);
        noteTxt.textContent = text || 'No notes for this moment.'; noteTxt.classList.toggle('is-empty', !text);
        strip.querySelector('.where').textContent = '· scene ' + (st.slide + 1) + ' of ' + infos.length + (inf && inf.steps ? ', click ' + st.step + '/' + inf.steps : '');
        if (nxt) { nextT.textContent = (nxt.beat ? nxt.beat.label + ': ' : '') + nxt.label; nextS.textContent = nxt.firstLine || nxt.point || ''; }
        else { nextT.textContent = 'That is the end.'; nextS.textContent = 'Press Esc to go back and make notes.'; }
        tick();
      }
      function tick() {
        if (!strip) return;
        var now = performance.now(), scene = (now - run0.tScene) / 1000, tot = (now - run0.t0) / 1000;
        var ts = timing && timing.scenes[run0.slide], plan = ts ? ts.sec : 0, overScene = plan && scene > plan * 1.25;
        clockBig.textContent = f.fmtClock(scene); clockBig.classList.toggle('is-over', !!overScene);
        clockSmall.textContent = plan ? 'plan ' + f.fmtClock(plan) : ''; clockSmall.classList.toggle('is-over', !!overScene);
        var late = tgt && tot > tgt * 60;
        totBig.textContent = 'total ' + f.fmtClock(tot) + (tgt ? ' / ' + f.fmtClock(tgt * 60) : total ? ' / ≈ ' + f.fmtClock(total) : '');
        totBig.classList.toggle('is-over', !!late);
      }
      build();
      var r = { host: host, t0: run0.t0, player: null, off: function () { }, timer: 0, onFs: null, onKey: null, hintTimer: run0.hintTimer };
      running = r;
      r.onKey = function (e) {
        if (e.key === 'n' || e.key === 'N') { if (e.metaKey || e.ctrlKey || e.altKey) return; showStrip = !showStrip; strip.classList.toggle('is-off', !showStrip); prefs.strip = showStrip; savePrefs(prefs); if (hint) hint.style.opacity = '0'; e.stopPropagation(); }
        else if (e.key === 'Escape') { e.preventDefault(); exitRun('esc'); }
      };
      window.addEventListener('keydown', r.onKey, true);
      r.onFs = function () { if (!document.fullscreenElement && running === r && r.wasFs) exitRun('fullscreen'); };
      document.addEventListener('fullscreenchange', r.onFs);
      var fsReq = null;
      try { fsReq = host.requestFullscreen ? host.requestFullscreen() : null; } catch (e) { fsReq = null; }
      function noFs() {       // the browser said no: the fixed layer already fills the window, so say so once and carry on
        r.wasFs = false;
        if (hint && running === r) { hint.textContent = 'Your browser kept this out of full screen, so it fills the window instead. ' + hint.textContent; hint.style.opacity = ''; clearTimeout(r.hintTimer); r.hintTimer = setTimeout(function () { if (hint) hint.style.opacity = '0'; }, 6500); }
      }
      if (fsReq && fsReq.then) fsReq.then(function () { r.wasFs = true; }, noFs); else noFs();
      // the stage waits for the assets, then plays from the chosen scene
      PD.boot({ compiled: c, container: host, hash: false, sync: false, api: false, hud: true, input: true }).then(function (player) {
        if (dead || running !== r) { player.destroy(); return; }
        r.player = player;
        r.off = player.onState(function (st) { paintState(st); });
        if (from > 0) player.goTo(from, 0);
        paintState(player.state());
        r.timer = setInterval(tick, 250);
        r.t0 = run0.t0 = performance.now(); run0.tScene = r.t0;
        api.current = { player: player, host: host, exit: function () { exitRun('api'); } };
        host.tabIndex = -1; host.focus({ preventScroll: true });
      }, function (e) { running = null; if (host.parentNode) host.parentNode.removeChild(host); if (ui.toast) ui.toast('The stage could not start: ' + (e && e.message || e)); });
    }

    if (wantAuto && infos.length && selIdx === 0) setTimeout(function () { start(0); }, 0);
    var handle = { start: start, exit: function () { exitRun('api'); }, running: function () { return !!running; }, root: root };
    api.handle = handle;
    return {
      handle: handle,
      unmount: function () {
        dead = true;
        if (running) { var r = running; running = null; try { r.player && r.player.destroy(); } catch (e) { } clearInterval(r.timer); clearTimeout(r.hintTimer); window.removeEventListener('keydown', r.onKey, true); document.removeEventListener('fullscreenchange', r.onFs); if (r.host.parentNode) r.host.parentNode.removeChild(r.host); if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) { } } }
        offs.forEach(function (o) { o(); });
        if (root.parentNode) root.parentNode.removeChild(root);
        api.current = null; if (api.handle === handle) api.handle = null;
      }
    };
  }

  var def = { title: 'Rehearse', rail: 5, mount: mount };
  api.def = def;
  if (window.Studio && typeof window.Studio.screen === 'function') window.Studio.screen('rehearse', def);
  else (PD.studioScreens = PD.studioScreens || {}).rehearse = def;
  return api;
}, { export: false });
