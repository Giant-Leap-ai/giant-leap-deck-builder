# One file to hand around (export)

A deck folder needs the whole project next to it: the engine, the looks, the deck. An **export** packs all of that into
**one `.html` file**: the engine, the deck's look, its pictures and fonts, and its scenes. You can email it, put it on a
USB stick or keep it on the presenting laptop. It opens by double-click, needs no internet and no install, and pressing
**N** in it opens its presenter notes (the same file, opened with `?notes`, in a window of its own).

There are two ways to make one:

- **From the Studio:** step ⑥ Save & export, **Save presentation**. The saved file is also your Studio project: open it in
  the Studio again to keep editing. See [studio.md](studio.md#step-6--save--export).
- **From a deck folder,** with the command-line tool below. This needs Node.js; the decks themselves never do.

The first half of this guide is plain language. The reference starts at [What is inside the file](#what-is-inside-the-file).

---

## The command-line export

Once, to install the tools (from the project folder):

```sh
cd tools && npm install && npx playwright install chromium
```

Then, from the project folder:

```sh
node tools/export.js decks/my-talk                 # writes decks/my-talk/export/<deck id>.html
node tools/export.js decks/my-talk --self-test     # plays every scene of the file once first; writes nothing if one fails
node tools/export.js decks/my-talk --out ~/Desktop/my-talk.html
```

From inside `tools/` the same commands read `node export.js ../decks/my-talk` (or `npm run export -- ../decks/my-talk`).

| Argument | Meaning |
|---|---|
| `<deck>` | a deck folder (its `index.html` is used), an `.html` page that loads a deck, or `one-giant-leap` / `ogl` |
| `--out file` | where to write; default `<deck folder>/export/<deck id>.html` |
| `--id deckId` | which deck, when the page registers more than one |
| `--self-test` | before writing, play the file once in a hidden frame; on any failure write nothing and exit 1 |
| `--headed` | show the browser while it works |

It prints `wrote decks/my-talk/export/my-talk.html (… bytes, deck "my-talk")` (and `self-test ok (… ms)` first, with
`--self-test`). Template scenes that fail are printed as warnings; the file is still written, with a ⚠ card in their place,
unless `--self-test` is on. Exit codes: 0 written, 1 the page or the export failed, 2 a wrong argument.

`decks/*/export/` folders are ignored by git (the One Giant Leap export, `decks/one-giant-leap/export/one-giant-leap.html`,
is the one exception and is checked in).

How it works: the tool opens `<deck folder>/index.html?export` in a headless Chromium. With `?export` in the address,
`PD.start` registers everything and plays nothing (`register-only` mode). The tool then calls `PD.exportHTML(id)` in the
page and writes the string it returns. The Studio calls the same function.

## A video backup

For a venue without a browser, record the deck to a video. From the project folder, with the tools installed:

```sh
node tools/record.js --deck decks/my-talk            # → my-talk-backup.mp4 in the project folder
node tools/record.js --deck ~/Desktop/my-talk.html   # a file saved from the Studio, or any exported file
```

The recorder waits for the deck to be ready, plays every scene and holds each moment for its `dwell`. It plays the deck in
real time and converts the recording to MP4 with ffmpeg; without ffmpeg it keeps a WebM. The comment at the top of
`tools/record.js` lists the options (frame-by-frame mode, frame rate, hold times, output).

---

## What is inside the file

`PD.exportHTML` writes the file as a series of `<script>` elements, one per line, in this order (the step numbers are
those of the build spec §3.6 and of `engine/core/export.js`):

| Step | What it writes |
|---|---|
| 1 | `<!doctype html>…<title>` (the deck's `meta.title`) `<meta name="generator" content="pixeldeck 2.0.0">…<body>` |
| 2 | the kernel, `engine/pixeldeck.js`, re-emitted from its own source |
| 2b | `PD.MANIFEST = PD.MANIFEST.filter(…)`: the file's own list of engine files, minus the modules it leaves out on purpose (below) |
| 3 | every registered module except those registered `{ export: false }`, in registration order, as `PD.module(name, deps, factory, opts)` |
| 4 | the deck's look and every look it `extends`, root first: a factory theme as its source, an object theme as JSON |
| 5 | `PD.assets(id, …)`, with the asset map as JSON between the markers `/*PD:ASSETS-JSON:BEGIN*/` and `/*PD:ASSETS-JSON:END*/` |
| 6 | the deck: a factory deck as its source, `PD.deck(id, factory)`; an object deck (every Studio deck) as JSON between `/*PD:DECK-JSON:BEGIN*/` and `/*PD:DECK-JSON:END*/` |
| 7 | `PD.start(id)` |

The modules left out are the ones a presentation does not need: `core/export` itself, `core/validate`, the story tools
(`story/*`) and the Studio. Your own plugin modules are carried, which is why plugins must be wrapped in `PD.module` (see
[plugins.md](plugins.md#where-plugin-code-goes)).

**Step 2b** is an addition to the order in the build spec (AMEND-11 keeps it). The kernel re-emitted in the file still
lists every engine file in `PD.MANIFEST`, including the ones the file leaves out by design. Once every MANIFEST entry is
marked required, `PD.missing()` would name those, and `PD.start` would refuse to play with "missing engine files". Step 2b
removes exactly the entries of modules registered `{ export: false }` from the file's own MANIFEST, so a module that is
genuinely missing is still reported. It is harmless when nothing needs removing.

Two guards stop a file that could not start: the exporting page must itself have every required engine file
(`PD.missing()` empty), and every module the file carries must find its dependencies in the file.

### Escaping

JSON between the markers is written with every `<`, `>`, `&`, `*`, U+2028 and U+2029 as a `\u` escape, so no closing
script tag, comment opener or end of a block comment can appear inside (`PD.exportHTML.safeJSON`). Factory sources get
`</script` and `<!--` broken with a backslash, a safety net, since `tools/lint.js` already forbids both in source files.

### When the export refuses

`PD.exportHTML` throws, and nothing is written, when:

- the deck does not compile (no such deck, no such theme…);
- an asset is not embedded (its `src` must start with `data:`);
- an object deck, an object theme or the asset map holds something JSON cannot carry (a function, `NaN`, a `Date`…): put
  code in a factory deck instead;
- a factory is native or bound, is not a function expression (`function (…) { … }` and arrow functions re-emit; method
  shorthand, as in `{ build() { … } }.build`, does not), or contains a marker text;
- the page is missing engine files, or a carried module depends on one left out.

## `PD.exportHTML(deckId?, opts?)`

Returns the file as a string. The page must have the deck's theme, assets and deck loaded (a deck folder's `index.html` does,
and so does `?export`). With no id it exports the only registered deck.

| Option | Meaning |
|---|---|
| `selfTest: true` | put `<script>window.PD_SELFTEST=1</script>` right after `<head>`: the file then tests itself instead of playing |
| `deck: DeckSource` | export this deck object instead of the registered one (its id must match) |
| `assets: map` | export these assets instead of the registered ones |

```js
PD.deck('export-demo', { format: 2, id: 'export-demo', meta: { title: 'Export <demo>', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'One file.' } }] });
PD.assets('export-demo', {});

var html = PD.exportHTML('export-demo');
console.log(html.slice(0, 15), html.indexOf('<title>Export &lt;demo&gt;</title>') > 0);   // <!doctype html> true
console.log(html.indexOf('/*PD:DECK-JSON:BEGIN*/') > 0, html.indexOf('PD.MANIFEST=PD.MANIFEST.filter') > 0);   // true true
console.log(html.indexOf('PD.module("core/validate"') < 0, html.indexOf('PD.module("core/stage"') > 0);   // true true
console.log(Math.round(html.length / 1024) + ' KB');   // 292 KB: the engine and the look; your pictures and fonts add to it
```

The Studio exports the project it holds in memory: `PD.exportHTML(project.deck.id, { deck: project.deck, assets })`.

### `PD.exportHTML.selfTest(html, { timeoutMs = 20000 })`

Plays a file once without showing it: it mounts the file in a hidden `<iframe srcdoc>` with `PD_SELFTEST` set. In that mode
the player turns off the animation loop, the keys, the address bar and the presenter link, waits for the assets, compiles
the deck and renders every moment of every scene once (`stage.still`), catching errors. It then reports to the parent
window. The promise never rejects; no answer in time counts as a failure.

```js
PD.deck('selftest-demo', { format: 2, id: 'selftest-demo', meta: { title: 'Self-test', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'Fine.' } },
           { id: 'b', template: 'not-a-template', props: {} }] });
PD.exportHTML.selfTest(PD.exportHTML('selftest-demo')).then(function (r) {
  console.log(r.ok, JSON.stringify(r.errors));   // false [{"slide":1,"step":0,"msg":"unknown template \"not-a-template\""}]
});
```

`errors` are `{ slide, step, msg }` with scenes counted from 0; `slide: -1` means the deck did not start at all. The Studio
runs this before every save and does not save a file that fails. The CLI runs it with `--self-test`.

### `PD.exportHTML.parse(html)`

Re-opens a file **without running it**: it finds the marker pairs and parses the JSON between them. This is how the Studio's
"Open a saved deck…" works.

```js
PD.deck('parse-demo', { format: 2, id: 'parse-demo', meta: { title: 'Parse me', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'Round trip.' } }] });
PD.deck('parse-hand', function (PD, h) {
  return { format: 2, id: 'parse-hand', meta: { title: 'By hand', theme: 'slate' }, scenes: [{ id: 'a', text: [{ str: 'Code', style: 'title' }] }] };
});
var back = PD.exportHTML.parse(PD.exportHTML('parse-demo'));
console.log(back.id, back.title, back.deck.scenes[0].props.line, back.handWritten);   // parse-demo Parse me Round trip. false
var hand = PD.exportHTML.parse(PD.exportHTML('parse-hand'));
console.log(hand.deck, hand.handWritten);   // null true
```

It returns `{ id, title, deck, assets, handWritten }`. A file made from a factory deck has assets markers but no deck
markers: `deck` is `null` and `handWritten` is `true`, and the Studio says "This deck was written by hand. Open it in a code
editor." It throws for a file that is not a pixeldeck presentation, or whose markers are missing, repeated or broken.

`PD.exportHTML.safeJSON(value)` is the escaping JSON writer described above:

```js
console.log(PD.exportHTML.safeJSON({ s: '</script> & */' }));   // {"s":"\u003c/script\u003e \u0026 \u002a/"}
```

## Register-only and self-test modes

- `?export` in a deck page's address: `PD.start` resolves `null` after everything is registered, and nothing plays. Any
  tool can then call `PD.exportHTML` (or `PD.compile`, `PD.validate`) on the page.
- `window.PD_SELFTEST = 1` set before `PD.start`: the self-test described above. The player posts
  `{ type: 'pd-selftest', ok, errors, ms }` to its parent window (or to itself without one).

---

## For maintainers: the regression baselines

The reference talk must render identically after any engine change (`tools/regression/README.md` describes the gate). The
baselines, about 330 MB of screenshots, are not in the repository (`.gitignore` lists `tools/regression/baselines/` and
`tools/regression/baseline-one-giant-leap/`), so generate them once on your own machine, from the project folder, with the
tools installed. They are captured from the archived talk deck (`_archive/`), never from a working copy:

```sh
# frames at 1280x720 and 1920x1080, and thumbnails → tools/regression/baselines/ogl/{1280,1920,thumbs} (a few minutes)
node tools/regression/golden.js --deck archive --all --out tools/regression/baselines/ogl --write-baseline
# the frame-cost reference that perf.js --baseline compares against (3 runs, several minutes)
node tools/regression/perf.js --deck archive --out tools/regression/baselines/ogl/perf.json --write-baseline
```

`--write-baseline` is required to write into `tools/regression/baselines/`, and only the archive deck may be written there.
Then check a candidate as `tools/regression/README.md` shows:

```sh
node tools/regression/golden.js --deck decks/one-giant-leap --all --out tools/regression/out/cand
node tools/regression/compare.js tools/regression/baselines/ogl tools/regression/out/cand   # exit 0 = identical
```

Baselines depend on the machine and its graphics driver: capture them and the candidate on the same computer.
