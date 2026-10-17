/* tools/test/e2e/wp1-deck.e2e.js — the deck format on real pages (spec §3.4, §4.2, §4.3, §4.8 boot order, §8.2 M5),
 * through the M6 shims (PD.start). The Player itself is covered by wp1-player.e2e.js.
 *   node tools/test/e2e.js wp1-deck */
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');

// Records the boot order on the deck page: PD.assets.ready (call, resolve), PD.compile, window.PixelDeck.
function orderScript() {
  const log = window.__order = [];
  let pd, api;
  const hook = (obj, name, onSet) => {
    let v;
    Object.defineProperty(obj, name, { configurable: true, enumerable: true, get: () => v, set: x => { v = onSet(x); } });
  };
  Object.defineProperty(window, 'PD', { configurable: true, enumerable: true, get: () => pd, set: v => {
    pd = v;
    hook(pd, 'assets', fn => {
      hook(fn, 'ready', r => function (id) { log.push('ready ' + id); return r.apply(this, arguments).then(x => { log.push('ready resolved'); return x; }); });
      return fn;
    });
    hook(pd, 'compile', c => function (d) { log.push('compile ' + d); return c.apply(this, arguments); });
  } });
  Object.defineProperty(window, 'PixelDeck', { configurable: true, enumerable: true, get: () => api, set: v => { log.push('PixelDeck'); api = v; } });
}

module.exports = {
  'deck page (M6 shim): PD.start → assets.ready → compile → Player → PixelDeck; deck.js scenes, no window.DECK, no engine globals': async (page, ctx) => {
    const A = ctx.assert, cons = [];
    page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) cons.push(m.text()); });
    await page.addInitScript(orderScript);
    await page.goto(ctx.url('decks/one-giant-leap/index.html', '?quality=1#3.1'));
    await page.waitForFunction(() => window.PixelDeck, null, { timeout: 15000 });
    const r = await page.evaluate(() => {
      const order = window.__order.slice(), d = PixelDeck.deck(), c = PD.compile('one-giant-leap');
      return {
        order,
        hasDECK: 'DECK' in window,
        sceneGlobals: ['W', 'HORIZON', 'BELOW', 'curveXY', 'curvePoints', 'nodePoints', 'leap'].filter(n => n in window),
        engineGlobals: ['DW', 'DH', 'CX', 'CY', 'U', 'COLORS', 'col', 'Glow', 'FX', 'NEBULA_PRESETS', 'Space', 'Earth', 'Shapes', 'Field',
          'FONT', 'STYLES', 'TextLayer', 'WORLD_DEFAULTS', 'Stage', 'Sync', 'Show', 'Ease', 'Timeline'].filter(n => n in window),
        deckId: d.id, themeId: d.meta.theme, sameMeta: d.meta === c.meta,
        framework: d.meta.story.framework, likes: c.scenes.map(s => s.like).join(','),
        info: PixelDeck.info().map(i => i.id + ':' + i.steps).join(' '), cur: (s => ({ slide: s.slide, step: s.step }))(PixelDeck.state()), hash: location.hash,
        scripts: Array.from(document.scripts).map(s => s.getAttribute('src')).filter(Boolean).filter(s => !/engine\/(core|worlds|elements|templates|story)\//.test(s))
      };
    });
    A.deepEqual(r.order, ['ready one-giant-leap', 'ready resolved', 'compile one-giant-leap', 'PixelDeck'], 'boot order (spec §4.8, §4.10)');
    A.equal(r.hasDECK, false); A.deepEqual(r.sceneGlobals, [], 'the deck file adds no globals');
    A.deepEqual(r.engineGlobals, [], 'no compat globals (M6)');
    A.deepEqual([r.deckId, r.themeId, r.sameMeta], ['one-giant-leap', 'one-giant-leap', true]);
    A.equal(r.framework, 'giant-leap');
    A.equal(r.likes, 'cold-open,brand-reveal,hyperspace,galaxy-reveal,planet,sunrise,timeline,the-box,pivot,finale');
    A.equal(r.info, 'spark:0 title:0 warp:1 galaxy:1 home:0 sunrise:0 leaps:7 box:1 next:1 thanks:0');
    A.deepEqual(r.cur, { slide: 2, step: 1 }, 'the hash still opens a state'); A.equal(r.hash, '#3.1');
    A.deepEqual(r.scripts, ['../../engine/pixeldeck.js', 'theme.js', 'assets.js', 'deck.js'], 'the shim loads theme, assets, deck');
    A.deepEqual(cons, [], 'no console errors besides the optional engine files');
  },

  'notes page: compiles the deck itself, follows the stage, renders thumbnails (PD.Thumbs), drives the stage': async (page, ctx) => {
    const A = ctx.assert;
    await page.goto(ctx.url('decks/one-giant-leap/notes.html'));
    const stage = await ctx.newPage();
    await stage.goto(ctx.url('decks/one-giant-leap/index.html', '#8.0'));
    await stage.waitForFunction(() => window.PixelDeck);
    await page.waitForFunction(() => document.getElementById('link').className === 'on', null, { timeout: 15000 });
    const lit = id => { const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; };
    await page.waitForFunction(lit => { lit = eval(lit); return lit('now') > 500 && lit('next') > 500; }, String(lit), { timeout: 15000 });
    const r = await page.evaluate(lit => {
      lit = eval(lit);
      return { pos: document.getElementById('pos').innerText, notes: document.getElementById('notes').textContent, now: lit('now'), next: lit('next'),
               hasDECK: 'DECK' in window };
    }, String(lit));
    A.ok(/^8 \/ 10\s*step 0\/1 · box$/.test(r.pos), r.pos);
    A.equal(r.notes, 'Every leap we just saw started as an idea that did not fit inside the existing box.');
    A.ok(r.now > 500 && r.next > 500, 'both thumbnails drawn (' + r.now + ', ' + r.next + ' lit pixels)');
    A.equal(r.hasDECK, false);
    await page.click('#bNext');
    await stage.waitForFunction(() => location.hash === '#8.1', null, { timeout: 5000 });
    A.ok(true, 'NEXT on the notes page advanced the stage to 8.1');
  },

  'a deck that cannot compile shows the on-screen panel (PD.fail) instead of a black page': async (page, ctx) => {
    const A = ctx.assert;
    ctx.expectPageErrors = true;
    const engine = url.pathToFileURL(ctx.path('engine', 'pixeldeck.js')).href;
    const theme = url.pathToFileURL(ctx.path('decks', 'one-giant-leap', 'theme.js')).href;
    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
      '<script src="' + engine + '"></script><script src="' + theme + '"></script>' +
      '<script>PD.deck("one-giant-leap", function (PD, h) { return [{ id: "a", text: [{ str: notDefinedAnywhere }] }]; });</script>' +
      '<script>PD.start("one-giant-leap");</script></body></html>';
    const file = path.join(ctx.tmp, 'broken.html');
    fs.writeFileSync(file, html);
    await page.goto(url.pathToFileURL(file).href);
    await page.waitForSelector('[data-pd-fail]', { timeout: 10000 });
    const text = await page.textContent('[data-pd-fail]');
    A.ok(/^pixeldeck: deck "one-giant-leap" could not start/.test(text), text.split('\n')[0]);
    A.ok(/notDefinedAnywhere is not defined/.test(text), 'the cause is shown');
    A.equal(await page.evaluate(() => window.PixelDeck), undefined, 'no automation API for a deck that did not boot');
    A.equal(await page.evaluate(() => document.querySelectorAll('canvas').length), 0, 'and no stage canvas left behind');
    A.ok(ctx.pageErrors.some(e => /notDefinedAnywhere is not defined/.test(e)), 'and the error still surfaces as a page error');
  }
};
