# pixeldeck

> **Two decks live here.**
> - **`cinema/index.html`** — the cinematic "One Giant Leap" experience (smooth particles, warp, galaxy, Earth, sunrise). See [cinema/README.md](cinema/README.md).
> - **`index.html`** — the original pixel-art engine described below, kept as a fallback.

A presentation engine where every slide is made of pixels on one 320×180 grid. Between slides the pixels fly to their new places, words build themselves out of pixels, and a pixel-art astronaut acts things out.

It uses plain HTML, Canvas2D and classic `<script>` tags. There are no dependencies, no build step and no network calls, so it runs by **double-clicking `index.html`**, even from `file://` with Wi-Fi turned off.

```
index.html          stage (the projector window)
notes.html          presenter window: notes, next-slide preview, timer, n/N
slides.js           ← THE TALK. The only file you edit.
palette.js          16 named colors
engine/font.js      5x7 bitmap font + text layout
engine/sprites.js   sprite format, the astronaut, animation player
engine/particles.js particle field, morph solver, starfield
engine/tween.js     easing + tiny timeline
engine/deck.js      slide state machine, input, presenter sync
tools/record.js     video backup recorder (Playwright, dev-only)
tools/sprite-preview.html   sprite sheet viewer (open it to check sprite art)
```

## Running it on stage

1. Double-click `index.html` and make the window fullscreen (⌃⌘F / F11).
2. Press **N** to open the presenter window and drag it to your laptop screen. You can also open `notes.html` first, because the two windows find each other in either order.
3. Click through with your clicker.

| Key | Action |
|---|---|
| → ↓ PageDown Space, mouse click | Next (plays the next step in the slide first, then the next slide) |
| ← ↑ PageUp, right click | Previous |
| `G` then a number then Enter | Go to a slide: `G 4 Enter` or `G 4.1 Enter` (slide 4, step 1) |
| Home / End | First slide (played live) / last slide |
| `B` or `.` | Blackout (clickers often send `.`) |
| `R` | Replay the current slide's entrance |
| `F` | FPS overlay (fps · ms of JS per frame · particle count · position) |
| `N` | Open the presenter notes window |

- **Safe to mash.** If you press Next while something is still animating, the engine jumps that animation to its end and then starts the next one, so it can't get out of sync. Held-down keys don't auto-repeat.
- **Reload resumes where you were.** The URL hash tracks your position (`index.html#4.1` = slide 4, step 1), so a reload comes back to the same place. The hash uses 1-based slide numbers and 0-based steps.
- **Presenter sync** uses BroadcastChannel, with localStorage events and `postMessage` as fallbacks, so it also works on `file://` in browsers that restrict BroadcastChannel there. The buttons and arrow keys in the notes window also drive the stage. The timer starts on your first advance; click it to reset it.
- Use **Chrome** if you can. Safari and Firefox work too.

## Authoring a slide

`slides.js` sets `DECK = [ ...slides ]`. All coordinates are grid cells on the 320×180 stage.

```js
{
  id: 'problem',
  transition: 'morph',          // morph | dissolve | cut
  stagger: 'byLetter',          // random | leftToRight | rightToLeft | topDown | bottomUp | radial | byWord | byLetter
  entry: 'edges',               // where new pixels come from: edges | center | stars | left | right | top | bottom | base | random | fromSprite:<id>
  exit: 'scatter',              // what leftover pixels do: scatter | fall | fade | swirl | cut
  ease: 'easeInOutCubic',       // also easeOutBack, easeOutElastic, easeOutCubic, linear, ...
  duration: 1.0,                // flight time of each pixel (s)
  staggerTime: 0.8,             // time between the first pixel leaving and the last (s)
  arc: 0.25,                    // how far pixels curve off a straight line (0 = straight)
  match: 'hilbert',             // pairing order: hilbert | angle
  bg: 'starfield',              // starfield | none | any palette color name
  twinkle: true, breathe: false,// star twinkle / subtle 1-cell jitter on resting pixels
  prelude: 'explode',           // optional: blow everything apart before re-forming (preludeTime, explodePower)
  text:   [{ str: 'WE AUTOMATED THE WRONG THINGS', scale: 2, y: 40, maxWidth: 280 }],
  shapes: [{ type: 'line', x1: 0, y1: 157, x2: 319, y2: 157, color: 'gray' }],
  images: [{ grid: LOGO, x: 268, y: 136, scale: 2 }],
  sprites:[{ id: 'astro', anim: 'idle', x: 40, y: 120 }],
  steps: [
    { sprites: [{ id: 'astro', anim: 'walk', from: [-20, 140], to: [120, 140], dur: 1.5 }] },
    { sprites: [{ id: 'astro', anim: 'point' }], highlight: { word: 'WRONG', color: 'red' } }
  ],
  notes: 'Speaker notes (shown in notes.html).',
  dwell: 5                      // seconds to hold this slide in the video recorder
}
```

### Text
`{ str, scale: 1|2|3, x, y, align: 'center'|'left'|'right', maxWidth, color, lineSpacing, letterSpacing, shadow, shadowOffset, at, id }`

- `y` is the top edge of the text. With `align: 'center'`, `x` is the center line (default 160). With `'left'`, `x` is the left edge.
- Text wraps at `maxWidth` cells (default 300). You can also break lines yourself with `\n`. `lineSpacing` is the gap between lines in cells (default 3×scale). `letterSpacing` is measured in font pixels (default 1, which is 1 cell at scale 1).
- `shadow: 'navy'` adds a 1-cell drop shadow in that color. It's a cheap way to make big headlines stand out against the stars.
- Text is uppercase only. Lowercase is converted for you. Supported punctuation: `. , ! ? ' - : / & % $ + = ( ) " # * < >`
- At scale 1, a line holds about 45 characters inside `maxWidth: 280`.

### Shapes
- `{ type: 'rect', x, y, w, h, color, fill: true }`
- `{ type: 'line', x1, y1, x2, y2, color }`
- `{ type: 'circle', x, y, r, color, fill: false }` (x and y are the center)
- `{ type: 'bars', values: [12, 30, 55, 80], x?, y: baseline, h: maxHeight, barWidth, gap, colors: [...], labels: true, labelColor, axis: true, max }`
- `{ type: 'pixels', points: [[x, y, 'color'], ...] }`

### Images
`{ grid: ['..ww..', '.wwww.'], keys: { w: 'white' }, x, y, scale }`. Each character in `grid` is a single-character palette key, and `.` is transparent. Without `keys`, the sprite keys are used: `k` slate, `w` white, `g` silver, `a` gray, `o` orange, `v` sky, `b` navy, `y` yellow, `r` red, `c` cyan.

### Timing inside a slide
- Every text, shape or image item can take **`at: seconds`**, which delays when its pixels arrive. The first slide uses this to bring in the subtitle after the title.
- **Steps** are extra clicks inside a slide, and each one builds on the one before. A step can add `text`, `shapes` or `images`, add a `highlight` (`{ word | match, color }`), drop items with `remove: ['id']`, wipe everything with `clear: true`, and set its own `transition`, `stagger`, `entry`, `ease` and so on.
- Pixels that are already sitting on a cell the next state needs stay where they are and only change color. That's why highlights and steps don't reshuffle the whole slide.

### Sprites
`{ id, sprite: 'astronaut', x, y, anim, flip, at, from, to, dur, path, height, moves, endAnim, dissolve, assemble }`

- `x, y` (or `from`) is the **top-left** of the 24×30 frame. The astronaut's feet sit about 27 cells below `y`.
- **Animations:** `idle`, `walk`, `jump`, `point`, `wave`, `float`.
- **Paths:**
  - `path: 'linear' | 'arc' | 'jump'`, with `height` setting the arc or jump height.
  - Use `moves: [{ to, dur, anim, path, height, ease, pause }]` to chain several moves.
  - A sprite faces the way it is moving unless `flip` is set.
  - When a sprite stops walking it switches to `idle`. Set `endAnim` to choose a different animation.
- **`dissolve: true`** turns the sprite into loose pixels when its moves finish (or at `dissolveAt: seconds`). Those pixels then fly into the next item that arrives. Pair this with `entry: 'fromSprite:<id>'` so any extra pixels the word needs also burst out of the character. Slide 2 is the example.
- **`assemble: true`** (alias `morph: true`) builds the sprite out of field pixels first, then it comes to life and plays its animation.
- If a slide's transition is `morph`, any sprites still on screen when you leave it dissolve into the field and get reused by the next slide.

### Adding sprites
```js
Sprites.define('rocket', {
  keys: { k: 'slate', w: 'white', o: 'orange' },
  anims: { idle: { fps: 4, frames: [ ['..k..', '.kwk.', 'kwwwk', '.o.o.'], [ ... ] ] } }
});
```
Put it in `engine/sprites.js`, or in `slides.js` above `DECK`. Frames can be up to 32×32. To check your art, open `tools/sprite-preview.html`, which shows every frame and a live preview of each animation.

## Video backup

The recorder needs Node, and it's the only part of the project that does:

```bash
cd tools && npm install && npx playwright install chromium
```

```bash
node record.js
```

That writes `pixeldeck-backup.mp4` at 1920×1080 and 30fps (for the cinematic deck, add `--deck cinema`; see cinema/README.md), using ffmpeg from your PATH (`brew install ffmpeg`). It runs the deck's clock frame by frame, so the video is perfectly smooth however slow the machine is. The demo deck takes about 70 seconds to record and produces about 63 seconds of video.

Options:
- `--out talk.mp4 --fps 60`: output file and frame rate.
- `--dwell 4`: force how long every slide is held. Otherwise each slide's `dwell` from slides.js is used.
- `--step-dwell 2.5`: how long each step is held.
- `--width 1280 --height 720`
- `--mode realtime`: real-time WebM capture, for when ffmpeg isn't installed. It's choppier, at about 25fps.

The recorder waits for each state to finish animating, holds for its dwell time, and then advances.

## Performance

- Particles are drawn as filled rectangles grouped by color. Edges are rounded so cells line up exactly at any scale.
- Slide matching costs O(n log n): it sorts both sets of pixels along a Hilbert curve and pairs them in order.
- To stress-test, open `index.html?stress=6000&auto=0.3&fps=1`. It loops a 6,000-pixel morph forever with the FPS overlay on.
- Other URL flags: `?auto=5` advances every 5 s once a state settles (kiosk mode), and `?loop=1` wraps from the end back to the start.

## Known limitations

- Text is uppercase only, 5×7 font, about 45 characters per line at scale 1. There is no lowercase or emoji.
- **Prev, Go-to and reload jump to the finished state of the slide.** They don't replay walks or dissolves; the pixels still morph to the right picture. Use **R** to see a slide's entrance again.
- Sprites are drawn above particles, and everything at rest snaps to the grid. A sprite moves one whole cell at a time, which is the intended look.
- `entry: 'fromSprite:<id>'` only works after that sprite has dissolved in the same slide. Otherwise new pixels come from the center.
- Very large shapes add up quickly: a filled 100×60 rect is already 6,000 pixels. The field is capped at 14,000 particles.
- The notes window's thumbnails show each slide's finished state, not a live mirror of the stage.
- `--mode realtime` recordings depend on how fast the machine is. Use the default frame mode for the real backup.
