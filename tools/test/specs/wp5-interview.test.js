/* tools/test/specs/wp5-interview.test.js — story/interview (spec §6.4): questions, hints, answers, logline. */

T.test('interview: ten skippable questions in the order of §6.4, with their fields and input kinds', function (a) {
  var Q = PD.story.interview.questions;
  a.deepEqual(Q.map(function (q) { return q.id; }), ['goal', 'audience', 'targetMin', 'bigIdea', 'shortIdea', 'turn', 'ask', 'proof', 'brand', 'tone']);
  a.deepEqual(Q.map(function (q) { return q.n; }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  a.deepEqual(Q.map(function (q) { return q.fields.join('+'); }), ['goal', 'audience', 'targetMin', 'bigIdea', 'shortIdea', 'oldWay+newWay', 'ask', 'proof', 'brand+tagline', 'tone']);
  a.deepEqual(Q.map(function (q) { return q.input.type; }), ['choice', 'text', 'number', 'text', 'text', 'pair', 'text', 'proof', 'pair', 'choice']);
  a.deepEqual(Q[0].input.options.map(function (o) { return o.value; }), ['inspire', 'persuade', 'decide', 'launch', 'update', 'teach']);
  a.deepEqual(Q[9].input.options.map(function (o) { return o.value; }), ['cinematic', 'warm', 'crisp', 'playful']);
  a.deepEqual([Q[2].input.min, Q[2].input.max, Q[2].input.chips], [1, 90, [3, 5, 10, 20]]);
  a.equal(Q[1].input.max, 200); a.equal(Q[3].input.max, 200);
  // the answers that go on screen are held to the slot they fill (§5), not §6.4's looser numbers: brand 18 (hero titles), ask 40
  // and 7 words (the finale subtitle), shortIdea 44 (the pivot subtitle), the turn 2 words / 13 characters and 3 / 17 ("Not
  // {oldWay}." and "{newWay}." in an 18-character, 3-word hero line)
  a.deepEqual([Q[6].input.max, Q[6].input.maxWords], [40, 7]); a.deepEqual([Q[4].input.max, Q[4].input.maxWords], [44, 6]);
  a.deepEqual(Q[8].input.fields.map(function (f) { return f.max; }), [18, 40]);
  a.deepEqual(Q[5].input.fields, [{ field: 'oldWay', label: 'The old answer', max: 13, maxWords: 2 }, { field: 'newWay', label: 'Your answer', max: 17, maxWords: 3 }]);
  a.ok(13 + 'Not .'.length <= PD.template.get('pivot').props.from.max && 17 + 1 <= PD.template.get('pivot').props.to.max, 'the turn fits the pivot');
  a.ok(PD.template.get('finale').props.title.max >= 18 && PD.template.get('brand-reveal').props.title.max >= 18 && PD.template.get('finale').props.subtitle.max >= 40 && PD.template.get('pivot').props.subtitle.max >= 44, 'and the other slots');
  a.equal(Q[7].input.rows, 3);
  a.equal(Q[0].title, 'What should this talk do?'); a.equal(Q[3].title, 'If they remember one sentence, what is it?');
  a.equal(Q[4].title, 'Now say it in six words or fewer.'); a.equal(Q[4].help, 'This is what goes on screen.');
  a.equal(Q[5].title, 'What do they believe now, and what should they believe after?');
  a.equal(Q[8].title, 'Who are you, in one line?'); a.equal(Q[2].title, 'How long is your slot?');
  a.equal(PD.story.interview.question('ask'), Q[6]); a.equal(PD.story.interview.question('nope'), null);
});

T.test('interview: blank() is the empty StoryMeta of §6.1 and nothing is answered', function (a) {
  var I = PD.story.interview, b = I.blank();
  a.deepEqual(b, { framework: 'blank', goal: null, audience: '', targetMin: null, bigIdea: '', shortIdea: '', oldWay: '', newWay: '', ask: '',
                   proof: [], brand: '', tagline: '', tone: null });
  I.questions.forEach(function (q) { a.ok(!I.answered(b, q.id), q.id + ' unanswered'); });
  a.deepEqual(I.progress(b), { answered: 0, total: 10, done: false });
  a.equal(I.logline(b), '');
});

T.test('interview: step 1 is done when bigIdea and targetMin are answered; progress counts answers', function (a) {
  var I = PD.story.interview, s = I.blank();
  s = I.set(s, 'bigIdea', 'A big idea'); a.ok(!I.done(s), 'bigIdea alone is not enough');
  s = I.set(s, 'targetMin', 10); a.ok(I.done(s));
  a.deepEqual(I.progress(s), { answered: 2, total: 10, done: true });
  a.ok(!I.done(I.set(I.blank(), 'targetMin', 10)), 'targetMin alone is not enough');
  a.ok(!I.done(I.set(s, 'bigIdea', '   ')), 'blank text is not an answer');
  a.ok(!I.done(I.set(s, 'targetMin', '')), 'an empty slot is not an answer');
  s = I.set(I.blank(), 'proof', [{ kind: 'number', text: '', value: 5 }]); a.ok(I.answered(s, 'proof'), 'a number row with a value counts');
  a.ok(!I.answered(I.set(I.blank(), 'proof', [{ kind: 'quote', text: '  ' }]), 'proof'));
});

T.test('interview: set() returns a new story and sanitizes; the input is never mutated', function (a) {
  var I = PD.story.interview, s0 = I.blank(), s1 = I.set(s0, 'goal', 'decide');
  a.ok(s1 !== s0); a.equal(s0.goal, null); a.equal(s1.goal, 'decide');
  a.equal(I.set(s1, 'goal', 'nonsense').goal, null, 'an unknown goal clears the answer');
  a.equal(I.set(s1, 'tone', 'warm').tone, 'warm'); a.equal(I.set(s1, 'tone', 'loud').tone, null);
  a.equal(I.set(s0, 'targetMin', '12').targetMin, 12, 'a numeric string');
  a.equal(I.set(s0, 'targetMin', 12.6).targetMin, 13, 'rounded');
  a.equal(I.set(s0, 'targetMin', 500).targetMin, 90, 'clamped to 90');
  a.equal(I.set(s0, 'targetMin', 0).targetMin, 1, 'clamped to 1');
  a.equal(I.set(s0, 'targetMin', 'abc').targetMin, null); a.equal(I.set(s0, 'targetMin', null).targetMin, null);
  var t = I.set(s0, 'turn', { oldWay: 'automation', newWay: 'augmentation' });
  a.deepEqual([t.oldWay, t.newWay], ['automation', 'augmentation']);
  var b = I.set(s0, 'brand', { brand: 'Acme', tagline: 'Work, but human' });
  a.deepEqual([b.brand, b.tagline], ['Acme', 'Work, but human']);
  var typed = I.set(s0, 'bigIdea', 'two words '); a.equal(typed.bigIdea, 'two words ', 'typing keeps the trailing space');
  a.equal(I.clean(typed).bigIdea, 'two words', 'clean() trims');
  var rows = [{ kind: 'number', text: 'hours', value: '12' }, { kind: 'quote', text: 'wow', who: 'Sam', value: 3 }, { kind: 'nonsense', text: 'x' },
              { kind: 'demo', text: '' }, null, { kind: 'story', text: 'four' }];
  var p = I.set(s0, 'proof', rows).proof;
  a.deepEqual(p, [{ kind: 'number', text: 'hours', value: 12 }, { kind: 'quote', text: 'wow', who: 'Sam' }, { kind: 'story', text: 'x' }], 'sanitized, at most three, empty rows dropped');
  a.equal(rows[0].value, '12', 'the caller\'s rows are untouched');
  a.deepEqual(I.patch('shortIdea', 'Six words or fewer'), { shortIdea: 'Six words or fewer' });
  a.deepEqual(I.patch('turn', { oldWay: 'a', newWay: 'b' }), { oldWay: 'a', newWay: 'b' });
  a.deepEqual(I.patch('nope', 1), {});
});

T.test('interview: get() gives the answer in the shape its input wants', function (a) {
  var I = PD.story.interview, s = I.set(I.set(I.set(I.blank(), 'turn', { oldWay: 'x', newWay: 'y' }), 'targetMin', 5), 'goal', 'teach');
  a.deepEqual(I.get(s, 'turn'), { oldWay: 'x', newWay: 'y' });
  a.equal(I.get(s, 'targetMin'), 5); a.equal(I.get(s, 'goal'), 'teach'); a.equal(I.get(s, 'bigIdea'), ''); a.equal(I.get(I.blank(), 'tone'), null);
  a.deepEqual(I.get(s, 'proof'), []); a.equal(I.get(s, 'nope'), undefined);
});

T.test('interview: hints are only hints: bigIdea > 15 words, shortIdea > 6, a turn side > 5, an ask without a verb, text over its limit', function (a) {
  var I = PD.story.interview;
  var w15 = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
  a.equal(I.hint('bigIdea', w15), null, '15 words are fine');
  a.equal(I.hint('bigIdea', w15 + ' sixteen'), "That's 16 words. Try it in one breath: 15 words or fewer.");
  a.equal(I.hint('shortIdea', 'one two three four five six'), null);
  a.equal(I.hint('shortIdea', 'one two three four five six seven'), "That's 7 words. Cut it to six or fewer so it fits on one line.");
  var TURN = "That side won't fit the big type. Try two or three words, like 'Not more hours' and 'Better tools'.";
  a.equal(I.hint('turn', { oldWay: 'stale bread', newWay: 'fresh every day' }), null, 'two words, then three, fit "Not stale bread." / "Fresh every day."');
  a.equal(I.hint('turn', { oldWay: 'Spreadsheets.', newWay: 'ok' }), null, '13 characters (a closing full stop is the seed\'s own)');
  a.equal(I.hint('turn', { oldWay: 'one two three', newWay: 'ok' }), TURN, '"Not one two three." is four words of hero type');
  a.equal(I.hint('turn', { oldWay: 'Spreadsheet chaos', newWay: 'ok' }), TURN, '17 characters: "Not Spreadsheet chaos." is 22, the pivot holds 18');
  a.equal(I.hint('turn', { oldWay: 'ok', newWay: 'one two three four' }), TURN);
  a.equal(I.hint('turn', { oldWay: 'ok', newWay: 'Better, faster tools' }), TURN, '20 characters');
  a.equal(I.hint('turn', { oldWay: 'Wholesale means stale bread', newWay: 'Local means fresh, on time' }), TURN, 'the review\'s answers, given five-word advice, are now told');
  a.equal(I.hint('ask', 'Book a pilot'), null); a.equal(I.hint('ask', "Let's talk Monday"), null); a.equal(I.hint('ask', 'book, then share'), null);
  a.equal(I.hint('ask', 'Consider the options'), 'Start with a verb: Book, Try, Pick.');
  a.equal(I.hint('ask', 'Approve the pilot budget by Friday'), null, 'SCQA\'s kind of ask starts with a verb too');
  a.equal(I.hint('ask', 'Please book a call'), null);
  a.equal(I.hint('ask', 'Book a call with our team before the end'), "That's 9 words. It's the last line on screen, so try seven or fewer.");
  a.equal(I.hint('ask', ''), null, 'empty is not wrong, just unanswered');
  a.equal(I.hint('audience', new Array(202).join('x')), "That's 201 characters. Aim for 200 or fewer.");
  a.equal(I.hint('ask', 'Book ' + new Array(80).join('y')), "That's 84 characters. Aim for 40 or fewer.");
  a.equal(I.hint('ask', 'Book a 30-minute call by March'), null, '6 words, 30 characters: fits the finale');
  a.equal(I.hint('brand', { brand: new Array(33).join('b'), tagline: 'ok' }), "That's 32 characters. Aim for 18 or fewer.");
  a.equal(I.hint('brand', { brand: 'Northwind Operations Ltd', tagline: 'ok' }), "That's 24 characters. Aim for 18 or fewer.", 'the review\'s brand, which the title slots cut');
  a.equal(I.hint('shortIdea', 'Every operations team gets a day back'), "That's 7 words. Cut it to six or fewer so it fits on one line.");
  a.equal(I.hint('shortIdea', 'Extraordinarily dependable neighbourhood logistics'), "That's 50 characters. Aim for 44 or fewer.");
  a.equal(I.hint('goal', 'inspire'), null); a.equal(I.hint('nope', 'x'), null);
  // a number row with words but no number: the board cannot show a number nobody gave, so the brief asks for it
  a.equal(I.hint('proof', [{ kind: 'number', text: 'fewer hand-offs' }]), 'Add the number itself, so it can count up on screen.');
  a.equal(I.hint('proof', [{ kind: 'quote', text: 'Nice' }, { kind: 'number', text: 'fewer hand-offs', value: '' }]), 'Add the number itself, so it can count up on screen.', 'any row');
  a.equal(I.hint('proof', [{ kind: 'number', text: 'fewer hand-offs', value: 62 }]), null);
  a.equal(I.hint('proof', [{ kind: 'number', text: '', value: 62 }, { kind: 'story', text: 'x' }]), null, 'a number with no words keeps the seed\'s prompt for its meaning');
  a.equal(I.hint('proof', 'nope'), null); a.equal(I.hint('proof', [null, 5]), null);
  // a row longer than its scene holds: a story is one statement line (14 words), a quote 160 characters, a number's words 60
  a.equal(I.hint('proof', [{ kind: 'story', text: "When our oven broke, we baked at a friend's shop and still delivered on time." }]), 'Evidence 1 is 15 words. Keep the line on screen to 14 and tell the rest out loud.');
  a.equal(I.hint('proof', [{ kind: 'demo', text: 'Live: a quote built in three minutes' }]), null);
  a.equal(I.hint('proof', [{ kind: 'quote', text: 'ok', who: new Array(32).join('w') }]), "That's 31 characters. Aim for 30 or fewer.");
  a.equal(I.hint('proof', [{ kind: 'number', value: 3, text: new Array(62).join('n') }]), "That's 61 characters. Aim for 60 or fewer.");
  var s = I.set(I.set(I.blank(), 'bigIdea', w15 + ' sixteen'), 'ask', 'Consider it');
  a.deepEqual(Object.keys(I.hints(s)).sort(), ['ask', 'bigIdea'], 'hints() lists the answered questions that have one');
  a.deepEqual(I.hints(I.blank()), {});
  // hints never block: the over-long answer is stored as typed
  a.equal(I.set(I.blank(), 'bigIdea', w15 + ' sixteen').bigIdea, w15 + ' sixteen');
});

T.test('interview: logline = "For {audience}, this talk shows {shortIdea||bigIdea}, so they {ask}." with empty clauses dropped', function (a) {
  var L = PD.story.interview.logline;
  var base = { audience: 'operations leads', shortIdea: 'Augmentation, not automation', bigIdea: 'The long idea.', ask: 'book a pilot' };
  a.equal(L(base), 'For operations leads, this talk shows Augmentation, not automation, so they book a pilot.');
  a.equal(L({ audience: 'ops', shortIdea: '', bigIdea: 'The long idea.', ask: 'book' }), 'For ops, this talk shows the long idea, so they book.', 'bigIdea stands in for an empty shortIdea');
  a.equal(L({ audience: '', shortIdea: 'Short', bigIdea: 'Long', ask: 'book' }), 'This talk shows Short, so they book.');
  a.equal(L({ audience: 'ops', shortIdea: 'Short', bigIdea: '', ask: '' }), 'For ops, this talk shows Short.');
  a.equal(L({ audience: '', shortIdea: '', bigIdea: 'Only this', ask: '' }), 'This talk shows Only this.');
  a.equal(L({ audience: 'ops', shortIdea: '', bigIdea: '', ask: 'book' }), 'For ops, so they book.', 'a dropped clause is simply gone');
  a.equal(L({ audience: '  ', shortIdea: ' ', bigIdea: '', ask: '' }), '');
  a.equal(L({ audience: 'ops.', shortIdea: 'Short!', bigIdea: '', ask: 'book it...' }), 'For ops, this talk shows Short, so they book it.', 'trailing . ! ? … are trimmed');
  a.equal(L(null), '');
});

T.test('interview: the logline lower-cases the verb of "so they …" and keeps every name the audience and the idea are typed with (open item a)', function (a) {
  var L = PD.story.interview.logline;
  // the ask is the verb slot: a plain Title-case capital goes ("Start with a verb, like Book" invites one)
  a.equal(L({ audience: 'operations leads', shortIdea: 'augmentation, not automation', ask: 'Pilot one workflow in 30 days' }),
    'For operations leads, this talk shows augmentation, not automation, so they pilot one workflow in 30 days.');
  a.equal(L({ audience: 'ops leaders who see AI as headcount reduction', shortIdea: 'Augmentation, not automation', ask: 'Pilot one human-centred use case by Friday', brand: 'Northwind' }),
    'For ops leaders who see AI as headcount reduction, this talk shows Augmentation, not automation, so they pilot one human-centred use case by Friday.', 'AI and Friday stay');
  a.equal(L({ ask: "Let's talk" }), "So they let's talk.", 'an imperative always loses its capital');
  a.equal(L({ ask: 'Book a pilot', brand: 'Book Club' }), 'So they book a pilot.', 'even one that is also a word of the brand');
  a.equal(L({ ask: 'Approve the two-team pilot by 1 Nov' }), 'So they approve the two-team pilot by 1 Nov.', 'any plain Title-case verb');
  a.equal(L({ ask: 'Meet Sarah at stand 4' }), 'So they meet Sarah at stand 4.', 'a verb before a name');
  a.equal(L({ ask: 'Relay every hand-off', brand: 'Relay' }), 'So they Relay every hand-off.', 'a word of the brand that is not an imperative is a name');
  a.equal(L({ ask: 'BOOK NOW' }), 'So they BOOK NOW.', 'all caps');
  // the audience and the idea: a name cannot be told from a word, so they keep the case they were typed in (verifier's cases)
  var idea = 'Augmentation, not automation', ask = 'Book a pilot';
  ['Shopify merchants', 'European retailers', 'Fortune 500 CFOs', 'Series A founders', 'Gen Z shoppers', 'Google Cloud customers',
   'Salesforce admins', 'London nurses', 'Microsoft partners', 'NHS trust leaders', 'Operations leads', 'Monday', 'McKinsey alumni', 'I and my team'].forEach(function (aud) {
    a.equal(L({ audience: aud, shortIdea: idea, ask: ask }), 'For ' + aud + ', this talk shows Augmentation, not automation, so they book a pilot.', 'as typed: ' + aud);
  });
  ['Europe first', 'Relay ends hand-offs', 'AI that helps', 'iPhone repairs in an hour', "I'm wrong about this", 'Augmentation, not automation'].forEach(function (s) {
    a.equal(L({ shortIdea: s, brand: 'Northwind' }), 'This talk shows ' + s + '.', 'as typed: ' + s);
  });
  a.equal(L(PD.compile('one-giant-leap').source.meta.story), 'This talk shows Augmentation, not automation.', 'the One Giant Leap sample: its slogan as typed');
  // the one exception: a leading article, pronoun or determiner (STOPWORDS) that does not start a capitalised name
  a.equal(L({ audience: 'The ops team', bigIdea: 'The next leap is augmentation.' }), 'For the ops team, this talk shows the next leap is augmentation.');
  a.equal(L({ audience: 'Our clients', shortIdea: 'A better way' }), 'For our clients, this talk shows a better way.');
  a.equal(L({ audience: 'The Hague delegates', shortIdea: 'A Team that ships' }), 'For The Hague delegates, this talk shows A Team that ships.', 'the next word has a capital: part of a name');
  a.equal(L({ audience: 'The ops team', brand: 'The Agency' }), 'For the ops team.', 'a stopword of the brand is still a stopword');
  a.equal(L({ shortIdea: '"The" box is gone' }), 'This talk shows "the" box is gone.', 'a leading quote mark');
});
