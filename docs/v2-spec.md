# Pixeldeck v2: Build Specification (final)

**Status:** final for the v2.0 build. Implementers code against this document. If something here conflicts with a proposal or the critique, this document wins. Contract changes need a written amendment from the lead (see §10, R18).
**Date:** 2026-10-13 (the day before the talk).
**ROOT:** the repository root. All paths below are relative to ROOT unless they are absolute.
**Design space:** 1920 × 1080 design units. `DW=1920`, `DH=1080`, `CX=960`, `CY=540`.
**Facts checked while writing this spec (read-only):**
- `cinema/` and `_archive/2026-10-13-stage-ready/cinema/` are byte-identical (`diff -rq` printed nothing).
- `engine/tween.js` is byte-identical to the archive copy.
- `tools/regression/` already contains `golden.js`, `diff.py` and an 84-frame baseline.

### Glossary
| Term | Meaning |
|---|---|
| **Stage** | Pure renderer and state machine for one canvas. No window listeners. |
| **Player** | Owns the window: sizing, input, URL hash, HUD, sync, `window.PixelDeck`. |
| **Scene / step / state** | A scene is one entry in `scenes[]`. A step is one extra click inside a scene. A state is the pair `(scene index, step)`, where step 0 means "no steps yet". |
| **Shot** | A named world preset that belongs to a theme, e.g. `HORIZON` or `DRIFT`. |
| **Theme** (code) / **Look** (UI) | A set of values only: fonts, colors, text styles, palettes, motion defaults, shots, enabled worlds. |
| **World plugin** | Owns a group of flat world parameters plus their draw passes, e.g. `cosmos`, `planet`, `spark`, `ambient`, `photo`. |
| **Element** | Something drawn on screen with a reveal: `text`, `image`, `counter`. |
| **Shape** | A source of particle targets: `spark`, `cube`, `swarm`, `points`. |
| **Template** | A pure function from props to a raw scene. |
| **Framework / beat / role** | Story structure. A framework is a list of beats. Each beat has one or more roles: hook, turn, cta, and so on. |
| **DeckSource** | The one canonical deck object, registered with `PD.deck`. |
| **CompiledDeck** | The DeckSource with every template expanded and the theme resolved. This is what Stage consumes. |

---

## 1. Overview & principles

### 1.1 What v2 is
1. **A generic cinematic engine** (`engine/`). It contains no deck content and no brand values. It runs as plain classic scripts from `file://`.
2. **Decks as folders** (`decks/<id>/`). Each holds a deck file, an assets file and small HTML shims. **One Giant Leap (OGL) becomes `decks/one-giant-leap/`**, which contains both the deck and its style (`theme.js`).
3. **The Studio** (`studio/index.html`). It runs a guided interview, then a story shape, then a look, then a storyboard, then rehearsal, then export. Its output is a coherent deck as a single self-contained `.html` file.

### 1.2 Principles (non-negotiable)
| # | Principle | How it is enforced |
|---|---|---|
| P1 | **OGL renders identically.** Every golden frame at 1280×720 and 1920×1080 (`?quality=1`) has the same SHA-1 as the baseline from `_archive`, and the `Math.random` call count matches at every capture. | Exact gate, §8.3 |
| P2 | **`_archive/` is never modified, moved or written to.** It may be read and committed to git as-is. | Lint check: no tool may write under `_archive` (WP0) |
| P3 | **The talk comes first.** Nothing under ROOT is created, edited or moved until the talk is over (§8.0). Day 0 is the first working session after the talk. | Process rule |
| P4 | **Runtime constraints:** runs from `file://` by double-click, with no network, classic `<script>` only, no ES modules, no build step, no CDN, Canvas2D only, Chrome as the primary browser, 60 fps on a MacBook. Node tooling exists only under `tools/` and is dev-only. | `tools/lint.js` |
| P5 | **One deck format:** `deck.js` calls `PD.deck(id, DeckSource \| factory)`, and `assets.js` calls `PD.assets(id, map)` with `data:` URLs only. No JSON or other sidecar is read at runtime. | §4.2, §4.8 |
| P6 | **Engine is content-free.** Themes hold values. Decks hold content. OGL's theme is a **self-contained snapshot**: it does not extend `cosmos`, so later work on the generic look can't change OGL. | Review + golden gate |
| P7 | **Stage is pure; Player owns the window.** Multiple Stages can share one page (the Studio needs this). | §4.9, §4.10 |
| P8 | **Determinism.** No new `Math.random()` calls on any code path the Player runs for a deck that uses no new features (§4.14). | Lint allow-list + RNG count in the gate |
| P9 | **The Studio coaches structure; it does not write the speaker's sentences.** It is rule-based, offline and deterministic. It never claims language understanding it doesn't have. | §6 |
| P10 | **v1 is ambitious but shippable.** Everything marked **v2** is out of scope for this build. | §7.10, §9 |

### 1.3 The talk (Phase 0, verified facts behind it in §8.0)
- **Present from** `_archive/2026-10-13-stage-ready/cinema/index.html`. It is byte-identical to `cinema/`, and nobody will touch it.
  - Fallback 1: `cinema/index.html`.
  - Fallback 2: `cinema-backup.mp4`.
- **Open the presenter notes by double-clicking** `_archive/2026-10-13-stage-ready/cinema/notes.html`. **Do not press N.** N opens a same-thread popup, which caused 335 ms stalls at state 4.0.
- **Open exactly one deck and its notes.** Quit Chrome first. Two copies of the deck drive each other because they share the channel `pixeldeck-cinema`.
- Do **one full warm run-through** with both windows open before the audience arrives. Do not reload either window afterwards.
- Press **F** to check the frame rate at states 3.1 and 4.0.

---

## 2. Final repo layout

The **Owner** column names the work package (§9) that creates the file. The **Action** column says whether the file is new, moved or modified.

```
pixeldeck/
  index.html                         WP8  NEW   launcher (static links; replaces legacy deck at root)
  README.md                          WP8  MOD   rewritten
  .gitignore                         WP0  MOD   + tools/test/.harness.html, decks/*/export/, tools/regression/out/
  cinema-backup.mp4, cinema-preview-720p.mp4, pixeldeck-backup.mp4   untouched (git-ignored)

  engine/
    pixeldeck.js                     WP1  NEW   kernel + registries + loader + MANIFEST
    core/
      util.js                        WP1  MOVE  from cinema/engine/util.js (U, DW..CY, base COLORS, colFor)
      ease.js                        WP1  MOVE  from engine/tween.js (Ease, Timeline) — copy before legacy move
      glow.js                        WP1  SPLIT from cinema/engine/fx.js (Glow)
      fx.js                          WP1  SPLIT from cinema/engine/fx.js (FX)
      space.js                       WP1  MOVE  from cinema/engine/space.js (Space textures + World)
      earth.js                       WP1  MOVE  from cinema/engine/earth.js
      shapes.js                      WP1  SPLIT from cinema/engine/particles.js (spark, cube, swarm, points)
      field.js                       WP1  SPLIT from cinema/engine/particles.js (Field)
      text.js                        WP1  MOVE  from cinema/engine/type.js (TextLayer = element 'text')
      theme.js                       WP1  NEW   theme resolution
      assets.js                      WP1  NEW   asset runtime (decode, fonts, ready)
      compile.js                     WP1  NEW   DeckSource → CompiledDeck (template expansion)
      stage.js                       WP1  SPLIT from cinema/engine/stage.js (Stage)
      sync.js                        WP1  SPLIT from cinema/engine/stage.js (Sync)
      thumbs.js                      WP1  NEW   idle-sliced thumbnail cache
      hud.js                         WP1  NEW   CSS + HUD DOM + on-screen errors
      player.js                      WP1  SPLIT from cinema/engine/stage.js (Show → Player) + PD.start/boot
      notes.js                       WP1  NEW   from cinema/notes.html (presenter UI built in JS)
      export.js                      WP2  NEW   PD.exportHTML, markers, escaping, self-test
      validate.js                    WP4  NEW   PD.validate
    worlds/
      core.js                        WP1  NEW   camera (roll, shake) + particles/elements + post passes
      cosmos.js                      WP1  NEW   background, backdrop, galaxy, nebulae, stars, dust
      planet.js                      WP1  NEW   earth + sun
      spark.js                       WP1  NEW   spark glow
      ambient.js                     WP3  NEW   non-space gradient/blob/bokeh backdrop
      photo.js                       WP3  NEW   full-bleed image backdrop (Ken Burns)
    elements/
      image.js                       WP3  NEW
      counter.js                     WP3  NEW
    templates/
      cinematic.js                   WP4  NEW   10 OGL-derived templates
      essentials.js                  WP4  NEW   6 generic templates
    story/                                     all registered with {export:false}
      frameworks.js                  WP5  NEW
      copy.js                        WP5  NEW   microcopy, STOPWORDS, IMPERATIVES, JARGON, BUDGET
      interview.js                   WP5  NEW
      timing.js                      WP5  NEW
      board.js                       WP5  NEW   storyboard generation
      lint.js                        WP5  NEW   coherence checker

  themes/
    cosmos/theme.js                  WP1  NEW   generic cinematic look (starts as a copy of today's values)
    slate/theme.js                   WP3  NEW   non-space look (charcoal, warm accent, low glow)

  decks/
    one-giant-leap/
      index.html                     WP1  NEW   shim
      notes.html                     WP1  NEW   shim (same page in notes mode)
      deck.js                        WP1  NEW   from cinema/scenes.js (factory; values verbatim)
      theme.js                       WP1  NEW   'one-giant-leap' theme: self-contained snapshot
      assets.js                      WP1  NEW   PD.assets('one-giant-leap', {})
      README.md                      WP1  MOVE  from cinema/README.md (paths updated)
      export/one-giant-leap.html     WP2  GEN   generated by tools/export.js (git-ignored)
    _starter/                        WP2  NEW   index.html, notes.html, deck.js, assets.js, README.md
    _parity/                         WP4  NEW   index.html, deck.js, assets.js — OGL rebuilt from templates
    _gallery/                        WP3  NEW   index.html, deck.js, assets.js — exercises ambient/photo/image/counter/slate

  studio/
    index.html                       WP6  NEW
    studio.css                       WP6  NEW
    app.js store.js persist.js import.js                 WP6  NEW
    screens/welcome.js brief.js shape.js look.js export.js   WP6  NEW
    screens/board.js rehearse.js                         WP7  NEW
    ui/filmstrip.js arc.js forms.js preview.js inspector.js director.js assets-panel.js picker.js   WP7  NEW

  legacy/pixel/                      WP1  MOVE  index.html notes.html slides.js palette.js engine/*.js tools/sprite-preview.html
                                                (relative paths unchanged, so it still runs)
  cinema/
    index.html                       WP1  MOD   redirect stub → ../decks/one-giant-leap/index.html (keeps ?query and #hash)
    notes.html                       WP1  MOD   redirect stub → ../decks/one-giant-leap/notes.html
    engine/, scenes.js, README.md    WP1  DEL   (moved; archived copy remains in _archive)

  docs/                              WP8  NEW   authoring.md themes.md templates.md plugins.md story.md studio.md export.md
  tools/
    package.json                     WP0  MOD   playwright 1.56.1 (unchanged), scripts: test, golden, lint, export
    record.js                        WP1  MOD   --deck <folder|html|alias>, waits for PixelDeck.ready
    lint.js                          WP1  NEW   module/file rules (§3.5)
    export.js                        WP2  NEW   headless PD.exportHTML
    regression/
      golden.js                      WP0  MOD   extended (deck arg, sizes, RNG count, thumbs, extra paths)
      diff.py                        WP0  KEEP  tolerance report
      compare.js                     WP0  NEW   SHA-1 + RNG compare, falls back to diff.py
      perf.js                        WP0  NEW   real-time workMs p95 per state
      stall.js                       WP0  NEW   frame-gap check with presenter window open
      baseline-one-giant-leap/       KEEP       historical 84 frames (do not edit)
      baselines/ogl/{1280,1920,thumbs}/  WP0  NEW  captured from _archive (+ rng.json in each)
    test/
      run.js assert.js harness.tpl.html   WP0  NEW   browser unit-test runner
      e2e.js                         WP0  NEW   Playwright e2e runner
      specs/wpN-*.test.js            each WP owns its own prefix
      e2e/wpN-*.e2e.js               each WP owns its own prefix
      fixtures/wpN-*                 each WP owns its own prefix
  _archive/                          NEVER TOUCHED
```

**Where the legacy pixel deck goes:** `legacy/pixel/`. It is moved as a unit, so all its relative `src` paths keep resolving. This includes `legacy/pixel/tools/sprite-preview.html`, whose `../engine` and `../palette.js` paths still work after the move. `tools/record.js --deck pixel` maps to `legacy/pixel/index.html`.

---

## 3. Module system, bootstrapping, standalone export

### 3.1 Rules
1. **One top-level statement per file.** Every file under `engine/`, `themes/`, `decks/*/` (`.js` files) and `studio/` contains exactly one top-level statement: one `PD.*(…)` call. The kernel file is the only exception; its one statement is `(function kernel(g){…})(window);`. Nothing may be declared outside the factory, because export re-emits factories with `Function.prototype.toString()`.
2. **No `'use strict'`** in migrated engine files during v2.0. **No `import`/`export`.** **No `fetch(`.** **No literal `</script` or `<!--`** in source.
3. **Factories run immediately when registered.** Dependencies must already be registered, or `PD.module` throws `pixeldeck: module "X" needs "Y" loaded first`.
4. **Registration has no side effects.** Registering a module, world, element, template or theme must not allocate textures, touch the DOM or call `Math.random`. Expensive work belongs in `preload`, `prepare` or `warm` (§4.5).

### 3.2 Kernel (`engine/pixeldeck.js`): exact shape
```js
/* engine/pixeldeck.js — pixeldeck kernel. ONE function expression; re-emitted by export via kernel.toString(). */
(function kernel(g) {
  if (g.PD && g.PD.kernel) return;
  var PD = g.PD = { version: '2.0.0', kernel: kernel };
  var mods = [], byName = {};

  PD.module = function (name, deps, factory, opts) {
    if (byName[name]) throw new Error('pixeldeck: module "' + name + '" is registered twice');
    var args = [PD];
    for (var i = 0; i < deps.length; i++) {
      if (!byName[deps[i]]) throw new Error('pixeldeck: module "' + name + '" needs "' + deps[i] + '" loaded first');
      args.push(byName[deps[i]].exports);
    }
    var rec = { name: name, deps: deps.slice(), factory: factory, opts: opts || {}, exports: null };
    byName[name] = rec; mods.push(rec);
    rec.exports = factory.apply(null, args) || {};
    return rec.exports;
  };
  PD.get = function (n) { if (!byName[n]) throw new Error('pixeldeck: no module "' + n + '"'); return byName[n].exports; };
  PD.has = function (n) { return !!byName[n]; };
  PD.modules = function () { return mods.map(function (m) { return { name: m.name, deps: m.deps, factory: m.factory, opts: m.opts }; }); };
  PD.compat = function (o) { for (var k in o) g[k] = o[k]; };          // migration only (M2–M5); deleted at M6

  function registry(kind) {
    var items = {}, order = [];
    function reg(name, def) {
      if (Object.prototype.hasOwnProperty.call(items, name)) throw new Error('pixeldeck: ' + kind + ' "' + name + '" is registered twice');
      items[name] = def; order.push(name); return def;
    }
    reg.get = function (n) { return Object.prototype.hasOwnProperty.call(items, n) ? items[n] : undefined; };
    reg.has = function (n) { return Object.prototype.hasOwnProperty.call(items, n); };
    reg.list = function () { return order.slice(); };
    reg.kind = kind;
    return reg;
  }
  PD.world = registry('world');     PD.element = registry('element');  PD.shape = registry('shape');
  PD.reveal = registry('reveal');   PD.exitFx = registry('exit');      PD.template = registry('template');
  PD.framework = registry('framework');
  PD.theme = registry('theme');     // def: ThemeSource | function (PD) → ThemeSource
  PD.deck = registry('deck');       // def: DeckSource  | function (PD, h) → DeckSource

  var store = {};
  PD.assets = function (deckId, map) { var s = store[deckId] || (store[deckId] = {}); for (var k in map) s[k] = map[k]; };
  PD.assets.get = function (deckId) { return store[deckId] || {}; };
  PD.assets.put = function (deckId, id, src) { (store[deckId] || (store[deckId] = {}))[id] = src; };
  PD.assets.remove = function (deckId, id) { if (store[deckId]) delete store[deckId][id]; };

  // [module name, required]. File = PD.base + name + '.js'. Order = dependency order.
  PD.MANIFEST = [
    ['core/util',1],['core/ease',1],['core/glow',1],['core/fx',1],['core/space',1],['core/earth',1],
    ['core/shapes',1],['core/field',1],['core/text',1],['core/theme',1],['core/assets',1],['core/compile',1],
    ['core/stage',1],['core/sync',1],['core/thumbs',1],['core/hud',1],['core/player',1],['core/notes',1],
    ['core/export',0],
    ['worlds/core',1],['worlds/cosmos',1],['worlds/planet',1],['worlds/spark',1],['worlds/ambient',0],['worlds/photo',0],
    ['elements/image',0],['elements/counter',0],
    ['templates/cinematic',0],['templates/essentials',0],
    ['core/validate',0],
    ['story/copy',0],['story/frameworks',0],['story/interview',0],['story/timing',0],['story/board',0],['story/lint',0]
  ];
  PD.missing = function () { return PD.MANIFEST.filter(function (m) { return m[1] && !byName[m[0]]; }).map(function (m) { return m[0]; }); };
  PD.fail = function (msg) { /* full-screen black panel, white monospace text; never throws */ };
  PD.start = function (deckId, opts) {
    var miss = PD.missing();
    if (miss.length) return PD.fail('pixeldeck: missing engine files: ' + miss.join(', '));
    return PD.get('core/player').start(deckId, opts);
  };

  var doc = g.document, cs = doc && doc.currentScript;
  PD.base = cs && cs.src ? cs.src.replace(/[^\/]*$/, '') : '';           // '' when inlined (exported file)
  if (PD.base && !g.PD_NO_AUTOLOAD) {
    if (doc.readyState !== 'loading') throw new Error('pixeldeck.js must be loaded by a plain <script src> (no defer/async)');
    for (var i = 0; i < PD.MANIFEST.length; i++)
      doc.write('<script src="' + PD.base + PD.MANIFEST[i][0] + '.js"><\/script>');
  }
})(window);
```
- Scripts written with `document.write` run in order, **before** the next parser-inserted `<script>`. So `theme.js`, `assets.js` and `deck.js` all see a fully registered engine.
- `required: 0` marks files that parallel packages haven't landed yet. A missing optional file only logs a console error.
- **The release commit flips every flag to 1.** WP1 owns this file and makes that change.

### 3.3 Module file: exact shape
```js
/* engine/core/field.js — glowing particle field (body verbatim from cinema/engine/particles.js). */
PD.module('core/field', ['core/util', 'core/ease', 'core/glow'], function (PD, util, ease, glow) {
  var U = util.U, CX = util.CX, CY = util.CY, DW = util.DW, DH = util.DH, Ease = ease.Ease, Glow = glow.Glow;
  function Field() { /* … verbatim … */ }
  /* … verbatim prototype IIFE … */
  PD.compat({ Field: Field });            // M2–M5 only
  return { Field: Field };
});
```
- **Module names equal their file paths** under `engine/`, without `.js`.
- **Studio files** use the same shape with the name prefix `studio/` and `{ export: false }`.
- **Story modules and `core/validate`** use `{ export: false }`.

**Full compat list (M2–M5).** Every name below must be re-exported, or the existing code throws `ReferenceError`:

| Source | Names |
|---|---|
| util | `DW DH CX CY U COLORS col` |
| fx | `Glow FX` |
| space | `NEBULA_PRESETS Space` |
| earth | `Earth` |
| particles | `Shapes Field` |
| type | `FONT STYLES TextLayer` |
| stage | `WORLD_DEFAULTS Stage Sync Show` |
| tween | `Ease Timeline` |

`scenes.js` keeps its own globals (`W HORIZON BELOW curveXY curvePoints nodePoints leap DECK`) until M5.

### 3.4 Deck folder shims (exact)
```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>One Giant Leap</title></head><body>
<script src="../../engine/pixeldeck.js"></script>
<script src="theme.js"></script>          <!-- OGL only; other decks: ../../themes/<id>/theme.js -->
<script src="assets.js"></script>
<script src="deck.js"></script>
<script>PD.start('one-giant-leap');</script>
</body></html>
```
- `notes.html` is identical except for the last line: `PD.start('one-giant-leap', { mode: 'notes' })`.
- `index.html?notes` also starts notes mode.
- CSS comes from `core/hud.js`, which injects the exact rules from today's `cinema/index.html`. No HUD is shown in notes mode.

### 3.5 `tools/lint.js` (WP1)
`node tools/lint.js` exits 1 on any violation. It applies these checks to every `.js` under `engine/ themes/ decks/ studio/`:
1. **Single statement.** Run the file in a Node `vm` context with a stub `PD`. Every registration function records its call and **does not invoke** the factory. The file must make exactly one `PD.*` call and add no new keys to the sandbox global. The kernel is exempt.
2. **Forbidden text.** Regex scan for `</script`, `<!--`, `\bimport\s`, `^\s*export\s`, `fetch\(`, `'use strict'` in `engine/core/`, and `document\.cookie`.
3. **`Math.random` allow-list.** Allowed only in `engine/core/field.js`, `engine/core/stage.js` (shake jitter) and `engine/core/sync.js` (instance id). `studio/` may use `crypto.getRandomValues` and nothing else.
4. **Archive safety.** No file outside `_archive/` contains the string `_archive/` except docs, `tools/regression/*` and this spec.

### 3.6 Standalone export mechanism (WP2)
`PD.exportHTML(deckId, opts) → string` builds one self-contained HTML file. The page must have the deck's `theme.js`, `assets.js` and `deck.js` loaded.

**Emission order:**
1. `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{HTML-escaped meta.title}</title><meta name="generator" content="pixeldeck 2.0.0"></head><body>`
2. `<script>(` + `PD.kernel.toString()` + `)(window);</script>`
3. One `<script>` per entry of `PD.modules()` where `opts.export !== false`, in registration order:
   `PD.module(<JSON name>, <JSON deps>, <factory.toString()>, <JSON opts>);`
4. **The theme chain**, root first. For each theme `t` that `meta.theme` depends on through `extends`:
   - `PD.theme(<JSON id>, <src>);`
   - `<src>` is `factory.toString()` for factories. For objects it is safe JSON (defined below).
5. `PD.assets(<JSON id>, /*PD:ASSETS-JSON:BEGIN*/<safe JSON>/*PD:ASSETS-JSON:END*/);`
6. **The deck:**
   - Factory decks: `PD.deck(<JSON id>, <factory.toString()>);`
   - Object decks (Studio): `PD.deck(<JSON id>, /*PD:DECK-JSON:BEGIN*/<safe JSON>/*PD:DECK-JSON:END*/);`
7. `<script>PD.start(<JSON id>);</script></body></html>`

**Escaping:**
- **Safe JSON** is `JSON.stringify(v)` followed by replacing every `<` with `\u003c`, every `>` with `\u003e`, every `&` with `\u0026`, every `*` with `\u002a`, and U+2028 and U+2029 with `\u2028` and `\u2029`. Because `*` is escaped, `*/` can never appear inside the markers.
- **Factory sources** get `</script` → `<\/script` (case-insensitive) and `<!--` → `<\!--`. This is a safety net; lint already forbids both.

**Re-opening.** The Studio re-opens an exported file by locating the two marker pairs and calling `JSON.parse` on the text between them. It never executes the file. If a file has no `DECK-JSON` markers, it is a hand-written deck: "This deck was written by hand. Open it in a code editor."

**Notes in an exported file.** Pressing N opens `location.href.split(/[?#]/)[0] + '?notes'` with `noopener`. That is the same file in notes mode, in its own process, synced over BroadcastChannel.

**Self-test** (`opts.selfTest`, used by the Studio before saving):
1. The Studio injects `<script>window.PD_SELFTEST=1</script>` right after `<head>`, then mounts the result in a hidden `<iframe srcdoc>`.
2. In self-test mode the Player:
   - disables RAF, input, hash and sync;
   - compiles the deck and awaits assets;
   - calls `stage.still(si, step)` for every state, catching errors;
   - posts `parent.postMessage({ type: 'pd-selftest', ok, errors: [{slide, step, msg}], ms }, '*')`.
3. If no message arrives within 20 s, the test fails.

**CLI.**
- `node tools/export.js <deck folder> [--out file]`. Default output is `<folder>/export/<id>.html`.
- It opens `<folder>/index.html?export` in headless Chromium.
- When `?export` is present, `PD.start` registers everything but does not boot.
- It evaluates `PD.exportHTML(id)` and writes the bytes. The CLI and the Studio produce the same bytes for the same inputs.

---

## 4. Engine public API contracts

Types use TypeScript-like notation. `?` means optional.

### 4.1 Kernel and registries
See §3.2. Every registry function has the form `reg(name, def) → def` and throws on a duplicate name. It also exposes `.get(name)`, `.has(name)` and `.list()`.

| Call | def type |
|---|---|
| `PD.world(name, WorldPlugin)` | §4.5 |
| `PD.element(kind, ElementPlugin)` | §4.6 |
| `PD.shape(name, ShapePlugin)` | §4.7 |
| `PD.reveal(name, RevealPlugin)` / `PD.exitFx(name, ExitPlugin)` | §4.7 |
| `PD.template(id, Template)` | §4.3, §5 |
| `PD.theme(id, ThemeSource \| (PD) => ThemeSource)` | §4.4 |
| `PD.framework(id, Framework)` | §6.2 |
| `PD.deck(id, DeckSource \| (PD, h: Helpers) => DeckSource \| RawScene[])` | §4.2 |
| `PD.assets(deckId, {[assetId]: AssetSource})` | §4.8 |

### 4.2 Deck definition and scenes
```ts
DeckSource = {
  format: 2,                       // compile fills it in if a factory omits it
  id: string,                      // /^[a-z0-9][a-z0-9-]{0,47}$/, equals the PD.deck id
  meta: {
    title: string, subtitle?: string, author?: string,
    theme: string,                 // theme id
    themePatch?: object,           // values-only deep patch over the resolved theme (Studio "Look")
    worlds?: string[],             // extra world plugins beyond theme.worlds
    story: StoryMeta,              // §6.1
    generator?: 'hand' | 'studio@2.0.0', updated?: string /* ISO */
  },
  scenes: Array<RawScene | TemplateScene>
}

TemplateScene = {
  id: string, template: string, props: object,
  beat?: string, energy?: 1|2|3|4|5, point?: string,
  notes?: string, stepNotes?: string[],          // stepNotes[k] → steps[k].notes
  dwell?: number, stepDwell?: number[],
  overrides?: object,                            // deep-merge patch over the expansion; arrays replace; null deletes
  flashback?: boolean, lint?: { ignore: string[] }
}

RawScene = {                       // today's slide object, unchanged semantics + additive fields
  id: string,
  world?: { [param: string]: number | string },
  worldTime?: number, worldEase?: string,
  timing?: { [param: string]: [dur: number, ease?: string, delay?: number] },
  text?: TextSpec[], elements?: ElementSpec[], particles?: ShapeSpec[],
  motion?: Motion, cues?: { at?: number, flash?: number, shake?: number }[],
  textDelay?: number, prelude?: 'explode', preludeTime?: number, explodePower?: number,
  steps?: Step[], notes?: string, dwell?: number,
  // story metadata, ignored by the renderer:
  beat?: string, energy?: 1|2|3|4|5, like?: string /* template id this scene plays */, point?: string,
  flashback?: boolean, lint?: { ignore: string[] }
}
Step = { text?, elements?, particles?, world?, timing?, motion?, cues?, remove?: string[], clear?: boolean,
         textDelay?, worldTime?, worldEase?, notes?: string, dwell?: number }
TextSpec = { str: string, style?: string, x?, y?, align?: 'center'|'left'|'right', maxWidth?, size?, weight?, track?,
             upper?, lineHeight?, color?: color | color[], fillDir?: 'h'|'v', glow?, glowSize?, glowAlpha?, push?,
             reveal?: string, revealTime?, exit?: string, exitTime?, at?, id?, stride?, particleSize? }
ElementSpec = { kind: 'text' | 'image' | 'counter' | string, id?, at?, ... }   // kind-specific, §4.6
ShapeSpec = { shape: string, id?, at?, ... }                                  // §4.7
Motion = { ease?, dur?, spread?, arc?, stagger?: 'random'|'radial'|'leftToRight'|'rightToLeft'|'topDown'|'bottomUp'|'none',
           entry?: 'void'|'spark'|'edges'|'stars'|'center'|'below', exit?: 'drift'|'warp'|'scatter'|'fade'|'rise'|'implode',
           match?: 'angle' }
Helpers (h, and template env) = { W(...objs) /* shallow merge */, U, col(name|hex) → [r,g,b], CX, CY, DW, DH,
           theme: ResolvedTheme, shots, shot(name, fallback='DRIFT') → world copy, role(name) → color | color[],
           hasWorld(name), hasParam(name), measure(str, style, size?) → { w, h, lines },
           fit(str, style, preferredSize, maxW) → size }
```

**Resolution of a state** (`Stage.resolve`). The semantics are today's, generalized:
1. **World** = plugin defaults merged with `theme.world`, then `scene.world`, then each `step.world` for steps 1..k.
2. **Items:**
   - Start from `scene.text` (kind `text`), followed by `scene.elements`.
   - For each step `s` from 1 to k, in order:
     - `clear` empties both the items and the shapes.
     - `remove` drops items and shapes whose `spec.id` matches.
     - Then append `step.text`, then `step.elements`, then `step.particles`.
3. **`motion` and `timing`** come from the scene, overridden by the current step only.

### 4.3 Compile, validate, templates
```ts
PD.compile(deck: string | DeckSource, opts?: { themePatch?: object, assetsDeckId?: string }) → CompiledDeck
PD.compileScene(compiled: CompiledDeck, index: number, source: RawScene | TemplateScene) → CompiledDeck
   // returns a NEW CompiledDeck; every other scene object is reused by reference
CompiledDeck = {
  id, meta, source: DeckSource,
  theme: ResolvedTheme, themeKey: string,
  worlds: string[],                 // ['core', ...theme.worlds, ...meta.worlds], de-duplicated, ordered
  scenes: RawScene[],               // template scenes expanded; raw scenes passed BY REFERENCE (never cloned)
  sceneKeys: string[],              // stable content hash per scene (functions hashed by toString)
  errors: Issue[]                   // expansion failures (the scene becomes an error card, §below)
}
PD.validate(compiled) → Issue[]
Issue = { level: 'error'|'warn', code: string, scene: number, sceneId: string, step?: number, path?: string, msg: string }
```

**How compile handles a template scene:**
1. Normalize props: apply defaults and coerce types.
2. Call `T.expand(props, env)`.
3. Deep-merge `overrides`.
4. Set `id`, `notes`, `dwell`, `beat`, `energy`, `point`, `lint` and `flashback`, and set `like = template id`.
5. Map `stepNotes` and `stepDwell` onto the generated steps.

**When expansion fails:**
- If `expand` throws, or the template is unknown, the scene becomes an error card: `{ id, world: {}, text: [{ str: '⚠ ' + msg, style: 'caption' }] }`.
- The failure is recorded in `errors`.
- The deck never crashes on stage.

**Identity contract:** spec objects keep their identity for the whole life of a CompiledDeck. Stage caches glyph bitmaps and particle targets by identity. Compile runs once per page load. The Studio recompiles only the scenes that changed (`compileScene`).

**Validate codes:**

| Code | Level | Condition |
|---|---|---|
| `scene.duplicate-id` | error | Two scenes share an `id` |
| `world.unknown-param` | warn | A world or timing key isn't a param of any registered world |
| `world.needs-plugin` | error | The key belongs to a world that isn't enabled for this deck |
| `style.unknown` | error | A text style isn't in `theme.styles` |
| `reveal.unknown` / `exit.unknown` | error | The name isn't built in and isn't in the registry |
| `motion.unknown` | warn | Bad `stagger` / `entry` / `exit` value |
| `shape.unknown` | error | Unknown shape |
| `element.unknown-kind` | error | Unknown element kind |
| `asset.missing` | error | An asset id isn't in `PD.assets(deckId)` |
| `asset.not-embedded` | error | The asset's `src` doesn't start with `data:` |
| `asset.wrong-type` | error | The asset has the wrong type for its use |
| `template.unknown` | error | Unknown template id |
| `template.requires-world` | error | The template needs a world that isn't enabled |
| `template.prop-required` | error | A required prop is missing |
| `template.prop-type` | error | A prop has the wrong type |
| `template.prop-max` | warn | A text prop is too long or a number is out of range |
| `template.expand-failed` | error | Expansion threw |
| `text.overflow` | warn | The measured width is above `maxWidth`, or the block extends outside 0..1920 × 0..1080 |
| `particles.budget` | warn / error | Estimated targets in any state: warn above 8000, error above 9000 (`Field.MAX`) |
| `steps.remove-unknown` | warn | A `remove` id doesn't match anything visible |

### 4.4 Themes
```ts
ThemeSource = {
  extends?: string, label: string,
  worlds: string[],                                  // enabled world plugins ('core' is implicit)
  fonts: { display: string /* CSS font-family list */ },
  fontFaces?: { family: string, asset: string /* id in the deck's assets */, weight?: string, style?: string }[],
  colors: { [name: string]: string },                // named colors (today's COLORS)
  roles?: { [role: string]: string | string[] },     // '@role' strings in styles are replaced at resolve time
  styles: { [style: string]: StyleSpec },            // today's STYLES; merged per style key along `extends`
  nebulae?: { [preset: string]: [string, string, string] },
  ambients?: { [preset: string]: { base: [string, string], blobs: string[], bokeh: string } },
  world: { [param: string]: number | string },       // overrides plugin defaults
  motion: { ease, dur, spread, arc, stagger, entry, exit },
  timing: { worldTime, worldEase, settledWorldTime, textDelay, stepTextDelay, settledTextDelay,
            settledDurMax, settledSpreadMax, preludeTime },
  shots: { DRIFT: object, [name: string]: object },  // DRIFT is required
  ui: { accent: string }                             // Studio and notes chrome only
}
StyleSpec = { weight, size, track, upper?, fill, fillDir?, glow?, glowSize?, glowAlpha?, lineHeight?, maxWidth?, push? }
PD.theme.resolve(id: string, patch?: object) → ResolvedTheme
   // frozen; deep merge root→leaf, then patch; '@role' replaced; adds { id, chain: string[], key: string /* hash of JSON */ }
```

**Cosmos values** are today's values, unchanged:
- `fonts.display`: today's `FONT`.
- `colors`: `COLORS`.
- `styles`: `STYLES`.
- `nebulae`: `NEBULA_PRESETS`.
- `motion`: `{ ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' }`.
- `timing`: `{ worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15, settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9 }`. These are exactly the constants hard-coded in `Stage.enter` today.
- `roles`:
  - accent `#ffd27a`, accentGlow `#ff9a3d`
  - future `['#fff1c9','#ffb347']`, futureGlow `#ff8a3d`
  - past `['#dfe6f2','#8c9bb6']`, pastGlow `#5a6b8a`
  - The kicker and year styles reference `@accent`, `@accentGlow`, `@future` and `@futureGlow`, which resolve to today's literals.
- `worlds`: `['cosmos','planet','spark','photo']`.

**Cosmos shots.** `cosmos/theme.js` is a factory so it can compose shots with `W`. Its shots are `DRIFT: {}` plus `HORIZON` and `BELOW` (verbatim from `scenes.js`). It also defines one shot per OGL scene: `SPARK`, `BLOOM`, `HYPERSPACE`, `GALAXY`, `HOME`, `SUNRISE`, `LEAPS`, `BOX`, `PIVOT`, `FINALE`. Each holds that scene's `world` object verbatim.

**OGL theme** (`decks/one-giant-leap/theme.js`) is `PD.theme('one-giant-leap', {...})`:
- It is a **full literal snapshot** of today's values and does not extend cosmos.
- `worlds: ['cosmos','planet','spark']`, no shots, no roles.

**Slate theme** (WP3, non-space):
- `worlds: ['ambient','photo','spark']`.
- Charcoal ambients (`charcoal`, `ember`, `steel`, `dusk`). Base colors `#121318`/`#1c1e26`. Warm accent `#ffb35c`.
- Styles equal to cosmos except glowAlpha × 0.3, glowSize × 0.6, and hero/title track × 0.7.
- System font stack.
- Shots: `DRIFT`, `WARM`, `COOL`, `DARK`.

**Fonts.** v1 ships no bundled font file: we can't fetch one offline here, and licensing is an issue. Embedding a font happens through Studio asset drop (§7.5). Export warns when `fonts.display`'s first family isn't embedded (§7.8).

### 4.5 World plugins
```ts
PD.world(name, {
  params: { [param: string]: number | string },     // flat names, globally unique; registering a duplicate param throws
  crossfade?: string[],                             // string params that crossfade (stack semantics, below)
  create(stage: Stage) → state,                     // per stage; no Math.random
  preload?(theme: ResolvedTheme, compiled: CompiledDeck): void,   // once per page per themeKey (textures)
  prepare?(state, firstScene: RawScene, stage): void,              // Player boot, before the first enter
  warmed?(state) → boolean, warm?(state, budgetMs: number): void, // time-sliced warm-up (see tick order)
  update?(state, dt: number, W: object, stage): void,              // after world tweens update
  adapt?(state, workMs: number): void,                             // Player, once per real-time frame
  passes: { z: number, space: 'screen'|'camera'|'post', name: string,
            draw(ctx, W, state, f: { T, S, thumb, stage, xf, theme }): void }[]
})
```
**Crossfade stacks.** `stage.xf[param]` is an array of `{ value, amount, from, to, t0, dur }`. It generalizes today's `stage.neb`, using the identical code: amounts via `Ease.inOutQuad`, duration `timing[param][0]` or `defDur`, the same filter, finish and busy logic. Cosmos reads `f.xf.nebula`, using `.value` where the old code used `.preset`.

**Draw order.** The stage sorts every enabled pass by `z`, then by registration order:

| z | Plugin.pass | Space | Notes |
|---|---|---|---|
| — | stage | — | `Glow.frame()`. Clear to black at the identity transform. Jitter `jx,jy` from `Math.random()` ×2 **only if** `W.shake + shakeV ≠ 0`. `setTransform(S,0,0,S,ox,oy)`, `save`, clip to `0,0,DW,DH` |
| 2 | ambient.base | screen | WP3 |
| 4 | photo.image | screen | WP3 |
| 0 | cosmos.background | screen | Sorted: 0 runs before 2 and 4. Never enabled together with ambient |
| 10 | cosmos.backdrop | camera | First camera pass: stage does `save; translate(CX+jx, CY+jy); rotate(W.roll); translate(-CX,-CY)` |
| 20 | cosmos.galaxy | camera | |
| 30 | cosmos.nebulae | camera | |
| 40 | cosmos.stars | camera | |
| 50 | planet.earth | camera | Dark disc first, then `Earth.render(ctx, view, S, state.earthBudget)` |
| 60 | planet.sun | camera | Hidden behind the Earth as today. After the last consecutive camera pass the stage does `restore` |
| 70 | cosmos.dust | screen | |
| 80 | core.particles | screen | `field.alpha = W.particles; field.draw(ctx, T)` |
| 90 | spark.glow | screen | |
| 100 | core.elements | screen | Layers in list order |
| 110–160 | core.flash, vignette, grain (skipped when `thumb`), exposure, letterbox, blackout | post | Then the final `restore` |

Camera passes must form one contiguous run in z order. Registering a camera pass that would split the run throws.

**Param ownership:**

| World | Params |
|---|---|
| core | `roll shake letterbox exposure vignette grain particles` |
| cosmos | `speed warp warpColor stars nebula* nebulaAmount backdrop dust galaxy galaxyX galaxyY galaxyScale galaxyTilt` |
| planet | `earth earthX earthY earthR earthPitch earthRot earthSpin lightX lightY lightZ sun sunX sunY sunScale` |
| spark | `spark sparkX sparkY` |
| ambient (WP3) | `ambient ambientPreset* ambientDrift bokeh bokehSize horizonGlow` |
| photo (WP3) | `photo photoAsset* photoZoom photoX photoY photoDim photoTint` |

`*` marks a crossfade param. The union of defaults for OGL's worlds equals today's `WORLD_DEFAULTS` exactly.

**Order of work inside `Stage.tick(dt)`.** This order is required for pixel identity:
1. `T += dt`.
2. `tl.update(dt)`.
3. `updateWorld()`: tweens and xf amounts.
4. Each enabled world's `update`, in `worlds` order.
5. Every cached shape's `update(T)`.
6. `field.update(T)`.
7. Drop gone layers.
8. `flashV *= 0.04^dt`, `shakeV *= 0.2^dt`, `blackA` easing.
9. If not `thumb`, run `warmTick()`:
   - The **first** world whose `warmed(state)` is false gets `warm(state, 3)`, and nothing else warms this tick.
   - Only when every world is warmed does `prewarm(4)` run.
   - This reproduces today's `if (!Earth.ready()) Earth.step(3); else if (!warmDone) prewarm(4)`.

**Planet specifics.**
- `planet.prepare` runs `Earth.alloc()`, plus `Earth.step(1e9)` when `firstScene.world && firstScene.world.earth`.
- `planet.adapt` reproduces today's rule: if `workMs > 13 && budget > 90000`, then `budget *= 0.97`; else if `workMs < 8 && budget < 240000`, then `budget *= 1.01`.
- In manual-clock mode the Player never calls `adapt`, exactly as today.

**Cosmos specifics.**
- `cosmos.preload` builds `nebulaTexture` for every preset in `theme.nebulae` × seeds 0–2, plus the galaxy texture.
- The texture cache key is `colors.join(',') + ':' + seed`. It is no longer keyed by preset name. This fixes stale textures when two themes use the same name.

### 4.6 Elements
```ts
PD.element(kind, {
  create(spec, env: { theme, assets: (id) => RuntimeAsset|null, stage, col }) → Layer,
  measure?(spec, env) → { x, y, w, h, lines?: string[] },     // used by validate and lint without drawing
  particleCount?(spec, env) → number                          // used by the particle-budget check
})
Layer = {
  spec, kind, id: string|null, o: object /* resolved options incl. stride, particleSize */,
  reveal: string, exitKind: string,
  inStart: number, inDur: number, outStart: number, outDur: number, arriveAt: number, particleAlpha: number,
  reset(): void, startOut(t): void, animating(t): boolean, gone(t): boolean,
  ensureCache(rs: number): void, draw(ctx, t, rs): void,
  points?(stride?: number, size?: number) → Target[]          // REQUIRED when reveal === 'particles'
}
```
- **`text`** (core, WP1) is `TextLayer`, with its maths verbatim. It reads `env.theme.styles`, `env.theme.fonts.display` and `env.theme.colors` instead of the globals. `reveal` and `exit` names not built in (`letters focus rise fade wipe particles` / `fade rise sink blur particles`) go to the registry.
- **`image`** (WP3):
  - Spec: `{ kind:'image', asset, x=CX, y=CY, w?, h?, fit:'contain'|'cover'='contain', align='center', radius=0, opacity=1, glow?: color, reveal:'fade'|'rise'|'focus'|'wipe'|'particles'='fade', at, revealTime?, exit?, sample?: { mode:'alpha'|'luma'='alpha', threshold?: number, maxPoints=3500, color?: color, size?: number } }`.
  - Reveal maths are shared with `TextLayer`.
  - `points()` samples the decoded `data:` image. The stride is chosen automatically so the count stays at or below `maxPoints`. Sampling is jittered with `U.rng(hash(asset id))` and never uses `Math.random`.
  - If sampling throws (for example on a tainted image), `reveal` falls back to `fade` and a console warning is logged.
- **`counter`** (WP3):
  - Spec: `{ kind:'counter', from=0, to, decimals=0, prefix='', suffix='', sep=',', style='mega', x, y, align, countTime=1.8, ease='outCubic', at }`.
  - Draws from a cached glyph atlas (digits, separators, prefix, suffix) and never re-renders text per frame.
  - Fades in over 0.4 s while counting.
  - `finishAll` and settled entries show `to`.
  - `reveal:'particles'` is not supported (validate warns).

### 4.7 Shapes, reveals, exits
```ts
PD.shape(name, { container?: boolean, create(spec, env: { byId, theme, col, uid: () => string }) → Shape })
Shape = { id: string, n: number, px: Float32Array, py: Float32Array, color(i) → [r,g,b], size(i) → number,
          alpha?(i) → number, update?(t) → void }
      | { id: string, n: number, static: { x, y, color?, s?, a? }[] }
Target = { x, y, r, g, b, a, s, key: string, group?: Layer, dyn?: Shape, di?: number }
PD.reveal(name, { inDur: number, animSpan?: number /* default 1 */,
                  pose(layer, t, pIn, eIn) → { alpha, dy, scale }, paint?(layer, ctx, rs, pIn, eIn, alpha) })
PD.exitFx(name, { apply(layer, pOut, eOut, pose: { alpha, dy, scale }) → void })
```
- **Built-in shapes** (`core/shapes.js`): `spark`, `cube` (`container: true`), `swarm` (`inside: <id>`), and `points` (an array, or a function called once per stage).
- **Shape build order.** First pass: specs with an `id` whose plugin has `container: true`. Second pass: everything else.
- `shapeFor` caches by spec identity. `points` uid strings come from `stage.uid()`.
- **v1 ships no new shapes.** `ring`, `sphere`, `grid` and particle-only `image` are v2.

### 4.8 Assets and fonts
```ts
AssetSource =
  | { type: 'image', src: string /* data:image/(png|jpeg|webp|svg+xml);base64,… */, w: number, h: number, name: string, bytes: number }
  | { type: 'font',  src: string /* data:font/(woff2|woff|ttf|otf);base64,… */, family: string, weight?: string,
      style?: string, name: string, bytes: number }
PD.assets.ready(deckId: string, opts?: { timeoutMs?: number /* 3000 */ }) → Promise<{ loaded: string[], failed: { id, reason }[] }>
   // NEVER rejects
PD.asset(deckId: string, id: string) → RuntimeAsset | null
RuntimeAsset = { id, type, src, w, h, ok: boolean, error?: 'not-embedded'|'decode'|'timeout', img?: HTMLImageElement, face?: FontFace }
```
**`ready()`:**
- **Images:** `new Image()`, set `src`, then `img.decode()`.
- **Fonts:** decode the base64 into an `ArrayBuffer`, create `new FontFace(family, buf, {weight, style})`, call `.load()`, then `document.fonts.add`.
- **Failures:** each item is caught individually. After 3 s overall, unfinished items are marked `timeout` and boot proceeds.
- **Sources:** a `src` that doesn't start with `data:` is never loaded. It is marked `ok:false, error:'not-embedded'`. This keeps canvases untainted, so `toDataURL` and `captureStream` stay safe.

**Boot order** (Player): resolve the theme → `PD.assets.ready` → compile → `new Stage`. Text is measured only after fonts settle, so fallback-font bitmaps are never cached.

### 4.9 Stage
```ts
new PD.Stage(canvas: HTMLCanvasElement, opts: { deck: CompiledDeck, thumb?: boolean })
// read-only fields: canvas, ctx, deck, theme, T, W, cur: { slide, step }, field, layers, S, ox, oy
// read-write: blackout: boolean, quality: number (default 1.5), onEnter: () => void
stage.resize(cssW, cssH, dpr): void
stage.enter(si, step, mode: 'live'|'settled'|'instant'): void   // today's semantics exactly (incl. live→settled demotion)
stage.tick(dt): void
stage.draw(): void
stage.busy(): boolean
stage.finishAll(): void
stage.still(si, step): void          // thumbnails: reset layers/field, enter instant, tick 0.05 ×3, draw
stage.resolve(si, step) → { scene, world, items: {spec, kind, step}[], texts: (items with kind 'text'), shapes: {spec, step}[], motion, timing }
stage.stepsOf(si): number
stage.setWorld(target, timing|null, defDur, defEase, instant): void
stage.setDeck(compiled: CompiledDeck, opts?: { changed?: string[] /* scene ids */ }): void
stage.warmTick(): void; stage.warmAll(): void; stage.isWarm(): boolean
stage.adapt(workMs): void            // forwards to world adapt hooks
stage.uid(): string
stage.destroy(): void
```

**`setDeck` eviction:**
- **Full reset** happens when `themeKey` or `worlds` changed. Clear `layers`, `layerBySpec`, `shapeBySpec`, `field`, `xf`, world states, `W` (back to defaults) and `warm*` flags. Then set `cur = {slide:0, step:0}`.
- **Otherwise:**
  - Build `live`, the set of every spec object reachable from `compiled.scenes`.
  - Delete map entries whose key isn't in `live`.
  - Call `startOut(T)` on visible layers whose spec isn't in `live`.
  - Clamp `cur`.
- **Memory:** `layerBySpec` and `shapeBySpec` stay `Map`s, bounded by the current deck. `tick` updates every cached shape, exactly as today.

**`Stage.enter` reads defaults from the theme:**
- Every former constant comes from `theme.timing` and `theme.motion`. For example, `delay = live ? (isStep ? stepTextDelay : textDelay) : settledTextDelay`.
- Settled clamps use `settledDurMax` and `settledSpreadMax`.
- The prelude default is `preludeTime`.

### 4.10 Player, `PD.start`, `PD.boot`
```ts
PD.start(deckId?: string, opts?: PlayerOptions & { mode?: 'stage'|'notes' }) → Promise<Player | Notes>
   // mode: opts.mode || (/[?&]notes\b/ → 'notes') || (/[?&]export\b/ → 'register-only') || 'stage'
PD.boot(opts: PlayerOptions) → Promise<Player>
PlayerOptions = {
  deck?: string,                    // default: the only registered deck (else error)
  compiled?: CompiledDeck,          // Studio: pass a compiled deck directly
  canvas?: HTMLCanvasElement, container?: HTMLElement,   // default: full window
  input?: true, hash?: true, hud?: true, sync?: true, api?: true /* window.PixelDeck */, raf?: true,
  quality?: number                  // default 1.5; ?quality= overrides
}
Player = { stage, ready: boolean, next(), prev(), goTo(si, step), replay(), blackout(), home(), end(),
           openNotes(), setManualClock(on), tick(dt), info(), state(), onState(fn), destroy() }
```

**Boot sequence.** This is today's order, with additions marked:
1. `hud.install()`.
2. `Sync(deckId, {role:'stage'})` when `sync` is on. This is the only `Math.random` before the first enter.
3. Resolve the theme, then await assets **(new)**.
4. Compile.
5. `new Stage`.
6. Apply URL params.
7. Each world's `preload`, then `Glow.prebuild()`.
8. Each world's `prepare(state, scenes[h.slide])`.
9. `resize`.
10. Listeners.
11. `stage.setWorld(resolve(h).world, null, 0, null, true)`.
12. `enter(h.slide, 0, 'live')` or `enter(h.slide, h.step, 'settled')`.
13. RAF loop.
14. `window.PixelDeck = api`.

**Keys** are today's set: `→ ↓ PageDown Space` / click, `← ↑ PageUp` / right-click, `G n[.m] Enter`, `Home`, `End`, `F`, `B .`, `R`, `Q`, `N`.
- **Changes:**
  - Events whose target is `input`, `textarea`, `select` or `[contenteditable]` are ignored.
  - With `container` set, keys are handled only when focus is inside the container or on `body`.
- **N** opens `<page>?notes` with `window.open(url, '_blank', 'noopener,popup,width=1200,height=760')`.

**Redirects.** `cinema/*.html` stubs call `location.replace(newPath + location.search + location.hash)`, which keeps `#7.3`.

### 4.11 Sync and presenter notes
```ts
PD.Sync(deckId: string, opts: { role: 'stage'|'notes' }) → { id: string, send(msg), on(fn), close() }
  // id = Math.random().toString(36).slice(2)   ← exactly one call per Sync
  // transports: BroadcastChannel('pixeldeck:' + deckId); localStorage key 'pixeldeck:' + deckId + ':msg' (storage event);
  //             postMessage to window.opener and peers when present. The old 'pixeldeck-cinema' / 'cinema:msg' are never used.
Envelope = { v: 2, deck: deckId, from: id, mid: from + ':' + seq } &
  ( { type: 'state', inst, slide, step, steps, total, id /* scene id */, beat, blackout, ready }
  | { type: 'cmd', cmd: 'next'|'prev'|'goto'|'blackout'|'replay', slide?, step?, target?: inst }
  | { type: 'hello' } )
```

**Stage behavior:**
- Its `inst` equals its Sync `id`.
- It ignores a `cmd` whose `target` is set and isn't its own `inst`.
- It answers `hello` with `state`.

**Notes behavior** (`PD.notes`, `core/notes.js`):
- Builds today's presenter UI in JS (same markup and CSS as `cinema/notes.html`).
- Binds to the first `inst` it hears. If `state` arrives from a different `inst`, it shows a red banner: "Another stage for this deck is open. Close one."
- Sends `cmd`s with `target: boundInst`.
- **Thumbnails** come from `PD.Thumbs` at 480×270:
  - It precomputes all states in idle slices as soon as the notes window opens.
  - It shows "Preparing previews n/N" until done.

### 4.12 Thumbnails
```ts
PD.Thumbs(compiled: CompiledDeck, opts?: { w = 480, h = 270, max = 150 /* LRU entries */ }) → {
  get(si, step) → HTMLCanvasElement | null,
  request(si, step, priority = 0): void, requestAll(): void,
  setDeck(compiled): void,              // invalidates entries whose sceneKey or themeKey changed
  on(event: 'ready', fn: (si, step, canvas) => void): void, destroy(): void }
```
**Implementation:**
- One offscreen `PD.Stage({thumb:true})`, sized with `resize(w, h, 1)`.
- Exactly one `still()` per `requestIdleCallback({timeout:200})`, or per `setTimeout(16)` where idle callbacks aren't available.
- The result is copied into a new canvas.
- Cache key: `themeKey + '|' + sceneKeys[si] + '|' + step`.

### 4.13 Recorder API and URL params
```ts
window.PixelDeck = {                    // shape kept; additions marked +
  info() → { id, steps, dwell, stepDwell?: number[] /*+*/, beat? /*+*/ }[],
  isBusy(), next(), prev(), goTo(si, step), finish(),
  state() → { slide, step, particles, busy, fps, workMs, ready /*+*/ },
  setManualClock(on), tick(dt) /* tick + draw */,
  ready: boolean /*+ getter*/, deck() → { id, meta } /*+*/, advance(dt) /*+ tick, no draw*/,
  warmAll() /*+*/, snapshot(type = 'image/png') → dataURL /*+*/
}
```
- **URL params:** `quality`, `auto`, `loop`, `fps` (unchanged), `notes`, `export`.
- **`tools/record.js`:**
  - Waits for `PixelDeck.ready === true`. If the field is `undefined` (legacy decks), it waits 2.5 s instead.
  - Uses `info()[i].stepDwell[k]` when present.
  - Still presses `Home` before canvas capture.
  - The stage canvas must be the page's first `<canvas>`.

### 4.14 Determinism rules (engine)
1. **`Math.random` call sites must keep today's count and order:**
   - `Field.make` (`tw`), `Field.fly` arcs, `staggerKey`, `entry`, `exit`, `explode`
   - the shake jitter: two calls, only when the shake is non-zero, at the top of `draw`
   - the Sync instance id: one call, before the first enter
   - No other code that the Player runs may call it. New features use `U.rng(seed)`.
2. **Canvas operations, values and float-expression order** in migrated passes stay verbatim. Precomputed matrices and reordered `save`/`restore` nesting are not allowed.
3. **Glow fine-sprite lazy budget** (6 per frame) stays as it is. Image palettes may prebuild their own sprite keys. Nothing prebuilds sprites for text or point colors.
4. **Golden runs** stub RAF, so the Player never runs `adapt`. Real-time behavior is unchanged.

### 4.15 Performance budgets
- **Existing passes:** OGL's p95 `workMs` per state must stay within +10% (+0.5 ms) of the archive baseline (`tools/regression/perf.js`).
- **New world plugins** (ambient, photo) and elements: at most 1.5 ms per frame at 1920×1080, quality 1.5. No allocation inside per-frame loops.
- **Boot to first frame:** at most 1.2 s on an M2 for OGL.
- **`PixelDeck.ready`** (all warm-up done): at most 3 s.

---

## 5. Template catalog (v1 = 16)

**Common rules:**
- Every template declares `requires.worlds`, `story: { energy, talkSec, stepTalkSec, roles, hook }`, `props`, `example`, `seed` and `expand`.
- `example` is the default props, which are OGL's values for the cinematic set.
- `expand` must be pure and deterministic:
  - no `Math.random`, no DOM except `env.measure`;
  - two calls with the same input must be `deepEqual`.
- **Adaptive** templates need no specific world.
  - They build their world as `env.shot(p.shot)`, which falls back to `DRIFT` when the theme lacks that shot.
  - They add a world, timing or cue key only if `env.hasParam(key)`.
- **Parity rule.** For the 10 OGL-derived templates, `expand(example)` must produce scene objects whose rendered output matches the corresponding OGL scene. `_parity` checks this (§8).

**Prop notation:** `name*` means required.
- `text≤N(style)`: a single-line string of at most N characters, measured against that style.
- `list[a–b]`: a list with between a and b items.
- `enum`, `number[a–b]`, `color`, `bool`, `asset(image|font)`, `shot`, `nebula`.

| # | id · label | requires | roles (beat fit) | E | talk s (+/step) | props (default) | expands to |
|---|---|---|---|---|---|---|---|
| 1 | `cold-open` · Spark cold open | spark | hook | 2 | 20 | `line*` text≤60(statement) ("Every giant leap begins with a single spark."), `lineAt` number[0–6] (1.8), `sparkCount` number[200–1200] (700), `sparkColor` color (gold), `shot` (SPARK) | OGL `spark`: world `W(shot, {spark:1})`, worldTime 3, spark shape (r 40), motion entry spark/dur 2.4/spread 1.8/outCubic/arc .8, statement y 820, `letters`, revealTime 2.4, dwell 6 |
| 2 | `brand-reveal` · Brand reveal | — (adaptive) | identity, idea, callback | 4 | 30 | `title*` text≤18(hero) ("One Giant Leap"), `subtitle` text≤40(subtitle) ("Making work more human"), `subtitleAt` number[0–6] (2.6), `flash` number[0–1] (.32), `entry` enum spark\|void\|edges\|center (spark), `shot` (BLOOM) | OGL `title`: hero `particles` y 470 + subtitle `letters` y 610, radial stagger, flash cue at .35, textDelay .25 |
| 3 | `hyperspace` · Hyperspace | cosmos | scale, hook | 5 | 20 (+20) | `lines*` list[1–3] of text≤34(title) (["13.8 billion years", "Hundreds of billions of galaxies"]), `warpColor` enum cyan\|violet\|gold\|white (cyan), `nebula` (cosmic), `flashAt` number[0–5] (3.0) | OGL `warp`: line 1 `focus` at 3.1. Each later line is a step: `remove` the previous one, textDelay .6, size 68 when the line is longer than 24 characters. `exit:'warp'` |
| 4 | `galaxy-reveal` · Galaxy, you are here | cosmos, planet | relevance, scale | 3 | 40 (+20) | `kicker` text≤30(kicker) ("Somewhere in all of this"), `line*` text≤50(statement) ("there is one small, blue world."), `marker` text≤24(caption) ("You are here"; empty means no step) | OGL `galaxy`, including the step (earth fades in, 40-point ring array, caption) |
| 5 | `planet` · Fly home | cosmos, planet | relevance, setup | 2 | 40 | `kicker` text≤30 ("Third planet from the sun"), `line*` text≤50(statement) ("Home to the most restless minds we know of."), `region` enum americas\|europe-africa\|asia (americas → earthRot −1.1; europe-africa 0.25; asia 1.9) | OGL `home` |
| 6 | `sunrise` · Sunrise | cosmos, planet | emotion, turn, resolution | 4 | 45 | `kicker` text≤30 ("For 300,000 years"), `line*` text≤40(statement @78) ("we have thought outside the box."), `nebula` (dawn) | OGL `sunrise` |
| 7 | `timeline` · Milestones | — | proof, setup | 3 | 15 (+20) | `kicker` text≤30 ("A short history of"), `title*` text≤40(statement) ("Thinking outside the box"), `milestones*` list[2–8] of {`when*` text≤14(year), `label*` text≤22(label), `u` number[0–1]?, `pos` enum auto\|above\|below\|left (auto), `color` color?} (OGL's 7 with their u values), `highlightLast` bool (true), `curve` bool (true), `shot` (LEAPS) | OGL `leaps`. Defaults: `u = .04 + i·.935/(n−1)`. `auto` pos: u < .12 → above, u < .5 → below, otherwise left. Node color `@accent`, last node `@futureGlow`. Curve is 421 points from teal to gold |
| 8 | `the-box` · The box | — | tension | 3 | 45 (+20) | `line*` text≤60(statement) ("Every breakthrough began as an idea that didn't fit."), `escape*` text≤12(hero) ("Outside"), `subtitle` text≤40 ("is where the future lives"), `cubeColor` (cyan), `cubeColor2` (violet), `shot` (BOX) | OGL `box`: cube + swarm, then a step that removes the swarm and box text, adds the escape word as a `particles` hero in `@future` and the subtitle in `@accent` |
| 9 | `pivot` · Not X. Y. | — | turn, idea, cta | 5 | 40 (+20) | `kicker` text≤30 ("The next leap"), `from*` text≤18(hero) ("Not automation."), `to*` text≤18(hero) ("Augmentation."), `subtitle` text≤44 ("Technology that makes work more human"), `shot` (PIVOT) | OGL `next`: `from` in `@past`/`@pastGlow` with glowAlpha .35, size `fit(…,118,1700)`. Step removes it and adds `to` in `@future` plus the subtitle |
| 10 | `finale` · Finale | — | callback, cta, resolution | 4 | 30 | `title*` text≤18(hero) ("One Giant Leap"), `subtitle` text≤40 ("Thank you"; hint: "Put your ask here"), `shot` (FINALE) | OGL `thanks`: prelude explode .8 / 1.1, radial stagger, sun timing if `hasParam('sun')` |
| 11 | `statement` · Big statement | — | any role | 2 | 45 | `kicker` text≤30, `line*` text≤90(statement, ≤3 lines), `align` enum center\|left (center), `reveal` enum letters\|rise\|fade\|focus\|wipe (letters), `shot` (DRIFT) | kicker at y 440 and line at y 520 (centered), or x 220 left-aligned. worldTime 2.4, dwell 5 |
| 12 | `big-number` · Big number | — | hook, proof, scale, tension | 4 | 40 | `value*` number (62), `decimals` number[0–3] (0), `prefix` text≤4, `suffix` text≤4 ("%"), `label*` text≤60(statement), `source` text≤40(caption), `reveal` enum count\|particles (count), `shot` (DRIFT) | `counter` (mega, y 450, countTime 1.8) or a mega `particles` text. Label at y 640 at 1.2 s; source at y 960 at 1.8 s |
| 13 | `quote` · Quote | — | proof, emotion | 2 | 40 | `quote*` text≤160(statement, ≤4 lines), `who*` text≤30(label), `role` text≤40(caption), `shot` (DRIFT) | curly-quoted statement, size 56, maxWidth 1300, y 470, `letters`; who at y 700 / 2.2 s; role at y 745 / 2.5 s |
| 14 | `three-points` · Points, one per click | — | proof, idea | 3 | 20 (+30) | `kicker` text≤30, `items*` list[2–5] of {`title*` text≤24(label), `line` text≤60(statement @44)}, `layout` enum rows\|columns (rows), `shot` (DRIFT) | kicker at (160, 150). Item k is step k+1. Rows: y = 330 + k·170, x 160, plus a 22-point ring marker at x 110. Columns: x = 960 + (k−(n−1)/2)·560, maxWidth 480 |
| 15 | `logo` · Logo reveal | — | identity, callback | 4 | 30 | `asset*` asset(image), `width` number[200–1600] (900), `tagline` text≤40(subtitle), `mode` enum alpha\|luma (alpha), `shot` (BLOOM) | `image` element with reveal `particles` (sample {mode, maxPoints 3500}), y 470; tagline at y 470 + h/2 + 90, at 2.6 s; radial stagger |
| 16 | `image` · Image hold | photo (when fit = cover) | emotion, setup, resolution, hook | 3 | 40 | `asset*` asset(image), `caption` text≤60(statement), `fit` enum cover\|contain (cover), `focusX`/`focusY` number[0–1] (.5), `zoom` number[1–1.3] (1.08), `dim` number[0–.8] (.25) | cover: world {photo 1, photoAsset, photoX, photoY, photoZoom: zoom, photoDim: dim}, timing {photoZoom [12, 'linear'], photo [1.2, 'inOutQuad']}. contain: `image` element 1400×760, radius 12, `fade`. Caption at y 960 |

- **Hook set** (`story.hook = true`): cold-open, hyperspace, statement, big-number, quote, image.
- **Template ids are final.** `points` is only a shape name. `warp` is only a world param and an exit name.
- **Seeds** are the storyboard placeholders. Named tokens are filled from the story (§6.5). Other `{…}` stay as visible placeholders:

| Template | Seed |
|---|---|
| cold-open | {line: '{opening line}'} |
| brand-reveal | {title: '{brand}', subtitle: '{tagline}'} |
| hyperspace | {lines: ['{a big number}', '{an even bigger one}']} |
| galaxy-reveal | {line: '{where your audience fits}'} |
| planet | {kicker: '{where}', line: '{who lives here}'} |
| sunrise | {kicker: '{since when}', line: '{a human truth}'} |
| timeline | {title: '{topic}', milestones: [{when: '{when}', label: '{milestone}'} ×3]} |
| the-box | {line: '{oldWay} was built for a world that is gone.', escape: 'Outside', subtitle: 'is where {newWay} lives'} |
| pivot | {kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}'} |
| finale | {title: '{brand}', subtitle: '{ask}'} |
| statement | {line: '{your line}'} |
| big-number | {value: 0, label: '{what the number means}'} |
| quote | {quote: '{quote}', who: '{who}'} |
| three-points | {items: [{title: '{point}'} ×3]} |
| logo | {asset: '', tagline: '{tagline}'} |
| image | {asset: '', caption: '{caption}'} |

---

## 6. Story backbone

### 6.1 Model
```ts
StoryMeta = {
  framework: 'giant-leap'|'sparkline'|'psf'|'scqa'|'blank',
  goal: 'inspire'|'persuade'|'decide'|'launch'|'update'|'teach'|null,
  audience: string, targetMin: number|null,          // the ONE duration field; null = unknown (runtime rule skipped)
  bigIdea: string, shortIdea: string,                // shortIdea is asked explicitly (never auto-truncated)
  oldWay: string, newWay: string, ask: string,
  proof: { kind: 'number'|'quote'|'story'|'demo', text: string, value?: number, who?: string }[],   // ≤3
  brand: string, tagline: string, tone: 'cinematic'|'warm'|'crisp'|'playful'|null
}
```
- **Energy** is an integer from 1 to 5 everywhere. A scene's energy is `scene.energy ?? template(scene.template || scene.like).story.energy ?? 3`.
- **Roles:** `hook setup identity scale relevance emotion proof tension turn idea climax resolution cta callback`.

### 6.2 Frameworks (data, `engine/story/frameworks.js`)
```ts
Framework = { id, name, bestFor, turns: number|null, beats: Beat[] }
Beat = { id, label, roles: string[], share: number, energy: 1..5, required: boolean, min: number, max: number,
         ask: string, example: string, templates: string[] /* preference order; ≥1 adaptive */ }
```

**F1 `giant-leap`** · One Giant Leap · best for vision keynotes, brand openers and "why change now" · turns 1

| beat | roles | share | E | req | min–max | ask | example | templates |
|---|---|---|---|---|---|---|---|---|
| spark | hook | .05 | 2 | Y | 1–1 | What tiny beginning does your story grow from? | "Every giant leap begins with a single spark." | cold-open, statement, big-number |
| name | identity | .07 | 4 | Y | 1–1 | Who are you, in one line? | "One Giant Leap / Making work more human" | brand-reveal, logo |
| zoom-out | scale | .10 | 5 | N | 0–2 | What's the biggest frame your topic lives in? | "13.8 billion years" | hyperspace, big-number, galaxy-reveal |
| you-are-here | relevance | .13 | 3 | Y | 1–2 | Where is your audience inside that frame? | "there is one small, blue world." | galaxy-reveal, planet, statement |
| human-truth | emotion | .12 | 4 | Y | 1–2 | What has always been true about people? | "For 300,000 years we have thought outside the box." | sunrise, statement, quote, image |
| pattern | proof | .18 | 3 | Y | 1–3 | Which 3–7 moments prove that truth? | "1440 · The printing press" | timeline, three-points, big-number |
| the-box | tension | .12 | 3 | Y | 1–2 | What box is your audience in today? | "Every breakthrough began as an idea that didn't fit." | the-box, statement |
| the-leap | turn | .13 | 5 | Y | 1–1 | What's the old answer, and what's yours? | "Not automation." → "Augmentation." | pivot |
| callback | callback, cta | .10 | 4 | Y | 1–1 | Which opening image returns, changed, and what do they do now? | "One Giant Leap / Let's make the next one together" | finale, statement |

**F2 `sparkline`** · What is / what could be · best for persuading people to change · turns 2

| beat | roles | share | E | req | min–max | ask | templates |
|---|---|---|---|---|---|---|---|
| what-is | hook, setup | .08 | 2 | Y | 1–1 | What does their world honestly look like today? | cold-open, big-number, statement |
| could-be | turn | .10 | 4 | Y | 1–1 | What could it be instead? | sunrise, statement |
| contrast | proof | .50 | 3 | Y | 2–4 | What's true now, and what's possible? | big-number, quote, three-points, statement |
| call-to-action | turn, cta | .15 | 5 | Y | 1–1 | What must they do, or give up? | pivot, statement |
| new-bliss | resolution, callback | .17 | 4 | Y | 1–1 | What does their world look like after they act? | finale, sunrise, image |

**F3 `psf`** · Problem, solution, future · best for launches and proposals · turns 1

| beat | roles | share | E | req | min–max | ask | templates |
|---|---|---|---|---|---|---|---|
| hook | hook | .08 | 3 | Y | 1–1 | Which image or number makes the pain visible? | cold-open, big-number, image |
| problem | tension | .20 | 3 | Y | 1–2 | Who hurts, how much, and what does it cost? | statement, big-number, the-box |
| insight | turn | .12 | 4 | Y | 1–1 | What do you see that others miss? | pivot, statement |
| solution | idea | .20 | 5 | Y | 1–2 | Name your answer in three words. | brand-reveal, logo, image |
| proof | proof | .20 | 3 | Y | 1–3 | What's your evidence: a demo, a case, a number? | big-number, quote, three-points |
| future | resolution | .12 | 4 | N | 0–1 | What becomes possible next? | sunrise, statement, image |
| ask | cta | .08 | 4 | Y | 1–1 | Exactly what should they do, and by when? | finale, statement |

**F4 `scqa`** · Situation, complication, question, answer · best for executive briefings · turns 1

| beat | roles | share | E | req | min–max | ask | templates |
|---|---|---|---|---|---|---|---|
| situation | hook, setup | .10 | 2 | Y | 1–1 | What does everyone in the room already agree on? | statement, big-number |
| complication | tension | .15 | 3 | Y | 1–1 | What changed, or what broke? | big-number, the-box, statement |
| question | setup | .05 | 3 | N | 0–1 | What question does that raise? | statement |
| answer | turn, idea | .15 | 5 | Y | 1–1 | What's your answer in one sentence? | pivot, statement |
| support | proof | .40 | 3 | Y | 1–3 | What are your three supporting points? | three-points, big-number, quote |
| ask | cta | .15 | 4 | Y | 1–1 | What decision do you need, from whom, by when? | finale, statement |

**F5 `blank`:** `{ turns: null, beats: [] }`. Every rule that depends on beats is skipped.

**v2 frameworks:** `story-spine`, `then-now-next`, `hero-lite`. These are data only, with no new templates.

### 6.3 Recommendation (first match wins; data table)
| Condition | Recommend | Runner-up |
|---|---|---|
| goal = decide | scqa | psf |
| goal = launch | psf | sparkline |
| goal = update | scqa | psf |
| goal = teach | psf | scqa |
| goal = inspire and tone = cinematic | giant-leap | sparkline |
| goal = inspire or persuade | sparkline | giant-leap |
| otherwise | sparkline | giant-leap |

The default theme follows the tone: `cinematic` → cosmos, anything else → slate.

### 6.4 Interview (`engine/story/interview.js`)
- Questions are shown one per panel. Every question can be skipped.
- **Step ① is done** when `bigIdea` and `targetMin` are answered.
- Validation produces **hints only** and never blocks.

| # | id | field | Question | Input | Hint rule | Flows to |
|---|---|---|---|---|---|---|
| 1 | goal | goal | What should this talk do? | choice: inspire, persuade, decide, launch, update, teach | — | framework |
| 2 | audience | audience | Who's in the room, and what do they believe today? | text, ≤200 characters | — | logline, notes |
| 3 | targetMin | targetMin | How long is your slot? | number 1–90, chips 3/5/10/20 | — | scene count, pace.runtime |
| 4 | bigIdea | bigIdea | If they remember one sentence, what is it? | text, ≤200 characters | more than 15 words → "Try it in one breath: 15 words or fewer." | echo rules, logline |
| 5 | shortIdea | shortIdea | Now say it in six words or fewer. | text | more than 6 words → hint | `{shortIdea}` |
| 6 | turn | oldWay, newWay | What do they believe now, and what should they believe after? | two fields, ≤5 words each | more than 5 words → hint | pivot, the-box |
| 7 | ask | ask | What should they do by next week? | text, ≤80 characters | first word not in IMPERATIVES → "Start with a verb: Book, Try, Pick." | finale, story.cta |
| 8 | proof | proof[0..2] | Your three strongest pieces of evidence | 3 rows: kind + text (+ value for number, + who for quote) | — | proof beats |
| 9 | brand | brand, tagline | Who are you, in one line? | brand ≤30 characters, tagline ≤40 | — | brand-reveal, finale |
| 10 | tone | tone | What should it feel like? | choice: cinematic, warm, crisp, playful | — | recommendation, theme |

**Logline** (shown at the top of later screens): `For {audience}, this talk shows {shortIdea||bigIdea}, so they {ask}.`
- If a token is empty, its whole clause is dropped.

### 6.5 Storyboard generation (`PD.story.board(story, { framework, theme, assets }) → TemplateScene[]`)
1. **Scene count.**
   - `n = clamp(round(targetMin·60/50), R, 24)`, where `R = Σ max(1, b.min)` over required beats.
   - If `targetMin` is null, `n = R`.
2. **Allocation:**
   - Each required beat starts with `max(1, min)` scenes. Optional beats start with `min`.
   - Distribute the remaining scenes using the largest-remainder method on `n·share`, capped at `max`.
3. **Order.** Scenes follow framework beat order. Scenes of the same beat are consecutive. Ids are `beatId`, then `beatId-2`, and so on.
4. **Template choice.** Take the first entry of `b.templates` that the theme satisfies (`requires.worlds` ⊆ the deck's worlds). Then apply overrides:
   - **Proof-role beats** consume `story.proof` in order:
     - `number` → big-number with {value, label: text}
     - `quote` → quote with {quote: text, who}
     - `story` or `demo` → statement with {line: text}
   - **Identity beats** use `logo` when a logo asset exists.
   - **Emotion and resolution beats** use `image` when a photo asset exists and the image template isn't used yet.
5. **Props** = the template's `seed`, with named tokens replaced:
   - Tokens: `{brand} {tagline} {bigIdea} {shortIdea} {oldWay} {newWay} {ask} {audience} {proof1..3}`.
   - An empty answer leaves its token in place.
   - Placeholder regex: `/\{[^{}]{1,40}\}/`.
6. **Notes** = `'▸ ' + beat.ask`. Each generated scene also gets `beat = b.id` and `point = b.label + ': ' + b.ask`.

### 6.6 Runtime model (the one formula)
For scene `i` and state `k` (0..steps):
- **animSec** = simulated seconds until `!busy()` after entering `(i,k)` **live**, from the previous state settled. Capped at 30.
  - Computed by `PD.story.timing`: a hidden `Stage({thumb:true})` ticked at 1/30 s, time-sliced, asynchronous.
  - `PD.story.estimate` gives an analytic fallback: the maximum of world tween `delay + dur`, `textDelay + prelude + at + inDur·(1.6 for letters)`, and morph `dur·1.2 + spread`.
- **dwellSec** = `k == steps ? (scene.dwell ?? 3) : (scene.stepDwell?.[k] ?? steps[k].dwell ?? 2.5)`. These are the same defaults `tools/record.js` uses.
- **speakSec** = `words(notes of state k)/140·60`:
  - Notes of state 0 are `scene.notes`. Notes of state k > 0 are `steps[k−1].notes`.
  - If the scene has **no notes at all**, `speakSec = (T.talkSec + T.stepTalkSec·steps)/(steps+1)`, where `T` is the template or `like`. Use 20 when there is neither.
- **sec(i,k)** = `max(animSec + dwellSec, speakSec)`. Scene seconds `sec_i = Σ_k`. `total = Σ_i`.
- **pos(i)** = `(start_i + sec_i/2) / total`.

### 6.7 Coherence checker (`engine/story/lint.js`; the Studio panel is called **Director**)
```ts
PD.story.rule({ id, sev: 'error'|'warn'|'info', area: 'story'|'pace'|'copy'|'visual'|'build',
                check(ctx) → { scene?: number, step?: number, vars: object, sev?: string }[],
                msg: string, fix: string /* {tokens} from vars */ })
PD.story.lint(compiled, timing?) → { findings: Finding[], score: number, ready: boolean }
ctx = { compiled, story: meta.story, fw: Framework|null, theme,
        scenes: [{ i, id, beat, roles, tpl, energy, steps, sec, start, pos, notesWords, ignore: Set,
                   states: [{ k, world, texts: [{ str, style, size, reveal, color, box: {x,y,w,h}, lines, overflow }],
                              visibleWords, dense, sec }] }],
        total }
```

**Helpers:**
- `words(s) = s.trim().split(/\s+/).filter(Boolean).length`.
- `visibleWords` = Σ words over visible texts. Text in the styles `year`, `label` and `caption` counts × 0.5.
- `dense` = `visibleWords ≥ 16`.
- `tokens(s)`: lowercase, strip punctuation, drop STOPWORDS (keep "not").
  - STOPWORDS: a an the and or but of to in on at for with is are was were be it its that this these those we you they our your their more most as by from into than so just very.
- `match(a,b)` = `a===b || (a.length≥5 && b.length≥5 && a.slice(0,5)===b.slice(0,5))`.
- `echo(text)` = at least 2 tokens of `bigIdea` match tokens of `text`.
- `place(w)`:
  - If cosmos is absent → 'flat'.
  - Otherwise, checked in order: `w.warp>.5 || w.speed≥1000` → 'hyperspace'; `w.galaxy>.5` → 'galaxy'; `w.earth>.5` → (`earthR≥1500` ? 'horizon' : 'planet'); `w.stars<.3 && w.nebulaAmount<.1` → 'void'; else 'space'.
- `T(s)` = `PD.template.get(s.like)`.

**Scoring and suppression:**
- `score = max(0, 100 − 15·E − 5·W − 1·I)`.
- `ready` = no errors. "Ready for the stage" never blocks presenting.
- `scene.lint.ignore` suppresses a rule for that scene.
- Validate issues appear as `build.<code>` findings with their own level.

**Story rules:**

| id | sev | check | message |
|---|---|---|---|
| story.idea-missing | error | `!story.bigIdea` | There's no big idea yet: the one sentence they'll repeat later. |
| story.idea-long | warn | `words(bigIdea) > 15` | Your big idea is {n} words. Try saying it in one breath. |
| story.beats-missing | error | a required beat has 0 scenes | The {beat} beat is empty, so the story skips a step. Fix: "Add a {template}: {ask}" |
| story.unassigned | warn | the scene's beat isn't in the framework (template scenes only) | Scene {i} doesn't serve any beat. |
| story.beat-order | warn | beat index decreases between scenes (flashbacks exempt) | {beat} comes after {later}, so the arc runs backwards here. |
| story.hook | warn | scene 0's `T.story.hook` is false | You open on {template}. People decide in the first 30 seconds whether to lean in. |
| story.idea-early | warn | no `echo` in any text or notes with pos < .33 | Your big idea doesn't show up in the first third. |
| story.idea-echo | warn | no `echo` in on-screen text with pos ≥ .75 | The ending doesn't echo your big idea. |
| story.turns | error if 0, warn if ≠ fw.turns | count of scenes with role `turn` | Your story has {n} turning points. This arc wants {k}. |
| story.turn-position | warn | `|pos(turn) − ideal| > .20`, or the turn is the last scene. ideal = cumulative share up to the turn beat's midpoint | Your turn lands at {p}%. This arc expects about {ideal}%. |
| story.cta | warn | no scene with role `cta` whose text or notes contain `story.ask` (when set), or whose text or notes start with a word in IMPERATIVES | There's no clear ask. What should they do on Monday? |
| story.thanks-ending | info | the largest text in the last scene matches `/^(thank|questions|q&a)/i` | You end on "thank you". Your last image should be your idea. |
| story.bookend | info | the last scene repeats no hero or title string and no `place` from the first half | The ending doesn't call back to the opening. |
| story.beat-share | info | a beat's runtime share is more than 2× or less than 0.4× its framework share | {beat} takes {p}% of the talk. It's usually about {s}%. |
| story.point | info | a template scene has no `point` | What's the one thing scene {i} says? |

**Pace rules:**

| id | sev | check | message |
|---|---|---|---|
| pace.runtime | warn above 15%, error above 35% | `|total/60 − targetMin| / targetMin`. When `targetMin` is null, emits info "Set your slot length" instead | This runs about {est} min in a {target}-min slot. |
| pace.flatline | warn | 4 or more consecutive scenes with equal energy | Scenes {a}–{b} all sit at the same energy. Flat is forgettable. |
| pace.no-peak | warn | max energy < 4 | Nothing rises above {max}/5, so there's no peak. |
| pace.peak-early | info | the last max-energy scene has pos < .5 | Your biggest moment is behind you by halfway. |
| pace.arc-drift | info | mean `|energy − ideal(pos)|` > 1.25 | Your energy drifts away from the {framework} shape. |
| pace.dense-run | warn | 3 consecutive **scenes** whose final state is dense | Three text-heavy shots in a row. The room starts reading instead of listening. |
| pace.wall | error | a state shows more than 30 visible words | Scene {i} shows {n} words at once. That's a document. |
| pace.long-hold | warn | `sec_i/(1+steps) > 120` | Scene {i} holds one picture for about {s}s. |
| pace.steps | warn | steps > 8 | {n} clicks in one scene. |
| pace.reveal-wait | warn | max over texts of `textDelay + at + inDur·(letters ? 1.6 : 1)` > 8 s | The last words land after {s}s, so you'll be waiting on the deck. |

**Copy rules:**

| id | sev | check | message |
|---|---|---|---|
| copy.style-words | warn | words > `BUDGET[style].words` | This {style} line has {n} words (max {max}). |
| copy.lines | warn | measured lines > `BUDGET[style].lines`, or width > maxWidth | "{str}" wraps onto {n} lines. |
| copy.small | warn | size < 20, or a caption or label has more than 5 words | Text this small can't be read from row 10. |
| copy.one-hero | warn | more than one hero or mega visible in a state | Two headlines are competing in scene {i}. |
| copy.placeholder | error | the placeholder regex, or `/lorem|TODO/i`, matches visible text | Scene {i} still has placeholder text. |
| copy.jargon | info | a token is in JARGON (leverage synergy utilise utilize robust seamless best-in-class paradigm holistic solutions unlock game-changer) | People stop hearing words like "{word}". |
| copy.over-sun | warn | `sun > .3` and the text box is less than 200 px from (sunX, sunY) | "{str}" sits in the sun's glare. |
| copy.notes | warn | scene notes have fewer than 3 words | Scene {i} has no speaker notes. |

**Visual rules:**

| id | sev | check | message |
|---|---|---|---|
| vis.teleport | warn | consecutive scenes go galaxy↔horizon, or both have Earth with an earthR ratio > 20 and a glide < 3 s, and there is no transition (hyperspace, flash ≥ .3, prelude) | Scene {i} jumps from {a} to {b} with no transition. |
| vis.warp | warn | hyperspace scenes > `max(1, floor(n/6))` | Hyperspace {k} times. It stops being magic. |
| vis.particle-type | info | `particles` text reveals > `ceil(n/2)`, or more than one in a single state | Particles assemble {k} lines. That's your exclamation mark. |
| vis.palette | warn | more than 4 custom text colors (first gradient stop), more than 2 fonts, or more than 5 nebula presets | {k} accent colors. The deck stops reading as one film. |
| vis.asset-source | error | a used asset isn't `data:` | "{asset}" can't be shown from a file link. |
| vis.particle-budget | warn above 8000, error above 9000 | estimated targets per state | Scene {i} asks for {n} particles. Part of the shape will be missing. |

B's "spectacle fatigue" rule is merged into `vis.warp`. B's "different look at the end" rule is replaced by `story.bookend`.

**IMPERATIVES:** book try pick start join visit email call sign choose bring share download schedule ask talk build test pilot register apply contact follow read watch write go come reply send plan map pair stop let's.

### 6.8 Copy budget per style (`PD.story.BUDGET`)
| style | max words | ≈ chars | max lines | voice |
|---|---|---|---|---|
| mega | 2 | 10 | 1 | numerals, never a sentence |
| hero | 3 | 14 | 1 | a noun phrase, or one word with a period; one per shot |
| title | 5 | 24 | 1 | a concrete fact of scale |
| statement | 14 | ~47 per line | 3 | spoken, present tense |
| subtitle | 7 | 40 | 1 | a tagline, no period |
| kicker | 5 | 30 | 1 | the first half of a sentence |
| body | 30 | ~64 per line | 4 | last resort |
| year | 2 | 14 | 1 | — |
| label | 4 | 22 | 1 | — |
| caption | 6 | 40 | 1 | — |

**Copy devices** (the editor suggests these): split sentence (kicker + statement), "Not X. Y.", number then meaning, callback, one accent = the future, silence beats.

### 6.9 Microcopy (`PD.story.COPY`; second person, at most 2 sentences, ends with an action, never says "error" or "invalid")
Keys:
- **Interview:** `welcome`, `q.goal`, `q.bigIdea`, `q.bigIdea.long`, `q.shortIdea`, `q.turn`, `q.ask`, `q.proof`, `q.brand`, `q.tone`.
- **Story and board:** `fw.pick`, `board.emptyBeat`, `board.placeholder`.
- **Director:** `lint.clean`, `lint.summary`, `lint.ready`, `lint.notReady`, `lint.ignore`.
- **Assets:** `assets.drop`, `assets.tainted`, `assets.heic`, `assets.solidLogo`.
- **Save and export:** `save.local`, `save.quota`, `export.done`, `export.fontWarn`.

The texts follow proposal C §6, plus:
- `q.shortIdea`: "Now say it in six words or fewer. This is what goes on screen."
- `assets.heic`: "Can't use .{ext} yet. Export it as PNG or JPEG."
- `assets.solidLogo`: "Your logo has a solid background, so particles will draw a box. Try brightness mode."
- `save.quota`: "Autosave is full. Save to a file now."
- `export.fontWarn`: "This deck uses {font}, which only exists on Macs. Drop a font file in to embed it."

### 6.10 OGL calibration (acceptance fixture)
OGL's raw scenes carry the following story metadata. These fields are not rendered:

| scene | beat | like | energy |
|---|---|---|---|
| spark | spark | cold-open | 2 |
| title | name | brand-reveal | 4 |
| warp | zoom-out | hyperspace | 5 |
| galaxy | you-are-here | galaxy-reveal | 3 |
| home | you-are-here | planet | 2 |
| sunrise | human-truth | sunrise | 4 |
| leaps | pattern | timeline | 3 |
| box | the-box | the-box | 3 |
| next | the-leap | pivot | 5 |
| thanks | callback | finale | 4 |

`meta.story`:
- framework `giant-leap`, goal `inspire`, tone `cinematic`
- `targetMin: null` (open question to the user, §10)
- bigIdea "The next leap is augmentation, not automation: technology that makes work more human."
- shortIdea "Augmentation, not automation"
- oldWay "automation", newWay "augmentation"
- brand "One Giant Leap", tagline "Making work more human"
- ask ""

**Required result:**
- 0 errors.
- The only warning is `story.cta`.
- Score ≥ 90.
- If a rule fires against OGL beyond this, the rule's thresholds get tuned, not OGL.

---

## 7. Studio (v1 MVP)

### 7.1 Shape
`studio/index.html` loads:
- `../engine/pixeldeck.js`
- both themes
- `../decks/one-giant-leap/{theme,assets,deck}.js`, as the read-only sample
- `../decks/_parity/{assets,deck}.js`, as the editable sample
- studio modules (`PD.module('studio/…', …, {export:false})`)

The Studio is one page with a **progress rail**: ① Brief · ② Shape · ③ Look · ④ Storyboard · ⑤ Rehearse · ⑥ Save & export.
- Steps are never locked.
- Each step shows ✓ when its done-when condition holds.
- The primary button always reads "Next: …".
- The logline appears under the header from ② onwards.

### 7.2 Screens
**Welcome**
- Buttons: [+ New deck], [Open a saved deck… (.html)], a Continue list from the autosave index (title, "autosaved n min ago"), and Samples:
  - "One Giant Leap (read-only)"
  - "One Giant Leap: template replica (editable copy)"
- **Empty state:** "Nothing saved in this browser yet. Start a new deck, or open a deck you saved."
- **Footnote:** "Autosave lives in this browser only. Saving to a file is the real save."

**① Brief**
- The §6.4 questions, one per panel. Big type, Skip, Back/Next, progress dots.
- Hints are shown inline in amber.
- **Done when:** `bigIdea` and `targetMin` are set.

**② Shape**
- A recommended framework card with the reason (`fw.pick`), the runner-up, the other v1 frameworks, and Blank.
- Each card shows:
  - an SVG ideal energy curve: each beat's energy at the midpoint of its share
  - beat chips sized by share
  - "best for"
- **[Build my storyboard]** runs `PD.story.board`.
  - If scenes already exist, it confirms first: "Replace your storyboard? You can undo this."
- **Done when:** a framework is chosen and scenes ≥ 1.

**③ Look**
- **Theme cards:** Cosmos and Slate. Each has a live preview Stage showing `brand-reveal` (cosmos) or `statement` (slate) with the user's brand or shortIdea.
- **Controls** (they write `meta.theme` and `meta.themePatch`):
  - accent color → `roles.accent` and `roles.accentGlow` (glow derived as the accent mixed 40% toward `#ff6a00`)
  - future color → `roles.future` and `roles.futureGlow`
  - default nebula (cosmos only) → `world.nebula`
  - brand font: drop or pick a font asset → `fontFaces` + `fonts.display`
- **Switching theme:**
  - Templates the new theme can't support become error cards.
  - A dialog lists them with [Swap to closest adaptive template]: hyperspace → big-number, galaxy-reveal → statement, planet → statement, sunrise → statement.
- **Done when:** the screen has been visited.

**④ Storyboard** (main workspace, §7.3)
- **Done when:** no placeholders remain and the Director shows no errors.

**⑤ Rehearse** (§7.4)

**⑥ Save & export** (§7.6)
- **Done when:** saved since the last change.

### 7.3 Storyboard workspace (WP7)
```
┌ header: title ▾ · rail ①–⑥ · "Saved ✓" · ⌘S · Undo/Redo ─────────────────────────────────────────┐
├ ASSETS (collapsible) ┬ PREVIEW (real Stage, 16:9) + transport ───────────────┬ DIRECTOR ─────────┤
│ cards + "Use as…"    │ ▶ Play in · ⟲ Replay · step pips · ▢ safe area · ⛶ Rehearse │ score · ready  │
│ drop zone            ├ INSPECTOR tabs: Content · Scene · Advanced ──────────────┤ findings list   │
├──────────────────────┴───────────────────────────────────────────────────────┴────────────────┤
│ ARC: energy dots at runtime position, framework ideal (dotted), total "est 9:40 / 10:00"          │
│ FILMSTRIP: [beat-colored cards with thumbnail, pips, point, lint dot] [+] between cards            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Filmstrip cards** show:
- a thumbnail of the scene's last state, from `PD.Thumbs` at 320×180 with LRU 150
- a beat chip in the beat's color
- the template label
- step pips
- the point, or the first visible line
- a red, amber or grey dot for the scene's most severe finding
- a dashed border while any placeholder remains
- a 🔒 badge on read-only (hand-written) scenes

**Filmstrip interactions (v1):**
- Click to select.
- Drag to reorder (pointer events, with an insertion line). The arc chart redraws live.
- **"+"** between cards opens the template picker, pre-filtered by the beat at that position.
- **Context menu:**
  - Duplicate.
  - Change template: props with the same name carry over; the rest come from the seed.
  - Move to beat ▸.
  - Delete (undoable).

**Template picker:**
- A modal grid. Each card has a lazily rendered thumbnail of `expand(example)` under the current theme.
- Tabs: "Good for {ROLE}" (templates whose roles intersect the beat's roles) and "All".
- Templates the theme can't support are hidden, with the note "Needs the Cosmos look."

**Inspector:**
- **Content:** a form generated from the template's `props` schema.
  - text fields with live character and word counts against BUDGET
  - overflow measured with `env.measure`
  - a red line with "Too wide for {style}. Shorten it or step down a style."
  - placeholder tokens highlighted in amber
  - list editors (add, remove, reorder)
  - an asset picker that filters assets by type
  - number sliders with min and max
  - an enum select
- **Scene:**
  - beat (select)
  - point (text)
  - energy (1–5 segmented control)
  - dwell
  - shot (theme shot picker)
  - notes per state, each with its speaking time at 140 wpm
- **Advanced:** a JSON textarea for `overrides`, validated when focus leaves it, with a "Reset" button.
- Read-only scenes show the notes tab only, and only for viewing.

**Preview:**
- **Field edit** (debounced 250 ms): `store.commit` → `compileScene` → `stage.setDeck(compiled, {changed:[id]})` → `enter(si, step, 'settled')`.
- **▶ Play in:** `enter(si−1, last, 'instant')`, then `enter(si, 0, 'live')`.
- **Pips:** jump to a step, settled.
- **Safe area:**
  - a 5% title-safe box
  - letterbox lines at 138 px
  - measured text boxes, with overflow shown in red
- The preview Stage is created with `PD.Stage` directly (no Player). It is recreated whenever its theme changes.

**Arc chart (SVG):**
- x is runtime position from `PD.story.timing`. The analytic estimate is used until timing finishes, and the label shows "≈".
- y is energy 1–5. The dotted line is the framework's ideal curve.
- Dragging a dot vertically sets `scene.energy`, snapped to integers. Double-click clears the override.

**Director:**
- The findings list is grouped by severity and shows score, "Ready for the stage", and the `lint.summary` line.
- Each finding has [Show me], which selects the scene and step, and [Ignore for this scene], which adds to `scene.lint.ignore`.
- Lint re-runs 300 ms after a change. Timing re-runs in idle slices.

### 7.4 Rehearse (WP7)
- Uses `PD.boot({ compiled, container: rehearseEl, hash:false, sync:false, api:false, hud:true })` plus the Fullscreen API on the container.
- **Overlay strip** (toggle with N): current notes, next scene title, per-scene stopwatch, and total vs `targetMin`.
- Esc exits back to the board, with the board selection set to the last state shown.
- **No presenter window in v1.** `blob:` windows can't use BroadcastChannel, and `about:blank` shares the thread. To rehearse with a presenter, rehearse with the saved `.html`.

### 7.5 Assets (WP6 import pipeline, WP7 panel)
**Accepted:** `.png .jpg .jpeg .webp .svg` and `.woff2 .woff .ttf .otf`.
**Rejected:**
- `.heic .heif .pdf video/*` get `assets.heic`.
- Anything else gets "Can't use this file type."

**Images:**
1. Decode with `createImageBitmap(file)`. Blob sources are untainted.
2. **SVG:** read the `viewBox` from the file text and rasterize at 2400 px wide, preserving the viewBox aspect. Never use the 300×75 natural size.
3. Downscale so the long edge is at most 2400 px.
4. Encode as PNG if any sampled pixel has alpha < 255. Otherwise encode as JPEG at quality 0.85, via a canvas `toDataURL`.
5. Record `w`, `h`, `bytes`.

**Fonts:**
1. Read an `ArrayBuffer` and verify it with `new FontFace(tmp, buf).load()`.
2. On failure: "Couldn't read this font; using the theme font."
3. Encode as a data URL. The family name defaults from the file name and can be edited.

**Identity and storage:**
- The id is the slug of the file name, made unique within the deck.
- The hash is the SHA-256 (`crypto.subtle`) of the data URL.
- Stored in IndexedDB. Registered with `PD.assets.put(deck.id, id, source)`.

**Warnings:**
- Total above 20 MB → banner.
- Any single image above 4 MB after processing → amber note.
- A logo with no transparency → `assets.solidLogo`, with [Use brightness mode], which sets `sample.mode = 'luma'`.

**"Use as…" chips:**
- Add as logo scene (inserts `logo` after the identity beat, or at the end)
- Add as image scene
- Use as brand font (Look)

**Empty state:** three slots (Logo · Photos · Font), each with one line saying what it unlocks.

### 7.6 Save & export (WP6)
**Pre-save checklist**, which runs automatically:

| Check | Blocking? |
|---|---|
| compile errors = 0 | blocking |
| validate errors = 0 | blocking |
| Director errors | non-blocking warning |
| theme font embedded or Mac-safe | `export.fontWarn` |
| total size | shown |
| export self-test (§3.6) passes | blocking |

**Actions:**
1. **Save presentation (`<slug>.html`).** This is also the project file.
   - **Chrome:** `showSaveFilePicker`. The handle is stored in IndexedDB `handles`, so later ⌘S saves are silent after `requestPermission`.
   - **Other browsers, or when permission is refused:** download.
   - ⌘S always performs this action.
2. **Export source:** downloads `deck.js` and `assets.js`, with this instruction: "Copy `decks/_starter/` to `decks/<slug>/`, replace these two files, and set the theme script in index.html."
3. **Video backup:** a copyable `node tools/record.js --deck "<path to saved .html>"`.

**Open:** a file picker or drop of `.html` → parse the markers (§3.6) → a new project (assets go into IndexedDB).

### 7.7 Persistence (WP6)
- **localStorage:**
  - `pdstudio:v1:index` = `[{ id, title, theme, scenes, updated }]`
  - `pdstudio:v1:proj:<id>` = `Project` JSON. Assets are stored by reference.
  - Autosave runs 1 s after the last commit.
- **IndexedDB** `pdstudio`, version 1:
  - store `assets` (keyPath `hash`): `{ hash, type, name, mime, src, w, h, bytes, family?, weight? }`
  - store `handles` (keyPath `projectId`)
- **Quota exceeded:** sticky banner `save.quota`.
- **Two tabs:** BroadcastChannel `pdstudio:lock:<id>`. The second tab opens read-only with "Open in another tab."
- **Undo/redo:** snapshot stack of 100 entries. Every `commit` pushes. Typing is coalesced per field within 1 s.
- **IDs:** project id and deck id are `slug(title||'untitled') + '-' + 4 base36 characters` from `crypto.getRandomValues`. The deck id is fixed after creation.

### 7.8 Store contract (WP6 provides, WP7 consumes)
```ts
Project = { v: 1, id: string, deck: DeckSource /* object form */, assets: { [assetId]: hash },
            studio: { screen: string, selected: { sceneId: string|null, step: number }, readOnly: boolean,
                      savedHash?: string, fileName?: string } }
Studio.store = {
  get(): Project,                                   // treat as immutable
  commit(label: string, mutate: (draft: Project) => void): void,
     // deep-clones, mutates, pushes undo, autosaves, emits 'change' { changedSceneIds: string[], themeChanged: boolean, structural: boolean }
  undo(), redo(), canUndo(): boolean, canRedo(): boolean,
  select(sceneId: string|null, step?: number): void, selection(): { sceneId, step },
  compiled(): CompiledDeck,                         // cached; only changed scenes are recompiled
  lint(): { findings, score, ready },               // cached; recomputed 300 ms after change
  timing(): Timing | null,                          // last completed timing
  on(evt: 'change'|'select'|'lint'|'timing'|'route', fn): () => void,
  route(name?: string): string
}
Studio.screen(name: string, { title: string, rail?: 1|2|3|4|5|6,
  mount(el: HTMLElement, ctx: { store, PD, ui: { toast(msg), confirm(msg) → Promise<boolean>, banner(msg, kind) }, nav(name) })
    → { unmount(): void } })
```

### 7.9 Visual design
- The Studio chrome follows today's `notes.html` palette as CSS variables in `studio.css`:
  - `--bg #1a1c2c`, `--panel #232539`, `--line #333c57`, `--text #f4f4f4`, `--muted #94b0c2`, `--accent` (from the theme's `ui.accent`)
- Monospace for numbers. At least 44 px hit targets.
- Minimum window size is 1280×760. Below that: "Make the window larger."

### 7.10 v2 (explicitly out of v1)
- **Editing:** drag-to-position text on the canvas; hand-drawn particle paths; keyframe timeline for world values; slider-based Advanced tab; ⌥-drag duplicate; group-by-beat lanes; review comments.
- **Media:** photo-to-particles as a standalone shape; photo blur crossfade; bars and line charts; grid world; ring, sphere and grid shapes; logo palette extraction and "remove white"; music track with beat-snapped cues.
- **Rehearsal and versions:** rehearsal analytics (planned vs actual, "apply actuals as dwell"); presenter window from the Studio; preflight with ms per frame and mash test; Versions menu.
- **Export:** zip or folder export (`showDirectoryPicker`); engine copy per deck; in-page video recording (`captureStream`); PDF storyboard and handout.
- **Import:** hand-written deck import or editing as code scenes.
- **Story:** frameworks story-spine, then-now-next and hero-lite; `before-after`, `question` and `cta` templates; interview questions `feel`, `story` and `firstShot`.
- **Platform:** a bundled open-licence font; more looks (Paper, Neon Grid, Ocean, 8-bit look); AI bridge ("Copy outline prompt" / "Paste scene JSON"); other aspect ratios; Safari and Firefox QA.

---

## 8. Migration plan for One Giant Leap + verification

### 8.0 Phase 0: the talk (today and Wednesday)
- No changes under ROOT, including `git init`. Follow the protocol in §1.3.
- If builders want to start before the talk ends:
  - They work in a scratch copy: `rsync -a --exclude '*.mp4' --exclude tools/node_modules pixeldeck/ ../pixeldeck-v2-scratch/`. The `_archive` is copied read-only.
  - Packages land in ROOT only after the talk, in the dependency order in §9.
  - Gates run against the ROOT baseline.

### 8.1 Gate tooling (WP0, Day 0)
1. `git init`. Commit the untouched tree ("pre-v2 snapshot"), including `_archive/` as-is.
2. **Extend `tools/regression/golden.js`** (procedure in §8.3):
   - `--deck <html>`, `--size 1280x720|1920x1080`, `--out`, `--thumbs`.
   - A seeded `Math.random` with a call counter. Each capture writes `{file, rng}` to `rng.json`.
   - Extra paths: `goTo` 7.4; `prev` from 8.1; `R` replay on 10; `Home` from 6.0.
3. **Capture baselines from `_archive/2026-10-13-stage-ready/cinema/index.html`** into `tools/regression/baselines/ogl/{1280,1920,thumbs}`:
   - Capture twice and require byte-identical results.
   - The old 84 frames must also match their counterparts by SHA. If they don't, the archive capture is the reference and the difference is written to `baselines/ogl/NOTE.md`.
4. **`compare.js <baselineDir> <candidateDir>`:**
   - Compares SHA-1 per file and `rng.json` per capture.
   - On any mismatch it runs `diff.py --out` and prints `EXACT FAIL (n frames; RNG drift at capture k)`.
   - Exit codes: 0 exact; 1 different; 2 within tolerance (diff.py thresholds: mean < 1.5, big% < 0.5).
5. **`perf.js`:** real-time GPU run sampling `state().workMs`. Reports p95 per state. Fails when p95 exceeds baseline × 1.10 + 0.5 ms.
6. **`stall.js`:**
   - Real-time GPU run through every state while a presenter window is open: with N on v2, or `notes.html` as a separate page on the archive.
   - Records the stage's maximum RAF gap per state.
   - v2 fails if any gap is above 50 ms after `ready`.

### 8.2 Milestones (WP1; one commit each; gate = EXACT on 1280 and thumbs, plus 1920 at M4, M6 and release; plus lint)
| M | Change | Gate |
|---|---|---|
| M1 | **Relocate, no code edits.** Copy `engine/tween.js` → `engine/core/ease.js`. Copy `cinema/engine/*.js` → `engine/core/` (split files are created verbatim as concatenated slices). Create `decks/one-giant-leap/{index.html,notes.html,scenes.js}` from `cinema/` with srcs repointed. Move the legacy deck to `legacy/pixel/`. Turn `cinema/*.html` into redirect stubs and delete `cinema/engine`, `cinema/scenes.js` and `cinema/README.md` (→ `decks/one-giant-leap/README.md`). Update `record.js` aliases. | EXACT; legacy smoke via `record.js --deck pixel --mode frames --fps 2` produces frames without errors |
| M2 | **Kernel + `PD.module` wrappers.** Use local dep variables and `PD.compat` with the full list (§3.3). No `'use strict'`. The deck HTML loads through `pixeldeck.js`. `tools/lint.js` lands. | EXACT, RNG equal, lint clean |
| M3 | **Theme extraction.** Create `core/theme.js`, `themes/cosmos/theme.js` and `decks/one-giant-leap/theme.js` (snapshot). `TextLayer`, `Space` and `Stage.enter` read `stage.theme`. Nebula cache key becomes the palette hash. Compat still exports `STYLES`, `FONT`, `COLORS` and `NEBULA_PRESETS` (bound to the OGL theme). | EXACT |
| M4 | **Plugins.** `Stage.draw` becomes the sorted pass list. Create `worlds/{core,cosmos,planet,spark}.js`. `stage.neb` becomes `stage.xf.nebula`. Add `warmTick` (§4.5), the element registry (`text`), the shape registry (built-ins) and registry fallback for reveals and exits. | EXACT at 1280 and 1920; perf |
| M5 | **Deck format.** `scenes.js` becomes `deck.js` (a `PD.deck` factory: helpers verbatim inside, `meta.story`, the scene metadata from §6.10). Add `core/compile.js`. Stage takes `{deck: compiled}`, with no `window.DECK`. Add `setDeck` eviction and `core/assets.js` (OGL: empty map). | EXACT |
| M6 | **Player.** `Show` → `core/player.js` + `PD.start`/`boot`. Add the Sync rewrite (§4.11), `core/notes.js` + `notes.html` shim, `core/thumbs.js`, `core/hud.js`, the key filter and `PixelDeck` additions. `PD.compat` is deleted, along with every compat call. | EXACT at 1280 and 1920; thumbs EXACT; RNG equal; stall.js passes; perf |
| M7 (WP2) | `PD.exportHTML` + `tools/export.js`. | EXACT on `decks/one-giant-leap/export/one-giant-leap.html` |
| M8 (WP4) | `decks/_parity`: OGL rebuilt from templates with `example` props under `cosmos`. | TOLERANT (all frames within diff.py thresholds). EXACT on `rest` frames is reported as a stretch goal |

**Standing rules after M6:**
- Every commit that touches `engine/core/`, `engine/worlds/{core,cosmos,planet,spark}.js`, `engine/pixeldeck.js` or `decks/one-giant-leap/` must pass EXACT.
- Every other commit must pass EXACT on a nightly run.
- The talk deck in `_archive` is never the candidate. It is only the baseline.

### 8.3 Verification method (exact procedure; identical for baseline and candidate)
1. Launch Playwright 1.56.1 `chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'] })`. Viewport 1280×720 (or 1920×1080), DPR 1, on the same Mac (it needs Avenir Next).
2. Init script:
   - `requestAnimationFrame = () => 0`
   - `Math.random` = mulberry32 seeded with 1234567, which increments `window.__rng = (window.__rng|0) + 1` on every call
3. Navigate to `file://<deck>?quality=1#1.0`.
   - Wait for `window.PixelDeck`, then `setManualClock(true)`, then wait 300 ms.
   - Call `tick(0)` 400 times.
   - Then, while `PixelDeck.ready === false`, call `tick(0)`, up to 2000 more times. On the baseline `ready` is undefined, so this step is skipped.
4. For each state in order:
   - If it isn't the first state, call `next()`.
   - Advance 0.6 s → capture `t0.6`. Then 0.9 s → `t1.5`. Then 1.5 s → `t3`.
   - While `isBusy()` (at most 600 times), advance 0.2 s. Then advance 0.5 s → capture `rest`.
   - "Advance a" means `tick(1/30)` until `a − 1e-9`.
   - Every capture is a page screenshot plus `__rng`.
5. Run the extra paths from §8.1, each followed by `rest`.
6. **Thumbs:** a fresh page with the same init script. Construct the adapter in-page:
   - Baseline: `new Stage(cv, {thumb:true})`.
   - v2: `new PD.Stage(cv, {deck: PD.compile('one-giant-leap'), thumb:true})`.
   - Then `resize(480, 270, 1)`. For every state: `still(si, step)`, then `cv.toDataURL()` → PNG.
7. Compare with `compare.js`. Any EXACT failure blocks the merge. Software rendering (`--disable-gpu`) is a fallback, used only if GPU captures stop being reproducible run-to-run. If so, re-baseline both baseline and candidate in that mode.

### 8.4 Rollback
- Each milestone is a single commit. A failing gate means revert, never "fix forward on main".
- `_archive/` and the MP4 stay the presentation fallback until v2.0 has passed a full rehearsal on the presenting Mac (§9, WP8 acceptance).

---

## 9. Work breakdown

WP0 and WP1 run in sequence on the critical path. Once WP1 reaches M6, WP2–WP7 run **in parallel** with disjoint file ownership. WP8 runs alongside and does its final pass last.

```
WP0 ──► WP1 (M1…M6) ──┬─► WP2 export ───────────────┐
                      ├─► WP3 worlds/elements/slate ┤
                      ├─► WP4 templates/validate ◄──┤ (logo/image/big-number need WP3 at acceptance)
                      ├─► WP5 story ◄── WP4 catalog ids (contract-level) 
                      ├─► WP6 studio shell ◄── WP2, WP3, WP4, WP5 (contracts; acceptance after merge)
                      └─► WP7 studio board ◄── WP4, WP5, WP6 store contract
WP8 docs/launcher: contracts now; final pass after all
```
**Contract-first rule.** Packages code against §4–§7. Each one stubs its dependencies' contracts in its own test fixtures until they land. **Shared files:** none. `engine/pixeldeck.js` belongs to WP1 and already lists every v1 module (§3.2). The test runner discovers specs by filename.

### WP0: Regression gate and test runner
- **Owns:**
  - `.gitignore`, `tools/package.json`
  - `tools/regression/{golden.js, compare.js, perf.js, stall.js, README.md, baselines/**}` (`diff.py` kept)
  - `tools/test/{run.js, assert.js, harness.tpl.html, e2e.js}`, `tools/test/specs/wp0-*`
- **Depends on:** the talk being over.
- **Deliverables:**
  - §8.1.
  - **Test runner:** `node tools/test/run.js [--grep re] [--headed]` generates `tools/test/.harness.html`. Its load order is:
    1. `engine/pixeldeck.js`
    2. `themes/*/theme.js`
    3. `decks/*/theme.js`
    4. `decks/*/assets.js`
    5. `decks/*/deck.js`
    6. `assert.js`
    7. `specs/*.test.js`

    Each group loads alphabetically. The runner opens the harness in Chromium and prints `ok`/`not ok` lines, exiting non-zero on failure.
  - **Spec API:** `T.test(name, fn(a) → void|Promise)`. `a.ok`, `a.equal`, `a.deepEqual`, `a.throws(fn, re)`, `a.near(x, y, eps)`.
  - **E2E runner:** `node tools/test/e2e.js [file]` gives each `e2e/*.e2e.js` file `(page, ctx)`.
- **Acceptance:**
  1. Two baseline captures from `_archive` are byte-identical: frames, thumbs and `rng.json`.
  2. A capture of pre-migration `cinema/index.html` is EXACT against the archive baseline.
  3. The old 84-frame baseline matches, or the difference is documented.
  4. A deliberately failing spec makes `run.js` exit 1. A passing one exits 0.
  5. `stall.js` records the archive's numbers: with notes as a separate page, and with N. The N case reproduces a stall above 100 ms at 4.0, which proves the tool detects stalls.
  6. `perf.js` baseline JSON is committed.

### WP1: Engine core migration and OGL relocation (critical path)
- **Owns:**
  - `engine/pixeldeck.js`
  - `engine/core/{util,ease,glow,fx,space,earth,shapes,field,text,theme,assets,compile,stage,sync,thumbs,hud,player,notes}.js`
  - `engine/worlds/{core,cosmos,planet,spark}.js`
  - `themes/cosmos/theme.js`
  - `decks/one-giant-leap/**`
  - `legacy/pixel/**`, `cinema/*`
  - `tools/record.js`, `tools/lint.js`
  - `tools/test/specs/wp1-*`
- **Depends on:** WP0.
- **Deliverables:** M1–M6 (§8.2), contracts §3, §4.1–4.2, §4.4–4.14.
- **Acceptance:**
  1. EXACT gate at every milestone. 1920 and thumbs EXACT at M4 and M6. RNG counts equal.
  2. `tools/lint.js` is clean.
  3. Unit specs:
     - a duplicate module, registry entry or param throws
     - a missing dependency throws
     - `PD.missing()` lists absent required modules, and `PD.start` then shows the on-screen panel
     - theme resolve: the chain merge, `@role` substitution, frozen output, and `key` changes with the patch
     - `compile` passes raw scenes **by reference**
     - `setDeck` eviction leaves the maps sized to the current deck after 200 random edits
     - the key handler ignores `input` and `textarea` targets
     - `Sync` uses channel `pixeldeck:<id>` and never `pixeldeck-cinema`
     - creating a stage `Sync` consumes exactly one `Math.random`
     - `assets.ready` resolves within 3.2 s when a font never loads (a never-settling promise injected)
  4. `stall.js` passes: N opens notes with `noopener`; maximum stage gap ≤ 50 ms after `ready`.
  5. Two stage tabs plus one notes window: notes shows the "Another stage" banner, and commands drive only the bound stage (e2e).
  6. `record.js --deck one-giant-leap` produces a video, and `record.js --deck pixel` still works.
  7. Old links `cinema/index.html#7.3` and `cinema/notes.html` land on the new deck at 7.3.
  8. `perf.js` passes.

### WP2: Standalone export and starter deck
- **Owns:** `engine/core/export.js`, `tools/export.js`, `decks/_starter/**`, `tools/test/specs/wp2-*`, `tools/test/e2e/wp2-*`.
- **Depends on:** WP1 (M6).
- **Deliverables:** §3.6.
- **Acceptance:**
  1. `node tools/export.js decks/one-giant-leap` writes the file. The golden gate is EXACT on it, and so are its thumbs.
  2. The exported file contains no `src=` or `href=` pointing at anything other than `data:`, and no `fetch(`. It is under 400 KB.
  3. **Round trip:** an object deck whose notes contain `</script><!-- */ * &` and an emoji exports, then re-parses through the markers to a `deepEqual` DeckSource and assets.
  4. **Notes e2e:** pressing N opens `?notes` as a separate page. Next and Prev from the notes page drive the stage.
  5. The self-test posts `ok:true` for OGL, and `ok:false` with the scene index when a deck's factory references an undefined variable.
  6. The CLI and in-page `PD.exportHTML` produce byte-identical output.
  7. `decks/_starter/` runs and shows one `statement` scene under `slate`. This acceptance runs after WP3 and WP4 land.

### WP3: New worlds, elements and the slate theme
- **Owns:**
  - `engine/worlds/{ambient,photo}.js`
  - `engine/elements/{image,counter}.js`
  - `themes/slate/theme.js`
  - `decks/_gallery/**`
  - `tools/test/specs/wp3-*`, `tools/test/fixtures/wp3-*`
- **Depends on:** WP1 contracts.
- **Deliverables:** §4.4 (slate), §4.5 (ambient, photo), §4.6 (image, counter).
- **Acceptance:**
  1. The OGL gate is still EXACT with WP3 files loaded. This proves registration has no side effects.
  2. Per-frame cost at 1920×1080, quality 1.5: ambient ≤ 1.0 ms and photo ≤ 1.5 ms (p95).
  3. A generated 1200×400 transparent PNG logo gives `points()` ≤ 3500, and `field.list.length` never exceeds 9000.
  4. **Tainted fallback:** an image asset with a `file:` src gets `ok:false`, and a `particles` reveal falls back to `fade` with no exception.
  5. The counter shows exactly `to` after `finishAll`, and the formatting `1,234.5%` is correct.
  6. **Crossfades:** `photoAsset` and `ambientPreset` are not busy after `finishAll`.
  7. `decks/_gallery` runs under slate with 0 validate errors and no console errors.
  8. `tools/lint.js`: no `Math.random` in WP3 files.

### WP4: Template catalog, validation and the parity deck
- **Owns:** `engine/templates/{cinematic,essentials}.js`, `engine/core/validate.js`, `decks/_parity/**`, `tools/test/specs/wp4-*`.
- **Depends on:** WP1. WP3 (image and counter) is needed only for the acceptance of templates 12, 15 and 16.
- **Deliverables:** §5 and the validate side of §4.3.
- **Acceptance:**
  1. Every template's `example` compiles and validates with 0 errors under cosmos. Adaptive templates do the same under slate.
  2. `expand` is pure: two calls are `deepEqual`, and a `Math.random` spy shows 0 calls.
  3. Prop limits produce the specified `template.prop-*` issues. Missing required props produce errors.
  4. `decks/_parity` is TOLERANT against the OGL baseline on all frames. EXACT counts are reported.
  5. Validate flags:
     - an unknown style or param
     - a `world.needs-plugin` case (an `earth` param under slate)
     - `asset.not-embedded`
     - `particles.budget` (a synthetic 9500-target scene)
  6. Every id listed in a framework (§6.2) exists in the catalog. This test runs when WP5 has landed.

### WP5: Story backbone
- **Owns:** `engine/story/{copy,frameworks,interview,timing,board,lint}.js`, `tools/test/specs/wp5-*`, `tools/test/fixtures/wp5-*`.
- **Depends on:** WP1 (`resolve`, `measure`, Stage). WP4 catalog ids and `story` metadata (contract-level).
- **Deliverables:** §6.
- **Acceptance:**
  1. **OGL calibration (§6.10):** 0 errors, the only warning is `story.cta`, score ≥ 90.
  2. **Timing:** `PD.story.timing(OGL)` total animation + dwell is within ±10% of 171 s, the length of the recorded video. The analytic estimate is within ±15% of the simulation.
  3. `board()` for each framework × `targetMin` ∈ {3, 10, 20, null} × theme ∈ {cosmos, slate}:
     - Scene counts follow §6.5.
     - Every template the board picks is available in the theme.
     - With all tokens answered: 0 `copy.placeholder` findings. With them blank: at least one.
  4. The recommendation table cases pass.
  5. Every rule has one positive and one negative fixture.
  6. `lint.ignore` suppresses a rule.
  7. Lint for a 24-scene deck runs in under 150 ms, excluding timing.

### WP6: Studio shell, persistence, import, and screens Welcome/Brief/Shape/Look/Export
- **Owns:**
  - `studio/{index.html, studio.css, app.js, store.js, persist.js, import.js}`
  - `studio/screens/{welcome,brief,shape,look,export}.js`
  - `tools/test/specs/wp6-*`, `tools/test/e2e/wp6-*`
- **Depends on:** WP2, WP3, WP4, WP5 (contracts). §7.8 is fixed with WP7.
- **Acceptance (e2e):**
  1. **New-deck flow:** answer the interview → pick the recommended framework → Build → choose Cosmos → reach the storyboard with scenes and the logline shown.
  2. Reload the page. Continue restores the project, including assets from IndexedDB.
  3. Save produces an `.html` that opens by double-click from `file://` and plays.
  4. Re-opening that file in the Studio gives a `deepEqual` deck.
  5. Dropping a 6000 px JPEG stores an image with a 2400 px long edge.
  6. An SVG with only a `viewBox` rasterizes at 2400 px wide.
  7. A HEIC file shows `assets.heic`.
  8. A font drop applies in Look, and the preview re-renders with the new face.
  9. Undo and redo cover 20 commits.
  10. A second tab on the same project is read-only.
  11. A simulated quota error shows the banner.
  12. Theme switch to Slate offers swaps for cosmos-only templates.

### WP7: Storyboard workspace and Rehearse
- **Owns:**
  - `studio/screens/{board,rehearse}.js`
  - `studio/ui/{filmstrip,arc,forms,preview,inspector,director,assets-panel,picker}.js`
  - `tools/test/specs/wp7-*`, `tools/test/e2e/wp7-*`
- **Depends on:** WP1 (Stage, Thumbs, boot), WP4, WP5, and the WP6 store contract. The store is stubbed until WP6 lands.
- **Acceptance (e2e):**
  1. Editing a text field updates the preview within 400 ms and re-renders only that card's thumbnail (spy on `Thumbs.request`).
  2. Drag-reorder updates the arc and the Director's `story.beat-order`.
  3. The picker filters by beat roles, and Change template keeps props with matching names.
  4. **Overflow:** a 40-character hero shows a red overflow line, and the Director shows `copy.lines`.
  5. Arc drag sets energy, and `pace.flatline` appears or disappears accordingly.
  6. Show me selects the right scene and step. Ignore suppresses the finding.
  7. **Read-only OGL sample:** the filmstrip shows 10 locked cards, and the Director shows score ≥ 90.
  8. Rehearse goes fullscreen. Clicker keys advance, N toggles the strip, Esc returns with the selection kept.
  9. 200 edits in a row: JS heap growth under 50 MB, and the preview stays at 60 fps on the M2 (F overlay).

### WP8: Docs and launcher
- **Owns:** `README.md`, `index.html` (root), `docs/{authoring,themes,templates,plugins,story,studio,export}.md`.
- **Depends on:** contracts (§3–§7). Final pass after WP2–WP7.
- **Acceptance:**
  1. The launcher links all resolve from `file://`: Studio, OGL, OGL notes, gallery, starter, legacy.
  2. Every public function in §4 is documented with one example.
  3. **Fresh-user test:** someone new follows `docs/studio.md` to a saved `.html` without help.
  4. **Release rehearsal:** OGL is run from `decks/one-giant-leap/` on the presenting Mac with notes via N, with a full run-through and no frame gap above 50 ms. After that, v2 replaces `_archive` as the primary presentation path for future talks. `_archive` itself stays as it is.

---

## 10. Risks & mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | Any edit before the talk breaks the live deck (the `../engine/tween.js` dependency, file moves) | Low (if the rule is followed) / Critical | Freeze (P3, §8.0). Present from `_archive`, with `cinema/` byte-identical as fallback and the MP4 as backup |
| R2 | The presenter window stalls the stage (same-thread popup) | High today / High | Talk day: open `notes.html` separately. v2: `noopener` + `?notes` + idle-sliced Thumbs. `stall.js` is a gate |
| R3 | Copies of the deck drive each other (shared channel) | Medium / High | Talk day: open one deck only. v2: `pixeldeck:<deckId>` channels, instance ids, a banner on a second stage, targeted commands |
| R4 | The refactor changes pixels: RNG order, float order, Glow budget, warm order | High / High | EXACT gate on every milestone. RNG counts per capture. Verbatim bodies. Determinism rules (§4.14). `warmTick` reproduces today's branch. One milestone per commit, revert on failure |
| R5 | Golden captures stop being reproducible (GPU or driver drift) | Low / Medium | Double capture at WP0. Fallback to `--disable-gpu` for both baseline and candidate. Same Mac (Avenir) |
| R6 | ReferenceErrors after wrapping (missing compat names; `DECK =` with no `var` under strict mode) | High if ignored / High | Full compat list (§3.3). No `'use strict'`. Lint. M2 gate |
| R7 | The `document.write` loader silently skips a file, or is loaded async | Medium / Medium | `PD.missing()` + on-screen `PD.fail`. Kernel throws if `readyState !== 'loading'`. Exported files don't use the loader |
| R8 | `toString` export loses code outside factories, or breaks HTML parsing | Medium / High | One-statement lint (sandbox). Safe-JSON escaping (`< > & *` and line separators). `</script` rewrite. Self-test renders every state before Save. Round-trip test |
| R9 | Images taint the canvas: the deck freezes, the recorder fails | Medium / High | Assets only via `PD.assets` `data:` URLs. Non-data sources never load. Validate error. Sampling in try/catch falls back to fade |
| R10 | Logo or image particles exceed `Field.MAX` (shape loses part of its area) | Medium / Medium | Auto-stride to 3500 points. Validate and Director budget (8000 warn, 9000 error) |
| R11 | Async boot hangs (`decode` or font load never settles) | Low / High | Per-item catch, 3 s overall timeout, `ready()` never rejects. Boot always draws |
| R12 | First-appearance stalls return (lazy textures) | Medium / Medium | Eager preload as today, plus `PixelDeck.ready`. Notes in its own process. Recorder and gate wait for ready |
| R13 | Global state breaks multiple stages in the Studio (themes, caches, keys, hash) | High / Medium | Per-stage resolved theme. Palette-hash texture keys. Stage/Player split. Key filter. Studio uses Stage directly |
| R14 | Studio memory growth over long sessions | Medium / Medium | `setDeck` eviction bounded to the current deck. Thumbs LRU of 150 at 320×180. Heap test (WP7 #9) |
| R15 | Checker false positives on the deck the user loves erode trust | Medium / Medium | OGL calibration fixture (0 errors, ≥ 90). Per-scene ignore. Language rules are hints only (shortIdea asked explicitly; IMPERATIVES list) |
| R16 | Studio data loss (cleared site data, quota, two tabs) | Medium / High | The saved `.html` is the project. Autosave plus IndexedDB. Quota banner. Tab lock. "Autosave lives in this browser only" copy |
| R17 | Generic theme evolution changes OGL | Medium / High | The OGL theme is a self-contained snapshot. The EXACT gate covers `decks/one-giant-leap` on every engine change |
| R18 | Parallel packages drift from the contracts | Medium / Medium | Disjoint file ownership. Manifest pre-declared. Contract changes only through a lead-approved amendment to this spec, with an `AMEND-n` section appended and every affected WP notified |
| R19 | Fonts on other machines (Avenir is Mac-only) | Medium / Low | Export `fontWarn`. Brand font embedding through Studio asset drop. Present from a Mac. Bundled open-licence font is v2 |
| R20 | Scope creep stalls v1 | High / Medium | Explicit v2 list (§7.10). Acceptance-driven packages. Cut order if late: Rehearse overlay → arc drag → slate's `three-points` columns layout |
| R21 | Browser differences (Safari, Firefox: no FSA) | Medium / Low | Chrome is primary. Download fallbacks everywhere. BroadcastChannel and localStorage only. v1 QA is Chrome-only |

**Open questions for the user (non-blocking; defaults in brackets):**
1. OGL's real slot length, for `meta.story.targetMin` [`null`: the runtime rule is skipped].
2. Is "Slate" the right non-space look, or is a lighter "paper" look preferred? [Slate].
3. Can we bundle an open-licence brand font (for example Inter) in v2? [No font file in v1].
---

## AMENDMENTS (lead, 2026-10-13) — these override the sections they reference

### AMEND-1 · Build now, in ROOT, with the talk protected (supersedes P3, §8.0, M1 cinema/ steps)
The user asked for the build to start now. The talk is protected by `_archive/` instead of by a freeze:
- `_archive/` is **never** read-for-write, moved, or modified. It is the presentation path and the baseline source.
- **`cinema/` (all files) and `engine/tween.js` must NOT be modified, moved or deleted** until the user confirms the talk is over. `cinema/index.html` loads `../engine/tween.js`, so that file must stay at that exact path.
  - M1's "turn `cinema/*.html` into redirect stubs" and "delete `cinema/engine`, `cinema/scenes.js`, `cinema/README.md`" are **deferred** to a post-talk task. Do not do them.
  - `engine/core/ease.js` is a COPY of `engine/tween.js`; the original stays.
  - Acceptance item WP1 #7 (old `cinema/` links redirect) is deferred.
- The legacy pixel deck is **copied** to `legacy/pixel/` (with its own copy of `engine/tween.js` at `legacy/pixel/engine/tween.js`). The root legacy files (`index.html`, `notes.html`, `slides.js`, `palette.js`, `engine/deck.js`, `engine/font.js`, `engine/particles.js`, `engine/sprites.js`, `tools/sprite-preview.html`) are then removed from their root locations — **except `engine/tween.js`**, which stays (see above). Root `index.html` is later replaced by the WP8 launcher.

### AMEND-2 · No git (supersedes §8.1 step 1, §8.2/§8.4 "one commit each")
The user has not asked for version control, so **do not run `git init` and do not commit**. Rollback is done with snapshots:
- Before starting any milestone or work package, snapshot ROOT:
  `rsync -a --exclude node_modules --exclude '*.mp4' --exclude _archive --exclude 'tools/regression/baseline*' ./ <scratchpad>/snapshots/<label>/`
- "Revert" means restoring the files you changed from your snapshot.

### AMEND-3 · Verified browser facts (Chromium via Playwright, file://)
`isSecureContext === true`; `showDirectoryPicker` and `showSaveFilePicker` exist; drawing a `file://` `<img>` taints a canvas (`getImageData` and `toDataURL` throw); `data:` images do not taint; `Function.prototype.toString` round-trips comments and template literals; `localStorage`, `BroadcastChannel`, `FontFace` all work. `MediaRecorder` does not support `video/mp4` in Playwright's Chromium (VP9 WebM works).

### AMEND-4 · Existing regression assets
- `tools/regression/golden.js` (deterministic: RAF stubbed via init script, `Math.random` = seeded mulberry32) and `tools/regression/diff.py` exist and were verified: two captures from `_archive/2026-10-13-stage-ready/cinema/index.html` are byte-identical (0/84 frames differ).
- `tools/regression/baseline-one-giant-leap/` (84 frames, 1280×720) was captured from `_archive` with that tool. Never edit it.
- The Playwright install lives at `tools/node_modules/playwright` (1.56.1); use `chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'] })` for GPU rendering. The headless shell (no GPU) is very slow for this engine.

### AMEND-5 · Scratch space
Screenshots, temporary captures and experiment files go under
`<scratchpad>/` (never inside ROOT, except committed baselines and fixtures named in the spec).

### AMEND-6 · N opens the presenter window without blocking the stage (supersedes the window.open call in §4.10 Keys) — RATIFIED by the lead, 2026-10-14
- N opens `location.href.split(/[?#]/)[0] + "?notes"` by dispatching a click with `shiftKey: true` on a temporary hidden `<a target="_blank" rel="noopener">` (a new-window link navigation), not `window.open(url, '_blank', 'noopener,popup,width=1200,height=760')`.
- Reason (measured by WP1-M6 and its verifier): in Chromium, `window.open` blocks the calling page until the new window exists — 52–216 ms per call in Playwright Chromium and Google Chrome 155, stage gaps 33–333 ms, failing WP1 acceptance #4 and stall.js. The link takes ≤ 19 ms.
- Unchanged: `window.opener === null`, own process, requires the key press's user activation, nothing opens with sync off.
- Accepted cost: the presenter window opens at the browser's normal window size, not as a 1200×760 popup.

### AMEND-7 · Player idle-time warm-up (adds to §4.10 boot; §4.5 step 9 unchanged) — RATIFIED by the lead, 2026-10-14
- In real time only (a real animation frame has run, manual clock off) and only until ready, the Player also calls `stage.warmTick()` from `requestIdleCallback({timeout: 250})` slices while `timeRemaining() > 6` ms (fallback `setTimeout` 50 ms). Never in manual-clock mode or with RAF stubbed, so golden runs, RNG counts and the `Stage.tick` order are unaffected.
- Reason: §4.15 ready ≤ 3 s. Tick-only warm-up gave ready 2.5–3.4 s on the M2; with idle slices 1.02–1.15 s.

### AMEND-8 · Console errors from optional manifest modules (clarifies §3.2)
- Until WP2–WP5 land, each optional (flag 0) MANIFEST entry whose file is absent logs one `ERR_FILE_NOT_FOUND` console error. This is expected and is not a failure of "zero console errors" checks; those checks mean zero page errors and zero console errors other than missing optional modules. Once all files exist, the release step flips every MANIFEST flag to 1 and the deck must load with zero console errors of any kind.

### AMEND-9 · Product direction (2026-10-14)
- The user will rebuild their real talk deck from scratch; the current One Giant Leap scenes were a capability demo. `decks/one-giant-leap/` stays as the engine's regression fixture and the Studio's read-only sample; nothing changes for the build. The user's new deck will be added later as its own `decks/<id>/` folder.

### AMEND-10 · Storyboard placeholders and the WP5 #3 acceptance (lead, 2026-10-14)
- §5 seeds intentionally contain two kinds of `{…}`: **story tokens** (`{brand} {tagline} {bigIdea} {shortIdea} {oldWay} {newWay} {ask} {audience} {proof1..3}`) and **prompts for the author** (e.g. `{opening line}`, `{a big number}`, `{milestone}`), which exist precisely so the Storyboard step asks the author to write those lines.
- WP5 acceptance #3 third bullet is therefore restated: *with all story tokens answered, no story token remains unreplaced in any generated scene; author prompts remain and each yields a `copy.placeholder` finding (that is the Director telling the author what is left to write). With tokens blank, token placeholders remain as well.* The board must never invent copy to silence the rule (P9).
- §6.5 step 4 refinement (ratifying WP5's change): when a beat receives several scenes, the board may rotate through the beat's eligible templates (first scene uses the first eligible template, later scenes the next eligible ones) so a beat isn't the same shot repeated; proof-role overrides still apply first.

### AMEND-11 · Ownership exception for the theme-list unit test (lead, 2026-10-14)
- `tools/test/specs/wp1-theme.test.js` asserts the registered theme list is exactly `['cosmos','one-giant-leap']`, which became false when WP3 legitimately added `slate`. The integration step may change that assertion to "contains `cosmos` and `one-giant-leap`, and every registered theme resolves". No other WP1 file may be edited by integration except for proven core bugs (re-run the EXACT gate after any such fix).
- Documented minor deviations accepted as-is unless a later review finds user-visible harm: WP4 `three-points` spacing for 4–5 items, `hyperspace` sizing on long first lines, extra `validate.*` codes, `image` cover mode dimming the cosmos layers; WP3 slate style factors; WP2 MANIFEST-trim script in the export (keep it, and document it in docs/export.md).
