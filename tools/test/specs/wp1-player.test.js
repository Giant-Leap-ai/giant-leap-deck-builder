/* tools/test/specs/wp1-player.test.js — M6 Player (spec §4.10–§4.13, §3.6 self-test, §8.2 M6; WP1 acceptance #3):
 * Sync (channel names, one random number per instance, isolation, targeted commands), the key filter, the Player and
 * window.PixelDeck additions, Thumbs, the HUD. Players run inside a container with hash off, so the harness page's
 * URL, <body> styles and window.PixelDeck are left alone; every test destroys what it creates. */

function m6Source(id) {   // a small object deck under the one-giant-leap theme (no Earth, so nothing heavy at boot)
  return {
    format: 2, id: id, meta: { title: 'M6 ' + id, theme: 'one-giant-leap' },
    scenes: [
      { id: 'a', beat: 'spark', world: { speed: 12 }, text: [{ str: 'Alpha', style: 'title' }], dwell: 4, notes: 'first' },
      { id: 'b', world: { speed: 30, nebula: 'deep' }, text: [{ str: 'Bravo', style: 'title' }], dwell: 5,
        steps: [{ text: [{ str: 'one', style: 'caption', y: 700 }], dwell: 1.5, notes: 'b1' }, { text: [{ str: 'two', style: 'caption', y: 760 }] }] },
      { id: 'c', beat: 'callback', world: { speed: 8 }, text: [{ str: 'Charlie', style: 'subtitle' }] }
    ]
  };
}
function m6Container() {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-2000px;top:0;width:320px;height:180px';
  document.body.appendChild(el);
  return el;
}
function m6Key(target, key) {
  var e = new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}
function m6Wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function m6Until(fn, ms) {               // poll until fn() is truthy (or time out)
  var t0 = performance.now();
  return new Promise(function (res, rej) {
    (function poll() {
      var v; try { v = fn(); } catch (e) { return rej(e); }
      if (v) return res(v);
      if (performance.now() - t0 > (ms || 3000)) return rej(new Error('m6Until: timed out'));
      setTimeout(poll, 20);
    })();
  });
}
function m6Boot(id, extra) {             // a Player on a compiled small deck, inside its own container
  var c = m6Container(), o = { compiled: PD.compile(m6Source(id)), container: c, hash: false, sync: false, api: false, raf: false };
  for (var k in extra || {}) o[k] = extra[k];
  return PD.boot(o).then(function (p) { p.__container = c; return p; });
}
function m6Engine() {                // a FRESH engine (the harness factories re-registered), so the harness registries stay as they are
  var g = {}; PD.kernel(g);
  var K = g.PD, all = PD.modules();
  PD.MANIFEST.filter(function (m) { return m[1] && PD.has(m[0]); }).forEach(function (m) {
    var rec = all.filter(function (r) { return r.name === m[0]; })[0];
    K.module(rec.name, rec.deps, rec.factory, rec.opts);
  });
  K.theme('one-giant-leap', PD.theme.get('one-giant-leap'));
  return K;
}
function m6Done(p) { if (p) { p.destroy(); if (p.__container) p.__container.remove(); } }

/* ------------------------------------------------------------------ Sync */
T.test('Sync (§4.11): channel pixeldeck:<id> and storage key pixeldeck:<id>:msg — never pixeldeck-cinema or cinema:msg', function (a) {
  var names = [], keys = [], RealBC = window.BroadcastChannel, realSet = Storage.prototype.setItem;
  window.BroadcastChannel = function (name) { names.push(name); return new RealBC(name); };
  Storage.prototype.setItem = function (k, v) { keys.push(k); return realSet.apply(this, arguments); };
  var s1, s2;
  try {
    s1 = PD.Sync('m6-chan', { role: 'stage' });
    s2 = PD.Sync('m6-chan', { role: 'notes' });
    var env = s1.send({ type: 'state', slide: 1 });
    s2.send({ type: 'hello' });
    a.deepEqual(names, ['pixeldeck:m6-chan', 'pixeldeck:m6-chan']);
    a.deepEqual(keys, ['pixeldeck:m6-chan:msg', 'pixeldeck:m6-chan:msg']);
    a.ok(names.concat(keys).every(function (n) { return !/cinema/.test(n); }), 'no cinema channel or key');
    a.deepEqual([s1.channel, s1.key, s1.role, s2.role, s1.deck], ['pixeldeck:m6-chan', 'pixeldeck:m6-chan:msg', 'stage', 'notes', 'm6-chan']);
    a.deepEqual([env.v, env.deck, env.from, env.mid, env.type, env.slide], [2, 'm6-chan', s1.id, s1.id + ':1', 'state', 1], 'envelope (§4.11)');
    a.equal(JSON.parse(localStorage.getItem('pixeldeck:m6-chan:msg')).from, s2.id, 'the last message is in the deck\'s storage key');
    a.equal(localStorage.getItem('cinema:msg'), null, 'nothing written under the old key');
    a.ok(!/pixeldeck-cinema|cinema:msg/.test(PD.get('core/sync').Sync.toString()), 'the old names are not in the source');
  } finally {
    window.BroadcastChannel = RealBC; Storage.prototype.setItem = realSet;
    if (s1) s1.close(); if (s2) s2.close();
    try { localStorage.removeItem('pixeldeck:m6-chan:msg'); } catch (e) { }
  }
});

T.test('Sync (§4.11): creating a stage Sync consumes exactly one Math.random (the instance id); sending and closing none', function (a) {
  var real = Math.random, calls = 0, s;
  Math.random = function () { calls++; return 0.5; };
  try {
    s = PD.Sync('m6-rng', { role: 'stage' });
    a.equal(calls, 1, 'one call');
    a.equal(s.id, (0.5).toString(36).slice(2), 'id = Math.random().toString(36).slice(2)');
    s.send({ type: 'hello' }); s.on(function () { }); s.close(); s.close();
    a.equal(calls, 1, 'still one call');
    PD.Sync('m6-rng', { role: 'notes' }).close();
    a.equal(calls, 2, 'one per instance');
  } finally { Math.random = real; try { localStorage.removeItem('pixeldeck:m6-rng:msg'); } catch (e) { } }
});

T.test('Sync (§4.11): only the same deck hears a message, once, never its sender; old-format messages are ignored; close stops it', async function (a) {
  var A = PD.Sync('m6-iso', { role: 'stage' }), B = PD.Sync('m6-iso', { role: 'notes' }), C = PD.Sync('m6-iso-other', { role: 'notes' });
  var got = { A: [], B: [], C: [] };
  A.on(function (m) { got.A.push(m); }); B.on(function (m) { got.B.push(m); }); C.on(function (m) { got.C.push(m); });
  try {
    A.send({ type: 'state', slide: 3 });
    // the same envelope again through another transport (window.postMessage): delivered at most once
    window.postMessage({ v: 2, deck: 'm6-iso', from: 'zz', mid: 'zz:1', type: 'hello' }, '*');
    window.postMessage({ v: 2, deck: 'm6-iso', from: 'zz', mid: 'zz:1', type: 'hello' }, '*');
    window.postMessage({ __cinema: 1, from: 'old', mid: 'old:1', type: 'cmd', cmd: 'next' }, '*');     // pre-v2 format
    window.postMessage({ v: 2, deck: 'm6-iso-other', from: 'zz', mid: 'zz:2', type: 'hello' }, '*');
    await m6Wait(150);
    a.deepEqual(got.B.map(function (m) { return m.type + ':' + m.from; }).sort(), ['hello:zz', 'state:' + A.id]);
    a.deepEqual(got.A.map(function (m) { return m.type + ':' + m.from; }), ['hello:zz'], 'A never hears itself');
    a.deepEqual(got.C.map(function (m) { return m.type + ':' + m.from; }), ['hello:zz'], 'another deck hears only its own');
    var off = B.on(function () { a.fail('removed handler ran'); });
    off();
    B.close();
    A.send({ type: 'hello' });
    await m6Wait(100);
    a.equal(got.B.length, 2, 'a closed Sync hears nothing');
  } finally {
    A.close(); B.close(); C.close();
    ['m6-iso', 'm6-iso-other'].forEach(function (d) { try { localStorage.removeItem('pixeldeck:' + d + ':msg'); } catch (e) { } });
  }
});

/* ------------------------------------------------------------------ the Player */
T.test('key filter (§4.10): keys from input, textarea, select and [contenteditable] are ignored; with a container only when the focus is inside it or on body', async function (a) {
  var editable = PD.get('core/player').editable;
  var p = await m6Boot('m6-keys', { input: true });
  var outside = document.createElement('div'), tmp = [];
  try {
    var st = p.stage;
    a.deepEqual(st.cur, { slide: 0, step: 0 });
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    m6Key(document.body, 'ArrowRight');
    a.deepEqual(st.cur, { slide: 1, step: 0 }, 'a key on <body> drives the deck');
    var ce = document.createElement('div'); ce.setAttribute('contenteditable', ''); ce.innerHTML = '<span>x</span>';
    var fields = [document.createElement('input'), document.createElement('textarea'), document.createElement('select'), ce, ce.firstChild];
    fields.forEach(function (el) { if (!el.parentNode) { outside.appendChild(el); } });
    document.body.appendChild(outside);
    fields.forEach(function (el) {
      a.ok(editable(el), el.tagName + ' is editable');
      var e = m6Key(el, 'ArrowRight');
      a.deepEqual(st.cur, { slide: 1, step: 0 }, 'ArrowRight from ' + el.tagName + ' is ignored');
      a.equal(e.defaultPrevented, false, 'and not swallowed');
      m6Key(el, 'Home'); m6Key(el, 'b');
      a.deepEqual([st.cur.slide, st.blackout], [1, false], 'Home and B from ' + el.tagName + ' are ignored');
    });
    a.ok(!editable(document.body) && !editable(p.stage.canvas) && !editable(null), 'body and the canvas are not editable');
    // container: a focused element outside it (not an editable one) does not drive the deck; one inside does
    var btn = document.createElement('button'); btn.textContent = 'x'; outside.appendChild(btn); btn.focus();
    a.equal(document.activeElement, btn);
    m6Key(btn, 'ArrowRight');
    a.deepEqual(st.cur, { slide: 1, step: 0 }, 'focus outside the container: ignored');
    var inner = document.createElement('div'); inner.tabIndex = 0; p.__container.appendChild(inner); inner.focus();
    a.equal(document.activeElement, inner);
    m6Key(inner, 'ArrowRight');
    a.deepEqual(st.cur, { slide: 1, step: 1 }, 'focus inside the container: next');
    inner.blur();
    m6Key(document.body, 'End');
    a.deepEqual(st.cur, { slide: 2, step: 0 }, 'End');
    m6Key(document.body, 'Home');
    a.deepEqual(st.cur, { slide: 0, step: 0 }, 'Home');
    m6Key(document.body, 'b'); a.equal(st.blackout, true, 'B'); m6Key(document.body, '.'); a.equal(st.blackout, false, '.');
    m6Key(document.body, 'g'); m6Key(document.body, '3'); m6Key(document.body, '.'); m6Key(document.body, '0'); m6Key(document.body, 'Enter');
    a.deepEqual(st.cur, { slide: 2, step: 0 }, 'G 3.0 Enter');
    // click / right-click on the canvas
    p.stage.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    a.deepEqual(st.cur, { slide: 1, step: 2 }, 'right-click: prev (settled into the last step)');
    p.stage.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    a.deepEqual(st.cur, { slide: 2, step: 0 }, 'click: next');
    m6Done(p);
    m6Key(document.body, 'ArrowLeft');
    a.deepEqual(st.cur, { slide: 2, step: 0 }, 'after destroy the keys do nothing');
    a.equal(p.__container.querySelectorAll('canvas, .hud').length, 0, 'destroy removes the canvas and the HUD');
  } finally { m6Done(p); outside.remove(); }
});

T.test('Player (§4.10) and window.PixelDeck (§4.13): ready, info (stepDwell, beat), state, deck, advance, tick, warmAll, snapshot, onState, destroy', async function (a) {
  a.equal(window.PixelDeck, undefined, 'the harness has no PixelDeck');
  var p = await m6Boot('m6-api', { api: true, hud: true });
  try {
    var api = window.PixelDeck, st = p.stage;
    a.equal(api, p.api, 'boot step 14: window.PixelDeck');
    a.equal(typeof api.ready, 'boolean', 'ready is a boolean getter');
    a.deepEqual(Object.keys(api).sort(), ['advance', 'deck', 'finish', 'goTo', 'info', 'isBusy', 'next', 'prev', 'ready', 'setManualClock',
      'snapshot', 'state', 'tick', 'warmAll'].sort());
    a.deepEqual(api.info(), [
      { id: 'a', steps: 0, dwell: 4, beat: 'spark' },
      { id: 'b', steps: 2, dwell: 5, stepDwell: [1.5, null] },
      { id: 'c', steps: 0, dwell: undefined, beat: 'callback' }]);
    a.deepEqual(api.deck(), { id: 'm6-api', meta: st.deck.meta });
    var s0 = api.state();
    a.deepEqual(Object.keys(s0).sort(), ['busy', 'fps', 'particles', 'ready', 'slide', 'step', 'workMs']);
    a.equal(s0.ready, api.ready);
    var draws = 0, draw = st.draw;
    st.draw = function () { draws++; return draw.apply(this, arguments); };
    var T0 = st.T;
    api.advance(0.5);
    a.deepEqual([st.T - T0, draws], [0.5, 0], 'advance: tick, no draw');
    api.tick(0.25);
    a.deepEqual([st.T - T0, draws], [0.75, 1], 'tick: tick + draw');
    st.draw = draw;
    await m6Wait(300);
    a.equal(st.warmDone, false, 'without animation frames nothing warms outside tick (the idle warm-up starts from a real frame only)');
    a.equal(api.ready, false, 'not ready yet');
    api.warmAll();
    a.equal(api.ready, true, 'ready once every warm-up is done (warmAll)');
    a.equal(p.ready, true, 'player.ready'); a.equal(api.state().ready, true);
    a.ok(/^data:image\/png;base64,/.test(api.snapshot()), 'snapshot: PNG data URL');
    a.ok(/^data:image\/jpeg;base64,/.test(api.snapshot('image/jpeg')), 'snapshot(type)');
    var seen = [];
    var off = p.onState(function (s) { seen.push(s.slide + '.' + s.step); });
    api.next(); api.next(); p.end(); p.home(); p.goTo(1, 2); api.prev();
    p.blackout(); p.blackout();
    off(); api.next();
    a.deepEqual(seen, ['1.0', '1.1', '2.0', '0.0', '1.2', '1.1', '1.1', '1.1'], 'onState after every enter and blackout');
    a.ok(p.hud && st.canvas.parentNode === p.__container, 'the canvas is in the container');
    a.ok(p.__container.classList.contains('pd-player'));
    p.destroy();
    a.equal(window.PixelDeck, undefined, 'destroy removes window.PixelDeck');
    a.equal(st.destroyed, true, 'and destroys the stage');
    a.equal(st.layerBySpec.size + st.shapeBySpec.size + st.layers.length, 0, 'stage.destroy releases its caches');
  } finally { m6Done(p); if (window.PixelDeck) delete window.PixelDeck; }
});

T.test('warm-up (§4.5 step 9 + the Player\'s idle slices): one warmTick per tick at most; none at all in manual-clock mode; idle slices stop at ready and on destroy', async function (a) {
  var p = await m6Boot('m6-warm', { raf: true });
  p.setManualClock(true);                      // before the first animation frame: the golden runs' mode
  var st = p.stage, ticks = 0, inTick = false, inside = 0, outside = 0, perTick = 0, maxPerTick = 0;
  var tick = st.tick, warmTick = st.warmTick;
  st.tick = function () {
    ticks++; inTick = true; perTick = 0;
    try { return tick.apply(this, arguments); } finally { inTick = false; maxPerTick = Math.max(maxPerTick, perTick); }
  };
  st.warmTick = function () { if (inTick) { inside++; perTick++; } else outside++; return warmTick.apply(this, arguments); };
  try {
    await m6Wait(300);
    a.deepEqual([ticks, inside, outside, st.isWarm()], [0, 0, 0, false], 'manual clock: the frame loop neither ticks nor warms');
    p.setManualClock(false);
    await m6Until(function () { return st.isWarm(); }, 8000);
    a.ok(ticks > 0 && inside > 0, 'real time: the stage ticks and warms inside tick (' + ticks + ' ticks, ' + inside + ' slices in tick, ' + outside + ' in idle time)');
    a.equal(maxPerTick, 1, 'never more than one warm slice per tick (the tick order of §4.5 is untouched)');
    a.equal(p.ready, true, 'ready once warm');
    var o = outside, t = ticks;
    await m6Wait(300);
    a.ok(ticks > t, 'the stage keeps ticking');
    a.equal(outside, o, 'no idle-time warm slice once ready');
    m6Done(p);
    var n = [ticks, inside, outside];
    await m6Wait(200);
    a.deepEqual([ticks, inside, outside], n, 'nothing runs after destroy');
  } finally { st.tick = tick; st.warmTick = warmTick; m6Done(p); }
});

T.test('PD.boot: the boot order of §4.10 — hud, Sync (one random), theme + assets, compile, Stage, enter; a bad deck rejects and cleans up', async function (a) {
  var K = m6Engine(), log = [], realReady = K.assets.ready, realCompile = K.compile, realRandom = Math.random, n = 0;
  K.assets.ready = function (id, o) { log.push('assets ' + id + ' rng' + n); return realReady.apply(this, arguments); };
  K.compile = function (d) { log.push('compile ' + d + ' rng' + n); return realCompile.apply(this, arguments); };
  var p, c = m6Container(), c2 = m6Container();
  try {
    K.deck('m6-order', m6Source('m6-order'));
    Math.random = function () { n++; return realRandom(); };
    var pr = K.boot({ deck: 'm6-order', container: c, hash: false, api: false, raf: false });
    log.push('sync rng' + n);
    p = await pr;
    log.push('booted ' + p.stage.cur.slide + '.' + p.stage.cur.step);
    a.deepEqual(log, ['assets m6-order rng1', 'sync rng1', 'compile m6-order rng1', 'booted 0.0'],
      'Sync draws its one random number before the assets wait and compile; the first enter comes after compile');
    a.equal(p.sync.deck, 'm6-order');
    a.equal(c.firstChild, p.stage.canvas, 'the canvas is first in the container');
    Math.random = realRandom;
    await a.rejects(K.boot({ deck: 'm6-no-such-deck', container: c2, raf: false, api: false }), /no deck "m6-no-such-deck"/);
    a.equal(c2.children.length, 0, 'a boot that fails removes its canvas and HUD');
    a.ok(!c2.classList.contains('pd-player'));
    var bad = m6Source('m6-order-bad');            // compiles, but its first scene throws when the stage enters it
    bad.scenes[0].particles = [{ shape: 'points', points: function () { throw new Error('boom at boot'); } }];
    await a.rejects(K.boot({ compiled: K.compile(bad), container: c2, raf: true, api: false, input: true, sync: false }), /boom at boot/);
    a.equal(c2.children.length, 0, 'a boot that throws half-way removes its canvas and HUD');
    m6Key(document.body, 'ArrowRight'); window.dispatchEvent(new Event('resize'));   // no listener of the failed boot is left
    K.deck('m6-order-2', m6Source('m6-order-2'));
    await a.rejects(K.boot({ container: c2, raf: false, api: false }), /needs a deck id \(2 decks are registered/, 'no deck id and not exactly one deck: rejects');
  } finally {
    K.assets.ready = realReady; K.compile = realCompile; Math.random = realRandom;
    if (p) p.destroy(); c.remove(); c2.remove();
    ['m6-order', 'm6-no-such-deck'].forEach(function (d) { try { localStorage.removeItem('pixeldeck:' + d + ':msg'); } catch (e) { } });
  }
});

T.test('targeted commands (§4.11): a stage answers hello with state; it ignores a cmd for another instance and obeys its own', async function (a) {
  var p = await m6Boot('m6-cmd', { sync: true }), notes = PD.Sync('m6-cmd', { role: 'notes' }), got = [];
  notes.on(function (m) { got.push(m); });
  try {
    var st = p.stage, inst = p.sync.id;
    notes.send({ type: 'hello' });
    await m6Until(function () { return got.length; });
    var s = got[got.length - 1];
    a.deepEqual([s.type, s.inst, s.from, s.slide, s.step, s.steps, s.total, s.id, s.beat, s.blackout, typeof s.ready, s.deck, s.v],
      ['state', inst, inst, 0, 0, 0, 3, 'a', 'spark', false, 'boolean', 'm6-cmd', 2], 'state envelope (§4.11)');
    notes.send({ type: 'cmd', cmd: 'next', target: 'someone-else' });
    await m6Wait(120);
    a.deepEqual(st.cur, { slide: 0, step: 0 }, 'a cmd for another instance is ignored');
    notes.send({ type: 'cmd', cmd: 'next', target: inst });
    await m6Until(function () { return st.cur.slide === 1; });
    a.ok(true, 'its own cmd: next');
    notes.send({ type: 'cmd', cmd: 'goto', slide: 2, step: 0, target: inst });
    await m6Until(function () { return st.cur.slide === 2; });
    notes.send({ type: 'cmd', cmd: 'blackout', target: inst });
    await m6Until(function () { return st.blackout; });
    notes.send({ type: 'cmd', cmd: 'prev' });                    // untargeted: every stage of the deck
    await m6Until(function () { return st.cur.slide === 1; });
    a.deepEqual(st.cur, { slide: 1, step: 2 });
    var last = got[got.length - 1];
    a.deepEqual([last.slide, last.step, last.blackout], [1, 2, true], 'every change is broadcast');
  } finally { notes.close(); m6Done(p); try { localStorage.removeItem('pixeldeck:m6-cmd:msg'); } catch (e) { } }
});

T.test('N (§4.10): opens <page>?notes through a shift-clicked target=_blank rel=noopener link, never window.open (it blocks the stage); nothing with sync off', async function (a) {
  var clicks = [], opens = 0, realOpen = window.open, p0 = null, p1 = null;
  function grab(e) {                     // capture phase: sees the click although it does not bubble, and cancels it
    var t = e.target;
    if (!t || t.tagName !== 'A') return;
    clicks.push({ href: t.href, target: t.target, rel: t.rel, shift: e.shiftKey, mods: [e.ctrlKey, e.metaKey, e.altKey], bubbles: e.bubbles,
                  connected: t.isConnected, display: t.style.display });
    e.preventDefault();                  // the harness page opens nothing
  }
  window.addEventListener('click', grab, true);
  window.open = function () { opens++; return null; };
  try {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    p0 = await m6Boot('m6-notes-off', { input: true });            // sync off: nothing could drive a presenter window
    m6Key(document.body, 'n'); p0.openNotes();
    a.equal(clicks.length, 0, 'sync off: N opens nothing');
    m6Done(p0); p0 = null;
    p1 = await m6Boot('m6-notes', { input: true, sync: true });
    m6Key(document.body, 'n');
    a.equal(clicks.length, 1, 'N: one link click');
    a.deepEqual(clicks[0], { href: location.href.split(/[?#]/)[0] + '?notes', target: '_blank', rel: 'noopener', shift: true, mods: [false, false, false],
      bubbles: false, connected: true, display: 'none' }, 'a hidden <a target=_blank rel=noopener href=<page>?notes>, shift-clicked (a new window), not bubbling');
    a.equal(document.querySelectorAll('a[href$="?notes"]').length, 0, 'the link is removed again');
    p1.openNotes();
    a.equal(clicks.length, 2, 'player.openNotes() does the same');
    a.equal(opens, 0, 'window.open is never called');
  } finally {
    window.removeEventListener('click', grab, true); window.open = realOpen;
    m6Done(p0); m6Done(p1);
    try { localStorage.removeItem('pixeldeck:m6-notes:msg'); } catch (e) { }
  }
});

T.test('PD.start modes (§4.10): register-only (?export) boots nothing; the export self-test (§3.6) reports per-state errors and never rejects', async function (a) {
  var start = PD.get('core/player').start, selfTest = PD.get('core/player').selfTest;
  var canv = document.querySelectorAll('canvas').length;
  a.equal(await start('one-giant-leap', { mode: 'register-only' }), null);
  a.equal(document.querySelectorAll('canvas').length, canv, 'no canvas');
  a.equal(window.PixelDeck, undefined, 'no PixelDeck');
  var posted = [], onMsg = function (e) { if (e.data && e.data.type === 'pd-selftest') posted.push(e.data); };
  window.addEventListener('message', onMsg);
  try {
    var box = m6Container();
    var ok = await selfTest({ compiled: PD.compile(m6Source('m6-self')), container: box });
    a.deepEqual([ok.type, ok.ok, ok.errors], ['pd-selftest', true, []]);
    a.ok(ok.ms >= 0);
    var bad = m6Source('m6-self-bad');
    bad.scenes[2].particles = [{ shape: 'points', points: function () { throw new Error('boom in scene 3'); } }];
    var r = await selfTest({ compiled: PD.compile(bad), container: box });
    a.equal(r.ok, false);
    a.deepEqual(r.errors, [{ slide: 2, step: 0, msg: 'boom in scene 3' }], 'the scene index of the state that threw');
    var none = await selfTest({ deck: 'm6-not-registered', container: box });
    a.equal(none.ok, false); a.equal(none.errors[0].slide, -1);
    await m6Wait(50);
    a.equal(posted.length, 3, 'each result is posted (to the parent window; here the page itself)');
    a.equal(document.querySelectorAll('canvas').length, canv, 'the self-test leaves no canvas behind');
    a.equal(box.children.length, 0);
    box.remove();
  } finally { window.removeEventListener('message', onMsg); }
});

/* ------------------------------------------------------------------ Thumbs */
T.test('Thumbs (§4.12): one still per idle slice, priority first, get/LRU, ready events, setDeck invalidation, destroy', async function (a) {
  var compiled = PD.compile(m6Source('m6-thumbs'));
  var realIdle = window.requestIdleCallback, slices = 0;
  window.requestIdleCallback = function (fn, o) { a.deepEqual(o, { timeout: 200 }); return realIdle(function (d) { slices++; fn(d); }, o); };
  var TB;
  try {
    TB = PD.Thumbs(compiled, { w: 160, h: 90, max: 4 });
    var stills = [], still = TB.stage.still;
    TB.stage.still = function (si, step) { stills.push(si + '.' + step + '@' + slices); return still.apply(this, arguments); };
    a.equal(TB.total(), 5, '5 states');
    a.equal(TB.get(0, 0), null);
    var ready = [];
    TB.on('ready', function (si, step, c) { ready.push(si + '.' + step); a.deepEqual([c.width, c.height], [160, 90]); });
    TB.requestAll();
    TB.request(2, 0, 5);           // jumps the queue
    TB.request(9, 0, 9); TB.request(1, 3, 9);   // not states: ignored
    a.equal(TB.pending(), 5);
    await m6Until(function () { return TB.pending() === 0 && ready.length === 5; }, 8000);
    a.deepEqual(ready, ['2.0', '0.0', '1.0', '1.1', '1.2'], 'priority first, then deck order');
    a.deepEqual(stills.map(function (s) { return s.split('@')[1]; }), ['1', '2', '3', '4', '5'], 'exactly one still per idle callback');
    a.equal(TB.size(), 4, 'LRU max 4');
    a.equal(TB.get(2, 0), null, 'the least recently used went first');
    var c = TB.get(1, 2);
    a.ok(c && c.width === 160, 'a cached canvas');
    var d = c.getContext('2d').getImageData(0, 0, 160, 90).data, lit = 0;
    for (var i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    a.ok(lit > 100, 'the still is drawn (' + lit + ' lit pixels)');
    TB.request(1, 2, 0);
    a.equal(TB.pending(), 0, 'a cached state is not queued again');
    // setDeck: scene 1 changes → its entries go, the others stay
    var next = PD.compileScene(compiled, 1, { id: 'b', world: { speed: 31 }, text: [{ str: 'Bravo 2', style: 'title' }] });
    var keep = TB.get(0, 0);
    TB.setDeck(next);
    a.equal(TB.total(), 3);
    a.equal(TB.get(1, 0), null, 'changed scene: invalidated'); a.equal(TB.get(1, 1), null, 'its old step is not a state any more');
    a.equal(TB.get(0, 0), keep, 'unchanged scene: kept');
    TB.request(1, 0, 1);
    await m6Until(function () { return TB.get(1, 0); }, 4000);
    TB.request(2, 0); TB.destroy();
    await m6Wait(50);
    a.equal(TB.get(0, 0), null, 'destroyed');
    a.equal(TB.stage.destroyed, true);
  } finally { window.requestIdleCallback = realIdle; if (TB) TB.destroy(); }
});

/* ------------------------------------------------------------------ HUD */
T.test('hud (§3.4): container mode scopes the CSS, puts the canvas first and the HUD after it; toast, goto, fps, error; remove', function (a) {
  var H = PD.get('core/hud'), c = m6Container(), cv = document.createElement('canvas');
  var h = H.install({ canvas: cv, container: c });
  try {
    a.ok(c.classList.contains('pd-player'));
    a.deepEqual(Array.prototype.map.call(c.children, function (e) { return e.tagName + '.' + e.className; }),
      ['CANVAS.', 'DIV.hud pd-fps', 'DIV.hud pd-goto', 'DIV.hud pd-toast']);
    a.equal(c.querySelectorAll('[id]').length, 0, 'no ids in container mode');
    a.equal(document.querySelectorAll('style[data-pd-hud="scoped"]').length, 1);
    a.equal(document.querySelectorAll('style[data-pd-hud="page"]').length, 0, 'no page rules in container mode');
    var c3 = m6Container();
    H.install({ canvas: document.createElement('canvas'), container: c3, hud: false }).remove();
    c3.remove();
    a.equal(document.querySelectorAll('style[data-pd-hud="scoped"]').length, 1, 'the CSS is injected once');
    h.toast('BLACKOUT'); a.equal(c.querySelector('.pd-toast').textContent, 'BLACKOUT'); a.equal(c.querySelector('.pd-toast').style.opacity, '1');
    h.toast(''); a.equal(c.querySelector('.pd-toast').style.opacity, '0');
    h.goto('GO TO 3_  / 10'); a.equal(c.querySelector('.pd-goto').style.opacity, '1');
    h.goto(null); a.equal(c.querySelector('.pd-goto').style.opacity, '0');
    h.showFps(true); a.equal(c.querySelector('.pd-fps').style.display, 'block'); a.equal(h.fpsOn(), true);
    h.fps('60 fps'); a.equal(c.querySelector('.pd-fps').textContent, '60 fps');
    h.error(['scene 2 (b): unknown template "x"']);
    var err = c.querySelector('[data-pd-error]');
    a.ok(err && /unknown template/.test(err.textContent) && err.style.display === 'block', 'on-screen error box');
    err.click(); a.equal(err.style.display, 'none', 'a click hides it');
    // the page rules are today's cinema/index.html rules (compared with the file itself by the e2e test)
    ['html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }', 'canvas { display: block; cursor: none; }',
     '#fps { top: 8px; left: 8px; display: none; color: #b6ff6b; }'].forEach(function (r) { a.ok(H.PAGE_CSS.indexOf(r) >= 0, r); });
    h.remove();
    a.equal(c.children.length, 0, 'remove() takes out what install added');
    a.ok(!c.classList.contains('pd-player'));
    var own = document.createElement('canvas'); c.appendChild(own);
    var h2 = H.install({ canvas: own, container: c, hud: false });
    a.deepEqual([c.children.length, c.firstChild], [1, own], 'a caller\'s canvas stays put; hud:false adds no boxes');
    h2.toast('x'); h2.error('y'); h2.remove();
    a.equal(own.parentNode, c, 'and is not removed');
  } finally { c.remove(); }
});
