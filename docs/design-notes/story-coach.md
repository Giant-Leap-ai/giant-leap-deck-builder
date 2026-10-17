# Pixeldeck Studio: story backbone (narrative design spec)

**Principle.** The studio coaches story structure. It doesn't write the speaker's sentences for them. Everything here runs on deck data in the browser, with no LLM, and it needs nothing beyond what the engine already has:
- `Stage.prototype.resolve(slide, step)` returns the resolved world and the visible text for any step.
- `TextLayer.layout()` returns real line widths.

There are three layers:
- **STORY** holds the interview answers.
- **Beats** come from the chosen framework.
- **Scenes** are built from templates.

The checker reads all three.

## 0. Data contract (protects One Giant Leap)

Story metadata lives in a **sidecar file keyed by scene id**. The player never reads it, so `scenes.js` doesn't change and the One Giant Leap deck renders exactly as it does now. Nothing in `_archive/` is touched.

```js
// decks/one-giant-leap/story.js   (classic script; loaded by the studio only)
STORY = {
  framework: 'giant-leap', targetMin: 9, tone: 'cinematic', feel: ['awe', 'hope'],
  goal: 'inspire', audience: '', do: '',
  bigIdea: 'The next giant leap is augmentation, not automation: technology that makes work more human.',
  brand: 'One Giant Leap', tagline: 'Making work more human', oldWay: 'automation', newWay: 'augmentation',
  scenes: {
    spark:  { beat: 'spark',        template: 'cold-open' },
    title:  { beat: 'name',         template: 'brand-reveal' },
    warp:   { beat: 'zoom-out',     template: 'hyperspace' },
    galaxy: { beat: 'you-are-here', template: 'galaxy-reveal' },
    home:   { beat: 'you-are-here', template: 'planet' },
    sunrise:{ beat: 'human-truth',  template: 'sunrise' },
    leaps:  { beat: 'pattern',      template: 'timeline' },
    box:    { beat: 'the-box',      template: 'the-box' },
    next:   { beat: 'the-leap',     template: 'pivot' },
    thanks: { beat: 'callback',     template: 'finale' }
  }
};
```

Optional per-scene fields:
- `energy` (1–5), overrides the template default.
- `talk` (seconds), overrides the runtime estimate.
- `pole` (`'is'` or `'could'`), used by Sparkline.
- `flashback` (true), exempts the scene from the beat-order rule.
- `lint: { ignore: [ruleId] }`, suppresses a rule for that scene.

Proposed files:
- `engine/story/frameworks.js` defines `PD.FRAMEWORKS`, `PD.STORY_TEMPLATES` and `PD.STYLE_BUDGET`.
- `engine/story/lint.js` defines `PD.LINT = [{id, sev, area, msg, fix, check(ctx)}]`.
- `engine/story/interview.js`.

## 1. Scene templates (story view)

The ten templates in the upper half come from the One Giant Leap deck (`cinema/scenes.js`). The rest are new. Rename them to match whatever the template catalog ends up calling them.

| template | source in One Giant Leap | energy | talk s (+ per step) | text slots |
|---|---|---|---|---|
| cold-open | spark | 2 | 20 | statement |
| brand-reveal | title | 4 | 30 | hero (particles) + subtitle |
| hyperspace | warp | 5 | 20 (+20) | title ×1–2 |
| galaxy-reveal | galaxy | 3 | 40 (+20) | kicker + statement; caption step |
| planet | home | 2 | 40 | kicker + statement |
| sunrise | sunrise | 4 | 45 | kicker + statement |
| timeline | leaps | 3 | 15 (+20) | kicker + statement; year + label per step |
| the-box | box | 3 | 45 (+20) | statement → hero + subtitle |
| pivot | next | 5 | 40 (+20) | kicker, hero "Not X." → hero "Y." + subtitle |
| finale | thanks | 4 | 30 | hero + subtitle |
| big-number | new | 4 | 40 | mega (particles) + statement |
| statement | new | 2 | 45 | kicker + statement |
| quote | new | 2 | 40 | statement + caption (attribution) |
| question | new | 3 | 30 | title or statement, then silence |
| three-points | new | 3 | 20 (+30) | kicker; label + statement per step |
| before-after | new | 3 | 60 (+20) | two statements (grey on the left, gold on the right) |
| asset-reveal | new | 3 | 30 | image sampled into particles + subtitle |
| cta | new | 4 | 30 | hero (imperative) + caption (URL) |

`HOOK_SET` = cold-open, big-number, question, quote, statement, hyperspace.

## 2. Narrative frameworks

Schema: `{ id, name, bestFor, turns, beats: [{ id, role, share, energy, req, repeat, ask, example, templates }] }`.

- **Roles:** hook, setup, identity, scale, relevance, emotion, proof, tension, turn, idea, climax, resolution, cta, callback. A beat can hold several roles, written with commas.
- **share** is the beat's typical fraction of runtime.
- **energy (E)** is 1–5. It drives the arc chart: the ideal curve plots each beat's energy at the midpoint of its share.

### F1 `giant-leap`: the One Giant Leap arc (turns: 1)
Best for vision keynotes, brand openers and "why change now" talks.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| spark | hook | .05 | 2 | Y | What tiny beginning does your story grow from? | "Every giant leap begins with a single spark." | cold-open |
| name | identity | .07 | 4 | Y | Who are you, in one line? | "One Giant Leap / Making work more human" | brand-reveal, asset-reveal |
| zoom-out | scale | .10 | 5 | – | What's the biggest frame your topic lives in? | "13.8 billion years" | hyperspace, big-number, galaxy-reveal |
| you-are-here | relevance | .13 | 3 | Y | Where is your audience inside that frame? | "Somewhere in all of this / there is one small, blue world." | galaxy-reveal, planet |
| human-truth | emotion | .12 | 4 | Y | What has always been true about people? | "For 300,000 years / we have thought outside the box." | sunrise, statement, quote |
| pattern | proof | .18 | 3 | Y | Which 3–7 moments prove that truth? | "1440 · The printing press" | timeline, three-points |
| the-box | tension | .12 | 3 | Y | What box is your audience in today? | "Every breakthrough began as an idea that didn't fit." | the-box, before-after |
| the-leap | turn | .13 | 5 | Y | What's the old answer, and what's yours? | "Not automation." → "Augmentation." | pivot |
| callback | callback, cta | .10 | 4 | Y | Which opening image comes back, changed, and what do they do now? | "One Giant Leap / Let's make the next one together" | finale, cta |

### F2 `sparkline`: Duarte's what is / what could be (turns: 2)
Best for persuading people to change or adopt something.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| what-is | hook, setup | .08 | 2 | Y | What does their world honestly look like today? | "Your best people spend 40% of the week copy-pasting." | cold-open, big-number, statement |
| could-be | turn | .10 | 4 | Y | What could it be instead? | "What if that 40% went back to customers?" | sunrise, question |
| contrast | proof | .50 | 3 | Y ×2–4 | What's true now, and what's possible? Alternate `pole` between them. | "Today: 3 days to quote. Tomorrow: 3 minutes." | before-after, big-number, quote, three-points |
| call-to-action | turn, cta | .15 | 5 | Y | What must they do, or give up? | "Pick one workflow. Augment it in 30 days." | pivot, cta |
| new-bliss | resolution, callback | .17 | 4 | Y | What does their world look like after they act? | "Work that feels human again." | sunrise, finale |

### F3 `story-spine`: the Pixar story spine (turns: 1)
Best for origin stories, case studies and culture talks.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| once | hook, setup | .10 | 2 | Y | Who is the hero, and where are they? | "Once, a 12-person firm in Leeds…" | cold-open, planet, statement |
| every-day | setup | .10 | 2 | Y | What did they do every day? | "Every month-end, they worked past midnight." | statement, big-number |
| one-day | turn | .10 | 4 | Y | What changed? | "Until one day a client asked: why a week?" | pivot, question |
| because | proof | .35 | 3 | Y ×2–3 | Because of that, what happened next? | "Because of that, they mapped every task." | timeline, three-points, before-after |
| finally | climax | .15 | 5 | Y | When did it pay off? | "Until finally, month-end took one afternoon." | big-number, sunrise |
| ever-since | resolution | .12 | 3 | Y | What has been different ever since? | "Ever since, Fridays are for clients." | statement, quote |
| moral | idea, cta | .08 | 4 | Y | What's the lesson, and what's the ask? | "Give people back their time. Start with one process." | finale, cta |

### F4 `psf`: problem → solution → future (turns: 1)
Best for product launches and proposals.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| hook | hook | .08 | 3 | Y | Which image or number makes the pain visible? | "11 tabs. 4 logins. 1 customer waiting." | cold-open, big-number |
| problem | tension | .20 | 3 | Y | Who hurts, how much, and what does it cost? | "Every hand-off loses a day." | statement, big-number, the-box |
| insight | turn | .12 | 4 | Y | What do you see that others miss? | "It's not the people. It's the seams." | pivot, question |
| solution | idea | .20 | 5 | Y | Can you name your answer in 3 words? | "Meet Relay." | brand-reveal, asset-reveal |
| proof | proof | .20 | 3 | Y | What's your evidence: a demo, a case, a number? | "Pilot: 62% fewer hand-offs." | big-number, quote, three-points |
| future | resolution | .12 | 4 | – | What becomes possible next? | "Every team, with a co-pilot." | sunrise, statement |
| ask | cta | .08 | 4 | Y | Exactly what should they do, and by when? | "Start a 30-day pilot." | cta, finale |

### F5 `scqa`: situation, complication, question, answer / pitch (turns: 1)
Best for exec briefings and funding asks. The answer comes first, before the proof.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| situation | hook, setup | .10 | 2 | Y | What does everyone in the room already agree on? | "AI is now in every tool we buy." | statement, big-number |
| complication | tension | .15 | 3 | Y | What changed, or what broke? | "Adoption has stalled at 12%." | big-number, the-box |
| question | setup | .05 | 3 | – | What question does that raise? | "So how do we get value, not just licences?" | question |
| answer | turn, idea | .15 | 5 | Y | What's your answer, in one sentence? | "Augment roles, not tasks." | pivot, statement |
| support | proof | .40 | 3 | Y ×3 | What are your three supporting points? | "1 · Redesign the role first" | three-points, big-number, quote, before-after |
| ask | cta | .15 | 4 | Y | What decision do you need, from whom, by when? | "Approve a two-team pilot by 1 Nov." | cta |

### F6 `then-now-next` (turns: 1)
Best for kickoffs, strategy updates and retrospectives.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| hook | hook | .07 | 3 | Y | Which moment captures the period? | "A year ago, we had one client." | cold-open, big-number |
| then | setup | .20 | 2 | Y | Where did we start, and what did we believe? | "2019: four people, one idea." | timeline, statement |
| now | proof | .25 | 3 | Y | Where are we honestly, wins and scars? | "40 clients. 2 hard lessons." | big-number, three-points |
| shift | turn | .13 | 4 | Y | What did we learn that changes the plan? | "We don't sell AI. We sell time back." | pivot |
| next | idea | .25 | 4 | Y | Where are we going, and why will it work? | "Making work more human, at scale." | sunrise, three-points, galaxy-reveal |
| ask | cta | .10 | 4 | Y | What do you need from each person here? | "Bring one stuck process to Friday." | cta, finale |

### F7 `hero-lite`: a light hero's journey (turns: 1)
The audience is the hero and the speaker is the mentor. Best for workshops and transformation kickoffs.

| beat | role | share | E | req | author question | example | templates |
|---|---|---|---|---|---|---|---|
| ordinary-world | hook, setup | .10 | 2 | Y | What does your audience's normal day look like? | "Inbox at 7. Meetings till 5. Real work at 9pm." | cold-open, planet |
| the-call | setup | .10 | 3 | Y | What is calling them to change? | "The tools changed. The work didn't." | statement, big-number |
| the-fear | tension | .12 | 3 | Y | What makes them hesitate? Say it for them. | "Will AI replace me?" | the-box, question |
| the-mentor | identity | .12 | 3 | Y | Why are you a credible guide? Keep it brief. | "30 teams augmented. None got smaller." | brand-reveal, quote |
| the-plan | proof | .18 | 3 | Y | What are the three steps? | "Map · Pair · Practise" | three-points, timeline |
| the-ordeal | turn | .13 | 5 | Y | When do they choose differently? | "Not replaced. Augmented." | pivot |
| the-return | resolution | .15 | 4 | Y | What does their world look like afterwards? | "Home by six. Proud of the work." | sunrise, finale |
| ask | cta | .10 | 4 | Y | What's their first step tomorrow? | "Book your team's first pairing session." | cta |

### Which framework to recommend
Evaluate the rows top to bottom. The first match wins, and the author can always override it.

| signal from the interview | recommend | runner-up |
|---|---|---|
| goal=decide, or slot ≤ 15 min with an exec audience | scqa | psf |
| goal=launch | psf | sparkline |
| goal=update | then-now-next | scqa |
| a true story was given and goal ≠ decide | story-spine | hero-lite |
| goal=teach or enable | hero-lite | then-now-next |
| goal=inspire and tone=cinematic | giant-leap | sparkline |
| goal=inspire or persuade | sparkline | giant-leap |

## 3. The guided interview

There are twelve questions, which take about ten minutes. Every one can be skipped, and anything unanswered stays as a `{token}` in the draft.

| # | field | question | input / validation | flows to |
|---|---|---|---|---|
| 1 | goal | What should this talk do? | inspire · persuade · decide · launch · update · teach | framework choice |
| 2 | audience | Who's in the room, and what do they believe today? | 1–2 lines | setup beats, notes |
| 3 | targetMin | How long do you have? | 3–60 minutes | scene count, `pace.runtime` |
| 4 | bigIdea | If they remember one sentence, what is it? | ≤ 15 words, must contain a verb | idea beats, echo rules |
| 5 | oldWay / newWay | What do they believe now, and what should they believe after? | ≤ 5 words each | the turn: "Not {oldWay}." → "{newWay}." |
| 6 | feel | How should they feel when they leave? | pick ≤ 2: awe, hope, urgency, confidence, curiosity, belonging | energy targets, palette suggestion |
| 7 | do | What should they do by next week? | must start with a verb | CTA beat, `story.cta` |
| 8 | proof[3] | Your three strongest pieces of evidence | {kind: number, story, quote or demo; text} | proof beats; number → big-number, quote → quote |
| 9 | story | A true moment you can tell in 60 seconds (optional) | text | story-spine, hook |
| 10 | firstShot | If this talk were a film, what's the opening shot? | a world + one line | hook scene, callback |
| 11 | tone | cinematic · warm · crisp · playful | choice | template defaults, reveal speeds |
| 12 | assets | Logo, images or data you must show | file drop, stored as a data: URL | slots: name, proof, callback |

### From answers to a storyboard
1. Pick the framework with the recommendation table above.
2. Set the scene count: `sceneCount = clamp(round(targetMin*60/50), requiredBeats, 24)`. One Giant Leap has 10 scenes in about 9 minutes, roughly 54 s each.
3. Allocate scenes to beats in proportion to `share`, using the largest-remainder method. Every required beat gets at least one scene, and repeating beats are capped at their maximum.
4. Pick each scene's template. The default is `beat.templates[0]`, but a proof's `kind` or an attached asset can pick a better one (number → big-number, quote → quote, image → asset-reveal).
5. Fill the text with tokens: `{brand} {tagline} {bigIdea} {bigIdeaShort} {oldWay} {newWay} {do} {proof1..3} {firstShot} {audienceWorld}`. `{bigIdeaShort}` is the first 6 or fewer content words of the big idea.
6. Pre-fill each scene's notes with `▸ {beat.ask}` as a prompt for the speaker.

Example of placeholder copy for `giant-leap`:

| beat | placeholder text layers |
|---|---|
| spark | statement "{firstShot}" |
| name | hero "{brand}", subtitle "{tagline}" |
| zoom-out | title "{scaleFact}" |
| you-are-here | kicker "Somewhere in all of this", statement "{audienceWorld}" |
| human-truth | kicker "For {years}", statement "{humanTruth}" |
| pattern | kicker "A short history of", statement "{topic}"; one step per proof item: year + label |
| the-box | statement "{oldWay} was built for a world that's gone." → hero "Outside" |
| the-leap | kicker "The next leap", hero "Not {oldWay}." → hero "{newWay}." + subtitle "{bigIdeaShort}" |
| callback | hero "{brand}", subtitle "{do}" |

## 4. Coherence checker

### Shared helpers
```
states(scene)  = [0..steps].map(k => stage.resolve(i, k))     // resolved world + visible texts
words(t)       = t.str.trim().split(/\s+/).length
visibleWords(s)= Σ words(t) over visible texts; year/label/caption count ×0.5
dense(s)       = visibleWords(s) >= 16
tokens(str)    = lowercase, strip punctuation, drop STOPWORDS (keep "not")
match(a,b)     = a===b || (a.length>=5 && b.length>=5 && a.slice(0,5)===b.slice(0,5))
echo(text)     = count of tokens(bigIdea) matched in tokens(text) >= 2
place(w)       = w.warp>.5||w.speed>=1000 ? 'hyperspace' : w.galaxy>.5 ? 'galaxy'
               : w.earth>.5 ? (w.earthR>=1500 ? 'horizon' : 'planet')
               : (w.stars<.3 && w.nebulaAmount<.1) ? 'void' : 'space'
energy(s)      = s.energy ?? TEMPLATE[s.template].energy ?? 3
talk(s)        = s.talk ?? max(T.talk + T.step*nSteps, notesWords/2.33)    // 140 wpm
pos(i)         = Σ talk before scene i / total talk                        // runtime position, 0..1
```

### Severity and scoring
- **error** blocks the "Ready for the stage" badge. It never blocks presenting.
- **warn** is shown.
- **info** is collapsed by default.
- Health score = `100 − 15·errors − 5·warns − 1·infos`.
- Messages are written in the guide's voice.

### Story rules

| id | sev | check | message | fix |
|---|---|---|---|---|
| story.idea-missing | error | `!STORY.bigIdea` | "There's no big idea yet: the one sentence they'll repeat later." | "Finish this: 'If they remember one thing, it's that…'" |
| story.idea-long | warn | `words(bigIdea) > 15` | "Your big idea is {n} words. Try saying it in one breath." | "Cut it to a subject, a verb and what's at stake." |
| story.beats-missing | error | a required beat has 0 scenes | "The {beat} beat is empty, so the story skips a step." | "Add a {templates[0]} scene: {ask}" |
| story.unassigned | warn | a scene has no beat | "Scene {i} doesn't serve any beat." | "Assign it to a beat, or cut it." |
| story.beat-order | warn | beat index goes down between scenes (flashbacks exempt) | "{beat} comes after {later}, so the arc runs backwards here." | "Move it, or mark it as a flashback." |
| story.hook | warn | scene 0 has no hook role, or its template isn't in HOOK_SET | "You open on {template}. People decide in the first 30 seconds whether to lean in." | "Put a cold open before your title: a spark, a question or a number." |
| story.idea-early | warn | no `echo` in any text or notes with pos < .33 | "Your big idea doesn't show up in the first third." | "Plant it early. Even a subtitle counts." |
| story.idea-echo | warn | no `echo` in on-screen text with pos ≥ .75 | "The ending doesn't echo your big idea." | "Bring '{bigIdeaShort}' back in the last two scenes." |
| story.turns | error if 0, warn if ≠ `framework.turns` | count of scenes with the `turn` role | "Your story has {n} turning points. This arc wants {k}." | "Mark the moment the audience's view flips." |
| story.turn-position | warn | \|pos(turn) − ideal\| > .20, or the turn is the last scene | "Your turn lands at {p}%. This arc expects about {ideal}%." | "Move setup after the turn, or trim the proof." |
| story.cta | warn | no cta-role scene whose text or notes match `STORY.do` or start with an imperative | "There's no clear ask. What should they do on Monday?" | "Put '{do}' on screen in the final beat, or at least in its notes." |
| story.thanks-ending | info | the largest text in the last scene matches `/^(thank|questions|q&a)/i` | "You end on 'thank you'. Your last image should be your idea." | "Make the idea the hero and move thanks into the subtitle." |
| story.bookend | info | the last scene repeats no hero/title string and no place from the first half | "The ending doesn't call back to the opening." | "Return to your opening world or phrase, changed." |
| story.beat-share | info | a beat's runtime share is > 2× or < 0.4× its framework share | "{beat} takes {p}% of the talk. It's usually about {s}%." | "Trim it or expand it." |

### Pacing rules

| id | sev | check | message | fix |
|---|---|---|---|---|
| pace.runtime | warn > 15%, error > 35% | \|estimate − target\| / target | "This runs about {est} min in a {target}-min slot." | "Running over: cut a proof scene first. Running under: add a story, not more text." |
| pace.flatline | warn | ≥ 4 scenes in a row with equal energy | "Scenes {a}–{b} all sit at the same energy. Flat is forgettable." | "Break it with a big number, a question or a pivot." |
| pace.no-peak | warn | max energy < 4 | "Nothing rises above {max}/5, so there's no peak." | "Give the turn a pivot or a hyperspace moment." |
| pace.peak-early | info | the last max-energy scene is at pos < .5 | "Your biggest moment is behind you by halfway." | "Save a peak for the turn or the finale." |
| pace.arc-drift | info | mean \|energy − ideal curve(pos)\| > 1.25 | "Your energy drifts away from the {framework} shape." | "The arc view shows where the gaps are." |
| pace.dense-run | warn | 3 dense states in a row | "Three text-heavy shots in a row. The room starts reading instead of listening." | "Break it with a visual or a silent beat." |
| pace.wall | error | a state shows > 30 visible words | "Scene {i} shows {n} words at once. That's a document." | "Move it to the notes and keep 15 or fewer on screen." |
| pace.long-hold | warn | talk / (1 + steps) > 120 s | "Scene {i} holds one picture for about {s}s." | "Split it, or add a step." |
| pace.steps | warn | steps > 8 | "{n} clicks in one scene." | "Split it into two scenes." |
| pace.reveal-wait | warn | max(textDelay + at + revealTime) > 8 s | "The last words land after {s}s, so you'll be waiting on the deck." | "Bring `at` forward, or make it a step." |

### Copy and readability rules

| id | sev | check | message | fix |
|---|---|---|---|---|
| copy.style-words | warn | words > `STYLE_BUDGET[style].words` | "This {style} line has {n} words (max {max})." | The style's own advice (see section 5). |
| copy.lines | warn | measured lines > the style's max lines, or width > maxWidth | "'{str}' wraps onto {n} lines." | "Shorten it, or step down one style." |
| copy.small | warn | size < 20, or a caption/label has > 5 words | "Text this small can't be read from row 10." | "Use a kicker, and move the detail to the notes." |
| copy.one-hero | warn | more than one hero/mega visible in a state | "Two headlines are competing in scene {i}." | "Keep one hero per shot and demote the other to a subtitle." |
| copy.placeholder | error | `/\{[a-z]\w*\}|lorem|TODO/i` in text | "Scene {i} still has placeholder text." | "Answer {token} in the interview, or delete the line." |
| copy.jargon | info | a token from the JARGON list: leverage, synergy, utilise, robust, seamless, best-in-class, paradigm, holistic, solutions, unlock, game-changer | "People stop hearing words like '{word}'." | "Say concretely what it does." |
| copy.over-sun | warn | sun > .3 and the text box is < 200 px from (sunX, sunY) | "'{str}' sits in the sun's glare." | "Move it at least 200 px from the sun, or delay the sunrise." |
| copy.notes | warn | scene notes have < 3 words | "Scene {i} has no speaker notes." | "Add one cue: what you say, or where to pause." |

### Visual continuity rules

| id | sev | check | message | fix |
|---|---|---|---|---|
| vis.teleport | warn | two consecutive scenes go galaxy↔horizon, or Earth is in both with an earthR ratio > 20 and a glide < 3 s, and there's no transition (hyperspace, flash ≥ .3, exposure dip, prelude) | "Scene {i} jumps from {a} to {b} with no transition." | "Add a warp, a flash cue or a planet shot in between." |
| vis.warp | warn | hyperspace scenes > max(1, floor(n/6)) | "Hyperspace {k} times. It stops being magic." | "Keep it for the one big jump." |
| vis.particle-type | info | particle text reveals > ceil(n/2), or more than one in a single state | "Particles assemble {k} lines. That's your exclamation mark." | "Save it for names and verdicts." |
| vis.palette | warn | > 4 custom text colors (a gradient counts by its first stop), > 2 fonts, or > 5 nebula presets | "{k} accent colors. The deck stops reading as one film." | "Keep one accent for 'what could be'. One Giant Leap uses gold." |
| vis.asset-source | error | a particle-sampled asset isn't a `data:` URL | "'{asset}' can't become particles from a file link." | "Drop it into the studio again so it gets embedded." |

### Predicted result for the One Giant Leap deck
I worked this through by hand from `scenes.js`. I didn't run any code, so treat the numbers as estimates.

- **Runtime estimate:** about 545 s (about 9:05).
- **Energy arc:** 2, 4, 5, 3, 2, 4, 3, 3, 5, 4.
- **Turn position:** about 83% (ideal 77%).
- **Result:** 0 errors and 1 warning, `story.cta`. Neither the finale's text nor its notes contain an ask. Score: 95.

Don't edit anything before tomorrow. Just say the ask out loud over the finale.

## 5. Copy guidance per text style

Character limits are estimates at the default size. The checker measures the real width with `TextLayer.layout()`.

| style | job | max words | ≈ max chars | max lines | voice | One Giant Leap example |
|---|---|---|---|---|---|---|
| mega | a number or a single word | 2 | 10 | 1 | numerals, never a sentence | — |
| hero | the name or the verdict | 3 | 14 | 1 | noun phrase, or one word with a period; one per shot | "Augmentation." |
| title | a fact of scale | 5 | 24 | 1 | concrete numbers; no verb needed | "13.8 billion years" |
| statement | one complete thought | 14 | ~47 per line | 3 | spoken, present tense, ends with a period | "Home to the most restless minds we know of." |
| subtitle | the promise under a hero | 7 | 40 | 1 | a tagline, no period | "Making work more human" |
| kicker | the setup | 5 | 30 | 1 | the first half of a sentence; the statement finishes it | "For 300,000 years" |
| body | explanation (a last resort) | 30 | ~64 per line | 4 | at most two short sentences | — |
| year | a date | 2 | 14 | 1 | — | "~1,000,000 BCE" |
| label | a name tag | 4 | 22 | 1 | — | "The printing press" |
| caption | a whisper, for orientation | 6 | 40 | 1 | — | "You are here" |

**Copy devices from One Giant Leap**, offered as suggestions in the editor:
1. **Split sentence.** A kicker sets the line up and a statement in lowercase lands it.
2. **Not X. Y.** Name the old belief first, then the new one. Use two heroes at the same size, grey then gold.
3. **Number, then meaning.** A scale fact never stands alone; the next line says why it matters.
4. **Callback.** The last hero repeats the first.
5. **One accent means the future.** Gold is reserved for "what could be".
6. **Silence beats.** Add a scene with 8 words or fewer, with "pause" in its notes, at least every 5 minutes.

## 6. Guide microcopy

The guide speaks in the second person and keeps every message to two sentences or fewer. Each one ends with a next action, avoids words like "error" or "invalid", and praises specifics.

```js
PD.COPY = {
  welcome: "Let's build a talk people remember. Twelve questions, about ten minutes, and you can skip any of them.",
  'q.goal': ["What should this talk do?", "Pick the closest one. It decides the shape of your story."],
  'q.bigIdea': ["If they remember one sentence, what is it?", "Write it the way you'd say it to a friend in a lift."],
  'q.bigIdea.long': "That's {n} words. Try it in one breath: 15 or fewer.",
  'q.oldNew': ["What do they believe now, and what should they believe after?", "This becomes your turning point: 'Not ___. ___.'"],
  'q.do': ["What should they do by next week?", "Start with a verb: Book, Try, Pick. Not 'Consider'."],
  'q.feel': ["How should they feel walking out?", "Pick up to two."],
  'fw.pick': "Here's the shape we'd suggest. You want to {goal} in {targetMin} minutes, and {framework} is built for {bestFor}.",
  'board.emptyBeat': "This beat needs a scene. {ask}",
  'board.placeholder': "Answer '{token}' in the interview, or type over it.",
  'lint.clean': "Your story holds together. Rehearse it out loud once.",
  'lint.summary': "{e} to fix, {w} to consider, {i} tips.",
  'lint.ready': "Ready for the stage",
  'lint.notReady': "{e} things to fix before it's stage-ready. You can still present.",
  'lint.ignore': "Ignore for this scene",
  'assets.drop': "Drop a logo or image. We'll keep it inside the deck so it works offline.",
  'assets.tainted': "This image came from a file link, so it can't become particles. Drop it here again and we'll embed it.",
  'rehearse.runtime': "About {est} minutes at a natural pace. Your slot is {target}.",
  'export.done': "Saved. Double-click {file} to present. No internet needed."
};
```