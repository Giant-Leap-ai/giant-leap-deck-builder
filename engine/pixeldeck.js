/* engine/pixeldeck.js — pixeldeck kernel. ONE function expression; re-emitted by export via kernel.toString(). */
(function kernel(g) {
  if (g.PD && g.PD.kernel) return;
  var PD = g.PD = { version: '2.0.0', kernel: kernel };
  var mods = [], byName = {};

  PD.module = function (name, deps, factory, opts) {
    if (byName[name]) throw new Error('pixeldeck: module "' + name + '" is registered twice');
    var args = [PD];
    for (var i = 0; i < deps.length; i++) {
      if (!byName[deps[i]]) throw new Error('pixeldeck: module "' + name + '" needs "' + deps[i] + '" loaded first');
      args.push(byName[deps[i]].exports);
    }
    var rec = { name: name, deps: deps.slice(), factory: factory, opts: opts || {}, exports: null };
    byName[name] = rec; mods.push(rec);
    rec.exports = factory.apply(null, args) || {};
    return rec.exports;
  };
  PD.get = function (n) { if (!byName[n]) throw new Error('pixeldeck: no module "' + n + '"'); return byName[n].exports; };
  PD.has = function (n) { return !!byName[n]; };
  PD.modules = function () { return mods.map(function (m) { return { name: m.name, deps: m.deps, factory: m.factory, opts: m.opts }; }); };

  function registry(kind) {
    var items = {}, order = [];
    function reg(name, def) {
      if (Object.prototype.hasOwnProperty.call(items, name)) throw new Error('pixeldeck: ' + kind + ' "' + name + '" is registered twice');
      items[name] = def; order.push(name); return def;
    }
    reg.get = function (n) { return Object.prototype.hasOwnProperty.call(items, n) ? items[n] : undefined; };
    reg.has = function (n) { return Object.prototype.hasOwnProperty.call(items, n); };
    reg.list = function () { return order.slice(); };
    reg.kind = kind;
    return reg;
  }
  PD.world = registry('world');     PD.element = registry('element');  PD.shape = registry('shape');
  PD.reveal = registry('reveal');   PD.exitFx = registry('exit');      PD.template = registry('template');
  PD.framework = registry('framework');
  PD.theme = registry('theme');     // def: ThemeSource | function (PD) → ThemeSource
  PD.deck = registry('deck');       // def: DeckSource  | function (PD, h) → DeckSource

  var store = {};
  PD.assets = function (deckId, map) { var s = store[deckId] || (store[deckId] = {}); for (var k in map) s[k] = map[k]; };
  PD.assets.get = function (deckId) { return store[deckId] || {}; };
  PD.assets.put = function (deckId, id, src) { (store[deckId] || (store[deckId] = {}))[id] = src; };
  PD.assets.remove = function (deckId, id) { if (store[deckId]) delete store[deckId][id]; };

  // [module name, required]. File = PD.base + name + '.js'. Order = dependency order.
  PD.MANIFEST = [
    ['core/util',1],['core/ease',1],['core/glow',1],['core/fx',1],['core/space',1],['core/earth',1],
    ['core/shapes',1],['core/field',1],['core/text',1],['core/theme',1],['core/assets',1],['core/compile',1],
    ['core/stage',1],['core/sync',1],['core/thumbs',1],['core/hud',1],['core/player',1],['core/notes',1],
    ['core/export',0],
    ['worlds/core',1],['worlds/cosmos',1],['worlds/planet',1],['worlds/spark',1],['worlds/ambient',0],['worlds/photo',0],
    ['elements/image',0],['elements/counter',0],
    ['templates/cinematic',0],['templates/essentials',0],
    ['core/validate',0],
    ['story/copy',0],['story/frameworks',0],['story/interview',0],['story/timing',0],['story/board',0],['story/lint',0]
  ];
  PD.missing = function () { return PD.MANIFEST.filter(function (m) { return m[1] && !byName[m[0]]; }).map(function (m) { return m[0]; }); };
  PD.fail = function (msg) {   // full-screen black panel, white monospace text; never throws
    try { msg = String(msg); } catch (e) { msg = 'pixeldeck: error'; }
    try { if (g.console && g.console.error) g.console.error(msg); } catch (e) { }
    try {
      var d = g.document;
      if (!d || !d.createElement) return;
      var show = function () {
        try {
          var el = d.createElement('div');
          el.setAttribute('data-pd-fail', '');
          el.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;margin:0;padding:32px 40px;' +
            'background:#000;color:#fff;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;overflow:auto';
          el.textContent = msg;
          (d.body || d.documentElement).appendChild(el);
        } catch (e) { }
      };
      if (d.body || !d.addEventListener) show(); else d.addEventListener('DOMContentLoaded', show);
    } catch (e) { }
  };
  PD.start = function (deckId, opts) {
    var miss = PD.missing();
    if (miss.length) return PD.fail('pixeldeck: missing engine files: ' + miss.join(', '));
    return PD.get('core/player').start(deckId, opts);
  };

  var doc = g.document, cs = doc && doc.currentScript;
  PD.base = cs && cs.src ? cs.src.replace(/[^\/]*$/, '') : '';           // '' when inlined (exported file)
  if (PD.base && !g.PD_NO_AUTOLOAD) {
    if (doc.readyState !== 'loading') throw new Error('pixeldeck.js must be loaded by a plain <script src> (no defer/async)');
    for (var i = 0; i < PD.MANIFEST.length; i++)
      doc.write('<script src="' + PD.base + PD.MANIFEST[i][0] + '.js"><\/script>');
  }
})(window);
