# The story tools

Behind the Studio sits a small set of story tools, `PD.story`. They help you **structure** a talk; they never write your
sentences. Everything is rules and tables, runs offline and gives the same answer every time.

| Tool | What it does | Where you meet it in the Studio |
|---|---|---|
| **Interview** | ten skippable questions about the talk | ① Brief |
| **Frameworks** | five story shapes, each a list of *beats* (jobs the talk has to do) | ② Shape |
| **Storyboard** | turns your answers and a shape into a first list of scenes | ② Shape, "Build my storyboard" |
| **Timing** | estimates how long each scene and the whole talk run | ④ Storyboard's arc, ⑤ Rehearse |
| **Director** | checks story, pace, copy and visuals, and gives a score | ④ Storyboard's right-hand panel |
| **Copy** | the word budgets per text style and every message the guide shows | everywhere |

The first half of this guide is plain language. The reference starts at [The story model](#the-story-model).

---

## In plain words

**A framework is a shape for your story.** "One Giant Leap" goes spark → name → zoom out → you are here → human truth →
pattern → the box → the leap → callback. "Problem, solution, future" goes hook → problem → insight → solution → proof →
future → ask. Each step is a **beat**, and each beat has a job (a *role*): hook, proof, turn, call to action. The Studio
recommends a shape from your answers: a talk that must get a decision gets "Situation, complication, question, answer"; an
inspiring talk in the cinematic tone gets "One Giant Leap".

**The storyboard is a first draft of scenes, not of words.** It gives each beat one or more scenes, picks a template that
suits the beat and the look, and fills in what you already told it (your brand, your old way and new way, your proof). Where
it needs words only you can write, it leaves a prompt in curly brackets, such as `{opening line}`.

**The Director reads the whole deck like a coach.** It flags what an audience would feel: no clear ask, the big idea never
coming back at the end, four scenes in a row at the same energy, a slide with 40 words on it, a line too long for its
style. Each note says where it is and how to fix it, and you can tell it to ignore a note for one scene. Errors drop the
score by 15, warnings by 5, tips by 1. "Ready for the stage" just means no errors; it never stops you presenting.

**Timing** adds up, for every moment of every scene, how long the animation takes, how long it holds, and how long your
notes take to say at 140 words a minute, whichever is longer. That gives the estimated runtime against your slot.

---

## The story model

The answers live in the deck as `meta.story`:

```text
StoryMeta = {
  framework: 'giant-leap' | 'sparkline' | 'psf' | 'scqa' | 'blank',
  goal: 'inspire' | 'persuade' | 'decide' | 'launch' | 'update' | 'teach' | null,
  audience: string, targetMin: number | null,      // the slot in minutes; null = unknown (the runtime check is skipped)
  bigIdea: string, shortIdea: string,              // the one sentence, and the same in six words or fewer
  oldWay: string, newWay: string, ask: string,
  proof: [{ kind: 'number' | 'quote' | 'story' | 'demo', text, value?, who? }],   // at most 3
  brand: string, tagline: string, tone: 'cinematic' | 'warm' | 'crisp' | 'playful' | null
}
```

Scenes carry story metadata too, which the renderer ignores: `beat` (the beat it serves), `energy` (1 to 5; default the
template's), `point` (the one thing it says), `like` (for a raw scene, the template it plays the part of), `flashback`
(exempt from the beat-order rule) and `lint: { ignore: [ruleId] }`. Roles are `hook`, `setup`, `identity`, `scale`,
`relevance`, `emotion`, `proof`, `tension`, `turn`, `idea`, `climax`, `resolution`, `cta`, `callback`
(`PD.story.ROLES`).

The story tools are engine modules loaded on every deck page (with the rest of the engine) but registered
`{ export: false }`: a one-file export does not carry them, because a presentation does not need them.

## Frameworks

```text
Framework = { id, name, bestFor, turns: number | null, beats: Beat[] }
Beat = { id, label, roles: string[], share /* of the runtime */, energy: 1..5, required, min, max /* scenes */,
         ask /* the question for the author */, example, templates: string[] /* in order of preference */ }
```

| Framework | Best for | Turns | Beats (`?` = optional, scenes min–max) |
|---|---|---|---|
| `giant-leap` · One Giant Leap | vision keynotes, brand openers and "why change now" talks | 1 | spark 1 · name 1 · zoom-out? 0–2 · you-are-here 1–2 · human-truth 1–2 · pattern 1–3 · the-box 1–2 · the-leap 1 · callback 1 |
| `sparkline` · What is / what could be | persuading people to change | 2 | what-is 1 · could-be 1 · contrast 2–4 · call-to-action 1 · new-bliss 1 |
| `psf` · Problem, solution, future | launches and proposals | 1 | hook 1 · problem 1–2 · insight 1 · solution 1–2 · proof 1–3 · future? 0–1 · ask 1 |
| `scqa` · Situation, complication, question, answer | executive briefings | 1 | situation 1 · complication 1 · question? 0–1 · answer 1 · support 1–3 · ask 1 |
| `blank` · Blank | building the arc yourself | — | none: every beat rule is skipped and the storyboard starts empty |

Every beat lists at least one template that works under every look. The recommendation, first match wins
(`PD.story.RECOMMEND`):

| Goal (and tone) | Recommended | Runner-up |
|---|---|---|
| decide | scqa | psf |
| launch | psf | sparkline |
| update | scqa | psf |
| teach | psf | scqa |
| inspire, with the cinematic tone | giant-leap | sparkline |
| inspire or persuade | sparkline | giant-leap |
| anything else | sparkline | giant-leap |

The look follows the tone: cinematic → Cosmos, anything else → Slate (`PD.story.defaultTheme(tone)`).

```js
var S = PD.story;
console.log(S.frameworks().map(function (f) { return f.id; }));   // ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']
var rec = S.recommend({ goal: 'decide', tone: 'crisp' });
console.log(rec.id, rec.runnerUp, S.defaultTheme('crisp'));       // scqa psf slate
var fw = S.framework('scqa');
console.log(fw.beats.map(function (b) { return b.id; }), S.beatIndex(fw, 'answer'));   // ['situation', …, 'ask'] 3
console.log(S.energyCurve(fw)[0], S.idealEnergy(fw, 0.5).toFixed(2));   // { beat: 'situation', mid: 0.05, energy: 2 } 4.09
console.log(S.pickText({ goal: 'decide', targetMin: 10 }, 'scqa'));
// Here's the shape we'd suggest. You want to decide in 10 minutes, and Situation, complication, question, answer is built for executive briefings.
```

`frameworks()` lists every registered framework, `framework(id)` returns one (or `null`), `energyCurve(fw)` gives each
beat's energy at the middle of its share (the dotted "ideal" line in the Studio), and `idealEnergy(fw, pos)` reads that
line at a position from 0 to 1. To add a framework, see [plugins.md](plugins.md#frameworks).

## The interview

`PD.story.interview` holds the ten questions and works on a StoryMeta without touching the page:

| # | Question | Fills | Input | Hint when |
|---|---|---|---|---|
| 1 | What should this talk do? | `goal` | choice | — |
| 2 | Who's in the room, and what do they believe today? | `audience` | text, ≤ 200 | — |
| 3 | How long is your slot? | `targetMin` | 1–90 minutes | — |
| 4 | If they remember one sentence, what is it? | `bigIdea` | text, ≤ 200 | more than 15 words |
| 5 | Now say it in six words or fewer. | `shortIdea` | text, ≤ 80 | more than 6 words |
| 6 | What do they believe now, and what should they believe after? | `oldWay`, `newWay` | two fields | a side over 5 words |
| 7 | What should they do by next week? | `ask` | text, ≤ 80 | the first word is not a verb from the list |
| 8 | Your three strongest pieces of evidence | `proof` | three rows | a number row with no number |
| 9 | Who are you, in one line? | `brand`, `tagline` | two fields | — |
| 10 | What should it feel like? | `tone` | choice | — |

Every question can be skipped; hints never block. Step ① counts as done once `bigIdea` and `targetMin` are answered.

```js
var IV = PD.story.interview;
var story = IV.blank();
story = IV.set(story, 'goal', 'persuade');
story = IV.set(story, 'audience', 'Ops leaders who see AI as a way to cut headcount');
story = IV.set(story, 'targetMin', 12);
story = IV.set(story, 'bigIdea', 'The next leap is augmentation, not automation');
story = IV.set(story, 'turn', { oldWay: 'automation', newWay: 'augmentation' });
story = IV.set(story, 'ask', 'Pilot one human-centred use case');
console.log(IV.progress(story));            // { answered: 6, total: 10, done: true }
console.log(IV.hint('ask', 'Maybe a pilot'));  // Start with a verb: Book, Try, Pick.
console.log(IV.logline(story));
// For Ops leaders who see AI as a way to cut headcount, this talk shows the next leap is augmentation, not automation, so they pilot one human-centred use case.
```

The API: `questions` (each `{ n, id, fields, title, help, input, flows }`), `question(id)`, `blank()`, `get(story, id)`,
`patch(id, value)` (the fields one answer sets), `set(story, id, value)` (a new story; the input is never changed),
`clean(story)` (trims every string), `answered(story, id)`, `progress(story)`, `done(story)`, `hint(id, value)`,
`hints(story)`, `logline(story)`, and the choice values `GOALS` and `TONES`.

## The storyboard

`PD.story.board(story, { framework?, theme?, worlds?, assets? })` → a list of template scenes, ready for `deck.scenes`.

1. **How many scenes:** your slot in minutes × 60 / 50, rounded, but at least one per required beat and at most 24 (and
   no more than the beats can hold). With no slot, one per required beat.
2. **Which beat gets them:** every required beat gets its minimum, the rest go by each beat's share.
3. **Which template:** the first of the beat's templates that the look can play. Proof beats use your proof rows in
   order (a number → `big-number`, a quote → `quote`, a story or demo → `statement`); an identity beat uses `logo` when you
   have a logo picture; an emotion or resolution beat uses `image` once when you have a photo. When a beat gets several
   scenes, they rotate through its templates so it is not the same shot twice.
4. **What words:** the template's [seed](templates.md#placeholders-and-seeds), with your answers filled in.
5. **Notes and points:** each scene's notes start as the beat's question (`▸ What tiny beginning does your story grow
   from?`) and its `point` names the beat. Lines starting with ▸ are prompts, not words to say: timing does not count them.

```js
var story = Object.assign(PD.story.interview.blank(), {
  goal: 'launch', targetMin: 6, brand: 'Acme', tagline: 'Tools for small teams',
  oldWay: 'spreadsheets', newWay: 'one shared tool', ask: 'Book a demo this week',
  proof: [{ kind: 'number', text: '% of teams still on spreadsheets', value: 62 }]
});
var scenes = PD.story.board(story, { framework: 'psf', theme: 'slate' });
scenes.forEach(function (s) { console.log(s.id, s.template, JSON.stringify(s.props)); });
// hook cold-open {"line":"{opening line}"}
// problem statement {"line":"{your line}"}
// insight pivot {"kicker":"The turn","from":"Not spreadsheets.","to":"One shared tool.","subtitle":"{shortIdea}"}
// solution brand-reveal {"title":"Acme","subtitle":"Tools for small teams"}
// proof big-number {"value":62,"label":"of teams still on spreadsheets","suffix":"%"}
// future statement {"line":"{your line}"}
// ask finale {"title":"Acme","subtitle":"Book a demo this week"}
console.log(PD.story.board.plan(story, PD.story.framework('psf')));   // { n: 7, asked: 7, required: 6, counts: {…}, capacity: 11 }
```

`board.plan(story, framework)` returns step 1 on its own: `n` (scenes the board will make), `asked` (what the slot asked
for; above `n` when the shape cannot hold that many), `required`, `counts` per beat and `capacity`. `board.tokens(story)`
and `board.fill(value, tokens)` do step 4 for any value.

## Placeholders

A `{…}` in a template's words is one of two things:

- a **story token**, `{brand}`, `{tagline}`, `{bigIdea}`, `{shortIdea}`, `{oldWay}`, `{newWay}`, `{ask}`, `{audience}`,
  `{proof1}`, `{proof2}`, `{proof3}` (`PD.story.STORY_TOKENS`): the storyboard replaces it with your answer. An unanswered
  question leaves its token in place.
- a **prompt for you**, anything else, such as `{opening line}` or `{a big number}`: it stays until you write the line.

The storyboard never invents a line to fill a prompt. Instead, every `{…}` (or "lorem", or "TODO") left in visible text is a
`copy.placeholder` error in the Director, so the Studio's checklist shows exactly what is left to write. With every story
token answered, only the prompts remain.

```js
var S = PD.story;
console.log(String(S.PLACEHOLDER), S.isStoryToken('{brand}'), S.isStoryToken('{opening line}'));   // /\{[^{}]{1,40}\}/ true false
console.log(S.placeholderIn('Hello {name}'), S.placeholders({ title: '{brand}', items: ['{point}', 'done'] }));   // {name} ['{brand}', '{point}']
```

## Timing

For scene *i* at moment *k* (0 = as it opens, *k* = after *k* clicks):

- **animation** = seconds until everything has stopped moving (simulated on a hidden stage, at most 30 s);
- **hold** = `dwell` (3 s by default) on the last moment, `stepDwell[k]` or the step's `dwell` (2.5 s) before that;
- **speech** = the words of that moment's notes at 140 a minute; a scene with no notes at all uses the template's usual talk
  time (20 s for a raw scene with nothing to go on);
- the moment lasts **max(animation + hold, speech)**; a scene is the sum of its moments; the talk is the sum of its scenes.

```js
PD.deck('timing-demo', { format: 2, id: 'timing-demo', meta: { title: 'Timing', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'Short.' }, notes: 'One two three four five six seven eight nine ten.' },
           { id: 'b', template: 'big-number', props: { value: 7, label: 'days' } }] });
var c = PD.compile('timing-demo');
var est = PD.story.estimate(c);                     // instant, analytic
console.log(Math.round(est.total), est.exact, est.scenes.map(function (s) { return Math.round(s.sec); }));   // 48 false [8, 40]
PD.story.timing(c).then(function (t) {              // simulated in idle slices
  console.log(t.exact, Math.round(t.total));        // true 48 (the simulation can differ by a fraction of a second)
});
```

- `estimate(compiled)` → Timing, synchronous. `timing(compiled, { sliceMs, onProgress, schedule, cache })` → a promise
  of the simulated Timing (it never rejects; `.cancel()` resolves it with `null`).
- `retime(compiled, timing?)` recomputes with the current notes and dwell, reusing the simulated animation times of
  unchanged scenes; it is what the Studio uses after an edit.
- Timing = `{ v: 1, id, exact, total, animDwell, scenes: [{ i, id, key, akey, start, sec, states: [{ k, anim, dwell,
  speak, sec }] }] }`.
- `resolveStates(compiled, i)` lists what scene *i* shows at each moment without a stage; `worldDefaults(compiled)` gives
  the world parameters before any scene changes them.

## The Director

`PD.story.lint(compiled, timing?)` → `{ findings, score, ready, counts, summary, estimated, total, timing, ruleErrors, ms }`.

```js
PD.deck('lint-demo', { format: 2, id: 'lint-demo',
  meta: { title: 'Lint', theme: 'slate', story: Object.assign(PD.story.interview.blank(), { framework: 'blank', targetMin: 1,
          bigIdea: 'Small teams deserve big-company tools' }) },
  scenes: [{ id: 'a', template: 'statement', props: { line: '{your line}' }, point: 'The problem',
             notes: 'Open with the problem small teams face every week.' },
           { id: 'b', template: 'finale', props: { title: 'Acme', subtitle: 'Small teams, big-company tools' }, point: 'The promise',
             notes: 'Close on the promise, then stop talking.' }] });
var res = PD.story.lint(PD.compile('lint-demo'));
console.log(res.score, res.ready, res.summary);
res.findings.forEach(function (f) { console.log(f.sev, f.id, f.scene == null ? '(deck)' : 'scene ' + (f.scene + 1), f.msg); });
// 65 false 2 to fix, 1 to consider, 0 tips.
// error pace.runtime (deck) This runs about 0.4 min in a 1-min slot.
// error copy.placeholder scene 1 Scene 1 still has placeholder text.
// warn story.idea-echo (deck) The ending doesn't echo your big idea.
```

- `score = max(0, 100 − 15 × errors − 5 × warnings − 1 × tips)`; `ready` = no errors.
- Each finding is `{ id, sev, area, scene?, sceneId?, step?, msg, fix, vars }`, errors first, then warnings, then tips.
- `scene.lint.ignore: ['rule.id']` silences a rule for that scene (the Studio's "Ignore for this scene").
- Problems `PD.validate` finds (and failed templates) appear as `build.<code>` findings with their own level.
- A deck without `meta.story` has no brief, so the rules that read the brief are skipped: big idea, beats, turns, call to
  action and runtime (`story.idea-*`, `story.beats-missing`, `story.unassigned`, `story.beat-order`, `story.turns`,
  `story.turn-position`, `story.cta`, `story.beat-share`, `pace.runtime`, `pace.arc-drift`). Every other rule still runs,
  `story.hook`, `story.thanks-ending`, `story.bookend` and `story.point` included. The `blank` framework skips the rules
  that need beats.
- `PD.story.lint.clearCache()` forgets text measurements (after an embedded font has loaded).

The rules (`PD.story.rules()`):

| Area | Rule | Level | Fires when |
|---|---|---|---|
| story | `story.idea-missing` | error | there is no big idea |
| | `story.idea-long` | warn | the big idea is over 15 words |
| | `story.beats-missing` | error | a required beat has no scene |
| | `story.unassigned` | warn | a template scene serves no beat of the framework |
| | `story.beat-order` | warn | a scene's beat comes before the previous scene's (flashbacks exempt) |
| | `story.hook` | warn | the first scene's template is not a good opener |
| | `story.idea-early` | warn | the big idea does not show up in the first third |
| | `story.idea-echo` | warn | the last quarter's on-screen text does not echo the big idea |
| | `story.turns` | error if none, else warn | the number of turning points differs from the framework's |
| | `story.turn-position` | warn | the turn lands more than 20 % from where the shape expects it |
| | `story.cta` | warn | no call-to-action scene states the ask or starts with a verb |
| | `story.thanks-ending` | info | the last scene's biggest text is "thank you" or "questions" |
| | `story.bookend` | info | the ending repeats nothing from the opening |
| | `story.beat-share` | info | a beat takes over twice, or under 0.4 times, its usual share |
| | `story.point` | info | a template scene has no `point` |
| pace | `pace.runtime` | warn above 15 %, error above 35 % | the estimate misses the slot (info when no slot is set) |
| | `pace.flatline` | warn | 4 or more scenes in a row at the same energy |
| | `pace.no-peak` | warn | no scene reaches energy 4 |
| | `pace.peak-early` | info | the last peak comes before halfway |
| | `pace.arc-drift` | info | the energy strays from the framework's ideal line |
| | `pace.dense-run` | warn | three text-heavy scenes in a row (16 visible words or more) |
| | `pace.wall` | error | more than 30 words on screen at once |
| | `pace.long-hold` | warn | one picture held for over 2 minutes |
| | `pace.steps` | warn | more than 8 clicks in one scene |
| | `pace.reveal-wait` | warn | the last words land more than 8 s in |
| copy | `copy.style-words` | warn | a line has more words than its style's budget (below) |
| | `copy.lines` | warn | a line wraps onto more lines than its style allows, or overflows |
| | `copy.small` | warn | text under 20 px, or a caption or label over 5 words |
| | `copy.one-hero` | warn | two headlines (`hero` or `mega`) on screen at once |
| | `copy.placeholder` | error | a `{…}`, "lorem" or "TODO" is still on screen |
| | `copy.jargon` | info | words such as "leverage", "synergy", "seamless", "game-changer" |
| | `copy.over-sun` | warn | text sits within 200 px of a bright sun |
| | `copy.notes` | warn | a scene has fewer than 3 words of notes |
| visual | `vis.teleport` | warn | a jump between very different places with no transition |
| | `vis.warp` | warn | hyperspace more than once per 6 scenes |
| | `vis.particle-type` | info | too many lines assembled from particles |
| | `vis.palette` | warn | more than 4 custom text colours, 2 fonts or 5 nebulae |
| | `vis.asset-source` | error | a picture is not embedded |
| | `vis.particle-budget` | warn above 8,000, error above 9,000 | a moment asks for too many particles |

Add a rule with `PD.story.rule({ id, sev, area, check(ctx) → [{ scene?, step?, vars, sev?, msg?, fix? }], msg, fix })`.
`msg` and `fix` fill `{tokens}` from `vars` (`{i}` is the scene number). `ctx` describes the deck scene by scene; see the
header of `engine/story/lint.js` for every field.

```js
PD.module('decks/demo/rules', [], function (PD) {
  PD.story.rule({ id: 'house.no-exclamation', sev: 'info', area: 'copy',
    msg: 'Scene {i} shouts: "{str}".', fix: 'Let the words carry the energy, not the punctuation.',
    check: function (ctx) {
      var out = [];
      ctx.scenes.forEach(function (s) { s.texts.forEach(function (t) { if (/!/.test(t.str)) out.push({ scene: s.i, vars: { str: t.str } }); }); });
      return out;
    } });
  return {};
}, { export: false });

PD.deck('rule-demo', { format: 2, id: 'rule-demo', meta: { title: 'Rule', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'We did it!' }, notes: 'Say it calmly.' }] });
var f = PD.story.lint(PD.compile('rule-demo')).findings.filter(function (x) { return x.id === 'house.no-exclamation'; })[0];
console.log(f.msg);   // Scene 1 shouts: "We did it!".
```

## Copy: budgets and the guide's voice

The word budget per text style (`PD.story.BUDGET`), which the Director's copy rules and the Studio's live counters use:

| Style | Words | ≈ characters | Lines | Voice |
|---|---|---|---|---|
| mega | 2 | 10 | 1 | numerals, never a sentence |
| hero | 3 | 14 | 1 | a noun phrase, or one word with a period; one per shot |
| title | 5 | 24 | 1 | a concrete fact of scale |
| statement | 14 | 47 per line | 3 | spoken, present tense |
| subtitle | 7 | 40 | 1 | a tagline, no period |
| kicker | 5 | 30 | 1 | the first half of a sentence |
| body | 30 | 64 per line | 4 | last resort |
| year | 2 | 14 | 1 | |
| label | 4 | 22 | 1 | |
| caption | 6 | 40 | 1 | |

`PD.story.DEVICES` are the copy devices the editor suggests: split sentence, "Not X. Y.", number then meaning, callback,
one accent, silence beats.

Every sentence the guide shows is in `PD.story.COPY`, written in the second person, at most two sentences, ending with
something to do, and never saying "error" or "invalid". `say(key, vars)` fills its `{tokens}`; `{n|one|many}` picks a
plural:

```js
var S = PD.story;
console.log(S.say('lint.summary', { e: 1, w: 3, i: 1 }));   // 1 to fix, 3 to consider, 1 tip.
console.log(S.say('export.fontWarn', { font: 'Avenir Next' }));
// This deck uses Avenir Next, which only exists on Macs. Drop a font file in to embed it.
console.log(S.BUDGET.statement.words, S.words('  three little words '), S.startsImperative('Book a demo'));   // 14 3 true
console.log(S.jargonIn('We leverage seamless synergy'), S.echo('augmentation not automation', 'Augment, do not automate'));
// ['leverage', 'seamless', 'synergy'] true
```

Keys of `COPY`: `welcome`; the interview's `q.goal`, `q.audience`, `q.targetMin`, `q.bigIdea`, `q.bigIdea.long`,
`q.shortIdea`, `q.shortIdea.long`, `q.turn`, `q.turn.long`, `q.ask`, `q.ask.verb`, `q.proof`, `q.proof.value`, `q.brand`,
`q.tone`, `q.max`; `fw.pick`, `fw.pick.open`, `board.emptyBeat`, `board.placeholder`; the Director's `lint.clean`,
`lint.summary`, `lint.ready`, `lint.notReady`, `lint.ignore`; `assets.drop`, `assets.tainted`, `assets.heic`,
`assets.solidLogo`; `save.local`, `save.quota`, `export.done`, `export.fontWarn`. `COPY_PARTS` holds the interview questions
split into a title and a help line.

The text helpers: `words(s)`, `tokens(s)` (lower-case words without stopwords, keeping "not"), `match(a, b)` (equal, or
the same first five letters), `echo(bigIdea, text)` (at least two words of the big idea come back), `firstWord(s)`,
`startsImperative(s)`, `jargonIn(s)`, `speech(notes)` (notes without the ▸ prompt lines), `fmt(str, vars)`, and the word
lists `STOPWORDS`, `IMPERATIVES` and `JARGON`.
