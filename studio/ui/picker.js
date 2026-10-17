/* studio/ui/picker.js — the template picker (spec §7.3 "Template picker", WP7).
 *
 *   PD.get('studio/ui/picker').open(opts) → { close }
 *     opts = { compiled,                CompiledDeck: its look (theme, themePatch, worlds) and assets decide what is shown
 *              beat?,                   the framework beat at this position (null: no filter)
 *              current?,                template id being replaced (Change template)
 *              mode: 'add' | 'change',
 *              onPick(templateId) }
 *   PD.get('studio/ui/picker').dispose()   free the cached preview stage (the board does this when it unmounts)
 *   PD.get('studio/ui/picker').catalog(compiled) → { ids, hidden: [{ id, label, needs }] }   what the look can show (tests)
 * A modal grid. Every card carries a lazily rendered thumbnail of expand(example) under the current look, drawn by one
 * PD.Thumbs over a catalog deck (one still per idle slice). Tabs: "Good for {ROLE}" (templates whose roles meet the beat's)
 * and "All". A template the look cannot support is hidden, with the note "Needs the Cosmos look." */
PD.module('studio/ui/picker', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };

  var CSS = [
    '.pk-tabs { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; }',
    '.pk-tabs .sp { flex: 1; } .pk-count { font: 500 12px var(--pdx-mono); color: var(--pdx-faint); }',
    '.pk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(236px, 1fr)); gap: 14px; }',
    '.pk-card { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; cursor: pointer; background: color-mix(in srgb, var(--pdx-panel) 80%, transparent);',
    '  border: 1px solid var(--pdx-hair); transition: transform .2s var(--pdx-ease), border-color .16s, box-shadow .24s var(--pdx-ease); }',
    '.pk-card:hover, .pk-card:focus-visible { transform: translateY(-3px); border-color: var(--pdx-accent); box-shadow: 0 16px 40px rgba(3, 5, 14, .5); }',
    '.pk-card:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    '.pk-card.is-current { border-color: var(--pdx-line); opacity: .62; }',
    '.pk-th { position: relative; aspect-ratio: 16 / 9; background: #07081a; }',
    '.pk-th canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity .35s; }',
    '.pk-th canvas.is-in { opacity: 1; }',
    '.pk-th .ld { position: absolute; inset: 0; background: linear-gradient(110deg, #0b0d1a 30%, #171c34 50%, #0b0d1a 70%); background-size: 220% 100%; animation: pv-shimmer 1.6s linear infinite; }',
    '.pk-th canvas.is-in + .ld { display: none; }',
    '.pk-th.is-bare { display: grid; place-items: center; background: radial-gradient(120% 120% at 50% 0%, #1b1f38, #0b0d1a); }',
    '.pk-bare { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 22px; border-radius: 12px; border: 1.5px dashed var(--pdx-line); color: var(--pdx-muted); font-size: 12px; text-align: center; line-height: 1.4; }',
    '.pk-bare .pdx-ico { color: var(--pdx-faint); }',
    '.pk-first { position: absolute; left: 10px; top: 10px; z-index: 2; }',
    '.pk-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }',
    '.pk-body h3 { margin: 0; font-size: 14px; font-weight: 650; letter-spacing: -.005em; }',
    '.pk-body p { margin: 0; font-size: 12px; line-height: 1.45; color: var(--pdx-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }',
    '.pk-meta { display: flex; align-items: center; gap: 10px; margin-top: 4px; font: 500 11px var(--pdx-mono); color: var(--pdx-faint); }',
    '.pk-dots { display: inline-flex; gap: 3px; } .pk-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--pdx-line); } .pk-dots i.on { background: var(--pdx-accent); }',
    '.pk-roles { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 2px; }',
    '.pk-roles span { font-size: 10.5px; padding: 1px 7px; border-radius: 99px; background: var(--pdx-well); color: var(--pdx-muted); }',
    '.pk-need { margin-top: 18px; font-size: 12px; color: var(--pdx-faint); display: flex; gap: 8px; align-items: flex-start; }',
    '.pk-empty { padding: 40px 0; text-align: center; color: var(--pdx-muted); }'
  ].join('\n');

  var cache = null;      // { key, thumbs, compiled, ids }

  function needsOf(T, props, worlds) {
    var req = T.requires || {}, need = (req.worlds || []).slice();
    if (typeof req.worldsFor === 'function') { try { need = need.concat(req.worldsFor(props || T.seed || {})); } catch (e) { } }
    return need.filter(function (w) { return worlds.indexOf(w) < 0; });
  }
  function lookName(world) { return world === 'cosmos' || world === 'planet' ? 'Cosmos' : world === 'ambient' ? 'Slate' : world; }

  function assetsOf(compiled) {
    var map = PD.assets.get(compiled.assetsDeckId || compiled.id) || {}, out = [];
    Object.keys(map).forEach(function (id) { if (map[id] && map[id].type === 'image') out.push(id); });
    return out;
  }
  // The asset props of a template that want one of the author's images ("Logo image", "Image"); fonts are not images.
  function imageProps(T) { return Object.keys(T.props || {}).filter(function (k) { var d = T.props[k]; return d.type === 'asset' && d.accept !== 'font'; }); }
  // With no image in the deck there is nothing honest to draw for such a template (an empty asset id only logs a warning and
  // fades in nothing): its card shows what it is waiting for instead of a thumbnail.
  function bareOf(T, imgs) { return !imgs.length && imageProps(T).length > 0; }
  function exampleFor(T, imgs) {
    var p = JSON.parse(JSON.stringify(T.example || {}));
    Object.keys(T.props || {}).forEach(function (k) { if (T.props[k].type === 'asset' && T.props[k].accept !== 'font') p[k] = imgs[0] || ''; });
    return p;
  }

  function catalog(compiled) {
    var ids = [], hidden = [], worlds = compiled.worlds;
    PD.template.list().forEach(function (id) {
      var T = PD.template.get(id), imgs = assetsOf(compiled), ex = exampleFor(T, imgs);
      var miss = needsOf(T, ex, worlds);
      if (miss.length) hidden.push({ id: id, label: T.label, needs: lookName(miss[0]) }); else ids.push(id);
    });
    return { ids: ids, hidden: hidden };
  }

  function thumbsFor(compiled, ids) {
    var imgs = assetsOf(compiled), key = compiled.themeKey + '|' + ids.join(',') + '|' + imgs.join(',');
    if (cache && cache.key === key) return cache;
    dispose();
    ids = ids.filter(function (id) { return !bareOf(PD.template.get(id), imgs); });          // `ids` of the cache: the cards that get a thumbnail
    var scenes = ids.map(function (id) { return { id: 'tpl-' + id, template: id, props: exampleFor(PD.template.get(id), imgs) }; });
    var meta = { title: 'Templates', theme: compiled.meta.theme };
    if (compiled.meta.themePatch) meta.themePatch = compiled.meta.themePatch;
    if (compiled.meta.worlds) meta.worlds = compiled.meta.worlds;
    var cat = PD.compile({ format: 2, id: 'picker-catalog', meta: meta, scenes: scenes }, { assetsDeckId: compiled.assetsDeckId || compiled.id });
    var thumbs = PD.Thumbs(cat, { w: 320, h: 180, max: 60 });
    cache = { key: key, thumbs: thumbs, compiled: cat, ids: ids };
    return cache;
  }
  function dispose() { if (cache) { try { cache.thumbs.destroy(); } catch (e) { } cache = null; } }

  function open(opts) {
    var f = F(), h = f.h, icon = f.icon;
    f.ensureBase(); f.css('picker', CSS);
    var compiled = opts.compiled, beat = opts.beat || null, cat = catalog(compiled);
    var roles = beat ? beat.roles : [];
    var good = cat.ids.filter(function (id) { var T = PD.template.get(id); return roles.some(function (r) { return (T.story.roles || []).indexOf(r) >= 0; }); });
    if (beat) good.sort(function (a, b) {
      var ia = beat.templates.indexOf(a), ib = beat.templates.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var tab = beat && good.length ? 'good' : 'all';
    var grid = h('div', { class: 'pk-grid', role: 'listbox', 'aria-label': 'Templates' }), tabsHost = h('div', { class: 'pk-tabs' }), noteHost = h('div');
    var body = h('div', null, [tabsHost, grid, noteHost]);
    var dlg = null, off = null, cards = [];
    var C = thumbsFor(compiled, cat.ids);

    function paintTabs() {
      f.clear(tabsHost);
      var opts2 = [];
      if (beat && good.length) opts2.push({ value: 'good', label: 'Good for ' + roles.map(function (r) { return r.toUpperCase(); }).join(' / ') });
      opts2.push({ value: 'all', label: 'All (' + cat.ids.length + ')' });
      var s = f.seg(opts2, tab, function (v) { tab = v; paintGrid(); });
      tabsHost.appendChild(s.el);
      tabsHost.appendChild(h('span', { class: 'sp' }));
      tabsHost.appendChild(h('span', { class: 'pk-count', text: (tab === 'good' ? good.length : cat.ids.length) + ' templates' }));
    }
    function card(id, first) {
      var T = PD.template.get(id), si = C.ids.indexOf(id), bare = si < 0, cv = bare ? null : h('canvas', { width: 320, height: 180 });
      var st = T.story || {}, dots = [], want = imageProps(T).map(function (k) { return (T.props[k].label || 'image').toLowerCase(); })[0] || 'image';
      for (var i = 1; i <= 5; i++) dots.push(h('i', { class: i <= st.energy ? 'on' : '' }));
      var b = h('button', { type: 'button', class: 'pk-card' + (opts.current === id ? ' is-current' : ''), role: 'option', 'aria-selected': 'false', dataset: { template: id }, title: T.summary || T.label,
        onclick: function () { pick(id); } }, [
        h('div', { class: 'pk-th' + (bare ? ' is-bare' : '') }, [bare ? h('div', { class: 'pk-bare' }, [icon('image', 22), h('span', { text: 'Your ' + want + ' shows here once you add one in Assets.' })]) : cv, bare ? null : h('div', { class: 'ld' }), first ? h('span', { class: 'pdx-chip pk-first', style: { '--chip': '#a7f070' }, text: 'Suggested' }) : null]),
        h('div', { class: 'pk-body' }, [h('h3', { text: T.label }), h('p', { text: T.summary || '' }),
          h('div', { class: 'pk-meta' }, [h('span', { class: 'pk-dots', title: 'Energy ' + st.energy + ' of 5' }, dots), h('span', { text: '~' + (st.talkSec || 20) + ' s' + (st.stepTalkSec ? ' + ' + st.stepTalkSec + ' s per click' : '') })]),
          h('div', { class: 'pk-roles' }, (st.roles || []).slice(0, 4).map(function (r) { return h('span', { text: r }); }))])]);
      cards.push({ id: id, si: si, cv: cv, b: b });
      if (opts.current === id) b.title = 'This is the current template';
      return b;
    }
    function drawThumb(c) {
      if (!c.cv) return true;                                    // a card with no thumbnail to wait for
      var cd = C.compiled.scenes[c.si], last = cd && cd.steps ? cd.steps.length : 0, img = C.thumbs.get(c.si, last);
      if (img) { c.cv.getContext('2d').drawImage(img, 0, 0, 320, 180); c.cv.classList.add('is-in'); return true; }
      C.thumbs.request(c.si, last, 5 - cards.indexOf(c) * 0.01);
      return false;
    }
    function paintGrid() {
      paintTabs(); f.clear(grid); cards = [];
      var ids = tab === 'good' ? good : cat.ids;
      ids.forEach(function (id, i) { grid.appendChild(card(id, !!(tab === 'good' && beat && i === 0 && beat.templates.indexOf(id) === 0))); });
      if (!ids.length) grid.appendChild(h('div', { class: 'pk-empty', text: 'Nothing fits here yet. Try the All tab.' }));
      cards.forEach(drawThumb);
      f.clear(noteHost);
      if (cat.hidden.length) {
        var by = {};
        cat.hidden.forEach(function (x) { (by[x.needs] = by[x.needs] || []).push(x.label); });
        Object.keys(by).forEach(function (need) {
          noteHost.appendChild(h('div', { class: 'pk-need' }, [icon('lock', 15), h('span', null, [h('b', { text: 'Needs the ' + need + ' look. ' }), by[need].join(', ') + '.'])]));
        });
      }
    }
    function pick(id) { if (dlg) dlg.close(); if (opts.onPick) opts.onPick(id); }

    paintGrid();
    off = C.thumbs.on('ready', function (si) { cards.forEach(function (c) { if (c.si === si) drawThumb(c); }); });
    var title = opts.mode === 'change' ? 'Change template' : 'Add a scene';
    var sub = beat ? (opts.mode === 'change' ? 'Same words where the names match, fresh prompts for the rest.' : 'You are in the “' + beat.label + '” beat. ' + beat.ask) : 'Pick a shot to start from.';
    dlg = f.modal({ title: title, subtitle: sub, body: body, width: 'min(1040px, 94vw)', onClose: function () { if (off) off(); } });
    // arrow keys move through the cards
    body.addEventListener('keydown', function (e) {
      var k = e.key; if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(k) < 0) return;
      var els = [].slice.call(grid.querySelectorAll('.pk-card')), i = els.indexOf(document.activeElement);
      if (i < 0) return;
      var cols = Math.max(1, Math.round(grid.clientWidth / (els[0].offsetWidth + 14))), n = i + (k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : k === 'ArrowDown' ? cols : -cols);
      if (n >= 0 && n < els.length) { e.preventDefault(); els[n].focus(); }
    });
    setTimeout(function () { var c = grid.querySelector('.pk-card'); if (c) c.focus({ preventScroll: true }); }, 60);
    return dlg;
  }

  return { open: open, dispose: dispose, catalog: catalog };
}, { export: false });
