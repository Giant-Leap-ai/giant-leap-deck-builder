# Regression gate (WP0)

Tools that prove the One Giant Leap deck still renders **identically** while the engine is rebuilt
(spec `docs/v2-spec.md` §8.1, §8.3, P1). Everything here is dev-only Node tooling; the decks never load it.

| File | What it does |
|---|---|
| `golden.js` | Deterministic capture: frames at 1280×720 / 1920×1080, notes thumbnails, `rng.json` |
| `compare.js` | EXACT gate: SHA-1 per frame + `Math.random` count per capture; tolerance report via `diff.py` |
| `diff.py` | Tolerance report (mean abs diff < 1.5 and < 0.5 % of pixels off by > 24 levels) |
| `perf.js` | Real-time p95 `workMs` per state against `baselines/ogl/perf.json` |
| `stall.js` | Stage frame gaps per state with the presenter window open |
| `protected-digest.sh` | Digest of the paths no package may change |
| `baselines/ogl/` | The reference, captured from the talk deck in `_archive/` (see below) |
| `baseline-one-giant-leap/` | The historical 84-frame capture. Read-only; never edit |

Playwright 1.56.1 lives in `tools/node_modules`. Every tool launches
`chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'] })` (full Chromium, GPU, headless).
Run them from ROOT. Output defaults to `tools/regression/out/` (git-ignored).

## The gate in four commands

```sh
# 1. capture the candidate (frames 1280 + 1920, thumbs) — ~90 s
node tools/regression/golden.js --deck decks/one-giant-leap --all --out tools/regression/out/cand
# 2. EXACT compare against the archive baseline (1280, 1920, thumbs)
node tools/regression/compare.js tools/regression/baselines/ogl tools/regression/out/cand
#    milestones that gate only 1280 + thumbs:
node tools/regression/compare.js tools/regression/baselines/ogl tools/regression/out/cand --only 1280,thumbs
# 3. frame cost (≈ 6 min for 3 runs)
node tools/regression/perf.js --deck decks/one-giant-leap --baseline tools/regression/baselines/ogl/perf.json
# 4. presenter-window stalls (v2: N must open notes in its own process)
node tools/regression/stall.js --deck decks/one-giant-leap --notes key
```

`--deck` takes an `.html` file, a deck folder (→ its `index.html`) or an alias:
`archive` (the talk deck, baseline only), `cinema`, `one-giant-leap` / `ogl`, `pixel`.

## golden.js: capture procedure (identical for baseline and candidate)

1. Fresh browser context, viewport 1280×720 (or 1920×1080), DPR 1.
2. Init script: `requestAnimationFrame = () => 0`; `Math.random` = mulberry32 seeded 1234567, and every
   call does `window.__rng = (window.__rng|0) + 1`. The generator is byte-for-byte the one the historical
   84 frames were captured with.
3. Open `file://<deck>?quality=1#1.0`, wait for `window.PixelDeck`, `setManualClock(true)`, wait 300 ms,
   `tick(0)` × 400, then `tick(0)` while `PixelDeck.ready === false` (≤ 2000; skipped when `ready` is
   undefined, as on the archive).
4. For every state in order (`next()` between states): advance 0.6 s → `t0.6`, 0.9 s → `t1.5`,
   1.5 s → `t3`; then advance 0.2 s while `isBusy()` (≤ 600×) and 0.5 s more → `rest`.
   "Advance a" = `tick(1/30)` until `a − 1e-9`. A capture is a page screenshot plus `__rng`.
5. Extra paths, each followed by `rest` (setup moves are settled the same way, without a capture):
   `goto-7.4` = `goTo(6,4)` · `prev-from-8.1` = `goTo(7,1)`, settle, `prev()` ·
   `replay-10` = `goTo(9,0)`, settle, key `r` · `home-from-6.0` = `goTo(5,0)`, settle, key `Home`.
   Skipped (with a note in `meta.json`) for decks without those states, or with `--no-extra`.
6. Thumbs (`--thumbs`): a fresh context with the same init script; open the deck as in step 3 but
   without any `tick`; then in the page `cv = document.createElement('canvas')` and the adapter
   - archive / legacy globals: `new Stage(cv, {thumb: true})`
   - v2 (when `PD.Stage` and `PD.compile` exist): `new PD.Stage(cv, {deck: PD.compile(id), thumb: true})`,
     `id` = `PixelDeck.deck().id` (else the only registered deck)
   - or `--adapter '<JS expression using cv>'`

   `resize(480, 270, 1)`, then for every state `still(si, step)` and `cv.toDataURL()` → PNG.

Each capture directory holds the PNGs, `rng.json` (`[{file, rng}]` in capture order; `rng` is the
cumulative call count) and `meta.json` (deck, size, browser, page errors; no timestamps, so two
captures of the same deck are byte-identical directories). File names: frames
`NNN_<scene>.<step>_t0.6|t1.5|t3|rest.png` (scene 1-based) and `NNN_<label>_rest.png` for extra paths;
thumbs `NNN_<scene>.<step>.png`. Existing `*.png`, `rng.json`, `meta.json` in `--out` are replaced.
Exit 1 if the page threw (frames are still written).

**Write guards.** No tool here writes under `_archive/` (spec P2) or into `baseline-one-giant-leap/`.
Writing into `baselines/` needs `--write-baseline` and is refused for any deck outside `_archive/`
(the talk deck is only ever the baseline; a candidate can never overwrite the reference).

## compare.js

`node tools/regression/compare.js <baselineDir> <candidateDir> [--out diffDir] [--subset] [--only a,b]`

- A directory with PNGs is one capture. A directory without PNGs is a root: every baseline
  sub-directory with PNGs is compared (`1280`, `1920`, `thumbs`); a missing candidate sub-directory fails.
- Prints `EXACT OK …` or `EXACT FAIL (n frames; RNG drift at capture k (file: base → cand))`, the
  changed/missing/extra files, then `diff.py`'s DIFF lines and summary; difference images go to `--out`.
- **Exit codes: 0 exact · 1 different · 2 within tolerance** (not exact, but the same frame list and every
  frame within `diff.py`'s thresholds; RNG drift alone with identical pixels also gives 2) · 3 usage error.
- `--subset` compares only files present in the baseline and skips RNG if the baseline has no `rng.json`
  (used for the historical 84 frames).

## perf.js

Real-time GPU run, 1920×1080 at DPR 1, `?quality=1.5`, seeded `Math.random` (no RAF stub, no manual
clock). After `PixelDeck.ready` (legacy decks: 2.5 s) it presses Home (1.0 replays live) and calls
`next()` through every state, holding each until `!isBusy()` plus `--dwell` (1 s). A RAF wrapper samples
`PixelDeck.state().workMs` after every frame; the per-state **p95** is the gated number, with the raw
frame-callback duration and the frame gap reported alongside. `--runs` (default 3) fresh pages; each
statistic is the median over runs. `--baseline` fails a state when `p95 > base × 1.10 + 0.5 ms`.

`baselines/ogl/perf.json` was recorded from the archive with 3 runs. Across those runs the per-state
p95 varied by at most 0.95 ms (max − min, state 5.0). Noise check: the pre-migration copy
`cinema/index.html` measured against the baseline (3 runs) passed every state; the tightest margin was
state 5.0 (8.35 ms against a limit of 9.23 ms). These are headless numbers; compare like with like.

## stall.js

`node tools/regression/stall.js --deck <deck> --notes key|separate|none [--passes N] [--report-only]`

Real-time GPU run at 1920×1080. A RAF wrapper on the stage page records the gap between consecutive
frame timestamps, labelled with the current state. After ready it opens the presenter window
(`key`: press N on the stage; `separate`: open `notes.html` next to the deck — else `<deck>?notes` — as
its own page, as when double-clicked), brings the stage to the front, waits 3 s, then holds 1.0 and
`next()`s through every state (hold = until `!isBusy()` + 1 s). Gaps while the window opens are reported
as state `open`. **Gate: exit 1 if any gap is above `--max-gap` (50 ms)**, unless `--report-only`.
It also records whether the notes window has `window.opener` (same thread as the stage) and the
notes window's position text at the end, which shows it really followed the stage.

## Baselines (`baselines/ogl/`)

Captured on 2026-10-13 from `_archive/2026-10-13-stage-ready/cinema/index.html` (read-only) on the
presenting M2 Mac, Chromium 141.0.7390.37 (Playwright 1.56.1), headless with `--use-angle=metal`:

| Dir | Content |
|---|---|
| `1280/` | 88 frames: 21 states × 4 + 4 extra paths, `rng.json`, `meta.json` |
| `1920/` | the same at 1920×1080 |
| `thumbs/` | 21 thumbnails at 480×270 (`new Stage(cv, {thumb:true})`), `rng.json`, `meta.json` |
| `perf.json` | p95 `workMs` per state, 3 runs |
| `stall-archive-separate.json` | frame gaps, notes opened as a separate page, 2 passes |
| `stall-archive-key.json` | frame gaps, notes opened with N (same-thread popup), 2 passes |

Verification done when the baselines were captured (WP0 acceptance):

- **Determinism:** a second full capture (`--all`) into a scratch directory was byte-identical to
  `baselines/ogl/` — `diff -r` printed nothing (frames, thumbs, `rng.json`, `meta.json`); `compare.js`
  exit 0 on 1280, 1920 and thumbs.
- **Pre-migration deck:** `cinema/index.html` captured with the same procedure is EXACT against the
  archive baseline on 1280, 1920 and thumbs, RNG equal at all 197 captures (exit 0).
- **Historical 84 frames:** all 84 frames of `baseline-one-giant-leap/` have the same SHA-1 as their
  counterparts in `baselines/ogl/1280/` (`compare.js --subset`, exit 0). No `NOTE.md` was needed.
- RNG counts at the end of the 1280 run: 77417 after state 10.0, 142009 after the last extra path.

### Archive stall numbers (acceptance #5)

Maximum stage frame gap in ms per state, headless Chromium at 1920×1080 (normal frame ≈ 17.7 ms).
Pass 1 = notes window cold; pass 2 = Home, then the same run with warm notes caches.

| state | separate page, pass 1 | pass 2 | **N (same-thread popup), pass 1** | pass 2 |
|---|---|---|---|---|
| open notes | 32.3 | – | **199.3** | – |
| 1.0 | 17.7 | 18.7 | 17.7 | 17.6 |
| 2.0 | 17.8 | 17.7 | **83.3** | 17.7 |
| 3.0 | 17.8 | 17.7 | 17.7 | 17.8 |
| 3.1 | 17.7 | 18.6 | **166.7** | 17.7 |
| 4.0 | 17.8 | 18.2 | **333.3** | 17.7 |
| 4.1 | 17.8 | 17.7 | **83.4** | 17.7 |
| 5.0 | 17.7 | 17.8 | **66.6** | 33.3 |
| 6.0 – 10.0 | ≤ 17.8 | ≤ 17.8 | ≤ 34.1 | ≤ 17.8 |
| **worst** | **32.3** (open) | 18.7 | **333.3 at 4.0** | 33.3 |

- The N case reproduces the talk-day stall: **333.3 ms at 4.0** (and 166.7 ms at 3.1). Two more N runs
  gave 333.9 ms and 334.0 ms at 4.0, so the tool reliably detects it. In gate mode (no `--report-only`)
  the N run exits 1 (`STALL FAIL: 334 ms gap at 4.0`) and the separate-page run exits 0 (worst 34 ms).
- The notes window really followed the stage in every run (it ended on "10 / 10", "LINKED TO STAGE");
  `window.opener` was `true` for N and `false` for the separate page.
- **Noise, honestly:** an earlier separate-page recording (since replaced) had a 40.9 ms gap while the
  window opened — another browser was being launched on the machine at that moment — and, in its
  warm second pass, isolated gaps of 50.1 ms (4.1) and 66.8 ms (6.0) with nothing else of ours running.
  Isolated frames just over 50 ms can therefore happen in headless real-time runs even without a
  same-thread presenter window. Run the gate on an otherwise idle machine; if a single isolated gap
  just over the limit appears, re-run before concluding there is a regression. The threshold itself
  was not tuned.

## Unit and e2e test runners (`tools/test/`)

- `node tools/test/run.js [--grep re] [--headed] [--spec file]… [--timeout ms]` writes
  `tools/test/.harness.html` (git-ignored) that loads `engine/pixeldeck.js`, `themes/*/theme.js`,
  `decks/*/theme.js`, `decks/*/assets.js`, `decks/*/deck.js`, `tools/test/assert.js` and
  `tools/test/specs/*.test.js` (each group alphabetical; absent groups are skipped), opens it from
  `file://` in Chromium and prints `ok` / `not ok` lines. Exit 1 on any failure, on an uncaught error
  while loading or running, or when `--grep` selects nothing.
- Spec API: `T.test(name, fn(a) → void|Promise, { timeout }?)` with `a.ok`, `a.equal`, `a.deepEqual`,
  `a.throws(fn, re)`, `a.near(x, y, eps)`, plus `a.rejects`, `a.fail`, `T.skip`, `T.withTimeout`.
  Name spec files `specs/wpN-*.test.js` after your package.
- `node tools/test/e2e.js [file…] [--grep re] [--headed] [--timeout ms]` runs `tools/test/e2e/*.e2e.js`;
  each module exports `async (page, ctx) => {}` or an object of named tests. Every test gets a fresh
  context and page; `ctx` has `url(rel, suffix)`, `path()`, `assert`, `newPage()`, `newContext()`,
  `seedScript`, `sleep`, `log`, `tmp` and `pageErrors` (uncaught page errors fail the test unless
  `ctx.expectPageErrors = true`). See the header of `e2e.js`.
