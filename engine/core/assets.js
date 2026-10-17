/* engine/core/assets.js — asset runtime (spec §4.8): decode embedded images, load embedded fonts, ready().
 * The kernel keeps the asset SOURCES (PD.assets(deckId, map), .get, .put, .remove; values only, data: URLs only).
 * This module adds the runtime side:
 *   PD.assets.ready(deckId, opts?) → Promise<{ loaded: string[], failed: { id, reason }[] }>    NEVER rejects
 *     opts.timeoutMs (3000): after that, items still loading are marked 'timeout' and the promise resolves.
 *     opts.fontFaces (optional, additive): a theme's fontFaces [{ family, asset, weight?, style? }]; each one
 *       registers that font asset's bytes once more under the theme's family name.
 *   PD.asset(deckId, id) → RuntimeAsset | null
 *     RuntimeAsset = { id, type, src, w, h, ok, error?: 'not-embedded'|'decode'|'timeout', img?, face? }
 *     null when ready() has not seen that asset, or its source has changed or gone since.
 * Loading: images → new Image(), src, img.decode(); fonts → base64 → ArrayBuffer → new FontFace(family, buf,
 * { weight, style }).load() → document.fonts.add. Each item is caught on its own. A src that does not start with
 * 'data:' is never loaded (ok:false, error:'not-embedded'), so a canvas can never be tainted by an asset.
 * Runtime entries are cached per deck and source: calling ready() again only loads what is new or changed.
 * Registration only defines functions: no DOM, no texture, no random number. */
PD.module('core/assets', [], function (PD) {
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var runtime = {};                // deckId → { assetId → RuntimeAsset (+ internal: _src, _key, _wait) }
  var faces = {};                  // 'deckId|assetId|family|weight|style' → settled promise (extra theme fontFaces)
  var KEY = ['type', 'src', 'w', 'h', 'family', 'weight', 'style'];

  function keyOf(srcObj) {         // what makes a cached runtime entry stale: any of these source fields changing
    var k = '';
    for (var i = 0; i < KEY.length; i++) k += '|' + (srcObj[KEY[i]] == null ? '' : srcObj[KEY[i]]);
    return k;
  }
  function isData(src) { return typeof src === 'string' && src.slice(0, 5) === 'data:'; }

  function bytesOf(src) {          // data: URL → ArrayBuffer (base64 or percent-encoded)
    var comma = src.indexOf(',');
    if (comma < 0) throw new Error('bad data: URL');
    var head = src.slice(5, comma), body = src.slice(comma + 1);
    var bin = /;base64$/i.test(head) ? atob(body) : decodeURIComponent(body);
    var buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i) & 255;
    return buf;
  }

  function loadImage(r, srcObj) {
    var img = new Image();
    r.img = img;
    var done = new Promise(function (resolve, reject) {
      if (typeof img.decode === 'function') {
        img.src = srcObj.src;
        img.decode().then(resolve, reject);
      } else {
        img.onload = function () { resolve(); };
        img.onerror = function () { reject(new Error('decode')); };
        img.src = srcObj.src;
      }
    });
    return done.then(function () {
      r.w = srcObj.w || img.naturalWidth; r.h = srcObj.h || img.naturalHeight;
    });
  }

  function addFace(family, buf, srcObj) {
    var FF = window.FontFace;
    if (typeof FF !== 'function') return Promise.reject(new Error('FontFace is not available'));
    var desc = {};
    if (srcObj.weight != null) desc.weight = String(srcObj.weight);
    if (srcObj.style != null) desc.style = String(srcObj.style);
    var face = new FF(family, buf, desc);
    return Promise.resolve(face.load()).then(function (f) {
      try { if (document.fonts && document.fonts.add) document.fonts.add(f || face); } catch (e) { }
      return f || face;
    });
  }

  function loadFont(r, srcObj) {
    return Promise.resolve().then(function () {
      return addFace(srcObj.family || r.id, bytesOf(srcObj.src), srcObj);
    }).then(function (face) { r.face = face; });
  }

  // Start (or reuse) the runtime entry for one asset; returns a promise that settles when it is finished.
  function entry(deckId, id, srcObj) {
    var map = runtime[deckId] || (runtime[deckId] = {});
    var key = srcObj && typeof srcObj === 'object' ? keyOf(srcObj) : 'invalid';
    var r = has(map, id) ? map[id] : null;
    if (r && r._key === key) return r;
    r = { id: id, type: srcObj && srcObj.type, src: srcObj && srcObj.src, w: srcObj && srcObj.w, h: srcObj && srcObj.h, ok: false };
    Object.defineProperty(r, '_key', { value: key });
    map[id] = r;
    var fail = function (why) { if (!r.ok && !r.error) r.error = why; };
    var p;
    if (!srcObj || typeof srcObj !== 'object') { fail('decode'); p = Promise.resolve(); }
    else if (!isData(srcObj.src)) { fail('not-embedded'); p = Promise.resolve(); }
    else if (srcObj.type === 'image') p = loadImage(r, srcObj);
    else if (srcObj.type === 'font') p = loadFont(r, srcObj);
    else p = Promise.reject(new Error('unknown asset type'));
    p = p.then(function () {        // a late success (after a ready() timeout) still makes the asset usable
      if (r.error === 'timeout') delete r.error;
      if (!r.error) r.ok = true;
    }, function () {
      r.ok = false;
      if (!r.error || r.error === 'timeout') r.error = 'decode';
    });
    Object.defineProperty(r, '_wait', { value: p });
    return r;
  }

  function ready(deckId, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs == null ? 3000 : +opts.timeoutMs;
    return new Promise(function (resolve) {
      var list = [], waits = [], finished = false;
      function report() {
        if (finished) return;
        finished = true;
        var out = { loaded: [], failed: [] };
        list.forEach(function (r) {
          if (!r.ok && !r.error) r.error = 'timeout';
          if (r.ok) out.loaded.push(r.id); else out.failed.push({ id: r.id, reason: r.error });
        });
        resolve(out);
      }
      try {
        var map = PD.assets.get(deckId);
        for (var id in map) {
          if (!has(map, id)) continue;
          var r = entry(deckId, id, map[id]);
          list.push(r); waits.push(r._wait);
        }
        (opts.fontFaces || []).forEach(function (ff) {
          if (!ff || !ff.family || !has(map, ff.asset)) return;
          var a = map[ff.asset];
          if (!a || a.type !== 'font' || !isData(a.src)) return;
          var k = deckId + '|' + ff.asset + '|' + ff.family + '|' + (ff.weight || '') + '|' + (ff.style || '') + '|' + keyOf(a);
          if (!has(faces, k)) {
            faces[k] = Promise.resolve().then(function () {
              return addFace(ff.family, bytesOf(a.src), { weight: ff.weight != null ? ff.weight : a.weight, style: ff.style != null ? ff.style : a.style });
            }).then(function () { }, function () { });
          }
          waits.push(faces[k]);
        });
      } catch (e) { /* never reject: whatever started is still reported */ }
      if (!waits.length) return report();
      var timer = setTimeout(report, timeoutMs);
      Promise.all(waits).then(function () { clearTimeout(timer); report(); }, function () { clearTimeout(timer); report(); });
    });
  }

  function asset(deckId, id) {
    var map = runtime[deckId], r = map && has(map, id) ? map[id] : null;
    if (!r) return null;
    var src = PD.assets.get(deckId);
    if (!has(src, id) || !src[id] || typeof src[id] !== 'object' || keyOf(src[id]) !== r._key) return null;
    return r;
  }

  PD.assets.ready = ready;
  PD.asset = asset;
  return { ready: ready, asset: asset };
});
