/* studio/screens/welcome.js — Welcome (spec §7.2, WP6).
 *
 * [+ New deck], [Open a saved deck… (.html)], a Continue list from the autosave index (title, "autosaved n min ago") and
 * the two samples: "One Giant Leap (read-only)" and "One Giant Leap: template replica (editable copy)". Empty state:
 * "Nothing saved in this browser yet. Start a new deck, or open a deck you saved." Footnote: "Autosave lives in this
 * browser only. Saving to a file is the real save."
 * Behind it a live cosmos Stage slowly assembles PIXELDECK out of particles (still, when the system asks for less motion).
 * Test hooks: data-act = new | open | continue (data-id) | forget (data-id) | sample-ogl | sample-replica. */
PD.module('studio/screens/welcome', ['studio/app', 'studio/persist'], function (PD, app, persist) {
  var S = PD.studio, h = S.h, icon = S.icon;

  // the backdrop: one scene, the word assembling at the right of the frame
  function heroDeck() {
    return {
      format: 2, id: 'pdstudio-welcome', meta: { title: 'Pixeldeck Studio', theme: 'cosmos' },
      scenes: [{
        id: 'hero',
        world: { stars: 1, nebula: 'aurora', nebulaAmount: 0.9, backdrop: 0.85, dust: 0.5, speed: 20, vignette: 0.7, grain: 0.05 },
        worldTime: 0.1,
        motion: { entry: 'void', stagger: 'random', dur: 2.6, spread: 2.2 },
        text: [{ str: 'PIXELDECK', style: 'hero', size: 112, track: 0.16, x: 1290, y: 400, reveal: 'particles' }]
      }]
    };
  }

  function card(kind, attrs, kids) { return h('button', Object.assign({ type: 'button', class: 'pds-welcome-card ' + kind }, attrs), kids); }

  S.screen('welcome', {
    title: 'Welcome',
    mount: function (el, ctx) {
      var store = ctx.store, ui = ctx.ui, view = null;
      var canvas = h('canvas', { class: 'pds-welcome-canvas', 'aria-hidden': 'true' });
      var entries = persist.index();

      var newBtn = h('button', { class: 'pds-btn pds-btn-primary pds-btn-lg', type: 'button', 'data-act': 'new', onclick: function () { S.newProject(); } }, [icon('plus', 18), 'New deck']);
      var openBtn = h('button', { class: 'pds-btn pds-btn-lg', type: 'button', 'data-act': 'open', onclick: function () {
        S.pickFiles({ accept: '.html,.htm,text/html' }).then(function (list) { if (list[0]) S.openFile(list[0]); });
      } }, [icon('folder', 18), 'Open a saved deck…', h('span', { class: 'pds-btn-note' }, ['.html'])]);

      var cont = h('section', { class: 'pds-welcome-sec', 'aria-labelledby': 'pds-w-cont' }, [h('h2', { class: 'pds-eyebrow', id: 'pds-w-cont' }, ['Continue'])]);
      var showAll = false;
      function paintContinue() {
        entries = persist.index();
        while (cont.children.length > 1) cont.removeChild(cont.lastChild);
        if (!entries.length) {
          cont.appendChild(h('p', { class: 'pds-empty', 'data-empty': 'continue' }, ['Nothing saved in this browser yet. Start a new deck, or open a deck you saved.']));
          return;
        }
        var list = h('div', { class: 'pds-welcome-list' });
        entries.slice(0, showAll ? entries.length : 4).forEach(function (e) {
          var main = card('is-recent', { 'data-act': 'continue', 'data-id': e.id, onclick: function () { S.continueProject(e.id); } }, [
            h('b', null, [e.title || 'Untitled talk']),
            h('span', null, ['autosaved ' + ui.ago(e.updated) + ' · ' + (e.scenes || 0) + (e.scenes === 1 ? ' scene' : ' scenes')])
          ]);
          var del = h('button', { class: 'pds-icon-btn pds-forget', type: 'button', 'aria-label': 'Remove ' + (e.title || 'this deck') + ' from this browser', title: 'Remove from this browser', 'data-act': 'forget', 'data-id': e.id,
            onclick: function (ev) { ev.stopPropagation(); S.forgetProject(e.id).then(function (gone) { if (gone) paintContinue(); }); } }, [icon('trash', 16)]);
          list.appendChild(h('div', { class: 'pds-welcome-row' }, [main, del]));
        });
        cont.appendChild(list);
        if (entries.length > 4) cont.appendChild(h('button', { class: 'pds-btn pds-btn-sm pds-btn-ghost pds-more', type: 'button', 'data-act': 'more', onclick: function () { showAll = !showAll; paintContinue(); } }, [showAll ? 'Show fewer' : 'Show all ' + entries.length]));
      }
      paintContinue();

      var samples = h('section', { class: 'pds-welcome-sec', 'aria-labelledby': 'pds-w-samp' }, [
        h('h2', { class: 'pds-eyebrow', id: 'pds-w-samp' }, ['Samples']),
        h('div', { class: 'pds-welcome-list' }, [
          card('is-sample', { 'data-act': 'sample-ogl', onclick: function () { S.openSample('ogl'); } }, [
            h('b', null, ['One Giant Leap ', h('em', null, ['(read-only)'])]),
            h('span', null, ['The talk this engine was built for. Look around, rehearse it.'])
          ]),
          card('is-sample', { 'data-act': 'sample-replica', onclick: function () { S.openSample('replica'); } }, [
            h('b', null, ['One Giant Leap: template replica ', h('em', null, ['(editable copy)'])]),
            h('span', null, ['The same story, built from templates, ready for your words.'])
          ])
        ])
      ]);

      var page = h('div', { class: 'pds-welcome' }, [
        h('div', { class: 'pds-welcome-copy' }, [
          h('p', { class: 'pds-eyebrow' }, ['A guided story builder']),
          h('h1', { class: 'pds-display' }, ['Start with the story.', h('br'), h('span', null, ['The slides follow.'])]),
          h('p', { class: 'pds-lede' }, [PD.story.say('welcome')]),
          h('div', { class: 'pds-welcome-actions' }, [newBtn, openBtn]),
          h('div', { class: 'pds-welcome-cols' }, [cont, samples])
        ]),
        h('p', { class: 'pds-footnote' }, [icon('info', 14), PD.story.say('save.local')])
      ]);
      el.appendChild(canvas);
      el.appendChild(h('div', { class: 'pds-welcome-shade', 'aria-hidden': 'true' }));
      el.appendChild(page);

      // the backdrop is decoration: if the engine cannot draw it, the page is complete without
      requestAnimationFrame(function () {
        try { view = S.stageView(canvas, PD.compile(heroDeck()), { quality: 1, maxDpr: 1.5 }); view.replay(); }
        catch (e) { try { console.warn('studio: the Welcome backdrop did not start', e); } catch (e2) { } }
      });
      newBtn.focus({ preventScroll: true });
      return { unmount: function () { if (view) view.destroy(); view = null; } };
    }
  });
  return {};
}, { export: false });
