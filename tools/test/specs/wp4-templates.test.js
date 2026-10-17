/* tools/test/specs/wp4-templates.test.js — WP4: the template catalog (spec §5): 16 templates in engine/templates/{cinematic,essentials}.js.
 * Everything compiles object decks through the harness's engine; the themes are the real cosmos and slate looks, plus a
 * "flat" look made by patching cosmos (no roles, no shots but DRIFT, only the spark world) to test the adaptive rules. */
(function () {
  var IDS = ['cold-open', 'brand-reveal', 'hyperspace', 'galaxy-reveal', 'planet', 'sunrise', 'timeline', 'the-box', 'pivot', 'finale',
    'statement', 'big-number', 'quote', 'three-points', 'logo', 'image'];
  var ROLES = ['hook', 'setup', 'identity', 'scale', 'relevance', 'emotion', 'proof', 'tension', 'turn', 'idea', 'climax', 'resolution', 'cta', 'callback'];
  // spec §5: id, energy, talkSec, stepTalkSec, roles, requires.worlds
  var CATALOG = [
    ['cold-open', 2, 20, 0, ['hook'], ['spark']],
    ['brand-reveal', 4, 30, 0, ['identity', 'idea', 'callback'], []],
    ['hyperspace', 5, 20, 20, ['scale', 'hook'], ['cosmos']],
    ['galaxy-reveal', 3, 40, 20, ['relevance', 'scale'], ['cosmos', 'planet']],
    ['planet', 2, 40, 0, ['relevance', 'setup'], ['cosmos', 'planet']],
    ['sunrise', 4, 45, 0, ['emotion', 'turn', 'resolution'], ['cosmos', 'planet']],
    ['timeline', 3, 15, 20, ['proof', 'setup'], []],
    ['the-box', 3, 45, 20, ['tension'], []],
    ['pivot', 5, 40, 20, ['turn', 'idea', 'cta'], []],
    ['finale', 4, 30, 0, ['callback', 'cta', 'resolution'], []],
    ['statement', 2, 45, 0, ROLES, []],
    ['big-number', 4, 40, 0, ['hook', 'proof', 'scale', 'tension'], []],
    ['quote', 2, 40, 0, ['proof', 'emotion'], []],
    ['three-points', 3, 20, 30, ['proof', 'idea'], []],
    ['logo', 4, 30, 0, ['identity', 'callback'], []],
    ['image', 3, 40, 0, ['emotion', 'setup', 'resolution', 'hook'], []]
  ];
  var HOOKS = ['cold-open', 'hyperspace', 'statement', 'big-number', 'quote', 'image'];
  var SEEDS = {   // spec §5 seeds table
    'cold-open': { line: '{opening line}' },
    'brand-reveal': { title: '{brand}', subtitle: '{tagline}' },
    'hyperspace': { lines: ['{a big number}', '{an even bigger one}'] },
    'galaxy-reveal': { line: '{where your audience fits}' },
    'planet': { kicker: '{where}', line: '{who lives here}' },
    'sunrise': { kicker: '{since when}', line: '{a human truth}' },
    'timeline': { title: '{topic}', milestones: [{ when: '{when}', label: '{milestone}' }, { when: '{when}', label: '{milestone}' }, { when: '{when}', label: '{milestone}' }] },
    'the-box': { line: '{oldWay} was built for a world that is gone.', escape: 'Outside', subtitle: 'is where {newWay} lives' },
    'pivot': { kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' },
    'finale': { title: '{brand}', subtitle: '{ask}' },
    'statement': { line: '{your line}' },
    'big-number': { value: 0, label: '{what the number means}' },
    'quote': { quote: '{quote}', who: '{who}' },
    'three-points': { items: [{ title: '{point}' }, { title: '{point}' }, { title: '{point}' }] },
    'logo': { asset: '', tagline: '{tagline}' },
    'image': { asset: '', caption: '{caption}' }
  };
  // spec §5 prop notation: ['text', max, style] · ['number', min, max] · ['list', min, max] · ['enum', ...options] · [type]
  var PROPS = {
    'cold-open': { line: ['text', 60, 'statement', 1], lineAt: ['number', 0, 6], sparkCount: ['number', 200, 1200], sparkColor: ['color'], shot: ['shot'] },
    'brand-reveal': { title: ['text', 18, 'hero', 1], subtitle: ['text', 40, 'subtitle'], subtitleAt: ['number', 0, 6], flash: ['number', 0, 1], entry: ['enum', 'spark', 'void', 'edges', 'center'], shot: ['shot'] },
    'hyperspace': { lines: ['list', 1, 3, 1], warpColor: ['enum', 'cyan', 'violet', 'gold', 'white'], nebula: ['nebula'], flashAt: ['number', 0, 5] },
    'galaxy-reveal': { kicker: ['text', 30, 'kicker'], line: ['text', 50, 'statement', 1], marker: ['text', 24, 'caption'] },
    'planet': { kicker: ['text', 30, 'kicker'], line: ['text', 50, 'statement', 1], region: ['enum', 'americas', 'europe-africa', 'asia'] },
    'sunrise': { kicker: ['text', 30, 'kicker'], line: ['text', 40, 'statement', 1], nebula: ['nebula'] },
    'timeline': { kicker: ['text', 30, 'kicker'], title: ['text', 40, 'statement', 1], milestones: ['list', 2, 8, 1], highlightLast: ['bool'], curve: ['bool'], shot: ['shot'] },
    'the-box': { line: ['text', 60, 'statement', 1], escape: ['text', 12, 'hero', 1], subtitle: ['text', 40, 'subtitle'], cubeColor: ['color'], cubeColor2: ['color'], shot: ['shot'] },
    'pivot': { kicker: ['text', 30, 'kicker'], from: ['text', 18, 'hero', 1], to: ['text', 18, 'hero', 1], subtitle: ['text', 44, 'subtitle'], shot: ['shot'] },
    'finale': { title: ['text', 18, 'hero', 1], subtitle: ['text', 40, 'subtitle'], shot: ['shot'] },
    'statement': { kicker: ['text', 30, 'kicker'], line: ['text', 90, 'statement', 1], align: ['enum', 'center', 'left'], reveal: ['enum', 'letters', 'rise', 'fade', 'focus', 'wipe'], shot: ['shot'] },
    'big-number': { value: ['number', null, null, 1], decimals: ['number', 0, 3], prefix: ['text', 4], suffix: ['text', 4], label: ['text', 60, 'statement', 1], source: ['text', 40, 'caption'], reveal: ['enum', 'count', 'particles'], shot: ['shot'] },
    'quote': { quote: ['text', 160, 'statement', 1], who: ['text', 30, 'label', 1], role: ['text', 40, 'caption'], shot: ['shot'] },
    'three-points': { kicker: ['text', 30, 'kicker'], items: ['list', 2, 5, 1], layout: ['enum', 'rows', 'columns'], shot: ['shot'] },
    'logo': { asset: ['asset', null, null, 1], width: ['number', 200, 1600], tagline: ['text', 40, 'subtitle'], mode: ['enum', 'alpha', 'luma'], shot: ['shot'] },
    'image': { asset: ['asset', null, null, 1], caption: ['text', 60, 'statement'], fit: ['enum', 'cover', 'contain'], focusX: ['number', 0, 1], focusY: ['number', 0, 1], zoom: ['number', 1, 1.3], dim: ['number', 0, 0.8] }
  };

  var seq = 0;
  function deckOf(theme, scenes, meta, id) {
    var m = { title: 'wp4', theme: theme };
    for (var k in meta || {}) m[k] = meta[k];
    return { id: id || 'wp4-tpl-' + (++seq), meta: m, scenes: scenes };
  }
  function compileOne(theme, template, props, meta, extra, id) {
    var sc = { id: 's1', template: template, props: props };
    for (var k in extra || {}) sc[k] = extra[k];
    return PD.compile(deckOf(theme, [sc], meta, id));
  }
  var FLAT = {      // cosmos with no roles, no shots but DRIFT and only the spark world: what an adaptive template must survive
    roles: null, worlds: ['spark', 'photo'],
    styles: { kicker: { fill: '#ffd27a', glow: '#ff9a3d' }, year: { fill: ['#fff1c9', '#ffb347'], glow: '#ff8a3d' } },
    shots: { HORIZON: null, BELOW: null, SPARK: null, BLOOM: null, HYPERSPACE: null, GALAXY: null, HOME: null, SUNRISE: null, LEAPS: null, BOX: null, PIVOT: null, FINALE: null }
  };
  var PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  function withAssets(fn) {       // a deck id with a 1200x400 logo and a 1600x900 photo registered; removed afterwards
    var id = 'wp4-assets-' + (++seq);
    PD.assets(id, { logo: { type: 'image', src: PNG, w: 1200, h: 400, name: 'logo.png', bytes: 70 }, photo: { type: 'image', src: PNG, w: 1600, h: 900, name: 'photo.png', bytes: 70 } });
    try { return fn(id); } finally { ['logo', 'photo'].forEach(function (a) { PD.assets.remove(id, a); }); }
  }
  function errors(issues) { return issues.filter(function (i) { return i.level === 'error'; }); }
  function brief(issues) { return issues.map(function (i) { return i.level + ' ' + i.code + ' ' + i.msg; }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function themeEnv(theme, meta) { return PD.get('core/compile').helpers(PD.compile(deckOf(theme, [], meta))); }
  function counterReady() { return PD.element.has('counter'); }

  T.test('catalog: the 16 template ids of spec §5, cinematic then essentials, with their story metadata and requirements', function (a) {
    a.deepEqual(PD.template.list().filter(function (n) { return IDS.indexOf(n) >= 0; }), IDS, 'the 16 ids, in registration order');
    a.deepEqual(PD.get('templates/cinematic').ids, IDS.slice(0, 10)); a.deepEqual(PD.get('templates/essentials').ids, IDS.slice(10));
    CATALOG.forEach(function (row) {
      var t = PD.template.get(row[0]);
      a.ok(t, row[0] + ' is registered');
      a.equal(typeof t.label, 'string'); a.ok(t.label.length > 0); a.equal(typeof t.summary, 'string'); a.ok(t.summary.length > 0);
      a.equal(t.story.energy, row[1], row[0] + ' energy'); a.equal(t.story.talkSec, row[2], row[0] + ' talkSec'); a.equal(t.story.stepTalkSec, row[3], row[0] + ' stepTalkSec');
      a.deepEqual(t.story.roles.slice().sort(), row[4].slice().sort(), row[0] + ' roles');
      a.equal(t.story.hook, HOOKS.indexOf(row[0]) >= 0, row[0] + ' hook');
      a.deepEqual(t.requires.worlds, row[5], row[0] + ' requires.worlds');
      t.story.roles.forEach(function (r) { a.ok(ROLES.indexOf(r) >= 0, row[0] + ': role ' + r + ' is one of the 14'); });
      a.equal(typeof t.expand, 'function'); a.ok(t.props && typeof t.props === 'object'); a.ok(t.example && typeof t.example === 'object'); a.ok(t.seed && typeof t.seed === 'object');
    });
    var labels = { 'cold-open': 'Spark cold open', 'brand-reveal': 'Brand reveal', hyperspace: 'Hyperspace', 'galaxy-reveal': 'Galaxy, you are here', planet: 'Fly home',
      sunrise: 'Sunrise', timeline: 'Milestones', 'the-box': 'The box', pivot: 'Not X. Y.', finale: 'Finale', statement: 'Big statement', 'big-number': 'Big number',
      quote: 'Quote', 'three-points': 'Points, one per click', logo: 'Logo reveal', image: 'Image hold' };
    IDS.forEach(function (id) { a.equal(PD.template.get(id).label, labels[id], id + ' label'); });
    a.equal(IDS.filter(function (id) { return PD.template.get(id).story.hook; }).length, HOOKS.length, 'the hook set has six members');
    a.ok(!PD.template.has('points') && !PD.template.has('warp'), '"points" is a shape and "warp" a world param, never template ids');
    var img = PD.template.get('image').requires;
    a.deepEqual(img.worldsFor({ fit: 'cover' }), ['photo']); a.deepEqual(img.worldsFor({ fit: 'contain' }), [], 'image needs the photo world unless fit = contain');
    a.deepEqual(img.worldsFor({}), ['photo'], 'a partial props object (a seed) means the default fit, cover'); a.deepEqual(img.worldsFor(PD.template.get('image').seed), ['photo']);
  });

  T.test('props schemas: types, limits and styles of spec §5; optional props carry a default, required ones do not; examples are complete', function (a) {
    var TYPES = ['text', 'longtext', 'number', 'bool', 'color', 'enum', 'asset', 'list', 'shot', 'nebula'];
    IDS.forEach(function (id) {
      var t = PD.template.get(id), want = PROPS[id], names = Object.keys(want);
      a.deepEqual(Object.keys(t.props).sort(), names.slice().sort(), id + ': the props of spec §5');
      names.forEach(function (n) {
        var ps = t.props[n], w = want[n], at = id + '.' + n;
        a.ok(TYPES.indexOf(ps.type) >= 0, at + ' type ' + ps.type); a.equal(typeof ps.label, 'string', at + ' has a label');
        var kind = w[0], isText = ps.type === 'text' || ps.type === 'longtext';
        a.ok(kind === 'text' ? isText : ps.type === kind, at + ' is ' + kind + ' (got ' + ps.type + ')');
        if (kind === 'text') { a.equal(ps.max, w[1], at + ' max chars'); if (w[2]) a.equal(ps.style, w[2], at + ' style'); }
        if (kind === 'number' && w[1] != null) { a.equal(ps.min, w[1], at + ' min'); a.equal(ps.max, w[2], at + ' max'); }
        if (kind === 'list') { a.equal(ps.min, w[1], at + ' min items'); a.equal(ps.max, w[2], at + ' max items'); a.ok(ps.of, at + ' has an item schema'); }
        if (kind === 'enum') a.deepEqual(ps.options, w.slice(1), at + ' options');
        if (kind !== 'enum' && w[3]) { a.equal(ps.required, true, at + ' is required (*)'); a.ok(!('default' in ps), at + ' has no default'); a.ok(n in t.example, at + ' is in the example'); }
        else { a.ok(!ps.required, at + ' is optional'); a.ok('default' in ps, at + ' has a default'); }
        if ('default' in ps && n in t.example && IDS.indexOf(id) < 10) a.deepEqual(t.example[n], ps.default, at + ': the example repeats the default (the cinematic set: One Giant Leap\'s values)');
      });
    });
    a.deepEqual(Object.keys(PD.template.get('timeline').props.milestones.of).sort(), ['color', 'label', 'pos', 'u', 'when']);
    var mo = PD.template.get('timeline').props.milestones.of;
    a.equal(mo.when.max, 14); a.equal(mo.when.style, 'year'); a.equal(mo.label.max, 22); a.equal(mo.label.style, 'label'); a.equal(mo.u.min, 0); a.equal(mo.u.max, 1);
    a.deepEqual(mo.pos.options, ['auto', 'above', 'below', 'left']); a.equal(mo.pos.default, 'auto');
    var it = PD.template.get('three-points').props.items.of;
    a.equal(it.title.max, 24); a.equal(it.title.style, 'label'); a.equal(it.line.max, 60); a.equal(it.line.size, 44);
    a.equal(PD.template.get('hyperspace').props.lines.of.max, 34); a.equal(PD.template.get('hyperspace').props.lines.of.style, 'title');
  });

  T.test('seeds are the storyboard placeholders of spec §5, and the example props are One Giant Leap\'s values for the cinematic set', function (a) {
    IDS.forEach(function (id) { a.deepEqual(PD.template.get(id).seed, SEEDS[id], id + ' seed'); });
    var ex = function (id) { return PD.template.get(id).example; };
    a.equal(ex('cold-open').line, 'Every giant leap begins with a single spark.'); a.equal(ex('cold-open').lineAt, 1.8); a.equal(ex('cold-open').sparkCount, 700);
    a.equal(ex('cold-open').sparkColor, 'gold'); a.equal(ex('cold-open').shot, 'SPARK');
    a.deepEqual([ex('brand-reveal').title, ex('brand-reveal').subtitle, ex('brand-reveal').subtitleAt, ex('brand-reveal').flash, ex('brand-reveal').entry, ex('brand-reveal').shot],
      ['One Giant Leap', 'Making work more human', 2.6, 0.32, 'spark', 'BLOOM']);
    a.deepEqual(ex('hyperspace'), { lines: ['13.8 billion years', 'Hundreds of billions of galaxies'], warpColor: 'cyan', nebula: 'cosmic', flashAt: 3.0 });
    a.deepEqual(ex('galaxy-reveal'), { kicker: 'Somewhere in all of this', line: 'there is one small, blue world.', marker: 'You are here' });
    a.deepEqual(ex('planet'), { kicker: 'Third planet from the sun', line: 'Home to the most restless minds we know of.', region: 'americas' });
    a.deepEqual(ex('sunrise'), { kicker: 'For 300,000 years', line: 'we have thought outside the box.', nebula: 'dawn' });
    var ms = ex('timeline').milestones;
    a.deepEqual(ms.map(function (m) { return m.u; }), [0.04, 0.22, 0.43, 0.6, 0.74, 0.86, 0.975], 'OGL\'s seven u values');
    a.deepEqual(ms.map(function (m) { return m.when + ' | ' + m.label; }), ['~1,000,000 BCE | Fire', '3500 BCE | The wheel', '1440 | The printing press', '1903 | First flight',
      '1969 | The Moon', '1989 | The World Wide Web', 'Now | The next leap']);
    a.deepEqual([ex('the-box').line, ex('the-box').escape, ex('the-box').subtitle, ex('the-box').cubeColor, ex('the-box').cubeColor2, ex('the-box').shot],
      ["Every breakthrough began as an idea that didn't fit.", 'Outside', 'is where the future lives', 'cyan', 'violet', 'BOX']);
    a.deepEqual([ex('pivot').kicker, ex('pivot').from, ex('pivot').to, ex('pivot').subtitle, ex('pivot').shot],
      ['The next leap', 'Not automation.', 'Augmentation.', 'Technology that makes work more human', 'PIVOT']);
    a.deepEqual(ex('finale'), { title: 'One Giant Leap', subtitle: 'Thank you', shot: 'FINALE' });
    a.equal(ex('big-number').value, 62); a.equal(PD.template.get('big-number').props.suffix.default, '%');
    a.equal(ex('logo').width, 900); a.equal(ex('logo').shot, 'BLOOM'); a.equal(ex('image').fit, 'cover'); a.equal(ex('image').zoom, 1.08); a.equal(ex('image').dim, 0.25);
    a.equal(PD.template.get('finale').props.subtitle.hint, 'Put your ask here');
  });

  T.test('every example compiles and validates with 0 errors under cosmos (logo, image and the counter need WP3)', function (a) {
    withAssets(function (aid) {
      var skipped = [];
      IDS.forEach(function (id) {
        var t = PD.template.get(id), props = clone(t.example);
        if (id === 'logo' || id === 'image') props.asset = id === 'logo' ? 'logo' : 'photo';
        var c = compileOne('cosmos', id, props, null, null, aid);
        a.deepEqual(c.errors, [], id + ': compile errors');
        var issues = PD.validate(c);
        if (id === 'big-number' && !counterReady()) {                   // the counter element is WP3's; the particles variant needs nothing
          skipped.push(id);
          issues = PD.validate(compileOne('cosmos', id, Object.assign(clone(props), { reveal: 'particles' }), null, null, aid));
        }
        a.deepEqual(brief(errors(issues)), [], id + ': validate errors under cosmos');
        a.deepEqual(brief(issues), [], id + ': no warnings either');
        a.ok(c.scenes[0] !== c.source.scenes[0] && c.scenes[0].like === id, id + ': expanded, like = template id');
      });
      if (skipped.length) a.ok(true, 'counter element not registered yet; big-number validated with reveal "particles" (' + skipped.join(', ') + ')');
    });
  });

  T.test('adaptive templates compile and validate with 0 errors under slate (and under a flat theme with no shots, roles or space worlds)', function (a) {
    var ADAPTIVE = CATALOG.filter(function (r) { return r[5].length === 0; }).map(function (r) { return r[0]; });
    a.equal(ADAPTIVE.length, 11, 'brand-reveal, timeline, the-box, pivot, finale and the six essentials');
    var looks = [['flat', 'cosmos', { themePatch: FLAT }]];
    if (PD.theme.has('slate')) looks.push(['slate', 'slate', null]); else a.ok(true, 'slate (WP3) not registered: only the flat look is checked');
    withAssets(function (aid) {
      looks.forEach(function (look) {
        ADAPTIVE.forEach(function (id) {
          var props = clone(PD.template.get(id).example);
          if (id === 'logo' || id === 'image') props.asset = id === 'logo' ? 'logo' : 'photo';
          if (id === 'big-number' && !counterReady()) props.reveal = 'particles';
          var c = compileOne(look[1], id, props, look[2], null, aid);
          a.deepEqual(c.errors, [], look[0] + ' ' + id + ': compile errors');
          var issues = PD.validate(c);
          a.deepEqual(brief(errors(issues)), [], look[0] + ' ' + id + ': validate errors');
          a.deepEqual(brief(issues.filter(function (i) { return /world|requires/.test(i.code); })), [], look[0] + ' ' + id + ': no world keys the look does not have');
        });
      });
    });
  });

  T.test('cosmos-only templates need their worlds: template.requires-world and world.needs-plugin under a look without them', function (a) {
    ['hyperspace', 'galaxy-reveal', 'planet', 'sunrise'].forEach(function (id) {
      var c = compileOne('cosmos', id, clone(PD.template.get(id).example), { themePatch: FLAT });
      var is = PD.validate(c), req = is.filter(function (i) { return i.code === 'template.requires-world'; });
      a.ok(req.length >= 1 && req[0].level === 'error' && req[0].scene === 0 && req[0].sceneId === 's1', id + ': requires-world error');
      a.ok(is.some(function (i) { return i.code === 'world.needs-plugin'; }), id + ': and its world keys are flagged');
    });
    var c2 = compileOne('cosmos', 'cold-open', clone(PD.template.get('cold-open').example), { themePatch: { worlds: [] } });
    a.deepEqual(PD.validate(c2).filter(function (i) { return i.code === 'template.requires-world'; }).map(function (i) { return i.msg; }).length, 1, 'cold-open without the spark world');
    if (PD.theme.has('slate')) {
      var cs = compileOne('slate', 'hyperspace', clone(PD.template.get('hyperspace').example));
      a.ok(PD.validate(cs).some(function (i) { return i.code === 'template.requires-world' && /cosmos/.test(i.msg); }), 'hyperspace under slate');
      a.deepEqual(brief(PD.validate(compileOne('slate', 'cold-open', clone(PD.template.get('cold-open').example)))), [], 'cold-open works under slate (it has the spark world)');
    }
    // the image template needs photo only for fit = cover
    var noPhoto = { themePatch: { worlds: [] } };
    var withA = function (aid, fit) { return PD.validate(compileOne('cosmos', 'image', { asset: 'photo', fit: fit }, noPhoto, null, aid)); };
    withAssets(function (aid) {
      a.ok(withA(aid, 'cover').some(function (i) { return i.code === 'template.requires-world' && /photo/.test(i.msg); }), 'cover needs photo');
      a.ok(!withA(aid, 'contain').some(function (i) { return i.code === 'template.requires-world'; }), 'contain does not');
    });
  });

  T.test('expand is pure: two calls are deepEqual, the input is not changed, nothing leaks between calls, and there are zero random-number calls', function (a) {
    var looks = [['cosmos', null], ['cosmos', { themePatch: FLAT }]];
    if (PD.theme.has('slate')) looks.push(['slate', null]);
    var realRandom = Math.random, calls = 0;
    Math.random = function () { calls++; return 0.5; };
    try {
      looks.forEach(function (look) {
        IDS.forEach(function (id) {
          var t = PD.template.get(id), env = themeEnv(look[0], look[1]), props = clone(t.example), before = clone(props);
          var one = t.expand(props, env), two = t.expand(props, env);
          a.deepEqual(one, two, id + ' under ' + look[0] + ': two calls are deepEqual');
          a.deepEqual(props, before, id + ': the props were not mutated');
          var third = t.expand(clone(t.example), env), snapshot = clone(third);
          mutate(one);                                                  // scribble over the first expansion...
          a.deepEqual(third, snapshot, id + ' under ' + look[0] + ': ...which changes nothing in the second (no object shared between expansions)');
          a.deepEqual(t.expand(clone(t.example), env), snapshot, id + ': nor in the next one (no module-level objects handed out)');
        });
      });
    } finally { Math.random = realRandom; }
    a.equal(calls, 0, 'zero random-number calls in all expansions');
    function mutate(v) { if (Array.isArray(v)) { v.forEach(mutate); v.push('X'); } else if (v && typeof v === 'object') { for (var k in v) mutate(v[k]); v.__x = 1; } }
  });

  T.test('expansions contain data only: no functions or closures anywhere (so a scene\'s content hash sees everything it shows)', function (a) {
    function walk(v, path, a) {
      if (typeof v === 'function') a.fail(path + ' is a function');
      else if (Array.isArray(v)) v.forEach(function (x, i) { walk(x, path + '[' + i + ']', a); });
      else if (v && typeof v === 'object') for (var k in v) walk(v[k], path + '.' + k, a);
    }
    withAssets(function (aid) {
      IDS.forEach(function (id) {
        var props = clone(PD.template.get(id).example);
        if (id === 'logo' || id === 'image') props.asset = id === 'logo' ? 'logo' : 'photo';
        walk(compileOne('cosmos', id, props, null, null, aid).scenes[0], id, a);
      });
    });
    a.ok(true);
  });

  T.test('the cinematic examples, with only the required props, give the same scene as the full example (the schema defaults ARE the example)', function (a) {
    IDS.slice(0, 10).forEach(function (id) {
      var t = PD.template.get(id), req = {};
      Object.keys(t.props).forEach(function (n) { if (t.props[n].required) req[n] = clone(t.example[n]); });
      a.deepEqual(compileOne('cosmos', id, req).scenes[0], compileOne('cosmos', id, clone(t.example)).scenes[0], id);
    });
  });

  T.test('cold-open (1): spark world, a spark of 40 px radius, the statement at y 820 on letters; props flow through', function (a) {
    var s = compileOne('cosmos', 'cold-open', clone(PD.template.get('cold-open').example)).scenes[0];
    a.deepEqual(s.world, PD.theme.resolve('cosmos').shots.SPARK, 'world = W(shot, { spark: 1 })'); a.equal(s.world.spark, 1);
    a.equal(s.worldTime, 3); a.equal(s.dwell, 6);
    a.deepEqual(s.particles, [{ shape: 'spark', id: 'spark', count: 700, radius: 40 }]);
    a.deepEqual(s.motion, { entry: 'spark', dur: 2.4, spread: 1.8, ease: 'easeOutCubic', arc: 0.8 });
    a.deepEqual(s.text, [{ str: 'Every giant leap begins with a single spark.', style: 'statement', y: 820, reveal: 'letters', revealTime: 2.4, at: 1.8 }]);
    var t = compileOne('cosmos', 'cold-open', { line: 'Hi', lineAt: 3, sparkCount: 300, sparkColor: 'rose', shot: 'DRIFT' }).scenes[0];
    a.equal(t.text[0].at, 3); a.equal(t.particles[0].count, 300); a.equal(t.particles[0].color, 'rose'); a.deepEqual(t.world, { spark: 1 });
    var f = compileOne('cosmos', 'cold-open', { line: 'Hi' }).scenes[0];
    a.equal(f.text[0].at, 1.8); a.equal(f.particles[0].count, 700); a.ok(!('color' in f.particles[0]), 'gold is the spark\'s own colour');
  });

  T.test('brand-reveal (2): hero particles at y 470, subtitle letters at y 610; flash and spark timing only where they apply', function (a) {
    var s = compileOne('cosmos', 'brand-reveal', clone(PD.template.get('brand-reveal').example)).scenes[0];
    a.deepEqual(s.world, PD.theme.resolve('cosmos').shots.BLOOM); a.equal(s.worldTime, 3.5); a.equal(s.textDelay, 0.25); a.equal(s.dwell, 6);
    a.deepEqual(s.timing, { spark: [0.6, 'outQuad'] }); a.deepEqual(s.cues, [{ at: 0.35, flash: 0.32 }]);
    a.deepEqual(s.motion, { stagger: 'radial', ease: 'easeOutCubic', dur: 1.9, spread: 0.8, arc: 0.35, entry: 'spark', exit: 'drift' });
    a.deepEqual(s.text, [{ id: 'brand', str: 'One Giant Leap', style: 'hero', y: 470, reveal: 'particles' },
      { str: 'Making work more human', style: 'subtitle', y: 610, reveal: 'letters', at: 2.6 }]);
    var e = compileOne('cosmos', 'brand-reveal', { title: 'Acme', subtitle: '', flash: 0, entry: 'edges', subtitleAt: 1 }).scenes[0];
    a.equal(e.text.length, 1, 'no tagline, no subtitle text'); a.ok(!('cues' in e), 'flash 0 → no cue'); a.equal(e.motion.entry, 'edges');
    var flat = compileOne('cosmos', 'brand-reveal', { title: 'Acme' }, { themePatch: { worlds: [] } }).scenes[0];
    a.ok(!('timing' in flat), 'no spark world → no spark timing'); a.deepEqual(flat.world, PD.theme.resolve('cosmos').shots.BLOOM, 'the shot still applies');
    var nf = compileOne('cosmos', 'brand-reveal', { title: 'Acme' }, { themePatch: FLAT }).scenes[0];
    a.deepEqual(nf.world, {}, 'a look without the BLOOM shot falls back to DRIFT'); a.deepEqual(nf.timing, { spark: [0.6, 'outQuad'] }, 'the flat look has the spark world');
  });

  T.test('hyperspace (3): line 1 on focus after the flash, one step per later line (remove the previous, textDelay .6, size 68 over 24 characters), exit warp', function (a) {
    var s = compileOne('cosmos', 'hyperspace', clone(PD.template.get('hyperspace').example)).scenes[0];
    a.deepEqual(s.world, PD.theme.resolve('cosmos').shots.HYPERSPACE); a.equal(s.dwell, 4); a.deepEqual(s.motion, { exit: 'warp' }); a.deepEqual(s.cues, [{ at: 3, flash: 0.5 }]);
    a.deepEqual(s.text, [{ id: 'w1', str: '13.8 billion years', style: 'title', y: 540, reveal: 'focus', at: 3.1 }]);
    a.deepEqual(s.steps, [{ remove: ['w1'], textDelay: 0.6, text: [{ str: 'Hundreds of billions of galaxies', style: 'title', size: 68, y: 540, reveal: 'focus' }] }]);
    a.deepEqual(s.timing.shake, [2.4, 'inQuad', 1.2]); a.deepEqual(s.timing.letterbox, [1.6, 'inOutCubic']);
    var t = compileOne('cosmos', 'hyperspace', { lines: ['One', 'Two', 'Three is a rather long line!'], warpColor: 'gold', nebula: 'dawn', flashAt: 1 }).scenes[0];
    a.equal(t.steps.length, 2); a.deepEqual(t.steps[0].remove, ['w1']); a.deepEqual(t.steps[1].remove, ['w2']); a.equal(t.steps[0].text[0].id, 'w2'); a.ok(!('id' in t.steps[1].text[0]), 'the last line needs no id');
    a.equal(t.steps[1].text[0].size, 68); a.ok(!('size' in t.steps[0].text[0]));
    a.equal(t.world.warpColor, 'gold'); a.equal(t.world.nebula, 'dawn'); a.equal(t.text[0].at, 1.1); a.deepEqual(t.cues, [{ at: 1, flash: 0.5 }]);
    var one = compileOne('cosmos', 'hyperspace', { lines: ['Only line'] }).scenes[0];
    a.ok(!('steps' in one), 'a single line has no steps');
    var str = compileOne('cosmos', 'hyperspace', { lines: 'Just a string' }).scenes[0];
    a.equal(str.text[0].str, 'Just a string', 'compile coerces a lone string into a one-item list');
  });

  T.test('galaxy-reveal (4): kicker and line on the left, the "You are here" step with a 40-point ring around the Earth dot', function (a) {
    var s = compileOne('cosmos', 'galaxy-reveal', clone(PD.template.get('galaxy-reveal').example)).scenes[0];
    a.deepEqual(s.world, PD.theme.resolve('cosmos').shots.GALAXY); a.equal(s.dwell, 5); a.deepEqual(s.cues, [{ at: 0, flash: 0.45 }]);
    a.deepEqual(s.text, [{ str: 'Somewhere in all of this', style: 'kicker', x: 220, y: 430, align: 'left', at: 1.8 },
      { str: 'there is one small, blue world.', style: 'statement', x: 220, y: 500, align: 'left', at: 2.4, reveal: 'letters' }]);
    a.equal(s.steps.length, 1); var st = s.steps[0];
    a.deepEqual(st.world, { earth: 1 }); a.deepEqual(st.timing, { earth: [1.5, 'inOutQuad'] });
    a.deepEqual(st.text, [{ str: 'You are here', style: 'caption', x: 520, y: 760, reveal: 'fade', at: 0.6 }]);
    var ring = st.particles[0].points; a.equal(st.particles[0].shape, 'points'); a.equal(ring.length, 40);
    a.deepEqual(ring[0], { x: 550, y: 700, s: 5, a: 0.7, color: '#7fd4ff' }); a.near(ring[10].x, 520, 1e-9); a.near(ring[10].y, 730, 1e-9);
    var n = compileOne('cosmos', 'galaxy-reveal', { line: 'x', marker: '', kicker: '' }).scenes[0];
    a.ok(!('steps' in n), 'an empty marker means no click'); a.equal(n.text.length, 1, 'an empty kicker is left out');
  });

  T.test('planet (5): the HOME shot, earthRot by region, kicker at y 120 and the line at y 975', function (a) {
    var cos = PD.theme.resolve('cosmos'), mk = function (r) { return compileOne('cosmos', 'planet', { kicker: 'K', line: 'L', region: r }).scenes[0]; };
    a.deepEqual(mk('americas').world, cos.shots.HOME); a.equal(mk('americas').world.earthRot, -1.1); a.equal(mk('europe-africa').world.earthRot, 0.25); a.equal(mk('asia').world.earthRot, 1.9);
    var rest = JSON.stringify(mk('asia').world).replace(/"earthRot":[-\d.]+/, ''); a.equal(rest, JSON.stringify(cos.shots.HOME).replace(/"earthRot":[-\d.]+/, ''), 'only earthRot changes');
    var s = mk('americas');
    a.deepEqual(s.text, [{ str: 'K', style: 'kicker', y: 120, at: 4.2 }, { str: 'L', style: 'statement', y: 975, at: 4.8, reveal: 'letters' }]);
    a.equal(s.dwell, 6); a.deepEqual(s.timing.letterbox, [3, 'inOutCubic', 2.5]); a.deepEqual(s.timing.earthR, [5, 'inOutCubic']);
  });

  T.test('sunrise (6): the SUNRISE shot with the chosen nebula, kicker at y 300, the line at size 78 and y 382', function (a) {
    var s = compileOne('cosmos', 'sunrise', { kicker: 'K', line: 'L', nebula: 'ember' }).scenes[0];
    a.equal(s.world.nebula, 'ember'); a.equal(s.world.sun, 1); a.equal(s.worldTime, 5); a.equal(s.dwell, 7);
    a.deepEqual(s.text, [{ str: 'K', style: 'kicker', y: 300, at: 4.4 }, { str: 'L', style: 'statement', size: 78, y: 382, at: 5, reveal: 'letters' }]);
    a.deepEqual(s.timing.sun, [3.5, 'inOutQuad', 2.6]); a.deepEqual(s.timing.nebula, [4]); a.deepEqual(s.timing.earthPitch, [4, 'inOutCubic']);
  });

  T.test('timeline (7): u defaults to .04 + i·.935/(n−1), auto text positions, accent nodes and a futureGlow last node, a 421-point teal-to-gold curve', function (a) {
    var cos = PD.theme.resolve('cosmos');
    var ms3 = [{ when: 'A', label: 'one' }, { when: 'B', label: 'two' }, { when: 'C', label: 'three' }];
    var s = compileOne('cosmos', 'timeline', { kicker: 'K', title: 'T', milestones: ms3 }).scenes[0];
    a.deepEqual(s.world, cos.shots.LEAPS); a.equal(s.worldTime, 2.5); a.equal(s.dwell, 3);
    a.deepEqual(s.motion, { stagger: 'leftToRight', dur: 1.4, spread: 1.6, ease: 'easeInOutCubic', arc: 0.15, entry: 'void', exit: 'drift' });
    a.equal(s.steps.length, 3, 'one step per milestone');
    var u = [0.04, 0.04 + 0.935 / 2, 0.04 + 2 * 0.935 / 2];                // .04, .5075, .975
    var xy = function (v) { return { x: 170 + v * 1580, y: 860 - 590 * Math.pow(v, 2.3) }; };
    s.steps.forEach(function (st, i) {
      var c = xy(u[i]), pts = st.particles[0].points;
      a.equal(pts.length, 23, 'a 22-point ring and the white centre'); a.near(pts[22].x, c.x, 1e-9); a.near(pts[22].y, c.y, 1e-9); a.deepEqual([pts[22].s, pts[22].color], [22, '#ffffff']);
      a.equal(pts[0].color, i === 2 ? '#ff8a3d' : '#ffd27a', 'accent, last node futureGlow'); a.equal(pts[0].s, 6);
    });
    var y0 = xy(u[0]), y1 = xy(u[1]), y2 = xy(u[2]);
    a.deepEqual(s.steps[0].text[0], { str: 'A', style: 'year', x: y0.x, y: y0.y - 88 - 18, align: 'center', reveal: 'rise' }, 'u < .12: above');
    a.deepEqual(s.steps[1].text[1], { str: 'two', style: 'label', x: y1.x - 40, y: y1.y - 6 + 26, align: 'right', reveal: 'rise', at: 0.15 }, 'u ≥ .5: left');
    a.equal(s.steps[2].text[0].align, 'right');
    var b = compileOne('cosmos', 'timeline', { title: 'T', milestones: [{ when: 'x', label: 'y', u: 0.3 }, { when: 'x', label: 'y', u: 0.3, pos: 'above' }, { when: 'x', label: 'y', u: 0.3, color: 'rose' }] }).scenes[0];
    a.equal(b.steps[0].text[0].y, xy(0.3).y + 74 - 18, '.12 ≤ u < .5: below'); a.equal(b.steps[1].text[0].y, xy(0.3).y - 88 - 18, 'an explicit pos wins');
    a.equal(b.steps[2].particles[0].points[0].color, 'rose', 'an explicit node colour wins over highlightLast');
    var cv = s.particles[0]; a.equal(cv.id, 'curve'); a.equal(cv.shape, 'points'); a.equal(cv.points.length, 421);
    a.deepEqual(cv.points[0], { x: 170, y: 860, color: '#2fd4c4', s: 6, a: 0.75 }, 'teal at the start'); a.equal(cv.points[420].color, '#ffd27a', 'gold at the end');
    var q = compileOne('cosmos', 'timeline', { title: 'T', milestones: ms3, highlightLast: false, curve: false }).scenes[0];
    a.ok(!('particles' in q), 'curve: false draws no curve'); a.equal(q.steps[2].particles[0].points[0].color, '#ffd27a', 'highlightLast: false keeps every node accent');
    var one = compileOne('cosmos', 'timeline', { title: 'T', milestones: [{ when: 'x', label: 'y' }] }).scenes[0];
    a.equal(one.steps.length, 1, 'a single milestone does not divide by zero');
  });

  T.test('the-box (8): cube and swarm, then a step that removes the swarm and the box text and brings in the escape word (future colours) and the accent subtitle', function (a) {
    var cos = PD.theme.resolve('cosmos');
    var s = compileOne('cosmos', 'the-box', clone(PD.template.get('the-box').example)).scenes[0];
    a.deepEqual(s.world, cos.shots.BOX); a.equal(s.worldTime, 2.4); a.equal(s.dwell, 4);
    a.deepEqual(s.particles, [{ shape: 'cube', id: 'cube', x: 640, y: 520, size: 200, perEdge: 40, color: 'cyan', color2: 'violet', spin: 0.22 }, { shape: 'swarm', id: 'swarm', inside: 'cube', count: 420 }]);
    a.deepEqual(s.text, [{ id: 'boxText', str: "Every breakthrough began as an idea that didn't fit.", style: 'statement', x: 1060, y: 520, align: 'left', maxWidth: 720, at: 1, reveal: 'letters' }]);
    a.deepEqual(s.steps[0].remove, ['swarm', 'boxText']); a.deepEqual(s.steps[0].motion, { stagger: 'leftToRight', dur: 2, spread: 0.9, ease: 'easeInOutCubic', arc: 0.5, entry: 'spark' });
    a.deepEqual(s.steps[0].text, [{ str: 'Outside', style: 'hero', x: 1380, y: 500, reveal: 'particles', color: cos.roles.future, glow: cos.roles.futureGlow },
      { str: 'is where the future lives', style: 'subtitle', x: 1380, y: 610, at: 2.6, color: cos.roles.accent }]);
    var n = compileOne('cosmos', 'the-box', { line: 'L', escape: 'Out', subtitle: '' }, { themePatch: FLAT }).scenes[0];
    a.equal(n.steps[0].text.length, 1); a.deepEqual(n.steps[0].text[0].color, ['#fff1c9', '#ffb347'], 'a look without roles uses the cosmos literals'); a.equal(n.steps[0].text[0].glow, '#ff8a3d');
  });

  T.test('pivot (9): the old answer in the past colours (glowAlpha .35), a step that swaps in yours; sizes come from fit(…, 118, 1700)', function (a) {
    var cos = PD.theme.resolve('cosmos');
    var s = compileOne('cosmos', 'pivot', clone(PD.template.get('pivot').example)).scenes[0];
    a.deepEqual(s.world, cos.shots.PIVOT); a.equal(s.worldTime, 2.4); a.equal(s.dwell, 4);
    a.deepEqual(s.text, [{ str: 'The next leap', style: 'kicker', y: 360 },
      { id: 'auto', str: 'Not automation.', style: 'hero', size: 118, y: 520, reveal: 'particles', color: cos.roles.past, glow: cos.roles.pastGlow, glowAlpha: 0.35 }]);
    a.deepEqual(s.steps[0].remove, ['auto']); a.deepEqual(s.steps[0].motion, { stagger: 'leftToRight', dur: 1.9, spread: 0.8, ease: 'easeInOutCubic', arc: 0.45, entry: 'void' });
    a.deepEqual(s.steps[0].text, [{ str: 'Augmentation.', style: 'hero', size: 118, y: 520, reveal: 'particles', color: cos.roles.future, glow: cos.roles.futureGlow },
      { str: 'Technology that makes work more human', style: 'subtitle', y: 650, at: 2.6, color: cos.roles.accent }]);
    var env = themeEnv('cosmos'), long = 'Wwwwwwwwwwwwwwwwwwwwww.';
    var big = compileOne('cosmos', 'pivot', { from: long, to: 'Yes.', subtitle: '' }).scenes[0];
    a.equal(big.text[1].size, env.fit(long, 'hero', 118, 1700)); a.ok(big.text[1].size < 118, 'a very wide answer steps down'); a.equal(big.steps[0].text.length, 1);
  });

  T.test('finale (10): the title as particles at y 380, the line at y 500, an explode prelude; the sun timing only where the look has a sun', function (a) {
    var cos = PD.theme.resolve('cosmos');
    var s = compileOne('cosmos', 'finale', clone(PD.template.get('finale').example)).scenes[0];
    a.deepEqual(s.world, cos.shots.FINALE); a.equal(s.worldTime, 4); a.equal(s.dwell, 7);
    a.equal(s.prelude, 'explode'); a.equal(s.preludeTime, 0.8); a.equal(s.explodePower, 1.1);
    a.deepEqual(s.motion, { stagger: 'radial', ease: 'easeOutCubic', dur: 2, spread: 0.9, arc: 0.4, entry: 'void', exit: 'drift' });
    a.deepEqual(s.timing, { sun: [3, 'inOutQuad', 1], sunY: [5, 'outCubic', 0.5] });
    a.deepEqual(s.text, [{ str: 'One Giant Leap', style: 'hero', y: 380, reveal: 'particles' }, { str: 'Thank you', style: 'subtitle', y: 500, at: 2.8 }]);
    var f = compileOne('cosmos', 'finale', { title: 'Acme', subtitle: '' }, { themePatch: FLAT }).scenes[0];
    a.ok(!('timing' in f), 'no sun in the look, no sun timing'); a.equal(f.text.length, 1, 'an empty subtitle is left out');
  });

  T.test('statement (11): kicker at y 440 and line at y 520, or left-aligned at x 220; the kicker clears a multi-line block; reveal flows through', function (a) {
    var s = compileOne('cosmos', 'statement', { kicker: 'K', line: 'Short line', align: 'center', reveal: 'rise' }).scenes[0];
    a.deepEqual(s.text, [{ str: 'K', style: 'kicker', y: 440 }, { str: 'Short line', style: 'statement', y: 520, reveal: 'rise', at: 0.3 }]);
    a.equal(s.worldTime, 2.4); a.equal(s.dwell, 5); a.deepEqual(s.world, {});
    var l = compileOne('cosmos', 'statement', { kicker: 'K', line: 'Short line', align: 'left' }).scenes[0];
    a.deepEqual(l.text, [{ str: 'K', style: 'kicker', y: 440, x: 220, align: 'left' }, { str: 'Short line', style: 'statement', y: 520, reveal: 'letters', at: 0.3, x: 220, align: 'left' }]);
    var no = compileOne('cosmos', 'statement', { line: 'Alone' }).scenes[0];
    a.equal(no.text.length, 1); a.ok(!('at' in no.text[0]), 'no kicker, nothing to wait for');
    var longLine = 'This sentence is deliberately long enough that it has to wrap onto a second line when it is set in the statement style.';
    var env = themeEnv('cosmos'), m = env.measure(longLine, 'statement');
    var w = compileOne('cosmos', 'statement', { kicker: 'K', line: longLine }).scenes[0];
    a.ok(m.lines.length >= 2, 'the test line wraps (' + m.lines.length + ' lines)'); a.near(w.text[0].y, 520 - m.h / 2 - 48, 1e-9, 'the kicker stays 48 px above the block');
    a.ok(w.text[0].y < 440, 'higher than the one-line position');
  });

  T.test('big-number (12): a counter element at y 450 (or a mega particles text), the label at y 640 / 1.2 s and the source at y 960 / 1.8 s', function (a) {
    var s = compileOne('cosmos', 'big-number', { value: 1234.5, decimals: 1, prefix: '$', suffix: 'M', label: 'L', source: 'S' }).scenes[0];
    a.deepEqual(s.elements, [{ kind: 'counter', id: 'num', from: 0, to: 1234.5, decimals: 1, prefix: '$', suffix: 'M', sep: ',', style: 'mega', x: 960, y: 450, countTime: 1.8 }]);
    a.deepEqual(s.text, [{ str: 'L', style: 'statement', y: 640, at: 1.2 }, { str: 'S', style: 'caption', y: 960, at: 1.8 }]);
    var p = compileOne('cosmos', 'big-number', { value: 1234.5, decimals: 1, prefix: '$', suffix: 'M', label: 'L', source: '', reveal: 'particles' }).scenes[0];
    a.ok(!('elements' in p)); a.deepEqual(p.text[0], { id: 'num', str: '$1,234.5M', style: 'mega', y: 450, reveal: 'particles' }); a.equal(p.text.length, 2, 'no source line when empty');
    a.equal(compileOne('cosmos', 'big-number', { value: 1234567, label: 'L', suffix: '', reveal: 'particles' }).scenes[0].text[0].str, '1,234,567');
    a.equal(compileOne('cosmos', 'big-number', { value: -0.5, decimals: 2, label: 'L', suffix: '%', reveal: 'particles' }).scenes[0].text[0].str, '-0.50%');
    a.equal(compileOne('cosmos', 'big-number', { value: '62', label: 'L', reveal: 'particles' }).scenes[0].text[0].str, '62%', 'a numeric string is coerced by compile; % is the default suffix');
  });

  T.test('quote (13): curly-quoted statement (size 56, maxWidth 1300, y 470), who at y 700 / 2.2 s, role at y 745 / 2.5 s', function (a) {
    var s = compileOne('cosmos', 'quote', { quote: 'Be brief.', who: 'Someone', role: 'Somewhere' }).scenes[0];
    a.deepEqual(s.text, [{ str: '“Be brief.”', style: 'statement', size: 56, maxWidth: 1300, y: 470, reveal: 'letters' },
      { str: 'Someone', style: 'label', y: 700, at: 2.2 }, { str: 'Somewhere', style: 'caption', y: 745, at: 2.5 }]);
    a.equal(compileOne('cosmos', 'quote', { quote: 'Q', who: 'W' }).scenes[0].text.length, 2, 'no role line when empty');
  });

  T.test('three-points (14): a kicker at (160, 150), item k is step k+1; rows at y = 330 + k·170 with a 22-point ring at x 110; columns spread around x 960', function (a) {
    var items = [{ title: 'One', line: 'First point.' }, { title: 'Two', line: 'Second point.' }, { title: 'Three' }];
    var r = compileOne('cosmos', 'three-points', { kicker: 'K', items: items, layout: 'rows' }).scenes[0];
    a.deepEqual(r.text, [{ str: 'K', style: 'kicker', x: 160, y: 150, align: 'left' }]); a.equal(r.steps.length, 3, 'item k is step k+1');
    [0, 1, 2].forEach(function (k) {
      var st = r.steps[k], y = 330 + k * 170, ring = st.particles[0].points;
      a.equal(st.text[0].y, y, 'row ' + k + ' y'); a.equal(st.text[0].x, 160); a.equal(st.text[0].style, 'label');
      a.equal(ring.length, 22, 'a 22-point ring marker'); a.near(ring[0].x, 110 + 15, 1e-9);
    });
    a.equal(r.steps[0].text[1].size, 44); a.equal(r.steps[0].text[1].style, 'statement'); a.equal(r.steps[2].text.length, 1, 'no detail line when empty');
    var c = compileOne('cosmos', 'three-points', { items: items, layout: 'columns' }).scenes[0];
    a.deepEqual(c.steps.map(function (s) { return s.text[0].x; }), [400, 960, 1520], 'x = 960 + (k − (n−1)/2)·560'); a.equal(c.steps[0].text[1].maxWidth, 480);
    a.equal(c.text.length, 0, 'no kicker text when empty');
    var five = [1, 2, 3, 4, 5].map(function (n) { return { title: 'T' + n, line: 'Line ' + n }; });
    var r5 = compileOne('cosmos', 'three-points', { items: five }).scenes[0];
    a.ok(r5.steps[4].text[1].y + 22 < 1080, 'five rows stay on the screen');
    var c5 = compileOne('cosmos', 'three-points', { items: five, layout: 'columns' }).scenes[0];
    a.ok(c5.steps[0].text[0].x - c5.steps[0].text[1].maxWidth / 2 >= 100 && c5.steps[4].text[0].x + c5.steps[4].text[1].maxWidth / 2 <= 1820, 'five columns stay inside the margins');
  });

  T.test('logo (15): an image element with a particles reveal (sampled by alpha or luma, ≤ 3500 points) at y 470; the tagline sits 90 px under it at 2.6 s', function (a) {
    withAssets(function (aid) {
      var s = compileOne('cosmos', 'logo', { asset: 'logo', width: 900, tagline: 'Tag', mode: 'luma' }, null, null, aid).scenes[0];
      a.deepEqual(s.elements, [{ kind: 'image', id: 'logo', asset: 'logo', x: 960, y: 470, w: 900, h: 300, fit: 'contain', reveal: 'particles', sample: { mode: 'luma', maxPoints: 3500 } }], '1200 x 400 at 900 wide → 300 high');
      a.deepEqual(s.text, [{ str: 'Tag', style: 'subtitle', y: 470 + 150 + 90, reveal: 'letters', at: 2.6 }]);
      a.equal(s.motion.stagger, 'radial'); a.deepEqual(s.world, PD.theme.resolve('cosmos').shots.BLOOM);
      var tall = compileOne('cosmos', 'logo', { asset: 'photo', width: 1600 }, null, null, aid).scenes[0];      // 1600 x 900 at 1600 wide would be 900 high
      a.equal(tall.elements[0].h, 520, 'a tall logo is capped at 520 px so the tagline stays on the screen'); a.equal(tall.elements[0].w, Math.round(1600 * 520 / 900));
      a.equal(compileOne('cosmos', 'logo', { asset: 'nope' }, null, null, aid).scenes[0].elements[0].h, 360, 'an unknown asset assumes a 5:2 logo');
      var bad = compileOne('cosmos', 'logo', { asset: 'logo', mode: 'weird' }, null, null, aid).scenes[0];
      a.equal(bad.elements[0].sample.mode, 'alpha');
      a.ok(!('text' in bad) || bad.text.length === 0, 'no tagline when empty');
    });
  });

  T.test('image (16): cover sets the photo world with a 12 s push-in; contain draws a framed 1400 × 760 image; the caption sits at y 960', function (a) {
    withAssets(function (aid) {
      var cv = compileOne('cosmos', 'image', { asset: 'photo', caption: 'Cap', fit: 'cover', focusX: 0.2, focusY: 0.7, zoom: 1.2, dim: 0.4 }, null, null, aid).scenes[0];
      a.equal(cv.world.photo, 1); a.equal(cv.world.photoAsset, 'photo'); a.equal(cv.world.photoX, 0.2); a.equal(cv.world.photoY, 0.7); a.equal(cv.world.photoZoom, 1.2); a.equal(cv.world.photoDim, 0.4);
      a.deepEqual(cv.timing, { photoZoom: [12, 'linear'], photo: [1.2, 'inOutQuad'] });
      ['stars', 'nebulaAmount', 'backdrop', 'dust'].forEach(function (k) { a.equal(cv.world[k], 0, k + ' is off so the stars do not draw over the picture'); });
      a.ok(!('elements' in cv)); a.deepEqual(cv.text, [{ str: 'Cap', style: 'statement', y: 960, reveal: 'fade', at: 0.8 }]);
      var ct = compileOne('cosmos', 'image', { asset: 'photo', caption: '', fit: 'contain' }, null, null, aid).scenes[0];
      a.deepEqual(ct.elements, [{ kind: 'image', id: 'photo', asset: 'photo', x: 960, y: 540, w: 1400, h: 760, fit: 'contain', radius: 12, reveal: 'fade' }]);
      a.ok(!('photo' in ct.world) && !('timing' in ct), 'contain does not use the photo world'); a.equal(ct.text.length, 0);
      if (PD.theme.has('slate')) {
        var sl = compileOne('slate', 'image', { asset: 'photo', fit: 'cover' }, null, null, aid).scenes[0];
        a.ok(!('stars' in sl.world), 'no space params are added under a look that does not have them'); a.equal(sl.world.photo, 1);
      }
    });
  });

  T.test('template scenes keep the compile contract: id, notes, dwell, stepNotes, overrides, beat, energy and like', function (a) {
    var c = compileOne('cosmos', 'hyperspace', clone(PD.template.get('hyperspace').example), null,
      { notes: 'N', stepNotes: ['S1'], dwell: 9, stepDwell: [7], beat: 'zoom-out', energy: 5, overrides: { world: { warp: 0.5 }, text: null } });
    var s = c.scenes[0];
    a.equal(s.id, 's1'); a.equal(s.notes, 'N'); a.equal(s.dwell, 9); a.equal(s.like, 'hyperspace'); a.equal(s.beat, 'zoom-out'); a.equal(s.energy, 5);
    a.equal(s.steps[0].notes, 'S1'); a.equal(s.steps[0].dwell, 7); a.equal(s.world.warp, 0.5); a.ok(!('text' in s), 'overrides null deletes');
    a.equal(PD.template.get('hyperspace').story.energy, 5, 'and the scene energy defaults to the template\'s when unset');
  });
})();
