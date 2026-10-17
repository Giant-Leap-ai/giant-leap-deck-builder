/* studio/ui/inspector.js — the Inspector of the storyboard workspace (spec §7.3 "Inspector", WP7).
 *
 *   PD.get('studio/ui/inspector').create(opts) → Inspector
 *     opts = { store,                         ctx.store (§7.8): edits go through store.commit
 *              onChangeTemplate(id),          open the template picker in change mode
 *              onNext(),                      go to the next scene that still needs words
 *              onTab(tab),                    the tab was changed (the board remembers it)
 *              addAsset(accept),              open the file chooser of the assets column
 *              tab?: 'content' | 'scene' | 'advanced' }
 *   Inspector = {
 *     el
 *     update({ compiled, infos, selectedId, readOnly, readOnlyWhy })   the selection or the deck changed
 *     onStoreChange(evt)       a store 'change': re-render only when the scene was changed by something other than this form
 *     showTab(tab)             'content' | 'scene' | 'advanced'
 *     flush()                  commit a pending edit now (selection changes, blur, unmount all call it)
 *     pending() → bool
 *     destroy() }
 * Content is generated from the template's props schema (forms.buildForm): words with live counts against the copy budget
 * and measured overflow, placeholders painted amber, list editors, an asset picker, sliders. Scene holds the beat, the point,
 * energy (1-5), the shot, flashback, and the notes of every state with the time they take to say at 140 wpm. Advanced is a
 * JSON patch (`overrides`) validated when focus leaves it. Typing is committed after 250 ms of quiet and on blur; commits
 * from one field share a label, so the store folds a burst of typing into one undo step. A hand-written (raw) scene, or a
 * read-only project, shows only its notes. */
PD.module('studio/ui/inspector', [], function (PD) {
  var F = function () { return PD.get('studio/ui/forms'); };
  var DEL = { del: true };

  var CSS = [
    '.in { display: flex; flex-direction: column; min-height: 0; height: 100%; border-radius: 16px; background: color-mix(in srgb, var(--pdx-panel) 72%, transparent); border: 1px solid var(--pdx-hair-2); overflow: hidden; }',
    '.in-head { flex: none; padding: 14px 16px 10px; display: flex; flex-direction: column; gap: 8px; }',
    '.in-title { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; row-gap: 8px; }',
    '.in-head:empty, .in-tabs:empty { display: none; }',
    '.in-no { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font: 700 13px var(--pdx-mono); color: #1a1210; background: var(--beat, var(--pdx-accent)); }',
    '.in-title h2 { margin: 0; min-width: 0; flex: 0 1 auto; font-size: 17px; line-height: 1.2; font-weight: 680; letter-spacing: -.012em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.in-title .sp { flex: 1; min-width: 4px; }',
    '.in-clicks { font: 500 11px var(--pdx-mono); color: var(--pdx-faint); white-space: nowrap; } .in-lock { color: var(--pdx-faint); display: grid; }',
    '.in-coach { position: relative; margin: 0 14px 10px; padding: 12px 14px 12px 18px; border-radius: 13px; background: color-mix(in srgb, var(--beat, var(--pdx-accent)) 9%, var(--pdx-well)); border: 1px solid color-mix(in srgb, var(--beat, var(--pdx-accent)) 26%, transparent); display: flex; flex-direction: column; gap: 8px; }',
    '.in-coach::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 3px; background: var(--beat, var(--pdx-accent)); }',
    '.in-coach .ask { font-size: 14.5px; line-height: 1.4; font-weight: 600; letter-spacing: -.005em; }',
    '.in-coach .ask.is-quiet { font-size: 13px; font-weight: 520; color: var(--pdx-muted); }',
    '.in-coach.is-done { padding-top: 10px; padding-bottom: 10px; gap: 5px; }',
    '.in-coach .eg { font-size: 12.5px; color: var(--pdx-muted); line-height: 1.5; } .in-coach .eg q { color: var(--pdx-text); quotes: "\\201c" "\\201d"; font-style: italic; }',
    '.in-coach .dev { font-size: 12px; color: var(--pdx-muted); display: flex; gap: 8px; align-items: flex-start; } .in-coach .dev .pdx-ico { margin-top: 2px; color: var(--beat, var(--pdx-accent)); }',
    '.in-coach .row { display: flex; align-items: center; gap: 10px; margin-top: 2px; } .in-coach .row .sp { flex: 1; } .in-coach .row small { color: var(--pdx-faint); font-size: 11.5px; }',
    '.in-coach.is-done { background: color-mix(in srgb, var(--pdx-ok) 7%, var(--pdx-well)); border-color: color-mix(in srgb, var(--pdx-ok) 24%, transparent); --beat: var(--pdx-ok); }',
    '.in-tabs { flex: none; position: relative; display: flex; gap: 4px; padding: 0 14px; border-bottom: 1px solid var(--pdx-hair-2); }',
    '.in-tabs button { all: unset; box-sizing: border-box; position: relative; height: 40px; padding: 0 12px; display: inline-flex; align-items: center; color: var(--pdx-muted); font-weight: 600; font-size: 13px; cursor: pointer; transition: color .16s; }',
    '.in-tabs button::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--pdx-accent); transform: scaleX(0); transition: transform .24s var(--pdx-ease); }',
    '.in-tabs button::before { content: ""; position: absolute; inset: -2px 0; }',
    '.in-tabs button:hover { color: var(--pdx-text); } .in-tabs button[aria-selected="true"] { color: var(--pdx-text); } .in-tabs button[aria-selected="true"]::after { transform: scaleX(1); }',
    '.in-tabs button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: -2px; border-radius: 6px; }',
    '.in-body { flex: 1; min-height: 0; overflow: auto; padding: 18px 18px 28px; display: flex; flex-direction: column; gap: 22px; scrollbar-width: thin; scrollbar-color: var(--pdx-line) transparent; animation: pdx-in .24s var(--pdx-ease); }',
    '.in-sec { display: flex; flex-direction: column; gap: 12px; }',
    '.in-sec > .pdx-cap { display: flex; align-items: center; gap: 8px; } .in-sec > .pdx-cap::after { content: ""; flex: 1; height: 1px; background: var(--pdx-hair-2); }',
    '.in-sum { color: var(--pdx-muted); font-size: 12.5px; line-height: 1.5; margin: -6px 0 0; }',
    '.in-ro { display: flex; gap: 14px; padding: 16px; border-radius: 13px; background: var(--pdx-well); border: 1px solid var(--pdx-hair); color: var(--pdx-muted); line-height: 1.5; font-size: 13px; }',
    '.in-ro .pdx-ico { color: var(--pdx-accent); margin-top: 1px; }',
    '.in-note { padding: 12px 14px; border-radius: 12px; background: var(--pdx-well); border: 1px solid var(--pdx-hair-2); display: flex; flex-direction: column; gap: 8px; }',
    '.in-note .hd { display: flex; align-items: center; gap: 10px; } .in-note .hd b { font-size: 12.5px; } .in-note .hd .sp { flex: 1; }',
    '.in-note .hd .t { font: 500 11px var(--pdx-mono); color: var(--pdx-faint); }',
    '.in-note .txt { white-space: pre-wrap; font-size: 13.5px; line-height: 1.55; color: var(--pdx-text); } .in-note .txt.is-empty { color: var(--pdx-faint); font-style: italic; }',
    '.in-hold { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--pdx-faint); } .in-hold input { width: 58px; }',
    '.in-code { all: unset; box-sizing: border-box; width: 100%; min-height: 150px; padding: 12px 14px; border-radius: 10px; background: var(--pdx-well); border: 1px solid var(--pdx-hair); font: 500 12.5px/1.55 var(--pdx-mono); color: #cfe3f5; white-space: pre; overflow: auto; tab-size: 2; resize: vertical; transition: border-color .16s, box-shadow .2s; }',
    '.in-code:focus { border-color: var(--pdx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pdx-accent) 20%, transparent); }',
    '.in-code.is-err { border-color: var(--pdx-err); }',
    '.in-ign { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.in-ign button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 12px; border-radius: 99px; border: 1px solid var(--pdx-hair); font: 600 11.5px var(--pdx-mono); color: var(--pdx-muted); }',
    '.in-ign button:hover { border-color: var(--pdx-err); color: var(--pdx-text); } .in-ign button:focus-visible { outline: 2px solid var(--pdx-accent); }',
    '.in-empty { margin: auto; text-align: center; padding: 30px; color: var(--pdx-muted); max-width: 300px; line-height: 1.5; }',
    '@media (max-height: 840px) { .in-coach .eg, .in-coach .dev { display: none; } .in-head { padding: 12px 16px 8px; } }',
    '@media (max-height: 740px) { .in-coach .ask { font-size: 13.5px; } }',
    '.in-energy { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; } .in-energy small { color: var(--pdx-faint); font-size: 11.5px; }'
  ].join('\n');

  var DEVICE_FOR = { pivot: 'not-x-y', statement: 'split', 'big-number': 'number-meaning', finale: 'callback', 'brand-reveal': 'callback', timeline: 'number-meaning', quote: 'silence', 'cold-open': 'silence' };

  function create(opts) {
    opts = opts || {};
    var f = F(), h = f.h, icon = f.icon, store = opts.store, S = PD.story;
    f.ensureBase(); f.css('inspector', CSS);
    var head = h('div', { class: 'in-head' }), coachHost = h('div'), tabs = h('div', { class: 'in-tabs', role: 'tablist' }), body = h('div', { class: 'in-body', role: 'tabpanel' });
    var root = h('div', { class: 'pdx in' }, [head, coachHost, tabs, body]);
    var st = { compiled: null, infos: [], selectedId: null, readOnly: false, why: '' }, tab = opts.tab || 'content', cur = null, form = null, P = emptyPending(), timer = 0, lastJson = null, dead = false, committing = false;

    function emptyPending() { return { props: {}, scene: {}, notes: {}, stepDwell: {}, any: false, keys: [] }; }
    function infoOf(id) { return st.infos.find(function (x) { return x.id === id; }) || null; }
    function srcScene(id) { var i = infoOf(id); return i ? i.src : null; }

    /* ---------------------------------------------------------- committing */
    function flush() {
      clearTimeout(timer); timer = 0;
      if (!P.any || !cur) { P = emptyPending(); return; }
      var pend = P, id = cur.id; P = emptyPending();
      var label = 'Edit ' + id + (pend.keys.length === 1 ? ' ' + pend.keys[0] : '');
      committing = true;
      try {
        store.commit(label, function (d) {
          var sc = d.deck.scenes.find(function (s) { return s.id === id; });
          if (!sc) return;
          Object.keys(pend.props).forEach(function (k) { sc.props = sc.props || {}; sc.props[k] = pend.props[k]; });
          Object.keys(pend.scene).forEach(function (k) { if (pend.scene[k] === DEL) delete sc[k]; else sc[k] = pend.scene[k]; });
          Object.keys(pend.notes).forEach(function (k) {
            k = +k;
            if (k === 0) { if (pend.notes[0] === DEL || pend.notes[0] === '') delete sc.notes; else sc.notes = pend.notes[0]; return; }
            sc.stepNotes = Array.isArray(sc.stepNotes) ? sc.stepNotes : [];
            while (sc.stepNotes.length < k - 1) sc.stepNotes.push('');
            sc.stepNotes[k - 1] = pend.notes[k];
          });
          Object.keys(pend.stepDwell).forEach(function (k) {
            k = +k;
            sc.stepDwell = Array.isArray(sc.stepDwell) ? sc.stepDwell : [];
            while (sc.stepDwell.length < k) sc.stepDwell.push(null);
            sc.stepDwell[k] = pend.stepDwell[k] === DEL ? null : pend.stepDwell[k];
            if (sc.stepDwell.every(function (x) { return x == null; })) delete sc.stepDwell;
          });
        });
      } catch (e) { if (window.console) console.error(e); }
      committing = false;
      var again = store.compiled().source.scenes.find(function (s) { return s.id === id; });
      lastJson = again ? JSON.stringify(again) : null;
    }
    function queue(kind, key, value, immediate) {
      if (!cur || st.readOnly) return;
      if (kind === 'props') P.props[key] = value; else if (kind === 'scene') P.scene[key] = value; else if (kind === 'notes') P.notes[key] = value; else P.stepDwell[key] = value;
      P.any = true; var tag = kind === 'props' ? key : kind === 'scene' ? key : kind === 'notes' ? 'notes' : 'hold';
      if (P.keys.indexOf(tag) < 0) P.keys.push(tag);
      clearTimeout(timer);
      if (immediate) flush(); else timer = setTimeout(flush, 250);
    }

    /* ---------------------------------------------------------- helpers for forms */
    function measureEnv() {
      var th = st.compiled.theme, util = PD.get('core/util');
      return { theme: th, col: util.colFor(th.colors), assets: function () { return null; } };
    }
    function formApi(root2) {
      var c = st.compiled, E = PD.element.get('text'), env = measureEnv();
      return {
        theme: c.theme, scope: root2 || root, tokens: S.board && S.board.tokens ? S.board.tokens(f.storyOf(c)) : {},
        measure: function (str, style, size) {
          var spec = { str: str, style: style }; if (size != null) spec.size = size;
          var m = E.measure(spec, env);
          return { lines: m.lines, w: m.w };
        },
        assets: function (accept) {
          var map = PD.assets.get(c.assetsDeckId || c.id) || {}, out = [];
          Object.keys(map).forEach(function (id) { if (map[id] && (accept === 'font' ? map[id].type === 'font' : map[id].type === 'image')) out.push(Object.assign({ id: id }, map[id])); });
          return out;
        },
        addAsset: opts.addAsset ? function (accept) { opts.addAsset(accept === 'font' ? '.woff2,.woff,.ttf,.otf' : 'image/*'); } : null,
        onChange: function () { }
      };
    }

    /* ---------------------------------------------------------- the header and the coach */
    function paintHead(inf) {
      f.clear(head);
      var n = inf.i + 1;
      head.style.setProperty('--beat', inf.color);
      var chip = inf.beat ? h('span', { class: 'pdx-chip', style: { '--chip': inf.color }, text: inf.beat.label }) : null;
      var change = !inf.readOnly && inf.isTpl ? h('button', { type: 'button', class: 'pdx-btn is-sm', title: 'Change template', dataset: { act: 'change-template' }, onclick: function () { flush(); if (opts.onChangeTemplate) opts.onChangeTemplate(inf.id); } }, [icon('swap', 14), h('span', { text: 'Change' })]) : null;
      var clicks = inf.steps ? h('span', { class: 'in-clicks', text: f.plural(inf.steps, 'click') }) : null;
      head.appendChild(h('div', { class: 'in-title' }, [h('span', { class: 'in-no', text: (n < 10 ? '0' : '') + n }), h('h2', { text: inf.label, title: inf.label }), chip, clicks,
        inf.readOnly ? h('span', { class: 'in-lock', title: 'View only' }, icon('lock', 15)) : null, h('span', { class: 'sp' }), change]));
    }
    function paintCoach(inf) {
      f.clear(coachHost);
      if (inf.readOnly) return;
      var remaining = st.infos.filter(function (x) { return x.placeholders.length; });
      var todo = inf.placeholders.length > 0, beat = inf.beat;
      var box = h('div', { class: 'in-coach' + (todo ? '' : ' is-done'), dataset: { coach: todo ? 'todo' : 'done' } });
      box.style.setProperty('--beat', todo || beat ? inf.color : '#a7f070'); if (!todo) box.style.setProperty('--beat', '#a7f070');
      var dev = DEVICE_FOR[inf.tpl] && S.DEVICES ? S.DEVICES.find(function (d) { return d.id === DEVICE_FOR[inf.tpl]; }) : null;
      if (todo) {
        box.appendChild(h('div', { class: 'pdx-cap', style: 'color:var(--beat)', text: (beat ? beat.label + ' · ' : '') + 'Your words go here' }));
        box.appendChild(h('div', { class: 'ask', text: beat ? beat.ask : 'Replace the amber prompts with your own words.' }));
        if (beat && beat.example) box.appendChild(h('div', { class: 'eg' }, ['Try something like ', h('q', { text: beat.example })]));
      } else {
        box.appendChild(h('div', { class: 'pdx-cap', style: 'color:var(--beat)', text: (beat ? beat.label + ' · ' : '') + 'In your words' }));
        box.appendChild(h('div', { class: 'ask is-quiet', text: beat ? beat.ask : inf.T ? inf.T.summary : 'Looks written.' }));
      }
      if (dev && todo) box.appendChild(h('div', { class: 'dev' }, [icon('sparkle', 14), h('span', null, [h('b', { text: dev.label + '. ' }), dev.tip])]));
      var others = remaining.filter(function (x) { return x.id !== inf.id; });
      var capEl = box.querySelector('.pdx-cap');
      if (others.length || (!todo && st.infos.length > 1)) {
        var nb = h('button', { type: 'button', class: 'pdx-btn is-sm is-quiet', dataset: { act: 'next' }, title: remaining.length ? f.plural(remaining.length, 'scene') + ' still ' + (remaining.length === 1 ? 'needs' : 'need') + ' your words' : 'Every scene has your words', onclick: function () { flush(); if (opts.onNext) opts.onNext(); } },
          [h('span', { text: others.length ? 'Next to write' : 'Next scene' }), icon('chevR', 13)]);
        var top = h('div', { style: 'display:flex;align-items:center;gap:8px;margin:-4px -6px 0 0' }, [capEl, h('span', { style: 'flex:1' }), nb]);
        box.insertBefore(top, box.firstChild);
      }
      coachHost.appendChild(box);
    }

    /* ---------------------------------------------------------- tabs */
    var TABS = [['content', 'Content'], ['scene', 'Scene'], ['advanced', 'Advanced']];
    function paintTabs(inf) {
      f.clear(tabs);
      var list = inf.readOnly || !inf.isTpl ? [['notes', 'Notes']] : TABS;
      if (!list.some(function (t) { return t[0] === tab; })) tab = list[0][0];
      list.forEach(function (t, i) {
        tabs.appendChild(h('button', { type: 'button', role: 'tab', 'aria-selected': String(t[0] === tab), tabindex: t[0] === tab ? '0' : '-1', dataset: { tab: t[0] }, text: t[1],
          onclick: function () { showTab(t[0]); } }));
      });
    }
    tabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var bs = [].slice.call(tabs.querySelectorAll('button')), i = bs.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
      var n = bs[f.clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, bs.length - 1)];
      if (n) { e.preventDefault(); n.click(); n.focus(); }
    });
    function showTab(t) {
      flush();
      tab = t;
      if (opts.onTab) opts.onTab(t);
      if (cur) { var inf = infoOf(cur.id); if (inf) { paintTabs(inf); paintBody(inf); } }
    }

    /* ---------------------------------------------------------- the bodies */
    function section(title, kids) { return h('div', { class: 'in-sec' }, [h('div', { class: 'pdx-cap', text: title })].concat(kids)); }

    function contentBody(inf) {
      var T = inf.T, src = inf.src, api = formApi(body), wrap = h('div', { style: 'display:flex;flex-direction:column;gap:18px' });
      if (!T) {                                           // a template this build does not have: say so, and offer another
        body.appendChild(h('div', { class: 'in-ro' }, [icon('alert', 18), h('div', null, [h('div', { text: 'This scene uses \u201c' + (inf.tpl || '?') + '\u201d, a template this version does not have, so it shows a stand-in.' }),
          h('div', { style: 'margin-top:10px' }, h('button', { type: 'button', class: 'pdx-btn is-sm is-primary', onclick: function () { if (opts.onChangeTemplate) opts.onChangeTemplate(inf.id); } }, [icon('swap', 14), h('span', { text: 'Pick another template' })]))])]));
        return;
      }
      if (T && T.summary) wrap.appendChild(h('p', { class: 'in-sum', text: T.summary }));
      var values = Object.assign({}, src.props || {});
      var fapi = Object.assign({}, api, { onChange: function (name, value, meta) {
        var live = meta && meta.live;
        queue('props', name, value, !live);
      }, onBlur: function () { flush(); } });
      form = f.buildForm({ schema: T ? T.props : {}, values: values, api: fapi, skip: [] });
      wrap.appendChild(form.el);
      body.appendChild(wrap);
      // a logo with no transparency makes a box of particles: say so, and offer brightness mode
      if (inf.tpl === 'logo' && T && T.props.asset && T.props.mode) {
        var ass = fapi.assets('image').find(function (a) { return a.id === (src.props || {}).asset; });
        if (ass && PD.get('studio/ui/assets-panel').hasAlpha) PD.get('studio/ui/assets-panel').hasAlpha(ass).then(function (alpha) {
          var ff = form && form.fields.asset, cur2 = infoOf(inf.id);
          if (alpha || dead || !ff || !cur2 || (cur2.src.props || {}).mode === 'luma' || cur2.src.props.asset !== ass.id) return;
          f.clear(ff.note); ff.note.style.display = '';
          ff.note.appendChild(icon('alert', 14));
          ff.note.appendChild(h('span', null, [S.say('assets.solidLogo') + ' ', h('button', { type: 'button', class: 'pdx-link', text: 'Use brightness mode', onclick: function () { queue('props', 'mode', 'luma', true); } })]));
        });
      }
    }

    function energySection(inf) {
      var auto = inf.autoEnergy, over = inf.src.energy != null;
      var segc = f.seg([1, 2, 3, 4, 5], inf.energy, function (v) { queue('scene', 'energy', v, true); }, { label: 'Energy' });
      var reset = h('button', { type: 'button', class: 'pdx-btn is-sm is-quiet', text: 'Back to automatic (' + auto + ')', style: over ? '' : 'display:none', onclick: function () { queue('scene', 'energy', DEL, true); } });
      return section('Energy', [h('div', { class: 'in-energy' }, [segc.el, over ? reset : h('small', { text: 'Automatic: the template says ' + auto })]),
        h('div', { class: 'pdx-help', text: '1 is a quiet breath, 5 is the biggest moment of the talk. You can also drag the dots on the arc.' })]);
    }

    function notesSection(inf, readOnly) {
      var src = inf.src, cs = inf.cs, steps = inf.steps, wrap = [];
      var T = inf.T, talk = T && T.story ? (T.story.talkSec || 20) : 20, noSpeech = true;
      for (var k = 0; k <= steps; k++) {
        (function (k2) {
          var val = k2 === 0 ? (src.notes != null ? src.notes : cs.notes) : ((src.stepNotes || [])[k2 - 1] != null ? src.stepNotes[k2 - 1] : ((cs.steps || [])[k2 - 1] || {}).notes);
          val = val == null ? '' : String(val);
          if (S.speech(val)) noSpeech = false;
          var label = k2 === 0 ? (steps ? 'Opening' : 'What you say') : 'After click ' + k2;
          var time = h('span', { class: 't' });
          function setTime(v) { var sec = f.speakSecs(v); time.textContent = (S.words(S.speech(v))) + ' words · ' + (sec ? '≈ ' + f.fmtSecs(sec) : 'not yet'); }
          setTime(val);
          var hd = h('div', { class: 'hd' }, [h('b', { text: label }), h('span', { class: 'sp' }), time]);
          var el;
          if (readOnly) el = h('div', { class: 'txt' + (val ? '' : ' is-empty'), text: val || 'No notes for this state.' });
          else {
            var ar = f.hlArea({ value: val, prompts: true, placeholder: 'What will you say here?', label: label, onInput: function (v) { setTime(v); queue('notes', k2, v, false); }, onBlur: function () { flush(); } });
            ar.input.rows = 2; el = ar.el;
          }
          var kids = [hd, el];
          if (!readOnly && k2 < steps + 1) {
            var dw = k2 === steps ? src.dwell : (src.stepDwell || [])[k2], def = k2 === steps ? 3 : 2.5;
            var inp = h('input', { class: 'pdx-input pdx-num is-mono', type: 'number', min: 0, max: 120, step: 0.5, placeholder: String(def), value: dw != null ? dw : '', 'aria-label': 'Hold time after ' + label });
            inp.addEventListener('input', function () { var v = inp.value === '' ? DEL : +inp.value; if (v !== DEL && !isFinite(v)) return; if (k2 === steps) queue('scene', 'dwell', v === DEL ? DEL : v, false); else queue('stepDwell', k2, v, false); });
            inp.addEventListener('blur', flush);
            kids.push(h('div', { class: 'in-hold' }, [icon('clock', 13), h('span', { text: k2 === steps ? 'Hold on the finished picture for' : 'Hold this state for' }), inp, h('span', { text: 'seconds' })]));
          }
          wrap.push(h('div', { class: 'in-note', dataset: { state: k2 } }, kids));
        })(k);
      }
      if (noSpeech && !readOnly) wrap.unshift(h('div', { class: 'pdx-help', text: 'No notes yet, so the timer assumes about ' + talk + ' s of talking for this scene. Write what you will say and it counts real words at 140 a minute.' }));
      return section('Notes · what you say', wrap);
    }

    function sceneBody(inf) {
      var src = inf.src, T = inf.T, fw = f.frameworkOf(st.compiled), beats = fw ? fw.beats : [], api = formApi(body), kids = [];
      // where it sits
      var beatCtl;
      if (beats.length) {
        beatCtl = h('select', { class: 'pdx-select', 'aria-label': 'Beat', dataset: { field: 'beat' } }, [h('option', { value: '', text: 'No beat' })].concat(beats.map(function (b) { return h('option', { value: b.id, text: b.label }); })));
        beatCtl.value = inf.beatId || '';
        beatCtl.addEventListener('change', function () { queue('scene', 'beat', beatCtl.value === '' ? DEL : beatCtl.value, true); });
      } else {
        beatCtl = h('input', { class: 'pdx-input', placeholder: 'e.g. hook', value: inf.beatId || '', 'aria-label': 'Beat', dataset: { field: 'beat' } });
        beatCtl.addEventListener('change', function () { queue('scene', 'beat', beatCtl.value.trim() === '' ? DEL : beatCtl.value.trim(), true); });
      }
      var point = f.hlArea({ value: src.point || '', single: true, placeholder: 'The one thing this scene says', label: 'Point', scope: body, onInput: function (v) { queue('scene', 'point', v.trim() === '' ? DEL : v, false); }, onBlur: flush });
      var fb = f.switchEl(!!src.flashback, function (v) { queue('scene', 'flashback', v ? true : DEL, true); }, 'Flashback');
      kids.push(section('Where it sits', [
        h('div', { class: 'pdx-field' }, [h('div', { class: 'pdx-fh' }, h('label', { class: 'pdx-fl', text: 'Beat' })), beatCtl]),
        h('div', { class: 'pdx-field' }, [h('div', { class: 'pdx-fh' }, h('label', { class: 'pdx-fl', text: 'Point' })), point.el, h('div', { class: 'pdx-help', text: 'If a stranger saw only this scene, what would they take away? One sentence.' })]),
        h('div', { class: 'pdx-field', style: 'flex-direction:row;align-items:center;justify-content:space-between;gap:12px' }, [h('label', { class: 'pdx-fl', style: 'flex:1', text: 'Flashback' }), fb.el]),
        h('div', { class: 'pdx-help', style: 'margin-top:-6px', text: 'Turn this on when the scene deliberately breaks the order, so the Director does not flag it.' })
      ]));
      kids.push(energySection(inf));
      if (T) {
        var shotKey = Object.keys(T.props).find(function (k) { return T.props[k].type === 'shot'; });
        if (shotKey) {
          var shot = f.field(T.props[shotKey], (src.props || {})[shotKey] !== undefined ? src.props[shotKey] : T.props[shotKey]['default'], Object.assign({}, api, { onChange: function (v) { queue('props', shotKey, v, true); } }), shotKey);
          kids.push(section('The world behind the words', [shot.el]));
        }
      }
      kids.push(notesSection(inf, false));
      kids.forEach(function (k) { body.appendChild(k); });
      form = null;
    }

    function advancedBody(inf) {
      var src = inf.src, kids = [];
      var cur0 = src.overrides != null ? JSON.stringify(src.overrides, null, 2) : '';
      var ta = h('textarea', { class: 'in-code', spellcheck: 'false', placeholder: '{\n  "world": { "speed": 40 }\n}', 'aria-label': 'Overrides as JSON', dataset: { field: 'overrides' } });
      ta.value = cur0;
      var msg = h('div', { class: 'pdx-note is-err', style: 'display:none' });
      function check(commit) {
        var txt = ta.value.trim();
        if (txt === '') { ta.classList.remove('is-err'); msg.style.display = 'none'; if (commit && src.overrides != null) queue('scene', 'overrides', DEL, true); return true; }
        try {
          var v = JSON.parse(txt);
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Overrides must be an object, like { "world": { "speed": 40 } }.');
          ta.classList.remove('is-err'); msg.style.display = 'none';
          if (commit) queue('scene', 'overrides', v, true);
          return true;
        } catch (e) {
          ta.classList.add('is-err'); f.clear(msg); msg.style.display = '';
          msg.appendChild(icon('alert', 14)); msg.appendChild(h('span', { text: 'That is not valid JSON yet: ' + String(e.message).replace(/^JSON\.parse: /, '') + '. Fix it, or press Reset.' }));
          return false;
        }
      }
      ta.addEventListener('blur', function () { check(true); });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); var s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); } });
      ta.addEventListener('input', function () { check(false); });
      var reset = h('button', { type: 'button', class: 'pdx-btn is-sm', dataset: { act: 'reset-overrides' }, onclick: function () { ta.value = ''; ta.classList.remove('is-err'); msg.style.display = 'none'; queue('scene', 'overrides', DEL, true); } }, [icon('replay', 13), h('span', { text: 'Reset' })]);
      kids.push(section('Overrides', [h('div', { class: 'pdx-help', text: 'A patch merged over what the template draws, for the rare thing the form cannot say. Arrays replace, null deletes a key.' }), ta, msg, h('div', { style: 'display:flex;gap:8px' }, reset)]));
      var ign = (src.lint && src.lint.ignore) || [];
      var chips = h('div', { class: 'in-ign' });
      if (ign.length) ign.forEach(function (r) { chips.appendChild(h('button', { type: 'button', title: 'Stop ignoring ' + r, dataset: { rule: r }, onclick: function () {
        flush(); store.commit('Unignore ' + r, function (d) { var sc = d.deck.scenes.find(function (s) { return s.id === inf.id; }); if (!sc || !sc.lint) return; sc.lint.ignore = (sc.lint.ignore || []).filter(function (x) { return x !== r; }); if (!sc.lint.ignore.length) delete sc.lint; });
      } }, [h('span', { text: r }), icon('x', 12)])); });
      kids.push(section('Director notes you ignored here', [ign.length ? chips : h('div', { class: 'pdx-help', text: 'None. Press “Ignore for this scene” on a Director note and it lands here.' })]));
      kids.push(section('This scene', [h('div', { class: 'pdx-help' }, ['Scene id ', h('span', { class: 'pdx-mono', text: inf.id }), ' · template ', h('span', { class: 'pdx-mono', text: inf.tpl || 'none' })])]));
      kids.forEach(function (k) { body.appendChild(k); });
      form = null;
    }

    function notesOnlyBody(inf) {
      var why = st.why || (inf.isTpl ? 'This deck is open for viewing only.' : 'This scene was written in code, so it is view only here. You can still play it, step through its clicks and rehearse it.');
      body.appendChild(h('div', { class: 'in-ro' }, [icon('lock', 18), h('div', { text: why })]));
      body.appendChild(notesSection(inf, true));
      form = null;
    }

    function paintBody(inf) {
      var sc = body.scrollTop;
      f.clear(body); form = null;
      body.style.animation = 'none'; void body.offsetWidth; body.style.animation = '';
      if (inf.readOnly || !inf.isTpl) notesOnlyBody(inf);
      else if (tab === 'scene') sceneBody(inf);
      else if (tab === 'advanced') advancedBody(inf);
      else contentBody(inf);
      body.scrollTop = sc;
    }

    function render(keepScroll) {
      var inf = st.selectedId ? infoOf(st.selectedId) : null;
      if (!inf) {
        cur = null; f.clear(head); f.clear(coachHost); f.clear(tabs); f.clear(body); form = null;
        body.appendChild(h('div', { class: 'in-empty' }, [icon('pen', 26), h('p', { text: st.infos.length ? 'Pick a scene in the filmstrip to write it.' : 'Add a scene and its words appear here.' })]));
        return;
      }
      cur = { id: inf.id };
      paintHead(inf); paintCoach(inf); paintTabs(inf); paintBody(inf);
      lastJson = JSON.stringify(inf.src);
    }

    var api = {
      el: root,
      update: function (d) {
        var changedSel = d.selectedId !== st.selectedId;
        if (changedSel) flush();
        st = { compiled: d.compiled, infos: d.infos, selectedId: d.selectedId, readOnly: !!d.readOnly, why: d.readOnlyWhy || '' };
        render();
      },
      onStoreChange: function (evt, d) {
        if (d) st = { compiled: d.compiled, infos: d.infos, selectedId: d.selectedId, readOnly: !!d.readOnly, why: d.readOnlyWhy || '' };
        var inf = st.selectedId ? infoOf(st.selectedId) : null;
        if (!inf) { render(); return; }
        var json = JSON.stringify(inf.src);
        if (cur && cur.id === inf.id && (committing || json === lastJson)) {          // our own edit: keep the fields (and the caret) where they are
          if (committing) lastJson = json;
          paintHead(inf); paintCoach(inf);
          if (form) Object.keys(form.fields).forEach(function (k) { if (form.fields[k].refresh) form.fields[k].refresh(); });
          return;
        }
        if (P.any && cur && cur.id === inf.id) { return; }              // a newer edit is still waiting to be committed
        render();
      },
      showTab: showTab,
      flush: flush,
      pending: function () { return P.any; },
      form: function () { return form; },
      tab: function () { return tab; },
      destroy: function () { dead = true; clearTimeout(timer); if (root.parentNode) root.parentNode.removeChild(root); }
    };
    return api;
  }
  return { create: create };
}, { export: false });
