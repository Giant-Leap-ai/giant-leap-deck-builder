/* studio/screens/brief.js — ① Brief: the ten questions, one per panel (spec §7.2, §6.4, WP6).
 *
 * Big type, a Skip on every question, Back / Next, progress dots, hints inline in amber (they never block). The questions,
 * their limits and their hints come from PD.story.interview; every answer goes into meta.story through store.answer(), so
 * typing is one undo step per field. Done when bigIdea and targetMin are set. Panels remember where you were
 * (studio.briefAt). Test hooks: [data-q] on the panel (the question id), [data-act=next|back|skip], input[data-field].
 * The side card shows the logline as it forms ("For {audience}, this talk shows {idea}, so they {ask}."). */
PD.module('studio/screens/brief', ['studio/app'], function (PD, app) {
  var S = PD.studio, h = S.h, icon = S.icon, IV = PD.story.interview, say = PD.story.say, words = PD.story.words;

  var GOAL_TEXT = {
    inspire: 'Move people to see what is possible', persuade: 'Change a mind or a habit', decide: 'Get a clear yes or no',
    launch: 'Introduce something new', update: 'Show where things stand', teach: 'Build a skill or an understanding'
  };
  var TONE_TEXT = {
    cinematic: 'Big, slow, awe-inspiring', warm: 'Human, friendly, personal', crisp: 'Clean, direct, no flourish', playful: 'Light, quick, a little cheeky'
  };
  var HOLD = {
    audience: 'Ops leaders who see AI as a way to cut headcount', bigIdea: 'The next leap is augmentation, not automation',
    shortIdea: 'Augmentation, not automation', ask: 'Pilot one human-centred use case', brand: 'Your name or company', tagline: 'A short tagline'
  };
  var PROOF_HOLD = { number: 'What the number means', quote: 'What they said', story: 'The moment, in a sentence', demo: 'What you will show' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  S.screen('brief', {
    title: 'Brief', rail: 1,
    mount: function (el, ctx) {
      var store = ctx.store, qs = IV.questions, offs = [];
      var idx = clamp((store.get().studio.briefAt | 0), 0, qs.length - 1), dir = 1;
      var page = h('div', { class: 'pds-brief' }), main = h('section', { class: 'pds-brief-main' }), aside = h('aside', { class: 'pds-brief-aside', 'aria-label': 'Your story so far' });
      page.appendChild(main); page.appendChild(aside); el.appendChild(page);

      function story() { return store.get().deck.meta.story || IV.blank(); }
      function readOnly() { return !!store.get().studio.readOnly; }

      /* ------------------------------------------------ aside */
      function paintAside() {
        var s = story(), pr = IV.progress(s), line = PD.story.interview.logline(s);
        aside.textContent = '';
        aside.appendChild(h('p', { class: 'pds-eyebrow' }, ['Your talk in one line']));
        aside.appendChild(h('p', { class: 'pds-logline-big' + (line ? '' : ' is-empty') }, [line || 'It forms here as you answer: who it is for, the one idea, and what you want them to do.']));
        var bar = h('div', { class: 'pds-meter', role: 'img', 'aria-label': pr.answered + ' of ' + pr.total + ' questions answered' });
        for (var i = 0; i < pr.total; i++) bar.appendChild(h('i', { class: i < pr.answered ? 'on' : '' }));
        aside.appendChild(bar);
        aside.appendChild(h('ul', { class: 'pds-checklist' }, [
          h('li', { class: IV.answered(s, 'bigIdea') ? 'ok' : '' }, [icon('check', 14), 'The one sentence']),
          h('li', { class: IV.answered(s, 'targetMin') ? 'ok' : '' }, [icon('check', 14), 'Your slot length'])
        ]));
        if (pr.done) {
          aside.appendChild(h('p', { class: 'pds-aside-done' }, ['That is enough to start. You can come back to the rest any time.']));
          aside.appendChild(h('button', { class: 'pds-btn pds-btn-sm', type: 'button', 'data-act': 'to-shape', onclick: function () { ctx.nav('shape'); } }, ['Next: Shape', icon('arrow', 16)]));
        }
      }

      /* ------------------------------------------------ one panel */
      var hintEl = null, countEl = null, current = null;
      function paintHint() {
        if (!hintEl || !current) return;
        var v = IV.get(story(), current.id), msg = IV.hint(current.id, v);
        hintEl.textContent = '';
        hintEl.hidden = !msg;
        if (msg) { hintEl.appendChild(icon('warn', 16)); hintEl.appendChild(document.createTextNode(msg)); }
      }
      function paintCount() {
        if (!countEl || !current) return;
        var q = current, v = IV.get(story(), q.id), txt = '';
        if (q.id === 'bigIdea') { var n = words(v); txt = n + ' / 15 words'; countEl.classList.toggle('over', n > 15); }
        else if (q.id === 'shortIdea') { var m = words(v); txt = m + ' / 6 words'; countEl.classList.toggle('over', m > 6); }
        else if (q.input && q.input.type === 'text') { var c = String(v || '').trim().length; txt = c + ' / ' + q.input.max; countEl.classList.toggle('over', c > q.input.max); }
        countEl.textContent = v ? txt : '';
      }
      function answer(q, value) {
        store.answer(q.id, value);
        paintHint(); paintCount(); paintAside(); paintDots();
      }

      function textField(q) {
        var multi = (q.input.rows || 1) > 1, node = h(multi ? 'textarea' : 'input', {
          class: 'pds-big', 'data-field': q.id, 'aria-label': q.title, placeholder: HOLD[q.id] || '', spellcheck: 'true', autocomplete: 'off',
          rows: multi ? String(q.input.rows) : null, type: multi ? null : 'text', disabled: readOnly() ? true : null
        });
        node.value = IV.get(story(), q.id) || '';
        function fit() { if (multi) { node.style.height = 'auto'; node.style.height = Math.max(node.scrollHeight, 0) + 'px'; } }
        node.addEventListener('input', function () { answer(q, node.value); fit(); });
        node.addEventListener('blur', function () { var t = node.value.trim(); if (t !== node.value) { node.value = t; answer(q, t); fit(); } });
        node.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); next(); } });
        setTimeout(fit, 0);
        return { node: node, focus: function () { node.focus({ preventScroll: true }); node.setSelectionRange && node.setSelectionRange(node.value.length, node.value.length); } };
      }

      function choiceField(q) {
        var cur = IV.get(story(), q.id), desc = q.id === 'goal' ? GOAL_TEXT : TONE_TEXT;
        var wrap = h('div', { class: 'pds-choices is-' + q.id, role: 'radiogroup', 'aria-label': q.title });
        q.input.options.forEach(function (o) {
          var id = 'q-' + q.id + '-' + o.value;
          var inp = h('input', { type: 'radio', name: 'q-' + q.id, id: id, value: o.value, 'data-field': q.id, disabled: readOnly() ? true : null });
          inp.checked = cur === o.value;
          inp.addEventListener('change', function () { if (inp.checked) answer(q, o.value); });
          wrap.appendChild(h('div', { class: 'pds-choice' }, [inp, h('label', { for: id }, [
            h('b', null, [o.label]), h('span', null, [desc[o.value] || '']),
            q.id === 'tone' ? h('em', null, [PD.story.defaultTheme(o.value) === 'cosmos' ? 'Suggests the Cosmos look' : 'Suggests the Slate look']) : null
          ])]));
        });
        return { node: wrap, focus: function () { var t = wrap.querySelector('input:checked'); if (t) t.focus({ preventScroll: true }); } };
      }

      function numberField(q) {
        var v = IV.get(story(), q.id);
        var inp = h('input', { class: 'pds-big pds-big-num', type: 'number', inputmode: 'numeric', min: String(q.input.min), max: String(q.input.max), 'data-field': q.id, 'aria-label': q.title, placeholder: '10', disabled: readOnly() ? true : null });
        inp.value = v == null ? '' : String(v);
        var note = h('p', { class: 'pds-note' });
        var chips = h('div', { class: 'pds-chips', role: 'group', 'aria-label': 'Common slot lengths' });
        function paintNote() {
          var t = IV.get(story(), q.id);
          note.textContent = t ? 'About ' + Math.max(1, Math.round(t * 60 / 50)) + ' scenes at this length, one per ~50 seconds.' : 'Your slot sets how many scenes the storyboard starts with.';
          Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle('on', +b.getAttribute('data-min') === t); b.setAttribute('aria-pressed', String(+b.getAttribute('data-min') === t)); });
        }
        q.input.chips.forEach(function (m) {
          chips.appendChild(h('button', { class: 'pds-chip-btn', type: 'button', 'data-min': String(m), disabled: readOnly() ? true : null, onclick: function () { inp.value = String(m); answer(q, m); paintNote(); } }, [m + ' min']));
        });
        inp.addEventListener('input', function () { answer(q, inp.value); paintNote(); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
        paintNote();
        return { node: h('div', { class: 'pds-numrow' }, [h('div', { class: 'pds-numbox' }, [inp, h('span', null, ['min'])]), chips, note]), focus: function () { inp.focus({ preventScroll: true }); inp.select(); } };
      }

      function pairField(q) {
        var cur = IV.get(story(), q.id), inputs = {}, fields = q.input.fields;
        function gather() { var o = {}; fields.forEach(function (f) { o[f.field] = inputs[f.field].value; }); return o; }
        var preview = h('div', { class: 'pds-pair-preview' });
        function paintPreview() {
          var s = gather();
          preview.textContent = '';
          if (q.id === 'turn') {
            var a = s.oldWay.trim(), b = s.newWay.trim();
            preview.appendChild(h('span', { class: 'was' }, [a ? 'Not ' + a.replace(/[.!?]+$/, '') + '.' : 'Not …']));
            preview.appendChild(h('span', { class: 'is' }, [b ? b.charAt(0).toUpperCase() + b.slice(1).replace(/[.!?]+$/, '') + '.' : '…']));
          } else {
            preview.appendChild(h('span', { class: 'brand' }, [s.brand.trim() || 'Your name']));
            preview.appendChild(h('span', { class: 'tag' }, [s.tagline.trim() || 'Your tagline']));
          }
        }
        var row = h('div', { class: 'pds-pair is-' + q.id });
        fields.forEach(function (f, i) {
          var inp = h('input', { class: 'pds-big pds-big-sm', type: 'text', 'data-field': f.field, 'aria-label': f.label, placeholder: q.id === 'turn' ? (i ? 'Augmentation' : 'Automation') : (HOLD[f.field] || ''), autocomplete: 'off', disabled: readOnly() ? true : null });
          inp.value = cur[f.field] || '';
          inputs[f.field] = inp;
          inp.addEventListener('input', function () { answer(q, gather()); paintPreview(); });
          inp.addEventListener('blur', function () { var t = inp.value.trim(); if (t !== inp.value) { inp.value = t; answer(q, gather()); paintPreview(); } });
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (i < fields.length - 1) inputs[fields[i + 1].field].focus(); else next(); } });
          row.appendChild(h('label', { class: 'pds-field' }, [h('span', { class: 'pds-field-label' }, [f.label]), inp]));
          if (q.id === 'turn' && i === 0) row.appendChild(h('span', { class: 'pds-pair-arrow', 'aria-hidden': 'true' }, [icon('arrow', 22)]));
        });
        paintPreview();
        return { node: h('div', null, [row, preview]), focus: function () { inputs[fields[0].field].focus({ preventScroll: true }); } };
      }

      function proofField(q) {
        var rows = IV.get(story(), q.id).map(function (r) { return { kind: r.kind, text: r.text, value: r.value == null ? '' : String(r.value), who: r.who || '' }; });
        while (rows.length < q.input.rows) rows.push({ kind: q.input.kinds[rows.length] || 'story', text: '', value: '', who: '' });
        function gather() {
          return rows.map(function (r) {
            var o = { kind: r.kind, text: r.text };
            if (r.kind === 'number' && String(r.value).trim() !== '') o.value = r.value;
            if (r.kind === 'quote' && r.who) o.who = r.who;
            return o;
          });
        }
        var list = h('div', { class: 'pds-proof' }), firstInput = null;
        rows.forEach(function (r, i) {
          var extra = h('input', { class: 'pds-input pds-proof-extra', type: r.kind === 'number' ? 'number' : 'text', 'aria-label': r.kind === 'number' ? 'The number' : 'Who said it', placeholder: r.kind === 'number' ? '62' : 'Who said it', disabled: readOnly() ? true : null });
          extra.value = r.kind === 'number' ? r.value : r.who;
          var text = h('input', { class: 'pds-input pds-proof-text', type: 'text', 'data-field': 'proof-' + i, 'aria-label': 'Evidence ' + (i + 1), placeholder: PROOF_HOLD[r.kind], autocomplete: 'off', disabled: readOnly() ? true : null });
          text.value = r.text;
          var kind = h('select', { class: 'pds-input pds-proof-kind', 'aria-label': 'Kind of evidence ' + (i + 1), disabled: readOnly() ? true : null }, q.input.kinds.map(function (k) { return h('option', { value: k }, [k.charAt(0).toUpperCase() + k.slice(1)]); }));
          kind.value = r.kind;
          function paintExtra() {
            extra.hidden = !(r.kind === 'number' || r.kind === 'quote');
            extra.type = r.kind === 'number' ? 'number' : 'text';
            extra.placeholder = r.kind === 'number' ? '62' : 'Who said it';
            extra.setAttribute('aria-label', r.kind === 'number' ? 'The number' : 'Who said it');
            extra.value = r.kind === 'number' ? r.value : r.who;
            text.placeholder = PROOF_HOLD[r.kind];
          }
          paintExtra();
          kind.addEventListener('change', function () { r.kind = kind.value; paintExtra(); answer(q, gather()); });
          text.addEventListener('input', function () { r.text = text.value; answer(q, gather()); });
          extra.addEventListener('input', function () { if (r.kind === 'number') r.value = extra.value; else r.who = extra.value; answer(q, gather()); });
          text.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); var nx = list.querySelectorAll('.pds-proof-text')[i + 1]; if (nx) nx.focus(); else next(); } });
          if (!firstInput) firstInput = text;
          list.appendChild(h('div', { class: 'pds-proof-row' }, [h('span', { class: 'pds-proof-n' }, [String(i + 1)]), kind, text, extra]));
        });
        return { node: list, focus: function () { if (firstInput) firstInput.focus({ preventScroll: true }); } };
      }

      function fieldFor(q) {
        var t = q.input.type;
        return t === 'choice' ? choiceField(q) : t === 'number' ? numberField(q) : t === 'pair' ? pairField(q) : t === 'proof' ? proofField(q) : textField(q);
      }

      /* ------------------------------------------------ chrome of the panel */
      var dotsEl = null;
      function paintDots() {
        if (!dotsEl) return;
        Array.prototype.forEach.call(dotsEl.children, function (b, i) {
          b.classList.toggle('on', IV.answered(story(), qs[i].id));
          b.classList.toggle('current', i === idx);
          if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        });
      }
      function go(i, d) {
        dir = d == null ? (i >= idx ? 1 : -1) : d;
        idx = clamp(i, 0, qs.length - 1);
        store.patchStudio({ briefAt: idx });
        paintPanel();
      }
      function next() {
        if (idx >= qs.length - 1) { ctx.nav('shape'); return; }
        go(idx + 1, 1);
      }
      function back() { if (idx > 0) go(idx - 1, -1); }

      function paintPanel() {
        var q = qs[idx];
        current = q;
        var f = fieldFor(q);
        hintEl = h('p', { class: 'pds-hint', role: 'status', hidden: true });
        countEl = h('span', { class: 'pds-count' });
        dotsEl = h('div', { class: 'pds-dots', role: 'group', 'aria-label': 'Questions' }, qs.map(function (x, i) {
          return h('button', { class: 'pds-dot', type: 'button', 'aria-label': 'Question ' + (i + 1) + ': ' + x.title, title: x.title, onclick: function () { go(i); } });
        }));
        var last = idx >= qs.length - 1;
        var panel = h('div', { class: 'pds-panel ' + (dir > 0 ? 'from-right' : 'from-left'), 'data-q': q.id }, [
          h('p', { class: 'pds-eyebrow' }, ['Question ' + (idx + 1) + ' of ' + qs.length]),
          h('h1', { class: 'pds-q' }, [q.title]),
          q.help ? h('p', { class: 'pds-q-help' }, [q.help]) : null,
          h('div', { class: 'pds-q-input' }, [f.node]),
          h('div', { class: 'pds-q-meta' }, [hintEl, countEl]),
          h('div', { class: 'pds-q-nav' }, [
            h('button', { class: 'pds-btn pds-btn-ghost', type: 'button', 'data-act': 'back', disabled: idx === 0 ? true : null, onclick: back }, [icon('back', 16), 'Back']),
            h('span', { class: 'pds-grow' }),
            h('button', { class: 'pds-btn pds-btn-ghost', type: 'button', 'data-act': 'skip', onclick: next }, ['Skip']),
            h('button', { class: 'pds-btn pds-btn-primary', type: 'button', 'data-act': 'next', onclick: next }, [last ? 'Finish' : 'Next', q.input.type === 'choice' ? null : h('kbd', { 'aria-hidden': 'true' }, ['\u21b5']), icon('arrow', 16)])
          ]),
          dotsEl
        ]);
        main.textContent = '';
        main.appendChild(panel);
        paintHint(); paintCount(); paintDots(); paintAside();
        setTimeout(function () { if (document.body.contains(panel)) f.focus(); }, 60);
      }

      paintPanel();
      offs.push(store.on('change', function (ev) { if (ev && ev.undo) paintPanel(); }));
      return { unmount: function () { offs.forEach(function (o) { o(); }); } };
    }
  });
  return {};
}, { export: false });
