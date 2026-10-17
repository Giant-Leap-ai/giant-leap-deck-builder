/* tools/test/specs/wp5-copy.test.js — story/copy (spec §6.7 helpers and word lists, §6.8 BUDGET, §6.9 microcopy). */

var WP5_COPY_KEYS = ['welcome', 'q.goal', 'q.bigIdea', 'q.bigIdea.long', 'q.shortIdea', 'q.turn', 'q.ask', 'q.proof', 'q.brand', 'q.tone',
  'fw.pick', 'board.emptyBeat', 'board.placeholder', 'lint.clean', 'lint.summary', 'lint.ready', 'lint.notReady', 'lint.ignore',
  'assets.drop', 'assets.tainted', 'assets.heic', 'assets.solidLogo', 'save.local', 'save.quota', 'export.done', 'export.fontWarn'];

T.test('copy: PD.story.COPY has every key of §6.9 and the spec\'s literal sentences', function (a) {
  var C = PD.story.COPY;
  WP5_COPY_KEYS.forEach(function (k) { a.ok(typeof C[k] === 'string' && C[k].length > 0, 'COPY["' + k + '"]'); });
  a.equal(C['q.shortIdea'], 'Now say it in six words or fewer. This is what goes on screen.');
  a.equal(C['assets.heic'], "Can't use .{ext} yet. Export it as PNG or JPEG.");
  a.equal(C['assets.solidLogo'], 'Your logo has a solid background, so particles will draw a box. Try brightness mode.');
  a.equal(C['save.quota'], 'Autosave is full. Save to a file now.');
  a.equal(C['export.fontWarn'], 'This deck uses {font}, which only exists on Macs. Drop a font file in to embed it.');
  a.equal(C['lint.ready'], 'Ready for the stage');
  a.equal(C['lint.ignore'], 'Ignore for this scene');
  a.equal(C['q.ask.verb'], 'Start with a verb: Book, Try, Pick.');
});

T.test('copy: every message is second person friendly: at most 2 sentences, never says "error" or "invalid"', function (a) {
  var C = PD.story.COPY;
  Object.keys(C).forEach(function (k) {
    var text = C[k];
    a.ok(!/\berror\b|\binvalid\b/i.test(text), k + ' says error/invalid: ' + text);
    // a sentence ends at . ! ? followed by a space and a capital letter (or the end)
    var n = text.trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).length;
    a.ok(n <= 2, k + ' has ' + n + ' sentences: ' + text);
  });
});

T.test('copy: a question and its help line read as two sentences (q.proof used to run them together)', function (a) {
  var C = PD.story.COPY, P = PD.story.COPY_PARTS;
  a.equal(C['q.proof'], 'Your three strongest pieces of evidence. A number, a quote, a story or a demo each; skip any you do not have.');
  a.deepEqual(P['q.proof'], ['Your three strongest pieces of evidence', 'A number, a quote, a story or a demo each; skip any you do not have.'], 'the parts keep the title as the spec words it');
  var keys = Object.keys(P).filter(function (k) { return P[k].length === 2; });
  a.ok(keys.length >= 8, 'questions with a help line: ' + keys.length);
  keys.forEach(function (k) {
    var title = P[k][0], help = P[k][1], joined = C[k];
    a.ok(joined.slice(0, title.length) === title && joined.slice(-help.length) === help, k + ': the joined text is the title, a separator and the help');
    var sep = joined.slice(title.length, joined.length - help.length), closed = /[.!?:;…]$/.test(title);
    a.equal(sep, closed ? ' ' : '. ', k + ': a title with its own closing mark gets a space, one without gets a full stop and a space');
    a.ok(/^[A-Z'"‘“]/.test(help), k + ': the help starts a sentence');
  });
});

T.test('copy: COPY_PARTS splits a question into its title and help; say() / fmt() fill {tokens} and leave unknown ones', function (a) {
  var P = PD.story.COPY_PARTS, C = PD.story.COPY;
  a.deepEqual(P['q.goal'], ['What should this talk do?', 'Pick the closest one, because it decides the shape of your story.']);
  a.equal(C['q.goal'], P['q.goal'].join(' '));
  a.equal(P['lint.ready'].length, 1);
  a.equal(PD.story.say('assets.heic', { ext: 'heic' }), "Can't use .heic yet. Export it as PNG or JPEG.");
  a.equal(PD.story.say('lint.summary', { e: 0, w: 1, i: 3 }), '0 to fix, 1 to consider, 3 tips.');
  a.equal(PD.story.say('board.placeholder', {}), "Answer '{token}' in the interview, or type over it.", 'an unknown token stays');
  a.equal(PD.story.say('no.such.key'), '');
  a.equal(PD.story.fmt('{a} and {b} and {a}', { a: 'x', b: 0 }), 'x and 0 and x', 'a zero is a value');
  a.equal(PD.story.fmt('{a}', { a: null }), '{a}');
});

T.test('copy: BUDGET equals the §6.8 table', function (a) {
  var B = PD.story.BUDGET;
  var want = { mega: [2, 10, 1], hero: [3, 14, 1], title: [5, 24, 1], statement: [14, 141, 3], subtitle: [7, 40, 1], kicker: [5, 30, 1],
               body: [30, 256, 4], year: [2, 14, 1], label: [4, 22, 1], caption: [6, 40, 1] };
  a.deepEqual(Object.keys(B).sort(), Object.keys(want).sort());
  Object.keys(want).forEach(function (s) { a.deepEqual([B[s].words, B[s].chars, B[s].lines], want[s], s); });
  a.equal(B.statement.perLine, 47); a.equal(B.body.perLine, 64);
});

T.test('copy: the six copy devices of §6.8 are available to the editor', function (a) {
  a.deepEqual(PD.story.DEVICES.map(function (d) { return d.id; }), ['split', 'not-x-y', 'number-meaning', 'callback', 'one-accent', 'silence']);
  PD.story.DEVICES.forEach(function (d) { a.ok(d.label && d.tip, d.id); });
});

T.test('copy: STOPWORDS, IMPERATIVES and JARGON are the §6.7 lists', function (a) {
  a.deepEqual(PD.story.STOPWORDS, 'a an the and or but of to in on at for with is are was were be it its that this these those we you they our your their more most as by from into than so just very'.split(' '));
  a.deepEqual(PD.story.IMPERATIVES, ("book try pick start join visit email call sign choose bring share download schedule ask talk build test pilot register apply contact follow read watch write go come reply send plan map pair stop let's").split(' '));
  a.deepEqual(PD.story.JARGON, 'leverage synergy utilise utilize robust seamless best-in-class paradigm holistic solutions unlock game-changer'.split(' '));
  a.ok(PD.story.STOPWORDS.indexOf('not') < 0, '"not" is kept');
});

T.test('copy: words(), tokens(), match(), echo()', function (a) {
  var S = PD.story;
  a.equal(S.words('  one  two\nthree '), 3); a.equal(S.words(''), 0); a.equal(S.words('   '), 0); a.equal(S.words(null), 0);
  a.deepEqual(S.tokens('The next leap is augmentation, NOT automation: technology that makes work more human.'),
    ['next', 'leap', 'augmentation', 'not', 'automation', 'technology', 'makes', 'work', 'human']);
  a.deepEqual(S.tokens("Don't stop; it's best-in-class!"), ['dont', 'stop', 'best', 'class'], 'apostrophes vanish (its is a stopword), hyphens split');
  a.ok(S.match('automation', 'automate'), 'same first five letters');
  a.ok(!S.match('work', 'worm'), 'under five letters must be equal');
  a.ok(S.match('leap', 'leap'));
  a.ok(!S.match('human', 'humble'));
  var idea = 'The next leap is augmentation, not automation: technology that makes work more human.';
  a.ok(S.echo(idea, 'Making work more human'), 'work + human');
  a.ok(S.echo(idea, 'The next leap'), 'next + leap');
  a.ok(!S.echo(idea, 'One Giant Leap'), 'one token is not enough');
  a.ok(!S.echo(idea, 'Not today'), '"not" alone is not enough');
  a.ok(!S.echo('', 'anything at all'), 'no big idea, no echo');
  a.ok(S.echo(idea, 'we automate augmenting'), 'prefix match on the first 5 letters (augme, autom)');
});

T.test('copy: placeholders, imperatives, jargon, speech', function (a) {
  var S = PD.story;
  a.equal(S.placeholderIn('Say {opening line} now'), '{opening line}');
  a.equal(S.placeholderIn('Lorem ipsum'), 'Lorem');
  a.equal(S.placeholderIn('TODO fix'), 'TODO');
  a.equal(S.placeholderIn('Every giant leap'), null);
  a.equal(S.placeholderIn('{this is a very very very very very very long token name}'), null, 'over 40 characters is not a token');
  a.deepEqual(S.placeholders({ a: '{x} and {y z}', b: [{ c: '{x}' }, 'none'], d: 3 }), ['{x}', '{y z}', '{x}']);
  a.equal(S.firstWord('  "Book" a pilot'), 'book'); a.equal(S.firstWord("Let’s go"), "let's");
  a.ok(S.startsImperative('Book a pilot')); a.ok(S.startsImperative("Let's make the next one together"));
  a.ok(S.startsImperative('Try it, then pick one')); a.ok(!S.startsImperative('Thank you')); a.ok(!S.startsImperative(''));
  a.deepEqual(S.jargonIn('We leverage a seamless, holistic approach'), ['leverage', 'seamless', 'holistic']);
  a.deepEqual(S.jargonIn('Unlocking solutions that are game-changers'), ['unlock', 'solutions', 'game-changer']);
  a.deepEqual(S.jargonIn('Technology that makes work more human'), []);
  a.equal(S.speech('▸ What is the spark?'), '', 'a prompt is not speech');
  a.equal(S.speech('▸ Prompt\nSay hello.\n  ▸ Another'), 'Say hello.');
  a.equal(S.speech('Plain notes'), 'Plain notes'); a.equal(S.speech(undefined), '');
});

T.test('copy: the story modules register without side effects (no template, DOM or random draw at registration)', function (a) {
  var rnd = Math.random, calls = 0;
  Math.random = function () { calls++; return rnd(); };
  try {
    var g = {}; PD.kernel(g); var K = g.PD, all = PD.modules();
    WP5_MODULES.forEach(function (n) { var r = all.filter(function (m) { return m.name === n; })[0]; K.module(n, r.deps, r.factory, r.opts); });
    a.equal(calls, 0, 'no Math.random while registering');
    a.equal(K.template.list().length, 0, 'registering the story modules registers no template');
    a.deepEqual(K.framework.list(), ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']);
  } finally { Math.random = rnd; }
});
