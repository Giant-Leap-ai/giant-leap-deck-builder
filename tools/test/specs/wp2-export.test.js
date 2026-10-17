/* tools/test/specs/wp2-export.test.js — PD.exportHTML (WP2, spec §3.6): emission order, escaping, round trip, guards,
 * the self-test. Runs in the unit harness (all of ROOT's themes, assets and decks are loaded):
 *   node tools/test/run.js --spec tools/test/specs/wp2-export.test.js
 * Nothing here registers a deck, theme or module on the shared page: object decks and assets are handed to
 * PD.exportHTML through its additive opts.deck / opts.assets. Factory decks, theme chains and the self-test of broken
 * decks are exercised on pages of their own in tools/test/e2e/wp2-export.e2e.js. */
(function () {
  var X = function () { return PD.get('core/export'); };
  var CLOSE = '<' + '/script>';                               // this file is not linted, but keep the literal out of it anyway
  var scriptsOf = function (html) { return Array.prototype.map.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script'), function (s) { return s.textContent; }); };
  var exportable = function () { return PD.modules().filter(function (m) { return !(m.opts && m.opts.export === false); }); };
  // the manifest entries a file leaves out by design: modules registered { export: false } that the kernel lists
  var leftOut = function () {
    var off = {};
    PD.modules().forEach(function (m) { if (m.opts && m.opts.export === false) off[m.name] = 1; });
    return PD.MANIFEST.map(function (e) { return e[0]; }).filter(function (n) { return off[n]; });
  };
  var MANIFEST_TRIM = function (names) { return 'PD.MANIFEST=PD.MANIFEST.filter(function(m){return ' + JSON.stringify(names) + '.indexOf(m[0])<0;});'; };
  // what the release step does to the kernel (spec §3.2): every optional flag becomes 1. Only the MANIFEST literal is touched.
  var flipFlags = function (html) {
    var at = html.indexOf('PD.MANIFEST = ['), end = html.indexOf('];', at);
    if (at < 0 || end < 0) throw new Error('the exported kernel has no MANIFEST literal');
    return html.slice(0, at) + html.slice(at, end).replace(/(\['[^']+',\s*)0(\s*\])/g, '$11$2') + html.slice(end);
  };
  var HEAD = function (title) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + title + '</title><meta name="generator" content="pixeldeck 2.0.0"></head><body>';
  };

  // the object deck of the round-trip acceptance (#3): hostile text everywhere a Studio user can type
  var HOSTILE = '</script><!-- */ * &';
  function roundTripDeck() {
    return {
      format: 2, id: 'wp2-rt',
      meta: {
        title: 'Round </script> & trip \u{1F680}', subtitle: HOSTILE, theme: 'cosmos', generator: 'studio@2.0.0', updated: '2026-10-14T00:00:00.000Z',
        story: { framework: 'blank', goal: null, audience: HOSTILE, targetMin: null, bigIdea: 'a & b', shortIdea: '', oldWay: '', newWay: '', ask: '', proof: [], brand: '\u{1F680}', tagline: '', tone: null }
      },
      scenes: [
        { id: 'a', text: [{ str: 'Hello ' + HOSTILE + ' \u{1F680}', style: 'statement', y: 540 }], notes: HOSTILE + ' \u{1F680} line\u2028sep\u2029end',
          steps: [{ text: [{ str: 'two', style: 'kicker', y: 300 }], notes: '-->' + CLOSE }] },
        { id: 'b', text: [{ str: 'b', style: 'hero', y: 540, color: ['#ffffff', '#00ff00'], glowAlpha: 0.35 }], notes: '', dwell: 4.5, lint: { ignore: ['copy.notes'] } }
      ]
    };
  }
  function roundTripAssets() {
    return { 'pic*': { type: 'image', src: 'data:image/png;base64,iVBORw0KGgo=', w: 1200, h: 400, name: 'p<q>&r.png', bytes: 8 },
      face: { type: 'font', src: 'data:font/woff2;base64,AAAA', family: 'Brand \u{1F680}', weight: '700', name: 'f.woff2', bytes: 3 } };
  }

  T.test('safe JSON escapes < > & * and U+2028/2029, stays valid JSON, and cannot hold a script end, a comment opener or a comment end', function (a) {
    var v = { s: HOSTILE + ' \u2028\u2029 \u{1F680} é', '<k*>': [1, 2.5, null, true, 'x'], n: { deep: '*/' } };
    var s = X().safeJSON(v);
    a.ok(!/[<>&*\u2028\u2029]/.test(s), 'none of the five characters survives: ' + s);
    ['\\u003c', '\\u003e', '\\u0026', '\\u002a', '\\u2028', '\\u2029'].forEach(function (e) { a.ok(s.indexOf(e) >= 0, e + ' is written'); });
    a.ok(s.indexOf(CLOSE) < 0 && s.indexOf('<!--') < 0 && s.indexOf('*/') < 0);
    a.deepEqual(JSON.parse(s), v, 'JSON.parse gives the value back');
    a.equal(X().safeJSON('plain'), '"plain"');
    a.throws(function () { X().safeJSON(undefined); }, /cannot be written as JSON/);
  });

  T.test('factory source escaping: a script end and a comment opener are broken with a backslash, case kept, meaning unchanged', function (a) {
    var src = "var a = '" + '<' + "/script>', b = '" + '<' + "/SCRIPT x', c = '<" + "!-- y', d = `" + '<' + "/Script>`;";
    var out = X().escapeSource(src);
    a.ok(!/<\/script/i.test(out), 'no script end left');
    a.ok(out.indexOf('<!--') < 0, 'no comment opener left');
    a.ok(out.indexOf('<\\/SCRIPT x') >= 0 && out.indexOf('<\\/Script>') >= 0, 'the letters keep their case');
    a.deepEqual(new Function(out + '; return [a, b, c, d];')(), [CLOSE, '<' + '/SCRIPT x', '<' + '!-- y', '<' + '/Script>'], 'every string means what it meant');
  });

  T.test('emission order (spec §3.6) for a factory deck: head, kernel, every exportable module in order, theme, assets, deck, start', function (a) {
    var html = PD.exportHTML('one-giant-leap');
    var pos = 0;
    function take(piece, what) {
      a.ok(html.startsWith(piece, pos), what + ' comes next, byte for byte (at ' + pos + ': ' + JSON.stringify(html.slice(pos, pos + 60)) + ')');
      pos += piece.length;
    }
    take(HEAD('One Giant Leap') + '\n', 'the head');
    take('<script>(' + PD.kernel.toString() + ')(window);' + CLOSE + '\n', 'the kernel');
    a.ok(leftOut().length >= 1, 'at least one manifest entry is left out by design (core/export itself)');
    take('<script>' + MANIFEST_TRIM(leftOut()) + CLOSE + '\n', 'the manifest trim (step 2b)');
    exportable().forEach(function (m) {
      var src = X().escapeSource(Function.prototype.toString.call(m.factory));
      take('<script>PD.module(' + JSON.stringify(m.name) + ',' + JSON.stringify(m.deps) + ',' + src + ',' + JSON.stringify(m.opts || {}) + ');' + CLOSE + '\n', 'module ' + m.name);
    });
    take('<script>PD.theme("one-giant-leap",' + X().safeJSON(PD.theme.get('one-giant-leap')) + ');' + CLOSE + '\n', 'the theme (a plain object: safe JSON)');
    take('<script>PD.assets("one-giant-leap",/*PD:ASSETS-JSON:BEGIN*/{}/*PD:ASSETS-JSON:END*/);' + CLOSE + '\n', 'the assets');
    take('<script>PD.deck("one-giant-leap",' + X().escapeSource(PD.deck.get('one-giant-leap').toString()) + ');' + CLOSE + '\n', 'the deck (a factory: its source, no DECK-JSON markers)');
    take('<script>PD.start("one-giant-leap");' + CLOSE + '</body></html>\n', 'the start call');
    a.equal(pos, html.length, 'nothing follows');
    a.ok(html.indexOf('DECK-JSON') < 0, 'a factory deck has no deck markers (a hand-written deck, spec §3.6)');
  });

  T.test('modules registered { export: false } are left out (this module itself among them); the kernel and all others are in, in registration order', function (a) {
    var html = PD.exportHTML('one-giant-leap');
    var names = (html.match(/<script>PD\.module\("([^"]+)"/g) || []).map(function (m) { return m.slice('<script>PD.module("'.length, -1); });
    a.deepEqual(names, exportable().map(function (m) { return m.name; }));
    a.ok(names.indexOf('core/export') < 0 && PD.modules().some(function (m) { return m.name === 'core/export' && m.opts.export === false; }), 'core/export is registered { export: false } and not emitted');
    a.ok(names.indexOf('core/player') >= 0 && names.indexOf('core/notes') >= 0, 'the player and the presenter notes are inside (N opens ?notes of the same file)');
    var s = scriptsOf(html);
    a.ok(s[0].indexOf('(function kernel(g)') === 0 && /\)\(window\);$/.test(s[0]), 'the kernel is the first script');
    a.equal(s.length, 1 + 1 + names.length + 1 + 1 + 1 + 1, 'kernel + manifest trim + modules + theme + assets + deck + start');
    a.equal(s[1], MANIFEST_TRIM(leftOut()), 'the second script trims the file\'s manifest');
    a.ok(leftOut().indexOf('core/export') >= 0 && names.every(function (n) { return leftOut().indexOf(n) < 0; }), 'it names only modules the file does not carry');
    a.equal((html.match(/<\/script/gi) || []).length, s.length, 'every script end in the file closes one of these scripts: no text can end a script early');
  });

  T.test('the file holds no src or href attribute at all (so none that is not data:), no fetch( call, and fits in 400 KB', function (a) {
    var html = PD.exportHTML('one-giant-leap');
    var doc = new DOMParser().parseFromString(html, 'text/html');
    a.equal(doc.querySelectorAll('[src],[href],link,img,iframe,video,audio,source,embed,object').length, 0, 'no element in the document loads or links anything');
    a.equal(Array.prototype.filter.call(doc.querySelectorAll('*'), function (e) { return Array.prototype.some.call(e.attributes, function (t) { return /^(src|href|srcset|poster|action|data)$/i.test(t.name); }); }).length, 0);
    var outside = html.replace(/<script>[\s\S]*?<\/script>/g, '');
    a.ok(!/\b(src|href)\s*=/i.test(outside), 'outside the script bodies there is no src= or href=');
    a.ok(html.indexOf('fetch(') < 0, 'no fetch( anywhere');
    a.ok(!/\b(XMLHttpRequest|importScripts|WebSocket)\b/.test(html), 'no other network API in the engine either');
    var bytes = new Blob([html]).size;
    a.ok(bytes < 400 * 1024, 'size ' + bytes + ' bytes < 409600');
  });

  T.test('an object deck is written between the DECK-JSON markers and the assets between the ASSETS-JSON markers; a theme object as safe JSON', function (a) {
    var deck = roundTripDeck(), assets = roundTripAssets();
    var html = PD.exportHTML('wp2-rt', { deck: deck, assets: assets });
    var tail = HEAD('Round &lt;/script&gt; &amp; trip \u{1F680}');
    a.ok(html.indexOf(tail + '\n') === 0, 'the title is HTML-escaped: ' + html.slice(0, 400).slice(-170));
    var s = scriptsOf(html);
    a.equal(s[s.length - 3], 'PD.assets("wp2-rt",/*PD:ASSETS-JSON:BEGIN*/' + X().safeJSON(assets) + '/*PD:ASSETS-JSON:END*/);');
    a.equal(s[s.length - 2], 'PD.deck("wp2-rt",/*PD:DECK-JSON:BEGIN*/' + X().safeJSON(deck) + '/*PD:DECK-JSON:END*/);');
    a.equal(s[s.length - 1], 'PD.start("wp2-rt");');
    a.equal(s[s.length - 4], 'PD.theme("cosmos",' + PD.theme.get('cosmos').toString().replace(/<\/script/gi, '<\\/script') + ');', 'cosmos is a factory theme: its source');
    a.equal(html.split('/*PD:DECK-JSON:BEGIN*/').length, 2, 'one deck begin marker');
    a.equal(html.split('/*PD:ASSETS-JSON:BEGIN*/').length, 2, 'one assets begin marker');
    a.equal((html.match(/<\/script/gi) || []).length, s.length, 'the hostile text ended no script');
    a.ok(html.indexOf('*/ * &') < 0 && html.indexOf(HOSTILE) < 0, 'the hostile text appears only escaped');
  });

  T.test('ROUND TRIP (acceptance #3): notes holding </script><!-- */ * & and an emoji export, then re-parse through the markers to a deepEqual deck and assets', function (a) {
    var deck = roundTripDeck(), assets = roundTripAssets();
    var html = PD.exportHTML('wp2-rt', { deck: deck, assets: assets });
    var r = PD.exportHTML.parse(html);
    a.deepEqual(r.deck, deck, 'the DeckSource');
    a.deepEqual(r.assets, assets, 'the assets');
    a.equal(r.id, 'wp2-rt');
    a.equal(r.title, deck.meta.title, 'the title is read back unescaped');
    a.equal(r.handWritten, false);
    a.equal(r.deck.scenes[0].notes, HOSTILE + ' \u{1F680} line\u2028sep\u2029end');
    // parsing never runs the file: the same text through DOMParser leaves every script inert, and it still parses
    a.deepEqual(PD.exportHTML.parse(new XMLSerializer().serializeToString(new DOMParser().parseFromString(html, 'text/html'))).deck, deck, 'also after a trip through an HTML parser (the browser reads the same JSON)');
  });

  T.test('a factory deck has assets markers only: parse says handWritten (spec: "written by hand, open it in a code editor")', function (a) {
    var html = PD.exportHTML('one-giant-leap');
    var r = PD.exportHTML.parse(html);
    a.deepEqual([r.id, r.title, r.handWritten, r.deck, r.assets], ['one-giant-leap', 'One Giant Leap', true, null, {}]);
  });

  T.test('parse refuses what it cannot trust: not a presentation, a repeated or unclosed marker, broken JSON', function (a) {
    var html = PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: roundTripAssets() });
    a.throws(function () { PD.exportHTML.parse('<!doctype html><title>x</title>'); }, /not a pixeldeck presentation/);
    a.throws(function () { PD.exportHTML.parse(html + '/*PD:DECK-JSON:BEGIN*/{}'); }, /deck begin marker occurs more than once/);
    a.throws(function () { PD.exportHTML.parse(html.replace('/*PD:ASSETS-JSON:END*/', '')); }, /assets begin marker has no end marker/);
    a.throws(function () { PD.exportHTML.parse(html.replace('/*PD:DECK-JSON:BEGIN*/{', '/*PD:DECK-JSON:BEGIN*/{x')); }, /deck JSON in this file is broken/);
    a.throws(function () { PD.exportHTML.parse(html.replace('/*PD:ASSETS-JSON:BEGIN*/', '/*PD:ASSETS-JSON:BEGIN*/[')); }, /assets JSON in this file is broken/);
  });

  T.test('the same inputs give the same bytes, with no clock, no randomness and no change to the page', function (a) {
    var n = 0, real = Math.random;
    Math.random = function () { n++; return real(); };
    var kids = document.body.children.length, styles = document.head.children.length;
    try {
      var h1 = PD.exportHTML('one-giant-leap'), h2 = PD.exportHTML('one-giant-leap');
      var d1 = PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: roundTripAssets() }), d2 = PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: roundTripAssets() });
    } finally { Math.random = real; }
    a.ok(h1 === h2 && d1 === d2, 'byte-identical');
    a.equal(n, 0, 'no Math.random call');
    a.deepEqual([document.body.children.length, document.head.children.length], [kids, styles], 'the page is untouched');
    a.ok(!/20\d\d-\d\d-\d\dT/.test(h1), 'no timestamp in the file');
  });

  T.test('title: HTML-escaped (& < > quotes); falls back to the deck id; generator meta names the engine version', function (a) {
    var d = roundTripDeck();
    d.meta.title = 'A & B <i>"x"</i> \'y\'';
    var html = PD.exportHTML('wp2-rt', { deck: d, assets: {} });
    a.ok(html.indexOf('<title>A &amp; B &lt;i&gt;&quot;x&quot;&lt;/i&gt; &#39;y&#39;</title>') > 0);
    a.equal(PD.exportHTML.parse(html).title, d.meta.title);
    delete d.meta.title;
    a.ok(PD.exportHTML('wp2-rt', { deck: d, assets: {} }).indexOf('<title>wp2-rt</title>') > 0, 'no title: the deck id');
    a.ok(html.indexOf('<meta name="generator" content="pixeldeck ' + PD.version + '">') > 0);
  });

  T.test('opts.selfTest puts <script>window.PD_SELFTEST=1</script> right after <head> and changes nothing else', function (a) {
    var plain = PD.exportHTML('one-giant-leap'), st = PD.exportHTML('one-giant-leap', { selfTest: true });
    var flag = '<script>window.PD_SELFTEST=1' + CLOSE;
    a.ok(st.indexOf('<head>' + flag + '<meta charset="utf-8">') > 0, 'right after <head>');
    a.equal(st.replace(flag, ''), plain);
    a.ok(plain.indexOf(flag) < 0);
  });

  T.test('guards: nothing is returned for an unknown deck, an id clash, a theme that is missing, or an ambiguous default', function (a) {
    a.throws(function () { PD.exportHTML('no-such-deck'); }, /no deck "no-such-deck"/);
    a.throws(function () { PD.exportHTML(); }, /needs a deck id/);
    a.throws(function () { PD.exportHTML('other', { deck: roundTripDeck() }); }, /says its id is "wp2-rt", not "other"/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: [] }); }, /must be a DeckSource object/);
    var d = roundTripDeck(); d.meta.theme = 'no-such-theme';
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: d }); }, /does not compile: .*no-such-theme/);
    a.equal(PD.exportHTML(undefined, { deck: roundTripDeck(), assets: {} }).indexOf('PD.start("wp2-rt")') > 0, true, 'the id of opts.deck is the default');
  });

  T.test('guards: data JSON cannot carry is refused with its path (function, NaN, Infinity, Date, hole, cycle); undefined keys are dropped', function (a) {
    function badDeck(patch) { var d = roundTripDeck(); patch(d); return d; }
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.scenes[0].text[0].points = function () { return []; }; }) }); },
      /deck "wp2-rt" holds a function at \.scenes\[0\]\.text\[0\]\.points, which JSON cannot carry/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.scenes[1].dwell = NaN; }) }); }, /the number NaN at \.scenes\[1\]\.dwell/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.meta.x = Infinity; }) }); }, /the number Infinity at \.meta\.x/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.meta.updated = new Date(0); }) }); }, /not plain data \(Date\) at \.meta\.updated/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.scenes[0].steps[0].list = [1, , 3]; }) }); }, /empty array slot at \.scenes\[0\]\.steps\[0\]\.list\[1\]/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.scenes[0].self = d.scenes[0]; }) }); }, /circular reference at \.scenes\[0\]\.self/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: badDeck(function (d) { d.scenes[0].list = [undefined]; }) }); }, /undefined at \.scenes\[0\]\.list\[0\]/);
    var ok = badDeck(function (d) { d.scenes[0].gone = undefined; });
    a.deepEqual(PD.exportHTML.parse(PD.exportHTML('wp2-rt', { deck: ok, assets: {} })).deck, roundTripDeck(), 'an undefined key is dropped, as JSON does');
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: { x: { type: 'image', src: 'data:,', w: NaN } } }); }, /assets of deck "wp2-rt" holds the number NaN at \.x\.w/);
  });

  T.test('guards: an asset that is not a data: URL makes no file (it would not be self-contained and would never load)', function (a) {
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: { logo: { type: 'image', src: 'logo.png', w: 1, h: 1, name: 'l', bytes: 1 } } }); },
      /asset "logo" is not embedded \(its src must be a data: URL\)/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: { logo: { type: 'image', src: 'file:///tmp/logo.png', w: 1, h: 1 } } }); }, /asset "logo" is not embedded/);
    a.throws(function () { PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: { logo: null } }); }, /asset "logo" is not embedded/);
    a.ok(PD.exportHTML('wp2-rt', { deck: roundTripDeck(), assets: { logo: { type: 'image', src: 'data:image/png;base64,AA==', w: 1, h: 1 } } }).length > 1000, 'data: is fine');
  });

  T.test('release flip (spec §3.2): with every MANIFEST flag set to 1 the exported file still lists nothing as missing and starts', function (a) {
    // PD.start in an exported file runs PD.missing(). The kernel inside it lists core/export, core/validate and story/*, which
    // the file does not carry by design ({ export: false }); the manifest trim (step 2b) keeps the flip from naming them.
    var html = PD.exportHTML('one-giant-leap'), flipped = flipFlags(html);
    var optional = PD.MANIFEST.filter(function (m) { return !m[1]; }).length;
    a.ok(flipped !== html || optional === 0, 'the flip changed the kernel (' + optional + ' optional entries today)');
    var zeros = (flipped.slice(flipped.indexOf('PD.MANIFEST = ['), flipped.indexOf('];', flipped.indexOf('PD.MANIFEST = ['))).match(/,\s*0\s*\]/g) || []).length;
    a.equal(zeros, 0, 'no optional flag is left in the file\'s manifest literal');
    // static view of the same fact: every required entry of the flipped manifest is carried or trimmed, none is lost
    var carried = {}, trimmed = {};
    exportable().forEach(function (m) { carried[m.name] = 1; });
    leftOut().forEach(function (n) { trimmed[n] = 1; });
    var lost = PD.MANIFEST.map(function (e) { return e[0]; }).filter(function (n) { return !carried[n] && !trimmed[n]; });
    a.deepEqual(lost, [], 'manifest entries that the flipped file would report missing: ' + lost.join(', '));
    // and the real thing: the flipped file is played by the self-test (it only answers when PD.start got past PD.missing())
    return X().selfTest(flipped, { timeoutMs: 15000 }).then(function (r) {
      a.deepEqual(r.errors, [], 'no self-test errors');
      a.equal(r.ok, true, 'the flipped file starts and plays every state');
    });
  }, { timeout: 40000 });

  T.test('guards: the export refuses when this page lacks a required engine module, or a carried module needs one the file would not have', function (a) {
    var realManifest = PD.MANIFEST, realModules = PD.modules;
    try {
      PD.MANIFEST = realManifest.concat([['never/loaded', 1]]);
      a.throws(function () { PD.exportHTML('one-giant-leap'); }, /the engine on this page is incomplete \(missing: never\/loaded\), so the file would not start/);
    } finally { PD.MANIFEST = realManifest; }
    try {
      PD.modules = function () {
        return realModules().concat([{ name: 'x/needs-validate', deps: ['core/validate'], factory: function () { }, opts: {} }, { name: 'x/needs-ghost', deps: ['x/ghost'], factory: function () { }, opts: {} }]);
      };
      a.throws(function () { PD.exportHTML('one-giant-leap'); }, /module "x\/needs-validate" needs "core\/validate", which the file would not carry \(it is registered \{ export: false \}\), so the file would not start/);
      PD.modules = function () { return realModules().concat([{ name: 'x/needs-ghost', deps: ['x/ghost'], factory: function () { }, opts: {} }]); };
      a.throws(function () { PD.exportHTML('one-giant-leap'); }, /module "x\/needs-ghost" needs "x\/ghost", which the file would not carry \(it is not registered before it\)/);
    } finally { PD.modules = realModules; }
    a.ok(PD.exportHTML('one-giant-leap').length > 1000, 'and the page is unchanged afterwards: the export works again');
  });

  T.test('self-test (acceptance #5): the exported OGL file plays every state in a hidden iframe and posts ok:true', function (a) {
    return X().selfTest(PD.exportHTML('one-giant-leap')).then(function (r) {
      a.deepEqual(r.errors, []);
      a.equal(r.ok, true, 'ok');
      a.ok(typeof r.ms === 'number' && r.ms > 0 && r.ms < 20000, 'finished in ' + r.ms + ' ms');
      a.equal(document.querySelectorAll('iframe').length, 0, 'the iframe is removed afterwards');
    });
  }, { timeout: 40000 });

  T.test('self-test never rejects and fails on silence: a page that posts nothing gives ok:false, slide -1, after the time limit', function (a) {
    var t0 = Date.now();
    return X().selfTest('<!doctype html><html><head><title>silent</title></head><body></body></html>', { timeoutMs: 400 }).then(function (r) {
      a.equal(r.ok, false);
      a.equal(r.errors.length, 1);
      a.equal(r.errors[0].slide, -1);
      a.ok(/no result within 0\.4 s/.test(r.errors[0].msg), r.errors[0].msg);
      a.ok(Date.now() - t0 >= 380 && Date.now() - t0 < 3000);
      a.equal(document.querySelectorAll('iframe').length, 0);
    });
  });

  T.test('self-test injects the flag only when the file lacks it, and ignores messages from other windows', function (a) {
    var seen = [];
    var h = function (e) { if (e.data && e.data.type === 'pd-selftest') seen.push(e.data); };
    window.addEventListener('message', h);
    // a forged result from this window itself is not the iframe's: it must not decide the test
    var p = X().selfTest('<!doctype html><html><head></head><body><script>parent.postMessage({ type: "pd-selftest", ok: true, errors: [], ms: 1 }, "*")' + CLOSE + '</body></html>', { timeoutMs: 3000 });
    window.postMessage({ type: 'pd-selftest', ok: false, errors: [{ slide: 0, step: 0, msg: 'forged' }], ms: 1 }, '*');
    return p.then(function (r) {
      window.removeEventListener('message', h);
      a.equal(r.ok, true, 'the iframe\'s own message decides, not the forged one from the top window');
      a.ok(seen.length >= 2, 'both messages were sent');
    });
  });
})();
