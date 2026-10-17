/* engine/core/theme.js — theme resolution (spec §4.4): PD.theme.resolve(id, patch?) → ResolvedTheme. */
PD.module('core/theme', [], function (PD) {
  /* A theme is values only, registered with PD.theme(id, ThemeSource | function (PD) → ThemeSource).
   * resolve(id, patch):
   *   1. chain   = the `extends` chain, root first, ending with id (unknown parents and cycles throw);
   *   2. merge   = deep merge root → leaf, then the patch. Plain objects merge key by key (so `styles` merge
   *                per style key); arrays and other values replace; null deletes the key. `extends` is dropped;
   *   3. roles   = every string '@name' inside `styles` becomes a copy of roles[name] (unknown roles throw);
   *   4. check   = the sections the engine reads must exist (see REQUIRED);
   *   5. key     = a hash of the JSON of the values; then { id, chain, key } are added and the whole tree is
   *                deep-frozen. The registered sources are never mutated or frozen (everything is copied).
   * Resolution allocates no texture, touches no DOM and draws no random number. */
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (!isObj(v)) return v;
    var o = {};
    for (var k in v) if (has(v, k) && k !== '__proto__') o[k] = clone(v[k]);
    return o;
  }
  function merge(dst, src, skip) {
    for (var k in src) {
      if (!has(src, k) || k === '__proto__' || (skip && skip[k])) continue;
      var v = src[k];
      if (v === null) delete dst[k];
      else if (isObj(v) && has(dst, k) && isObj(dst[k])) merge(dst[k], v);
      else dst[k] = clone(v);
    }
    return dst;
  }
  function freeze(v) {
    if (Array.isArray(v) || isObj(v)) { for (var k in v) if (has(v, k)) freeze(v[k]); Object.freeze(v); }
    return v;
  }
  // 64-bit string hash (two 32-bit multiply-xor lanes), as 16 hex digits.
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    var hex = function (x) { return ('0000000' + (x >>> 0).toString(16)).slice(-8); };
    return hex(h2) + hex(h1);
  }

  // The sections and keys the engine reads (Stage.enter, TextLayer, Space); a theme must define them all.
  var REQUIRED = {
    label: 'string', worlds: 'array', fonts: { display: 'string' }, colors: 'object', styles: 'object', world: 'object',
    motion: { ease: 'string', dur: 'number', spread: 'number', arc: 'number', stagger: 'string', entry: 'string', exit: 'string' },
    timing: { worldTime: 'number', worldEase: 'string', settledWorldTime: 'number', textDelay: 'number', stepTextDelay: 'number',
              settledTextDelay: 'number', settledDurMax: 'number', settledSpreadMax: 'number', preludeTime: 'number' },
    ui: { accent: 'string' }
  };
  function typeOf(v) { return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v; }
  function check(id, o, req, path) {
    for (var k in req) {
      var want = req[k], p = path ? path + '.' + k : k, v = has(o, k) ? o[k] : undefined;
      if (typeof want === 'string') {
        if (typeOf(v) !== want) throw new Error('pixeldeck: theme "' + id + '" needs ' + p + ' (' + want + ')' + (v === undefined ? '' : ', got ' + typeOf(v)));
      } else {
        if (!isObj(v)) throw new Error('pixeldeck: theme "' + id + '" needs ' + p + ' (object)');
        check(id, v, want, p);
      }
    }
  }

  var sources = Object.create(null); // id → ThemeSource (factories are called once, on first resolve)
  function source(id) {
    if (has(sources, id)) return sources[id];
    var def = PD.theme.get(id);
    if (def === undefined) throw new Error('pixeldeck: no theme "' + id + '"');
    var src = typeof def === 'function' ? def(PD) : def;
    if (!isObj(src)) throw new Error('pixeldeck: theme "' + id + '" is not an object' + (typeof def === 'function' ? ' (its factory returned ' + typeOf(src) + ')' : ''));
    return (sources[id] = src);
  }

  function substRoles(id, v, roles, path) {
    if (typeof v === 'string' && v.charAt(0) === '@') {
      var name = v.slice(1);
      if (!has(roles, name)) throw new Error('pixeldeck: theme "' + id + '" ' + path + ' uses unknown role "' + v + '"');
      return clone(roles[name]);
    }
    if (Array.isArray(v)) return v.map(function (x, i) { return substRoles(id, x, roles, path + '[' + i + ']'); });
    if (isObj(v)) for (var k in v) if (has(v, k)) v[k] = substRoles(id, v[k], roles, path + '.' + k);
    return v;
  }

  var SKIP_SOURCE = { 'extends': 1 }, SKIP_PATCH = { 'extends': 1, id: 1, chain: 1, key: 1 };
  function resolve(id, patch) {
    if (typeof id !== 'string') throw new Error('pixeldeck: PD.theme.resolve needs a theme id (string)');
    var chain = [], seen = Object.create(null), cur = id;
    while (cur !== undefined) {
      if (has(seen, cur)) throw new Error('pixeldeck: theme "' + id + '" has an extends cycle (' + chain.concat(cur).join(' → ') + ')');
      seen[cur] = 1; chain.push(cur);
      var src = source(cur), parent = has(src, 'extends') ? src['extends'] : undefined;
      if (parent !== undefined && (typeof parent !== 'string' || !PD.theme.has(parent)))
        throw new Error('pixeldeck: theme "' + cur + '" extends unknown theme "' + parent + '"');
      cur = parent;
    }
    chain.reverse();
    var out = {};
    for (var i = 0; i < chain.length; i++) merge(out, sources[chain[i]], SKIP_SOURCE);
    if (patch != null) {
      if (!isObj(patch)) throw new Error('pixeldeck: theme patch for "' + id + '" must be an object');
      merge(out, patch, SKIP_PATCH);
    }
    var roles = isObj(out.roles) ? out.roles : {};
    if (isObj(out.styles)) substRoles(id, out.styles, roles, 'styles');
    check(id, out, REQUIRED, '');
    var key = hash(JSON.stringify(out));
    out.id = id; out.chain = chain; out.key = key;
    return freeze(out);
  }

  PD.theme.resolve = resolve;

  return { resolve: resolve, hash: hash };
});
