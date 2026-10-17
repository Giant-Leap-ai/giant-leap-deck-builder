# PixelDeck Studio: Author-Experience Design

*Lens: studio UX. Scope: a guided, offline tool for building any pixeldeck. One Giant Leap (OGL) becomes one deck among many.*

---

## 0. Ground rules

1. **The Studio is a deck-building tool, not a slide editor.** People bring a talk idea and leave with a story. They pick slides only after they know what each moment has to do.
2. **The preview is the real engine.** Every thumbnail and preview comes from a real `Stage` instance, as `notes.html` already does with `new Stage(cv, {thumb:true}).still(si, step)`. Nothing in the Studio is a mock.
3. **The Studio compiles to the same `DECK` array that `scenes.js` uses.** Templates are functions that produce raw scene objects. Anything the Studio makes can be "ejected" to code, and code decks can be storyboarded.
4. **Tomorrow's talk is untouchable.** No Studio work touches `cinema/` or `_archive/` before Thursday.

### Checked against Playwright's Chromium, opening a test page from file://

| Fact | Result | Design consequence |
|---|---|---|
| `isSecureContext` | `true`, origin `"file://"` | `crypto.subtle`, `CompressionStream` and `FontFace` all work |
| `showDirectoryPicker` / `showSaveFilePicker` | present (needs a user gesture; not invoked here) | Folder export and ⌘S-to-file are possible in Chrome. A fallback is still needed for Safari and Firefox. |
| `localStorage` | **shared across every file:// page, in any folder** | Studio keys must be namespaced. The engine's `cinema:msg` key and the `pixeldeck-cinema` BroadcastChannel will **cross-talk** between a Studio preview, a rehearsal and another open deck. The channel needs a per-deck name. |
| IndexedDB | works | Store asset blobs here, not in `localStorage` (5–10 MB quota) |
| `<img src="x.png">` from file:// | **taints the canvas** (`SecurityError`) | Every asset is held and exported as `data:` URLs or blobs |
| `fetch` of local files | fails | The Studio reads files only through drop, `<input type=file>` or the File System Access (FSA) API |

---

## 1. What the user sees on disk

```
pixeldeck/
  Studio.html                ← double-click to make a deck
  engine/                    ← generic cinematic engine (today's cinema/engine + tween.js)
  looks/cosmos/              ← a "look": styles, nebula palettes, scene templates
  decks/
    one-giant-leap/          ← hand-authored (today's cinema/ moved here, unchanged)
    legacy-8bit/             ← original pixel engine
    my-new-talk/             ← Studio export: index.html, notes.html, deck.js, assets.js, story.json
  _archive/                  ← frozen, never touched
```

**Look** is the user-facing word for theme plus template pack. OGL's cosmos becomes the first look. The 8-bit engine could later become a second one.

---

## 2. The model: Story → Beats → Scenes → Engine

```
Project
 ├─ brief: audience, belief-before, belief-after (the "one sentence"), duration, memorable moment
 ├─ arc: shape id + target energy curve
 ├─ look: look id, palette variant, accent colours, font asset
 ├─ assets[]: {id, kind, name, dataURL/blob hash, derived: palette, particle points}
 └─ scenes[]: {
      beat: 'hook'|'context'|'tension'|'turn'|'vision'|'proof'|'ask'|'close',
      point: "the one thing this scene says",           ← required, drives guidance
      energy: 0–5 (auto from template, user can drag),
      kind: 'template' | 'code',
      template: 'pivot', fields: {...}, overrides: {world:{...}, motion:{...}},
      code: "{ id:'leaps', world: W(HORIZON,…) … }",    ← only for code scenes
      notes, stepNotes[], dwell
    }
```

Each scene sits at one of three **ejection levels**. Every scene card shows a small badge for its level:

1. **Template.** Form-driven only.
2. **Tuned.** The form plus an "Advanced" panel of world and motion overrides, merged on top of the template output. Still regenerates when the form changes.
3. **Code.** A raw scene object or JS. The Studio still handles order, beat, energy, notes and preview, but the content is edited as text. Moving to Code is one-way, with a confirm, and the Tuned version is kept as an undo point.

---

## 3. The guided flow

A **progress rail** runs across the top: `① Story · ② Arc · ③ Look · ④ Assets · ⑤ Scenes · ⑥ Rehearse · ⑦ Export`. Each step shows a check when its "done when" condition is met. Steps are never locked, so experts can jump straight to ⑤. The main call to action is always "Next: …".

### Screen 0: Welcome

```
┌─────────────────────────────────────────────────────────────┐
│  PIXELDECK STUDIO                                           │
│  [ + New deck ]   [ Open project file… ]                    │
│  Continue: "Q4 Board Story" · autosaved 3 min ago           │
│  Samples: [One Giant Leap ▸]  (template-built replica)      │
│  [ Import a hand-written deck.js… ]                         │
│  ⓘ Autosave lives in this browser only. Your project file   │
│    is the real save.                                        │
└─────────────────────────────────────────────────────────────┘
```

The background of this screen is a live cosmos `Stage` that slowly assembles "PIXELDECK" in particles.

- **Empty state** (no autosave found): "Nothing saved in this browser yet. Start a new deck, or open a `.pixeldeck.json` file."

### ① Story brief

Five questions, one per panel. The answers are big text with no forms feel.

1. Who is in the room?
2. What do they believe or do today?
3. When you finish, what should they believe or do? This is the **one sentence**, and it is required.
4. How long do you have? (5 / 10 / 20 / custom)
5. What is the single moment they should remember tomorrow?

The answers turn into a **logline** at the top of every later screen:

> *For ops leaders who see AI as headcount reduction, this talk shows AI as augmentation, so they pilot one human-centred use case.*

- **Done when:** questions 3 and 4 are answered.

### ② Arc

The user picks a story shape. Each option is drawn as an energy curve with beat chips under it.

- **Zoom out, come home.** Cosmic → personal → future. This is OGL's shape.
- **Problem → Turn → Vision.**
- **Then / Now / Next.** A timeline.
- **What is / What could be.** Alternating contrast, which suits persuasion.
- **Blank.**

Choosing a shape fills the storyboard with **placeholder cards**. Each has a beat, a prompt and a suggested template. For example:

> HOOK: "One image or line that makes them lean in. Suggested: Spark, Big statement."

The number of placeholders is sized to the chosen duration, at about one scene per 60–90 s.

### ③ Look

A grid of look and palette variants: Cosmos/Aurora, Cosmos/Dawn Gold, Cosmos/Ember, Cosmos/Mono.

- **Brand colours:** either "Pull colours from my logo", which samples the dropped logo's data URL into a palette, or hex fields for accent 1 and 2.
- **Font:** Avenir Next is the default. A dropped `.woff2`/`.ttf` is loaded with `new FontFace(name, arrayBuffer)`.
- **Live preview:** the user's title in the Brand Reveal template, re-rendered as they change settings.
- **Note:** `STYLES` and `FONT` are globals. The look thumbnails are therefore rendered one after another with a fresh `Stage` each, then cached as bitmaps.

### ④ Assets

See §7. The guidance here is "You can skip this and add assets any time."

### ⑤ Scenes

The main workspace (§4), where each placeholder is filled in.

- **Done when:** no placeholders remain and the Director has no red flags.

### ⑥ Rehearse and ⑦ Export

See §9 and §10.

---

## 4. Main workspace (step ⑤)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Studio  "Q4 Board Story" ▾   ①✓ ②✓ ③✓ ④✓ ⑤● ⑥ ⑦          Saved ✓  ⌘S  ⤓Export │
│ For ops leaders who … so they pilot one human-centred use case.                   │
├──────────┬──────────────────────────────────────────────────────┬─────────────────┤
│ ASSETS   │  ┌──────────── PREVIEW (real Stage, 16:9) ─────────┐ │ DIRECTOR        │
│ ▣ logo   │  │                                                 │ │ ⚠ 3 calm scenes │
│ ▣ team   │  │        NOT AUTOMATION.                          │ │   in a row      │
│ Aa Brand │  │                                                 │ │ ✎ 18 words on a │
│ + drop   │  └─────────────────────────────────────────────────┘ │   hero line     │
│          │  ▶ Play in  ⟲ Replay  ◀ step ●●○ ▶  ▢ safe area  ⛶   │ ✓ Turn lands at │
│          ├──────────────────────────────────────────────────────┤   62% — good    │
│          │ PIVOT · beat [TURN ▾] · point: "augmentation, not…"   │─────────────────│
│          │ Kicker   [The next leap          ]                    │ INSPECTOR tabs: │
│          │ Old word [Not automation.        ] 15/16 chars        │ Content·Sky·    │
│          │ New word [Augmentation.          ] 13/16 chars        │ Motion·Notes·   │
│          │ Subtitle [Technology that makes …]                    │ Advanced        │
├──────────┴──────────────────────────────────────────────────────┴─────────────────┤
│ energy 5 ┤        ╭╮                         ╭──╮          ·· target arc          │
│        0 ┤──╮╭───╯ ╰──╮____╭─╮___╭──────────╯  ╰────╮      ── your deck           │
│ [HOOK][HOOK][CONTEXT][CONTEXT][TENSION][PROOF][TURN][VISION][ASK][CLOSE]  [+]      │
│  ▓▓▓   ▓▓▓    ▓▓▓      ░░░      ▓▓▓     ▓▓▓   ▓▓▓   ▓▓▓    ░░░   ▓▓▓  est 11:20/10:00│
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Storyboard filmstrip

**Cards** show:
- a live thumbnail from `still(si, lastStep)`
- step pips: one per click
- a beat colour band
- the "point" line
- an ejection badge
- red/amber dots for Director flags
- ✓ when filled in, or a dashed outline and prompt when still a placeholder

**Thumbnail cost:** render lazily, one per idle frame, and key each by a hash of the compiled scene so edits only re-render the cards that changed. Earth scenes cost about 10 ms each at full size and much less at 480×270.

**Interactions:**

| Action | Result |
|---|---|
| Drag a card | Reorder. A ghost card plus an insertion line. The energy curve redraws live. |
| ⌥-drag | Duplicate |
| Hover the gap between cards | "+": insert a scene with the template picker pre-filtered by neighbouring beats |
| Right-click | Duplicate · Change template (fields carry over by name) · Eject to code · Delete (undoable) |
| Drag an energy point | Override the auto energy |
| Click a pip | Preview that step |

**The energy curve and target arc:**
- Each template has a default energy: Warp 5, Brand reveal 4, Sunrise 4, Pivot 4, Statement 2, Quote 2, Timeline 3.
- The arc picked in ② draws a dotted target curve.
- A runtime estimate is computed per scene: animation time + dwell + notes word count ÷ 150 wpm. It shows as a bar under each card and as a total against the target duration.

**Beat lanes (optional view):** toggle "Group by beat" to see collapsible sections of cards per beat. This makes "Act 2 is 60% of the talk" visible at a glance.

---

## 6. Scene editing

### Template picker

A modal grid of animated mini-previews. It is filtered by the selected beat ("Good for a TURN") and has an "All" tab.

The Cosmos look ships OGL's scenes generalised as templates:

| Template | Fields | Derived from OGL |
|---|---|---|
| Spark cold open | one line | `spark` |
| Brand reveal | title (particles), tagline, logo? | `title` |
| Hyperspace | 1–3 scale lines (one per click) | `warp` |
| Galaxy + "you are here" | statement, marker label | `galaxy` |
| Fly home | kicker, statement, region (Americas/Europe/Asia → `earthRot`) | `home` |
| Sunrise | kicker, emotional line | `sunrise` |
| Milestones | heading, N × (year, label), last one highlighted | `leaps` |
| The box | idea line, escape word, subtitle | `box` |
| Pivot "Not X. Y." | kicker, old, new, subtitle | `next` |
| Finale | title, thanks | `thanks` |
| **New:** Big statement, Big number, Quote, Three points (per click), Logo reveal, Image hold | — | — |

### Form rules

- **Text fields:**
  - **Character budget:** the real `TextLayer.layout()` measures width against `maxWidth`. Overflow shows red: "Too wide for Hero; try Title or shorten".
  - **Word-count chip:** turns amber above 12 words on statement styles.
- **Sky tab:**
  - **Look:** nebula preset swatches plus a Calm / Drift / Hyperspace "speed" control.
  - **Earth and sun:** shown only for templates that use them.
- **Motion tab:** Pace = Gentle / Normal / Punchy. This maps to `dur`, `spread`, `ease` and `stagger`.
- **Position:** presets (Centre / Upper third / Lower third / Left column / Right column) map to x/y/align. Drag-on-canvas comes later.
- **Notes tab:** per scene and per step. Each note shows the time it will take to speak.
- **Advanced tab:** sliders for the world values grouped as in the README table, plus an "Open as code" button.

### Live preview behaviour

| Trigger | What runs | Purpose |
|---|---|---|
| Field edit (debounced 250 ms) | recompile that scene only → `enter(si, step, 'settled')` | Quick look |
| ▶ Play in | `enter(prev, lastStep, 'instant')` then `enter(si, 0, 'live')`, the same as `Show.replay` | Shows the real transition in from the previous shot |
| Click pips | Jump between steps | |
| Safe-area overlay | Draws a 5% title-safe box, the letterbox bars and text bounding boxes | |

**Spec identity:** keep spec objects stable for scenes that did not change. `layerBySpec` and `shapeBySpec` are keyed by object identity. That gives free cache invalidation for edited scenes, but it also leaks memory over a long editing session. Recreate the preview `Stage` every ~200 edits.

---

## 7. Asset library

Drop anywhere in the window, or click "+". Each asset card shows a thumbnail, its size and **"Use as…"** chips.

| Asset | Accepted | Processing | Uses |
|---|---|---|---|
| Logo | PNG, SVG | SVG rasterised at 2×; alpha-thresholded into particle target points; palette extracted | Logo reveal (particles assemble the mark), brand colours, corner bug on the Finale |
| Photo | PNG, JPEG, WebP | Downscaled to 2560 px on the long edge; stored as a blob | Image hold (framed with glow, slow push-in), Milestone images later |
| Font | woff2, woff, ttf, otf | `FontFace` from ArrayBuffer; text bitmaps wait for `font.load()`, otherwise fallback glyphs get cached | Look font, or per-style override |
| Data (later) | CSV | — | Big number, chart scene |

Everything is held as blobs in IndexedDB and exported as `data:` URLs, so canvases are never tainted.

**Errors:**

| Problem | Message |
|---|---|
| HEIC, PDF or video | "Can't use .heic yet. Export it as PNG or JPEG." |
| Image over 8 MB | "Downscaled to 2560 px (was 6048 px)" |
| Logo with an opaque background | A particle preview shows a rectangle, plus "Your logo has a solid background; particles will draw a box. [Use luminance instead] [Remove white]" |
| Font fails to parse | "Couldn't read this font; using Avenir Next." |

**Empty state:** three illustrated slots (Logo · Photos · Font) with one line each saying what they unlock.

---

## 8. Director: the guide panel

The Director is rule-based and offline, so it is deterministic. It shows three things:
- **Context tips** for the current step: beat prompts, and examples from the OGL sample.
- **Flags**, each with a "Show me" link that selects the card.
- **A story health line**, for example "10 scenes · 11:20 est. · peak at 62% · ends on the one sentence".

MVP rules:

1. The one sentence (brief Q3) appears nowhere in the Close or Ask scene text or notes.
2. There is no TURN beat, or the turn falls before 40% or after 85% of the runtime.
3. Three or more consecutive scenes sit at energy ≤ 2 ("the room will drift").
4. Two hyperspace or flash scenes in a row ("spectacle fatigue").
5. A scene has no "point".
6. Text exceeds the style's budget or the safe area.
7. The runtime estimate is more than 15% over the target duration.
8. A scene has no notes and more than 2 steps.
9. A particle-reveal headline is followed by another within 3 s (they compete).
10. The deck ends on a different look than it opened with. This is only a nudge: OGL's sunrise bookend works because of it.

Flags are dismissible per card, using "Intentional".

---

## 9. Rehearsal mode (⑥)

- **This screen only:** fullscreen preview with a notes strip overlay that can be toggled.
- **Presenter view:** the stage plus notes window, exactly as in a live deck.
  - **Needs a per-deck Sync channel:** `pixeldeck:<deckId>`, instead of today's shared `pixeldeck-cinema`.
  - **Code scenes:** the compiled deck goes over `postMessage`; code scenes travel as source text and are evaluated in the stage window.
- **During the run:**
  - A per-scene stopwatch.
  - **M** drops a "fix this" flag on the current scene, which appears as a red pip on its card.
  - **Clicker test:** shows the key received (PageDown, etc.).
- **After the run:** a pacing chart of planned vs actual time per beat, e.g. "Context ran 3:10 vs 1:30 planned". The user can "Apply actuals as dwell" so the video recorder's timing matches.
- **Preflight button:**
  - Plays every scene settled for 30 frames, records milliseconds per frame, and flags anything over 12 ms ("Earth + logo reveal: 14 ms; consider lower particle density").
  - Runs a mash test: 40 rapid clicks to confirm no desync.

---

## 10. Export (⑦)

A **pre-export checklist** runs first: compile all scenes, fonts embedded, no red flags, total size, engine version stamp. Then three cards:

1. **Deck folder** (Chrome: `showDirectoryPicker`, read-write).
   - Writes `decks/<slug>/`: `index.html`, `notes.html`, `engine/` (a copy, for portability), `assets.js` (`PD_ASSETS = {logo:'data:…'}`), `fonts.js` and `story.json` (brief, beats, energy).
   - Also writes **readable `deck.js`**: one commented object per scene, with the beat and point as comments. This is the graduation path to hand authoring.
   - Re-exporting to the same folder warns before overwriting any file that was hand-edited since the last export (compared by hash in `story.json`).
2. **Single HTML file.** Engine, deck, assets and fonts all inlined into one `.html`, downloaded by any browser.
   - **Presenter window:** opened with `window.open()` and populated from an inline template. It uses Sync's existing `postMessage`/opener path.
   - **Best for:** emailing or USB sticks.
3. **Video backup.**
   - **MVP:** shows the copyable command `node tools/record.js --deck decks/<slug>`.
   - **Later:** in-page recording. The canvas is clean because every asset is a data URL, so `captureStream` + `MediaRecorder` → `.webm`.

If FSA is missing or permission is denied: "Your browser can't write folders. Downloading `<slug>.zip` instead". The zip is store-only, or deflated via `CompressionStream`.

---

## 11. Persistence

- **Autosave:**
  - **Where:** project JSON in `localStorage['pdstudio:proj:<uuid>']`; assets in IndexedDB `pdstudio/assets`, keyed by SHA-256.
  - **Snapshots:** keep the last 20 for a "Versions…" menu.
  - **Indicator:** "Saved ✓" in the header.
- **⌘S:**
  - **Chrome:** `showSaveFilePicker` → `talk.pixeldeck.json`, with assets embedded as base64. The file handle is stored in IndexedDB so later ⌘S presses are silent after `requestPermission`.
  - **Other browsers:** downloads the file.
- **Open:** a file input or drop of a `.pixeldeck.json`, with a schema-version migration notice.
- **Import deck.js:**
  - **How:** read as text, run in a try/catch with `W`, `U`, `col` and look helpers in scope, and capture `DECK`.
  - **Result:** every scene becomes a **code scene** with its source preserved, including functions such as `curvePoints`.
  - **Warning shown:** "Deck files contain code. Only import decks you trust."
- **Error states:**

  | Situation | Behaviour |
  |---|---|
  | Quota exceeded | Sticky banner: "Autosave is full. Save to a file now." |
  | Project open in two tabs | A BroadcastChannel lock makes the second tab read-only |
  | Autosave missing | The Welcome screen explains that browser data may have been cleared |

---

## 12. Hand-authored and Studio decks side by side

- **OGL stays code.** It moves to `decks/one-giant-leap/` unchanged and keeps rendering from its own `scenes.js`. This preserves pixel identity, which can be verified by recording frames in `tools/record.js` frames mode before and after the move and diffing them.
- **Studio mode for OGL:** opening OGL in the Studio gives storyboard, energy, rehearsal, preflight and notes, stored in a sidecar `story.json`. Scene content stays read-only code with a text editor and a "Validate" button, which runs `resolve` + `still()` and reports errors with line numbers. The Studio never rewrites hand-written JS.
- **Mixed decks:**
  - **Files:** `deck.js` assembles `DECK` from `studio-scenes.js` (generated) and `custom.js` (hand-written, never overwritten) by an ordered id list.
  - **Fill-in sample:** the "OGL template replica" sample doubles as the test that the templates can express a real, loved deck.

### Engine changes the Studio needs

All are additive, so OGL is unaffected:
- `Stage(canvas, {deck})` instead of the global `window.DECK`
- a configurable Sync channel and storage key
- a `Look.apply()` that swaps `STYLES`, `FONT` and `NEBULA_PRESETS`
- an image-to-points sampler
- `tween.js` moved into `engine/`. Today `cinema/` depends on `../engine/tween.js` from the legacy engine.

---

## 13. MVP vs later

### MVP: first great version

- Engine generalised and OGL relocated, with the frame-diff check, **after Wednesday**
- Welcome, Story brief, Arc picker (4 shapes + Blank), placeholder cards
- Filmstrip with live thumbnails, drag reorder, beats, energy curve plus target, runtime estimate
- 16 templates: the 10 from OGL plus Big statement, Big number, Quote, Three points, Logo reveal, Image hold
- Form editor, live preview, Play-in and step pips, safe-area overlay, text budget measured with the real layout
- Look: Cosmos plus 4 palettes, brand accents, logo palette extraction, custom font
- Assets: logo (to particles), photo, font
- Director with the 10 rules
- Autosave, project file save/open, undo/redo, Versions
- Rehearse with presenter view, per-scene timing, M flags, preflight
- Export: FSA folder, single HTML, zip fallback, recorder command
- Import deck.js as code scenes, plus `story.json` sidecar

### Later

- Drag-to-position text on the canvas
- Hand-drawn particle paths
- Photo-to-particles
- Music track with beat-snapped cues
- In-page video recording
- PDF storyboard and handout
- Keyframe timeline for world values
- More looks: Paper, Neon Grid, Ocean, and 8-bit as a look
- An AI bridge: "Copy outline prompt" and "Paste scene JSON". This works without the Studio itself needing the network, and fits OGL's practice.
- Review comments
- Other aspect ratios

---

## 14. Wednesday safety

- **Before Thursday:** no file moves; `cinema/` and `_archive/` stay frozen. Studio work starts in a new `studio/` folder, or on a copy.
- **First migration commit:** a pure move plus the `tween.js` relocation, gated on the frame-diff check before anything else changes.