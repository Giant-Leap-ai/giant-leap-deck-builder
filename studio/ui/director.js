/* studio/ui/director.js — the Director: the coherence checker's panel (spec §7.3 "Director", WP7).
 *
 *   PD.get('studio/ui/director').create(opts) → Director
 *     opts = { onShow(finding), onIgnore(finding), onRehearse() }
 *   Director = {
 *     el
 *     update({ lint, infos, selectedId, readOnly })   lint = what store.lint() returns: { findings, score, ready, summary, counts? }
 *     counts() → { error, warn, info, shown }          what the list shows now (tests)
 *     destroy() }
 * The score and "Ready for the stage" lead; findings follow, grouped by how much they matter: fix first (errors), consider
 * (warnings) and tips (infos, folded away). Each finding says where it is and offers [Show me] (select that scene and step)
 * and [Ignore for this scene] (adds the rule to scene.lint.ignore). A switch narrows the list to the selected scene. */
PD.module('studio/ui/director', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };

  var CSS = [
    '.dr { display: flex; flex-direction: column; min-height: 0; height: 100%; border-radius: 16px; background: color-mix(in srgb, var(--pdx-panel) 72%, transparent); border: 1px solid var(--pdx-hair-2); overflow: hidden; }',
    '.dr-top { flex: none; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--pdx-hair-2); }',
    '.dr-row { display: flex; align-items: center; gap: 14px; }',
    '.dr-ring { position: relative; flex: none; width: 60px; height: 60px; }',
    '.dr-ring svg { width: 60px; height: 60px; transform: rotate(-90deg); }',
    '.dr-ring circle { fill: none; stroke-width: 6; stroke-linecap: round; }',
    '.dr-ring .tr { stroke: var(--pdx-line); opacity: .7; }',
    '.dr-ring .fg { stroke: var(--c, var(--pdx-ok)); transition: stroke-dashoffset .8s var(--pdx-ease), stroke .3s; }',
    '.dr-ring b { position: absolute; inset: 0; display: grid; place-items: center; font: 700 19px var(--pdx-mono); letter-spacing: -.02em; }',
    '.dr-hd { min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }',
    '.dr-sum { color: var(--pdx-muted); font-size: 12.5px; line-height: 1.45; }',
    '@media (max-height: 800px) { .dr-sum { display: none; } .dr-top { padding: 12px 16px 12px; gap: 10px; } }',
    '.dr-scope { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
    '.dr-list { flex: 1; min-height: 0; overflow: auto; padding: 8px 10px 16px; scrollbar-width: thin; scrollbar-color: var(--pdx-line) transparent; }',
    '.dr-sec { margin-top: 10px; }',
    '.dr-sec > button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 8px 6px; cursor: default; }',
    '.dr-sec.is-fold > button { cursor: pointer; border-radius: 8px; } .dr-sec.is-fold > button:hover { background: var(--pdx-raise); }',
    '.dr-sec > button .n { margin-left: auto; font: 600 11px var(--pdx-mono); color: var(--pdx-faint); }',
    '.dr-f { position: relative; display: flex; gap: 11px; padding: 12px 12px 12px 10px; margin: 2px 0; border-radius: 12px; transition: background .16s; }',
    '.dr-f:hover { background: color-mix(in srgb, var(--pdx-raise) 80%, transparent); }',
    '.dr-f.is-new { animation: pdx-in .3s var(--pdx-ease); }',
    '.dr-f .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }',
    '.dr-f[data-sev="error"] { --c: var(--pdx-err); } .dr-f[data-sev="warn"] { --c: var(--pdx-warn); } .dr-f[data-sev="info"] { --c: var(--pdx-faint); }',
    '.dr-f .msg { font-size: 13px; line-height: 1.45; color: var(--pdx-text); }',
    '.dr-f .where { margin-top: 3px; font-size: 11.5px; color: var(--pdx-faint); }',
    '.dr-f .fix { margin-top: 5px; font-size: 12px; line-height: 1.45; color: var(--pdx-muted); }',
    '.dr-f .act { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }',
    '.dr-f.is-here::before { content: ""; position: absolute; left: -2px; top: 12px; bottom: 12px; width: 3px; border-radius: 3px; background: var(--pdx-accent); }',
    '.dr-g { margin: 2px 0; border-radius: 12px; border: 1px solid var(--pdx-hair-2); background: color-mix(in srgb, var(--pdx-panel) 55%, transparent); }',
    '.dr-g > button { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 11px; padding: 12px 12px 12px 10px; cursor: pointer; border-radius: 12px; }',
    '.dr-g > button:hover { background: color-mix(in srgb, var(--pdx-raise) 80%, transparent); } .dr-g > button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: -2px; }',
    '.dr-g .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }',
    '.dr-g[data-sev="error"] { --c: var(--pdx-err); } .dr-g[data-sev="warn"] { --c: var(--pdx-warn); } .dr-g[data-sev="info"] { --c: var(--pdx-faint); }',
    '.dr-g .msg { font-size: 13px; line-height: 1.45; } .dr-g .where { margin-top: 3px; font-size: 11.5px; color: var(--pdx-faint); }',
    '.dr-g .chev { margin-left: auto; color: var(--pdx-faint); flex: none; margin-top: 3px; transition: transform .22s var(--pdx-ease); } .dr-g.is-open .chev { transform: rotate(90deg); }',
    '.dr-g > .in { padding: 0 6px 8px; border-top: 1px solid var(--pdx-hair-2); margin-top: 0; }',
    '.dr-g > .act { padding: 0 12px 12px 29px; display: flex; gap: 6px; }',
    '.dr-clean { margin: 18px 10px; padding: 22px 18px; border-radius: 14px; text-align: center; background: color-mix(in srgb, var(--pdx-ok) 7%, transparent); border: 1px solid color-mix(in srgb, var(--pdx-ok) 22%, transparent); display: flex; flex-direction: column; gap: 12px; align-items: center; color: var(--pdx-text); line-height: 1.5; }',
    '.dr-clean .pdx-ico { color: var(--pdx-ok); }'
  ].join('\n');

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, icon = f.icon;
    f.ensureBase(); f.css('director', CSS);
    var S = PD.story;
    var ringFg = f.svg('circle', { class: 'fg', cx: 33, cy: 33, r: 28, 'stroke-dasharray': '175.9', 'stroke-dashoffset': '175.9' });
    var score = h('b', { text: '–' });
    var ring = h('div', { class: 'dr-ring' }, [f.svg('svg', { viewBox: '0 0 66 66' }, [f.svg('circle', { class: 'tr', cx: 33, cy: 33, r: 28 }), ringFg]), score]);
    var pill = h('span', { class: 'pdx-pill' }), sum = h('div', { class: 'dr-sum' });
    var scope = f.seg([{ value: 'all', label: 'Whole talk' }, { value: 'scene', label: 'This scene' }], 'all', function (v) { mode = v; paint(); });
    var top = h('div', { class: 'dr-top' }, [
      h('div', { class: 'dr-row' }, [ring, h('div', { class: 'dr-hd' }, [h('span', { class: 'pdx-cap', text: 'Director' }), pill, sum])]),
      h('div', { class: 'dr-scope' }, [scope.el])]);
    var list = h('div', { class: 'dr-list', role: 'list' });
    var root = h('div', { class: 'pdx dr' }, [top, list]);
    var last = null, mode = 'all', fold = { info: true }, seen = {}, shown = { error: 0, warn: 0, info: 0, shown: 0 }, lastSig = null;

    function keyOf(x) { return x.id + '|' + (x.sceneId || '') + '|' + (x.step == null ? '' : x.step) + '|' + x.msg; }
    // folded titles. n = how many findings, k = how many different scenes they sit in (a scene can carry several findings)
    function scenesWord(k, one, many) { return k === 1 ? 'One scene ' + one : k + ' scenes ' + many; }
    var GROUP = {
      'copy.placeholder': function (n, k) { return scenesWord(k, 'still has placeholder text', 'still have placeholder text'); },
      'copy.notes': function (n, k) { return scenesWord(k, 'has no speaker notes', 'have no speaker notes'); },
      'story.point': function (n, k) { return scenesWord(k, 'does not say its point yet', 'do not say their point yet'); },
      'copy.lines': function (n) { return n === 1 ? 'One line runs onto too many lines' : n + ' lines run onto too many lines'; },
      'copy.style-words': function (n) { return n === 1 ? 'One line has more words than its style likes' : n + ' lines have more words than their style likes'; },
      'build.template.requires-world': function (n, k) { return scenesWord(k, 'uses a shot this look cannot show', 'use shots this look cannot show'); },
      'build.world.needs-plugin': function (n, k) { return scenesWord(k, 'sets a background this look does not have', 'set backgrounds this look does not have'); }
    };
    var PER_LINE = { 'copy.lines': 1, 'copy.style-words': 1 };      // their titles already count findings, one per line
    var openGroups = {};
    // distinct scene numbers, in talk order: "Scene 3" / "Scenes 3, 4, 7 and 2 more"
    function whereOf(items, infosById) {
      var seen = {}, nums = [];
      items.forEach(function (x) { var i = infosById[x.sceneId]; if (i && !seen[i.i]) { seen[i.i] = 1; nums.push(i.i + 1); } });
      nums.sort(function (a, b) { return a - b; });
      return { nums: nums, text: (nums.length === 1 ? 'Scene ' : 'Scenes ') + nums.slice(0, 5).join(', ') + (nums.length > 5 ? ' and ' + (nums.length - 5) + ' more' : '') };
    }
    // a rule with no title of its own says what the note says: the message when every finding has the same one, otherwise the first
    // finding's message (the folded card then counts the others); never a count of findings dressed up as a count of scenes
    function titleOf(id, items, nScenes) {
      if (GROUP[id]) return GROUP[id](items.length, nScenes);
      return items[0].msg || (nScenes === 1 ? 'One scene has this note' : nScenes + ' scenes share this note');
    }
    function groupCard(sev, id, items, infosById) {
      var open = !!openGroups[id];            // folded until opened: twelve placeholder notes should not read as twelve failures
      var w = whereOf(items, infosById), same = items.every(function (x) { return x.msg === items[0].msg; });
      var more = '';      // the title counts scenes (or lines); the second line adds how many findings sit behind them when that is more
      if (!GROUP[id]) more = items.length > 1 ? (same ? ' · ' + items.length + ' times' : ' · ' + (items.length - 1) + ' more like it') : '';
      else if (!PER_LINE[id] && items.length > w.nums.length) more = ' · ' + items.length + ' notes';
      var g = h('div', { class: 'dr-g' + (open ? ' is-open' : ''), dataset: { group: id, sev: sev } });
      var head = h('button', { type: 'button', 'aria-expanded': String(!!open), onclick: function () { openGroups[id] = !open; lastSig = null; paint(); } }, [h('span', { class: 'dot' }),
        h('div', { style: 'min-width:0' }, [h('div', { class: 'msg', text: titleOf(id, items, w.nums.length) }), h('div', { class: 'where', text: w.text + more })]), h('span', { class: 'chev' }, icon('chevR', 15))]);
      g.appendChild(head);
      if (open) { var inner = h('div', { class: 'in' }); items.forEach(function (x) { inner.appendChild(card(x, infosById)); }); g.appendChild(inner); }
      else g.appendChild(h('div', { class: 'act' }, h('button', { type: 'button', class: 'pdx-btn is-sm', dataset: { act: 'show-first' }, text: 'Show me the first', onclick: function () { if (opts.onShow) opts.onShow(items[0]); } })));
      return g;
    }
    function section(sev, label, items, infosById) {
      var folded = sev === 'info' && fold.info;
      var head = h('button', { type: 'button', 'aria-expanded': String(!folded) }, [
        sev === 'info' ? icon(folded ? 'chevR' : 'chevD', 14) : null,
        h('span', { class: 'pdx-cap', text: label, style: sev === 'error' ? 'color:var(--pdx-err)' : sev === 'warn' ? 'color:var(--pdx-warn)' : '' }), h('span', { class: 'n', text: String(items.length) })]);
      var sec = h('div', { class: 'dr-sec' + (sev === 'info' ? ' is-fold' : '') }, head);
      if (sev === 'info') head.addEventListener('click', function () { fold.info = !fold.info; paint(); });
      if (!folded) {
        var by = {}, order = [];
        items.forEach(function (x) { if (!by[x.id]) { by[x.id] = []; order.push(x.id); } by[x.id].push(x); });
        order.forEach(function (id) {
          var g = by[id];
          if (mode === 'all' && g.length >= 4 && g.every(function (x) { return x.sceneId != null; })) sec.appendChild(groupCard(sev, id, g, infosById));
          else g.forEach(function (x) { sec.appendChild(card(x, infosById)); });
        });
      }
      return sec;
    }
    function card(x, infosById) {
      var inf = x.sceneId != null ? infosById[x.sceneId] : null, k = keyOf(x), isNew = !seen[k];
      var where = inf ? 'Scene ' + (inf.i + 1) + ' · ' + inf.label + (x.step ? ' · click ' + x.step : '') : 'The whole talk';
      var canIgnore = inf && !last.readOnly && inf.isTpl;
      var acts = h('div', { class: 'act' });
      if (inf) acts.appendChild(h('button', { type: 'button', class: 'pdx-btn is-sm', dataset: { act: 'show' }, text: 'Show me', onclick: function () { if (opts.onShow) opts.onShow(x); } }));
      if (canIgnore) acts.appendChild(h('button', { type: 'button', class: 'pdx-btn is-sm is-quiet', dataset: { act: 'ignore' }, text: S.say ? S.say('lint.ignore') : 'Ignore for this scene', onclick: function () { if (opts.onIgnore) opts.onIgnore(x); } }));
      var el = h('div', { class: 'dr-f' + (isNew ? ' is-new' : '') + (last.selectedId && x.sceneId === last.selectedId ? ' is-here' : ''), role: 'listitem', dataset: { rule: x.id, scene: x.sceneId == null ? '' : x.sceneId, sev: x.sev } }, [
        h('span', { class: 'dot' }),
        h('div', { style: 'min-width:0' }, [h('div', { class: 'msg', text: x.msg }), h('div', { class: 'where', text: where }), x.fix ? h('div', { class: 'fix', text: x.fix }) : null, acts])]);
      el.dataset.sev = x.sev;
      return el;
    }

    function paint() {
      var d = last;
      if (!d || !d.lint) return;
      var L = d.lint, infosById = {};
      (d.infos || []).forEach(function (i) { infosById[i.id] = i; });
      var sc = Math.max(0, Math.min(100, L.score == null ? 100 : L.score));
      score.textContent = String(Math.round(sc));
      ringFg.setAttribute('stroke-dashoffset', String(175.9 * (1 - sc / 100)));
      ring.style.setProperty('--c', sc >= 90 ? 'var(--pdx-ok)' : sc >= 70 ? 'var(--pdx-warn)' : 'var(--pdx-err)');
      var counts = L.counts || { error: 0, warn: 0, info: 0 };
      var errList = (L.findings || []).filter(function (x) { return x.sev === 'error'; }), errs = errList.length;
      // a deck whose only errors are placeholders is a draft, not a failure: say so in a gentler colour
      var draft = !L.ready && errs > 0 && errList.every(function (x) { return x.id === 'copy.placeholder'; });
      pill.className = 'pdx-pill ' + (L.ready ? 'is-ok' : draft ? 'is-warn' : 'is-err');
      f.clear(pill);
      pill.appendChild(icon(L.ready ? 'check' : draft ? 'pen' : 'alert', 13));
      pill.appendChild(document.createTextNode(L.ready ? S.say('lint.ready') : draft ? 'Still drafting' : (errs + (errs === 1 ? ' thing' : ' things') + ' to fix')));
      sum.textContent = L.ready ? (L.summary || '') : draft ? (errs === 1 ? 'One scene still has placeholder text. Write it and this clears.' : errs + ' scenes still have placeholder text. Write them and this clears.')
        : errs === 1 ? 'One thing to fix before it\u2019s stage-ready. You can still present.' : (S.say ? S.say('lint.notReady', { e: errs }) : '');
      if (draft) ring.style.setProperty('--c', 'var(--pdx-warn)');
      var all = L.findings || [], items = mode === 'scene' ? all.filter(function (x) { return x.sceneId === d.selectedId; }) : all;
      // nothing the panel shows has changed: leave the DOM alone (a press in flight on Show me must not lose its button)
      var sig = JSON.stringify([L.score, L.ready, L.summary, JSON.stringify(openGroups), items.map(function (x) { return [x.id, x.sceneId, x.step, x.sev, x.msg, x.fix]; }), all.length, d.selectedId, mode, fold.info, !!d.readOnly,
        (d.infos || []).map(function (i) { return i.id + '|' + i.i + '|' + i.label + '|' + i.isTpl; })]);
      if (sig === lastSig) return;
      lastSig = sig;
      scope.el.querySelector('[data-value="scene"]').textContent = 'This scene' + (d.selectedId ? ' (' + all.filter(function (x) { return x.sceneId === d.selectedId; }).length + ')' : '');
      f.clear(list);
      var by = { error: [], warn: [], info: [] };
      items.forEach(function (x) { by[x.sev].push(x); });
      shown = { error: by.error.length, warn: by.warn.length, info: by.info.length, shown: items.length };
      if (!items.length) {
        var msg = mode === 'scene' ? 'Nothing to flag on this scene.' : (S.say ? S.say('lint.clean') : 'Your story holds together.');
        list.appendChild(h('div', { class: 'dr-clean' }, [icon('check', 26), h('div', { text: msg }), mode === 'all' && opts.onRehearse && L.ready ? h('button', { type: 'button', class: 'pdx-btn is-primary', onclick: opts.onRehearse }, [icon('expand', 15), h('span', { text: 'Rehearse it' })]) : null]));
      } else {
        if (by.error.length) list.appendChild(section('error', 'Fix first', by.error, infosById));
        if (by.warn.length) list.appendChild(section('warn', 'Consider', by.warn, infosById));
        if (by.info.length) list.appendChild(section('info', 'Tips', by.info, infosById));
      }
      seen = {}; all.forEach(function (x) { seen[keyOf(x)] = 1; });
    }

    return {
      el: root,
      update: function (d) { last = d; paint(); },
      counts: function () { return shown; },
      destroy: function () { if (root.parentNode) root.parentNode.removeChild(root); }
    };
  }
  return { create: create };
}, { export: false });
