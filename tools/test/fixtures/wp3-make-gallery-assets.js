#!/usr/bin/env node
/* tools/test/fixtures/wp3-make-gallery-assets.js — regenerates decks/_gallery/assets.js (WP3, dev-only).
 *
 *   node tools/test/fixtures/wp3-make-gallery-assets.js [--out file]
 *
 * The gallery deck needs pictures that ship inside the repo with no licence question, so they are drawn here: two
 * "photographs" (a dusk mountain range, a night harbour) and a transparent wordmark logo, all procedural and seeded
 * (the output is deterministic for one Chromium build). The drawing runs in headless Chromium (a canvas) and the result
 * is written as the deck's assets file: PD.assets('gallery', { id: { type: 'image', src: 'data:…', w, h, name, bytes } }).
 * Playwright comes from tools/node_modules. Nothing here is loaded by a deck at runtime. */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const { chromium } = require(path.join(ROOT, 'tools', 'node_modules', 'playwright'));
const out = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(ROOT, 'decks', '_gallery', 'assets.js');

/* runs in the page */
function draw() {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise1(seed) {                       // smooth 1-D value noise, octaves summed
    const r = rng(seed), v = []; for (let i = 0; i < 512; i++) v.push(r());
    const sm = t => t * t * (3 - 2 * t);
    const n = x => { const i = Math.floor(x), f = x - i; return v[i & 511] * (1 - sm(f)) + v[(i + 1) & 511] * sm(f); };
    return (x, oct) => { let s = 0, a = 0.5, f = 1, tot = 0; for (let o = 0; o < (oct || 5); o++) { s += a * n(x * f); tot += a; a *= 0.5; f *= 2.1; } return s / tot; };
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

  function grain(x, w, h, amt, seed) {
    const img = x.getImageData(0, 0, w, h), d = img.data, r = rng(seed);
    for (let i = 0; i < d.length; i += 4) { const n = (r() + r() + r() - 1.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(img, 0, 0);
  }

  /* ---- A: dusk mountain range */
  function ridge() {
    const W = 1920, H = 1080, c = mk(W, H), x = c.getContext('2d'), r = rng(11);
    const hor = H * 0.70;
    let g = x.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, '#0c0f2e'); g.addColorStop(0.30, '#2c2766'); g.addColorStop(0.52, '#8a4577'); g.addColorStop(0.72, '#e0805f'); g.addColorStop(0.88, '#ffb878'); g.addColorStop(1, '#ffd9a0');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // stars high up
    for (let i = 0; i < 160; i++) { const sy = r() * H * 0.34, a = (1 - sy / (H * 0.34)) * 0.7 * r(); x.fillStyle = `rgba(255,240,230,${a.toFixed(3)})`; const s = r() < 0.1 ? 2 : 1; x.fillRect(r() * W, sy, s, s); }
    // sun glow
    const sx = W * 0.64, sy = hor - 30;
    for (const [rad, a] of [[900, 0.42], [420, 0.5], [150, 0.9]]) {
      const rg = x.createRadialGradient(sx, sy, 0, sx, sy, rad); rg.addColorStop(0, `rgba(255,226,170,${a})`); rg.addColorStop(0.35, `rgba(255,170,110,${a * 0.38})`); rg.addColorStop(1, 'rgba(255,120,90,0)');
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
    }
    // long soft clouds
    x.save(); x.filter = 'blur(14px)';
    for (let i = 0; i < 16; i++) {
      const cy = H * (0.14 + r() * 0.42), cx = r() * W, cw = 280 + r() * 700, chh = 8 + r() * 26;
      const warm = cy / (H * 0.56); x.fillStyle = rgba(mix([120, 100, 190], [255, 160, 130], warm), 0.10 + r() * 0.2);
      x.beginPath(); x.ellipse(cx, cy, cw, chh, -0.04, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    // mountain layers, far to near
    const layers = [
      { base: hor - 150, amp: 150, f: 0.0016, col: [150, 100, 150], seed: 3, haze: 0.0 },
      { base: hor - 85, amp: 175, f: 0.0021, col: [112, 76, 124], seed: 5, haze: 0.5 },
      { base: hor - 20, amp: 190, f: 0.0027, col: [78, 52, 98], seed: 8, haze: 0.45 },
      { base: hor + 70, amp: 200, f: 0.0034, col: [48, 34, 72], seed: 13, haze: 0.4 },
      { base: hor + 160, amp: 150, f: 0.0046, col: [24, 18, 40], seed: 21, haze: 0.3 }
    ];
    layers.forEach((L, li) => {
      const nz = noise1(L.seed);
      const pts = [];
      for (let px = 0; px <= W; px += 3) {
        const n = nz(px * L.f + li * 7.3, 6);
        const peak = Math.pow(Math.abs(nz(px * L.f * 0.55 + 40, 3) - 0.5) * 2, 0.8);
        pts.push([px, L.base - (n - 0.35) * L.amp * 1.7 - peak * L.amp * 0.55]);
      }
      x.beginPath(); x.moveTo(0, H); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(W, H); x.closePath();
      const top = Math.min(...pts.map(p => p[1]));
      const fg = x.createLinearGradient(0, top, 0, H);
      const haze = mix(L.col, [255, 176, 130], 0.5 * (1 - li / 5));
      fg.addColorStop(0, rgba(mix(L.col, haze, 0.55), 1)); fg.addColorStop(0.35, rgba(L.col, 1)); fg.addColorStop(1, rgba(mix(L.col, [8, 6, 20], 0.7), 1));
      x.fillStyle = fg; x.fill();
      // warm rim light along the ridge, facing the sun
      x.save(); x.clip();
      x.strokeStyle = rgba([255, 190, 140], 0.22 * (1 - li / 6)); x.lineWidth = 2; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke();
      // mist at the foot of this layer
      const mg = x.createLinearGradient(0, top + L.amp * 0.5, 0, top + L.amp * 1.7);
      mg.addColorStop(0, 'rgba(255,170,130,0)'); mg.addColorStop(0.5, `rgba(255,170,130,${L.haze * 0.5})`); mg.addColorStop(1, 'rgba(255,170,130,0)');
      x.fillStyle = mg; x.fillRect(0, top, W, L.amp * 2);
      x.restore();
    });
    // pines in the foreground
    x.fillStyle = '#0a0814';
    for (let i = 0; i < 70; i++) {
      const left = r() < 0.5, px = left ? r() * 520 : W - r() * 520, base = H - 30 + r() * 60, hh = 90 + r() * 240, ww = hh * (0.18 + r() * 0.06);
      x.beginPath(); x.moveTo(px, base - hh);
      for (let k = 1; k <= 7; k++) { const yy = base - hh + hh * k / 7, wr = ww * (k / 7); x.lineTo(px + wr, yy - 6); x.lineTo(px + wr * 0.55, yy - 6); }
      x.lineTo(px + ww * 0.1, base); x.lineTo(px - ww * 0.1, base);
      for (let k = 7; k >= 1; k--) { const yy = base - hh + hh * k / 7, wr = ww * (k / 7); x.lineTo(px - wr * 0.55, yy - 6); x.lineTo(px - wr, yy - 6); }
      x.closePath(); x.fill();
    }
    x.fillRect(0, H - 40, W, 40);
    grain(x, W, H, 5, 99);
    return c;
  }

  /* ---- B: a harbour at night */
  function harbor() {
    const W = 1920, H = 1080, c = mk(W, H), x = c.getContext('2d'), r = rng(23);
    const hor = H * 0.60;
    let g = x.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, '#05070e'); g.addColorStop(0.5, '#0b1727'); g.addColorStop(0.86, '#18394c'); g.addColorStop(1, '#2f6a74');
    x.fillStyle = g; x.fillRect(0, 0, W, hor);
    g = x.createLinearGradient(0, hor, 0, H);
    g.addColorStop(0, '#16373f'); g.addColorStop(0.18, '#0d2230'); g.addColorStop(1, '#03070c');
    x.fillStyle = g; x.fillRect(0, hor, W, H - hor);
    for (let i = 0; i < 90; i++) { const sy = r() * hor * 0.6, a = (1 - sy / (hor * 0.6)) * 0.55 * r(); x.fillStyle = `rgba(230,240,255,${a.toFixed(3)})`; x.fillRect(r() * W, sy, 1, 1); }
    // a warm haze over the city
    let rg = x.createRadialGradient(W * 0.52, hor + 20, 0, W * 0.52, hor + 20, 1000); rg.addColorStop(0, 'rgba(255,170,96,0.34)'); rg.addColorStop(0.45, 'rgba(255,120,80,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.fillRect(0, 0, W, hor);
    // skyline: three depths, nearer ones darker and sharper
    const lights = [];
    function skyline(depth, shade, density) {
      let px = -30;
      while (px < W + 30) {
        const bw = (22 + r() * 80) * (1.1 - depth * 0.3), tall = r() < 0.10 && depth === 0;
        const bh = (tall ? 200 + r() * 250 : 30 + r() * 170 * Math.sin(Math.min(1, Math.max(0, px / W)) * Math.PI) + 18) * (1 - depth * 0.35);
        x.fillStyle = hex(shade[0] + r() * 6, shade[1] + r() * 6, shade[2] + r() * 8);
        x.fillRect(px, hor - bh, bw, bh + 4);
        for (let wy = hor - bh + 8; wy < hor - 4; wy += 9) for (let wx = px + 5; wx < px + bw - 6; wx += 8) {
          if (r() < density) {
            const a = (0.3 + r() * 0.6) * (1 - depth * 0.45), warm = r() < 0.78;
            x.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${110 + r() * 60 | 0},${a})` : `rgba(170,225,255,${a * 0.8})`;
            x.fillRect(wx, wy, 3, 4);
            if (depth === 0 && r() < 0.05) lights.push([wx, warm]);
          }
        }
        if (tall) { x.fillStyle = 'rgba(255,70,70,0.95)'; x.fillRect(px + bw / 2 - 1, hor - bh - 12, 3, 3); lights.push([px + bw / 2, 2]); }
        px += bw + 1 + r() * 6;
      }
    }
    skyline(2, [20, 38, 50], 0.12);
    // mist between the depths
    g = x.createLinearGradient(0, hor - 240, 0, hor + 4); g.addColorStop(0, 'rgba(60,120,130,0)'); g.addColorStop(1, 'rgba(70,135,140,0.28)'); x.fillStyle = g; x.fillRect(0, hor - 240, W, 244);
    skyline(1, [13, 24, 36], 0.2);
    g = x.createLinearGradient(0, hor - 160, 0, hor + 4); g.addColorStop(0, 'rgba(50,100,115,0)'); g.addColorStop(1, 'rgba(60,115,125,0.22)'); x.fillStyle = g; x.fillRect(0, hor - 160, W, 164);
    skyline(0, [8, 13, 21], 0.27);
    for (let i = 0; i < 26; i++) { const lx = 40 + i * 74 + r() * 30; lights.push([lx, 1]); x.fillStyle = 'rgba(255,220,160,0.95)'; x.fillRect(lx - 1.5, hor + 8, 3, 3); }
    // the quay's edge
    x.fillStyle = 'rgba(2,6,10,0.85)'; x.fillRect(0, hor + 2, W, 7);
    // reflections: continuous wavering columns of light
    x.save(); x.globalCompositeOperation = 'lighter';
    lights.forEach(L => {
      const col = L[1] === 2 ? [255, 70, 70] : L[1] === 1 || L[1] === true ? [255, 196, 120] : [160, 220, 255];
      const rh = 120 + r() * 360, lw = 7 + r() * 11, ph = r() * 6;
      for (let y = 0; y < rh; y += 2) {
        const k = 1 - y / rh, wob = Math.sin(y * 0.05 + ph) * (0.8 + y * 0.016) + Math.sin(y * 0.17 + ph * 2) * 0.8;
        x.fillStyle = rgba(col, 0.06 * k * k + 0.003); x.fillRect(L[0] + wob - lw * (1 + y / rh) / 2, hor + 10 + y, lw * (1 + y / rh * 1.6), 2);
      }
    });
    x.restore();
    // ripples
    x.save(); x.globalAlpha = 0.06;
    for (let i = 0; i < 420; i++) { const yy = hor + 14 + Math.pow(r(), 1.5) * (H - hor), ww = 30 + r() * 170 * (1 + (yy - hor) / 300); x.fillStyle = r() < 0.5 ? '#9ad4e2' : '#02060a'; x.fillRect(r() * W, yy, ww, 1 + (yy - hor) / 300); }
    x.restore();
    // out-of-focus lamps: large, soft, mostly warm
    x.save(); x.globalCompositeOperation = 'lighter'; x.filter = 'blur(7px)';
    for (let i = 0; i < 16; i++) {
      const rr = 34 + Math.pow(r(), 1.6) * 92, bx = r() * W, by = hor - 250 + r() * 380, warm = r() < 0.75, col = warm ? [255, 176, 98] : [120, 200, 235];
      const bg = x.createRadialGradient(bx, by, 0, bx, by, rr); bg.addColorStop(0, rgba(col, 0.07)); bg.addColorStop(0.8, rgba(col, 0.085)); bg.addColorStop(0.95, rgba(col, 0.13)); bg.addColorStop(1, rgba(col, 0));
      x.fillStyle = bg; x.beginPath(); x.arc(bx, by, rr, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    rg = x.createRadialGradient(W / 2, H * 0.52, H * 0.34, W / 2, H * 0.52, W * 0.72); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
    grain(x, W, H, 4, 7);
    return c;
  }

  /* ---- C: a wordmark logo on a transparent background */
  function logo() {
    const W = 1200, H = 400, c = mk(W, H), x = c.getContext('2d');
    // the mark: a 4 x 4 pixel grid that leaps up and to the right
    const cell = 58, gap = 12, ox = 40, oy = 54;
    const on = ['0001', '0011', '0111', '1100'.split('').reverse().join('') && '1110'];
    const rows = ['0001', '0010', '0110', '1100'];
    for (let ry = 0; ry < 4; ry++) for (let rx = 0; rx < 4; rx++) {
      const px = ox + rx * (cell + gap), py = oy + ry * (cell + gap), lit = rows[ry][rx] === '1';
      const t = (rx + (3 - ry)) / 6;
      const g = x.createLinearGradient(px, py, px + cell, py + cell);
      if (lit) { g.addColorStop(0, `rgb(255,${236 - 40 * t | 0},${200 - 60 * t | 0})`); g.addColorStop(1, `rgb(255,${170 + 20 * t | 0},${70 + 30 * t | 0})`); }
      else { g.addColorStop(0, 'rgba(255,214,160,0.20)'); g.addColorStop(1, 'rgba(255,214,160,0.08)'); }
      x.fillStyle = g; x.beginPath(); x.roundRect(px, py, cell, cell, 14); x.fill();
    }
    // the word
    x.font = '700 168px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
    x.textBaseline = 'alphabetic';
    const tx = 380, ty = 262;
    const tg = x.createLinearGradient(0, ty - 130, 0, ty + 20); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#f0d9b8');
    x.fillStyle = tg;
    let cx = tx; for (const ch of 'pixeldeck') { x.fillText(ch, cx, ty); cx += x.measureText(ch).width - 3; }
    // an accent underline
    const ug = x.createLinearGradient(tx, 0, tx + 640, 0); ug.addColorStop(0, '#ffb35c'); ug.addColorStop(1, 'rgba(255,179,92,0)');
    x.fillStyle = ug; x.fillRect(tx + 4, ty + 52, 640, 6);
    return c;
  }

  const res = {};
  res.ridge = { url: ridge().toDataURL('image/jpeg', 0.84), w: 1920, h: 1080 };
  res.harbor = { url: harbor().toDataURL('image/jpeg', 0.84), w: 1920, h: 1080 };
  res.logo = { url: logo().toDataURL('image/png'), w: 1200, h: 400 };
  return res;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const res = await page.evaluate(`(${draw.toString()})()`);
    const names = { ridge: 'Dusk ridge (procedural)', harbor: 'Night harbour (procedural)', logo: 'Wordmark (procedural, transparent)' };
    const lines = [];
    for (const id of ['ridge', 'harbor', 'logo']) {
      const a = res[id], bytes = Math.round((a.url.length - a.url.indexOf(',') - 1) * 3 / 4);
      console.log(id, a.w + 'x' + a.h, bytes + ' bytes');
      lines.push(`  ${id}: { type: 'image', name: ${JSON.stringify(names[id])}, w: ${a.w}, h: ${a.h}, bytes: ${bytes},\n    src: ${JSON.stringify(a.url)} }`);
    }
    const body = `/* decks/_gallery/assets.js — the gallery deck's embedded pictures (spec §4.8, P5): data: URLs only.
 * Generated by tools/test/fixtures/wp3-make-gallery-assets.js (procedural drawings: no photographs, no licence issues):
 *   ridge   a dusk mountain range, 1920 x 1080 JPEG     harbor   a night harbour, 1920 x 1080 JPEG
 *   logo    a transparent wordmark, 1200 x 400 PNG */
PD.assets('gallery', {
${lines.join(',\n')}
});
`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, body);
    console.log('wrote', path.relative(ROOT, out), Math.round(body.length / 1024) + ' KB');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
