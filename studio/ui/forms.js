/* studio/ui/forms.js — the shared base of the storyboard workspace (spec §7.3, WP7): DOM helpers, icons, the design tokens
 * and shared widget CSS, menus / modals / snackbars, scene analysis, and the form fields that the Inspector generates from a
 * template's props schema (text with live counts and measured overflow, numbers with sliders, switches, colours, enums,
 * assets, nebulae, shots, and list editors).
 *
 *   PD.get('studio/ui/forms') = {
 *     h(tag, attrs, kids) → Element       tiny DOM builder: class, style (string | object), text, on<event>, dataset, aria-*
 *     svg(tag, attrs, kids)               the same for SVG
 *     icon(name, size?) → SVGElement      stroke icons (plus, play, replay, expand, lock, trash, copy, swap, ...)
 *     css(id, text)                       inject a <style data-pd-studio=id> once (re-registering replaces it)
 *     debounce(fn, ms) → fn with .flush() .cancel() .pending()
 *     fmtClock(sec) → 'm:ss'    fmtSecs(sec) → '42 s' | '1 min 5 s'    plural(n, one, many)
 *     BEAT_COLORS, beatColor(i)           the beat palette (index in the framework)
 *     describeScenes(compiled, lint, opts) → SceneInfo[]
 *     menu(items, { x, y }) → { close }   popover menu; modal({ title, body, wide }) → { el, close }; snack(msg, { action })
 *     hlArea(opts) → { el, input, set, get, focus }   textarea whose [placeholders] and ▸ prompts are painted (a mirror)
 *     seg(options, value, onChange)  switchEl(value, onChange, label)  field(spec, value, api, name)  buildForm(opts)
 *     changeTemplateProps(oldScene, newTemplateId, story) → props     props that share a name carry over, the rest are the seed
 *     newSceneFor(templateId, beat, story, ids) → TemplateScene         a scene from a template's seed with {tokens} filled
 *     uniqueId(base, taken) → string
 *   }
 * Every module of the workspace looks its siblings up with PD.get at mount time, so the load order of the files does not
 * matter. Registration injects no style and touches no DOM. */
PD.module('studio/ui/forms', [], function (PD) {
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function story() { return PD.story || {}; }

  /* ================================================================ DOM */
  function add(el, kids) {
    if (kids == null || kids === false) return;
    if (Array.isArray(kids)) { for (var i = 0; i < kids.length; i++) add(el, kids[i]); return; }
    el.appendChild(typeof kids === 'object' && kids.nodeType ? kids : document.createTextNode(String(kids)));
  }
  function setAttrs(el, attrs) {
    for (var k in attrs) {
      if (!has(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (var s in v) { if (s.slice(0, 2) === '--') el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') { for (var d in v) el.dataset[d] = v[d]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) setAttrs(el, attrs);
    add(el, kids);
    return el;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, kids) {
    var el = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) {
      if (!has(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
      if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'text') el.textContent = attrs[k];
      else if (k === 'style' && typeof attrs[k] !== 'string') { for (var s in attrs[k]) { if (s.slice(0, 2) === '--') el.style.setProperty(s, attrs[k][s]); else el.style[s] = attrs[k][s]; } }
      else el.setAttribute(k, attrs[k]);
    }
    add(el, kids);
    return el;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  var ICONS = {
    plus: 'M12 5v14M5 12h14', x: 'M6.5 6.5l11 11M17.5 6.5l-11 11', check: 'M5 12.5l4.5 4.5L19 7.5',
    play: { d: 'M8 5.5v13l10.5-6.5z', fill: true }, replay: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v4.8h4.8',
    expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', safe: 'M3.5 6.5h17v11h-17zM7.5 10h9v4h-9z',
    lock: 'M7.5 11V8a4.5 4.5 0 0 1 9 0v3M5.5 11h13v9h-13z', trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7M10.5 11v5M13.5 11v5',
    copy: 'M9 9h10.5v11H9zM5 15.5V4h10.5', swap: 'M4 8h13.5l-3-3M20 16H6.5l3 3', flag: 'M6 21V4M6 5h11.5l-2.5 4 2.5 4H6',
    chevR: 'M9.5 5l7 7-7 7', chevD: 'M5 9.5l7 7 7-7', chevL: 'M14.5 5l-7 7 7 7', chevU: 'M5 14.5l7-7 7 7',
    alert: 'M12 4l9.5 16.5h-19zM12 10v4.5M12 17.5v.01', info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.5v.01',
    image: 'M3.5 5h17v14h-17zM3.5 16l5.2-5.2 4.3 4.3 3-3 4.5 4.4M9 9.4v.01', type: 'M4.5 19L10 5l5.5 14M6.4 14.5h7.2M17 12.5h3.5M18.7 12.5V19',
    upload: 'M12 16V4.5M7 9l5-4.5L17 9M4.5 20h15', sparkle: 'M12 3l1.9 5.3L19.5 10l-5.6 1.7L12 17l-1.9-5.3L4.5 10l5.6-1.7zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z',
    grip: 'M9 6v.01M9 12v.01M9 18v.01M15 6v.01M15 12v.01M15 18v.01', up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6',
    panel: 'M4 5h16v14H4zM9.5 5v14', clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2', more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
    film: 'M4 4.5h16v15H4zM8 4.5v15M16 4.5v15M4 9h4M4 15h4M16 9h4M16 15h4', pen: 'M4.5 19.5l1-4.2L16 4.8l3.2 3.2L8.7 18.5z',
    next: 'M5.5 6l7 6-7 6zM17 6v12', font: 'M5 19L10 5.5 15 19M6.8 14.5h6.4M17 9.5h2.5M18.2 9.5V19', mic: 'M12 3.5a3 3 0 0 1 3 3V12a3 3 0 0 1-6 0V6.5a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5',
    target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    shuffle: 'M3.5 7h3.5c4 0 5 10 9 10h4.5M3.5 17H7c1.6 0 2.7-1.7 3.6-3.5M20.5 7H16c-1.6 0-2.7 1.7-3.6 3.5M18 4.5l2.5 2.5-2.5 2.5M18 14.5l2.5 2.5-2.5 2.5'
  };
  function icon(name, size) {
    var def = ICONS[name] || ICONS.info, fill = isObj(def) && def.fill, d = isObj(def) ? def.d : def;
    var s = size || 18;
    var el = svg('svg', { viewBox: '0 0 24 24', width: s, height: s, 'aria-hidden': 'true', 'class': 'pdx-ico', fill: fill ? 'currentColor' : 'none',
      stroke: 'currentColor', 'stroke-width': name === 'grip' ? 2.6 : 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    el.appendChild(svg('path', { d: d }));
    return el;
  }

  function css(id, text) {
    var sel = 'style[data-pd-studio="' + id + '"]', old = document.querySelector(sel);
    if (old) { if (old.textContent === text) return old; old.parentNode.removeChild(old); }
    var el = document.createElement('style');
    el.setAttribute('data-pd-studio', id);
    el.textContent = text;
    (document.head || document.documentElement).appendChild(el);
    return el;
  }
  function debounce(fn, ms) {
    var t = 0, args = null, self = null;
    function run() { t = 0; var a = args; args = null; if (a) fn.apply(self, a); }
    function d() { args = arguments; self = this; clearTimeout(t); t = setTimeout(run, ms); }
    d.flush = function () { if (t) { clearTimeout(t); run(); } };
    d.cancel = function () { clearTimeout(t); t = 0; args = null; };
    d.pending = function () { return !!t; };
    return d;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtSecs(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return sec + ' s';
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ' min' + (s ? ' ' + s + ' s' : '');
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function cap(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function humanize(id) { return cap(String(id || '').replace(/[-_]+/g, ' ')); }

  /* ================================================================ design tokens and shared widget CSS */
  var BASE_CSS = [
    '.pdx { --pdx-bg: var(--bg, #1a1c2c); --pdx-panel: var(--panel, #232539); --pdx-line: var(--line, #333c57); --pdx-text: var(--text, #f4f4f4);',
    '  --pdx-muted: var(--muted, #94b0c2); --pdx-accent: var(--accent, #ef7d57); --pdx-faint: #8396b3;',
    '  --pdx-well: color-mix(in srgb, var(--pdx-panel) 74%, #0b0d18); --pdx-raise: color-mix(in srgb, var(--pdx-panel) 90%, #fff);',
    '  --pdx-hair: rgba(148, 176, 194, .16); --pdx-hair-2: rgba(148, 176, 194, .09);',
    '  --pdx-ok: var(--ok, #a7f070); --pdx-warn: var(--warn, #ffcd75); --pdx-err: var(--err, #ff7b8a); --pdx-info: var(--info, #73eff7);',
    '  --pdx-radius: 12px; --pdx-ease: cubic-bezier(.2, .8, .2, 1); --pdx-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px rgba(5, 7, 18, .35);',
    '  --pdx-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace); --pdx-font: var(--font-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif);',
    '  font: 13px/1.5 var(--pdx-font); color: var(--pdx-text); -webkit-font-smoothing: antialiased; }',
    '.pdx *, .pdx *::before, .pdx *::after { box-sizing: border-box; }',
    '.pdx button { font: inherit; color: inherit; }',
    '.pdx .pdx-ico { flex: none; display: block; }',
    '.pdx-cap { font: 650 10.5px/1.2 var(--pdx-font); text-transform: uppercase; letter-spacing: .1em; color: var(--pdx-muted); }',
    '.pdx-mono { font-family: var(--pdx-mono); font-variant-numeric: tabular-nums; }',
    /* buttons: a hit area of 44 px comes from the ::after, the look stays compact */
    '.pdx-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 9px;',
    '  border: 1px solid var(--pdx-line); background: transparent; color: var(--pdx-text); font-weight: 560; cursor: pointer; white-space: nowrap;',
    '  transition: background .16s var(--pdx-ease), border-color .16s var(--pdx-ease), color .16s, transform .12s var(--pdx-ease), box-shadow .2s; }',
    '.pdx-btn::after { content: ""; position: absolute; inset: -5px -2px; }',
    '.pdx-btn:hover { background: var(--pdx-raise); border-color: color-mix(in srgb, var(--pdx-line) 60%, var(--pdx-muted)); }',
    '.pdx-btn:active { transform: translateY(1px); }',
    '.pdx-btn:focus-visible, .pdx-card-btn:focus-visible, .pdx-chip-btn:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    '.pdx-btn[disabled] { opacity: .38; cursor: default; pointer-events: none; }',
    '.pdx-btn.is-primary { background: var(--pdx-accent); border-color: transparent; color: #1a1210; box-shadow: 0 6px 18px color-mix(in srgb, var(--pdx-accent) 30%, transparent); }',
    '.pdx-btn.is-primary:hover { background: color-mix(in srgb, var(--pdx-accent) 88%, #fff); }',
    '.pdx-btn.is-quiet { border-color: transparent; color: var(--pdx-muted); }',
    '.pdx-btn.is-quiet:hover { color: var(--pdx-text); background: var(--pdx-raise); }',
    '.pdx-btn.is-danger:hover { color: var(--pdx-err); border-color: color-mix(in srgb, var(--pdx-err) 50%, var(--pdx-line)); }',
    '.pdx-btn.is-icon { width: 34px; padding: 0; }',
    '.pdx-btn.is-sm::after { inset: -8px -4px; }',
    '.pdx-btn.is-sm { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 8px; gap: 6px; }',
    '.pdx-btn.is-sm.is-icon { width: 28px; padding: 0; }',
    '.pdx-btn.is-on { border-color: var(--pdx-accent); color: var(--pdx-accent); background: color-mix(in srgb, var(--pdx-accent) 10%, transparent); }',
    '.pdx-btn.is-lg { height: 46px; padding: 0 22px; font-size: 14px; border-radius: 12px; }',
    /* chips and pills */
    '.pdx-chip { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 99px; font-size: 11px; font-weight: 650; letter-spacing: .02em;',
    '  background: color-mix(in srgb, var(--chip, var(--pdx-muted)) 16%, transparent); color: var(--chip, var(--pdx-muted)); white-space: nowrap; }',
    '.pdx-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }',
    '.pdx-chip.is-plain::before { display: none; }',
    '.pdx-pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 99px; font-size: 11.5px; font-weight: 600; border: 1px solid var(--pdx-hair); color: var(--pdx-muted); }',
    '.pdx-pill.is-ok { color: var(--pdx-ok); border-color: color-mix(in srgb, var(--pdx-ok) 35%, transparent); background: color-mix(in srgb, var(--pdx-ok) 9%, transparent); }',
    '.pdx-pill.is-warn { color: var(--pdx-warn); border-color: color-mix(in srgb, var(--pdx-warn) 35%, transparent); background: color-mix(in srgb, var(--pdx-warn) 9%, transparent); }',
    '.pdx-pill.is-err { color: var(--pdx-err); border-color: color-mix(in srgb, var(--pdx-err) 38%, transparent); background: color-mix(in srgb, var(--pdx-err) 9%, transparent); }',
    '.pdx-kbd { display: inline-block; min-width: 20px; padding: 1px 6px; border-radius: 5px; border: 1px solid var(--pdx-line); border-bottom-width: 2px; font: 600 11px/1.5 var(--pdx-mono); color: var(--pdx-muted); text-align: center; }',
    /* segmented control */
    '.pdx-seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--pdx-well); border: 1px solid var(--pdx-hair-2); }',
    '.pdx-seg > button { all: unset; box-sizing: border-box; position: relative; min-width: 34px; height: 30px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center;',
    '  border-radius: 7px; color: var(--pdx-muted); font-weight: 600; font-size: 12.5px; cursor: pointer; transition: background .16s var(--pdx-ease), color .16s; }',
    '.pdx-seg > button::after { content: ""; position: absolute; inset: -7px -1px; }',
    '.pdx-seg > button:hover { color: var(--pdx-text); }',
    '.pdx-seg > button[aria-pressed="true"] { background: var(--pdx-raise); color: var(--pdx-text); box-shadow: 0 1px 0 rgba(255,255,255,.07) inset, 0 2px 8px rgba(0,0,0,.25); }',
    '.pdx-seg > button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 1px; }',
    /* switch */
    '.pdx-switch { all: unset; box-sizing: border-box; position: relative; flex: none; width: 38px; height: 22px; border-radius: 99px; background: var(--pdx-well); border: 1px solid var(--pdx-line); cursor: pointer; transition: background .2s var(--pdx-ease), border-color .2s; }',
    '.pdx-switch::before { content: ""; position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--pdx-muted); transition: transform .22s var(--pdx-ease), background .2s; }',
    '.pdx-switch::after { content: ""; position: absolute; inset: -11px -4px; }',
    '.pdx-switch[aria-checked="true"] { background: color-mix(in srgb, var(--pdx-accent) 28%, var(--pdx-well)); border-color: color-mix(in srgb, var(--pdx-accent) 60%, var(--pdx-line)); }',
    '.pdx-switch[aria-checked="true"]::before { transform: translateX(16px); background: var(--pdx-accent); }',
    '.pdx-switch:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    /* fields */
    '.pdx-field { display: flex; flex-direction: column; gap: 6px; padding: 0 0 2px; }',
    '.pdx-fh { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-height: 18px; }',
    '.pdx-fl { font-weight: 620; font-size: 12.5px; color: var(--pdx-text); }',
    '.pdx-fr { font: 500 11px/1.2 var(--pdx-mono); color: var(--pdx-faint); white-space: nowrap; }',
    '.pdx-fr .is-warn { color: var(--pdx-warn); } .pdx-fr .is-err { color: var(--pdx-err); }',
    '.pdx-ff { display: flex; flex-direction: column; gap: 4px; }',
    '.pdx-ff:empty { display: none; }',
    '.pdx-help { font-size: 11.5px; line-height: 1.45; color: var(--pdx-faint); }',
    '.pdx-note { font-size: 11.5px; line-height: 1.45; color: var(--pdx-warn); display: flex; gap: 6px; align-items: flex-start; }',
    '.pdx-note.is-err { color: var(--pdx-err); } .pdx-note.is-info { color: var(--pdx-info); }',
    '.pdx-help.is-voice { max-height: 0; opacity: 0; overflow: hidden; margin-top: -4px; transition: max-height .26s var(--pdx-ease), opacity .2s, margin .26s var(--pdx-ease); }',
    '.pdx-field:focus-within .pdx-help.is-voice, .pdx-field.has-ph .pdx-help.is-voice { max-height: 48px; opacity: 1; margin-top: 0; }',
    '.pdx-note .pdx-link { all: unset; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; color: inherit; font-weight: 650; }',
    /* the painted textarea: a mirror under a transparent textarea */
    '.pdx-hl { position: relative; display: grid; border-radius: 10px; background: var(--pdx-well); border: 1px solid var(--pdx-hair); transition: border-color .16s, box-shadow .2s var(--pdx-ease); }',
    '.pdx-hl:hover { border-color: var(--pdx-line); }',
    '.pdx-hl:focus-within { border-color: var(--pdx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pdx-accent) 20%, transparent); }',
    '.pdx-hl.is-err { border-color: color-mix(in srgb, var(--pdx-err) 70%, var(--pdx-line)); }',
    '.pdx-hl.is-warn { border-color: color-mix(in srgb, var(--pdx-warn) 55%, var(--pdx-line)); }',
    '.pdx-hl > * { grid-area: 1 / 1; font: 500 14px/1.5 var(--pdx-font); padding: 9px 12px; margin: 0; border: 0;',
    '  white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; letter-spacing: 0; min-width: 0; }',
    '.pdx-hl-mirror { color: var(--pdx-text); pointer-events: none; }',
    '.pdx-hl-mirror:empty::after { content: "\\200b"; }',
    '.pdx-hl-input { background: transparent; resize: none; overflow: hidden; outline: none; color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--pdx-text); height: 100%; width: 100%; }',
    '.pdx-hl-input::placeholder { color: var(--pdx-faint); -webkit-text-fill-color: var(--pdx-faint); }',
    '.pdx-hl-input::selection { background: color-mix(in srgb, var(--pdx-accent) 38%, transparent); -webkit-text-fill-color: transparent; }',
    '.pdx-ph { background: color-mix(in srgb, var(--pdx-warn) 22%, transparent); color: var(--pdx-warn); border-radius: 4px; box-shadow: 0 0 0 1px color-mix(in srgb, var(--pdx-warn) 40%, transparent); }',
    '.pdx-pr { color: var(--pdx-faint); font-style: italic; }',
    /* inputs */
    '.pdx-input, .pdx-select { all: unset; box-sizing: border-box; width: 100%; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--pdx-well); border: 1px solid var(--pdx-hair); color: var(--pdx-text); font-size: 13px; transition: border-color .16s, box-shadow .2s; }',
    '.pdx-input:hover, .pdx-select:hover { border-color: var(--pdx-line); }',
    '.pdx-input:focus, .pdx-select:focus { border-color: var(--pdx-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pdx-accent) 20%, transparent); }',
    '.pdx-input.is-mono { font-family: var(--pdx-mono); font-size: 12.5px; }',
    '.pdx-select { appearance: none; -webkit-appearance: none; padding-right: 30px; cursor: pointer; background-image: linear-gradient(45deg, transparent 50%, var(--pdx-muted) 50%), linear-gradient(135deg, var(--pdx-muted) 50%, transparent 50%);',
    '  background-position: calc(100% - 17px) 15px, calc(100% - 12px) 15px; background-size: 5px 5px; background-repeat: no-repeat; }',
    '.pdx-select option { background: #1e2033; color: var(--pdx-text); }',
    '.pdx-num { width: 64px; text-align: right; height: 28px; padding: 0 8px; border-radius: 8px; font: 600 12px var(--pdx-mono); }',
    /* range */
    '.pdx-range { -webkit-appearance: none; appearance: none; width: 100%; height: 28px; background: transparent; cursor: pointer; margin: 0; }',
    '.pdx-range::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--pdx-accent) var(--pct, 0%), var(--pdx-line) var(--pct, 0%)); }',
    '.pdx-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #fff; border: 0; box-shadow: 0 1px 6px rgba(0,0,0,.5); transition: transform .14s var(--pdx-ease); }',
    '.pdx-range:hover::-webkit-slider-thumb { transform: scale(1.15); } .pdx-range:focus-visible { outline: none; } .pdx-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px color-mix(in srgb, var(--pdx-accent) 40%, transparent); }',
    /* swatches */
    '.pdx-sw { display: flex; flex-wrap: wrap; gap: 7px; }',
    '.pdx-sw > button { all: unset; box-sizing: border-box; position: relative; width: 26px; height: 26px; border-radius: 50%; background: var(--c); cursor: pointer; box-shadow: 0 0 0 1px rgba(255,255,255,.18) inset; transition: transform .14s var(--pdx-ease); }',
    '.pdx-sw > button::after { content: ""; position: absolute; inset: -9px; }',
    '.pdx-sw > button:hover { transform: scale(1.12); }',
    '.pdx-sw > button[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--pdx-bg), 0 0 0 4px var(--pdx-text); }',
    '.pdx-sw > button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 3px; }',
    '.pdx-neb { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.pdx-neb > button { all: unset; box-sizing: border-box; position: relative; display: flex; flex-direction: column; gap: 5px; width: 76px; padding: 5px; border-radius: 10px; border: 1px solid var(--pdx-hair); cursor: pointer; font-size: 11px; color: var(--pdx-muted); transition: border-color .16s, transform .14s var(--pdx-ease); }',
    '.pdx-neb > button i { display: block; height: 22px; border-radius: 6px; background: var(--g); }',
    '.pdx-neb > button:hover { transform: translateY(-1px); border-color: var(--pdx-line); }',
    '.pdx-neb > button[aria-pressed="true"] { border-color: var(--pdx-accent); color: var(--pdx-text); background: color-mix(in srgb, var(--pdx-accent) 8%, transparent); }',
    '.pdx-neb > button:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    /* asset tiles */
    '.pdx-tiles { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.pdx-tile { all: unset; box-sizing: border-box; position: relative; width: 84px; display: flex; flex-direction: column; gap: 5px; padding: 5px; border-radius: 10px; border: 1px solid var(--pdx-hair); cursor: pointer; font-size: 11px; color: var(--pdx-muted); transition: border-color .16s, transform .14s var(--pdx-ease); }',
    '.pdx-tile .th { height: 48px; border-radius: 6px; background: var(--pdx-well) center / contain no-repeat; display: grid; place-items: center; color: var(--pdx-faint); }',
    '.pdx-tile .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.pdx-tile:hover { transform: translateY(-1px); border-color: var(--pdx-line); }',
    '.pdx-tile[aria-pressed="true"] { border-color: var(--pdx-accent); color: var(--pdx-text); background: color-mix(in srgb, var(--pdx-accent) 8%, transparent); }',
    '.pdx-tile:focus-visible { outline: 2px solid var(--pdx-accent); outline-offset: 2px; }',
    '.pdx-tile.is-add .th { border: 1px dashed var(--pdx-line); background: transparent; }',
    /* lists */
    '.pdx-list { display: flex; flex-direction: column; gap: 8px; }',
    '.pdx-item { display: flex; gap: 8px; padding: 10px; border-radius: 11px; background: color-mix(in srgb, var(--pdx-panel) 55%, transparent); border: 1px solid var(--pdx-hair-2); transition: border-color .16s, transform .24s var(--pdx-ease), opacity .2s; }',
    '.pdx-item:hover { border-color: var(--pdx-hair); }',
    '.pdx-item.is-new { animation: pdx-in .32s var(--pdx-ease); }',
    '.pdx-item .no { flex: none; width: 22px; height: 22px; margin-top: 2px; border-radius: 50%; display: grid; place-items: center; font: 650 11px var(--pdx-mono); background: var(--pdx-well); color: var(--pdx-muted); }',
    '.pdx-item .bd { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }',
    '.pdx-item .ops { flex: none; display: flex; flex-direction: column; gap: 2px; }',
    '.pdx-more { margin-top: 2px; } .pdx-more > summary { cursor: pointer; list-style: none; color: var(--pdx-muted); font-size: 11.5px; font-weight: 600; display: inline-flex; gap: 4px; align-items: center; padding: 2px 0; }',
    '.pdx-more > summary::-webkit-details-marker { display: none; } .pdx-more > summary:hover { color: var(--pdx-text); }',
    '.pdx-more > summary .pdx-ico { transition: transform .2s var(--pdx-ease); } .pdx-more[open] > summary .pdx-ico { transform: rotate(90deg); }',
    '.pdx-more > div { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }',
    '@keyframes pdx-in { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }',
    /* menus, modals, snackbar */
    '.pdx-menu { position: fixed; z-index: 9400; min-width: 210px; max-width: 280px; padding: 6px; border-radius: 12px; background: #2a2d46; border: 1px solid var(--pdx-line); box-shadow: 0 18px 50px rgba(3, 5, 14, .6); animation: pdx-in .14s var(--pdx-ease); }',
    '.pdx-menu button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; border-radius: 8px; cursor: pointer; color: var(--pdx-text); font-size: 13px; }',
    '.pdx-menu button:hover, .pdx-menu button:focus-visible { background: color-mix(in srgb, var(--pdx-accent) 16%, transparent); }',
    '.pdx-menu button[disabled] { opacity: .4; pointer-events: none; }',
    '.pdx-menu button.is-danger { color: var(--pdx-err); } .pdx-menu button .sp { flex: 1; } .pdx-menu button .pdx-ico { color: var(--pdx-muted); }',
    '.pdx-menu button .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c, var(--pdx-muted)); flex: none; margin: 0 5px; }',
    '.pdx-menu hr { border: 0; height: 1px; background: var(--pdx-hair); margin: 5px 4px; }',
    '.pdx-menu .hd { padding: 6px 10px 4px; }',
    '.pdx-scrim { position: fixed; inset: 0; z-index: 9300; background: rgba(8, 10, 22, .62); backdrop-filter: blur(6px); display: grid; place-items: center; padding: 28px; animation: pdx-fade .18s ease; }',
    '.pdx-dialog { display: flex; flex-direction: column; max-width: min(1040px, 100%); max-height: 100%; min-height: 0; border-radius: 18px; background: #202238; border: 1px solid var(--pdx-line); box-shadow: 0 30px 90px rgba(2, 4, 12, .7); animation: pdx-pop .26s var(--pdx-ease); }',
    '.pdx-dialog > header { flex: none; display: flex; align-items: flex-start; gap: 16px; padding: 22px 26px 14px; }',
    '.pdx-dialog > header h2 { margin: 0; font-size: 19px; line-height: 1.25; font-weight: 680; letter-spacing: -.01em; }',
    '.pdx-dialog > header p { margin: 4px 0 0; color: var(--pdx-muted); font-size: 13px; }',
    '.pdx-dialog > .bd { flex: 1; min-height: 0; overflow: auto; padding: 4px 26px 24px; }',
    '@keyframes pdx-fade { from { opacity: 0; } to { opacity: 1; } } @keyframes pdx-pop { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }',
    '.pdx-snack { position: fixed; left: 50%; bottom: 26px; z-index: 9500; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; padding: 8px 8px 8px 18px; border-radius: 14px;',
    '  background: #2c2f4b; border: 1px solid var(--pdx-line); box-shadow: 0 18px 50px rgba(3, 5, 14, .6); animation: pdx-up .26s var(--pdx-ease); font-size: 13px; }',
    '@keyframes pdx-up { from { opacity: 0; transform: translate(-50%, 14px); } to { opacity: 1; transform: translate(-50%, 0); } }',
    '@media (prefers-reduced-motion: reduce) { .pdx *, .pdx-scrim, .pdx-dialog, .pdx-snack, .pdx-menu { animation-duration: .001s !important; transition-duration: .001s !important; } }'
  ].join('\n');
  function ensureBase() { css('base', BASE_CSS); }

  /* ================================================================ beats and scenes */
  var BEAT_COLORS = ['#ef7d57', '#ffcd75', '#a7f070', '#4fd19a', '#73eff7', '#41a6f6', '#9a96f5', '#d983e8', '#ff7a99', '#94b0c2'];
  var NEUTRAL = '#7389a6';
  function beatColor(i) { return i == null || i < 0 ? NEUTRAL : BEAT_COLORS[i % BEAT_COLORS.length]; }

  function storyOf(compiled) { return compiled && compiled.meta && isObj(compiled.meta.story) ? compiled.meta.story : null; }
  function frameworkOf(compiled) {
    var st = storyOf(compiled), S = story();
    return st && S.framework ? S.framework(st.framework) : null;
  }
  function energyOf(cs, T) {
    var e = cs && cs.energy != null && isFinite(+cs.energy) ? +cs.energy : T && T.story && T.story.energy != null ? +T.story.energy : 3;
    return clamp(Math.round(e), 1, 5);
  }
  function wordsOf(s) { var S = story(); return S.words ? S.words(s) : String(s || '').trim().split(/\s+/).filter(Boolean).length; }
  function speechOf(notes) { var S = story(); return S.speech ? S.speech(notes) : String(notes || ''); }
  function speakSecs(text) { return wordsOf(speechOf(text)) / 140 * 60; }

  var lineCache = new Map();
  function firstLineOf(compiled, i) {
    var key = compiled.themeKey + '|' + compiled.sceneKeys[i], hit = lineCache.get(key);
    if (hit !== undefined) return hit;
    var out = '';
    try {
      var S = story(), states = S.resolveStates ? S.resolveStates(compiled, i) : [];
      var last = states[states.length - 1];
      if (last) {
        var best = null, bestSize = -1, styles = compiled.theme.styles || {};
        last.texts.forEach(function (it) {
          var sp = it.spec, st = styles[sp.style || 'title'] || {}, size = sp.size != null ? sp.size : st.size || 0;
          if (sp.str && size > bestSize) { best = sp; bestSize = size; }
        });
        if (best) out = String(best.str);
      }
    } catch (e) { out = ''; }
    if (lineCache.size > 400) lineCache.clear();
    lineCache.set(key, out);
    return out;
  }
  var RANK = { error: 3, warn: 2, info: 1 };
  /* SceneInfo = { i, id, src, cs, isTpl, readOnly, T, tpl, label, beatId, beat, beatIdx, color, energy, autoEnergy, steps,
   *   placeholders: string[], point, generatedPoint: bool, sev: 'error'|'warn'|'info'|null, firstLine } */
  function describeScenes(compiled, lint, opts) {
    opts = opts || {};
    var S = story(), fw = frameworkOf(compiled), beats = fw ? fw.beats : [];
    var sev = {};
    ((lint && lint.findings) || []).forEach(function (f) {
      if (f.sceneId == null) return;
      if (!sev[f.sceneId] || RANK[f.sev] > RANK[sev[f.sceneId]]) sev[f.sceneId] = f.sev;
    });
    var srcs = compiled.source && Array.isArray(compiled.source.scenes) ? compiled.source.scenes : [];
    var colorOf = function (beat, bi) { if (typeof opts.beatColor === 'function' && beat) { try { var c = opts.beatColor(beat); if (c) return c; } catch (e) { } } return beatColor(bi); };
    return compiled.scenes.map(function (cs, i) {
      var src = srcs[i] || cs, isTpl = isObj(src) && src.template !== undefined;
      var tplId = isTpl ? src.template : (cs.like || null), T = tplId ? PD.template.get(tplId) || null : null;
      var beatId = src.beat != null ? src.beat : cs.beat != null ? cs.beat : null;
      var bi = fw && beatId != null && S.beatIndex ? S.beatIndex(fw, beatId) : -1;
      var beat = bi >= 0 ? beats[bi] : null;
      var autoE = energyOf({}, T);
      var ph = isTpl && S.placeholders ? S.placeholders(src.props) : [];
      var pointGen = !!(beat && src.point === beat.label + ': ' + beat.ask);
      return {
        i: i, id: cs.id, src: src, cs: cs, isTpl: isTpl, readOnly: !!opts.readOnly || !isTpl, T: T, tpl: tplId,
        label: T ? T.label : tplId ? humanize(tplId) : 'Hand-written scene', beatId: beatId, beat: beat, beatIdx: bi, color: colorOf(beat, bi),
        energy: energyOf(cs, T), autoEnergy: autoE, steps: Array.isArray(cs.steps) ? cs.steps.length : 0,
        placeholders: ph, point: typeof src.point === 'string' ? src.point : '', generatedPoint: pointGen,
        sev: sev[cs.id] || null, firstLine: firstLineOf(compiled, i)
      };
    });
  }

  /* ================================================================ menus, modals, snackbar */
  var openMenu = null;
  function closeMenu() { if (openMenu) { var m = openMenu; openMenu = null; m.close(); } }
  function menu(items, pos) {
    ensureBase(); closeMenu();
    var root = h('div', { class: 'pdx pdx-menu', role: 'menu' });
    var cleanup = [];
    function build(list, host) {
      list.forEach(function (it) {
        if (it.sep) { host.appendChild(h('hr')); return; }
        if (it.header) { host.appendChild(h('div', { class: 'hd pdx-cap', text: it.header })); return; }
        var b = h('button', { role: 'menuitem', 'class': it.danger ? 'is-danger' : '', disabled: it.disabled }, [
          it.dot ? h('span', { class: 'dot', style: { '--c': it.dot } }) : it.icon ? icon(it.icon, 16) : null,
          h('span', { text: it.label }), h('span', { class: 'sp' }), it.sub ? icon('chevR', 14) : it.kbd ? h('span', { class: 'pdx-kbd', text: it.kbd }) : null]);
        if (it.sub) {
          b.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); menu(it.sub, { x: pos.x, y: pos.y, from: it.label }); });
        } else b.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); if (it.onClick) it.onClick(); });
        host.appendChild(b);
      });
    }
    build(items, root);
    document.body.appendChild(root);
    var r = root.getBoundingClientRect();
    var x = clamp(pos.x, 8, window.innerWidth - r.width - 8), y = pos.y;
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, (pos.above != null ? pos.above : pos.y) - r.height - (pos.above != null ? 8 : 0));
    root.style.left = x + 'px'; root.style.top = Math.max(8, y) + 'px';
    function onDown(e) { if (!root.contains(e.target)) closeMenu(); }
    function onKey(e) {
      var bs = [].slice.call(root.querySelectorAll('button:not([disabled])')), i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
    }
    setTimeout(function () { document.addEventListener('pointerdown', onDown, true); }, 0);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closeMenu);
    var first = root.querySelector('button:not([disabled])'); if (first) first.focus({ preventScroll: true });
    var api = { el: root, close: function () {
      document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('blur', closeMenu);
      if (root.parentNode) root.parentNode.removeChild(root);
      if (openMenu === api) openMenu = null;
    } };
    openMenu = api;
    return api;
  }

  function modal(opts) {
    ensureBase();
    var prevFocus = document.activeElement, done = false;
    var dlg = h('div', { class: 'pdx-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' });
    if (opts.width) dlg.style.width = opts.width;
    var closeBtn = h('button', { class: 'pdx-btn is-quiet is-icon', 'aria-label': 'Close', onclick: function () { api.close(); } }, icon('x', 18));
    dlg.appendChild(h('header', null, [h('div', { style: 'flex:1;min-width:0' }, [h('h2', { text: opts.title || '' }), opts.subtitle ? h('p', { text: opts.subtitle }) : null]), opts.headerExtra || null, closeBtn]));
    var bd = h('div', { class: 'bd' }, opts.body); dlg.appendChild(bd);
    var scrim = h('div', { class: 'pdx pdx-scrim' }, dlg);
    scrim.addEventListener('pointerdown', function (e) { if (e.target === scrim) api.close(); });
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); api.close(); return; }
      if (e.key === 'Tab') {
        var f = [].slice.call(dlg.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    var api = { el: dlg, body: bd, scrim: scrim, close: function () {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.style.opacity = '0'; scrim.style.transition = 'opacity .14s';
      setTimeout(function () { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }, 140);
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { } }
      if (opts.onClose) opts.onClose();
    } };
    setTimeout(function () { var f = (opts.focus && dlg.querySelector(opts.focus)) || dlg.querySelector('[data-autofocus]') || closeBtn; if (f) f.focus({ preventScroll: true }); }, 30);
    return api;
  }

  var snackEl = null, snackTimer = 0;
  function snack(msg, opts) {
    ensureBase(); opts = opts || {};
    if (snackEl && snackEl.parentNode) snackEl.parentNode.removeChild(snackEl);
    clearTimeout(snackTimer);
    var el = snackEl = h('div', { class: 'pdx pdx-snack', role: 'status' }, [h('span', { text: msg })]);
    if (opts.action) el.appendChild(h('button', { class: 'pdx-btn is-sm', text: opts.action, onclick: function () { if (el.parentNode) el.parentNode.removeChild(el); if (opts.onAction) opts.onAction(); } }));
    else el.style.paddingRight = '18px';
    document.body.appendChild(el);
    snackTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, opts.ms || 5200);
    return el;
  }

  /* ================================================================ widgets */
  function seg(options, value, onChange, opts) {
    opts = opts || {};
    var root = h('div', { class: 'pdx-seg', role: 'group', 'aria-label': opts.label || '' });
    var btns = options.map(function (o) {
      var v = isObj(o) ? o.value : o, label = isObj(o) ? o.label : String(o);
      var b = h('button', { type: 'button', 'aria-pressed': String(v === value), dataset: { value: String(v) }, title: isObj(o) && o.title ? o.title : null, text: label,
        onclick: function () { if (opts.readOnly) return; set(v); onChange(v); } });
      return { v: v, b: b };
    });
    btns.forEach(function (x) { root.appendChild(x.b); });
    function set(v) { value = v; btns.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.v === v)); }); }
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = btns.findIndex(function (x) { return x.v === value; }), n = clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, btns.length - 1);
      if (n !== i) { e.preventDefault(); set(btns[n].v); btns[n].b.focus(); onChange(btns[n].v); }
    });
    return { el: root, set: set };
  }
  function switchEl(value, onChange, label) {
    var b = h('button', { type: 'button', class: 'pdx-switch', role: 'switch', 'aria-checked': String(!!value), 'aria-label': label || '' });
    function set(v) { value = !!v; b.setAttribute('aria-checked', String(value)); }
    b.addEventListener('click', function () { set(!value); onChange(value); });
    return { el: b, set: set, get: function () { return value; } };
  }

  /* the painted textarea. A mirror shows the text with [placeholders] and "▸ prompt" lines painted; the textarea above it is
   * transparent, so the caret, the selection and spell-check stay native. The mirror sizes the box, so it grows by itself. */
  var PH_RE = /\{[^{}]{1,40}\}/g;
  function paintInto(mirror, text, prompts) {
    clear(mirror);
    var lines = String(text).split('\n');
    lines.forEach(function (ln, li) {
      if (li) mirror.appendChild(document.createTextNode('\n'));
      if (prompts && ln.replace(/^\s+/, '').charAt(0) === '▸') { mirror.appendChild(h('span', { class: 'pdx-pr', text: ln })); return; }
      var last = 0, m;
      PH_RE.lastIndex = 0;
      while ((m = PH_RE.exec(ln))) {
        if (m.index > last) mirror.appendChild(document.createTextNode(ln.slice(last, m.index)));
        mirror.appendChild(h('span', { class: 'pdx-ph', text: m[0] }));
        last = m.index + m[0].length;
      }
      if (last < ln.length) mirror.appendChild(document.createTextNode(ln.slice(last)));
    });
    if (/\n$/.test(text)) mirror.appendChild(document.createTextNode('​'));
  }
  function hlArea(opts) {
    opts = opts || {};
    var mirror = h('div', { class: 'pdx-hl-mirror', 'aria-hidden': 'true' });
    var ta = h('textarea', { class: 'pdx-hl-input', rows: 1, spellcheck: 'true', placeholder: opts.placeholder || '', 'aria-label': opts.label || '', autocomplete: 'off' });
    if (opts.readOnly) ta.readOnly = true;
    var wrap = h('div', { class: 'pdx-hl' + (opts.className ? ' ' + opts.className : '') }, [mirror, ta]);
    function paint() { paintInto(mirror, ta.value, opts.prompts); }
    ta.addEventListener('input', function () {
      if (opts.single && /\n/.test(ta.value)) { var pos = ta.selectionStart; ta.value = ta.value.replace(/\n+/g, ' '); ta.selectionStart = ta.selectionEnd = Math.min(pos, ta.value.length); }
      paint();
      if (opts.onInput) opts.onInput(ta.value);
    });
    ta.addEventListener('keydown', function (e) {
      if (opts.single && e.key === 'Enter') {
        e.preventDefault();
        var all = [].slice.call((opts.scope || document).querySelectorAll('.pdx-hl-input, .pdx-input, .pdx-num')), i = all.indexOf(ta);
        if (opts.onCommit) opts.onCommit(ta.value);
        if (all[i + 1]) all[i + 1].focus(); else ta.blur();
      }
    });
    ta.addEventListener('blur', function () { if (opts.onBlur) opts.onBlur(ta.value); });
    // a [placeholder] is there to be typed over: focusing a field that is only a placeholder selects it, and a click inside one selects that one
    function pickToken() {
      if (ta.selectionStart !== ta.selectionEnd || opts.readOnly) return;
      var v = ta.value, m, pos = ta.selectionStart;
      if (/^\s*\{[^{}]{1,40}\}\s*$/.test(v)) { ta.select(); return; }
      PH_RE.lastIndex = 0;
      while ((m = PH_RE.exec(v))) if (pos > m.index && pos < m.index + m[0].length) { ta.setSelectionRange(m.index, m.index + m[0].length); return; }
    }
    ta.addEventListener('focus', function () { setTimeout(pickToken, 0); });
    ta.addEventListener('mouseup', pickToken);
    ta.value = opts.value == null ? '' : String(opts.value);
    paint();
    return { el: wrap, input: ta, mirror: mirror,
      set: function (v) { if (ta.value !== String(v == null ? '' : v)) { ta.value = v == null ? '' : String(v); paint(); } },
      get: function () { return ta.value; }, focus: function () { ta.focus(); }, repaint: paint };
  }

  /* ================================================================ props → form fields */
  var KNOWN_TOKENS = ['brand', 'tagline', 'bigIdea', 'shortIdea', 'oldWay', 'newWay', 'ask', 'audience', 'proof1', 'proof2', 'proof3'];
  var STYLE_NAMES = { mega: 'Mega', hero: 'Hero', title: 'Title', statement: 'Statement', subtitle: 'Subtitle', kicker: 'Kicker', body: 'Body', year: 'Year', label: 'Label', caption: 'Caption' };

  function shell(label, opts) {
    opts = opts || {};
    var right = h('span', { class: 'pdx-fr' }), foot = h('div', { class: 'pdx-ff' });
    var lab = h('label', { class: 'pdx-fl', text: label });
    var root = h('div', { class: 'pdx-field', dataset: { prop: opts.name || '' } }, [h('div', { class: 'pdx-fh' }, [lab, right]), opts.body || null, foot]);
    return { root: root, label: lab, right: right, foot: foot };
  }

  function textField(spec, value, api, name) {
    var multi = spec.type === 'longtext';
    var S = story(), B = (S.BUDGET || {})[spec.style] || null;
    var sh = shell(spec.label || humanize(name), { name: name });
    var counts = sh.right, note = h('div', { class: 'pdx-note is-err', style: 'display:none' }), budget = h('div', { class: 'pdx-note', style: 'display:none' }), tokenRow = h('div', { class: 'pdx-note is-info', style: 'display:none' });
    var voice = api.compact ? null : B ? h('div', { class: 'pdx-help is-voice', text: (STYLE_NAMES[spec.style] || cap(spec.style)) + ': ' + (B.voice ? B.voice + '. ' : '') + 'Up to ' + plural(B.words, 'word') + '.' }) : spec.hint ? h('div', { class: 'pdx-help is-voice', text: spec.hint }) : null;
    var area = hlArea({ value: value, single: !multi, placeholder: spec.hint || '', label: spec.label || name, scope: api.scope,
      onInput: function (v) { value = v; refresh(); api.onChange(v, { live: true }); }, onBlur: function (v) { api.onBlur && api.onBlur(v); } });
    sh.root.insertBefore(area.el, sh.foot);
    if (multi) area.input.rows = 2;
    sh.foot.appendChild(note); sh.foot.appendChild(budget); sh.foot.appendChild(tokenRow);
    if (voice) sh.foot.appendChild(voice);

    function refresh() {
      var v = String(value == null ? '' : value), n = v.length, w = wordsOf(v);
      clear(counts);
      var over = spec.max != null && n > spec.max;
      counts.appendChild(h('span', { class: over ? 'is-warn' : '', text: spec.max != null ? n + '/' + spec.max : String(n) }));
      counts.appendChild(document.createTextNode(' · ' + plural(w, 'word')));
      // measured overflow (the real glyph widths of the current look)
      var bad = false, msg = '';
      if (v.trim() && spec.style && api.measure) {
        var m = null;
        try { m = api.measure(v, spec.style, spec.size); } catch (e) { m = null; }
        if (m) {
          var allowed = spec.lines || (B && B.lines) || 1;
          if (m.lines.length > allowed) {
            bad = true;
            msg = allowed === 1 ? 'Too wide for ' + (STYLE_NAMES[spec.style] || spec.style) + '. Shorten it or step down a style.'
              : 'That runs to ' + m.lines.length + ' lines. ' + (STYLE_NAMES[spec.style] || spec.style) + ' reads best in ' + allowed + ' or fewer.';
          }
        }
      }
      area.el.classList.toggle('is-err', bad);
      area.el.classList.toggle('is-warn', !bad && over);
      note.style.display = bad ? '' : 'none';
      clear(note); if (bad) { note.appendChild(icon('alert', 14)); note.appendChild(h('span', { text: msg })); if (sh.root.contains(document.activeElement)) setTimeout(function () { if (note.scrollIntoView) note.scrollIntoView({ block: 'nearest' }); }, 0); }
      var wbad = B && w > B.words && !bad;
      budget.style.display = wbad ? '' : 'none';
      clear(budget); if (wbad) { budget.appendChild(icon('info', 14)); budget.appendChild(h('span', { text: (STYLE_NAMES[spec.style] || spec.style) + ' lines land best at ' + plural(B.words, 'word') + ' or fewer. This one has ' + w + '.' })); }
      // placeholder tokens: offer the brief's answer, or say where to answer it
      clear(tokenRow); var shown = false;
      var seen = {}, re = /\{([A-Za-z][A-Za-z0-9]*)\}/g, m2;
      while ((m2 = re.exec(v))) {
        var tn = m2[1];
        if (seen[tn] || KNOWN_TOKENS.indexOf(tn) < 0) continue;
        seen[tn] = 1; shown = true;
        var ans = api.tokens && api.tokens[tn];
        if (ans) {
          tokenRow.appendChild(icon('sparkle', 14));
          tokenRow.appendChild(h('span', null, ['Your brief says ', h('b', { text: '“' + (ans.length > 38 ? ans.slice(0, 37) + '…' : ans) + '”' }), '. ']));
          (function (tok, answer) {
            tokenRow.appendChild(h('button', { class: 'pdx-link', type: 'button', text: 'Use it', onclick: function () {
              var nv = String(value).split('{' + tok + '}').join(answer); value = nv; area.set(nv); refresh(); api.onChange(nv, { live: false });
            } }));
          })(tn, ans);
        } else {
          tokenRow.appendChild(icon('info', 14));
          tokenRow.appendChild(h('span', { text: S.say ? S.say('board.placeholder', { token: tn }) : 'Answer ‘' + tn + '’ in the brief, or type over it.' }));
        }
      }
      tokenRow.style.display = shown ? '' : 'none';
    }
    refresh();
    return { el: sh.root, set: function (v) { value = v; area.set(v); refresh(); }, get: function () { return value; }, focus: function () { area.focus(); }, refresh: refresh };
  }

  function numberField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var min = spec.min, max = spec.max, hasRange = min != null && max != null;
    var step = spec.step || (spec.int ? 1 : hasRange && max - min > 20 ? 1 : 0.1);
    var num = h('input', { class: 'pdx-input pdx-num', type: 'number', step: step, 'aria-label': spec.label || name });
    if (min != null) num.min = min; if (max != null) num.max = max;
    var range = hasRange ? h('input', { class: 'pdx-range', type: 'range', min: min, max: max, step: step, 'aria-label': spec.label || name }) : null;
    function fmt(v) { return v == null || v === '' ? '' : String(Math.round(v * 1000) / 1000); }
    function paint(v) {
      num.value = fmt(v);
      if (range) { range.value = v == null ? min : v; range.style.setProperty('--pct', ((clamp(+range.value, min, max) - min) / (max - min) * 100) + '%'); }
    }
    function emit(v, live) { value = v; api.onChange(v, { live: live }); }
    num.addEventListener('input', function () { var v = num.value === '' ? null : +num.value; if (v == null || !isFinite(v)) return; if (range) range.value = v, range.style.setProperty('--pct', ((clamp(v, min, max) - min) / (max - min) * 100) + '%'); emit(v, true); });
    num.addEventListener('keydown', function (e) { if (e.key === 'Enter') num.blur(); });
    if (range) range.addEventListener('input', function () { var v = +range.value; num.value = fmt(v); range.style.setProperty('--pct', ((v - min) / (max - min) * 100) + '%'); emit(v, true); });
    if (range) { sh.right.appendChild(num); sh.right.style.display = 'flex'; sh.right.style.alignItems = 'center'; sh.root.insertBefore(range, sh.foot); }
    else { num.style.width = '100%'; num.style.height = '36px'; num.style.textAlign = 'left'; num.style.fontSize = '15px'; num.style.padding = '0 12px'; num.style.borderRadius = '10px'; sh.root.insertBefore(num, sh.foot); }
    if (spec.hint) sh.foot.appendChild(h('div', { class: 'pdx-help', text: spec.hint }));
    paint(value);
    return { el: sh.root, set: function (v) { value = v; paint(v); }, get: function () { return value; }, focus: function () { (range || num).focus(); } };
  }

  function boolField(spec, value, api, name) {
    var lab = h('label', { class: 'pdx-fl', text: spec.label || humanize(name), style: 'flex:1;cursor:pointer' });
    var sw = switchEl(!!value, function (v) { api.onChange(v, { live: false }); }, spec.label || name);
    lab.addEventListener('click', function () { sw.el.click(); });
    var root = h('div', { class: 'pdx-field', dataset: { prop: name }, style: 'flex-direction:row;align-items:center;justify-content:space-between;gap:12px' }, [lab, sw.el]);
    return { el: root, set: function (v) { sw.set(v); }, get: sw.get, focus: function () { sw.el.focus(); } };
  }

  function enumField(spec, value, api, name) {
    var opts = (spec.options || []).map(function (o) { return { value: o, label: humanize(o) }; });
    var sh = shell(spec.label || humanize(name), { name: name });
    var longest = opts.reduce(function (a, o) { return a + o.label.length; }, 0);
    var ctl;
    if (opts.length <= 4 && longest <= 30) {
      ctl = seg(opts, value, function (v) { api.onChange(v, { live: false }); }, { label: spec.label || name });
      sh.root.insertBefore(h('div', null, ctl.el), sh.foot);
      return { el: sh.root, set: function (v) { ctl.set(v); }, get: function () { return value; }, focus: function () { var b = ctl.el.querySelector('button'); if (b) b.focus(); } };
    }
    var sel = h('select', { class: 'pdx-select', 'aria-label': spec.label || name }, opts.map(function (o) { return h('option', { value: o.value, text: o.label }); }));
    sel.value = value;
    sel.addEventListener('change', function () { api.onChange(sel.value, { live: false }); });
    sh.root.insertBefore(sel, sh.foot);
    return { el: sh.root, set: function (v) { sel.value = v; }, get: function () { return sel.value; }, focus: function () { sel.focus(); } };
  }

  function colorField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var colors = (api.theme && api.theme.colors) || {}, names = Object.keys(colors);
    var wrap = h('div', { class: 'pdx-sw' });
    var hex = h('input', { class: 'pdx-input is-mono', type: 'text', placeholder: '#ffd27a', 'aria-label': (spec.label || name) + ' as a hex colour', style: 'width:110px;height:30px' });
    var btns = names.map(function (n) {
      var b = h('button', { type: 'button', title: n, 'aria-label': n, style: { '--c': colors[n] }, 'aria-pressed': 'false', onclick: function () { set(n); api.onChange(n, { live: false }); } });
      wrap.appendChild(b); return { n: n, b: b };
    });
    function set(v) { value = v; hex.value = v == null || colors[v] ? '' : v; btns.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.n === v)); }); }
    hex.addEventListener('change', function () { var v = hex.value.trim(); if (/^#[0-9a-f]{3,8}$/i.test(v)) { set(v); api.onChange(v, { live: false }); } else set(value); });
    sh.root.insertBefore(h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [wrap, hex]), sh.foot);
    set(value);
    return { el: sh.root, set: set, get: function () { return value; }, focus: function () { if (btns[0]) btns[0].b.focus(); } };
  }

  function nebulaField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var neb = (api.theme && api.theme.nebulae) || {}, keys = Object.keys(neb);
    if (!keys.length) { sh.foot.appendChild(h('div', { class: 'pdx-help', text: 'This look has no nebulae.' })); return { el: sh.root, set: function () { }, get: function () { return value; }, focus: function () { } }; }
    var wrap = h('div', { class: 'pdx-neb' }), btns = keys.map(function (k) {
      var c = neb[k], b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: function () { set(k); api.onChange(k, { live: false }); } },
        [h('i', { style: { '--g': 'linear-gradient(100deg,' + c[0] + ',' + c[1] + ' 55%,' + c[2] + ')' } }), h('span', { text: humanize(k) })]);
      wrap.appendChild(b); return { k: k, b: b };
    });
    function set(v) { value = v; btns.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.k === v)); }); }
    sh.root.insertBefore(wrap, sh.foot); set(value);
    return { el: sh.root, set: set, get: function () { return value; }, focus: function () { if (btns[0]) btns[0].b.focus(); } };
  }

  function shotField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var shots = (api.theme && api.theme.shots) || {}, keys = Object.keys(shots);
    var wrap = h('div', { class: 'pdx-neb' }), btns = keys.map(function (k) {
      var b = h('button', { type: 'button', 'aria-pressed': 'false', style: { width: 'auto', padding: '7px 10px', flexDirection: 'row' }, onclick: function () { set(k); api.onChange(k, { live: false }); } }, [h('span', { text: humanize(k) })]);
      wrap.appendChild(b); return { k: k, b: b };
    });
    function set(v) { value = v; btns.forEach(function (x) { x.b.setAttribute('aria-pressed', String(x.k === v)); }); }
    sh.root.insertBefore(wrap, sh.foot);
    sh.foot.appendChild(h('div', { class: 'pdx-help', text: 'A shot is a camera setup that belongs to this look: where the sky, planet and light sit behind the words.' }));
    set(value);
    return { el: sh.root, set: set, get: function () { return value; }, focus: function () { if (btns[0]) btns[0].b.focus(); } };
  }

  function assetField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var wrap = h('div', { class: 'pdx-tiles' });
    var accept = spec.accept || 'image';
    function render() {
      clear(wrap);
      var list = api.assets ? api.assets(accept) : [];
      list.forEach(function (a) {
        var th = h('span', { class: 'th' });
        if (a.type === 'image') th.style.backgroundImage = 'url("' + a.src + '")'; else th.appendChild(icon('font', 20));
        wrap.appendChild(h('button', { type: 'button', class: 'pdx-tile', 'aria-pressed': String(a.id === value), title: a.name || a.id, onclick: function () { value = a.id; render(); api.onChange(a.id, { live: false }); } },
          [th, h('span', { class: 'nm', text: a.name || a.id })]));
      });
      if (api.addAsset) wrap.appendChild(h('button', { type: 'button', class: 'pdx-tile is-add', title: 'Add a file', onclick: function () { api.addAsset(accept); } },
        [h('span', { class: 'th' }, icon('plus', 20)), h('span', { class: 'nm', text: 'Add' })]));
      if (!list.length && !api.addAsset) wrap.appendChild(h('div', { class: 'pdx-help', text: 'No ' + accept + 's yet. Drop one anywhere on this page.' }));
    }
    sh.root.insertBefore(wrap, sh.foot);
    var warn = h('div', { class: 'pdx-note', style: 'display:none' });
    sh.foot.appendChild(warn);
    render();
    if (spec.hint) sh.foot.appendChild(h('div', { class: 'pdx-help', text: spec.hint }));
    return { el: sh.root, set: function (v) { value = v; render(); }, get: function () { return value; }, focus: function () { var b = wrap.querySelector('button'); if (b) b.focus(); }, refresh: render, note: warn };
  }

  function isSpec(o) { return isObj(o) && typeof o.type === 'string'; }
  function defaultFor(spec) {
    if (has(spec, 'default')) return clone(spec['default']);
    switch (spec.type) {
      case 'number': return spec.min != null ? spec.min : 0;
      case 'bool': return false;
      case 'list': return [];
      case 'enum': return spec.options && spec.options[0];
      default: return '';
    }
  }

  function listField(spec, value, api, name) {
    var sh = shell(spec.label || humanize(name), { name: name });
    var list = Array.isArray(value) ? clone(value) : [];
    var host = h('div', { class: 'pdx-list' }), fieldsOf = [];
    var prim = isSpec(spec.of), subs = prim ? null : (isObj(spec.of) ? spec.of : {});
    var addBtn = h('button', { type: 'button', class: 'pdx-btn is-sm', onclick: function () { addItem(); } }, [icon('plus', 14), h('span', { text: 'Add' })]);
    var cnt = sh.right;
    function limits() { return { min: spec.min != null ? spec.min : 0, max: spec.max != null ? spec.max : 99 }; }
    function emit(live) { api.onChange(clone(list), { live: !!live }); }
    function itemTemplate() {
      if (prim) return defaultFor(spec.of);
      var o = {}; Object.keys(subs).forEach(function (k) { if (subs[k].required || has(subs[k], 'default')) o[k] = defaultFor(subs[k]); }); return o;
    }
    function addItem() {
      if (list.length >= limits().max) return;
      list.push(itemTemplate()); render(list.length - 1); emit(false);
      var last = host.lastChild; if (last) { var f = last.querySelector('textarea, input'); if (f) f.focus(); }
    }
    function move(i, d) { var j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; render(j); emit(false); }
    function remove(i) { if (list.length <= limits().min) return; list.splice(i, 1); render(); emit(false); }
    function itemApi(i, key) {
      var base = {};
      for (var k in api) base[k] = api[k];
      base.compact = true;
      base.onChange = function (v, meta) { if (key == null) list[i] = v; else list[i][key] = v; emit(meta && meta.live); };
      return base;
    }
    function render(flash) {
      clear(host); fieldsOf = [];
      var L = limits();
      list.forEach(function (it, i) {
        var body = h('div', { class: 'bd' });
        if (prim) {
          var f = field(Object.assign({}, spec.of, { label: (spec.of.label || 'Item') + ' ' + (i + 1) }), it, itemApi(i, null), name + i);
          body.appendChild(f.el); fieldsOf.push(f);
        } else {
          var keys = Object.keys(subs), main = [], extra = [];
          keys.forEach(function (k) { (subs[k].required || subs[k].type === 'text' ? main : extra).push(k); });
          var row = h('div', { style: 'display:grid;grid-template-columns:' + (main.length > 1 ? 'minmax(0,.55fr) minmax(0,1fr)' : '1fr') + ';gap:10px' });
          main.forEach(function (k) {
            var v = it[k] === undefined ? defaultFor(subs[k]) : it[k];
            var f = field(subs[k], v, itemApi(i, k), name + i + k); row.appendChild(f.el); fieldsOf.push(f);
          });
          body.appendChild(row);
          if (extra.length) {
            var more = h('details', { class: 'pdx-more' }, [h('summary', null, [icon('chevR', 12), h('span', { text: 'More for this one' })])]);
            var inner = h('div');
            extra.forEach(function (k) { var v = it[k] === undefined ? defaultFor(subs[k]) : it[k]; var f = field(subs[k], v, itemApi(i, k), name + i + k); inner.appendChild(f.el); fieldsOf.push(f); });
            more.appendChild(inner); body.appendChild(more);
          }
        }
        var ops = h('div', { class: 'ops' }, [
          h('button', { type: 'button', class: 'pdx-btn is-quiet is-sm is-icon', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { move(i, -1); } }, icon('up', 14)),
          h('button', { type: 'button', class: 'pdx-btn is-quiet is-sm is-icon', title: 'Move down', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: function () { move(i, 1); } }, icon('down', 14)),
          h('button', { type: 'button', class: 'pdx-btn is-quiet is-sm is-icon is-danger', title: 'Remove', 'aria-label': 'Remove', disabled: list.length <= L.min, onclick: function () { remove(i); } }, icon('trash', 14))
        ]);
        host.appendChild(h('div', { class: 'pdx-item' + (flash === i ? ' is-new' : ''), dataset: { index: i } }, [h('span', { class: 'no', text: String(i + 1) }), body, ops]));
      });
      clear(cnt); cnt.appendChild(document.createTextNode(list.length + (L.max < 99 ? ' of ' + L.max : '')));
      addBtn.disabled = list.length >= L.max;
    }
    sh.root.insertBefore(host, sh.foot);
    sh.foot.appendChild(h('div', null, addBtn));
    render();
    return { el: sh.root, set: function (v) { list = Array.isArray(v) ? clone(v) : []; render(); }, get: function () { return list; }, focus: function () { var f = host.querySelector('textarea, input'); if (f) f.focus(); } };
  }

  function field(spec, value, api, name) {
    switch (spec.type) {
      case 'text': case 'longtext': return textField(spec, value, api, name);
      case 'number': return numberField(spec, value, api, name);
      case 'bool': return boolField(spec, value, api, name);
      case 'enum': return enumField(spec, value, api, name);
      case 'color': return colorField(spec, value, api, name);
      case 'nebula': return nebulaField(spec, value, api, name);
      case 'shot': return shotField(spec, value, api, name);
      case 'asset': return assetField(spec, value, api, name);
      case 'list': return listField(spec, value, api, name);
      default: return textField(Object.assign({}, spec, { type: 'text' }), value, api, name);
    }
  }

  /* buildForm({ schema, values, api, skip: ['shot'] }) → { el, set(values), fields, focusFirst() }
   * The calm layout: what the scene is about (required props, words, lists, pictures, nebulae) first, the fine-tuning
   * (numbers, colours, switches, choices) in a disclosure. api.onChange(name, value, meta). */
  function buildForm(opts) {
    var schema = opts.schema || {}, vals = opts.values || {}, skip = opts.skip || [], fields = {};
    var root = h('div', { class: 'pdx-form', style: 'display:flex;flex-direction:column;gap:18px' });
    var fine = h('div'), main = [], fineKeys = [];
    Object.keys(schema).forEach(function (k) {
      var sp = schema[k];
      if (skip.indexOf(k) >= 0 || sp.type === 'shot') return;
      var primary = sp.required || sp.type === 'text' || sp.type === 'longtext' || sp.type === 'list' || sp.type === 'asset' || sp.type === 'nebula';
      (primary ? main : fineKeys).push(k);
    });
    function make(k) {
      var sp = schema[k], v = vals[k] === undefined ? defaultFor(sp) : vals[k];
      var local = {};
      for (var a in opts.api) local[a] = opts.api[a];
      local.onChange = function (value, meta) { opts.api.onChange(k, value, meta); };
      local.onBlur = function (value) { if (opts.api.onBlur) opts.api.onBlur(k, value); };
      var f = field(sp, v, local, k);
      fields[k] = f; return f;
    }
    main.forEach(function (k) { root.appendChild(make(k).el); });
    if (fineKeys.length) {
      var d = h('details', { class: 'pdx-more', open: opts.openFine ? true : null }, [h('summary', null, [icon('chevR', 12), h('span', { text: 'Fine-tune' })]), fine]);
      d.querySelector('summary').nextSibling.style.gap = '16px';
      fineKeys.forEach(function (k) { fine.appendChild(make(k).el); });
      fine.style.cssText = 'display:flex;flex-direction:column;gap:16px;margin-top:10px';
      root.appendChild(d);
    }
    return {
      el: root, fields: fields,
      set: function (values) { Object.keys(fields).forEach(function (k) { fields[k].set(values[k] === undefined ? defaultFor(schema[k]) : values[k]); }); },
      focusFirst: function () { var k = main[0]; if (k && fields[k]) fields[k].focus(); }
    };
  }

  /* ================================================================ scene factories */
  function uniqueId(base, taken) {
    var set = taken instanceof Set ? taken : new Set(taken || []);
    if (!set.has(base)) return base;
    var m = /^(.*?)-(\d+)$/.exec(base), stem = m ? m[1] : base, n = m ? +m[2] + 1 : 2;
    while (set.has(stem + '-' + n)) n++;
    return stem + '-' + n;
  }
  function tokensOf(st) { var B = story().board; return st && B && B.tokens ? B.tokens(st) : {}; }
  function fillSeed(T, st) { var B = story().board; var seed = clone(T.seed || {}); return B && B.fill ? B.fill(seed, tokensOf(st)) : seed; }
  /* a template scene from the template's seed ({tokens} filled from the brief) for a beat */
  function newSceneFor(templateId, beat, st, takenIds) {
    var T = PD.template.get(templateId);
    var sc = { id: uniqueId(beat ? beat.id : templateId, takenIds), template: templateId, props: T ? fillSeed(T, st) : {} };
    if (beat) { sc.beat = beat.id; sc.point = beat.label + ': ' + beat.ask; sc.notes = '▸ ' + beat.ask; }
    return sc;
  }
  /* "Change template": props with the same name (and the same kind of value) carry over; the rest come from the seed */
  function changeTemplateProps(oldScene, newTemplateId, st) {
    var T = PD.template.get(newTemplateId), oldT = PD.template.get(oldScene.template);
    var out = T ? fillSeed(T, st) : {}, schema = (T && T.props) || {}, oldSchema = (oldT && oldT.props) || {}, old = oldScene.props || {};
    Object.keys(schema).forEach(function (k) {
      if (!has(old, k) || old[k] === undefined || old[k] === '') return;
      var a = schema[k], b = oldSchema[k], fam = function (t) { return t === 'longtext' ? 'text' : t; };
      if (!b || fam(a.type) !== fam(b.type)) return;
      if (a.type === 'enum' && (a.options || []).indexOf(old[k]) < 0) return;
      if (a.type === 'shot' && b && has(b, 'default') && old[k] === b['default']) return;      // the old template's own default shot is not a choice
      if (a.type === 'list' && (!Array.isArray(old[k]) || (a.min && old[k].length < a.min))) return;
      out[k] = clone(old[k]);
    });
    return out;
  }

  return {
    h: h, svg: svg, icon: icon, clear: clear, css: css, ensureBase: ensureBase, debounce: debounce, clamp: clamp, clone: clone,
    fmtClock: fmtClock, fmtSecs: fmtSecs, plural: plural, cap: cap, humanize: humanize,
    BEAT_COLORS: BEAT_COLORS, beatColor: beatColor, NEUTRAL: NEUTRAL, storyOf: storyOf, frameworkOf: frameworkOf, energyOf: energyOf,
    describeScenes: describeScenes, firstLineOf: firstLineOf, wordsOf: wordsOf, speechOf: speechOf, speakSecs: speakSecs,
    menu: menu, closeMenu: closeMenu, modal: modal, snack: snack, seg: seg, switchEl: switchEl, hlArea: hlArea, paintInto: paintInto,
    field: field, buildForm: buildForm, defaultFor: defaultFor, shell: shell,
    uniqueId: uniqueId, newSceneFor: newSceneFor, changeTemplateProps: changeTemplateProps, tokensOf: tokensOf, fillSeed: fillSeed,
    KNOWN_TOKENS: KNOWN_TOKENS, STYLE_NAMES: STYLE_NAMES
  };
}, { export: false });
