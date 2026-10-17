/* tools/test/e2e/wp1-player.e2e.js — M6 Player on real pages (spec §3.4 shims, §4.10 Player and keys, §4.11 Sync and
 * presenter notes, §4.13 PixelDeck; WP1 acceptance #4 noopener, #5 two stages + one notes window).
 *   node tools/test/e2e.js wp1-player */
'use strict';
const fs = require('fs');

const DECK = 'decks/one-giant-leap/index.html', NOTES = 'decks/one-giant-leap/notes.html';
// spec §3.4, exact
const SHIM = '<!doctype html>\n' +
  '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>One Giant Leap</title></head><body>\n' +
  '<script src="../../engine/pixeldeck.js"></script>\n' +
  '<script src="theme.js"></script>          <!-- OGL only; other decks: ../../themes/<id>/theme.js -->\n' +
  '<script src="assets.js"></script>\n' +
  '<script src="deck.js"></script>\n' +
  "<script>PD.start('one-giant-leap');</script>\n" +
  '</body></html>\n';

async function openStage(page, ctx, hash) {
  await page.goto(ctx.url(DECK, hash || '#1.0'));
  await page.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: 15000 });
}
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);

module.exports = {
  'shims (§3.4) and page: exact shim files; the page CSS is cinema/index.html\'s rules; canvas first, HUD after it; pointer, F, G': async (page, ctx) => {
    const A = ctx.assert;
    A.equal(fs.readFileSync(ctx.path(DECK), 'utf8'), SHIM, 'index.html is the §3.4 shim');
    A.equal(fs.readFileSync(ctx.path(NOTES), 'utf8'), SHIM.replace("PD.start('one-giant-leap');", "PD.start('one-giant-leap', { mode: 'notes' });"),
      'notes.html is identical except for the last line');
    const cinema = fs.readFileSync(ctx.path('cinema', 'index.html'), 'utf8');
    const rules = cinema.slice(cinema.indexOf('<style>') + '<style>\n'.length, cinema.indexOf('</style>'));
    await openStage(page, ctx, '#2.0');
    const r = await page.evaluate(() => ({
      css: document.querySelector('style[data-pd-hud="page"]').textContent,
      kids: Array.from(document.body.children).filter(e => e.tagName !== 'SCRIPT').map(e => e.tagName + '#' + e.id + '.' + e.className),
      firstCanvas: document.querySelector('canvas').id, canvases: document.querySelectorAll('canvas').length,
      cursor: getComputedStyle(document.querySelector('canvas')).cursor,
      size: [document.querySelector('canvas').style.width, document.querySelector('canvas').style.height, innerWidth, innerHeight]
    }));
    A.equal(r.css, rules, 'hud.js injects exactly the rules of today\'s cinema/index.html');
    A.deepEqual(r.kids, ['CANVAS#stage.', 'DIV#fps.hud', 'DIV#goto.hud', 'DIV#toast.hud'], 'canvas first, then the HUD (as the old page)');
    A.deepEqual([r.firstCanvas, r.canvases], ['stage', 1], 'the stage canvas is the page\'s first (and only) canvas');
    A.equal(r.cursor, 'none');
    A.deepEqual(r.size, ['1280px', '720px', 1280, 720]);
    await page.mouse.move(200, 200); await page.mouse.move(210, 205);
    A.equal(await page.evaluate(() => document.querySelector('canvas').style.cursor), 'default', 'the pointer shows while it moves');
    await page.waitForFunction(() => document.querySelector('canvas').style.cursor === 'none', null, { timeout: 4000 });
    await page.keyboard.press('f');
    A.ok(await shown(page, '#fps'), 'F shows the fps box');
    await page.waitForFunction(() => /fps · .* particles · 2\.0 · q1\.5/.test(document.getElementById('fps').textContent), null, { timeout: 4000 });
    await page.keyboard.press('g'); await page.keyboard.press('7'); await page.keyboard.press('.'); await page.keyboard.press('3');
    A.equal(await page.evaluate(() => [document.getElementById('goto').textContent, document.getElementById('goto').style.opacity].join('|')), 'GO TO 7.3_  / 10|1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#7.3');
    A.deepEqual(await page.evaluate(() => (s => [s.slide, s.step])(PixelDeck.state())), [6, 3], 'G 7.3 Enter');
    await page.keyboard.press('b');
    A.equal(await page.evaluate(() => document.getElementById('toast').textContent), 'BLACKOUT');
  },

  'key filter (§4.10): an <input>, <textarea> or [contenteditable] on the deck page keeps its keys; <body> drives the deck': async (page, ctx) => {
    const A = ctx.assert;
    await openStage(page, ctx, '#1.0');
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.innerHTML = '<input id="i"><textarea id="t"></textarea><div id="ce" contenteditable>x</div>';
      box.style.cssText = 'position:fixed;left:10px;top:10px;z-index:5';
      document.body.appendChild(box);
    });
    for (const sel of ['#i', '#t', '#ce']) {
      await page.focus(sel);
      for (const k of ['ArrowRight', ' ', 'PageDown', 'b', 'End', 'n', 'r']) await page.keyboard.press(k);
      const st = await page.evaluate(() => ({ s: PixelDeck.state(), h: location.hash, blk: document.getElementById('toast').textContent }));
      A.deepEqual([st.s.slide, st.s.step, st.h, st.blk], [0, 0, '#1.0', ''], 'keys typed into ' + sel + ' do not drive the deck');
    }
    A.equal(ctx.context.pages().length, 1, 'N typed into a field opened no presenter window');
    A.equal(await page.evaluate(() => document.getElementById('i').value), ' bnr', 'the input got its keys');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => location.hash === '#2.0');
    A.ok(true, 'with the focus on <body>, ArrowRight advances');
  },

  'N opens <page>?notes with noopener: its own window links, prepares the previews, follows and drives the stage (WP1 #4)': async (page, ctx) => {
    const A = ctx.assert;
    await page.addInitScript(() => {          // count window.open calls; time the N key press on the stage page
      window.__opens = 0;
      const wo = window.open;
      window.open = function () { window.__opens++; return wo.apply(this, arguments); };
      addEventListener('keydown', e => { if (e.key === 'n') window.__nT0 = performance.now(); });   // before the Player's listener
    });
    await openStage(page, ctx, '#2.0');
    await page.evaluate(() => addEventListener('keydown', e => { if (e.key === 'n') window.__nMs = performance.now() - window.__nT0; }));   // after it
    const [notes] = await Promise.all([ctx.context.waitForEvent('page', { timeout: 15000 }), page.keyboard.press('n')]);
    await notes.waitForLoadState('load');
    A.ok(/\/decks\/one-giant-leap\/index\.html\?notes$/.test(notes.url()), 'opens ' + notes.url());
    A.equal(await notes.evaluate(() => window.opener), null, 'noopener: no window.opener (not a same-thread popup)');
    const nk = await page.evaluate(() => ({ opens: window.__opens, ms: window.__nMs }));
    ctx.log('N key handled in ' + nk.ms.toFixed(1) + ' ms on the stage page');
    A.equal(nk.opens, 0, 'N does not call window.open (it blocks the stage until the new window exists: 64–107 ms measured)');
    A.ok(nk.ms < 40, 'the stage handles N without waiting for the new window (' + nk.ms.toFixed(1) + ' ms < 40 ms)');
    A.equal(await page.evaluate(() => window.PixelDeck.state().slide), 1, 'the stage did not move');
    await notes.waitForFunction(() => document.getElementById('link') && document.getElementById('link').className === 'on', null, { timeout: 15000 });
    A.ok(/^2 \/ 10/.test(await notes.evaluate(() => document.getElementById('pos').innerText)), 'the notes window shows the stage position');
    A.ok(/^Preparing previews \d+\/21$|^$/.test(await notes.evaluate(() => document.getElementById('prep').textContent)));
    await notes.waitForFunction(() => document.getElementById('prep').textContent === '', null, { timeout: 30000 });
    const r = await notes.evaluate(() => ({ title: document.title, canv: document.querySelectorAll('canvas').length, hud: document.querySelectorAll('.hud, #stage').length,
      thumbs: PD.get('core/notes') && document.getElementById('now').width + 'x' + document.getElementById('now').height }));
    A.deepEqual(r, { title: 'One Giant Leap — presenter', canv: 2, hud: 0, thumbs: '480x270' }, 'presenter UI: two 480×270 previews, no stage, no HUD');
    await notes.click('#bNext');
    await page.waitForFunction(() => location.hash === '#3.0', null, { timeout: 5000 });
    await notes.keyboard.press('ArrowRight');
    await page.waitForFunction(() => location.hash === '#3.1', null, { timeout: 5000 });
    await notes.waitForFunction(() => /^3 \/ 10\s*step 1\/1 · warp$/.test(document.getElementById('pos').innerText), null, { timeout: 5000 });
    await notes.click('#bBlack');
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'BLACKOUT', null, { timeout: 5000 });
    await notes.waitForFunction(() => getComputedStyle(document.getElementById('blk')).display !== 'none', null, { timeout: 5000 });
    A.ok(true, 'NEXT, → and BLACKOUT from the notes window drive the stage, and it follows');
  },

  'N with Chromium\'s popup blocker on (Playwright turns it off by default): a real key press opens ?notes with no opener; a synthetic N with no user activation opens nothing': async (page, ctx) => {
    const A = ctx.assert;
    const { chromium } = require(ctx.path('tools', 'node_modules', 'playwright'));
    const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'], ignoreDefaultArgs: ['--disable-popup-blocking'] });
    const errs = [];
    try {
      const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      c.on('page', p => p.on('pageerror', e => errs.push(String(e && e.stack || e))));
      const stage = await c.newPage();
      stage.on('pageerror', e => errs.push(String(e && e.stack || e)));
      // Negative control: once ready, the page itself dispatches an N keydown — no user activation. Nothing here may
      // evaluate in the page before that (Playwright evaluates with a user gesture, which would grant activation).
      await stage.addInitScript(() => {
        const iv = setInterval(() => {
          if (!(window.PixelDeck && PixelDeck.ready)) return;
          clearInterval(iv);
          dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
          console.log('pd-e2e: synthetic N dispatched');
        }, 20);
      });
      const fired = stage.waitForEvent('console', { predicate: m => m.text() === 'pd-e2e: synthetic N dispatched', timeout: 20000 });
      await stage.goto(ctx.url(DECK, '#2.0'));
      await fired;
      await stage.waitForTimeout(2500);
      A.equal(c.pages().length, 1, 'with no user activation the popup blocker stops the shift-clicked link (proves the blocker is on)');
      const [notes] = await Promise.all([c.waitForEvent('page', { timeout: 15000 }), stage.keyboard.press('n')]);
      await notes.waitForLoadState('load');
      A.ok(/\/decks\/one-giant-leap\/index\.html\?notes$/.test(notes.url()), 'the key press opens ' + notes.url());
      A.equal(await notes.evaluate(() => window.opener), null, 'noopener');
      await notes.waitForFunction(() => document.getElementById('link') && document.getElementById('link').className === 'on', null, { timeout: 15000 });
      A.ok(/^2 \/ 10/.test(await notes.evaluate(() => document.getElementById('pos').innerText)), 'the notes window links to the stage');
      A.equal(c.pages().length, 2, 'exactly one presenter window');
    } finally { await browser.close(); }
    A.deepEqual(errs, [], 'no page errors');
  },

  'two stages + one notes window: the notes window shows "Another stage", and its commands drive only the bound stage (WP1 #5)': async (page, ctx) => {
    const A = ctx.assert;
    await openStage(page, ctx, '#1.0');                       // stage A
    const notes = await ctx.newPage();
    await notes.goto(ctx.url(NOTES));
    await notes.waitForFunction(() => document.getElementById('link').className === 'on', null, { timeout: 15000 });
    A.equal(await shown(notes, '#another'), false, 'one stage: no banner');
    const B = await ctx.newPage();                            // stage B: a second copy of the same deck
    await openStage(B, ctx, '#5.0');
    await notes.waitForFunction(() => getComputedStyle(document.getElementById('another')).display !== 'none', null, { timeout: 8000 });
    A.equal(await notes.evaluate(() => document.getElementById('another').textContent), 'Another stage for this deck is open. Close one.');
    await notes.click('#bNext');
    await page.waitForFunction(() => location.hash === '#2.0', null, { timeout: 5000 });
    await notes.click('#bNext');
    await page.waitForFunction(() => location.hash === '#3.0', null, { timeout: 5000 });
    await ctx.sleep(400);
    A.deepEqual(await B.evaluate(() => [location.hash, PixelDeck.state().slide]), ['#5.0', 4], 'stage B never moved');
    A.ok(/^3 \/ 10/.test(await notes.evaluate(() => document.getElementById('pos').innerText)), 'the notes window follows stage A only');
    await B.keyboard.press('ArrowRight');                    // B moves on its own: the notes window still shows A
    await B.waitForFunction(() => location.hash === '#6.0');
    await ctx.sleep(300);
    A.ok(/^3 \/ 10/.test(await notes.evaluate(() => document.getElementById('pos').innerText)), 'B\'s state does not take over the notes window');
    await B.close();
    await notes.waitForFunction(() => getComputedStyle(document.getElementById('another')).display === 'none', null, { timeout: 8000 });
    A.ok(true, 'closing the second stage clears the banner');
    await notes.keyboard.press('ArrowRight');
    await page.waitForFunction(() => location.hash === '#3.1', null, { timeout: 5000 });
  },

  'the bound stage reloads: the notes window rebinds to the new instance and keeps driving it': async (page, ctx) => {
    const A = ctx.assert;
    await openStage(page, ctx, '#4.0');
    const notes = await ctx.newPage();
    await notes.goto(ctx.url(NOTES));
    await notes.waitForFunction(() => /^4 \/ 10/.test(document.getElementById('pos').innerText), null, { timeout: 15000 });
    await page.reload();
    await page.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: 15000 });
    await ctx.sleep(3500);                                  // the old instance goes stale (2.5 s), the new one answers hello
    await notes.click('#bNext');
    await page.waitForFunction(() => location.hash === '#4.1', null, { timeout: 5000 });
    A.equal(await shown(notes, '#another'), false, 'no banner once the old instance has gone');
  },

  'index.html?notes is the presenter window; ?export registers everything and boots nothing': async (page, ctx) => {
    const A = ctx.assert;
    await page.goto(ctx.url(DECK, '?notes'));
    await page.waitForFunction(() => document.getElementById('pos') && document.getElementById('next'), null, { timeout: 15000 });
    A.deepEqual(await page.evaluate(() => [document.title, !!document.getElementById('stage'), typeof window.PixelDeck, document.querySelectorAll('style[data-pd-hud]').length]),
      ['One Giant Leap — presenter', false, 'undefined', 0], 'notes mode: no stage, no HUD CSS');
    const ex = await ctx.newPage();
    await ex.goto(ctx.url(DECK, '?export'));
    await ex.waitForLoadState('load');
    await ctx.sleep(300);
    A.deepEqual(await ex.evaluate(() => [PD.deck.has('one-giant-leap'), PD.theme.has('one-giant-leap'), PD.missing().length, document.querySelectorAll('canvas').length, typeof window.PixelDeck]),
      [true, true, 0, 0, 'undefined'], '?export: registered, not booted');
  },

  'PixelDeck (§4.13) on the deck: boot ≤ 1.2 s and ready ≤ 3 s (§4.15), deck(), info(), state().ready, warmAll, advance, tick, snapshot': async (page, ctx) => {
    const A = ctx.assert;
    await page.addInitScript(() => {           // page clock: when PixelDeck appears (boot done) and when it is ready
      const iv = setInterval(() => {
        if (!window.__bootAt && window.PixelDeck) window.__bootAt = performance.now();
        if (!window.__readyAt && window.PixelDeck && PixelDeck.ready) { window.__readyAt = performance.now(); clearInterval(iv); }
      }, 5);
    });
    await page.goto(ctx.url(DECK, '#1.0'));
    await page.waitForFunction(() => window.PixelDeck, null, { timeout: 15000 });
    const early = await page.evaluate(() => typeof PixelDeck.ready);
    await page.waitForFunction(() => window.__readyAt, null, { timeout: 15000 });
    const t = await page.evaluate(() => ({ boot: Math.round(window.__bootAt), ready: Math.round(window.__readyAt) }));
    ctx.log('boot (PixelDeck) ' + t.boot + ' ms, ready ' + t.ready + ' ms after navigation start');
    A.equal(early, 'boolean');
    A.ok(t.boot <= 1200, 'boot to first frame within 1.2 s (' + t.boot + ' ms)');
    A.ok(t.ready <= 3000, 'ready within 3 s (' + t.ready + ' ms)');
    const r = await page.evaluate(() => {
      PixelDeck.setManualClock(true);
      PixelDeck.warmAll();
      const s0 = PixelDeck.state();
      PixelDeck.next();
      for (let i = 0; i < 60; i++) PixelDeck.advance(1 / 30);
      PixelDeck.tick(1 / 30);
      const shot = PixelDeck.snapshot();
      return { deck: PixelDeck.deck(), info: PixelDeck.info()[6], ready: s0.ready, state: PixelDeck.state(), shot: shot.slice(0, 22), len: shot.length };
    });
    A.deepEqual([r.deck.id, r.deck.meta.title, r.deck.meta.theme], ['one-giant-leap', 'One Giant Leap', 'one-giant-leap']);
    A.deepEqual([r.info.id, r.info.steps, r.info.beat, r.info.dwell], ['leaps', 7, 'pattern', 3]);
    A.equal(r.ready, true);
    A.deepEqual([r.state.slide, r.state.step, r.state.ready], [1, 0, true]);
    A.ok(r.state.particles > 0, 'advance moved time on: particles on screen');
    A.equal(r.shot, 'data:image/png;base64,');
    A.ok(r.len > 20000, 'a real frame');
  }
};
