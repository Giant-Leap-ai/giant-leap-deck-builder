/* tools/test/specs/wp5-lint.test.js — story/lint (spec §6.7; WP5 acceptance #1, #5, #6, #7).
 * Every rule has a positive and a negative fixture: the negative is the unmodified OGL deck (which the calibration test
 * proves clean) or a one-line fix of the positive; the positive is OGL with one mutation. All on the fresh engine with the
 * stub catalog, so template metadata is the §5 table. */

function wp5Sc(src, id) { return src.scenes.filter(function (s) { return s.id === id; })[0]; }
function wp5Find(r, id) { return r.findings.filter(function (f) { return f.id === id; }); }
function wp5Words2(n) { var w = []; for (var i = 0; i < n; i++) w.push('word' + i); return w.join(' '); }
function wp5Lint(K, a, mutate, timing) {
  var r = K.story.lint(wp5Ogl(K, mutate), timing);
  a.deepEqual(r.ruleErrors, [], 'no rule threw: ' + JSON.stringify(r.ruleErrors));
  return r;
}
function wp5Case(K, a, c) {
  var neg = wp5Lint(K, a, c.neg || null);
  a.equal(wp5Find(neg, c.id).length, 0, c.id + ': the negative fixture has no finding (' + String(c.neg || 'the unmodified deck').replace(/\s+/g, ' ').slice(0, 110) + ')');
  var pos = wp5Lint(K, a, c.pos), hits = wp5Find(pos, c.id);
  a.ok(hits.length >= 1, c.id + ': the positive fixture has a finding (got ' + pos.findings.map(function (f) { return f.id; }).join(', ') + ') for ' + String(c.pos).replace(/\s+/g, ' ').slice(0, 110));
  hits.forEach(function (f) {
    a.equal(f.area, c.id.split('.')[0] === 'vis' ? 'visual' : c.id.split('.')[0], c.id + ' area');
    a.ok(f.msg && f.msg.indexOf('{') < 0, c.id + ': message has no unfilled token: ' + f.msg);
    a.ok(typeof f.fix === 'string' && (f.fix.indexOf('{') < 0 || c.id === 'copy.placeholder'), c.id + ': fix has no unfilled token: ' + f.fix);
  });
  if (c.sev) a.equal(hits[0].sev, c.sev, c.id + ' severity');
  if (c.scene != null) a.equal(hits[0].scene, c.scene, c.id + ' scene');
  if (c.check) c.check(hits, pos);
  return pos;
}

function wp5None(K, a, id, mutate, why) {      // a fixture that must NOT produce the finding
  var r = wp5Lint(K, a, mutate);
  a.equal(wp5Find(r, id).length, 0, id + ': ' + why);
  return r;
}

/* ------------------------------------------------------------------ calibration (acceptance #1) */
function wp5Calibrate(a, lint) {
  a.equal(lint.counts.error, 0, 'OGL: 0 errors (' + lint.findings.filter(function (f) { return f.sev === 'error'; }).map(function (f) { return f.id; }) + ')');
  var warns = lint.findings.filter(function (f) { return f.sev === 'warn'; }).map(function (f) { return f.id; });
  a.deepEqual(warns, ['story.cta'], 'OGL: the only warning is story.cta');
  a.ok(lint.score >= 90, 'OGL: score ' + lint.score + ' >= 90');
  a.equal(lint.ready, true);
  a.deepEqual(lint.ruleErrors, []);
}

T.test('lint (calibration, acceptance #1): OGL on the harness engine has 0 errors, only story.cta as a warning, score >= 90 (estimated and simulated timing)', function (a) {
  var c = PD.compile('one-giant-leap');
  var est = PD.story.lint(c);
  wp5Calibrate(a, est);
  a.equal(est.estimated, true);
  return PD.story.timing(c, { sliceMs: 40, cache: false }).then(function (t) {
    var sim = PD.story.lint(c, t);
    wp5Calibrate(a, sim);
    a.equal(sim.estimated, false);
    var infos = sim.findings.filter(function (f) { return f.sev === 'info'; }).map(function (f) { return f.id; });
    a.deepEqual(infos, ['pace.runtime'], 'the only tip is "set your slot length" (targetMin is null)');
    a.equal(sim.score, 94);
    a.equal(sim.summary, '0 to fix, 1 to consider, 1 tips.');
  });
}, { timeout: 60000 });

T.test('lint (calibration): the same result with the §5 template metadata present (energy, talk time and hook come from the templates)', function (a) {
  return wp5Fresh().then(function (K) {
    var r = K.story.lint(wp5Ogl(K));
    wp5Calibrate(a, r);
    var bare = wp5Ogl(K, function (src) { src.scenes.forEach(function (s) { delete s.energy; }); });
    var rb = K.story.lint(bare);
    wp5Calibrate(a, rb);
    // with the energies deleted they come from the templates of §5: 2 4 5 3 2 4 3 3 5 4 (the same numbers)
    var ctx = K.get('story/lint').buildCtx(bare, null);
    a.deepEqual(ctx.scenes.map(function (s) { return s.energy; }), [2, 4, 5, 3, 2, 4, 3, 3, 5, 4]);
    a.deepEqual(ctx.scenes.map(function (s) { return s.like; }), ['cold-open', 'brand-reveal', 'hyperspace', 'galaxy-reveal', 'planet', 'sunrise', 'timeline', 'the-box', 'pivot', 'finale']);
  });
});

T.test('lint: ctx has the shape of §6.7 (scenes, states, texts with boxes, roles, pos, ignore)', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Ogl(K, function (src) { wp5Sc(src, 'spark').lint = { ignore: ['copy.notes'] }; });
    var ctx = K.get('story/lint').buildCtx(c, null);
    a.equal(ctx.scenes.length, 10); a.equal(ctx.fw.id, 'giant-leap'); a.equal(ctx.story.framework, 'giant-leap'); a.ok(ctx.total > 100);
    var s = ctx.scenes[6];
    a.deepEqual([s.i, s.id, s.beat, s.roles, s.steps, s.states.length], [6, 'leaps', 'pattern', ['proof'], 7, 8]);
    a.ok(s.tpl && s.tpl.story.hook === false && s.like === 'timeline');
    a.ok(s.pos > 0.5 && s.pos < 0.7); a.equal(typeof s.sec, 'number'); a.equal(typeof s.start, 'number'); a.ok(s.notesWords > 10);
    a.ok(ctx.scenes[0].ignore instanceof Set && ctx.scenes[0].ignore.has('copy.notes'));
    var st = s.states[7], t = st.texts[0];
    a.deepEqual(Object.keys(st).filter(function (k) { return ['k', 'world', 'texts', 'visibleWords', 'dense', 'sec'].indexOf(k) >= 0; }).sort(), ['dense', 'k', 'sec', 'texts', 'visibleWords', 'world']);
    ['str', 'style', 'size', 'reveal', 'color', 'box', 'lines', 'overflow'].forEach(function (k) { a.ok(k in t, 'text.' + k); });
    a.deepEqual([t.str, t.style, t.size, t.lines.length], ['A short history of', 'kicker', 22, 1]);
    a.ok(t.box.w > 300 && t.box.w < 600 && t.box.h > 0 && typeof t.box.x === 'number' && typeof t.box.y === 'number');
    a.equal(st.visibleWords, 21); a.equal(st.dense, true);
    a.equal(ctx.place({ warp: 1 }), 'hyperspace'); a.equal(ctx.place({ speed: 1000 }), 'hyperspace'); a.equal(ctx.place({ galaxy: 0.9, earth: 1 }), 'galaxy');
    a.equal(ctx.place({ earth: 1, earthR: 2600 }), 'horizon'); a.equal(ctx.place({ earth: 1, earthR: 350 }), 'planet');
    a.equal(ctx.place({ stars: 0.12, nebulaAmount: 0 }), 'void'); a.equal(ctx.place({ stars: 1, nebulaAmount: 0.7 }), 'space');
    a.equal(ctx.echo('Making work more human'), true); a.equal(ctx.echo('One Giant Leap'), false);
  });
});

/* ------------------------------------------------------------------ story rules */
wp5Each('lint story rules: each has a positive and a negative fixture', function (a, K) {
  var thanks = function (src) { return wp5Sc(src, 'thanks'); };
  wp5Case(K, a, { id: 'story.idea-missing', sev: 'error', pos: function (src) { src.meta.story.bigIdea = ''; } });
  wp5Case(K, a, { id: 'story.idea-long', sev: 'warn', pos: function (src) { src.meta.story.bigIdea = 'The next leap is augmentation not automation because technology that makes work more human is the one thing we should all build'; },
    check: function (h) { a.equal(h[0].vars.n, 22); a.ok(h[0].msg.indexOf('22 words') > 0); } });
  wp5Case(K, a, { id: 'story.beats-missing', sev: 'error', pos: function (src) { src.scenes.shift(); },
    check: function (h) { a.equal(h.length, 1); a.equal(h[0].vars.beat, 'spark'); a.equal(h[0].msg, 'The spark beat is empty, so the story skips a step.'); a.equal(h[0].fix, 'Add a cold-open: What tiny beginning does your story grow from?'); } });
  wp5Case(K, a, { id: 'story.unassigned', sev: 'warn', scene: 10, pos: function (src) { src.scenes.push({ id: 'extra', template: 'statement', props: { line: 'Hello there' }, point: 'x' }); },
    neg: function (src) { src.scenes.push({ id: 'extra', template: 'statement', props: { line: 'Hello there' }, beat: 'pattern', point: 'x' }); } });
  wp5Case(K, a, { id: 'story.beat-order', sev: 'warn', scene: 7, pos: function (src) { var b = src.scenes[6]; src.scenes[6] = src.scenes[7]; src.scenes[7] = b; },
    neg: function (src) { var b = src.scenes[6]; src.scenes[6] = src.scenes[7]; src.scenes[7] = b; src.scenes[7].flashback = true; },
    check: function (h) { a.equal(h[0].msg, 'Pattern comes after the box, so the arc runs backwards here.'); } });
  wp5Case(K, a, { id: 'story.hook', sev: 'warn', scene: 0, pos: function (src) { src.scenes.unshift(src.scenes.splice(1, 1)[0]); },
    check: function (h) { a.equal(h[0].msg, 'You open on Brand reveal. People decide in the first 30 seconds whether to lean in.'); } });
  wp5Case(K, a, { id: 'story.idea-early', sev: 'warn', pos: function (src) { wp5Sc(src, 'title').text.pop(); } });
  wp5Case(K, a, { id: 'story.idea-echo', sev: 'warn', pos: function (src) {
    var scrub = function (t) { t.str = 'Hello friend'; };
    ['box', 'next', 'thanks'].forEach(function (id) { var s = wp5Sc(src, id); s.text.forEach(scrub); (s.steps || []).forEach(function (st) { (st.text || []).forEach(scrub); }); }); },
    check: function (h) { a.ok(h[0].fix.indexOf('Augmentation, not automation') > 0, 'fix names the short idea: ' + h[0].fix); } });
  // §6.7 reads "on-screen text with pos >= .75": a final scene so long that its own midpoint falls before that leaves no scene in the
  // window, and an echo in it does not count (OGL's finale says "Making work more human", an echo, at pos .65 here)
  wp5Case(K, a, { id: 'story.idea-echo', sev: 'warn', pos: function (src) { thanks(src).dwell = 400; },
    check: function (h) { a.ok(h[0].fix.indexOf('Augmentation, not automation') > 0); } });
  wp5Case(K, a, { id: 'story.turns', sev: 'error', pos: function (src) { src.scenes.splice(8, 1); }, check: function (h) { a.equal(h[0].vars.n, 0); } });
  var two = wp5Case(K, a, { id: 'story.turns', sev: 'warn', pos: function (src) { var n = wp5Clone(wp5Sc(src, 'next')); n.id = 'next-2'; n.energy = 4; src.scenes.splice(9, 0, n); } });
  a.equal(wp5Find(two, 'story.turns')[0].msg, 'Your story has 2 turning points. This arc wants 1.');
  wp5Case(K, a, { id: 'story.turn-position', sev: 'warn', pos: function (src) { src.scenes.splice(1, 0, src.scenes.splice(8, 1)[0]); } });
  wp5Case(K, a, { id: 'story.turn-position', sev: 'warn', pos: function (src) { src.scenes.push(src.scenes.splice(8, 1)[0]); }, scene: 9 });
  var cta = wp5Case(K, a, { id: 'story.cta', sev: 'warn', pos: function () { },
    neg: function (src) { src.meta.story.ask = 'Book a pilot'; thanks(src).text[1].str = 'Book a pilot'; } });
  a.equal(cta.ready, true, 'a warning never blocks');
  a.equal(wp5Find(cta, 'story.cta')[0].fix, 'Put your ask on screen in the final beat. Start with a verb: Book, Try, Pick.', 'no ask given: no invented example');
  a.equal(wp5Find(wp5Lint(K, a, function (src) { src.meta.story.ask = 'Book a pilot'; }), 'story.cta')[0].fix, "Put 'Book a pilot' on screen in the final beat, or at least in its notes.");
  wp5Case(K, a, { id: 'story.cta', pos: function () { }, neg: function (src) { thanks(src).notes = 'Book a pilot with me after the talk.'; } });
  wp5Case(K, a, { id: 'story.cta', pos: function (src) { src.meta.story.ask = 'Book a pilot'; }, neg: function (src) { src.meta.story.ask = 'Book a pilot'; thanks(src).notes = 'Please book a pilot with me.'; } });
  wp5Case(K, a, { id: 'story.thanks-ending', sev: 'info', scene: 9, pos: function (src) { thanks(src).text[0].str = 'Thank you'; } });
  wp5Case(K, a, { id: 'story.bookend', sev: 'info', scene: 9, pos: function (src) { thanks(src).text[0].str = 'Goodbye'; } });
  // the opening is the first half: "Outside" is the hero of the box scene (scene 8 of 10), so repeating it is not a call back to the opening
  wp5Case(K, a, { id: 'story.bookend', sev: 'info', scene: 9, pos: function (src) { thanks(src).text[0].str = 'Outside'; } });
  wp5None(K, a, 'story.bookend', function (src) { thanks(src).text[0].str = 'Not automation.'; wp5Sc(src, 'title').text[0].str = 'Not automation.'; }, 'a hero of the opening comes back');
  // §6.7 as written: only the text styles hero and title are headlines. A mega numeral that comes back is not a headline callback
  // (OGL's finale says "One Giant Leap" in the style of the opening's title; as a mega numeral it repeats nothing)
  wp5Case(K, a, { id: 'story.bookend', sev: 'info', scene: 9, pos: function (src) { thanks(src).text[0].style = 'mega'; } });
  // and every place() value counts as a place, 'flat' included: on a look without the cosmos world (one place, 'flat') the ending
  // is always in a place of the first half, so the rule cannot fire there (an open point for the lead: see the report)
  var flatStory = wp5Story({ framework: 'sparkline', targetMin: 10 });
  var flat = K.story.lint(wp5BoardDeck(K, K.story.board(flatStory, { theme: 'slate' }), 'slate', flatStory));
  a.equal(wp5Find(flat, 'story.bookend').length, 0, 'story.bookend: an all-flat deck always shares its place with the opening');
  wp5Case(K, a, { id: 'story.beat-share', sev: 'info', scene: 0, pos: function (src) { src.scenes[0].dwell = 150; },
    check: function (h) { a.equal(h[0].vars.beat, 'Spark'); a.ok(h[0].vars.p > 40 && h[0].vars.s === 5, JSON.stringify(h[0].vars)); } });
  wp5Case(K, a, { id: 'story.point', sev: 'info', scene: 10, pos: function (src) { src.scenes.push({ id: 'extra', template: 'statement', props: { line: 'Hello' }, beat: 'pattern' }); },
    neg: function (src) { src.scenes.push({ id: 'extra', template: 'statement', props: { line: 'Hello' }, beat: 'pattern', point: 'One thing.' }); } });
}, { timeout: 60000 });

/* ------------------------------------------------------------------ pace rules */
wp5Each('lint pace rules: each has a positive and a negative fixture', function (a, K) {
  var low = function (src) { src.meta.story.targetMin = 3; };
  var run = wp5Case(K, a, { id: 'pace.runtime', sev: 'error', pos: function (src) { src.meta.story.targetMin = 10; }, neg: low,
    check: function (h) { a.equal(h[0].msg, 'This runs about 2.9 min in a 10-min slot.'); a.equal(h[0].fix, 'Add a story, not more text.'); } });
  var warn = wp5Lint(K, a, function (src) { src.meta.story.targetMin = 3.5; });
  a.equal(wp5Find(warn, 'pace.runtime')[0].sev, 'warn', '17% off is a warning'); a.ok(warn.counts.warn === 2);
  var over = wp5Lint(K, a, function (src) { src.meta.story.targetMin = 1; });
  a.equal(wp5Find(over, 'pace.runtime')[0].sev, 'error'); a.equal(wp5Find(over, 'pace.runtime')[0].fix, 'Cut a proof scene first.');
  var unknown = wp5Lint(K, a, function (src) { src.meta.story.targetMin = null; });
  a.equal(wp5Find(unknown, 'pace.runtime')[0].sev, 'info'); a.ok(/slot length/.test(wp5Find(unknown, 'pace.runtime')[0].msg));
  wp5Case(K, a, { id: 'pace.flatline', sev: 'warn', scene: 4, pos: function (src) { [2, 4, 5, 4, 3, 3, 3, 3, 5, 4].forEach(function (e, i) { src.scenes[i].energy = e; }); },
    check: function (h) { a.equal(h[0].msg, 'Scenes 5\u20138 all sit at the same energy. Flat is forgettable.'); } });
  wp5None(K, a, 'pace.flatline', function (src) { [2, 4, 5, 3, 3, 3, 4, 3, 5, 4].forEach(function (e, i) { src.scenes[i].energy = e; }); }, 'three in a row is fine');
  wp5Case(K, a, { id: 'pace.no-peak', sev: 'warn', pos: function (src) { src.scenes.forEach(function (s) { s.energy = Math.min(s.energy, 3); }); },
    check: function (h) { a.equal(h[0].msg, 'Nothing rises above 3/5, so there\'s no peak.'); } });
  wp5Case(K, a, { id: 'pace.peak-early', sev: 'info', scene: 2, pos: function (src) { wp5Sc(src, 'next').energy = 4; } });
  wp5Case(K, a, { id: 'pace.arc-drift', sev: 'info', pos: function (src) { [5, 1, 1, 5, 5, 1, 5, 1, 1, 5].forEach(function (e, i) { src.scenes[i].energy = e; }); } });
  var dense = wp5Case(K, a, { id: 'pace.dense-run', sev: 'warn', scene: 3, pos: function (src) {
    ['galaxy', 'home', 'sunrise'].forEach(function (id) { var t = wp5Sc(src, id).text; t[t.length - 1].str += ' ' + wp5Words2(7); }); },
    check: function (h) { a.equal(h.length, 1, 'one finding per run'); a.equal(h[0].vars.a, 4); a.equal(h[0].vars.b, 7); } });
  wp5Case(K, a, { id: 'pace.wall', sev: 'error', scene: 0, pos: function (src) { src.scenes[0].text.push({ str: wp5Words2(31), style: 'body', y: 300 }); },
    check: function (h) { a.equal(h[0].vars.n, 39); a.equal(h[0].step, 0); } });
  wp5Case(K, a, { id: 'pace.long-hold', sev: 'warn', scene: 0, pos: function (src) { src.scenes[0].dwell = 400; }, check: function (h) { a.ok(h[0].vars.s > 400); } });
  wp5Case(K, a, { id: 'pace.steps', sev: 'warn', scene: 0, pos: function (src) { src.scenes[0].steps = []; for (var i = 0; i < 9; i++) src.scenes[0].steps.push({ notes: 'click' }); },
    check: function (h) { a.equal(h[0].msg, '9 clicks in one scene.'); } });
  wp5None(K, a, 'pace.steps', function (src) { src.scenes[0].steps = []; for (var i = 0; i < 8; i++) src.scenes[0].steps.push({ notes: 'click' }); }, 'eight clicks is the limit');
  wp5Case(K, a, { id: 'pace.reveal-wait', sev: 'warn', scene: 0, pos: function (src) { src.scenes[0].text[0].at = 9; }, check: function (h) { a.ok(h[0].vars.s >= 12); } });
  wp5None(K, a, 'pace.reveal-wait', function (src) { var t = wp5Sc(src, 'thanks'); t.prelude = 'explode'; t.preludeTime = 9; }, 'a prelude is not part of §6.7\'s formula: textDelay + at + inDur · (letters ? 1.6 : 1)');
  wp5Case(K, a, { id: 'pace.reveal-wait', sev: 'warn', scene: 9, pos: function (src) { wp5Sc(src, 'thanks').textDelay = 8; }, check: function (h) { a.ok(h[0].vars.s >= 9); } });
}, { timeout: 60000 });

/* ------------------------------------------------------------------ copy rules */
wp5Each('lint copy rules: each has a positive and a negative fixture', function (a, K) {
  wp5Case(K, a, { id: 'copy.style-words', sev: 'warn', scene: 1, pos: function (src) { wp5Sc(src, 'title').text[0].str = 'One Giant Leap Today'; },
    check: function (h) { a.equal(h[0].msg, 'This hero line has 4 words (max 3).'); } });
  wp5Case(K, a, { id: 'copy.lines', sev: 'warn', scene: 7, pos: function (src) { wp5Sc(src, 'box').text[0].str = 'Every breakthrough began as an idea that did not fit the old shape of the work that we all do every single day of the week'; },
    check: function (h) { a.ok(h[0].vars.n >= 4); a.ok(h[0].msg.indexOf('wraps onto') > 0); } });
  wp5Case(K, a, { id: 'copy.lines', sev: 'warn', pos: function (src) { wp5Sc(src, 'title').text[0].str = 'Supercalifragilisticexpialidocious Antidisestablishmentarianism'; } });
  wp5Case(K, a, { id: 'copy.small', sev: 'warn', scene: 0, pos: function (src) { src.scenes[0].text.push({ str: 'tiny', style: 'caption', size: 16, y: 900 }); } });
  wp5Case(K, a, { id: 'copy.small', pos: function (src) { src.scenes[0].text.push({ str: 'one two three four five six', style: 'caption', y: 900 }); }, neg: function (src) { src.scenes[0].text.push({ str: 'one two three four five', style: 'caption', y: 900 }); } });
  wp5Case(K, a, { id: 'copy.one-hero', sev: 'warn', scene: 1, pos: function (src) { wp5Sc(src, 'title').text.push({ str: 'And more', style: 'hero', y: 800 }); } });
  wp5Case(K, a, { id: 'copy.placeholder', sev: 'error', scene: 0, pos: function (src) { src.scenes[0].text[0].str = '{opening line}'; },
    check: function (h) { a.equal(h[0].vars.token, '{opening line}'); a.equal(h[0].fix, 'Answer {opening line} in the interview, or delete the line.'); } });
  wp5Case(K, a, { id: 'copy.placeholder', sev: 'error', pos: function (src) { src.scenes[1].text[1].str = 'Lorem ipsum dolor'; } });
  wp5Case(K, a, { id: 'copy.placeholder', sev: 'error', pos: function (src) { src.scenes[1].text[1].str = 'TODO tagline'; } });
  wp5Case(K, a, { id: 'copy.jargon', sev: 'info', scene: 0, pos: function (src) { src.scenes[0].text.push({ str: 'We leverage a seamless approach', style: 'subtitle', y: 900 }); },
    check: function (h) { a.deepEqual(h.map(function (f) { return f.vars.word; }), ['leverage', 'seamless']); } });
  wp5Case(K, a, { id: 'copy.over-sun', sev: 'warn', scene: 5, pos: function (src) { wp5Sc(src, 'sunrise').text.push({ str: 'In the glare', style: 'subtitle', x: 1330, y: 700 }); },
    check: function (h) { a.equal(h[0].msg, '"In the glare" sits in the sun\'s glare.'); } });
  wp5None(K, a, 'copy.over-sun', function (src) { wp5Sc(src, 'spark').text.push({ str: 'No sun here', style: 'subtitle', x: 1330, y: 700 }); }, 'the spark scene has no sun');
  wp5None(K, a, 'copy.over-sun', function (src) { wp5Sc(src, 'sunrise').text.push({ str: 'Far from the sun', style: 'subtitle', x: 600, y: 600 }); }, 'more than 200 px from the sun');
  wp5Case(K, a, { id: 'copy.notes', sev: 'warn', scene: 0, pos: function (src) { delete src.scenes[0].notes; } });
  wp5Case(K, a, { id: 'copy.notes', pos: function (src) { src.scenes[0].notes = 'two words'; }, neg: function (src) { src.scenes[0].notes = 'now three words'; } });
  wp5Case(K, a, { id: 'copy.notes', pos: function (src) { src.scenes[0].notes = '▸ What is the spark?'; } });   // a prompt is not a note
  wp5None(K, a, 'copy.notes', function (src) { src.scenes[0].notes = ''; src.scenes[0].steps = [{ notes: 'a note on a step' }]; }, 'three words anywhere in the scene count');
}, { timeout: 60000 });

/* ------------------------------------------------------------------ visual rules */
wp5Each('lint visual rules: each has a positive and a negative fixture', function (a, K) {
  wp5Case(K, a, { id: 'vis.teleport', sev: 'warn', scene: 4, pos: function (src) { src.scenes.splice(4, 1); },
    check: function (h) { a.equal(h[0].msg, 'Scene 5 jumps from galaxy to horizon with no transition.'); } });
  wp5Case(K, a, { id: 'vis.teleport', sev: 'warn', scene: 4, pos: function (src) { wp5Sc(src, 'home').timing.earthR = [1, 'inOutCubic']; } });
  wp5None(K, a, 'vis.teleport', function (src) { src.scenes.splice(4, 1); wp5Sc(src, 'sunrise').cues = [{ at: 0, flash: 0.3 }]; }, 'a flash of 0.3 is a transition');
  wp5None(K, a, 'vis.teleport', function (src) { src.scenes.splice(4, 1); wp5Sc(src, 'sunrise').prelude = 'explode'; }, 'a prelude is a transition');
  wp5Case(K, a, { id: 'vis.teleport', pos: function (src) { src.scenes.splice(4, 1); wp5Sc(src, 'sunrise').cues = [{ at: 0, flash: 0.29 }]; } });   // 0.29 is under the 0.3 bar
  wp5None(K, a, 'vis.teleport', function (src) { wp5Sc(src, 'home').timing.earthR = [3, 'inOutCubic']; }, 'a glide of 3 s is long enough');
  wp5Case(K, a, { id: 'vis.warp', sev: 'warn', pos: function (src) { [1, 2].forEach(function (n) { var w = wp5Clone(wp5Sc(src, 'warp')); w.id = 'warp-' + n; src.scenes.splice(3, 0, w); }); },
    check: function (h) { a.equal(h[0].msg, 'Hyperspace 3 times. It stops being magic.'); } });
  wp5Case(K, a, { id: 'vis.particle-type', sev: 'info', pos: function (src) { ['spark', 'home', 'sunrise'].forEach(function (id) { var t = wp5Sc(src, id).text; t[t.length - 1].reveal = 'particles'; }); } });
  wp5Case(K, a, { id: 'vis.particle-type', pos: function (src) { var t = wp5Sc(src, 'title').text; t[1].reveal = 'particles'; }, neg: function () { } }).findings;   // two in one state
  wp5Case(K, a, { id: 'vis.palette', sev: 'warn', pos: function (src) { src.scenes[0].text.push({ str: 'a', style: 'subtitle', y: 900, color: '#ff0000' }, { str: 'b', style: 'subtitle', y: 950, color: ['#00ff00', '#0000ff'] }); },
    check: function (h) { a.equal(h[0].msg, '5 accent colors. The deck stops reading as one film.'); } });
  wp5Case(K, a, { id: 'vis.palette', sev: 'warn', pos: function (src) { wp5Sc(src, 'leaps').world.nebula = 'ember'; }, check: function (h) { a.equal(h[0].msg, '6 nebula looks. The deck stops reading as one film.'); } });
  wp5Case(K, a, { id: 'vis.palette', sev: 'warn', pos: function (src) { src.meta.themePatch = { fontFaces: [{ family: 'Brand A', asset: 'x' }, { family: 'Brand B', asset: 'y' }] }; },
    check: function (h) { a.equal(h[0].msg, '3 fonts. The deck stops reading as one film.'); } });
  var K2 = K;
  K2.assets('wp5-assets', { bad: { type: 'image', src: 'file:///tmp/x.png', w: 2, h: 2, name: 'x', bytes: 1 }, good: { type: 'image', src: 'data:image/png;base64,iVBORw0KGgo=', w: 2, h: 2, name: 'y', bytes: 1 } });
  function assetLint(id) {
    var src = wp5Clone(K.compile('one-giant-leap').source); src.id = 'wp5-assets';
    src.scenes[0].elements = [{ kind: 'image', asset: id, x: 960, y: 500 }];
    return K.story.lint(K.compile(src, { assetsDeckId: 'wp5-assets' }));
  }
  var bad = wp5Find(assetLint('bad'), 'vis.asset-source'), good = wp5Find(assetLint('good'), 'vis.asset-source');
  a.equal(bad.length, 1); a.equal(bad[0].sev, 'error'); a.equal(bad[0].scene, 0); a.equal(bad[0].msg, '"bad" can\'t be shown from a file link.'); a.equal(good.length, 0);
  a.equal(wp5Find(assetLint('missing'), 'vis.asset-source').length, 0, 'a missing asset is the validator\'s finding, not this rule\'s');
  K.assets('wp5-assets', { badfont: { type: 'font', src: 'file:///tmp/f.woff2', family: 'F', name: 'f', bytes: 1 } });
  var fsrc = wp5Clone(K.compile('one-giant-leap').source); fsrc.id = 'wp5-assets'; fsrc.meta.themePatch = { fontFaces: [{ family: 'Brand', asset: 'badfont' }] };
  var fontHit = wp5Find(K.story.lint(K.compile(fsrc, { assetsDeckId: 'wp5-assets' })), 'vis.asset-source');
  a.equal(fontHit.length, 1, 'a brand font from a file link'); a.equal(fontHit[0].scene, undefined); a.equal(fontHit[0].sev, 'error');
  var pts = function (n) { return function (src) { var p = []; for (var i = 0; i < n; i++) p.push({ x: 100 + i % 1700, y: 100 + (i * 7) % 800, s: 4 }); src.scenes[0].particles.push({ shape: 'points', points: p }); }; };
  wp5Case(K, a, { id: 'vis.particle-budget', sev: 'error', scene: 0, pos: pts(9500), neg: pts(500), check: function (h) { a.ok(h[0].vars.n >= 9500); } });
  wp5Case(K, a, { id: 'vis.particle-budget', sev: 'warn', scene: 0, pos: pts(7500), neg: pts(6000), check: function (h) { a.equal(h[0].vars.n, 8200, 'the 700 spark particles count too'); } });
}, { timeout: 60000 });

/* ------------------------------------------------------------------ behaviour of the checker itself */
T.test('lint: every rule of the spec is registered once, with the severity and area of its table', function (a) {
  var want = {
    'story.idea-missing': ['error', 'story'], 'story.idea-long': ['warn', 'story'], 'story.beats-missing': ['error', 'story'], 'story.unassigned': ['warn', 'story'],
    'story.beat-order': ['warn', 'story'], 'story.hook': ['warn', 'story'], 'story.idea-early': ['warn', 'story'], 'story.idea-echo': ['warn', 'story'],
    'story.turns': ['warn', 'story'], 'story.turn-position': ['warn', 'story'], 'story.cta': ['warn', 'story'], 'story.thanks-ending': ['info', 'story'],
    'story.bookend': ['info', 'story'], 'story.beat-share': ['info', 'story'], 'story.point': ['info', 'story'],
    'pace.runtime': ['warn', 'pace'], 'pace.flatline': ['warn', 'pace'], 'pace.no-peak': ['warn', 'pace'], 'pace.peak-early': ['info', 'pace'],
    'pace.arc-drift': ['info', 'pace'], 'pace.dense-run': ['warn', 'pace'], 'pace.wall': ['error', 'pace'], 'pace.long-hold': ['warn', 'pace'],
    'pace.steps': ['warn', 'pace'], 'pace.reveal-wait': ['warn', 'pace'],
    'copy.style-words': ['warn', 'copy'], 'copy.lines': ['warn', 'copy'], 'copy.small': ['warn', 'copy'], 'copy.one-hero': ['warn', 'copy'],
    'copy.placeholder': ['error', 'copy'], 'copy.jargon': ['info', 'copy'], 'copy.over-sun': ['warn', 'copy'], 'copy.notes': ['warn', 'copy'],
    'vis.teleport': ['warn', 'visual'], 'vis.warp': ['warn', 'visual'], 'vis.particle-type': ['info', 'visual'], 'vis.palette': ['warn', 'visual'],
    'vis.asset-source': ['error', 'visual'], 'vis.particle-budget': ['warn', 'visual']
  };
  var rules = PD.story.rules();
  a.deepEqual(rules.map(function (r) { return r.id; }).sort(), Object.keys(want).sort(), '39 rules');
  rules.forEach(function (r) {
    a.deepEqual([r.sev, r.area], want[r.id], r.id);
    a.equal(typeof r.check, 'function'); a.ok(r.msg && typeof r.fix === 'string', r.id + ' has msg and fix');
  });
  a.throws(function () { PD.story.rule({ id: 'story.cta', sev: 'warn', area: 'story', check: function () { return []; }, msg: '', fix: '' }); }, /registered twice/);
  a.throws(function () { PD.story.rule({ id: 'x.y', sev: 'loud', area: 'story', check: function () { return []; }, msg: '', fix: '' }); }, /sev must be/);
  a.throws(function () { PD.story.rule({ id: 'x.z' }); }, /needs/);
});

wp5Each('lint: scene.lint.ignore silences a rule for that scene only (acceptance #6)', function (a, K) {
  var noNotes = function (src) { delete src.scenes[0].notes; delete src.scenes[1].notes; };
  var r = wp5Lint(K, a, noNotes);
  a.deepEqual(wp5Find(r, 'copy.notes').map(function (f) { return f.scene; }), [0, 1]);
  var r2 = wp5Lint(K, a, function (src) { noNotes(src); src.scenes[0].lint = { ignore: ['copy.notes'] }; });
  a.deepEqual(wp5Find(r2, 'copy.notes').map(function (f) { return f.scene; }), [1], 'only scene 0 is silenced');
  a.equal(r2.counts.warn, r.counts.warn - 1); a.equal(r2.score, r.score + 5);
  var r3 = wp5Lint(K, a, function (src) { noNotes(src); src.scenes[0].lint = { ignore: ['copy.small'] }; });
  a.equal(wp5Find(r3, 'copy.notes').length, 2, 'ignoring another rule changes nothing');
  var r4 = wp5Lint(K, a, function (src) { src.meta.story.bigIdea = ''; src.scenes[0].lint = { ignore: ['story.idea-missing'] }; });
  a.equal(wp5Find(r4, 'story.idea-missing').length, 1, 'a deck-level finding belongs to no scene, so no scene can silence it');
  var tpl = wp5Lint(K, a, function (src) { src.scenes.push({ id: 'extra', template: 'statement', props: { line: 'x' }, beat: 'pattern', lint: { ignore: ['story.point'] } }); });
  a.equal(wp5Find(tpl, 'story.point').length, 0);
});

T.test('lint: score = max(0, 100 - 15E - 5W - 1I); ready means no errors; findings are ordered errors, warnings, tips by scene', function (a) {
  return wp5Fresh().then(function (K) {
    var r = wp5Lint(K, a, function (src) { src.meta.story.bigIdea = ''; delete src.scenes[0].notes; src.scenes[0].text[0].str = '{opening line}'; });
    var c = r.counts;
    a.equal(r.score, Math.max(0, 100 - 15 * c.error - 5 * c.warn - c.info));
    a.ok(c.error >= 2 && c.warn >= 2, JSON.stringify(c) + ' ' + r.findings.map(function (f) { return f.id; })); a.equal(r.ready, false);
    var rank = { error: 0, warn: 1, info: 2 }, last = -1;
    r.findings.forEach(function (f) { a.ok(rank[f.sev] >= last, 'sorted by severity'); last = rank[f.sev]; });
    var errs = r.findings.filter(function (f) { return f.sev === 'error'; });
    a.equal(errs[0].scene, undefined, 'deck-level findings first inside a group');
    a.equal(r.summary, c.error + ' to fix, ' + c.warn + ' to consider, ' + c.info + ' tips.');
    // many errors cannot push the score below zero
    var bad = wp5Lint(K, a, function (src) { src.scenes.forEach(function (s) { s.text.push({ str: '{x}', style: 'caption', y: 900 }); }); });
    a.equal(bad.score, 0); a.ok(bad.counts.error >= 10);
    // a clean deck reads "your story holds together"
    var clean = K.story.lint(K.compile({ format: 2, id: 'wp5-empty', meta: { title: 'e', theme: 'cosmos' }, scenes: [] }));
    a.equal(clean.summary, 'Your story holds together. Rehearse it out loud once.'); a.equal(clean.score, 100); a.equal(clean.ready, true);
    a.equal(clean.findings.length, 0, 'an empty story-less deck has nothing to report');
    a.ok(typeof r.ms === 'number');
    a.throws(function () { K.story.lint({}); }, /needs a CompiledDeck/);
  });
});

T.test('lint: a story-less deck skips the story rules; a blank framework skips every rule that needs beats', function (a) {
  return wp5Fresh().then(function (K) {
    var noStory = wp5Lint(K, a, function (src) { delete src.meta.story; });
    a.equal(noStory.findings.filter(function (f) { return f.area === 'story'; }).length, 0, 'no story, no story findings');
    a.equal(wp5Find(noStory, 'pace.runtime').length, 0);
    a.ok(wp5Find(noStory, 'copy.notes').length === 0 && noStory.ruleErrors.length === 0);
    var blank = wp5Lint(K, a, function (src) { src.meta.story.framework = 'blank'; src.scenes.splice(0, 3); });
    var beatRules = ['story.beats-missing', 'story.unassigned', 'story.beat-order', 'story.turns', 'story.turn-position', 'story.cta', 'story.beat-share', 'pace.arc-drift'];
    beatRules.forEach(function (id) { a.equal(wp5Find(blank, id).length, 0, id + ' is skipped for the blank framework'); });
    a.equal(wp5Find(blank, 'story.hook').length, 1, 'rules that do not need beats still run (the deck now opens on a non-hook)');
    var unknownFw = wp5Lint(K, a, function (src) { src.meta.story.framework = 'no-such'; });
    beatRules.forEach(function (id) { a.equal(wp5Find(unknownFw, id).length, 0, id + ' is skipped for an unknown framework'); });
  });
});

T.test('lint: compile errors and PD.validate issues appear as build.<code> findings, without duplicating the checker\'s own', function (a) {
  return wp5Fresh().then(function (K) {
    var bad = wp5Lint(K, a, function (src) { src.scenes.push({ id: 'oops', template: 'no-such-template', props: {}, beat: 'pattern', point: 'x' }); });
    var b = wp5Find(bad, 'build.template.unknown');
    a.equal(b.length, 1); a.equal(b[0].sev, 'error'); a.equal(b[0].area, 'build'); a.equal(b[0].scene, 10); a.equal(b[0].sceneId, 'oops'); a.ok(/unknown template/.test(b[0].msg));
    a.equal(bad.ready, false);
    var seen = [];
    K.validate = function (compiled) {
      seen.push(compiled);
      return [
        { level: 'error', code: 'style.unknown', scene: 0, sceneId: 'spark', path: 'text[0].style', msg: 'Unknown style "x".' },
        { level: 'warn', code: 'world.unknown-param', scene: 1, sceneId: 'title', msg: 'Unknown world parameter.' },
        { level: 'warn', code: 'particles.budget', scene: 0, sceneId: 'spark', msg: 'Too many targets.' },
        { level: 'warn', code: 'particles.budget', scene: 1, sceneId: 'title', msg: 'Too many targets (not repeated by the checker).' },
        { level: 'warn', code: 'text.overflow', scene: 2, sceneId: 'warp', msg: 'Too wide.' }
      ];
    };
    try {
      var pts = function (src) { var p = []; for (var i = 0; i < 9500; i++) p.push({ x: 100 + i % 1700, y: 100 + (i * 7) % 800, s: 4 }); src.scenes[0].particles.push({ shape: 'points', points: p }); };
      var r = wp5Lint(K, a, pts);
      a.equal(seen.length, 1, 'PD.validate is called once per lint, with the compiled deck');
      a.equal(seen[0].scenes.length, 10);
      var build = r.findings.filter(function (f) { return f.area === 'build'; }).map(function (f) { return f.id + '@' + f.scene + ':' + f.sev; }).sort();
      a.deepEqual(build, ['build.particles.budget@1:warn', 'build.style.unknown@0:error', 'build.text.overflow@2:warn', 'build.world.unknown-param@1:warn'],
        'particles.budget on scene 0 is covered by vis.particle-budget and left out');
      a.equal(wp5Find(r, 'vis.particle-budget').length, 1);
      var one = r.findings.filter(function (f) { return f.id === 'build.style.unknown'; })[0];
      a.equal(one.msg, 'Unknown style "x".'); a.equal(one.sceneId, 'spark');
      var ign = wp5Lint(K, a, function (src) { src.scenes[1].lint = { ignore: ['build.world.unknown-param'] }; });
      a.equal(wp5Find(ign, 'build.world.unknown-param').length, 0, 'build findings can be ignored per scene too');
      K.validate = function () { throw new Error('validator broke'); };
      var broke = K.story.lint(wp5Ogl(K));
      a.equal(broke.findings.filter(function (f) { return f.area === 'build'; }).length, 0, 'a throwing validator does not break the checker');
    } finally { delete K.validate; }
  });
});

T.test('lint: a rule that throws is skipped and reported in ruleErrors; a custom rule can be registered', function (a) {
  return wp5Fresh(true).then(function (K) {
    K.story.rule({ id: 'test.boom', sev: 'warn', area: 'copy', msg: 'm', fix: 'f', check: function () { throw new Error('rule bug'); } });
    K.story.rule({ id: 'test.custom', sev: 'info', area: 'copy', msg: 'Scene {i} ({id}) says {word}.', fix: 'Fix {word}.',
      check: function (ctx) { return [{ scene: 3, vars: { word: 'hi' } }, { vars: { word: 'deck' }, msg: 'Deck says {word}.' }]; } });
    var r = K.story.lint(wp5Ogl(K));
    a.deepEqual(r.ruleErrors, [{ id: 'test.boom', msg: 'rule bug' }]);
    var f = wp5Find(r, 'test.custom');
    a.deepEqual(f.map(function (x) { return x.msg; }).sort(), ['Deck says deck.', 'Scene 4 (galaxy) says hi.'].sort());
    a.equal(f.filter(function (x) { return x.scene === 3; })[0].fix, 'Fix hi.');
    a.equal(r.ready, true, 'the OGL result is otherwise unchanged'); a.equal(r.counts.error, 0);
    a.equal(K.story.rules().length, 41);
  });
});

T.test('lint: a stale or foreign timing is safe (notes and dwell are read from the deck; unknown scenes are estimated)', function (a) {
  return wp5Fresh().then(function (K) {
    var c = wp5Ogl(K);
    return K.story.timing(c, { sliceMs: 40, cache: false }).then(function (t) {
      var r0 = K.story.lint(c, t);
      a.equal(r0.estimated, false);
      var edited = wp5Ogl(K, function (src) { src.scenes[0].dwell = 60; src.scenes.push({ id: 'new', text: [{ str: 'hello', style: 'kicker', y: 300 }], notes: 'now three words', dwell: 2 }); });
      var r1 = K.story.lint(edited, t);
      a.equal(r1.estimated, true, 'one scene was estimated');
      a.ok(r1.total > r0.total + 50, 'the longer hold is counted');
      var r2 = K.story.lint(c, { v: 1, scenes: [] });
      a.equal(r2.estimated, true); a.deepEqual(r2.ruleErrors, [], JSON.stringify(r2.ruleErrors));
      var r3 = K.story.lint(c, null);
      a.equal(r3.estimated, true);
    });
  });
}, { timeout: 60000 });

wp5Each('lint: runs in under 150 ms for a 24-scene deck, excluding timing (acceptance #7)', function (a, K) {
  var scenes = [];
  for (var i = 0; i < 24; i++) {
    scenes.push({ id: 'perf-' + i, energy: 1 + (i * 7) % 5, world: { stars: 0.5 + (i % 3) * 0.1 }, notes: 'Say something worth hearing in scene number ' + i,
      text: [{ str: 'Scene ' + i + ' kicker line', style: 'kicker', y: 400 }, { str: 'A statement for scene ' + i + ' that is long enough to wrap, maybe, onto a second line', style: 'statement', y: 500 },
             i % 4 === 0 ? { str: 'Hero ' + i, style: 'hero', y: 300, reveal: 'particles' } : { str: 'sub ' + i, style: 'subtitle', y: 700 }],
      steps: i % 3 === 0 ? [{ text: [{ str: 'step line ' + i, style: 'label', y: 800 }], notes: 'click and say more words' }] : [] });
  }
  var deck = { format: 2, id: 'wp5-perf', meta: { title: 'p', theme: 'cosmos', story: { framework: 'giant-leap', goal: 'inspire', tone: 'cinematic', bigIdea: 'A big idea about leaps', targetMin: 20,
    ask: '', proof: [], audience: '', shortIdea: '', oldWay: '', newWay: '', brand: '', tagline: '' } }, scenes: scenes };
  var c = K.compile(deck);
  var t0 = performance.now(), r = K.story.lint(c), cold = performance.now() - t0;
  t0 = performance.now(); K.story.lint(c); var warm = performance.now() - t0;
  a.ok(cold < 150, 'cold (every text measured, every particle line counted): ' + cold.toFixed(1) + ' ms');
  a.ok(warm < 50, 'warm: ' + warm.toFixed(1) + ' ms');
  a.deepEqual(r.ruleErrors, [], JSON.stringify(r.ruleErrors));
  a.ok(r.findings.length > 5, 'and it found things: ' + r.findings.length);
});

/* ------------------------------------------------------------------ integration (WP3 elements x WP5 lint) */
T.test('lint (integration): a decoded picture with a particles reveal counts its real particles (env.assets reads the deck\'s runtime assets, spec §4.6), so vis.particle-budget sees it and nothing says the asset is missing', function (a) {
  if (!PD.deck.has('gallery') || !PD.element.has('image') || typeof PD.asset !== 'function') { a.ok(true, 'the gallery deck / image element (WP3) is not loaded'); return; }
  return PD.assets.ready('gallery').then(function () {
    var c = PD.compile('gallery'), ra = PD.asset('gallery', 'logo');
    a.ok(ra && ra.ok, 'the gallery logo decoded');
    var E = PD.element.get('image'), env = { theme: c.theme, col: null, stage: null, assets: function (id) { return PD.asset('gallery', id); } };
    var warns = [], cw = console.warn, hits = 0, r;
    console.warn = function (m) { warns.push(String(m)); return cw.apply(console, arguments); };
    try {
      var ctx = PD.get('story/lint').buildCtx(c, null);
      ctx.scenes.forEach(function (s) {
        s.states.forEach(function (st) {
          var pics = st.items.filter(function (it) { return it.kind === 'image' && it.spec.reveal === 'particles'; });
          if (!pics.length) return;
          hits++;
          var want = 0;
          pics.forEach(function (it) { want += E.particleCount(it.spec, env); });
          a.ok(want > 1000, 'the logo samples into ' + want + ' points');
          a.ok(ctx.particles(st) >= want, 'scene ' + s.id + '.' + st.k + ': lint counts ' + ctx.particles(st) + ' >= the picture\'s ' + want);
        });
      });
      // the budget rule: the logo (~3300) plus a 5000-point shape is over 8000 only if the logo is counted
      var logo = c.source.scenes.filter(function (s) { return s.id === 'logo'; })[0];
      var pts = []; for (var i = 0; i < 5000; i++) pts.push({ x: 100 + (i % 100) * 17, y: 100 + Math.floor(i / 100) * 17 });
      var deck = { format: 2, id: 'gallery', meta: JSON.parse(JSON.stringify(c.meta)),
        scenes: [{ id: 'logo-plus', elements: JSON.parse(JSON.stringify(logo.elements)), particles: [{ shape: 'points', points: pts }], notes: 'a logo and a big shape at once' }] };
      r = PD.story.lint(PD.compile(deck));
    } finally { console.warn = cw; }
    a.ok(hits >= 1, 'the gallery has a particles picture');
    a.deepEqual(r.ruleErrors, [], JSON.stringify(r.ruleErrors));
    var pb = r.findings.filter(function (f) { return f.id === 'vis.particle-budget'; });
    a.equal(pb.length, 1, 'vis.particle-budget fires for logo + 5000 points (' + r.findings.map(function (f) { return f.id; }).join(', ') + ')');
    a.deepEqual(warns.filter(function (w) { return /cannot be shown as particles/.test(w); }), [], 'no "cannot be shown as particles" warning for a decoded asset');
  });
}, { timeout: 30000 });
