/* engine/core/compile.js — DeckSource → CompiledDeck (spec §4.2, §4.3): template expansion, theme, worlds, scene keys.
 *
 *   PD.compile(deck?: string | DeckSource, opts?: { themePatch?, assetsDeckId? }) → CompiledDeck
 *     deck: a PD.deck id (default: the only registered deck) or a DeckSource object (the Studio's).
 *   PD.compileScene(compiled, index, source) → a NEW CompiledDeck with scene `index` (0..length; length appends)
 *     compiled from `source`; every other scene object is reused by reference.
 *   CompiledDeck = { id, meta, source, theme, themeKey, worlds, scenes, sceneKeys, errors,
 *                    assetsDeckId }   (assetsDeckId is additive: the PD.assets id
 *                    the deck's assets are read from; opts.assetsDeckId, else the deck id)
 *
 * Raw scenes (no `template` key) are passed BY REFERENCE, never cloned: Stage caches glyph bitmaps and particle
 * targets by spec identity. Template scenes are expanded once per compile: props normalized (below), T.expand(props,
 * env), `overrides` deep-merged (arrays replace, null deletes; the expansion itself is never mutated), then id, notes,
 * dwell, beat, energy, point, lint and flashback copied from the source scene (when set), like = the template id, and
 * stepNotes[k] / stepDwell[k] mapped onto steps[k].notes / .dwell. An unknown template, or an expand that throws, gives
 * an error card { id, world: {}, text: [{ str: '⚠ ' + msg, style: 'caption' }] } and an Issue in `errors`
 * (template.unknown / template.expand-failed; a scene that is not an object: scene.invalid). The deck never crashes.
 *
 * Prop normalization (WP4 templates rely on it): for every key of T.props (a map of prop specs):
 *   - a missing prop (undefined) takes props[k].default when the spec has one, else (optional props only) T.example[k];
 *   - values are coerced by props[k].type: number ('62' → 62), bool ('true'/'false', 1/0), text/longtext (number →
 *     string), list (a non-array becomes [v]; items coerced by `of`: a type name, a prop spec, or a map of sub-props
 *     normalized the same way, with sub-prop defaults from their `default` only).
 *   Props not in the schema pass through. Values that do not coerce are left for PD.validate to report.
 *
 * Helpers h (the deck factory's second argument) = template env (spec §4.2):
 *   { W, U, col, CX, CY, DW, DH, theme, shots, shot(name, fallback = 'DRIFT'), role(name), hasWorld(name), hasParam(name),
 *     measure(str, style, size?) → { w, h, lines }, fit(str, style, preferredSize, maxW) → size,
 *     asset(id) → AssetSource | null }   (asset is additive: the deck's registered asset source, e.g. its w and h)
 *   hasWorld: listed in the deck's worlds AND registered; hasParam: owned by such a world. shot() returns a copy.
 *
 * The theme of a deck: resolve(meta.theme, meta.themePatch deep-merged with opts.themePatch). A deck that names no
 * theme uses the registered theme whose id equals the deck id (a deck folder's own theme.js), else the page's only
 * registered theme. A factory deck is run ONCE per page and theme key (its DeckSource is cached; the last 4 theme keys
 * per deck), so every compile of it shares the same raw scene objects. Its helpers resolve the theme lazily: one used inside the factory before
 * meta.theme is known binds the deck-id / only-theme default, and the factory's meta must then agree with it.
 * Compile allocates no texture and draws no random number; only measure/fit touch the DOM (a measuring canvas). */
PD.module('core/compile', ['core/util', 'core/theme', 'core/text'], function (PD, util, themeMod, text) {
  var U = util.U, DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, colFor = util.colFor, hash = themeMod.hash;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function typeOf(v) { return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v; }
  function cloneData(v) {          // plain objects and arrays are copied; anything else (functions…) by reference
    if (Array.isArray(v)) return v.map(cloneData);
    if (!isObj(v)) return v;
    var o = {};
    for (var k in v) if (has(v, k) && k !== '__proto__') o[k] = cloneData(v[k]);
    return o;
  }
  function W() { var o = {}; for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) o[k] = arguments[i][k]; return o; }

  /* ---------------------------------------------------------- themes */
  var themeCache = [];             // [{ k, theme }], most recent last; a resolved theme is reused for the same id + patch
  function themeFor(id, patch) {
    var k = id + '\u0000' + (patch == null ? '' : JSON.stringify(patch));
    for (var i = 0; i < themeCache.length; i++) if (themeCache[i].k === k) return themeCache[i].theme;
    var t = PD.theme.resolve(id, patch == null ? undefined : patch);
    themeCache.push({ k: k, theme: t });
    if (themeCache.length > 8) themeCache.shift();
    return t;
  }
  function joinPatch(a, b) {       // deep-merge two theme patches; null is KEPT (it is a delete for resolve)
    if (a == null) return b == null ? undefined : b;
    if (b == null) return a;
    var out = cloneData(a);
    (function keep(dst, src) {
      for (var k in src) {
        if (!has(src, k) || k === '__proto__') continue;
        if (isObj(src[k]) && isObj(dst[k])) keep(dst[k], src[k]); else dst[k] = cloneData(src[k]);
      }
    })(out, b);
    return out;
  }
  function defaultThemeId(deckId, why) {
    if (typeof deckId === 'string' && PD.theme.has(deckId)) return deckId;
    var ids = PD.theme.list();
    if (ids.length === 1) return ids[0];
    throw new Error('pixeldeck: deck "' + deckId + '" ' + why + ', and ' +
      (ids.length ? ids.length + ' themes are registered (' + ids.join(', ') + ')' : 'no theme is registered') +
      ' with none named "' + deckId + '"; set meta.theme');
  }
  function worldsOf(theme, meta) {   // ['core', ...theme.worlds, ...meta.worlds], de-duplicated, in order
    var out = [];
    ['core'].concat(theme.worlds || [], (meta && meta.worlds) || []).forEach(function (n) {
      if (typeof n === 'string' && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }
  function ownerOf(param) {
    if (typeof PD.world.owner === 'function') return PD.world.owner(param);
    var names = PD.world.list();
    for (var i = 0; i < names.length; i++) { var d = PD.world.get(names[i]); if (d && d.params && has(d.params, param)) return names[i]; }
    return undefined;
  }

  /* ---------------------------------------------------------- helpers (h) = template env
   * ctx = { theme, worlds, assetsDeckId, early?() }: theme/worlds may be bound late (factory decks, see the header). */
  function helpers(ctx) {
    function th() { if (!ctx.theme) ctx.early(); return ctx.theme; }
    var colTheme = null, colFn = null;
    function cf() { var t = th(); if (t !== colTheme) { colTheme = t; colFn = colFor(t.colors || {}); } return colFn; }
    function textEl() {
      var E = PD.element.get('text');
      if (!E || typeof E.measure !== 'function') throw new Error('pixeldeck: measuring text needs the "text" element (engine/core/text.js)');
      return E;
    }
    function measureSpec(str, style, size, unwrapped) {
      var s = { str: String(str), style: style };
      if (size != null) s.size = size;
      if (unwrapped) s.maxWidth = 1e9;
      return textEl().measure(s, { theme: th(), col: cf() });
    }
    var h = {
      W: W, U: U, CX: CX, CY: CY, DW: DW, DH: DH,
      col: function (c) { return cf()(c); },
      shot: function (name, fallback) {
        var s = th().shots || {}, fb = fallback == null ? 'DRIFT' : fallback;
        return W(has(s, name) ? s[name] : has(s, fb) ? s[fb] : {});
      },
      role: function (name) {
        var r = th().roles || {};
        if (!has(r, name)) return undefined;
        return Array.isArray(r[name]) ? r[name].slice() : r[name];
      },
      hasWorld: function (name) { th(); return ctx.worlds.indexOf(name) >= 0 && PD.world.has(name); },
      hasParam: function (name) { th(); var o = ownerOf(name); return o !== undefined && ctx.worlds.indexOf(o) >= 0; },
      measure: function (str, style, size) { var m = measureSpec(str, style, size, false); return { w: m.w, h: m.h, lines: m.lines }; },
      fit: function (str, style, preferredSize, maxW) {
        var pref = +preferredSize;
        if (!(pref > 0) || !(maxW > 0)) return pref;
        var width = function (size) { return measureSpec(str, style, size, true).w; };
        var w0 = width(pref);
        if (w0 <= maxW) return pref;
        var s = Math.floor(pref * maxW / w0);
        while (s + 1 < pref && width(s + 1) <= maxW) s++;     // the LARGEST size that fits (widths are not exactly linear)
        while (s > 1 && width(s) > maxW) s--;
        return Math.max(1, s);
      },
      asset: function (id) { var m = PD.assets.get(ctx.assetsDeckId); return has(m, id) && m[id] != null ? m[id] : null; }
    };
    Object.defineProperty(h, 'theme', { enumerable: true, get: th });
    Object.defineProperty(h, 'shots', { enumerable: true, get: function () { return th().shots || {}; } });
    return h;
  }

  /* ---------------------------------------------------------- template scenes */
  function coerce(v, p) {
    switch (p.type) {
      case 'number': return typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : v;
      case 'bool': return v === 'true' || v === 1 ? true : v === 'false' || v === 0 ? false : v;
      case 'text': case 'longtext': return typeof v === 'number' ? String(v) : v;
      case 'list':
        var arr = Array.isArray(v) ? v.slice() : [v];
        return p.of == null ? arr : arr.map(function (it) { return listItem(it, p.of); });
      default: return v;
    }
  }
  function listItem(it, of) {
    if (it == null) return it;
    if (typeof of === 'string') return coerce(it, { type: of });
    if (isObj(of) && typeof of.type === 'string') return coerce(it, of);
    if (isObj(of) && isObj(it)) return normalizeProps(of, null, it);
    return it;
  }
  function normalizeProps(schema, example, props) {
    var out = {}, k;
    if (isObj(props)) for (k in props) if (has(props, k)) out[k] = props[k];
    if (!isObj(schema)) return out;
    for (k in schema) {
      if (!has(schema, k)) continue;
      var p = isObj(schema[k]) ? schema[k] : {};
      if (out[k] === undefined) {
        if (has(p, 'default')) out[k] = cloneData(p['default']);
        else if (!p.required && isObj(example) && has(example, k)) out[k] = cloneData(example[k]);
      }
      if (out[k] != null) out[k] = coerce(out[k], p);
    }
    return out;
  }
  function patchData(base, p) {    // copy-on-write deep merge: arrays replace, null deletes; `base` is never mutated
    var out = {}, k;
    for (k in base) if (has(base, k)) out[k] = base[k];
    for (k in p) {
      if (!has(p, k) || k === '__proto__') continue;
      var v = p[k];
      if (v === null) delete out[k];
      else if (isObj(v) && isObj(out[k])) out[k] = patchData(out[k], v);
      else out[k] = cloneData(v);
    }
    return out;
  }
  var META = ['notes', 'dwell', 'beat', 'energy', 'point', 'lint', 'flashback'];
  function card(id, msg) { return { id: id, world: {}, text: [{ str: '⚠ ' + msg, style: 'caption' }] }; }
  function issue(code, i, id, msg) { return { level: 'error', code: code, scene: i, sceneId: id == null ? '' : String(id), msg: msg }; }

  function compileOne(src, i, h, errors) {
    var msg;
    if (!isObj(src)) {
      msg = 'scene ' + (i + 1) + ' is not a scene object (' + typeOf(src) + ')';
      errors.push(issue('scene.invalid', i, '', msg));
      return card('scene-' + (i + 1), msg);
    }
    if (src.template === undefined) return src;                       // raw scene: by reference
    var id = src.id, T = PD.template.get(src.template);
    if (!T) {
      msg = 'unknown template "' + src.template + '"';
      errors.push(issue('template.unknown', i, id, msg));
      return card(id, msg);
    }
    try {
      var props = normalizeProps(T.props, T.example, src.props);
      var raw = T.expand(props, h);
      if (!isObj(raw)) throw new Error('expand returned ' + typeOf(raw) + ', not a scene object');
      var sc = src.overrides != null ? patchData(raw, isObj(src.overrides) ? src.overrides : {}) : W(raw);
      sc.id = id;
      META.forEach(function (k) { if (src[k] !== undefined) sc[k] = src[k]; });
      sc.like = src.template;
      var sn = Array.isArray(src.stepNotes) ? src.stepNotes : [], sd = Array.isArray(src.stepDwell) ? src.stepDwell : [];
      if ((sn.length || sd.length) && Array.isArray(sc.steps)) {
        sc.steps = sc.steps.map(function (st, k) {
          if (sn[k] == null && sd[k] == null) return st;
          var c = W(st);
          if (sn[k] != null) c.notes = sn[k];
          if (sd[k] != null) c.dwell = sd[k];
          return c;
        });
      }
      return sc;
    } catch (e) {
      msg = 'template "' + src.template + '" failed: ' + (e && e.message ? e.message : String(e));
      errors.push(issue('template.expand-failed', i, id, msg));
      return card(id, msg);
    }
  }

  /* stable content hash of a compiled scene: keys sorted, functions by toString, cycles cut */
  function stable(v, stack) {
    var t = typeof v;
    if (v === null) return 'null';
    if (t === 'function') return 'f' + JSON.stringify(Function.prototype.toString.call(v));
    if (t === 'number') return 'n' + String(v);
    if (t === 'string') return JSON.stringify(v);
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'undefined') return 'u';
    if (t !== 'object') return t;
    if (stack.indexOf(v) >= 0) return '[cycle]';
    stack.push(v);
    var s;
    if (Array.isArray(v)) s = '[' + v.map(function (x) { return stable(x, stack); }).join(',') + ']';
    else s = '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k], stack); }).join(',') + '}';
    stack.pop();
    return s;
  }
  function sceneKey(scene) { return hash(stable(scene, [])); }

  /* ---------------------------------------------------------- decks */
  var made = {};                   // deck id → [{ def, source, h, ctx }], most recent last, at most 4 (one per theme key)

  function materialize(deckId, def, opts) {
    var aid = opts.assetsDeckId || deckId, list = has(made, deckId) ? made[deckId] : (made[deckId] = []);
    for (var i = list.length - 1; i >= 0; i--) {   // a factory runs once per page, theme key and assets id
      var c = list[i];
      if (c.def !== def || c.ctx.assetsDeckId !== aid) continue;
      var again = themeFor(c.source.meta.theme, joinPatch(c.source.meta.themePatch, opts.themePatch));
      if (again.key === c.ctx.theme.key) return c;
    }
    var ctx = { theme: null, worlds: null, assetsDeckId: aid, earlyId: null };
    ctx.early = function () {
      var id = defaultThemeId(deckId, 'uses a theme helper inside its factory before its meta.theme is known');
      ctx.theme = themeFor(id, opts.themePatch); ctx.worlds = worldsOf(ctx.theme, null); ctx.earlyId = id;
    };
    var h = helpers(ctx), out = def(PD, h), source;
    if (Array.isArray(out)) source = { format: 2, id: deckId, meta: {}, scenes: out };
    else if (isObj(out) && Array.isArray(out.scenes)) {
      source = out;
      if (source.format == null) source.format = 2;
      if (source.id == null) source.id = deckId;
      if (!isObj(source.meta)) source.meta = {};
    } else throw new Error('pixeldeck: deck "' + deckId + '": its factory must return a DeckSource { meta, scenes: [] } or an array of scenes, not ' + typeOf(out));
    if (source.id !== deckId) throw new Error('pixeldeck: deck "' + deckId + '" says its id is "' + source.id + '"');
    var meta = source.meta;
    if (meta.theme == null) meta.theme = ctx.earlyId || defaultThemeId(deckId, 'names no theme (meta.theme)');
    if (meta.title == null) meta.title = deckId;
    var t = themeFor(meta.theme, joinPatch(meta.themePatch, opts.themePatch));
    if (ctx.theme && ctx.theme.key !== t.key)
      throw new Error('pixeldeck: deck "' + deckId + '": its factory used theme "' + ctx.earlyId + '" through h before meta.theme ("' +
        meta.theme + '") was known; register the theme under the deck id, or do not use theme helpers while building meta');
    ctx.theme = t; ctx.worlds = worldsOf(t, meta);
    var entry = { def: def, source: source, h: h, ctx: ctx };
    list.push(entry);
    if (list.length > 4) list.shift();
    return entry;
  }

  function compile(deck, opts) {
    opts = opts || {};
    var def, deckId;
    if (deck == null) {
      var ids = PD.deck.list();
      if (ids.length !== 1) throw new Error('pixeldeck: PD.compile() needs a deck id: ' + (ids.length ? ids.length + ' decks are registered (' + ids.join(', ') + ')' : 'no deck is registered'));
      deck = ids[0];
    }
    if (typeof deck === 'string') {
      deckId = deck; def = PD.deck.get(deck);
      if (def === undefined) throw new Error('pixeldeck: no deck "' + deck + '" (load its deck.js)');
    } else if (isObj(deck)) { def = deck; deckId = deck.id; }
    else throw new Error('pixeldeck: PD.compile needs a deck id or a DeckSource, not ' + typeOf(deck));
    if (typeof deckId !== 'string' || !deckId) throw new Error('pixeldeck: a DeckSource needs an id');

    var source, h, ctx;
    if (typeof def === 'function') {
      var m = materialize(deckId, def, opts);
      source = m.source; h = m.h; ctx = m.ctx;
    } else {
      if (!isObj(def) || !Array.isArray(def.scenes)) throw new Error('pixeldeck: deck "' + deckId + '" must be a DeckSource { meta, scenes: [] }');
      if (def.id != null && def.id !== deckId) throw new Error('pixeldeck: deck "' + deckId + '" says its id is "' + def.id + '"');
      source = def;
      var meta = isObj(def.meta) ? def.meta : {};
      var t = themeFor(meta.theme != null ? meta.theme : defaultThemeId(deckId, 'names no theme (meta.theme)'), joinPatch(meta.themePatch, opts.themePatch));
      ctx = { theme: t, worlds: worldsOf(t, meta), assetsDeckId: opts.assetsDeckId || deckId };
      h = helpers(ctx);
    }
    var errors = [], scenes = [], keys = [];
    for (var i = 0; i < source.scenes.length; i++) {
      var sc = compileOne(source.scenes[i], i, h, errors);
      scenes.push(sc); keys.push(sceneKey(sc));
    }
    return {
      id: deckId, meta: isObj(source.meta) ? source.meta : {}, source: source,
      theme: ctx.theme, themeKey: ctx.theme.key, worlds: ctx.worlds.slice(),
      scenes: scenes, sceneKeys: keys, errors: errors,
      assetsDeckId: ctx.assetsDeckId
    };
  }

  function envFor(compiled) {      // the helpers / template env of a compiled deck
    return helpers({ theme: compiled.theme, worlds: compiled.worlds.slice(), assetsDeckId: compiled.assetsDeckId || compiled.id });
  }

  function compileScene(compiled, index, src) {
    if (!compiled || !Array.isArray(compiled.scenes) || !compiled.theme) throw new Error('pixeldeck: PD.compileScene needs a CompiledDeck');
    if (index !== (index | 0) || index < 0 || index > compiled.scenes.length)
      throw new Error('pixeldeck: PD.compileScene index ' + index + ' is outside 0..' + compiled.scenes.length);
    var errs = [], sc = compileOne(src, index, envFor(compiled), errs), out = {}, k;
    for (k in compiled) if (has(compiled, k)) out[k] = compiled[k];
    out.scenes = compiled.scenes.slice(); out.scenes[index] = sc;
    out.sceneKeys = compiled.sceneKeys.slice(); out.sceneKeys[index] = sceneKey(sc);
    out.errors = compiled.errors.filter(function (e) { return e.scene !== index; }).concat(errs)
      .sort(function (a, b) { return a.scene - b.scene; });
    var s = {};
    for (k in compiled.source) if (has(compiled.source, k)) s[k] = compiled.source[k];
    s.scenes = compiled.source.scenes.slice(); s.scenes[index] = src;
    out.source = s;
    return out;
  }

  PD.compile = compile;
  PD.compileScene = compileScene;
  return { compile: compile, compileScene: compileScene, helpers: envFor, sceneKey: sceneKey, normalizeProps: normalizeProps };
});
