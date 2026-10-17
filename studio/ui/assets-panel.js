/* studio/ui/assets-panel.js — the assets column of the storyboard workspace (spec §7.5 panel, WP7).
 *
 *   PD.get('studio/ui/assets-panel').create(opts) → Assets
 *     opts = { ctx,                       the screen context { store, PD, ui, nav }
 *              onUse(kind, assetId),      'logo-scene' | 'image-scene' | 'scene-prop' | 'brand-font' | 'brightness' | 'remove'
 *              onChanged(),               files were added: the board refreshes the preview and thumbnails
 *              onToggle(open),            the column was opened or collapsed
 *              open?: bool, readOnly?: bool }
 *   Assets = { el, update({ compiled, selected, readOnly }), setOpen(open), isOpen(), chooser(accept?), addFiles(files) → Promise,
 *              destroy() }
 * Cards show a thumbnail, the size and "Use as…" chips. Files come from the drop zone, the + button or anywhere in the window.
 * The intake pipeline (decode, downscale to 2400 px, PNG or JPEG, SVG at its viewBox, font check) is WP6's studio/import;
 * this panel calls ctx['import'], Studio['import'] or the module 'studio/import' when one answers addFiles(files, { deckId }) →
 * { added: [{ id, hash? }], rejected: [{ name, msg }] }, and otherwise runs the same steps of §7.5 itself. Empty state: three slots
 * (Logo · Photos · Font), each saying what it unlocks. An opaque logo gets "Your logo has a solid background" with
 * [Use brightness mode]; a total above 20 MB gets a banner; one image above 4 MB gets an amber note. */
PD.module('studio/ui/assets-panel', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var MB = 1024 * 1024;

  var CSS = [
    '.as { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; width: 100%; border-radius: 16px; overflow: hidden; background: color-mix(in srgb, var(--pdx-panel) 62%, transparent); border: 1px solid var(--pdx-hair-2); }',
    '.as-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 10px 8px 16px; }',
    '.as-head .sp { flex: 1; }',
    '.as-body { flex: 1; min-height: 0; overflow: auto; padding: 4px 12px 14px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--pdx-line) transparent; }',
    '.as-drop { all: unset; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px; text-align: center; border-radius: 12px; border: 1.5px dashed var(--pdx-line); color: var(--pdx-muted); cursor: pointer; font-size: 12px; line-height: 1.4; transition: border-color .18s, background .18s, color .18s; }',
    '.as-drop:hover, .as-drop:focus-visible { border-color: var(--pdx-accent); color: var(--pdx-text); background: color-mix(in srgb, var(--pdx-accent) 7%, transparent); outline: none; }',
    '.as-drop .pdx-ico { color: var(--pdx-accent); }',
    '.as-slot { all: unset; box-sizing: border-box; display: flex; gap: 12px; padding: 12px; border-radius: 12px; border: 1px dashed var(--pdx-line); cursor: pointer; transition: border-color .18s, background .18s; }',
    '.as-slot:hover, .as-slot:focus-visible { border-color: var(--pdx-accent); background: color-mix(in srgb, var(--pdx-accent) 6%, transparent); outline: none; }',
    '.as-slot .ic { flex: none; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--pdx-well); color: var(--pdx-accent); }',
    '.as-slot b { display: block; font-size: 13px; margin-bottom: 2px; } .as-slot span { font-size: 12px; line-height: 1.4; color: var(--pdx-muted); }',
    '.as-card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; background: color-mix(in srgb, var(--pdx-panel) 80%, transparent); border: 1px solid var(--pdx-hair-2); animation: pdx-in .3s var(--pdx-ease); }',
    '.as-card .top { display: flex; gap: 10px; align-items: center; }',
    '.as-card .th { flex: none; width: 56px; height: 42px; border-radius: 8px; background: #0b0d1a center / contain no-repeat; display: grid; place-items: center; font-size: 22px; color: var(--pdx-text); overflow: hidden; box-shadow: 0 0 0 1px var(--pdx-hair-2) inset; }',
    '.as-card .th.is-chk { background-image: conic-gradient(#1b1e33 25%, #12142a 0 50%, #1b1e33 0 75%, #12142a 0); background-size: 12px 12px; }',
    '.as-card .nm { min-width: 0; flex: 1; } .as-card .nm b { display: block; font-size: 12.5px; font-weight: 620; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.as-card .nm small { display: block; color: var(--pdx-faint); font: 500 11px var(--pdx-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.as-card .chips { display: flex; flex-direction: column; gap: 4px; }',
    '.as-card .chips .pdx-btn { width: 100%; justify-content: flex-start; border-color: var(--pdx-hair-2); color: var(--pdx-muted); height: 30px; }',
    '.as-card .chips .pdx-btn:hover { color: var(--pdx-text); border-color: var(--pdx-line); } .as-card .chips .pdx-btn .pdx-ico { color: var(--pdx-accent); }',
    '.as-card .chips .pdx-btn.is-on { color: var(--pdx-accent); }',
    '.as-card .note { font-size: 11.5px; line-height: 1.45; color: var(--pdx-warn); }',
    '.as-card .note button { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; font-weight: 650; }',
    '.as-foot { flex: none; padding: 10px 16px 14px; border-top: 1px solid var(--pdx-hair-2); font: 500 11.5px var(--pdx-mono); color: var(--pdx-faint); display: flex; gap: 8px; align-items: center; }',
    '.as-foot.is-over { color: var(--pdx-err); }',
    '.as-rail { display: none; flex-direction: column; align-items: center; gap: 6px; padding: 10px 0; }',
    '.as.is-rail .as-head, .as.is-rail .as-body, .as.is-rail .as-foot { display: none; } .as.is-rail .as-rail { display: flex; }',
    '.as-rail button { position: relative; }',
    '.as-rail .badge { position: absolute; right: -2px; top: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: var(--pdx-accent); color: #1a1210; font: 700 10px/16px var(--pdx-mono); text-align: center; }',
    '.as.is-drop { border-color: var(--pdx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pdx-accent) 22%, transparent); }',
    '.as.is-drop::after { content: "Drop to add to this deck"; position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; text-align: center; padding: 24px; font-weight: 650; background: color-mix(in srgb, var(--pdx-bg, #1a1c2c) 82%, transparent); backdrop-filter: blur(3px); border-radius: inherit; }'
  ].join('\n');

  var IMG_EXT = /\.(png|jpe?g|webp|svg)$/i, FONT_EXT = /\.(woff2?|ttf|otf)$/i, NOPE_EXT = /\.(heic|heif|pdf|mp4|mov|m4v|webm|avi)$/i;
  function slug(s) { return String(s).toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'asset'; }
  function kb(bytes) { return bytes >= MB ? (bytes / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'; }
  function srcBytes(a) { return a.bytes != null ? a.bytes : Math.round((a.src || '').length * 0.75); }

  /* the fallback of the intake pipeline (spec §7.5), used only when WP6's module is not there */
  function toB64(buf) { var u = new Uint8Array(buf), s = '', n = 0x8000; for (var i = 0; i < u.length; i += n) s += String.fromCharCode.apply(null, u.subarray(i, i + n)); return btoa(s); }
  function hashOf(str) {
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    }
    var h1 = 5381; for (var i = 0; i < str.length; i++) h1 = ((h1 << 5) + h1 + str.charCodeAt(i)) | 0;
    return Promise.resolve('x' + (h1 >>> 0).toString(16));
  }
  function rasterize(file, isSvg) {
    var S = PD.story;
    return Promise.resolve().then(function () {
      if (!isSvg) return createImageBitmap(file).then(function (bm) { return { src: bm, w: bm.width, h: bm.height }; });
      return file.text().then(function (txt) {
        var m = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/.exec(txt), vw = m ? +m[3] : 0, vh = m ? +m[4] : 0;
        if (!(vw > 0 && vh > 0)) { var w0 = /\bwidth\s*=\s*["']([\d.]+)/.exec(txt), h0 = /\bheight\s*=\s*["']([\d.]+)/.exec(txt); vw = w0 ? +w0[1] : 1200; vh = h0 ? +h0[1] : 400; }
        var W = 2400, H = Math.max(1, Math.round(W * vh / vw));
        var fixed = txt.replace(/<svg\b([^>]*)>/i, function (all, attrs) { return '<svg' + attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '') + ' width="' + W + '" height="' + H + '">'; });
        var url = URL.createObjectURL(new Blob([fixed], { type: 'image/svg+xml' }));
        var img = new Image();
        return new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error('svg')); }; img.src = url; })
          .then(function () { return img.decode ? img.decode().catch(function () { }) : null; })
          .then(function () { URL.revokeObjectURL(url); return { src: img, w: W, h: H }; });
      });
    });
  }
  function importOne(file, taken) {
    var S = PD.story, name = file.name, ext = (/\.([^.]+)$/.exec(name) || [0, ''])[1].toLowerCase();
    if (NOPE_EXT.test(name) || /^video\//.test(file.type)) return Promise.resolve({ rejected: { name: name, msg: S.say('assets.heic', { ext: ext }) } });
    var id = (function () { var base = slug(name), n = base, k = 2; while (taken[n]) n = base + '-' + k++; return n; })();
    if (IMG_EXT.test(name)) {
      var isSvg = /\.svg$/i.test(name);
      return rasterize(file, isSvg).then(function (r) {
        var scale = Math.min(1, 2400 / Math.max(r.w, r.h)), w = Math.max(1, Math.round(r.w * scale)), h = Math.max(1, Math.round(r.h * scale));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d'); x.drawImage(r.src, 0, 0, w, h);
        var alpha = false, d = x.getImageData(0, 0, w, h).data;
        for (var i = 3; i < d.length; i += 4 * 7) if (d[i] < 255) { alpha = true; break; }
        var src = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
        return { added: { id: id, source: { type: 'image', src: src, w: w, h: h, name: name, bytes: Math.round((src.length - src.indexOf(',') - 1) * 0.75) } } };
      }, function () { return { rejected: { name: name, msg: 'Can’t use this file type.' } }; });
    }
    if (FONT_EXT.test(name)) {
      return file.arrayBuffer().then(function (buf) {
        return new FontFace('pdx-check', buf.slice(0)).load().then(function () {
          var mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'otf' ? 'font/otf' : 'font/ttf';
          var family = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
          var src = 'data:' + mime + ';base64,' + toB64(buf);
          return { added: { id: id, source: { type: 'font', src: src, family: family, name: name, bytes: buf.byteLength } } };
        });
      }).catch(function () { return { rejected: { name: name, msg: 'Couldn’t read this font; using the theme font.' } }; });
    }
    return Promise.resolve({ rejected: { name: name, msg: 'Can’t use this file type.' } });
  }
  function builtinAdd(files, deckId) {
    var taken = {}, map = PD.assets.get(deckId); Object.keys(map).forEach(function (k) { taken[k] = 1; });
    var out = { added: [], rejected: [] }, chain = Promise.resolve();
    [].slice.call(files).forEach(function (file) {
      chain = chain.then(function () { return importOne(file, taken); }).then(function (r) {
        if (r.rejected) { out.rejected.push(r.rejected); return; }
        taken[r.added.id] = 1;
        return hashOf(r.added.source.src).then(function (hash) { PD.assets.put(deckId, r.added.id, r.added.source); out.added.push({ id: r.added.id, hash: hash }); });
      });
    });
    return chain.then(function () { return out; });
  }
  function importer(ctx) {
    var cands = [ctx && ctx['import'], window.Studio && window.Studio['import']];
    try { if (PD.has('studio/import')) cands.push(PD.get('studio/import')); } catch (e) { }
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c && typeof c.addFiles === 'function') return function (files, deckId) { return Promise.resolve(c.addFiles(files, { deckId: deckId })); };
      if (c && typeof c.importFiles === 'function') return function (files, deckId) { return Promise.resolve(c.importFiles(files, { deckId: deckId })); };
    }
    return builtinAdd;
  }

  var alphaCache = new Map();
  function hasAlpha(a) {          // does this picture have any transparent pixel? (a logo that does not draws a box of particles)
    var key = a.src.length + ':' + a.src.slice(-60);
    if (alphaCache.has(key)) return Promise.resolve(alphaCache.get(key));
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'), w = 96, hh = Math.max(1, Math.round(96 * img.naturalHeight / Math.max(1, img.naturalWidth)));
          c.width = w; c.height = hh; var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, hh);
          var d = x.getImageData(0, 0, w, hh).data, any = false;
          for (var i = 3; i < d.length; i += 4) if (d[i] < 250) { any = true; break; }
          alphaCache.set(key, any); res(any);
        } catch (e) { res(true); }
      };
      img.onerror = function () { res(true); };
      img.src = a.src;
    });
  }

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, icon = f.icon, S = PD.story;
    f.ensureBase(); f.css('assets', CSS);
    var ctx = opts.ctx, open = opts.open !== false, data = { compiled: null, selected: null, readOnly: !!opts.readOnly }, dead = false, alphaOf = {}, warned = false;
    var fileIn = h('input', { type: 'file', multiple: true, accept: 'image/*,.png,.jpg,.jpeg,.webp,.svg,.woff2,.woff,.ttf,.otf,.heic,.heif,.pdf', style: 'display:none', onchange: function () { if (fileIn.files.length) addFiles(fileIn.files); fileIn.value = ''; } });
    var title = h('span', { class: 'pdx-cap', text: 'Assets' });
    var collapse = h('button', { type: 'button', class: 'pdx-btn is-quiet is-icon is-sm', title: 'Collapse the assets column', 'aria-label': 'Collapse assets', onclick: function () { api.setOpen(false); } }, icon('chevL', 16));
    var add = h('button', { type: 'button', class: 'pdx-btn is-icon is-sm', title: 'Add pictures or a font', 'aria-label': 'Add files', onclick: function () { chooser(); } }, icon('plus', 16));
    var head = h('div', { class: 'as-head' }, [title, h('span', { class: 'sp' }), add, collapse]);
    var body = h('div', { class: 'as-body' }), foot = h('div', { class: 'as-foot' });
    var rail = h('div', { class: 'as-rail' });
    var root = h('div', { class: 'pdx as' + (open ? '' : ' is-rail') }, [head, body, foot, rail, fileIn]);

    function deckId() { return data.compiled ? data.compiled.assetsDeckId || data.compiled.id : null; }
    function assetsList() {
      var id = deckId(); if (!id) return [];
      var map = ctx && ctx.store && typeof ctx.store.assets === 'function' ? ctx.store.assets() : PD.assets.get(id), out = [];
      Object.keys(map).forEach(function (k) { if (map[k]) out.push(Object.assign({ id: k }, map[k])); });
      out.sort(function (a, b) { return (a.type === b.type ? 0 : a.type === 'image' ? -1 : 1) || a.id.localeCompare(b.id); });
      return out;
    }
    function usedBy(id) {
      var c = data.compiled, out = [], srcs = c && c.source && c.source.scenes || [];
      srcs.forEach(function (sc, i) {
        if (sc && sc.props && Object.keys(sc.props).some(function (k) { return sc.props[k] === id; })) out.push({ i: i, scene: sc });
      });
      return out;
    }
    function usedAsFont(id) {
      var bf = ctx && ctx.store && typeof ctx.store.brandFont === 'function' ? ctx.store.brandFont() : null;
      if (bf) return bf.asset === id;
      var tp = data.compiled && data.compiled.meta && data.compiled.meta.themePatch;
      return !!(tp && Array.isArray(tp.fontFaces) && tp.fontFaces.some(function (x) { return x.asset === id; }));
    }
    function chip(label, ic, fn, extra) { return h('button', { type: 'button', class: 'pdx-btn is-sm' + (extra || ''), onclick: fn }, [ic ? icon(ic, 13) : null, h('span', { text: label })]); }

    function card(a) {
      var isImg = a.type === 'image', bytes = srcBytes(a), uses = usedBy(a.id), logoUses = uses.filter(function (u) { return u.scene.template === 'logo'; });
      var th = h('div', { class: 'th' + (isImg ? ' is-chk' : '') });
      if (isImg) th.style.backgroundImage = 'url("' + a.src + '")'; else { th.textContent = 'Aa'; th.style.fontFamily = '"' + (a.family || a.id) + '", sans-serif'; }
      var meta = isImg ? (a.w + '×' + a.h + ' · ' + kb(bytes)) : ((a.family || 'font') + ' · ' + kb(bytes));
      var chips = h('div', { class: 'chips' });
      var ro = data.readOnly;
      if (isImg) {
        chips.appendChild(chip('Add as logo scene', 'film', function () { opts.onUse && opts.onUse('logo-scene', a.id); }, ro ? ' is-quiet' : ''));
        chips.appendChild(chip('Add as image scene', 'image', function () { opts.onUse && opts.onUse('image-scene', a.id); }));
        var sel = data.selected;
        if (sel && sel.isTpl && sel.T && Object.keys(sel.T.props || {}).some(function (k) { return sel.T.props[k].type === 'asset' && sel.T.props[k].accept !== 'font'; }))
          chips.appendChild(chip('Use in scene ' + (sel.i + 1), 'target', function () { opts.onUse && opts.onUse('scene-prop', a.id); }));
      } else chips.appendChild(chip(usedAsFont(a.id) ? 'Brand font (click to undo)' : 'Use as brand font', usedAsFont(a.id) ? 'check' : 'type', function () { opts.onUse && opts.onUse('brand-font', a.id); }, usedAsFont(a.id) ? ' is-on' : ''));
      if (ro) chips.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      var kids = [h('div', { class: 'top' }, [th, h('div', { class: 'nm' }, [h('b', { text: a.name || a.id, title: a.name || a.id }), h('small', { text: meta })]),
        h('button', { type: 'button', class: 'pdx-btn is-quiet is-sm is-icon is-danger', title: 'Remove ' + (a.name || a.id), 'aria-label': 'Remove ' + (a.name || a.id), disabled: ro, onclick: function () { opts.onUse && opts.onUse('remove', a.id); } }, icon('trash', 14))]), chips];
      if (bytes > 4 * MB) kids.push(h('div', { class: 'note', text: 'Large picture (' + kb(bytes) + '). It will make the file heavy; a smaller export is kinder.' }));
      if (isImg && logoUses.some(function (u) { return u.scene.props.mode !== 'luma'; }) && alphaOf[a.id] === false) {
        kids.push(h('div', { class: 'note' }, [S.say('assets.solidLogo') + ' ', h('button', { type: 'button', text: 'Use brightness mode', onclick: function () { opts.onUse && opts.onUse('brightness', a.id); } })]));
      }
      return h('div', { class: 'as-card', dataset: { asset: a.id } }, kids);
    }

    function slot(ic, name, line, accept) {
      return h('button', { type: 'button', class: 'as-slot', dataset: { slot: name.toLowerCase() }, onclick: function () { chooser(accept); } }, [h('div', { class: 'ic' }, icon(ic, 20)), h('div', null, [h('b', { text: name }), h('span', { text: line })])]);
    }

    function paint() {
      f.clear(body); f.clear(foot); f.clear(rail);
      var list = assetsList(), total = list.reduce(function (n, a) { return n + srcBytes(a); }, 0), imgs = list.filter(function (a) { return a.type === 'image'; }).length, fonts = list.length - imgs;
      list.forEach(function (a) {
        if (a.type === 'image' && alphaOf[a.id] === undefined) { alphaOf[a.id] = null; hasAlpha(a).then(function (v) { alphaOf[a.id] = v; if (!dead) paint(); }); }
      });
      if (!data.readOnly) body.appendChild(h('button', { type: 'button', class: 'as-drop', onclick: function () { chooser(); } }, [icon('upload', 20), h('span', { text: list.length ? 'Drop more here, or click to choose' : S.say('assets.drop') })]));
      if (!list.length) {
        body.appendChild(slot('film', 'Logo', 'Particles assemble your mark on the reveal and the finale.', 'image/*'));
        body.appendChild(slot('image', 'Photos', 'Full-bleed shots with a slow push-in, for your human moments.', 'image/*'));
        body.appendChild(slot('type', 'Font', 'Your brand’s typeface, embedded in the file so it travels.', '.woff2,.woff,.ttf,.otf'));
      } else list.forEach(function (a) { body.appendChild(card(a)); });
      var over = total > 20 * MB;
      foot.className = 'as-foot' + (over ? ' is-over' : '');
      foot.appendChild(h('span', { text: list.length ? (f.plural(list.length, 'file') + ' · ' + kb(total) + ' of 20 MB') : 'Everything stays inside the deck.' }));
      if (over && !warned) { warned = true; if (ctx && ctx.ui && ctx.ui.banner) ctx.ui.banner('Your assets add up to ' + kb(total) + '. Above 20 MB the saved file gets slow to open.', 'warn'); }
      if (!over) warned = false;
      // the collapsed rail
      rail.appendChild(h('button', { type: 'button', class: 'pdx-btn is-quiet is-icon', title: 'Open assets', 'aria-label': 'Open assets', onclick: function () { api.setOpen(true); } }, icon('chevR', 18)));
      rail.appendChild(h('button', { type: 'button', class: 'pdx-btn is-quiet is-icon', title: 'Pictures', 'aria-label': 'Pictures', onclick: function () { api.setOpen(true); } }, [icon('image', 19), imgs ? h('span', { class: 'badge', text: String(imgs) }) : null]));
      rail.appendChild(h('button', { type: 'button', class: 'pdx-btn is-quiet is-icon', title: 'Fonts', 'aria-label': 'Fonts', onclick: function () { api.setOpen(true); } }, [icon('type', 19), fonts ? h('span', { class: 'badge', text: String(fonts) }) : null]));
      if (!data.readOnly) rail.appendChild(h('button', { type: 'button', class: 'pdx-btn is-quiet is-icon', title: 'Add pictures or a font', 'aria-label': 'Add files', onclick: function () { chooser(); } }, icon('plus', 19)));
    }

    function chooser(accept) {
      if (data.readOnly) return;
      fileIn.accept = accept || 'image/*,.png,.jpg,.jpeg,.webp,.svg,.woff2,.woff,.ttf,.otf,.heic,.heif,.pdf';
      fileIn.click();
    }
    function noteResult(res) {
      res = res || {};
      (res.rejected || []).forEach(function (r) { if (ctx && ctx.ui && ctx.ui.toast) ctx.ui.toast(r.msg || r.message || ('Can\u2019t use ' + r.name), 'error'); });
      (res.warnings || []).forEach(function (w) {
        var msg = typeof w === 'string' ? w : w && w.msg;
        if (!msg || !ctx || !ctx.ui) return;
        if (w && w.kind === 'big-total' && ctx.ui.banner) ctx.ui.banner(msg, 'warn'); else if (ctx.ui.toast) ctx.ui.toast(msg);
      });
      var added = res.added || [];
      if (added.length && ctx && ctx.ui && ctx.ui.toast) ctx.ui.toast(added.length === 1 ? 'Added ' + added[0].id + '. It stays inside the deck.' : 'Added ' + added.length + ' files.');
      if (added.length && !open) api.setOpen(true);
      return res;
    }
    function addFiles(files) {
      var id = deckId(), st = ctx && ctx.store;
      if (!id || data.readOnly) return Promise.resolve(null);
      if (st && typeof st.addFiles === 'function') {                 // the store runs the intake pipeline, commits and tells the board ('assets')
        return st.addFiles(files).then(function (res) { noteResult(res); paint(); return res; });
      }
      var imp = importer(ctx);
      return imp(files, id).then(function (res) {
        res = res || {}; var added = res.added || [];
        if (!added.length) return noteResult(res);
        st.commit('Add ' + (added.length === 1 ? added[0].id : added.length + ' files'), function (d) { added.forEach(function (x) { d.assets[x.id] = x.hash || ('h-' + x.id); }); });
        return PD.assets.ready(id).then(function () {
          if (dead) return res;
          noteResult(res); paint();
          if (opts.onChanged) opts.onChanged(added.map(function (x) { return x.id; }));
          return res;
        });
      });
    }

    /* drop on this column. The shell handles a drop anywhere else in the window (and leaves a drop that something more specific
     * has already taken: preventDefault is the sign), so the column only needs its own. */
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return t && [].indexOf.call(t, 'Files') >= 0; }
    root.addEventListener('dragenter', function (e) { if (!hasFiles(e) || data.readOnly) return; e.preventDefault(); root.classList.add('is-drop'); });
    root.addEventListener('dragover', function (e) { if (!hasFiles(e) || data.readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; root.classList.add('is-drop'); });
    root.addEventListener('dragleave', function (e) { if (!e.relatedTarget || !root.contains(e.relatedTarget)) root.classList.remove('is-drop'); });
    root.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); root.classList.remove('is-drop');
      if (!data.readOnly && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    var api = {
      el: root,
      update: function (d) { data = { compiled: d.compiled, selected: d.selected || null, readOnly: !!d.readOnly }; paint(); },
      setOpen: function (o) { o = !!o; if (o === open) return; open = o; root.classList.toggle('is-rail', !open); if (opts.onToggle) opts.onToggle(open); },
      isOpen: function () { return open; },
      chooser: chooser, addFiles: addFiles, list: assetsList,
      destroy: function () {
        dead = true;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    return api;
  }
  return { create: create, hasAlpha: hasAlpha };
}, { export: false });
