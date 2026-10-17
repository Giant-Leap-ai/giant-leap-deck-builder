/* engine/core/hud.js — CSS, HUD DOM and on-screen errors for the Player (spec §3.4, §4.10).
 *
 *   hud.install({ canvas, container?, hud? = true }) → Hud
 *     Page mode (no container): injects the exact rules of the pre-v2 cinema/index.html once per document (one
 *     <style data-pd-hud="page">), puts the canvas first in <body> (the stage canvas is the page's first <canvas>,
 *     spec §4.13) and, unless hud === false, the three HUD boxes #fps, #goto, #toast right after it, as the old page had.
 *     Container mode (the Studio's Rehearse): the same rules scoped to .pd-player (absolute instead of fixed, no
 *     html/body rules), the container gets class pd-player, the canvas and HUD go inside it, and no ids are used.
 *     Only a canvas that is not in the document yet (the Player's own) is moved; a caller's canvas stays where it is,
 *     and the HUD boxes follow it when it is a child of the host, else they are appended to the host.
 *   Hud = { canvas, fps(text), showFps(on), fpsOn(), goto(text | null), toast(text), error(lines), remove() }
 *     toast('BLACKOUT') stays until toast(''); any other text fades after 1.2 s (as before).
 *     error(lines) shows the on-screen error box (deck problems that do not stop the show: template expansion
 *     failures, assets that did not load); a click hides it, and it hides itself after 12 s. Fatal errors use PD.fail.
 *   With hud === false the methods are no-ops (the CSS and the canvas placement still apply).
 * Registering this module touches nothing; install() is the first DOM work. */
PD.module('core/hud', [], function (PD) {
  // the exact rules of the pre-v2 cinema/index.html <style>
  var PAGE_CSS =
    '  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }\n' +
    '  canvas { display: block; cursor: none; }\n' +
    '  .hud { position: fixed; font: 600 13px/1.2 ui-monospace, Menlo, Consolas, monospace; color: #aab7cf;\n' +
    '         background: rgba(5, 8, 20, .8); padding: 6px 10px; border: 1px solid #26304a; border-radius: 4px; pointer-events: none; }\n' +
    '  #fps { top: 8px; left: 8px; display: none; color: #b6ff6b; }\n' +
    '  #goto { bottom: 14px; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity .15s; color: #ffd27a; font-size: 16px; }\n' +
    '  #toast { top: 8px; right: 8px; opacity: 0; transition: opacity .2s; }\n';
  // the same look, scoped to a container (no page rules, no ids)
  var SCOPED_CSS =
    '.pd-player { position: relative; overflow: hidden; background: #000; }\n' +
    '.pd-player > canvas { display: block; cursor: none; }\n' +
    '.pd-player > .hud { position: absolute; font: 600 13px/1.2 ui-monospace, Menlo, Consolas, monospace; color: #aab7cf;\n' +
    '       background: rgba(5, 8, 20, .8); padding: 6px 10px; border: 1px solid #26304a; border-radius: 4px; pointer-events: none; }\n' +
    '.pd-player > .pd-fps { top: 8px; left: 8px; display: none; color: #b6ff6b; }\n' +
    '.pd-player > .pd-goto { bottom: 14px; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity .15s; color: #ffd27a; font-size: 16px; }\n' +
    '.pd-player > .pd-toast { top: 8px; right: 8px; opacity: 0; transition: opacity .2s; }\n';
  // the on-screen error box (both modes)
  var ERR_CSS =
    '.pd-err { position: fixed; left: 12px; bottom: 12px; max-width: min(720px, 70vw); max-height: 40vh; overflow: auto; z-index: 2147483000;\n' +
    '          font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace; color: #fff; background: rgba(120, 12, 20, .92);\n' +
    '          border: 1px solid #ff6b6b; border-radius: 6px; padding: 10px 14px; white-space: pre-wrap; cursor: pointer; }\n' +
    '.pd-player > .pd-err { position: absolute; }\n';

  function style(doc, kind, css) {
    var sel = 'style[data-pd-hud="' + kind + '"]';
    if (doc.querySelector(sel)) return;
    var el = doc.createElement('style');
    el.setAttribute('data-pd-hud', kind);
    el.textContent = css;
    (doc.head || doc.documentElement).appendChild(el);
  }

  function install(opts) {
    opts = opts || {};
    var doc = document, container = opts.container || null, canvas = opts.canvas, show = opts.hud !== false;
    var host = container || doc.body, made = [], timers = {};
    style(doc, container ? 'scoped' : 'page', container ? SCOPED_CSS : PAGE_CSS);
    style(doc, 'err', ERR_CSS);
    if (container) container.classList.add('pd-player');
    // a canvas that is not in the document yet (the Player's own) goes first in the host; a caller's canvas stays put
    if (canvas && !doc.documentElement.contains(canvas)) { host.insertBefore(canvas, host.firstChild); made.push(canvas); }

    function box(name) {
      if (!show) return null;
      var el = doc.createElement('div');
      el.className = 'hud' + (container ? ' pd-' + name : '');
      if (!container) el.id = name;
      var after = made.length ? made[made.length - 1] : canvas;
      if (after && after.parentNode === host) host.insertBefore(el, after.nextSibling); else host.appendChild(el);
      made.push(el);
      return el;
    }
    var fpsEl = box('fps'), gotoEl = box('goto'), toastEl = box('toast'), errEl = null, fpsShown = false;

    var hud = {
      canvas: canvas,
      fps: function (text) { if (fpsEl) fpsEl.textContent = text; },
      showFps: function (on) { fpsShown = !!on; if (fpsEl) fpsEl.style.display = fpsShown ? 'block' : 'none'; },
      fpsOn: function () { return fpsShown; },
      goto: function (text) {
        if (!gotoEl) return;
        if (text == null) { gotoEl.style.opacity = 0; return; }
        gotoEl.textContent = text; gotoEl.style.opacity = 1;
      },
      toast: function (m) {
        if (!toastEl) return;
        toastEl.textContent = m; toastEl.style.opacity = m ? 1 : 0;
        clearTimeout(timers.toast); if (m && m !== 'BLACKOUT') timers.toast = setTimeout(function () { toastEl.style.opacity = 0; }, 1200);
      },
      error: function (lines) {
        if (!show) return;
        lines = [].concat(lines || []).map(String).filter(Boolean);
        if (!lines.length) return;
        if (!errEl) {
          errEl = doc.createElement('div');
          errEl.className = 'pd-err';
          errEl.setAttribute('data-pd-error', '');
          errEl.title = 'Click to hide';
          errEl.addEventListener('click', function () { errEl.style.display = 'none'; });
          host.appendChild(errEl);
          made.push(errEl);
        }
        errEl.textContent = 'pixeldeck: ' + lines.join('\n');
        errEl.style.display = 'block';
        clearTimeout(timers.err); timers.err = setTimeout(function () { if (errEl) errEl.style.display = 'none'; }, 12000);
      },
      remove: function () {
        for (var k in timers) clearTimeout(timers[k]);
        made.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
        made = []; fpsEl = gotoEl = toastEl = errEl = null;
        if (container) container.classList.remove('pd-player');
      }
    };
    return hud;
  }

  return { install: install, PAGE_CSS: PAGE_CSS, SCOPED_CSS: SCOPED_CSS };
});
