/* tools/test/specs/wp5-board.test.js — story/board (spec §6.5; WP5 acceptance #3).
 * The acceptance tests run twice (wp5Each): on the fresh engine with the stub §5 catalog (so the story code is pinned to the
 * spec's table and does not move with WP4's templates) and on the real engine with the real WP4 catalog and WP3's slate. */

var WP5_NAMED = ['{brand}', '{tagline}', '{bigIdea}', '{shortIdea}', '{oldWay}', '{newWay}', '{ask}', '{audience}', '{proof1}', '{proof2}', '{proof3}'];
var WP5_THEME_WORLDS = { cosmos: ['core', 'cosmos', 'planet', 'spark', 'photo'], slate: ['core', 'ambient', 'photo', 'spark'] };

function wp5Expected(fw, targetMin) {        // the §6.5 invariants (n, minimums, caps), not the allocation algorithm
  var R = 0, cap = 0;
  fw.beats.forEach(function (b) { if (b.required) R += Math.max(1, b.min); cap += b.max; });
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

wp5Each('board: scene counts follow §6.5 for every framework x targetMin x theme (acceptance #3)', function (a, K) {
  var checked = 0;
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    var fw = K.framework.get(id);
    [3, 10, 20, null].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + ' / ' + t + ' min / ' + th;
        var scenes = K.story.board(wp5Story({ framework: id, targetMin: t }), { theme: th });
        var want = wp5Expected(fw, t);
        a.equal(scenes.length, want.n, label + ': scene count');
        // every beat inside its limits, beats in framework order, scenes of a beat consecutive
        var byBeat = {}, order = [];
        scenes.forEach(function (s) { byBeat[s.beat] = (byBeat[s.beat] || 0) + 1; if (order[order.length - 1] !== s.beat) order.push(s.beat); });
        a.deepEqual(order, fw.beats.map(function (b) { return b.id; }).filter(function (b) { return byBeat[b]; }), label + ': beat order, one run per beat');
        fw.beats.forEach(function (b) {
          var got = byBeat[b.id] || 0, base = b.required ? Math.max(1, b.min) : b.min;
          a.ok(got >= base && got <= b.max, label + ': ' + b.id + ' has ' + got + ' (' + base + '..' + b.max + ')');
        });
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
    function counts(id, t) { var o = {}; K.story.board(wp5Story({ framework: id, targetMin: t }), { theme: 'cosmos' }).forEach(function (s) { o[s.beat] = (o[s.beat] || 0) + 1; }); return o; }
    a.deepEqual(counts('giant-leap', 3), { spark: 1, name: 1, 'you-are-here': 1, 'human-truth': 1, pattern: 1, 'the-box': 1, 'the-leap': 1, callback: 1 }, '3 min: n = R = 8, the optional beat is empty');
    a.deepEqual(counts('giant-leap', null), counts('giant-leap', 3), 'unknown slot: n = R');
    a.deepEqual(counts('giant-leap', 10), { spark: 1, name: 1, 'zoom-out': 1, 'you-are-here': 2, 'human-truth': 2, pattern: 2, 'the-box': 1, 'the-leap': 1, callback: 1 }, '10 min: 12 scenes');
    a.deepEqual(counts('giant-leap', 20), { spark: 1, name: 1, 'zoom-out': 2, 'you-are-here': 2, 'human-truth': 2, pattern: 3, 'the-box': 2, 'the-leap': 1, callback: 1 }, '20 min: capped by the beats\' maxima (15)');
    a.deepEqual(counts('sparkline', 3), { 'what-is': 1, 'could-be': 1, contrast: 2, 'call-to-action': 1, 'new-bliss': 1 });
    a.deepEqual(counts('sparkline', 10), { 'what-is': 1, 'could-be': 1, contrast: 4, 'call-to-action': 1, 'new-bliss': 1 });
    a.deepEqual(counts('scqa', 3), { situation: 1, complication: 1, answer: 1, support: 1, ask: 1 }, 'the optional question beat stays empty');
    a.deepEqual(counts('psf', 10), { hook: 1, problem: 2, insight: 1, solution: 2, proof: 3, future: 1, ask: 1 }, 'psf: 11 fit, the spare scene goes to the largest remainder with room (proof)');
    var gl = K.framework.get('giant-leap');
    a.equal(K.story.board.plan(wp5Story({ framework: 'giant-leap', targetMin: 90 }), gl).n, 15, '90 min: 24 scenes asked, 15 fit');
    a.deepEqual(K.story.board.plan({ targetMin: 10 }, K.framework.get('blank')), { n: 0, asked: 12, required: 0, counts: {}, capacity: 0 });
    // plan() says how many scenes the slot asks for next to how many the framework holds, so the Studio can tell the user
    function pl(id, t) { var p = K.story.board.plan(wp5Story({ framework: id, targetMin: t }), K.framework.get(id)); return [p.asked, p.n, p.capacity]; }
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

wp5Each('board: the template is the first of the beat\'s list that the theme supports, for every scene of the beat (cosmos keeps the cosmic ones, slate swaps in adaptive ones)', function (a, K) {
  function tpls(th) { return K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, proof: [] }), { theme: th }).map(function (s) { return s.beat + ':' + s.template; }); }
  // §6.5 step 4, literally: scene 2 of a beat is the same template as scene 1
  a.deepEqual(tpls('cosmos'), ['spark:cold-open', 'name:brand-reveal', 'zoom-out:hyperspace', 'you-are-here:galaxy-reveal', 'you-are-here:galaxy-reveal',
    'human-truth:sunrise', 'human-truth:sunrise', 'pattern:timeline', 'pattern:timeline', 'the-box:the-box', 'the-leap:pivot', 'callback:finale']);
  a.deepEqual(tpls('slate'), ['spark:cold-open', 'name:brand-reveal', 'zoom-out:big-number', 'you-are-here:statement', 'you-are-here:statement',
    'human-truth:statement', 'human-truth:statement', 'pattern:timeline', 'pattern:timeline', 'the-box:the-box', 'the-leap:pivot', 'callback:finale']);
  // a theme without the spark world cannot open on cold-open
  var noSpark = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3 }), { theme: { worlds: ['ambient', 'photo'] } });
  a.equal(noSpark[0].template, 'statement', 'cold-open needs spark: the next in the list');
  // only the default look differs with the tone
  a.equal(K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, tone: 'cinematic' }))[2].template, 'hyperspace');
  a.equal(K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 10, tone: 'warm' }))[2].template, 'big-number');
});

wp5Each('board: with no proof and no assets, every scene is the first entry of its beat\'s list that the theme satisfies (independent reading of §6.5 step 4, all frameworks x looks x slots)', function (a, K) {
  var checked = 0;
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    var fw = K.framework.get(id);
    [3, 10, 20].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + '/' + t + '/' + th, worlds = ['core'].concat(K.theme.resolve(th).worlds);
        var scenes = K.story.board(wp5Story({ framework: id, targetMin: t, proof: [] }), { theme: th });
        fw.beats.forEach(function (b) {
          var first = b.templates.filter(function (tid) {      // "the theme satisfies it": requires.worlds (+ worldsFor) are all enabled
            return wp5NeedWorlds(K, tid, K.template.get(tid).seed).every(function (w) { return worlds.indexOf(w) >= 0; });
          })[0];
          scenes.filter(function (sc) { return sc.beat === b.id; }).forEach(function (sc) {
            a.equal(sc.template, first, label + ' ' + sc.id + ': the first template of the list that the look supports');
            checked++;
          });
        });
      });
    });
  });
  a.ok(checked > 150, 'scenes checked: ' + checked);
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
});

wp5Each('board: notes are the beat\'s question as a prompt, point = label: ask, beat = the beat id', function (a, K) {
  var fw = K.framework.get('giant-leap');
  K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3 }), { theme: 'cosmos' }).forEach(function (s) {
    var b = fw.beats.filter(function (x) { return x.id === s.beat; })[0];
    a.equal(s.notes, '▸ ' + b.ask); a.equal(s.point, b.label + ': ' + b.ask); a.equal(s.beat, b.id);
    a.deepEqual(Object.keys(s).sort(), ['beat', 'id', 'notes', 'point', 'props', 'template']);
    a.equal(K.story.speech(s.notes), '', 'the prompt is not speech');
  });
});

wp5Each('board: proof-role beats consume story.proof in order (number -> big-number, quote -> quote, story / demo -> statement)', function (a, K) {
  var s = K.story.board(wp5Story({ framework: 'psf', targetMin: 20 }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'proof'; });
  a.equal(s.length, 3);
  a.deepEqual([s[0].template, s[0].props], ['big-number', { value: 12, label: 'hours saved each week' }]);
  a.deepEqual([s[1].template, s[1].props], ['quote', { quote: 'It changed how we work', who: 'Sam Lee' }]);
  a.deepEqual([s[2].template, s[2].props], ['statement', { line: 'A Leeds team shipped in a day' }]);
  var demo = K.story.board(wp5Story({ framework: 'scqa', targetMin: 3, proof: [{ kind: 'demo', text: 'Live demo of the console' }] }), { theme: 'slate' }).filter(function (x) { return x.beat === 'support'; });
  a.deepEqual([demo[0].template, demo[0].props], ['statement', { line: 'Live demo of the console' }]);
  // a number without a value keeps the seed's value; a quote without who keeps {who}
  var odd = K.story.board(wp5Story({ framework: 'scqa', targetMin: 20, proof: [{ kind: 'number', text: 'fewer hand-offs' }, { kind: 'quote', text: 'Nice' }] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'support'; });
  a.deepEqual(odd[0].props, { value: 0, label: 'fewer hand-offs' }); a.deepEqual(odd[1].props, { quote: 'Nice', who: '{who}' });
  a.equal(odd[2].template, 'three-points', 'out of proof: the beat\'s own first template');
  // proof is not consumed by other beats; none left means the beat's first template for each scene (§6.5 step 4)
  var none = K.story.board(wp5Story({ framework: 'psf', targetMin: 20, proof: [] }), { theme: 'cosmos' }).filter(function (x) { return x.beat === 'proof'; });
  a.deepEqual(none.map(function (x) { return x.template; }), ['big-number', 'big-number', 'big-number']);
  // one piece of evidence: its scene first, then the beat's first template for the others
  var one1 = K.story.board(wp5Story({ framework: 'psf', targetMin: 20, proof: [{ kind: 'number', text: 'hours saved', value: 3 }] }), { theme: 'slate' }).filter(function (x) { return x.beat === 'proof'; });
  a.deepEqual(one1.map(function (x) { return x.template; }), ['big-number', 'big-number', 'big-number']);
  a.deepEqual(one1[0].props, { value: 3, label: 'hours saved' }, 'the evidence is only in the first scene');
  a.deepEqual(one1[1].props, { value: 0, label: '{what the number means}' }, 'the others keep the seed');
  var one = K.story.board(wp5Story({ framework: 'giant-leap', targetMin: 3 }), { theme: 'cosmos' });
  a.equal(one.filter(function (x) { return x.beat === 'pattern'; })[0].template, 'big-number', 'one pattern scene takes the first proof');
  a.equal(one.filter(function (x) { return x.beat !== 'pattern' && x.template === 'quote'; }).length, 0);
});

wp5Each('board: an identity beat takes the logo when there is one; emotion / resolution beats take the image once', function (a, K) {
  var st = wp5Story({ framework: 'giant-leap', targetMin: 10 });
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
  a.equal(psf.filter(function (s) { return s.beat === 'solution'; })[0].template, 'brand-reveal', 'only identity-role beats take the logo');
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
 * Reading (B) needs the lead's amendment (see the report). */
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

/* What a fresh board does to the checker's own transition rules (real catalog; the stub has no worlds to measure). With §6.5 step 4
 * read literally, the you-are-here beat of giant-leap is galaxy-reveal for every scene it has, and the next beat opens on sunrise
 * (the horizon): the checker's vis.teleport (galaxy -> horizon, no transition) fires on giant-leap + cosmos at EVERY slot length
 * (OGL bridges that seam with its second you-are-here scene, planet, which the first-entry rule never picks). That is the spec's
 * own board tripping the spec's own rule, so it is pinned here as a known residual for the lead (see the report), and nothing else
 * may trip: no vis.warp anywhere, no teleport on slate or in any other framework. */
T.test('board: a fresh storyboard on the real catalog trips vis.teleport only for giant-leap on cosmos (documented residual), never vis.warp', function (a) {
  var K = wp5Real();
  if (!K) { a.ok(true, 'real catalog not loaded: skipped'); return; }
  var residual = [];
  ['giant-leap', 'sparkline', 'psf', 'scqa'].forEach(function (id) {
    [3, 10, 20, null].forEach(function (t) {
      ['cosmos', 'slate'].forEach(function (th) {
        var label = id + '/' + t + '/' + th, st = wp5Story({ framework: id, targetMin: t });
        var scenes = K.story.board(st, { theme: th });
        var l = K.story.lint(wp5BoardDeck(K, scenes, th, st));
        a.deepEqual(l.ruleErrors, [], label + ': no rule threw');
        a.equal(l.findings.filter(function (f) { return f.id === 'vis.warp'; }).length, 0, label + ': no vis.warp');
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
  a.deepEqual(residual, ['giant-leap/3/cosmos', 'giant-leap/10/cosmos', 'giant-leap/20/cosmos', 'giant-leap/null/cosmos'], 'the documented residual, and nothing else');
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
