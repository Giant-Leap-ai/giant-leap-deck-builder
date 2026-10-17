/* tools/test/e2e/wp6-studio.e2e.js — the Studio shell, persistence, import and the Brief / Shape / Look / Export screens
 * on real pages (WP6, spec §7, §9 WP6 acceptance 1–12).
 *   node tools/test/e2e.js wp6-studio
 * Each test runs in a fresh browser context (so a fresh localStorage and IndexedDB) at 1440 x 900 unless it says otherwise.
 * Scratch files (the saved presentation, pictures, a font) live in ctx.tmp, outside ROOT. Screenshots go to PD_SHOTS when set.
 * The storyboard workspace and Rehearse are WP7's; a missing one logs a not-found error that these tests do not count (AMEND-8). */
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), http = require('http');

const STUDIO = 'studio/index.html';
const WP7_FILE = /\/studio\/(ui\/[\w-]+|screens\/(board|rehearse))\.js$/;
const shot = (ctx, name) => path.join(process.env.PD_SHOTS || ctx.tmp, name);

/* ------------------------------------------------------------------ helpers */
function watch(page) {
  const w = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') w.consoleErrors.push(m.text() + ' @ ' + (m.location().url || '')); });
  page.on('pageerror', e => w.pageErrors.push(String(e && e.stack || e)));
  return w;
}
const realErrors = w => w.consoleErrors.filter(e => !(/ERR_FILE_NOT_FOUND/.test(e) && WP7_FILE.test(e.split(' @ ')[1] || e)));

async function open(ctx, page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ctx.url(STUDIO));
  await page.waitForSelector('[data-act=new]');
}
const store = (page, fn, arg) => page.evaluate(fn, arg);
const next = async page => { await page.click('.pds-panel [data-act=next]'); await page.waitForTimeout(80); };

const ANSWERS = {
  goal: 'inspire', audience: 'Ops leaders who see AI as a way to cut headcount', targetMin: 10,
  bigIdea: 'AI should make work more human, not replace the people doing it', shortIdea: 'Augmentation, not automation',
  oldWay: 'automation', newWay: 'augmentation', ask: 'Pilot one human-centred use case this quarter',
  proof: [{ kind: 'number', text: 'of repetitive hours returned to people', value: '62' }, { kind: 'quote', text: 'We stopped asking permission and started shipping', who: 'Ana, VP Operations' }, { kind: 'story', text: 'The night shift that invented its own tools' }],
  brand: 'Northwind', tagline: 'Work that feels human', tone: 'cinematic'
};
async function fillBrief(page, over) {
  const A = Object.assign({}, ANSWERS, over || {});
  await page.click('#q-goal-' + A.goal); await next(page);
  await page.fill('[data-field=audience]', A.audience); await next(page);
  await page.fill('[data-field=targetMin]', String(A.targetMin)); await next(page);
  await page.fill('[data-field=bigIdea]', A.bigIdea); await next(page);
  await page.fill('[data-field=shortIdea]', A.shortIdea); await next(page);
  await page.fill('[data-field=oldWay]', A.oldWay); await page.fill('[data-field=newWay]', A.newWay); await next(page);
  await page.fill('[data-field=ask]', A.ask); await next(page);
  for (let i = 0; i < A.proof.length; i++) {
    const r = A.proof[i], row = page.locator('.pds-proof-row').nth(i);
    await row.locator('select').selectOption(r.kind);
    await row.locator('.pds-proof-text').fill(r.text);
    if (r.value) await row.locator('.pds-proof-extra').fill(r.value);
    if (r.who) await row.locator('.pds-proof-extra').fill(r.who);
  }
  await next(page);
  await page.fill('[data-field=brand]', A.brand); await page.fill('[data-field=tagline]', A.tagline); await next(page);
  await page.click('#q-tone-' + A.tone);
  await page.click('.pds-panel [data-act=next]');                    // Finish: on to Shape
  await page.waitForSelector('.pds-fw');
}
async function startDeck(ctx, page, over) {
  await open(ctx, page);
  await page.click('[data-act=new]');
  await page.waitForSelector('.pds-panel');
  await fillBrief(page, over);
}
async function buildBoard(page) {                 // Build, then on to the storyboard the way a person goes: the first Build lands on Look
  await page.click('[data-act=build]');
  await page.waitForFunction(() => PD.studio.store.get().deck.scenes.length > 0 && PD.studio.store.route() !== 'shape');
  if (await page.evaluate(() => PD.studio.store.route()) === 'look') await page.click('.pds-next');       // Next: Storyboard
  await page.waitForFunction(() => PD.studio.store.route() === 'board');
}
async function dropFiles(page, files, selector) {  // files: [{ name, type, base64 }] dropped on the window (or on an element) like a real drop
  await page.evaluate(([list, sel]) => {
    const dt = new DataTransfer();
    list.forEach(f => { const b = atob(f.base64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); dt.items.add(new File([u], f.name, { type: f.type })); });
    (sel ? document.querySelector(sel) : window).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [files, selector || null]);
}
const b64 = s => Buffer.from(s).toString('base64');
async function bigJpeg(page, w, h) {             // a w x h JPEG made in the page, as a base64 string
  return page.evaluate(([w, h]) => new Promise(res => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#ff7a3d'); grad.addColorStop(0.5, '#3d6bff'); grad.addColorStop(1, '#2fd4c4');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = '300px sans-serif'; g.fillText('PHOTO', w / 4, h / 2);
    cv.toBlob(b => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(b); }, 'image/jpeg', 0.9);
  }), [w, h]);
}
function fontFile(ctx) {                         // a real font under a name no machine has, so only the embedded copy can match it
  const cands = ['/System/Library/Fonts/Supplemental/Apple Chancery.ttf', '/System/Library/Fonts/Supplemental/Andale Mono.ttf', ctx.path('tools', 'node_modules', 'playwright-core', 'lib', 'vite', 'recorder', 'assets', 'codicon-DCmgc-ay.ttf')];
  const src = cands.find(f => fs.existsSync(f));
  if (!src) throw new Error('no font file to test with');
  const dst = path.join(ctx.tmp, 'Zebra Brand Test.ttf');
  fs.copyFileSync(src, dst);
  return dst;
}
function fontDrop(ctx) {                         // the test font as a drop payload: a font file dragged in from the desktop
  const f = fontFile(ctx);
  return { name: path.basename(f), type: 'font/ttf', base64: fs.readFileSync(f).toString('base64') };
}
async function curveDrawn(page, sel) {           // per gap between two beat markers: how many accent-coloured pixels of the line are there? (an element screenshot, decoded in the page)
  const png = (await page.locator(sel + ' .pds-fw-curvebox').screenshot()).toString('base64');
  return page.evaluate(async ([png, sel]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const box = document.querySelector(sel + ' .pds-fw-curvebox').getBoundingClientRect(), k = img.width / box.width;
    const want = (getComputedStyle(document.querySelector(sel + ' .line')).stroke.match(/\d+/g) || []).map(Number);
    const xs = Array.from(document.querySelectorAll(sel + ' .pds-pt')).map(p => { const r = p.getBoundingClientRect(); return (r.left + r.width / 2 - box.left) * k; });
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const x = Math.max(0, Math.min(img.width - 1, Math.round((xs[i] + xs[i + 1]) / 2))), col = g.getImageData(x, 0, 1, img.height).data;
      let hit = 0;
      for (let y = 0; y < img.height; y++) { const d = Math.abs(col[y * 4] - want[0]) + Math.abs(col[y * 4 + 1] - want[1]) + Math.abs(col[y * 4 + 2] - want[2]); if (d < 90) hit++; }
      out.push(hit);
    }
    return out;
  }, [png, sel]);
}
async function toast(page) { return page.evaluate(() => Array.from(document.querySelectorAll('.pds-toast')).map(t => t.textContent)); }

/* ------------------------------------------------------------------ the tests */
module.exports = {

  /* 1 ─ new-deck flow: interview → recommended framework → Build → Cosmos → the storyboard, with the logline shown */
  'new deck: interview, recommended shape, build, Cosmos, storyboard with the logline'(page, ctx) {
    const w = watch(page), a = ctx.assert;
    return (async () => {
      await open(ctx, page);
      // the first screen
      a.ok(await page.locator('[data-empty=continue]').textContent().then(t => /Nothing saved in this browser yet\. Start a new deck, or open a deck you saved\./.test(t)), 'the empty state says what to do');
      a.ok(/Autosave lives in this browser only\. Saving to a file is the real save\./.test(await page.locator('.pds-footnote').textContent()), 'the footnote');
      a.equal(await page.locator('[data-act=sample-ogl]').count(), 1);
      a.equal(await page.locator('[data-act=sample-replica]').count(), 1);
      await page.screenshot({ path: shot(ctx, 'wp6-01-welcome.png') });
      await page.click('[data-act=new]');
      await page.waitForSelector('.pds-panel');
      a.equal(await page.locator('.pds-q').textContent(), 'What should this talk do?', 'the first question');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Shape', 'the primary button always says what is next');
      // a hint shows in amber and never blocks
      await next(page); await next(page); await next(page);                 // goal, audience and slot are skipped: every question can be skipped
      await page.fill('[data-field=bigIdea]', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen');
      a.ok(/Try it in one breath/.test(await page.locator('.pds-hint').textContent()), 'more than 15 words: the amber hint');
      await page.fill('[data-field=bigIdea]', '');
      // the other hints: a long turn, a command that is not a verb, a short idea that is not short
      await page.click('.pds-dot >> nth=5');
      await page.fill('[data-field=oldWay]', 'one two three four five six');
      a.ok(/Try five words or fewer/.test(await page.locator('.pds-hint').textContent()), 'turn: more than 5 words');
      await page.fill('[data-field=oldWay]', '');
      await page.click('.pds-dot >> nth=6');
      await page.fill('[data-field=ask]', 'Maybe think about it');
      a.ok(/Start with a verb: Book, Try, Pick\./.test(await page.locator('.pds-hint').textContent()), 'ask: not a verb');
      await page.fill('[data-field=ask]', 'Book a pilot');
      a.equal(await page.locator('.pds-hint').isHidden(), true, 'a verb clears the hint');
      await page.fill('[data-field=ask]', '');
      await page.click('.pds-dot >> nth=4');
      await page.fill('[data-field=shortIdea]', 'this is more than six words long');
      a.ok(/Cut it to six or fewer/.test(await page.locator('.pds-hint').textContent()), 'shortIdea: more than 6 words');
      await page.fill('[data-field=shortIdea]', '');
      await page.click('.pds-dot >> nth=0');
      await fillBrief(page);
      a.equal(await page.locator('.pds-fw').first().getAttribute('data-fw'), 'giant-leap', 'inspire + cinematic recommends One Giant Leap');
      a.ok(await page.locator('.pds-fw.is-recommended .pds-fw-tag.rec').count() === 1, 'the recommended card says so');
      a.ok(/inspire in 10 minutes/.test(await page.locator('.pds-fw-why').textContent()), 'the reason (fw.pick)');
      a.equal(await page.locator('.pds-fw.is-recommended input').isChecked(), true, 'the recommended shape is preselected');
      await page.waitForTimeout(1900);                                         // the curves have drawn in
      for (const id of ['giant-leap', 'sparkline', 'psf', 'scqa']) {
        const gaps = await curveDrawn(page, '.pds-fw[data-fw=' + id + ']');
        a.ok(gaps.length >= 4 && gaps.every(n => n > 0), id + ': the energy line runs through every beat, to the last (accent pixels per gap: ' + gaps.join(',') + ')');
      }
      a.equal(await page.locator('.pds-fw.is-recommended .line').evaluate(n => getComputedStyle(n).strokeDasharray), 'none', 'drawn with a clip, not a dash that a stretched path would cut short');
      await page.screenshot({ path: shot(ctx, 'wp6-02-shape.png') });
      await page.click('[data-act=build]');
      await page.waitForFunction(() => PD.studio.store.get().deck.scenes.length > 0);
      a.equal(await store(page, () => PD.studio.store.route()), 'look', 'Build goes on to the next step, Look, not past it');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Storyboard', 'and the primary button then says what is next');
      const s = await store(page, () => { const st = PD.studio.store, p = st.get(); return { scenes: p.deck.scenes.length, fw: p.deck.meta.story.framework, theme: p.deck.meta.theme, tmpl: p.deck.scenes.map(x => x.template), beats: p.deck.scenes.map(x => x.beat) }; });
      a.equal(s.fw, 'giant-leap'); a.equal(s.theme, 'cosmos', 'tone cinematic suggested Cosmos'); a.equal(s.scenes, 12, '10 minutes is about 12 scenes');
      a.equal(s.beats[0], 'spark');
      // the Look step: choose Cosmos
      await page.waitForSelector('.pds-look-card');
      await page.click('.pds-look-card[data-theme=cosmos] input');
      await page.waitForTimeout(2800);
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.theme), 'cosmos');
      a.ok(await page.locator('.pds-look-card[data-theme=cosmos]').evaluate(n => n.classList.contains('is-selected')));
      await page.screenshot({ path: shot(ctx, 'wp6-03-look.png') });
      // the storyboard, with the logline shown under the header
      await page.click('.pds-next');                                        // Next: Storyboard
      await page.waitForFunction(() => PD.studio.store.route() === 'board');
      await page.waitForTimeout(1500);
      const line = await page.locator('.pds-logline').textContent();
      a.ok(/^\W*For Ops leaders who see AI as a way to cut headcount, this talk shows Augmentation, not automation, so they/.test(line), 'the logline: ' + line);
      a.equal(await page.locator('.pds-logline').isVisible(), true);
      await page.screenshot({ path: shot(ctx, 'wp6-04-board.png') });
      a.deepEqual(realErrors(w), [], 'no console errors');
      a.deepEqual(w.pageErrors, [], 'no page errors');
    })();
  },

  /* 2 ─ reload: Continue restores the project, with its assets from IndexedDB */
  'reload: Continue restores the project and its assets from IndexedDB'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await dropFiles(page, [{ name: 'Team Photo.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 1200, 800) }]);
      await page.waitForFunction(() => Object.keys(PD.studio.store.get().assets).length === 1);
      const before = await store(page, () => { const p = PD.studio.store.get(); return { id: p.id, assets: p.assets, deck: JSON.parse(JSON.stringify(p.deck)) }; });
      a.deepEqual(Object.keys(before.assets), ['team-photo'], 'the id is the slug of the file name');
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved', null, { timeout: 5000 });
      await page.reload();
      await page.waitForSelector('[data-act=continue]');
      a.ok(/autosaved .* · 12 scenes/.test(await page.locator('[data-act=continue]').textContent()), 'the Continue card: ' + await page.locator('[data-act=continue]').textContent());
      await page.click('[data-act=continue]');
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() !== 'welcome');
      const after = await store(page, async () => {
        const p = PD.studio.store.get(), rt = PD.asset(p.id, 'team-photo');
        await PD.studio.store.assetsReady();
        const r2 = PD.asset(p.id, 'team-photo');
        return { id: p.id, assets: p.assets, deck: p.deck, route: PD.studio.store.route(), src: (PD.assets.get(p.id)['team-photo'] || {}).src && PD.assets.get(p.id)['team-photo'].src.slice(0, 23), ok: !!(r2 && r2.ok), w: r2 && r2.w };
      });
      a.equal(after.id, before.id);
      a.deepEqual(after.assets, before.assets, 'the asset map came back');
      a.equal(after.src, 'data:image/jpeg;base64,', 'the picture itself came back from IndexedDB');
      a.equal(after.ok, true, 'and it decodes');
      a.equal(after.w, 1200);
      a.equal(after.route, 'board', 'Continue opens where you were');
      a.deepEqual(after.deck.scenes.map(s => s.id), before.deck.scenes.map(s => s.id));
      a.equal(after.deck.meta.story.bigIdea, ANSWERS.bigIdea);
    })();
  },

  /* 3 + 4 ─ Save produces a file that plays from file://, and re-opening it gives a deepEqual deck */
  'save: the .html plays from file:// and re-opening it gives a deepEqual deck'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      // fill the first scene so there is something real to say, and drop a picture so the file carries an asset
      await store(page, () => PD.studio.store.commit('Words', d => { const s = d.deck.scenes[0]; s.props.line = 'Every giant leap begins with a spark.'; }));
      await dropFiles(page, [{ name: 'photo.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 900, 600) }]);
      await page.waitForFunction(() => Object.keys(PD.studio.store.get().assets).length === 1);
      await page.click('[data-step=export]');
      await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
      for (const id of ['compile', 'validate', 'size']) a.equal(await page.locator('[data-check=' + id + ']').getAttribute('data-state'), 'ok', id + ' passes');
      const orig = await store(page, () => { const p = PD.studio.store.get(); return { deck: JSON.parse(JSON.stringify(p.deck)), assets: JSON.parse(JSON.stringify(PD.assets.get(p.id))) }; });
      await page.evaluate(() => { window.showSaveFilePicker = undefined; });      // force the download path: a file picker cannot be driven here
      const dl = page.waitForEvent('download');
      await page.keyboard.press('Meta+s');                                            // ⌘S saves from anywhere (this is the Export screen)
      const d = await dl;
      a.equal(d.suggestedFilename(), 'northwind.html');
      const file = path.join(ctx.tmp, d.suggestedFilename());
      await d.saveAs(file);
      await page.waitForFunction(() => PD.studio.store.isSaved());
      a.ok(/Saved .*northwind\.html/.test(await page.locator('.pds-result').textContent()), 'the result card');
      a.ok(/Double-click northwind\.html to present, no internet needed\./.test((await toast(page)).join(' ')), 'export.done toast');
      a.equal(await page.locator('[data-step=export]').evaluate(n => n.classList.contains('is-done')), true, 'step 6 shows its check once saved');
      await page.screenshot({ path: shot(ctx, 'wp6-05-saved.png') });

      // opens by double-click: a fresh page straight from file://, no server, no network
      const html = fs.readFileSync(file, 'utf8');
      a.ok(!/src="http|href="http|fetch\(/.test(html), 'self-contained');
      const p2 = await ctx.newPage(), w2 = watch(p2), reqs = [];
      p2.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) reqs.push(r.url()); });
      await p2.goto(url.pathToFileURL(file).href);
      await p2.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: 40000 });
      const info = await p2.evaluate(() => PixelDeck.info().map(i => i.id));
      a.equal(info.length, 12, 'it plays all 12 scenes');
      await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(300);
      a.equal(await p2.evaluate(() => PixelDeck.state().slide + '.' + PixelDeck.state().step), '1.0', 'and advances on a click');
      a.deepEqual(reqs, [], 'no network request');
      a.deepEqual(w2.pageErrors, [], 'no page errors in the saved file');
      a.deepEqual(realErrors(w2), [], 'no console errors in the saved file');
      await p2.close();

      // re-opening it in a fresh Studio gives the same deck
      const ctx2 = await ctx.newContext(), p3 = await ctx2.newPage();
      await open(ctx, p3);
      const [fc] = await Promise.all([p3.waitForEvent('filechooser'), p3.click('[data-act=open]')]);
      await fc.setFiles(file);
      await p3.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() !== 'welcome', null, { timeout: 20000 });
      const re = await p3.evaluate(() => { const p = PD.studio.store.get(); return { deck: p.deck, assets: PD.assets.get(p.id), saved: PD.studio.store.isSaved(), route: PD.studio.store.route() }; });
      a.deepEqual(re.deck, orig.deck, 're-opened deck is deepEqual');
      a.deepEqual(re.assets, orig.assets, 're-opened assets are deepEqual');
      a.equal(re.saved, true, 'a deck opened from its file is saved');
      a.equal(re.route, 'board');
      // a hand-written deck says so
      const hand = path.join(ctx.tmp, 'hand.html');
      fs.writeFileSync(hand, fs.readFileSync(ctx.path('decks', 'one-giant-leap', 'index.html'), 'utf8'));
      await p3.evaluate(() => PD.studio.closeProject());
      const [fc2] = await Promise.all([p3.waitForEvent('filechooser'), p3.click('[data-act=open]')]);
      await fc2.setFiles(hand);
      await p3.waitForTimeout(500);
      a.ok(/isn't a pixeldeck presentation/.test((await toast(p3)).join(' ')), 'a file that is not a presentation is explained');
    })();
  },

  /* 5, 6, 7 ─ the intake pipeline: 6000 px JPEG, SVG with only a viewBox, HEIC */
  'import: a 6000 px JPEG becomes 2400 px, an SVG with only a viewBox 2400 px wide, a HEIC is refused'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await dropFiles(page, [{ name: 'Huge.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 6000, 4000) }]);
      await page.waitForFunction(() => PD.studio.store.get().assets.huge, null, { timeout: 30000 });
      let img = await store(page, () => { const p = PD.studio.store.get(), s = PD.assets.get(p.id).huge; return { w: s.w, h: s.h, type: s.type, mime: s.src.slice(5, s.src.indexOf(';')), bytes: s.bytes, name: s.name }; });
      a.equal(img.w, 2400, 'the long edge is 2400'); a.equal(img.h, 1600, 'the aspect is kept');
      a.equal(img.mime, 'image/jpeg', 'no transparency: a JPEG'); a.equal(img.type, 'image'); a.ok(img.bytes > 1000 && img.bytes < 4 * 1024 * 1024, 'bytes recorded and under 4 MB');
      const dec = await store(page, async () => { const p = PD.studio.store.get(); await PD.assets.ready(p.id); const r = PD.asset(p.id, 'huge'); return { ok: r.ok, nw: r.img.naturalWidth, nh: r.img.naturalHeight }; });
      a.deepEqual(dec, { ok: true, nw: 2400, nh: 1600 }, 'the stored picture decodes at 2400 x 1600');

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect width="100" height="40" fill="#e0402a"/><circle cx="20" cy="20" r="12" fill="#fff"/></svg>';
      await dropFiles(page, [{ name: 'Mark.svg', type: 'image/svg+xml', base64: b64(svg) }]);
      await page.waitForFunction(() => PD.studio.store.get().assets.mark, null, { timeout: 15000 });
      img = await store(page, () => { const p = PD.studio.store.get(), s = PD.assets.get(p.id).mark; return { w: s.w, h: s.h, mime: s.src.slice(5, s.src.indexOf(';')) }; });
      a.equal(img.w, 2400, 'an SVG with only a viewBox is rasterized 2400 px wide (not 300)'); a.equal(img.h, 960, 'at the viewBox aspect');
      a.equal(img.mime, 'image/jpeg', 'a solid rectangle has no transparency');
      const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 30"><circle cx="15" cy="15" r="12" fill="#2a6fe0"/></svg>';
      await dropFiles(page, [{ name: 'logo.svg', type: 'image/svg+xml', base64: b64(logo) }]);
      await page.waitForFunction(() => PD.studio.store.get().assets.logo, null, { timeout: 15000 });
      img = await store(page, () => { const p = PD.studio.store.get(), s = PD.assets.get(p.id).logo; return { w: s.w, h: s.h, mime: s.src.slice(5, s.src.indexOf(';')), alpha: s.alpha }; });
      a.deepEqual(img, { w: 2400, h: 600, mime: 'image/png', alpha: true }, 'transparent pixels: a PNG');

      await dropFiles(page, [{ name: 'IMG_0001.HEIC', type: 'image/heic', base64: b64('not really a heic') }]);
      await page.waitForTimeout(300);
      a.ok((await toast(page)).some(t => t === "Can't use .heic yet. Export it as PNG or JPEG."), 'assets.heic: ' + (await toast(page)).join(' | '));
      await dropFiles(page, [{ name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: b64('x') }]);
      await page.waitForTimeout(300);
      a.ok((await toast(page)).some(t => t === "Can't use this file type."), 'anything else is refused plainly');
      a.deepEqual(Object.keys(await store(page, () => PD.studio.store.get().assets)).sort(), ['huge', 'logo', 'mark'], 'refused files are not added');
    })();
  },

  /* 8 ─ a font drop applies in Look, and the previews re-render with the new face */
  'look: a font drop becomes the brand font and the preview re-renders with it'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.click('[data-step=look]');
      await page.waitForSelector('.pds-look-canvas');
      await page.waitForTimeout(2200);
      const before = await page.locator('.pds-look-card[data-theme=cosmos] canvas').getAttribute('data-themekey');
      a.ok(before, 'the preview knows its theme key');
      await dropFiles(page, [fontDrop(ctx)], '.pds-fontdrop');                // a drop on the font box, not the chooser, and no "Use <family>" click after it
      await page.waitForFunction(() => PD.studio.store.brandFont(), null, { timeout: 15000 });
      const bf = await store(page, () => ({ bf: PD.studio.store.brandFont(), patch: PD.studio.store.get().deck.meta.themePatch, loaded: document.fonts.check('20px "Zebra Brand Test"'), assets: Object.keys(PD.studio.store.get().assets) }));
      a.deepEqual(bf.assets, ['zebra-brand-test'], 'the drop added the font once');
      a.equal(bf.bf.family, 'Zebra Brand Test', 'the family defaults from the file name');
      a.equal(bf.bf.asset, 'zebra-brand-test');
      a.deepEqual(bf.patch.fontFaces, [{ family: 'Zebra Brand Test', asset: 'zebra-brand-test' }], 'written as fontFaces');
      a.ok(/^"Zebra Brand Test", /.test(bf.patch.fonts.display), 'and fonts.display: ' + bf.patch.fonts.display);
      a.equal(bf.loaded, true, 'the face is loaded in the page');
      await page.waitForFunction(k => document.querySelector('.pds-look-card[data-theme=cosmos] canvas').getAttribute('data-themekey') !== k, before, { timeout: 8000 });
      a.ok(/^"Zebra Brand Test", /.test(await page.locator('.pds-look-card[data-theme=cosmos] canvas').getAttribute('data-font')), 'the Cosmos preview was rebuilt with the new face');
      await page.waitForFunction(() => /^"Zebra Brand Test", /.test(document.querySelector('.pds-look-card[data-theme=slate] canvas').getAttribute('data-font')), null, { timeout: 8000 });
      a.ok(/"Zebra Brand Test", /.test(await page.locator('.pds-look-card[data-theme=slate] canvas').getAttribute('data-font')), 'and so was the Slate preview, on its own fallback stack');
      a.ok(!/Avenir/.test(await page.locator('.pds-look-card[data-theme=slate] canvas').getAttribute('data-font')), 'Slate keeps its own fallback fonts');
      await page.waitForTimeout(2500);
      await page.screenshot({ path: shot(ctx, 'wp6-06-look-font.png') });
      // the family can be renamed, and the font can be put away again
      await page.fill('.pds-font-info input', 'Zebra Display'); await page.press('.pds-font-info input', 'Enter');
      await page.waitForFunction(() => PD.studio.store.brandFont().family === 'Zebra Display');
      await page.click('[data-act=font-clear]');
      await page.waitForFunction(() => !PD.studio.store.brandFont());
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.themePatch === undefined), true, 'clearing it leaves no empty patch behind');
      // colours write roles, with the glow derived toward #ff6a00
      await page.evaluate(() => { const c = document.querySelector('input[data-ctl=accent]'); c.value = '#2a9d8f'; c.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => PD.studio.store.get().deck.meta.themePatch && PD.studio.store.get().deck.meta.themePatch.roles);
      const roles = await store(page, () => PD.studio.store.get().deck.meta.themePatch.roles);
      a.equal(roles.accent, '#2a9d8f');
      a.equal(roles.accentGlow, '#' + [0x2a, 0x9d, 0x8f].map((v, i) => ('0' + Math.round(v + ([0xff, 0x6a, 0x00][i] - v) * 0.4).toString(16)).slice(-2)).join(''), 'accentGlow is the accent mixed 40% toward #ff6a00');
      await page.click('[data-nebula=ember]');
      await page.waitForFunction(() => (PD.studio.store.get().deck.meta.themePatch.world || {}).nebula === 'ember');
      await page.click('.pds-colorrow[data-colorrow=future] .pds-preset >> nth=4');          // #5ef1ff
      await page.waitForFunction(() => (PD.studio.store.get().deck.meta.themePatch.roles || {}).future);
      const fut = await store(page, () => PD.studio.store.get().deck.meta.themePatch.roles);
      a.equal(fut.future.length, 2, 'future is a two-colour gradient'); a.equal(fut.future[1], '#5ef1ff'); a.ok(/^#[0-9a-f]{6}$/.test(fut.futureGlow), 'with a derived glow');
      a.equal(await page.locator('.pds-colorrow[data-colorrow=future] .pds-preset.is-on').getAttribute('data-color'), '#5ef1ff', 'the chosen preset is marked');
      await page.click('[data-act=reset-accent]');
      await page.waitForFunction(() => !(PD.studio.store.get().deck.meta.themePatch.roles || {}).accent);
      a.equal(await store(page, () => (PD.studio.store.get().deck.meta.themePatch.roles || {}).accentGlow), undefined, 'reset takes the glow too');
      a.ok(await store(page, () => !!PD.studio.store.get().deck.meta.themePatch.roles.future), 'and leaves the other colour alone');
    })();
  },

  /* 9 ─ undo and redo across 20 commits, and typing is one step per field */
  'undo and redo cover 20 commits; typing in one field is one undo step'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      const r = await store(page, () => {
        const st = PD.studio.store, notes = () => JSON.stringify(st.get().deck.scenes.map(s => s.notes));
        const start = notes();
        for (let i = 0; i < 20; i++) st.commit('Edit ' + i, d => { d.deck.scenes[i % d.deck.scenes.length].notes = 'note ' + i; });
        const end = notes();
        let undone = 0; for (let i = 0; i < 20; i++) if (st.undo()) undone++;
        const back = notes();
        let redone = 0; for (let i = 0; i < 20; i++) if (st.redo()) redone++;
        return { undone, redone, same: start === back, again: end === notes(), canRedo: st.canRedo() };
      });
      a.equal(r.undone, 20, '20 commits, 20 undo steps'); a.equal(r.redone, 20, 'and 20 redo steps');
      a.equal(r.same, true, 'undoing 20 gives back the start'); a.equal(r.again, true, 'redoing 20 gives back the end'); a.equal(r.canRedo, false);
      // a new commit after an undo drops the redo road
      const fork = await store(page, () => { const st = PD.studio.store; st.undo(); const could = st.canRedo(); st.commit('Fork', d => { d.deck.meta.subtitle = 'x'; }); return { could, after: st.canRedo() }; });
      a.deepEqual(fork, { could: true, after: false });
      // typing: many keystrokes in one field are one undo step (coalesced within a second)
      await page.click('[data-step=brief]');
      await page.waitForSelector('.pds-panel');
      await page.click('.pds-dot >> nth=5');                                            // question 6: the turn
      const before = await store(page, () => { const st = PD.studio.store; let n = 0; while (st.canUndo()) { st.undo(); n++; } for (let i = 0; i < n; i++) st.redo(); return n; });
      await page.locator('[data-field=oldWay]').fill('');
      await page.locator('[data-field=oldWay]').pressSequentially('slow paperwork', { delay: 15 });
      const after = await store(page, () => { const st = PD.studio.store; let n = 0; while (st.canUndo()) { st.undo(); n++; } return n; });
      a.ok(after - before <= 2, 'typing 14 characters added ' + (after - before) + ' undo step(s) (the field was cleared first)');
      await page.waitForTimeout(100);
      a.equal(await page.locator('.pds-undo button').count(), 2);
    })();
  },

  /* 10 ─ a second tab on the same project is read-only */
  'a second tab on the same project is read-only, and can take over'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved');
      const p2 = await ctx.newPage();
      await open(ctx, p2);
      await p2.click('[data-act=continue]');
      await p2.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() !== 'welcome');
      const ro = await p2.evaluate(() => ({ ro: PD.studio.store.get().studio.readOnly, by: PD.studio.store.get().studio.lockedByOther, can: PD.studio.store.commit('x', d => { d.deck.meta.title = 'nope'; }), title: PD.studio.store.get().deck.meta.title }));
      a.equal(ro.ro, true, 'the second tab is read-only'); a.equal(ro.can, false, 'and refuses commits'); a.notEqual && a.notEqual(ro.title, 'nope');
      a.ok(/Open in another tab\./.test(await p2.locator('.pds-banner').first().textContent()), 'the banner says why: ' + await p2.locator('.pds-banner').first().textContent());
      a.ok(/Read-only/.test(await p2.locator('.pds-status').textContent()), 'the status says so too');
      await p2.screenshot({ path: shot(ctx, 'wp6-07-readonly-tab.png') });
      a.equal(await page.evaluate(() => PD.studio.store.get().studio.readOnly), false, 'the first tab keeps editing');
      // take over: the first tab becomes the read-only one
      await p2.click('.pds-banner button');
      await page.waitForFunction(() => PD.studio.store.get().studio.readOnly === true, null, { timeout: 5000 });
      a.equal(await p2.evaluate(() => PD.studio.store.get().studio.readOnly), false, 'the new tab can edit');
    })();
  },

  /* 11 ─ a simulated quota error shows the banner */
  'a full browser store shows the Autosave is full banner'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved');
      await page.evaluate(() => {
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (String(k).indexOf('pdstudio:v1:proj:') === 0) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return set.apply(this, arguments); };
      });
      await page.evaluate(() => PD.studio.store.commit('Rename', d => { d.deck.meta.title = 'A different name'; }));
      await page.waitForSelector('.pds-banner.is-error', { timeout: 5000 });
      a.equal((await page.locator('.pds-banner.is-error .pds-banner-msg').textContent()), 'Autosave is full. Save to a file now.');
      a.ok(/Not saved/.test(await page.locator('.pds-status').textContent()), 'the header admits it');
      a.equal(await page.locator('.pds-banner.is-error [aria-label=Dismiss]').count(), 0, 'it is sticky');
      await page.screenshot({ path: shot(ctx, 'wp6-08-quota.png') });
    })();
  },

  /* 8b ─ a font dropped anywhere on Look is the brand font, with a picture in the same drop added once; a lone picture is only added */
  'look: a font dropped anywhere on the screen is the brand font; pictures in the same drop are added once'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.click('[data-step=look]');
      await page.waitForSelector('.pds-fontdrop');
      await dropFiles(page, [{ name: 'Team Photo.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 900, 600) }], '.pds-look-head');
      await page.waitForFunction(() => Object.keys(PD.studio.store.get().assets).length === 1);
      a.equal(await store(page, () => PD.studio.store.brandFont()), null, 'a picture on its own is only added: it is not a font');
      await dropFiles(page, [fontDrop(ctx), { name: 'Logo Mark.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 800, 800) }], '.pds-look-head');
      await page.waitForFunction(() => PD.studio.store.brandFont(), null, { timeout: 15000 });
      await page.waitForFunction(() => Object.keys(PD.studio.store.get().assets).length === 3, null, { timeout: 15000 });
      await page.waitForTimeout(400);
      const r = await store(page, () => ({ assets: Object.keys(PD.studio.store.get().assets).sort(), bf: PD.studio.store.brandFont() }));
      a.deepEqual(r.assets, ['logo-mark', 'team-photo', 'zebra-brand-test'], 'every file in the drop was added exactly once');
      a.equal(r.bf.family, 'Zebra Brand Test', 'and the font in it is the brand font');
      a.ok(/Drop a font to make it your brand font/.test(await page.locator('.pds-drop-card').textContent()), 'the drop overlay says what a drop does on this screen');
      await page.click('[data-step=board]');
      await page.waitForFunction(() => PD.studio.store.route() === 'board');
      a.ok(/Drop a logo or image/.test(await page.locator('.pds-drop-card').textContent()), 'and goes back to the usual sentence on the other screens');
    })();
  },

  /* 12 ─ switching to Slate offers swaps for the Cosmos-only templates */
  'look: switching to Slate offers to swap the Cosmos-only scenes'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      const need = await store(page, () => PD.studio.store.get().deck.scenes.filter(s => ['hyperspace', 'galaxy-reveal', 'planet', 'sunrise'].indexOf(s.template) >= 0).map(s => s.id + ':' + s.template));
      a.ok(need.length >= 3, 'the One Giant Leap shape uses Cosmos-only templates: ' + need.join(', '));
      await store(page, () => PD.studio.store.commit('Words', d => { d.deck.scenes.forEach(s => { if (s.template === 'sunrise') { s.props.kicker = 'For 300,000 years'; s.props.line = 'we have thought outside the box.'; s.notes = 'Say nothing until the sun clears.'; } }); }));
      // three Hyperspace scenes: real words with a number in them; the template's own prompts ({a big number}); words with no number
      await store(page, () => PD.studio.store.commit('Words', d => {
        const h = d.deck.scenes.find(s => s.template === 'hyperspace');
        h.props.lines = ['13.8 billion years', 'NASA, 2024', '{an even bigger one}'];
        d.deck.scenes.push({ id: 'hyper-prompts', template: 'hyperspace', props: { lines: ['{a big number}', '{an even bigger one}'] } });
        d.deck.scenes.push({ id: 'hyper-words', template: 'hyperspace', props: { lines: ['Hundreds of billions of galaxies'] } });
      }));
      const hyper = await store(page, () => PD.studio.store.get().deck.scenes.filter(s => s.template === 'hyperspace').map(s => s.id));
      a.equal(hyper.length >= 3, true, 'the shape has a Hyperspace scene, and two more were added: ' + hyper.join(','));
      await page.click('[data-step=look]');
      await page.waitForSelector('.pds-look-card');
      await page.click('.pds-look-card[data-theme=slate] input');
      await page.waitForSelector('.pds-dialog');
      const text = await page.locator('.pds-dialog').textContent();
      a.ok(/can't play \d+ of your scenes/.test(text), text);
      const rows = await page.locator('.pds-swap-list li', { hasText: 'Hyperspace' }).allTextContents();
      a.ok(rows.length >= 3 && rows.every(t => /Big number/.test(t) && !/Big statement/.test(t)), 'the dialog lists each scene and what it would become: Hyperspace is always a Big number (spec 7.2): ' + rows.join(' | '));
      await page.waitForTimeout(450);                                          // the dialog has faded in
      await page.screenshot({ path: shot(ctx, 'wp6-09-swap.png') });
      await page.click('.pds-dialog [data-value=swap]');
      await page.waitForFunction(() => PD.studio.store.get().deck.meta.theme === 'slate');
      const r = await store(page, () => {
        const st = PD.studio.store, p = st.get(), c = st.compiled(), issues = PD.validate(c);
        return { tmpl: p.deck.scenes.map(s => s.template), errors: c.errors.length, needs: issues.filter(i => i.code === 'template.requires-world' || i.code === 'template.unknown').length,
          sunrise: p.deck.scenes.filter(s => s.id.indexOf('human-truth') === 0)[0], story: p.deck.meta.story.framework };
      });
      a.deepEqual(r.tmpl.filter(t => ['hyperspace', 'galaxy-reveal', 'planet', 'sunrise'].indexOf(t) >= 0), [], 'no Cosmos-only template is left');
      const swapped = await store(page, ids => { const sc = PD.studio.store.get().deck.scenes; return ids.map(id => { const s = sc.find(x => x.id === id); return { template: s.template, props: s.props, notes: s.notes || '' }; }); }, hyper);
      a.equal(swapped.every(s => s.template === 'big-number'), true, 'every Hyperspace became a Big number');
      a.deepEqual(swapped[0].props, { value: 13.8, decimals: 1, prefix: '', suffix: '', label: 'billion years', source: 'NASA, 2024' }, 'the number in the first line is the number, the rest of it the label, the second line the source: ' + JSON.stringify(swapped[0].props));
      a.ok(swapped[0].notes.indexOf('{an even bigger one}') < 0, 'a prompt on the old scene is not carried over as if it were words');
      const byId = {}; hyper.forEach((id, i) => { byId[id] = swapped[i]; });
      a.deepEqual(byId['hyper-prompts'].props, { value: 0, decimals: 0, prefix: '', suffix: '', label: '{what the number means}' }, 'with no number to take, the template\'s own prompt stays for the author to fill (nothing is invented)');
      a.equal(byId['hyper-prompts'].notes, '', 'and the old prompts are not copied into the notes');
      a.equal(byId['hyper-words'].props.label, '{what the number means}', 'words with no number do not pose as the label of a made-up number');
      a.ok(/Hundreds of billions of galaxies/.test(byId['hyper-words'].notes), 'they are kept in the notes instead: ' + byId['hyper-words'].notes);
      a.equal(r.errors, 0, 'nothing became an error card'); a.equal(r.needs, 0);
      const hum = r.sunrise;
      a.equal(hum.template, 'statement', 'sunrise became a statement');
      a.equal(hum.props.line, 'we have thought outside the box.', 'the words were kept');
      a.equal(hum.props.kicker, 'For 300,000 years');
      a.equal(hum.notes, 'Say nothing until the sun clears.', 'and the notes');
      // one undo puts everything back
      await page.evaluate(() => PD.studio.store.undo());
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.theme), 'cosmos', 'undo is one step');
      a.ok((await store(page, () => PD.studio.store.get().deck.scenes.map(s => s.template))).indexOf('hyperspace') >= 0, 'and the scenes come back');
      // the other choice keeps them, as error cards
      await page.click('.pds-look-card[data-theme=slate] input');
      await page.waitForSelector('.pds-dialog');
      await page.click('.pds-dialog [data-value=keep]');
      await page.waitForFunction(() => PD.studio.store.get().deck.meta.theme === 'slate');
      a.ok(await store(page, () => PD.validate(PD.studio.store.compiled()).filter(i => i.code === 'template.requires-world').length) > 0, 'kept scenes are flagged by the checks (and block saving until fixed)');
    })();
  },

  /* opening a file for a deck that is already in the autosave: replace it, or keep both */
  'open: a saved file for a deck that also has a newer autosave asks which to keep'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.click('[data-step=export]');
      await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
      await page.evaluate(() => { window.showSaveFilePicker = undefined; });
      const dl = page.waitForEvent('download');
      await page.click('.pds-export-actions [data-act=save]');
      const file = path.join(ctx.tmp, 'older.html');
      await (await dl).saveAs(file);
      await page.waitForFunction(() => PD.studio.store.isSaved());
      const id = await store(page, () => PD.studio.store.get().id);
      // keep working after the save: the autosave is now newer than the file
      await store(page, () => PD.studio.store.commit('After the save', d => { d.deck.meta.subtitle = 'written after saving'; }));
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved');
      await page.evaluate(() => PD.studio.closeProject());
      await page.waitForSelector('[data-act=open]');
      // copy: both survive
      let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=open]')]);
      await fc.setFiles(file);
      await page.waitForSelector('.pds-dialog');
      a.ok(/already have this deck here/.test(await page.locator('.pds-dialog').textContent()));
      await page.click('.pds-dialog [data-value=copy]');
      await page.waitForFunction(i => PD.studio.store.get() && PD.studio.store.get().id !== i && PD.studio.store.route() !== 'welcome', id);
      const copy = await store(page, () => { const p = PD.studio.store.get(); return { id: p.id, deckId: p.deck.id, sub: p.deck.meta.subtitle, saved: PD.studio.store.isSaved() }; });
      a.equal(copy.deckId, copy.id, 'the copy has its own id, deck and project alike'); a.equal(copy.sub, undefined, "the file's version, not the autosave's"); a.equal(copy.saved, true);
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved');
      await page.evaluate(() => PD.studio.closeProject());
      a.equal(await page.locator('[data-act=continue]').count(), 2, 'both decks are in the Continue list');
      // replace: the file wins
      [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=open]')]);
      await fc.setFiles(file);
      await page.waitForSelector('.pds-dialog');
      await page.click('.pds-dialog [data-value=replace]');
      await page.waitForFunction(i => PD.studio.store.get() && PD.studio.store.get().id === i && PD.studio.store.route() !== 'welcome', id);
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.subtitle), undefined, 'the file replaced the autosave');
      // cancel: nothing opens
      await page.waitForTimeout(250);                                          // let the board that just mounted finish starting before its deck is closed under it
      await page.evaluate(() => PD.studio.closeProject());
      [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=open]')]);
      await fc.setFiles(file);
      // (the file equals the autosave now, so there is nothing to ask: it just opens)
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() !== 'welcome');
      a.equal(await page.locator('.pds-dialog').count(), 0);
    })();
  },

  /* a drop with no deck open says what to do instead of doing nothing */
  'welcome: dropping pictures with no deck open says what to do; dropping a deck file opens it'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await open(ctx, page);
      await dropFiles(page, [{ name: 'a.png', type: 'image/png', base64: b64('x') }]);
      await page.waitForTimeout(200);
      a.ok(/Start or open a deck first/.test((await toast(page)).join(' ')), (await toast(page)).join(' | '));
      a.equal(await store(page, () => PD.studio.store.get()), null, 'nothing was opened');
      // a saved deck dropped on the window opens as a deck
      const b = await page.evaluate(() => {
        const html = PD.exportHTML('drop-test', { deck: { format: 2, id: 'drop-test', meta: { title: 'Dropped deck', theme: 'cosmos', story: PD.story.interview.blank() }, scenes: [{ id: 'a', template: 'statement', props: { line: 'Hi there' } }] }, assets: {} });
        return btoa(unescape(encodeURIComponent(html)));
      });
      await dropFiles(page, [{ name: 'dropped.html', type: 'text/html', base64: b }]);
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.get().id === 'drop-test', null, { timeout: 10000 });
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.title), 'Dropped deck');
      a.equal(await store(page, () => PD.studio.store.route()), 'board', 'a deck that has scenes opens on its storyboard');
    })();
  },

  /* the brand font really travels: the saved file shows it on a machine that has never heard of it */
  'save: a brand font is embedded in the file and applied when it opens'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.click('[data-step=look]');
      await page.waitForSelector('[data-act=font-pick]');
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act=font-pick]')]);
      await fc.setFiles(fontFile(ctx));
      await page.waitForFunction(() => PD.studio.store.brandFont(), null, { timeout: 15000 });
      await page.click('[data-step=export]');
      await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
      a.equal(await page.locator('[data-check=font]').getAttribute('data-state'), 'ok', 'the font check passes once the brand font is embedded');
      a.ok(/Zebra Brand Test is embedded/.test(await page.locator('[data-check=font]').textContent()), await page.locator('[data-check=font]').textContent());
      await page.evaluate(() => { window.showSaveFilePicker = undefined; });
      const dl = page.waitForEvent('download');
      await page.click('.pds-export-actions [data-act=save]');
      const file = path.join(ctx.tmp, 'font-deck.html');
      await (await dl).saveAs(file);
      const html = fs.readFileSync(file, 'utf8');
      a.ok(/data:font\/ttf;base64,/.test(html), 'the font bytes are in the file');
      const p2 = await ctx.newPage(), w2 = watch(p2);
      await p2.goto(url.pathToFileURL(file).href);
      await p2.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: 40000 });
      const r = await p2.evaluate(() => ({ loaded: document.fonts.check('20px "Zebra Brand Test"'), fam: PD.compile(PixelDeck.deck().id).theme.fonts.display }));
      a.equal(r.loaded, true, 'the face is registered in the saved file');
      a.ok(/^"Zebra Brand Test", /.test(r.fam), 'and the look uses it: ' + r.fam);
      a.deepEqual(w2.pageErrors, []);
    })();
  },

  /* Export source: deck.js and assets.js run as a deck folder */
  'export source: deck.js and assets.js, dropped into a deck page, play the same deck'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await dropFiles(page, [{ name: 'photo.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 600, 400) }]);
      await page.waitForFunction(() => Object.keys(PD.studio.store.get().assets).length === 1);
      await page.click('[data-step=export]');
      await page.waitForSelector('[data-act=source-deck]');
      const id = await store(page, () => PD.studio.store.get().deck.id);
      const dir = path.join(ctx.tmp, 'srcdeck'); fs.mkdirSync(dir);
      for (const [act, name] of [['source-deck', 'deck.js'], ['source-assets', 'assets.js']]) {
        const dl = page.waitForEvent('download');
        await page.click('[data-act=' + act + ']');
        const d = await dl;
        a.equal(d.suggestedFilename(), name);
        await d.saveAs(path.join(dir, name));
      }
      const deckJs = fs.readFileSync(path.join(dir, 'deck.js'), 'utf8'), assetsJs = fs.readFileSync(path.join(dir, 'assets.js'), 'utf8');
      a.ok(/copy decks\/_starter\/ to decks\/northwind\/, replace deck\.js and assets\.js/.test(deckJs.split('\n').slice(0, 3).join(' ')), 'the header says where the files go: ' + deckJs.slice(0, 260));
      a.ok(deckJs.indexOf('PD.deck(' + JSON.stringify(id) + ', {') >= 0 && assetsJs.indexOf('PD.assets(' + JSON.stringify(id) + ', {') >= 0);
      a.ok(!/<\/script|<!--/.test(deckJs + assetsJs), 'safe to put in a page');
      fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body>' +
        '<script src="' + url.pathToFileURL(ctx.path('engine', 'pixeldeck.js')).href + '"></script>' +
        '<script src="' + url.pathToFileURL(ctx.path('themes', 'cosmos', 'theme.js')).href + '"></script>' +
        '<script src="assets.js"></script><script src="deck.js"></script><script>PD.start();</script></body></html>');
      const p2 = await ctx.newPage(), w2 = watch(p2);
      await p2.goto(url.pathToFileURL(path.join(dir, 'index.html')).href);
      await p2.waitForFunction(() => window.PixelDeck && PixelDeck.ready === true, null, { timeout: 40000 });
      a.equal(await p2.evaluate(() => PixelDeck.info().length), 12);
      a.equal(await p2.evaluate(id => !!PD.assets.get(id).photo, id), true, 'the picture came along');
      a.deepEqual(w2.pageErrors, []);
    })();
  },

  /* Chrome's file picker: the first save writes through the handle */
  'save: through a file handle (the Chrome path) writes the whole file and remembers its name'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      await page.evaluate(() => {
        window.__writes = []; window.__picks = 0;
        window.showSaveFilePicker = async opts => {
          window.__picks++; window.__suggested = opts.suggestedName;
          return { name: 'My Talk.html', createWritable: async () => ({ write: async t => { window.__writes.push(t); }, close: async () => { } }), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
        };
      });
      await page.click('[data-step=export]');
      await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
      await page.click('.pds-export-actions [data-act=save]');
      await page.waitForFunction(() => PD.studio.store.isSaved(), null, { timeout: 30000 });
      const r = await page.evaluate(() => ({ n: window.__writes.length, head: window.__writes[0].slice(0, 15), picks: window.__picks, sug: window.__suggested, name: PD.studio.store.get().studio.fileName }));
      a.deepEqual(r, { n: 1, head: '<!doctype html>', picks: 1, sug: 'northwind.html', name: 'My Talk.html' });
      a.ok(/Saved .*My Talk\.html/.test(await page.locator('.pds-result').textContent()));
      a.ok(/Double-click My Talk\.html to present/.test((await toast(page)).join(' ')));
    })();
  },

  /* real file handles: the picker is asked once, later saves are silent (needs a page where OPFS exists, so this one runs from a
   * throw-away http://localhost server; everything else in this file runs from file://) */
  'save: the handle is remembered, so the second save is silent (real handles)'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      const server = http.createServer((req, res) => {
        const f = path.join(ctx.root, decodeURIComponent(req.url.split('?')[0]));
        if (!f.startsWith(ctx.root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
      });
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      try {
        const base = 'http://127.0.0.1:' + server.address().port + '/' + STUDIO;
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(base);
        await page.waitForSelector('[data-act=new]');
        const opfs = await page.evaluate(async () => { try { await navigator.storage.getDirectory(); return true; } catch (e) { return false; } });
        if (!opfs) { ctx.log('no OPFS here: skipped'); return; }
        await page.click('[data-act=new]');
        await page.waitForSelector('.pds-panel');
        await fillBrief(page);
        await buildBoard(page);
        await page.evaluate(() => {
          window.__picks = 0;
          window.showSaveFilePicker = async opts => { window.__picks++; const root = await navigator.storage.getDirectory(); return root.getFileHandle('my-talk.html', { create: true }); };
        });
        const saved = () => page.evaluate(async () => { const root = await navigator.storage.getDirectory(), f = await (await root.getFileHandle('my-talk.html')).getFile(); return { len: (await f.text()).length, sub: /written after the first save/.test(await f.text()) }; });
        await page.click('[data-step=export]');
        await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
        await page.keyboard.press('Meta+s');
        await page.waitForFunction(() => PD.studio.store.isSaved(), null, { timeout: 30000 });
        a.equal(await page.evaluate(() => window.__picks), 1, 'the first save asks where');
        const first = await saved();
        a.ok(first.len > 100000 && !first.sub, 'and writes the whole file: ' + first.len + ' bytes');
        a.equal(await page.evaluate(() => PD.studio.store.get().studio.fileName), 'my-talk.html');
        await page.waitForFunction(async () => !!(await PD.studio.persist.handles.get(PD.studio.store.get().id)), null, { timeout: 5000 });
        // keep working, then save again: no picker
        await store(page, () => PD.studio.store.commit('Later', d => { d.deck.meta.subtitle = 'written after the first save'; }));
        a.equal(await page.evaluate(() => PD.studio.store.isSaved()), false);
        await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
        await page.keyboard.press('Meta+s');
        await page.waitForFunction(() => PD.studio.store.isSaved(), null, { timeout: 30000 });
        a.equal(await page.evaluate(() => window.__picks), 1, 'the second save did not ask again');
        a.equal((await saved()).sub, true, 'but the file is up to date');
        // after a reload the handle is still there: ⌘S is silent in a new session too
        await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved');
        await page.reload();
        await page.waitForSelector('[data-act=continue]');
        await page.click('[data-act=continue]');
        await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() !== 'welcome');
        await page.evaluate(() => {
          window.__picks = 0;
          window.showSaveFilePicker = async () => { window.__picks++; const root = await navigator.storage.getDirectory(); return root.getFileHandle('other.html', { create: true }); };
          PD.studio.store.commit('Again', d => { d.deck.meta.subtitle = 'third version'; });
        });
        await page.click('[data-step=export]');
        await page.waitForFunction(() => document.querySelector('[data-check=selftest]').getAttribute('data-state') === 'ok', null, { timeout: 60000 });
        await page.keyboard.press('Meta+s');
        await page.waitForFunction(() => PD.studio.store.isSaved(), null, { timeout: 30000 });
        a.equal(await page.evaluate(() => window.__picks), 0, 'a new session reuses the remembered handle');
      } finally { server.close(); }
    })();
  },

  /* WP7's assets column and my intake agree: one drop adds one asset, wherever it lands, and it survives a reload */
  'board: a picture dropped anywhere, or on the assets column, is added once and survives a reload'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await buildBoard(page);
      if (!await page.evaluate(() => PD.has('studio/ui/assets-panel'))) { ctx.log('the assets panel is not installed: skipped'); return; }
      await page.waitForSelector('.as');
      // anywhere in the window: the shell takes it
      await dropFiles(page, [{ name: 'Crowd.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 800, 500) }]);
      await page.waitForFunction(() => PD.studio.store.get().assets.crowd, null, { timeout: 20000 });
      await page.waitForTimeout(500);
      a.deepEqual(Object.keys(await store(page, () => PD.studio.store.get().assets)), ['crowd'], 'exactly one asset, not two');
      a.ok((await toast(page)).some(t => t === 'Added 1 picture.'), (await toast(page)).join(' | '));
      // on the column: the column takes it, through the shell's intake (studio/import), and the window handler stays out of it
      await dropFiles(page, [{ name: 'Stage.jpg', type: 'image/jpeg', base64: await bigJpeg(page, 640, 360) }], '.as');
      await page.waitForFunction(() => PD.studio.store.get().assets.stage, null, { timeout: 20000 });
      await page.waitForTimeout(600);
      a.deepEqual(Object.keys(await store(page, () => PD.studio.store.get().assets)).sort(), ['crowd', 'stage'], 'one more, not two more');
      a.equal(await page.locator('.as-card').count(), 2, 'two cards in the column');
      a.ok(/^[0-9a-f]{64}$/.test(await store(page, () => PD.studio.store.get().assets.stage)), 'with a real content hash');
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved', null, { timeout: 6000 });
      await page.reload();
      await page.waitForSelector('[data-act=continue]');
      await page.click('[data-act=continue]');
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() === 'board');
      await page.waitForSelector('.as-card');
      const back = await store(page, async () => { const p = PD.studio.store.get(); await PD.assets.ready(p.id); return ['crowd', 'stage'].map(id => { const r = PD.asset(p.id, id); return !!(r && r.ok); }); });
      a.deepEqual(back, [true, true], 'both pictures came back from IndexedDB, decoded');
      a.deepEqual(await store(page, () => PD.studio.store.missingAssets()), []);
    })();
  },

  /* the two samples, the shell and the read-only rule */
  'samples: One Giant Leap opens read-only, its template replica opens as an editable copy'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await open(ctx, page);
      await page.click('[data-act=sample-ogl]');
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.route() === 'board');
      const ro = await store(page, () => { const st = PD.studio.store, p = st.get(); return { ro: p.studio.readOnly, n: p.deck.scenes.length, id: p.id, c: st.compiled().scenes.length, committed: st.commit('x', d => { d.deck.meta.title = 'no'; }), canUndo: st.canUndo() }; });
      a.equal(ro.ro, true); a.equal(ro.n, 10); a.equal(ro.c, 10); a.equal(ro.committed, false, 'a read-only deck refuses commits'); a.equal(ro.canUndo, false);
      a.ok(/read-only sample/.test(await page.locator('.pds-banner').first().textContent()), 'the banner');
      a.ok(/Read-only/.test(await page.locator('.pds-status').textContent()));
      const lint = await store(page, () => PD.studio.store.lint());
      a.ok(lint.score >= 90, 'the Director scores One Giant Leap ' + lint.score);
      // an editable copy from the banner
      await page.click('.pds-banner button');
      await page.waitForFunction(() => PD.studio.store.get() && !PD.studio.store.get().studio.readOnly && PD.studio.store.get().deck.id !== 'one-giant-leap');
      const copy = await store(page, () => { const p = PD.studio.store.get(); return { title: p.deck.meta.title, n: p.deck.scenes.length, tpl: p.deck.scenes.map(s => s.template), id: p.deck.id }; });
      a.equal(copy.title, 'One Giant Leap (template replica)'); a.equal(copy.n, 10); a.ok(copy.tpl.every(t => !!t), 'every scene is a template scene');
      a.ok(/^one-giant-leap-template-replica-[a-z0-9]{4}$/.test(copy.id), 'ids are slug + 4 base36 characters: ' + copy.id);
      await page.waitForFunction(() => PD.studio.store.saveState().state === 'saved', null, { timeout: 5000 });
      await page.evaluate(() => PD.studio.closeProject());
      await page.waitForSelector('[data-act=continue]');
      a.equal(await page.locator('[data-act=continue]').count(), 1, 'the copy is in the Continue list, the read-only sample is not');
      // removing a deck from this browser asks first
      await page.hover('.pds-welcome-row');
      await page.click('[data-act=forget]');
      await page.waitForSelector('.pds-dialog');
      await page.click('.pds-dialog [data-value=true]');
      await page.waitForSelector('[data-empty=continue]');
    })();
  },

  /* the primary button always says "Next: …", also on the last step; a deck that cannot be saved has no such button; a rebuild goes to the board */
  'shell: the primary button reads Next on every step, Build goes on to Look once, and a read-only deck has nothing to save'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      await page.click('[data-act=build]');
      await page.waitForFunction(() => PD.studio.store.route() === 'look');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Storyboard');
      await page.click('.pds-next');
      await page.waitForFunction(() => PD.studio.store.route() === 'board');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Rehearse');
      await page.click('.pds-next');
      await page.waitForFunction(() => PD.studio.store.route() === 'rehearse');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Save & export');
      await page.click('.pds-next');
      await page.waitForFunction(() => PD.studio.store.route() === 'export');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Save presentation', 'the last step still says Next, and what comes next is the save');
      a.equal(await page.locator('.pds-next').isVisible(), true);
      // the Look has been seen, so building again goes straight to the board
      await page.click('[data-step=shape]');
      await page.waitForSelector('[data-act=build]');
      await page.click('[data-act=build]');
      await page.waitForSelector('.pds-dialog');
      a.ok(/Replace your storyboard\? You can undo this\./.test(await page.locator('.pds-dialog').textContent()), 'a rebuild asks first');
      await page.click('.pds-dialog [data-value=true]');
      await page.waitForFunction(() => PD.studio.store.route() === 'board', null, { timeout: 8000 });
      // a read-only sample has nothing to save: no Save button dressed as the next step
      await page.evaluate(() => PD.studio.closeProject());
      await page.waitForSelector('[data-act=sample-ogl]');
      await page.click('[data-act=sample-ogl]');
      await page.waitForFunction(() => PD.studio.store.get() && PD.studio.store.get().studio.readOnly && PD.studio.store.route() === 'board');
      await page.click('[data-step=export]');
      await page.waitForSelector('[data-act=copy-sample]');
      a.equal(await page.locator('.pds-next').isVisible(), false, 'no primary Save button on a read-only sample');
      a.equal(await page.locator('[data-act=copy-sample]').isVisible(), true, 'the one useful action is on the page: make an editable copy');
    })();
  },

  /* §7.9: every control is at least 44 px, on every screen this package owns */
  'shell: every control on Welcome, Brief, Shape, Look and Export is at least 44 px'(page, ctx) {
    const a = ctx.assert;
    const small = () => page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.pds-main button, .pds-main input:not([type=radio]):not([type=file]), .pds-main select, .pds-main label, .pds-head button, .pds-main [role=radio], .pds-main a').forEach(e => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return;
        if (r.width < 43.5 || r.height < 43.5) out.push((e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return Array.from(new Set(out));
    });
    return (async () => {
      await open(ctx, page);
      a.deepEqual(await small(), [], 'Welcome');
      await page.click('[data-act=new]'); await page.waitForSelector('.pds-panel');
      a.deepEqual(await small(), [], 'Brief (the header rail and the progress dots)');
      await fillBrief(page);
      await page.waitForTimeout(300);
      a.deepEqual(await small(), [], 'Shape');
      await buildBoard(page);
      await page.click('[data-step=look]'); await page.waitForSelector('.pds-preset'); await page.waitForTimeout(400);
      a.deepEqual(await small(), [], 'Look (colour presets included)');
      await page.click('[data-step=export]'); await page.waitForSelector('[data-check=font] .pds-link'); await page.waitForTimeout(300);
      a.deepEqual(await small(), [], 'Export (the links in the checklist included)');
      await page.setViewportSize({ width: 1280, height: 760 });
      await page.waitForTimeout(200);
      a.deepEqual(await small(), [], 'Export at the smallest supported window');
      await page.click('[data-step=look]'); await page.waitForSelector('.pds-preset'); await page.waitForTimeout(300);
      a.deepEqual(await small(), [], 'Look at the smallest supported window');
      // the header holds the whole rail, the save state, undo and the primary button at 1280, whichever step is current; Export does not scroll sideways
      for (const r of ['brief', 'shape', 'look', 'board', 'rehearse', 'export']) {
        await page.click('[data-step=' + r + ']');
        await page.waitForFunction(x => PD.studio.store.route() === x, r);
        await page.waitForTimeout(200);
        const fit = await page.evaluate(() => {
          const kids = Array.from(document.querySelectorAll('.pds-head > *')).filter(e => e.offsetWidth > 0 && !e.classList.contains('pds-grow')).map(e => { const b = e.getBoundingClientRect(); return { n: e.className.split(' ')[0], l: b.left, r: b.right }; }).sort((x, y) => x.l - y.l);
          const clash = []; for (let i = 0; i < kids.length - 1; i++) if (kids[i].r > kids[i + 1].l + 0.5) clash.push(kids[i].n + ' over ' + kids[i + 1].n);
          const sc = document.querySelector('.pds-screen');
          return { clash, right: kids[kids.length - 1].r, vw: innerWidth, sideways: sc.scrollWidth - sc.clientWidth };
        });
        a.deepEqual(fit.clash, [], 'header parts do not overlap on ' + r + ' at 1280');
        a.ok(fit.right <= fit.vw, 'the header stays inside the window on ' + r);
        if (r === 'export') a.equal(fit.sideways, 0, 'Export has no sideways scroll at 1280');
      }
    })();
  },

  'shell: rail, Next button, ⌘Z, rename, autosave state, small window'(page, ctx) {
    const a = ctx.assert;
    return (async () => {
      await startDeck(ctx, page);
      const rail = await store(page, () => PD.studio.railState().map(r => r.name + ':' + (r.done ? 1 : 0)));
      a.deepEqual(rail, ['brief:1', 'shape:0', 'look:0', 'board:0', 'rehearse:0', 'export:0'], 'Brief is done (idea + slot), nothing else yet');
      await buildBoard(page);
      a.equal(await store(page, () => PD.studio.railState().find(r => r.name === 'shape').done), true, 'Shape is done once scenes exist');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Rehearse');
      await page.click('[data-step=look]');
      a.equal(await page.locator('.pds-next').textContent(), 'Next: Storyboard');
      a.equal(await store(page, () => PD.studio.railState().find(r => r.name === 'look').done), true, 'Look is done once visited');
      a.equal(await page.locator('[data-step=look]').getAttribute('aria-current'), 'step');
      // steps are never locked
      await page.click('[data-step=export]'); await page.click('[data-step=brief]'); await page.click('[data-step=board]');
      // autosave: Saved after a second of quiet
      await page.evaluate(() => PD.studio.store.commit('Rename', d => { d.deck.meta.title = 'Renamed'; }));
      a.ok(/Saving/.test(await page.locator('.pds-status').textContent()), 'pending after a change');
      await page.waitForFunction(() => /Saved/.test(document.querySelector('.pds-status').textContent) && PD.studio.store.saveState().state === 'saved', null, { timeout: 4000 });
      a.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('pdstudio:v1:index')))[0].title === 'Renamed', 'the index entry follows');
      // rename from the title menu
      await page.click('.pds-title');
      await page.click('.pds-menu-item >> text=Rename');
      await page.fill('.pds-title-input', 'My Talk'); await page.press('.pds-title-input', 'Enter');
      await page.waitForFunction(() => PD.studio.store.get().deck.meta.title === 'My Talk');
      a.equal(await store(page, () => PD.studio.store.get().studio.titleAuto), false, 'a typed name stays');
      // ⌘Z undoes it
      await page.mouse.click(700, 600);
      await page.keyboard.press('Meta+z');
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.title), 'Renamed');
      await page.keyboard.press('Meta+Shift+z');
      a.equal(await store(page, () => PD.studio.store.get().deck.meta.title), 'My Talk');
      // deck ids
      const id = await store(page, () => PD.studio.store.get().id);
      a.ok(/^[a-z0-9][a-z0-9-]{0,47}$/.test(id) && /-[a-z0-9]{4}$/.test(id), 'project id = slug + 4 base36: ' + id);
      a.equal(await store(page, () => PD.studio.store.get().deck.id), id, 'the deck id is the project id');
      // below the minimum window size the Studio says so (without blocking the 1280 x 720 default of the runner)
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForFunction(() => document.querySelector('.pds').classList.contains('is-tight'), null, { timeout: 5000 });
      a.ok(await page.locator('.pds-size-hint').isVisible(), 'a hint under 1280 x 760');
      await page.setViewportSize({ width: 900, height: 600 });
      await page.waitForFunction(() => document.querySelector('.pds').classList.contains('is-tiny'), null, { timeout: 5000 });
      a.ok(/Make the window larger\./.test(await page.locator('.pds-tiny').textContent()) && await page.locator('.pds-tiny').isVisible(), 'and a stop when it is really too small');
    })();
  }
};
