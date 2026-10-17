/* studio/import.js — files coming in: pictures, fonts and saved presentations (spec §7.5, §3.6, WP6).
 *
 *   PD.studio.files = {
 *     classify(file) → { kind: 'image' | 'font' | 'html' | 'unsupported', ext, message? }
 *         images  .png .jpg .jpeg .webp .svg     fonts  .woff2 .woff .ttf .otf     presentations  .html .htm
 *         .heic .heif .pdf and video/* are 'unsupported' with message = the assets.heic text; anything else gets
 *         "Can't use this file type."
 *     processImage(file) → Promise<{ type: 'image', src, w, h, name, bytes, alpha, mime }>
 *         createImageBitmap(file) (blob sources never taint), long edge at most 2400 px, a PNG when any pixel is not
 *         fully opaque, else a JPEG at quality 0.85. SVG: the viewBox is read from the file text and the picture is
 *         rasterized 2400 px wide (never the 300 x 75 natural size), aspect preserved.
 *     processFont(file) → Promise<{ type: 'font', src, family, weight, style, name, bytes, mime }>
 *         verified with new FontFace(tmp, buf).load(); a font that will not load rejects with the "using the theme font" text.
 *         The family name defaults from the file name; weight is '100 900' so one dropped face serves every weight.
 *     process(file) → Promise<{ ok: true, kind, asset } | { ok: false, kind, message }>      never rejects
 *     assetId(fileName, taken) → string        slug of the file name without its extension, made unique with -2, -3 …
 *     recordOf(asset, hash) → IndexedDB record, sourceOf(record) → AssetSource      (a record carries mime)
 *     bytesOf(dataUrl) → number
 *     readPresentation(file) → Promise<{ id, title, deck, assets }>     opens a saved .html: finds the two marker pairs and
 *         parses the JSON between them (PD.exportHTML.parse); the file is never executed. Rejects with a plain-language
 *         message for a hand-written deck and for a file that is not a pixeldeck presentation.
 *     MAX_EDGE (2400), BIG_IMAGE (4 MB), BIG_TOTAL (20 MB)
 *   }
 * The module's own exports are the intake the storyboard's assets panel looks for (PD.get('studio/import')):
 *   addFiles(files, { deckId? }) → Promise<{ added: [{ id, hash, kind, asset }], rejected: [{ name, msg, message }], warnings }>
 *       process each file, store its record in IndexedDB by content hash, remember it for undo and reopen, and register it with
 *       PD.assets.put(deckId, id, source). It does NOT touch the project: the caller commits project.assets[id] = hash
 *       (store.addFiles does both in one step). importFiles is the same function.
 * Registration defines functions only: no DOM, no storage. */
PD.module('studio/import', ['studio/persist', 'core/export', 'story/copy'], function (PD, persist, exportMod, copy) {
  var S = PD.studio;
  var MAX_EDGE = 2400, BIG_IMAGE = 4 * 1024 * 1024, BIG_TOTAL = 20 * 1024 * 1024;
  var IMAGE_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
  var FONT_EXT = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
  var HEIC_EXT = { heic: 1, heif: 1, pdf: 1 };

  function mimeOf(src) { var m = /^data:([^;,]+)/.exec(src || ''); return m ? m[1] : ''; }
  function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function stem(name) { return String(name || 'asset').replace(/\.[A-Za-z0-9]+$/, ''); }

  function classify(file) {
    var ext = extOf(file && file.name), type = file && file.type || '';
    if (HEIC_EXT[ext] || /^video\//.test(type) || /^image\/hei[cf]$/.test(type) || type === 'application/pdf')
      return { kind: 'unsupported', ext: ext || type.split('/').pop(), message: copy.say('assets.heic', { ext: ext || type.split('/').pop() }) };
    if (IMAGE_EXT[ext]) return { kind: 'image', ext: ext };
    if (FONT_EXT[ext]) return { kind: 'font', ext: ext };
    if (ext === 'html' || ext === 'htm' || type === 'text/html') return { kind: 'html', ext: ext || 'html' };
    return { kind: 'unsupported', ext: ext, message: "Can't use this file type." };
  }

  function bytesOf(src) {
    var comma = src.indexOf(',');
    if (comma < 0) return 0;
    var body = src.length - comma - 1, pad = src.slice(-2) === '==' ? 2 : src.slice(-1) === '=' ? 1 : 0;
    return Math.max(0, Math.floor(body * 3 / 4) - pad);
  }
  function b64(buf) {
    var u8 = new Uint8Array(buf), s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function utf8b64(text) { return b64(new TextEncoder().encode(text).buffer); }

  /* ---------------------------------------------------------- pictures */
  function hasAlpha(canvas) {
    var w = canvas.width, h = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true }), band = 128;
    for (var y = 0; y < h; y += band) {
      var d = ctx.getImageData(0, y, w, Math.min(band, h - y)).data;
      for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    }
    return false;
  }
  function encode(canvas) {
    var alpha = hasAlpha(canvas), mime = alpha ? 'image/png' : 'image/jpeg';
    var src = alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
    return { src: src, alpha: alpha, mime: mime };
  }
  function fitSize(w, h) {
    var s = Math.min(1, MAX_EDGE / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : NaN; }

  // the aspect and the text to rasterize for an SVG: explicit pixel size set on the root, so the natural size is never used
  function svgPrepare(text) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length)
      throw new Error("Couldn't read this SVG.");
    var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(num), vw = NaN, vh = NaN;
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { vw = vb[2]; vh = vb[3]; }
    else {
      var aw = num(root.getAttribute('width')), ah = num(root.getAttribute('height'));
      if (aw > 0 && ah > 0 && !/%/.test(root.getAttribute('width') + root.getAttribute('height'))) {
        vw = aw; vh = ah;
        root.setAttribute('viewBox', '0 0 ' + aw + ' ' + ah);
      }
    }
    var aspect = vw > 0 && vh > 0 ? vw / vh : 2;
    var w = MAX_EDGE, h = Math.round(MAX_EDGE / aspect);
    if (h > MAX_EDGE) { h = MAX_EDGE; w = Math.round(MAX_EDGE * aspect); }
    w = Math.max(1, w); h = Math.max(1, h);
    root.setAttribute('width', String(w));
    root.setAttribute('height', String(h));
    if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return { text: new XMLSerializer().serializeToString(root), w: w, h: h };
  }
  function rasterizeSvg(file) {
    return file.text().then(function (text) {
      var p = svgPrepare(text);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("Couldn't read this SVG.")); };
        img.src = 'data:image/svg+xml;base64,' + utf8b64(p.text);
      }).then(function (img) {
        var cv = document.createElement('canvas');
        cv.width = p.w; cv.height = p.h;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, p.w, p.h);
        return cv;
      });
    });
  }
  function rasterize(file) {
    return createImageBitmap(file).then(function (bmp) {
      var size = fitSize(bmp.width, bmp.height), cv = document.createElement('canvas');
      cv.width = size.w; cv.height = size.h;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, size.w, size.h);
      if (bmp.close) bmp.close();
      return cv;
    });
  }
  function processImage(file) {
    var isSvg = extOf(file.name) === 'svg' || file.type === 'image/svg+xml';
    return (isSvg ? rasterizeSvg(file) : rasterize(file)).then(function (cv) {
      var e = encode(cv);
      var out = { type: 'image', src: e.src, w: cv.width, h: cv.height, name: file.name, bytes: bytesOf(e.src), alpha: e.alpha, mime: e.mime };
      cv.width = 0; cv.height = 0;
      return out;
    }, function (err) {
      throw new Error(isSvg ? "Couldn't read this SVG." : "Couldn't read this picture. Try PNG or JPEG.");
    });
  }

  /* ---------------------------------------------------------- fonts */
  function familyFrom(name) {
    var f = stem(name).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return f || 'Brand font';
  }
  var tmpCount = 0;
  function processFont(file) {
    var ext = extOf(file.name);
    return file.arrayBuffer().then(function (buf) {
      var FF = window.FontFace;
      if (typeof FF !== 'function') throw new Error('no FontFace');
      return new FF('pdcheck-' + (++tmpCount), buf).load().then(function () {
        var src = 'data:' + (FONT_EXT[ext] || 'font/ttf') + ';base64,' + b64(buf);
        return { type: 'font', src: src, family: familyFrom(file.name), weight: '100 900', style: 'normal', name: file.name, bytes: buf.byteLength, mime: FONT_EXT[ext] || 'font/ttf' };
      });
    }).then(function (a) { return a; }, function () {
      throw new Error("Couldn't read this font; using the theme font.");
    });
  }

  function process(file) {
    var c = classify(file);
    if (c.kind === 'unsupported') return Promise.resolve({ ok: false, kind: c.kind, message: c.message });
    if (c.kind === 'html') return Promise.resolve({ ok: false, kind: 'html', message: 'That is a presentation. Use "Open a saved deck" on the first screen.' });
    var job = c.kind === 'image' ? processImage(file) : processFont(file);
    return job.then(function (asset) { return { ok: true, kind: c.kind, asset: asset }; },
      function (e) { return { ok: false, kind: c.kind, message: e && e.message ? e.message : "Can't use this file." }; });
  }

  function assetId(fileName, taken) {
    var base = persist.slug(stem(fileName), 40) || 'asset', id = base, n = 2;
    var list = taken || {};
    while (Object.prototype.hasOwnProperty.call(list, id)) id = base + '-' + (n++);
    return id;
  }
  function recordOf(a, hash) {
    var r = { hash: hash, type: a.type, name: a.name, mime: a.mime || '', src: a.src, w: a.w, h: a.h, bytes: a.bytes };
    if (a.type === 'font') { r.family = a.family; r.weight = a.weight; r.style = a.style; }
    if (a.type === 'image') r.alpha = !!a.alpha;
    return r;
  }
  function sourceOf(r) {
    if (r.type === 'font') {
      var f = { type: 'font', src: r.src, family: r.family, name: r.name, bytes: r.bytes };
      if (r.weight != null) f.weight = r.weight;
      if (r.style != null) f.style = r.style;
      return f;
    }
    var a = { type: r.type, src: r.src, w: r.w, h: r.h, name: r.name, bytes: r.bytes };
    if (r.alpha != null) a.alpha = !!r.alpha;
    return a;
  }

  /* ---------------------------------------------------------- a saved presentation */
  function readPresentation(file) {
    return file.text().then(function (html) {
      var res;
      try { res = exportMod.parse(html); }
      catch (e) {
        if (/not a pixeldeck presentation/.test(String(e && e.message))) throw new Error("That file isn't a pixeldeck presentation. Open a deck you saved from the Studio.");
        throw new Error("Couldn't read this deck: " + (e && e.message ? String(e.message).replace(/^pixeldeck: PD\.exportHTML: /, '') : 'the file is damaged') + '.');
      }
      if (res.handWritten || !res.deck) throw new Error('This deck was written by hand. Open it in a code editor.');
      return { id: res.id || res.deck.id, title: res.title, deck: res.deck, assets: res.assets || {} };
    });
  }

  /* ---------------------------------------------------------- intake: files in, assets registered (the caller commits) */
  function addFiles(list, opts) {
    opts = opts || {};
    var st = S.store, p = st && st.get(), deckId = opts.deckId || (p && p.deck.id);
    var arr = Array.prototype.slice.call(list || []), out = { added: [], rejected: [], warnings: [] };
    if (!deckId) {
      out.rejected = arr.map(function (f) { return { name: f.name, msg: 'Open or start a deck first.', message: 'Open or start a deck first.' }; });
      return Promise.resolve(out);
    }
    var taken = {}, reg = PD.assets.get(deckId), k;
    for (k in reg) if (Object.prototype.hasOwnProperty.call(reg, k)) taken[k] = 1;
    if (p && p.deck.id === deckId) for (k in p.assets) if (Object.prototype.hasOwnProperty.call(p.assets, k)) taken[k] = 1;
    var chain = Promise.resolve();
    arr.forEach(function (file) {
      chain = chain.then(function () {
        return process(file).then(function (res) {
          if (!res.ok) { out.rejected.push({ name: file.name, msg: res.message, message: res.message }); return null; }
          return persist.sha256(res.asset.src).then(function (hash) {
            var rec = recordOf(res.asset, hash), id = assetId(file.name, taken);
            taken[id] = 1;
            if (st && st.cacheRecords) { var m = {}; m[hash] = rec; st.cacheRecords(m); }
            return persist.assets.put(rec).then(function (stored) {
              if (!stored) out.warnings.push({ kind: 'not-stored', id: id, msg: "This browser won't keep pictures between visits. Save to a file to keep them." });
              var source = sourceOf(rec);
              PD.assets.put(deckId, id, source);
              out.added.push({ id: id, hash: hash, kind: res.kind, asset: source });
            });
          });
        });
      });
    });
    return chain.then(function () { return out; });
  }

  var api = {
    classify: classify, processImage: processImage, processFont: processFont, process: process, assetId: assetId,
    recordOf: recordOf, sourceOf: sourceOf, bytesOf: bytesOf, readPresentation: readPresentation, familyFrom: familyFrom,
    addFiles: addFiles, importFiles: addFiles, mimeOf: mimeOf,
    MAX_EDGE: MAX_EDGE, BIG_IMAGE: BIG_IMAGE, BIG_TOTAL: BIG_TOTAL
  };
  S.files = api;
  return api;
}, { export: false });
