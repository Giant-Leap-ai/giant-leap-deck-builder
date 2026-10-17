/* studio/ui/filmstrip.js — the storyboard filmstrip (spec §7.3 "Filmstrip cards" and "Filmstrip interactions", WP7).
 *
 *   PD.get('studio/ui/filmstrip').create(opts) → Filmstrip
 *     opts = { onSelect(id), onMove(id, toIndex), onPreviewOrder(ids | null), onAdd(index), onAction(kind, id, extra), onShape() }
 *       onAction kinds: 'duplicate' | 'change' | 'beat' (extra = beat id) | 'delete'
 *   Filmstrip = {
 *     el
 *     update({ compiled, infos, selectedId, fw, readOnly, ready? })   redraw the cards; ready is a promise (assets decoded)
 *                                                                      the thumbnails wait for
 *     scrollTo(id), pulse(id)                    bring a card into view; flash it (Show me)
 *     thumbs                                     the PD.Thumbs behind the cards (320×180, LRU 150)
 *     cards() → [{ id, i, placeholders: bool, locked: bool, sev }]      what is drawn (tests)
 *     destroy() }
 * A card shows the thumbnail of the scene's last state, a beat chip in the beat's colour, the template label, step pips, the
 * point (or the first visible line) and a red, amber or grey dot for its most severe finding. A dashed border says a
 * placeholder is left; a lock marks a hand-written scene. Click selects, a drag reorders (pointer events, an insertion line,
 * edge auto-scroll, Esc cancels), "+" between cards adds, the context menu offers Duplicate, Change template, Move to beat and
 * Delete. Only the thumbnails whose scene changed are requested again. */
PD.module('studio/ui/filmstrip', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };

  var CSS = [
    '.fs { position: relative; border-radius: 16px; background: color-mix(in srgb, var(--pdx-panel) 62%, transparent); border: 1px solid var(--pdx-hair-2); }',
    '.fs-track { display: flex; align-items: stretch; padding: 10px 14px 8px; overflow-x: auto; overflow-y: hidden; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: var(--pdx-line) transparent; position: relative; }',
    '.fs-gap { position: relative; flex: none; width: 20px; display: grid; place-items: center; }',
    '.fs-gap::before { content: ""; position: absolute; top: 6px; bottom: 6px; left: 50%; width: 2px; margin-left: -1px; border-radius: 2px; background: var(--pdx-accent); opacity: 0; transition: opacity .16s; }',
    '.fs-gap button { all: unset; box-sizing: border-box; position: relative; z-index: 1; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--pdx-accent); color: #1a1210; cursor: pointer; opacity: 0; transform: scale(.6); transition: opacity .16s, transform .2s var(--pdx-ease); box-shadow: 0 6px 16px rgba(0,0,0,.4); }',
    '.fs-gap button::after { content: ""; position: absolute; inset: -12px -10px; }',
    '.fs-gap:hover::before, .fs-gap:focus-within::before { opacity: .55; } .fs-gap:hover button, .fs-gap:focus-within button { opacity: 1; transform: none; }',
    '.fs-gap button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }',
    '.fs.is-ro .fs-gap { display: none; }',
    '.fs-card { position: relative; flex: none; width: var(--fs-w, 176px); display: flex; flex-direction: column; border-radius: 13px; overflow: hidden; cursor: pointer; background: #1d2036; border: 1px solid var(--pdx-hair);',
    '  transition: transform .22s var(--pdx-ease), border-color .16s, box-shadow .22s var(--pdx-ease), opacity .16s; outline: none; touch-action: pan-x; user-select: none; -webkit-user-select: none; }',
    '.fs-card::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--beat); z-index: 3; }',
    '.fs-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--pdx-line) 50%, var(--pdx-muted)); }',
    '.fs-card:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    '.fs-card[aria-selected="true"] { transform: translateY(-3px); border-color: var(--pdx-accent); box-shadow: 0 0 0 1px var(--pdx-accent), 0 14px 34px rgba(3, 5, 14, .55), 0 0 28px color-mix(in srgb, var(--pdx-accent) 22%, transparent); }',
    '.fs-card.is-todo { border-style: dashed; border-color: color-mix(in srgb, var(--pdx-warn) 50%, var(--pdx-line)); }',
    '.fs-card.is-todo[aria-selected="true"] { border-style: solid; border-color: var(--pdx-accent); }',
    '.fs-card.is-new { animation: fs-new .38s var(--pdx-ease); }',
    '@keyframes fs-new { from { opacity: 0; transform: scale(.9) translateY(10px); } to { opacity: 1; } }',
    '.fs-card.is-pulse { animation: fs-pulse 1.1s var(--pdx-ease); }',
    '@keyframes fs-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pdx-accent) 70%, transparent); } 100% { box-shadow: 0 0 0 16px transparent; } }',
    '.fs-card.is-dragging { opacity: .28; transform: scale(.97); }',
    '.fs-ghost { position: fixed; z-index: 9100; pointer-events: none; opacity: .94; transform: rotate(2deg) scale(1.03); box-shadow: 0 26px 60px rgba(2, 4, 12, .7); transition: none; }',
    '.fs-th { position: relative; aspect-ratio: 16 / 9; background: #07081a; }',
    '.fs-th canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }',
    '.fs-th.is-wait::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, #0b0d1a 30%, #171c34 50%, #0b0d1a 70%); background-size: 220% 100%; animation: pv-shimmer 1.6s linear infinite; }',
    '.fs-n { position: absolute; left: 7px; top: 9px; z-index: 2; padding: 1px 6px; border-radius: 6px; background: rgba(8, 10, 22, .72); font: 700 10.5px var(--pdx-mono); color: #dfe8f5; }',
    '.fs-flags { position: absolute; right: 7px; top: 9px; z-index: 2; display: flex; gap: 5px; align-items: center; }',
    '.fs-sev { width: 10px; height: 10px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px rgba(8, 10, 22, .8), 0 0 10px var(--c); }',
    '.fs-lock { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; background: rgba(8, 10, 22, .72); color: #dfe8f5; }',
    '.fs-pips { position: absolute; left: 7px; bottom: 7px; z-index: 2; display: flex; gap: 3px; padding: 3px 5px; border-radius: 99px; background: rgba(8, 10, 22, .72); }',
    '.fs-pips i { width: 5px; height: 5px; border-radius: 50%; background: rgba(223, 232, 245, .85); } .fs-pips i:first-child { background: var(--beat); }',
    '.fs-meta { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 5px; min-height: 66px; }',
    '.fs-row { display: flex; align-items: center; gap: 7px; min-width: 0; }',
    '.fs-row .pdx-chip { height: 20px; padding: 0 8px; font-size: 10.5px; flex: none; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }',
    '.fs-tpl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--pdx-faint); }',
    '.fs-txt { font-size: 12px; line-height: 1.38; color: var(--pdx-text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }',
    '.fs-txt.is-todo { color: color-mix(in srgb, var(--pdx-warn) 78%, var(--pdx-muted)); font-style: italic; }',
    '.fs-more { all: unset; box-sizing: border-box; position: absolute; right: 6px; bottom: 6px; z-index: 4; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--pdx-muted); cursor: pointer; opacity: 0; transition: opacity .16s, background .16s; }',
    '.fs-more::after { content: ""; position: absolute; inset: -9px; }',
    '.fs-card:hover .fs-more, .fs-card:focus-within .fs-more, .fs-more:focus-visible { opacity: 1; } .fs-more:hover { background: var(--pdx-raise); color: var(--pdx-text); } .fs-more:focus-visible { outline: 2px solid var(--pdx-accent); }',
    '.fs.is-ro .fs-more { display: none; }',
    '.fs-end { flex: none; align-self: stretch; width: 112px; margin-left: 4px; border-radius: 13px; border: 1.5px dashed var(--pdx-line); color: var(--pdx-muted); display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: 600; background: transparent; transition: border-color .16s, color .16s, background .16s; }',
    '.fs-end:hover, .fs-end:focus-visible { border-color: var(--pdx-accent); color: var(--pdx-text); background: color-mix(in srgb, var(--pdx-accent) 6%, transparent); outline: none; }',
    '.fs-end .pdx-ico { color: var(--pdx-accent); }',
    '.fs-ins { position: absolute; top: 8px; bottom: 6px; width: 3px; margin-left: -1.5px; border-radius: 3px; background: var(--pdx-accent); box-shadow: 0 0 14px var(--pdx-accent); z-index: 5; pointer-events: none; display: none; }',
    '.fs-empty { display: flex; align-items: center; gap: 22px; padding: 18px 26px; min-height: 150px; }',
    '.fs-empty .ic { flex: none; width: 76px; height: 76px; border-radius: 20px; display: grid; place-items: center; color: var(--pdx-accent); background: color-mix(in srgb, var(--pdx-accent) 10%, transparent); }',
    '.fs-empty h3 { margin: 0 0 4px; font-size: 16px; } .fs-empty p { margin: 0 0 12px; color: var(--pdx-muted); max-width: 520px; } .fs-empty .btns { display: flex; gap: 10px; }'
  ].join('\n');

  var SEV = { error: '#ff7b8a', warn: '#ffcd75', info: '#7389a6' };

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, icon = f.icon;
    f.ensureBase(); f.css('filmstrip', CSS);
    var track = h('div', { class: 'fs-track', role: 'listbox', 'aria-label': 'Scenes', 'aria-orientation': 'horizontal' });
    var ins = h('div', { class: 'fs-ins' });
    var root = h('div', { class: 'pdx fs' }, [track]);
    var data = { infos: [], selectedId: null, fw: null, readOnly: false, compiled: null }, els = new Map(), gapEls = [], endEl = null;
    var thumbs = null, requested = new Set(), offReady = null, readyP = null, wasReady = false, dead = false, drag = null, justDragged = false, lastCompiled = null;

    /* ---------------------------------------------------------- thumbnails */
    var W = 320, H = 180;
    function key(inf) { return data.compiled.themeKey + '|' + data.compiled.sceneKeys[inf.i] + '|' + inf.steps; }
    function paintThumb(el, inf) {
      var img = thumbs && data.compiled && thumbs.get(inf.i, inf.steps);
      var cv = el._cv, th = el._th;
      if (img) {
        cv.getContext('2d').drawImage(img, 0, 0, W, H); th.classList.remove('is-wait'); th.classList.add('has-img'); el._key = key(inf); return true;
      }
      return false;
    }
    function wantThumbs() {
      if (!thumbs || !data.compiled) return;
      var sel = data.infos.findIndex(function (x) { return x.id === data.selectedId; });
      data.infos.forEach(function (inf) {
        var el = els.get(inf.id);
        if (!el) return;
        if (paintThumb(el, inf)) return;
        var k = key(inf);
        if (!requested.has(k)) {
          requested.add(k);
          thumbs.request(inf.i, inf.steps, inf.i === sel ? 10 : 5 - Math.abs(inf.i - sel) * 0.01);
        }
        if (el._key !== k && !el._th.classList.contains('has-img')) el._th.classList.add('is-wait');
      });
      if (requested.size > 600) requested.clear();
    }
    function startThumbs() {
      if (thumbs || dead || !data.compiled) return;
      thumbs = PD.Thumbs(data.compiled, { w: W, h: H, max: 150 });
      lastCompiled = data.compiled;
      offReady = thumbs.on('ready', function (si, step) {
        data.infos.forEach(function (inf) {
          if (inf.i !== si || inf.steps !== step) return;
          var el = els.get(inf.id); if (el) { requested.delete(key(inf)); paintThumb(el, inf); }
        });
      });
    }

    /* ---------------------------------------------------------- cards */
    function numberLabel(i) { return (i < 9 ? '0' : '') + (i + 1); }
    function textFor(inf) {
      if (inf.placeholders.length) return { t: inf.beat ? inf.beat.ask : 'Needs your words', todo: true };
      if (inf.point && !inf.generatedPoint) return { t: inf.point, todo: false };
      if (inf.firstLine) return { t: inf.firstLine, todo: false };
      return { t: inf.point || inf.label, todo: false };
    }
    function makeCard(inf) {
      var cv = h('canvas', { width: W, height: H, 'aria-hidden': 'true' });
      var th = h('div', { class: 'fs-th is-wait' }, cv);
      var el = h('article', { class: 'fs-card is-new', role: 'option', tabindex: '-1', 'aria-selected': 'false', dataset: { id: inf.id } });
      var n = h('span', { class: 'fs-n' }), flags = h('div', { class: 'fs-flags' }), pips = h('div', { class: 'fs-pips' });
      th.appendChild(n); th.appendChild(flags); th.appendChild(pips);
      var chip = h('span', { class: 'pdx-chip' }), tpl = h('span', { class: 'fs-tpl' }), txt = h('div', { class: 'fs-txt' });
      var more = h('button', { type: 'button', class: 'fs-more', tabindex: '-1', title: 'Scene actions (or the Menu key on the card)', 'aria-label': 'Scene actions', onclick: function (e) {
        e.stopPropagation(); var r = more.getBoundingClientRect(); openMenu(el._id, r.left, r.bottom + 6, r.top);
      } }, icon('more', 16));
      el.appendChild(th); el.appendChild(h('div', { class: 'fs-meta' }, [h('div', { class: 'fs-row' }, [chip, tpl]), txt])); el.appendChild(more);
      el._cv = cv; el._th = th; el._n = n; el._flags = flags; el._pips = pips; el._chip = chip; el._tpl = tpl; el._txt = txt;
      el.addEventListener('click', function () { if (justDragged) { justDragged = false; return; } if (opts.onSelect) opts.onSelect(el._id); });
      el.addEventListener('contextmenu', function (e) { if (data.readOnly) return; e.preventDefault(); openMenu(el._id, e.clientX, e.clientY); });
      el.addEventListener('pointerdown', function (e) { onDown(e, el); });
      el.addEventListener('keydown', function (e) { onKey(e, el); });
      setTimeout(function () { el.classList.remove('is-new'); }, 420);
      return el;
    }
    function fillCard(el, inf) {
      el._id = inf.id; el._info = inf;
      el.style.setProperty('--beat', inf.color);
      el.setAttribute('aria-selected', String(inf.id === data.selectedId));
      el.tabIndex = inf.id === data.selectedId ? 0 : -1;
      el.classList.toggle('is-todo', inf.placeholders.length > 0);
      el.setAttribute('aria-label', 'Scene ' + (inf.i + 1) + ', ' + inf.label + (inf.beat ? ', ' + inf.beat.label : ''));
      el._n.textContent = numberLabel(inf.i);
      f.clear(el._flags);
      if (inf.sev) { var dot = h('span', { class: 'fs-sev', title: 'The Director has a note here', style: { '--c': SEV[inf.sev] } }); el._flags.appendChild(dot); }
      if (inf.readOnly) el._flags.appendChild(h('span', { class: 'fs-lock', title: inf.isTpl ? 'Read-only' : 'Written by hand: view only' }, icon('lock', 12)));
      f.clear(el._pips);
      el._pips.style.display = inf.steps ? '' : 'none';
      for (var k = 0; k <= inf.steps; k++) el._pips.appendChild(h('i'));
      el._chip.textContent = inf.beat ? inf.beat.label : 'No beat';
      el._chip.style.setProperty('--chip', inf.color);
      el._tpl.textContent = inf.label;
      var t = textFor(inf);
      el._txt.textContent = t.t; el._txt.classList.toggle('is-todo', t.todo);
    }

    function makeGap() {
      var g = h('div', { class: 'fs-gap' }, h('button', { type: 'button', title: 'Add a scene here', onclick: function () { if (opts.onAdd) opts.onAdd(+g.dataset.index); } }, icon('plus', 15)));
      return g;
    }
    function makeEnd() { return h('button', { type: 'button', class: 'fs-end' }, [icon('plus', 20), h('span', { text: 'Add a scene' })]); }

    function openMenu(id, x, y, above) {
      if (data.readOnly) return;
      var inf = data.infos.find(function (z) { return z.id === id; });
      if (!inf) return;
      var beats = data.fw ? data.fw.beats : [];
      var items = [
        { label: 'Duplicate', icon: 'copy', onClick: function () { opts.onAction('duplicate', id); } },
        { label: 'Change template…', icon: 'swap', disabled: !inf.isTpl, onClick: function () { opts.onAction('change', id); } },
        { label: 'Move to beat', icon: 'flag', disabled: !beats.length, sub: beats.map(function (b, i) { return { label: b.label, dot: f.beatColor(i), disabled: b.id === inf.beatId, onClick: function () { opts.onAction('beat', id, b.id); } }; }) },
        { sep: true },
        { label: 'Delete', icon: 'trash', danger: true, onClick: function () { opts.onAction('delete', id); } }
      ];
      f.menu(items, { x: x, y: y, above: above });
    }
    function onKey(e, el) {
      var id = el._id, i = data.infos.findIndex(function (z) { return z.id === id; });
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        var n = data.infos[i + (e.key === 'ArrowRight' ? 1 : -1)];
        if (n) { e.preventDefault(); if (opts.onSelect) opts.onSelect(n.id); var t = els.get(n.id); if (t) t.focus(); }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !data.readOnly) { e.preventDefault(); opts.onAction('delete', id); }
      else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && !data.readOnly) { e.preventDefault(); opts.onAction('duplicate', id); }
      else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); var r = el.getBoundingClientRect(); openMenu(id, r.left + 20, r.top + 30); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts.onSelect) opts.onSelect(id); }
    }

    /* ---------------------------------------------------------- drag to reorder */
    function onDown(e, el) {
      if (data.readOnly || e.button !== 0 || e.target.closest('.fs-more')) return;
      drag = { id: el._id, el: el, x0: e.clientX, y0: e.clientY, started: false, pid: e.pointerId, ghost: null, to: -1, from: data.infos.findIndex(function (z) { return z.id === el._id; }), off: 0, scrollV: 0, raf: 0, cx: e.clientX };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel); window.addEventListener('keydown', onDragKey, true);
    }
    function slots() {       // the x of every possible insertion point, among the cards that stay
      var rows = [], tr = track.getBoundingClientRect();
      data.infos.forEach(function (inf) {
        if (inf.id === drag.id) return;
        var el = els.get(inf.id), r = el.getBoundingClientRect();
        rows.push({ id: inf.id, mid: r.left + r.width / 2, left: r.left, right: r.right });
      });
      return { rows: rows, tr: tr };
    }
    function startDrag() {
      drag.started = true;
      var r = drag.el.getBoundingClientRect();
      drag.off = drag.x0 - r.left; drag.offY = drag.y0 - r.top;
      var g = drag.el.cloneNode(true);
      g.className = 'pdx fs-card fs-ghost'; g.removeAttribute('id'); g.style.width = r.width + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px'; g.setAttribute('aria-hidden', 'true');
      var src = drag.el._cv, dst = g.querySelector('canvas'); if (dst) dst.getContext('2d').drawImage(src, 0, 0);
      document.body.appendChild(g); drag.ghost = g;
      drag.el.classList.add('is-dragging');
      track.appendChild(ins);
      document.body.style.cursor = 'grabbing';
      drag.raf = requestAnimationFrame(tickScroll);
    }
    function tickScroll() {
      if (!drag || !drag.started) return;
      var r = track.getBoundingClientRect(), x = drag.cx, v = 0;
      if (x < r.left + 70) v = -Math.ceil((r.left + 70 - x) / 6); else if (x > r.right - 70) v = Math.ceil((x - (r.right - 70)) / 6);
      if (v) { track.style.scrollBehavior = 'auto'; track.scrollLeft += v; place(); }
      drag.raf = requestAnimationFrame(tickScroll);
    }
    function place() {
      if (!drag || !drag.started) return;
      var s = slots(), to = s.rows.length, x = drag.cx;
      for (var i = 0; i < s.rows.length; i++) if (x < s.rows[i].mid) { to = i; break; }
      drag.to = to;
      var trl = s.tr.left - track.scrollLeft, lx;
      if (!s.rows.length) lx = 14; else if (to >= s.rows.length) lx = s.rows[s.rows.length - 1].right + 10 - trl; else lx = s.rows[to].left - 10 - trl;
      ins.style.display = 'block'; ins.style.left = lx + 'px';
      if (opts.onPreviewOrder) {
        var ids = s.rows.map(function (r) { return r.id; }); ids.splice(to, 0, drag.id);
        opts.onPreviewOrder(ids);
      }
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.cx = e.clientX;
      if (!drag.started) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; startDrag(); }
      drag.ghost.style.left = (e.clientX - drag.off) + 'px'; drag.ghost.style.top = (e.clientY - drag.offY) + 'px';
      place();
    }
    function endDrag(commit) {
      var d = drag; drag = null;
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); window.removeEventListener('keydown', onDragKey, true);
      if (!d) return;
      if (d.raf) cancelAnimationFrame(d.raf);
      if (d.started) {
        justDragged = true; setTimeout(function () { justDragged = false; }, 0);
        if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
        d.el.classList.remove('is-dragging'); ins.style.display = 'none'; if (ins.parentNode) ins.parentNode.removeChild(ins);
        document.body.style.cursor = ''; track.style.scrollBehavior = '';
        if (opts.onPreviewOrder) opts.onPreviewOrder(null);
        if (commit && d.to >= 0 && d.to !== d.from && opts.onMove) opts.onMove(d.id, d.to);
      }
    }
    function onUp(e) { if (drag && e.pointerId === drag.pid) endDrag(true); }
    function onCancel() { endDrag(false); }
    function onDragKey(e) { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); endDrag(false); } }

    /* ---------------------------------------------------------- the whole strip */
    function render() {
      var infos = data.infos;
      root.classList.toggle('is-ro', !!data.readOnly);
      if (!infos.length) {
        f.clear(track); els.clear(); gapEls = [];
        track.appendChild(h('div', { class: 'fs-empty' }, [h('div', { class: 'ic' }, icon('film', 34)), h('div', null, [
          h('h3', { text: 'Your storyboard starts here' }),
          h('p', { text: 'Pick a story shape and we will lay out the beats for you, or add the first scene by hand and build outwards.' }),
          h('div', { class: 'btns' }, [h('button', { type: 'button', class: 'pdx-btn is-primary', onclick: function () { if (opts.onShape) opts.onShape(); } }, [icon('sparkle', 15), h('span', { text: 'Choose a story shape' })]),
            h('button', { type: 'button', class: 'pdx-btn', onclick: function () { if (opts.onAdd) opts.onAdd(0); } }, [icon('plus', 15), h('span', { text: 'Add a scene' })])])])]));
        return;
      }
      // FLIP: remember where every card was
      var before = new Map();
      els.forEach(function (el, id) { if (el.parentNode === track) before.set(id, el.getBoundingClientRect().left); });
      var seen = new Set();
      infos.forEach(function (inf) {
        var el = els.get(inf.id);
        if (!el) { el = makeCard(inf); els.set(inf.id, el); } else el.classList.remove('is-new');
        fillCard(el, inf); seen.add(inf.id);
      });
      els.forEach(function (el, id) { if (!seen.has(id)) { if (el.parentNode) el.parentNode.removeChild(el); els.delete(id); } });
      // the sequence of gaps and cards, reconciled in place: a node that is already where it should be is not touched
      // (a hovered "+" keeps its hover, a press in flight is not lost, the scroll position stays)
      var sl = track.scrollLeft, ae = document.activeElement, keep = ae && ae._id && track.contains(ae) ? ae._id : null;
      while (gapEls.length < infos.length) gapEls.push(makeGap());
      gapEls.length = infos.length;
      var seq = [];
      infos.forEach(function (inf, i) { gapEls[i].dataset.index = i; gapEls[i].firstChild.setAttribute('aria-label', 'Add a scene at position ' + (i + 1)); seq.push(gapEls[i]); seq.push(els.get(inf.id)); });
      if (!data.readOnly) seq.push(endEl || (endEl = makeEnd()));
      endEl && (endEl.onclick = function () { if (opts.onAdd) opts.onAdd(infos.length); });
      for (var q = 0; q < seq.length; q++) if (track.childNodes[q] !== seq[q]) track.insertBefore(seq[q], track.childNodes[q] || null);
      while (track.childNodes.length > seq.length) track.removeChild(track.lastChild);
      if (sl && track.scrollLeft !== sl) { var sb = track.style.scrollBehavior; track.style.scrollBehavior = 'auto'; track.scrollLeft = sl; track.style.scrollBehavior = sb; }
      if (keep && els.get(keep) && document.activeElement !== els.get(keep)) els.get(keep).focus({ preventScroll: true });          // a rebuilt strip keeps the keyboard focus
      var after = new Map();
      els.forEach(function (el, id) { after.set(id, el.getBoundingClientRect().left); });
      els.forEach(function (el, id) {
        if (!before.has(id)) return;
        var d = before.get(id) - after.get(id);
        if (Math.abs(d) < 2) return;
        el.style.transition = 'none'; el.style.transform = 'translateX(' + d + 'px)';
        requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = ''; el.style.transform = ''; }); });
      });
    }

    function syncThumbs() {                       // after the assets are decoded, and after every redraw
      if (!wasReady || dead || !data.compiled) return;
      if (!thumbs) startThumbs();
      else if (data.compiled !== lastCompiled) { thumbs.setDeck(data.compiled); lastCompiled = data.compiled; }
      wantThumbs();
    }

    var api = {
      el: root,
      get thumbs() { return thumbs; },
      update: function (d) {
        data = { infos: d.infos || [], selectedId: d.selectedId, fw: d.fw, readOnly: !!d.readOnly, compiled: d.compiled };
        render();
        if (d.ready && d.ready !== readyP) {
          var mine = readyP = d.ready; wasReady = false;
          mine.then(function () { if (dead || readyP !== mine) return; wasReady = true; syncThumbs(); });
        } else syncThumbs();
      },
      scrollTo: function (id) {
        var el = els.get(id); if (!el || !el.parentNode) return;
        var tr = track.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.left < tr.left + 24 || r.right > tr.right - 24) track.scrollTo({ left: track.scrollLeft + (r.left + r.width / 2) - (tr.left + tr.width / 2), behavior: 'smooth' });
      },
      pulse: function (id) { var el = els.get(id); if (!el) return; el.classList.remove('is-pulse'); void el.offsetWidth; el.classList.add('is-pulse'); setTimeout(function () { el.classList.remove('is-pulse'); }, 1200); },
      refreshThumbs: function () {         // the fonts or pictures changed under the cards: draw them again
        if (!thumbs) return; requested.clear();
        var c = data.compiled; if (!c) return;
        try { thumbs.destroy(); } catch (e) { } thumbs = null; if (offReady) offReady();
        els.forEach(function (el) { el._th.classList.add('is-wait'); el._th.classList.remove('has-img'); });
        startThumbs(); wantThumbs();
      },
      cards: function () { return data.infos.map(function (inf) { return { id: inf.id, i: inf.i, placeholders: inf.placeholders.length > 0, locked: !!inf.readOnly, sev: inf.sev, selected: inf.id === data.selectedId }; }); },
      focusSelected: function () { var el = els.get(data.selectedId); if (el) el.focus({ preventScroll: true }); },
      destroy: function () {
        dead = true; endDrag(false);
        if (offReady) offReady();
        if (thumbs) { try { thumbs.destroy(); } catch (e) { } thumbs = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    return api;
  }
  return { create: create };
}, { export: false });
