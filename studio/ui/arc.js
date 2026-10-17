/* studio/ui/arc.js — the energy arc under the preview (spec §7.3 "Arc chart", WP7).
 *
 *   PD.get('studio/ui/arc').create(opts) → Arc
 *     opts = { onSelect(sceneId), onEnergy(sceneId, energy | null), readOnly? }
 *   Arc = {
 *     el
 *     update({ infos, timing, fw, targetMin, selectedId, estimated, readOnly })   redraw (cheap: one small SVG)
 *     preview(orderIds | null)   lay the dots out for a provisional order (while a filmstrip card is being dragged)
 *     data() → { points: [{ id, x, sec, energy }], total, slot, estimated }       what the chart shows (tests)
 *     destroy() }
 * x is runtime position from PD.story.timing (the analytic estimate until the simulation finishes; the label then says
 * "about"), y is energy 1 to 5. The dotted line is the framework's ideal curve. Dragging a dot up or down sets the scene's
 * energy, snapped to a whole number; a double-click clears the override; the arrow keys do the same with the keyboard. */
PD.module('studio/ui/arc', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var ML = 30, MR = 16, MT = 6, MB = 20, HEAD = 22;

  var CSS = [
    '.ac { position: relative; height: clamp(104px, 12vh, 132px); border-radius: 14px; background: color-mix(in srgb, var(--pdx-panel) 62%, transparent); border: 1px solid var(--pdx-hair-2); overflow: hidden; }',
    '.ac svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }',
    '.ac-head { position: absolute; left: 14px; top: 6px; right: 14px; height: 18px; display: flex; align-items: center; gap: 14px; pointer-events: none; z-index: 2; }',
    '.ac-head .sp { flex: 1; }',
    '.ac-key { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--pdx-faint); }',
    '.ac-key i { width: 18px; height: 0; border-top: 2px solid var(--pdx-accent); display: inline-block; }',
    '.ac-key i.is-ideal { border-top: 2px dotted var(--pdx-muted); }',
    '.ac-stat { font: 600 12px var(--pdx-mono); color: var(--pdx-text); display: inline-flex; align-items: baseline; gap: 6px; }',
    '.ac-stat small { color: var(--pdx-faint); font-weight: 500; font-size: 11px; }',
    '.ac-stat.is-over { color: var(--pdx-warn); } .ac-stat.is-way-over { color: var(--pdx-err); }',
    '.ac-dot { cursor: ns-resize; outline: none; }',
    '.ac-dot circle.core { transition: r .16s var(--pdx-ease), cx .12s linear, cy .12s linear; }',
    '.ac-dot:hover circle.core, .ac-dot:focus-visible circle.core { r: 8.5; }',
    '.ac-dot:focus-visible circle.ring { stroke: #fff; stroke-width: 2; opacity: 1; }',
    '.ac.is-ro .ac-dot { cursor: pointer; }',
    '.ac-tip { position: absolute; z-index: 4; pointer-events: none; padding: 6px 10px; border-radius: 9px; background: #2c2f4b; border: 1px solid var(--pdx-line); font-size: 12px; white-space: nowrap; transform: translate(-50%, -100%); box-shadow: 0 8px 26px rgba(3, 5, 14, .5); opacity: 0; transition: opacity .12s; }',
    '.ac-tip.is-on { opacity: 1; } .ac-tip b { font-weight: 650; } .ac-tip span { color: var(--pdx-muted); }',
    '.ac-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--pdx-faint); font-size: 12.5px; }'
  ].join('\n');

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, S = f.svg;
    f.ensureBase(); f.css('arc', CSS);
    var svgEl = S('svg', { 'aria-label': 'Energy across the talk', role: 'group' });
    var stat = h('span', { class: 'ac-stat' }), tip = h('div', { class: 'ac-tip', role: 'tooltip' });
    var head = h('div', { class: 'ac-head' }, [h('span', { class: 'pdx-cap', text: 'Energy' }), h('span', { class: 'ac-key' }, [h('i'), 'your talk']), h('span', { class: 'ac-key' }, [h('i', { class: 'is-ideal' }), 'the shape you chose']), h('span', { class: 'sp' }), stat]);
    var empty = h('div', { class: 'ac-empty', style: 'display:none', text: 'Your arc appears here as you add scenes.' });
    var root = h('div', { class: 'pdx ac' }, [svgEl, head, empty, tip]);
    var lastTap = { id: null, t: 0 }, last = null, provisional = null, W = 600, H = 120, dragging = false, ro = null, pts = [], meta = { total: 0, slot: null, estimated: true };

    function nice(total) { var steps = [15, 30, 60, 120, 300, 600, 900]; for (var i = 0; i < steps.length; i++) if (total / steps[i] <= 9) return steps[i]; return 1800; }
    function smoothPath(p) {
      if (p.length < 2) return '';
      var d = 'M' + p[0].x.toFixed(1) + ',' + p[0].y.toFixed(1);
      for (var i = 0; i < p.length - 1; i++) {
        var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, k = 0.18;
        var c1x = p1.x + (p2.x - p0.x) * k, c1y = p1.y + (p2.y - p0.y) * k, c2x = p2.x - (p3.x - p1.x) * k, c2y = p2.y - (p3.y - p1.y) * k;
        // keep the curve inside the plot: it must never overshoot between two energies
        var lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
        c1y = Math.max(lo, Math.min(hi, c1y)); c2y = Math.max(lo, Math.min(hi, c2y));
        d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
      }
      return d;
    }

    function layout(d) {
      var infos = d.infos || [], order = infos;
      if (provisional) {
        var byId = {}; infos.forEach(function (x) { byId[x.id] = x; });
        order = provisional.map(function (id) { return byId[id]; }).filter(Boolean);
      }
      var tm = d.timing, secOf = {};
      if (tm && tm.scenes) tm.scenes.forEach(function (s) { secOf[s.id] = s.sec; });
      var fallback = tm && tm.scenes && tm.scenes.length ? tm.total / tm.scenes.length : 30, t = 0, out = [];
      order.forEach(function (inf) {
        var sec = secOf[inf.id] != null ? secOf[inf.id] : fallback;
        out.push({ id: inf.id, info: inf, start: t, sec: sec, mid: t + sec / 2 });
        t += sec;
      });
      return { points: out, total: t };
    }

    function render() {
      var d = last;
      // the chart is rebuilt on every change (a commit, the timing landing, a resize): a dot that holds the keyboard focus must keep
      // it, or ArrowUp would work once and then the focus would be gone
      var ae = document.activeElement, keepFocus = ae && ae !== document.body && svgEl.contains(ae) && ae.dataset ? ae.dataset.id : null;
      f.clear(svgEl);
      if (!d || !d.infos || !d.infos.length) { empty.style.display = 'grid'; stat.textContent = ''; pts = []; meta = { total: 0, slot: null, estimated: true }; return; }
      empty.style.display = 'none';
      W = root.clientWidth || 600; H = root.clientHeight || 120;
      svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var lay = layout(d), total = lay.total, slot = d.targetMin ? d.targetMin * 60 : null;
      var xMax = Math.max(total, slot || 0, 30), pw = W - ML - MR, ph = H - MT - MB - HEAD, top = MT + HEAD;
      var X = function (s) { return ML + s / xMax * pw; }, Y = function (e) { return top + (5 - e) / 4 * ph; };
      // grid and the energy scale
      for (var e = 1; e <= 5; e++) {
        svgEl.appendChild(S('line', { x1: ML, x2: W - MR, y1: Y(e), y2: Y(e), stroke: 'rgba(148,176,194,' + (e === 3 ? '.16' : '.08') + ')', 'stroke-width': 1 }));
        svgEl.appendChild(S('text', { x: ML - 9, y: Y(e) + 3.5, 'text-anchor': 'end', fill: '#8396b3', 'font-size': 10, 'font-family': 'ui-monospace, Menlo, monospace', text: String(e) }));
      }
      // time axis
      var tick = nice(xMax);
      for (var s = 0; s <= xMax + 0.01; s += tick) {
        svgEl.appendChild(S('line', { x1: X(s), x2: X(s), y1: top + ph + 4, y2: top + ph + 8, stroke: 'rgba(148,176,194,.3)' }));
        svgEl.appendChild(S('text', { x: X(s), y: top + ph + 19, 'text-anchor': s === 0 ? 'start' : 'middle', fill: '#8396b3', 'font-size': 10, 'font-family': 'ui-monospace, Menlo, monospace', text: f.fmtClock(s) }));
      }
      // the slot: where the talk has to end
      if (slot) {
        if (total > slot) svgEl.appendChild(S('rect', { x: X(slot), y: top - 4, width: Math.max(0, X(total) - X(slot)), height: ph + 8, fill: 'rgba(255,123,138,.07)' }));
        svgEl.appendChild(S('line', { x1: X(slot), x2: X(slot), y1: top - 6, y2: top + ph + 6, stroke: total > slot * 1.15 ? '#ff7b8a' : '#ffcd75', 'stroke-width': 1.5, 'stroke-dasharray': '3 4', opacity: .85 }));
        var nearEdge = X(slot) > W - MR - 70;
        svgEl.appendChild(S('text', { x: X(slot) + (nearEdge ? -5 : 5), y: top + ph - 3, 'text-anchor': nearEdge ? 'end' : 'start', fill: total > slot * 1.15 ? '#ff7b8a' : '#ffcd75', 'font-size': 10, 'font-family': 'ui-monospace, Menlo, monospace', text: 'slot ends' }));
      }
      // the ideal curve of the chosen framework
      var S0 = PD.story, fw = d.fw;
      if (fw && fw.beats && fw.beats.length && S0.idealEnergy && total > 0) {
        var ip = [];
        for (var i = 0; i <= 48; i++) { var p = i / 48; ip.push({ x: X(p * total), y: Y(S0.idealEnergy(fw, p)) }); }
        svgEl.appendChild(S('path', { d: 'M' + ip.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' L'), fill: 'none', stroke: 'rgba(148,176,194,.7)', 'stroke-width': 2, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }));
      }
      // the talk's own line and the area under it
      pts = lay.points.map(function (q) { return { id: q.id, x: X(q.mid), y: Y(q.info.energy), sec: q.sec, energy: q.info.energy, info: q.info }; });
      if (pts.length > 1) {
        var path = smoothPath(pts);
        var defs = S('defs'), grad = S('linearGradient', { id: 'ac-grad', x1: 0, y1: 0, x2: 0, y2: 1 });
        grad.appendChild(S('stop', { offset: '0', 'stop-color': 'var(--pdx-accent)', 'stop-opacity': '.28' })); grad.appendChild(S('stop', { offset: '1', 'stop-color': 'var(--pdx-accent)', 'stop-opacity': '0' }));
        defs.appendChild(grad); svgEl.appendChild(defs);
        svgEl.appendChild(S('path', { d: path + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (top + ph) + ' L' + pts[0].x.toFixed(1) + ',' + (top + ph) + ' Z', fill: 'url(#ac-grad)' }));
        svgEl.appendChild(S('path', { d: path, fill: 'none', stroke: 'var(--pdx-accent)', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      }
      var readOnly = !!d.readOnly;
      root.classList.toggle('is-ro', readOnly);
      pts.forEach(function (p, idx) {
        var inf = p.info, sel = inf.id === d.selectedId, overridden = inf.src && inf.src.energy != null;
        var g = S('g', { class: 'ac-dot', tabindex: 0, role: 'slider', 'aria-label': 'Scene ' + (idx + 1) + ', ' + inf.label, 'aria-valuemin': 1, 'aria-valuemax': 5, 'aria-valuenow': p.energy, 'aria-readonly': String(readOnly), dataset: null });
        g.dataset.id = inf.id;
        g.appendChild(S('circle', { class: 'ring', cx: p.x, cy: p.y, r: sel ? 13 : 0, fill: 'none', stroke: inf.color, 'stroke-width': 1.5, opacity: sel ? 0.75 : 0 }));
        g.appendChild(S('circle', { cx: p.x, cy: p.y, r: 16, fill: 'transparent' }));
        g.appendChild(S('circle', { class: 'core', cx: p.x, cy: p.y, r: sel ? 7.5 : 6, fill: inf.color, stroke: '#1a1c2c', 'stroke-width': 2.5 }));
        if (overridden) g.appendChild(S('circle', { cx: p.x, cy: p.y, r: 2, fill: '#1a1c2c', 'pointer-events': 'none' }));
        bind(g, p, idx, Y, top, ph, readOnly);
        svgEl.appendChild(g);
        if (keepFocus != null && inf.id === keepFocus) { try { g.focus({ preventScroll: true }); } catch (e) { } }
      });
      var estTotal = total, shown = f.fmtClock(estTotal);
      f.clear(stat);
      stat.className = 'ac-stat' + (slot && total > slot * 1.35 ? ' is-way-over' : slot && total > slot * 1.15 ? ' is-over' : '');
      stat.appendChild(document.createTextNode((d.estimated ? 'est ≈ ' : 'est ') + shown));
      if (slot) stat.appendChild(h('small', { text: '/ ' + f.fmtClock(slot) }));
      meta = { total: total, slot: slot, estimated: !!d.estimated };
    }

    function energyAt(clientY, top, ph) {
      var r = svgEl.getBoundingClientRect(), y = (clientY - r.top) * (H / r.height);
      return f.clamp(Math.round(5 - (y - top) / ph * 4), 1, 5);
    }
    function showTip(p, energy, atY) {
      var s = svgEl.getBoundingClientRect(), k = s.width / W;
      tip.style.left = (p.x * k) + 'px'; tip.style.top = ((atY != null ? atY : p.y) * (s.height / H) - 14) + 'px';
      f.clear(tip);
      tip.appendChild(h('b', { text: (pts.indexOf(p) + 1) + ' · ' + p.info.label })); tip.appendChild(h('span', { text: '  energy ' + energy + ' · ' + f.fmtClock(p.sec) }));
      tip.classList.add('is-on');
    }
    function bind(g, p, idx, Y, top, ph, readOnly) {
      var down = null, moved = false, cur = p.energy;
      g.addEventListener('pointerenter', function () { if (!dragging) showTip(p, p.energy); });
      g.addEventListener('pointerleave', function () { if (!dragging) tip.classList.remove('is-on'); });
      g.addEventListener('focus', function () { showTip(p, p.energy); });
      g.addEventListener('blur', function () { tip.classList.remove('is-on'); });
      g.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        // a double-click clears the override (the chart redraws between the clicks, so it is detected here, not as dblclick)
        var now = Date.now();
        if (lastTap.id === p.id && now - lastTap.t < 380) { lastTap = { id: null, t: 0 }; if (!readOnly && opts.onEnergy && p.info.src && p.info.src.energy != null) opts.onEnergy(p.id, null); return; }
        lastTap = { id: p.id, t: now };
        down = { y: e.clientY }; moved = false; cur = p.energy;
        if (!readOnly) { dragging = true; try { g.setPointerCapture(e.pointerId); } catch (x) { } e.preventDefault(); }   // while a dot is held the chart does not redraw under it
        if (opts.onSelect) opts.onSelect(p.id);
      });
      g.addEventListener('pointermove', function (e) {
        if (!down || readOnly) return;
        if (Math.abs(e.clientY - down.y) > 3) moved = true;
        if (!moved) return;
        var en = energyAt(e.clientY, top, ph);
        if (en !== cur) {
          cur = en;
          var cy = Y(en);
          [].forEach.call(g.querySelectorAll('circle'), function (c) { c.setAttribute('cy', cy); });
          showTip(p, en, cy);
        }
      });
      function up() {
        if (!down) return;
        var changed = moved && cur !== p.energy;
        down = null; dragging = false; tip.classList.remove('is-on');
        if (changed && opts.onEnergy) opts.onEnergy(p.id, cur);
        else if (moved) render();
      }
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
      g.addEventListener('keydown', function (e) {
        if (readOnly) return;
        var dlt = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
        if (dlt) { e.preventDefault(); var en = f.clamp(p.energy + dlt, 1, 5); if (en !== p.energy && opts.onEnergy) opts.onEnergy(p.id, en); }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (opts.onEnergy && p.info.src && p.info.src.energy != null) opts.onEnergy(p.id, null); }
      });
    }

    ro = new ResizeObserver(function () { if (last && !dragging) render(); });
    ro.observe(root);
    return {
      el: root,
      update: function (d) { last = d; if (!dragging) render(); },
      preview: function (order) { provisional = order; if (last) render(); },
      data: function () { return { points: pts.map(function (p) { return { id: p.id, x: p.x, sec: p.sec, energy: p.energy }; }), total: meta.total, slot: meta.slot, estimated: meta.estimated }; },
      destroy: function () { if (ro) ro.disconnect(); if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  return { create: create };
}, { export: false });
