/* tools/test/specs/wp5-00-env.test.js — WP5 shared test environment (no tests of its own besides a smoke check).
 * Spec files load alphabetically, so these globals exist for wp5-*.test.js. Everything that registers templates, themes or
 * decks runs on a FRESH engine (the harness's module factories re-registered on PD.kernel(fakeGlobal)), so the harness
 * registries are never modified and the catalog stub cannot clash with the real WP4 templates.
 *
 *   wp5Load(url) → Promise                     load a fixture script once (WP5_BASE + 'fixtures/…' = tools/test/fixtures/…)
 *   wp5Fresh(own?) → Promise<K>                a fresh engine: core + the four OGL worlds + story/* modules, the themes
 *                                              cosmos, slate (a stub with slate's worlds), one-giant-leap, the OGL deck, and
 *                                              the stub §5 catalog (tools/test/fixtures/wp5-catalog.js). Memoized unless own is true.
 *   wp5Ogl(K, mutate?) → CompiledDeck          the OGL deck source (deep-cloned) after mutate(source), compiled on K
 *   wp5Clone(v)                                deep copy of data; functions by reference
 *   wp5Story(over?) → StoryMeta                a full story (every field answered) with the given overrides
 *   wp5Real() → PD | null                      the harness's own engine when the real WP4 catalog (16 templates), WP3's slate and
 *                                              core/validate are loaded, else null
 *   wp5Each(title, body(a, K), opts?)          registers the test twice: "[stub catalog]" on wp5Fresh() (the §5 table as
 *                                              metadata, so the story code is pinned to the spec and not to WP4's files) and
 *                                              "[real catalog]" on wp5Real() (the code that actually ships; a skip when it is
 *                                              not all loaded). Use it for the acceptance items that must hold on both. */
var WP5_MODULES = ['core/util', 'core/ease', 'core/glow', 'core/fx', 'core/space', 'core/earth', 'core/shapes', 'core/field',
  'core/text', 'core/theme', 'core/assets', 'core/compile', 'core/stage', 'worlds/core', 'worlds/cosmos', 'worlds/planet', 'worlds/spark',
  'story/copy', 'story/frameworks', 'story/interview', 'story/timing', 'story/board', 'story/lint'];
var wp5Loaded = {}, wp5FreshP = null;
var WP5_BASE = document.currentScript.src.replace(/specs\/[^\/]*$/, '');       // .../tools/test/ whatever page loads this file

function wp5Load(path) {
  if (wp5Loaded[path]) return wp5Loaded[path];
  return (wp5Loaded[path] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = path; s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('could not load ' + path)); };
    document.head.appendChild(s);
  }));
}
function wp5Clone(v) {
  if (Array.isArray(v)) return v.map(wp5Clone);
  if (!v || typeof v !== 'object') return v;
  var o = {};
  for (var k in v) o[k] = wp5Clone(v[k]);
  return o;
}
function wp5Fresh(own) {                 // own = true: a new engine nobody else shares (a test that registers rules)
  if (wp5FreshP && !own) return wp5FreshP;
  var p = wp5Load(WP5_BASE + 'fixtures/wp5-catalog.js').then(function () {
    var g = {}; PD.kernel(g);
    var K = g.PD, all = PD.modules();
    WP5_MODULES.forEach(function (n) {
      var rec = all.filter(function (m) { return m.name === n; })[0];
      if (!rec) throw new Error('wp5Fresh: the harness has no module ' + n);
      K.module(n, rec.deps, rec.factory, rec.opts);
    });
    K.theme('cosmos', PD.theme.get('cosmos'));
    K.theme('one-giant-leap', PD.theme.get('one-giant-leap'));
    var cosmos = wp5Clone(PD.theme.resolve('cosmos'));       // slate's worlds over cosmos' values: all the story code reads
    ['id', 'chain', 'key'].forEach(function (k) { delete cosmos[k]; });
    cosmos.label = 'Slate (test stub)'; cosmos.worlds = ['ambient', 'photo', 'spark'];
    K.theme('slate', cosmos);
    K.deck('one-giant-leap', PD.deck.get('one-giant-leap'));
    WP5_CATALOG.register(K);
    return K;
  });
  if (!own) wp5FreshP = p;
  return p;
}
function wp5Ogl(K, mutate, id) {
  var src = wp5Clone(K.compile('one-giant-leap').source);
  src.id = id || 'wp5-fixture';
  if (mutate) mutate(src);
  return K.compile(src);
}
function wp5Real() {
  return PD.template.list().length >= 16 && PD.theme.has('slate') && PD.has('core/validate') && PD.has('story/lint') && PD.theme.resolve('slate').worlds.indexOf('ambient') >= 0 ? PD : null;
}
function wp5Each(title, body, opts) {
  T.test(title + ' [stub catalog]', function (a) { return wp5Fresh().then(function (K) { return body(a, K); }); }, opts);
  T.test(title + ' [real catalog]', function (a) {
    var K = wp5Real();
    if (!K) { a.ok(true, 'the real WP4 catalog / WP3 slate / core/validate are not all loaded: skipped'); return; }
    return body(a, K);
  }, opts);
}
function wp5Story(over) {
  var s = {
    framework: 'giant-leap', goal: 'inspire', tone: 'cinematic', audience: 'operations leads', targetMin: 10,
    bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
    shortIdea: 'Augmentation, not automation', oldWay: 'automation', newWay: 'augmentation', ask: 'Book a pilot',
    proof: [{ kind: 'number', text: 'hours saved each week', value: 12 }, { kind: 'quote', text: 'It changed how we work', who: 'Sam Lee' },
            { kind: 'story', text: 'A Leeds team shipped in a day' }],
    brand: 'Acme', tagline: 'Work, but human'
  };
  for (var k in over || {}) s[k] = over[k];
  return s;
}

T.test('wp5 env: the [real catalog] variants are not skipped: the harness has the 16 WP4 templates, WP3\'s slate and core/validate', function (a) {
  var K = wp5Real();
  a.ok(K === PD, 'wp5Real() is the harness engine; if this fails the [real catalog] tests only pass by skipping');
  a.deepEqual(PD.template.list().slice().sort(), WP5_CATALOG_IDS_SORTED(), 'the real catalog has the 16 template ids of §5');
  a.deepEqual(PD.theme.resolve('slate').worlds, ['ambient', 'photo', 'spark'], 'the real slate');
  a.equal(typeof PD.validate, 'function');
});

function WP5_CATALOG_IDS_SORTED() {
  return ['cold-open', 'brand-reveal', 'hyperspace', 'galaxy-reveal', 'planet', 'sunrise', 'timeline', 'the-box', 'pivot', 'finale', 'statement',
    'big-number', 'quote', 'three-points', 'logo', 'image'].sort();
}

T.test('wp5 env: the fresh engine has the story modules, both themes, the OGL deck and the 16-template stub catalog', function (a) {
  return wp5Fresh().then(function (K) {
    a.ok(K !== PD, 'a separate kernel');
    a.deepEqual(K.template.list(), WP5_CATALOG.ids);
    a.ok(K.has('story/lint') && K.has('story/board') && K.has('story/timing'));
    a.deepEqual(K.framework.list(), ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']);
    a.deepEqual(K.compile('one-giant-leap').worlds, ['core', 'cosmos', 'planet', 'spark']);
    a.deepEqual(K.theme.resolve('slate').worlds, ['ambient', 'photo', 'spark']);
    a.ok(!PD.template.has('wp5-never'), 'the harness registry is untouched');
  });
});
