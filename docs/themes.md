# Looks (themes)

A **look** decides how a deck feels: the font, the colours, the glow on the words, the kind of world behind them and how
things move. In code a look is called a **theme**. A look holds values only, never words or scenes, so you can switch a
deck from one look to another without touching its scenes.

The first half of this guide is plain language. The reference starts at [The theme file](#the-theme-file).

---

## The looks that come with PixelDeck

| Look | Where | What it is |
|---|---|---|
| **Slate** (`slate`) | `themes/slate/theme.js` | Charcoal and warm light: soft drifting colour, a little bokeh, a system font, one warm accent (`#ffb35c`). Quiet and modern; it suits most businesses. Its worlds are `ambient`, `photo` and `spark`. |
| **Cosmos** (`cosmos`) | `themes/cosmos/theme.js` | Deep space: stars, nebulae, a galaxy, the Earth and the sun, in Avenir. Cinematic and big. Its worlds are `cosmos`, `planet`, `spark` and `photo`. |
| **One Giant Leap** (`one-giant-leap`) | `decks/one-giant-leap/theme.js` | The look of the original Tech Week talk: a frozen copy of the Cosmos values from that day, with no shots and no roles. It belongs to that deck; copy it, never edit it. |

Some templates need a world only Cosmos has: `hyperspace` needs `cosmos`, and `galaxy-reveal`, `planet` and `sunrise`
need `cosmos` and `planet`. Under Slate those scenes would not play, so the Studio offers to swap them for the closest
template that works everywhere. Every other template works under both looks. See [templates.md](templates.md).

## Choosing a look for a deck

Two lines must agree:

1. The theme script that `index.html` and `notes.html` load, for example `<script src="../../themes/cosmos/theme.js">`.
2. `meta.theme` in `deck.js`, for example `theme: 'cosmos'`.

If they disagree the deck stops with `no theme "…"`.

## A look for one deck

To give a deck your brand's colours and font, make it its own look. The recommended way, and the one the reference talk
uses, is a **copy**: it can never change when someone later edits a shared look.

1. Copy a look into your deck folder: `cp themes/slate/theme.js decks/my-talk/theme.js`.
2. In the copy, change the id in `PD.theme('slate', …)` to a new one, such as `'my-talk'`, and the `label`.
3. Change the values you care about: `fonts.display`, `colors`, `roles.accent` (the colour of kickers and highlights),
   the `fill` and `glow` of the text styles, the `ambients` palettes.
4. In `index.html` and `notes.html`, load `theme.js` (from the deck folder) instead of `../../themes/slate/theme.js`.
5. Set `meta.theme: 'my-talk'` in `deck.js`. (If you name the theme after the deck id, as `one-giant-leap` does, the deck
   finds it even without `meta.theme`.)

A shorter way is to **extend** a shared look and change only a few values:

```js
PD.theme('acme', {
  extends: 'slate',
  label: 'Acme',
  colors: { brand: '#2f7bff' },
  roles: { accent: '#2f7bff', accentGlow: '#5fa0ff' },
  styles: { hero: { fill: ['#ffffff', '#cfe0ff'] } }
});
var t = PD.theme.resolve('acme');
console.log(t.chain, t.roles.accent, t.styles.kicker.fill, t.styles.hero.size);   // ['slate', 'acme'] #2f7bff #2f7bff 148
```

Objects merge key by key along `extends` (so `styles.hero` keeps every field of Slate's hero except `fill`), arrays
and other values replace, and `null` deletes a key. With `extends`, the page must load the parent's script **before**
yours (`../../themes/slate/theme.js`, then `theme.js`), and a later change to Slate also changes your look.

## Your own font

PixelDeck ships no font files. Slate uses the computer's own system font; Cosmos asks for Avenir, which only Macs have
(other computers use the next font in its list). To make sure a font travels with the deck, embed it:

1. Add the font file to `assets.js` as a font asset (the Studio does this when you drop a `.woff2`, `.woff`, `.ttf` or
   `.otf` on its Look screen):

   ```text
   PD.assets('my-talk', {
     brand: { type: 'font', src: 'data:font/woff2;base64,…', family: 'Brand Sans', name: 'BrandSans.woff2', bytes: 41200 }
   });
   ```

2. Put its family first in the look's font list, and name the asset in `fontFaces`:

   ```text
   fonts: { display: '"Brand Sans", -apple-system, "Segoe UI", Roboto, sans-serif' },
   fontFaces: [{ family: 'Brand Sans', asset: 'brand' }]
   ```

The player loads embedded fonts before it measures any text, so nothing is laid out in a fallback font. `fontFaces` can
also give one asset another family name, or a `weight` and `style`. `PD.validate` reports a `fontFaces` entry whose asset
is missing or is not an embedded font.

## Changing a look for one deck only

`meta.themePatch` lays values over the look for one deck, without a new theme file. It is what the Studio's Look screen
writes when you pick an accent colour or a brand font:

```js
PD.deck('patch-demo', {
  format: 2, id: 'patch-demo',
  meta: { title: 'Patched', theme: 'slate', themePatch: { roles: { accent: '#6fe0a0' }, world: { bokeh: 0.8 } } },
  scenes: [{ id: 'a', template: 'statement', props: { kicker: 'Green kicker', line: 'Same look, one new colour.' } }]
});
var c = PD.compile('patch-demo');
console.log(c.theme.roles.accent, c.theme.styles.kicker.fill, c.theme.world.bokeh);   // #6fe0a0 #6fe0a0 0.8
```

---

## The theme file

A theme file makes one call: `PD.theme(id, ThemeSource)`, or `PD.theme(id, function (PD) { return ThemeSource; })` when you
want to build values with code (Cosmos does this to compose its shots). The function runs once, the first time the look
is used.

```text
ThemeSource = {
  extends?: string,                 // a parent theme id
  label: string,                    // the name people see
  worlds: string[],                 // world plugins this look enables ('core' is always on)
  fonts: { display: string },       // a CSS font-family list
  fontFaces?: [{ family, asset, weight?, style? }],   // embedded fonts, by the deck's asset id
  colors: { [name]: '#rrggbb' },    // named colours: 'gold', 'teal' … usable anywhere a colour is
  roles?: { [role]: color | [color, color] },         // accent, accentGlow, future, futureGlow, past, pastGlow
  styles: { [style]: StyleSpec },   // the text styles (below)
  nebulae?: { [name]: [c1, c2, c3] },                  // cosmos: nebula palettes
  ambients?: { [name]: { base: [edge, centre], blobs: [colors], bokeh: color } },   // ambient: light palettes
  world: { [param]: value },        // overrides of the world plugins' defaults (may be {})
  motion: { ease, dur, spread, arc, stagger, entry, exit },             // particle flight defaults
  timing: { worldTime, worldEase, settledWorldTime, textDelay, stepTextDelay, settledTextDelay,
            settledDurMax, settledSpreadMax, preludeTime },             // the stage's timing defaults
  shots?: { DRIFT: {}, [NAME]: { [param]: value } },  // named worlds that templates and decks reuse
  ui: { accent: '#rrggbb' }         // the Studio and presenter-window accent colour
}
```

Every section the engine reads is checked when the look is resolved: a missing `label`, `worlds`, `fonts.display`,
`colors`, `styles`, `world`, a `motion` or `timing` field, or `ui.accent` stops with
`theme "…" needs <field>`. Slate and Cosmos both use these timing values: `worldTime: 2.6, worldEase: 'inOutCubic',
settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15, settledTextDelay: 0.2, settledDurMax: 1.2,
settledSpreadMax: 0.5, preludeTime: 0.9`. "Settled" values apply when a state is shown without its entrance (going back,
jumping, reloading).

### Text styles

The looks that come with PixelDeck all define the same ten styles, with the same sizes, so a scene written for one look
lays out the same under another (a look of your own should keep all ten: templates use them):

| Style | Used for | Cosmos and Slate size |
|---|---|---|
| `mega` | one huge number or word | 210 |
| `hero` | a name or a two-word headline | 148 |
| `title` | a short line of scale ("13.8 billion years") | 86 |
| `statement` | a spoken sentence, wraps at 1500 | 64 |
| `body` | a longer paragraph (a last resort) | 40 |
| `year` | the dates of a timeline | 40 |
| `subtitle` | a tagline under a headline | 32 |
| `kicker` | the small line above a statement | 22 |
| `label` | the names of points and milestones | 22 |
| `caption` | sources, credits, small print | 20 |

```text
StyleSpec = { weight, size, track /* letter spacing, in ems */, upper?, fill: color | [top, bottom], fillDir?: 'v' | 'h',
              glow?: color, glowSize?, glowAlpha?, lineHeight?, maxWidth?, push? /* slow zoom while on screen */ }
```

### Roles

A style's colour can be a **role** written `'@name'`: Slate's and Cosmos' `kicker` style has `fill: '@accent'` and `year`
has `fill: '@future'`. Resolving the look replaces each `'@name'` with `roles[name]`, so changing one role recolours every
style that uses it (an unknown role stops with an error). The templates read the roles too: `pivot` draws the old answer in
`past` and the new one in `future`, `three-points` marks each point in `accent`.

### Shots

A shot is a named world. Templates ask for one through their `shot` prop (`statement` uses `DRIFT`, `brand-reveal`
`BLOOM` …); a look without that shot falls back to `DRIFT`, which must exist and may be empty.

- **Slate:** `DRIFT` (the calm default), `WARM` (ember light), `COOL` (steel light), `DARK` (nearly lights-out).
- **Cosmos:** `DRIFT`, `HORIZON` and `BELOW` (camera setups along the Earth's edge), and one per scene of the One Giant
  Leap talk: `SPARK`, `BLOOM`, `HYPERSPACE`, `GALAXY`, `HOME`, `SUNRISE`, `LEAPS`, `BOX`, `PIVOT`, `FINALE`.
- **One Giant Leap:** none.

Slate's ambient palettes are `charcoal`, `ember`, `steel` and `dusk`; Cosmos' nebulae are `aurora`, `cosmic`, `violet`,
`dawn`, `deep` and `ember`.

## `PD.theme` and `PD.theme.resolve`

`PD.theme` is a registry like the others (see [plugins.md](plugins.md#registries)): `PD.theme(id, source)` registers,
and throws if the id is taken; `.get(id)`, `.has(id)`, `.list()` read it.

`PD.theme.resolve(id, patch?)` builds the finished look: it follows `extends` root first, merges, applies `patch`
(merged the same way), replaces the `'@role'` strings, checks the required sections and freezes the result. It adds
`id`, `chain` (the `extends` chain, root first) and `key` (a hash of the values, which the stage uses to tell two looks
apart). The sources you registered are never changed.

```js
console.log(PD.theme.list());                          // ['cosmos', 'slate'] on a page that loads both
var slate = PD.theme.resolve('slate');
console.log(slate.label, slate.worlds, Object.keys(slate.shots));   // Slate ['ambient', 'photo', 'spark'] ['DRIFT', 'WARM', 'COOL', 'DARK']
var warmer = PD.theme.resolve('slate', { roles: { accent: '#ff6b9a' } });
console.log(slate.key !== warmer.key, warmer.styles.kicker.fill, Object.isFrozen(warmer));   // true #ff6b9a true
try { PD.theme.resolve('nope'); } catch (e) { console.log(e.message); }   // pixeldeck: no theme "nope"
```

A compiled deck carries its resolved look as `compiled.theme` (see [authoring.md](authoring.md#checking-a-deck)).

## Rules for a theme file

- One top-level `PD.theme(…)` call and nothing else: the one-file export writes the theme out again instead of copying
  the file (see the next rule), so nothing outside the call reaches the exported file. `node tools/lint.js` checks it.
- Values only: no DOM, no random numbers, no textures. A theme written as an object is exported as JSON, so it must be
  plain data. A theme written as a function is exported as its source code.
- The export carries the deck's whole `extends` chain, root first, so an exported deck keeps its look.
