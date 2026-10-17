#!/usr/bin/env node
/* pixeldeck — video backup recorder (dev tool; the deck itself needs none of this).
 *
 *   cd tools && npm install && npx playwright install chromium
 *   node record.js --deck one-giant-leap             # → ../one-giant-leap-backup.mp4 (the cinematic deck)
 *   node record.js --deck pixel --out talk.mp4 --fps 60 --dwell 4 --step-dwell 2.5
 *   node record.js --deck pixel --mode realtime --out talk.webm   # no ffmpeg needed, real-time capture
 *   node record.js --deck ../decks/my-talk           # a deck folder (→ its index.html)
 *   node record.js --deck ~/Desktop/my-talk.html     # any deck .html (e.g. one saved from the Studio)
 *
 * --deck (default: pixel)
 *   one-giant-leap | ogl   decks/one-giant-leap/index.html
 *   pixel                  legacy/pixel/index.html (the original pixel-art deck)
 *   cinema                 cinema/index.html (pre-v2 location of the cinematic deck)
 *   <folder>               <folder>/index.html
 *   <file.html>            that file
 *   Paths resolve against the current directory first, then the project root.
 *
 * Output (--out, default <project root>/<name>-backup.mp4, where <name> is the
 *   deck folder or file name; pixel → pixeldeck-backup.mp4, cinema → cinema-backup.mp4).
 *   The presentation backups in the project root (cinema-backup.mp4,
 *   cinema-preview-720p.mp4, pixeldeck-backup.mp4) are never overwritten unless
 *   --force is given.
 *
 * Modes
 *   frames   (default for pixel) The deck's clock is driven manually: each video
 *            frame advances time by exactly 1/fps and is screenshotted, then piped
 *            to ffmpeg. Perfectly smooth regardless of machine speed.
 *   canvas   (default for every other deck) The deck plays in real time on the
 *            GPU while the browser's own MediaRecorder captures the canvas
 *            (canvas.captureStream). Fast (runs in real time) and smooth;
 *            converted to MP4 with ffmpeg when available, else kept as WebM.
 *            The stage canvas must be the page's first <canvas>.
 *   realtime Playwright's built-in screen recording (WebM, ~25fps). Use when
 *            ffmpeg is not installed.
 *
 * Ready: the recorder waits for PixelDeck.ready === true (decks without that
 *   field get a fixed 2.5 s warm-up instead).
 *
 * Dwell: after each slide/step finishes animating, the recorder holds for
 *   slide.dwell seconds (from the deck) — or --dwell N to force a value — and,
 *   for sub-steps, info()[i].stepDwell[k] when the deck provides it, else
 *   --step-dwell N (default 2.5).
 *
 * Exit 1 if the page throws an uncaught error while recording.
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function flag(name) { return process.argv.indexOf('--' + name) > 0; }
function die(msg) { console.error('record.js: ' + msg); process.exit(2); }
const ROOT = path.resolve(__dirname, '..');
const ALIASES = {
  'one-giant-leap': 'decks/one-giant-leap/index.html',
  ogl: 'decks/one-giant-leap/index.html',
  pixel: 'legacy/pixel/index.html',
  cinema: 'cinema/index.html'
};
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();   // macOS paths are case-insensitive
function resolveDeck(d) {
  if (Object.prototype.hasOwnProperty.call(ALIASES, d)) return path.join(ROOT, ALIASES[d]);
  if (d.startsWith('~/')) d = path.join(require('os').homedir(), d.slice(2));
  for (const base of [process.cwd(), ROOT]) {
    let p = path.resolve(base, d);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  die('deck not found: ' + d + ' (use one-giant-leap | pixel | cinema | <folder> | <file.html>)');
}
const DECK_ARG = arg('deck', 'pixel');
const DECK_FILE = resolveDeck(DECK_ARG);
const PIXEL = samePath(path.dirname(DECK_FILE), path.join(ROOT, 'legacy', 'pixel'));   // the legacy pixel-art deck
const NAME = PIXEL ? 'pixeldeck'
  : samePath(DECK_FILE, path.join(ROOT, 'cinema', 'index.html')) ? 'cinema'
  : /^index\.html?$/i.test(path.basename(DECK_FILE)) ? path.basename(path.dirname(DECK_FILE))
  : path.basename(DECK_FILE).replace(/\.html?$/i, '');
const MODE = arg('mode', PIXEL ? 'frames' : 'canvas');
const FPS = +arg('fps', 30);
const W = +arg('width', 1920), H = +arg('height', 1080);
const FORCE_DWELL = arg('dwell', null);
const STEP_DWELL = +arg('step-dwell', 2.5);
const TAIL = +arg('tail', 2);
const OUT = path.resolve(process.cwd(), arg('out', path.join(ROOT, NAME + '-backup' + (MODE === 'realtime' ? '.webm' : '.mp4'))));
const URL = pathToFileURL(DECK_FILE).href + (PIXEL ? '' : '?quality=1') + '#1.0';

// The presentation backups (spec §1.3, §2) stay untouched unless --force.
const PROTECTED = ['cinema-backup.mp4', 'cinema-preview-720p.mp4', 'pixeldeck-backup.mp4'].map(f => path.join(ROOT, f));
function guardOut(file) {
  if (!flag('force') && fs.existsSync(file) && PROTECTED.some(p => samePath(p, file)))
    die('refusing to overwrite ' + path.relative(ROOT, file) + ' (a presentation backup). Pass --out <file>, or --force to replace it.');
}
guardOut(OUT);

// Uncaught page errors are reported and make the run exit 1 (frames are still written).
const pageErrors = [];
function watch(page) {
  page.on('pageerror', e => { pageErrors.push(e.message); console.error('\npage error: ' + e.message); });
  return page;
}

// Spec §4.13: wait for PixelDeck.ready === true. Decks without the field get a fixed 2.5 s warm-up.
// With a manual clock nothing advances on its own, so tick(0) drives the warm-up (as the golden gate does).
async function waitReady(page, manual) {
  await page.waitForFunction(() => window.PixelDeck);
  if (manual) await page.evaluate(() => PixelDeck.setManualClock(true));
  const hasReady = await page.evaluate(() => typeof PixelDeck.ready === 'boolean');
  if (!hasReady) return page.waitForTimeout(2500);
  if (manual) {
    for (let i = 0; i < 4000 && !(await page.evaluate(() => PixelDeck.ready)); i++) await page.evaluate(() => PixelDeck.tick(0));
  }
  await page.waitForFunction(() => PixelDeck.ready === true, null, { timeout: 60000, polling: 100 });
}

// Prefer full Chromium with GPU acceleration (the cinematic decks are heavy in a
// software-rendered headless shell); fall back to the default browser.
async function launch() {
  if (PIXEL) return chromium.launch();
  try { return await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] }); }
  catch (e) { return chromium.launch(); }
}

function hasFfmpeg() {
  try { return spawnSync('ffmpeg', ['-version']).status === 0; } catch (e) { return false; }
}

async function plan(page) {
  const info = await page.evaluate(() => PixelDeck.info());
  const states = [];
  info.forEach((s, i) => {
    for (let k = 0; k <= s.steps; k++) {
      const last = k === s.steps;
      const stepDwell = s.stepDwell && s.stepDwell[k] != null ? +s.stepDwell[k] : STEP_DWELL;
      const dwell = FORCE_DWELL != null ? +FORCE_DWELL : (last ? (s.dwell != null ? s.dwell : 3) : stepDwell);
      states.push({ slide: i, step: k, id: s.id, dwell });
    }
  });
  return states;
}

async function recordFrames() {
  if (!hasFfmpeg()) {
    console.error('ffmpeg not found on PATH — falling back to --mode realtime (WebM).');
    return recordRealtime(OUT.replace(/\.\w+$/, '.webm'));
  }
  const browser = await launch();
  const page = watch(await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }));
  await page.goto(URL);
  await waitReady(page, true);
  const states = await plan(page);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  let frames = 0;
  const dt = 1 / FPS;
  async function frame() {
    // Advance the deck's clock one frame, then grab the composited frame.
    // (Don't read pixels back from the canvas: Chrome then demotes it to
    // software rendering and every frame gets ~10x slower.)
    await page.evaluate(d => PixelDeck.tick(d), dt);
    let buf;
    for (let attempt = 0; !buf; attempt++) {
      try { buf = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 20000 }); }
      catch (e) { if (attempt >= 3) throw e; process.stdout.write('(retry) '); await page.evaluate(() => PixelDeck.tick(0)); }
    }
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    frames++;
  }
  async function hold(seconds) { for (let i = 0; i < Math.round(seconds * FPS); i++) await frame(); }
  async function settle(maxSeconds) {
    for (let i = 0; i < maxSeconds * FPS; i++) {
      if (!(await page.evaluate(() => PixelDeck.isBusy()))) return;
      await frame();
    }
  }

  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (i > 0) await page.evaluate(() => PixelDeck.next());
    process.stdout.write(`  ${s.slide + 1}.${s.step} ${s.id || ''} `);
    await settle(30);
    await hold(s.dwell);
    process.stdout.write(`✓ (${(frames / FPS).toFixed(1)}s)\n`);
  }
  await hold(TAIL);
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log(`\nWrote ${OUT}  (${frames} frames, ${(frames / FPS).toFixed(1)}s @ ${FPS}fps, ${W}x${H})`);
}

async function recordRealtime(out) {
  out = out || OUT;
  guardOut(out);
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pixeldeck-'));
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const page = watch(await ctx.newPage());
  await page.goto(URL);
  await waitReady(page, false);
  const states = await plan(page);
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (i > 0) await page.keyboard.press('PageDown');
    process.stdout.write(`  ${s.slide + 1}.${s.step} ${s.id || ''} `);
    await page.waitForFunction(() => !PixelDeck.isBusy(), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(s.dwell * 1000);
    process.stdout.write('✓\n');
  }
  await page.waitForTimeout(TAIL * 1000);
  const video = page.video();
  await ctx.close();
  await video.saveAs(out);
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\nWrote ${out}`);
}

async function recordCanvas() {
  const browser = await launch();
  const page = watch(await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }));
  await page.goto(URL);
  await waitReady(page, false);                  // textures + glyph caches warm up
  const states = await plan(page);
  // start from a clean first slide, then begin capturing
  await page.evaluate(() => { location.hash = '#1.0'; });
  const mime = await page.evaluate((fps) => {
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=h264', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const type = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    const canvas = document.querySelector('canvas');
    window.__chunks = [];
    window.__rec = new MediaRecorder(canvas.captureStream(fps), { mimeType: type, videoBitsPerSecond: 24e6 });
    window.__rec.ondataavailable = e => { if (e.data.size) window.__chunks.push(e.data); };
    window.__rec.start(1000);
    return type;
  }, FPS);
  await page.keyboard.press('Home');             // replay the cold open from the very start
  const t0 = Date.now();
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    if (i > 0) await page.evaluate(() => PixelDeck.next());
    process.stdout.write(`  ${s.slide + 1}.${s.step} ${s.id || ''} `);
    await page.waitForFunction(() => !PixelDeck.isBusy(), null, { timeout: 60000, polling: 100 });
    await page.waitForTimeout(s.dwell * 1000);
    process.stdout.write(`✓ (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  }
  await page.waitForTimeout(TAIL * 1000);
  const b64 = await page.evaluate(() => new Promise(res => {
    window.__rec.onstop = () => {
      const blob = new Blob(window.__chunks, { type: window.__rec.mimeType });
      const fr = new FileReader();
      fr.onload = () => res(fr.result.slice(fr.result.indexOf(',') + 1));
      fr.readAsDataURL(blob);
    };
    window.__rec.stop();
  }));
  await browser.close();
  const ext = /mp4/.test(mime) ? '.mp4' : '.webm';
  const raw = OUT.replace(/\.\w+$/, '') + '.capture' + ext;
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  if (hasFfmpeg() && /\.mp4$/.test(OUT)) {
    // re-encode to a constant-frame-rate H.264 MP4 that every player handles
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-r', String(FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '17', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
    if (r.status === 0) { fs.unlinkSync(raw); console.log(`\nWrote ${OUT}  (captured as ${mime})`); return; }
  }
  console.log(`\nWrote ${raw}  (${mime})`);
}

if (!/^(frames|canvas|realtime)$/.test(MODE)) die('unknown --mode ' + MODE + ' (frames | canvas | realtime)');
const deckLabel = path.relative(ROOT, DECK_FILE).startsWith('..') ? DECK_FILE : path.relative(ROOT, DECK_FILE);
console.log(`pixeldeck recorder — deck=${deckLabel} mode=${MODE} ${W}x${H}${MODE === 'frames' ? ' @' + FPS + 'fps' : ''}`);
(MODE === 'realtime' ? recordRealtime() : MODE === 'canvas' ? recordCanvas() : recordFrames()).then(() => {
  if (pageErrors.length) { console.error(`\n${pageErrors.length} page error(s) while recording.`); process.exit(1); }
}, e => { console.error(e); process.exit(1); });
