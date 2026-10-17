/* studio/screens/export.js — ⑥ Save & export (spec §7.6, §3.6, WP6).
 *
 * The pre-save checklist runs on its own when the screen opens:
 *   every scene builds                     blocking     compile errors = 0
 *   no broken settings                     blocking     validate errors = 0
 *   Director has no errors                 a warning    "{e} things to fix before it's stage-ready. You can still present."
 *   the font travels with the deck         a warning    export.fontWarn, when the look's font is not embedded and not on every system
 *   file size                              shown
 *   the file plays start to finish         blocking     PD.exportHTML.selfTest: every state of the exported file renders
 * Actions: Save presentation (<slug>.html, which is also the project file; ⌘S does the same from anywhere): Chrome's save
 * picker, the handle remembered for later silent saves, else a download. Export source: deck.js and assets.js, with where
 * to put them. Video backup: a copyable `node tools/record.js --deck "<path to saved .html>"`.
 * Sets PD.studio.save, which the shell calls for ⌘S. Test hooks: [data-check=<id>] with data-state, [data-act=save|save-as|
 * source-deck|source-assets|copy-record]. */
PD.module('studio/screens/export', ['studio/app', 'studio/persist', 'core/export', 'core/validate'], function (PD, app, persist, exportMod) {
  var S = PD.studio, h = S.h, icon = S.icon, store = S.store, say = PD.story.say;

  var SAFE = ['system-ui', 'ui-sans-serif', 'sans-serif', 'serif', 'monospace', 'arial', 'helvetica', 'georgia', 'times new roman', 'courier new', 'verdana', 'tahoma', 'segoe ui', 'roboto', '-apple-system', 'blinkmacsystemfont'];

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB';
  }
  function firstFamily(stack) {
    var m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(String(stack || ''));
    return m ? (m[1] || m[2] || m[3] || '').trim() : '';
  }
  function slugOf(p) { return persist.slug(p.deck.meta.title || '', 48) || p.deck.id; }

  /* ---------------------------------------------------------- building the file (shared by the screen and ⌘S) */
  var built = { hash: null, html: null, bytes: 0, test: null, running: null };
  function invalidate() { built.hash = null; built.html = null; built.test = null; built.running = null; }
  function buildHTML() {
    var p = store.get();
    var html = PD.exportHTML(p.deck.id, { deck: p.deck, assets: store.assets() });
    return { html: html, bytes: new Blob([html]).size };
  }
  // build, then run the self-test; the result is kept until the project changes
  function ensureBuilt() {
    var key = store.hash();
    if (built.hash === key && built.test) return Promise.resolve(built.test);
    if (built.hash === key && built.running) return built.running;
    var b;
    try { b = buildHTML(); }
    catch (e) { return Promise.resolve({ ok: false, stage: 'build', message: String(e && e.message ? e.message : e).replace(/^pixeldeck: PD\.exportHTML: /, '') }); }
    built = { hash: key, html: b.html, bytes: b.bytes, test: null, running: null };
    var mine = built;
    built.running = exportMod.selfTest(b.html).then(function (r) {
      var res = { ok: r.ok, stage: r.ok ? 'done' : 'selftest', html: b.html, bytes: b.bytes, ms: r.ms, errors: r.errors, message: r.ok ? '' : (r.errors[0] ? (r.errors[0].slide >= 0 ? 'Scene ' + (r.errors[0].slide + 1) + ': ' : '') + r.errors[0].msg : 'The file did not finish playing.') };
      if (built === mine) { mine.test = res; mine.running = null; }
      return res;
    });
    return built.running;
  }

  function quickBlockers() {
    var c = store.compiled(), out = [];
    if (!c.scenes.length) out.push('Add at least one scene before you save.');
    if (c.errors.length) out.push(c.errors.length + (c.errors.length === 1 ? ' scene does' : ' scenes do') + ' not build: ' + c.errors[0].msg);
    var bad = PD.validate(c).filter(function (i) { return i.level === 'error'; });
    if (bad.length) out.push(bad.length + (bad.length === 1 ? ' setting is' : ' settings are') + ' broken: ' + bad[0].msg);
    return out;
  }

  /* ---------------------------------------------------------- saving */
  var saving = null;
  function save(opts) {
    opts = opts || {};
    var p = store.get();
    if (!p || p.studio.readOnly) return Promise.resolve(false);
    if (saving) return saving;
    var ui = S.ui;
    var blockers = quickBlockers();
    if (blockers.length) { S.nav('export'); ui.toast(blockers[0], 'error'); return Promise.resolve(false); }
    var name = slugOf(p) + '.html';
    // the picker comes first: it needs the click that asked for the save (a long self-test would use that up)
    saving = persist.target(p.id, name, { saveAs: !!opts.saveAs }).then(function (t) {
      if (t.kind === 'cancelled') return false;
      store.flush();
      if (store.route() !== 'export') ui.toast('Checking your deck before it is saved…');
      return ensureBuilt().then(function (b) {
        if (!b.ok) {
          S.nav('export');
          ui.toast('Not saved. ' + b.message, 'error');
          return false;
        }
        return persist.write(t, b.html).then(function (w) {
          if (!w.ok) { ui.toast("Couldn't save the file: " + (w.message || 'unknown problem'), 'error'); return false; }
          store.markSaved({ fileName: w.fileName });
          S.renderChrome();
          ui.toast(say('export.done', { file: w.fileName }), 'ok');
          if (store.route() === 'export') document.dispatchEvent(new CustomEvent('pdstudio:saved', { detail: { fileName: w.fileName, via: w.via, bytes: b.bytes } }));
          return true;
        });
      });
    }).then(function (r) { saving = null; return r; }, function (e) { saving = null; S.ui.toast('Not saved. ' + (e && e.message ? e.message : e), 'error'); return false; });
    return saving;
  }
  S.save = save;

  /* ---------------------------------------------------------- source files */
  function pretty(v) { return JSON.stringify(v, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function sourceFiles(p) {
    var id = p.deck.id, slug = slugOf(p), theme = p.deck.meta.theme;
    var how = '/* Written by the Pixeldeck Studio. To run it by hand: copy decks/_starter/ to decks/' + slug + '/, replace deck.js and assets.js with\n' +
      ' * these two files, and set the theme script in index.html and notes.html (../../themes/' + theme + '/theme.js). */\n';
    return {
      deck: { name: 'deck.js', text: how.replace('Written', 'deck.js: written') + 'PD.deck(' + JSON.stringify(id) + ', ' + pretty(p.deck) + ');\n' },
      assets: { name: 'assets.js', text: how.replace('Written', 'assets.js: written') + 'PD.assets(' + JSON.stringify(id) + ', ' + pretty(store.assets()) + ');\n' }
    };
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/javascript' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { } }, 20000);
  }

  /* ---------------------------------------------------------- the screen */
  S.screen('export', {
    title: 'Save & export', rail: 6,
    mount: function (el, ctx) {
      var ui = ctx.ui, offs = [], timer = 0, alive = true, runId = 0;
      if (store.get().studio.readOnly) {          // nothing to save from a read-only deck: say why, and what to do instead
        var sample = store.get().studio.sample === 'ogl';
        el.appendChild(h('div', { class: 'pds-export' }, [
          h('p', { class: 'pds-eyebrow' }, ['Step 6 · Save & export']),
          h('h1', { class: 'pds-h1' }, [sample ? 'This sample is read-only' : 'This tab is read-only']),
          h('p', { class: 'pds-lede' }, [sample ? 'One Giant Leap is the deck this engine was built for, so it stays as it is. Make an editable copy, then save that.' : 'Another tab has this deck open, and two tabs saving at once would overwrite each other. Take over in the notice above, then save.']),
          sample ? h('div', { class: 'pds-act-row', style: { 'margin-top': '22px' } }, [h('button', { class: 'pds-btn pds-btn-primary pds-btn-lg', type: 'button', 'data-act': 'copy-sample', onclick: function () { S.openSample('replica'); } }, [icon('copy', 18), 'Make an editable copy'])]) : null
        ]));
        return { unmount: function () { } };
      }
      var page = h('div', { class: 'pds-export' }), checks = h('ul', { class: 'pds-checks2', 'aria-label': 'Before you save' }), actions = h('div', { class: 'pds-export-actions' });
      var ROWS = [
        ['compile', 'Every scene builds'], ['validate', 'No broken settings'], ['director', 'The Director has no errors'],
        ['font', 'The font travels with the deck'], ['size', 'File size'], ['selftest', 'The file plays start to finish']
      ];
      var rowEls = {};
      ROWS.forEach(function (r) {
        var ic = h('span', { class: 'pds-check-ic' }), name = h('b', null, [r[1]]), detail = h('span', { class: 'pds-check-detail' });
        var li = h('li', { class: 'pds-check', 'data-check': r[0], 'data-state': 'idle' }, [ic, h('div', null, [name, detail])]);
        rowEls[r[0]] = { li: li, ic: ic, detail: detail };
        checks.appendChild(li);
      });
      function setRow(id, state, text, go) {
        var r = rowEls[id];
        r.li.setAttribute('data-state', state);
        r.ic.textContent = '';
        if (state === 'ok') r.ic.appendChild(icon('check', 14));
        else if (state === 'warn') r.ic.appendChild(icon('warn', 14));
        else if (state === 'fail') r.ic.appendChild(icon('close', 14));
        r.detail.textContent = text || '';
        if (go) r.detail.appendChild(h('button', { class: 'pds-link', type: 'button', 'data-go': go.to, onclick: function () { S.nav(go.to); } }, [go.label]));
      }

      var resultCard = h('div', { class: 'pds-result', hidden: true, 'data-saved': '0' });
      var saveBtn = h('button', { class: 'pds-btn pds-btn-primary pds-btn-lg', type: 'button', 'data-act': 'save', onclick: function () { save(); } }, [icon('download', 18), 'Save presentation', h('kbd', null, [S.MOD + 'S'])]);
      var saveAsBtn = h('button', { class: 'pds-btn pds-btn-ghost', type: 'button', 'data-act': 'save-as', onclick: function () { save({ saveAs: true }); } }, ['Save a copy as…']);
      function paintResult() {
        var p = store.get();
        resultCard.textContent = '';
        if (!p.studio.savedHash) { resultCard.hidden = true; return; }
        resultCard.hidden = false;
        resultCard.setAttribute('data-saved', store.isSaved() ? '1' : '0');
        resultCard.appendChild(icon(store.isSaved() ? 'check' : 'warn', 18));
        resultCard.appendChild(h('div', null, [
          h('b', null, [store.isSaved() ? 'Saved ' + (p.studio.fileName || '') : 'Changed since you last saved']),
          h('span', null, [store.isSaved() ? ui.ago(p.studio.savedAt) + (built.bytes && built.hash === store.hash() ? ' · ' + fmtBytes(built.bytes) : '') + '. Double-click it to present, no internet needed.' : 'Save again to bring the file up to date.'])
        ]));
      }

      var src = sourceFiles(store.get());
      var recCmd = 'node tools/record.js --deck "/path/to/' + (store.get().studio.fileName || slugOf(store.get()) + '.html') + '"';
      actions.appendChild(h('section', { class: 'pds-act' }, [
        h('h3', null, ['Save presentation']),
        h('p', null, ['One .html file with your deck, your pictures and fonts, and the player. It is also your project file: open it here any time to keep editing.']),
        h('div', { class: 'pds-act-row' }, [saveBtn, saveAsBtn]), resultCard,
        h('p', { class: 'pds-act-foot' }, [icon('info', 14), say('save.local')])
      ]));
      var srcRow = h('div', { class: 'pds-act-row' }, [
        h('button', { class: 'pds-btn', type: 'button', 'data-act': 'source-deck', onclick: function () { download(sourceFiles(store.get()).deck.name, sourceFiles(store.get()).deck.text); } }, [icon('file', 16), 'deck.js']),
        h('button', { class: 'pds-btn', type: 'button', 'data-act': 'source-assets', onclick: function () { download(sourceFiles(store.get()).assets.name, sourceFiles(store.get()).assets.text); } }, [icon('file', 16), 'assets.js'])
      ]);
      actions.appendChild(h('section', { class: 'pds-act' }, [
        h('h3', null, ['Export source']),
        h('p', null, ['Copy ', h('code', null, ['decks/_starter/']), ' to ', h('code', null, ['decks/' + slugOf(store.get()) + '/']), ', replace these two files, and set the theme script in index.html.']),
        srcRow
      ]));
      var cmd = h('code', { class: 'pds-cmd', 'data-cmd': 'record' }, [recCmd]);
      actions.appendChild(h('section', { class: 'pds-act' }, [
        h('h3', null, ['Video backup']),
        h('p', null, ['Record the whole deck to a video, in case a venue has no browser. Run this in the pixeldeck folder after you have saved.']),
        h('div', { class: 'pds-cmdrow' }, [cmd, h('button', { class: 'pds-btn pds-btn-sm', type: 'button', 'data-act': 'copy-record', onclick: function (e) {
          var b = e.currentTarget, done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1400); };
          try { navigator.clipboard.writeText(cmd.textContent).then(done, done); } catch (er) { done(); }
        } }, ['Copy'])])
      ]));

      page.appendChild(h('div', { class: 'pds-export-head' }, [
        h('p', { class: 'pds-eyebrow' }, ['Step 6 · Save & export']),
        h('h1', { class: 'pds-h1' }, ['Save it, then present it']),
        h('p', { class: 'pds-lede' }, ['One file holds the deck, your pictures and fonts, and the player. Double-click it to present: no internet, no install.'])
      ]));
      page.appendChild(h('div', { class: 'pds-export-grid' }, [
        h('section', { class: 'pds-card pds-checkcard' }, [h('h3', null, ['Before you save']), checks]),
        actions
      ]));
      el.appendChild(page);

      /* ---- run the checklist ---- */
      function run() {
        var id = ++runId, p = store.get();
        if (!p) return;
        ROWS.forEach(function (r) { setRow(r[0], 'run', ''); });
        saveBtn.disabled = false;
        var c = store.compiled(), issues = [], res = store.lint();
        // 1, 2: compile and validate
        if (!c.scenes.length) setRow('compile', 'fail', 'No scenes yet. Add some on the storyboard.', { to: 'board', label: 'Open the storyboard' });
        else if (c.errors.length) setRow('compile', 'fail', c.errors.length + (c.errors.length === 1 ? ' scene does' : ' scenes do') + ' not build: ' + c.errors[0].msg);
        else setRow('compile', 'ok', c.scenes.length + (c.scenes.length === 1 ? ' scene builds' : ' scenes build') + ' cleanly.');
        try { issues = PD.validate(c); } catch (e) { issues = []; }
        var errs = issues.filter(function (i) { return i.level === 'error'; }), warns = issues.filter(function (i) { return i.level === 'warn'; });
        if (errs.length) setRow('validate', 'fail', errs.length + (errs.length === 1 ? ' setting is' : ' settings are') + ' broken. Scene ' + (errs[0].scene + 1) + ': ' + errs[0].msg);
        else setRow('validate', 'ok', warns.length ? 'Nothing is broken. ' + warns.length + (warns.length === 1 ? ' thing is' : ' things are') + ' worth a look.' : 'Nothing is broken.');
        // 3: the Director
        var dErr = res.findings.filter(function (f) { return f.sev === 'error'; }).length;
        if (dErr) setRow('director', 'warn', say('lint.notReady', { e: dErr }).replace(/^1 things/, '1 thing'), { to: 'board', label: 'Open the storyboard' });
        else setRow('director', 'ok', say('lint.ready') + '. Score ' + res.score + '.');
        // 4: the font
        var t = c.theme, fam = firstFamily(t.fonts && t.fonts.display), assets = store.assets();
        var embedded = (t.fontFaces || []).some(function (f) { return f.family === fam; }) || Object.keys(assets).some(function (k) { return assets[k].type === 'font' && assets[k].family === fam; });
        if (embedded) setRow('font', 'ok', fam + ' is embedded in the file.');
        else if (SAFE.indexOf(fam.toLowerCase()) >= 0) setRow('font', 'ok', fam + ' is on every computer.');
        else setRow('font', 'warn', say('export.fontWarn', { font: fam }), { to: 'look', label: 'Choose a font' });
        // 5, 6: build the file, then play it
        setRow('size', 'run', 'Putting the file together…');
        setRow('selftest', 'idle', 'Waiting for the file.');
        setTimeout(function () {
          if (!alive || id !== runId) return;
          ensureBuilt().then(function (b) {
            if (!alive || id !== runId) return;
            if (b.stage === 'build') { setRow('size', 'fail', b.message); setRow('selftest', 'idle', 'Nothing to play yet.'); return; }
            var warnSize = b.bytes > 20 * 1048576;
            setRow('size', warnSize ? 'warn' : 'ok', fmtBytes(b.bytes) + (warnSize ? '. That is big; large pictures are the usual cause.' : '.'));
            if (b.ok) setRow('selftest', 'ok', 'Every state played in ' + (b.ms / 1000).toFixed(1) + ' s.');
            else setRow('selftest', 'fail', b.message);
            paintResult();
          });
          setRow('selftest', 'run', 'Playing every scene in a hidden window…');
        }, 30);
        paintResult();
      }
      run();

      offs.push(store.on('change', function () {
        invalidate();
        src = sourceFiles(store.get());
        clearTimeout(timer);
        timer = setTimeout(function () { if (alive) run(); }, 500);
        paintResult();
      }));
      var onSaved = function () { paintResult(); };
      document.addEventListener('pdstudio:saved', onSaved);
      return { unmount: function () { alive = false; clearTimeout(timer); offs.forEach(function (o) { o(); }); document.removeEventListener('pdstudio:saved', onSaved); } };
    }
  });
  return { save: save, ensureBuilt: ensureBuilt, sourceFiles: sourceFiles };
}, { export: false });
