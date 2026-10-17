/* tools/test/specs/wp4-parity.test.js — WP4: decks/_parity (spec §8.2 M8, §9 WP4 #4), the unit side.
 * The pixel side is the golden gate: node tools/regression/golden.js --deck decks/_parity --all, then compare.js
 * against tools/regression/baselines/ogl (TOLERANT required, EXACT is the stretch goal). Here the deck is checked
 * structurally: every template expansion must equal the original One Giant Leap scene object for object, which is
 * what makes the rendered frames identical (same specs, same shape and layer creation order, same random calls). */
(function () {
  var OGL = [['spark', 'spark', 'cold-open', 2], ['title', 'name', 'brand-reveal', 4], ['warp', 'zoom-out', 'hyperspace', 5],
    ['galaxy', 'you-are-here', 'galaxy-reveal', 3], ['home', 'you-are-here', 'planet', 2], ['sunrise', 'human-truth', 'sunrise', 4],
    ['leaps', 'pattern', 'timeline', 3], ['box', 'the-box', 'the-box', 3], ['next', 'the-leap', 'pivot', 5], ['thanks', 'callback', 'finale', 4]];
  var STEPS = [0, 0, 1, 1, 0, 0, 7, 1, 1, 0];

  function plain(v) {                    // a function `points` is called, so OGL's closures compare with the template's arrays
    if (typeof v === 'function') return plain(v());
    if (Array.isArray(v)) return v.map(plain);
    if (v && typeof v === 'object') { var o = {}; for (var k in v) o[k] = plain(v[k]); return o; }
    return v;
  }

  T.test('parity: the deck is registered as "parity", themed cosmos, and compiles with no errors, no issues', function (a) {
    var def = PD.deck.get('parity');
    a.equal(typeof def, 'function', 'a PD.deck factory');
    var c = PD.compile('parity');
    a.equal(c.id, 'parity'); a.equal(c.source.id, 'parity'); a.equal(c.meta.theme, 'cosmos'); a.equal(c.theme.id, 'cosmos');
    a.equal(c.theme.key, PD.theme.resolve('cosmos').key, 'the shared cosmos look, unpatched');
    a.deepEqual(c.errors, []); a.deepEqual(PD.validate(c), []);
    a.deepEqual(c.worlds.slice(0, 4), ['core', 'cosmos', 'planet', 'spark'], 'the worlds One Giant Leap uses');
    a.equal(c.scenes.length, 10);
    a.deepEqual(PD.assets.get('parity'), {}, 'no assets');
  });

  T.test('parity: ten template scenes with One Giant Leap\'s ids, story metadata (beat, energy) and the template each one plays', function (a) {
    var c = PD.compile('parity'), src = c.source.scenes;
    a.deepEqual(src.map(function (s) { return [s.id, s.beat, s.template, s.energy]; }), OGL);
    a.deepEqual(c.scenes.map(function (s) { return [s.id, s.beat, s.like, s.energy]; }), OGL, 'like = the template id after compile');
    a.deepEqual(c.scenes.map(function (s) { return (s.steps || []).length; }), STEPS, 'the same number of clicks: 21 states in all');
    a.equal(STEPS.reduce(function (x, y) { return x + y + 1; }, 0), 21);
    src.forEach(function (s) { a.equal(typeof s.template, 'string'); a.ok(s.props && typeof s.props === 'object', s.id + ' has props'); });
  });

  T.test('parity: every scene\'s props are the template\'s example props', function (a) {
    PD.compile('parity').source.scenes.forEach(function (s) {
      a.deepEqual(s.props, PD.template.get(s.template).example, s.id + ' (' + s.template + ')');
    });
  });

  T.test('parity: meta.story equals One Giant Leap\'s (spec §6.10)', function (a) {
    a.deepEqual(PD.compile('parity').meta.story, PD.compile('one-giant-leap').meta.story);
    a.equal(PD.compile('parity').meta.generator, 'hand');
  });

  T.test('parity: each expanded scene equals the original One Giant Leap scene, object for object (notes, step notes, dwell and metadata included)', function (a) {
    var p = PD.compile('parity'), o = PD.compile('one-giant-leap');
    a.equal(p.scenes.length, o.scenes.length);
    o.scenes.forEach(function (os, i) {
      var ps = p.scenes[i];
      a.deepEqual(plain(ps), plain(os), 'scene ' + (i + 1) + ' (' + os.id + ')');
    });
  });

  T.test('parity: a template scene keeps its identity per compile, raw One Giant Leap scenes are passed by reference (the contrast the gate relies on)', function (a) {
    var o = PD.compile('one-giant-leap'), p = PD.compile('parity');
    o.scenes.forEach(function (s, i) { a.equal(s, o.source.scenes[i], 'ogl scene ' + i + ' is the source object'); });
    p.scenes.forEach(function (s, i) { a.ok(s !== p.source.scenes[i], 'parity scene ' + i + ' was expanded'); });
    a.equal(PD.compile('parity').source, p.source, 'the factory ran once: the same DeckSource');
  });
})();
