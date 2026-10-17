/* engine/core/notes.js — the presenter window (spec §4.11). It replaces the pre-v2 cinema/notes.html script: the same
 * markup and CSS, built in JS, so every deck gets it from its notes.html shim (PD.start(id, { mode: 'notes' })) or
 * from <deck>/index.html?notes (what N on the stage opens, with noopener: its own process).
 *
 *   PD.notes(opts?: { deck? }) → Promise<Notes>
 *   Notes = { sync, thumbs, compiled, bound() → inst | null, state() → last state | null, destroy() }
 *
 * Boot: build the UI → PD.assets.ready → PD.compile → PD.Thumbs(compiled, { w: 480, h: 270 }).requestAll() (idle
 * slices, "Preparing previews n/N" until done; the current and next states jump the queue) → PD.Sync(deckId,
 * { role: 'notes' }) → hello. Linking: the window binds to the first stage instance it hears (state.inst) and sends
 * every command with target = that instance, so a second copy of the deck is never driven. A state from any other
 * instance shows the red banner "Another stage for this deck is open. Close one." while that stage keeps answering.
 * When the bound stage stops answering (closed or reloaded) for STALE ms, the window binds to the next stage it hears.
 * It says hello every second, so it notices both. Keys here drive the stage: → ↓ PageDown Space next, ← ↑ PageUp
 * prev, B . blackout, R replay. The timer starts on the first advance; click it to reset. */
PD.module('core/notes', ['core/sync', 'core/thumbs'], function (PD, sync, thumbs) {
  var Sync = sync.Sync, Thumbs = thumbs.Thumbs;
  var STALE = 2500, PW = 480, PH = 270;
  // cinema/notes.html <style>, plus the banner and the preview counter
  var CSS =
    '  :root { --bg: #1a1c2c; --panel: #232539; --line: #333c57; --text: #f4f4f4; --muted: #94b0c2; --accent: #ef7d57; --ok: #a7f070; }\n' +
    '  * { box-sizing: border-box; }\n' +
    '  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text);\n' +
    '               font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\n' +
    '  body { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; }\n' +
    '  header { display: flex; align-items: center; gap: 24px; padding: 12px 20px; border-bottom: 1px solid var(--line); }\n' +
    '  #pos { font: 700 28px/1 ui-monospace, Menlo, monospace; }\n' +
    '  #pos small { font-size: 16px; color: var(--muted); margin-left: 8px; }\n' +
    '  #timer { font: 700 40px/1 ui-monospace, Menlo, monospace; color: var(--ok); cursor: pointer; margin-left: auto; }\n' +
    '  #clock { font: 500 18px ui-monospace, Menlo, monospace; color: var(--muted); }\n' +
    '  #link { font: 600 12px ui-monospace, Menlo, monospace; padding: 4px 8px; border-radius: 4px; background: #5d275d; }\n' +
    '  #link.on { background: #257179; }\n' +
    '  #blk { font: 700 12px ui-monospace, Menlo, monospace; padding: 4px 8px; border-radius: 4px; background: #000; color: #fff; display: none; }\n' +
    '  main { overflow: hidden; display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; padding: 20px; min-height: 0; }\n' +
    '  #notes { font-size: 26px; line-height: 1.4; white-space: pre-wrap; overflow: auto; padding-right: 8px; }\n' +
    '  .side { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: hidden; }\n' +
    '  .thumb { background: #000; border: 1px solid var(--line); }\n' +
    '  .thumb canvas { display: block; width: 100%; aspect-ratio: 16 / 9; }\n' +
    '  .label { font: 600 12px ui-monospace, Menlo, monospace; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }\n' +
    '  #nextNotes { color: var(--muted); font-size: 15px; white-space: pre-wrap; max-height: 5.5em; overflow: hidden; }\n' +
    '  footer { display: flex; gap: 8px; padding: 10px 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; align-items: center; }\n' +
    '  button { font: 600 14px ui-monospace, Menlo, monospace; background: var(--panel); color: var(--text);\n' +
    '           border: 1px solid var(--line); padding: 8px 14px; border-radius: 6px; cursor: pointer; white-space: nowrap; }\n' +
    '  button:hover { border-color: var(--accent); }\n' +
    '  footer .keys { margin-left: auto; text-align: right; }\n' +
    '  @media (max-width: 1100px) { footer .keys { display: none; } }\n' +
    '  #prep { font: 600 12px ui-monospace, Menlo, monospace; color: var(--muted); }\n' +
    '  header { flex-wrap: wrap; }\n' +
    '  #another { order: -1; flex: 0 0 calc(100% + 40px); margin: -12px -20px 0; display: none; padding: 9px 20px; background: #b3202e;\n' +
    '             color: #fff; font: 700 15px/1.3 ui-monospace, Menlo, monospace; text-align: center; }\n';
  // cinema/notes.html <body>, plus #another (the banner, a full-width first row of the header) and #prep
  var HTML =
    '<header>\n' +
    '  <div id="another" role="alert">Another stage for this deck is open. Close one.</div>\n' +
    '  <div id="pos">–<small></small></div>\n' +
    '  <span id="link">WAITING FOR STAGE</span>\n' +
    '  <span id="blk">BLACKOUT</span>\n' +
    '  <span id="prep"></span>\n' +
    '  <span id="clock"></span>\n' +
    '  <div id="timer" title="Click to reset">00:00</div>\n' +
    '</header>\n' +
    '<main>\n' +
    '  <div>\n' +
    '    <div class="label">Notes</div>\n' +
    '    <div id="notes">Open the deck (or press N on the stage) — this window follows along.</div>\n' +
    '  </div>\n' +
    '  <div class="side">\n' +
    '    <div>\n' +
    '      <div class="label">Next</div>\n' +
    '      <div class="thumb"><canvas id="next"></canvas></div>\n' +
    '      <div id="nextNotes"></div>\n' +
    '    </div>\n' +
    '    <div>\n' +
    '      <div class="label">Now</div>\n' +
    '      <div class="thumb" style="max-width: 55%"><canvas id="now"></canvas></div>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</main>\n' +
    '<footer>\n' +
    '  <button id="bPrev">◀ PREV</button>\n' +
    '  <button id="bNext">NEXT ▶</button>\n' +
    '  <button id="bBlack">BLACKOUT</button>\n' +
    '  <button id="bReplay">REPLAY</button>\n' +
    '  <button id="bReset">RESET TIMER</button>\n' +
    '  <span class="keys">Keys here also drive the stage: → / ← / Space / PageUp / PageDown · B · R</span>\n' +
    '</footer>\n';

  function onlyDeck() {
    var ids = PD.deck.list();
    if (ids.length === 1) return ids[0];
    throw new Error('pixeldeck: PD.notes needs a deck id (' + ids.length + ' decks are registered)');
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return (h ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function notes(opts) {
    opts = opts || {};
    var deckId = opts.deck != null ? String(opts.deck) : onlyDeck();
    var doc = document, body = doc.body;
    var st = doc.createElement('style');
    st.setAttribute('data-pd-notes', '');
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
    var holder = doc.createElement('div');
    holder.innerHTML = HTML;
    var nodes = Array.prototype.slice.call(holder.childNodes);
    nodes.forEach(function (n) { body.appendChild(n); });
    var $ = function (id) { return doc.getElementById(id); };

    return PD.assets.ready(deckId).then(function () {
      var compiled = PD.compile(deckId), DECK = compiled.scenes;   // the compiled deck's scenes
      var title = (compiled.meta && compiled.meta.title) || deckId;
      try { doc.title = title + ' — presenter'; } catch (e) { }
      var ui = compiled.theme && compiled.theme.ui;
      if (ui && ui.accent) doc.documentElement.style.setProperty('--accent', ui.accent);

      var state = null, lastSeen = 0, t0 = null, bound = null, heard = {}, dead = false, iv = 0, listeners = [];
      function listen(t, ev, fn) { t.addEventListener(ev, fn); listeners.push([t, ev, fn]); }
      function stepsOf(si) { var s = DECK[si]; return s && s.steps ? s.steps.length : 0; }
      function notesFor(si, step) {
        var s = DECK[si]; if (!s) return '';
        var parts = [s.notes || ''];
        for (var k = 1; k <= step; k++) { var st = s.steps[k - 1]; if (st && st.notes) parts.push(st.notes); }
        return parts.filter(Boolean).join('\n\n');
      }
      function nextOf(s) {
        if (s.step < stepsOf(s.slide)) return { slide: s.slide, step: s.step + 1 };
        if (s.slide < DECK.length - 1) return { slide: s.slide + 1, step: 0 };
        return null;
      }

      // Thumbnails: the real engine's settled stills, precomputed in idle slices (core/thumbs.js).
      var total = 0;
      for (var i = 0; i < DECK.length; i++) total += 1 + stepsOf(i);
      var TB = Thumbs(compiled, { w: PW, h: PH, max: Math.max(150, total) });   // room for every state of the deck
      var want = { now: null, next: null };   // canvas id → { slide, step } shown there
      function paint(id) {
        var c = $(id), w = want[id], ctx = c.getContext('2d');
        if (c.width !== PW || c.height !== PH) { c.width = PW; c.height = PH; }
        var img = w ? TB.get(w.slide, w.step) : null;
        if (img) ctx.drawImage(img, 0, 0);
        else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, PW, PH); }
      }
      function progress() {
        var n = Math.min(TB.size(), total);
        $('prep').textContent = n < total ? 'Preparing previews ' + n + '/' + total : '';
      }
      TB.on('ready', function (si, step) {
        progress();
        ['now', 'next'].forEach(function (id) { var w = want[id]; if (w && w.slide === si && w.step === step) paint(id); });
      });
      TB.requestAll();
      progress();
      paint('now'); paint('next');

      var shownKey = null;
      function render() {
        if (!state) return;
        var s = state, key = [s.slide, s.step, s.steps, s.id, s.blackout].join('|');
        if (key === shownKey) return;          // the stage re-sends its state every second (hello): only changes re-render
        shownKey = key;
        $('pos').firstChild.nodeValue = (s.slide + 1) + ' / ' + DECK.length;
        $('pos').querySelector('small').textContent =
          (s.steps ? 'step ' + s.step + '/' + s.steps + ' · ' : '') + (s.id || '');
        $('notes').textContent = notesFor(s.slide, s.step) || '(no notes)';
        want.now = { slide: s.slide, step: s.step };
        TB.request(s.slide, s.step, 2);
        paint('now');
        var n = nextOf(s);
        if (n) {
          want.next = n;
          TB.request(n.slide, n.step, 1);
          paint('next');
          var ns = DECK[n.slide];
          $('nextNotes').textContent = (n.step ? 'Step ' + n.step + ' of ' : '') + (n.slide + 1) + ' · ' + (ns.id || '') +
            (n.step && ns.steps[n.step - 1].notes ? ' — ' + ns.steps[n.step - 1].notes : ns.notes ? ' — ' + ns.notes : '');
        } else {
          want.next = null;
          paint('next');
          $('nextNotes').textContent = 'End of deck.';
        }
        $('blk').style.display = s.blackout ? 'inline-block' : 'none';
      }
      function others(now) {
        var out = [];
        for (var k in heard) if (k !== bound && now - heard[k] < STALE) out.push(k);
        return out;
      }
      function banner() { $('another').style.display = others(Date.now()).length ? 'block' : 'none'; }

      var sy = Sync(deckId, { role: 'notes' });
      sy.on(function (msg) {
        if (msg.type !== 'state' || dead) return;
        var inst = msg.inst || msg.from, now = Date.now();
        heard[inst] = now;
        if (bound && inst !== bound && now - (heard[bound] || 0) > STALE) bound = null;   // the bound stage went away
        if (!bound) bound = inst;
        if (inst !== bound) { banner(); return; }
        state = msg; lastSeen = now;
        if (t0 === null && (msg.slide > 0 || msg.step > 0)) t0 = Date.now(); // start on first advance
        banner();
        render();
      });

      function cmd(c, extra) {
        var m = { type: 'cmd', cmd: c };
        if (extra) for (var k in extra) m[k] = extra[k];
        if (bound) m.target = bound;
        sy.send(m);
      }
      listen($('bNext'), 'click', function () { cmd('next'); });
      listen($('bPrev'), 'click', function () { cmd('prev'); });
      listen($('bBlack'), 'click', function () { cmd('blackout'); });
      listen($('bReplay'), 'click', function () { cmd('replay'); });
      var reset = function () { t0 = Date.now(); };
      listen($('bReset'), 'click', reset); listen($('timer'), 'click', reset);

      listen(window, 'keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var t = e.target;
        if (t && t.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        var k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') { e.preventDefault(); if (!e.repeat) cmd('next'); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); if (!e.repeat) cmd('prev'); }
        else if (k === 'b' || k === 'B' || k === '.') cmd('blackout');
        else if (k === 'r' || k === 'R') cmd('replay');
      });

      function tick() {
        $('timer').textContent = fmt(t0 === null ? 0 : (Date.now() - t0) / 1000);
        var d = new Date();
        $('clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var now = Date.now();
        // Ask every second: the stage answers with its state, whichever window opened first; that is also how this
        // window notices a second stage, or that its own stage has gone.
        if (!tick.last || now - tick.last >= 1000) { tick.last = now; sy.send({ type: 'hello' }); }
        var linked = state && now - lastSeen < STALE;
        $('link').textContent = linked ? 'LINKED TO STAGE' : 'WAITING FOR STAGE';
        $('link').className = linked ? 'on' : '';
        banner();
      }
      iv = setInterval(tick, 500);
      tick();

      return {
        sync: sy, thumbs: TB, compiled: compiled,
        bound: function () { return bound; },
        state: function () { return state; },
        destroy: function () {
          if (dead) return;
          dead = true;
          clearInterval(iv);
          listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
          sy.close(); TB.destroy();
        }
      };
    });
  }

  PD.notes = notes;
  return { notes: notes };
});
