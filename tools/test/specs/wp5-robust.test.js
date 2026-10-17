/* tools/test/specs/wp5-robust.test.js — the story code never throws on malformed data (the Studio feeds it whatever a user
 * or a hand-written deck contains): lint, estimate, timing, board and interview all take odd input and carry on. */

var WP5_ODD_SCENES = [
  [{ id: 'a' }], [{ id: 'a', text: 'not an array' }], [{ id: 'a', text: [{}] }], [{ id: 'a', text: [{ str: null }] }], [{ id: 'a', text: [{ str: 12 }] }],
  [{ id: 'a', text: [{ str: 'x', style: 'nonexistent' }] }], [{ id: 'a', text: [{ str: 'x', size: 'big' }] }],
  [{ id: 'a', steps: [null, undefined, {}, 5] }], [{ id: 'a', steps: 'nope' }], [{ id: 'a', notes: 42 }], [{ id: 'a', notes: { x: 1 } }],
  [{ id: 'a', dwell: 'abc' }], [{ id: 'a', dwell: -5 }], [{ id: 'a', energy: 'high' }], [{ id: 'a', energy: 99 }],
  [{ id: 'a', world: null }], [{ id: 'a', world: { nebula: 7, earth: 'x', sun: null } }],
  [{ id: 'a', particles: [{ shape: 'points', points: 5 }] }], [{ id: 'a', particles: [{ shape: 'mystery' }] }], [{ id: 'a', particles: [{}] }],
  [{ id: 'a', elements: [{ kind: 'image' }] }], [{ id: 'a', elements: [{ kind: 'nope', asset: 'x' }] }],
  [{ id: 'a', cues: 'flash' }], [{ id: 'a', cues: [null, { at: 'x' }] }], [{ id: 'a', motion: { dur: 'fast', spread: null } }],
  [{ id: 'a', timing: { speed: 'slow', warp: [] } }], [{ id: 'a', lint: 'ignore everything' }], [{ id: 'a', lint: { ignore: 'copy.notes' } }],
  [{ id: 'a', beat: 7, like: {}, point: 5 }], [{ id: 'a', like: 'cold-open' }, { id: 'b', like: 'no-such' }],
  [null], [5], ['text'], [[]],
  [{ id: 'a', text: [{ str: 'x' }], steps: [{ remove: 'x', text: 'y' }] }], [{ id: 'a', text: [{ str: 'x', color: 5 }, { str: 'y', color: [1, 2] }] }],
  [{ id: 'dup' }, { id: 'dup' }]
];
function wp5OddDeck(scenes, story) {
  return { format: 2, id: 'wp5-odd', meta: { title: 't', theme: 'cosmos', story: story === undefined ? { framework: 'giant-leap', bigIdea: 'x y z', targetMin: 5 } : story }, scenes: scenes };
}

wp5Each('robust: lint and estimate take malformed scenes without throwing, and no rule throws', function (a, K) {
  WP5_ODD_SCENES.forEach(function (sc, i) {
    var label = 'odd #' + i + ' ' + JSON.stringify(sc).slice(0, 70);
    var r, t;
    try { r = K.story.lint(K.compile(wp5OddDeck(sc))); } catch (e) { a.fail(label + ': lint threw ' + e.message); }
    try { t = K.story.estimate(K.compile(wp5OddDeck(sc))); } catch (e) { a.fail(label + ': estimate threw ' + e.message); }
    a.deepEqual(r.ruleErrors, [], label + ': ' + JSON.stringify(r.ruleErrors));
    a.ok(isFinite(t.total) && t.total >= 0, label + ': a finite total');
    a.ok(r.score >= 0 && r.score <= 100);
  });
});

wp5Each('robust: lint takes odd story objects (missing, wrong types, unknown framework)', function (a, K) {
  [null, undefined, 5, 'str', [], {}, { framework: 'nope' }, { framework: 'giant-leap', bigIdea: 5, targetMin: 'x', ask: [], proof: 'x' }].forEach(function (st, i) {
    var r = K.story.lint(K.compile(wp5OddDeck([{ id: 'a', text: [{ str: 'x' }] }], st)));
    a.deepEqual(r.ruleErrors, [], 'story #' + i + ': ' + JSON.stringify(r.ruleErrors));
  });
});

wp5Each('robust: the simulation never rejects on malformed scenes; a state that cannot be played makes the result inexact', function (a, K) {
  var cases = [
    [{ id: 'a', text: 'not an array' }, { id: 'b' }], [{ id: 'a', text: [{}] }, { id: 'b', text: [{ str: null }] }],
    [{ id: 'a', steps: 'nope' }, { id: 'b', steps: [null, 5, {}] }], [{ id: 'a', particles: [{ shape: 'mystery' }, { shape: 'points', points: 5 }] }],
    [{ id: 'a', elements: [{ kind: 'nope' }, { kind: 'image' }] }, { id: 'b', cues: [null] }], [{ id: 'a', world: { nebula: 7 } }, { id: 'b', world: { nebula: 'dawn' } }]
  ];
  var chain = Promise.resolve();
  cases.forEach(function (sc, i) {
    chain = chain.then(function () {
      return K.story.timing(K.compile(wp5OddDeck(sc)), { sliceMs: 40, cache: false }).then(function (t) {
        a.ok(t && isFinite(t.total), 'case ' + i + ' resolves with a Timing');
        a.equal(t.scenes.length, sc.length);
      });
    });
  });
  return chain;
}, { timeout: 60000 });

wp5Each('robust: board and interview take odd input', function (a, K) {
  var stories = [undefined, null, {}, { framework: 5 }, { framework: 'giant-leap', targetMin: 'abc' }, { framework: 'giant-leap', targetMin: -3 }, { framework: 'giant-leap', targetMin: 1e9 },
    { framework: 'psf', proof: 'nope' }, { framework: 'psf', proof: [null, 5, { kind: 'number' }, { kind: 'quote', text: 5 }, { text: 'x' }] },
    { framework: 'psf', brand: 5, tagline: [], oldWay: {} }, { framework: 'scqa', proof: [{ kind: 'number', text: 't', value: 'NaN' }] }];
  stories.forEach(function (st, i) {
    ['cosmos', 'slate', undefined].forEach(function (th) {
      var out = K.story.board(st, { theme: th, assets: i % 2 ? { logo: 5, photos: 'x' } : [1, 2] });
      a.ok(Array.isArray(out), 'story #' + i + ' / ' + th);
      out.forEach(function (s) { a.ok(s.id && s.template && s.props && typeof s.notes === 'string'); });
    });
  });
  a.ok(Array.isArray(K.story.board({ framework: 'giant-leap' }, { theme: 'cosmos', assets: 'string' })));
  a.ok(Array.isArray(K.story.board({ framework: 'giant-leap' })), 'no options at all');
  var I = K.story.interview;
  [undefined, null, 0, '', 'x', {}, [], NaN, { a: 1 }].forEach(function (v) {
    ['goal', 'audience', 'targetMin', 'bigIdea', 'shortIdea', 'turn', 'ask', 'proof', 'brand', 'tone', 'nope'].forEach(function (q) {
      var s = I.set(undefined, q, v);
      I.hints(s); I.logline(s); I.progress(s); I.clean(s); I.get(s, q); I.hint(q, v);
    });
  });
  a.equal(I.logline({ audience: 5, shortIdea: [], bigIdea: {}, ask: null }), 'For 5.', 'numbers are written, objects and arrays are not answers');
  a.equal(I.set(undefined, 'bigIdea', { x: 1 }).bigIdea, '');
});
