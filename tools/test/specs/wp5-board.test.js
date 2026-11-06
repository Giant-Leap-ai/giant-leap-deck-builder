/* tools/test/specs/wp5-board.test.js — story/board (spec §6.5; WP5 acceptance #3).
 * The acceptance tests run twice (wp5Each): on the fresh engine with the stub §5 catalog (so the story code is pinned to the
 * spec's table and does not move with WP4's templates) and on the real engine with the real WP4 catalog and WP3's slate. */

var WP5_NAMED = ['{brand}', '{tagline}', '{bigIdea}', '{shortIdea}', '{oldWay}', '{newWay}', '{ask}', '{audience}', '{proof1}', '{proof2}', '{proof3}'];
var WP5_THEME_WORLDS = { cosmos: ['core', 'cosmos', 'planet', 'spark', 'photo'], slate: ['core', 'ambient', 'photo', 'spark'] };

function wp5Expected(fw, targetMin, proofs) {   // the §6.5 invariants (n, minimums, caps), not the allocation algorithm
  var R = 0, cap = 0, left = proofs || 0;      // a proof beat starts with a scene per proof row, up to its max (no proof is dropped)
  fw.beats.forEach(function (b) {
    var base = b.required ? Math.max(1, b.min) : b.min;
    if (b.roles.indexOf('proof') >= 0 && left > 0) { base = Math.max(base, Math.min(b.max, left)); left -= base; }
    R += base; cap += b.max;
  });
  var n = targetMin == null ? R : Math.max(R, Math.min(24, Math.round(targetMin * 60 / 50)));
  return { R: R, cap: cap, n: Math.min(n, cap) };
}
function wp5BoardDeck(K, scenes, theme, story) {
  return K.compile({ format: 2, id: 'wp5-board', meta: { title: 'b', theme: theme, story: story }, scenes: scenes });
}
function wp5NeedWorlds(K, id, props) {      // what a template needs: requires.worlds + requires.worldsFor(props)
  var req = K.template.get(id).requires || {}, need = (req.worlds || []).slice();
  if (typeof req.worldsFor === 'function') need = need.concat(req.worldsFor(props) || []);
  return need;
}
function wp5Speak(v) {                       // the speaker's own words in place of every {…} that is left (what the Studio asks them for)
  if (typeof v === 'string') return v.replace(/\{[^{}]{1,40}\}/g, 'Their own words');
  if (Array.isArray(v)) return v.map(wp5Speak);
  if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = wp5Speak(v[k]); }); return o; }
  return v;
}
function wp5Unnamed(v) {                     // the {…} of a value that are not one of the named tokens
  return PD.story.placeholders(v).filter(function (tok) { return WP5_NAMED.indexOf(tok) < 0; });
}
function wp5Eligible(K, b, worlds) {         // AMEND-10 oracle: the beat's templates the look supports, minus the ones that need an asset
  return b.templates.filter(function (tid) {
    var seed = K.template.get(tid).seed || {};
    if (Object.prototype.hasOwnProperty.call(seed, 'asset')) return false;
    return wp5NeedWorlds(K, tid, seed).every(function (w) { return worlds.indexOf(w) >= 0; });
  });
}

wp5Each('board: scene counts follow §6.5 for every framework x targetMin x theme (acceptance #3)', function (a, K) {
  var checked = 0;
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    var fw = K.framework.get(id);
    [3, 10, 20, null].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + ' / ' + t + ' min / ' + th;
        var scenes = K.story.board(wp5Story({ framework: id, targetMin: t }), { theme: th });
        var want = wp5Expected(fw, t, 3);
        a.equal(scenes.length, want.n, label + ': scene count');
        a.equal(K.story.board(wp5Story({ framework: id, targetMin: t, proof: [] }), { theme: th }).length, wp5Expected(fw, t, 0).n, label + ': no proofs, §6.5 literally');
        // every beat inside its limits, beats in framework order, scenes of a beat consecutive
        var byBeat = {}, order = [];
        scenes.forEach(function (s) { byBeat[s.beat] = (byBeat[s.beat] || 0) + 1; if (order[order.length - 1] !== s.beat) order.push(s.beat); });
        a.deepEqual(order, fw.beats.map(function (b) { return b.id; }).filter(function (b) { return byBeat[b]; }), label + ': beat order, one run per beat');
        fw.beats.forEach(function (b) {
          var got = byBeat[b.id] || 0, base = b.required ? Math.max(1, b.min) : b.min;
          if (b.roles.indexOf('proof') >= 0) base = Math.max(base, Math.min(b.max, 3));
          a.ok(got >= base && got <= b.max, label + ': ' + b.id + ' has ' + got + ' (' + base + '..' + b.max + ')');
        });
        // every proof row of the brief has a scene of its own (the third, often the story, used to be dropped silently)
        a.equal(scenes.filter(function (s) { return /^(big-number|quote|statement)$/.test(s.template) && fw.beats.filter(function (b) { return b.id === s.beat; })[0].roles.indexOf('proof') >= 0; }).length >= 3, true, label + ': three proof scenes');
        // ids are beatId, beatId-2, ...; all unique
        var seen = {};
        scenes.forEach(function (s) {
          var nth = (seen[s.beat] = (seen[s.beat] || 0) + 1);
          a.equal(s.id, nth === 1 ? s.beat : s.beat + '-' + nth, label + ': id');
        });
        // every template the board picks exists and is available in the theme
        a.deepEqual(['core'].concat(K.theme.resolve(th).worlds).sort(), WP5_THEME_WORLDS[th].slice().sort(), label + ': the look has the worlds this test assumes');
        scenes.forEach(function (s) {
          a.ok(K.template.get(s.template), label + ': ' + s.template + ' is registered');
          wp5NeedWorlds(K, s.template, s.props).forEach(function (w) { a.ok(WP5_THEME_WORLDS[th].indexOf(w) >= 0, label + ': ' + s.template + ' needs ' + w); });
        });
        checked++;
      });
    });
  });
  a.equal(checked, 32);
});

T.test('board: known allocations (largest remainder inside [min, max], ties to the earlier beat)', function (a) {
  return wp5Fresh().then(function (K) {
    // §6.5 literally: a story with no proof rows (the proofs only ever raise a proof beat's start, tested after these)
    function counts(id, t, proof) { var o = {}; K.story.board(wp5Story({ framework: id, targetMin: t, proof: proof || [] }), { theme: 'cosmos' }).forEach(function (s) { o[s.beat] = (o[s.beat] || 0) + 1; }); return o; }
    a.deepEqual(counts('giant-leap', 3), { spark: 1, name: 1, 'you-are-here': 1, 'human-truth': 1, pattern: 1, 'the-box': 1, 'the-leap': 1, callback: 1 }, '3 min: n = R = 8, the optional beat is empty');
    a.deepEqual(counts('giant-leap', null), counts('giant-leap', 3), 'unknown slot: n = R');
    a.deepEqual(counts('giant-leap', 10), { spark: 1, name: 1, 'zoom-out': 1, 'you-are-here': 2, 'human-truth': 2, pattern: 2, 'the-box': 1, 'the-leap': 1, callback: 1 }, '10 min: 12 scenes');
    a.deepEqual(counts('giant-leap', 20), { spark: 1, name: 1, 'zoom-out': 2, 'you-are-here': 2, 'human-truth': 2, pattern: 3, 'the-box': 2, 'the-leap': 1, callback: 1 }, '20 min: capped by the beats\' maxima (15)');
    a.deepEqual(counts('sparkline', 3), { 'what-is': 1, 'could-be': 1, contrast: 2, 'call-to-action': 1, 'new-bliss': 1 });
    a.deepEqual(counts('sparkline', 10), { 'what-is': 1, 'could-be': 1, contrast: 4, 'call-to-action': 1, 'new-bliss': 1 });
    a.deepEqual(counts('scqa', 3), { situation: 1, complication: 1, answer: 1, support: 1, ask: 1 }, 'the optional question beat stays empty');
    a.deepEqual(counts('psf', 10), { hook: 1, problem: 2, insight: 1, solution: 2, proof: 3, future: 1, ask: 1 }, 'psf: 11 fit, the spare scene goes to the largest remainder with room (proof)');
    // with proof rows, a proof beat starts with one scene per row (up to its max), so R grows with them and no proof is dropped
    var three = wp5Story().proof;
    a.deepEqual(counts('giant-leap', 3, three), { spark: 1, name: 1, 'you-are-here': 1, 'human-truth': 1, pattern: 3, 'the-box': 1, 'the-leap': 1, callback: 1 }, '3 min, 3 proofs: R = 10');
    a.deepEqual(counts('sparkline', 5, three), { 'what-is': 1, 'could-be': 1, contrast: 3, 'call-to-action': 1, 'new-bliss': 1 }, '5 min, 3 proofs: the third contrast scene (it was dropped)');
    a.deepEqual(counts('sparkline', 5, three.slice(0, 1)), counts('sparkline', 5), 'one proof: contrast keeps its own minimum of 2');
    a.deepEqual(counts('giant-leap', 10, three), { spark: 1, name: 1, 'zoom-out': 1, 'you-are-here': 2, 'human-truth': 1, pattern: 3, 'the-box': 1, 'the-leap': 1, callback: 1 }, '10 min, 3 proofs: still 12 scenes');
    a.deepEqual(K.story.baseCounts(K.framework.get('psf'), { proof: three }), { hook: 1, problem: 1, insight: 1, solution: 1, proof: 3, future: 0, ask: 1 });
    a.equal(K.story.minScenes(K.framework.get('scqa'), { proof: three.slice(0, 2) }), 6);
    var gl = K.framework.get('giant-leap');
    a.equal(K.story.board.plan(wp5Story({ framework: 'giant-leap', targetMin: 90 }), gl).n, 15, '90 min: 24 scenes asked, 15 fit');
    a.deepEqual(K.story.board.plan({ targetMin: 10 }, K.framework.get('blank')), { n: 0, asked: 12, required: 0, counts: {}, capacity: 0 });
    a.deepEqual([K.story.board.plan(wp5Story({ framework: 'giant-leap', targetMin: 3 }), gl).required, K.story.board.plan(wp5Story({ framework: 'giant-leap', targetMin: 3 }), gl).asked], [10, 10], 'three proofs: R = 8 + 2');
    // plan() says how many scenes the slot asks for next to how many the framework holds, so the Studio can tell the user
    function pl(id, t) { var p = K.story.board.plan(wp5Story({ framework: id, targetMin: t, proof: [] }), K.framework.get(id)); return [p.asked, p.n, p.capacity]; }
    a.deepEqual(pl('giant-leap', 20), [24, 15, 15]); a.deepEqual(pl('giant-leap', 10), [12, 12, 15]); a.deepEqual(pl('giant-leap', null), [8, 8, 15]);
    a.deepEqual(pl('sparkline', 10), [12, 8, 8]); a.deepEqual(pl('sparkline', 20), [24, 8, 8]); a.deepEqual(pl('psf', 10), [12, 11, 11]); a.deepEqual(pl('scqa', 10), [12, 8, 8]);
    a.deepEqual(pl('giant-leap', 3), [8, 8, 15], '3 min asks for 4 scenes: the 8 required beats come first');
    a.deepEqual(pl('giant-leap', 120), [24, 15, 15], 'never more than 24 asked');
  });
});

T.test('board: the blank framework starts an empty storyboard; framework and theme can be given as ids or objects; a missing theme throws', function (a) {
  return wp5Fresh().then(function (K) {
    a.deepEqual(K.story.board(wp5Story({ framework: 'blank' }), { theme: 'cosmos' }), []);
    a.deepEqual(K.story.board(wp5Story(), { framework: 'blank', theme: 'cosmos' }), [], 'opts.framework wins over story.framework');
    var st = wp5Story({ framework: 'scqa' });
    var viaId = K.story.board(st, { framework: 'psf', theme: 'cosmos' }), viaObj = K.story.board(st, { framework: K.framework.get('psf'), theme: 'cosmos' });
    a.deepEqual(viaObj, viaId);
    a.deepEqual(K.story.board(wp5Story({ framework: undefined, goal: 'launch', tone: 'warm' }), { theme: 'cosmos' }).map(function (s) { return s.beat; }).slice(0, 2), ['hook', 'problem'], 'no framework: the recommended one for the goal');
    var resolved = K.story.board(st, { theme: K.theme.resolve('slate') }), byObj = K.story.board(st, { theme: { worlds: ['ambient', 'photo', 'spark'] } });
    a.deepEqual(byObj, resolved); a.deepEqual(resolved, K.story.board(st, { theme: 'slate' }));
    a.throws(function () { K.story.board(st, { theme: 'no-such-look' }); }, /theme "no-such-look" is not registered/);
    var extra = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10 }), { theme: { worlds: ['spark'] }, worlds: ['cosmos', 'planet'] });
    a.equal(extra[2].template, 'hyperspace', 'opts.worlds adds worlds (meta.worlds)');
  });
});

wp5Each('board: a beat\'s first scene is the first of its list that the theme supports, later scenes rotate through the next ones (AMEND-10; cosmos keeps the cosmic ones, slate swaps in adaptive ones)', function (a, K) {
  function tpls(th) { return K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, proof: [] }), { theme: th }).map(function (s) { return s.beat + ':' + s.template; }); }
  // AMEND-10: scene 2 of a beat is the beat's next eligible template, so a beat is not the same shot twice; galaxy -> planet
  // -> sunrise is the seam One Giant Leap itself uses (no vis.teleport)
  a.deepEqual(tpls('cosmos'), ['spark:cold-open', 'name:brand-reveal', 'zoom-out:hyperspace', 'you-are-here:galaxy-reveal', 'you-are-here:planet',
    'human-truth:sunrise', 'human-truth:statement', 'pattern:timeline', 'pattern:three-points', 'the-box:the-box', 'the-leap:pivot', 'callback:finale']);
  // slate: you-are-here has only statement (galaxy-reveal and planet need cosmos), human-truth rotates statement -> quote
  a.deepEqual(tpls('slate'), ['spark:cold-open', 'name:brand-reveal', 'zoom-out:big-number', 'you-are-here:statement', 'you-are-here:statement',
    'human-truth:statement', 'human-truth:quote', 'pattern:timeline', 'pattern:three-points', 'the-box:the-box', 'the-leap:pivot', 'callback:finale']);
  // more scenes than eligible templates: the rotation cycles (psf/20: proof has 3 scenes, three templates; the-box 2 of 2)
  var gl20 = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 20, proof: [] }), { theme: 'cosmos' }).map(function (s) { return s.id + ':' + s.template; });
  a.deepEqual(gl20, ['spark:cold-open', 'name:brand-reveal', 'zoom-out:hyperspace', 'zoom-out-2:big-number', 'you-are-here:galaxy-reveal', 'you-are-here-2:planet',
    'human-truth:sunrise', 'human-truth-2:statement', 'pattern:timeline', 'pattern-2:three-points', 'pattern-3:big-number', 'the-box:the-box', 'the-box-2:statement',
    'the-leap:pivot', 'callback:finale']);
  var spark10 = K.story.board(wp5Story({ framework: 'sparkline', targetMin: 10, proof: [] }), { theme: 'slate' }).filter(function (s) { return s.beat === 'contrast'; }).map(function (s) { return s.template; });
  a.deepEqual(spark10, ['big-number', 'quote', 'three-points', 'statement'], 'sparkline contrast: four scenes, four templates (it used to be big-number four times, a pace.flatline)');
  // a theme without the spark world cannot open on cold-open
  var noSpark = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3 }), { theme: { worlds: ['ambient', 'photo'] } });
  a.equal(noSpark[0].template, 'statement', 'cold-open needs spark: the next in the list');
  // only the default look differs with the tone
  a.equal(K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, tone: 'cinematic' }))[2].template, 'hyperspace');
  a.equal(K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, tone: 'warm' }))[2].template, 'big-number');
});

wp5Each('board: with no proof and no assets, scene j of a beat is eligible[j mod n]: the beat\'s templates the theme satisfies, minus those needing an asset; a beat with one such template alternates it with statement (independent reading of §6.5 step 4 + AMEND-10, all frameworks x looks x slots)', function (a, K) {
  var checked = 0, rotated = 0, alternated = 0;
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    var fw = K.framework.get(id);
    [3, 10, 20].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + '/' + t + '/' + th, worlds = ['core'].concat(K.theme.resolve(th).worlds);
        var scenes = K.story.board(wp5Story({ framework: id, targetMin: t, proof: [] }), { theme: th });
        fw.beats.forEach(function (b) {
          var E = wp5Eligible(K, b, worlds);
          a.ok(E.length >= 1, label + ' ' + b.id + ': every beat has an eligible template');
          var single = E.length === 1 && E[0] !== 'statement';      // one shot only: the adaptive statement comes between its repeats
          scenes.filter(function (sc) { return sc.beat === b.id; }).forEach(function (sc, j) {
            var want = single ? (j % 2 ? 'statement' : E[0]) : E[j % E.length];
            a.equal(sc.template, want, label + ' ' + sc.id + ': ' + (single ? 'alternating ' + E[0] + ' and statement' : 'eligible[' + j + ' mod ' + E.length + '] of ' + E.join(',')));
            a.ok(K.template.get(sc.template) && !Object.prototype.hasOwnProperty.call(K.template.get(sc.template).seed, 'asset'), label + ' ' + sc.id + ': no asset template without an asset');
            if (j > 0 && (E.length > 1 || single)) { a.ok(sc.template !== scenes[scenes.indexOf(sc) - 1].template, label + ' ' + sc.id + ': not the same shot again'); rotated++; if (single) alternated++; }
            checked++;
          });
        });
      });
    });
  });
  a.ok(checked > 150, 'scenes checked: ' + checked);
  a.ok(rotated > 20, 'later scenes that rotated: ' + rotated);
  a.ok(alternated >= 4, 'one-template beats that took statement next (psf solution, slate zoom-out): ' + alternated);
});

wp5Each('board: named tokens fill the seeds ({brand} {tagline} {shortIdea} {oldWay} {newWay} {ask} …); other {…} stay visible', function (a, K) {
  var scenes = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10 }), { theme: 'cosmos' });
  var by = function (id) { return scenes.filter(function (s) { return s.id === id; })[0]; };
  a.deepEqual(by('name').props, { title: 'Acme', subtitle: 'Work, but human' });
  a.deepEqual(by('callback').props, { title: 'Acme', subtitle: 'Book a pilot' });
  a.deepEqual(by('the-leap').props, { kicker: 'The turn', from: 'Not automation.', to: 'Augmentation.', subtitle: 'Augmentation, not automation' }, '{newWay} at the start of a string gets a capital');
  a.deepEqual(by('the-box').props, { line: 'Automation was built for a world that is gone.', escape: 'Outside', subtitle: 'is where augmentation lives' });
  a.deepEqual(by('spark').props, { line: '{opening line}' }, 'an unnamed placeholder stays');
  a.deepEqual(by('zoom-out').props, { lines: ['{a big number}', '{an even bigger one}'] });
  // an empty answer leaves its token
  var blank = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, brand: '', tagline: '  ', shortIdea: '', oldWay: '', newWay: '', ask: '' }), { theme: 'cosmos' });
  var bl = function (id) { return blank.filter(function (s) { return s.id === id; })[0]; };
  a.deepEqual(bl('name').props, { title: '{brand}', subtitle: '{tagline}' });
  a.deepEqual(bl('the-leap').props, { kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' });
  a.deepEqual(bl('callback').props, { title: '{brand}', subtitle: '{ask}' });
  // a trailing full stop of the answer is dropped before the seed's own
  var dots = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3, oldWay: 'Automation.', newWay: 'augmentation!' }), { theme: 'cosmos' });
  a.equal(dots.filter(function (s) { return s.beat === 'the-leap'; })[0].props.from, 'Not Automation.');
  a.equal(dots.filter(function (s) { return s.beat === 'the-leap'; })[0].props.to, 'Augmentation.');
  // the registered seed is never shared or modified
  var seed = K.template.get('pivot').seed;
  a.deepEqual(seed, { kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' });
  by('the-leap').props.kicker = 'changed';
  a.equal(K.template.get('pivot').seed.kicker, 'The turn');
  a.deepEqual(K.story.board.tokens(wp5Story()), { brand: 'Acme', tagline: 'Work, but human', bigIdea: wp5Story().bigIdea, shortIdea: 'Augmentation, not automation',
    oldWay: 'automation', newWay: 'augmentation', ask: 'Book a pilot', audience: 'operations leads', proof1: 'hours saved each week', proof2: 'It changed how we work', proof3: 'A Leeds team shipped in a day' });
  a.deepEqual(K.story.board.fill({ a: ['{x} {y}', 'say {x}'], b: 3 }, { x: 'one' }), { a: ['One {y}', 'say one'], b: 3 }, 'deep copy; a token at the start of a string is capitalised');
  // the capital never changes how a name is written: {brand} and {tagline} stay as typed, and so does a first word with a capital in it
  var cased = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3, brand: 'eBay', tagline: 'iPhone repairs, done fast', oldWay: 'iPads', newWay: 'augmentation', ask: 'pilot one workflow' }), { theme: 'cosmos' });
  var cs = function (beat) { return cased.filter(function (s) { return s.beat === beat; })[0].props; };
  a.deepEqual(cs('name'), { title: 'eBay', subtitle: 'iPhone repairs, done fast' }, 'brand and tagline as typed on the hero title');
  a.deepEqual(cs('callback'), { title: 'eBay', subtitle: 'Pilot one workflow' }, 'the brand again; an all-lower-case ask still gets its capital');
  a.equal(cs('the-box').line, 'iPads was built for a world that is gone.', '"iPads" is not turned into "IPads"');
  a.equal(cs('the-leap').to, 'Augmentation.');
  var lower = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3, brand: 'acme', tagline: 'work, but human' }), { theme: 'cosmos' });
  a.deepEqual(lower[1].props, { title: 'acme', subtitle: 'work, but human' }, 'a lower-case brand is a choice: kept');
  // inside a sentence ("Not {oldWay}.", "is where {newWay} lives") an answer typed in sentence case loses its capital; a single
  // word, a capitalised name and a word of the brand stay as typed
  var F = K.story.board.fill;
  a.equal(F('Not {oldWay}.', { oldWay: 'Wholesale means stale bread' }), 'Not wholesale means stale bread.', 'the review\'s "Not Wholesale means…"');
  a.equal(F('Not {oldWay}.', { oldWay: 'Stale bread' }), 'Not stale bread.');
  a.equal(F('is where {newWay} lives', { newWay: 'Fresh local bread' }), 'is where fresh local bread lives');
  a.equal(F('Not {oldWay}.', { oldWay: 'Excel' }), 'Not Excel.', 'one word may be a name');
  a.equal(F('Not {oldWay}.', { oldWay: 'Google Sheets' }), 'Not Google Sheets.', 'a capitalised name');
  a.equal(F('Not {oldWay}.', { oldWay: 'AI tools' }), 'Not AI tools.', 'all caps');
  a.equal(F('Not {oldWay}.', { oldWay: 'Crumb bakes', brand: 'Crumb & Co' }), 'Not Crumb bakes.', 'a word of the brand');
  a.equal(F('{oldWay} was built for a world that is gone.', { oldWay: 'stale bread' }), 'Stale bread was built for a world that is gone.', 'the start of a string still gets its capital');
  a.deepEqual(K.story.board.fill(['{oldWay}', '{oldWay}', '{brand} {x}'], { oldWay: 'AI-first teams', brand: 'iRobot', x: 'y' }), ['AI-first teams', 'AI-first teams', 'iRobot y']);
});

wp5Each('board: notes are the beat\'s question as a prompt, point = label: ask, beat = the beat id; the first scene also says the big idea', function (a, K) {
  var fw = K.framework.get('giant-leap'), st = wp5Story({ framework: 'giant-leap', targetMin: 3 });
  K.story.board(st, { theme: 'cosmos' }).forEach(function (s, i) {
    var b = fw.beats.filter(function (x) { return x.id === s.beat; })[0];
    a.equal(s.notes, '▸ ' + b.ask + (i === 0 ? '\n' + st.bigIdea : '')); a.equal(s.point, b.label + ': ' + b.ask); a.equal(s.beat, b.id);
    a.deepEqual(Object.keys(s).sort(), ['beat', 'id', 'notes', 'point', 'props', 'template']);
    a.equal(K.story.speech(s.notes), i === 0 ? st.bigIdea : '', i === 0 ? 'the big idea is words to say, from the first scene on' : 'the prompt is not speech');
  });
  var none = K.story.board(wp5Story({ framework: 'psf', targetMin: 3, bigIdea: '  ' }), { theme: 'slate' });
  a.equal(none[0].notes, '▸ ' + K.framework.get('psf').beats[0].ask, 'no big idea: the prompt only');
});

wp5Each('board: proof-role beats consume story.proof in order (number -> big-number, quote -> quote, story / demo -> statement)', function (a, K) {
  var s = K.story.board(wp5Story({ framework: 'psf', targetMin: 20 }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'proof'; });
  a.equal(s.length, 3);
  a.deepEqual([s[0].template, s[0].props], ['big-number', { suffix: '', value: 12, label: 'hours saved each week' }], 'no unit given: no suffix (not the template\'s default %)');
  a.deepEqual([s[1].template, s[1].props], ['quote', { quote: 'It changed how we work', who: 'Sam Lee' }]);
  a.deepEqual([s[2].template, s[2].props], ['statement', { line: 'A Leeds team shipped in a day' }]);
  var demo = K.story.board(wp5Story({ framework: 'scqa', targetMin: 3, proof: [{ kind: 'demo', text: 'Live demo of the console' }] }), { theme: 'slate' }).filter(function (x) { return x.beat === 'support'; });
  a.deepEqual([demo[0].template, demo[0].props], ['statement', { line: 'Live demo of the console' }]);
  // a number row with words but no number has no number to show: a statement with its words, never a made-up 0 (the brief
  // asks for the number: q.proof.value); a number with no words keeps the seed's prompt; a quote without who keeps {who}
  var odd = K.story.board(wp5Story({ framework: 'scqa', targetMin: 20, proof: [{ kind: 'number', text: 'fewer hand-offs' }, { kind: 'quote', text: 'Nice' }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'support'; });
  a.deepEqual([odd[0].template, odd[0].props], ['statement', { line: 'fewer hand-offs' }]); a.deepEqual(odd[1].props, { quote: 'Nice', who: '{who}' });
  a.equal(odd[2].template, 'three-points', 'out of proof: the first of the beat\'s templates it has not used yet');
  var bare = K.story.board(wp5Story({ framework: 'scqa', targetMin: 3, proof: [{ kind: 'number', text: '', value: 62 }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'support'; });
  a.deepEqual([bare[0].template, bare[0].props], ['big-number', { suffix: '', value: 62, label: '{what the number means}' }]);
  a.deepEqual(K.story.board(wp5Story({ framework: 'scqa', targetMin: 3, proof: [{ kind: 'number', text: 'saved', value: '7' }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'support'; })[0].props,
    { suffix: '', value: 7, label: 'saved' }, 'a numeric string is a value');
  // the unit: a leading % (or "percent") is the suffix, words that start with "of" read as a share, anything else has no suffix
  var unit = function (text) { return K.story.board(wp5Story({ framework: 'scqa', targetMin: 3, proof: [{ kind: 'number', text: text, value: 9 }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'support'; })[0].props; };
  a.deepEqual(unit('% of hours lost to meetings'), { suffix: '%', value: 9, label: 'of hours lost to meetings' });
  a.deepEqual(unit('percent fewer hand-offs'), { suffix: '%', value: 9, label: 'fewer hand-offs' });
  a.deepEqual(unit('of repetitive hours returned to people'), { suffix: '%', value: 9, label: 'of repetitive hours returned to people' });
  a.deepEqual(unit('days from idea to release'), { suffix: '', value: 9, label: 'days from idea to release' }, '9 days, not 9%');
  // proof is not consumed by other beats; none left means the beat rotates through its own templates (AMEND-10)
  var none = K.story.board(wp5Story({ framework: 'psf', targetMin: 20, proof: [] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'proof'; });
  a.deepEqual(none.map(function (x) { return x.template; }), ['big-number', 'quote', 'three-points']);
  // one piece of evidence: its scene first (the override applies first), then the beat's templates it has not used
  var one1 = K.story.board(wp5Story({ framework: 'psf', targetMin: 20, proof: [{ kind: 'number', text: 'hours saved', value: 3 }] }), { theme: 'slate' }).filter(function (x) { return x.beat === 'proof'; });
  a.deepEqual(one1.map(function (x) { return x.template; }), ['big-number', 'quote', 'three-points']);
  a.deepEqual(one1[0].props, { suffix: '', value: 3, label: 'hours saved' }, 'the evidence is only in the first scene');
  a.deepEqual(one1[1].props, { quote: '{quote}', who: '{who}' }, 'the others keep their seed');
  // the evidence of a pattern beat leads, and the beat's own first template (timeline) still gets its scene
  var gl = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, proof: [{ kind: 'quote', text: 'It changed how we work', who: 'Sam Lee' }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'pattern'; });
  a.deepEqual(gl.map(function (x) { return x.template; }), ['quote', 'timeline']);
  var one = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3 }), { theme: 'cosmos' });
  a.equal(one.filter(function (x) { return x.beat === 'pattern'; })[0].template, 'big-number', 'one pattern scene takes the first proof');
  a.equal(one.filter(function (x) { return x.beat !== 'pattern' && x.template === 'quote'; }).length, 0);
});

wp5Each('board: an identity beat takes the logo when there is one; emotion / resolution beats take the image once', function (a, K) {
  var st = wp5Story({ framework: 'giant-leap', targetMin: 10, proof: [] });      // human-truth has two scenes (three proofs give pattern 3)
  var withLogo = K.story.board(st, { theme: 'cosmos', assets: { logo: 'acme-logo', photos: [] } });
  a.deepEqual([withLogo[1].template, withLogo[1].props], ['logo', { asset: 'acme-logo', tagline: 'Work, but human' }]);
  a.equal(withLogo.filter(function (s) { return s.template === 'image'; }).length, 0);
  var map = { 'acme-logo': { type: 'image', name: 'acme-logo.png' }, hero: { type: 'image', name: 'team.jpg' }, shot: { type: 'image', name: 'x.jpg' }, face: { type: 'font', name: 'f.woff2' } };
  var fromMap = K.story.board(st, { theme: 'cosmos', assets: map });
  a.deepEqual([fromMap[1].template, fromMap[1].props.asset], ['logo', 'acme-logo'], 'a map: the id with "logo" in it is the logo');
  var imgs = fromMap.filter(function (s) { return s.template === 'image'; });
  a.equal(imgs.length, 1, 'the image template is used once');
  a.deepEqual([imgs[0].beat, imgs[0].props], ['human-truth', { asset: 'hero', caption: '{caption}' }]);
  a.equal(fromMap.filter(function (s) { return s.beat === 'human-truth'; })[1].template, 'sunrise', 'the second emotion scene is the beat\'s own');
  var role = K.story.board(st, { theme: 'slate', assets: { a: { type: 'image', role: 'photo', name: 'logo-like.png' }, b: { type: 'image', role: 'logo', name: 'photo.png' } } });
  a.equal(role[1].props.asset, 'b', 'a source\'s role beats the name'); a.equal(role.filter(function (s) { return s.template === 'image'; })[0].props.asset, 'a');
  var psf = K.story.board(wp5Story({ framework: 'psf', targetMin: 20 }), { theme: 'cosmos', assets: { photos: ['p1', 'p2'] } });
  a.deepEqual(psf.filter(function (s) { return s.template === 'image'; }).map(function (s) { return [s.beat, s.props.asset]; }), [['future', 'p1']], 'psf: the resolution beat takes the first photo');
  a.deepEqual(psf.filter(function (s) { return s.beat === 'solution'; }).map(function (s) { return [s.template, s.props]; }), [['brand-reveal', { title: 'Acme', subtitle: 'Work, but human' }], ['statement', { line: '{your line}' }]],
    'only identity-role beats take the logo by override; with no logo the rotation skips logo and image, and the one buildable template is not shown twice: statement comes next');
  var psfLogo = K.story.board(wp5Story({ framework: 'psf', targetMin: 20 }), { theme: 'cosmos', assets: { logo: 'mark', photos: ['p1'] } });
  a.deepEqual(psfLogo.filter(function (s) { return s.beat === 'solution'; }).map(function (s) { return [s.template, s.props.asset]; }), [['brand-reveal', undefined], ['logo', 'mark']],
    'with a logo, the rotation can use it: logo is the solution beat\'s next template');
  a.deepEqual(psfLogo.filter(function (s) { return s.template === 'image'; }).map(function (s) { return [s.beat, s.props.asset]; }), [['future', 'p1']], 'the image stays the once-only override of a resolution beat');
  a.deepEqual(K.story.board(st, { theme: 'cosmos', assets: null }), K.story.board(st, { theme: 'cosmos' }));
});

/* Acceptance #3, third bullet: "With all tokens answered: 0 copy.placeholder findings. With them blank: at least one."
 * §6.5 / §5 say that only the NAMED tokens ({brand} {tagline} {bigIdea} {shortIdea} {oldWay} {newWay} {ask} {audience} {proof1..3})
 * are filled from the story and that every other {…} of a seed "stays as a visible placeholder" ({opening line}, {a big number},
 * {where your audience fits}, {since when}, {your line} …). Those are lines only the speaker can write (P9: the Studio coaches
 * structure, it does not write sentences), and the first beat of every framework has one. So the bullet reads two ways:
 *   (A) "all tokens" = every {…} of the board, named or not, answered: then 0 copy.placeholder. TRUE, and tested below.
 *   (B) "all tokens" = the named tokens only: then 0 copy.placeholder cannot hold; what holds, and is tested below, is that no
 *       named token is left behind, that what is left is exactly the seed's own unnamed {…} (nothing is invented), and that
 *       the checker flags exactly the scenes that still have one.
 * AMEND-10 ratified reading (B): author prompts remain and each yields a copy.placeholder; story tokens must all be replaced. */
wp5Each('board -> compile -> lint: every token answered gives 0 copy.placeholder; with only the named ones answered the seeds\' unnamed {…} remain and are flagged; blank keeps them (acceptance #3 placeholders)', function (a, K) {
  var PH = function (v) { return K.story.placeholders(v); };
  var withBlank = 0, openAnswered = {};
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    [3, 10, 20, null].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + '/' + t + '/' + th;
        var full = wp5Story({ framework: id, targetMin: t }), blank = K.story.interview.set(K.story.interview.set(K.story.interview.blank(), 'goal', 'inspire'), 'targetMin', t);
        blank.framework = id;
        var boardFull = K.story.board(full, { theme: th }), boardBlank = K.story.board(blank, { theme: th });
        boardFull.forEach(function (s) {
          var left = PH(s.props);
          left.forEach(function (tok) { a.ok(WP5_NAMED.indexOf(tok) < 0, label + ': ' + s.id + ' still has the answered token ' + tok); });
          // what remains is part of the template's own seed: the board adds no placeholder of its own
          var seedOnes = wp5Unnamed(K.template.get(s.template).seed);
          left.forEach(function (tok) { a.ok(seedOnes.indexOf(tok) >= 0, label + ': ' + s.id + ' ' + tok + ' comes from the ' + s.template + ' seed'); });
        });
        // lint: the placeholder findings are exactly the scenes that still have a {…} in their copy
        var lf = K.story.lint(wp5BoardDeck(K, boardFull, th, full));
        var flagged = lf.findings.filter(function (f) { return f.id === 'copy.placeholder'; }).map(function (f) { return f.sceneId; }).sort();
        var open = boardFull.filter(function (s) { return PH(s.props).length > 0; }).map(function (s) { return s.id; }).sort();
        a.deepEqual(flagged, open, label + ': copy.placeholder = the scenes with open placeholders');
        open.forEach(function (sid) { openAnswered[id + ':' + sid] = 1; });
        // (A) the speaker answers every remaining {…} as well: nothing is left to flag
        var spoken = boardFull.map(function (s) { var c = JSON.parse(JSON.stringify(s)); c.props = wp5Speak(c.props); return c; });
        spoken.forEach(function (s) { a.deepEqual(PH(s.props), [], label + ': ' + s.id + ' has no {…} left once the speaker has answered them all'); });
        var ls = K.story.lint(wp5BoardDeck(K, spoken, th, full));
        a.equal(ls.findings.filter(function (f) { return f.id === 'copy.placeholder'; }).length, 0, label + ': every token answered: 0 copy.placeholder');
        a.deepEqual(ls.ruleErrors, [], label + ': no rule threw (all answered)');
        var lb = K.story.lint(wp5BoardDeck(K, boardBlank, th, blank));
        var nb = lb.findings.filter(function (f) { return f.id === 'copy.placeholder'; }).length;
        a.ok(nb >= 1, label + ': blank story: at least one copy.placeholder (' + nb + ')');
        a.ok(nb >= flagged.length, label + ': blank has at least as many as answered');
        withBlank++;
        a.deepEqual(lf.ruleErrors, [], label + ': no rule threw');
      });
    });
  });
  a.equal(withBlank, 32);
  // the scenes that keep a placeholder with every named token answered are the ones whose seed has an unnamed {…}
  a.ok(openAnswered['giant-leap:name'] === undefined && openAnswered['giant-leap:the-leap'] === undefined && openAnswered['giant-leap:callback'] === undefined, 'brand, turn and finale scenes are complete');
  a.ok(openAnswered['giant-leap:spark'] === 1 && openAnswered['giant-leap:you-are-here'] === 1, 'the speaker\'s own lines stay open (P9: the studio does not write sentences)');
}, { timeout: 120000 });

/* What a fresh board does to the checker's own transition rules (real catalog; the stub has no worlds to measure). With the
 * AMEND-10 rotation, a you-are-here beat of two scenes is galaxy-reveal then planet, the seam One Giant Leap itself uses into
 * sunrise (the horizon), so giant-leap + cosmos no longer trips vis.teleport at 10 and 20 minutes. At 3 minutes and with no slot
 * (n = R) the beat has one scene, galaxy-reveal, and galaxy -> horizon with no transition still fires: the spec's own board
 * tripping the spec's own rule, pinned as the residual for the lead. Nothing else may trip: no vis.warp anywhere, no teleport on
 * slate or in any other framework.
 * Two more residuals come from the §6.2 data itself and are pinned for the lead, not silenced by the board (P9):
 *   pace.flatline  giant-leap on slate at 20 min: zoom-out, you-are-here and human-truth lose their cosmic templates, and
 *                  the adaptive ones left (statement, quote) all have energy 2, so four or more energy-2 scenes run together
 *                  (at 10 min the three proofs give pattern a big-number, which breaks the run).
 *   story.idea-echo psf and scqa: the turn (and its {shortIdea} subtitle) sits mid-talk and the last two scenes are a proof and
 *                  the finale with the brand and the ask, so nothing on screen at the end echoes the idea until the author puts
 *                  it there. giant-leap and sparkline end on the pivot then the finale, and pass.
 * story.idea-early never fires with the big idea answered: the first scene's notes say it.
 * story.cta no longer fires on a fresh board with the ask answered: sparkline's ask lands on the new-bliss finale, and the finale
 * template has the cta role, so the author's ask on screen there counts (it used to fire on every sparkline board). */
T.test('board: a fresh storyboard on the real catalog trips vis.teleport only for a one-scene you-are-here on cosmos, pace.flatline only for giant-leap on slate at 20 min, story.idea-echo only for psf and scqa (documented residuals), never story.idea-early, never story.cta with the ask answered, never vis.warp', function (a) {
  var K = wp5Real();
  if (!K) { a.ok(true, 'real catalog not loaded: skipped'); return; }
  var residual = [], flat = [], cta = [], early = [], echoEnd = [];
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    [3, 10, 20, null].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + '/' + t + '/' + th, st = wp5Story({ framework: id, targetMin: t });
        var scenes = K.story.board(st, { theme: th });
        var l = K.story.lint(wp5BoardDeck(K, scenes, th, st));
        a.deepEqual(l.ruleErrors, [], label + ': no rule threw');
        a.equal(l.findings.filter(function (f) { return f.id === 'vis.warp'; }).length, 0, label + ': no vis.warp');
        if (l.findings.some(function (f) { return f.id === 'pace.flatline'; })) flat.push(label);
        if (l.findings.some(function (f) { return f.id === 'story.idea-early'; })) early.push(label);
        if (l.findings.some(function (f) { return f.id === 'story.idea-echo'; })) echoEnd.push(id);
        var ct = l.findings.filter(function (f) { return f.id === 'story.cta'; });
        if (ct.length) { cta.push(label); a.equal(ct[0].fix, "Put 'Book a pilot' on screen in the call to action beat, or at least in its notes.", label + ': the fix names the cta beat'); }
        for (var i = 1; i < scenes.length; i++) {
          if (scenes[i].template !== 'statement') a.ok(scenes[i].template !== scenes[i - 1].template || JSON.stringify(scenes[i].props) !== JSON.stringify(scenes[i - 1].props), label + ': ' + scenes[i].id + ' is not the previous scene again');
        }
        var tele = l.findings.filter(function (f) { return f.id === 'vis.teleport'; });
        if (!tele.length) return;
        residual.push(label);
        a.equal(tele.length, 1, label + ': one teleport');
        a.equal(tele[0].sceneId, 'human-truth', label + ': it is the seam between you-are-here and human-truth');
        var prev = scenes[scenes.map(function (x) { return x.id; }).indexOf('human-truth') - 1];
        a.deepEqual([prev.beat, prev.template], ['you-are-here', 'galaxy-reveal'], label + ': the galaxy before the sunrise');
      });
    });
  });
  a.deepEqual(residual, ['giant-leap/3/cosmos', 'giant-leap/null/cosmos'], 'the documented residual, and nothing else');
  a.deepEqual(flat, ['giant-leap/20/slate'], 'pace.flatline: the documented residual, and nothing else');
  a.deepEqual(early, [], 'story.idea-early: never, the first scene says the big idea');
  a.deepEqual(echoEnd.filter(function (x, i) { return echoEnd.indexOf(x) === i; }), ['psf', 'scqa'], 'story.idea-echo: the documented residual (psf and scqa), and nothing else');
  a.deepEqual(cta, [], 'story.cta with the ask answered: none (the finale carries the ask)');
  [10, 20].forEach(function (t) {
    var sc = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: t }), { theme: 'cosmos' });
    var i = sc.map(function (x) { return x.id; }).indexOf('human-truth');
    a.deepEqual([sc[i - 2].template, sc[i - 1].template, sc[i].template], ['galaxy-reveal', 'planet', 'sunrise'], t + ' min: planet bridges the galaxy and the sunrise');
  });
}, { timeout: 120000 });

T.test('board: the real WP4 catalog accepts what the board makes (every framework x look compiles with no expansion errors)', function (a) {
  if (PD.template.list().length < 16 || !PD.theme.has('slate')) { a.ok(true, 'real catalog or slate not loaded: skipped'); return; }
  var checked = 0;
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    [3, 10, 20].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var st = wp5Story({ framework: id, targetMin: t });
        var scenes = PD.story.board(st, { theme: th });
        var c = PD.compile({ format: 2, id: 'wp5-real', meta: { title: 'r', theme: th, story: st }, scenes: scenes });
        a.deepEqual(c.errors, [], id + '/' + t + '/' + th + ': compile errors ' + JSON.stringify(c.errors.slice(0, 2)));
        a.equal(c.scenes.length, scenes.length);
        var l = PD.story.lint(c);
        a.deepEqual(l.ruleErrors, []);
        if (typeof PD.validate === 'function') {
          var errs = PD.validate(c).filter(function (i) { return i.level === 'error' && ['template.prop-required', 'template.prop-type'].indexOf(i.code) >= 0; });
          a.deepEqual(errs, [], id + '/' + t + '/' + th + ': the seeds are valid props');
        }
        checked++;
      });
    });
  });
  a.equal(checked, 24);
});
