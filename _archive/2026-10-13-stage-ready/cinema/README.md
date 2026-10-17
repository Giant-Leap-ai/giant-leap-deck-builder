# One Giant Leap — cinematic deck

A presentation that plays like a film. It's a single continuous camera through space: a spark becomes the brand, the camera jumps to hyperspace, drops out in front of a galaxy, finds the pale blue dot, flies home to Earth and watches the sun rise over the planet's edge, then tells the story of human leaps.

Everything is real-time Canvas2D with no network, no build step and no dependencies. Double-click `cinema/index.html` and it runs from `file://`. The original pixel-art engine is still in the project root as a fallback.

## Run it

1. Open `cinema/index.html` and press **⌃⌘F** (Mac) or **F11** to go fullscreen.
2. Press **N** for the presenter window: notes, previews of the current and next shot (rendered by the real engine), a timer, and the slide count. You can also open `cinema/notes.html` first; the two windows find each other either way.

| Key | Action |
|---|---|
| → ↓ PageDown Space, click | Next (plays the next step in the slide first, then the next slide) |
| ← ↑ PageUp, right click | Previous |
| `G` then a number then Enter | Go to a slide: `G 7 Enter`, or `G 7.3 Enter` for slide 7, step 3 |
| Home / End | Restart from the cold open / jump to the finale |
| `B` or `.` | Fade to black |
| `R` | Replay this slide's entrance |
| `F` | FPS overlay (fps · JS ms per frame · particles · position · quality) |
| `Q` | Cycle render quality 1× / 1.5× / 2× (1.5× is the default) |
| `N` | Presenter window |

- **Safe to mash.** If you click while something is still animating, the engine finishes that shot instantly and starts the next one.
- **Reload resumes.** `#7.3` in the URL means slide 7, step 3.

**Before you go on stage:** open the deck once on the presenting laptop, connected to the projector, so the planet and nebula textures are generated and cached (about 1 second). Then press `F` to check the frame rate.

## Video backup

```bash
cd tools && npm install && npx playwright install chromium
```

```bash
node record.js --deck cinema
```

That writes `cinema-backup.mp4` at 1920×1080 and 30fps. The deck plays in real time on the GPU while the browser records its canvas (`MediaRecorder`), then ffmpeg converts the result to H.264. Recording this deck takes about 5 minutes and produces a 2:50 video. Without ffmpeg you get a `.webm` instead.

## Authoring (`cinema/scenes.js`)

The design space is **1920 × 1080**. Each slide describes the state the world should glide to, plus what's on screen:

```js
{
  id: 'sunrise',
  world:  { earth: 1, earthR: 2600, earthY: 3330, sun: 1, sunY: 772, letterbox: 1, nebula: 'dawn' },
  worldTime: 5,                                   // default glide time (s) for world values
  timing: { sun: [3.5, 'inOutQuad', 2.6] },       // per-value [duration, ease, delay]
  text:   [{ str: 'we have thought outside the box.', style: 'statement', y: 382, at: 5, reveal: 'letters' }],
  particles: [{ shape: 'cube', x: 640, y: 520, size: 200 }],
  motion: { stagger: 'leftToRight', dur: 1.8, spread: 0.9, ease: 'easeInOutCubic', arc: 0.3, entry: 'void', exit: 'drift' },
  cues:   [{ at: 3.0, flash: 0.5 }],              // one-off camera events: flash, shake
  prelude: 'explode', preludeTime: 0.8,            // optional: blow particles apart first
  steps:  [{ text: [...], world: {...}, remove: ['id'], particles: [...], notes: '...' }],
  notes:  'Speaker notes', dwell: 6               // dwell = hold time in the video recorder
}
```

The deck is deterministic: any world value a slide doesn't set returns to its default, so jumping to a slide always looks the same. The helpers `HORIZON` and `BELOW` in scenes.js hold ready-made camera setups; combine them with `W(HORIZON, {...})`.

### World values (all glide smoothly)

| Group | Values |
|---|---|
| Camera | `speed` (16 = drifting, 5000+ = hyperspace), `warp` 0–1 (streak length), `warpColor`, `roll` (radians), `shake` |
| Cosmos | `stars` 0–1; `nebula` = `aurora`, `cosmic`, `violet`, `dawn`, `deep` or `ember` (crossfades); `nebulaAmount` 0–1; `backdrop` 0–1; `dust` 0–1 |
| Galaxy | `galaxy` 0–1, `galaxyX`, `galaxyY`, `galaxyScale`, `galaxyTilt` |
| Earth | `earth` 0–1, `earthX`, `earthY`, `earthR` (radius in design px), `earthRot` (longitude: −1.2 is the Americas, 0.25 is Europe), `earthSpin`, `earthPitch` |
| Sun | `lightX`, `lightY`, `lightZ` (sun direction; negative z means behind the planet, which gives the sunrise), `sun` 0–1, `sunX`, `sunY`, `sunScale` |
| Grade | `letterbox` 0–1 (2.39:1 bars), `exposure` (0 = black), `vignette`, `grain`, `spark` (the glowing point from the cold open), `sparkX`, `sparkY` |

The sun is hidden automatically when it is behind the planet, so animating `sunY` up past the limb makes a sunrise.

### Text

`{ str, style, x, y, align: 'center'|'left'|'right', maxWidth, size, color, glow, glowAlpha, reveal, exit, at, id }`

- **Position:** `y` is the vertical center of the text block. `x` is the center when centered, and the edge when left- or right-aligned.
- **Color:** `color` is a hex value, a name, or a gradient like `['#fff1c9', '#ffb347']`.
- **Styles:** `mega`, `hero`, `title`, `statement`, `subtitle`, `kicker`, `body`, `year`, `label`, `caption` (font: Avenir Next).
- **Reveals:**
  - `letters`: each letter rises in turn.
  - `focus`: a pull from out of focus.
  - `rise`, `fade`.
  - `wipe`: a light sweep.
  - `particles`: glowing particles assemble the word, then crisp type fades in over them.
- **Exits:** `fade`, `rise`, `sink`, `blur`, `particles`.

### Particles

| Shape | Options |
|---|---|
| `spark` | `count`, `radius`, `x`, `y` |
| `cube` | `x`, `y`, `size`, `spin`, `tilt`, `color`, `color2`; a rotating 3D wireframe |
| `swarm` | `inside: '<cube id>'`, `count`; particles drifting inside a cube |
| `points` | `points: [{x, y, color, s, a}]`, or a function that returns them |

`motion` controls how the field moves into the next arrangement:

- `stagger`: `random`, `radial`, `leftToRight`, `rightToLeft`, `topDown`, `bottomUp`
- `entry`, where new particles come from: `void`, `spark`, `edges`, `stars`, `center`, `below`
- `exit`, what leftover particles do: `drift`, `warp`, `scatter`, `fade`, `rise`, `implode`

Remove a shape in a step (`remove: ['swarm']`) and its particles fly into whatever arrives next. That's how the ideas escape the box.

## Performance

Measured with Chromium on an Apple M2, real-time, across every slide and step including transitions:

- **1920×1080:** 60 fps everywhere; worst frame 17.8 ms.
- **2880×1800 Retina (render quality 1.5):** 60 fps average; two isolated 33 ms frames across the whole deck.
- **Cost per frame:**
  - Earth scenes are the heaviest at about 9–10 ms of JS per frame, because the planet is ray-cast per pixel.
  - The Earth's resolution adapts automatically if frames get heavy.
  - Everything else costs 1–4 ms.
- **Load:** textures, glyph bitmaps and particle targets are built in the background in the first few seconds, so no slide stutters the first time it appears.

## Known limitations

- **Text must be on a single line, or wrapped by `maxWidth`.** There are no inline styles: a mixed-color word needs separate text layers.
- **Fonts depend on the machine.** It uses Avenir Next, which ships with every Mac. On Windows it falls back to Segoe UI, so present from the Mac.
- **The Earth is stylised.** Continents are hand-plotted outlines roughened with noise, so they're recognisable but not map-accurate.
- **Prev, Go-to and reload jump to the finished look of a shot,** gliding there quickly. Use **R** to replay a full entrance.
- **Low-end machines:** if a weak laptop drops frames, press `Q` to drop to 1× quality.
