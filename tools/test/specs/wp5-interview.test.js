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
  a.equal(Q[1].input.max, 200); a.equal(Q[3].input.max, 200); a.equal(Q[6].input.max, 80);
  a.deepEqual(Q[8].input.fields.map(function (f) { return f.max; }), [30, 40]);
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
  a.equal(I.hint('turn', { oldWay: 'one two three four five', newWay: 'ok' }), null);
  a.equal(I.hint('turn', { oldWay: 'ok', newWay: 'one two three four five six' }), 'Try five words or fewer on each side.');
  a.equal(I.hint('ask', 'Book a pilot'), null); a.equal(I.hint('ask', "Let's talk Monday"), null); a.equal(I.hint('ask', 'book, then share'), null);
  a.equal(I.hint('ask', 'Consider the options'), 'Start with a verb: Book, Try, Pick.');
  a.equal(I.hint('ask', ''), null, 'empty is not wrong, just unanswered');
  a.equal(I.hint('audience', new Array(202).join('x')), "That's 201 characters. Aim for 200 or fewer.");
  a.equal(I.hint('ask', 'Book ' + new Array(80).join('y')), "That's 84 characters. Aim for 80 or fewer.");
  a.equal(I.hint('brand', { brand: new Array(33).join('b'), tagline: 'ok' }), "That's 32 characters. Aim for 30 or fewer.");
  a.equal(I.hint('goal', 'inspire'), null); a.equal(I.hint('nope', 'x'), null);
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
  a.equal(L({ audience: 'ops', shortIdea: '', bigIdea: 'The long idea.', ask: 'book' }), 'For ops, this talk shows The long idea, so they book.', 'bigIdea stands in for an empty shortIdea');
  a.equal(L({ audience: '', shortIdea: 'Short', bigIdea: 'Long', ask: 'book' }), 'This talk shows Short, so they book.');
  a.equal(L({ audience: 'ops', shortIdea: 'Short', bigIdea: '', ask: '' }), 'For ops, this talk shows Short.');
  a.equal(L({ audience: '', shortIdea: '', bigIdea: 'Only this', ask: '' }), 'This talk shows Only this.');
  a.equal(L({ audience: 'ops', shortIdea: '', bigIdea: '', ask: 'book' }), 'For ops, so they book.', 'a dropped clause is simply gone');
  a.equal(L({ audience: '  ', shortIdea: ' ', bigIdea: '', ask: '' }), '');
  a.equal(L({ audience: 'ops.', shortIdea: 'Short!', bigIdea: '', ask: 'book it...' }), 'For ops, this talk shows Short, so they book it.', 'trailing . ! ? … are trimmed');
  a.equal(L(null), '');
});
