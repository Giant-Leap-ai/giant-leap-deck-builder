# The 16 templates

A **template** is a ready-made scene. You say which one and fill in its words; the engine places them, times them and
animates them. Most decks need nothing else.

**Watch the defaults.** The ten cinematic templates come from the One Giant Leap talk, and several optional fields default
to that talk's words: `brand-reveal`'s tagline is "Making work more human", `finale`'s line is "Thank you", `pivot`'s kicker
is "The next leap". To leave one out, set it to `''`. The tables below list every default.

## At a glance

| Template | What you see | Needs | Clicks | Good for |
|---|---|---|---|---|
| [`cold-open`](#cold-open) | A spark in the dark, then one line | `spark` | 0 | opening |
| [`brand-reveal`](#brand-reveal) | Your name assembles from particles | — | 0 | identity, idea, callback |
| [`hyperspace`](#hyperspace) | Warp speed through the stars, a line per click | `cosmos` | lines − 1 | scale, opening |
| [`galaxy-reveal`](#galaxy-reveal) | A galaxy, then a pale blue dot | `cosmos`, `planet` | 1 (0 without a marker) | relevance, scale |
| [`planet`](#planet) | The camera flies home to the Earth | `cosmos`, `planet` | 0 | relevance, setup |
| [`sunrise`](#sunrise) | The sun clears the edge of the world | `cosmos`, `planet` | 0 | emotion, turn, resolution |
| [`timeline`](#timeline) | A rising curve, a milestone per click | — | one per milestone | proof, setup |
| [`the-box`](#the-box) | A glowing box; one click and the idea escapes | — | 1 | tension |
| [`pivot`](#pivot) | "Not X." in grey, then "Y." in gold | — | 1 | turn, idea, call to action |
| [`finale`](#finale) | The particles burst and re-form into your closing line | — | 0 | callback, call to action, resolution |
| [`statement`](#statement) | One big sentence | — | 0 | anything |
| [`big-number`](#big-number) | A number counts up, with what it means | — | 0 | opening, proof, scale, tension |
| [`quote`](#quote) | A quotation and who said it | — | 0 | proof, emotion |
| [`three-points`](#three-points) | A point per click | — | one per point | proof, idea |
| [`logo`](#logo) | Your logo assembles from particles | an image asset | 0 | identity, callback |
| [`image`](#image) | A photo, full screen or framed, with a caption | `photo` for full screen; an image asset | 0 | emotion, setup, resolution, opening |

**Needs** are the world plugins the look must enable. Slate enables `ambient`, `photo` and `spark`; Cosmos enables
`cosmos`, `planet`, `spark` and `photo`. So under Slate, `hyperspace`, `galaxy-reveal`, `planet` and `sunrise` cannot play
properly: `PD.validate` reports `template.requires-world` as an error, and the Studio will not save the deck until they are
swapped. Every other template works under both looks. Templates with no
needs are called *adaptive*: they build their sky from the look's shots and skip any world setting the look does not have.

**Clicks** are the steps inside the scene. A scene with 1 click has two moments: as it opens, and after the click.
**Holds** (in each section) is the scene's `dwell`: how long the video recorder and the runtime estimate keep its last
moment on screen. When you present, a scene stays until you click.

## Using one in a deck

In a deck file a template scene is a short entry: an `id`, the `template` name, its `props` (the words and numbers from
the tables below) and your speaker `notes`.

```js
PD.deck('tpl-demo', {
  format: 2, id: 'tpl-demo', meta: { title: 'Templates', theme: 'slate' },
  scenes: [
    { id: 'open', template: 'statement', props: { kicker: 'In one sentence', line: 'Small teams deserve big-company tools.' },
      notes: 'Pause after the line.' },
    { id: 'proof', template: 'big-number', props: { value: 62, label: 'of small teams still run on spreadsheets' },
      notes: 'Let the number land.' }
  ]
});
console.log(PD.compile('tpl-demo').scenes.map(function (s) { return s.like; }));   // ['statement', 'big-number']
```

Every template scene can also carry `notes`, `stepNotes` (one per click), `dwell`, `overrides` and the story fields; see
[authoring.md](authoring.md#template-scenes).

In the tables, `*` marks a required prop; text limits are characters, and "measured as" is the text style the Studio
measures it against for overflow. Every `shot` prop names one of the look's shots and falls back to `DRIFT` when the look
does not have it (Slate's are `DRIFT`, `WARM`, `COOL`, `DARK`; see [themes.md](themes.md#shots)).

---

## cold-open

**Spark cold open.** A single knot of light breathes in the dark centre of the screen; after `lineAt` seconds one line
writes itself in near the bottom, letter by letter. The quietest way to start. Holds 6 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `line` * | Opening line | text | required | ≤ 60 chars, measured as `statement` |
| `lineAt` | Line appears after (s) | number | `1.8` | 0 to 6 |
| `sparkCount` | Spark particles | number | `700` | 200 to 1200, whole number |
| `sparkColor` | Spark colour | color | `'gold'` | a colour name or `#hex` |
| `shot` | World | shot | `'SPARK'` | a shot of the look |

Example: `{ line: 'Every giant leap begins with a single spark.' }` · Energy 2 · about 20 s of talk.

## brand-reveal

**Brand reveal.** Your name flies together from particles, with a soft flash; the tagline writes itself underneath. If the
look has the spark world, a spark from the scene before fades out as the name blooms. Holds 6 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `title` * | Name | text | required | ≤ 18 chars, measured as `hero` |
| `subtitle` | Tagline | text | `'Making work more human'` | ≤ 40 chars, measured as `subtitle` |
| `subtitleAt` | Tagline appears after (s) | number | `2.6` | 0 to 6 |
| `flash` | Flash | number | `0.32` | 0 to 1 (0 = no flash) |
| `entry` | Particles arrive from | enum | `'spark'` | `spark` · `void` · `edges` · `center` |
| `shot` | World | shot | `'BLOOM'` | a shot of the look |

Example: `{ title: 'One Giant Leap', subtitle: 'Making work more human' }` · Energy 4 · about 30 s.

## hyperspace

**Hyperspace** (Cosmos only). The stars streak into warp with cinema bars, a roll and a shake; after a flash at `flashAt`
seconds the first line pulls into focus. Each further line is one click and replaces the line before. Lines over 24
characters are drawn smaller. Holds 4 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `lines` * | Lines (one per click) | list | required | 1 to 3 items |
| ↳ each item | Line | text | | ≤ 34 chars, measured as `title` |
| `warpColor` | Warp colour | enum | `'cyan'` | `cyan` · `violet` · `gold` · `white` |
| `nebula` | Nebula | nebula | `'cosmic'` | a nebula of the look |
| `flashAt` | Flash at (s) | number | `3` | 0 to 5 |

Example: `{ lines: ['13.8 billion years', 'Hundreds of billions of galaxies'] }` · Energy 5 · about 20 s, plus 20 s per click.

## galaxy-reveal

**Galaxy, you are here** (Cosmos only). The deck drops out of warp in front of a galaxy; a kicker and a line appear on the
left. With a `marker`, one click fades in a tiny Earth with a ring of light and the marker label beside it. Holds 5 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `'Somewhere in all of this'` | ≤ 30 chars, measured as `kicker` |
| `line` * | Line | text | required | ≤ 50 chars, measured as `statement` |
| `marker` | Marker label (empty = no click) | text | `'You are here'` | ≤ 24 chars, measured as `caption` |

Example: `{ line: 'there is one small, blue world.' }` · Energy 3 · about 40 s, plus 20 s for the click.

## planet

**Fly home** (Cosmos only). Over five seconds the camera flies in until the Earth fills the frame; the kicker appears at
the top and the line at the bottom. `region` picks the side of the Earth facing you. Holds 6 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `'Third planet from the sun'` | ≤ 30 chars, measured as `kicker` |
| `line` * | Line | text | required | ≤ 50 chars, measured as `statement` |
| `region` | Region facing the camera | enum | `'americas'` | `americas` · `europe-africa` · `asia` |

Example: `{ line: 'Home to the most restless minds we know of.' }` · Energy 2 · about 40 s.

## sunrise

**Sunrise** (Cosmos only). Along the Earth's edge the sun rises, the light swings round and the sky warms; the kicker and
a large line appear in the upper third. The emotional beat. Holds 7 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `'For 300,000 years'` | ≤ 30 chars, measured as `kicker` |
| `line` * | Line | text | required | ≤ 40 chars, measured as `statement` at 78 px |
| `nebula` | Nebula | nebula | `'dawn'` | a nebula of the look |

Example: `{ line: 'we have thought outside the box.' }` · Energy 4 · about 45 s.

## timeline

**Milestones.** A kicker and title top left, and a glowing curve rising from teal to gold across the screen. Each click
lights one milestone on the curve: a ring, its date and its label. Holds 3 s after the last click.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `'A short history of'` | ≤ 30 chars, measured as `kicker` |
| `title` * | Title | text | required | ≤ 40 chars, measured as `statement` |
| `milestones` * | Milestones (one per click) | list | required | 2 to 8 items |
| ↳ `when` * | When | text | required | ≤ 14 chars, measured as `year` |
| ↳ `label` * | What | text | required | ≤ 22 chars, measured as `label` |
| ↳ `u` | Position on the curve | number | — | 0 to 1 |
| ↳ `pos` | Text position | enum | `'auto'` | `auto` · `above` · `below` · `left` |
| ↳ `color` | Node colour | color | — | a colour name or `#hex` |
| `highlightLast` | Highlight the last milestone | bool | `true` | |
| `curve` | Draw the curve | bool | `true` | |
| `shot` | World | shot | `'LEAPS'` | a shot of the look |

Without `u`, milestones are spread evenly (`0.04 + i × 0.935 / (n − 1)`). `pos: 'auto'` puts the text above the node when
`u < 0.12`, below when `u < 0.5`, else to the left. Nodes use the look's `accent` role; the last one uses `futureGlow` when
`highlightLast` is on.

Example: `{ title: 'Thinking outside the box', milestones: [{ when: '1440', label: 'The printing press' }, { when: '1969', label: 'The Moon' }] }`
(the talk's own example has seven) · Energy 3 · about 15 s, plus 20 s per click.

## the-box

**The box.** A rotating wireframe cube with particles swarming inside it on the left, and your line beside it. One click:
the swarm and the line leave, and the escape word assembles from particles on the right, in the look's `future` colours,
with a subtitle in the `accent` colour. Holds 4 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `line` * | Line beside the box | text | required | ≤ 60 chars, measured as `statement` |
| `escape` * | The escape word | text | required | ≤ 12 chars, measured as `hero` |
| `subtitle` | Line under the escape word | text | `'is where the future lives'` | ≤ 40 chars, measured as `subtitle` |
| `cubeColor` | Box colour | color | `'cyan'` | a colour name or `#hex` |
| `cubeColor2` | Box colour, far edge | color | `'violet'` | a colour name or `#hex` |
| `shot` | World | shot | `'BOX'` | a shot of the look |

Example: `{ line: "Every breakthrough began as an idea that didn't fit.", escape: 'Outside' }` · Energy 3 · about 45 s, plus 20 s.

## pivot

**Not X. Y.** A kicker, and the old answer assembled from grey particles (the look's `past` colours). One click: it leaves
and your answer assembles in gold (`future`), with a subtitle in `accent`. Both answers shrink to fit the width if needed.
Holds 4 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `'The next leap'` | ≤ 30 chars, measured as `kicker` |
| `from` * | The old answer | text | required | ≤ 18 chars, measured as `hero` |
| `to` * | Your answer | text | required | ≤ 18 chars, measured as `hero` |
| `subtitle` | Line under your answer | text | `'Technology that makes work more human'` | ≤ 44 chars, measured as `subtitle` |
| `shot` | World | shot | `'PIVOT'` | a shot of the look |

Example: `{ from: 'Not automation.', to: 'Augmentation.' }` · Energy 5 · about 40 s, plus 20 s.

## finale

**Finale.** Whatever particles are on screen burst outwards, then re-form into your title; the closing line appears
underneath. Under Cosmos the sun rises behind it. Holds 7 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `title` * | Name | text | required | ≤ 18 chars, measured as `hero` |
| `subtitle` | Closing line or ask (hint: Put your ask here) | text | `'Thank you'` | ≤ 40 chars, measured as `subtitle` |
| `shot` | World | shot | `'FINALE'` | a shot of the look |

Example: `{ title: 'One Giant Leap', subtitle: "Let's make the next one together" }` · Energy 4 · about 30 s.

## statement

**Big statement.** One sentence, big, centred (or left-aligned), with an optional kicker above it. The workhorse. Holds 5 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `''` (none) | ≤ 30 chars, measured as `kicker` |
| `line` * | Statement | longtext | required | ≤ 90 chars, ≤ 3 lines, measured as `statement` |
| `align` | Alignment | enum | `'center'` | `center` · `left` |
| `reveal` | Reveal | enum | `'letters'` | `letters` · `rise` · `fade` · `focus` · `wipe` |
| `shot` | World | shot | `'DRIFT'` | a shot of the look |

Example: `{ kicker: 'The short version', line: 'The best ideas fit in one sentence.' }` · Energy 2 · about 45 s.

## big-number

**Big number.** A huge number counts up from zero (or assembles from particles), with what it means underneath and an
optional source at the bottom. Holds 5 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `value` * | Number | number | required | |
| `decimals` | Decimals | number | `0` | 0 to 3, whole number |
| `prefix` | Before the number | text | `''` (none) | ≤ 4 chars, measured as `mega` |
| `suffix` | After the number | text | `'%'` | ≤ 4 chars, measured as `mega` |
| `label` * | What it means | text | required | ≤ 60 chars, measured as `statement` |
| `source` | Source | text | `''` (none) | ≤ 40 chars, measured as `caption` |
| `reveal` | Reveal | enum | `'count'` | `count` · `particles` |
| `shot` | World | shot | `'DRIFT'` | a shot of the look |

The suffix defaults to `%`; set `suffix: ''` for a plain number. Example: `{ value: 62, label: 'of your audience feels this every week' }`
· Energy 4 · about 40 s.

## quote

**Quote.** The quotation in curly quotes, written in letter by letter, then who said it and their role. Holds 5 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `quote` * | Quote | longtext | required | ≤ 160 chars, ≤ 4 lines, measured as `statement` at 56 px |
| `who` * | Who said it | text | required | ≤ 30 chars, measured as `label` |
| `role` | Their role or the source | text | `''` (none) | ≤ 40 chars, measured as `caption` |
| `shot` | World | shot | `'DRIFT'` | a shot of the look |

Example: `{ quote: 'We stopped asking for permission and started shipping.', who: 'A customer' }` · Energy 2 · about 40 s.

## three-points

**Points, one per click.** The scene opens on the kicker alone; each click brings in the next point, as rows down the left
(with a small ring of light as the bullet) or as columns. Holds 3 s after the last click.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `kicker` | Kicker | text | `''` (none) | ≤ 30 chars, measured as `kicker` |
| `items` * | Points (one per click) | list | required | 2 to 5 items |
| ↳ `title` * | Point | text | required | ≤ 24 chars, measured as `label` |
| ↳ `line` | Detail | text | `''` (none) | ≤ 60 chars, measured as `statement` at 44 px |
| `layout` | Layout | enum | `'rows'` | `rows` · `columns` |
| `shot` | World | shot | `'DRIFT'` | a shot of the look |

Example: `{ kicker: 'Three reasons', items: [{ title: 'Faster', line: 'Ideas reach people the same day.' }, …] }` ·
Energy 3 · about 20 s, plus 30 s per click.

## logo

**Logo reveal.** Your logo picture dissolves out of the particle field (at most 3,500 particles) with a soft flash, then
appears crisp; the tagline writes itself underneath. A tall logo is scaled down so the tagline stays on screen. Holds 6 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `asset` * | Logo image | asset | required | an image asset id |
| `width` | Width | number | `900` | 200 to 1600, whole number |
| `tagline` | Tagline | text | `''` (none) | ≤ 40 chars, measured as `subtitle` |
| `mode` | Particles follow | enum | `'alpha'` | `alpha` · `luma` |
| `shot` | World | shot | `'BLOOM'` | a shot of the look |

Use a PNG with a transparent background. For a logo on a solid background, `mode: 'luma'` follows its bright parts instead
of its outline. Example: `{ asset: 'logo', tagline: 'Making work more human' }` (needs an image asset `logo` in
`assets.js`) · Energy 4 · about 30 s.

## image

**Image hold.** With `fit: 'cover'` (the default) your photo fills the screen behind the scene with a slow push-in and a
soft scrim for the caption; under Cosmos the stars and nebulae switch off over it. With `fit: 'contain'` the whole photo
sits in a rounded frame instead. The caption fades in at the bottom. Holds 5 s.

| Prop | Label | Type | Default | Limits |
|---|---|---|---|---|
| `asset` * | Image | asset | required | an image asset id |
| `caption` | Caption | text | `''` (none) | ≤ 60 chars, measured as `statement` |
| `fit` | Fit | enum | `'cover'` | `cover` · `contain` |
| `focusX` | Focus, left to right | number | `0.5` | 0 to 1 |
| `focusY` | Focus, top to bottom | number | `0.5` | 0 to 1 |
| `zoom` | Push-in | number | `1.08` | 1 to 1.3 |
| `dim` | Dim | number | `0.25` | 0 to 0.8 |

`cover` needs the `photo` world (both looks have it); `contain` needs none. Example:
`{ asset: 'photo', caption: 'Where it all started' }` (needs an image asset `photo`) · Energy 3 · about 40 s.

---

## How props are filled in

When a deck is compiled, each template scene's props are normalised before the template runs:

- A missing optional prop takes its default. A **required** prop is never filled in for you; `PD.validate` reports it as
  `template.prop-required`.
- Values are coerced to the prop's type where that is safe: `'62'` becomes `62` for a number, `'true'` becomes `true` for
  a bool, a single item becomes a one-item list.
- Text longer than its limit, a number outside its range or a list with too many items still plays, and `PD.validate`
  reports `template.prop-max` (a warning). A value of the wrong type is `template.prop-type` (an error).
- Props a template does not know are passed through and ignored.

The template's result can then be patched with `overrides` (see [authoring.md](authoring.md#template-scenes)).

## Placeholders and seeds

Each template has a `seed`: the props the Studio's storyboard starts a new scene with. Seeds contain `{…}` placeholders of
two kinds (see [story.md](story.md#placeholders)):

- **Story tokens**, filled from the Brief: `{brand}`, `{tagline}`, `{bigIdea}`, `{shortIdea}`, `{oldWay}`, `{newWay}`,
  `{ask}`, `{audience}`, `{proof1}` to `{proof3}`. `pivot`'s seed is `{ from: 'Not {oldWay}.', to: '{newWay}.' }`.
- **Prompts for you**, which stay until you write the line: `{opening line}`, `{a big number}`, `{milestone}` …

Any `{…}` still on screen is flagged by the Director as `copy.placeholder`, so nothing half-written reaches the stage
unnoticed.

| Template | Seed |
|---|---|
| cold-open | `{ line: '{opening line}' }` |
| brand-reveal | `{ title: '{brand}', subtitle: '{tagline}' }` |
| hyperspace | `{ lines: ['{a big number}', '{an even bigger one}'] }` |
| galaxy-reveal | `{ line: '{where your audience fits}' }` |
| planet | `{ kicker: '{where}', line: '{who lives here}' }` |
| sunrise | `{ kicker: '{since when}', line: '{a human truth}' }` |
| timeline | `{ title: '{topic}', milestones: [{ when: '{when}', label: '{milestone}' } × 3] }` |
| the-box | `{ line: '{oldWay} was built for a world that is gone.', escape: 'Outside', subtitle: 'is where {newWay} lives' }` |
| pivot | `{ kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' }` |
| finale | `{ title: '{brand}', subtitle: '{ask}' }` |
| statement | `{ line: '{your line}' }` |
| big-number | `{ value: 0, label: '{what the number means}' }` |
| quote | `{ quote: '{quote}', who: '{who}' }` |
| three-points | `{ items: [{ title: '{point}' } × 3] }` |
| logo | `{ asset: '', tagline: '{tagline}' }` |
| image | `{ asset: '', caption: '{caption}' }` |

---

## The template registry

`PD.template(id, Template)` registers a template; `PD.template.get(id)`, `.has(id)` and `.list()` read the registry.

```js
var T = PD.template.get('quote');
console.log(PD.template.list().length, T.label, T.requires.worlds, T.story.energy);   // 16 Quote [] 2
console.log(Object.keys(T.props));                                                     // ['quote', 'who', 'role', 'shot']
console.log(PD.template.get('hyperspace').requires.worlds);                            // ['cosmos']
```

A template is a pure function from props to a raw scene, plus the description the Studio and `PD.validate` need:

```text
Template = {
  label, summary,                                   // what the Studio's picker shows
  requires: { worlds: string[], worldsFor?(props) → string[] },   // [] = adaptive
  story: { energy: 1..5, talkSec, stepTalkSec, roles: string[], hook: boolean },
  props: { [name]: PropSpec },
  example: props,                                   // complete, valid props (the picker's thumbnail)
  seed: props,                                      // where a new storyboard scene starts
  expand(props, env) → RawScene                     // env = the deck helpers h (authoring.md#code-instead-of-data-factory-decks)
}
PropSpec = { type: 'text' | 'longtext' | 'number' | 'bool' | 'color' | 'enum' | 'asset' | 'list' | 'shot' | 'nebula',
             label, hint?, required?, default?, max?, min?, style?, size?, lines?, step?, int?, options?,
             accept?: 'image' | 'font', of?: PropSpec | { [sub]: PropSpec } }
```

`story.talkSec` and `stepTalkSec` are how long the scene usually takes to talk over; the runtime estimate uses them for a
scene that has no notes yet. `story.hook` says whether the template makes a good opening (the Director's `story.hook`
rule). `expand` must be deterministic: no clock, no random numbers, no DOM except `env.measure` and `env.fit`, and it
returns plain data.

### Your own template

Register it inside a `PD.module` so it is carried into a one-file export; a bare top-level `PD.template(…)` works on the
page but is missing from the exported file, whose scenes would then show "unknown template". Put the file in your deck
folder (for example `decks/my-talk/templates.js`) and load it in `index.html` and `notes.html` before `deck.js`.

```js
PD.module('decks/my-talk/templates', [], function (PD) {
  PD.template('title-card', {
    label: 'Title card',
    summary: 'A title and a subtitle, nothing else.',
    requires: { worlds: [] },
    story: { energy: 2, talkSec: 20, stepTalkSec: 0, roles: ['setup'], hook: false },
    props: {
      title: { type: 'text', label: 'Title', required: true, max: 24, style: 'title' },
      subtitle: { type: 'text', label: 'Subtitle', max: 40, style: 'subtitle', default: '' },
      shot: { type: 'shot', label: 'World', default: 'DRIFT' }
    },
    example: { title: 'Chapter two', subtitle: 'Where it gets interesting', shot: 'DRIFT' },
    seed: { title: '{chapter}' },
    expand: function (p, env) {
      var text = [{ str: p.title, style: 'title', y: 500, reveal: 'focus' }];
      if (p.subtitle) text.push({ str: p.subtitle, style: 'subtitle', y: 610, reveal: 'rise', at: 0.8 });
      return { world: env.shot(p.shot), text: text, dwell: 4 };
    }
  });
  return {};
});

PD.deck('custom-demo', { format: 2, id: 'custom-demo', meta: { title: 'Custom', theme: 'slate' },
  scenes: [{ id: 'ch2', template: 'title-card', props: { title: 'Chapter two' } }] });
var sc = PD.compile('custom-demo').scenes[0];
console.log(sc.like, sc.text.length, PD.validate(PD.compile('custom-demo')).length);   // title-card 1 0
```

More on modules and the other registries in [plugins.md](plugins.md).
