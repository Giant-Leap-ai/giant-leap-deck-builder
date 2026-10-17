# Pixeldeck v2 review: what will go wrong in proposals A (engine/format), B (studio UX) and C (story backbone)

I checked the claims against the code in `cinema/` and against Playwright Chromium 1.56 runs on `file://`. All tests were read-only. The decks were loaded from `_archive/2026-10-13-stage-ready/cinema`, and nothing in the project was modified.

## Verified facts

| # | Fact | What it settles |
|---|---|---|
| F1 | **Pressing N puts the presenter window on the stage's main thread.** `Show.openNotes` uses `window.open` with an opener. A 700 ms busy loop in that popup stalled the stage's frames by 682 ms. Opened with `noopener`, or as a separate tab, the stall was 19 ms. | Main-thread sharing is real |
| F2 | **Real deck, first pass with notes opened by N:** the worst frame gaps were 335 ms at 4.0 (out of warp into the galaxy, with the flash), 117–133 ms at 3.1, and 50–68 ms at 2.0, 4.1 and 5.0. A second pass was clean except two 35 ms frames. With notes opened as a separate tab, every state stayed at 19 ms. | The stalls are first-time Earth, galaxy and nebula texture generation and glyph caching inside the notes window. Those costs land on the stage. |
| F3 | **`about:blank` + `document.write` from a `file://` page:** writing and drawing into it works, but it runs on the same thread (585 ms stall). **`blob:` windows:** separate thread, but BroadcastChannel does not connect (the blob page has a `null` origin). **Two `file://` windows:** separate thread with `noopener`, and BroadcastChannel works. **Direct DOM access** to another `file://` popup throws SecurityError. | Rules out A's exported-notes design (see C1) |
| F4 | BroadcastChannel messages and localStorage `storage` events crossed between `file://` pages in different folders. IndexedDB works. `self.origin` is `"null"` and `location.origin` is `"file://"`. | B's cross-talk claim is correct, and it already applies to `_archive` vs `cinema/` |
| F5 | **Tainting:** an image from a `file://` path taints the canvas (`getImageData`, `toDataURL` and `captureStream` all throw SecurityError). `data:` PNGs, `blob:` URLs and SVG data URLs (even with `foreignObject`) stay clean. An SVG with only a `viewBox` reports a natural size of 300×75. | Asset pipeline rules (H4, M5) |
| F6 | **Platform checks:** `fetch` of a local file fails. `isSecureContext` is true. `showDirectoryPicker` is allowed: in headless it gave AbortError, not SecurityError. `CompressionStream('deflate-raw')` works. `toString()` returns the exact source, comments included. | Confirms A's and B's assumptions |
| F7 | **Determinism:** seeded and manually clocked, both software (`toDataURL`) and GPU (Metal screenshot) runs were bit-identical across two runs (14/14 frames, 23,605 RNG calls each). | A's premise that "readback forces software, which is what makes it deterministic" is wrong, and the GPU path does not need it |
| F8 | A thumbnail `still()` in a warm notes window costs 1–22 ms. Slides 9 and 10 are the heaviest (particles), not the Earth slides. | Corrects B's cost estimate |
| F9 | **Golden tooling that already exists:** `tools/regression/golden.js` (GPU screenshots at 1280×720), `diff.py` (tolerance-based), and an 84-frame baseline captured today. Proposal A designs a different harness and doesn't mention these. The backup video lasts 2:51. | Duplicate harness (M1); runtime question (H9) |

Experiment scripts: `<scratchpad>/exp/{run.js,notes_hitch.js,notes_hitch2.js,determinism.js,blob.js}`

## Issues, ranked by severity

### Critical: tomorrow's talk

**C1. The presenter window stalls the live deck (F1, F2).**
- **Problem:** pressing N gives freezes of about a third of a second at the out-of-warp galaxy reveal on the first run-through.
- **Fix for Wednesday, no code change:**
  - Open `notes.html` on its own (double-click it, or open it in a new window) instead of pressing N. The README already supports this, and it measured 0 stalls.
  - If N must be used, do one full run-through with both windows open before the audience arrives, and don't reload either window.
  - On the presenting Mac, check with the F overlay at 3.1 and 4.0, and confirm in Chrome's Task Manager that stage and notes are separate processes.
- **For v2:** reject A's exported-notes design (main window writes the notes page into `about:blank` and draws its thumbnails), because it guarantees same-thread stalls.
  - Notes become the same file opened as `?notes` with `noopener`, synced over BroadcastChannel.
  - Thumbnails are rendered once, in idle slices, when the notes window opens, then cached.

**C2. Any file move before the talk breaks the live deck.**
- **Problem:** `cinema/index.html` and `notes.html` load `../engine/tween.js` from the legacy engine. Two plans touch that folder:
  - A's M1 moves the legacy deck into `legacy/pixel/`.
  - A and B both put the new engine at `engine/`, the same folder the legacy engine uses now.
  - Either way, `Ease` and `Timeline` go missing and the stage boots to a black screen.
- **Fix:**
  - Nothing in `pixeldeck/` moves until after the talk. v2 starts Thursday, or in a separate copy or worktree.
  - Lock one presentation path. A says the archive; B says the frozen `cinema/`. Use whichever the user rehearsed with, and keep the other copy and the MP4 as fallbacks.

**C3. Two open copies of the deck drive each other (F4).**
- **Problem:** `_archive/.../cinema` and `cinema/` share the channel name `pixeldeck-cinema` and the storage key `cinema:msg`. With both open, one notes window advances both stages, and its display flips between them.
- **Fix for Wednesday:** quit Chrome and open exactly one deck plus its notes.
- **For v2:**
  - Name the channel per deck: `pixeldeck:<deckId>`.
  - Add a per-stage instance id to state messages.
  - The notes window binds to the first stage that answers and warns if it hears a second one.
  - Never reuse the old channel or key names.

### High: v2 design

**H1. A's M1 will throw ReferenceErrors as written.**
- **Problem:** wrapping the engine files in `PD.module` makes their globals local. A's compat list (`U col COLORS DW DH CX CY Ease Timeline`) misses most of the names other files use. Also, `scenes.js` assigns `DECK = [...]` with no `var`, so strict mode would throw.
- **Fix:** re-export every top-level name, and never add `'use strict'` to the wrappers. The full list:
  - **util.js:** `DW DH CX CY U COLORS col`
  - **fx.js:** `Glow FX`
  - **space.js:** `NEBULA_PRESETS Space`
  - **earth.js:** `Earth`
  - **particles.js:** `Shapes Field`
  - **type.js:** `FONT STYLES TextLayer`
  - **stage.js:** `WORLD_DEFAULTS Stage Sync Show`
  - **from tween.js:** `Ease Timeline`

**H2. Global state breaks a studio with several stages on one page.**
- **Problems:**
  - Nebula textures are cached by preset name only. B's palette variants, or two themes defining `aurora` differently, would show stale nebulae.
  - B's `Look.apply()` mutates `STYLES`, `FONT` and `NEBULA_PRESETS` globally.
  - Glyph bitmaps are cached by spec object only, so they go stale after a font drop or a theme change.
  - `Show` listens to keys on the whole window. In a studio form, typing a space advances the preview, `b` blacks it out and `f` toggles the FPS overlay.
  - `Show` rewrites the URL hash and acts on `hashchange`, sizes from `window.innerWidth`, and whichever stage boots last owns `window.PixelDeck`.
- **Fix:**
  - Resolve the theme per stage and pass it into `TextLayer` and `Space`.
  - Cache keys include a hash of the palette, theme and font.
  - Split a pure `Stage` from a `Player` that owns input, hash, HUD, sizing and `window.PixelDeck`. In the studio these default to off or to the container size.
  - The key handler ignores input, textarea and contenteditable targets.

**H3. Logo and image particles silently lose part of the shape.**
- **Problem:** `Field.MAX` is 9000 and `spawn()` returns null when it's full. `morph` drops those targets, and because they come last in curve order, one region of the logo goes missing. Particles that are still exiting count toward the limit.
- **Fix:**
  - The image shape picks its sampling stride automatically to fit a budget, for example 3,500 per shape and 8,000 live in total.
  - The validator warns when a scene would exceed it.
  - Glow sprites for the image's palette are pre-built during warm-up. Otherwise only 6 new sprite colours are built per frame, so colours visibly pop in.

**H4. A hand-authored image path taints the canvas and freezes the deck.**
- **Problem:** `getImageData` would throw inside `Stage.enter` before `cur` is updated. Every later click retries the same failing state, so the deck is stuck. The `captureStream` recorder also fails.
- **Fix:**
  - Assets come only through `PD.assets`, as `data:` URLs or blobs (F5).
  - `PD.validate` treats any other image source as an error.
  - Particle sampling is wrapped in try/catch and falls back to a fade reveal.

**H5. A's asynchronous boot can hang on a black screen.**
- **Problem:** if `img.decode()` or `FontFace.load()` never settles, the stage never boots.
- **Fix:** each asset's load is caught, there is a roughly 3 s overall timeout, and boot always proceeds and draws.

**H6. "Textures built lazily" (A) brings back first-appearance stalls.**
- **Problem:** F2's 335 ms stall is exactly these first-time generation costs.
- **Fix:**
  - At boot, warm everything the compiled deck references: nebula presets in use, galaxy, Earth, glyphs and particle targets.
  - Expose `PixelDeck.ready`.
  - Never generate during a transition.

**H7. Three sources of truth for the deck and its story metadata.**
- **What each proposal does:**
  - A puts `meta` and `scene.beat` in `deck.js`.
  - B uses `.pixeldeck.json`, `story.json`, localStorage and IndexedDB, and a `PD_ASSETS` global.
  - C uses a `STORY` global in `story.js`, keyed by scene id.
- **Problem:** `.json` sidecars can't be loaded by a `file://` deck, so notes or dwell stored there never reach the player.
- **Fix:**
  - One `DeckSource` object (`meta.story` plus scenes `{id, beat, template, props, notes, steps[].notes, dwell, overrides}`) in `deck.js` via `PD.deck`, and `PD.assets` in `assets.js`.
  - The exported HTML embeds the same JSON between markers, so the studio re-opens it by parsing, not by running it.

**H8. B's "code scenes" can't be built.**
- **Problem:** B wants each hand-written scene's source text, sent over `postMessage` and evaluated. The OGL scenes depend on file-level helpers (`W`, `HORIZON`, `BELOW`, `curveXY`, `curvePoints`, `leap`). There is no JS parser to cut one scene out of a file, and `toString` can't isolate a single array element.
- **Fix:** in v1, hand-written decks are opaque. The studio shows them read-only (storyboard, checker and notes view) and never rewrites them.

**H9. The three proposals collide on names and values.**
- **Beats:** A has 8 generic beats. B has a fixed set of 8 (`hook, context, tension, turn, vision, proof, ask, close`). C has framework-specific beat ids with 14 roles.
- **Energy:** 0–5 in B, 1–5 in C. Default energies also differ: pivot is 4 in B and 5 in C.
- **Template ids:**
  - The same template has different ids, e.g. `warp` / Hyperspace / `hyperspace`, `breakout` / The box / `the-box`, `logo` / Logo reveal / `asset-reveal`.
  - `question`, `before-after` and `cta` exist only in C, so C's frameworks suggest templates that A doesn't define.
  - `points` is both a template name and a shape name.
- **Runtime:**
  - OGL's length: A sets `durationMin: 3`, C sets `targetMin: 9`, and the video is 2:51. C's runtime rule would mark the loved deck as an error.
  - Speaking pace: 140 wpm vs 150.
  - Scene length: one scene per 50 s vs per 60–90 s.
  - There are three different runtime models.
- **Fix:**
  - One template catalogue, with a unit test that every template a framework names exists.
  - Energy 1–5.
  - One duration field, `meta.story.targetMin`. Ask the user for the real talk slot.
  - One runtime formula: the larger of (animation time from `PD.timing` plus dwell) and (notes words ÷ wpm), summed over states.

**H10. Scope creep.** Together the proposals add up to:
- 6 worlds, 5 element kinds, 10 shapes, 18 templates and 7 frameworks
- about 40 checker rules and a 7-step wizard
- rehearsal analytics, preflight, versions, zip export, folder export with an engine copy, and code import
- 9 refactor commits, each required to be pixel-identical, before any feature

Recommended cut is in decision 10 below.

### Medium

**M1. Two golden harnesses.**
- **Problem:** A's new harness (software rendering, 1920×1080, zero differing pixels) ignores the existing `tools/regression` harness and baseline (F9).
- **Fix:** extend the existing harness:
  - SHA-1 compare first, then the tolerance report.
  - Assert the RNG call count matches.
  - Add notes-thumbnail stills and a check for stalls caused by the notes window.
  - Take the baseline from `_archive`.
  - Force software rendering with `--disable-gpu` if software is wanted, rather than relying on readback.

**M2. "Zero differing pixels" only survives mechanical moves.**
- **Problem:** changing floating-point order (for example a precomputed camera matrix, or different save/restore nesting) or the order of `Math.random` calls changes pixels. Watch Sync's load-time random id, the shake jitter, and `Field.make`.
- **Fix:** use the exact gate for M1–M5. For the `_parity` deck, accept settled-state frames within tolerance, so generic templates don't have to expose every OGL knob.

**M3. Exporter escaping and missing-variable errors.**
- **Problem:** user strings (notes, titles, asset names) inserted with `JSON.stringify` can contain `</script>` or `<!--`. Separately, a factory that refers to a variable outside itself only fails at runtime, possibly on stage.
- **Fix:**
  - Escape `<` as `\u003c` in all embedded JSON.
  - After export, load the file in a `srcdoc` iframe, compile it and render a still of every scene.

**M4. Memory and work grow during an editing session.**
- **Problem:** `shapeBySpec` grows forever, and `tick()` updates every shape ever created.
- **Fix:**
  - Update only the shapes that are in use. Shape updates depend only on time, so this is pixel-safe.
  - Make `layerBySpec` a WeakMap.
  - Give `setDeck(compiled, {changed})` defined cache-eviction semantics.

**M5. Logos and fonts.**
- **SVG logos:** an SVG with only a `viewBox` reports 300 px wide, so B's "rasterise at 2×" gives a blurry logo. Rasterise from the `viewBox` at the target pixel size.
- **Fonts:**
  - Avenir Next exists only on Macs.
  - The exporter warns when the theme's fonts aren't embedded.
  - Generic themes ship an embedded open-licence font.
  - OGL keeps Avenir.

**M6. C's language rules can't be checked offline.**
- **Problem:** "must contain a verb", "must start with a verb", and `{bigIdeaShort}` (first six content words) can't be done reliably without a language model. Auto-truncation produces awkward on-screen text.
- **Fix:** ask the speaker for an explicit short tagline. Demote the verb rules to hints with a small list of imperative verbs.

**M7. Three checkers will disagree about OGL.**
- **Problem:** B's Director, C's lint rules and A's `PD.story.check` would give OGL different verdicts. B's rule 1 (the one sentence is missing from the Close) and rule 10 (ends on a different look) both flag OGL.
- **Fix:** one checker, C's rule set plus B's unique rules. OGL is the calibration fixture: no errors and a score of at least 90.

**M8. Export formats.**
- **Problem:** B's folder export copies the engine into each deck folder, which drifts out of date and conflicts with A's `../../engine/` paths. A zip writer adds scope.
- **Fix:** v1 exports two things: one self-contained HTML file, and `deck.js` + `assets.js` downloads. The File System Access API is only a Chrome convenience for saving the project.

**M9. Thumbnail rendering in the studio.** Use one offscreen thumbnail `Stage`, render at most one thumbnail per idle frame (they cost up to 22 ms each), and cache them as bitmaps keyed by a hash of the scene.

### Low

- The `document.write` loader can silently skip a missing file. After loading, it should check every expected module registered and show the missing ones on screen.
- The planned redirect in `cinema/` would lose `#7.3`. Use `location.replace(newPath + location.hash)` instead.
- A's `studio` world plugin has the same name as the Studio app. Rename the plugin to `backdrop`.
- A's "2 ms per plugin" rule is already broken by the planet (about 9–10 ms). Scope the rule to new plugins.
- Opening a rehearsal presenter window from the studio has no clean channel:
  - A `blob:` window can't use BroadcastChannel.
  - `about:blank` shares the studio's thread.
  - In v1, rehearse in-studio fullscreen, or rehearse with the exported file.

## The 10 decisions the synthesis must lock

1. **Wednesday protocol.**
   - Freeze `pixeldeck/` until after the talk, and name the one presentation path.
   - Open notes on its own (not with N) and do one full warm run-through.
   - Run only one deck. Have the MP4 ready.
2. **Folder layout and names.**
   - Legacy moves to `legacy/pixel/` first. Then `engine/`, `themes/<id>/`, `decks/<id>/` (OGL plus its `theme.js`), `studio/index.html` and `tools/`.
   - One name for the style concept: theme in code, "Look" in the UI.
3. **The one canonical deck format.** A `DeckSource` JSON object in `deck.js` via `PD.deck`, with assets in `assets.js` via `PD.assets` as `data:` URLs. Notes stay on scenes and steps. No JSON files at runtime.
4. **Engine API boundary.**
   - `Stage(canvas, {deck, theme, thumb})` with defined `setDeck` eviction.
   - A `Player` with options for input, hash, HUD, sync and container sizing, plus editable-target filtering.
   - Only the `Player` sets `window.PixelDeck`.
5. **Module and export mechanism.**
   - `PD.module` with `toString` export.
   - The full compat list, and no strict mode during migration.
   - Lint, escape `<` in JSON, and the export self-test.
6. **Theme model.** Values only and resolved per stage. Every cache key includes a hash of the theme, palette and font. No global mutation.
7. **Story model.**
   - The framework schema with beats and roles.
   - Energy 1–5 and `meta.story.targetMin`.
   - One runtime formula, one checker, and OGL as the calibration fixture.
   - The v1 frameworks: `giant-leap`, `sparkline`, `psf`, `scqa`, and blank.
8. **The v1 template catalogue.** Ids, props schema, beats, energy and talk-time per template, with a test that every framework's template references exist. Suggested set: the 10 OGL-derived templates plus `statement`, `big-number`, `quote`, `three-points`, `logo` (particles) and `image`.
9. **Presenter architecture and sync.**
   - Notes run in their own window: `notes.html` opened with `noopener` in a deck folder, `?notes` in the exported file.
   - Thumbnails are precomputed.
   - Channel `pixeldeck:<deckId>` plus a stage instance id, with a warning when more than one stage answers.
10. **Regression gate and v1 scope.**
    - **Gate:** extend `tools/regression` with the baseline from `_archive`, an exact plus tolerance compare, the RNG count, a perf check, and a check that opening notes causes no stalls.
    - **v1 scope:** one non-space theme next to cosmos; the guided brief and framework choice; storyboard; forms with live preview; asset drop (logo, photo, font) with the particle budget; the checker; autosave plus project save/open; single-HTML export.
    - **Deferred:** the photo world's blur crossfade, bars and line charts, the grid world, rehearsal analytics, versions, zip and folder export, code-deck import and editing, preflight mash test, and logo palette extraction.