# PixelDeck Studio: a walkthrough

The Studio builds a deck without code. It asks about your talk, suggests a story shape, gives you a storyboard to fill in,
lets you rehearse, and saves **one `.html` file** you can present anywhere, offline.

You need Chrome (other browsers work, but saving is smoother in Chrome) and a window at least 1280 × 760 pixels. Nothing
to install and no account.

The walkthrough below goes from an empty Studio to a saved presentation in six steps. The part for programmers starts at
[How the Studio is built](#how-the-studio-is-built).

---

## Open it

Double-click `studio/index.html` (or open the launcher, `index.html`, and choose **Build your own in the Studio**).

The **Welcome** screen offers:

- **New deck**: start from nothing. This is the walkthrough below.
- **Open a saved deck… (.html)**: open a presentation you saved from the Studio, to keep working on it.
- **Continue**: decks this browser has autosaved ("autosaved 5 min ago"). The first time it says "Nothing saved in this
  browser yet."
- **Samples**: **One Giant Leap (read-only)**, the talk this engine was made for, to look around and rehearse; and
  **One Giant Leap: template replica (editable copy)**, the same story built from templates, ready for your words.

Click **New deck**.

## The bar at the top

It stays with you on every step:

- the **deck name** (click it to rename the deck, save it, or go back to all decks). Until you rename it, it follows your
  answers: your brand name, else your six-word idea;
- the **steps** ① Brief, ② Shape, ③ Look, ④ Storyboard, ⑤ Rehearse, ⑥ Save & export. A step gets a ✓ when it is done.
  None is ever locked: click any of them at any time. (In a window narrower than 1500 pixels only the current step shows
  its name; point at a number or ✓ to see the others' names.);
- the **save state**: "Saved" means saved *in this browser*; the line under it says whether your file is saved
  ("Not saved to a file", "File saved 2 min ago", "File is out of date");
- **undo** and **redo** (⌘Z and ⇧⌘Z; Ctrl on Windows);
- the main button, always **Next: …**, which takes you to the next step.

From step ② on, a line under the bar sums up your talk: *For {who}, this talk shows {your idea}, so they {your ask}.*

---

## Step 1 · Brief

Ten questions, one at a time. Type an answer and press **Next** (or Enter), or press **Skip**. **Back** and the dots under the
question move between them. Nothing is required, and an amber hint (such as "Try it in one breath: 15 words or fewer") is
advice, never a block.

1. What should this talk do? (inspire, persuade, decide, launch, update or teach)
2. Who's in the room, and what do they believe today?
3. How long is your slot? (type the minutes, or click 3, 5, 10 or 20)
4. If they remember one sentence, what is it?
5. Now say it in six words or fewer. (this is what goes on screen)
6. What do they believe now, and what should they believe after? (two short fields: the old way and the new way)
7. What should they do by next week? (start with a verb: Book, Try, Pick)
8. Your three strongest pieces of evidence (a number, a quote, a story or a demo, one per row)
9. Who are you, in one line? (your brand name and a tagline)
10. What should it feel like? (cinematic, warm, crisp or playful)

The card on the right builds "Your talk in one line" as you answer. **The step is done once you have answered the one
sentence (4) and the slot length (3)**; the card then says "That is enough to start." The last question's button reads
**Finish** and takes you to ② Shape.

## Step 2 · Shape

Pick the shape of your story. A shape is a list of **beats**, each one a job the talk has to do, and you get at least one
scene per beat.

- The first card is **Recommended**, with the reason ("You want to persuade in 5 minutes, and What is / what could be is
  built for persuading people to change"). The second is the **Runner-up**. The others and **Blank** (no beats; you lay out
  every scene yourself) follow.
- Each card shows the shape's ideal energy curve, its beats as coloured chips, and what it is best for.

The bar at the bottom says how many scenes you will get ("6 scenes for a 5-minute slot"). Click **Build my storyboard**.
The Studio makes the scenes, fills in what you already told it, and takes you to ③ Look. (If you build again later, the
button reads **Rebuild my storyboard** and asks "Replace your storyboard? You can undo this." first.)

The step is done once a shape is chosen and the deck has at least one scene.

## Step 3 · Look

Choose how the deck looks. Your words and scenes stay exactly as they are.

- Two cards, **Cosmos** (deep space, nebulae and planets; cinematic) and **Slate** (charcoal and warm light; quiet and
  modern), each playing a scene with your own words. The look that suits the tone you picked is marked **Suggested for
  your tone** and is chosen for you.
- **Colour:** the **Accent** (kickers and small highlights) and the **Future** colour (years and the moment the story turns):
  click a swatch, type a hex code, or reset.
- **Nebula:** the glow behind scenes, for Cosmos only.
- **Brand font:** drop a font file (`.woff2`, `.woff`, `.ttf`, `.otf`) on the screen, or choose one. It is embedded in the
  saved file, so it travels with the deck.

Some scenes only work under Cosmos (hyperspace, the galaxy, the planet, the sunrise). If you switch to Slate while you
have some, the Studio lists them and offers **Swap to closest adaptive template** (your words are kept), **Keep them
anyway**, or **Cancel**.

The step is done once you have visited it. Click **Next: Storyboard**.

## Step 4 · Storyboard

This is where you write. The screen has six parts:

- **The preview** (top left): the real deck, playing the selected scene. Below it: **Play in** (Space) plays the scene in
  from the one before, as on the day; the replay button plays the current click again; **Click** plays the scene's next
  click; the dots jump to a click; the frame button shows the safe area and each text's box; **Rehearse** opens step ⑤
  full screen.
- **Your next step** (under the preview): what to do now, with a button for it, such as **Write scene 1**, and how many
  scenes are written ("2 of 6 written").
- **The scene panel** (the Inspector, in the middle): the scene's number, template and beat, a **Change** button for
  another template, and a card with the beat's question and an example ("What does their world honestly look like today?").
  Three tabs:
  - **Content**: the scene's words and settings, with a live count of characters and words. Amber `{…}` text is a
    placeholder you still have to replace. A red line says a line is too wide for its style.
  - **Scene**: the beat, the point (the one thing the scene says), the energy from 1 to 5, the world (shot), and the
    speaker notes for each click, with how long they take to say.
  - **Advanced**: a JSON patch over the scene, for fine adjustments.
- **The Director** (right): a score out of 100, **Ready for the stage** once nothing needs fixing, and its notes in three
  groups: **Fix first**, **Consider** and **Tips**. Each note has **Show me** (jump to the scene) and **Ignore for this
  scene**. **Whole talk** / **This scene** narrows the list.
- **The energy arc** (under the preview): one dot per scene, by how far into the talk it comes and how intense it is; the
  dotted line is the shape you chose. Drag a dot up or down to change a scene's energy (double-click to reset). The
  estimate against your slot sits on the right ("est 3:55 / 5:00").
- **The filmstrip** (bottom): one card per scene, coloured by beat. A dashed border means words are still missing; the dot
  shows the Director's most serious note. Click a card to select it, drag it to reorder, use **+** between cards to add a
  scene (the picker suggests templates that suit that beat), and the **⋯** menu for **Duplicate**, **Change template…**,
  **Move to beat** and **Delete**.

On the left, the **assets** column (collapsed to icons at first) holds your pictures and fonts. Drop pictures (`.png`,
`.jpg`, `.webp`, `.svg`) anywhere in the window; each card then offers what to use it for, such as a logo scene, an image
scene or the brand font. Pictures are resized to at most 2,400 pixels and kept inside the deck, so it works offline.

**What to do here:** press **Write scene 1** and replace every amber `{…}` with your own words, then press the button again
for the next scene, until the guide says "Every scene has your words." Add speaker notes on the **Scene** tab as you go. The
step is done when no placeholder is left and the Director shows no errors. Its other notes are suggestions; you can present
without following them.

## Step 5 · Rehearse

The run of show: every scene with its planned length and start time, the planned run against your slot, and the keys.

- **Start from the beginning**, or **Start from scene N** (the one you were editing). The deck goes full screen.
- → or Space: next click or scene. ←: back one. **N**: show or hide the notes strip (your notes, the next scene, a stopwatch
  for this scene, the total against your slot). **B**: blackout, for questions. **Esc**: back to the storyboard, on the
  scene you stopped at.

There is no separate presenter window here. To rehearse with one, save the file (step ⑥), open it and press **N**.

## Step 6 · Save & export

**Before you save**, the Studio checks the deck on its own:

| Check | If it fails |
|---|---|
| Every scene builds | you cannot save; the message names the scene |
| No broken settings | you cannot save |
| The Director has no errors | a warning only: you can still save and present |
| The font travels with the deck | a warning when your font is not embedded and not on every computer |
| File size | shown (a warning above 20 MB) |
| The file plays start to finish | you cannot save: every moment of the saved file is played once, hidden, first |

Then:

- **Save presentation** (also ⌘S, from any step): in Chrome, the first time, you choose where to save the file; after that
  ⌘S saves to the same file without asking. Other browsers download it. The file is named after your deck (`acme.html`),
  and **Save a copy as…** saves elsewhere. The card under the button confirms it: "Saved acme.html … Double-click it to
  present, no internet needed."
- **Export source**: download `deck.js` and `assets.js`, for a deck folder: copy `decks/_starter/` to `decks/<your-deck>/`,
  replace those two files, and set the theme script in `index.html` (and `notes.html`) to the look you chose. See
  [authoring.md](authoring.md). The two files already carry your deck's own id, so nothing else needs renaming.
- **Video backup**: a command to copy and run in a terminal, in the project folder, to record the deck to a video
  (`node tools/record.js --deck "/path/to/acme.html"`; it needs the optional tools, see [export.md](export.md#a-video-backup)).

The step is done when the file is saved and nothing has changed since.

## Present it

Double-click the saved file. Go full screen (⌃⌘F on a Mac, F11 on Windows), press **N** for the presenter window (notes,
the next shot and a timer) and drag that window to your laptop screen. → or a clicker moves forward, ← back, **B** blacks
out the screen. The full key list is in [authoring.md](authoring.md#keys).

---

## Coming back later

- **The saved file is your project.** Open the Studio, click **Open a saved deck…** and choose the file: the deck,
  pictures and fonts come back, ready to edit. (The Studio reads the file; it does not run it.) A deck written by hand in
  code cannot be opened this way: "This deck was written by hand. Open it in a code editor."
- **Autosave lives in this browser only.** It keeps your work between visits (the Continue list), but clearing the browser's
  data removes it. Save to a file to be safe.
- If this browser already has an autosaved version of the deck you open and it differs from the file, the Studio asks
  ("You already have this deck here"): **Cancel**, **Open as a copy**, or **Replace the autosave**. If the two match, the
  deck simply opens.
- If the same deck is open in two tabs, the second one is read-only ("Open in another tab…"), with **Take over here**.
- If the browser's storage is full, a banner says "Autosave is full. Save to a file now."
- The One Giant Leap sample is read-only; **Make an editable copy** opens the template replica, which you can change and
  save.

---

## How the Studio is built

The Studio is the engine plus a set of `studio/` modules, all classic scripts, loaded by `studio/index.html` (no build step,
no network). It also loads both looks and two sample decks (`decks/one-giant-leap/` read-only, `decks/_parity/` as the
editable replica). Studio modules are registered `{ export: false }`, so a saved presentation never carries them.

| Module | Role |
|---|---|
| `studio/persist.js` | `PD.studio.persist`: ids, the autosave index and projects in `localStorage`, assets and file handles in IndexedDB, the tab lock, the save target |
| `studio/import.js` | `PD.studio.files`: pictures, fonts and saved presentations coming in (decode, resize, encode, verify; `PD.exportHTML.parse` for files) |
| `studio/store.js` | `PD.studio.store`: the one project in memory (commit, undo, compile, lint, timing, autosave) |
| `studio/app.js` | the shell: header, steps, routing, dialogs, drop handling, `PD.studio.screen` |
| `studio/screens/*.js` | Welcome, Brief, Shape, Look, Storyboard (`board.js`), Rehearse, Save & export |
| `studio/ui/*.js` | the storyboard's parts: preview, filmstrip, arc, Director, assets panel, template picker, Inspector, shared forms |

**A project** is `{ v: 1, id, deck: DeckSource, assets: { [assetId]: contentHash }, studio: { screen, selected, readOnly,
savedHash?, fileName?, … } }`. The deck is always an object deck with `meta.generator: 'studio@2.0.0'`. Its id is made when the
project is created, from the title at that moment as a slug plus four random characters, and never changes.

**The store** (`PD.studio.store`, also `window.Studio.store`):

```text
get() → Project                                  treat as read-only
commit(label, mutate(draft), opts?) → bool       clone, change, push one undo step, autosave after 1 s, emit 'change'
undo(), redo(), canUndo(), canRedo()             100 steps; typing in one field within 1 s is one step
select(sceneId, step?), selection()
compiled() → CompiledDeck                        only the changed scenes are recompiled (PD.compileScene)
lint() → { findings, score, ready, … }           PD.story.lint, recomputed 300 ms after a change
timing() → Timing | null                         the last PD.story.timing
on('change' | 'select' | 'lint' | 'timing' | 'route', fn) → off
route(name?) → string                            the current screen; with a name, go there
```

**Storage.** `localStorage`: `pdstudio:v1:index` (the Continue list) and `pdstudio:v1:proj:<id>` (each project, assets by
content hash). IndexedDB database `pdstudio`: `assets` (by SHA-256 of the data URL) and `handles` (the save-file handle per
project). The tab lock uses `BroadcastChannel('pdstudio:lock:<id>')`.

**Saving** builds the file with `PD.exportHTML(deck.id, { deck, assets })`, runs `PD.exportHTML.selfTest` on it, and writes
it with `showSaveFilePicker` (the handle is kept for silent saves) or a download. **Opening** uses `PD.exportHTML.parse`.
See [export.md](export.md).

**Screens** register with `PD.studio.screen(name, { title, rail?: 1..6, mount(el, ctx) → { unmount() } })`, where
`ctx = { store, PD, ui: { toast, confirm, banner, dialog, … }, nav(name), studio }`. The story tools behind ①, ② and the
Director are described in [story.md](story.md).
