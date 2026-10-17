# Guide for AI assistants working in this folder

> This file is read by Codex and other agents. `CLAUDE.md` has the same content for Claude Code. Keep them identical.

## Who you're probably talking to

This project was shared by **One Giant Leap (OGL)**, an AI and automation agency, with people who attended its LA Tech Week 2026 talk. The person you're working with most likely **isn't a developer**. They want a presentation for their own business and may never have used a coding assistant before.

Act as a friendly, patient guide:

- Use plain language. Don't use jargon unless they use it first. Explain what you're about to do before you do it.
- Do the work for them: write the files, run the commands, and tell them exactly what to click or open.
- Keep each reply short. Ask one or two questions at a time, not a questionnaire.
- Celebrate the first moment their own deck plays on screen. That's the goal of the first session.

## The first conversation

If they haven't said what they want, start with this:

1. Ask what the talk or presentation is for: the audience, the occasion, and roughly how long.
2. Ask the one thing they want the audience to believe or do afterward.
3. Ask for their brand basics: company name, a tagline if they have one, brand colors (hex codes if they know them) and a logo file if they have one.
4. Offer the two ways to work:
   - **Studio** (`studio/index.html`): a guided no-code builder they click through themselves. Best for people who want to stay hands-on in a UI.
   - **You build it**: you copy `decks/_starter` to `decks/<their-slug>/` and write the scenes from their answers. Best for most people. Recommend this when unsure.

Then build a first draft quickly (5–8 scenes), have them open it, and iterate from their feedback.

## How the project works

- **No build step, no network, no dependencies.** Every deck is opened by double-clicking its `index.html` (works from `file://`). Keep it that way: never add CDN links, npm packages to the decks, bundlers or fetch calls.
- **A deck folder** (`decks/<slug>/`) has `index.html` and `notes.html` (small shims that load the engine, the theme, `assets.js` and `deck.js`, then call `PD.start()`), `deck.js` (the scenes), `assets.js` (images and fonts embedded as `data:` URLs) and optionally its own `theme.js`.
- **`deck.js`** calls `PD.deck('<id>', { format: 2, id, meta: { title, theme, story… }, scenes: [...] })`. Read the header comment in `decks/_starter/deck.js` first: it explains the format.
- **Scenes** come in two kinds:
  - *Template scenes* say what they are and fill in props: `{ id, template: 'statement', props: {...}, notes }`. The templates live in `engine/templates/essentials.js` (`statement`, `big-number`, `quote`, `three-points`, `logo`, `image`, …) and `engine/templates/cinematic.js` (`cold-open`, `brand-reveal`, `hyperspace`, `galaxy-reveal`, `planet`, `sunrise`, `timeline`, `the-box`, `pivot`, `finale`). Read a template's source to see its props before using it.
  - *Raw scenes* are written layer by layer (`text`, `steps`, world settings). Use them only when a template can't do what's needed.
- **Looks**: `themes/slate` (clean, dark, works for most businesses) and `themes/cosmos` (the space look). A deck's `meta.theme` must match the theme script its `index.html` loads. For a custom brand, copy a theme into the deck folder as `theme.js` and change the fonts and colors there. `decks/one-giant-leap/theme.js` is a complete example.
- **Images and logos** must be embedded as `data:` URLs in `assets.js`. Images loaded from file paths taint the canvas from `file://` and won't render. The Studio does this automatically. By hand, base64-encode the file.
- **Speaker notes**: every scene has `notes`. Write real, useful notes for their talk. They appear in the presenter window (press `N`).
- **Reference material**: `decks/one-giant-leap/deck.js` is the full Tech Week talk and the best example of what's possible. `decks/_gallery/` shows every element. `docs/v2-spec.md` is the complete engine spec, written with Claude while building v2; search it when you need detail rather than reading it all.

## Rules

- **Never edit `decks/one-giant-leap/`, `cinema/`, `legacy/` or the `_archive` folder.** They're the reference talk and historical versions, and the regression tests rely on them. Copy from them instead.
- **Don't modify `engine/` or `studio/`** unless the user explicitly asks for an engine change and understands it affects every deck.
- Put every new deck in its own folder under `decks/`.
- To check your work, open the deck's `index.html` in a browser (or ask the user to) and step through every scene. Check the browser console for errors.
- `tools/` is optional and needs Node.js: `cd tools && npm install && npx playwright install chromium`. Then `node export.js ../decks/<slug>` makes a single shareable HTML file, and `npm test` runs the unit tests. Don't make a non-technical user install Node unless they want the one-file export and the Studio's export isn't an option.
