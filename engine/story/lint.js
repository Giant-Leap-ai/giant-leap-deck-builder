/* engine/story/lint.js — the coherence checker (the Studio panel is called Director), spec §6.7 (WP5).
 *
 *   PD.story.rule({ id, sev: 'error'|'warn'|'info', area: 'story'|'pace'|'copy'|'visual'|'build',
 *                   check(ctx) → [{ scene?, step?, vars, sev?, msg?, fix? }], msg, fix })       register a rule
 *     msg and fix are strings with {tokens} filled from `vars` ({i} is the 1-based scene number, {id} the scene id, both
 *     supplied when the result names a scene). A result may override sev, msg and fix (pace.runtime and vis.palette do).
 *   PD.story.rules() → rule[]             the registered rules, in order
 *   PD.story.lint(compiled, timing?) → { findings, score, ready, counts, summary, estimated, total, timing, ruleErrors, ms }
 *     ruleErrors: [{ id, msg }] for a rule whose check threw (the rule is skipped; a healthy engine reports none)
 *     findings: [{ id, sev, area, scene?, sceneId?, step?, msg, fix, vars }], errors first, then warnings, then tips,
 *               each group in scene order (deck-level findings first). score = max(0, 100 − 15·E − 5·W − 1·I).
 *     ready: no errors ("Ready for the stage" never blocks presenting). summary: COPY lint.clean, or lint.summary filled.
 *     timing: a Timing from PD.story.timing / estimate (spec §6.6). Its animSec values are reused for the scenes whose
 *               content is unchanged; notes and dwell are always read from `compiled`, so a stale timing is safe. Without
 *               one the analytic estimate is used (`estimated: true`).
 *     scene.lint.ignore: [ruleId] silences a rule for that scene. Validate issues (PD.validate, when loaded) and the
 *     compile errors appear as `build.<code>` findings with their own level; particles.budget, asset.not-embedded and
 *     text.overflow are left out when vis.particle-budget, vis.asset-source or copy.lines already report that scene.
 *     A story-less deck (no meta.story) skips the story rules; a framework-less one (blank) skips every rule that needs beats.
 *
 *   ctx (what a rule sees) = { compiled, story, fw, beats, theme, timing, total, hasStory, hasCosmos,
 *       scenes: [{ i, id, beat, roles, tpl, like, energy, steps, sec, start, pos, notesWords, ignore: Set, scene, isTemplate,
 *                  texts: [text, …] (every text of the scene once, .step = the state that adds it),
 *                  states: [{ k, world, place, texts: [text], visibleWords, dense, sec, items, shapes, motion, timing }] }],
 *       place(world) → 'flat'|'hyperspace'|'galaxy'|'horizon'|'planet'|'void'|'space', echo(text) → bool,
 *       particles(state) → n (estimated particle targets of a state), notes(sceneInfo) → string[] (speech notes) }
 *     text = { str, style, size, reveal, color, box: { x, y, w, h } | null, lines: string[], overflow, maxWidth, words, at, id,
 *              step, spec }
 *
 * Text is measured with the text element's measure() (the real glyph widths), once per text spec object and theme: the
 * Studio re-lints after every edit and only the changed scenes are measured again. PD.story.lint.clearCache() forgets
 * the measurements (call it after an embedded font has loaded).
 * Registration defines functions and registers rules only: no DOM, no texture, no random number. */
PD.module('story/lint', ['story/copy', 'story/frameworks', 'story/timing', 'core/util'], function (PD, copy, fws, tm, util) {
  var S = PD.story;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  var DW = util.DW, DH = util.DH, words = copy.words;
  function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function round(x) { return Math.round(x); }
  function trimEnd(s) { return String(s).trim().replace(/[.!?\u2026\s]+$/, ''); }
  function norm(s) { return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
  function minutes(sec) { var m = sec / 60; return String(m >= 10 ? Math.round(m) : Math.round(m * 10) / 10); }

  /* ---------------------------------------------------------- rule registry */
  var rules = [], ruleById = {};
  function rule(def) {
    if (!def || typeof def.id !== 'string' || typeof def.check !== 'function') throw new Error('pixeldeck: PD.story.rule needs { id, sev, area, check, msg, fix }');
    if (['error', 'warn', 'info'].indexOf(def.sev) < 0) throw new Error('pixeldeck: story rule "' + def.id + '": sev must be error, warn or info');
    if (has(ruleById, def.id)) throw new Error('pixeldeck: story rule "' + def.id + '" is registered twice');
    ruleById[def.id] = def; rules.push(def);
    return def;
  }

  /* ---------------------------------------------------------- measuring */
  var measured = new WeakMap();      // text spec → { key, info }
  var particleMemo = new WeakMap();  // spec → { key, n }
  var LIGHT = { year: 1, label: 1, caption: 1 };

  function textInfo(spec, env, step) {
    var c = measured.get(spec);
    if (c && c.key === env.theme.key) { if (c.info.step === step) return c.info; var again = {}; for (var kk in c.info) again[kk] = c.info[kk]; again.step = step; return again; }
    var styles = env.theme.styles || {}, style = spec.style || 'title', st = styles[style] || styles.title || {};
    var str = spec.str == null ? '' : String(spec.str);
    var info = {
      spec: spec, id: spec.id || null, str: str, style: style, size: spec.size != null ? spec.size : st.size,
      reveal: spec.reveal || 'letters', color: spec.color || null, at: spec.at || 0, step: step,
      maxWidth: spec.maxWidth != null ? spec.maxWidth : st.maxWidth != null ? st.maxWidth : 1700,
      words: words(str), box: null, lines: [str], overflow: false
    };
    var E = PD.element.get('text');
    try {
      var m = E.measure(spec, env);
      info.box = { x: m.x, y: m.y, w: m.w, h: m.h };
      info.lines = m.lines || [str];
      info.overflow = m.w > info.maxWidth + 0.5 || m.x < 0 || m.y < 0 || m.x + m.w > DW || m.y + m.h > DH;
    } catch (e) { }
    measured.set(spec, { key: env.theme.key, info: info });
    return info;
  }
  function weightOf(t) { return LIGHT[t.style] ? 0.5 : 1; }

  function shapeCount(spec, env) {
    var c = particleMemo.get(spec);
    if (c && c.key === env.theme.key) return c.n;
    var n = 0;
    try {
      switch (spec.shape) {
        case 'spark': n = spec.count || 700; break;
        case 'cube': n = 12 * (spec.perEdge || 46); break;
        case 'swarm': n = spec.count || 500; break;
        case 'points': var p = typeof spec.points === 'function' ? spec.points() : spec.points; n = Array.isArray(p) ? p.length : 0; break;
        default:
          var d = PD.shape.get(spec.shape);
          if (d) { var sh = d.create(spec, { byId: {}, theme: env.theme, col: env.col, uid: function () { return 'lint'; } }); n = sh && sh.n || 0; }
      }
    } catch (e) { n = 0; }
    particleMemo.set(spec, { key: env.theme.key, n: n });
    return n;
  }
  function elementParticles(spec, kind, env) {
    if (kind !== 'text' && spec.asset !== undefined) {      // pictures depend on decode state: counted once decoded, never memoized (as validate does)
      var ra = env.assets(spec.asset);
      if (!ra || !ra.ok) return 0;
      try { var D = PD.element.get(kind); return D && typeof D.particleCount === 'function' ? +D.particleCount(spec, env) || 0 : 0; } catch (e) { return 0; }
    }
    var c = particleMemo.get(spec);
    if (c && c.key === env.theme.key) return c.n;
    var n = 0;
    try {
      var E = PD.element.get(kind);
      if (E && typeof E.particleCount === 'function') n = E.particleCount(spec, env) || 0;
    } catch (e) { n = 0; }
    particleMemo.set(spec, { key: env.theme.key, n: n });
    return n;
  }

  /* ---------------------------------------------------------- the context */
  function placeOf(w, hasCosmos) {
    if (!hasCosmos) return 'flat';
    if (w.warp > 0.5 || w.speed >= 1000) return 'hyperspace';
    if (w.galaxy > 0.5) return 'galaxy';
    if (w.earth > 0.5) return w.earthR >= 1500 ? 'horizon' : 'planet';
    if (w.stars < 0.3 && w.nebulaAmount < 0.1) return 'void';
    return 'space';
  }

  // spec §6.1: scene.energy ?? template(scene.like || scene.template).story.energy ?? 3, a number from 1 to 5
  function energyOf(sc, T) {
    var e = sc.energy != null && isFinite(+sc.energy) ? +sc.energy : T && T.story && isFinite(+T.story.energy) && T.story.energy != null ? +T.story.energy : 3;
    return Math.max(1, Math.min(5, e));
  }

  function buildCtx(compiled, timing) {
    var theme = compiled.theme, story = compiled.meta && isObj(compiled.meta.story) ? compiled.meta.story : null;
    var fwId = story && story.framework, fw = fws.framework(fwId);
    var beats = fw && fw.beats.length ? fw.beats : null;
    var tmg = tm.retime(compiled, timing);
    var D = tm.worldDefaults(compiled), hasCosmos = compiled.worlds.indexOf('cosmos') >= 0;
    var aid = compiled.assetsDeckId || compiled.id;          // the element env of spec §4.6: the deck's runtime assets
    var env = { theme: theme, col: util.colFor(theme.colors || {}), assets: function (id) { return typeof PD.asset === 'function' ? PD.asset(aid, id) : null; }, stage: null };
    var srcScenes = compiled.source && Array.isArray(compiled.source.scenes) ? compiled.source.scenes : [];
    var bigTokens = story ? story.bigIdea : '';

    var scenes = compiled.scenes.map(function (sc, i) {
      sc = sc || {};
      var T = tm.templateOf(sc), like = sc.like || sc.template || null;
      var bi = beats ? fws.beatIndex(fw, sc.beat) : -1, beat = bi >= 0 ? beats[bi] : null;
      var ts = tmg.scenes[i], seen = new Map(), uniq = [];
      var states = tm.resolveStatesWith(D, sc).map(function (R, k) {
        var texts = R.texts.map(function (it) {
          var t = textInfo(it.spec, env, it.step);
          if (!seen.has(it.spec)) { seen.set(it.spec, t); uniq.push(t); }
          return seen.get(it.spec);
        });
        var vw = 0;
        texts.forEach(function (t) { vw += t.words * weightOf(t); });
        return {
          k: k, world: R.world, place: placeOf(R.world, hasCosmos), texts: texts, visibleWords: vw, dense: vw >= 16,
          sec: ts.states[k].sec, items: R.items, shapes: R.shapes, motion: R.motion, timing: R.timing
        };
      });
      var nw = 0;
      [sc.notes].concat(tm.stepList(sc).map(function (st) { return st && st.notes; })).forEach(function (n) { nw += words(copy.speech(n)); });
      var src = srcScenes[i];
      return {
        i: i, id: sc.id, beat: sc.beat, roles: beat ? beat.roles : [], beatDef: beat, tpl: T, like: like,
        energy: energyOf(sc, T),
        steps: tm.nSteps(sc), sec: ts.sec, start: ts.start, pos: 0, notesWords: nw,
        ignore: new Set(arr(sc.lint && sc.lint.ignore)), scene: sc, isTemplate: !!(src && src.template !== undefined),
        texts: uniq, states: states
      };
    });
    var total = tmg.total;
    scenes.forEach(function (s) { s.pos = total > 0 ? (s.start + s.sec / 2) / total : 0; });

    var echoCache = copy.tokens(bigTokens);
    return {
      compiled: compiled, story: story, fw: fw, beats: beats, theme: theme, timing: tmg, total: total, hasStory: !!story,
      hasCosmos: hasCosmos, scenes: scenes, env: env,
      place: function (w) { return placeOf(w, hasCosmos); },
      echo: function (text) { return echoCache.length > 0 && copy.echo(bigTokens, text); },
      notes: function (s) {
        var out = [copy.speech(s.scene.notes)];
        tm.stepList(s.scene).forEach(function (st) { out.push(copy.speech(st && st.notes)); });
        return out.filter(Boolean);
      },
      particles: function (state) {
        var n = 0;
        state.items.forEach(function (it) {
          if (it.kind === 'counter' || (it.spec.reveal || (it.kind === 'text' ? 'letters' : 'fade')) !== 'particles') return;
          n += it.kind === 'text' ? elementParticles(it.spec, 'text', env) : elementParticles(it.spec, it.kind, env);
        });
        state.shapes.forEach(function (sh) { n += shapeCount(sh.spec, env); });
        return n;
      }
    };
  }

  /* helpers shared by the rules */
  function eachText(ctx, fn) { ctx.scenes.forEach(function (s) { s.texts.forEach(function (t) { fn(s, t); }); }); }
  function allStrings(s) { var out = []; s.texts.forEach(function (t) { out.push(t.str); }); return out; }
  function lastState(s) { return s.states[s.states.length - 1]; }
  function energyRuns(ctx, minLen) {
    var runs = [], a = 0, S = ctx.scenes;
    for (var i = 1; i <= S.length; i++) {
      if (i === S.length || S[i].energy !== S[a].energy) { if (i - a >= minLen) runs.push([a, i - 1]); a = i; }
    }
    return runs;
  }
  function textGapToPoint(box, px, py) {
    var dx = Math.max(box.x - px, 0, px - (box.x + box.w)), dy = Math.max(box.y - py, 0, py - (box.y + box.h));
    return Math.sqrt(dx * dx + dy * dy);
  }
  function beatLabel(b) { return b ? b.label : ''; }

  /* ================================================================ story rules */
  rule({ id: 'story.idea-missing', sev: 'error', area: 'story',
    msg: "There's no big idea yet: the one sentence they'll repeat later.",
    fix: "Finish this: 'If they remember one thing, it's that…'",
    check: function (ctx) { return ctx.hasStory && !String(ctx.story.bigIdea || '').trim() ? [{ vars: {} }] : []; } });

  rule({ id: 'story.idea-long', sev: 'warn', area: 'story',
    msg: 'Your big idea is {n} words. Try saying it in one breath.',
    fix: 'Cut it to a subject, a verb and what\'s at stake.',
    check: function (ctx) { var n = ctx.hasStory ? words(ctx.story.bigIdea) : 0; return n > 15 ? [{ vars: { n: n } }] : []; } });

  rule({ id: 'story.beats-missing', sev: 'error', area: 'story',
    msg: 'The {beat} beat is empty, so the story skips a step.',
    fix: 'Add a {template}: {ask}',
    check: function (ctx) {
      if (!ctx.beats) return [];
      var out = [];
      ctx.beats.forEach(function (b) {
        if (!b.required) return;
        if (ctx.scenes.some(function (s) { return s.beat === b.id; })) return;
        out.push({ vars: { beat: b.label.toLowerCase(), template: b.templates[0], ask: b.ask } });
      });
      return out;
    } });

  rule({ id: 'story.unassigned', sev: 'warn', area: 'story',
    msg: "Scene {i} doesn't serve any beat.", fix: 'Assign it to a beat, or cut it.',
    check: function (ctx) {
      if (!ctx.beats) return [];
      var out = [];
      ctx.scenes.forEach(function (s) { if (s.isTemplate && !s.beatDef) out.push({ scene: s.i, vars: {} }); });
      return out;
    } });

  rule({ id: 'story.beat-order', sev: 'warn', area: 'story',
    msg: '{beat} comes after {later}, so the arc runs backwards here.', fix: 'Move it, or mark it as a flashback.',
    check: function (ctx) {
      if (!ctx.beats) return [];
      var out = [];
      for (var i = 1; i < ctx.scenes.length; i++) {
        var a = ctx.scenes[i - 1], b = ctx.scenes[i];
        if (!a.beatDef || !b.beatDef || b.scene.flashback) continue;
        if (fws.beatIndex(ctx.fw, b.beat) < fws.beatIndex(ctx.fw, a.beat)) out.push({ scene: i, vars: { beat: beatLabel(b.beatDef), later: beatLabel(a.beatDef).toLowerCase() } });
      }
      return out;
    } });

  rule({ id: 'story.hook', sev: 'warn', area: 'story',
    msg: 'You open on {template}. People decide in the first 30 seconds whether to lean in.',
    fix: 'Put a cold open before your title: a spark, a question or a number.',
    check: function (ctx) {
      var s = ctx.scenes[0];
      if (!s || !s.tpl || !s.tpl.story) return [];
      return s.tpl.story.hook ? [] : [{ scene: 0, vars: { template: s.tpl.label || s.like } }];
    } });

  rule({ id: 'story.idea-early', sev: 'warn', area: 'story',
    msg: "Your big idea doesn't show up in the first third.", fix: 'Plant it early. Even a subtitle counts.',
    check: function (ctx) {
      if (!ctx.hasStory || !String(ctx.story.bigIdea || '').trim() || !ctx.scenes.length) return [];
      var found = ctx.scenes.some(function (s) {
        return s.pos < 0.33 && allStrings(s).concat(ctx.notes(s)).some(function (t) { return ctx.echo(t); });
      });
      return found ? [] : [{ vars: {} }];
    } });

  rule({ id: 'story.idea-echo', sev: 'warn', area: 'story',
    msg: "The ending doesn't echo your big idea.", fix: "Bring '{short}' back in the last two scenes.",
    check: function (ctx) {
      if (!ctx.hasStory || !String(ctx.story.bigIdea || '').trim() || !ctx.scenes.length) return [];
      // §6.7: on-screen text of the scenes at pos >= .75, and only those (the last scene counts when its pos says so)
      var found = ctx.scenes.some(function (s) { return s.pos >= 0.75 && allStrings(s).some(function (t) { return ctx.echo(t); }); });
      return found ? [] : [{ vars: { short: trimEnd(ctx.story.shortIdea || ctx.story.bigIdea) } }];
    } });

  rule({ id: 'story.turns', sev: 'warn', area: 'story',
    msg: 'Your story has {n} turning points. This arc wants {k}.', fix: "Mark the moment the audience's view flips.",
    check: function (ctx) {
      if (!ctx.beats) return [];
      var n = ctx.scenes.filter(function (s) { return s.roles.indexOf('turn') >= 0; }).length, k = ctx.fw.turns;
      if (n === 0) return [{ sev: 'error', vars: { n: 0, k: k } }];
      return k != null && n !== k ? [{ vars: { n: n, k: k } }] : [];
    } });

  rule({ id: 'story.turn-position', sev: 'warn', area: 'story',
    msg: 'Your turn lands at {p}%. This arc expects about {ideal}%.', fix: 'Move setup after the turn, or trim the proof.',
    check: function (ctx) {
      if (!ctx.beats) return [];
      var out = [], last = ctx.scenes.length - 1;
      ctx.scenes.forEach(function (s) {
        if (s.roles.indexOf('turn') < 0) return;
        var acc = 0;
        for (var i = 0; i < ctx.beats.length && ctx.beats[i].id !== s.beat; i++) acc += ctx.beats[i].share;
        var ideal = acc + s.beatDef.share / 2;
        if (Math.abs(s.pos - ideal) > 0.2 || s.i === last) out.push({ scene: s.i, vars: { p: round(s.pos * 100), ideal: round(ideal * 100) } });
      });
      return out;
    } });

  rule({ id: 'story.cta', sev: 'warn', area: 'story',
    msg: "There's no clear ask. What should they do on Monday?", fix: "Put '{ask}' on screen in the final beat, or at least in its notes.",
    check: function (ctx) {
      if (!ctx.beats) return [];
      var ask = ctx.hasStory ? norm(ctx.story.ask || '') : '';
      var ok = ctx.scenes.some(function (s) {
        if (s.roles.indexOf('cta') < 0) return false;
        var strs = allStrings(s).concat(ctx.notes(s));
        return strs.some(function (t) { return (ask && norm(t).indexOf(ask) >= 0) || copy.startsImperative(t); });
      });
      var given = ctx.story && String(ctx.story.ask || '').trim();
      if (ok) return [];
      return given ? [{ vars: { ask: given } }] : [{ fix: 'Put your ask on screen in the final beat. Start with a verb: Book, Try, Pick.', vars: {} }];
    } });

  rule({ id: 'story.thanks-ending', sev: 'info', area: 'story',
    msg: 'You end on "thank you". Your last image should be your idea.', fix: 'Make the idea the hero and move thanks into the subtitle.',
    check: function (ctx) {
      var s = ctx.scenes[ctx.scenes.length - 1];
      if (!s || !s.texts.length) return [];
      var big = s.texts[0];
      s.texts.forEach(function (t) { if ((t.size || 0) > (big.size || 0)) big = t; });
      return /^(thank|questions|q&a)/i.test(big.str.trim()) ? [{ scene: s.i, vars: {} }] : [];
    } });

  rule({ id: 'story.bookend', sev: 'info', area: 'story',
    msg: "The ending doesn't call back to the opening.", fix: 'Return to your opening world or phrase, changed.',
    // §6.7, as written: "the last scene repeats no hero or title string and no place from the first half". Hero and title
    // are the text styles of those names; every place() value counts, 'flat' and 'space' included. The first half is the first
    // ceil(n/2) scenes, for the strings and the places alike (the opening is the scenes you open on, not whatever happens to
    // finish before the clock hits halfway); the last scene is never its own callback.
    check: function (ctx) {
      var n = ctx.scenes.length;
      if (n < 2) return [];
      var last = ctx.scenes[n - 1], big = {}, places = {}, half = Math.min(n - 1, Math.ceil(n / 2));
      function head(t) { return t.style === 'hero' || t.style === 'title'; }
      for (var i = 0; i < half; i++) {
        var s = ctx.scenes[i];
        s.texts.forEach(function (t) { if (head(t)) big[norm(t.str)] = 1; });
        s.states.forEach(function (st) { places[st.place] = 1; });
      }
      var repeats = last.texts.some(function (t) { return head(t) && has(big, norm(t.str)); }) ||
        last.states.some(function (st) { return has(places, st.place); });
      return repeats ? [] : [{ scene: last.i, vars: {} }];
    } });

  rule({ id: 'story.beat-share', sev: 'info', area: 'story',
    msg: "{beat} takes {p}% of the talk. It's usually about {s}%.", fix: 'Trim it or expand it.',
    check: function (ctx) {
      if (!ctx.beats || ctx.total <= 0) return [];
      var out = [];
      ctx.beats.forEach(function (b) {
        var mine = ctx.scenes.filter(function (s) { return s.beat === b.id; });
        if (!mine.length) return;
        var share = mine.reduce(function (a, s) { return a + s.sec; }, 0) / ctx.total;
        if (share > 2 * b.share || share < 0.4 * b.share) out.push({ scene: mine[0].i, vars: { beat: b.label, p: round(share * 100), s: round(b.share * 100) } });
      });
      return out;
    } });

  rule({ id: 'story.point', sev: 'info', area: 'story',
    msg: "What's the one thing scene {i} says?", fix: 'Write it in the scene\'s point field.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) { if (s.isTemplate && !(typeof s.scene.point === 'string' && s.scene.point.trim())) out.push({ scene: s.i, vars: {} }); });
      return out;
    } });

  /* ================================================================ pace rules */
  rule({ id: 'pace.runtime', sev: 'warn', area: 'pace',
    msg: 'This runs about {est} min in a {target}-min slot.',
    fix: 'Running over: cut a proof scene first. Running under: add a story, not more text.',
    check: function (ctx) {
      if (!ctx.hasStory) return [];
      var t = +ctx.story.targetMin;
      if (!(t > 0)) return ctx.scenes.length ? [{ sev: 'info', msg: 'Set your slot length: the runtime check needs it.', fix: 'Answer "How long is your slot?" in the brief.', vars: {} }] : [];
      var dev = Math.abs(ctx.total / 60 - t) / t;
      if (dev <= 0.15) return [];
      var over = ctx.total / 60 > t;
      return [{ sev: dev > 0.35 ? 'error' : 'warn', fix: over ? 'Cut a proof scene first.' : 'Add a story, not more text.', vars: { est: minutes(ctx.total), target: t } }];
    } });

  rule({ id: 'pace.flatline', sev: 'warn', area: 'pace',
    msg: 'Scenes {a}–{b} all sit at the same energy. Flat is forgettable.', fix: 'Break it with a big number, a question or a pivot.',
    check: function (ctx) { return energyRuns(ctx, 4).map(function (r) { return { scene: r[0], vars: { a: r[0] + 1, b: r[1] + 1 } }; }); } });

  rule({ id: 'pace.no-peak', sev: 'warn', area: 'pace',
    msg: 'Nothing rises above {max}/5, so there\'s no peak.', fix: 'Give the turn a pivot or a hyperspace moment.',
    check: function (ctx) {
      if (!ctx.scenes.length) return [];
      var max = Math.max.apply(null, ctx.scenes.map(function (s) { return s.energy; }));
      return max < 4 ? [{ vars: { max: max } }] : [];
    } });

  rule({ id: 'pace.peak-early', sev: 'info', area: 'pace',
    msg: 'Your biggest moment is behind you by halfway.', fix: 'Save a peak for the turn or the finale.',
    check: function (ctx) {
      if (!ctx.scenes.length) return [];
      var max = Math.max.apply(null, ctx.scenes.map(function (s) { return s.energy; })), at = null;
      ctx.scenes.forEach(function (s) { if (s.energy === max) at = s; });
      return at && at.pos < 0.5 ? [{ scene: at.i, vars: {} }] : [];
    } });

  rule({ id: 'pace.arc-drift', sev: 'info', area: 'pace',
    msg: 'Your energy drifts away from the {framework} shape.', fix: 'The arc view shows where the gaps are.',
    check: function (ctx) {
      if (!ctx.beats || !ctx.scenes.length) return [];
      var sum = 0;
      ctx.scenes.forEach(function (s) { sum += Math.abs(s.energy - fws.idealEnergy(ctx.fw, s.pos)); });
      return sum / ctx.scenes.length > 1.25 ? [{ vars: { framework: ctx.fw.name } }] : [];
    } });

  rule({ id: 'pace.dense-run', sev: 'warn', area: 'pace',
    msg: 'Three text-heavy shots in a row. The room starts reading instead of listening.', fix: 'Break it with a visual or a silent beat.',
    check: function (ctx) {
      var out = [], a = -1;
      for (var i = 0; i <= ctx.scenes.length; i++) {
        var dense = i < ctx.scenes.length && lastState(ctx.scenes[i]).dense;
        if (dense) { if (a < 0) a = i; }
        else { if (a >= 0 && i - a >= 3) out.push({ scene: a, vars: { a: a + 1, b: i } }); a = -1; }
      }
      return out;
    } });

  rule({ id: 'pace.wall', sev: 'error', area: 'pace',
    msg: "Scene {i} shows {n} words at once. That's a document.", fix: 'Move it to the notes and keep 15 or fewer on screen.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        var worst = null;
        s.states.forEach(function (st) { if (st.visibleWords > 30 && (!worst || st.visibleWords > worst.visibleWords)) worst = st; });
        if (worst) out.push({ scene: s.i, step: worst.k, vars: { n: round(worst.visibleWords) } });
      });
      return out;
    } });

  rule({ id: 'pace.long-hold', sev: 'warn', area: 'pace',
    msg: 'Scene {i} holds one picture for about {s}s.', fix: 'Split it, or add a step.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) { var hold = s.sec / (1 + s.steps); if (hold > 120) out.push({ scene: s.i, vars: { s: round(hold) } }); });
      return out;
    } });

  rule({ id: 'pace.steps', sev: 'warn', area: 'pace',
    msg: '{n} clicks in one scene.', fix: 'Split it into two scenes.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) { if (s.steps > 8) out.push({ scene: s.i, vars: { n: s.steps } }); });
      return out;
    } });

  rule({ id: 'pace.reveal-wait', sev: 'warn', area: 'pace',
    msg: "The last words land after {s}s, so you'll be waiting on the deck.", fix: 'Bring `at` forward, or make it a step.',
    check: function (ctx) {
      var out = [], TM = ctx.theme.timing || {};
      ctx.scenes.forEach(function (s) {
        var worst = 0, step = 0;
        s.texts.forEach(function (t) {
          var k = t.step, st = k > 0 ? tm.stepList(s.scene)[k - 1] || {} : null;
          var delay = k > 0 ? (st.textDelay == null ? TM.stepTextDelay : st.textDelay) : (s.scene.textDelay == null ? TM.textDelay : s.scene.textDelay);
          var inDur = t.spec.revealTime || (t.reveal === 'letters' ? 1.4 : t.reveal === 'particles' ? 0.9 : 1.1);
          var wait = (delay || 0) + t.at + inDur * (t.reveal === 'letters' ? 1.6 : 1);      // §6.7: textDelay + at + inDur·(letters ? 1.6 : 1); no prelude
          if (wait > worst) { worst = wait; step = k; }
        });
        if (worst > 8) out.push({ scene: s.i, step: step, vars: { s: round(worst) } });
      });
      return out;
    } });

  /* ================================================================ copy rules */
  rule({ id: 'copy.style-words', sev: 'warn', area: 'copy',
    msg: 'This {style} line has {n} words (max {max}).', fix: 'Say it in fewer words, or step up to a style that holds more.',
    check: function (ctx) {
      var out = [];
      eachText(ctx, function (s, t) {
        var b = copy.BUDGET[t.style];
        if (b && t.words > b.words) out.push({ scene: s.i, step: t.step, vars: { style: t.style, n: t.words, max: b.words } });
      });
      return out;
    } });

  rule({ id: 'copy.lines', sev: 'warn', area: 'copy',
    msg: '"{str}" wraps onto {n} lines.', fix: 'Shorten it, or step down one style.',
    check: function (ctx) {
      var out = [];
      eachText(ctx, function (s, t) {
        var b = copy.BUDGET[t.style];
        if (!b || !t.box) return;
        if (t.lines.length > b.lines || t.box.w > t.maxWidth + 1) out.push({ scene: s.i, step: t.step, vars: { str: t.str, n: t.lines.length } });
      });
      return out;
    } });

  rule({ id: 'copy.small', sev: 'warn', area: 'copy',
    msg: "Text this small can't be read from row 10.", fix: 'Use a kicker, and move the detail to the notes.',
    check: function (ctx) {
      var out = [];
      eachText(ctx, function (s, t) {
        if ((t.size != null && t.size < 20) || ((t.style === 'caption' || t.style === 'label') && t.words > 5)) out.push({ scene: s.i, step: t.step, vars: { str: t.str } });
      });
      return out;
    } });

  rule({ id: 'copy.one-hero', sev: 'warn', area: 'copy',
    msg: 'Two headlines are competing in scene {i}.', fix: 'Keep one hero per shot and demote the other to a subtitle.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        for (var k = 0; k < s.states.length; k++) {
          var n = s.states[k].texts.filter(function (t) { return t.style === 'hero' || t.style === 'mega'; }).length;
          if (n > 1) { out.push({ scene: s.i, step: k, vars: {} }); break; }
        }
      });
      return out;
    } });

  rule({ id: 'copy.placeholder', sev: 'error', area: 'copy',
    msg: 'Scene {i} still has placeholder text.', fix: 'Answer {token} in the interview, or delete the line.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        for (var j = 0; j < s.texts.length; j++) {
          var token = copy.placeholderIn(s.texts[j].str);
          if (token) { out.push({ scene: s.i, step: s.texts[j].step, vars: { token: token } }); break; }
        }
      });
      return out;
    } });

  rule({ id: 'copy.jargon', sev: 'info', area: 'copy',
    msg: 'People stop hearing words like "{word}".', fix: 'Say concretely what it does.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        var seen = {};
        s.texts.forEach(function (t) {
          copy.jargonIn(t.str).forEach(function (w) { if (!has(seen, w)) { seen[w] = 1; out.push({ scene: s.i, step: t.step, vars: { word: w } }); } });
        });
      });
      return out;
    } });

  rule({ id: 'copy.over-sun', sev: 'warn', area: 'copy',
    msg: '"{str}" sits in the sun\'s glare.', fix: 'Move it at least 200 px from the sun, or delay the sunrise.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        var seen = new Set();
        s.states.forEach(function (st) {
          var w = st.world;
          if (!(w.sun > 0.3)) return;
          st.texts.forEach(function (t) {
            if (seen.has(t.spec) || !t.box) return;
            if (textGapToPoint(t.box, w.sunX, w.sunY) < 200) { seen.add(t.spec); out.push({ scene: s.i, step: st.k, vars: { str: t.str } }); }
          });
        });
      });
      return out;
    } });

  rule({ id: 'copy.notes', sev: 'warn', area: 'copy',
    msg: 'Scene {i} has no speaker notes.', fix: 'Add one cue: what you say, or where to pause.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) { if (s.notesWords < 3) out.push({ scene: s.i, vars: {} }); });
      return out;
    } });

  /* ================================================================ visual rules */
  rule({ id: 'vis.teleport', sev: 'warn', area: 'visual',
    msg: 'Scene {i} jumps from {a} to {b} with no transition.', fix: 'Add a warp, a flash cue or a planet shot in between.',
    check: function (ctx) {
      if (!ctx.hasCosmos) return [];
      var out = [], TM = ctx.theme.timing || {};
      for (var i = 1; i < ctx.scenes.length; i++) {
        var prev = ctx.scenes[i - 1], cur = ctx.scenes[i];
        var A = lastState(prev), B = cur.states[0];
        var pa = A.place, pb = B.place;
        var glide = B.timing && B.timing.earthR ? B.timing.earthR[0] : (cur.scene.worldTime != null ? cur.scene.worldTime : TM.worldTime);
        var far = false;
        if (A.world.earth > 0.5 && B.world.earth > 0.5) {
          var hi = Math.max(A.world.earthR, B.world.earthR), lo = Math.max(1, Math.min(A.world.earthR, B.world.earthR));
          far = hi / lo > 20 && glide < 3;
        }
        var jump = (pa === 'galaxy' && pb === 'horizon') || (pa === 'horizon' && pb === 'galaxy') || far;
        if (!jump) continue;
        var flash = arr(cur.scene.cues).some(function (c) { return c && c.flash >= 0.3; });
        if (pa === 'hyperspace' || pb === 'hyperspace' || flash || cur.scene.prelude) continue;
        out.push({ scene: i, vars: { a: pa, b: pb } });
      }
      return out;
    } });

  rule({ id: 'vis.warp', sev: 'warn', area: 'visual',
    msg: 'Hyperspace {k} times. It stops being magic.', fix: 'Keep it for the one big jump.',
    check: function (ctx) {
      if (!ctx.hasCosmos) return [];
      var k = ctx.scenes.filter(function (s) { return s.states.some(function (st) { return st.place === 'hyperspace'; }); }).length;
      return k > Math.max(1, Math.floor(ctx.scenes.length / 6)) ? [{ vars: { k: k } }] : [];
    } });

  rule({ id: 'vis.particle-type', sev: 'info', area: 'visual',
    msg: "Particles assemble {k} lines. That's your exclamation mark.", fix: 'Save it for names and verdicts.',
    check: function (ctx) {
      var count = 0, crowded = false;
      eachText(ctx, function (s, t) { if (t.reveal === 'particles') count++; });
      ctx.scenes.forEach(function (s) {
        s.states.forEach(function (st) { if (st.texts.filter(function (t) { return t.reveal === 'particles'; }).length > 1) crowded = true; });
      });
      return count > Math.ceil(ctx.scenes.length / 2) || crowded ? [{ vars: { k: count } }] : [];
    } });

  rule({ id: 'vis.palette', sev: 'warn', area: 'visual',
    msg: '{k} accent colors. The deck stops reading as one film.', fix: 'Keep one accent for "what could be". One Giant Leap uses gold.',
    check: function (ctx) {
      var colors = {}, nc = 0;
      eachText(ctx, function (s, t) {
        var c = Array.isArray(t.color) ? t.color[0] : t.color;
        if (typeof c === 'string' && !has(colors, c.toLowerCase())) { colors[c.toLowerCase()] = 1; nc++; }
      });
      var fams = {}, nf = 0;
      function fam(f) {
        var first = String(f || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
        if (first && !has(fams, first)) { fams[first] = 1; nf++; }
      }
      fam(ctx.theme.fonts && ctx.theme.fonts.display);
      arr(ctx.theme.fontFaces).forEach(function (f) { fam(f && f.family); });
      var presets = {}, np = 0;
      if (ctx.hasCosmos) ctx.scenes.forEach(function (s) { s.states.forEach(function (st) { var n = st.world.nebula; if (typeof n === 'string' && !has(presets, n)) { presets[n] = 1; np++; } }); });
      var out = [];
      if (nc > 4) out.push({ vars: { k: nc } });
      if (nf > 2) out.push({ msg: '{k} fonts. The deck stops reading as one film.', fix: 'Stay with one display font.', vars: { k: nf } });
      if (np > 5) out.push({ msg: '{k} nebula looks. The deck stops reading as one film.', fix: 'Reuse two or three nebula presets.', vars: { k: np } });
      return out;
    } });

  rule({ id: 'vis.asset-source', sev: 'error', area: 'visual',
    msg: '"{asset}" can\'t be shown from a file link.', fix: 'Drop it into the studio again so it gets embedded.',
    check: function (ctx) {
      var out = [], map = PD.assets.get(ctx.compiled.assetsDeckId || ctx.compiled.id), seen = {};
      function check(id, s, step) {
        if (typeof id !== 'string' || !id || has(seen, id)) return;
        var a = has(map, id) ? map[id] : null;
        if (a && !(typeof a.src === 'string' && a.src.slice(0, 5) === 'data:')) { seen[id] = 1; out.push({ scene: s.i, step: step, vars: { asset: id } }); }
      }
      ctx.scenes.forEach(function (s) {
        s.states.forEach(function (st) {
          st.items.forEach(function (it) { if (it.kind !== 'text' && it.spec.asset) check(it.spec.asset, s, st.k); });
          if (st.world && st.world.photo > 0) check(st.world.photoAsset, s, st.k);
        });
      });
      arr(ctx.theme.fontFaces).forEach(function (f) {      // a brand font is an asset too (deck level: no scene shows it)
        var id = f && f.asset;
        if (typeof id !== 'string' || has(seen, id)) return;
        var a = has(map, id) ? map[id] : null;
        if (a && !(typeof a.src === 'string' && a.src.slice(0, 5) === 'data:')) { seen[id] = 1; out.push({ vars: { asset: id } }); }
      });
      return out;
    } });

  rule({ id: 'vis.particle-budget', sev: 'warn', area: 'visual',
    msg: 'Scene {i} asks for {n} particles. Part of the shape will be missing.', fix: 'Use fewer or shorter particle lines, or a smaller shape.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) {
        var worst = 0, at = 0;
        s.states.forEach(function (st) { var n = ctx.particles(st); if (n > worst) { worst = n; at = st.k; } });
        if (worst > 8000) out.push({ scene: s.i, step: at, sev: worst > 9000 ? 'error' : 'warn', vars: { n: worst } });
      });
      return out;
    } });

  /* ================================================================ running the checker */
  var DUP = { 'particles.budget': 'vis.particle-budget', 'asset.not-embedded': 'vis.asset-source', 'text.overflow': 'copy.lines' };
  var ORDER = { error: 0, warn: 1, info: 2 };

  function lint(compiled, timing) {
    var t0 = now();
    if (!compiled || !Array.isArray(compiled.scenes) || !compiled.theme) throw new Error('pixeldeck: PD.story.lint needs a CompiledDeck (PD.compile)');
    var ctx = buildCtx(compiled, timing), findings = [], ruleErrors = [];
    rules.forEach(function (r) {
      var res;
      try { res = r.check(ctx) || []; } catch (e) { res = []; ruleErrors.push({ id: r.id, msg: e && e.message ? e.message : String(e) }); }
      res.forEach(function (f) {
        var s = f.scene != null ? ctx.scenes[f.scene] : null;
        if (s && s.ignore.has(r.id)) return;
        var vars = {};
        if (s) { vars.i = s.i + 1; vars.id = s.id; }
        for (var k in (f.vars || {})) vars[k] = f.vars[k];
        findings.push({
          id: r.id, sev: f.sev || r.sev, area: r.area, scene: s ? s.i : undefined, sceneId: s ? s.id : undefined,
          step: f.step, msg: copy.fmt(f.msg || r.msg, vars), fix: copy.fmt(f.fix != null ? f.fix : r.fix, vars), vars: vars
        });
      });
    });

    // build findings: compile errors and PD.validate, with the overlaps removed
    var issues = [], seenIssue = {};
    function addIssue(is) {
      var key = is.code + '|' + is.scene + '|' + is.step + '|' + is.path + '|' + is.msg;
      if (has(seenIssue, key)) return;
      seenIssue[key] = 1; issues.push(is);
    }
    arr(compiled.errors).forEach(addIssue);
    if (typeof PD.validate === 'function') { try { arr(PD.validate(compiled)).forEach(addIssue); } catch (e) { } }
    issues.forEach(function (is) {
      var s = is.scene != null && is.scene >= 0 ? ctx.scenes[is.scene] : null;
      if (s && s.ignore.has('build.' + is.code)) return;
      if (has(DUP, is.code) && findings.some(function (f) { return f.id === DUP[is.code] && f.scene === is.scene; })) return;
      var vars = s ? { i: s.i + 1, id: s.id } : {};
      findings.push({ id: 'build.' + is.code, sev: is.level === 'error' ? 'error' : 'warn', area: 'build', scene: s ? s.i : undefined,
        sceneId: s ? s.id : undefined, step: is.step, msg: is.msg, fix: '', vars: vars });
    });

    findings.forEach(function (f, i) { f._n = i; });
    findings.sort(function (a, b) {
      return ORDER[a.sev] - ORDER[b.sev] || (a.scene == null ? -1 : a.scene) - (b.scene == null ? -1 : b.scene) || a._n - b._n;
    });
    findings.forEach(function (f) { delete f._n; });
    var counts = { error: 0, warn: 0, info: 0 };
    findings.forEach(function (f) { counts[f.sev]++; });
    return {
      findings: findings, score: Math.max(0, 100 - 15 * counts.error - 5 * counts.warn - counts.info), ready: counts.error === 0,
      counts: counts, summary: findings.length ? copy.say('lint.summary', { e: counts.error, w: counts.warn, i: counts.info }) : copy.say('lint.clean'),
      estimated: !ctx.timing.exact, total: ctx.total, timing: ctx.timing, ruleErrors: ruleErrors, ms: now() - t0
    };
  }

  // Measured text boxes are cached per text spec object and theme key. A font that finishes loading after the first
  // lint (an embedded brand font) changes widths without changing the key: the Studio calls this when fonts settle.
  lint.clearCache = function () { measured = new WeakMap(); particleMemo = new WeakMap(); };

  S.rule = rule;
  S.rules = function () { return rules.slice(); };
  S.lint = lint;
  return { rule: rule, rules: S.rules, lint: lint, buildCtx: buildCtx };
}, { export: false });
