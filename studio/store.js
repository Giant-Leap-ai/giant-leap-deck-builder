/* studio/store.js — the one project in memory: commit, undo, compile, lint, timing, autosave (spec §7.8, §7.7, WP6).
 *
 * PD.studio.store (= Studio.store) is the contract WP7 builds the storyboard on. Exactly as §7.8:
 *   get() → Project                         treat as immutable; every commit and every selection makes a NEW object
 *   commit(label, mutate(draft)) → bool     deep-clones the project, runs mutate on the clone, pushes one undo entry (up to
 *                                           100), schedules the autosave (1 s) and emits 'change'. Commits with the same
 *                                           label less than 1 s apart share one undo entry, so typing in one field is one
 *                                           step; a mutate that changes nothing is dropped. false when the deck is read-only.
 *   undo() redo() canUndo() canRedo()
 *   select(sceneId | null, step = 0), selection() → { sceneId, step }
 *   compiled() → CompiledDeck               cached; after a commit only the scenes that changed are expanded again
 *                                           (PD.compileScene); a theme change compiles everything
 *   lint() → { findings, score, ready, … }  cached; recomputed 300 ms after a change, then 'lint' is emitted
 *   timing() → Timing | null                the last completed PD.story.timing; 'timing' is emitted when a new one lands
 *   on(evt, fn) → off()                     evt: 'change' { label, changedSceneIds, themeChanged, structural, undo? },
 *                                           'select' { sceneId, step }, 'lint', 'timing', 'route' (name)
 *   route(name?) → string                   the current screen name; with a name it navigates
 * Project = { v: 1, id, deck: DeckSource, assets: { [assetId]: contentHash },
 *             studio: { screen, selected: { sceneId, step }, readOnly, savedHash?, fileName?, … } }
 * Additive (the shell and the Brief/Shape/Look/Export screens use them; WP7 may too):
 *   events   'project' (opened / closed), 'status' (autosave state), 'quota', 'assets', 'lock', 'studio' (a studio field changed)
 *   open(project) close() blankProject(title?) projectFromDeck(deck, assets?, studio?) sampleProject(kind)
 *   answer(questionId, value)               one Brief answer into meta.story (also: tone suggests a look, title follows the brand)
 *   patchStudio(patch)                      studio-section fields; no undo entry, no 'change'; autosaved
 *   setReadOnly(bool), hash(), isSaved(), markSaved(info), saveState(), flush()
 *   assets() → { [id]: AssetSource }, addFiles(files) → Promise<{ added, rejected, warnings }>, removeAsset(id),
 *   importFiles (= addFiles), setBrandFont(assetId | null, family?) → Promise, assetsReady() → Promise, missingAssets() → ids
 *   cacheRecords({ hash: record })          the IndexedDB records of the assets a project names (open() needs them)
 *   sceneIndex(id) → number, themeInfo() → { id, label, worlds, accent }
 * Registration defines functions only: no DOM, no storage. */
PD.module('studio/store', ['studio/persist', 'studio/import', 'core/theme', 'core/compile', 'core/validate', 'story/copy', 'story/frameworks', 'story/interview', 'story/timing', 'story/lint'],
function (PD, persist, files, themeMod, compileMod, validateMod, copy, fws, interview) {
  var S = PD.studio, GENERATOR = 'studio@2.0.0', UNDO_MAX = 100, COALESCE_MS = 1000, AUTOSAVE_MS = 1000, LINT_MS = 300;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var clone = persist.clone;

  /* ---------------------------------------------------------- state */
  var proj = null, curKey = null, hashMemo = { key: null, value: '' };
  var undoStack = [], redoStack = [], lastCommit = { label: null, at: 0 };
  var listeners = {}, routeName = 'welcome';
  var cache = fresh();
  var assetRecs = {}, missing = [], readyP = Promise.resolve();
  var status = { state: 'idle', quota: false, at: 0, error: null };
  var timers = { autosave: 0, lint: 0 }, timingRun = null;

  function fresh() { return { compiled: null, pending: null, lint: null, timing: null, timingFor: null, error: null }; }

  function emit(evt, payload) {
    var fns = listeners[evt] ? listeners[evt].slice() : [];
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](payload); } catch (e) { try { console.error('studio: a "' + evt + '" listener failed', e); } catch (e2) { } }
    }
  }
  function on(evt, fn) {
    if (typeof fn !== 'function') return function () { };
    (listeners[evt] || (listeners[evt] = [])).push(fn);
    return function off() { var a = listeners[evt] || [], i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  }

  function keyOf(p) { return JSON.stringify([p.deck, p.assets]); }
  function hash() {
    if (!proj) return '';
    var k = curKey || (curKey = keyOf(proj));
    if (hashMemo.key !== k) hashMemo = { key: k, value: themeMod.hash(k) };
    return hashMemo.value;
  }
  function isSaved() { return !!proj && !!proj.studio.savedHash && proj.studio.savedHash === hash(); }

  /* ---------------------------------------------------------- projects */
  function story0() { return interview.blank(); }
  function studio0(extra) {
    var st = { screen: 'brief', selected: { sceneId: null, step: 0 }, readOnly: false, titleAuto: true, themeChosen: false, visited: {} };
    for (var k in extra || {}) if (has(extra, k)) st[k] = extra[k];
    return st;
  }
  function blankProject(title) {
    var id = persist.newId(title || 'untitled', persist.index().map(function (e) { return e.id; }));
    return {
      v: 1, id: id,
      deck: { format: 2, id: id, meta: { title: title || 'Untitled talk', theme: 'cosmos', story: story0(), generator: GENERATOR, updated: new Date().toISOString() }, scenes: [] },
      assets: {}, studio: studio0()
    };
  }
  // a deck (object form) and its assets map { id: AssetSource } become a project; assets still need hashing by the caller
  function projectFromDeck(deck, assetHashes, extra) {
    var d = clone(deck);
    d.format = 2;
    if (!d.meta || typeof d.meta !== 'object') d.meta = {};
    if (!d.meta.story) d.meta.story = story0();
    var st = studio0({ titleAuto: false, themeChosen: true });
    for (var k in extra || {}) if (has(extra, k)) st[k] = extra[k];
    return { v: 1, id: d.id, deck: d, assets: assetHashes || {}, studio: st };
  }
  // 'ogl' → the registered One Giant Leap, read-only; 'replica' → the template replica as a new editable deck
  function sampleProject(kind) {
    if (kind === 'ogl') {
      var c = PD.compile('one-giant-leap');
      return {
        v: 1, id: 'one-giant-leap', deck: c.source, assets: {},
        studio: studio0({ screen: 'board', readOnly: true, registeredId: 'one-giant-leap', sample: 'ogl', themeChosen: true, titleAuto: false,
          selected: { sceneId: c.source.scenes[0] && c.source.scenes[0].id || null, step: 0 } })
      };
    }
    var src = PD.compile('parity').source, d = clone(src), title = 'One Giant Leap (template replica)';
    d.id = persist.newId(title, persist.index().map(function (e) { return e.id; }));
    d.meta.generator = GENERATOR;
    d.meta.updated = new Date().toISOString();
    return { v: 1, id: d.id, deck: d, assets: {}, studio: studio0({ screen: 'board', themeChosen: true, titleAuto: false, selected: { sceneId: d.scenes[0] && d.scenes[0].id || null, step: 0 } }) };
  }

  /* ---------------------------------------------------------- assets in memory */
  function cacheRecords(map) { for (var h in map || {}) if (has(map, h)) assetRecs[h] = map[h]; }
  function themeFaces() {
    var m = proj && proj.deck.meta, p = m && m.themePatch;
    return p && Array.isArray(p.fontFaces) ? p.fontFaces : [];
  }
  function syncAssets() {
    missing = [];
    if (!proj || proj.studio.registeredId) { readyP = Promise.resolve({ loaded: [], failed: [] }); return; }
    var deckId = proj.deck.id, reg = PD.assets.get(deckId), id;
    for (id in reg) if (has(reg, id) && !has(proj.assets, id)) PD.assets.remove(deckId, id);
    for (id in proj.assets) {
      if (!has(proj.assets, id)) continue;
      var rec = assetRecs[proj.assets[id]];
      if (rec) PD.assets.put(deckId, id, files.sourceOf(rec)); else { missing.push(id); PD.assets.remove(deckId, id); }
    }
    var faces = themeFaces(), mine = readyP = PD.assets.ready(deckId, { fontFaces: faces });
    // a deck compiled before its brand font had loaded measured its text in a stand-in face: compile it again once it has
    if (faces.length) mine.then(function () {
      if (!proj || proj.deck.id !== deckId || mine !== readyP) return;
      if (PD.story.lint && PD.story.lint.clearCache) PD.story.lint.clearCache();
      if (cache.compiled) { cache.compiled = null; cache.pending = { changed: {}, themeChanged: true, full: true }; cache.lint = null; cache.timing = null; emit('assets', { fontsReady: true }); }
    });
  }

  /* ---------------------------------------------------------- diff and compile */
  function sceneJson(s) { try { return JSON.stringify(s); } catch (e) { return null; } }
  function themeSig(p) { var m = p.deck.meta || {}; return JSON.stringify([m.theme || null, m.themePatch || null, m.worlds || null]); }
  function diff(a, b) {
    var out = { changedSceneIds: [], themeChanged: themeSig(a) !== themeSig(b), structural: false, full: false };
    var ja = {}, i, id, dup = false;
    a.deck.scenes.forEach(function (s) { if (s && s.id != null) { if (has(ja, s.id)) dup = true; ja[s.id] = sceneJson(s); } });
    var ids = b.deck.scenes.map(function (s) { return s && s.id; }), seen = {};
    b.deck.scenes.forEach(function (s) {
      id = s && s.id;
      if (id == null) { out.full = true; return; }
      if (has(seen, id)) dup = true;
      seen[id] = 1;
      var j = sceneJson(s);
      if (!has(ja, id) || ja[id] !== j || j === null) out.changedSceneIds.push(id);
    });
    var pa = a.deck.scenes.map(function (s) { return s && s.id; });
    out.structural = pa.length !== ids.length || pa.some(function (x, k) { return x !== ids[k]; });
    // an asset that changed or went changes every scene that names it, and the theme when a font face does
    var changedAssets = [], k2;
    for (k2 in b.assets) if (has(b.assets, k2) && a.assets[k2] !== b.assets[k2]) changedAssets.push(k2);
    for (k2 in a.assets) if (has(a.assets, k2) && !has(b.assets, k2)) changedAssets.push(k2);
    if (changedAssets.length) {
      var patch = JSON.stringify((b.deck.meta || {}).themePatch || null);
      changedAssets.forEach(function (aid) {
        var q = JSON.stringify(aid);
        if (patch.indexOf(q) >= 0) out.themeChanged = true;
        b.deck.scenes.forEach(function (s) {
          var sid = s && s.id, j = sceneJson(s);
          if (j && j.indexOf(q) >= 0 && out.changedSceneIds.indexOf(sid) < 0) out.changedSceneIds.push(sid);
        });
      });
    }
    if (dup) out.full = true;
    return out;
  }
  function addPending(ev) {
    var p = cache.pending || (cache.pending = { changed: {}, themeChanged: false, full: false });
    ev.changedSceneIds.forEach(function (id) { p.changed[id] = 1; });
    if (ev.themeChanged) p.themeChanged = true;
    if (ev.full) p.full = true;
  }

  function compileSource() {
    var st = proj.studio;
    return st.registeredId && PD.deck.has(st.registeredId) ? st.registeredId : proj.deck;
  }
  function incremental(prev, src, p) {
    var idx = {};
    prev.source.scenes.forEach(function (s, j) { var id = s && s.id; if (id != null) idx[id] = has(idx, id) ? -1 : j; });
    var base = {};
    for (var k in prev) if (has(prev, k)) base[k] = prev[k];
    base.meta = src.meta;
    base.source = {};
    for (var k3 in src) if (has(src, k3)) base.source[k3] = src[k3];
    base.source.scenes = []; base.scenes = []; base.sceneKeys = []; base.errors = [];
    for (var i = 0; i < src.scenes.length; i++) {
      var s = src.scenes[i], id = s && s.id, j = id != null && has(idx, id) ? idx[id] : -1;
      if (j >= 0 && !has(p.changed, id)) {
        base.scenes.push(prev.scenes[j]); base.sceneKeys.push(prev.sceneKeys[j]); base.source.scenes.push(s);
        prev.errors.forEach(function (e) { if (e.scene === j) { var c = {}; for (var q in e) if (has(e, q)) c[q] = e[q]; c.scene = base.scenes.length - 1; base.errors.push(c); } });
      } else base = PD.compileScene(base, i, s);
    }
    return base;
  }
  function compiled() {
    if (!proj) return null;
    if (cache.compiled && !cache.pending) return cache.compiled;
    var src = compileSource(), p = cache.pending, prev = cache.compiled, c;
    cache.error = null;
    try {
      if (typeof src === 'string') c = PD.compile(src);
      else if (prev && p && !p.full && !p.themeChanged) c = incremental(prev, src, p);
      else c = PD.compile(src, { assetsDeckId: proj.deck.id });
    } catch (e) {
      cache.error = e;
      try { console.error('studio: the deck did not compile', e); } catch (e2) { }
      var fb = { format: 2, id: proj.deck.id, meta: { title: (proj.deck.meta || {}).title || '', theme: 'cosmos', story: (proj.deck.meta || {}).story }, scenes: [] };
      c = PD.compile(fb, { assetsDeckId: proj.deck.id });
    }
    cache.compiled = c; cache.pending = null;
    return c;
  }

  /* ---------------------------------------------------------- lint and timing */
  function emptyLint() { return { findings: [], score: 100, ready: true, counts: { error: 0, warn: 0, info: 0 }, summary: '', estimated: true, total: 0, timing: null, ruleErrors: [], ms: 0 }; }
  function runLint() {
    if (!proj) return null;
    var c = compiled(), t = cache.timing, res;
    try { res = PD.story.lint(c, t ? PD.story.retime(c, t) : undefined); }
    catch (e) { try { console.error('studio: lint failed', e); } catch (e2) { } res = emptyLint(); res.error = e; }
    cache.lint = res;
    emit('lint', res);
    return res;
  }
  function lint() { return cache.lint || (proj ? runLint() : emptyLint()); }
  function runTiming() {
    if (timingRun && timingRun.cancel) { try { timingRun.cancel(); } catch (e) { } }
    timingRun = null;
    if (!proj) return;
    var c = compiled();
    if (!c || !c.scenes.length) { cache.timing = null; return; }
    var mine = PD.story.timing(c, { cache: true });
    timingRun = mine;
    mine.then(function (t) {
      if (timingRun !== mine || !t || !proj) return;
      timingRun = null;
      cache.timing = t; cache.timingFor = c;
      emit('timing', t);
      runLint();
    });
  }
  function wantsTiming() { return routeName === 'board' || routeName === 'rehearse' || routeName === 'export'; }
  function scheduleLint() {
    clearTimeout(timers.lint);
    timers.lint = setTimeout(function () {
      timers.lint = 0;
      if (!proj) return;
      runLint();
      if (wantsTiming()) runTiming();
    }, LINT_MS);
  }

  /* ---------------------------------------------------------- autosave */
  function saveState() { return { state: status.state, quota: status.quota, at: status.at, error: status.error }; }
  function scheduleAutosave() {
    if (!proj || proj.studio.readOnly || proj.studio.sample) return;
    status.state = 'pending'; emit('status', saveState());
    clearTimeout(timers.autosave);
    timers.autosave = setTimeout(flush, AUTOSAVE_MS);
  }
  // a deck nobody has written anything into is not worth a place in the Continue list
  function pristine(p) {
    var m = p.deck.meta || {}, st = m.story || {}, b = interview.blank();
    if (p.deck.scenes.length || Object.keys(p.assets).length || p.studio.titleAuto === false || m.themePatch) return false;      // a name typed by the author is content too
    for (var k in b) if (has(b, k) && JSON.stringify(st[k]) !== JSON.stringify(b[k])) return false;
    return true;
  }
  function flush() {
    clearTimeout(timers.autosave); timers.autosave = 0;
    if (!proj || proj.studio.readOnly || proj.studio.sample) return;
    if (pristine(proj) && !persist.loadProject(proj.id)) { status = { state: 'idle', quota: false, at: 0, error: null }; emit('status', saveState()); return; }
    var r = persist.saveProject(proj);
    if (r.ok) status = { state: 'saved', quota: false, at: Date.now(), error: null };
    else { status = { state: 'error', quota: !!r.quota, at: Date.now(), error: r.error || null }; emit('quota', saveState()); }
    emit('status', saveState());
  }

  /* ---------------------------------------------------------- open / close */
  function validSelection() {
    var sel = proj.studio.selected || { sceneId: null, step: 0 }, ids = proj.deck.scenes.map(function (s) { return s.id; });
    if (sel.sceneId != null && ids.indexOf(sel.sceneId) >= 0) return;
    setSelected(ids.length ? ids[0] : null, 0, true);
  }
  function open(p) {
    proj = p; curKey = null; undoStack = []; redoStack = []; lastCommit = { label: null, at: 0 };
    cache = fresh();
    clearTimeout(timers.lint);
    if (timingRun && timingRun.cancel) { try { timingRun.cancel(); } catch (e) { } }
    timingRun = null;
    status = { state: 'idle', quota: false, at: 0, error: null };
    syncAssets();
    validSelection();
    emit('project', proj);
  }
  function close() {
    if (proj) flush();
    clearTimeout(timers.lint);
    if (timingRun && timingRun.cancel) { try { timingRun.cancel(); } catch (e) { } }
    timingRun = null;
    proj = null; curKey = null; cache = fresh(); undoStack = []; redoStack = [];
    emit('project', null);
  }

  /* ---------------------------------------------------------- commit / undo */
  function setSelected(sceneId, step, quiet) {
    var cur = proj.studio.selected || {};
    if (cur.sceneId === sceneId && cur.step === step) return;
    proj = swapStudio({ selected: { sceneId: sceneId, step: step } });
    if (!quiet) { scheduleAutosave(); emit('select', { sceneId: sceneId, step: step }); }
  }
  function swapStudio(patch) {
    var st = {};
    for (var k in proj.studio) if (has(proj.studio, k)) st[k] = proj.studio[k];
    for (var k2 in patch) if (has(patch, k2)) st[k2] = patch[k2];
    var n = {};
    for (var k3 in proj) if (has(proj, k3)) n[k3] = proj[k3];
    n.studio = st;
    return n;
  }
  function select(sceneId, step) {
    if (!proj) return;
    var ids = proj.deck.scenes.map(function (s) { return s.id; });
    if (sceneId != null && ids.indexOf(sceneId) < 0) return;
    var n = sceneId == null ? 0 : Math.max(0, step | 0);
    setSelected(sceneId == null ? null : sceneId, n, false);
  }
  function selection() {
    var s = proj && proj.studio.selected || { sceneId: null, step: 0 };
    return { sceneId: s.sceneId, step: s.step | 0 };
  }

  function afterChange(label, ev, undoDir) {
    curKey = null;
    addPending(ev);
    ev.label = label;
    if (undoDir) ev.undo = undoDir;
    var ids = proj.deck.scenes.map(function (s) { return s.id; }), sel = proj.studio.selected;
    if (sel.sceneId != null && ids.indexOf(sel.sceneId) < 0) {
      var at = Math.min(ids.length - 1, Math.max(0, (ev.removedAt != null ? ev.removedAt : 0)));
      setSelected(ids.length ? ids[Math.max(0, at)] : null, 0, false);
    }
    emit('change', ev);
    scheduleAutosave();
    scheduleLint();
  }

  function commit(label, mutate) {
    if (!proj || proj.studio.readOnly || typeof mutate !== 'function') return false;
    var before = proj, beforeKey = curKey || (curKey = keyOf(before)), draft = clone(before);
    mutate(draft);
    draft.v = 1; draft.id = before.id; draft.deck.id = before.deck.id;
    if (!draft.studio) draft.studio = clone(before.studio);
    if (keyOf(draft) === beforeKey) {
      // nothing in the deck or its assets changed; a change to the studio fields alone is kept but is not an undo step
      if (JSON.stringify(draft.studio) === JSON.stringify(before.studio)) return false;
      proj = draft; emit('studio', draft.studio); scheduleAutosave();
      return true;
    }
    var now = Date.now();
    var merge = !!label && label === lastCommit.label && now - lastCommit.at < COALESCE_MS && undoStack.length > 0;
    if (!merge) { undoStack.push(before); if (undoStack.length > UNDO_MAX) undoStack.shift(); }
    lastCommit = { label: label, at: now };
    redoStack = [];
    draft.deck.format = 2;
    draft.deck.meta.updated = new Date(now).toISOString();
    draft.deck.meta.generator = GENERATOR;
    var ev = diff(before, draft);
    var removed = before.deck.scenes.findIndex(function (s) { return !draft.deck.scenes.some(function (t) { return t.id === s.id; }); });
    if (removed >= 0) ev.removedAt = removed;
    proj = draft;
    // a project that now has scenes is no longer a blank page; keep the shell's progress honest
    afterChange(label, ev, null);
    return true;
  }
  function restore(snap, dir) {
    var before = proj, n = {};
    for (var k in snap) if (has(snap, k)) n[k] = snap[k];
    n.studio = before.studio;
    proj = n;
    syncAssets();
    var ev = diff(before, proj);
    afterChange(dir, ev, dir);
  }
  function undo() {
    if (!proj || proj.studio.readOnly || !undoStack.length) return false;
    redoStack.push(proj);
    lastCommit = { label: null, at: 0 };
    restore(undoStack.pop(), 'undo');
    return true;
  }
  function redo() {
    if (!proj || proj.studio.readOnly || !redoStack.length) return false;
    undoStack.push(proj);
    lastCommit = { label: null, at: 0 };
    restore(redoStack.pop(), 'redo');
    return true;
  }
  function patchStudio(patch) {
    if (!proj) return;
    var changed = false;
    for (var k in patch) if (has(patch, k) && JSON.stringify(proj.studio[k]) !== JSON.stringify(patch[k])) changed = true;
    if (!changed) return;
    proj = swapStudio(patch);
    emit('studio', patch);
    scheduleAutosave();
  }
  function setReadOnly(flag) {
    if (!proj || !!proj.studio.readOnly === !!flag) return;
    proj = swapStudio({ readOnly: !!flag });
    emit('lock', { readOnly: !!flag });
    if (!flag) scheduleAutosave();
  }
  function markSaved(info) {
    if (!proj) return;
    var patch = { savedHash: hash(), savedAt: new Date().toISOString() };
    if (info && info.fileName) patch.fileName = info.fileName;
    patchStudio(patch);
  }

  /* ---------------------------------------------------------- the interview, written into the story */
  function firstWords(text, n) { return String(text || '').trim().split(/\s+/).slice(0, n).join(' '); }
  function answer(id, value) {
    return commit('Brief: ' + id, function (d) {
      var m = d.deck.meta;
      m.story = interview.set(m.story || interview.blank(), id, value);
      if (id === 'tone' && !d.studio.themeChosen && m.story.tone) {
        var t = fws.defaultTheme(m.story.tone);
        if (t !== m.theme) {
          m.theme = t;
          if (t === 'slate' && m.themePatch && m.themePatch.world) { delete m.themePatch.world.nebula; if (!Object.keys(m.themePatch.world).length) delete m.themePatch.world; }
        }
      }
      if (d.studio.titleAuto !== false && (id === 'brand' || id === 'shortIdea' || id === 'bigIdea')) {
        var st = m.story;
        m.title = (st.brand || '').trim() || (st.shortIdea || '').trim() || firstWords(st.bigIdea, 5) || 'Untitled talk';
      }
    });
  }

  /* ---------------------------------------------------------- assets */
  function assets() {
    var out = {};
    if (!proj) return out;
    var reg = PD.assets.get(proj.studio.registeredId || proj.deck.id);
    for (var id in reg) if (has(reg, id)) out[id] = reg[id];
    return out;
  }
  function totalBytes() { var t = 0, a = assets(); for (var k in a) if (has(a, k)) t += a[k].bytes || 0; return t; }
  function mb(n) { return (n / 1048576).toFixed(n >= 10485760 ? 0 : 1); }
  function addFiles(list) {
    var arr = Array.prototype.slice.call(list || []), result = { added: [], rejected: [], warnings: [] };
    var refuse = function (msg) { result.rejected = arr.map(function (f) { return { name: f.name, msg: msg, message: msg }; }); return Promise.resolve(result); };
    if (!proj) return refuse('Open or start a deck first.');
    if (proj.studio.readOnly) return refuse('This deck is read-only.');
    var deckId = proj.deck.id;
    return files.addFiles(arr, { deckId: deckId }).then(function (res) {
      result.rejected = res.rejected; result.warnings = res.warnings.slice(); result.added = res.added;
      if (res.added.length) {
        commit('Add ' + (res.added.length === 1 ? res.added[0].id : res.added.length + ' files'), function (d) { res.added.forEach(function (a) { d.assets[a.id] = a.hash; }); });
        res.added.forEach(function (a) {
          var rec = assetRecs[a.hash];
          if (rec && rec.type === 'image' && rec.bytes > files.BIG_IMAGE) result.warnings.push({ kind: 'big-image', id: a.id, msg: a.id + ' is ' + mb(rec.bytes) + ' MB even after shrinking. Big pictures can slow the deck down.' });
        });
      }
      if (totalBytes() > files.BIG_TOTAL) result.warnings.push({ kind: 'big-total', msg: 'Your assets add up to ' + mb(totalBytes()) + ' MB. The saved file will be large, and slow to open.' });
      if (!res.added.length) return result;
      readyP = PD.assets.ready(deckId, { fontFaces: themeFaces() });
      return readyP.then(function () {
        if (res.added.some(function (a) { return a.kind === 'font'; }) && PD.story.lint && PD.story.lint.clearCache) PD.story.lint.clearCache();
        emit('assets', result);
        return result;
      });
    });
  }
  function removeAsset(id) {
    if (!proj || proj.studio.readOnly || !has(proj.assets, id)) return false;
    var ok = commit('Remove ' + id, function (d) {
      delete d.assets[id];
      var p = d.deck.meta.themePatch;
      if (p && Array.isArray(p.fontFaces) && p.fontFaces.some(function (f) { return f.asset === id; })) clearFontPatch(d.deck.meta);
    });
    if (ok) { PD.assets.remove(proj.deck.id, id); emit('assets', { removed: id }); }
    return ok;
  }

  function baseDisplayFont(themeId) {
    try { return PD.theme.resolve(themeId).fonts.display; } catch (e) { return 'system-ui, sans-serif'; }
  }
  function cleanPatch(m) {
    var p = m.themePatch;
    if (!p) return;
    ['fonts', 'world', 'roles'].forEach(function (k) { if (p[k] && !Object.keys(p[k]).length) delete p[k]; });
    if (p.fontFaces && !p.fontFaces.length) delete p.fontFaces;
    if (!Object.keys(p).length) delete m.themePatch;
  }
  function clearFontPatch(m) {
    var p = m.themePatch;
    if (!p) return;
    delete p.fontFaces;
    if (p.fonts) delete p.fonts.display;
    cleanPatch(m);
  }
  // the brand font is written as fontFaces + fonts.display in the theme patch (spec §7.2, Look)
  function brandFont() {
    var p = proj && proj.deck.meta.themePatch, f = p && p.fontFaces && p.fontFaces[0];
    return f ? { asset: f.asset, family: f.family } : null;
  }
  function setBrandFont(assetId, family) {
    if (!proj || proj.studio.readOnly) return Promise.resolve(false);
    if (!assetId) { commit('Brand font', function (d) { clearFontPatch(d.deck.meta); }); return Promise.resolve(true); }
    var src = PD.assets.get(proj.deck.id)[assetId];
    if (!src || src.type !== 'font') return Promise.resolve(false);
    var fam = String(family || src.family || assetId).replace(/["\\]/g, '').trim() || 'Brand font';
    // the face must exist before the deck is compiled against it: measuring text with a missing font would cache the wrong widths
    return PD.assets.ready(proj.deck.id, { fontFaces: [{ family: fam, asset: assetId }] }).then(function (res) {
      if (res && res.failed && res.failed.some(function (f) { return f.id === assetId; })) return false;     // the browser could not use it
      if (PD.story.lint && PD.story.lint.clearCache) PD.story.lint.clearCache();
      commit('Brand font', function (d) {
        var m = d.deck.meta;
        m.themePatch = m.themePatch || {};
        m.themePatch.fontFaces = [{ family: fam, asset: assetId }];
        m.themePatch.fonts = m.themePatch.fonts || {};
        m.themePatch.fonts.display = '"' + fam + '", ' + baseDisplayFont(m.theme);
      });
      return true;
    });
  }
  // after a look change the brand font has to ride on the new theme's fallback stack
  function refitFont(m) {
    var p = m.themePatch, f = p && p.fontFaces && p.fontFaces[0];
    if (f) { p.fonts = p.fonts || {}; p.fonts.display = '"' + f.family + '", ' + baseDisplayFont(m.theme); }
  }

  function themeInfo() {
    if (!proj) return null;
    var m = proj.deck.meta || {}, t;
    try { t = PD.theme.resolve(m.theme, m.themePatch); } catch (e) { return { id: m.theme, label: m.theme, worlds: [], accent: '#ef7d57' }; }
    return { id: t.id, label: t.label, worlds: t.worlds.slice(), accent: t.ui && t.ui.accent || '#ef7d57', theme: t };
  }
  function sceneIndex(id) { return proj ? proj.deck.scenes.findIndex(function (s) { return s.id === id; }) : -1; }

  function route(name) {
    if (name === undefined) return routeName;
    if (typeof name !== 'string' || !name) return routeName;
    var changed = name !== routeName;
    routeName = name;
    if (proj && name !== 'welcome') {
      var vis = proj.studio.visited || {};
      if (proj.studio.screen !== name || !vis[name]) {
        var v = {}; for (var k in vis) if (has(vis, k)) v[k] = vis[k];
        v[name] = 1;
        proj = swapStudio({ screen: name, visited: v });
        scheduleAutosave();
      }
    }
    if (changed) emit('route', name);
    if (proj && wantsTiming() && (!cache.timing || cache.timingFor !== cache.compiled) && !timingRun) { compiled(); runTiming(); }
    return routeName;
  }

  var store = {
    get: function () { return proj; },
    commit: commit, undo: undo, redo: redo,
    canUndo: function () { return !!proj && !proj.studio.readOnly && undoStack.length > 0; },
    canRedo: function () { return !!proj && !proj.studio.readOnly && redoStack.length > 0; },
    select: select, selection: selection, compiled: compiled, lint: lint,
    timing: function () { return cache.timing; },
    on: on, route: route,
    // additive
    open: open, close: close, blankProject: blankProject, projectFromDeck: projectFromDeck, sampleProject: sampleProject,
    answer: answer, patchStudio: patchStudio, setReadOnly: setReadOnly, hash: hash, isSaved: isSaved, markSaved: markSaved,
    saveState: saveState, flush: flush,
    assets: assets, addFiles: addFiles, importFiles: addFiles, removeAsset: removeAsset, setBrandFont: setBrandFont, brandFont: brandFont,
    refitFont: refitFont, baseDisplayFont: baseDisplayFont, totalBytes: totalBytes,
    assetsReady: function () { return readyP; }, missingAssets: function () { return missing.slice(); },
    cacheRecords: cacheRecords, sceneIndex: sceneIndex, themeInfo: themeInfo, compileError: function () { return cache.error; },
    runLint: runLint, runTiming: runTiming, cleanPatch: cleanPatch, GENERATOR: GENERATOR,
    _kick: function () { if (!proj) return; runLint(); if (wantsTiming()) runTiming(); }
  };
  S.store = store;
  return store;
}, { export: false });
