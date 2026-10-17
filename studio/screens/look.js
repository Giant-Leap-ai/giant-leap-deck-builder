/* studio/screens/look.js — ③ Look: the theme, its colours and a brand font (spec §7.2, §4.4, WP6).
 *
 * Two theme cards, Cosmos and Slate, each a live Stage playing a scene with the user's own words: brand-reveal under Cosmos,
 * statement under Slate. Controls write meta.theme and meta.themePatch (values only, never code):
 *   accent  → roles.accent, roles.accentGlow (the accent mixed 40% toward #ff6a00)
 *   future  → roles.future, roles.futureGlow
 *   nebula  → world.nebula (Cosmos only)
 *   brand font → fontFaces + fonts.display  (a font file dropped here, or chosen from the deck's assets)
 * A font file dropped anywhere on this screen (or chosen with the file chooser) is added to the deck AND becomes the brand font in
 * one step, so the previews re-render with it at once (acceptance 8); pictures dropped with it are added the usual way.
 * Switching theme: templates the new look cannot play would become error cards, so a dialog lists them with
 * [Swap to closest adaptive template] (hyperspace → big-number, galaxy-reveal / planet / sunrise → statement, spec §7.2); the
 * words the author wrote are kept. Done when the screen has been visited.
 * Test hooks: [data-theme] on a card, input[data-ctl=accent|future], [data-nebula], [data-act=font-pick], .pds-fontdrop (drop target). */
PD.module('studio/screens/look', ['studio/app'], function (PD, app) {
  var S = PD.studio, h = S.h, icon = S.icon;

  var THEMES = [
    { id: 'cosmos', name: 'Cosmos', blurb: 'Deep space, nebulae and planets. Cinematic, slow and big.', tone: 'cinematic' },
    { id: 'slate', name: 'Slate', blurb: 'Charcoal and warm light. Quiet, modern, at home in any room.', tone: 'other' }
  ];

  /* ---------------------------------------------------------- colour maths */
  function rgb(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var s = m[1].length === 3 ? m[1].replace(/./g, function (c) { return c + c; }) : m[1];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return toHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  var PRESETS = ['#ffd27a', '#ff9a3d', '#ff6b9a', '#b08cff', '#5ef1ff', '#6fe0a0'];
  function glowOf(hex) { return mix(hex, '#ff6a00', 0.4); }
  function normHex(v) { var c = rgb(v); return c ? toHex(c) : null; }
  function clip(s, n) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }

  /* ---------------------------------------------------------- swapping scenes a look cannot play */
  var PLACEHOLDER = /^\s*\{[^{}]*\}\s*$/;             // an author prompt such as {a big number}: not words to carry over
  function isPlaceholder(s) { return PLACEHOLDER.test(String(s || '')); }
  function firstNumber(text) {
    var m = /([$\u00a3\u20ac]?)(-?\d[\d,]*(?:\.\d+)?)(%?)/.exec(text);
    if (!m) return null;
    var raw = m[2];
    return {
      value: parseFloat(raw.replace(/,/g, '')), decimals: Math.min(3, (raw.split('.')[1] || '').length), prefix: m[1], suffix: m[3],
      rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
    };
  }
  function swapFor(scene) {
    var p = scene.props || {}, out = {}, k;
    for (k in scene) if (Object.prototype.hasOwnProperty.call(scene, k)) out[k] = scene[k];
    delete out.overrides;
    var extra = [];
    if (scene.template === 'hyperspace') {
      // always a Big number (spec §7.2). A number in the first line becomes the number and the rest of that line its label; with no
      // number the scene keeps the template's own prompts ({what the number means}), which the Director then asks the author to
      // fill, and the old words are kept in the notes. Nothing is invented, and nothing the author wrote is lost.
      var lines = (Array.isArray(p.lines) ? p.lines : []).map(function (l) { return String(l || '').trim(); }).filter(Boolean), n = lines.length ? firstNumber(lines[0]) : null;
      out.template = 'big-number';
      if (n && isFinite(n.value)) {
        out.props = { value: n.value, decimals: n.decimals, prefix: n.prefix, suffix: n.suffix, label: clip(n.rest, 60) || '{what the number means}' };
        var second = lines[1] && !isPlaceholder(lines[1]) ? lines[1] : '';
        if (second && second.length <= 40) out.props.source = second; else if (second) extra.push(second);
        lines.slice(2).forEach(function (l) { if (!isPlaceholder(l)) extra.push(l); });
      } else {
        out.props = { value: 0, decimals: 0, prefix: '', suffix: '', label: '{what the number means}' };
        lines.forEach(function (l) { if (!isPlaceholder(l)) extra.push(l); });
      }
    } else {                                    // galaxy-reveal, planet, sunrise: a kicker and a line
      out.template = 'statement';
      out.props = { line: p.line || '{your line}' };
      if (p.kicker) out.props.kicker = p.kicker;
    }
    // the words of the old steps are kept as notes: the statement has no steps
    var sn = Array.isArray(scene.stepNotes) ? scene.stepNotes.filter(Boolean) : [];
    delete out.stepNotes; delete out.stepDwell;
    var notes = [scene.notes || ''].concat(sn, extra.length ? ['(Also on the old scene: ' + extra.join(' / ') + ')'] : []).filter(Boolean).join('\n');
    if (notes) out.notes = notes; else delete out.notes;
    return out;
  }
  function enabledWorlds(themeId, meta) {
    var t = PD.theme.resolve(themeId), out = ['core'];
    (t.worlds || []).concat(meta.worlds || []).forEach(function (w) { if (out.indexOf(w) < 0) out.push(w); });
    return out;
  }
  function needing(scenes, themeId, meta) {
    var enabled = enabledWorlds(themeId, meta), out = [];
    scenes.forEach(function (sc, i) {
      var T = sc && sc.template ? PD.template.get(sc.template) : null;
      if (!T) return;
      var need = ((T.requires && T.requires.worlds) || []).slice();
      if (T.requires && typeof T.requires.worldsFor === 'function') { try { need = need.concat(T.requires.worldsFor(sc.props || {}) || []); } catch (e) { } }
      var miss = need.filter(function (w) { return enabled.indexOf(w) < 0; });
      if (miss.length) out.push({ index: i, scene: sc, template: T, missing: miss });
    });
    return out;
  }

  S.screen('look', {
    title: 'Look', rail: 3,
    mount: function (el, ctx) {
      var store = ctx.store, ui = ctx.ui, offs = [], timers = {}, cards = {};
      function meta() { return store.get().deck.meta; }
      function ro() { return !!store.get().studio.readOnly; }
      function deckId() { return store.get().deck.id; }

      var page = h('div', { class: 'pds-look' });
      el.appendChild(page);

      /* ------------------------------------------------ the preview decks */
      function patchFor(themeId) {
        var p = JSON.parse(JSON.stringify(meta().themePatch || {}));
        if (themeId !== 'cosmos' && p.world) { delete p.world.nebula; if (!Object.keys(p.world).length) delete p.world; }
        if (p.fontFaces && p.fontFaces[0]) { p.fonts = p.fonts || {}; p.fonts.display = '"' + p.fontFaces[0].family + '", ' + store.baseDisplayFont(themeId); }
        return p;
      }
      function previewDeck(themeId) {
        var st = meta().story || {}, brand = (st.brand || '').trim(), tag = (st.tagline || '').trim(), idea = (st.shortIdea || st.bigIdea || '').trim();
        var scene = themeId === 'cosmos'
          ? { id: 'preview', template: 'brand-reveal', props: { title: clip(brand || 'Your brand', 18), subtitle: clip(tag || 'Your tagline', 40), shot: 'BLOOM' } }
          : { id: 'preview', template: 'statement', props: { kicker: clip(brand, 30) || 'Your talk', line: clip(idea || 'Say one thing, and say it big.', 90), shot: 'DRIFT' } };
        return { format: 2, id: deckId(), meta: { title: 'Look preview', theme: themeId, themePatch: patchFor(themeId) }, scenes: [scene] };
      }
      function compilePreview(themeId) { return PD.compile(previewDeck(themeId), { assetsDeckId: deckId() }); }

      /* ------------------------------------------------ head */
      page.appendChild(h('div', { class: 'pds-look-head' }, [
        h('p', { class: 'pds-eyebrow' }, ['Step 3 · Look']),
        h('h1', { class: 'pds-h1' }, ['Choose the look']),
        h('p', { class: 'pds-lede' }, ['A look is colour, type and atmosphere, and nothing else. Your story and your words stay exactly as they are.'])
      ]));

      /* ------------------------------------------------ theme cards */
      var cardRow = h('div', { class: 'pds-look-cards', role: 'radiogroup', 'aria-label': 'Look' });
      page.appendChild(cardRow);
      function suggested() { var t = (meta().story || {}).tone; return t ? PD.story.defaultTheme(t) : null; }
      THEMES.forEach(function (t, i) {
        var canvas = h('canvas', { class: 'pds-look-canvas', 'aria-hidden': 'true' });
        var input = h('input', { type: 'radio', name: 'look', value: t.id, 'aria-label': t.name, disabled: ro() ? true : null });
        input.addEventListener('change', function () { if (input.checked) choose(t.id); });
        var replay = h('button', { class: 'pds-btn pds-btn-sm pds-look-replay', type: 'button', 'aria-label': 'Play the ' + t.name + ' preview again', onclick: function (e) { e.preventDefault(); e.stopPropagation(); if (cards[t.id].view) cards[t.id].view.replay(); } }, [icon('play', 14), 'Replay']);
        var badge = h('span', { class: 'pds-fw-tag rec', hidden: true }, ['Suggested for your tone']);
        var node = h('label', { class: 'pds-look-card', 'data-theme': t.id, style: { '--i': String(i) } }, [
          input,
          h('div', { class: 'pds-look-stage' }, [canvas, replay]),
          h('div', { class: 'pds-look-meta' }, [h('h3', null, [t.name]), badge, h('span', { class: 'pds-fw-check', 'aria-hidden': 'true' }, [icon('check', 14)])]),
          h('p', null, [t.blurb])
        ]);
        node.addEventListener('pointerenter', function () { if (!node.classList.contains('is-selected') && cards[t.id].view) { clearTimeout(timers['rest' + t.id]); cards[t.id].view.replay(); } });
        node.addEventListener('pointerleave', function () {
          if (node.classList.contains('is-selected')) return;
          timers['rest' + t.id] = setTimeout(function () { if (cards[t.id].view && !node.classList.contains('is-selected')) cards[t.id].view.rest(); }, 900);
        });
        cards[t.id] = { node: node, canvas: canvas, input: input, badge: badge, view: null };
        cardRow.appendChild(node);
      });
      function paintCards() {
        var cur = meta().theme, sug = suggested();
        THEMES.forEach(function (t) {
          var c = cards[t.id];
          c.input.checked = t.id === cur;
          c.node.classList.toggle('is-selected', t.id === cur);
          c.badge.hidden = !(sug === t.id);
        });
      }
      function refreshViews(mode) {
        var cur = meta().theme;
        THEMES.forEach(function (t, i) {
          var c = cards[t.id];
          clearTimeout(timers['mk' + t.id]);
          timers['mk' + t.id] = setTimeout(function () {
            if (!document.body.contains(c.canvas)) return;
            var compiled;
            try { compiled = compilePreview(t.id); } catch (e) { try { console.warn('studio: a Look preview did not compile', e); } catch (e2) { } return; }
            try {
              var sel = t.id === cur;
              c.canvas.setAttribute('data-themekey', compiled.themeKey);          // what the preview was built with (read by the tests)
              c.canvas.setAttribute('data-font', compiled.theme.fonts.display);
              if (!c.view) { c.view = S.stageView(c.canvas, compiled, { quality: 1.25, maxDpr: 2 }); if (sel) c.view.replay(); else c.view.rest(); }
              else c.view.setDeck(compiled, sel ? (mode === 'settled' ? 'settled' : 'replay') : 'rest');
            } catch (e) { try { console.warn('studio: a Look preview did not start', e); } catch (e2) { } }
          }, 20 + i * 90);
        });
      }

      /* ------------------------------------------------ switching the look */
      function applyTheme(d, id) {
        var m = d.deck.meta;
        m.theme = id;
        d.studio.themeChosen = true;
        if (id !== 'cosmos' && m.themePatch && m.themePatch.world) { delete m.themePatch.world.nebula; }
        store.refitFont(m);
        store.cleanPatch(m);
      }
      function choose(id) {
        var m = meta();
        if (id === m.theme || ro()) { paintCards(); return; }
        var problems = needing(store.get().deck.scenes, id, m), label = THEMES.filter(function (t) { return t.id === id; })[0].name;
        if (!problems.length) { store.commit('Look: ' + label, function (d) { applyTheme(d, id); }); return; }
        var list = h('ul', { class: 'pds-swap-list' }, problems.map(function (pr) {
          var to = swapFor(pr.scene), T2 = PD.template.get(to.template);
          return h('li', null, [h('b', null, [String(pr.index + 1).padStart(2, '0')]), h('span', null, [pr.template.label]), icon('arrow', 14), h('span', null, [T2 ? T2.label : to.template])]);
        }));
        ui.dialog({
          title: label + " can't play " + problems.length + ' of your scenes', dismissValue: 'cancel',
          body: h('div', null, [
            h('p', null, ['These scenes need the ' + (id === 'slate' ? 'Cosmos' : 'other') + ' look. Without it they would be flagged as broken, and the deck could not be saved until you fixed them. Swap each for the closest scene that works in any look: the words you wrote stay.']),
            list
          ]),
          actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Keep them anyway', value: 'keep' }, { label: 'Swap to closest adaptive template', value: 'swap', kind: 'primary' }]
        }).then(function (choice) {
          if (choice === 'cancel' || choice === undefined) { paintCards(); return; }
          store.commit('Look: ' + label, function (d) {
            applyTheme(d, id);
            if (choice === 'swap') problems.forEach(function (pr) {
              var at = d.deck.scenes.findIndex(function (s) { return s.id === pr.scene.id; });
              if (at >= 0) d.deck.scenes[at] = swapFor(d.deck.scenes[at]);
            });
          });
          if (choice === 'swap') ui.toast('Swapped ' + problems.length + (problems.length === 1 ? ' scene' : ' scenes') + '. Undo brings them back.');
        });
      }

      /* ------------------------------------------------ controls */
      var ctls = h('div', { class: 'pds-look-ctls' });
      page.appendChild(ctls);
      function later(key, fn, ms) { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms == null ? 140 : ms); }
      function patchRoles(d) { var m = d.deck.meta; m.themePatch = m.themePatch || {}; m.themePatch.roles = m.themePatch.roles || {}; return m.themePatch.roles; }
      function effective(key) {
        var info = store.themeInfo(), r = info && info.theme && info.theme.roles || {}, v = r[key];
        return Array.isArray(v) ? v[v.length - 1] : v || '#888888';
      }
      function colorCtl(opts) {
        var color = h('input', { class: 'pds-color', type: 'color', 'data-ctl': opts.key, 'aria-label': opts.label, disabled: ro() ? true : null });
        var hex = h('input', { class: 'pds-input pds-hex', type: 'text', maxlength: '7', spellcheck: 'false', 'aria-label': opts.label + ' as a hex code', disabled: ro() ? true : null });
        var reset = h('button', { class: 'pds-icon-btn', type: 'button', title: 'Reset ' + opts.label.toLowerCase() + ' to the look\'s own', 'aria-label': 'Reset ' + opts.label.toLowerCase(), 'data-act': 'reset-' + opts.key, disabled: ro() ? true : null, onclick: function () {
          store.commit('Look: ' + opts.label, function (d) { opts.clear(d.deck.meta.themePatch && d.deck.meta.themePatch.roles); store.cleanPatch(d.deck.meta); });
        } }, [icon('refresh', 16)]);
        function apply(v) { var c = normHex(v); if (!c) return; later(opts.key, function () { store.commit('Look: ' + opts.label, function (d) { opts.write(patchRoles(d), c); }); }); }
        color.addEventListener('input', function () { hex.value = color.value; apply(color.value); });
        hex.addEventListener('input', function () { var c = normHex(hex.value.indexOf('#') === 0 ? hex.value : '#' + hex.value); if (c) { color.value = c; apply(c); } });
        hex.addEventListener('blur', function () { hex.value = color.value; });
        var presets = h('div', { class: 'pds-presets', role: 'group', 'aria-label': opts.label + ' presets' }, PRESETS.map(function (c) {
          return h('button', { class: 'pds-preset', type: 'button', title: c, 'aria-label': opts.label + ' ' + c, 'data-color': c, style: { '--sw': c }, disabled: ro() ? true : null, onclick: function () { color.value = c; hex.value = c; apply(c); } });
        }));
        var node = h('div', { class: 'pds-colorrow', 'data-colorrow': opts.key }, [
          h('div', { class: 'pds-colorrow-label' }, [h('b', null, [opts.label]), h('span', null, [opts.help])]),
          h('div', { class: 'pds-colorrow-ctls' }, [h('div', { class: 'pds-ctl-row' }, [color, hex, reset]), presets])
        ]);
        var presetEls = Array.prototype.slice.call(presets.children);
        return { node: node, sync: function () {
          var c = normHex(effective(opts.role)) || '#888888';
          presetEls.forEach(function (b) { var on = b.getAttribute('data-color') === c; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
          if (document.activeElement === color || document.activeElement === hex) return;
          color.value = c; hex.value = c;
        } };
      }
      var accentCtl = colorCtl({
        key: 'accent', label: 'Accent', role: 'accent', help: 'Kickers and small highlights.',
        write: function (r, c) { r.accent = c; r.accentGlow = glowOf(c); }, clear: function (r) { if (r) { delete r.accent; delete r.accentGlow; } }
      });
      var futureCtl = colorCtl({
        key: 'future', label: 'Future', role: 'future', help: 'Years and the moment the story turns.',
        write: function (r, c) { r.future = [mix(c, '#ffffff', 0.72), c]; r.futureGlow = glowOf(c); }, clear: function (r) { if (r) { delete r.future; delete r.futureGlow; } }
      });

      // nebula: six swatches, each a gradient of the preset's three colours
      var nebBox = h('div', { class: 'pds-nebulae', role: 'radiogroup', 'aria-label': 'Default nebula' });
      var nebHelp = h('p', { class: 'pds-ctl-help' }, ['The glow behind scenes that do not choose their own.']);
      function paintNebulae() {
        var info = store.themeInfo(), cosmos = meta().theme === 'cosmos', neb = info && info.theme && info.theme.nebulae || {}, cur = info && info.theme && info.theme.world && info.theme.world.nebula || 'aurora';
        if (!Object.keys(neb).length) { try { neb = PD.theme.resolve('cosmos').nebulae || {}; } catch (e) { neb = {}; } }     // shown dimmed under a look that has none
        nebBox.textContent = '';
        nebBox.classList.toggle('is-off', !cosmos);
        Object.keys(neb).forEach(function (name) {
          var c = neb[name];
          nebBox.appendChild(h('button', {
            class: 'pds-neb' + (name === cur && cosmos ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(name === cur && cosmos), 'data-nebula': name, title: name,
            disabled: !cosmos || ro() ? true : null, style: { background: 'radial-gradient(circle at 30% 30%, ' + c[0] + ', transparent 60%), radial-gradient(circle at 75% 70%, ' + c[1] + ', transparent 62%), linear-gradient(135deg,' + c[2] + ',#12131f)' },
            onclick: function () { store.commit('Look: nebula', function (d) { var m = d.deck.meta; m.themePatch = m.themePatch || {}; m.themePatch.world = m.themePatch.world || {}; m.themePatch.world.nebula = name; }); }
          }, [h('span', null, [name])]));
        });
        nebHelp.textContent = cosmos ? 'The glow behind scenes that do not choose their own.' : 'Nebulae belong to the Cosmos look.';
      }

      // brand font
      var fontBox = h('div', { class: 'pds-fontbox' });
      function paintFont() {
        var bf = store.brandFont(), a = store.assets(), fonts = Object.keys(a).filter(function (id) { return a[id].type === 'font'; });
        fontBox.textContent = '';
        if (bf && a[bf.asset]) {
          var fam = h('input', { class: 'pds-input', type: 'text', value: bf.family, 'aria-label': 'Font family name', maxlength: '60', disabled: ro() ? true : null });
          fam.addEventListener('change', function () { var v = fam.value.trim(); if (v && v !== bf.family) store.setBrandFont(bf.asset, v); else fam.value = bf.family; });
          fontBox.appendChild(h('div', { class: 'pds-font-set' }, [
            h('div', { class: 'pds-font-sample', style: { 'font-family': '"' + bf.family + '", system-ui' } }, ['Aa']),
            h('div', { class: 'pds-font-info' }, [fam, h('span', null, [a[bf.asset].name + ' · ' + Math.max(1, Math.round((a[bf.asset].bytes || 0) / 1024)) + ' KB'])])
          ]));
          fontBox.appendChild(h('div', { class: 'pds-ctl-row' }, [
            h('button', { class: 'pds-btn pds-btn-sm', type: 'button', 'data-act': 'font-pick', disabled: ro() ? true : null, onclick: pickFont }, ['Replace…']),
            h('button', { class: 'pds-btn pds-btn-sm pds-btn-ghost', type: 'button', 'data-act': 'font-clear', disabled: ro() ? true : null, onclick: function () { store.setBrandFont(null); } }, ['Use the theme font'])
          ]));
        } else {
          fontBox.appendChild(h('button', { class: 'pds-fontdrop', type: 'button', 'data-act': 'font-pick', disabled: ro() ? true : null, onclick: pickFont }, [
            icon('font', 20), h('b', null, ['Drop a font file, or choose one']), h('span', null, ['.woff2 · .woff · .ttf · .otf'])
          ]));
        }
        var others = fonts.filter(function (id) { return !bf || id !== bf.asset; });
        if (others.length) {
          fontBox.appendChild(h('div', { class: 'pds-font-others' }, others.map(function (id) {
            return h('button', { class: 'pds-chip-btn', type: 'button', 'data-font': id, disabled: ro() ? true : null, onclick: function () { store.setBrandFont(id); } }, ['Use ' + (a[id].family || id)]);
          })));
        }
      }
      // adds the font file(s) to the deck and makes the first one the brand font: the one path behind the chooser and a drop
      function takeFonts(list) {
        if (ro() || !list.length) return Promise.resolve(false);
        return store.addFiles(list).then(function (res) {
          res.rejected.forEach(function (r) { ui.toast(r.message, 'error'); });
          res.warnings.forEach(function (w) { if (w.kind === 'big-total') ui.banner(w.msg, 'warn', { key: 'big-total' }); else ui.toast(w.msg, 'warn'); });
          var f = res.added.filter(function (x) { return x.kind === 'font'; });
          if (!f.length) return false;
          return store.setBrandFont(f[0].id).then(function (ok) {
            if (ok) ui.toast('Your font is in. The previews use it now.' + (f.length > 1 ? ' The other ' + (f.length - 1) + (f.length === 2 ? ' is' : ' are') + ' in your assets.' : ''));
            else ui.toast("Couldn't read this font; using the theme font.", 'error');
            return ok;
          });
        });
      }
      function pickFont() {
        S.pickFiles({ accept: '.woff2,.woff,.ttf,.otf,font/*', multiple: false }).then(function (list) { if (list[0]) takeFonts([list[0]]); });
      }
      // a font dropped anywhere on this screen is the brand font (acceptance 8). Pictures dropped with it are added the usual way; a
      // drop with no font in it, or a saved deck, is left to the shell's own handler, which runs after this one.
      function onDrop(e) {
        var dt = e.dataTransfer, list = dt && dt.files ? Array.prototype.slice.call(dt.files) : [];
        if (ro() || !list.length || e.defaultPrevented) return;
        var kind = function (f) { return S.files.classify(f).kind; };
        if (list.some(function (f) { return kind(f) === 'html'; }) || !list.some(function (f) { return kind(f) === 'font'; })) return;
        e.preventDefault();
        var rest = list.filter(function (f) { return kind(f) !== 'font'; });
        takeFonts(list.filter(function (f) { return kind(f) === 'font'; }));
        if (rest.length) S.handleDrop(rest);
      }
      el.addEventListener('drop', onDrop);
      S.setDropHint('Drop a font to make it your brand font. Pictures are added to your deck.');

      function ctl(title, node, help) { return h('div', { class: 'pds-ctl' }, [h('h4', null, [title]), node, help]); }
      ctls.appendChild(ctl('Colour', h('div', { class: 'pds-colorrows' }, [accentCtl.node, futureCtl.node])));
      ctls.appendChild(ctl('Nebula', nebBox, nebHelp));
      ctls.appendChild(ctl('Brand font', fontBox, h('p', { class: 'pds-ctl-help' }, ['Embedded in the saved file, so it travels with the deck.'])));

      function syncControls() { accentCtl.sync(); futureCtl.sync(); paintNebulae(); paintFont(); paintCards(); }
      syncControls();
      refreshViews('play');

      offs.push(store.on('change', function (ev) {
        syncControls();
        if (ev.themeChanged) refreshViews('settled');
        else if (ev.changedSceneIds && ev.changedSceneIds.length === 0 && !ev.undo) { /* only the story or a title changed */ }
      }));
      offs.push(store.on('assets', function () { paintFont(); }));
      return {
        unmount: function () {
          el.removeEventListener('drop', onDrop);
          S.setDropHint(null);
          offs.forEach(function (o) { o(); });
          Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
          Object.keys(cards).forEach(function (k) { if (cards[k].view) cards[k].view.destroy(); cards[k].view = null; });
        }
      };
    }
  });
  return {};
}, { export: false });
