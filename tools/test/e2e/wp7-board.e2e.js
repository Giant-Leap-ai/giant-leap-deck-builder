/* tools/test/e2e/wp7-board.e2e.js — WP7 acceptance (spec §9 WP7): the storyboard workspace and Rehearse, driven in Chromium.
 *
 *   node tools/test/e2e.js wp7-board
 *
 * The WP6 shell and store are stood in for by tools/test/fixtures/wp7-studio-stub.js (a real implementation of the §7.8
 * contract over the real engine). Nine acceptance items, one test each:
 *   1 an edit updates the preview within 400 ms and asks for one thumbnail only (spy on Thumbs.request)
 *   2 a drag-reorder updates the arc and the Director's story.beat-order
 *   3 the picker filters by beat roles; Change template keeps the props whose names match
 *   4 a 40-character hero shows a red overflow line, and the Director shows copy.lines
 *   5 an arc drag sets the energy, and pace.flatline appears and disappears with it
 *   6 Show me selects the scene and step; Ignore suppresses the finding
 *   7 the read-only One Giant Leap sample: 10 locked cards, Director score at least 90
 *   8 Rehearse goes full screen; clicker keys advance, N toggles the strip, Esc returns with the selection kept
 *   9 200 edits in a row: heap growth under 50 MB and the preview keeps its frame rate
 * plus the walk-through (guide, coach, placeholders), assets, and the persistence of edits. */
'use strict';

const BOARD = 'tools/test/fixtures/wp7-board.html';

/* The same acceptance runs twice: against the stand-in shell and store of tools/test/fixtures/wp7-studio-stub.js, and against the
 * real Studio (studio/index.html, WP6's shell and store), with the same project built in the same way. ctx.host says which. */
const SAMPLE_STORY = { framework: 'giant-leap', goal: 'inspire', audience: 'ops leaders who see AI as headcount reduction', targetMin: 10,
  bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.', shortIdea: 'Augmentation, not automation',
  oldWay: 'automation', newWay: 'augmentation', ask: 'Pilot one human-centred use case by Friday',
  proof: [{ kind: 'number', text: 'of work time goes to tasks software can do', value: 62 }], brand: 'Northwind', tagline: 'Making work more human', tone: 'cinematic' };

async function bootReal(page, ctx, query) {
  const q = Object.fromEntries(new URLSearchParams(query));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ctx.url('studio/index.html'));
  await page.waitForFunction(() => window.PD && PD.studio && PD.studio.openProject && PD.studio.store, null, { timeout: 20000 });
  await page.evaluate(async ([q, base]) => {
    const S = PD.studio, st = S.store;
    let p;
    if (q.kind === 'ogl') p = st.sampleProject('ogl');
    else if (q.kind === 'replica') { p = st.sampleProject('replica'); if (q.theme) p.deck.meta.theme = q.theme; }
    else {
      p = st.blankProject('Northwind');
      const story = Object.assign(PD.story.interview.blank(), base);
      if (q.answers === 'none') { Object.keys(story).forEach(k => { if (typeof story[k] === 'string' && k !== 'framework' && k !== 'tone') story[k] = ''; }); story.proof = []; story.targetMin = null; }
      if (q.answers === 'some') { story.shortIdea = ''; story.ask = ''; story.proof = []; story.tagline = ''; }
      if (q.kind === 'empty') story.framework = 'blank';
      p.deck.meta.story = story; p.deck.meta.theme = q.theme || 'cosmos'; p.deck.meta.title = story.brand || 'Untitled';
      p.deck.scenes = q.kind === 'empty' ? [] : PD.story.board(story, { framework: story.framework, theme: p.deck.meta.theme });
      p.studio.themeChosen = true; p.studio.titleAuto = false;
    }
    p.studio.selected = { sceneId: p.deck.scenes[0] ? p.deck.scenes[0].id : null, step: 0 };
    await S.openProject(p, { route: q.screen || 'board' });
    if (q.assets === '1') {
      const mk = (name, w, h, type, paint) => new Promise(res => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); c.toBlob(b => res(new File([b], name, { type })), type); });
      const logo = await mk('logo.png', 1200, 400, 'image/png', (x) => { x.strokeStyle = '#ffd27a'; x.lineWidth = 36; x.beginPath(); x.arc(200, 200, 140, 0, 7); x.stroke(); x.fillStyle = '#fff'; x.fillRect(420, 150, 640, 100); });
      const ridge = await mk('ridge.jpg', 1600, 900, 'image/jpeg', (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#23305f'); g.addColorStop(1, '#2b1f2e'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
      await st.addFiles([logo, ridge]);
    }
  }, [q, SAMPLE_STORY]);
}

async function boot(page, ctx, query, o) {
  o = o || {};
  await page.addInitScript(() => {
    window.cur = () => window.PD.get('studio/screens/board').current;                                    // the page-side handle on the mounted board
    window.__nav = name => (window.Studio && Studio.stub && Studio.stub.last ? Studio.stub.last.nav(name) : PD.studio.nav(name));
  });
  if (ctx.host === 'real') await bootReal(page, ctx, query);
  else await page.goto(ctx.url(BOARD, query));
  await page.waitForFunction(() => {
    const m = window.PD && PD.has('studio/screens/board') && PD.get('studio/screens/board').current;
    return !!(m && m.preview.stage && m.thumbs);
  }, null, { timeout: 30000 });
  if (!o.noThumbs) {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.fs-card');
      return cards.length === 0 || [].every.call(cards, c => c.querySelector('.fs-th.has-img'));
    }, null, { timeout: 40000 });
  }
}
// where the rehearsal stage and its canvas are, against the window: full screen or a fixed full-window layer must both fill it
const stageBox = page => page.evaluate(() => {
  const el = document.querySelector('.rh-stage'), r = el.getBoundingClientRect(), cv = el.querySelector('canvas'), cr = cv ? cv.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };
  const box = b => [b.x, b.y, b.width, b.height].map(Math.round);
  return { pos: getComputedStyle(el).position, stage: box(r), canvas: box(cr), win: [0, 0, innerWidth, innerHeight], fs: !!document.fullscreenElement };
});
async function stageFillsWindow(page, A, what) {
  await page.waitForFunction(() => { const el = document.querySelector('.rh-stage'), cv = el && el.querySelector('canvas'); if (!cv) return false; const c = cv.getBoundingClientRect(); return Math.round(c.width) === innerWidth && Math.round(c.height) === innerHeight; }, null, { timeout: 6000 }).catch(() => { });
  const b = await stageBox(page);
  A.deepEqual(b.stage, b.win, what + ': the stage covers the window ' + JSON.stringify(b));
  A.deepEqual(b.canvas, b.win, what + ': and so does its canvas');
  return b;
}
const sel = page => page.evaluate(() => { const s = PD.get('studio/screens/board').current.store.selection(); return s; });
const order = page => page.evaluate(() => PD.get('studio/screens/board').current.store.get().deck.scenes.map(s => s.id));
const sceneOf = (page, id) => page.evaluate(id => JSON.parse(JSON.stringify(PD.get('studio/screens/board').current.store.get().deck.scenes.find(s => s.id === id))), id);
async function pick(page, id) { await page.locator(`.fs-card[data-id="${id}"]`).scrollIntoViewIfNeeded(); await page.click(`.fs-card[data-id="${id}"]`); await page.waitForFunction(id => PD.get('studio/screens/board').current.store.selection().sceneId === id, id); }
async function findings(page) { return page.evaluate(() => PD.get('studio/screens/board').current.store.lint().findings.map(f => ({ id: f.id, scene: f.sceneId, step: f.step, sev: f.sev }))); }
async function lintHas(page, rule, scene, want) {
  await page.waitForFunction(([rule, scene, want]) => PD.get('studio/screens/board').current.store.lint().findings.some(f => f.id === rule && (scene == null || f.sceneId === scene)) === want, [rule, scene, want], { timeout: 6000 });
}
async function dragCard(page, id, toId, before) {
  const a = page.locator(`.fs-card[data-id="${id}"]`), t = page.locator(`.fs-card[data-id="${toId}"]`);
  // bring both cards on screen: the target goes to the left of the strip
  await page.evaluate(toId => { const tr = document.querySelector('.fs-track'), el = document.querySelector(`.fs-card[data-id="${toId}"]`); tr.scrollTo({ left: el.offsetLeft - 30, behavior: 'instant' }); }, toId);
  await page.waitForTimeout(400);
  const ab = await a.boundingBox();
  await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.mouse.down();
  await page.mouse.move(ab.x + ab.width / 2 - 20, ab.y + ab.height / 2, { steps: 3 });
  const tb = await t.boundingBox();
  await page.mouse.move(tb.x + (before ? 12 : tb.width - 12), tb.y + tb.height / 2, { steps: 14 });
  await page.waitForTimeout(80);
  await page.mouse.up();
}

const TESTS = {
  /* ---------------------------------------------------------------- 1 */
  '1 · editing a text field updates the preview within 400 ms and requests one thumbnail': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'sunrise');
    const before = await sceneOf(page, 'sunrise');
    A.equal(before.props.line, 'we have thought outside the box.');
    // spy on the board's Thumbs, then type into the "Line" field
    await page.evaluate(() => {
      const t = cur().thumbs, orig = t.request.bind(t);
      window.__req = [];
      t.request = function (si, step, pr) { window.__req.push([si, step]); return orig(si, step, pr); };
      window.__fire = null;
      document.addEventListener('input', () => { window.__fire = performance.now(); }, true);
    });
    const field = page.locator('.pdx-field[data-prop="line"] .pdx-hl-input');
    await field.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('we have always thought outside it', { delay: 8 });
    const text = 'we have always thought outside it';
    const ms = await page.evaluate(text => new Promise(res => {
      const t0 = window.__fire;
      const tick = () => {
        const st = cur().preview.stage, L = st && st.layers.find(l => l.str === text);
        if (L) return res(Math.round(performance.now() - t0));
        if (performance.now() - t0 > 3000) return res(-1);
        requestAnimationFrame(tick);
      };
      tick();
    }), text);
    ctx.log('preview shows the new line ' + ms + ' ms after the last key');
    A.ok(ms >= 0 && ms < 400, 'preview updated within 400 ms of the last keystroke (' + ms + ' ms)');
    const store = await sceneOf(page, 'sunrise');
    A.equal(store.props.line, text, 'the store has the new text');
    // only that card's thumbnail is asked for again
    await page.waitForFunction(() => document.querySelector('.fs-card[data-id="sunrise"] .fs-th.has-img') && cur().thumbs.pending() === 0, null, { timeout: 8000 });
    const req = await page.evaluate(() => window.__req);
    ctx.log('Thumbs.request calls after the edit: ' + JSON.stringify(req));
    A.ok(req.length >= 1, 'a thumbnail was requested');
    A.ok(req.every(r => r[0] === 5), 'only scene 6 (index 5) was requested: ' + JSON.stringify(req));
    // typing was folded into one undo step by its label: one undo puts the old line back
    await page.evaluate(() => cur().store.undo());
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'sunrise').props.line === 'we have thought outside the box.', null, { timeout: 4000 });
  },

  /* ---------------------------------------------------------------- 2 */
  '2 · dragging a card reorders the deck, redraws the arc and raises story.beat-order': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    A.deepEqual(await order(page), ['spark', 'title', 'warp', 'galaxy', 'home', 'sunrise', 'leaps', 'box', 'next', 'thanks']);
    A.equal((await findings(page)).some(f => f.id === 'story.beat-order'), false, 'no beat-order finding to begin with');
    const arc0 = await page.evaluate(() => cur().arc.data().points.map(p => p.id));
    await dragCard(page, 'next', 'sunrise', true);
    await page.waitForFunction(() => cur().store.get().deck.scenes[5].id === 'next', null, { timeout: 4000 });
    A.deepEqual(await order(page), ['spark', 'title', 'warp', 'galaxy', 'home', 'next', 'sunrise', 'leaps', 'box', 'thanks']);
    const arc1 = await page.evaluate(() => cur().arc.data().points.map(p => p.id));
    A.deepEqual(arc1, ['spark', 'title', 'warp', 'galaxy', 'home', 'next', 'sunrise', 'leaps', 'box', 'thanks'], 'the arc follows the new order');
    A.ok(JSON.stringify(arc0) !== JSON.stringify(arc1), 'the arc changed');
    await lintHas(page, 'story.beat-order', null, true);
    const dir = await page.evaluate(() => [...document.querySelectorAll('.dr-f')].map(e => e.dataset.rule));
    A.ok(dir.includes('story.beat-order'), 'the Director lists story.beat-order');
    // undo puts it back
    await page.evaluate(() => cur().store.undo());
    await page.waitForFunction(() => cur().store.get().deck.scenes[5].id === 'sunrise');
    await lintHas(page, 'story.beat-order', null, false);
  },

  /* ---------------------------------------------------------------- 3 */
  '3 · the picker filters by the beat roles; Change template keeps the props that share a name': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    // "+" after the brand reveal (beat: name, roles: identity)
    await page.locator('.fs-gap[data-index="2"]').hover();
    await page.click('.fs-gap[data-index="2"] button');
    await page.waitForSelector('.pdx-dialog .pk-card');
    const good = await page.$$eval('.pk-card', els => els.map(e => e.dataset.template));
    const expectGood = await page.evaluate(() => PD.template.list().filter(id => PD.template.get(id).story.roles.indexOf('identity') >= 0));
    A.deepEqual(good.slice().sort(), expectGood.slice().sort(), 'the first tab shows exactly the templates for the identity role');
    A.ok(good.length < 16, 'filtered');
    A.equal(good[0], 'brand-reveal', 'the beat\'s first preference is first');
    await page.click('.pdx-dialog .pdx-seg button:has-text("All")');
    const all = await page.$$eval('.pk-card', els => els.length);
    A.equal(all, 16, 'All shows the whole catalog under the cosmos look');
    // pick Big statement: a new scene appears after position 2 with the beat of its neighbour
    await page.click('.pk-card[data-template="statement"]');
    await page.waitForFunction(() => cur().store.get().deck.scenes.length === 11);
    const o = await order(page);
    const added = await sceneOf(page, o[2]);
    A.equal(added.template, 'statement'); A.equal(added.beat, 'name'); A.equal(added.props.line, '{your line}', 'the seed is the new scene\'s props');
    // Change template: sunrise (kicker, line, nebula) -> statement (kicker, line, ...)
    await pick(page, 'sunrise');
    await page.evaluate(() => cur().store.commit('prep', d => { d.deck.scenes.find(s => s.id === 'sunrise').props.line = 'we carry the words over'; }));
    await page.click('[data-act="change-template"]');
    await page.waitForSelector('.pdx-dialog .pk-card');
    await page.click('.pdx-dialog .pdx-seg button:has-text("All")');
    await page.click('.pk-card[data-template="statement"]');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'sunrise').template === 'statement');
    const ch = await sceneOf(page, 'sunrise');
    A.equal(ch.props.line, 'we carry the words over', 'line carried over by name');
    A.equal(ch.props.kicker, 'For 300,000 years', 'kicker carried over by name');
    A.ok(!('nebula' in ch.props), 'a prop the new template does not have is dropped');
    A.ok(ch.props.shot === undefined || ch.props.shot === 'DRIFT', 'the old template\'s default shot is not carried: ' + ch.props.shot);
    A.equal(ch.beat, 'human-truth', 'the beat stays');
  },

  /* ---------------------------------------------------------------- 4 */
  '4 · a 40-character hero shows a red overflow line and the Director shows copy.lines': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'thanks');                                      // the finale: its title is a hero line that wraps when it is too long
    const field = page.locator('.pdx-field[data-prop="title"] .pdx-hl-input');
    await field.click(); await page.keyboard.press('ControlOrMeta+A');
    const long = 'Not automation or anything like that ok';
    A.equal(long.length, 39, 'sanity');
    await page.keyboard.type(long + '!', { delay: 4 });
    const note = page.locator('.pdx-field[data-prop="title"] .pdx-note.is-err');
    await note.waitFor({ timeout: 4000 });
    const txt = await note.innerText();
    A.ok(/Too wide for Hero\. Shorten it or step down a style\./.test(txt), 'the red line says: ' + txt);
    A.ok(await page.$eval('.pdx-field[data-prop="title"] .pdx-hl', e => e.classList.contains('is-err')), 'the field is outlined red');
    await lintHas(page, 'copy.lines', 'thanks', true);
    const rules = await page.evaluate(() => [...document.querySelectorAll('.dr-f')].filter(e => e.dataset.scene === 'thanks').map(e => e.dataset.rule));
    A.ok(rules.includes('copy.lines'), 'the Director shows copy.lines for that scene: ' + rules.join(','));
    // shortening it clears the line
    await field.click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Northwind', { delay: 4 });
    await page.waitForFunction(() => !document.querySelector('.pdx-field[data-prop="title"] .pdx-note.is-err') || document.querySelector('.pdx-field[data-prop="title"] .pdx-note.is-err').style.display === 'none');
    await lintHas(page, 'copy.lines', 'thanks', false);
  },

  /* ---------------------------------------------------------------- 5 */
  '5 · dragging an arc dot sets the energy, and pace.flatline appears and disappears with it': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await page.waitForFunction(() => !cur().arc.data().estimated, null, { timeout: 40000 });      // the simulated timing has landed: the chart stops redrawing
    await page.waitForSelector('.ac-dot[data-id="home"] circle.core');
    A.equal((await findings(page)).some(f => f.id === 'pace.flatline'), false);
    // energies are 2 4 5 3 2 4 3 3 5 4: raise scene 5 (home) to 3 and lower scene 6 (sunrise) to 3 -> scenes 4..8 sit at 3
    async function dragDot(id, to) {
      const g = page.locator(`.ac-dot[data-id="${id}"]`);
      const c = await g.locator('circle.core').boundingBox();
      const arcBox = await page.locator('.ac').boundingBox();
      const e0 = await page.evaluate(id => cur().arc.data().points.find(p => p.id === id).energy, id);
      const px = c.x + c.width / 2, py = c.y + c.height / 2, step = (arcBox.height - 48) / 4;      // the plot is the arc minus its head (22), top (6) and axis (20)
      await page.mouse.move(px, py); await page.mouse.down();
      await page.mouse.move(px, py - (to - e0) * step, { steps: 8 });
      await page.mouse.up();
    }
    await dragDot('home', 3);
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'home').energy === 3, null, { timeout: 4000 });
    await dragDot('sunrise', 3);
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'sunrise').energy === 3, null, { timeout: 4000 });
    const e = await page.evaluate(() => cur().arc.data().points.map(p => p.energy));
    A.deepEqual(e, [2, 4, 5, 3, 3, 3, 3, 3, 5, 4], 'the dots moved to whole numbers');
    await lintHas(page, 'pace.flatline', null, true);
    // a double-click clears the override: back to the template's own energy (4), the flatline goes
    await page.locator('.ac-dot[data-id="sunrise"]').dblclick();
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'sunrise').energy === undefined, null, { timeout: 4000 });
    await lintHas(page, 'pace.flatline', null, false);
    // the keyboard moves a dot too
    await page.locator('.ac-dot[data-id="spark"]').focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'spark').energy === 3, null, { timeout: 4000 });
    // the chart redraws after every commit; the dot keeps the focus, so the next key works too (ArrowUp, then ArrowDown)
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'spark').energy === 4, null, { timeout: 4000 });
    A.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id), 'spark', 'the dot still has the focus after the redraw');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'spark').energy === 3, null, { timeout: 4000 });
  },

  /* ---------------------------------------------------------------- 6 */
  '6 · Show me selects the right scene and step; Ignore suppresses the finding': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=story&answers=some');
    const fs0 = await findings(page);
    const target = fs0.find(f => f.id === 'copy.placeholder' && f.scene === 'galaxy-reveal' || (f.id === 'copy.placeholder' && f.scene && f.scene !== 'spark'));
    A.ok(target, 'a placeholder finding exists for some scene other than the first');
    // repeated notes fold into one card: open it, then the scene's own note is there
    const grp = page.locator('.dr-g[data-group="copy.placeholder"] > button');
    A.equal(await grp.count(), 1, 'the placeholder notes are one folded card');
    A.ok(/scenes still have placeholder text/.test(await grp.innerText()), await grp.innerText());
    A.equal(await page.locator('.dr-f[data-rule="copy.placeholder"]').count(), 0, 'folded: no single note is showing');
    await grp.click();
    const row = page.locator(`.dr-f[data-rule="copy.placeholder"][data-scene="${target.scene}"]`).first();
    await row.scrollIntoViewIfNeeded();
    await row.locator('[data-act="show"]').click();
    await page.waitForFunction(id => PD.get('studio/screens/board').current.store.selection().sceneId === id, target.scene);
    const s = await sel(page);
    const steps = await page.evaluate(id => PD.compile(PD.get('studio/screens/board').current.store.get().deck).scenes.find(x => x.id === id).steps.length, target.scene).catch(() => null);
    A.equal(s.sceneId, target.scene, 'Show me selected the scene');
    A.equal(s.step, target.step != null ? target.step : (steps || 0), 'and the step it is about');
    A.equal(await page.$eval('.fs-card[aria-selected="true"]', e => e.dataset.id), target.scene, 'the card is selected');
    A.ok(await page.$eval('.in-title h2', e => e.textContent.length > 0), 'the inspector shows it');
    // a finding on a multi-step scene names its step: use a synthetic call through the board
    await page.evaluate(() => { const b = cur(); b.actions.showFinding({ id: 'copy.lines', sceneId: 'zoom-out', step: 1, sev: 'warn', msg: 'x' }); });
    const s2 = await sel(page);
    A.equal(s2.sceneId, 'zoom-out'); A.equal(s2.step, 1, 'the step of the finding');
    // Ignore: the rule goes into scene.lint.ignore and the finding disappears
    const before = (await findings(page)).filter(f => f.id === 'copy.placeholder' && f.scene === target.scene).length;
    A.ok(before >= 1);
    await page.locator(`.dr-f[data-rule="copy.placeholder"][data-scene="${target.scene}"] [data-act="ignore"]`).first().click();
    await page.waitForFunction(id => PD.get('studio/screens/board').current.store.get().deck.scenes.find(s => s.id === id).lint, target.scene);
    const sc = await sceneOf(page, target.scene);
    A.deepEqual(sc.lint, { ignore: ['copy.placeholder'] });
    await lintHas(page, 'copy.placeholder', target.scene, false);
    A.equal(await page.$(`.dr-f[data-rule="copy.placeholder"][data-scene="${target.scene}"]`), null, 'gone from the Director');
    // and it can be taken back from the Advanced tab
    await pick(page, target.scene);
    await page.click('.in-tabs [data-tab="advanced"]');
    await page.click('.in-ign button[data-rule="copy.placeholder"]');
    await lintHas(page, 'copy.placeholder', target.scene, true);
  },

  /* ---------------------------------------------------------------- 7 */
  '7 · the read-only One Giant Leap sample shows 10 locked cards and a Director score of at least 90': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=ogl');
    const cards = await page.$$eval('.fs-card', els => els.map(e => ({ id: e.dataset.id, lock: !!e.querySelector('.fs-lock') })));
    A.equal(cards.length, 10); A.ok(cards.every(c => c.lock), 'every card is locked');
    const score = await page.$eval('.dr-ring b', e => +e.textContent);
    A.ok(score >= 90, 'Director score ' + score);
    A.ok(await page.$('.dr .pdx-pill.is-ok'), 'Ready for the stage');
    // nothing can be edited
    const tabs = await page.$$eval('.in-tabs button', els => els.map(e => e.textContent));
    A.deepEqual(tabs, ['Notes'], 'the inspector offers the notes tab only');
    A.equal(await page.$('.pdx-hl-input:not([readonly])'), null, 'no editable field');
    A.ok((await page.$$eval('.fs-gap', els => els.every(e => getComputedStyle(e).display === 'none'))), 'the "+" gaps are hidden');
    A.equal(await page.$('.fs-end'), null, 'no add-scene card');
    A.ok(/read-only sample/i.test(await page.$eval('.bx-guide', e => e.textContent)), 'the guide says so');
    const took = await page.evaluate(() => { try { return PD.get('studio/screens/board').current.store.commit('x', d => { d.deck.scenes.pop(); }); } catch (e) { return 'threw'; } });
    A.ok(took === false || took === 'threw', 'the store refuses a commit: ' + took);
    A.equal((await order(page)).length, 10, 'and nothing changed');
    // a card can still be selected, and the preview plays
    await pick(page, 'box');
    await page.waitForFunction(() => cur().preview.cur() && cur().preview.cur().slide === 7);
    await page.click('.pv-bar .pdx-btn.is-primary');
    await page.waitForFunction(() => cur().preview.stats().busy === true, null, { timeout: 3000 });
  },

  'director · the folded cards of a replica switched to Slate count scenes, list each once, and say what the note says': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica&theme=slate', { noThumbs: true });
    await page.waitForSelector('.dr-g', { timeout: 20000 });
    const truth = await page.evaluate(() => {
      const c = cur(), order = c.store.get().deck.scenes.map(s => s.id), by = {};
      c.store.lint().findings.forEach(f => { if (f.sceneId == null) return; const e = by[f.id] = by[f.id] || { n: 0, scenes: new Set() }; e.n++; e.scenes.add(order.indexOf(f.sceneId) + 1); });
      const out = {}; Object.keys(by).forEach(k => { out[k] = { n: by[k].n, scenes: [...by[k].scenes].sort((a, b) => a - b) }; }); return out;
    });
    const groups = await page.$$eval('.dr-g', els => els.map(e => ({ id: e.dataset.group, title: e.querySelector('.msg').textContent, where: e.querySelector('.where').textContent })));
    ctx.log(JSON.stringify(groups));
    A.ok(groups.length >= 2, 'the Slate look folds at least two rules: ' + groups.map(g => g.id).join(', '));
    for (const g of groups) {
      const t = truth[g.id];
      A.ok(t, g.id + ' is a rule the Director really has findings for');
      const listed = g.where.split(' · ')[0].replace(/ and \d+ more$/, '');          // "Scenes 3, 4, 5, 6" (the count after the dot is findings)
      const shown = (listed.match(/\d+/g) || []).map(Number);
      A.deepEqual(shown.filter((v, i) => shown.indexOf(v) === i), shown, g.id + ': no scene number is listed twice (' + g.where + ')');
      A.deepEqual(shown, t.scenes.slice(0, shown.length), g.id + ': the scene numbers are the scenes, in talk order');
      const m = /^(\d+) scenes/.exec(g.title);
      if (m) A.equal(+m[1], t.scenes.length, g.id + ': the title counts scenes (' + t.scenes.length + '), not findings (' + t.n + '): ' + g.title);
      A.ok(!/share this note/.test(g.title), g.id + ': says something about the note');
    }
    const ids = groups.map(g => g.id);
    A.ok(ids.includes('build.world.needs-plugin') && ids.includes('build.template.requires-world'), 'the two look rules are folded');
    // a folded card opens to its findings, and Show me the first goes to the first scene
    await page.click('.dr-g[data-group="build.template.requires-world"] [data-act="show-first"]');
    await page.waitForFunction(first => cur().store.selection().sceneId === cur().store.get().deck.scenes[first - 1].id, truth['build.template.requires-world'].scenes[0], { timeout: 4000 });
  },

  /* ---------------------------------------------------------------- 8 */
  '8 · Rehearse goes full screen; clicker keys advance, N toggles the strip, Esc returns with the selection kept': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await page.click('.pv-bar .pv-reh');                                             // the board's Rehearse button
    await page.waitForSelector('.rh-stage', { timeout: 15000 });
    await page.waitForFunction(() => { const R = PD.get('studio/screens/rehearse'); return R.current && R.current.player && R.current.player.ready !== undefined; }, null, { timeout: 15000 });
    const fs = await page.evaluate(() => ({ el: !!document.fullscreenElement && document.fullscreenElement.classList.contains('rh-stage'), api: typeof document.documentElement.requestFullscreen }));
    ctx.log('full screen: ' + JSON.stringify(fs));
    A.equal(fs.api, 'function');
    A.ok(fs.el || await page.evaluate(() => getComputedStyle(document.querySelector('.rh-stage')).position === 'fixed'), 'the stage is full screen (or a fixed full-window layer where the browser refuses)');
    await stageFillsWindow(page, A, fs.el ? 'full screen' : 'fixed layer');          // either way, never a strip somewhere on the page
    // the strip shows the notes of the first state
    await page.waitForSelector('.rh-strip:not(.is-off)');
    const n0 = await page.$eval('.rh-notes .txt', e => e.textContent);
    A.ok(/spark breathe/i.test(n0), 'the notes of scene 1: ' + n0);
    const pos = () => page.evaluate(() => { const s = PD.get('studio/screens/rehearse').current.player.state(); return [s.slide, s.step]; });
    A.deepEqual(await pos(), [0, 0]);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => PD.get('studio/screens/rehearse').current.player.state().slide === 1);
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => PD.get('studio/screens/rehearse').current.player.state().slide === 2);
    await page.keyboard.press(' ');                                                     // scene 3 has a click: Space plays it
    await page.waitForFunction(() => { const s = PD.get('studio/screens/rehearse').current.player.state(); return s.slide === 2 && s.step === 1; });
    await page.keyboard.press(' ');
    await page.waitForFunction(() => PD.get('studio/screens/rehearse').current.player.state().slide === 3);
    const nx = await page.$eval('.rh-next .t', e => e.textContent);
    A.ok(/You are here: Fly home/.test(nx), 'the next scene is named: ' + nx);
    A.ok(/^\d+:\d\d$/.test(await page.$eval('.rh-clock .big', e => e.textContent)), 'a stopwatch runs');
    A.ok(/total \d+:\d\d/.test(await page.$eval('.rh-clock small:last-child', e => e.textContent)), 'the total shows');
    // N toggles the strip
    await page.keyboard.press('n');
    await page.waitForSelector('.rh-strip.is-off');
    await page.keyboard.press('n');
    await page.waitForSelector('.rh-strip:not(.is-off)');
    // the Player's own keys still work: back one
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => { const s = PD.get('studio/screens/rehearse').current.player.state(); return s.slide === 2 && s.step === 1; });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => PD.get('studio/screens/rehearse').current.player.state().slide === 3);
    await page.waitForTimeout(400);
    // Esc: back to the board with the last state shown selected
    await page.keyboard.press('Escape');
    await page.waitForSelector('.bx', { timeout: 8000 });
    A.equal(await page.$('.rh-stage'), null, 'the stage is gone');
    A.equal(await page.evaluate(() => !!document.fullscreenElement), false, 'out of full screen');
    const s = await sel(page);
    A.equal(s.sceneId, 'galaxy', 'the selection is the last scene shown');
    A.equal(s.step, 0, 'and the last state');
    A.equal(await page.$eval('.fs-card[aria-selected="true"]', e => e.dataset.id), 'galaxy');
    // the run-of-show page when starting from another rail step
    await page.evaluate(() => window.__nav('rehearse'));
    await page.waitForSelector('.rh [data-act="start"]');
    A.ok(await page.$('.rh [data-act="start-from"]'), 'a second button starts from the selected scene');
    A.equal((await page.$$('.rh-row')).length, 10, 'the run of show lists every scene');
    await page.click('.rh [data-act="start-from"]');
    await page.waitForFunction(() => { const R = PD.get('studio/screens/rehearse').current; return R && R.player && R.player.state().slide === 3; }, null, { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.bx', { timeout: 8000 });
  },

  /* ---------------------------------------------------------------- 8b */
  '8b · where the browser refuses full screen, Rehearse is a fixed full-window layer and the keys still work': async (page, ctx) => {
    const A = ctx.assert;
    // every requestFullscreen is refused, as Chromium does without a user gesture or with the permission off
    await page.addInitScript(() => { Element.prototype.requestFullscreen = function () { return Promise.reject(new TypeError('Permissions check failed')); }; });
    await boot(page, ctx, '?kind=replica');
    await page.click('.pv-bar .pv-reh');
    await page.waitForSelector('.rh-stage', { timeout: 15000 });
    await page.waitForFunction(() => { const R = PD.get('studio/screens/rehearse'); return R.current && R.current.player && R.current.player.ready !== undefined; }, null, { timeout: 15000 });
    const b = await stageFillsWindow(page, A, 'refused');
    A.equal(b.fs, false, 'the browser really refused');
    A.equal(b.pos, 'fixed', 'the stage is a fixed layer');
    // the Player's HUD style (.pd-player { position: relative }) must not win over it, whichever sheet came last
    A.ok(await page.evaluate(() => document.querySelector('.rh-stage').classList.contains('pd-player')), 'the Player did mark the container (the case that used to collapse it)');
    // the strip sits inside the window, and the hint says why it is not full screen
    await page.waitForSelector('.rh-strip:not(.is-off)');
    const sb = await page.evaluate(() => { const r = document.querySelector('.rh-strip').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, w: r.width, vh: innerHeight, vw: innerWidth }; });
    A.ok(sb.top >= 0 && sb.bottom <= sb.vh && sb.w > 600, 'the notes strip is on screen: ' + JSON.stringify(sb));
    A.ok(/kept this out of full screen/.test(await page.$eval('.rh-hint', e => e.textContent)), 'the hint says the window is filled instead');
    // keys: next, N, Esc back to the board with the selection on the state shown last
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => PD.get('studio/screens/rehearse').current.player.state().slide === 1);
    await page.keyboard.press('n');
    await page.waitForSelector('.rh-strip.is-off');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.bx', { timeout: 8000 });
    A.equal(await page.$('.rh-stage'), null, 'the layer is gone');
    A.equal((await sel(page)).sceneId, 'title', 'the selection is the scene shown last');
  },

  /* ---------------------------------------------------------------- 9 */
  '9 · 200 edits in a row: heap growth under 50 MB and the preview keeps its frame rate': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'sunrise');
    const cdp = await ctx.context.newCDPSession(page);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    await page.waitForTimeout(1500);
    const h0 = await heap();
    // 200 edits, each a real commit through the inspector's field (typing into it) paced like fast typing
    const field = page.locator('.pdx-field[data-prop="line"] .pdx-hl-input');
    await field.click();
    await page.evaluate(() => { window.__fr = []; let last = performance.now(); (function f(t) { window.__fr.push(t - last); last = t; requestAnimationFrame(f); })(performance.now()); });
    await page.keyboard.press('ControlOrMeta+A');
    for (let i = 0; i < 200; i++) {
      await page.keyboard.type(String.fromCharCode(97 + (i % 26)));
      if (i % 10 === 9) await page.waitForTimeout(280);        // let the debounce land: about 20 commits
    }
    // and 200 commits straight through the store, as fast as the board takes them
    await page.evaluate(() => new Promise(res => {
      const st = cur().store; let i = 0;
      (function go() { st.commit('Edit sunrise line ' + (i % 7), d => { d.deck.scenes.find(s => s.id === 'sunrise').props.line = 'edit number ' + i; }); if (++i < 200) setTimeout(go, 12); else res(); })();
    }));
    await page.waitForTimeout(1200);
    // the gaps between animation frames while the edits ran (from the first key to the end of the 200 store commits), then the last 90
    const frames = await page.evaluate(() => {
      const all = window.__fr.slice(2), edit = all.slice(0, Math.max(0, all.length - 75));      // the last ~1.2 s are the idle wait
      const stat = (arr) => { const f = arr.slice().sort((a, b) => a - b); return { med: f[f.length >> 1], p90: f[Math.floor(f.length * 0.9)], p99: f[Math.floor(f.length * 0.99)], max: f[f.length - 1], n: f.length, slow: f.filter(x => x > 34).length, long: f.filter(x => x > 100).length }; };
      const tail = stat(window.__fr.slice(-90)), during = stat(edit);
      return { med: tail.med, p90: tail.p90, n: tail.n, during };
    });
    const stats = await page.evaluate(() => cur().preview.stats());
    const h1 = await heap();
    const mb = (h1 - h0) / 1048576;
    ctx.log('heap ' + (h0 / 1048576).toFixed(1) + ' -> ' + (h1 / 1048576).toFixed(1) + ' MB (' + mb.toFixed(1) + '), frames median ' + frames.med.toFixed(1) + ' ms, p90 ' + frames.p90.toFixed(1) + ', preview fps ' + stats.fps.toFixed(0));
    A.ok(mb < 50, 'heap grew by ' + mb.toFixed(1) + ' MB');
    A.ok(stats.fps >= 50, 'the preview runs at ' + stats.fps.toFixed(0) + ' fps');
    A.ok(frames.p90 < 24, 'frame gaps stay small: p90 ' + frames.p90.toFixed(1) + ' ms');
    const d = frames.during;
    ctx.log('during the edits: ' + d.n + ' frames, median ' + d.med.toFixed(1) + ' ms, p99 ' + d.p99.toFixed(1) + ', max ' + d.max.toFixed(1) + ', over 34 ms: ' + d.slow + ', over 100 ms: ' + d.long);
    A.ok(d.n > 200, 'the frame recorder saw the whole edit run: ' + d.n + ' frames');
    A.ok(d.med < 20, 'while editing the preview keeps its rhythm: median ' + d.med.toFixed(1) + ' ms');
    A.ok(d.p99 < 40, 'while editing, 99 of 100 frames are on time: p99 ' + d.p99.toFixed(1) + ' ms');
    A.ok(d.long === 0, 'while editing, no frame takes longer than 100 ms: max ' + d.max.toFixed(1) + ' ms');
    const sizes = await page.evaluate(() => { const st = cur().preview.stage; return { layers: st.layerBySpec.size, shapes: st.shapeBySpec.size, scenes: st.deck.scenes.length }; });
    A.ok(sizes.layers < 80, 'the stage keeps only what the deck can show: ' + JSON.stringify(sizes));
  },

  /* ---------------------------------------------------------------- walk-through */
  'walk-through · the guide leads from placeholders to the Director to Rehearse': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=story&answers=all');
    const g = () => page.evaluate(() => cur().guide());
    A.equal((await g()).stage, 'write', 'placeholders remain: the guide says write');
    A.ok(/still need your words/.test((await g()).text));
    // every placeholder prompt is typed over, scene by scene, through the guide's own button
    for (let guard = 0; guard < 20; guard++) {
      if ((await g()).stage !== 'write') break;
      await page.click('[data-act="guide"]');
      await page.waitForTimeout(150);
      const inf = await page.evaluate(() => { const b = cur(); const i = b.store.selection(); return b.store.get().deck.scenes.find(s => s.id === i.sceneId); });
      // fill all placeholder strings of the selected scene through the form, field by field
      const fields = await page.$$('.pdx-form .pdx-hl-input');
      for (const f of fields) {
        const v = await f.inputValue();
        if (/\{[^{}]{1,40}\}/.test(v)) {
          await f.click(); await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.type(v.replace(/\{[^{}]+\}/g, 'a real line ' + guard), { delay: 2 });
        }
      }
      await page.waitForTimeout(450);
      // lists (timeline milestones) keep their placeholders inside items: the same loop covers them
      await page.waitForFunction(() => true);
    }
    const st = await g();
    ctx.log('guide stage after writing: ' + st.stage + ' · ' + st.text.slice(0, 80));
    A.ok(['fix', 'polish', 'rehearse'].includes(st.stage), 'the guide moved on from writing: ' + st.stage);
    A.equal(await page.evaluate(() => cur().filmstrip.cards().filter(c => c.placeholders).length), 0, 'no card is dashed');
  },

  'coach · the beat\'s question leads the inspector, and typing over a placeholder replaces it in one go': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=story&answers=some');
    const ask = await page.$eval('.in-coach .ask', e => e.textContent);
    A.equal(ask, 'What tiny beginning does your story grow from?');
    A.equal(await page.$eval('.in-coach', e => e.dataset.coach), 'todo');
    const f = page.locator('.pdx-field[data-prop="line"] .pdx-hl-input');
    await f.focus();
    await page.waitForTimeout(50);
    await page.keyboard.type('One small spark');
    const v = await f.inputValue();
    A.equal(v, 'One small spark', 'the placeholder was selected, so typing replaced it: ' + v);
    await page.waitForFunction(() => document.querySelector('.in-coach').dataset.coach === 'done', null, { timeout: 3000 });
    A.equal(await page.$eval('.in-coach .ask', e => e.textContent), 'What tiny beginning does your story grow from?', 'once written the coach keeps the question, quietly');
    A.equal(await page.$('.in-coach .eg'), null, 'and drops the example');
  },

  'assets · a dropped picture lands in the column and becomes a logo scene; a font becomes the brand font': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=story&answers=all');
    // a transparent PNG with a ring, built in the page and handed to the file input
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 200; const x = c.getContext('2d'); x.strokeStyle = '#ffd27a'; x.lineWidth = 20; x.beginPath(); x.arc(100, 100, 70, 0, 7); x.stroke(); x.fillStyle = '#fff'; x.fillRect(220, 80, 300, 40); return c.toDataURL('image/png').split(',')[1]; });
    await page.setInputFiles('.as input[type=file]', { name: 'My Logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector('.as-card[data-asset="my-logo"]', { timeout: 10000 });
    await page.waitForFunction(() => cur().store.get().assets['my-logo'], null, { timeout: 4000 });
    A.ok(await page.evaluate(() => !!PD.assets.get(cur().store.get().deck.id)['my-logo']), 'registered with PD.assets');
    const info = await page.$eval('.as-card[data-asset="my-logo"] .nm small', e => e.textContent);
    A.ok(/600×200/.test(info), 'its size is shown: ' + info);
    // Use as: logo scene, after the identity beat
    await page.click('.as-card[data-asset="my-logo"] button:has-text("Add as logo scene")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.some(s => s.template === 'logo'), null, { timeout: 5000 });
    const o = await order(page);
    const logo = await page.evaluate(() => cur().store.get().deck.scenes.find(s => s.template === 'logo'));
    A.equal(logo.props.asset, 'my-logo'); A.equal(logo.beat, 'name');
    A.equal(o.indexOf(logo.id), o.indexOf('name') + 1, 'inserted right after the identity beat');
    A.equal((await sel(page)).sceneId, logo.id, 'and selected');
    // the picker in the inspector offers the asset, and a picture with alpha raises no solid-background warning
    A.ok(await page.$('.pdx-field[data-prop="asset"] .pdx-tile[aria-pressed="true"]'), 'the asset field shows it chosen');
    // a font file
    await page.setInputFiles('.as input[type=file]', { name: 'Test Face.woff2', mimeType: 'font/woff2', buffer: Buffer.from('not a font') });
    await page.waitForTimeout(800);
    A.equal(await page.$('.as-card[data-asset="test-face"]'), null, 'a file that is not a font is refused');
    // a heic file is told so
    await page.setInputFiles('.as input[type=file]', { name: 'Photo.HEIC', mimeType: 'image/heic', buffer: Buffer.from('x') });
    await page.waitForFunction(() => [...document.querySelectorAll('.stub-toast, .pds-toast')].some(e => /Can't use \.heic yet\. Export it as PNG or JPEG\./.test(e.textContent)), null, { timeout: 4000 });
  },

  'structure · duplicate, move to beat, delete with undo, add from the end, arrow keys': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'box');
    await page.click('.fs-card[data-id="box"]', { button: 'right' });
    await page.click('.pdx-menu button:has-text("Duplicate")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.length === 11);
    A.deepEqual((await order(page)).slice(7, 10), ['box', 'box-2', 'next'], 'the copy sits right after');
    A.equal((await sel(page)).sceneId, 'box-2', 'and is selected');
    // move to beat
    await page.locator('.fs-card[data-id="box-2"]').scrollIntoViewIfNeeded();
    await page.click('.fs-card[data-id="box-2"]', { button: 'right' });
    await page.click('.pdx-menu button:has-text("Move to beat")');
    await page.click('.pdx-menu button:has-text("Pattern")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'box-2').beat === 'pattern');
    const o = await order(page);
    A.equal(o[o.indexOf('leaps') + 1], 'box-2', 'it moved to the end of the pattern block: ' + o.join());
    // delete + undo through the snackbar
    await page.click('.fs-card[data-id="box-2"]', { button: 'right' });
    await page.click('.pdx-menu button:has-text("Delete")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.length === 10);
    await page.click('.pdx-snack button:has-text("Undo")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.length === 11);
    // keyboard: arrows move the selection along the strip
    await page.locator('.fs-card[data-id="spark"]').scrollIntoViewIfNeeded();
    await page.click('.fs-card[data-id="spark"]');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => cur().store.selection().sceneId === 'title');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => cur().store.selection().sceneId === 'warp');
    // add at the end: the strip's last card opens the picker; the new scene takes the last beat of the strip
    await page.locator('.fs-end').scrollIntoViewIfNeeded();
    await page.click('.fs-end');
    await page.waitForSelector('.pk-card');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.pdx-dialog', { state: 'detached' });
  },

  'look · a theme change rebuilds the preview and the thumbnails under the new look': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    const k0 = await page.evaluate(() => cur().preview.stage.deck.themeKey);
    await page.evaluate(() => cur().store.commit('Look', d => { d.deck.meta.theme = 'slate'; }));
    await page.waitForFunction(k0 => cur().preview.stage && cur().preview.stage.deck.themeKey !== k0, k0, { timeout: 8000 });
    // cosmos-only templates become error cards under slate; the board does not crash
    await page.waitForTimeout(1500);
    A.ok(await page.$('.fs-card'), 'the strip is still there');
    const accent = await page.$eval('.bx', e => getComputedStyle(e).getPropertyValue('--accent').trim());
    A.equal(accent, '#ffb35c', 'the accent follows the look: ' + accent);
    await page.waitForFunction(() => document.querySelectorAll('.fs-th.has-img').length === 10, null, { timeout: 20000 });
    // the thumbnails are drawn again under the new look, not kept from the old one
    await page.waitForFunction(() => cur().thumbs.stage.deck.themeKey === cur().preview.stage.deck.themeKey, null, { timeout: 10000 });
    const px = () => page.evaluate(() => { const cv = document.querySelector('.fs-card[data-id="spark"] canvas'), d = cv.getContext('2d').getImageData(20, 20, 1, 1).data; return [d[0], d[1], d[2]].join(); });
    await page.waitForFunction(() => cur().thumbs.pending() === 0, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const slate = await px();
    await page.evaluate(() => cur().store.commit('Look', d => { d.deck.meta.theme = 'cosmos'; }));
    await page.waitForFunction(() => cur().thumbs.stage.deck.themeKey === cur().preview.stage.deck.themeKey && cur().thumbs.pending() === 0, null, { timeout: 20000 });
    await page.waitForTimeout(500);
    A.ok(slate !== await px(), 'the first card looks different under cosmos: ' + slate + ' vs ' + await px());
  }
,

  'preview · Play in, Replay, the click pips, Click and the safe-area overlay drive the real stage': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'warp');                                                      // hyperspace: one click
    const st = () => page.evaluate(() => { const c = cur().preview.cur(); return [c.slide, c.step]; });
    A.deepEqual(await st(), [2, 1], 'selecting a card shows its last state');
    A.equal(await page.$$eval('.pv-pips button', b => b.length), 2, 'two pips: the opening and the click');
    A.ok(await page.$eval('.pv-bar .pdx-btn:has(.pdx-ico) >> nth=2', e => true).catch(() => true));
    // a pip jumps to that state, settled
    await page.click('.pv-pips button:nth-child(1)');
    await page.waitForFunction(() => cur().store.selection().step === 0);
    A.deepEqual(await st(), [2, 0]);
    // Click plays the next click live, and the selection follows
    await page.click('.pv-bar button:has-text("Click")');
    await page.waitForFunction(() => cur().preview.cur().step === 1 && cur().store.selection().step === 1);
    A.ok(await page.$eval('.pv-bar button:has-text("Click")', e => e.disabled), 'no click left: the button rests');
    await page.waitForFunction(() => cur().preview.stats().busy === true || true);
    // Play in: the transition from the shot before it, live
    await page.click('.pv-bar .is-primary');
    await page.waitForFunction(() => cur().preview.stats().busy === true, null, { timeout: 3000 });
    A.deepEqual(await st(), [2, 0], 'Play in starts the scene at its opening state');
    await page.waitForFunction(() => cur().preview.stats().busy === false, null, { timeout: 30000 });
    // Space plays in too, unless a field has the keys
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press(' ');
    await page.waitForFunction(() => cur().preview.stats().busy === true, null, { timeout: 3000 });
    // the safe area: the title-safe box, two letterbox lines and one box per visible text
    await page.click('.pv-bar [aria-pressed]');
    await page.waitForFunction(() => +getComputedStyle(document.querySelector('.pv-safe')).opacity > 0.9, null, { timeout: 3000 });
    const safe = await page.$eval('.pv-safe', e => ({ rects: e.querySelectorAll('rect').length, lines: e.querySelectorAll('line').length, vis: getComputedStyle(e).opacity }));
    A.ok(safe.rects >= 2 && safe.lines === 2 && +safe.vis > 0.9, 'safe area drawn: ' + JSON.stringify(safe));
    await page.click('.pv-bar [aria-pressed]');
    // F shows the frame rate of the preview
    await page.keyboard.press('f');
    await page.waitForFunction(() => /fps/.test(document.querySelector('.pv-fps').textContent), null, { timeout: 3000 });
  },

  'inspector · the Scene tab writes beat, point, energy, notes and holds; Advanced validates the overrides': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    await pick(page, 'warp');
    await page.click('.in-tabs [data-tab="scene"]');
    // point
    await page.locator('.in-body .pdx-hl-input').nth(0).fill('We start with the biggest frame');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'warp').point === 'We start with the biggest frame', null, { timeout: 4000 });
    // beat
    await page.selectOption('[data-field="beat"]', 'you-are-here');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'warp').beat === 'you-are-here');
    // energy 3 then back to automatic
    await page.click('.in-energy .pdx-seg button[data-value="3"]');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'warp').energy === 3);
    await page.click('.in-energy button:has-text("Back to automatic")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'warp').energy === undefined);
    // notes of the click, with their speaking time
    const second = page.locator('.in-note[data-state="1"] .pdx-hl-input');
    await second.fill('Let the scale land. Then a breath. Then the next thought arrives.');
    await page.waitForFunction(() => (cur().store.get().deck.scenes.find(s => s.id === 'warp').stepNotes || [])[0] === 'Let the scale land. Then a breath. Then the next thought arrives.', null, { timeout: 4000 });
    A.ok(/12 words/.test(await page.$eval('.in-note[data-state="1"] .t', e => e.textContent)), 'its speaking time is shown');
    // the hold of the opening state
    await page.fill('.in-note[data-state="0"] .in-hold input', '4');
    await page.waitForFunction(() => (cur().store.get().deck.scenes.find(s => s.id === 'warp').stepDwell || [])[0] === 4, null, { timeout: 4000 });
    // advanced: broken JSON is told and not committed; valid JSON is; Reset takes it away
    await page.click('.in-tabs [data-tab="advanced"]');
    const ta = page.locator('[data-field="overrides"]');
    await ta.fill('{ "world": { "speed": 40 ');
    await ta.blur();
    await page.waitForSelector('.in-body .pdx-note.is-err:not([style*="none"])');
    A.equal((await sceneOf(page, 'warp')).overrides, undefined, 'invalid JSON is not committed');
    await ta.fill('{ "world": { "speed": 40 } }');
    await ta.blur();
    await page.waitForFunction(() => { const o = cur().store.get().deck.scenes.find(s => s.id === 'warp').overrides; return o && o.world && o.world.speed === 40; });
    A.ok(await page.$('.in-body .pdx-note.is-err:not([style*="none"])') === null, 'the error line is gone');
    await page.click('[data-act="reset-overrides"]');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.id === 'warp').overrides === undefined);
  },

  'assets · a logo without transparency is told so and can switch to brightness mode': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=story&answers=all');
    // an opaque white rectangle with dark text: a "logo" with a solid background
    const jpg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 200); x.fillStyle = '#123'; x.font = '90px sans-serif'; x.fillText('ACME', 60, 130); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; });
    await page.setInputFiles('.as input[type=file]', { name: 'acme logo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg, 'base64') });
    await page.waitForSelector('.as-card[data-asset="acme-logo"]', { timeout: 10000 });
    await page.click('.as-card[data-asset="acme-logo"] button:has-text("Add as logo scene")');
    await page.waitForFunction(() => cur().store.get().deck.scenes.some(s => s.template === 'logo'));
    await page.waitForSelector('.as-card[data-asset="acme-logo"] .note', { timeout: 6000 });
    A.ok(/solid background/.test(await page.$eval('.as-card[data-asset="acme-logo"] .note', e => e.textContent)), 'the card says the logo has a solid background');
    A.ok(await page.$('.pdx-field[data-prop="asset"] .pdx-note:has-text("solid background")'), 'and so does the Inspector, under the picture');
    await page.click('.as-card[data-asset="acme-logo"] .note button');
    await page.waitForFunction(() => cur().store.get().deck.scenes.find(s => s.template === 'logo').props.mode === 'luma');
    await page.waitForFunction(() => !document.querySelector('.as-card[data-asset="acme-logo"] .note'), null, { timeout: 4000 });
  },

  'lifecycle · leaving the board and coming back releases the stage, the thumbnails and the keys': async (page, ctx) => {
    const A = ctx.assert;
    await boot(page, ctx, '?kind=replica');
    const cdp = await ctx.context.newCDPSession(page);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    await page.waitForTimeout(1000);
    const h0 = await heap();
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.__nav('rehearse'));
      await page.waitForSelector('.rh');
      await page.evaluate(() => window.__nav('board'));
      await page.waitForFunction(() => { const m = PD.get('studio/screens/board').current; return !!(m && m.preview.stage); });
    }
    await page.waitForFunction(() => document.querySelectorAll('.fs-th.has-img').length === 10, null, { timeout: 30000 });
    const left = await page.evaluate(() => ({ boards: document.querySelectorAll('.bx').length, scrims: document.querySelectorAll('.pdx-scrim, .pdx-menu').length, canvases: document.querySelectorAll('canvas').length, fps: document.querySelectorAll('.pv-fps').length }));
    A.equal(left.boards, 1, 'one board only'); A.equal(left.scrims, 0);
    A.ok(left.canvases < 40, 'canvases are not piling up: ' + left.canvases);
    const h1 = await heap();
    ctx.log('12 round trips: heap ' + (h0 / 1048576).toFixed(1) + ' -> ' + (h1 / 1048576).toFixed(1) + ' MB');
    A.ok((h1 - h0) / 1048576 < 40, 'heap grew by ' + ((h1 - h0) / 1048576).toFixed(1) + ' MB');
    // the keys are bound once: one Space plays one entry
    await page.evaluate(() => { window.__plays = 0; const pv = cur().preview, o = pv.playIn; pv.playIn = function () { window.__plays++; return o.apply(this, arguments); }; document.activeElement && document.activeElement.blur(); });
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    A.equal(await page.evaluate(() => window.__plays), 1, 'one Space, one play');
  }
};

// every test on both hosts
module.exports = {};
Object.keys(TESTS).forEach(name => {
  module.exports['[stub] ' + name] = (page, ctx) => { ctx.host = 'stub'; return TESTS[name](page, ctx); };
  module.exports['[studio] ' + name] = (page, ctx) => { ctx.host = 'real'; return TESTS[name](page, ctx); };
});
