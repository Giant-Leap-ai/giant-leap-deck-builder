/* engine/core/sync.js — stage <-> notes messaging (spec §4.11). Rewritten at M6 from cinema/engine/stage.js (Sync).
 *
 *   PD.Sync(deckId, { role: 'stage' | 'notes' }) → { id, role, deck, send(msg), on(fn) → off(), close(), addPeer(win) }
 *
 * One Sync per page role. Creating one draws exactly ONE Math.random (the instance id, as today's Sync did at load);
 * registering this module draws none and touches nothing (spec §3.1 rule 4).
 * Transports, all scoped to the deck so two decks (or a copy of the talk deck) never drive each other:
 *   - BroadcastChannel('pixeldeck:' + deckId)
 *   - localStorage key 'pixeldeck:' + deckId + ':msg' (the `storage` event, for pages without BroadcastChannel)
 *   - postMessage to window.opener and to added peers, when present
 * The old names 'pixeldeck-cinema' / 'cinema:msg' are never used.
 * Envelope (send() adds it; on() handlers get the whole envelope):
 *   { v: 2, deck: deckId, from: id, mid: from + ':' + seq } &
 *   ( { type: 'state', inst, slide, step, steps, total, id, beat, blackout, ready }
 *   | { type: 'cmd', cmd: 'next'|'prev'|'goto'|'blackout'|'replay', slide?, step?, target?: inst }
 *   | { type: 'hello' } )
 * A message is delivered at most once (dedup by mid; it may arrive on several transports), never to its sender, and
 * only when its v and deck match. Targeting (cmd.target) is the receiver's business: the Player ignores a cmd whose
 * target is set and is not its own id. */
PD.module('core/sync', [], function (PD) {
  function Sync(deckId, opts) {
    deckId = String(deckId == null ? '' : deckId);
    var role = opts && opts.role === 'notes' ? 'notes' : 'stage';
    var CHANNEL = 'pixeldeck:' + deckId, KEY = CHANNEL + ':msg';
    var me = Math.random().toString(36).slice(2), seq = 0, handlers = [], seen = {}, nSeen = 0, peers = [], bc = null, closed = false;

    function ours(msg) { return !!msg && typeof msg === 'object' && msg.v === 2 && msg.deck === deckId && typeof msg.mid === 'string'; }
    function recv(msg) {
      if (closed || !ours(msg) || msg.from === me || seen[msg.mid]) return;
      if (++nSeen > 2000) { seen = {}; nSeen = 1; }            // bounded: a long talk sends a few messages per click
      seen[msg.mid] = 1;
      var hs = handlers.slice();
      for (var i = 0; i < hs.length; i++) hs[i](msg);
    }
    function onStorage(e) { if (e.key === KEY && e.newValue) { try { recv(JSON.parse(e.newValue)); } catch (err) { } } }
    function onMessage(e) { if (ours(e.data)) recv(e.data); }

    try { bc = new BroadcastChannel(CHANNEL); bc.onmessage = function (e) { recv(e.data); }; } catch (e) { bc = null; }
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);

    function send(msg) {
      if (closed) return null;
      var env = { v: 2, deck: deckId, from: me, mid: me + ':' + (++seq) };
      for (var k in msg) if (Object.prototype.hasOwnProperty.call(msg, k) && !Object.prototype.hasOwnProperty.call(env, k)) env[k] = msg[k];
      if (bc) { try { bc.postMessage(env); } catch (e) { } }
      try { localStorage.setItem(KEY, JSON.stringify(env)); } catch (e) { }
      var t = peers.slice();
      try { if (window.opener && t.indexOf(window.opener) < 0) t.push(window.opener); } catch (e) { }
      for (var i = 0; i < t.length; i++) { try { if (t[i] && !t[i].closed) t[i].postMessage(env, '*'); } catch (e) { } }
      return env;
    }
    function on(fn) {
      handlers.push(fn);
      return function off() { var i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); };
    }
    function close() {
      if (closed) return;
      closed = true; handlers = []; peers = [];
      if (bc) { try { bc.close(); } catch (e) { } bc = null; }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
    }
    return {
      id: me, role: role, deck: deckId, channel: CHANNEL, key: KEY,
      send: send, on: on, close: close,
      addPeer: function (w) { if (w && peers.indexOf(w) < 0) peers.push(w); }
    };
  }

  PD.Sync = Sync;
  return { Sync: Sync };
});
