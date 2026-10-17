/* tools/test/specs/wp7-forms.test.js — WP7 unit specs (spec §7.3): the pure parts of the storyboard workspace and its parts built
 * on their own in the harness page, without the shell: scene analysis, Change template, new scenes from a seed, the painted
 * textarea, the form generated for every template, the picker's catalog under each look, the arc and the Director.
 *   node tools/test/run.js --grep wp7
 * The studio modules are loaded into the page by the first test (they register with PD.module like any other file; the shell
 * and the store are not needed by any of them). */
(function () {
  var FILES = ['forms', 'preview', 'arc', 'director', 'assets-panel', 'picker', 'filmstrip', 'inspector'];
  var loaded = null;
  function load() {
    if (loaded) return loaded;
    var base = location.href.replace(/[^\/]*$/, '') + '../../studio/';
    var list = FILES.map(function (f) { return 'ui/' + f + '.js'; }).concat(['screens/board.js', 'screens/rehearse.js']);
    loaded = list.reduce(function (p, f) {
      return p.then(function () {
        return new Promise(function (res, rej) {
          var name = 'studio/' + f.replace(/\.js$/, '');
          if (PD.has(name)) return res();
          var s = document.createElement('script'); s.src = base + f; s.onload = res; s.onerror = function () { rej(new Error('could not load ' + f)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return loaded;
  }
  var F = function () { return PD.get('studio/ui/forms'); };
  var parity = function () { return PD.compile('parity'); };
  function story(over) { var s = PD.story.interview.blank(); for (var k in over || {}) s[k] = over[k]; return s; }

  T.test('wp7: every studio/ui module and both screens register, in any order, with nothing but the engine', async function (a) {
    await load();
    FILES.forEach(function (f) { a.ok(PD.has('studio/ui/' + f), f); });
    a.ok(PD.has('studio/screens/board')); a.ok(PD.has('studio/screens/rehearse'));
    a.equal(typeof PD.get('studio/screens/board').def.mount, 'function');
    a.equal(PD.get('studio/screens/board').def.rail, 4); a.equal(PD.get('studio/screens/rehearse').def.rail, 5);
  });

  T.test('wp7: uniqueId counts up from the id a scene already has', async function (a) {
    await load();
    var u = F().uniqueId;
    a.equal(u('spark', []), 'spark'); a.equal(u('spark', ['spark']), 'spark-2');
    a.equal(u('spark', ['spark', 'spark-2']), 'spark-3'); a.equal(u('spark-2', ['spark', 'spark-2']), 'spark-3');
    a.equal(u('box', new Set(['box', 'box-2', 'box-3'])), 'box-4');
  });

  T.test('wp7: Change template carries props that share a name and kind, and takes the rest from the seed', async function (a) {
    await load();
    var f = F(), st = story({ brand: 'Northwind', tagline: 'Making work more human' });
    var sunrise = { id: 's', template: 'sunrise', props: { kicker: 'Long ago', line: 'we kept the fire going', nebula: 'ember' } };
    var p = f.changeTemplateProps(sunrise, 'statement', st);
    a.equal(p.line, 'we kept the fire going', 'line (text) carries over to line (longtext)');
    a.equal(p.kicker, 'Long ago');
    a.ok(!('nebula' in p), 'a prop the new template lacks is gone');
    // an enum carries only when its value is an option of the new template
    var st1 = { template: 'statement', props: { line: 'x', reveal: 'wipe', align: 'left' } };
    var p2 = f.changeTemplateProps(st1, 'big-number', st);
    a.equal(p2.reveal, undefined, 'wipe is not a big-number reveal: the seed has none');
    a.equal(p2.label, '{what the number means}', 'the seed fills what did not carry');
    // a template's own default shot is not a choice, a chosen shot is
    var cold = { template: 'cold-open', props: { line: 'a spark', shot: 'SPARK' } };
    a.equal(f.changeTemplateProps(cold, 'statement', st).shot, undefined, 'the old default shot stays behind');
    var chosen = { template: 'cold-open', props: { line: 'a spark', shot: 'HORIZON' } };
    a.equal(f.changeTemplateProps(chosen, 'statement', st).shot, 'HORIZON', 'a shot the writer picked travels');
    // tokens of the brief are filled in the seed
    a.equal(f.changeTemplateProps({ template: 'statement', props: {} }, 'finale', st).title, 'Northwind');
  });

  T.test('wp7: newSceneFor builds a scene from the seed with the beat\'s question as its notes', async function (a) {
    await load();
    var f = F(), fw = PD.story.framework('giant-leap'), beat = fw.beats[1];            // name
    var sc = f.newSceneFor('brand-reveal', beat, story({ brand: 'Acme' }), ['name']);
    a.equal(sc.id, 'name-2'); a.equal(sc.template, 'brand-reveal'); a.equal(sc.beat, 'name');
    a.equal(sc.props.title, 'Acme'); a.equal(sc.props.subtitle, '{tagline}', 'an unanswered token stays visible');
    a.equal(sc.point, 'Name: ' + beat.ask); a.equal(sc.notes, '▸ ' + beat.ask);
    var bare = f.newSceneFor('statement', null, story(), []);
    a.equal(bare.id, 'statement'); a.ok(!('beat' in bare));
  });

  T.test('wp7: describeScenes tells the cards what they need', async function (a) {
    await load();
    var f = F(), c = parity();
    var lint = { findings: [{ id: 'story.cta', sev: 'warn', sceneId: 'thanks' }, { id: 'copy.lines', sev: 'error', sceneId: 'thanks' }, { id: 'story.point', sev: 'info', sceneId: 'box' }] };
    var inf = f.describeScenes(c, lint, { readOnly: false });
    a.equal(inf.length, 10);
    a.equal(inf[0].label, 'Spark cold open'); a.equal(inf[0].beat.id, 'spark'); a.equal(inf[0].isTpl, true); a.equal(inf[0].readOnly, false);
    a.equal(inf[9].sev, 'error', 'the most severe finding of the scene'); a.equal(inf[7].sev, 'info');
    a.equal(inf[2].energy, 5, 'the scene\'s own energy'); a.equal(inf[2].autoEnergy, 5);
    a.ok(inf.every(function (x) { return x.placeholders.length === 0; }), 'the replica has no placeholder');
    a.ok(inf[0].firstLine.indexOf('giant leap') >= 0, 'the first visible line: ' + inf[0].firstLine);
    var ro = f.describeScenes(c, lint, { readOnly: true });
    a.ok(ro.every(function (x) { return x.readOnly; }), 'a read-only project locks every card');
    // hand-written scenes: raw, locked, named after the template they play
    var ogl = f.describeScenes(PD.compile('one-giant-leap'), null, {});
    a.ok(ogl.every(function (x) { return !x.isTpl && x.readOnly; }), 'raw scenes are hand-written, so locked');
    a.equal(ogl[3].label, 'Galaxy, you are here', 'a raw scene is named after the template it plays (like)');
    // placeholders of a board built from an empty brief
    var board = PD.compile({ format: 2, id: 'wp7-board', meta: { title: 't', theme: 'cosmos', story: story({ framework: 'giant-leap' }) },
      scenes: PD.story.board(story({ framework: 'giant-leap' }), { framework: 'giant-leap', theme: 'cosmos' }) });
    var bi = f.describeScenes(board, null, {});
    a.ok(bi.every(function (x) { return x.placeholders.length > 0; }), 'every scene of an empty brief still has something to write');
    a.ok(bi[0].generatedPoint, 'the board\'s own point is recognised, so the card shows the question instead');
    // the shell's colours win when it gives them
    var col = f.describeScenes(c, null, { beatColor: function () { return '#123456'; } });
    a.equal(col[0].color, '#123456');
  });

  T.test('wp7: the painted textarea marks [placeholders] and the ▸ prompt lines, and nothing else', async function (a) {
    await load();
    var f = F(), host = document.createElement('div');
    f.paintInto(host, 'Not {oldWay}. Plain.\n▸ What is the old answer?\nthen {x} and {y}', true);
    var ph = [].map.call(host.querySelectorAll('.pdx-ph'), function (e) { return e.textContent; });
    a.deepEqual(ph, ['{oldWay}', '{x}', '{y}']);
    a.equal(host.querySelectorAll('.pdx-pr').length, 1);
    a.equal(host.textContent, 'Not {oldWay}. Plain.\n▸ What is the old answer?\nthen {x} and {y}', 'the mirror says exactly what the textarea says');
    var h2 = document.createElement('div'); f.paintInto(h2, 'a\n', false);
    a.ok(h2.textContent.length > 2, 'a trailing newline keeps its line');
  });

  T.test('wp7: a form is generated for every template, from its props, under both looks', async function (a) {
    await load();
    var f = F();
    ['cosmos', 'slate'].forEach(function (look) {
      var c = PD.compile({ format: 2, id: 'wp7-form-' + look, meta: { title: 't', theme: look }, scenes: [] });
      var util = PD.get('core/util'), E = PD.element.get('text'), env = { theme: c.theme, col: util.colFor(c.theme.colors), assets: function () { return null; } };
      PD.template.list().forEach(function (id) {
        var T0 = PD.template.get(id), changes = [];
        var form = f.buildForm({ schema: T0.props, values: T0.example, skip: [], api: {
          theme: c.theme, tokens: {}, assets: function () { return []; },
          measure: function (s, style, size) { var sp = { str: s, style: style }; if (size != null) sp.size = size; var m = E.measure(sp, env); return { lines: m.lines, w: m.w }; },
          onChange: function (k, v) { changes.push(k); }
        } });
        var keys = Object.keys(form.fields), want = Object.keys(T0.props).filter(function (k) { return T0.props[k].type !== 'shot'; });
        a.deepEqual(keys.slice().sort(), want.slice().sort(), look + ' ' + id + ': one field per prop (the shot goes to the Scene tab)');
        form.set(T0.example);
        keys.forEach(function (k) { a.ok(form.fields[k].el.nodeType === 1, id + '.' + k); });
      });
    });
  });

  T.test('wp7: a text field counts, measures and flags too-wide lines with the real glyph widths', async function (a) {
    await load();
    var f = F(), c = PD.compile({ format: 2, id: 'wp7-measure', meta: { title: 't', theme: 'cosmos' }, scenes: [] });
    var util = PD.get('core/util'), E = PD.element.get('text'), env = { theme: c.theme, col: util.colFor(c.theme.colors), assets: function () { return null; } };
    var spec = { type: 'text', label: 'The escape word', max: 12, style: 'hero' }, got = [];
    var field = f.field(spec, 'Outside', { theme: c.theme, tokens: {}, measure: function (s, st, sz) { var m = E.measure({ str: s, style: st }, env); return { lines: m.lines, w: m.w }; }, onChange: function (v) { got.push(v); } }, 'escape');
    a.ok(!field.el.querySelector('.pdx-note.is-err') || field.el.querySelector('.pdx-note.is-err').style.display === 'none', 'seven letters fit');
    a.equal(field.el.querySelector('.pdx-fr').textContent.indexOf('7/12'), 0, 'the counter: ' + field.el.querySelector('.pdx-fr').textContent);
    var ta = field.el.querySelector('textarea');
    ta.value = 'Not automation or anything like that ok!'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    var note = field.el.querySelector('.pdx-note.is-err');
    a.ok(note && note.style.display !== 'none', 'forty characters of hero do not fit on a line');
    a.ok(/Too wide for Hero\. Shorten it or step down a style\./.test(note.textContent), note.textContent);
    a.ok(field.el.querySelector('.pdx-hl').classList.contains('is-err'));
    a.deepEqual(got, ['Not automation or anything like that ok!']);
    // placeholders: amber, with the question the brief did not answer, or the answer it did
    var ph = f.field({ type: 'text', label: 'Title', max: 18, style: 'hero' }, '{brand}', { theme: c.theme, tokens: {}, onChange: function () { } }, 'title');
    a.ok(/Answer/.test(ph.el.querySelector('.pdx-note.is-info').textContent), 'unanswered: ' + ph.el.querySelector('.pdx-note.is-info').textContent);
    var ph2 = f.field({ type: 'text', label: 'Title', max: 18, style: 'hero' }, '{brand}', { theme: c.theme, tokens: { brand: 'Acme' }, onChange: function (v) { got.push(v); } }, 'title');
    ph2.el.querySelector('.pdx-link').click();
    a.equal(got[got.length - 1], 'Acme', 'Use it replaces the token');
  });

  T.test('wp7: the picker\'s catalog hides what the look cannot show, and names the look it needs', async function (a) {
    await load();
    var P = PD.get('studio/ui/picker');
    var cos = P.catalog(PD.compile({ format: 2, id: 'wp7-pk1', meta: { title: 't', theme: 'cosmos' }, scenes: [] }));
    a.equal(cos.ids.length, 16); a.equal(cos.hidden.length, 0);
    var sl = P.catalog(PD.compile({ format: 2, id: 'wp7-pk2', meta: { title: 't', theme: 'slate' }, scenes: [] }));
    a.deepEqual(sl.hidden.map(function (x) { return x.id; }).sort(), ['galaxy-reveal', 'hyperspace', 'planet', 'sunrise']);
    a.ok(sl.hidden.every(function (x) { return x.needs === 'Cosmos'; }), 'Needs the Cosmos look.');
    a.equal(sl.ids.length, 12);
  });

  T.test('wp7: the arc places one dot per scene at its runtime position and previews a new order', async function (a) {
    await load();
    var f = F(), c = parity(), arc = PD.get('studio/ui/arc').create({});
    document.body.appendChild(arc.el); arc.el.style.width = '800px';
    var infos = f.describeScenes(c, null, {}), tm = PD.story.estimate(c);
    arc.update({ infos: infos, timing: tm, fw: PD.story.framework('giant-leap'), targetMin: 4, selectedId: 'box', estimated: true, readOnly: false });
    var d = arc.data();
    a.equal(d.points.length, 10); a.equal(d.estimated, true); a.equal(d.slot, 240);
    a.deepEqual(d.points.map(function (p) { return p.energy; }), [2, 4, 5, 3, 2, 4, 3, 3, 5, 4]);
    a.ok(d.points.every(function (p, i) { return i === 0 || p.x > d.points[i - 1].x; }), 'left to right in talk order');
    a.ok(/est/.test(arc.el.querySelector('.ac-stat').textContent), arc.el.querySelector('.ac-stat').textContent);
    var ids = infos.map(function (x) { return x.id; }), moved = ids.slice(); moved.splice(5, 0, moved.splice(8, 1)[0]);
    arc.preview(moved);
    a.deepEqual(arc.data().points.map(function (p) { return p.id; }), moved, 'the dots follow the order being dragged');
    arc.preview(null);
    a.deepEqual(arc.data().points.map(function (p) { return p.id; }), ids);
    a.ok(arc.el.querySelector('.ac-dot[data-id="box"] circle.ring').getAttribute('r') > 0, 'the selected scene is ringed');
    arc.destroy();
  });

  T.test('wp7: the Director leads with the score, groups by severity and folds the tips', async function (a) {
    await load();
    var f = F(), c = PD.compile('one-giant-leap'), lint = PD.story.lint(c), shown = [], ignored = [];
    var dr = PD.get('studio/ui/director').create({ onShow: function (x) { shown.push(x.id); }, onIgnore: function (x) { ignored.push(x.id); } });
    document.body.appendChild(dr.el);
    dr.update({ lint: lint, infos: f.describeScenes(c, lint, {}), selectedId: 'spark', readOnly: false });
    a.ok(+dr.el.querySelector('.dr-ring b').textContent >= 90, 'One Giant Leap scores at least 90');
    a.ok(dr.el.querySelector('.pdx-pill.is-ok'), 'Ready for the stage');
    var n = dr.counts();
    a.equal(n.error, 0); a.ok(n.warn >= 1);
    a.equal(dr.el.querySelectorAll('.dr-sec .dr-f[data-sev="info"]').length, 0, 'tips are folded away until opened');
    dr.el.querySelector('.dr-sec.is-fold > button').click();
    a.ok(dr.el.querySelectorAll('.dr-f[data-sev="info"]').length >= 1, 'and open on a click');
    a.equal(dr.el.querySelector('[data-act="ignore"]'), null, 'hand-written scenes cannot take an ignore');
    // a finding on a template scene: Show me and Ignore both appear and call back with the finding
    var pc = parity(), fake = { findings: [{ id: 'copy.lines', sev: 'warn', sceneId: 'box', step: 1, msg: 'x wraps', fix: 'Shorten it.' }], score: 95, ready: true, summary: '1 to consider.', counts: { error: 0, warn: 1, info: 0 } };
    dr.update({ lint: fake, infos: f.describeScenes(pc, fake, {}), selectedId: 'box', readOnly: false });
    dr.el.querySelector('[data-act="show"]').click(); dr.el.querySelector('[data-act="ignore"]').click();
    a.deepEqual(shown, ['copy.lines']); a.deepEqual(ignored, ['copy.lines']);
    dr.el.querySelector('[data-value="scene"]').click();
    a.equal(dr.counts().shown, 1, 'This scene keeps what is about the selected scene');
    dr.update({ lint: fake, infos: f.describeScenes(pc, fake, {}), selectedId: 'spark', readOnly: false });
    a.equal(dr.counts().shown, 0, 'and nothing on another scene');
    dr.destroy();
  });

  T.test('wp7: a folded Director card counts scenes, lists each scene once, and says what its note says', async function (a) {
    await load();
    var f = F(), c = parity(), ids = c.scenes.map(function (s) { return s.id; }), list = [];
    function add(id, sev, scene, msg, step) { list.push({ id: id, sev: sev, sceneId: scene, step: step || 0, msg: msg }); }
    var keys = ['warpColor', 'speed', 'nebula', 'sparkX', 'sparkY'], k;
    // 25 findings of one rule in only 4 scenes (a scene carries several), and 7 of another in 4 scenes
    [2, 3, 4, 5].forEach(function (si, n) { for (k = 0; k < (n < 3 ? 6 : 7); k++) add('build.world.needs-plugin', 'error', ids[si], '"' + keys[k % 5] + '" belongs to the "cosmos" world, which this deck\'s theme does not enable.', k); });
    [2, 2, 3, 3, 4, 4, 5].forEach(function (si, n) { add('build.template.requires-world', 'error', ids[si], '"Hyperspace" needs the "cosmos" world, which this deck\'s theme does not enable.', n); });
    for (k = 0; k < 5; k++) add('x.custom', 'warn', ids[k % 2], 'This note has no title of its own.', k);                 // one message, two scenes
    [6, 6, 7, 7, 8, 8].forEach(function (si, n) { add('copy.notes', 'warn', ids[si], 'No notes.', n); });                      // 6 findings, 3 scenes
    for (k = 0; k < 4; k++) add('copy.lines', 'warn', ids[1], 'This line wraps to three lines.', k);                          // 4 findings, 1 scene
    [0, 2, 4, 6].forEach(function (si) { add('x.mixed', 'warn', ids[si], 'Scene ' + (si + 1) + ' is different.'); });          // four messages
    var dr = PD.get('studio/ui/director').create({});
    document.body.appendChild(dr.el);
    var L = { findings: list, score: 40, ready: false, summary: '', counts: { error: 32, warn: 19, info: 0 } };
    dr.update({ lint: L, infos: f.describeScenes(c, L, {}), selectedId: null, readOnly: false });
    function card(id) { var g = dr.el.querySelector('.dr-g[data-group="' + id + '"]'); a.ok(g, id + ' is folded into one card'); return { title: g.querySelector('.msg').textContent, where: g.querySelector('.where').textContent }; }
    var np = card('build.world.needs-plugin');
    a.equal(np.title, '4 scenes set backgrounds this look does not have', 'scenes, not findings (there are 25)');
    a.equal(np.where, 'Scenes 3, 4, 5, 6 · 25 notes', 'each scene once, and how many findings sit behind them');
    var rw = card('build.template.requires-world');
    a.equal(rw.title, '4 scenes use shots this look cannot show'); a.equal(rw.where, 'Scenes 3, 4, 5, 6 · 7 notes');
    var cu = card('x.custom');
    a.equal(cu.title, 'This note has no title of its own.', 'a rule with no title of its own shows its message');
    a.equal(cu.where, 'Scenes 1, 2 · 5 times');
    var nt = card('copy.notes');
    a.equal(nt.title, '3 scenes have no speaker notes'); a.equal(nt.where, 'Scenes 7, 8, 9 · 6 notes');
    var cl = card('copy.lines');
    a.equal(cl.title, '4 lines run onto too many lines'); a.equal(cl.where, 'Scene 2', 'one scene reads in the singular');
    var mx = card('x.mixed');
    a.equal(mx.title, 'Scene 1 is different.'); a.equal(mx.where, 'Scenes 1, 3, 5, 7 · 3 more like it');
    a.equal(dr.el.textContent.indexOf('share this note'), -1, 'the old "N scenes share this note" is gone');
    // opened, a group lists its findings one by one
    dr.el.querySelector('.dr-g[data-group="copy.notes"] > button').click();
    a.equal(dr.el.querySelectorAll('.dr-g[data-group="copy.notes"] .dr-f').length, 6);
    dr.destroy();
  });

  T.test('wp7: the picker draws no thumbnail for a template that waits for the author\'s image, and logs nothing', async function (a) {
    await load();
    var P = PD.get('studio/ui/picker'), seen = [], warn = console.warn, err = console.error;
    console.warn = function () { seen.push([].join.call(arguments, ' ')); warn.apply(console, arguments); };
    console.error = function () { seen.push([].join.call(arguments, ' ')); err.apply(console, arguments); };
    var dlg;
    try {
      var c = PD.compile({ format: 2, id: 'wp7-pk3', meta: { title: 't', theme: 'cosmos' }, scenes: [] });
      dlg = P.open({ compiled: c, mode: 'add', beat: null, onPick: function () { } });
      var bare = [].map.call(document.querySelectorAll('.pk-card .pk-th.is-bare'), function (e) { return e.closest('.pk-card').dataset.template; }).sort();
      a.deepEqual(bare, ['image', 'logo'], 'logo and image have no image to show yet');
      a.equal(document.querySelector('.pk-card[data-template="logo"] canvas'), null, 'so no canvas is drawn for them');
      a.ok(/add one in Assets/.test(document.querySelector('.pk-card[data-template="logo"] .pk-bare').textContent), 'the tile says what it is waiting for');
      a.ok(document.querySelector('.pk-card[data-template="statement"] canvas'), 'the rest still get a thumbnail');
      await new Promise(function (r) { setTimeout(r, 1800); });                         // let the stills render
      a.equal(seen.filter(function (m) { return /pixeldeck/.test(m); }).length, 0, 'nothing logged: ' + seen.join(' | '));
    } finally { console.warn = warn; console.error = err; if (dlg) dlg.close(); P.dispose(); }
  });

  T.test('wp7: the filmstrip draws one card per scene with its flags, before any thumbnail exists', async function (a) {
    await load();
    var f = F(), c = parity(), fs = PD.get('studio/ui/filmstrip').create({ onSelect: function () { }, onAction: function () { }, onAdd: function () { } });
    document.body.appendChild(fs.el); fs.el.style.width = '900px';
    var infos = f.describeScenes(c, { findings: [{ id: 'copy.lines', sev: 'warn', sceneId: 'box' }] }, {});
    fs.update({ compiled: c, infos: infos, selectedId: 'box', fw: PD.story.framework('giant-leap'), readOnly: false });
    var cards = fs.cards();
    a.equal(cards.length, 10); a.equal(cards.filter(function (x) { return x.selected; })[0].id, 'box');
    a.equal(cards.find(function (x) { return x.id === 'box'; }).sev, 'warn');
    a.equal(fs.el.querySelectorAll('.fs-gap').length, 10, 'a "+" before every card'); a.ok(fs.el.querySelector('.fs-end'), 'and one at the end');
    a.equal(fs.el.querySelectorAll('.fs-pips i').length > 10, true, 'step pips for the scenes with clicks');
    fs.update({ compiled: c, infos: f.describeScenes(c, null, { readOnly: true }), selectedId: 'box', fw: null, readOnly: true });
    a.equal(fs.el.querySelector('.fs-end'), null, 'a read-only strip has no add card');
    a.equal(fs.el.querySelectorAll('.fs-lock').length, 10, 'and every card shows a lock');
    fs.destroy();
  });
})();
