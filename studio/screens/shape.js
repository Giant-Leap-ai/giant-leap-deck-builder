/* studio/screens/shape.js — ② Shape: pick the story's framework, then build the storyboard (spec §7.2, §6.2, §6.3, §6.5, WP6).
 *
 * A recommended framework with the reason (fw.pick), the runner-up, the other frameworks, and Blank. Each card draws the
 * ideal energy curve (each beat's energy at the midpoint of its share), beat chips sized by share, and "best for".
 * [Build my storyboard] runs PD.story.board(story, { framework, theme, assets }); when scenes already exist it asks first:
 * "Replace your storyboard? You can undo this." Done when a framework is chosen and the deck has scenes.
 * After a build the Studio goes on to ③ Look, the next step, unless the author has already seen it (a rebuild): then it goes to the board.
 * The curve is drawn in a box that is stretched to the card (preserveAspectRatio none, strokes that do not scale), and revealed with a
 * clip, not a dash: a dash is measured along the path and a stretched path would be drawn only partway.
 * Test hooks: [data-fw] on a card, [data-act=build], .pds-fw-curve .line. */
PD.module('studio/screens/shape', ['studio/app'], function (PD, app) {
  var S = PD.studio, h = S.h, svg = S.svg, icon = S.icon, IV = PD.story.interview;

  // a smooth path through points (Catmull-Rom converted to cubic Beziers)
  function smooth(pts) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, t = 0.18;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) * t).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) * t).toFixed(1) + ' ' +
        (p2[0] - (p3[0] - p1[0]) * t).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) * t).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }
  function curve(fw, big) {
    var W = 320, H = big ? 104 : 76, padX = 8, padY = 12;
    var box = h('div', { class: 'pds-fw-curvebox' });
    var node = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'pds-fw-curve', role: 'img', 'aria-label': 'Ideal energy over the talk', preserveAspectRatio: 'none' });
    box.appendChild(node);
    var xy = function (mid, e) { return [padX + mid * (W - 2 * padX), H - padY - (e - 1) / 4 * (H - 2 * padY)]; };
    for (var g = 1; g <= 5; g++) node.appendChild(svg('line', { x1: padX, x2: W - padX, y1: xy(0, g)[1], y2: xy(0, g)[1], class: 'grid' }));
    if (!fw.beats.length) {
      node.appendChild(svg('path', { d: 'M' + padX + ' ' + xy(0, 3)[1] + ' L' + (W - padX) + ' ' + xy(0, 3)[1], class: 'line flat', 'stroke-dasharray': '3 6' }));
      return box;
    }
    var c = PD.story.energyCurve(fw), pts = c.map(function (b) { return xy(b.mid, b.energy); });
    var line = [xy(0, c[0].energy)].concat(pts, [xy(1, c[c.length - 1].energy)]);
    var d = smooth(line);
    node.appendChild(svg('path', { d: d + ' L' + (W - padX) + ' ' + (H - padY) + ' L' + padX + ' ' + (H - padY) + ' Z', class: 'fill' }));
    node.appendChild(svg('path', { d: d, class: 'line' }));
    // the beat markers are HTML, so they stay round however wide the card is
    pts.forEach(function (p, i) {
      box.appendChild(h('span', { class: 'pds-pt', title: fw.beats[i].label + ' · energy ' + fw.beats[i].energy, style: { left: (p[0] / W * 100).toFixed(2) + '%', top: (p[1] / H * 100).toFixed(2) + '%', '--t': (p[0] / W).toFixed(3), '--c': S.beatColor(fw.beats[i]) } }));
    });
    return box;
  }
  function chips(fw) {
    var row = h('div', { class: 'pds-fw-beats', 'aria-label': 'Beats, sized by share of the talk' });
    fw.beats.forEach(function (b) {
      var col = S.beatColor(b);
      row.appendChild(h('span', { class: 'pds-beat' + (b.required ? '' : ' is-optional'), title: b.label + ' · ' + Math.round(b.share * 100) + '%' + (b.required ? '' : ' (optional)'), style: { flex: String(Math.round(b.share * 1000)) + ' 1 0', '--c': col } }, [b.label]));
    });
    return row;
  }

  S.screen('shape', {
    title: 'Shape', rail: 2,
    mount: function (el, ctx) {
      var store = ctx.store, offs = [];
      var all = PD.story.frameworks();
      var page = h('div', { class: 'pds-shape' }), grid = h('div', { class: 'pds-fw-grid', role: 'radiogroup', 'aria-label': 'Story shape' });
      var head = h('div', { class: 'pds-shape-head' }), foot = h('div', { class: 'pds-shape-foot-in' }), painted = false;
      page.appendChild(head); page.appendChild(grid);
      // the action bar is its own row under the scrolling cards, so it never sits on top of one (at 1280 x 760 the cards scroll)
      el.appendChild(h('div', { class: 'pds-shape-scroll' }, [page]));
      el.appendChild(h('div', { class: 'pds-shape-foot' }, [foot]));

      function story() { return store.get().deck.meta.story || IV.blank(); }
      var rec = PD.story.recommend(story());
      var sel = (function () {
        var s = story(), has = store.get().deck.scenes.length > 0;
        return has && s.framework && PD.story.framework(s.framework) ? s.framework : rec.id;
      })();

      function tag(text, cls) { return h('span', { class: 'pds-fw-tag ' + (cls || '') }, [text]); }
      function paintCards() {
        var order = [rec.id, rec.runnerUp].concat(all.map(function (f) { return f.id; }).filter(function (id) { return id !== rec.id && id !== rec.runnerUp && id !== 'blank'; }), ['blank']);
        grid.textContent = '';
        grid.classList.toggle('is-settled', painted);          // the curves draw in once, not again on every click
        painted = true;
        order.forEach(function (id, i) {
          var fw = PD.story.framework(id);
          if (!fw) return;
          var first = id === rec.id, input = h('input', { type: 'radio', name: 'fw', value: id, 'aria-label': fw.name, disabled: store.get().studio.readOnly ? true : null });
          input.checked = id === sel;
          input.addEventListener('change', function () { sel = id; paintCards(); paintFoot(); requestAnimationFrame(fitChips); });
          var label = h('label', { class: 'pds-fw' + (first ? ' is-recommended' : '') + (id === sel ? ' is-selected' : ''), 'data-fw': id, style: { '--i': String(i) } }, [
            input,
            h('div', { class: 'pds-fw-top' }, [
              h('h3', null, [fw.name]),
              first ? tag('Recommended', 'rec') : id === rec.runnerUp ? tag('Runner-up') : null,
              h('span', { class: 'pds-fw-check', 'aria-hidden': 'true' }, [icon('check', 14)])
            ]),
            h('p', { class: 'pds-fw-for' }, ['Best for ' + fw.bestFor + (fw.turns ? ' · ' + fw.turns + (fw.turns === 1 ? ' turn' : ' turns') : '')]),
            first ? h('p', { class: 'pds-fw-why' }, [PD.story.pickText(story(), id)]) : null,
            curve(fw, first),
            fw.beats.length ? chips(fw) : h('p', { class: 'pds-fw-blank' }, ['No beats. You lay out every scene yourself, on the storyboard.'])
          ]);
          grid.appendChild(label);
        });
      }

      head.appendChild(h('p', { class: 'pds-eyebrow' }, ['Step 2 · Shape']));
      head.appendChild(h('h1', { class: 'pds-h1' }, ['Pick the shape of your story']));
      head.appendChild(h('p', { class: 'pds-lede' }, ['A shape is a list of beats, each one a job your talk has to do. You get a scene for every beat.']));

      function paintFoot() {
        var fw = PD.story.framework(sel), s = story(), n = store.get().deck.scenes.length;
        foot.textContent = '';
        var info = h('div', { class: 'pds-plan' });
        if (fw && fw.beats.length) {
          var pl = PD.story.board.plan(s, fw);
          info.appendChild(h('b', null, [pl.n + (pl.n === 1 ? ' scene' : ' scenes')]));
          info.appendChild(document.createTextNode(s.targetMin ? ' for a ' + s.targetMin + '-minute slot' : ' to start (set your slot on the Brief for a better count)'));
          if (pl.asked > pl.n) info.appendChild(h('span', { class: 'pds-plan-note' }, [' This shape holds ' + pl.n + '; add your own on the storyboard.']));
        } else info.appendChild(document.createTextNode('An empty storyboard, ready for your own scenes.'));
        foot.appendChild(info);
        foot.appendChild(h('button', { class: 'pds-btn pds-btn-primary pds-btn-lg', type: 'button', 'data-act': 'build', disabled: store.get().studio.readOnly ? true : null, onclick: build }, [icon('spark', 18), n ? 'Rebuild my storyboard' : 'Build my storyboard']));
      }

      function build() {
        var p = store.get();
        if (p.studio.readOnly) return;
        var run = function () {
          var s = Object.assign({}, IV.clean(story()), { framework: sel }), meta = p.deck.meta;
          var scenes = PD.story.board(s, { framework: sel, theme: meta.theme, worlds: meta.worlds, assets: store.assets() });
          store.commit('Build storyboard', function (d) {
            d.deck.meta.story = Object.assign({}, d.deck.meta.story, s);
            d.deck.scenes = scenes;
            d.studio.selected = { sceneId: scenes.length ? scenes[0].id : null, step: 0 };
          });
          var seenLook = !!(store.get().studio.visited && store.get().studio.visited.look);
          ctx.ui.toast(scenes.length ? 'Built ' + scenes.length + (scenes.length === 1 ? ' scene' : ' scenes') + (seenLook ? ' for you to fill in.' : '. Pick a look next, then fill them in.') : 'Started an empty storyboard.');
          ctx.nav(seenLook ? 'board' : 'look');
        };
        if (p.deck.scenes.length) ctx.ui.confirm('Replace your storyboard? You can undo this.', { title: 'Build a new storyboard', confirmLabel: 'Replace it' }).then(function (yes) { if (yes) run(); });
        else run();
      }

      // a chip too narrow for its label keeps its colour and drops the text (the tooltip still names it)
      function fitChips() {
        Array.prototype.forEach.call(grid.querySelectorAll('.pds-beat'), function (c) { c.classList.toggle('is-clip', c.scrollWidth > c.clientWidth + 1); });
      }
      var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { fitChips(); }) : null;
      if (ro) ro.observe(grid);
      paintCards(); paintFoot();
      requestAnimationFrame(fitChips);
      offs.push(function () { if (ro) ro.disconnect(); });
      offs.push(store.on('change', function (ev) { if (ev && ev.undo) { rec = PD.story.recommend(story()); paintCards(); paintFoot(); requestAnimationFrame(fitChips); } }));
      return { unmount: function () { offs.forEach(function (o) { o(); }); } };
    }
  });
  return {};
}, { export: false });
