# Gallery

One deck that shows everything WP3 adds, under the **Slate** look (`themes/slate/theme.js`).

Open `decks/_gallery/index.html` (double-click works; nothing loads from the network). Keys are the usual ones:
arrows / space to step, `G` then `n.m` to jump, `F` for the frame rate, `N` for the presenter window.

| Scene | What it shows |
|---|---|
| `slate` | The look: charcoal base, warm accent, system font. One click crossfades the ambient light from charcoal to ember. |
| `light` | The **ambient** world: steel, then dusk with larger bokeh and a warmer horizon (`ambientPreset`, `bokeh`, `bokehSize`, `horizonGlow`). |
| `counter` | The **counter** element: `1,234.5%` with decimals and a suffix, then `$2,847,300` with a prefix. |
| `photo` | The **photo** world: a slow Ken Burns push-in, the lower-third scrim, then a crossfade to another picture (`photoAsset`). |
| `frame` | The **image** element: contained, rounded corners, a warm glow, `focus` reveal. |
| `reveals` | Every picture reveal side by side: `fade`, `rise`, `focus`, `wipe`. |
| `logo` | A transparent logo dissolving into the particle field (`reveal: 'particles'`, at most 3,500 points). |
| `finale` | Lights down, letterbox in. |

The three pictures in `assets.js` are procedural drawings (no photographs, no licences). Regenerate them with
`node tools/test/fixtures/wp3-make-gallery-assets.js`. The slate shots (`WARM`, `COOL`, `DARK`) are spelled out in
`deck.js` because a factory deck cannot use theme helpers before its `meta.theme` is known.

Checks: `node tools/test/run.js --grep wp3` (unit), `node tools/test/e2e.js wp3-gallery` (the page), and
`node tools/regression/perf.js --deck decks/_gallery --dpr 2` (real-time frame cost at 1920 x 1080, quality 1.5).
