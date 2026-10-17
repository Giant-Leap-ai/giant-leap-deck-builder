# Pixeldeck v2: engine and deck-format architecture

**Lens:** engine and deck format. **Constraint that overrides everything else:** the One Giant Leap (OGL) deck must keep rendering pixel-for-pixel the same, and nothing touches `_archive/`.

## 0. Facts this design depends on (tested today)

I tested these with Playwright Chromium 1.56 on `file://` pages in the scratchpad. The archive was only opened read-only.

| Assumption | Result |
|---|---|
| `fetch()` of a local file | **Blocked** ("Failed to fetch") |
| Adding a `<script src>` from JS, or `document.write('<script src=…>')` while the page loads | **Works.** Scripts added with `document.write` run in order, before the next script tag in the page |
| `factory.toString()` | **Returns the exact source text,** comments included |
| `isSecureContext`, `showDirectoryPicker`, `showSaveFilePicker` | **true / function / function.** They need a user click; Safari and Firefox don't have them, so downloads are the fallback |
| Image loaded from `file://` and drawn on a canvas | **Taints the canvas.** `getImageData`, `toDataURL` and `captureStream` all throw `SecurityError` |
| Same image as a `data:` URL | **Clean** |
| `FontFace` from a base64 ArrayBuffer, and from `url(data:…)` | **Both load offline** |
| Archived deck run twice, with `Math.random` seeded and `requestAnimationFrame` stubbed, driven by `PixelDeck.tick(1/30)` | **Bit-identical** PNG hashes on both runs (6 checkpoints, 270 frames, about 87 ms per frame in software) |

Hidden dependency to fix: `cinema/index.html` loads `../engine/tween.js` (Ease and Timeline) from the **legacy pixel engine**. v2 copies that file unchanged into `engine/core/ease.js`.

## 1. Folder layout

```
pixeldeck/
  engine/                       generic engine: no deck content, no brand values
    pixeldeck.js                kernel: PD.module, registries, list of engine files, loader
    core/   util.js ease.js glow.js fx.js field.js text.js stage.js show.js sync.js
            assets.js compile.js validate.js export.js ui.js(HUD + notes CSS/DOM)
    worlds/ cosmos.js planet.js spark.js studio.js photo.js grid.js
    elements/ image.js counter.js bars.js line.js
    shapes/ basic.js(spark, cube, swarm, points) image.js text.js ring.js sphere.js grid.js
    templates/ cinematic.js(the 10 OGL-derived) essentials.js(the 8 generic)
    story/  frameworks.js check.js timing.js       pure data and functions, no rendering
  themes/
    cosmos/theme.js             today's look, values unchanged
    studio/theme.js             non-space: charcoal with warm gradient, clean type, less glow
  decks/
    one-giant-leap/             ← the deck people loved
      index.html notes.html deck.js assets.js theme.js README.md
      export/one-giant-leap.html        generated single-file build
    _starter/                   what the studio copies for "New deck"
    _parity/                    OGL rebuilt from templates (CI only)
  studio/   index.html studio.js …        storyboard wizard (another builder's lens)
  legacy/pixel/                 index.html notes.html slides.js palette.js engine/*  (moved as-is; relative paths still work)
  tools/    record.js golden.js perf.js export.js lint.js package.json
  docs/     authoring.md templates.md plugins.md story.md
  index.html                    launcher listing the decks
  cinema/index.html             after migration: a meta-refresh redirect to decks/one-giant-leap/
  _archive/                     frozen. Wednesday's talk runs from here (it includes its own engine/tween.js)
```

**Where OGL and its style live:**
- **The deck** is `decks/one-giant-leap/deck.js`.
- **Its style** is `decks/one-giant-leap/theme.js`: `PD.theme('one-giant-leap')`, which extends `cosmos` and adds the brand tokens and the two camera shots `HORIZON` and `BELOW`.
- **`themes/cosmos`** holds today's `STYLES`, `COLORS`, `FONT`, `NEBULA_PRESETS`, `WORLD_DEFAULTS` and the motion and timing defaults, unchanged, so any new deck can start from the OGL look.

**Every deck folder has the same shape.** `index.html` is a shim of about 12 lines:

```html
<script src="../../engine/pixeldeck.js"></script>   <!-- writes the engine <script> tags, in order -->
<script src="../../themes/cosmos/theme.js"></script>
<script src="theme.js"></script>
<script src="assets.js"></script>
<script src="deck.js"></script>
<script>PD.boot();</script>
```

`notes.html` is the same file with `PD.notes()` in place of `PD.boot()`. The loader loads every engine module (about 150 KB). Only the world plugins the theme or deck turns on get set up, and textures are built lazily. The loader must never be marked `defer` or `async`.

## 2. Module system: classic scripts that can export a single file

```js
PD.module('core/field', ['core/util', 'core/ease'], function (PD, U, Ease) { /* … */ return { Field: Field }; });
```

- **How modules run.** Each module runs as soon as it is registered, and its dependencies must already be registered; otherwise it throws a clear error. The kernel keeps `{name, deps, factory, opts}` in registration order.
- **The kernel itself** is `(function kernel(g){…})(window)` and saves a reference to itself in `PD.kernel`.
- **One rule:** every engine, theme, template and deck file contains exactly one top-level statement, the `PD.*(…)` call. `tools/lint.js` checks this.

**Verdict on the `.toString()` idea: adopt it.**
- **For:**
  - It works from `file://` with no `fetch` and no permission prompts.
  - An exported file can export itself again, so the studio can round-trip.
  - The source comes back unchanged, comments included.
  - There's no build step and no bundled copy that can go stale.
- **Costs, each with a fix:**
  - Code outside the factory is lost. The lint rule above prevents it.
  - The text `</script` inside the source would break inline HTML. The exporter rewrites `</script` to `<\/script` and `<!--` to `<\!--`, and lint forbids both in source.
  - Large data inside functions would be wasteful. Assets therefore go through `PD.assets(id, {...})` as plain data and are exported with `JSON.stringify`, never `toString`.
- **Rejected alternatives:**
  - Reading the source with `showDirectoryPicker`: it needs a click and a permission in every session, and it can't work from inside an exported file.
  - A committed `dist/` bundle: it goes stale.
  - `fetch`: blocked.

**`PD.exportHTML(id)` builds the file in this order:**
1. The doctype and `PD.ui.css`.
2. `kernel.toString()`.
3. For each exportable module: `PD.module(<name>, <deps>, <factory source>)`.
4. The theme factories.
5. `PD.assets(id, <JSON>)`.
6. The deck factory.
7. `PD.boot()`.

Studio-only code is registered with `opts.export = false` and left out.

`tools/export.js` runs the same function in headless Chromium, so the command line and the studio produce identical bytes.

In the exported file, the presenter window opens `about:blank` and the main window writes the notes page into it. The main window's own `PD` draws the thumbnails into the notes window's canvases (same origin, so this works), and Sync connects the two windows directly with `postMessage`.

## 3. Plugin model

### 3.1 Draw order (today's order, kept exactly)

| z | Pass | Space |
|---|---|---|
| 0 | cosmos.background | screen |
| | *camera transform begins: roll, plus shake jitter. The jitter's two `Math.random()` calls stay at the top of `draw()`* | |
| 10 | cosmos.backdrop · 20 galaxy · 30 nebulae · 40 stars | camera |
| 50 | planet.earth (dark occluding disc, then ray-cast) · 60 planet.sun (hidden when behind Earth) | camera |
| | *camera transform ends* | |
| 70 | cosmos.dust | screen |
| 80 | **particle field** (core) | screen |
| 90 | spark glow | screen |
| 100 | **elements** (text, image, counter, bars, line) | screen |
| 110–160 | flash, vignette, grain (skipped in thumbnails), exposure, letterbox, blackout | post |

New layers go into the gaps. Camera-space passes must sit next to each other: the stage applies the camera transform once around that run of passes.

### 3.2 World plugins

These are the code from `space.js`, `earth.js`, `FX.sun` and `stage.draw`, rehoused.

- **cosmos:** `speed warp warpColor stars roll shake nebula* nebulaAmount backdrop dust galaxy galaxyX galaxyY galaxyScale galaxyTilt`. `*` marks a string parameter that crossfades.
- **planet:**
  - Parameters: `earth earthX earthY earthR earthPitch earthRot earthSpin lightX lightY lightZ sun sunX sunY sunScale`.
  - It owns `spinAcc`, Earth texture generation through `warm`, the adaptive `earthBudget` through `adapt`, and the boot-time `Earth.step(1e9)` through `prepare`.
- **spark:** `spark sparkX sparkY`.
- **studio** (non-space backdrop):
  - Parameters: `studio`, `studioPreset*` (palettes from `theme.backdrops`), `studioDrift`, `bokeh`, `bokehSize`, `horizonGlow`.
  - It draws three or four pre-rendered 256 px soft blobs moving on Lissajous paths over a base gradient, plus faint bokeh from Glow sprites. Under 1 ms per frame.
- **photo** (image backdrop with Ken Burns):
  - Parameters: `photo`, `photoAsset*`, `photoZoom`, `photoX`, `photoY` (focus point 0–1), `photoDim`, `photoTint`, `photoBlur` (crossfades to a blurred copy built once).
  - Ken Burns is just timing, for example `timing: { photoZoom: [12, 'linear'] }`.
  - Images must be `data:` URLs so the canvas stays clean for the recorder.
- **grid** (stretch goal): a perspective "blueprint" floor for tech decks.

**Parameter names stay flat** (`earthX`, not `planet.earthX`) so existing scenes and authoring stay simple. Each plugin declares which names it owns, and registering a name that's already taken throws.

The stage combines all parameters into the world defaults; the theme's `world` values override them. Crossfading string parameters keep a stack of `{value, amount, from, to, t0, dur}`. This generalises today's `stage.neb`, which becomes `state.xf.nebula`.

### 3.3 Elements

Today's `TextLayer` lifecycle becomes the contract every element follows. `text: []` still works and means elements of kind `text`; `elements: []` takes `{kind, …}`.

- **text:** unchanged.
- **image:** `{kind:'image', asset, x, y, w|h, align, radius, glow, opacity, reveal}`. `reveal: 'particles'` samples the image (it's a `data:` URL, so this is allowed).
- **counter:** `{kind:'counter', from, to, decimals, prefix, suffix, style, countTime, ease}`. It draws from a cached bitmap of each digit, so it never re-renders text per frame.
- **bars:** `{kind:'bars', data:[{label, value, color}], x, y, w, h, max, orientation, highlight, growTime, particles:bool}`.
- **line:** `{kind:'line', data|points, x, y, w, h, color, width}`, revealed by drawing itself on.

### 3.4 Particle shapes, reveals and exits

- **Shapes:**
  - Existing: `spark cube swarm points`.
  - New: `image` (sample a `data:` image by alpha or brightness, with stride, size and an optional single colour), `text` (particles only), `ring`, `sphere`, `grid`, `bars`.
  - Shapes that others depend on are built first; that's today's `byId` pre-pass for `swarm.inside`.
- **Reveals** are a registry. Today's `letters focus rise fade wipe particles` become plugins with the same maths, split into `pose()` (returns alpha, dy, scale) and an optional `paint()`. Exits work the same way.

### 3.5 Themes

Values only, resolved through an `extends` chain. The schema is in §5.

The renderer reads the resolved theme where it now reads the globals `STYLES`, `FONT`, `COLORS` and `NEBULA_PRESETS`, and the defaults currently hard-coded in `Stage.enter`:
- motion: `dur 1.7`, `spread 1`, `arc .3`, `random / void / drift`
- timing: `worldTime 2.6`, settled `1.4`, `textDelay .5/.15/.2`, settled clamps `1.2/.5`

### 3.6 Scene templates

Templates are pure, deterministic functions from props to a raw scene. `PD.compile` expands each one exactly once.

| Template | Beat | Props (* = required) | Basis |
|---|---|---|---|
| `cold-open` | hook | line*, sparkColor, hold | OGL 1 |
| `brand-reveal` | promise | title*, subtitle, nebula, flash | OGL 2 |
| `warp` | context | lines[]* (one per click), color, nebula | OGL 3 |
| `you-are-here` | context | kicker, line*, marker, earthRot | OGL 4 |
| `planet` | context | kicker, line*, region | OGL 5 |
| `sunrise` | emotion | kicker, line* | OGL 6 |
| `timeline` | evidence | kicker, title*, milestones[{when*, label*, pos, color}]*, curve | OGL 7 |
| `breakout` | tension | line*, breakout*, tagline | OGL 8 |
| `pivot` | turn | lead, from*, to*, tagline | OGL 9 |
| `finale` | close | title*, thanks, contact | OGL 10 |
| `statement` | any | kicker, line*, align, reveal | generic |
| `section` | any | number, title* | generic |
| `big-number` | evidence | value*, prefix, suffix, label*, source | counter |
| `bars` | evidence | title*, data[]*, unit, highlight, particles | bars |
| `quote` | evidence | quote*, who*, role | generic |
| `points` | explain | title*, items[]* (one step each) | generic |
| `logo` | promise / close | asset*, tagline | image shape |
| `photo` | emotion | asset*, caption, focus, zoom | photo world |

Every template also accepts `world` / `shot` (a key from `theme.shots`) and `overrides` (a deep-merge patch applied after expansion, as an escape hatch).

**Raw scenes still work unchanged.** `compile` passes any scene without `template` through **by reference**, not cloned. Function-valued `points` keep working.

**Contract:** scene and spec objects keep the same identity for the life of a Stage. Stage caches glyphs and particle targets keyed on that identity, so expanding again on every slide entry would cause jank.

## 4. Deck format

```js
// decks/one-giant-leap/deck.js — the whole file is one call
PD.deck('one-giant-leap', function (PD, h) {           // h = {merge, U, col, theme, shots}
  var HORIZON = h.shots.HORIZON, BELOW = h.shots.BELOW, W = h.merge;
  function curveXY(u) { … }                              // helpers live inside the factory
  return {
    meta: {
      title: 'One Giant Leap', subtitle: 'Making work more human', author: 'One Giant Leap',
      bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
      audience: 'Conference keynote', durationMin: 3, framework: 'leap',
      theme: 'one-giant-leap', worlds: ['cosmos', 'planet', 'spark'], format: 2
    },
    scenes: [ { id: 'spark', beat: 'hook', world: {…}, … }, /* the 10 raw scenes, values unchanged */ ]
  };
});
```

- **Decks made in the studio** are JSON inside the same wrapper. Each scene entry is `{id, beat, template, props, notes, dwell, overrides}`, so no functions are needed and the studio round-trips them fully.
- **Hand-written decks** may mix in raw scenes that contain code. The studio shows those as locked "code scenes" and only lets you edit their notes, dwell and beat.
- **`PD.deck(id, [...])`** also accepts today's `DECK` array, as does the plain global `DECK`.
- **Beats** come from `meta.framework`, a `PD.framework` id such as `leap`, `abt`, `sparkline`, `hero` or `scqa`.
  - Each beat looks like `{id, label, prompt, suggest:[template ids], share, required}`.
  - OGL maps to the `leap` framework like this:
    - spark: hook
    - title: promise
    - warp, galaxy, home: context
    - sunrise: emotion
    - leaps: evidence
    - box: tension
    - next: turn
    - thanks: close

**Assets** must all be `data:` URLs:

```js
PD.assets('one-giant-leap', {
  logo:  { type: 'image', src: 'data:image/png;base64,…', w: 1200, h: 400, name: 'logo.png' },
  inter: { type: 'font',  src: 'data:font/woff2;base64,…', family: 'Inter', weight: '400 800' }
});
```

- **Studio import limits:** images are scaled to at most 2400 px on the long edge, at quality 0.85, and it warns above 20 MB total.
- **Fonts** are listed in `theme.fontFaces: [{family, asset, weight}]`.
- **Boot order:** `PD.boot()` first awaits `PD.assets.ready()`, which runs `img.decode()` and `FontFace(family, ArrayBuffer)`, then `.load()`, then `document.fonts.add`. Only after that does it compile and lay out text, because measuring text before the font arrives would cache the fallback font's bitmaps.

## 5. Public API contracts

```js
// kernel
PD.version = '2.0.0';
PD.module(name, deps, factory, opts?) → exports      // opts.export=false: studio-only
PD.get(name) → exports;  PD.modules() → [{name,deps,factory,opts}];  PD.kernel → Function
// registries: register(name, def) → def; X.get(name); X.list()
PD.world(name, WorldPlugin);  PD.element(kind, ElementPlugin);  PD.shape(name, ShapePlugin)
PD.reveal(name, Reveal);  PD.exitFx(name, Exit);  PD.template(name, Template)
PD.theme(name, (PD) => Theme);  PD.framework(id, Framework)
PD.assets(deckId, {[assetId]: Asset});  PD.deck(id, (PD, h) => DeckSource | RawScene[])
// pipeline
PD.compile(id?) → {id, meta, theme, scenes: RawScene[], assets}       // once per load
PD.validate(compiled) → [{level:'error'|'warn', scene, step?, path, msg}]   // unknown params, styles, assets, overflow
PD.story.check(compiled) → Issue[]      // beats covered and in order, big idea stated, runtime vs durationMin
PD.timing(compiled) → [{scene, step, animSec, dwellSec}]   // headless ticks until !busy, no drawing
PD.boot({canvas?, deck?, hud=true, input=true, sync=true}) → Promise<Show>
PD.notes(opts?) → Promise<Notes>
PD.exportHTML(id, {notes:true}) → string;  PD.serializeDeck(model) → string (deck.js source)

WorldPlugin = {
  params: {name: default}, crossfade?: [stringParam],
  preload?(theme, assets), create(stage) → state, prepare?(world, state),
  warm?(budgetMs, state) → done, update?(dt, W, state), adapt?(workMs, state),
  passes: [{ z, space: 'screen'|'camera'|'post', draw(ctx, W, state, f /* {T,S,thumb,stage} */) }]
}
ElementPlugin = { create(spec, env /* {theme,assets,stage} */) → Layer }
Layer = { spec, id, reveal, inStart, inDur, outStart, outDur, arriveAt, particleAlpha,
          reset(), startOut(t), animating(t), gone(t), ensureCache(rs), draw(ctx, t, rs),
          points?(stride, size) → Target[] }            // required when reveal === 'particles'
ShapePlugin = { create(spec, env /* {byId,theme,assets,uid} */) → Shape }
Shape = { id, n, px: Float32Array, py: Float32Array, color(i) → [r,g,b], size(i), alpha?(i), update?(t) }
      | { id, n, static: [{x, y, color?, s?, a?}] }
Target = { x, y, r, g, b, a, s, key, group?, dyn?, di? }
Reveal = { inDur, pose(eIn, pIn, layer, t) → {alpha, dy, scale}, paint?(layer, ctx, pIn, alpha, rs) }
Template = { label, summary, beats: [beat], worlds: [world],
  props: {[k]: {type:'text'|'longtext'|'number'|'color'|'enum'|'bool'|'asset'|'list'|'shot'|'nebula',
                required?, max?, options?, of?, label, help}},
  example: props, expand(props, env /* {theme,assets,h} */) → RawScene }
Theme = { extends?, fonts: {display, body}, fontFaces: [{family, asset, weight}], colors, styles,
  nebulae, backdrops, world, motion, timing, shots, worlds: [world], ui: {accent, hud} }
RawScene = today's slide object + {beat, elements}; Step = today's step + {elements}

stage = new PD.Stage(canvas, {deck: compiled, thumb?, quality?})
  .resize(w, h, dpr) .enter(si, step, 'live'|'settled'|'instant') .tick(dt) .draw() .busy()
  .finishAll() .still(si, step) .stepsOf(si) .setDeck(compiled) .cur
window.PixelDeck  // unchanged: info isBusy next prev goTo finish state setManualClock tick
                  // added: ready, warmAll(), advance(dt) (no draw), snapshot() → dataURL, deck() → {id, meta}
Sync: BroadcastChannel 'pixeldeck:<deckId>', storage key 'pixeldeck:<deckId>:msg';
  {type:'state', slide, step, steps, total, id, beat, blackout} | {type:'cmd', cmd, slide?, step?} | {type:'hello'}
URL params: quality, auto, loop, fps, clock=manual, seed=N
```

**Plugin performance rule:** a plugin may spend at most 2 ms per frame at 1080p and must not allocate inside hot loops. Expensive textures are built in `preload`, or spread across frames in `warm`.

## 6. Migration with no visual change

**M0, today, before the talk:**
- Run `git init` and commit everything (`*.mp4` is already in `.gitignore`).
- Write `tools/golden.js` and record the baseline **from `_archive/…/cinema/index.html`, read-only**.
- Present Wednesday from the archive. Keep the MP4 as the backup.
- Nothing else changes.

**Then a series of small commits. Each one must pass the golden check with 0 differing pixels:**

| Step | Change |
|---|---|
| M1 | Move the legacy deck to `legacy/pixel/`. Add `core/ease.js`. Wrap each cinema engine file in `PD.module`, unchanged, re-exporting the old globals (`U col COLORS DW DH CX CY Ease Timeline`) through `PD.compat`. |
| M2 | Move the values into `themes/cosmos` and `decks/one-giant-leap/theme.js`. |
| M3 | Turn `Stage.draw` into the ordered pass list. Create the cosmos, planet and spark plugins, plus the `warm`/`adapt`/`prepare` hooks and the general crossfade stacks. |
| M4 | Move shapes, reveals and elements into registries. |
| M5 | Turn `scenes.js` into a `deck.js` factory. Stage takes the compiled deck; `window.DECK` is no longer needed. |
| M6 | Shared notes page, Sync names per deck, `record.js --deck decks/one-giant-leap`. Notes thumbnails get golden checks too. |
| M7 | `PD.exportHTML`. The exported single file must pass the golden check. |
| M8 | Build `decks/_parity` (OGL rewritten entirely with templates). It must match the baseline exactly. |
| M9 | Replace `cinema/` with a redirect page. |

New features (the studio, photo and studio worlds, counters) come only after that. They don't affect OGL frames, because OGL doesn't turn those worlds on. The golden check runs on every commit anyway.

**How `tools/golden.js` works:**
- **Setup:**
  - Pinned Playwright 1.56.1 Chromium, viewport 1920×1080, device pixel ratio 1, `?quality=1`.
  - Baseline and candidate are recorded on the same Mac (it needs the Avenir Next font).
- **Before the page loads:** an init script replaces `Math.random` with a seeded mulberry32 that also counts calls, and stubs `requestAnimationFrame` so wall-clock time never drives the deck.
- **Warm-up:** v2 calls `PixelDeck.warmAll()`. For the baseline, an adapter calls `Earth.step(1e9); Show.stage().prewarm(1e9)`.
- **Capture:**
  - For all 21 slide/step states, call `next()` and advance in steps of 1/30 s.
  - At +0.2, 0.6, 1.2, 2, 3, 4.5 and 6 s, and 0.5 s after the state settles, capture `canvas.toDataURL()`. Reading the canvas back forces software rendering, which is what makes it deterministic.
  - Also capture: `goTo` slide 7 step 4, `prev` from 8.1, replay, Home, and every notes thumbnail (`still()`).
  - About 200 frames, roughly 5 minutes.
- **Comparison:**
  - Equal SHA-1 hashes pass. Otherwise, decode with `pngjs` and count differing pixels.
  - Write `report.html` showing baseline, candidate and an amplified diff.
  - **Check the random-number call counts first.** If the count differs, the report says "RNG call-order drift": the cause is a change in call order (for example, `Sync`'s one call while the page loads, or the shake jitter), not a rendering change.
- **Speed check:** `tools/perf.js` runs the deck in real time with the GPU on and samples `state().workMs` per state. It fails if any state's p95 is more than 10% above the baseline.