/* engine/core/ease.js — easing functions and the Timeline (body verbatim from engine/tween.js). */
PD.module('core/ease', [], function (PD) {
  /* pixeldeck — easing functions + a tiny timeline (no dependencies). */
  var Ease = (function () {
    var E = {
      linear: function (t) { return t; },
      inQuad: function (t) { return t * t; },
      outQuad: function (t) { return t * (2 - t); },
      inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
      inCubic: function (t) { return t * t * t; },
      outCubic: function (t) { var u = t - 1; return u * u * u + 1; },
      inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
      inBack: function (t) { var s = 1.70158; return t * t * ((s + 1) * t - s); },
      outBack: function (t) { var s = 1.70158, u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
      outElastic: function (t) {
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
      },
      outBounce: function (t) {
        var n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
      }
    };
    // Accept "easeInOutCubic", "inOutCubic", "easeOutBack", ... or a function.
    E.get = function (name) {
      if (typeof name === 'function') return name;
      if (!name) return E.inOutCubic;
      var n = String(name).replace(/^ease/, '');
      n = n.charAt(0).toLowerCase() + n.slice(1);
      return E[n] || E.inOutCubic;
    };
    return E;
  })();

  /* Timeline: schedule callbacks at times (seconds) relative to its start.
   * update(dt) fires due events in time order; finish() fires everything left,
   * in order, calling onSeek(t) before each so dependants can catch up. */
  function Timeline() {
    this.t = 0;
    this.events = [];
    this.seq = 0;
  }
  Timeline.prototype.at = function (t, fn, prio) {
    this.events.push({ t: Math.max(0, t || 0), fn: fn, prio: prio || 0, seq: this.seq++ });
    this.events.sort(function (a, b) { return a.t - b.t || a.prio - b.prio || a.seq - b.seq; });
    return this;
  };
  Timeline.prototype.update = function (dt, onSeek) {
    this.t += dt;
    while (this.events.length && this.events[0].t <= this.t) {
      var ev = this.events.shift();
      if (onSeek) onSeek(ev.t);
      ev.fn(ev.t);
    }
  };
  Timeline.prototype.finish = function (onSeek) {
    while (this.events.length) {
      var ev = this.events.shift();
      if (ev.t > this.t) this.t = ev.t;
      if (onSeek) onSeek(ev.t);
      ev.fn(ev.t);
    }
  };
  Timeline.prototype.pending = function () { return this.events.length > 0; };
  Timeline.prototype.clear = function () { this.events.length = 0; this.t = 0; };
  return { Ease: Ease, Timeline: Timeline };
});
