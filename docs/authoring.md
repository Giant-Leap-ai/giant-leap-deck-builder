# Writing a deck by hand

This guide is for building a deck in a code editor, or with an AI assistant. If you would rather click through a builder,
use the Studio instead (see [studio.md](studio.md)). Both produce the same kind of deck.

The first half is plain language. The second half, from [The deck file](#the-deck-file), is the reference for every field
and function.

Related guides: [templates.md](templates.md) (the 16 ready-made scenes), [themes.md](themes.md) (fonts, colours and the
look), [export.md](export.md) (one file to hand around), [plugins.md](plugins.md) (adding your own effects),
[story.md](story.md) (the story tools behind the Studio).

---

## In plain words

**A deck is a folder.** Everything for one talk lives in `decks/<your-deck>/`:

| File | What it holds |
|---|---|
| `index.html` | The page you double-click to present. It loads the engine, a look, your pictures and your scenes. |
| `notes.html` | The same deck as a presenter window: your notes, a preview of the next shot, and a timer. Optional, because pressing **N** on the deck opens the same thing. |
| `deck.js` | Your scenes, in order. This is the file you edit most. |
| `assets.js` | Your pictures and fonts, written out as text (`data:` URLs) so the deck needs no other files. |
| `theme.js` | Optional: your own look (fonts, colours, glow). Without it the deck uses a shared look from `themes/`. |

**A deck is a list of scenes.** One scene is one "shot": a sky, some words, maybe a picture or a number. Pressing the right
arrow (or a clicker) plays the next scene. A scene can also have **steps**: extra clicks inside the same scene, such as
"show the next point" or "now reveal the answer".

**Each scene can carry speaker notes.** You see them in the presenter window, never on the big screen.

**There are two ways to write a scene:**

- A **template scene** names a ready-made layout and fills in its words: "a big statement that says *this*", "a number
  that counts up to 62 %". The engine does the placement, timing and animation. This is what you want most of the time.
  [templates.md](templates.md) lists all 16.
- A **raw scene** is written out piece by piece: this text, at this height, revealed this way, over this sky. Use it only
  when no template does what you need.

**The look is separate from the words.** A look (called a *theme* in code) sets fonts, colours and the kind of world behind
your words: **Slate** is calm charcoal light that suits any business, **Cosmos** is deep space with nebulae and planets.
You can switch looks without touching a scene. See [themes.md](themes.md).

---

## Start a new deck

1. **Copy the starter.** In a terminal, from the project folder:

   ```sh
   cp -R decks/_starter decks/my-talk
   ```

   Keep the copy inside `decks/`. Its pages load the engine and the look from two folders up (`../../engine/`,
   `../../themes/`), so a deck folder moved anywhere else, such as the Desktop or a USB stick, opens as a blank white page
   with no message (the console shows `ERR_FILE_NOT_FOUND` and `PD is not defined`). To present from another computer or
   a stick, make the one-file export instead (see [export.md](export.md)).

2. **Give it its own deck id.** Open `decks/my-talk/deck.js` and change `'starter'` to a new id in **both** places
   (`PD.deck('starter', …)` and `id: 'starter'`). Then open `decks/my-talk/assets.js` and use the same new id in
   `PD.assets('starter', …)`. An id is lower-case letters, digits and dashes, starting with a letter or digit, at most
   48 characters: `my-talk`, `acme-q4-review`.

   > **Why this matters.** The copy plays fine with the old id, but two decks with the same id get in each other's way:
   > `npm test` loads every deck in `decks/` and stops with `deck "starter" is registered twice`; two decks with the same
   > id open at the same time share one presenter channel (`pixeldeck:<id>`), so a presenter window can link to the wrong
   > deck and warns "Another stage for this deck is open"; and the one-file export is named after the id, so it would be
   > `export/starter.html`.

   While you are there, name it: set `meta.title` in `deck.js`, and change `<title>Starter deck</title>` in `index.html`
   and `notes.html`. The browser tab shows the page's `<title>` while you present; the presenter window and the one-file
   export take their titles from `meta.title`.

3. **Pick the look.** `index.html` and `notes.html` each load one theme script. The starter loads Slate
   (`../../themes/slate/theme.js`). For Cosmos, change both lines to `../../themes/cosmos/theme.js` **and** set
   `meta.theme: 'cosmos'` in `deck.js`. The theme script a page loads must be the one `meta.theme` names.

4. **Write your scenes** in `deck.js`. Start from templates (below, and [templates.md](templates.md)).

5. **Open `decks/my-talk/index.html`** in Chrome and step through every scene with the right arrow. If a template scene
   cannot be built, the deck still plays: that scene shows a ⚠ card, and a red box in the bottom-left corner lists the
   problem (click it to hide it; the browser console, ⌥⌘J on a Mac or Ctrl+Shift+J on Windows, has the same list). A deck
   that cannot start at all shows a black panel that says why; a blank white page means the page did not find the engine
   (see step 1). Smaller mistakes, such as a misspelt text style, play through quietly;
   [Checking a deck](#checking-a-deck) finds those.

6. **Check the story and the length.** The deck page also carries the Director, the story check the Studio runs. With
   the deck open, paste this into the console:

   ```js
   PD.story.lint(PD.compile()).findings.forEach(function (f) { console.log(f.sev, f.scene == null ? 'deck' : 'scene ' + (f.scene + 1), f.msg); });
   ```

   It flags what an audience would feel: an opening that does not hook, a line with too many words for its style, text
   too small to read from the back of the room. The length check needs your slot: set `meta.story.targetMin` (minutes)
   in `deck.js`. The estimate reads your speaker notes at 140 words a minute (or the animation time, when that is longer),
   so a deck with thin notes looks shorter than it will run. The findings are advice; the deck plays either way.
   [story.md](story.md#the-director) lists every rule.

### A first deck.js

This is a complete `deck.js` with four scenes: three templates and one raw scene with a click inside it.

```js
PD.deck('my-talk', {
  format: 2,
  id: 'my-talk',
  meta: {
    title: 'Why we built Acme',
    theme: 'slate',
    story: { framework: 'blank', goal: null, audience: '', targetMin: 10, bigIdea: '', shortIdea: '',
             oldWay: '', newWay: '', ask: '', proof: [], brand: 'Acme', tagline: '', tone: null }
  },
  scenes: [
    { id: 'open', template: 'statement',
      props: { kicker: 'Acme, in one sentence', line: 'Small teams deserve big-company tools.' },
      notes: 'Pause after the line. Let them read it twice.' },

    { id: 'proof', template: 'big-number',
      props: { value: 62, suffix: '%', label: 'of small teams still run on spreadsheets', source: 'Acme survey, 2026' },
      notes: 'Sixty-two percent. Most of the people in this room.' },

    { id: 'how', template: 'three-points',
      props: { kicker: 'How it works', items: [
        { title: 'Connect', line: 'Plug in the tools you already use.' },
        { title: 'Automate', line: 'Let the busywork run itself.' },
        { title: 'Grow', line: 'Spend the time on customers.' } ] },
      notes: 'Three clicks, one point each.',
      stepNotes: ['Connecting takes five minutes.', 'This is the part people love.', 'And this is why it matters.'] },

    { id: 'ask', notes: 'The ask. Then stop talking.',
      text: [ { str: 'Try it this week', style: 'title', y: 500, reveal: 'letters' } ],
      steps: [ { text: [ { str: 'acme.example', style: 'subtitle', y: 620, reveal: 'rise' } ],
                 notes: 'Read the address out loud.' } ] }
  ]
});
```

`meta.story` is optional for a hand-written deck. It is what the Studio's story tools read (see [story.md](story.md)); the
deck plays the same without it.

---

## The deck file

`deck.js` makes exactly one call: `PD.deck(id, DeckSource)`. Every `.js` file in a deck folder is exactly one top-level
`PD.*(…)` call, nothing else (no variables or functions outside it). The one-file export does not copy the files: it
writes each registration out again, a factory as its function's source, an object deck or the asset map as JSON. So
anything outside the call (and, for an object deck, its comments and layout) is not in the exported file.
`node tools/lint.js` checks this.

```text
DeckSource = {
  format: 2,
  id: string,                 // the same id as the PD.deck call; /^[a-z0-9][a-z0-9-]{0,47}$/
  meta: {
    title: string,            // the deck's name: the exported file's <title> and the presenter window's title
                              // (defaults to the id); a deck folder's browser tab shows its index.html <title>
    subtitle?, author?,
    theme: string,            // the look's id: 'slate', 'cosmos', or your own
    themePatch?: object,      // values laid over the look for this deck only (what the Studio's Look screen writes)
    worlds?: string[],        // extra world plugins on top of the look's own
    story?: StoryMeta,        // the Studio's brief (story.md); not drawn
    generator?: 'hand' | 'studio@2.0.0', updated?: string
  },
  scenes: Scene[]             // template scenes and raw scenes, in playing order
}
```

If `meta.theme` is missing, the engine uses the theme registered under the deck's own id (a `theme.js` named after the
deck), else the page's only theme, else it stops with a message asking you to set `meta.theme`.

## Template scenes

```text
TemplateScene = {
  id: string,                 // unique within the deck
  template: string,           // one of the 16 ids in templates.md
  props: object,              // the template's fields; missing optional ones take the template's defaults
  notes?: string,             // what you say when the scene opens
  stepNotes?: string[],       // stepNotes[k]: what you say after click k+1
  dwell?: number,             // seconds the recorder and the runtime estimate hold the last state (default 3)
  stepDwell?: number[],       // the same per click
  overrides?: object,         // a patch over what the template produced (below)
  beat?, energy?: 1..5, point?, flashback?, lint?: { ignore: string[] }   // story metadata, see story.md
}
```

The engine expands each template scene into a raw scene once, when the deck loads. `overrides` is merged into the result:
objects merge key by key, arrays replace, and `null` deletes a key. It is the escape hatch for one-off tweaks without
giving up the template:

```js
PD.deck('override-demo', {
  format: 2, id: 'override-demo', meta: { title: 'Overrides', theme: 'slate' },
  scenes: [{
    id: 'open', template: 'statement',
    props: { line: 'Same template, a warmer sky.' },
    overrides: { world: { ambientPreset: 'ember', horizonGlow: 0.6 }, dwell: 8 }
  }]
});
var scene = PD.compile('override-demo').scenes[0];
console.log(scene.like, scene.world.ambientPreset, scene.dwell);   // statement ember 8
```

## Raw scenes

A raw scene is a plain object. Positions are in a 1920 × 1080 design space whatever the screen size; `x` defaults to the
centre (960) and `y` is the **vertical centre** of a text block (default 540).

```text
RawScene = {
  id: string,
  world?: { [param]: number | string },   // the sky: see "The world" below
  worldTime?: number, worldEase?: string, // how long the world glides to its new values (default: the look's, 2.6 s)
  timing?: { [param]: [seconds, ease?, delay?] },   // per-parameter glide
  text?: TextSpec[], elements?: ElementSpec[], particles?: ShapeSpec[],
  motion?: Motion,                        // how particles fly in and out
  cues?: [{ at, flash?, shake? }],        // a white flash or a camera shake at a time (seconds)
  textDelay?: number,                     // seconds before the scene's text starts (default 0.5)
  prelude?: 'explode', preludeTime?, explodePower?,   // blow the previous particles apart first
  steps?: Step[],                         // extra clicks
  notes?: string, dwell?: number
}
```

### Text

```text
TextSpec = { str, style?, x?, y?, align?: 'center' | 'left' | 'right', maxWidth?, size?, weight?, track?, upper?,
             lineHeight?, color?: color | [top, bottom], fillDir?: 'v' | 'h', glow?, glowSize?, glowAlpha?, push?,
             reveal?, revealTime?, exit?, exitTime?, at?, id?, stride?, particleSize? }
```

- `style` is one of the look's text styles: `mega`, `hero`, `title`, `statement`, `subtitle`, `kicker`, `body`, `year`,
  `label`, `caption` (see [themes.md](themes.md#text-styles)). Any other field overrides that style for this text only.
- `align: 'left'` makes `x` the left edge; `'right'` makes it the right edge. Long text wraps at `maxWidth` (the style's,
  else 1700).
- `color` is a named colour of the look (`'gold'`, `'teal'` …), a `#hex`, or two of them for a gradient.
- `reveal`: `letters` (the default), `focus`, `rise`, `fade`, `wipe`, or `particles` (the words assemble from the glowing
  particle field). `revealTime` is its length in seconds.
- `exit` (when a later click or scene removes the text): `fade` (the default), `rise`, `sink`, `blur`, `particles` (the
  default for text that arrived as particles).
- `at` delays this text, in seconds, after the scene's `textDelay`.
- `id` lets a later step remove it.

### Elements: pictures and numbers

`elements` holds things other than plain text. Each has a `kind`:

```text
{ kind: 'image', asset, x?, y?, w?, h?, fit?: 'contain' | 'cover', align?, radius?, opacity?, glow?: color,
  reveal?: 'fade' | 'rise' | 'focus' | 'wipe' | 'particles', revealTime?, exit?, exitTime?, at?, push?, id?,
  sample?: { mode?: 'alpha' | 'luma', threshold?, maxPoints?: 3500, color?, size?, stride? } }

{ kind: 'counter', to, from?: 0, decimals?: 0, prefix?: '', suffix?: '', sep?: ',', style?: 'mega',
  x?, y?, align?, countTime?: 1.8, ease?: 'outCubic', at?, exit?, exitTime?, id? }
```

- An image's `asset` is an id from `assets.js`. With only `w` (or only `h`) the other follows the picture's shape.
  `reveal: 'particles'` turns the picture into glowing particles (at most 3,500): `sample.mode: 'alpha'` follows the
  transparent outline of a logo, `'luma'` follows bright areas (for a logo on a solid background).
- A counter counts from `from` to `to` in `countTime` seconds and holds the exact value: `to: 1234.5, decimals: 1,
  suffix: '%'` reads `1,234.5%`. It cannot use the particles reveal.

### Particles: shapes

`particles` holds shapes that the glowing particle field flies into:

| `shape` | What it is | Main fields (defaults) |
|---|---|---|
| `spark` | a breathing knot of light | `x`, `y` (centre), `count` (700), `radius` (34), `color` ('gold'), `color2` ('white'), `seed` |
| `cube` | a rotating wireframe cube | `x`, `y`, `size` (300), `perEdge` (46), `color` ('cyan'), `color2` ('violet'), `spin` (0.25), `tilt` (0.45) |
| `swarm` | particles drifting inside a cube | `inside` (the cube's `id`), `count` (500), `colors`, `seed` |
| `points` | fixed points you list | `points: [{ x, y, color?, s?, a? }]` (or a function returning them), `color`, `size` |

Give a shape an `id` so a step can `remove` it. All of a state's shapes and particle-revealed text share one field of at
most 9,000 particles; `PD.validate` warns above 8,000.

### The world

The world is the moving backdrop. Its parameters glide from one scene's values to the next. Each scene starts from the
look's defaults: a parameter a scene does not list glides back to its default, so to keep a setting, list it again (a
shot, below, or a shared object in a factory deck makes that easy). Inside a scene, each step's `world` adds to the scene's. Which
parameters exist depends on the look: each look enables some **world plugins** (Slate: `ambient`, `photo`, `spark`;
Cosmos: `cosmos`, `planet`, `spark`, `photo`; `core` is always on). A parameter of a world the look does not enable is
reported by `PD.validate` as `world.needs-plugin`.

| World | Parameters (default) |
|---|---|
| `core` | `roll` (0, camera tilt in radians) · `shake` (0) · `letterbox` (0, cinema bars 0–1) · `exposure` (1) · `vignette` (0.6) · `grain` (0.05) · `particles` (1, field opacity) |
| `ambient` | `ambient` (1) · `ambientPreset` ('charcoal'; Slate has `charcoal`, `ember`, `steel`, `dusk`) · `ambientDrift` (1) · `bokeh` (0.5) · `bokehSize` (1) · `horizonGlow` (0) |
| `photo` | `photo` (0, picture opacity) · `photoAsset` ('', an image asset id) · `photoZoom` (1) · `photoX`, `photoY` (0.5, the focus point) · `photoDim` (0.25) · `photoTint` ('') |
| `spark` | `spark` (0) · `sparkX` (960) · `sparkY` (540) |
| `cosmos` | `speed` (16) · `warp` (0) · `warpColor` ('cyan') · `stars` (1) · `nebula` ('aurora') · `nebulaAmount` (0.75) · `backdrop` (0.75) · `dust` (0.35) · `galaxy` (0) · `galaxyX` (1250) · `galaxyY` (520) · `galaxyScale` (1) · `galaxyTilt` (0.42) |
| `planet` | `earth` (0) · `earthX` (960) · `earthY` (540) · `earthR` (380) · `earthPitch` (0.35) · `earthRot` (-1.2) · `earthSpin` (0.02) · `lightX` (-0.7) · `lightY` (0.35) · `lightZ` (0.62) · `sun` (0) · `sunX` (1500) · `sunY` (260) · `sunScale` (1) |

`nebula`, `ambientPreset` and `photoAsset` cross-fade instead of gliding. Each look also defines **shots**, named
worlds you can reuse (Slate: `DRIFT`, `WARM`, `COOL`, `DARK`; Cosmos has one per scene of the One Giant Leap talk). A look's
`world` section can override the defaults above.

`timing` sets one parameter's glide: `timing: { photoZoom: [12, 'linear'], sun: [3, 'inOutQuad', 1] }` is
`[seconds, ease, delay]`. Ease names: `linear`, `inQuad`, `outQuad`, `inOutQuad`, `inCubic`, `outCubic`, `inOutCubic`,
`inBack`, `outBack`, `outElastic`, `outBounce` (an `ease` prefix such as `easeOutCubic` is accepted too).

### Motion

`motion` controls how particles fly: `{ ease, dur, spread, arc, stagger, entry, exit, match }`.
`stagger`: `random`, `radial`, `leftToRight`, `rightToLeft`, `topDown`, `bottomUp`, `none`.
`entry` (where new particles come from): `void`, `spark`, `edges`, `stars`, `center`, `below`.
`exit` (where unused ones go): `drift`, `warp`, `scatter`, `fade`, `rise`, `implode`.

### Steps

Each step is one more click inside the scene:

```text
Step = { text?, elements?, particles?, world?, timing?, motion?, cues?, remove?: string[], clear?: boolean,
         textDelay?, worldTime?, worldEase?, notes?, dwell? }
```

Steps add up. After click *k* the screen shows the scene's own items, then for each step 1…k in order: `clear` empties
everything, `remove` drops the items and shapes with those ids, then the step's `text`, `elements` and `particles` are
added. `world` changes add up the same way. `motion` and `timing` apply to the current click only.

```js
PD.deck('steps-demo', {
  format: 2, id: 'steps-demo', meta: { title: 'Steps', theme: 'slate' },
  scenes: [{
    id: 'reveal',
    text: [ { id: 'q', str: 'What do teams want?', style: 'statement', y: 480 } ],
    steps: [
      { text: [ { str: 'Less busywork.', style: 'hero', y: 620, reveal: 'particles' } ], notes: 'Wait for it.' },
      { remove: ['q'], world: { ambientPreset: 'ember' }, notes: 'The question leaves, the room warms up.' }
    ],
    notes: 'Ask the question first.'
  }]
});
console.log(PD.compile('steps-demo').scenes[0].steps.length);   // 2 (so the scene has states 0, 1 and 2)
```

## Speaker notes

`notes` on a scene, `notes` on each step (or `stepNotes` on a template scene). The presenter window shows the notes of
the current moment: the scene's notes plus those of every click so far. Write what you will actually say; the Studio
also uses notes to estimate how long the talk runs (140 words a minute).

Open the presenter window by pressing **N** on the deck (it opens `index.html?notes` in a window of its own), or by
opening `notes.html`. Drag it to your laptop screen; it follows the deck and can drive it (arrow keys, **B**, **R**).

Present from a deck in `decks/` (or its one-file export), never from the older copies of the talk in `cinema/`,
`legacy/` or `_archive/`. Those are kept for reference and the regression tests. Their **N** opens the presenter window
on the stage's own browser thread, so the stage can freeze on scene changes: the recorded test of the `_archive/` copy
shows a 333 ms freeze at scene 4 (see "Archive stall numbers" in `tools/regression/README.md`). To borrow from the talk,
copy from `decks/one-giant-leap/`.

## Pictures and fonts

Pictures and fonts must be **embedded** in `assets.js` as `data:` URLs. A picture loaded from a file path would make the
browser refuse to let the deck read its canvas when opened from `file://`, which breaks particles, thumbnails and video
recording, so the engine never loads one: an asset whose `src` does not start with `data:` is marked `not-embedded` and
skipped.

```text
PD.assets(deckId, {
  [assetId]: { type: 'image', src: 'data:image/png;base64,…', w, h, name, bytes }      // png, jpeg, webp, svg+xml
           | { type: 'font', src: 'data:font/woff2;base64,…', family, weight?, style?, name, bytes }   // woff2, woff, ttf, otf
})
```

The Studio writes this file for you. By hand, on a Mac or Linux:

```sh
base64 < logo.png | tr -d '\n' > logo.b64          # paste after 'data:image/png;base64,'
sips -g pixelWidth -g pixelHeight logo.png         # the w and h (macOS)
```

Use the real pixel size for `w` and `h`: the `logo` template uses them to keep the picture's shape. Then refer to the
asset by its id: `{ template: 'logo', props: { asset: 'logo' } }`, `{ kind: 'image', asset: 'logo' }` or
`world: { photo: 1, photoAsset: 'team-photo' }`. A font asset becomes available under its `family`; make it the deck's
font in a theme (see [themes.md](themes.md#your-own-font)).

The asset functions, for code that needs them:

```js
// a 1 x 1 transparent PNG, embedded
PD.assets('asset-demo', {
  dot: { type: 'image', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
         w: 1, h: 1, name: 'dot.png', bytes: 68 },
  remote: { type: 'image', src: 'logo.png', w: 400, h: 200, name: 'logo.png', bytes: 0 }
});
console.log(Object.keys(PD.assets.get('asset-demo')));        // ['dot', 'remote']

PD.assets.ready('asset-demo').then(function (report) {         // never rejects
  console.log(report.loaded, report.failed);                   // ['dot'] [{ id: 'remote', reason: 'not-embedded' }]
  var dot = PD.asset('asset-demo', 'dot');
  console.log(dot.ok, dot.w, dot.h, dot.img instanceof HTMLImageElement);   // true 1 1 true
});
```

- `PD.assets(deckId, map)` adds (or replaces) sources; `PD.assets.get(deckId)` returns the map;
  `PD.assets.put(deckId, id, source)` and `PD.assets.remove(deckId, id)` change one entry.
- `PD.assets.ready(deckId, { timeoutMs = 3000 })` decodes the pictures and loads the fonts. It never rejects: after the
  timeout, whatever is still loading is reported as `timeout` and the deck starts anyway.
- `PD.asset(deckId, id)` → `{ id, type, src, w, h, ok, error?, img?, face? }` once `ready()` has seen it, else `null`.

## Code instead of data: factory decks

The second argument of `PD.deck` can be a function that returns the DeckSource. Use it when you want loops or shared
helpers. It is called as `factory(PD, h)` when the deck is first compiled, and again only if the deck is compiled under
another look:

```js
PD.deck('factory-demo', function (PD, h) {
  var years = ['2019', '2021', '2023', '2026'];
  return {
    format: 2, id: 'factory-demo', meta: { title: 'Four years', theme: 'slate' },
    scenes: years.map(function (y, i) {
      return { id: 'y' + y, notes: 'Year ' + (i + 1) + '.',
               text: [{ str: y, style: 'mega', y: h.CY, reveal: i ? 'rise' : 'particles' }] };
    })
  };
});
console.log(PD.compile('factory-demo').scenes.length);   // 4
```

`h` offers `W(…objects)` (a shallow merge), `U` (maths helpers), `CX`, `CY`, `DW`, `DH` (960, 540, 1920, 1080),
`asset(id)` (an asset's source, for its `w` and `h`), and helpers that read the look: `theme`, `shots`,
`shot(name, fallback = 'DRIFT')`, `col(name)`, `role(name)`, `hasWorld(name)`, `hasParam(name)`,
`measure(str, style, size?)` → `{ w, h, lines }` and `fit(str, style, preferredSize, maxWidth)` → the largest size that
fits. Template expansions get the same helpers.

> **One catch.** The look is not known until the factory has returned `meta.theme`. A look helper used *while the factory
> runs* uses the theme registered under the deck's own id, else the page's only theme, and the deck stops if neither
> exists or if `meta.theme` later disagrees. It works in a deck page that loads one theme, but not in the test runner or
> the Studio, which load several. Either name your theme after your deck (as `decks/one-giant-leap/` does), or spell
> the values out (as `decks/_gallery/deck.js` does for its shots). `W`, `U`, the constants and `asset` are always safe.

A factory deck exports as code, so the Studio cannot re-open it for editing ("This deck was written by hand").

## Checking a deck

`PD.compile` turns a deck into what the stage plays: templates expanded, the look resolved. `PD.validate` then checks
it. Neither ever throws on a broken scene; problems come back as data.

```js
PD.deck('check-demo', {
  format: 2, id: 'check-demo', meta: { title: 'Checks', theme: 'slate' },
  scenes: [
    { id: 'a', template: 'statement', props: { line: 'Fine.' } },
    { id: 'b', template: 'no-such-template', props: {} },
    { id: 'c', text: [{ str: 'Wrong style', style: 'huge' }], world: { warp: 1 } }
  ]
});
var compiled = PD.compile('check-demo');
console.log(compiled.theme.id, compiled.worlds);   // slate ['core', 'ambient', 'photo', 'spark']
console.log(compiled.errors.map(function (e) { return e.code; }));   // ['template.unknown']
PD.validate(compiled).forEach(function (is) {
  console.log(is.level, is.code, 'scene ' + (is.scene + 1) + ':', is.msg);
});
// error template.unknown scene 2: unknown template "no-such-template"
// error world.needs-plugin scene 3: "warp" belongs to the "cosmos" world, which this deck's theme does not enable.
// error style.unknown scene 3: Unknown text style "huge". This theme has: mega, hero, title, …
```

- `PD.compile(deck?, { themePatch?, assetsDeckId? })`: `deck` is a registered id (default: the only one) or a DeckSource
  object. Returns `{ id, meta, source, theme, themeKey, worlds, scenes, sceneKeys, errors, assetsDeckId }`. A template
  scene that fails becomes a ⚠ card and an entry in `errors`.
- `PD.compileScene(compiled, index, scene)` returns a **new** compiled deck with one scene replaced (or appended, with
  `index` equal to the length). The other scenes are reused as they are. The Studio uses it on every edit:

```js
PD.deck('one-scene', { format: 2, id: 'one-scene', meta: { title: 'x', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'First draft.' } }] });
var c1 = PD.compile('one-scene');
var c2 = PD.compileScene(c1, 0, { id: 'a', template: 'statement', props: { line: 'Second draft.' } });
console.log(c1.scenes[0].text[0].str, '→', c2.scenes[0].text[0].str);   // First draft. → Second draft.
console.log(c1.sceneKeys[0] !== c2.sceneKeys[0]);                       // true
```

- `PD.validate(compiled)` → `[{ level: 'error' | 'warn', code, scene, sceneId, step?, path?, msg }]`. The codes:
  `scene.duplicate-id`, `world.unknown-param`, `world.needs-plugin`, `style.unknown`, `reveal.unknown`, `exit.unknown`,
  `motion.unknown`, `shape.unknown`, `element.unknown-kind`, `asset.missing`, `asset.not-embedded`, `asset.wrong-type`,
  `template.unknown`, `template.requires-world`, `template.prop-required`, `template.prop-type`, `template.prop-max`,
  `template.expand-failed`, `text.overflow`, `particles.budget`, `steps.remove-unknown`, and `validate.failed` when a scene
  could not be checked at all. It is a Studio and tools module: the one-file export leaves it out.

For a story-level review (pace, copy length, the arc), run `PD.story.lint(compiled)`; see [story.md](story.md#the-director).

---

## Playing a deck

### The page

`index.html` is a shim. It must load the engine with a plain `<script src>` (no `defer` or `async`), then the look, the
assets and the deck, then start:

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>My talk</title></head><body>
<script src="../../engine/pixeldeck.js"></script>
<script src="../../themes/slate/theme.js"></script>
<script src="assets.js"></script>
<script src="deck.js"></script>
<script>PD.start();</script>
</body></html>
```

`notes.html` is the same with `PD.start(null, { mode: 'notes' })` as its last line. A deck with its own look loads
`theme.js` from its folder instead of `../../themes/…` (see [themes.md](themes.md#a-look-for-one-deck)).

### Keys

| Key | What it does |
|---|---|
| → ↓ PageDown Space, or click | next click or scene |
| ← ↑ PageUp, or right-click | back one (shown settled, without the entrance) |
| `G`, then a number (`7` or `7.3`), then Enter | go to scene 7 (after 3 clicks) |
| Home / End | back to scene 1, played from the start / the very last moment |
| `B` or `.` | fade to black and back |
| `R` | replay this scene's entrance |
| `F` | frame-rate overlay |
| `Q` | render quality 1 → 1.5 → 2 |
| `N` | presenter window |

The address bar keeps your place: `index.html#3.1` opens scene 3 after one click, so a reload lands where you were.

### URL parameters

| Parameter | Effect |
|---|---|
| `?quality=1` | render quality (default 1.5; lower is lighter for an old laptop) |
| `?auto=6` | advance on its own, 6 seconds after each moment finishes (a kiosk) |
| `?loop=1` | after the last scene, start again |
| `?fps=1` | show the frame-rate overlay from the start |
| `?notes` | open as the presenter window |
| `?export` | register everything and play nothing (what `tools/export.js` uses, see [export.md](export.md)) |

### `PD.start(deckId?, opts?)`

Starts the page's deck. With no id it plays the only registered deck. The mode is `opts.mode`, else `notes` with
`?notes`, else register-only with `?export`, else `stage`. It returns a promise of the Player (stage mode), the presenter
window (notes mode) or `null` (register-only). A deck that cannot start shows the black panel and the promise rejects;
if engine files are missing it shows the panel and returns nothing. Other options are passed to `PD.boot`.

```js
PD.deck('start-demo', { format: 2, id: 'start-demo', meta: { title: 'Start', theme: 'slate' },
  scenes: [ { id: 'a', template: 'statement', props: { line: 'Hello.' }, notes: 'Say hello.' },
            { id: 'b', template: 'three-points', props: { items: [{ title: 'One' }, { title: 'Two' }] } } ] });

PD.start('start-demo', { quality: 1 }).then(function (player) {
  var off = player.onState(function (s) { console.log('at', (s.slide + 1) + '.' + s.step); });
  player.next();            // at 2.0
  player.next();            // at 2.1
  player.goTo(0, 0);        // scenes and clicks count from 0 here
  console.log(player.info());  // [{ id: 'a', steps: 0, dwell: 5 }, { id: 'b', steps: 2, dwell: 3 }]
  off();
});
```

### The Player

`PD.start` (stage mode) and `PD.boot` resolve with a Player:

| Member | What it does |
|---|---|
| `next()`, `prev()` | forward and back, as the arrow keys |
| `goTo(scene, step)` | jump to a state (both counted from 0); shown settled |
| `replay()`, `blackout()`, `home()`, `end()` | as `R`, `B`, Home and End |
| `openNotes()` | open the presenter window (needs a key press or click to have just happened, like any new window) |
| `info()` | `[{ id, steps, dwell, stepDwell?, beat? }]`, one per scene |
| `state()` | `{ slide, step, particles, busy, fps, workMs, ready }` |
| `onState(fn)` | call `fn(state)` after every move; returns a function that stops it |
| `ready` | true once every warm-up (textures, glyphs, particle targets) is done |
| `setManualClock(on)`, `tick(dt)`, `advance(dt)` | drive time yourself: `tick` advances and draws, `advance` only advances |
| `stage` | the `PD.Stage` it plays on (see [plugins.md](plugins.md#pdstage)) |
| `destroy()` | stop, remove the canvas, the listeners and `window.PixelDeck` |

### `PD.boot(opts)`

The Player without the mode logic, for putting a deck inside your own page. Each switch is on unless set to `false`:

```text
PD.boot({ deck?, compiled?, canvas?, container?, input, hash, hud, sync, api, raf, quality? }) → Promise<Player>
```

`container` puts the deck in an element of yours (it follows the element's size; keys count only while the focus is
inside it or on the page). `compiled` plays a deck you compiled yourself. `hash: false` leaves the address bar alone,
`sync: false` turns off the presenter-window link, `api: false` leaves `window.PixelDeck` unset.

```js
PD.deck('boot-demo', { format: 2, id: 'boot-demo', meta: { title: 'Boot', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'A deck in a box.' } }] });

var box = document.createElement('div');
box.style.cssText = 'width: 640px; height: 360px';
document.body.appendChild(box);
PD.boot({ deck: 'boot-demo', container: box, hash: false, sync: false, api: false }).then(function (player) {
  console.log(box.querySelector('canvas') === player.stage.canvas, typeof window.PixelDeck);   // true undefined
  setTimeout(function () { player.destroy(); }, 1000);
});
```

### `window.PixelDeck`

A stage page also exposes `window.PixelDeck`, which the video recorder and the test tools drive. It is handy in the
browser console too:

```js
PD.deck('api-demo', { format: 2, id: 'api-demo', meta: { title: 'API', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'One.' } }, { id: 'b', template: 'statement', props: { line: 'Two.' } }] });

PD.start().then(function () {
  console.log(PixelDeck.deck().id, PixelDeck.info().length);   // api-demo 2
  PixelDeck.next();
  console.log(PixelDeck.state().slide, PixelDeck.isBusy());    // 1 true
  PixelDeck.finish();                                          // fast-forward the current animation
  PixelDeck.setManualClock(true);
  PixelDeck.tick(1 / 30);                                      // one frame, by hand
  console.log(PixelDeck.snapshot().slice(0, 22));              // data:image/png;base64,
});
```

`info()`, `isBusy()`, `next()`, `prev()`, `goTo(si, step)`, `finish()`, `state()`, `setManualClock(on)`, `tick(dt)` (advance
and draw), `advance(dt)` (advance only), `warmAll()`, `snapshot(type = 'image/png')` → data URL, `deck()` → `{ id, meta }`,
and the `ready` flag.

---

## Quick reference

| Function | Section |
|---|---|
| `PD.deck(id, DeckSource \| factory)` | [The deck file](#the-deck-file), [factory decks](#code-instead-of-data-factory-decks) |
| `PD.assets(id, map)`, `.get`, `.put`, `.remove`, `.ready`; `PD.asset(id, assetId)` | [Pictures and fonts](#pictures-and-fonts) |
| `PD.compile`, `PD.compileScene`, `PD.validate` | [Checking a deck](#checking-a-deck) |
| `PD.start`, `PD.boot`, the Player, `window.PixelDeck` | [Playing a deck](#playing-a-deck) |
| `PD.theme`, `PD.theme.resolve` | [themes.md](themes.md) |
| `PD.template` and the 16 templates | [templates.md](templates.md) |
| `PD.world`, `PD.element`, `PD.shape`, `PD.reveal`, `PD.exitFx`, `PD.framework`, `PD.Stage`, `PD.Thumbs`, `PD.module` | [plugins.md](plugins.md) |
| `PD.story.*` | [story.md](story.md) |
| `PD.exportHTML`, `tools/export.js` | [export.md](export.md) |

The complete engine contract is `docs/v2-spec.md` (§4), including the amendments at its end.
