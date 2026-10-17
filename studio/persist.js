/* studio/persist.js — what the Studio remembers, and where (spec §7.7, §7.6, WP6).
 *
 * Creates the Studio namespace: PD.studio, also reachable as the global `Studio` (the spec's name for it). Every other
 * studio module adds to it. Registered { export: false }: an exported presentation never carries the Studio.
 *
 *   PD.studio.persist = {
 *     slug(text, max?) → string                 lower-case, a-z 0-9 and single dashes ('Q4 Board Story' → 'q4-board-story')
 *     newId(title, taken?) → string             slug(title || 'untitled') + '-' + 4 base36 characters from crypto.getRandomValues;
 *                                               matches the deck id rule /^[a-z0-9][a-z0-9-]{0,47}$/ and is not in `taken`
 *     sha256(text) → Promise<string>            hex digest (crypto.subtle); a plain 64-bit hash where subtle is missing
 *     index() → [{ id, title, theme, scenes, updated }]     the autosave index, most recent first
 *     loadProject(id) → Project | null          localStorage 'pdstudio:v1:proj:<id>'
 *     saveProject(project) → { ok, quota?, error? }   writes the project and its index entry; never throws
 *     removeProject(id)                         forgets a project (its assets stay: other projects may share them)
 *     storable(project) → Project               a copy fit for storage (readOnly false, sample markers dropped)
 *     assets.put(record) → Promise<bool>        IndexedDB 'pdstudio' / 'assets', keyPath hash
 *     assets.get(hash) → Promise<record | null>, assets.getMany(hashes) → Promise<{ [hash]: record }>
 *     handles.get(projectId) → Promise<FileSystemFileHandle | null>, .put(projectId, handle, name), .remove(projectId)
 *     lock(projectId) → Promise<{ held, release(), takeOver(), onLost(fn) }>
 *         BroadcastChannel 'pdstudio:lock:<id>': the first tab holds the project; a second tab asking is told so and opens
 *         read-only. takeOver() makes the other tab let go. Without BroadcastChannel every tab simply holds.
 *     target(projectId, suggestedName, opts?) → Promise<Target>     where a presentation file will go, chosen while the
 *         click that asked for the save still counts as a user gesture (spec §7.6): Chrome's save picker (or the handle
 *         remembered for this project), else a download. opts.saveAs forces the picker.
 *     write(target, html) → Promise<{ ok, via: 'file' | 'download', fileName }>
 *   }
 * localStorage keys: pdstudio:v1:index = [{ id, title, theme, scenes, updated }], pdstudio:v1:proj:<id> = Project JSON
 * (assets by reference: a map of asset id → content hash). IndexedDB 'pdstudio' v1: assets (keyPath hash), handles
 * (keyPath projectId). Every failure is caught: a browser that refuses storage still runs the Studio, it just cannot
 * remember (the caller shows the banners). Registration touches nothing; storage is first used by the functions. */
PD.module('studio/persist', [], function (PD) {
  var S = PD.studio || (PD.studio = {});
  try { if (window.Studio === undefined) window.Studio = S; } catch (e) { }

  var LS_INDEX = 'pdstudio:v1:index', LS_PROJ = 'pdstudio:v1:proj:', DB_NAME = 'pdstudio';
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------------------------------------------------------- ids */
  function slug(text, max) {
    var s = String(text == null ? '' : text);
    try { s = s.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { }
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (max && s.length > max) s = s.slice(0, max).replace(/-+$/, '');
    return s;
  }
  function rand4() {
    var a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return ('0000' + (a[0] % 1679616).toString(36)).slice(-4);
  }
  function newId(title, taken) {
    var base = slug(title || 'untitled', 43) || 'untitled', id, n = 0;
    taken = taken || [];
    do { id = base + '-' + rand4(); n++; } while ((taken.indexOf(id) >= 0 || !ID_RE.test(id)) && n < 50);
    return id;
  }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function plainHash(s) {          // cyrb53, used only where crypto.subtle is missing
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) { var ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + '-' + s.length.toString(16);
  }
  function sha256(text) {
    return new Promise(function (resolve) {
      var fallback = function () { resolve(plainHash(String(text))); };
      try {
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))).then(function (buf) { resolve(hex(buf)); }, fallback);
      } catch (e) { fallback(); }
    });
  }

  /* ---------------------------------------------------------- localStorage */
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  }
  function readJSON(key) {
    var s = ls();
    if (!s) return null;
    try { var t = s.getItem(key); return t == null ? null : JSON.parse(t); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    var s = ls();
    if (!s) return { ok: false, quota: false, error: new Error('localStorage is not available') };
    try { s.setItem(key, JSON.stringify(value)); return { ok: true }; }
    catch (e) { return { ok: false, quota: isQuota(e), error: e }; }
  }

  function clone(v) {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') { var o = {}; for (var k in v) if (has(v, k) && k !== '__proto__') o[k] = clone(v[k]); return o; }
    return v;
  }
  // A project read from storage (or from a file) is made safe to use: the shape of §7.8, with every field present.
  function normalize(p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.deck || typeof p.deck !== 'object' || !Array.isArray(p.deck.scenes)) return null;
    p.v = 1;
    if (!p.deck.meta || typeof p.deck.meta !== 'object') p.deck.meta = {};
    p.assets = p.assets && typeof p.assets === 'object' && !Array.isArray(p.assets) ? p.assets : {};
    var st = p.studio && typeof p.studio === 'object' ? p.studio : {};
    var sel = st.selected && typeof st.selected === 'object' ? st.selected : {};
    st.screen = typeof st.screen === 'string' && st.screen ? st.screen : 'brief';
    st.selected = { sceneId: sel.sceneId == null ? null : String(sel.sceneId), step: sel.step | 0 };
    st.readOnly = false;
    delete st.registeredId; delete st.lockedByOther; delete st.sample;
    p.studio = st;
    return p;
  }
  function storable(project) {
    var c = clone(project);
    c.studio = c.studio || {};
    c.studio.readOnly = false;
    delete c.studio.registeredId; delete c.studio.lockedByOther; delete c.studio.sample;
    return c;
  }

  function validEntry(e) { return e && typeof e === 'object' && typeof e.id === 'string' && typeof e.title === 'string'; }
  function index() {
    var a = readJSON(LS_INDEX);
    return Array.isArray(a) ? a.filter(validEntry) : [];
  }
  function loadProject(id) { return normalize(readJSON(LS_PROJ + id)); }
  function saveProject(project) {
    var r = writeJSON(LS_PROJ + project.id, storable(project));
    if (!r.ok) return r;
    var meta = project.deck.meta || {};
    var entry = { id: project.id, title: meta.title || 'Untitled talk', theme: meta.theme || '', scenes: project.deck.scenes.length, updated: new Date().toISOString() };
    var idx = index().filter(function (e) { return e.id !== project.id; });
    idx.unshift(entry);
    return writeJSON(LS_INDEX, idx);
  }
  function removeProject(id) {
    var s = ls();
    try { if (s) s.removeItem(LS_PROJ + id); } catch (e) { }
    writeJSON(LS_INDEX, index().filter(function (e) { return e.id !== id; }));
  }

  /* ---------------------------------------------------------- IndexedDB */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'hash' });
          if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles', { keyPath: 'projectId' });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  // run fn(objectStore) inside one transaction; resolves with the request's result, or null when anything fails
  function idb(storeName, mode, fn) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolve) {
        try {
          var t = d.transaction(storeName, mode), req = fn(t.objectStore(storeName)), out = null;
          if (req) req.onsuccess = function () { out = req.result; };
          t.oncomplete = function () { resolve(out === undefined ? null : out); };
          t.onerror = t.onabort = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  var assets = {
    put: function (rec) {
      return idb('assets', 'readwrite', function (st) { return st.put(rec); }).then(function (k) { return k != null; });
    },
    get: function (hash) { return idb('assets', 'readonly', function (st) { return st.get(hash); }).then(function (r) { return r || null; }); },
    getMany: function (hashes) {
      var out = {}, uniq = hashes.filter(function (h, i) { return h && hashes.indexOf(h) === i; });
      return Promise.all(uniq.map(function (h) { return assets.get(h).then(function (r) { if (r) out[h] = r; }); })).then(function () { return out; });
    }
  };
  var handles = {
    get: function (projectId) {
      return idb('handles', 'readonly', function (st) { return st.get(projectId); }).then(function (r) { return r && r.handle ? r.handle : null; });
    },
    put: function (projectId, handle, name) {
      return idb('handles', 'readwrite', function (st) { return st.put({ projectId: projectId, handle: handle, name: name || (handle && handle.name) || '' }); }).then(function (k) { return k != null; });
    },
    remove: function (projectId) { return idb('handles', 'readwrite', function (st) { return st['delete'](projectId); }).then(function () { return true; }); }
  };

  /* ---------------------------------------------------------- two tabs, one project (spec §7.7) */
  function lock(projectId) {
    return new Promise(function (resolve) {
      if (typeof BroadcastChannel !== 'function') return resolve({ held: true, release: function () { }, takeOver: function () { }, onLost: function () { } });
      var ch, me = rand4() + rand4(), held = false, lostFn = null, closed = false, probing = true, busy = false;
      try { ch = new BroadcastChannel('pdstudio:lock:' + projectId); }
      catch (e) { return resolve({ held: true, release: function () { }, takeOver: function () { }, onLost: function () { } }); }
      ch.onmessage = function (e) {
        var m = e.data;
        if (!m || m.from === me) return;
        if (m.type === 'who' && held) ch.postMessage({ type: 'held', to: m.from, from: me });
        else if (m.type === 'held' && m.to === me && probing) busy = true;
        else if (m.type === 'takeover' && held) { held = false; if (lostFn) lostFn(); }
      };
      var api = {
        get held() { return held; },
        release: function () {
          if (closed) return;
          closed = true; held = false;
          try { ch.close(); } catch (e) { }
        },
        takeOver: function () { held = true; try { ch.postMessage({ type: 'takeover', from: me }); } catch (e) { } },
        onLost: function (fn) { lostFn = fn; }
      };
      ch.postMessage({ type: 'who', from: me });
      setTimeout(function () {
        probing = false;
        held = !busy;
        resolve(api);
      }, 160);
    });
  }

  /* ---------------------------------------------------------- the presentation file (spec §7.6) */
  var HTML_TYPE = [{ description: 'Pixeldeck presentation', accept: { 'text/html': ['.html'] } }];
  function target(projectId, suggestedName, opts) {
    opts = opts || {};
    var win = window;
    if (typeof win.showSaveFilePicker !== 'function') return Promise.resolve({ kind: 'download', name: suggestedName });
    var stored = opts.saveAs ? Promise.resolve(null) : handles.get(projectId);
    return stored.then(function (h) {
      if (!h || typeof h.queryPermission !== 'function') return null;
      return Promise.resolve(h.queryPermission({ mode: 'readwrite' })).then(function (p) {
        return p === 'granted' ? p : h.requestPermission({ mode: 'readwrite' });
      }).then(function (p) { return p === 'granted' ? h : null; }, function () { return null; });
    }).then(function (h) {
      if (h) return { kind: 'handle', handle: h, name: h.name, projectId: projectId, fresh: false };
      return win.showSaveFilePicker({ suggestedName: suggestedName, types: HTML_TYPE }).then(function (nh) {
        return { kind: 'handle', handle: nh, name: nh.name, projectId: projectId, fresh: true };
      }, function (e) {
        if (e && e.name === 'AbortError') return { kind: 'cancelled' };
        return { kind: 'download', name: suggestedName };       // no picker here (blocked, insecure, no gesture): a download still saves
      });
    });
  }
  function write(t, html) {
    if (!t || t.kind === 'cancelled') return Promise.resolve({ ok: false, cancelled: true });
    if (t.kind === 'handle') {
      return t.handle.createWritable().then(function (w) {
        return w.write(html).then(function () { return w.close(); });
      }).then(function () {
        if (t.fresh) handles.put(t.projectId, t.handle, t.name);
        return { ok: true, via: 'file', fileName: t.name };
      }, function (e) { return { ok: false, error: e, message: e && e.message ? e.message : String(e) }; });
    }
    try {
      var blob = new Blob([html], { type: 'text/html' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = t.name || 'presentation.html'; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { } }, 20000);
      return Promise.resolve({ ok: true, via: 'download', fileName: t.name });
    } catch (e) { return Promise.resolve({ ok: false, error: e, message: e && e.message ? e.message : String(e) }); }
  }

  var api = {
    slug: slug, newId: newId, sha256: sha256, ID_RE: ID_RE, clone: clone, normalize: normalize, storable: storable,
    index: index, loadProject: loadProject, saveProject: saveProject, removeProject: removeProject, isQuota: isQuota,
    assets: assets, handles: handles, lock: lock, target: target, write: write
  };
  S.persist = api;
  return api;
}, { export: false });
