/* engine/core/thumbs.js — idle-sliced thumbnail cache (spec §4.12).
 *
 *   PD.Thumbs(compiled, opts?: { w = 480, h = 270, max = 150 }) → {
 *     get(si, step) → HTMLCanvasElement | null      a cached still (counts as a use for the LRU), else null
 *     request(si, step, priority = 0)               queue one state; a higher priority renders first (then FIFO)
 *     requestAll()                                  queue every state of the deck, in deck order
 *     pending() → number, size() → number, total() → number     (additive: queue length, cached count, state count)
 *     setDeck(compiled)                             the deck changed: entries whose sceneKey or themeKey changed are
 *                                                   dropped, the offscreen stage takes the new deck, queued states
 *                                                   that no longer exist are dropped
 *     on('ready', fn(si, step, canvas)) → off()     after each new still
 *     destroy() }
 * One offscreen PD.Stage({ thumb: true }) sized with resize(w, h, 1). Exactly one stage.still() per
 * requestIdleCallback({ timeout: 200 }) — or per setTimeout(16) where idle callbacks are not available — so the page
 * that shows thumbnails (the presenter window, the Studio) never blocks for more than one still at a time. Each
 * result is copied into its own canvas. Cache key: themeKey + '|' + sceneKeys[si] + '|' + step; at most `max` entries
 * (least recently used goes first). Registration touches nothing; the stage is created by the first PD.Thumbs call. */
PD.module('core/thumbs', ['core/stage'], function (PD, stageMod) {
  var Stage = stageMod.Stage;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  function Thumbs(compiled, opts) {
    opts = opts || {};
    var W = opts.w || 480, H = opts.h || 270, MAX = opts.max || 150;
    var deck = compiled, cv = document.createElement('canvas');
    var st = new Stage(cv, { deck: deck, thumb: true });
    st.resize(W, H, 1);
    var cache = new Map(), queue = [], seq = 0, handle = null, handleKind = null, dead = false, readyFns = [];

    function nStates() { var n = 0; for (var i = 0; i < deck.scenes.length; i++) n += 1 + st.stepsOf(i); return n; }
    function valid(si, step) { return si >= 0 && si < deck.scenes.length && step >= 0 && step <= st.stepsOf(si); }
    function keyOf(si, step) { return deck.themeKey + '|' + deck.sceneKeys[si] + '|' + step; }

    function get(si, step) {
      if (dead || !valid(si, step)) return null;
      var k = keyOf(si, step), c = cache.get(k);
      if (!c) return null;
      cache.delete(k); cache.set(k, c);           // most recently used last
      return c;
    }
    function request(si, step, priority) {
      if (dead) return;
      si = si | 0; step = step | 0; priority = +priority || 0;
      if (!valid(si, step) || cache.has(keyOf(si, step))) return;
      for (var i = 0; i < queue.length; i++) {
        if (queue[i].si === si && queue[i].step === step) { if (priority > queue[i].priority) queue[i].priority = priority; schedule(); return; }
      }
      queue.push({ si: si, step: step, priority: priority, seq: seq++ });
      schedule();
    }
    function requestAll() {
      for (var si = 0; si < deck.scenes.length; si++) for (var k = 0; k <= st.stepsOf(si); k++) request(si, k, 0);
    }
    function takeNext() {
      var best = -1;
      for (var i = 0; i < queue.length; i++) {
        var q = queue[i];
        if (best < 0 || q.priority > queue[best].priority || (q.priority === queue[best].priority && q.seq < queue[best].seq)) best = i;
      }
      return best < 0 ? null : queue.splice(best, 1)[0];
    }
    function schedule() {
      if (dead || handle != null || !queue.length) return;
      if (typeof requestIdleCallback === 'function') { handleKind = 'idle'; handle = requestIdleCallback(slice, { timeout: 200 }); }
      else { handleKind = 'timeout'; handle = setTimeout(slice, 16); }
    }
    function slice() {
      handle = null;
      if (dead) return;
      var q = takeNext();
      while (q && (!valid(q.si, q.step) || cache.has(keyOf(q.si, q.step)))) q = takeNext();
      if (q) {
        st.still(q.si, q.step);                    // exactly one still per slice
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').drawImage(cv, 0, 0);
        var k = keyOf(q.si, q.step);
        cache.set(k, c);
        while (cache.size > MAX) cache.delete(cache.keys().next().value);
        var fs = readyFns.slice();
        for (var i = 0; i < fs.length; i++) fs[i](q.si, q.step, c);
      }
      schedule();
    }
    function setDeck(next) {
      if (dead) return;
      var keep = {}, si, k;
      deck = next;
      st.setDeck(next);
      for (si = 0; si < deck.scenes.length; si++) for (k = 0; k <= st.stepsOf(si); k++) keep[keyOf(si, k)] = 1;
      cache.forEach(function (c, key) { if (!has(keep, key)) cache.delete(key); });
      queue = queue.filter(function (q) { return valid(q.si, q.step); });
      schedule();
    }
    function on(ev, fn) {
      if (ev !== 'ready' || typeof fn !== 'function') return function () { };
      readyFns.push(fn);
      return function off() { var i = readyFns.indexOf(fn); if (i >= 0) readyFns.splice(i, 1); };
    }
    function destroy() {
      if (dead) return;
      dead = true;
      if (handle != null) {
        try { if (handleKind === 'idle') cancelIdleCallback(handle); else clearTimeout(handle); } catch (e) { }
        handle = null;
      }
      queue = []; readyFns = []; cache.clear();
      st.destroy();
    }

    return {
      get: get, request: request, requestAll: requestAll, setDeck: setDeck, on: on, destroy: destroy,
      pending: function () { return queue.length; }, size: function () { return cache.size; }, total: nStates,
      stage: st
    };
  }

  PD.Thumbs = Thumbs;
  return { Thumbs: Thumbs };
});
