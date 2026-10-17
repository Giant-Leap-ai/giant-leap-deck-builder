/* tools/test/fixtures/wp7-studio-stub.js — a stand-in for the WP6 shell and store, so WP7's screens can be driven alone.
 *
 * It implements the §7.8 contract on top of the real engine (PD.compile, PD.compileScene, PD.story.lint,
 * PD.story.timing), not on mocks:
 *   Studio.store = { get, commit, undo, redo, canUndo, canRedo, select, selection, compiled, lint, timing, on, route }
 *   Studio.screen(name, { title, rail, mount(el, ctx) → { unmount } })
 * plus a minimal shell (header, rail, a screen container) and ctx = { store, PD, ui: { toast, confirm, banner }, nav }.
 * Commits with the same label inside one second share one undo entry ("typing is coalesced per field").
 *
 *   Studio.stub.boot(kind, opts?) → { store, nav, ctx, shell }
 *     kind: 'replica'  the editable template replica of One Giant Leap (decks/_parity)
 *           'ogl'      the read-only hand-written sample (decks/one-giant-leap)
 *           'story'    a fresh storyboard built by PD.story.board from a sample brief (placeholders remain)
 *           'empty'    a project with no scenes
 *     opts: { screen: 'board', theme: 'cosmos'|'slate', targetMin, answers: 'all'|'some'|'none', assets: bool }
 * A classic script: it runs from file:// with no network. Test code only; not part of the shipped Studio. */
(function (g) {
  var PD = g.PD;
  var Studio = g.Studio = g.Studio || {};
  Studio.screens = Studio.screens || {};
  Studio.screen = function (name, def) { Studio.screens[name] = def; };
  Object.keys(PD.studioScreens || {}).forEach(function (n) { Studio.screens[n] = PD.studioScreens[n]; });

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ------------------------------------------------------------------ the store */
  function createStore(project, opts) {
    opts = opts || {};
    var P = project, undo = [], redo = [], listeners = { change: [], select: [], lint: [], timing: [], route: [], assets: [], studio: [], lock: [], status: [], project: [], quota: [] };
    var compiledC = null, lintC = null, lintDirty = true, lintTimer = 0, timingC = null, timingRun = null;
    var lastLabel = null, lastAt = 0, route = 'board';

    function emit(ev, payload) { listeners[ev].slice().forEach(function (f) { try { f(payload); } catch (e) { console.error('store listener', ev, e); } }); }
    function compileAll() {
      if (opts.compileId) return PD.compile(opts.compileId);
      return PD.compile(P.deck);
    }
    function sceneIds(p) { return p.deck.scenes.map(function (s) { return s.id; }); }
    function diff(a, b) {
      var ia = sceneIds(a), ib = sceneIds(b), structural = !same(ia, ib);
      var byId = {};
      a.deck.scenes.forEach(function (s) { byId[s.id] = JSON.stringify(s); });
      var changed = [];
      b.deck.scenes.forEach(function (s) { if (byId[s.id] !== JSON.stringify(s)) changed.push(s.id); });
      var themeChanged = !same(a.deck.meta.theme, b.deck.meta.theme) || !same(a.deck.meta.themePatch, b.deck.meta.themePatch) || !same(a.deck.meta.worlds, b.deck.meta.worlds);
      var assetsChanged = !same(a.assets, b.assets);
      var metaChanged = !same(a.deck.meta, b.deck.meta);
      return { changedSceneIds: changed, themeChanged: themeChanged, structural: structural, assetsChanged: assetsChanged, metaChanged: metaChanged };
    }
    function recompile(prevProject, d) {
      if (d.structural || d.themeChanged || d.metaChanged || d.assetsChanged || !compiledC || opts.compileId) { compiledC = compileAll(); return; }
      var c = compiledC;
      d.changedSceneIds.forEach(function (id) {
        var i = sceneIds(P).indexOf(id);
        if (i >= 0) c = PD.compileScene(c, i, P.deck.scenes[i]);
      });
      compiledC = c;
    }
    function scheduleLint() {
      lintDirty = true;
      clearTimeout(lintTimer);
      lintTimer = setTimeout(function () { runLint(); emit('lint', lintC); }, 300);
    }
    function runLint() { lintC = PD.story.lint(store.compiled(), timingC); lintDirty = false; return lintC; }
    function scheduleTiming() {
      if (timingRun && timingRun.cancel) timingRun.cancel();
      var mine = timingRun = PD.story.timing(store.compiled());
      mine.then(function (t) { if (mine !== timingRun || !t) return; timingC = t; emit('timing', t); });
    }
    function apply(next, label, coalesce) {
      var prev = P, d = diff(prev, next);
      if (!coalesce) { undo.push(prev); if (undo.length > 100) undo.shift(); redo = []; }
      P = next;
      recompile(prev, d);
      scheduleLint(); scheduleTiming();
      emit('change', { changedSceneIds: d.changedSceneIds, themeChanged: d.themeChanged, structural: d.structural, label: label });
    }

    var store = {
      get: function () { return P; },
      commit: function (label, mutate) {
        if (P.studio.readOnly) return false;                       // as the real store: a read-only deck takes no commit
        var next = clone(P);
        mutate(next);
        var now = Date.now(), coalesce = label === lastLabel && now - lastAt < 1000 && undo.length > 0;
        lastLabel = label; lastAt = now;
        apply(next, label, coalesce);
        return true;
      },
      undo: function () { if (!undo.length) return; var prev = undo.pop(); redo.push(P); lastLabel = null; var d = diff(P, prev); P = prev; recompile(null, d); scheduleLint(); scheduleTiming(); emit('change', { changedSceneIds: d.changedSceneIds, themeChanged: d.themeChanged, structural: d.structural, label: 'undo' }); },
      redo: function () { if (!redo.length) return; var nx = redo.pop(); undo.push(P); lastLabel = null; var d = diff(P, nx); P = nx; recompile(null, d); scheduleLint(); scheduleTiming(); emit('change', { changedSceneIds: d.changedSceneIds, themeChanged: d.themeChanged, structural: d.structural, label: 'redo' }); },
      canUndo: function () { return undo.length > 0; },
      canRedo: function () { return redo.length > 0; },
      select: function (sceneId, step) {
        var sel = P.studio.selected;
        if (sel.sceneId === sceneId && sel.step === (step || 0)) return;
        P = clone(P); P.studio.selected = { sceneId: sceneId == null ? null : sceneId, step: step || 0 };
        emit('select', P.studio.selected);
      },
      selection: function () { return { sceneId: P.studio.selected.sceneId, step: P.studio.selected.step }; },
      compiled: function () { if (!compiledC) compiledC = compileAll(); return compiledC; },
      lint: function () { if (lintDirty || !lintC) runLint(); return lintC; },
      timing: function () { return timingC; },
      on: function (ev, fn) {
        if (!listeners[ev]) throw new Error('stub store: unknown event ' + ev);
        listeners[ev].push(fn);
        return function () { var i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
      },
      route: function (name) { if (name != null && name !== route) { route = name; emit('route', name); } return route; },
      _undoDepth: function () { return undo.length; },
      _kick: function () { scheduleTiming(); }
    };
    return store;
  }

  /* ------------------------------------------------------------------ sample projects */
  var SAMPLE_STORY = {
    framework: 'giant-leap', goal: 'inspire', audience: 'ops leaders who see AI as headcount reduction', targetMin: 10,
    bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
    shortIdea: 'Augmentation, not automation', oldWay: 'automation', newWay: 'augmentation',
    ask: 'Pilot one human-centred use case by Friday', proof: [{ kind: 'number', text: 'of work time goes to tasks software can do', value: 62 }],
    brand: 'Northwind', tagline: 'Making work more human', tone: 'cinematic'
  };
  function blankStory() { return PD.story.interview.blank(); }

  function makeProject(kind, o) {
    o = o || {};
    var P = { v: 1, id: 'stub-' + kind, assets: {}, studio: { screen: o.screen || 'board', selected: { sceneId: null, step: 0 }, readOnly: false } }, opts = {};
    if (kind === 'ogl') {
      var c = PD.compile('one-giant-leap');
      P.deck = c.source; P.studio.readOnly = true; P.id = 'one-giant-leap'; opts.compileId = 'one-giant-leap';
    } else if (kind === 'replica') {
      var src = clone(PD.compile('parity').source);
      src.id = 'stub-replica'; src.meta.title = 'One Giant Leap (replica)';
      P.deck = src;
    } else if (kind === 'story') {
      var story = clone(SAMPLE_STORY);
      if (o.answers === 'none') story = blankStory(), story.framework = 'giant-leap';
      else if (o.answers === 'some') { story.shortIdea = ''; story.ask = ''; story.proof = []; story.tagline = ''; }
      if (o.targetMin !== undefined) story.targetMin = o.targetMin;
      var theme = o.theme || 'cosmos';
      P.deck = { format: 2, id: 'stub-story', meta: { title: story.brand || 'Untitled', theme: theme, story: story, generator: 'studio@2.0.0' },
        scenes: PD.story.board(story, { framework: story.framework, theme: theme }) };
    } else {
      P.deck = { format: 2, id: 'stub-empty', meta: { title: 'Untitled', theme: o.theme || 'cosmos', story: Object.assign(blankStory(), { framework: o.framework || 'blank' }), generator: 'studio@2.0.0' }, scenes: [] };
    }
    if (o.theme && kind !== 'story' && kind !== 'empty') P.deck.meta.theme = o.theme;
    return { project: P, opts: opts };
  }

  /* ------------------------------------------------------------------ the shell */
  var CSS =
    ':root { --bg:#1a1c2c; --panel:#232539; --line:#333c57; --text:#f4f4f4; --muted:#94b0c2; --accent:#ef7d57; }' +
    '* { box-sizing: border-box; } html, body { margin:0; height:100%; background:var(--bg); color:var(--text); overflow:hidden;' +
    ' font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }' +
    '#stub { display:flex; flex-direction:column; height:100vh; }' +
    '#stub-head { flex:none; display:flex; align-items:center; gap:18px; padding:10px 20px; border-bottom:1px solid var(--line); min-height:56px; }' +
    '#stub-head .t { font-weight:650; font-size:15px; } #stub-head .t small { color:var(--muted); font-weight:500; margin-left:8px; }' +
    '#stub-rail { display:flex; gap:6px; margin-left:12px; } #stub-rail button { all:unset; cursor:pointer; padding:6px 12px; border-radius:99px; color:var(--muted); font-size:13px; }' +
    '#stub-rail button.on { background:#2b2f4a; color:var(--text); box-shadow: inset 0 0 0 1px var(--accent); }' +
    '#stub-head .sp { flex:1; } #stub-head .b { all:unset; cursor:pointer; padding:7px 12px; border:1px solid var(--line); border-radius:8px; color:var(--text); font-size:13px; }' +
    '#stub-head .b[disabled] { opacity:.35; cursor:default; }' +
    '#stub-head .ok { color:#a7f070; font-size:13px; }' +
    '#stub-log { flex:none; padding:5px 20px; color:var(--muted); font-size:13px; border-bottom:1px solid var(--line); min-height:30px; }' +
    '#stub-screen { flex:1; min-height:0; position:relative; }' +
    '.stub-toast { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); background:#2b2f4a; border:1px solid var(--line); padding:10px 16px; border-radius:10px; z-index:9000; }' +
    '.stub-banner { position:fixed; left:0; right:0; top:0; padding:8px 20px; background:#7a4a14; color:#fff; z-index:9000; font-size:13px; }' +
    '.stub-modal { position:fixed; inset:0; background:rgba(0,0,0,.55); display:grid; place-items:center; z-index:9500; }' +
    '.stub-modal > div { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:22px; max-width:440px; } .stub-modal button { margin-top:16px; margin-right:8px; padding:8px 14px; }';

  function boot(kind, o) {
    o = o || {};
    var made = makeProject(kind, o);
    var store = createStore(made.project, made.opts);
    var doc = document;
    var style = doc.createElement('style'); style.textContent = CSS; doc.head.appendChild(style);
    doc.body.innerHTML = '';
    var root = doc.createElement('div'); root.id = 'stub';
    root.innerHTML = '<div id="stub-head"><span class="t"></span><div id="stub-rail"></div><span class="sp"></span><span class="ok">Saved</span>' +
      '<button class="b" id="stub-undo">Undo</button><button class="b" id="stub-redo">Redo</button></div><div id="stub-log"></div><div id="stub-screen"></div>';
    doc.body.appendChild(root);
    var screenEl = root.querySelector('#stub-screen'), cur = null, curName = null;
    root.querySelector('.t').innerHTML = '';
    var title = root.querySelector('.t'); title.textContent = made.project.deck.meta.title;
    var rail = root.querySelector('#stub-rail');
    var RAIL = [['brief', 'Brief'], ['shape', 'Shape'], ['look', 'Look'], ['board', 'Storyboard'], ['rehearse', 'Rehearse'], ['export', 'Save']];
    RAIL.forEach(function (r, i) {
      var b = doc.createElement('button'); b.textContent = (i + 1) + ' ' + r[1]; b.dataset.screen = r[0];
      b.onclick = function () { nav(r[0]); }; rail.appendChild(b);
    });
    var undoB = root.querySelector('#stub-undo'), redoB = root.querySelector('#stub-redo');
    function refreshHead() { undoB.disabled = !store.canUndo(); redoB.disabled = !store.canRedo(); }
    undoB.onclick = function () { store.undo(); }; redoB.onclick = function () { store.redo(); };
    store.on('change', refreshHead); refreshHead();
    var story = made.project.deck.meta.story;
    root.querySelector('#stub-log').textContent = story && PD.story.logline ? PD.story.logline(story) : '';

    var ui = {
      toast: function (msg) { var t = doc.createElement('div'); t.className = 'stub-toast'; t.textContent = msg; doc.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); },
      confirm: function (msg) {
        return new Promise(function (res) {
          var m = doc.createElement('div'); m.className = 'stub-modal';
          m.innerHTML = '<div><p></p><button data-y>OK</button><button data-n>Cancel</button></div>'; m.querySelector('p').textContent = msg;
          m.querySelector('[data-y]').onclick = function () { m.remove(); res(true); }; m.querySelector('[data-n]').onclick = function () { m.remove(); res(false); };
          doc.body.appendChild(m);
        });
      },
      banner: function (msg, kind2) { var b = doc.createElement('div'); b.className = 'stub-banner'; b.textContent = msg; b.dataset.kind = kind2 || 'info'; doc.body.appendChild(b); setTimeout(function () { b.remove(); }, 4000); }
    };
    var ctx = { store: store, PD: PD, ui: ui, nav: nav };

    function nav(name) {
      var def = Studio.screens[name];
      if (cur) { try { cur.unmount(); } catch (e) { console.error('unmount', e); } cur = null; }
      screenEl.innerHTML = '';
      curName = name; store.route(name);
      [].forEach.call(rail.children, function (b) { b.className = b.dataset.screen === name ? 'on' : ''; });
      if (!def) { screenEl.textContent = 'Screen "' + name + '" is not part of this stub.'; return; }
      var host = doc.createElement('div'); host.style.cssText = 'position:absolute;inset:0;'; screenEl.appendChild(host);
      cur = def.mount(host, ctx) || { unmount: function () { } };
    }
    var shell = { root: root, screen: screenEl, title: title };
    Studio.stub.last = { store: store, nav: nav, ctx: ctx, shell: shell, current: function () { return curName; } };
    // assets for the scenes that need them (a logo with alpha, a photo, a font) — see makeAssets
    if (o.assets) Studio.stub.addSampleAssets(store);
    var sel = made.project.studio.selected;
    if (!sel.sceneId && made.project.deck.scenes.length) store.select(made.project.deck.scenes[0].id, 0);
    nav(o.screen || 'board');
    return Studio.stub.last;
  }

  /* sample assets: a transparent logo (a ring and a bar), a photo (a gradient landscape) and a tiny font-less record */
  function dataURL(w, h, paint, type) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return c.toDataURL(type || 'image/png');
  }
  function addSampleAssets(store) {
    var id = store.get().deck.id;
    var logo = dataURL(1200, 400, function (x, w, h) {
      x.strokeStyle = '#ffd27a'; x.lineWidth = 36; x.beginPath(); x.arc(200, 200, 140, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#ffffff'; x.fillRect(420, 150, 640, 100);
    });
    var photo = dataURL(1600, 900, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#23305f'); g.addColorStop(0.55, '#d77a5a'); g.addColorStop(1, '#2b1f2e');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#10121c'; x.beginPath(); x.moveTo(0, h); x.lineTo(0, h * 0.72); x.lineTo(w * 0.3, h * 0.6); x.lineTo(w * 0.55, h * 0.78); x.lineTo(w * 0.8, h * 0.58); x.lineTo(w, h * 0.7); x.lineTo(w, h); x.fill();
    }, 'image/jpeg');
    PD.assets.put(id, 'logo', { type: 'image', src: logo, w: 1200, h: 400, name: 'logo.png', bytes: Math.round(logo.length * 0.75) });
    PD.assets.put(id, 'ridge', { type: 'image', src: photo, w: 1600, h: 900, name: 'ridge.jpg', bytes: Math.round(photo.length * 0.75) });
    store.commit('Add sample assets', function (d) { d.assets.logo = 'h-logo'; d.assets.ridge = 'h-ridge'; });
    return PD.assets.ready(id);
  }

  Studio.stub = { boot: boot, createStore: createStore, makeProject: makeProject, addSampleAssets: addSampleAssets, SAMPLE_STORY: SAMPLE_STORY, clone: clone };
})(window);
