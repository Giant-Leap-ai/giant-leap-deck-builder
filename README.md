# PixelDeck

**The engine behind One Giant Leap's LA Tech Week 2026 talk.** We designed and built this cinematic presentation engine together with Claude, then used it to give the talk. It's yours now: play our deck, take it apart, and build your own.

Every deck is plain HTML, Canvas2D and JavaScript. There's no build step, no install and no internet needed: **double-click an `index.html` and it runs.**

👉 **New here? Open [START-HERE.md](START-HERE.md).**

## What's inside

| Open this | What you get |
|---|---|
| `index.html` | A launcher page with links to everything below |
| `decks/one-giant-leap/index.html` | Our Tech Week talk: a spark, hyperspace, a galaxy, Earth, a sunrise and a story of human leaps |
| `decks/one-giant-leap/export/one-giant-leap.html` | The same talk as **one self-contained file** you can email or put on a USB stick |
| `studio/index.html` | **PixelDeck Studio**, a guided, no-code deck builder: Brief → Shape → Look → Storyboard → Rehearse → Export |
| `decks/_gallery/index.html` | A tour of every element and effect the engine offers |
| `decks/_starter/` | The smallest working deck. Copy it to start your own by hand (or with Claude) |

## Presenting

Open a deck's `index.html`, go fullscreen (**⌃⌘F** on Mac, **F11** on Windows), then press **N** to open the presenter window (notes, next-shot preview and a timer) and drag it to your laptop screen.

| Key | Action |
|---|---|
| → Space, click | Next step or scene |
| ← right click | Previous |
| `G` 7 Enter | Jump to scene 7 (`G 7.3` = scene 7, step 3) |
| `B` or `.` | Fade to black |
| `R` | Replay this scene's entrance |
| `F` | Frame-rate overlay |
| `N` | Presenter window |

Use Chrome for the smoothest playback. Safari and Firefox work too.

## Make your own deck

- **No code:** open `studio/index.html` and follow the steps. Its export gives you a single `.html` file, or the source files for a deck folder.
- **With Claude Code or Codex:** open this folder in it and say *"Help me make a deck for my business."* The instructions in `CLAUDE.md` / `AGENTS.md` turn it into a guide that knows this project.
- **By hand:** `cp -R decks/_starter decks/my-talk`, then edit `decks/my-talk/deck.js`. The look (fonts, colors, motion) lives in `themes/` or in a deck's own `theme.js`.

## Folder map

```
index.html          launcher
decks/              one folder per deck (index.html, notes.html, deck.js, assets.js, optional theme.js)
engine/             the engine: core renderer and player, worlds (space, planet, ambient, photo), elements, scene templates, story tools
studio/             the Studio app
themes/             shared looks: cosmos, slate
tools/              optional Node tooling: one-file export, video recorder, tests (see below)
docs/               the build spec and design notes we wrote with Claude while building v2
cinema/  legacy/  _archive    historical versions of the talk, kept for reference and regression tests
```

## Optional tools (need Node.js)

The decks themselves need nothing. These are only for exporting, recording and testing:

```bash
cd tools && npm install && npx playwright install chromium
node export.js ../decks/my-talk        # one self-contained HTML file → decks/my-talk/export/
node record.js --deck one-giant-leap   # MP4 backup of a talk (needs ffmpeg)
npm test                               # unit tests
```

Visual-regression baselines (about 330 MB of screenshots) aren't included. Generate them on your own machine before running the comparison tools; see `tools/regression/README.md`.

## License

MIT. See [LICENSE](LICENSE).
