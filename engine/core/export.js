/* engine/core/export.js — the standalone presentation file (spec §3.6, WP2).
 *
 *   PD.exportHTML(deckId?, opts?) → string      one self-contained HTML file for the deck
 *     deckId  a registered PD.deck id (default: the only registered deck). The page must have the deck's theme.js,
 *             assets.js and deck.js loaded, and the engine files its deck needs (the loader of a deck shim does).
 *     opts    { selfTest?: bool }   puts the script window.PD_SELFTEST=1 right after <head> (spec §3.6 self-test)
 *             Additive options for callers that hold the deck in memory (the Studio):
 *             { deck?: DeckSource, assets?: map }   export this object deck / these assets instead of the registered ones
 *             (the deck's id must equal deckId; nothing is registered by the call)
 *
 * Emission order (spec §3.6; each piece is its own <script>, one per line):
 *   1  <!doctype html> … <title>{escaped meta.title}</title><meta name="generator" content="pixeldeck 2.0.0"></head><body>
 *   2  (kernel.toString())(window);
 *   2b PD.MANIFEST=PD.MANIFEST.filter(…);          the file's own manifest drops the entries this file leaves out by design
 *   3  PD.module(name, deps, factory, opts);      every module of PD.modules() except those registered { export: false }
 *   4  PD.theme(id, src);                          the deck's theme chain, root first (factory source, or safe JSON)
 *   5  PD.assets(id, safe JSON of the asset map between the ASSETS-JSON BEGIN and END markers);
 *   6  PD.deck(id, factory source)                 a factory deck, or
 *      PD.deck(id, safe JSON of the DeckSource between the DECK-JSON BEGIN and END markers)   an object deck (the Studio's)
 *   7  PD.start(id);
 * This module is registered { export: false }: a presentation file plays, it does not export itself (and its source
 * names the markers, which the file must carry only once).
 *
 * Step 2b is an addition to the order of spec §3.6, needed for the release (spec §3.2: "the release flips every MANIFEST
 * flag to 1"). The modules registered { export: false } (this one, core/validate, story/*) are absent from a presentation
 * file by design, but the kernel re-emitted in it still lists them, so after the flip PD.missing() would name them and
 * PD.start would stop with "missing engine files". Step 2b removes exactly those entries (and no others) from the file's
 * own PD.MANIFEST, so a module that is genuinely absent is still reported. Idempotent, and harmless if the kernel itself
 * ever learns to skip them. Two guards keep an unstartable file from being written: the exporting page must itself have
 * every required module (PD.missing() empty), and every module the file carries must find its dependencies in the file.
 *
 * Escaping. Safe JSON = JSON.stringify with every <, >, &, * and U+2028 / U+2029 written as a \u escape, so neither a
 * closing script tag, an HTML comment opener nor the end of a block comment can appear inside the markers. Factory
 * sources (Function.prototype.toString, comments included) get the script-end and comment-opener sequences broken with
 * a backslash, a safety net: tools/lint.js already forbids both in the sources.
 * Guards: the call throws, and writes nothing, when a factory is native or bound, its source does not parse as an
 * expression, or it carries a marker; when an object deck, theme or asset map holds anything JSON cannot carry
 * (a function, NaN, a Date…); or when an asset is not embedded (its src must start with data:).
 *
 *   PD.exportHTML.parse(html) → { id, title, deck: DeckSource | null, assets, handWritten }
 *     Re-opening (spec §3.6): locates the marker pairs and calls JSON.parse on the text between them; it never executes
 *     the file. handWritten is true (deck null) when the file has assets markers but no deck markers: a factory deck.
 *     Throws when the file is not a pixeldeck presentation or the markers are ambiguous or the JSON is broken.
 *   PD.exportHTML.selfTest(html, { timeoutMs = 20000 }) → Promise<{ ok, errors: [{ slide, step, msg }], ms }>
 *     Mounts the file in a hidden iframe (srcdoc) with PD_SELFTEST set, and waits for the player's pd-selftest message.
 *     Never rejects; no message in time is a failure (slide -1).
 *   PD.exportHTML.safeJSON(value) → string
 * Registering this module allocates nothing and touches no DOM. */
PD.module('core/export', ['core/theme', 'core/compile'], function (PD, themeMod, compileMod) {
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var PRE = 'pixeldeck: PD.exportHTML: ';
  // the marker texts are the contract with the Studio's re-open (spec §3.6)
  var M = {
    assets: ['/*PD:ASSETS-JSON:BEGIN*/', '/*PD:ASSETS-JSON:END*/'],
    deck: ['/*PD:DECK-JSON:BEGIN*/', '/*PD:DECK-JSON:END*/']
  };
  var PREFIX = ['/*PD:ASSETS-JSON:', '/*PD:DECK-JSON:'];      // no factory source may contain either

  /* ---------------------------------------------------------- escaping */
  function hex4(c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); }
  function safeJSON(v) {
    var s = JSON.stringify(v);
    if (s === undefined) throw new Error(PRE + 'a value of type ' + typeof v + ' cannot be written as JSON');
    return s.replace(/[<>&*\u2028\u2029]/g, hex4);
  }
  // one inline script element; the closing tag is written with an escape so this source never holds the literal text
  function script(code) { return '<script>' + code + '<\x2fscript>'; }
  // "script end" and "comment opener" written with a backslash (a no-op in strings, regexes, templates and comments)
  function escapeSource(s) {
    return s.replace(/<\x2f(script)/gi, function (m, word) { return '<\\/' + word; })
            .replace(/<!\x2d\x2d/g, '<\\!--');
  }
  function escapeText(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }
  function unescapeText(s) {
    return String(s).replace(/&(amp|lt|gt|quot|#39);/g, function (m, n) {
      return n === 'amp' ? '&' : n === 'lt' ? '<' : n === 'gt' ? '>' : n === 'quot' ? '"' : "'";
    });
  }

  /* ---------------------------------------------------------- guards */
  function isPlain(v) { var p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; }
  function keyPath(path, k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? path + '.' + k : path + '[' + JSON.stringify(k) + ']'; }
  function bad(what, path, why) {
    throw new Error(PRE + what + ' holds ' + why + ' at ' + (path || '(root)') + ', which JSON cannot carry. ' +
      'Object decks, themes and assets must be plain data; put code in a factory deck instead.');
  }
  // an object deck, an object theme or an asset map must survive JSON exactly
  function checkData(v, path, what, stack) {
    var t = typeof v;
    if (v === null || t === 'string' || t === 'boolean') return;
    if (t === 'number') { if (!isFinite(v)) bad(what, path, 'the number ' + v); return; }
    if (t !== 'object') bad(what, path, t === 'undefined' ? 'undefined' : 'a ' + t);
    if (stack.indexOf(v) >= 0) bad(what, path, 'a circular reference');
    stack.push(v);
    var i, k;
    if (Array.isArray(v)) {
      for (i = 0; i < v.length; i++) {
        if (!(i in v)) bad(what, path + '[' + i + ']', 'an empty array slot');
        checkData(v[i], path + '[' + i + ']', what, stack);
      }
    } else {
      if (!isPlain(v)) bad(what, path, 'an object that is not plain data (' + ((v.constructor && v.constructor.name) || 'unknown') + ')');
      for (k in v) if (has(v, k) && v[k] !== undefined) checkData(v[k], keyPath(path, k), what, stack);   // undefined keys are dropped
    }
    stack.pop();
  }

  // Function.prototype.toString of a factory, checked and escaped; `label` names it in errors
  function sourceOf(fn, label) {
    if (typeof fn !== 'function') throw new Error(PRE + label + ' is not a function');
    var s = Function.prototype.toString.call(fn);
    if (/\{\s*\[native code\]\s*\}\s*$/.test(s)) throw new Error(PRE + label + ' is a native or bound function; its source cannot be re-emitted');
    try { new Function('return (' + s + '\n);'); }
    catch (e) {
      if (!(e instanceof EvalError)) throw new Error(PRE + label + ' cannot be re-emitted, its source is not a function expression (' + (e && e.message) + '). ' +
        'Write it as function (…) { … }, not as a method, class or arrow shorthand.');
    }
    for (var i = 0; i < PREFIX.length; i++)
      if (s.indexOf(PREFIX[i]) >= 0) throw new Error(PRE + label + ' contains the text ' + PREFIX[i] + ', which only the export may write (re-opening would be ambiguous)');
    return escapeSource(s);
  }

  /* ---------------------------------------------------------- the deck */
  function onlyDeckId() {
    var ids = PD.deck.list();
    if (ids.length === 1) return ids[0];
    throw new Error(PRE + 'needs a deck id (' + (ids.length ? ids.length + ' decks are registered: ' + ids.join(', ') : 'no deck is registered') + ')');
  }

  function exportHTML(deckId, opts) {
    opts = opts || {};
    var def, id = deckId;
    if (opts.deck !== undefined) {
      def = opts.deck;
      if (def === null || typeof def !== 'object' || Array.isArray(def)) throw new Error(PRE + 'opts.deck must be a DeckSource object');
      if (id == null) id = def.id;
    }
    if (id == null) id = onlyDeckId();
    id = String(id);
    if (opts.deck === undefined) {
      def = PD.deck.get(id);
      if (def === undefined) throw new Error(PRE + 'no deck "' + id + '" (load its deck.js)');
    } else if (def.id != null && def.id !== id) throw new Error(PRE + 'opts.deck says its id is "' + def.id + '", not "' + id + '"');

    // the compiled deck gives the title and the theme chain; a factory deck runs once per page, as in PD.start
    var compiled;
    try { compiled = PD.compile(opts.deck !== undefined ? def : id); }
    catch (e) { throw new Error(PRE + 'deck "' + id + '" does not compile: ' + (e && e.message ? e.message : e)); }
    var meta = compiled.meta || {}, title = meta.title != null && meta.title !== '' ? meta.title : id;
    var chain = compiled.theme.chain;

    var assets = opts.assets !== undefined ? opts.assets : PD.assets.get(id);
    checkData(assets, '', 'the assets of deck "' + id + '"', []);
    for (var aid in assets) {
      if (!has(assets, aid)) continue;
      var a = assets[aid];
      if (!a || typeof a.src !== 'string' || a.src.slice(0, 5) !== 'data:')
        throw new Error(PRE + 'asset "' + aid + '" is not embedded (its src must be a data: URL), so the file would not be self-contained');
    }

    // the modules the file carries, in registration order, and the ones it leaves out by design ({ export: false })
    var absent = PD.missing();
    if (absent.length) throw new Error(PRE + 'the engine on this page is incomplete (missing: ' + absent.join(', ') + '), so the file would not start');
    var carried = [], skipped = [], inFile = {};
    PD.modules().forEach(function (m) {
      if (m.opts && m.opts.export === false) { skipped.push(m.name); return; }
      m.deps.forEach(function (d) {
        if (!inFile[d]) throw new Error(PRE + 'module "' + m.name + '" needs "' + d + '", which the file would not carry' +
          (skipped.indexOf(d) >= 0 ? ' (it is registered { export: false })' : ' (it is not registered before it)') + ', so the file would not start');
      });
      inFile[m.name] = 1; carried.push(m);
    });
    var leftOut = PD.MANIFEST.map(function (e) { return e[0]; }).filter(function (n) { return skipped.indexOf(n) >= 0; });

    var out = [];
    out.push('<!doctype html><html lang="en"><head>' + (opts.selfTest ? script('window.PD_SELFTEST=1') : '') +
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escapeText(title) + '</title><meta name="generator" content="pixeldeck ' + escapeText(PD.version) + '"></head><body>');
    out.push(script('(' + sourceOf(PD.kernel, 'the kernel') + ')(window);'));
    if (leftOut.length) out.push(script('PD.MANIFEST=PD.MANIFEST.filter(function(m){return ' + safeJSON(leftOut) + '.indexOf(m[0])<0;});'));
    carried.forEach(function (m) {
      out.push(script('PD.module('+ safeJSON(m.name) + ',' + safeJSON(m.deps) + ',' + sourceOf(m.factory, 'module "' + m.name + '"') + ',' + safeJSON(m.opts || {}) + ');'));
    });
    chain.forEach(function (tid) {
      var t = PD.theme.get(tid), src;
      if (typeof t === 'function') src = sourceOf(t, 'theme "' + tid + '"');
      else { checkData(t, '', 'theme "' + tid + '"', []); src = safeJSON(t); }
      out.push(script('PD.theme(' + safeJSON(tid) + ',' + src + ');'));
    });
    out.push(script('PD.assets(' + safeJSON(id) + ',' + M.assets[0] + safeJSON(assets) + M.assets[1] + ');'));
    if (typeof def === 'function') out.push(script('PD.deck(' + safeJSON(id) + ',' + sourceOf(def, 'deck "' + id + '"') + ');'));
    else {
      checkData(def, '', 'deck "' + id + '"', []);
      out.push(script('PD.deck(' + safeJSON(id) + ',' + M.deck[0] + safeJSON(def) + M.deck[1] + ');'));
    }
    out.push(script('PD.start(' + safeJSON(id) + ');') + '</body></html>');
    return out.join('\n') + '\n';
  }

  /* ---------------------------------------------------------- re-opening */
  function markerSpan(html, pair, what) {
    var b = html.indexOf(pair[0]);
    if (b < 0) return null;
    if (html.indexOf(pair[0], b + 1) >= 0) throw new Error(PRE + 'the ' + what + ' begin marker occurs more than once; the file is ambiguous');
    var e = html.indexOf(pair[1], b + pair[0].length);
    if (e < 0) throw new Error(PRE + 'the ' + what + ' begin marker has no end marker');
    if (html.indexOf(pair[1], e + 1) >= 0) throw new Error(PRE + 'the ' + what + ' end marker occurs more than once; the file is ambiguous');
    return { at: b, from: b + pair[0].length, to: e };
  }
  function parseJSON(text, what) {
    try { return JSON.parse(text); }
    catch (err) { throw new Error(PRE + 'the ' + what + ' JSON in this file is broken (' + (err && err.message) + ')'); }
  }
  function parse(html) {
    html = String(html);
    var a = markerSpan(html, M.assets, 'assets');
    if (!a) throw new Error(PRE + 'this file is not a pixeldeck presentation (it has no assets markers)');
    var d = markerSpan(html, M.deck, 'deck');
    var call = html.lastIndexOf('PD.assets(', a.at), id = null;
    if (call >= 0) {                        // PD.assets("id",/*PD:ASSETS-JSON:BEGIN*/: the id is the JSON string between
      var idText = html.slice(call + 'PD.assets('.length, a.at).replace(/,\s*$/, '');
      try { id = JSON.parse(idText); } catch (err) { id = null; }
    }
    var t = /<title>([\s\S]*?)<\/title>/i.exec(html);
    var res = { id: typeof id === 'string' ? id : null, title: t ? unescapeText(t[1]) : null,
      deck: null, assets: parseJSON(html.slice(a.from, a.to), 'assets'), handWritten: !d };
    if (d) res.deck = parseJSON(html.slice(d.from, d.to), 'deck');
    return res;
  }

  /* ---------------------------------------------------------- self-test */
  function selfTest(html, o) {
    o = o || {};
    var limit = o.timeoutMs == null ? 20000 : +o.timeoutMs;
    return new Promise(function (resolve) {
      var doc = document, frame = doc.createElement('iframe'), done = false, timer = 0, t0 = Date.now();
      function finish(res) {
        if (done) return;
        done = true; clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        try { if (frame.parentNode) frame.parentNode.removeChild(frame); } catch (e) { }
        resolve(res);
      }
      function onMessage(e) {
        var d = e.data;
        if (e.source !== frame.contentWindow || !d || typeof d !== 'object' || d.type !== 'pd-selftest') return;
        finish({ ok: !!d.ok, errors: Array.isArray(d.errors) ? d.errors : [], ms: typeof d.ms === 'number' ? d.ms : Date.now() - t0 });
      }
      try {
        var page = String(html), flag = script('window.PD_SELFTEST=1');      // the player's own source also mentions PD_SELFTEST
        if (page.indexOf('<head>' + flag) < 0) page = page.replace('<head>', function (m) { return m + flag; });
        window.addEventListener('message', onMessage);
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:720px;border:0;visibility:hidden;pointer-events:none';
        frame.srcdoc = page;
        timer = setTimeout(function () {
          finish({ ok: false, errors: [{ slide: -1, step: 0, msg: 'the self-test sent no result within ' + limit / 1000 + ' s' }], ms: Date.now() - t0 });
        }, limit);
        (o.container || doc.body || doc.documentElement).appendChild(frame);
      } catch (err) {
        finish({ ok: false, errors: [{ slide: -1, step: 0, msg: String(err && err.message || err) }], ms: Date.now() - t0 });
      }
    });
  }

  exportHTML.parse = parse;
  exportHTML.selfTest = selfTest;
  exportHTML.safeJSON = safeJSON;
  PD.exportHTML = exportHTML;
  return { exportHTML: exportHTML, parse: parse, selfTest: selfTest, safeJSON: safeJSON, escapeSource: escapeSource, escapeText: escapeText };
}, { export: false });
