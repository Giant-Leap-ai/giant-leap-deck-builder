# Starter deck

The smallest deck that runs: one `statement` scene under the **Slate** look. Copy it to start a new deck by hand, or
use it as the landing place for a deck saved from the Studio.

## Run it

Double-click `index.html`. Space or the right arrow reveals the next step or scene, the left arrow goes back, `N`
opens the presenter notes in their own window, `F` shows the frame rate. Nothing needs a network or a build step.

## Start your own deck from it

1. Copy this folder: `cp -R decks/_starter decks/my-talk`.
2. Edit `decks/my-talk/deck.js`. The deck id (`'starter'` today) can be anything in lower-case letters, digits and
   dashes; use the same id in `assets.js`. `index.html` and `notes.html` call `PD.start()` without an id, so they play
   whichever single deck the page registers.
3. Pick the look in `index.html` and `notes.html`: the theme script (`../../themes/slate/theme.js`) must be the one named
   by `meta.theme` in `deck.js` (`slate`, `cosmos`, or a `theme.js` of your own in this folder).

### Using a deck saved from the Studio

The Studio's "Export source" gives you a `deck.js` and an `assets.js`. Copy this folder to `decks/<slug>/`, replace
those two files with the Studio's, and set the theme script in `index.html` and `notes.html` to the look the Studio
deck uses. That is all; nothing else in the folder names the deck.

## One file to hand around

```sh
node tools/export.js decks/my-talk          # writes decks/my-talk/export/<deck id>.html
node tools/export.js decks/my-talk --self-test
```

The result is one HTML file with the engine, the look, the deck and its assets inside. It opens by double-click, with
no network, and `N` opens its presenter notes (the same file with `?notes`). It is git-ignored; it is generated.

## What is in the folder

| File | What it is |
|---|---|
| `index.html` | the page: loads the engine, a theme, `assets.js`, `deck.js`, then `PD.start()` |
| `notes.html` | the same page in presenter mode (`PD.start(null, { mode: 'notes' })`) |
| `deck.js` | the deck: one `PD.deck(id, DeckSource)` call; the header comment explains scenes, templates and raw scenes |
| `assets.js` | embedded images and fonts as `data:` URLs (empty here) |

Every `.js` file in a deck folder is exactly one top-level `PD.*(…)` call, so export can re-emit it.
