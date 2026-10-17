/* engine/story/timing.js — the one runtime formula (spec §6.6, WP5): how long a deck takes, state by state.
 *
 * For scene i and state k (0 = the scene as it opens, k = after k clicks):
 *   animSec  simulated seconds until stage.busy() is false after entering (i, k) LIVE, from the previous state settled
 *            (capped at 30). PD.story.timing() measures it on a hidden Stage({ thumb: true }) ticked at 1/30 s.
 *            PD.story.estimate() is the analytic stand-in, the maximum of: every world tween that changes
 *            (delay + duration), the new text and elements (textDelay + prelude + at + reveal time, ×1.6 for letters,
 *            particles arrive after dur·0.95 + spread·0.7, then fade in over 1 s), every particle morph
 *            (when + spread + dur·1.2), the cues, the prelude, and 0.7 s when layers leave.
 *   dwellSec k == steps ? (scene.dwell ?? 3) : (scene.stepDwell?.[k] ?? steps[k].dwell ?? 2.5)   (tools/record.js' defaults)
 *   speakSec words(notes of state k) / 140 · 60. State 0 speaks scene.notes, state k > 0 speaks steps[k-1].notes. Prompt
 *            lines ("▸ …", written by the storyboard) are not speech. A scene with no notes at all gets
 *            (T.talkSec + T.stepTalkSec · steps) / (steps + 1) for each state, T being the template (scene.like, else
 *            scene.template), and 20 / (steps + 1) when there is none. (§6.6 says "Use 20 when there is neither": read here
 *            as talkSec = 20 and stepTalkSec = 0, so a notes-less raw scene speaks for 20 s in all. The other reading, 20 s
 *            for every state, would make it 20 · (steps + 1) s.)
 *   sec(i, k) = max(animSec + dwellSec, speakSec);  sec_i = Σ_k sec(i, k);  total = Σ_i sec_i;
 *   pos(i) = (start_i + sec_i / 2) / total
 *
 *   Timing = { v: 1, id, exact: boolean, total, animDwell: Σ(animSec + dwellSec), scenes: [{ i, id, key, akey, start, sec,
 *              states: [{ k, anim, dwell, speak, sec }] }] }       exact: every animSec was simulated, none estimated
 *              key: the scene's content hash; akey: the hash of what makes it animate (no notes, dwell or story metadata)
 *
 * PD.story.estimate(compiled) → Timing            synchronous, analytic
 * PD.story.timing(compiled, opts?) → Promise<Timing | null> with .cancel()
 *     opts: sliceMs (8: how long one slice may run before it yields), onProgress(done, total), schedule(fn),
 *     cache (true: simulated animSec are kept per theme, previous scene, scene animation key and state, so editing
 *     one scene re-simulates only it and its successor, and editing notes or dwell re-simulates nothing). Simulation errors fall back to the estimate for that state. The promise
 *     never rejects; a cancelled run resolves null. The hidden stage is destroyed at the end.
 * PD.story.retime(compiled, timing?) → Timing    the same formula for the CURRENT notes and dwell, reusing the animSec of
 *     `timing` for scenes whose id, animation key (akey) and step count still match and estimating the rest. This is what the
 *     lint and the Studio's arc use after an edit (notes and dwell never change an animation).
 * PD.story.resolveStates(compiled, i) → State[]   Stage.resolve (spec §4.2) for every state of scene i without a Stage:
 *     State = { k, world, items: [{ spec, kind, step }], texts, shapes: [{ spec, step }], motion, timing }
 * PD.story.worldDefaults(compiled) → object        plugin defaults (worlds order), then theme.world
 *
 * The engine's particle code draws random numbers (stagger and flight jitter), so a fresh
 * simulation differs from the last by a few hundredths of a second; the cache keeps repeated answers identical.
 * Registration defines functions only: no DOM, no texture, no random number. */
PD.module('story/timing', ['story/copy', 'core/compile', 'core/stage'], function (PD, copy, compileMod, stageMod) {
  var S = PD.story, Stage = stageMod.Stage;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function objs(v) { return arr(v).filter(function (x) { return x && typeof x === 'object'; }); }   // specs that can be shown
  function stepList(sc) { return sc && Array.isArray(sc.steps) ? sc.steps : []; }                    // the one notion of "the steps"
  var WPM = 140, CAP = 30, TICK = 1 / 30;

  /* ---------------------------------------------------------- resolution (spec §4.2) */
  function worldDefaults(compiled) {
    var D = {}, k;
    (compiled.worlds || []).forEach(function (n) {
      var d = PD.world.get(n);
      if (d && d.params) for (k in d.params) if (has(d.params, k)) D[k] = d.params[k];
    });
    var tw = (compiled.theme && compiled.theme.world) || {};
    for (k in tw) if (has(tw, k)) D[k] = tw[k];
    return D;
  }
  function resolveStatesWith(D, sc) {
    sc = sc && typeof sc === 'object' ? sc : {};
    var world = {}, k;
    for (k in D) world[k] = D[k];
    for (k in (sc.world || {})) world[k] = sc.world[k];
    var items = objs(sc.text).map(function (t) { return { spec: t, kind: 'text', step: 0 }; });
    objs(sc.elements).forEach(function (e) { items.push({ spec: e, kind: e.kind, step: 0 }); });
    var shapes = objs(sc.particles).map(function (t) { return { spec: t, step: 0 }; });
    var steps = stepList(sc), out = [];
    function snap(kk, motion, timing) {
      var w = {}; for (var p in world) w[p] = world[p];
      out.push({ k: kk, world: w, items: items.slice(), texts: items.filter(function (it) { return it.kind === 'text'; }),
                 shapes: shapes.slice(), motion: motion, timing: timing });
    }
    var m0 = {}; for (k in (sc.motion || {})) m0[k] = sc.motion[k];
    snap(0, m0, sc.timing || {});
    steps.forEach(function (st, idx) {
      st = st && typeof st === 'object' ? st : {};
      var s = idx + 1;
      if (st.clear) { items = []; shapes = []; }
      if (st.remove) {
        var rm = arr(st.remove);
        items = items.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
        shapes = shapes.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
      }
      objs(st.text).forEach(function (t) { items.push({ spec: t, kind: 'text', step: s }); });
      objs(st.elements).forEach(function (e) { items.push({ spec: e, kind: e.kind, step: s }); });
      objs(st.particles).forEach(function (t) { shapes.push({ spec: t, step: s }); });
      for (k in (st.world || {})) world[k] = st.world[k];
      var m = {}; for (k in m0) m[k] = m0[k];
      for (k in (st.motion || {})) m[k] = st.motion[k];
      snap(s, m, st.timing || sc.timing || {});
    });
    return out;
  }
  function resolveStates(compiled, i) { return resolveStatesWith(worldDefaults(compiled), compiled.scenes[i]); }

  /* ---------------------------------------------------------- dwell, speech, scene metadata */
  function nSteps(sc) { return stepList(sc).length; }
  function dwellOf(sc, k) {
    var n = nSteps(sc);
    if (k === n) return sc.dwell != null && isFinite(+sc.dwell) ? +sc.dwell : 3;
    var sd = Array.isArray(sc.stepDwell) ? sc.stepDwell[k] : null;
    if (sd != null && isFinite(+sd)) return +sd;
    var st = stepList(sc)[k];
    return st && st.dwell != null && isFinite(+st.dwell) ? +st.dwell : 2.5;
  }
  function notesOf(sc, k) { var n = k === 0 ? sc.notes : (stepList(sc)[k - 1] || {}).notes; return typeof n === 'string' ? n : ''; }
  function hasSpeech(sc) {
    if (copy.speech(sc.notes)) return true;
    return stepList(sc).some(function (st) { return st && copy.speech(st.notes); });
  }
  function templateOf(sc) { var id = sc && (sc.like || sc.template); return id ? PD.template.get(id) || null : null; }
  function speakOf(sc, k, T) {
    var n = nSteps(sc);
    if (!hasSpeech(sc)) {
      var tt = T && T.story ? T.story : null;
      var talk = tt && tt.talkSec != null ? +tt.talkSec : 20, per = tt && tt.stepTalkSec != null ? +tt.stepTalkSec : 0;
      return (talk + per * n) / (n + 1);
    }
    return copy.words(copy.speech(notesOf(sc, k))) / WPM * 60;
  }

  /* ---------------------------------------------------------- the analytic estimate */
  function crossfadeSet(compiled) {
    var out = {};
    (compiled.worlds || []).forEach(function (n) {
      var d = PD.world.get(n);
      if (d && d.crossfade) d.crossfade.forEach(function (p) { out[p] = 1; });
    });
    return out;
  }
  function revealEnd(spec, kind, inStart, mopt) {
    if (kind === 'counter') return inStart + Math.max(0.4, spec.countTime == null ? 1.8 : +spec.countTime);   // it counts while it fades in
    var reveal = spec.reveal || (kind === 'text' ? 'letters' : 'fade');         // an image fades in by default
    if (reveal === 'particles') return inStart + mopt.dur * 0.95 + mopt.spread * 0.7 + 1.0;
    var rv = reveal === 'letters' || reveal === 'focus' || reveal === 'rise' || reveal === 'fade' || reveal === 'wipe' ? null : PD.reveal.get(reveal);
    var inDur = spec.revealTime || (reveal === 'letters' ? 1.4 : rv && rv.inDur ? rv.inDur : 1.1);
    return inStart + inDur * (reveal === 'letters' ? 1.6 : rv && rv.animSpan ? rv.animSpan : 1);
  }
  function estimateState(compiled, xf, sc, k, R, prev) {
    var TM = compiled.theme.timing, MO = compiled.theme.motion;
    var isStep = k > 0, stepSpec = isStep ? stepList(sc)[k - 1] || {} : null;
    var end = 0, p, tm;
    // world tweens that change (Stage.setWorld)
    var defDur = (stepSpec && stepSpec.worldTime) || sc.worldTime || TM.worldTime;
    if (prev) {
      for (p in R.world) {
        var v = R.world[p], pv = prev.world[p];
        if (v === pv) continue;
        tm = R.timing[p];
        if (has(xf, p)) end = Math.max(end, tm ? tm[0] : defDur);
        else if (typeof v === 'number') end = Math.max(end, ((tm && tm[2]) || 0) + (tm && tm[0] != null ? tm[0] : defDur));
      }
    }
    // text and elements, particle morphs
    var m = R.motion;
    var mopt = { dur: m.dur == null ? MO.dur : m.dur, spread: m.spread == null ? MO.spread : m.spread };
    var delay = isStep ? (stepSpec.textDelay == null ? TM.stepTextDelay : stepSpec.textDelay) : (sc.textDelay == null ? TM.textDelay : sc.textDelay);
    var prelude = !isStep && sc.prelude === 'explode' ? (sc.preludeTime || TM.preludeTime) : 0;
    var morphTail = mopt.spread + mopt.dur * 1.2;
    end = Math.max(end, prelude);
    R.items.forEach(function (it) {
      if (isStep && it.step !== k) return;
      var at = it.spec.at || 0, inStart = delay + prelude + at;
      end = Math.max(end, revealEnd(it.spec, it.kind, inStart, mopt));
      if (it.kind !== 'counter' && (it.spec.reveal || (it.kind === 'text' ? 'letters' : 'fade')) === 'particles') end = Math.max(end, inStart + morphTail);
    });
    R.shapes.forEach(function (it) {
      if (isStep && it.step !== k) return;
      end = Math.max(end, (it.spec.at || 0) + prelude + morphTail);
    });
    // cues (live only)
    arr(isStep ? stepSpec.cues : sc.cues).forEach(function (c) { if (c && typeof c === 'object' && isFinite(+c.at)) end = Math.max(end, +c.at); });
    // layers that leave
    if (prev) {
      var keep = new Set(R.items.map(function (it) { return it.spec; }));
      prev.items.forEach(function (it) { if (!keep.has(it.spec)) end = Math.max(end, it.spec.exitTime || 0.7); });
    }
    return Math.min(CAP, end);
  }
  function estimateAnims(compiled, i, D, xf) {
    var sc = compiled.scenes[i], states = resolveStatesWith(D, sc), out = [];
    var prevScene = null;
    if (i > 0) { var ps = resolveStatesWith(D, compiled.scenes[i - 1]); prevScene = ps[ps.length - 1]; }
    for (var k = 0; k < states.length; k++)
      out.push(estimateState(compiled, xf, sc, k, states[k], k > 0 ? states[k - 1] : prevScene));
    return out;
  }

  /* The part of a scene that decides how it ANIMATES: everything except the notes, dwell and story metadata, so editing
   * a speaker note or a hold time never invalidates a simulated animSec (the cache and retime key on this). */
  var NOT_ANIMATION = { notes: 1, dwell: 1, stepDwell: 1, point: 1, beat: 1, energy: 1, lint: 1, like: 1, flashback: 1 };
  var akeyMemo = new WeakMap();      // scene object → its animation key (a scene object never changes: edits make new ones)
  function animKey(sc) {
    if (!sc || typeof sc !== 'object') return String(sc);
    if (akeyMemo.has(sc)) return akeyMemo.get(sc);
    var key = animKeyOf(sc);
    akeyMemo.set(sc, key);
    return key;
  }
  function animKeyOf(sc) {
    var o = {}, k;
    for (k in sc) if (has(sc, k) && !has(NOT_ANIMATION, k) && k !== 'steps') o[k] = sc[k];
    if (Array.isArray(sc.steps)) o.steps = sc.steps.map(function (st) {
      if (!st || typeof st !== 'object') return st;
      var c = {}; for (var j in st) if (has(st, j) && j !== 'notes' && j !== 'dwell') c[j] = st[j];
      return c;
    });
    return compileMod.sceneKey(o);
  }
  function animKeys(compiled) { return compiled.scenes.map(animKey); }

  /* ---------------------------------------------------------- composing a Timing */
  function compose(compiled, anims, exact) {
    var scenes = [], start = 0, animDwell = 0, akeys = animKeys(compiled);
    compiled.scenes.forEach(function (sc, i) {
      sc = sc || {};
      var n = nSteps(sc), T = templateOf(sc), states = [], sec = 0;
      for (var k = 0; k <= n; k++) {
        var anim = anims[i] && anims[i][k] != null ? anims[i][k] : 0, dwell = dwellOf(sc, k), speak = speakOf(sc, k, T);
        var s = Math.max(anim + dwell, speak);
        states.push({ k: k, anim: anim, dwell: dwell, speak: speak, sec: s });
        sec += s; animDwell += anim + dwell;
      }
      scenes.push({ i: i, id: sc.id, key: compiled.sceneKeys ? compiled.sceneKeys[i] : undefined, akey: akeys[i], start: start, sec: sec, states: states });
      start += sec;
    });
    return { v: 1, id: compiled.id, exact: !!exact, total: start, animDwell: animDwell, scenes: scenes };
  }
  function estimate(compiled) {
    var D = worldDefaults(compiled), xf = crossfadeSet(compiled), anims = compiled.scenes.map(function (sc, i) { return estimateAnims(compiled, i, D, xf); });
    return compose(compiled, anims, false);
  }
  function retime(compiled, timing) {
    var D = null, xf = null, exact = !!(timing && timing.exact), prevById = {};
    if (timing && Array.isArray(timing.scenes)) timing.scenes.forEach(function (s) { prevById[s.id] = s; });
    var akeys = animKeys(compiled);
    var anims = compiled.scenes.map(function (sc, i) {
      var old = prevById[sc && sc.id];
      if (old && old.akey === akeys[i] && old.states.length === nSteps(sc) + 1) return old.states.map(function (s) { return s.anim; });
      exact = false;
      if (!D) { D = worldDefaults(compiled); xf = crossfadeSet(compiled); }
      return estimateAnims(compiled, i, D, xf);
    });
    return compose(compiled, anims, exact);
  }

  /* ---------------------------------------------------------- the simulation */
  var animCache = new Map();
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function cacheKey(compiled, akeys, i, k) {
    return compiled.themeKey + '|' + (compiled.worlds || []).join(',') + '|' + (k === 0 && i > 0 ? akeys[i - 1] : '') + '|' + akeys[i] + '|' + k;
  }

  function timing(compiled, opts) {
    opts = opts || {};
    var sliceMs = opts.sliceMs > 0 ? opts.sliceMs : 8, useCache = opts.cache !== false;
    var schedule = opts.schedule || function (fn) { setTimeout(fn, 0); };
    var cancelled = false;
    var p = new Promise(function (resolve) {
      var est = null;
      function fallback(i, k) {
        if (!est) est = estimate(compiled);
        return est.scenes[i].states[k].anim;
      }
      var list = [], anims = compiled.scenes.map(function () { return []; });
      compiled.scenes.forEach(function (sc, i) { for (var k = 0; k <= nSteps(sc); k++) list.push([i, k]); });
      if (!list.length) return resolve(compose(compiled, anims, true));
      var stage = null, estimated = false;
      try {
        var cv = document.createElement('canvas');
        stage = new Stage(cv, { deck: compiled, thumb: true });
        stage.resize(160, 90, 1);
      } catch (e) { return resolve(estimate(compiled)); }

      var idx = 0, cur = null, ticks = 0, done = 0, akeys = animKeys(compiled);
      function finish(res) { try { stage.destroy(); } catch (e) { } resolve(res); }
      function begin(i, k) {
        if (k > 0) stage.enter(i, k - 1, 'settled');
        else if (i > 0) stage.enter(i - 1, nSteps(compiled.scenes[i - 1]), 'settled');
        else stage.setWorld(stage.resolve(0, 0).world, null, 0, null, true);
        stage.enter(i, k, 'live');
      }
      function record(i, k, anim) {
        anims[i][k] = anim;
        if (useCache && !estimated) animCache.set(cacheKey(compiled, akeys, i, k), anim);
        if (animCache.size > 4000) animCache.delete(animCache.keys().next().value);
        done++;
        if (opts.onProgress) { try { opts.onProgress(done, list.length); } catch (e) { } }
      }
      function slice() {
        if (cancelled) return finish(null);
        var t0 = now();
        try {
          for (;;) {
            if (cur === null) {
              if (idx >= list.length) return finish(compose(compiled, anims, !estimated));
              var s = list[idx], key = cacheKey(compiled, akeys, s[0], s[1]);
              if (useCache && animCache.has(key)) { anims[s[0]][s[1]] = animCache.get(key); done++; idx++; continue; }
              cur = s; ticks = 0;
              begin(s[0], s[1]);
            }
            if (!stage.busy() || ticks >= CAP / TICK) {
              var a = Math.min(CAP, ticks * TICK);
              record(cur[0], cur[1], a);
              cur = null; idx++;
            } else { stage.tick(TICK); ticks++; }
            if (now() - t0 > sliceMs) break;
          }
        } catch (e) {          // a state that cannot be played: use the analytic value and carry on
          if (cur) { anims[cur[0]][cur[1]] = fallback(cur[0], cur[1]); estimated = true; done++; cur = null; idx++; }
          else { idx++; estimated = true; }
        }
        schedule(slice);
      }
      schedule(slice);
    });
    p.cancel = function () { cancelled = true; };
    return p;
  }

  timing.estimate = estimate;
  timing.retime = retime;
  timing.clearCache = function () { animCache.clear(); };
  var api = { estimate: estimate, timing: timing, retime: retime, resolveStates: resolveStates, resolveStatesWith: resolveStatesWith,
              worldDefaults: worldDefaults, stepList: stepList, objs: objs, dwellOf: dwellOf, speakOf: speakOf, notesOf: notesOf, hasSpeech: hasSpeech, templateOf: templateOf, nSteps: nSteps, WPM: WPM };
  S.estimate = estimate; S.timing = timing; S.retime = retime;
  S.resolveStates = resolveStates; S.worldDefaults = worldDefaults;
  return api;
}, { export: false });
