/* tools/test/specs/wp6-00-env.test.js — WP6 shared test environment: loads the Studio's logic modules into the harness.
 * Spec files load alphabetically, so wp6Studio() is available to wp6-*.test.js.
 *
 *   wp6Studio() → Promise<{ persist, files, store, app }>    loads studio/persist.js, import.js, store.js and app.js (once) from
 *                                                              the page's own ROOT; they register on the harness engine
 *   wp6Canvas(w, h, name, mime, paint?) → Promise<File>       a picture made in the page: paint(ctx, w, h) draws on it (default: opaque)
 *   wp6Project(over?) → Project                               a throw-away project that is never autosaved ({ studio.sample } is set)
 * The Studio's own DOM (the shell, the screens) is covered by tools/test/e2e/wp6-studio.e2e.js. */
var WP6_BASE = document.currentScript.src.replace(/tools\/test\/specs\/[^\/]*$/, '');
var wp6P = null;

function wp6Load(path) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = WP6_BASE + path; s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('could not load ' + path)); };
    document.head.appendChild(s);
  });
}
function wp6Studio() {
  if (wp6P) return wp6P;
  wp6P = ['studio/persist.js', 'studio/import.js', 'studio/store.js', 'studio/app.js'].reduce(function (chain, f) {
    return chain.then(function () { return PD.has('studio/' + f.replace(/^studio\/|\.js$/g, '')) ? null : wp6Load(f); });
  }, Promise.resolve()).then(function () {
    var S = PD.studio;
    return { persist: S.persist, files: S.files, store: S.store, app: S };
  });
  return wp6P;
}
function wp6Canvas(w, h, name, mime, paint) {
  return new Promise(function (resolve) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    if (paint) paint(g, w, h); else { g.fillStyle = '#3d6bff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd27a'; g.fillRect(w / 4, h / 4, w / 2, h / 2); }
    cv.toBlob(function (b) { resolve(new File([b], name, { type: mime })); }, mime, 0.9);
  });
}
function wp6Project(over) {
  var S = PD.studio, p = S.store.blankProject('Unit test deck');
  p.studio.sample = 'unit-test';                 // never autosaved: the unit tests leave no project behind
  p.deck.scenes = [
    { id: 'a', template: 'statement', props: { line: 'First scene' }, notes: 'one two three' },
    { id: 'b', template: 'statement', props: { line: 'Second scene' }, notes: 'four five six' },
    { id: 'c', template: 'statement', props: { line: 'Third scene' }, notes: 'seven eight nine' }
  ];
  for (var k in over || {}) p[k] = over[k];
  return p;
}

T.test('wp6 env: the Studio modules load on the harness engine and add nothing to the page until used', function (a) {
  return wp6Studio().then(function (S) {
    a.ok(PD.has('studio/persist') && PD.has('studio/import') && PD.has('studio/store') && PD.has('studio/app'));
    a.equal(typeof S.store.commit, 'function'); a.equal(typeof S.app.screen, 'function');
    a.ok(window.Studio === PD.studio, 'the global Studio is the namespace of the spec');
    a.equal(document.querySelector('.pds'), null, 'registration built no shell');
    a.equal(PD.modules().filter(function (m) { return /^studio\//.test(m.name); }).every(function (m) { return m.opts && m.opts.export === false; }), true, 'every studio module is { export: false }');
  });
});
