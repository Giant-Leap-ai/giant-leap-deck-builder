/* tools/test/specs/wp5-timing.test.js — story/timing (spec §6.6 the one runtime formula; WP5 acceptance #2).
 * The OGL acceptance runs on the harness engine; the formula tests run on a fresh engine with the stub catalog. */

function wp5Deck(K, scenes, over) {
  var d = { format: 2, id: 'wp5-t', meta: { title: 't', theme: 'cosmos', story: { framework: 'blank', targetMin: null, bigIdea: 'x' } }, scenes: scenes };
  for (var k in over || {}) d[k] = over[k];
  return K.compile(d);
}
function wp5Words(n) { var w = []; for (var i = 0; i < n; i++) w.push('w' + i); return w.join(' '); }

T.test('timing: OGL simulated animation + dwell is within +-10% of the recorded 171 s video (acceptance #2)', function (a) {
  var c = PD.compile('one-giant-leap'), ms0 = performance.now();
  return PD.story.timing(c, { sliceMs: 40, cache: false }).then(function (t) {
    a.ok(performance.now() - ms0 < 8000, 'the simulation is quick: ' + Math.round(performance.now() - ms0) + ' ms');
    a.equal(t.v, 1); a.equal(t.id, 'one-giant-leap'); a.equal(t.exact, true, 'every animSec was simulated');
    a.ok(t.animDwell >= 171 * 0.9 && t.animDwell <= 171 * 1.1, 'animation + dwell ' + t.animDwell.toFixed(1) + ' s vs 171 s');
    a.ok(t.total >= 171 * 0.9 && t.total <= 171 * 1.1, 'total ' + t.total.toFixed(1) + ' s');
    a.equal(t.scenes.length, 10);
    a.deepEqual(t.scenes.map(function (s) { return s.states.length; }), [1, 1, 2, 2, 1, 1, 8, 2, 2, 1], 'one state per step plus the opening state');
    var start = 0;
    t.scenes.forEach(function (s, i) {
      a.equal(s.i, i); a.equal(s.id, c.scenes[i].id); a.equal(s.key, c.sceneKeys[i]);
      a.near(s.start, start, 1e-9, 'start of ' + s.id);
      var sum = 0; s.states.forEach(function (st) { a.ok(st.anim >= 0 && st.anim <= 30, 'anim of ' + s.id + '.' + st.k); sum += st.sec; });
      a.near(s.sec, sum, 1e-9); start += s.sec;
    });
    a.near(t.total, start, 1e-9, 'total = the sum of the scene seconds');
    // the dwell column is the recorder's own: last state scene.dwell, the others 2.5
    a.deepEqual(t.scenes[2].states.map(function (s) { return s.dwell; }), [2.5, 4]);
    a.deepEqual(t.scenes[6].states.map(function (s) { return s.dwell; }), [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 3]);
    a.equal(t.scenes[0].states[0].dwell, 6);
    return t;
  });
}, { timeout: 60000 });

T.test('timing: the analytic estimate is within +-15% of the simulation (OGL), and a deck is estimated synchronously', function (a) {
  var c = PD.compile('one-giant-leap'), est = PD.story.estimate(c);
  a.equal(est.exact, false); a.equal(est.scenes.length, 10);
  return PD.story.timing(c, { sliceMs: 40 }).then(function (sim) {
    a.ok(Math.abs(est.total - sim.total) / sim.total <= 0.15, 'estimate ' + est.total.toFixed(1) + ' vs simulation ' + sim.total.toFixed(1));
    a.ok(Math.abs(est.animDwell - sim.animDwell) / sim.animDwell <= 0.15);
    est.scenes.forEach(function (s, i) {
      a.ok(Math.abs(s.sec - sim.scenes[i].sec) / sim.scenes[i].sec <= 0.35, 'scene ' + s.id + ': ' + s.sec.toFixed(1) + ' vs ' + sim.scenes[i].sec.toFixed(1));
    });
  });
}, { timeout: 60000 });

T.test('timing: the estimate matches the simulation construct by construct (letters, fade, tweens, cues, spark, particles, prelude, exits)', function (a) {
  return wp5Fresh().then(function (K) {
    var hello = function (extra) { var t = { str: 'hello there', style: 'statement', y: 500 }; for (var k in extra) t[k] = extra[k]; return t; };
    var cases = [
      ['letters + at', { text: [hello({ at: 1 })] }],
      ['fade revealTime', { text: [hello({ reveal: 'fade', revealTime: 2 })] }],
      ['rise default', { text: [hello({ reveal: 'rise' })] }],
      ['world tween', { world: { speed: 40 } }],
      ['world tween with timing', { world: { speed: 40 }, timing: { speed: [2, 'linear', 1] } }],
      ['world time', { world: { speed: 40 }, worldTime: 4 }],
      ['crossfade nebula', { world: { nebula: 'dawn' } }],
      ['cue', { cues: [{ at: 4, flash: 0.2 }] }],
      ['spark shape', { particles: [{ shape: 'spark', count: 60, radius: 30 }] }, 0.55],       // a morph's estimate is an upper bound: with few particles
      ['particles text', { text: [hello({ reveal: 'particles', style: 'hero', str: 'Hi' })], motion: { dur: 1.2, spread: 0.6 } }, 0.55],   // none of them draws the extreme jitter
      ['prelude', { prelude: 'explode', preludeTime: 0.7, text: [hello({ reveal: 'fade' })] }],
      ['text delay', { textDelay: 1.5, text: [hello({ reveal: 'fade' })] }]
    ];
    var chain = Promise.resolve();
    cases.forEach(function (cs) {
      chain = chain.then(function () {
        var c = wp5Deck(K, [{ id: 'a', text: [{ str: 'before', style: 'kicker', y: 300, reveal: 'fade' }], dwell: 1 }, (function () { var s = { id: 'b', dwell: 1 }; for (var k in cs[1]) s[k] = cs[1][k]; return s; })()]);
        var est = K.story.estimate(c).scenes[1].states[0].anim;
        return K.story.timing(c, { sliceMs: 40, cache: false }).then(function (sim) {
          var got = sim.scenes[1].states[0].anim, up = cs[2] || Math.max(0.2, 0.08 * got);
          a.ok(est - got <= up, cs[0] + ': the estimate ' + est.toFixed(2) + ' is not more than ' + up.toFixed(2) + ' above the simulation ' + got.toFixed(2));
          a.ok(got - est <= 0.1, cs[0] + ': the estimate ' + est.toFixed(2) + ' never undershoots the simulation ' + got.toFixed(2) + ' by more than 0.1 s');
        });
      });
    });
    return chain;
  });
}, { timeout: 60000 });

T.test('timing: dwell defaults (last state 3, other states 2.5), steps[k].dwell and scene.stepDwell override, scene.dwell', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Deck(K, [
      { id: 'plain', steps: [{}, {}] },
      { id: 'set', dwell: 7, steps: [{ dwell: 1 }, {}] },
      { id: 'over', dwell: 2, stepDwell: [4], steps: [{ dwell: 1 }, { dwell: 9 }] }
    ]);
    var t = K.story.estimate(c), d = function (i) { return t.scenes[i].states.map(function (s) { return s.dwell; }); };
    a.deepEqual(d(0), [2.5, 2.5, 3]); a.deepEqual(d(1), [1, 2.5, 7]); a.deepEqual(d(2), [4, 9, 2]);
  });
});

T.test('timing: speakSec = words / 140 * 60, state 0 speaks scene.notes and state k speaks steps[k-1].notes; sec = max(anim + dwell, speak)', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Deck(K, [{ id: 'talk', dwell: 2, notes: wp5Words(35), steps: [{ notes: wp5Words(70), dwell: 1 }, { notes: 'short' }] }]);
    var t = K.story.estimate(c), st = t.scenes[0].states;
    a.near(st[0].speak, 35 / 140 * 60, 1e-9); a.near(st[1].speak, 70 / 140 * 60, 1e-9); a.near(st[2].speak, 1 / 140 * 60, 1e-9);
    a.near(st[0].sec, Math.max(st[0].anim + st[0].dwell, 15), 1e-9); a.equal(st[0].sec, 15, '35 words at 140 wpm is 15 s');
    a.near(st[1].sec, 30, 1e-9);
    a.near(st[2].sec, st[2].anim + st[2].dwell, 1e-9, 'a short note never beats animation + dwell');
    a.near(t.scenes[0].sec, st[0].sec + st[1].sec + st[2].sec, 1e-9);
  });
});

T.test('timing: a scene with no notes at all speaks (talkSec + stepTalkSec * steps) / (steps + 1) per state; 20 without a template', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Deck(K, [
      { id: 'hyper', like: 'hyperspace', dwell: 0.5, steps: [{ dwell: 0.5 }] },      // 20 + 20 * 1 over 2 states
      { id: 'cold', like: 'cold-open', dwell: 0.5 },                                  // 20 + 0
      { id: 'none', dwell: 0.5, steps: [{ dwell: 0.5 }, { dwell: 0.5 }] },            // no template: 20 / 3
      { id: 'prompt', like: 'planet', dwell: 0.5, notes: '▸ What is the question?' }   // a prompt is not a note: planet's 40 s
    ]);
    var t = K.story.estimate(c), sp = function (i) { return t.scenes[i].states.map(function (s) { return s.speak; }); };
    a.deepEqual(sp(0), [20, 20]); a.deepEqual(sp(1), [20]);
    sp(2).forEach(function (v) { a.near(v, 20 / 3, 1e-9); });
    a.deepEqual(sp(3), [40], 'prompt-only notes fall back to the template');
    a.ok(t.scenes[0].states[0].sec >= 20, 'the speaking time wins over a half-second dwell');
    // one note anywhere means the scene is "noted": states without notes speak 0
    var c2 = wp5Deck(K, [{ id: 'one', like: 'hyperspace', dwell: 0.5, steps: [{ dwell: 0.5, notes: wp5Words(14) }] }]);
    a.deepEqual(K.story.estimate(c2).scenes[0].states.map(function (s) { return s.speak; }), [0, 6]);
  });
});

T.test('timing: pos(i) = (start_i + sec_i / 2) / total', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Ogl(K), t = K.story.estimate(c);
    t.scenes.forEach(function (s) {
      var pos = (s.start + s.sec / 2) / t.total;
      a.ok(pos > 0 && pos < 1);
      if (s.i > 0) a.ok(pos > (t.scenes[s.i - 1].start + t.scenes[s.i - 1].sec / 2) / t.total, 'positions increase');
    });
    a.near((t.scenes[9].start + t.scenes[9].sec / 2) / t.total, 0.96, 0.01);
  });
});

T.test('timing: animSec is capped at 30 s (analytic and simulated)', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Deck(K, [{ id: 'a', dwell: 1 }, { id: 'b', dwell: 1, world: { speed: 99 }, worldTime: 100 }]);
    a.equal(K.story.estimate(c).scenes[1].states[0].anim, 30);
    return K.story.timing(c, { sliceMs: 60, cache: false }).then(function (t) {
      a.near(t.scenes[1].states[0].anim, 30, 1e-9);
      a.equal(t.exact, true);
    });
  });
}, { timeout: 60000 });

T.test('timing: the cache keeps a repeat answer identical; one edited scene re-simulates only it and its successor', function (a) {
  return wp5Fresh().then(function (K) {
    K.story.timing.clearCache();
    var mk = function (word) {
      return wp5Deck(K, [
        { id: 'a', text: [{ str: 'one', style: 'kicker', y: 300 }], dwell: 1 },
        { id: 'b', text: [{ str: word, style: 'kicker', y: 300 }], dwell: 1 },
        { id: 'c', text: [{ str: 'three', style: 'kicker', y: 300 }], dwell: 1 }]);
    };
    var c1 = mk('two'), progress = [];
    return K.story.timing(c1, { sliceMs: 40, onProgress: function (d, n) { progress.push(d + '/' + n); } }).then(function (t1) {
      a.equal(progress[progress.length - 1], '3/3');
      return K.story.timing(c1, { sliceMs: 40 }).then(function (t2) {
        a.deepEqual(t2, t1, 'cached: identical');
        // retime reuses the anim values of unchanged scenes and marks the result inexact when it had to estimate
        var c2 = mk('two but longer'), re = K.story.retime(c2, t1);
        a.equal(re.exact, false);
        a.equal(re.scenes[0].states[0].anim, t1.scenes[0].states[0].anim, 'unchanged scene: the simulated value');
        a.equal(re.scenes[2].states[0].anim, t1.scenes[2].states[0].anim);
        var again = K.story.retime(c1, t1);
        a.deepEqual(again, t1, 'nothing changed: retime returns the same numbers');
        a.equal(again.exact, true);
      });
    });
  });
}, { timeout: 60000 });

T.test('timing: retime follows notes and dwell edits without re-simulating, and estimates scenes it has never timed', function (a) {
  return wp5Fresh().then(function (K) {
    var c1 = wp5Deck(K, [{ id: 'a', dwell: 1, text: [{ str: 'one', style: 'kicker', y: 300 }] }, { id: 'b', dwell: 1, text: [{ str: 'two', style: 'kicker', y: 300 }] }]);
    return K.story.timing(c1, { sliceMs: 40, cache: false }).then(function (t1) {
      var c2 = K.compileScene(c1, 1, { id: 'b', dwell: 9, notes: wp5Words(140), text: c1.source.scenes[1].text });   // same text objects, new dwell and notes
      var re = K.story.retime(c2, t1);
      a.equal(re.scenes[1].states[0].dwell, 9); a.near(re.scenes[1].states[0].speak, 60, 1e-9);
      a.equal(re.scenes[1].states[0].anim, t1.scenes[1].states[0].anim, 'a note or dwell edit does not change an animation');
      a.equal(re.exact, true, 'and the result is still fully simulated');
      a.equal(re.scenes[1].key !== t1.scenes[1].key, true, 'the content key changed'); a.equal(re.scenes[1].akey, t1.scenes[1].akey, 'the animation key did not');
      var c3 = K.compileScene(c2, 2, { id: 'c', dwell: 1 });                                    // a scene appended
      var re3 = K.story.retime(c3, re);
      a.equal(re3.scenes.length, 3); a.equal(re3.exact, false);
    });
  });
}, { timeout: 60000 });

T.test('timing: a cancelled run resolves null; a state that cannot be played falls back to the estimate and the promise never rejects', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Ogl(K), p = K.story.timing(c, { sliceMs: 5, cache: false });
    p.cancel();
    return p.then(function (r) {
      a.equal(r, null, 'cancelled');
      var bad = wp5Deck(K, [{ id: 'a', dwell: 1 }, { id: 'boom', dwell: 1, particles: [{ shape: 'points', points: function () { throw new Error('nope'); } }] }, { id: 'z', dwell: 1 }]);
      return K.story.timing(bad, { sliceMs: 40, cache: false });
    }).then(function (t) {
      a.equal(t.exact, false, 'a fallback makes the result inexact');
      a.equal(t.scenes.length, 3);
      a.ok(t.scenes[1].states[0].anim >= 0 && t.scenes[2].states[0].anim >= 0);
    });
  });
}, { timeout: 60000 });

T.test('timing: an empty deck times to zero; resolveStates equals Stage.resolve for every OGL state', function (a) {
  return wp5Fresh().then(function (K) {
    var empty = wp5Deck(K, []);
    a.equal(K.story.estimate(empty).total, 0);
    return K.story.timing(empty).then(function (t) {
      a.equal(t.total, 0); a.deepEqual(t.scenes, []);
      var c = wp5Ogl(K), cv = document.createElement('canvas'), st = new K.Stage(cv, { deck: c, thumb: true }), n = 0;
      c.scenes.forEach(function (sc, i) {
        var mine = K.story.resolveStates(c, i);
        a.equal(mine.length, st.stepsOf(i) + 1);
        mine.forEach(function (m, k) {
          var R = st.resolve(i, k);
          a.deepEqual(m.world, R.world, 'world ' + i + '.' + k);
          a.deepEqual(m.items.map(function (x) { return [x.spec, x.kind, x.step]; }), R.items.map(function (x) { return [x.spec, x.kind, x.step]; }), 'items ' + i + '.' + k);
          a.deepEqual(m.shapes.map(function (x) { return [x.spec, x.step]; }), R.shapes.map(function (x) { return [x.spec, x.step]; }), 'shapes ' + i + '.' + k);
          a.deepEqual(m.motion, R.motion, 'motion ' + i + '.' + k); a.deepEqual(m.timing, R.timing, 'timing ' + i + '.' + k);
          n++;
        });
      });
      a.equal(n, 21, 'all 21 OGL states');
      st.destroy();
    });
  });
}, { timeout: 60000 });
