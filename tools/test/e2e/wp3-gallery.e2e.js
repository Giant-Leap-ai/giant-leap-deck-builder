/* tools/test/e2e/wp3-gallery.e2e.js — decks/_gallery on a real page (WP3 acceptance #7: it runs under slate with 0 validate
 * errors and no console errors; spec §9). Drives the page through the PixelDeck API with the manual clock.
 *   node tools/test/e2e.js wp3-gallery */
'use strict';

module.exports = {
  'gallery page: boots under slate, plays every state, no page or console errors, 0 validate issues, particles stay in budget': async (page, ctx) => {
    const A = ctx.assert, cons = [];
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) cons.push(m.text()); });
    await page.addInitScript(ctx.seedScript);
    await page.goto(ctx.url('decks/_gallery/index.html', '?quality=1'));
    await page.waitForFunction(() => window.PixelDeck, null, { timeout: 15000 });
    await page.evaluate(() => PixelDeck.setManualClock(true));
    await page.evaluate(() => { for (let i = 0; i < 400; i++) PixelDeck.tick(0); });
    await page.evaluate(() => { let n = 0; while (PixelDeck.ready === false && n++ < 2000) PixelDeck.tick(0); });
    const boot = await page.evaluate(() => ({
      ready: PixelDeck.ready, deck: PixelDeck.deck(), info: PixelDeck.info().map(i => i.id + ':' + i.steps).join(' '),
      theme: PD.compile('gallery').theme.id, worlds: PD.compile('gallery').worlds.join(','),
      issues: typeof PD.validate === 'function' ? PD.validate(PD.compile('gallery')).map(i => i.level + ' ' + i.code + ': ' + i.msg) : null,
      globals: ['DW', 'U', 'Stage', 'TextLayer', 'Field'].filter(n => n in window)
    }));
    A.equal(boot.ready, true, 'PixelDeck.ready');
    A.deepEqual([boot.deck.id, boot.theme, boot.worlds], ['gallery', 'slate', 'core,ambient,photo,spark']);
    A.equal(boot.info, 'slate:1 light:1 counter:1 photo:1 frame:0 reveals:0 logo:0 finale:0');
    if (boot.issues) A.deepEqual(boot.issues, [], 'PD.validate finds nothing');
    A.deepEqual(boot.globals, [], 'no engine globals');
    // play every state live; each one must finish by itself, and the particle field never passes 9000
    const states = await page.evaluate(() => {
      const out = [], info = PixelDeck.info();
      PixelDeck.goTo(0, 0); PixelDeck.finish();
      let first = true;
      for (let si = 0; si < info.length; si++) for (let st = 0; st <= info[si].steps; st++) {
        if (!first) PixelDeck.next(); first = false;
        let t = 0, peak = 0;
        while (PixelDeck.isBusy() && t < 40) { PixelDeck.tick(1 / 30); t += 1 / 30; peak = Math.max(peak, PixelDeck.state().particles); }
        out.push({ at: (si + 1) + '.' + st, secs: Math.round(t * 10) / 10, peak, busy: PixelDeck.isBusy() });
      }
      return out;
    });
    states.forEach(s => { A.equal(s.busy, false, s.at + ' settles (' + s.secs + ' s)'); A.ok(s.peak <= 9000, s.at + ' particles ' + s.peak); });
    A.ok(states.find(s => s.at === '7.0').peak > 1500, 'the logo became particles');
    // a screenshot of the frame is not black, and the image path draws (the ridge photo on state 4.0)
    const lit = await page.evaluate(() => { PixelDeck.goTo(3, 0); PixelDeck.finish(); for (let i = 0; i < 90; i++) PixelDeck.tick(1 / 30); const c = document.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; });
    A.ok(lit > 200, 'the photo state is lit: ' + lit);
    A.deepEqual(cons, [], 'no console errors besides the optional engine files');
  },

  'gallery page: a live entry counts up, Go-to / Prev land on the settled state (the counter shows its final number at once)': async (page, ctx) => {
    const A = ctx.assert;
    await page.addInitScript(ctx.seedScript);
    await page.goto(ctx.url('decks/_gallery/index.html', '?quality=1'));
    await page.waitForFunction(() => window.PixelDeck, null, { timeout: 15000 });
    await page.evaluate(() => PixelDeck.setManualClock(true));
    await page.evaluate(() => { let n = 0; while (PixelDeck.ready === false && n++ < 2000) PixelDeck.tick(0); });
    await page.evaluate(() => {      // watch the value the first counter draws
      const C = PD.get('elements/counter').CounterLayer, orig = C.prototype.valueAt;
      window.__v = null;
      C.prototype.valueAt = function (t) { const v = orig.call(this, t); window.__v = v; return v; };
    });
    const run = secs => page.evaluate(s => { for (let i = 0; i < Math.round(s * 30); i++) PixelDeck.tick(1 / 30); return window.__v; }, secs);
    // live: scene 3 (the counter) entered with next(): 0.5 s delay, then a 2.2 s count
    await page.evaluate(() => { PixelDeck.goTo(1, 1); PixelDeck.finish(); window.__v = null; PixelDeck.next(); });
    const mid = await run(1.5);
    A.ok(mid != null && mid > 0 && mid < 1234.5, 'live entry: mid-count at 1.5 s: ' + mid);
    A.equal(await run(3), 1234.5, 'live entry: arrives at exactly 1234.5');
    // settled: goTo(2, 0) shows the end as soon as the layer starts (0.2 s)
    await page.evaluate(() => { PixelDeck.goTo(0, 0); PixelDeck.finish(); window.__v = null; PixelDeck.goTo(2, 0); });
    A.equal(await run(0.5), 1234.5, 'Go-to: the final number already at 0.5 s');
    await page.evaluate(() => { PixelDeck.goTo(3, 0); PixelDeck.finish(); window.__v = null; PixelDeck.prev(); });
    A.equal(await run(0.5), 2847300, 'Prev into a counter state: the final number already at 0.5 s');
  }
};
