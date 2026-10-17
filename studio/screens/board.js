/* studio/screens/board.js — step ④ Storyboard, the main workspace (spec §7.3, WP7).
 *
 *   Studio.screen('board', { title: 'Storyboard', rail: 4, mount(el, ctx) → { unmount } })
 *   ctx = { store, PD, ui: { toast, confirm, banner }, nav }   (the §7.8 contract; nothing else of the shell is touched)
 * The module also exports { def, current }: def is the screen definition (registered with Studio.screen when window.Studio is
 * there, else parked in PD.studioScreens.board for the shell to pick up) and current is the mounted board's handle for tests:
 * { preview, filmstrip, arc, director, assets, inspector, thumbs, store, guide() }.
 *
 *   ┌ ASSETS ┬ PREVIEW (real Stage) + transport ┬ INSPECTOR ───────┬ DIRECTOR ┐
 *   │        │ guide: what to do next           │ Content·Scene·Adv │          │
 *   ├────────┴──────────────────────────────────┴───────────────────┴──────────┤
 *   │ ARC  energy at runtime position, the chosen shape dotted, est m:ss / slot │
 *   │ FILMSTRIP  [beat-coloured cards with thumbnails]  [+] between them        │
 *   └──────────────────────────────────────────────────────────────────────────┘
 * The board wires the parts together through the store: a field edit commits 250 ms after typing stops, the store compiles
 * only that scene, the preview takes the new deck (Stage.setDeck) and the filmstrip draws one new thumbnail. It owns every
 * structural edit (move, duplicate, delete, change template, move to beat, add), the "what next" guide under the preview, the
 * asset shortcuts ("Add as logo scene", "Use as brand font"), the Director's Show me and Ignore, and the UI preferences it
 * keeps in localStorage ('pdstudio:v1:ui:board'). Keys: Space plays the scene in, F toggles the fps overlay. Undo, redo and
 * save belong to the shell. */
PD.module('studio/screens/board', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var UI = function (n) { return PD.get('studio/ui/' + n); };
  var PREFS = 'pdstudio:v1:ui:board';

  var CSS = [
    '.bx { position: relative; height: 100%; min-height: 560px; display: grid; grid-template-columns: var(--bx-aw, 252px) minmax(0, 1fr) clamp(272px, 22vw, 336px); grid-template-rows: minmax(0, 1fr) auto; gap: 12px; padding: 12px 16px 16px; color-scheme: dark;',
    '  transition: grid-template-columns .32s var(--pdx-ease); background: radial-gradient(900px 380px at 28% -8%, color-mix(in srgb, var(--pdx-accent) 8%, transparent), transparent 70%); }',
    '.bx.is-rail { --bx-aw: 58px; }',
    '.bx-assets { grid-column: 1; grid-row: 1; min-height: 0; min-width: 0; }',
    '.bx-center { grid-column: 2; grid-row: 1; display: grid; grid-template-columns: minmax(330px, 1.06fr) minmax(318px, 1fr); grid-template-rows: minmax(0, 1fr); gap: 14px; min-height: 0; min-width: 0; }',
    '.bx-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; container-type: size; }',
    '.bx-director { grid-column: 3; grid-row: 1 / 3; min-height: 0; min-width: 0; }',
    '.bx-bottom { grid-column: 1 / 3; grid-row: 2; display: flex; flex-direction: column; gap: 8px; min-width: 0; --fs-w: clamp(158px, calc(5.2vw + 92px), 216px); }',
    '.bx-guide { flex: none; padding: 12px 16px 14px; border-radius: 14px; background: color-mix(in srgb, var(--pdx-panel) 62%, transparent); border: 1px solid var(--pdx-hair-2); display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow: hidden; }',
    '.bx-guide .hd { display: flex; align-items: center; gap: 10px; }',
    '.bx-guide .hd .sp { flex: 1; } .bx-guide .hd small { font: 600 11px var(--pdx-mono); color: var(--pdx-faint); }',
    '.bx-prog { height: 5px; border-radius: 6px; background: var(--pdx-well); overflow: hidden; flex: none; }',
    '.bx-prog i { display: block; height: 100%; width: var(--p, 0%); background: linear-gradient(90deg, var(--pdx-accent), color-mix(in srgb, var(--pdx-accent) 55%, #fff)); border-radius: 6px; transition: width .7s var(--pdx-ease); }',
    '.bx-guide .go { display: flex; align-items: center; gap: 14px; }',
    '.bx-guide .go > div { flex: 1; min-width: 0; }',
    '.bx-guide .t { font-size: 13.5px; line-height: 1.4; font-weight: 620; letter-spacing: -.008em; }',
    '.bx-guide .s { font-size: 12.5px; line-height: 1.45; color: var(--pdx-muted); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.bx-guide.is-ok .bx-prog i { background: var(--pdx-ok); }',
    '@container (max-height: 540px) { .bx-guide .s { display: none; } }'
  ].join('\n');

  var current = null;

  function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { } }

  function editable(t) { return !!(t && t.nodeType === 1 && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || (t.closest && t.closest('[contenteditable], .pdx-hl, .pdx-menu, .pdx-scrim')))); }

  function mount(el, ctx) {
    var f = F(), h = f.h, icon = f.icon, store = ctx.store, ui = ctx.ui || {}, S = PD.story;
    f.ensureBase(); f.css('board', CSS);
    var prefs = loadPrefs(), offs = [], dead = false;
    var wide = window.innerWidth >= 1480;
    var assetsOpen = prefs.assetsOpen != null ? !!prefs.assetsOpen : wide;

    /* ---------------------------------------------------------- state helpers */
    function ro() { return !!store.get().studio.readOnly; }
    function compiled() { return store.compiled(); }
    var infoMemo = null;
    function infos() {
      var c = compiled(), l = store.lint(), r = ro();
      if (infoMemo && infoMemo.c === c && infoMemo.l === l && infoMemo.r === r) return infoMemo.v;
      infoMemo = { c: c, l: l, r: r, v: f.describeScenes(c, l, { readOnly: r, beatColor: ctx.studio && ctx.studio.beatColor }) };
      return infoMemo.v;
    }
    function selIndex() { var id = store.selection().sceneId; return infos().findIndex(function (x) { return x.id === id; }); }
    function selInfo() { var i = selIndex(); return i >= 0 ? infos()[i] : null; }
    function story() { return f.storyOf(compiled()) || {}; }
    function fw() { return f.frameworkOf(compiled()); }
    function why() {
      if (!ro()) return '';
      var st = store.get().studio;
      return st.readOnlyWhy || (st.lockedByOther ? 'This deck is open in another tab, so it is view only here.' : st.sample ? 'This is a read-only sample. Start a deck of your own to change things.' : 'This deck is read-only. Make an editable copy to change it.');
    }
    function lastStepOf(inf) { return inf ? inf.steps : 0; }
    function selectScene(id, step) {
      var inf = infos().find(function (x) { return x.id === id; });
      if (!inf) return;
      if (inspector) inspector.flush();
      store.select(id, step == null ? lastStepOf(inf) : step);
    }

    /* ---------------------------------------------------------- the parts */
    var readyP = null;
    function readyAssets(c) {
      var aid = c.assetsDeckId || c.id, faces = c.theme.fontFaces && c.theme.fontFaces.length ? c.theme.fontFaces : null;
      return PD.assets.ready(aid, faces ? { fontFaces: faces } : undefined).then(function (r) { if (S.lint && S.lint.clearCache) S.lint.clearCache(); return r; });
    }
    function goRehearse() {
      if (inspector) inspector.flush();
      try { PD.get('studio/screens/rehearse').pending = true; } catch (e) { }     // the click that got us here also opens full screen
      ctx.nav('rehearse');
    }
    var preview = UI('preview').create({
      onRehearse: goRehearse,
      onStep: function (k) { var inf = selInfo(); if (inf) store.select(inf.id, k); },
      onPlayed: function (si, step) { var inf = infos()[si]; if (inf) store.select(inf.id, step); }
    });
    var filmstrip = UI('filmstrip').create({
      onSelect: function (id) { selectScene(id); },
      onMove: function (id, to) { moveScene(id, to); },
      onPreviewOrder: function (ids) { arc.preview(ids); },
      onAdd: function (i) { openAdd(i); },
      onAction: function (kind, id, extra) { sceneAction(kind, id, extra); },
      onShape: function () { ctx.nav('shape'); }
    });
    var arc = UI('arc').create({
      onSelect: function (id) { selectScene(id); },
      onEnergy: function (id, e) { setEnergy(id, e); }
    });
    var director = UI('director').create({
      onShow: function (fd) { showFinding(fd); },
      onIgnore: function (fd) { ignoreFinding(fd); },
      onRehearse: goRehearse
    });
    var assets = UI('assets-panel').create({
      ctx: ctx, open: assetsOpen, readOnly: ro(),
      onUse: function (kind, id) { useAsset(kind, id); },
      onChanged: function () { assetsChanged(); },
      onToggle: function (o) { assetsOpen = o; root.classList.toggle('is-rail', !o); prefs.assetsOpen = o; savePrefs(prefs); }
    });
    var inspector = UI('inspector').create({
      store: store, tab: prefs.tab || 'content',
      onChangeTemplate: function (id) { openChange(id); },
      onNext: function () { nextToWrite(); },
      onTab: function (t) { prefs.tab = t; savePrefs(prefs); },
      addAsset: function (accept) { assets.chooser(accept); }
    });

    /* ---------------------------------------------------------- layout */
    var guide = h('div', { class: 'bx-guide', 'aria-live': 'polite' });
    var colStage = h('div', { class: 'bx-col' }, [preview.el, guide]);
    var colInspector = h('div', { class: 'bx-col' }, inspector.el);
    colInspector.firstChild.style.flex = '1';
    var root = h('div', { class: 'pdx bx' + (assetsOpen ? '' : ' is-rail'), dataset: { screen: 'board' } }, [
      h('aside', { class: 'bx-assets', 'aria-label': 'Assets' }, assets.el),
      h('section', { class: 'bx-center' }, [colStage, colInspector]),
      h('aside', { class: 'bx-director', 'aria-label': 'Director' }, director.el),
      h('footer', { class: 'bx-bottom' }, [arc.el, filmstrip.el])
    ]);
    el.appendChild(root);
    // the host may not give the screen a height: use what is left of the window
    (function () { var r = el.getBoundingClientRect(); if (r.height < 480) root.style.height = Math.max(560, window.innerHeight - r.top) + 'px'; })();
    preview.bindColumn(colStage, function () { return guide.offsetHeight + 12; }, guide);
    preview.safeArea(!!prefs.safe);

    /* ---------------------------------------------------------- rendering */
    function arcInput() {
      var c = compiled(), tm = store.timing(), t;
      try { t = tm ? S.retime(c, tm) : S.estimate(c); } catch (e) { t = null; }
      var sel = store.selection(), tgt = story().targetMin;
      return { infos: infos(), timing: t, fw: fw(), targetMin: tgt ? +tgt : null, selectedId: sel.sceneId, estimated: !(tm && t && t.exact), readOnly: ro() };
    }
    function paintAccent() {
      var c = compiled(), a = c.theme && c.theme.ui && c.theme.ui.accent;
      if (a) root.style.setProperty('--accent', a);
    }
    function paintGuide() {
      var inf = infos(), c = compiled(), r = ro(), L = store.lint(), sel = selInfo();
      var total = inf.length, todo = inf.filter(function (x) { return x.placeholders.length; }), done = total - todo.length;
      var errs = (L.findings || []).filter(function (x) { return x.sev === 'error'; }), warns = (L.findings || []).filter(function (x) { return x.sev === 'warn'; });
      f.clear(guide);
      guide.classList.remove('is-ok');
      var title, sub, btn = null, prog = total ? Math.round(done / total * 100) : 0, tag = '';
      if (r) {
        title = 'You are looking at a read-only sample.'; sub = 'Press Play in, click through the scenes, or rehearse it full screen.';
        btn = { label: 'Rehearse it', ic: 'expand', fn: goRehearse }; prog = 100; tag = 'sample';
      } else if (!total) {
        title = 'Start with the shape of your story.'; sub = 'A shape lays out the beats; each one asks you a question.';
        btn = { label: 'Choose a story shape', ic: 'sparkle', fn: function () { ctx.nav('shape'); } }; tag = 'empty';
      } else if (todo.length) {
        var nxt = todoFrom(Math.max(0, selIndex())), b = nxt && nxt.beat;
        title = f.plural(todo.length, 'scene') + ' still ' + (todo.length === 1 ? 'needs' : 'need') + ' your words.';
        sub = nxt ? 'Next up: scene ' + (nxt.i + 1) + (b ? ', ' + b.label : '') + '. ' + (b ? b.ask : 'Replace the amber prompts.') : '';
        btn = { label: 'Write scene ' + (nxt ? nxt.i + 1 : ''), ic: 'pen', fn: function () { nextToWrite(true); } }; tag = 'write';
      } else if (errs.length) {
        title = errs.length === 1 ? 'One thing to fix before it is stage-ready.' : errs.length + ' things to fix before it is stage-ready.';
        sub = errs[0].msg; btn = { label: 'Show me', ic: 'eye', fn: function () { showFinding(errs[0]); } }; tag = 'fix';
      } else if (warns.length) {
        title = 'Every scene has your words. ' + f.plural(warns.length, 'suggestion') + ' could tighten it.';
        sub = warns[0].msg; btn = { label: 'Show me', ic: 'eye', fn: function () { showFinding(warns[0]); } }; tag = 'polish';
      } else {
        title = 'Every scene has your words, and the Director is happy.'; sub = S.say('lint.clean');
        btn = { label: 'Rehearse it', ic: 'expand', fn: goRehearse }; guide.classList.add('is-ok'); tag = 'rehearse'; prog = 100;
      }
      guide.dataset.stage = tag;
      guide.appendChild(h('div', { class: 'hd' }, [h('span', { class: 'pdx-cap', text: r ? 'Sample' : 'Your next step' }), h('span', { class: 'sp' }), total && !r ? h('small', { text: done + ' of ' + total + ' written' }) : null]));
      if (total) guide.appendChild(h('div', { class: 'bx-prog', style: { '--p': prog + '%' } }, h('i')));
      guide.appendChild(h('div', { class: 'go' }, [h('div', null, [h('div', { class: 't', text: title }), sub ? h('div', { class: 's', text: sub }) : null]),
        btn ? h('button', { type: 'button', class: 'pdx-btn is-primary', dataset: { act: 'guide' }, onclick: btn.fn }, [icon(btn.ic, 15), h('span', { text: btn.label })]) : null]));
    }
    function paintParts(what) {
      var c = compiled(), sel = store.selection(), inf = infos(), L = store.lint(), si = selInfo();
      paintAccent();
      if (what.film) filmstrip.update({ compiled: c, infos: inf, selectedId: sel.sceneId, fw: fw(), readOnly: ro(), ready: readyP });
      if (what.arc) arc.update(arcInput());
      if (what.dir) director.update({ lint: L, infos: inf, selectedId: sel.sceneId, readOnly: ro() });
      if (what.assets) assets.update({ compiled: c, selected: si, readOnly: ro() });
      if (what.guide) paintGuide();
    }
    function inspectorState() { return { compiled: compiled(), infos: infos(), selectedId: store.selection().sceneId, readOnly: ro(), readOnlyWhy: why() }; }

    /* ---------------------------------------------------------- store events */
    var lastIdx = 0;
    function onChange(evt) {
      var c = compiled(), sel = store.selection(), idx = c.scenes.findIndex(function (s) { return s.id === sel.sceneId; });
      if (idx < 0 && c.scenes.length) {                     // the selected scene is gone: its neighbour takes over
        idx = Math.min(lastIdx, c.scenes.length - 1);
        var nid = c.scenes[idx].id, ns = c.scenes[idx].steps ? c.scenes[idx].steps.length : 0;
        store.select(nid, ns); sel = store.selection();
      }
      if (idx >= 0) lastIdx = idx;
      var at = { slide: Math.max(0, idx), step: Math.min(sel.step || 0, idx >= 0 && c.scenes[idx].steps ? c.scenes[idx].steps.length : 0) };
      if (evt && evt.themeChanged) readyP = readyAssets(c);
      preview.setDeck(c, { changedSceneIds: evt && evt.changedSceneIds, at: at, structural: !!(evt && evt.structural) });
      paintParts({ film: true, arc: true, dir: true, assets: true, guide: true });
      inspector.onStoreChange(evt, inspectorState());
    }
    function onSelect() {
      var sel = store.selection(), inf = selInfo();
      if (inf) {
        lastIdx = inf.i;
        var cur = preview.cur(), step = Math.min(sel.step || 0, inf.steps), pd = preview.deck();
        var already = cur && pd && pd.scenes[cur.slide] && pd.scenes[cur.slide].id === inf.id && cur.step === step;
        if (!already) preview.showId(inf.id, step, 'settled');
        preview.paintPips();
      }
      paintParts({ film: true, arc: true, dir: true, assets: true, guide: true });
      inspector.update(inspectorState());
      if (inf) filmstrip.scrollTo(inf.id);
    }
    offs.push(store.on('change', onChange));
    offs.push(store.on('select', onSelect));
    offs.push(store.on('lint', function () { paintParts({ film: true, dir: true, guide: true }); }));
    offs.push(store.on('timing', function () { paintParts({ arc: true }); }));
    offs.push(store.on('assets', function () { assetsChanged(); }));

    /* ---------------------------------------------------------- edits */
    function indexOfId(d, id) { return d.deck.scenes.findIndex(function (s) { return s.id === id; }); }
    function moveScene(id, to) {
      if (ro()) return;
      inspector.flush();
      store.commit('Move scene', function (d) { var i = indexOfId(d, id); if (i < 0) return; var s = d.deck.scenes.splice(i, 1)[0]; d.deck.scenes.splice(Math.max(0, Math.min(to, d.deck.scenes.length)), 0, s); });
    }
    function setEnergy(id, e) {
      if (ro()) return;
      inspector.flush();
      store.commit('Energy ' + id, function (d) { var s = d.deck.scenes[indexOfId(d, id)]; if (!s) return; if (e == null) delete s.energy; else s.energy = e; });
    }
    function afterAdd(id) {
      var c = compiled(), i = c.scenes.findIndex(function (s) { return s.id === id; });
      if (i >= 0) { store.select(id, c.scenes[i].steps ? c.scenes[i].steps.length : 0); filmstrip.pulse(id); }
    }
    function commitAdd(index, sc, label) {
      store.commit(label || 'Add scene', function (d) { d.deck.scenes.splice(Math.max(0, Math.min(index, d.deck.scenes.length)), 0, sc); });
      afterAdd(sc.id);
      setTimeout(function () { if (!dead && inspector.form && inspector.form()) inspector.form().focusFirst(); }, 80);
    }
    function takenIds() { return new Set(compiled().scenes.map(function (s) { return s.id; })); }
    function beatAt(index) {
      var inf = infos(), F0 = fw();
      var ref = inf[index - 1] || inf[index] || null;
      if (ref && ref.beat) return ref.beat;
      return F0 && F0.beats.length && !inf.length ? F0.beats[0] : null;
    }
    function openAdd(index) {
      if (ro()) return;
      inspector.flush();
      UI('picker').open({ compiled: compiled(), beat: beatAt(index), mode: 'add', onPick: function (tid) {
        commitAdd(index, f.newSceneFor(tid, beatAt(index), story(), takenIds()));
      } });
    }
    function openChange(id) {
      var inf = infos().find(function (x) { return x.id === id; });
      if (!inf || ro() || !inf.isTpl) return;
      inspector.flush();
      UI('picker').open({ compiled: compiled(), beat: inf.beat, current: inf.tpl, mode: 'change', onPick: function (tid) {
        if (tid === inf.tpl) return;
        var st = story();
        store.commit('Change template', function (d) {
          var s = d.deck.scenes[indexOfId(d, id)]; if (!s) return;
          s.props = f.changeTemplateProps(s, tid, st); s.template = tid; delete s.overrides;
        });
        ui.toast && ui.toast('Changed to ' + (PD.template.get(tid) || {}).label + '. Words with the same names came along.');
      } });
    }
    function sceneAction(kind, id, extra) {
      if (ro()) return;
      var inf = infos().find(function (x) { return x.id === id; });
      if (!inf) return;
      inspector.flush();
      if (kind === 'duplicate') {
        var nid = f.uniqueId(id, takenIds());
        store.commit('Duplicate scene', function (d) { var i = indexOfId(d, id), cp = JSON.parse(JSON.stringify(d.deck.scenes[i])); cp.id = nid; d.deck.scenes.splice(i + 1, 0, cp); });
        afterAdd(nid);
      } else if (kind === 'change') openChange(id);
      else if (kind === 'delete') {
        var n = inf.i + 1;
        store.commit('Delete scene', function (d) { var i = indexOfId(d, id); if (i >= 0) d.deck.scenes.splice(i, 1); });
        f.snack('Deleted scene ' + n + '.', { action: 'Undo', onAction: function () { store.undo(); } });
      } else if (kind === 'beat') {
        var F0 = fw(), tb = F0 && F0.beats.find(function (b) { return b.id === extra; });
        if (!tb) return;
        store.commit('Move to beat', function (d) {
          var i = indexOfId(d, id), s = d.deck.scenes[i], ob = inf.beat;
          if (ob && s.point === ob.label + ': ' + ob.ask) s.point = tb.label + ': ' + tb.ask;
          if (ob && s.notes === '▸ ' + ob.ask) s.notes = '▸ ' + tb.ask;
          s.beat = tb.id;
          d.deck.scenes.splice(i, 1);
          var order = F0.beats.map(function (b) { return b.id; }), ti = order.indexOf(tb.id), at = d.deck.scenes.length, found = -1;
          d.deck.scenes.forEach(function (x, k) { if (x.beat === tb.id) found = k; });
          if (found >= 0) at = found + 1;
          else { for (var k2 = 0; k2 < d.deck.scenes.length; k2++) { var bi = order.indexOf(d.deck.scenes[k2].beat); if (bi > ti) { at = k2; break; } } }
          d.deck.scenes.splice(at, 0, s);
        });
        ui.toast && ui.toast('Moved to ' + tb.label + '.');
      }
    }

    /* ---------------------------------------------------------- the Director */
    function tabFor(rule) {
      if (/^(story\.(point|unassigned|beat-order|beat-share|turns|turn-position)|copy\.notes|pace\.(runtime|flatline|no-peak|peak-early|arc-drift|long-hold|steps))/.test(rule)) return 'scene';
      return 'content';
    }
    function showFinding(fd) {
      if (fd.sceneId == null) return;
      var inf = infos().find(function (x) { return x.id === fd.sceneId; });
      if (!inf) return;
      var step = fd.step != null ? Math.min(fd.step, inf.steps) : inf.steps;
      inspector.flush();
      if (!inf.readOnly) inspector.showTab(tabFor(fd.id));
      store.select(inf.id, step);
      filmstrip.scrollTo(inf.id); filmstrip.pulse(inf.id);
    }
    function ignoreFinding(fd) {
      if (ro() || fd.sceneId == null) return;
      inspector.flush();
      store.commit('Ignore ' + fd.id, function (d) {
        var s = d.deck.scenes[indexOfId(d, fd.sceneId)]; if (!s) return;
        s.lint = s.lint || {}; s.lint.ignore = s.lint.ignore || [];
        if (s.lint.ignore.indexOf(fd.id) < 0) s.lint.ignore.push(fd.id);
      });
      f.snack('Ignoring “' + fd.id + '” for this scene.', { action: 'Undo', onAction: function () { store.undo(); } });
    }

    /* ---------------------------------------------------------- the guide */
    function todoFrom(start) {                     // the first scene that still has a placeholder, from `start` on, wrapping round
      var inf = infos(), n = inf.length;
      for (var k = 0; k < n; k++) { var x = inf[(start + k) % n]; if (x.placeholders.length) return x; }
      return null;
    }
    function nextTodo() { var i = Math.max(0, selIndex()), t = todoFrom(i + 1); return t && t.id === (infos()[i] || {}).id && infos().filter(function (z) { return z.placeholders.length; }).length === 1 ? null : t; }
    function nextToWrite(inclusive) {
      var inf = infos(), x = inclusive ? todoFrom(Math.max(0, selIndex())) : nextTodo();
      if (!x) { var nx = inf[(selIndex() + 1) % Math.max(1, inf.length)]; if (nx) selectScene(nx.id); return; }
      inspector.showTab('content');
      selectScene(x.id);
      setTimeout(function () { var ff = inspector.form && inspector.form(); if (!dead && ff) ff.focusFirst(); }, 90);
    }

    /* ---------------------------------------------------------- the assets */
    function assetsChanged() {
      var c = compiled(); readyP = readyAssets(c);
      readyP.then(function () {
        if (dead) return;
        var sel = store.selection(), idx = selIndex();
        preview.setDeck(c, { rebuild: true, at: { slide: Math.max(0, idx), step: sel.step || 0 } });
        filmstrip.refreshThumbs();
        paintParts({ assets: true, dir: true });
        inspector.update(inspectorState());
      });
    }
    function deepMerge(a, b) { var o = JSON.parse(JSON.stringify(a || {})); Object.keys(b).forEach(function (k) { o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(o[k], b[k]) : b[k]; }); return o; }
    function useAsset(kind, id) {
      if (ro()) return;
      var inf = infos(), c = compiled(), F0 = fw(), st = story();
      inspector.flush();
      if (kind === 'logo-scene') {
        var at = inf.length, idBeat = inf.filter(function (x) { return x.beat && x.beat.roles.indexOf('identity') >= 0; });
        if (idBeat.length) at = idBeat[idBeat.length - 1].i + 1;
        var beat = idBeat.length ? idBeat[0].beat : (F0 && F0.beats.find(function (b) { return b.roles.indexOf('identity') >= 0; })) || null;
        var sc = f.newSceneFor('logo', beat, st, takenIds()); sc.props.asset = id;
        commitAdd(at, sc, 'Add logo scene');
      } else if (kind === 'image-scene') {
        var cur = selInfo(), at2 = cur ? cur.i + 1 : inf.length, b2 = cur ? cur.beat : null;
        var em = inf.filter(function (x) { return x.beat && (x.beat.roles.indexOf('emotion') >= 0 || x.beat.roles.indexOf('resolution') >= 0); });
        if (em.length && !inf.some(function (x) { return x.tpl === 'image'; })) { at2 = em[em.length - 1].i + 1; b2 = em[0].beat; }
        var sc2 = f.newSceneFor('image', b2, st, takenIds()); sc2.props.asset = id;
        commitAdd(at2, sc2, 'Add image scene');
      } else if (kind === 'scene-prop') {
        var s = selInfo(); if (!s || !s.T) return;
        var key = Object.keys(s.T.props).find(function (k) { return s.T.props[k].type === 'asset' && s.T.props[k].accept !== 'font'; });
        if (key) store.commit('Use asset', function (d) { var x = d.deck.scenes[indexOfId(d, s.id)]; x.props = x.props || {}; x.props[key] = id; });
      } else if (kind === 'brand-font') {
        var a = PD.assets.get(c.assetsDeckId || c.id)[id]; if (!a) return;
        var fam = a.family || id, bf = typeof store.brandFont === 'function' ? store.brandFont() : null;
        if (typeof store.setBrandFont === 'function') {
          if (bf && bf.asset === id) { store.setBrandFont(null); ui.toast && ui.toast('Back to the look\u2019s own font.'); }
          else store.setBrandFont(id, fam).then(function (ok) { if (ui.toast) ui.toast(ok ? '\u201c' + fam + '\u201d is your brand font now. It travels inside the file.' : 'Couldn\u2019t read this font; using the theme font.', ok ? undefined : 'error'); });
          return;
        }
        var base = PD.theme.resolve(c.meta.theme).fonts.display;
        store.commit('Use brand font', function (d) {
          d.deck.meta.themePatch = deepMerge(d.deck.meta.themePatch, { fonts: { display: '"' + fam + '", ' + base }, fontFaces: [{ family: fam, asset: id }] });
        });
        ui.toast && ui.toast('\u201c' + fam + '\u201d is your brand font now. It travels inside the file.');
      } else if (kind === 'brightness') {
        store.commit('Use brightness mode', function (d) { d.deck.scenes.forEach(function (x) { if (x.template === 'logo' && x.props && x.props.asset === id) x.props.mode = 'luma'; }); });
      } else if (kind === 'remove') {
        var uses = inf.filter(function (x) { return x.isTpl && x.src.props && Object.keys(x.src.props).some(function (k) { return x.src.props[k] === id; }); }).length;
        var go = function () {
          if (typeof store.removeAsset === 'function') { store.removeAsset(id); return; }          // the store tidies the theme patch and tells us ('assets')
          store.commit('Remove asset', function (d) { delete d.assets[id]; });
          PD.assets.remove(c.assetsDeckId || c.id, id);
          assetsChanged();
        };
        if (uses && ui.confirm) ui.confirm('This is used in ' + f.plural(uses, 'scene') + '. Remove it anyway? Those scenes will ask for a new picture.').then(function (y) { if (y) go(); });
        else go();
      }
    }

    /* ---------------------------------------------------------- keys */
    function onKey(e) {
      if (dead || e.metaKey || e.ctrlKey || e.altKey || editable(e.target) || document.querySelector('.pdx-scrim')) return;
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) preview.playIn(); }
      else if (e.key === 'f' || e.key === 'F') preview.toggleFps();
      else if (e.key === 's' || e.key === 'S') { var on = !preview.safeArea(); preview.safeArea(on); prefs.safe = on; savePrefs(prefs); }
    }
    window.addEventListener('keydown', onKey);
    root.querySelector('.pv-bar [aria-pressed]').addEventListener('click', function () { prefs.safe = preview.safeArea(); savePrefs(prefs); });

    /* ---------------------------------------------------------- start */
    (function start() {
      var c = compiled(), sel = store.selection(), inf = c.scenes;
      if ((!sel.sceneId || !inf.some(function (s) { return s.id === sel.sceneId; })) && inf.length) store.select(inf[0].id, inf[0].steps ? inf[0].steps.length : 0);
      var idx = selIndex(); sel = store.selection(); lastIdx = Math.max(0, idx);
      readyP = readyAssets(c);
      preview.setDeck(c, { at: { slide: Math.max(0, idx), step: sel.step || 0 } });
      paintParts({ film: true, arc: true, dir: true, assets: true, guide: true });
      inspector.update(inspectorState());
      setTimeout(function () { var i2 = selInfo(); if (i2) filmstrip.scrollTo(i2.id); }, 60);
      store._kick && store._kick();
    })();

    var handle = {
      preview: preview, filmstrip: filmstrip, arc: arc, director: director, assets: assets, inspector: inspector, store: store, root: root,
      get thumbs() { return filmstrip.thumbs; },
      guide: function () { return { stage: guide.dataset.stage, text: guide.textContent }; },
      actions: { moveScene: moveScene, setEnergy: setEnergy, openAdd: openAdd, sceneAction: sceneAction, showFinding: showFinding, ignoreFinding: ignoreFinding, useAsset: useAsset, nextToWrite: nextToWrite, selectScene: selectScene }
    };
    current = handle;
    return {
      handle: handle,
      unmount: function () {
        dead = true;
        window.removeEventListener('keydown', onKey);
        try { inspector.flush(); } catch (e) { }
        offs.forEach(function (o) { try { o(); } catch (e) { } });
        [preview, filmstrip, arc, director, assets, inspector].forEach(function (p) { try { p.destroy(); } catch (e) { } });
        try { UI('picker').dispose(); } catch (e) { }
        f.closeMenu();
        if (root.parentNode) root.parentNode.removeChild(root);
        if (current === handle) current = null;
      }
    };
  }

  var def = { title: 'Storyboard', rail: 4, mount: mount };
  var reg = window.Studio && typeof window.Studio.screen === 'function' ? window.Studio : PD.studio && typeof PD.studio.screen === 'function' ? PD.studio : null;
  if (reg) reg.screen('board', def); else (PD.studioScreens = PD.studioScreens || {}).board = def;
  return { def: def, get current() { return current; } };
}, { export: false });
