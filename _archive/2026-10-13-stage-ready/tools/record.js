#!/usr/bin/env node
/* pixeldeck — video backup recorder (dev tool; the deck itself needs none of this).
 *
 *   cd tools && npm install && npx playwright install chromium
 *   node record.js                       # → ../pixeldeck-backup.mp4 (frame-perfect, needs ffmpeg)
 *   node record.js --out talk.mp4 --fps 60 --dwell 4 --step-dwell 2.5
 *   node record.js --mode realtime --out talk.webm   # no ffmpeg needed, real-time capture
 *   node record.js --deck cinema                     # the cinematic deck (cinema/index.html)
 *
 * Modes
 *   frames   (default) The deck's clock is driven manually: each video frame
 *            advances time by exactly 1/fps and is screenshotted, then piped to
 *            ffmpeg. Perfectly smooth regardless of machine speed.
 *   canvas   (default for --deck cinema) The deck plays in real time on the
 *            GPU while the browser's own MediaRecorder captures the canvas
 *            (canvas.captureStream). Fast (runs in real time) and smooth;
 *            converted to MP4 with ffmpeg when available, else kept as WebM.
 *   realtime Playwright's built-in screen recording (WebM, ~25fps). Use when
 *            ffmpeg is not installed.
 *
 * Dwell: after each slide/step finishes animating, the recorder holds for
 *   slide.dwell seconds (from slides.js) — or --dwell N to force a value —
 *   and --step-dwell N (default 2.5) for sub-steps.
 */
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const ROOT = path.resolve(__dirname, '..');
const DECK = arg('deck', 'pixel');   // pixel | cinema
const MODE = arg('mode', DECK === 'cinema' ? 'canvas' : 'frames');
const FPS = +arg('fps', 30);
const W = +arg('width', 1920), H = +arg('height', 1080);
const FORCE_DWELL = arg('dwell', null);
const STEP_DWELL = +arg('step-dwell', 2.5);
const TAIL = +arg('tail', 2);
const BASE = DECK === 'cinema' ? 'cinema-backup' : 'pixeldeck-backup';
const OUT = path.resolve(process.cwd(), arg('out', path.join(ROOT, BASE + (MODE === 'realtime' ? '.webm' : '.mp4'))));
const URL = 'file://' + path.join(ROOT, DECK === 'cinema' ? 'cinema/index.html?quality=1' : 'index.html') + '#1.0';

// Prefer full Chromium with GPU acceleration (the cinematic deck is heavy in a
// software-rendered headless shell); fall back to the default browser.
async function launch() {
  if (DECK !== 'cinema') return chromium.launch();
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
      const dwell = FORCE_DWELL != null ? +FORCE_DWELL : (last ? (s.dwell != null ? s.dwell : 3) : STEP_DWELL);
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
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(URL);
  await page.waitForFunction(() => window.PixelDeck);
  await page.evaluate(() => PixelDeck.setManualClock(true));
  await page.waitForTimeout(1500);
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
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pixeldeck-'));
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => window.PixelDeck);
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
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(URL);
  await page.waitForFunction(() => window.PixelDeck);
  await page.waitForTimeout(2500);               // textures + glyph caches warm up
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

console.log(`pixeldeck recorder — deck=${DECK} mode=${MODE} ${W}x${H}${MODE === 'frames' ? ' @' + FPS + 'fps' : ''}`);
(MODE === 'realtime' ? recordRealtime() : MODE === 'canvas' ? recordCanvas() : recordFrames()).catch(e => { console.error(e); process.exit(1); });
