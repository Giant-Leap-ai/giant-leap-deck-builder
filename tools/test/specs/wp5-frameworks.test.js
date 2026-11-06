/* tools/test/specs/wp5-frameworks.test.js — story/frameworks (spec §6.2 framework data, §6.3 recommendation table).
 * The oracle tables below are typed from the spec, not read from the engine. */

// [id, roles, share, energy, required, min, max, first template…]
var WP5_FW = {
  'giant-leap': { turns: 1, beats: [
    ['spark', ['hook'], 0.05, 2, true, 1, 1, ['cold-open', 'statement', 'big-number']],
    ['name', ['identity'], 0.07, 4, true, 1, 1, ['brand-reveal', 'logo']],
    ['zoom-out', ['scale'], 0.10, 5, false, 0, 2, ['hyperspace', 'big-number', 'galaxy-reveal']],
    ['you-are-here', ['relevance'], 0.13, 3, true, 1, 2, ['galaxy-reveal', 'planet', 'statement']],
    ['human-truth', ['emotion'], 0.12, 4, true, 1, 2, ['sunrise', 'statement', 'quote', 'image']],
    ['pattern', ['proof'], 0.18, 3, true, 1, 3, ['timeline', 'three-points', 'big-number']],
    ['the-box', ['tension'], 0.12, 3, true, 1, 2, ['the-box', 'statement']],
    ['the-leap', ['turn'], 0.13, 5, true, 1, 1, ['pivot']],
    ['callback', ['callback', 'cta'], 0.10, 4, true, 1, 1, ['finale', 'statement']]] },
  sparkline: { turns: 2, beats: [
    ['what-is', ['hook', 'setup'], 0.08, 2, true, 1, 1, ['cold-open', 'big-number', 'statement']],
    ['could-be', ['turn'], 0.10, 4, true, 1, 1, ['sunrise', 'statement']],
    ['contrast', ['proof'], 0.50, 3, true, 2, 4, ['big-number', 'quote', 'three-points', 'statement']],
    ['call-to-action', ['turn', 'cta'], 0.15, 5, true, 1, 1, ['pivot', 'statement']],
    ['new-bliss', ['resolution', 'callback'], 0.17, 4, true, 1, 1, ['finale', 'sunrise', 'image']]] },
  psf: { turns: 1, beats: [
    ['hook', ['hook'], 0.08, 3, true, 1, 1, ['cold-open', 'big-number', 'image']],
    ['problem', ['tension'], 0.20, 3, true, 1, 2, ['statement', 'big-number', 'the-box']],
    ['insight', ['turn'], 0.12, 4, true, 1, 1, ['pivot', 'statement']],
    ['solution', ['idea'], 0.20, 5, true, 1, 2, ['brand-reveal', 'logo', 'image']],
    ['proof', ['proof'], 0.20, 3, true, 1, 3, ['big-number', 'quote', 'three-points']],
    ['future', ['resolution'], 0.12, 4, false, 0, 1, ['sunrise', 'statement', 'image']],
    ['ask', ['cta'], 0.08, 4, true, 1, 1, ['finale', 'statement']]] },
  scqa: { turns: 1, beats: [
    ['situation', ['hook', 'setup'], 0.10, 2, true, 1, 1, ['statement', 'big-number']],
    ['complication', ['tension'], 0.15, 3, true, 1, 1, ['big-number', 'the-box', 'statement']],
    ['question', ['setup'], 0.05, 3, false, 0, 1, ['statement']],
    ['answer', ['turn', 'idea'], 0.15, 5, true, 1, 1, ['pivot', 'statement']],
    ['support', ['proof'], 0.40, 3, true, 1, 3, ['three-points', 'big-number', 'quote']],
    ['ask', ['cta'], 0.15, 4, true, 1, 1, ['finale', 'statement']]] }
};

T.test('frameworks: the five frameworks are registered with the §6.2 beats, roles, shares, energies, limits and templates', function (a) {
  a.deepEqual(PD.framework.list(), ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']);
  Object.keys(WP5_FW).forEach(function (id) {
    var fw = PD.framework.get(id), want = WP5_FW[id];
    a.equal(fw.id, id); a.equal(fw.turns, want.turns, id + ' turns');
    a.ok(typeof fw.name === 'string' && fw.name && typeof fw.bestFor === 'string' && fw.bestFor, id + ' has a name and a bestFor');
    a.equal(fw.beats.length, want.beats.length, id + ' beat count');
    fw.beats.forEach(function (b, i) {
      var w = want.beats[i];
      a.deepEqual([b.id, b.roles, b.share, b.energy, b.required, b.min, b.max, b.templates], w, id + ' beat ' + i);
      a.ok(b.label && b.ask && b.example, id + '/' + b.id + ' has label, ask and example');
      a.ok(b.energy >= 1 && b.energy <= 5 && b.energy === (b.energy | 0));
    });
    var sum = fw.beats.reduce(function (s, b) { return s + b.share; }, 0);
    a.near(sum, 1, 1e-9, id + ' shares add up to 1');
  });
  var blank = PD.framework.get('blank');
  a.equal(blank.turns, null); a.deepEqual(blank.beats, []);
});

T.test('frameworks: spec ask / example texts for giant-leap (§6.2 F1) and the F2-F4 asks', function (a) {
  var gl = PD.framework.get('giant-leap').beats;
  a.equal(gl[0].ask, 'What tiny beginning does your story grow from?');
  a.equal(gl[0].example, 'Every giant leap begins with a single spark.');
  a.equal(gl[2].ask, "What's the biggest frame your topic lives in?");
  a.equal(gl[8].ask, 'Which opening image returns, changed, and what do they do now?');
  a.equal(PD.framework.get('sparkline').beats[2].ask, "What's true now, and what's possible?");
  a.equal(PD.framework.get('psf').beats[3].ask, 'Name your answer in three words.');
  a.equal(PD.framework.get('scqa').beats[5].ask, 'What decision do you need, from whom, by when?');
});

T.test('frameworks: registered objects are frozen data; framework() / frameworks() / beatIndex()', function (a) {
  var gl = PD.framework.get('giant-leap');
  a.ok(Object.isFrozen(gl) && Object.isFrozen(gl.beats) && Object.isFrozen(gl.beats[0]) && Object.isFrozen(gl.beats[0].roles));
  a.equal(PD.story.framework('psf'), PD.framework.get('psf'));
  a.equal(PD.story.framework('nope'), null); a.equal(PD.story.framework(null), null);
  a.deepEqual(PD.story.frameworks().map(function (f) { return f.id; }), ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']);
  a.equal(PD.story.beatIndex(gl, 'the-leap'), 7); a.equal(PD.story.beatIndex(gl, 'x'), -1); a.equal(PD.story.beatIndex(null, 'x'), -1);
  a.throws(function () { PD.framework('giant-leap', {}); }, /registered twice/);
});

T.test('recommend: the §6.3 table, first match wins (every row, and the fall-through)', function (a) {
  var R = PD.story.recommend;
  function is(story, rec, alt) { var r = R(story); a.equal(r.id, rec, JSON.stringify(story) + ' recommends'); a.equal(r.runnerUp, alt, JSON.stringify(story) + ' runner-up'); }
  is({ goal: 'decide' }, 'scqa', 'psf');
  is({ goal: 'decide', tone: 'cinematic' }, 'scqa', 'psf');
  is({ goal: 'launch', tone: 'warm' }, 'psf', 'sparkline');
  is({ goal: 'update' }, 'scqa', 'psf');
  is({ goal: 'teach', tone: 'cinematic' }, 'psf', 'scqa');
  is({ goal: 'inspire', tone: 'cinematic' }, 'giant-leap', 'sparkline');
  is({ goal: 'inspire', tone: 'warm' }, 'sparkline', 'giant-leap');
  is({ goal: 'inspire', tone: null }, 'sparkline', 'giant-leap');
  is({ goal: 'inspire' }, 'sparkline', 'giant-leap');
  is({ goal: 'persuade', tone: 'cinematic' }, 'sparkline', 'giant-leap');
  is({ goal: 'persuade' }, 'sparkline', 'giant-leap');
  is({ goal: null, tone: 'cinematic' }, 'sparkline', 'giant-leap');
  is({}, 'sparkline', 'giant-leap'); is(null, 'sparkline', 'giant-leap');
  a.equal(PD.story.RECOMMEND.length, 7);
  a.equal(R({ goal: 'launch' }).row, PD.story.RECOMMEND[1]);
});

T.test('frameworks: the F2-F4 examples speak to a small business, not an AI consultancy (giant-leap keeps One Giant Leap\'s own lines)', function (a) {
  ['sparkline', 'psf', 'scqa'].forEach(function (id) {
    PD.framework.get(id).beats.forEach(function (b) {
      a.ok(!/\bAI\b|augment|automat|workflow|co-pilot|licen[cs]e|hand-off|headcount|copy-past/i.test(b.example), id + '/' + b.id + ': ' + b.example);
    });
  });
  a.ok(PD.story.startsImperative(PD.framework.get('scqa').beats[5].example) && PD.story.startsImperative(PD.framework.get('psf').beats[6].example) &&
    PD.story.startsImperative(PD.framework.get('sparkline').beats[3].example), 'the ask examples start with a verb the brief accepts');
  a.equal(PD.framework.get('giant-leap').beats[7].example, 'Not automation. → Augmentation.');
});

T.test('recommend: a slot shorter than the shape\'s smallest board hands the pick to the runner-up when that one is smaller (review: 3 and 5 minutes got giant-leap)', function (a) {
  var R = PD.story.recommend, three = [{ kind: 'number', text: 'x', value: 1 }, { kind: 'quote', text: 'y' }, { kind: 'story', text: 'z' }];
  a.deepEqual([PD.story.minScenes(PD.framework.get('giant-leap'), {}), PD.story.minScenes(PD.framework.get('sparkline'), {}), PD.story.minScenes(PD.framework.get('psf'), {}), PD.story.minScenes(PD.framework.get('scqa'), {})], [8, 6, 6, 5]);
  a.deepEqual([PD.story.minScenes(PD.framework.get('giant-leap'), { proof: three }), PD.story.minScenes(PD.framework.get('sparkline'), { proof: three })], [10, 7], 'a proof beat makes room for every proof row');
  function is(story, rec, alt, slot) { var r = R(story); a.deepEqual([r.id, r.runnerUp, !!r.slot], [rec, alt, slot], JSON.stringify(story)); }
  is({ goal: 'inspire', tone: 'cinematic', targetMin: 5 }, 'sparkline', 'giant-leap', true);
  is({ goal: 'inspire', tone: 'cinematic', targetMin: 3 }, 'sparkline', 'giant-leap', true);
  is({ goal: 'inspire', tone: 'cinematic', targetMin: 7 }, 'giant-leap', 'sparkline', false);
  is({ goal: 'inspire', tone: 'cinematic', targetMin: 7, proof: three }, 'sparkline', 'giant-leap', true);
  is({ goal: 'inspire', tone: 'cinematic', targetMin: 10, proof: three }, 'giant-leap', 'sparkline', false);
  is({ goal: 'inspire', tone: 'cinematic', targetMin: null }, 'giant-leap', 'sparkline', false);
  is({ goal: 'teach', targetMin: 4 }, 'scqa', 'psf', true);
  is({ goal: 'launch', targetMin: 3 }, 'psf', 'sparkline', false);
  is({ goal: 'decide', targetMin: 3 }, 'scqa', 'psf', false);
  a.equal(PD.story.pickText({ goal: 'inspire', tone: 'cinematic', targetMin: 5 }), "Here's the shape we'd suggest. One Giant Leap needs more than 5 minutes, so What is / what could be fits your slot better.");
  a.ok(PD.story.pickText({ goal: 'inspire', tone: 'cinematic', targetMin: 5 }, 'giant-leap').indexOf('vision keynotes') > 0, 'the chosen shape explains itself as usual');
});

T.test('recommend: the default look follows the tone, and fw.pick explains the choice', function (a) {
  a.equal(PD.story.defaultTheme('cinematic'), 'cosmos');
  ['warm', 'crisp', 'playful', null, undefined].forEach(function (t) { a.equal(PD.story.defaultTheme(t), 'slate', String(t)); });
  var s = { goal: 'launch', targetMin: 10 };
  a.equal(PD.story.pickText(s), "Here's the shape we'd suggest. You want to launch in 10 minutes, and Problem, solution, future is built for launches and proposals.");
  a.equal(PD.story.pickText({ goal: 'launch' }), "Here's the shape we'd suggest. Problem, solution, future is built for launches and proposals.", 'no slot: the minutes clause is dropped');
  a.ok(PD.story.pickText(s, 'scqa').indexOf('executive briefings') > 0, 'the chosen framework, not the recommended one');
  a.equal(PD.story.pickText(s, 'nope'), '');
});

T.test('frameworks: energyCurve is each beat\'s energy at the midpoint of its share; idealEnergy interpolates', function (a) {
  var gl = PD.framework.get('giant-leap'), c = PD.story.energyCurve(gl);
  a.equal(c.length, 9);
  a.near(c[0].mid, 0.025, 1e-12); a.equal(c[0].energy, 2);
  a.near(c[1].mid, 0.05 + 0.035, 1e-12);
  a.near(c[8].mid, 0.9 + 0.05, 1e-12); a.equal(c[8].energy, 4);
  var ideal = PD.story.idealEnergy;
  a.equal(ideal(gl, 0), 2, 'flat before the first midpoint');
  a.equal(ideal(gl, 1), 4, 'flat after the last');
  a.near(ideal(gl, c[2].mid), 5, 1e-12, 'at a midpoint');
  a.near(ideal(gl, (c[1].mid + c[2].mid) / 2), 4.5, 1e-9, 'halfway between name (4) and zoom-out (5)');
  a.equal(ideal(PD.framework.get('blank'), 0.5), 3, 'no beats: flat 3');
  a.deepEqual(PD.story.energyCurve(PD.framework.get('blank')), []);
});

T.test('frameworks: every template id a beat lists exists in the catalog (stub catalog always; the real WP4 catalog when it has landed)', function (a) {
  return wp5Fresh().then(function (K) {
    function check(reg, label) {
      K.framework.list().forEach(function (id) {
        K.framework.get(id).beats.forEach(function (b) {
          a.ok(b.templates.length >= 1, id + '/' + b.id + ' lists a template');
          b.templates.forEach(function (t) { a.ok(reg.has(t), label + ': ' + id + '/' + b.id + ' names "' + t + '"'); });
          a.ok(b.templates.some(function (t) { var d = reg.get(t); return d && d.requires && d.requires.worlds.length === 0; }),
            label + ': ' + id + '/' + b.id + ' has an adaptive template');
        });
      });
    }
    check(K.template, 'stub');
    if (PD.template.list().length >= 16) check(PD.template, 'real catalog');
    else a.ok(true, 'real catalog not landed: only the stub catalog was checked');
  });
});
