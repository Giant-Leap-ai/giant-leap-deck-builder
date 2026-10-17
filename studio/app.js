/* studio/app.js — the Studio shell (spec §7.1, §7.3 header, §7.8 Studio.screen, WP6).
 *
 * One page, one header: the brand, the deck's name, the progress rail ① Brief · ② Shape · ③ Look · ④ Storyboard ·
 * ⑤ Rehearse · ⑥ Save & export (never locked; a step shows its check when its done-when condition holds), the save state,
 * undo / redo, and the primary button, which always reads "Next: …". The logline sits under the header from ② on.
 *
 *   PD.studio.screen(name, { title, rail?: 1..6, mount(el, ctx) → { unmount() } })      register a screen (§7.8)
 *       ctx = { store, PD, ui: { toast(msg, kind?), confirm(msg, opts?) → Promise<bool>, banner(msg, kind, opts?) → { close() },
 *                                dialog(opts) → Promise, h, icon, … }, nav(name), studio }
 *       Screens in this build: welcome brief shape look export (WP6), board rehearse (WP7; a plain stand-in shows when
 *       they are not installed). A screen that throws while mounting is replaced by a notice; the shell keeps running.
 *   PD.studio.start(rootEl?)              builds the shell and shows Welcome (index.html calls it once)
 *   PD.studio.nav(name)                   = store.route(name)
 *   PD.studio.newProject() openSample('ogl' | 'replica') continueProject(id) openFile(file) closeProject() forgetProject(id)
 *   PD.studio.pickFiles({ accept, multiple }) → Promise<File[]>       the system file chooser
 *   PD.studio.setDropHint(text | null)    the sentence on the full-window drop overlay (null: the default)
 *   PD.studio.railState() → [{ n, name, label, done, current }]       NEXT[route] → { to, label }
 *   PD.studio.beatColor(beat | roles) → '#rrggbb'                     one colour per story role, shared by Shape's chips
 *   PD.studio.stageView(canvas, compiled, opts?) → { play, replay, rest, setDeck, pause, destroy, stage }
 *                                          a live PD.Stage on a canvas (Welcome, Look); respects prefers-reduced-motion
 *   PD.studio.save (set by the Export screen) is what ⌘S calls.
 * Drop anywhere: pictures and fonts go through PD.studio.store.addFiles; a saved .html opens as a deck. A more specific drop
 * zone (the assets panel) wins: it calls preventDefault on the drop, and the window handler then leaves it alone.
 * Registration defines functions only; start() is the first DOM work. */
PD.module('studio/app', ['studio/persist', 'studio/import', 'studio/store', 'story/copy', 'story/frameworks', 'story/interview'],
function (PD, persist, files, store, copy, fws, interview) {
  var S = PD.studio;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var MAC = /Mac|iPhone|iPad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''), MOD = MAC ? '\u2318' : 'Ctrl+';   // ⌘ on a Mac, Ctrl+ elsewhere

  /* ---------------------------------------------------------- tiny DOM kit */
  function append(parent, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(parent, k); }); return; }
    parent.appendChild(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!has(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') for (var s in v) e.style.setProperty(s, v[s]);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    append(e, kids);
    return e;
  }
  function svg(tag, attrs, kids) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (has(attrs, k) && attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  var ICONS = {
    check: 'M5 12.5l4.2 4.2L19 7', plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6L6 18', arrow: 'M5 12h14M13 6l6 6-6 6', back: 'M19 12H5M11 6l-6 6 6 6',
    chev: 'M7 10l5 5 5-5', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14', file: 'M7 3h7l5 5v13H7zM14 3v5h5', font: 'M5 19L12 5l7 14M8 14h8', image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4',
    lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z', play: 'M8 5l11 7-11 7z', copy: 'M9 9h10v11H9zM5 15V4h10', spark: 'M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5', info: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 11v5M12 8v.5',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14', dots: 'M6 12h.01M12 12h.01M18 12h.01', folder: 'M3 7h7l2 2h9v10H3z', refresh: 'M20 12a8 8 0 10-2.3 5.7M20 5v6h-6'
  };
  function icon(name, size) {
    var d = ICONS[name] || ICONS.info, s = size || 18;
    return svg('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', 'class': 'pds-icon' },
      [svg('path', { d: d })]);
  }
  function ago(iso) {
    var t = typeof iso === 'number' ? iso : Date.parse(iso);
    if (!isFinite(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) { var m = Math.max(1, Math.round(s / 60)); return m + ' min ago'; }
    if (s < 86400) { var hr = Math.round(s / 3600); return hr + (hr === 1 ? ' hour ago' : ' hours ago'); }
    var d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function isEditable(t) { return !!t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable); }

  /* ---------------------------------------------------------- the flow */
  var RAIL = [
    { n: 1, name: 'brief', label: 'Brief' }, { n: 2, name: 'shape', label: 'Shape' }, { n: 3, name: 'look', label: 'Look' },
    { n: 4, name: 'board', label: 'Storyboard' }, { n: 5, name: 'rehearse', label: 'Rehearse' }, { n: 6, name: 'export', label: 'Save & export' }
  ];
  var NEXT = {};
  RAIL.forEach(function (r, i) { if (RAIL[i + 1]) NEXT[r.name] = { to: RAIL[i + 1].name, label: 'Next: ' + RAIL[i + 1].label }; });

  function placeholdersLeft(res) {
    return res ? res.findings.filter(function (f) { return f.id === 'copy.placeholder'; }).length : 0;
  }
  function doneOf(n, p) {
    if (!p) return false;
    var story = p.deck.meta.story || interview.blank(), vis = p.studio.visited || {};
    switch (n) {
      case 1: return interview.done(story);
      case 2: return !!story.framework && p.deck.scenes.length >= 1;
      case 3: return !!vis.look;
      case 4:
        if (p.deck.scenes.length < 1) return false;
        var res = store.lint();
        return res.findings.filter(function (f) { return f.sev === 'error'; }).length === 0 && placeholdersLeft(res) === 0;
      case 5: return !!vis.rehearse;
      case 6: return store.isSaved();
    }
    return false;
  }
  function railState() {
    var p = store.get(), cur = store.route();
    return RAIL.map(function (r) { return { n: r.n, name: r.name, label: r.label, done: doneOf(r.n, p), current: r.name === cur }; });
  }

  /* beat colours: one hue per story role, so the chips of Shape and the filmstrip of the board agree */
  var ROLE_COLOR = {
    hook: '#ffb347', setup: '#8aa4c8', identity: '#ff8f6b', scale: '#5ef1ff', relevance: '#53a8ff', emotion: '#ff6b9a', proof: '#6fe0a0',
    tension: '#ff8a3d', turn: '#b08cff', idea: '#7aa2ff', climax: '#ff5ea8', resolution: '#ffd27a', cta: '#ffd27a', callback: '#e8c4ff'
  };
  function beatColor(beat) {
    var roles = Array.isArray(beat) ? beat : beat && beat.roles ? beat.roles : typeof beat === 'string' ? [beat] : [];
    for (var i = 0; i < roles.length; i++) if (has(ROLE_COLOR, roles[i])) return ROLE_COLOR[roles[i]];
    return '#94b0c2';
  }

  /* ---------------------------------------------------------- shell state */
  var root = null, el = {}, current = null, currentLock = null, bannerMap = {}, started = false, screens = {}, fallbacks = {};
  function screen(name, def) {
    if (typeof name !== 'string' || !def || typeof def.mount !== 'function') throw new Error('studio: Studio.screen(name, { title, rail?, mount(el, ctx) })');
    screens[name] = def;
    if (started && store.route() === name && (!current || current.def !== def)) mount(name);
    return def;
  }

  /* ---------------------------------------------------------- notices: toast, banner, dialog */
  function toast(msg, kind) {
    if (!el.toasts) return;
    var t = h('div', { class: 'pds-toast' + (kind ? ' is-' + kind : ''), role: kind === 'error' ? 'alert' : 'status' }, [msg]);
    el.toasts.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-open'); });
    setTimeout(function () { t.classList.remove('is-open'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, kind === 'error' ? 6500 : 3600);
    return t;
  }
  function banner(msg, kind, opts) {
    opts = opts || {};
    if (!el.banners) return { close: function () { } };
    var key = opts.key || null;
    if (key && bannerMap[key]) bannerMap[key].close();
    var node = h('div', { class: 'pds-banner is-' + (kind || 'info'), role: kind === 'error' ? 'alert' : 'status' }, [
      h('span', { class: 'pds-banner-icon' }, [icon(kind === 'error' || kind === 'warn' ? 'warn' : 'info', 18)]),
      h('span', { class: 'pds-banner-msg' }, [msg]),
      (opts.actions || []).map(function (a) {
        return h('button', { class: 'pds-btn pds-btn-sm', type: 'button', onclick: function () { if (a.onClick) a.onClick(); if (a.close !== false) handle.close(); } }, [a.label]);
      }),
      opts.sticky ? null : h('button', { class: 'pds-icon-btn', type: 'button', 'aria-label': 'Dismiss', onclick: function () { handle.close(); } }, [icon('close', 16)])
    ]);
    var handle = {
      node: node,
      close: function () {
        if (key && bannerMap[key] === handle) delete bannerMap[key];
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    };
    if (key) bannerMap[key] = handle;
    el.banners.appendChild(node);
    return handle;
  }
  function hideBanner(key) { if (bannerMap[key]) bannerMap[key].close(); }

  function dialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var prev = document.activeElement, done = false;
      var actions = (opts.actions && opts.actions.length ? opts.actions : [{ label: 'OK', value: true, kind: 'primary' }]);
      function finish(v) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        back.classList.remove('is-open');
        setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 200);
        try { if (prev && prev.focus) prev.focus(); } catch (e) { }
        resolve(v);
      }
      var buttons = actions.map(function (a) {
        return h('button', { class: 'pds-btn' + (a.kind === 'primary' ? ' pds-btn-primary' : a.kind === 'danger' ? ' pds-btn-danger' : ''), type: 'button', 'data-value': String(a.value), onclick: function () { finish(a.value); } }, [a.label]);
      });
      var card = h('div', { class: 'pds-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' }, [
        opts.title ? h('h2', { class: 'pds-dialog-title' }, [opts.title]) : null,
        h('div', { class: 'pds-dialog-body' }, [opts.body]),
        h('div', { class: 'pds-dialog-actions' }, buttons)
      ]);
      var back = h('div', { class: 'pds-dialog-back', onclick: function (e) { if (e.target === back) finish(opts.dismissValue); } }, [card]);
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(opts.dismissValue); }
        else if (e.key === 'Tab') {
          var f = card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener('keydown', onKey, true);
      (el.modals || document.body).appendChild(back);
      requestAnimationFrame(function () {
        back.classList.add('is-open');
        var def = buttons[actions.findIndex(function (a) { return a.kind === 'primary'; })] || buttons[buttons.length - 1];
        if (def) def.focus({ preventScroll: true });
      });
    });
  }
  function confirm(msg, opts) {
    opts = opts || {};
    return dialog({
      title: opts.title || 'Are you sure?', body: msg, dismissValue: false,
      actions: [{ label: opts.cancelLabel || 'Cancel', value: false }, { label: opts.confirmLabel || 'OK', value: true, kind: opts.danger ? 'danger' : 'primary' }]
    });
  }
  function pickFiles(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var input = h('input', { type: 'file', accept: opts.accept || null, multiple: opts.multiple ? true : null, class: 'pds-file-input', 'aria-hidden': 'true', tabindex: '-1' });
      input.addEventListener('change', function () { resolve(Array.prototype.slice.call(input.files || [])); setTimeout(function () { if (input.parentNode) input.parentNode.removeChild(input); }, 0); });
      input.addEventListener('cancel', function () { resolve([]); if (input.parentNode) input.parentNode.removeChild(input); });
      document.body.appendChild(input);
      input.click();
    });
  }

  var ui = { toast: toast, confirm: confirm, banner: banner, dialog: dialog, hideBanner: hideBanner, h: h, svg: svg, icon: icon, ago: ago, pickFiles: pickFiles, isEditable: isEditable, append: append };

  /* ---------------------------------------------------------- live stage on a canvas */
  function reducedMotion() { try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function stageView(canvas, compiled, opts) {
    opts = opts || {};
    var stage = null, raf = 0, last = 0, dead = false, playing = false, ro = null, calm = reducedMotion();
    var dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5);
    function make(c) {
      stage = new PD.Stage(canvas, { deck: c });
      stage.quality = opts.quality || 1;
      try { stage.preload(c); } catch (e) { }
      try { stage.prepare(c.scenes[0]); } catch (e) { }
      fit();
    }
    function fit() {
      if (!stage) return;
      var r = canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      stage.resize(r.width, r.height, dpr);
      if (!playing) draw();
    }
    function draw() { if (stage && !dead) { try { stage.draw(); } catch (e) { } } }
    function frame(ts) {
      raf = 0;
      if (dead || !playing) return;
      var dt = last ? Math.min(0.05, Math.max(0, (ts - last) / 1000)) : 0.016;
      last = ts;
      try { stage.tick(dt); stage.draw(); } catch (e) { playing = false; return; }
      raf = requestAnimationFrame(frame);
    }
    function play() { if (dead || playing || calm) return; playing = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
    function pause() { playing = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function rest() { pause(); if (stage) { try { stage.still(0, opts.step || 0); } catch (e) { } } }
    function replay() {
      if (!stage) return;
      if (calm) { rest(); return; }
      try { stage.enter(0, opts.step || 0, 'live'); } catch (e) { return; }
      play();
    }
    function setDeck(c, mode) {
      if (dead) return;
      if (!stage) { make(c); } else { stage.setDeck(c); }
      if (mode === 'rest' || calm) rest(); else if (mode === 'settled') { try { stage.enter(0, opts.step || 0, 'settled'); } catch (e) { } play(); } else replay();
    }
    make(compiled);
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(canvas); }
    return {
      stage: function () { return stage; }, play: play, pause: pause, replay: replay, rest: rest, setDeck: setDeck, fit: fit,
      destroy: function () { dead = true; pause(); if (ro) ro.disconnect(); if (stage) { try { stage.destroy(); } catch (e) { } stage = null; } }
    };
  }

  /* ---------------------------------------------------------- screens: mount, unmount, fallbacks */
  function unmount() {
    if (!current) return;
    try { if (current.handle && typeof current.handle.unmount === 'function') current.handle.unmount(); } catch (e) { try { console.error('studio: unmount failed', e); } catch (e2) { } }
    if (el.main) el.main.textContent = '';
    current = null;
  }
  function ctxFor() { return { store: store, PD: PD, ui: ui, nav: nav, studio: S }; }
  function mount(name) {
    if (!root) return;
    unmount();
    var def = screens[name] || fallbacks[name];
    if (!store.get() && name !== 'welcome') { name = 'welcome'; def = screens.welcome; }
    var host = h('div', { class: 'pds-screen pds-screen-' + name, 'data-screen': name });
    el.main.appendChild(host);
    root.setAttribute('data-mode', name === 'welcome' ? 'welcome' : 'project');
    root.setAttribute('data-screen', name);
    var handle = null;
    if (!def) {
      host.appendChild(h('div', { class: 'pds-notice' }, [h('h2', null, ['This step is not installed in this build.']), h('p', null, ['Pick another step in the bar above.'])]));
    } else {
      try { handle = def.mount(host, ctxFor()) || {}; }
      catch (e) {
        try { console.error('studio: screen "' + name + '" failed to mount', e); } catch (e2) { }
        host.textContent = '';
        host.appendChild(h('div', { class: 'pds-notice' }, [h('h2', null, ['This step hit a problem.']), h('p', null, ['Pick another step in the bar above, then come back. Your deck is safe.'])]));
        handle = {};
      }
    }
    current = { name: name, def: def, handle: handle };
    // keyboard and screen-reader users land on the new screen, not on the button that was just pressed
    if (!document.activeElement || document.activeElement === document.body || !root.contains(document.activeElement)) { host.setAttribute('tabindex', '-1'); try { host.focus({ preventScroll: true }); } catch (e) { } }
    document.title = (def && def.title ? def.title + ' · ' : '') + 'Pixeldeck Studio';
    renderChrome();
  }
  function nav(name) {
    if (name === store.route() && current && current.name === name) return name;
    return store.route(name);
  }

  // stand-ins so the flow is walkable when the storyboard workspace is not installed (WP7 registers the real ones)
  function fallbackBoard(host, ctx) {
    var p = store.get(), c = store.compiled();
    function paint() {
      host.textContent = '';
      var list = h('div', { class: 'pds-fallback-list' });
      store.get().deck.scenes.forEach(function (sc, i) {
        var T = PD.template.get(sc.template || sc.like), beat = sc.beat || '';
        var fw = fws.framework((store.get().deck.meta.story || {}).framework), b = fw && fw.beats.filter(function (x) { return x.id === beat; })[0];
        list.appendChild(h('button', { class: 'pds-fallback-card', type: 'button', 'data-scene': sc.id, onclick: function () { store.select(sc.id, 0); paint(); } }, [
          h('i', { style: { background: beatColor(b || []) } }),
          h('b', null, [String(i + 1).padStart(2, '0') + ' · ' + (T && T.label || sc.template || sc.like || 'Scene')]),
          h('span', null, [sc.point || beat || sc.id])
        ]));
      });
      host.appendChild(h('div', { class: 'pds-fallback' }, [
        h('p', { class: 'pds-eyebrow' }, ['Storyboard']),
        h('h1', { class: 'pds-h1' }, [p.deck.scenes.length ? p.deck.scenes.length + ' scenes' : 'No scenes yet']),
        h('p', { class: 'pds-lede' }, ['The storyboard workspace is not installed in this build, so this is a plain list of the scenes in your deck.']),
        list
      ]));
    }
    paint();
    return { unmount: function () { } };
  }
  fallbacks.board = { title: 'Storyboard', rail: 4, mount: fallbackBoard };
  fallbacks.rehearse = {
    title: 'Rehearse', rail: 5,
    mount: function (host) {
      host.appendChild(h('div', { class: 'pds-fallback' }, [
        h('p', { class: 'pds-eyebrow' }, ['Rehearse']),
        h('h1', { class: 'pds-h1' }, ['Rehearsal is not installed in this build.']),
        h('p', { class: 'pds-lede' }, ['Save your deck as a file, open it, and run it full screen. Press N for the presenter notes.'])
      ]));
      return { unmount: function () { } };
    }
  };

  /* ---------------------------------------------------------- chrome: header, rail, status, logline */
  function titleOf(p) { return p && p.deck.meta && p.deck.meta.title || 'Untitled talk'; }
  function renderRail() {
    el.rail.textContent = '';
    railState().forEach(function (r, i) {
      if (i) el.rail.appendChild(h('span', { class: 'pds-rail-link' + (r.done || r.current ? ' on' : ''), 'aria-hidden': 'true' }));
      var b = h('button', {
        class: 'pds-step' + (r.current ? ' is-current' : '') + (r.done ? ' is-done' : ''), type: 'button', 'data-step': r.name,
        'aria-current': r.current ? 'step' : null, title: r.label + (r.done ? ' (done)' : ''), onclick: function () { nav(r.name); }
      }, [h('span', { class: 'pds-step-dot' }, [r.done ? icon('check', 14) : String(r.n)]), h('span', { class: 'pds-step-label' }, [r.label])]);
      el.rail.appendChild(b);
    });
  }
  function renderStatus() {
    var p = store.get();
    if (!p) { el.status.textContent = ''; return; }
    var st = store.saveState(), top, kind;
    if (p.studio.readOnly) { top = 'Read-only'; kind = 'ro'; }
    else if (st.state === 'error') { top = 'Not saved'; kind = 'err'; }
    else if (st.state === 'pending') { top = 'Saving…'; kind = 'busy'; }
    else if (st.state === 'idle') { top = 'Autosave on'; kind = 'busy'; }       // nothing written yet, so nothing to save
    else { top = 'Saved'; kind = 'ok'; }
    var file = p.studio.readOnly ? '' : store.isSaved() ? 'File saved ' + ago(p.studio.savedAt) : p.studio.savedHash ? 'File is out of date' : 'Not saved to a file';
    el.status.textContent = '';
    el.status.setAttribute('data-kind', kind);
    el.status.setAttribute('title', copy.say('save.local'));
    el.status.appendChild(h('span', { class: 'pds-saved' }, [kind === 'ro' ? icon('lock', 14) : kind === 'ok' ? icon('check', 14) : null, top]));
    if (file) el.status.appendChild(h('span', { class: 'pds-filestate' + (store.isSaved() ? ' ok' : '') }, [file]));
  }
  function renderNext() {
    var route = store.route(), p = store.get();
    el.next.textContent = '';
    el.next.classList.toggle('is-quiet', route === 'brief');
    if (!p) { el.next.hidden = true; return; }
    el.next.hidden = false;
    if (route === 'export') {                      // the last step: what comes next is the save itself (a read-only deck has nothing to save)
      if (p.studio.readOnly) { el.next.hidden = true; return; }
      el.next.setAttribute('data-to', 'save');
      el.next.appendChild(h('span', null, ['Next: Save presentation']));
      el.next.appendChild(icon('download', 16));
    } else {
      var n = NEXT[route];
      if (!n) { el.next.hidden = true; return; }
      el.next.setAttribute('data-to', n.to);
      el.next.appendChild(h('span', null, [n.label]));
      el.next.appendChild(icon('arrow', 16));
    }
  }
  function renderTitle() {
    var p = store.get();
    el.title.textContent = '';
    if (!p) return;
    el.title.appendChild(h('span', { class: 'pds-title-text' }, [titleOf(p)]));
    el.title.appendChild(icon('chev', 14));
  }
  function renderLogline() {
    var p = store.get(), route = store.route(), line = p ? interview.logline(p.deck.meta.story) : '';
    var show = !!p && !!line && route !== 'welcome' && route !== 'brief';
    el.logline.hidden = !show;
    el.logline.textContent = '';
    if (show) el.logline.appendChild(h('span', { class: 'pds-logline-text' }, [line]));
  }
  function renderLocks() {
    var p = store.get();
    hideBanner('readonly');
    hideBanner('lock');
    if (!p || !p.studio.readOnly) return;
    if (p.studio.lockedByOther) {
      banner('Open in another tab. This tab is read-only, so the two cannot overwrite each other.', 'warn', {
        key: 'lock', sticky: true,
        actions: [{ label: 'Take over here', close: false, onClick: function () { if (currentLock) currentLock.takeOver(); store.patchStudio({ lockedByOther: false }); store.setReadOnly(false); renderChrome(); } }]
      });
    } else if (p.studio.sample === 'ogl') {
      banner('One Giant Leap is a read-only sample: look around, rehearse it, or start from a copy you can edit.', 'info', {
        key: 'readonly', sticky: true, actions: [{ label: 'Make an editable copy', onClick: function () { openSample('replica'); } }]
      });
    }
  }
  function renderChrome() {
    if (!root) return;
    var route = store.route(), p = store.get();
    root.setAttribute('data-has-project', p ? '1' : '0');
    renderTitle(); renderRail(); renderStatus(); renderNext(); renderLogline();
    el.undo.disabled = !store.canUndo();
    el.redo.disabled = !store.canRedo();
    el.undo.hidden = el.redo.hidden = !p || route === 'welcome';
    paintAccent();
  }
  function paintAccent() {
    var info = store.themeInfo();
    if (info) document.documentElement.style.setProperty('--accent', info.accent);
    else document.documentElement.style.removeProperty('--accent');
  }

  function openTitleMenu() {
    var p = store.get();
    if (!p) return;
    var menu = h('div', { class: 'pds-menu', role: 'menu' }, [
      h('button', { class: 'pds-menu-item', role: 'menuitem', type: 'button', disabled: p.studio.readOnly ? true : null, onclick: function () { close(); rename(); } }, ['Rename']),
      h('button', { class: 'pds-menu-item', role: 'menuitem', type: 'button', onclick: function () { close(); save(); } }, ['Save presentation', h('kbd', null, [MOD + 'S'])]),
      h('button', { class: 'pds-menu-item', role: 'menuitem', type: 'button', onclick: function () { close(); closeProject(); } }, ['All decks'])
    ]);
    var r = el.title.getBoundingClientRect();
    menu.style.left = Math.max(8, r.left) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(menu);
    function close() { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); if (menu.parentNode) menu.parentNode.removeChild(menu); }
    function away(e) { if (!menu.contains(e.target) && !el.title.contains(e.target)) close(); }
    function key(e) { if (e.key === 'Escape') close(); }
    setTimeout(function () { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); }, 0);
    var first = menu.querySelector('button:not([disabled])');
    if (first) first.focus();
  }
  function rename() {
    var p = store.get();
    if (!p || p.studio.readOnly) return;
    var input = h('input', { class: 'pds-title-input', type: 'text', value: titleOf(p), maxlength: '80', 'aria-label': 'Deck name' });
    el.title.textContent = '';
    el.title.appendChild(input);
    input.focus(); input.select();
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (ok && v && v !== titleOf(p)) store.commit('Rename', function (d) { d.deck.meta.title = v; d.studio.titleAuto = false; });
      renderChrome();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } e.stopPropagation(); });
    input.addEventListener('blur', function () { finish(true); });
  }

  /* ---------------------------------------------------------- projects: new, continue, samples, files */
  function loadAssetsFor(p) {
    var hashes = Object.keys(p.assets).map(function (k) { return p.assets[k]; });
    return persist.assets.getMany(hashes).then(function (recs) { store.cacheRecords(recs); });
  }
  var opening = null;
  function openProject(p, o) {                    // one at a time: a double click on Continue must not open the deck twice
    if (opening) return opening;
    opening = runOpen(p, o).then(function (r) { opening = null; return r; }, function (e) { opening = null; throw e; });
    return opening;
  }
  function runOpen(p, o) {
    o = o || {};
    return loadAssetsFor(p).then(function () {
      if (currentLock) { currentLock.release(); currentLock = null; }
      if (p.studio.readOnly || o.noLock) return null;
      return persist.lock(p.id);
    }).then(function (lk) {
      currentLock = lk;
      if (lk && !lk.held) { p.studio.readOnly = true; p.studio.lockedByOther = true; }
      if (lk) lk.onLost(function () {
        store.patchStudio({ lockedByOther: true });
        store.setReadOnly(true);
        renderChrome(); renderLocks();
      });
      store.open(p);
      return store.assetsReady();
    }).then(function () {
      var missing = store.missingAssets();
      store.compiled();
      var bad = store.compileError();
      if (bad) banner("This deck did not build here (" + String(bad.message || bad).replace(/^pixeldeck: /, '') + "). A plain stand-in is showing, and your file is untouched.", 'warn', { key: 'compile' });
      var target = o.route || p.studio.screen || 'brief';
      if (target === 'welcome' || (!screens[target] && !fallbacks[target])) target = 'brief';
      store.route('welcome');                    // so the target is always a change, and mounts
      nav(target);
      renderLocks();
      if (missing.length) banner(missing.length + (missing.length === 1 ? ' picture or font is' : ' pictures or fonts are') + " missing from this browser's storage. Open the saved file to restore " + (missing.length === 1 ? 'it' : 'them') + '.', 'warn', { key: 'missing' });
      return p;
    });
  }
  function newProject() {
    var p = store.blankProject('Untitled talk');
    return openProject(p, { route: 'brief' });
  }
  function openSample(kind) {
    return openProject(store.sampleProject(kind), { route: 'board' });
  }
  function continueProject(id) {
    var p = persist.loadProject(id);
    if (!p) {
      persist.removeProject(id);                  // the index named a project that is gone: forget it, so the list tells the truth
      toast("That deck isn't in this browser any more. Open the file you saved.", 'error');
      if (store.route() === 'welcome') mount('welcome');
      return Promise.resolve(null);
    }
    return openProject(p, {});
  }
  function forgetProject(id) {
    return confirm('Remove this deck from this browser? A file you saved stays where it is.', { title: 'Remove from this browser', confirmLabel: 'Remove', danger: true }).then(function (yes) {
      if (!yes) return false;
      persist.removeProject(id);
      persist.handles.remove(id);
      return true;
    });
  }
  function mimeOfSrc(src) { var m = /^data:([^;,]+)/.exec(src || ''); return m ? m[1] : ''; }
  function openFile(file) {
    var c = files.classify(file);
    if (c.kind !== 'html') { toast(c.kind === 'unsupported' ? c.message : 'Open a presentation you saved from the Studio (an .html file).', 'error'); return Promise.resolve(null); }
    return files.readPresentation(file).then(function (pres) {
      var deck = pres.deck, hashes = {}, recs = {}, ids = Object.keys(pres.assets);
      return ids.reduce(function (chain, id) {
        return chain.then(function () {
          var a = pres.assets[id];
          return persist.sha256(a.src).then(function (hs) {
            if (!a.mime) a = Object.assign({}, a, { mime: mimeOfSrc(a.src) });
            var rec = files.recordOf(a, hs);
            recs[hs] = rec; hashes[id] = hs;
            return persist.assets.put(rec);
          });
        });
      }, Promise.resolve()).then(function () {
        store.cacheRecords(recs);
        var existing = persist.loadProject(deck.id), pick = Promise.resolve('open');
        if (existing && JSON.stringify(existing.deck) !== JSON.stringify(deck)) {
          pick = dialog({
            title: 'You already have this deck here', dismissValue: 'cancel',
            body: 'This browser holds an autosaved version of "' + (deck.meta && deck.meta.title || deck.id) + '" that differs from the file. Replace it with the file, or open the file as a separate copy?',
            actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Open as a copy', value: 'copy' }, { label: 'Replace the autosave', value: 'replace', kind: 'primary' }]
          });
        }
        return pick.then(function (choice) {
          if (choice === 'cancel') return null;
          var d = persist.clone(deck);
          if (choice === 'copy') { d.id = persist.newId(d.meta && d.meta.title || 'copy', persist.index().map(function (e) { return e.id; })); }
          var p = store.projectFromDeck(d, hashes, { fileName: file.name, screen: d.scenes.length ? 'board' : 'brief' });
          return openProject(p, {}).then(function () {
            store.markSaved({ fileName: file.name });
            renderChrome();
            toast('Opened ' + (d.meta && d.meta.title || file.name) + '.');
            return p;
          });
        });
      });
    }).then(function (r) { return r; }, function (e) {
      toast(e && e.message ? e.message : "Couldn't open this file.", 'error');
      return null;
    });
  }
  function closeProject() {
    store.close();
    if (currentLock) { currentLock.release(); currentLock = null; }
    Object.keys(bannerMap).forEach(hideBanner);
    var was = store.route();
    store.route('welcome');                       // mounts Welcome through the route event...
    if (was === 'welcome') mount('welcome');      // ...unless we were already there (a refreshed Continue list)
    renderChrome();
  }

  /* ---------------------------------------------------------- dropping files */
  // a screen that treats a drop in its own way (Look: a font becomes the brand font) says so on the drop overlay
  function setDropHint(msg) { if (el.dropText) el.dropText.textContent = msg || copy.say('assets.drop'); }
  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt) return false;
    if (dt.types) for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    return false;
  }
  function describe(list, one, many) { return list.length + ' ' + (list.length === 1 ? one : many); }
  function handleDrop(list) {
    var arr = Array.prototype.slice.call(list), html = arr.filter(function (f) { return files.classify(f).kind === 'html'; });
    if (html.length) { openFile(html[0]); return Promise.resolve(); }
    if (!store.get()) { toast('Start or open a deck first, then drop pictures and fonts here.'); return Promise.resolve(); }
    if (arr.length > 2) toast('Adding ' + arr.length + ' files…');           // big pictures take a moment each
    return store.addFiles(arr).then(function (res) {
      var imgs = res.added.filter(function (a) { return a.kind === 'image'; }), fonts = res.added.filter(function (a) { return a.kind === 'font'; });
      var parts = [];
      if (imgs.length) parts.push(describe(imgs, 'picture', 'pictures'));
      if (fonts.length) parts.push(describe(fonts, 'font', 'fonts'));
      if (parts.length) toast('Added ' + parts.join(' and ') + '.');
      res.rejected.forEach(function (r) { toast(r.message, 'error'); });
      res.warnings.forEach(function (w) {
        if (w.kind === 'big-total') banner(w.msg, 'warn', { key: 'big-total' });
        else toast(w.msg, 'warn');
      });
      return res;
    });
  }

  /* ---------------------------------------------------------- saving (the Export screen supplies S.save) */
  function save(opts) {
    var p = store.get();
    if (!p) return Promise.resolve(false);
    if (p.studio.readOnly) { toast(p.studio.sample === 'ogl' ? 'Samples are read-only. Make an editable copy to save it.' : 'This deck is read-only here.'); return Promise.resolve(false); }
    if (typeof S.save !== 'function') { nav('export'); return Promise.resolve(false); }
    return S.save(opts || {});
  }

  /* ---------------------------------------------------------- start */
  function checkSize() {
    var w = window.innerWidth, hh = window.innerHeight;
    root.classList.toggle('is-tight', w < 1280 || hh < 760);
    root.classList.toggle('is-tiny', w < 960 || hh < 560);
  }
  function build(host) {
    el.title = h('button', { class: 'pds-title', type: 'button', 'aria-haspopup': 'menu', 'aria-label': 'Deck name and menu', onclick: openTitleMenu });
    el.rail = h('nav', { class: 'pds-rail', 'aria-label': 'Progress' });
    el.status = h('div', { class: 'pds-status', role: 'status' });
    el.undo = h('button', { class: 'pds-icon-btn', type: 'button', 'aria-label': 'Undo', title: 'Undo (' + MOD + 'Z)', onclick: function () { store.undo(); } }, [icon('undo', 18)]);
    el.redo = h('button', { class: 'pds-icon-btn', type: 'button', 'aria-label': 'Redo', title: 'Redo (' + (MAC ? '\u21e7\u2318' : 'Ctrl+Shift+') + 'Z)', onclick: function () { store.redo(); } }, [icon('redo', 18)]);
    el.next = h('button', { class: 'pds-btn pds-btn-primary pds-next', type: 'button', onclick: function () {
      if (store.route() === 'export') { save(); return; }
      var n = NEXT[store.route()];
      if (n) nav(n.to);
    } });
    el.logline = h('div', { class: 'pds-logline', hidden: true });
    el.banners = h('div', { class: 'pds-banners', role: 'region', 'aria-label': 'Notices' });
    el.main = h('main', { class: 'pds-main', id: 'pds-main' });
    el.toasts = h('div', { class: 'pds-toasts', 'aria-live': 'polite' });
    el.modals = h('div', { class: 'pds-modals' });
    el.dropText = h('p', null, [copy.say('assets.drop')]);
    el.drop = h('div', { class: 'pds-drop', 'aria-hidden': 'true' }, [h('div', { class: 'pds-drop-card' }, [icon('upload', 28), el.dropText])]);
    el.size = h('div', { class: 'pds-size-hint' }, ['Make the window larger.']);
    el.tiny = h('div', { class: 'pds-tiny' }, [h('div', null, [h('h2', null, ['Make the window larger.']), h('p', null, ['The Studio needs at least 1280 by 760 pixels to lay out the storyboard.'])])]);
    root = h('div', { class: 'pds', 'data-mode': 'welcome', 'data-screen': 'welcome', 'data-has-project': '0' }, [
      h('header', { class: 'pds-head' }, [
        h('a', { class: 'pds-brand', href: '#', 'aria-label': 'Pixeldeck Studio, all decks', onclick: function (e) { e.preventDefault(); if (store.get()) closeProject(); } }, [h('span', { class: 'pds-mark' }), h('b', null, ['Pixeldeck']), h('i', null, ['Studio'])]),
        el.title, el.rail, h('span', { class: 'pds-grow' }), el.status, h('div', { class: 'pds-undo' }, [el.undo, el.redo]), el.next
      ]),
      el.logline, el.banners, el.main, el.toasts, el.modals, el.drop, el.size, el.tiny
    ]);
    host.textContent = '';
    host.appendChild(root);
  }
  function start(host) {
    if (started) return;
    started = true;
    host = host || document.getElementById('studio') || document.body;
    build(host);
    checkSize();
    window.addEventListener('resize', checkSize);

    store.on('route', function (name) { mount(name); });
    store.on('project', function (p) { if (!p) renderChrome(); });          // an opened project is drawn once its assets are ready (openProject)
    ['change', 'lint', 'status', 'studio', 'lock', 'select'].forEach(function (evt) {
      store.on(evt, function (payload) {
        if (!root) return;
        renderStatus(); renderNext(); renderRail(); renderLogline(); renderTitle();
        el.undo.disabled = !store.canUndo(); el.redo.disabled = !store.canRedo();
        if (evt === 'change' && payload && (payload.themeChanged || payload.undo)) paintAccent();      // the look decides the accent
      });
    });
    store.on('quota', function () { banner(copy.say('save.quota'), 'error', { key: 'quota', sticky: true, actions: [{ label: 'Save to a file', close: false, onClick: function () { save(); } }] }); });
    store.on('status', function (s) { if (s.state === 'saved') hideBanner('quota'); });
    setInterval(function () { if (store.get()) renderStatus(); }, 30000);

    document.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey, k = (e.key || '').toLowerCase();
      if (!mod || e.altKey) return;
      if (k === 's') { e.preventDefault(); save(); }
      else if ((k === 'z' || k === 'y') && !isEditable(e.target) && store.get()) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) store.redo(); else store.undo();
      }
    });
    // a drop zone of its own (the storyboard's assets column) takes pictures and fonts first: it calls preventDefault, and this
    // window-level handler, which runs after it, then leaves the drop alone. Everywhere else in the window it is ours.
    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      depth++;
      if (store.get() && !e.defaultPrevented) el.drop.classList.add('on');
    });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) el.drop.classList.remove('on');
    });
    window.addEventListener('drop', function (e) {
      depth = 0; el.drop.classList.remove('on');
      if (!hasFiles(e)) return;
      var list = Array.prototype.slice.call(e.dataTransfer.files || []);
      var html = list.filter(function (f) { return files.classify(f).kind === 'html'; });
      if (html.length) { e.preventDefault(); e.stopImmediatePropagation(); openFile(html[0]); return; }
      if (e.defaultPrevented) return;
      e.preventDefault();
      handleDrop(list);
    });
    window.addEventListener('pagehide', function () { store.flush(); if (currentLock) currentLock.release(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) store.flush(); });

    store.route('welcome');
    mount('welcome');
    renderChrome();
  }

  var api = {
    screen: screen, start: start, nav: nav, ui: ui, h: h, svg: svg, icon: icon, ago: ago, railState: railState, NEXT: NEXT, RAIL: RAIL,
    beatColor: beatColor, ROLE_COLOR: ROLE_COLOR, stageView: stageView, MOD: MOD, MAC: MAC,
    newProject: newProject, openSample: openSample, continueProject: continueProject, openFile: openFile, openProject: openProject,
    closeProject: closeProject, forgetProject: forgetProject, pickFiles: pickFiles, handleDrop: handleDrop, setDropHint: setDropHint, save: null,
    renderChrome: renderChrome, doneOf: doneOf, screens: function () { return Object.keys(screens); }
  };
  for (var k in api) if (has(api, k) && !(k === 'save' && S.save)) S[k] = api[k];
  S.requestSave = save;
  return api;
}, { export: false });
