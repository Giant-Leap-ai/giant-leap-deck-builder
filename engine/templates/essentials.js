/* engine/templates/essentials.js — the 6 generic templates (spec §5, rows 11–16; WP4).
 *
 * statement, big-number, quote, three-points, logo and image. They need no particular world: each builds its world as
 * env.shot(p.shot), which falls back to DRIFT when the theme has no such shot, and adds a world key only when
 * env.hasParam(key). Same contract as engine/templates/cinematic.js (the header there defines Template and PropSpec):
 * expand is pure and deterministic, reads defaults from the schema, and returns plain data.
 *
 * big-number draws a 'counter' element, and logo / image draw 'image' elements (engine/elements/{counter,image}.js).
 * Their examples name the assets 'logo' and 'photo'; the Studio (or a deck's assets.js) supplies the pictures.
 *
 * Registration allocates nothing, touches no DOM and draws no random number. */
PD.module('templates/essentials', [], function (PD) {
  var CX = 960, CY = 540;
  var ALL_ROLES = ['hook', 'setup', 'identity', 'scale', 'relevance', 'emotion', 'proof', 'tension', 'turn', 'idea', 'climax', 'resolution', 'cta', 'callback'];

  function str(v) { return v == null ? '' : String(v); }
  function list(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  // 1234.5 → '1,234.5' with `dec` decimals (the counter element formats its numbers the same way)
  function fmt(n, dec, sep) {
    var s = Math.abs(n).toFixed(dec), parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return (n < 0 ? '-' : '') + parts.join('.');
  }
  // n glow points on a ring around (cx, cy)
  function ring(cx, cy, n, r, s, color) {
    var pts = [];
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, s: s, color: color }); }
    return pts;
  }

  /* ------------------------------------------------------------------ 11. statement */
  PD.template('statement', {
    label: 'Big statement',
    summary: 'One sentence, big and centred, with an optional kicker above it.',
    requires: { worlds: [] },
    story: { energy: 2, talkSec: 45, stepTalkSec: 0, roles: ALL_ROLES, hook: true },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: '' },
      line: { type: 'longtext', label: 'Statement', required: true, max: 90, style: 'statement', lines: 3 },
      align: { type: 'enum', label: 'Alignment', options: ['center', 'left'], default: 'center' },
      reveal: { type: 'enum', label: 'Reveal', options: ['letters', 'rise', 'fade', 'focus', 'wipe'], default: 'letters' },
      shot: { type: 'shot', label: 'World', default: 'DRIFT' }
    },
    example: { kicker: 'The short version', line: 'The best ideas fit in one sentence.', align: 'center', reveal: 'letters', shot: 'DRIFT' },
    seed: { line: '{your line}' },
    expand: function (p, env) {
      var line = str(p.line), kicker = str(p.kicker), left = p.align === 'left';
      var h = env.measure(line, 'statement').h;                               // the kicker sits 48 px above the block's top edge
      var at = function (o) { if (left) { o.x = 220; o.align = 'left'; } return o; };
      var text = [];
      if (kicker) text.push(at({ str: kicker, style: 'kicker', y: CY - 20 - h / 2 - 48 }));
      var main = at({ str: line, style: 'statement', y: CY - 20, reveal: p.reveal });
      if (kicker) main.at = 0.3;
      text.push(main);
      return { world: env.shot(p.shot), worldTime: 2.4, text: text, dwell: 5 };
    }
  });

  /* ------------------------------------------------------------------ 12. big-number */
  PD.template('big-number', {
    label: 'Big number',
    summary: 'One number that counts up (or assembles from particles), with what it means.',
    requires: { worlds: [] },
    story: { energy: 4, talkSec: 40, stepTalkSec: 0, roles: ['hook', 'proof', 'scale', 'tension'], hook: true },
    props: {
      value: { type: 'number', label: 'Number', required: true },
      decimals: { type: 'number', label: 'Decimals', min: 0, max: 3, step: 1, int: true, default: 0 },
      prefix: { type: 'text', label: 'Before the number', max: 4, style: 'mega', default: '' },
      suffix: { type: 'text', label: 'After the number', max: 4, style: 'mega', default: '%' },
      label: { type: 'text', label: 'What it means', required: true, max: 60, style: 'statement' },
      source: { type: 'text', label: 'Source', max: 40, style: 'caption', default: '' },
      reveal: { type: 'enum', label: 'Reveal', options: ['count', 'particles'], default: 'count' },
      shot: { type: 'shot', label: 'World', default: 'DRIFT' }
    },
    example: { value: 62, decimals: 0, prefix: '', suffix: '%', label: 'of your audience feels this every week', source: 'Your source, 2026', reveal: 'count', shot: 'DRIFT' },
    seed: { value: 0, label: '{what the number means}' },
    expand: function (p, env) {
      var dec = Math.min(3, Math.max(0, Math.round(num(p.decimals, 0))));
      var sc = { world: env.shot(p.shot), worldTime: 2.4, text: [], dwell: 5 };
      if (p.reveal === 'particles') {
        sc.motion = { stagger: 'leftToRight', spread: 1.2 };
        sc.text.push({ id: 'num', str: str(p.prefix) + fmt(num(p.value, 0), dec, ',') + str(p.suffix), style: 'mega', y: 450, reveal: 'particles' });
      } else {
        sc.elements = [{ kind: 'counter', id: 'num', from: 0, to: num(p.value, 0), decimals: dec, prefix: str(p.prefix), suffix: str(p.suffix), sep: ',', style: 'mega', x: CX, y: 450, countTime: 1.8 }];
      }
      sc.text.push({ str: str(p.label), style: 'statement', y: 640, at: 1.2 });
      if (str(p.source)) sc.text.push({ str: str(p.source), style: 'caption', y: 960, at: 1.8 });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 13. quote */
  PD.template('quote', {
    label: 'Quote',
    summary: 'Someone else says it better. A quotation with who said it.',
    requires: { worlds: [] },
    story: { energy: 2, talkSec: 40, stepTalkSec: 0, roles: ['proof', 'emotion'], hook: true },
    props: {
      quote: { type: 'longtext', label: 'Quote', required: true, max: 160, style: 'statement', size: 56, lines: 4 },
      who: { type: 'text', label: 'Who said it', required: true, max: 30, style: 'label' },
      role: { type: 'text', label: 'Their role or the source', max: 40, style: 'caption', default: '' },
      shot: { type: 'shot', label: 'World', default: 'DRIFT' }
    },
    example: { quote: 'We stopped asking for permission and started shipping.', who: 'A customer', role: 'Interview, 2026', shot: 'DRIFT' },
    seed: { quote: '{quote}', who: '{who}' },
    expand: function (p, env) {
      var sc = {
        world: env.shot(p.shot),
        worldTime: 2.4,
        text: [
          { str: '“' + str(p.quote) + '”', style: 'statement', size: 56, maxWidth: 1300, y: 470, reveal: 'letters' },
          { str: str(p.who), style: 'label', y: 700, at: 2.2 }
        ],
        dwell: 5
      };
      if (str(p.role)) sc.text.push({ str: str(p.role), style: 'caption', y: 745, at: 2.5 });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 14. three-points */
  PD.template('three-points', {
    label: 'Points, one per click',
    summary: 'A title and up to five points. Each click brings in the next one.',
    requires: { worlds: [] },
    story: { energy: 3, talkSec: 20, stepTalkSec: 30, roles: ['proof', 'idea'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: '' },
      items: {
        type: 'list', label: 'Points (one per click)', required: true, min: 2, max: 5,
        of: {
          title: { type: 'text', label: 'Point', required: true, max: 24, style: 'label' },
          line: { type: 'text', label: 'Detail', max: 60, style: 'statement', size: 44, default: '' }
        }
      },
      layout: { type: 'enum', label: 'Layout', options: ['rows', 'columns'], default: 'rows' },
      shot: { type: 'shot', label: 'World', default: 'DRIFT' }
    },
    example: {
      kicker: 'Three reasons',
      items: [
        { title: 'Faster', line: 'Ideas reach people the same day.' },
        { title: 'Clearer', line: 'One picture beats a page of words.' },
        { title: 'More human', line: 'Technology that adapts to people.' }
      ],
      layout: 'rows', shot: 'DRIFT'
    },
    seed: { items: [{ title: '{point}' }, { title: '{point}' }, { title: '{point}' }] },
    expand: function (p, env) {
      var items = list(p.items), n = items.length, cols = p.layout === 'columns';
      var accent = env.role('accent');
      if (typeof accent !== 'string') accent = '#ffd27a';                    // the look's accent colour marks each point
      // rows: y = 330 + k · 170 (five rows are packed tighter so the last one stays on the screen)
      var y0 = n <= 4 ? 330 : 310, pitch = n <= 4 ? 170 : 150;
      // columns: x = 960 + (k − (n − 1) / 2) · 560, each 480 wide (more columns squeeze together, inside 120 px margins)
      var pitchX = Math.min(560, Math.floor(1680 / Math.max(1, n))), colW = Math.min(480, pitchX - 40);
      var sc = {
        world: env.shot(p.shot),
        worldTime: 2.4,
        text: [],
        steps: items.map(function (it, k) {
          var title = str(it && it.title), line = str(it && it.line), step = { particles: [], text: [] };
          if (cols) {
            var x = CX + (k - (n - 1) / 2) * pitchX;
            step.particles.push({ shape: 'points', points: ring(x, 400, 22, 15, 6, accent) });
            step.text.push({ str: title, style: 'label', x: x, y: 470, reveal: 'rise' });
            if (line) step.text.push({ str: line, style: 'statement', size: 44, x: x, y: 600, maxWidth: colW, reveal: 'rise', at: 0.15 });
          } else {
            var y = y0 + k * pitch;
            step.particles.push({ shape: 'points', points: ring(110, y + 24, 22, 15, 6, accent) });
            step.text.push({ str: title, style: 'label', x: 160, y: y, align: 'left', reveal: 'rise' });
            if (line) step.text.push({ str: line, style: 'statement', size: 44, x: 160, y: y + 52, align: 'left', reveal: 'rise', at: 0.15 });
          }
          return step;
        }),
        dwell: 3
      };
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', x: 160, y: 150, align: 'left' });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 15. logo */
  PD.template('logo', {
    label: 'Logo reveal',
    summary: 'Your logo assembles out of particles. Works best on a transparent PNG.',
    requires: { worlds: [] },
    story: { energy: 4, talkSec: 30, stepTalkSec: 0, roles: ['identity', 'callback'], hook: false },
    props: {
      asset: { type: 'asset', label: 'Logo image', required: true, accept: 'image' },
      width: { type: 'number', label: 'Width', min: 200, max: 1600, step: 10, int: true, default: 900 },
      tagline: { type: 'text', label: 'Tagline', max: 40, style: 'subtitle', default: '' },
      mode: { type: 'enum', label: 'Particles follow', options: ['alpha', 'luma'], default: 'alpha' },
      shot: { type: 'shot', label: 'World', default: 'BLOOM' }
    },
    example: { asset: 'logo', width: 900, tagline: 'Making work more human', mode: 'alpha', shot: 'BLOOM' },
    seed: { asset: '', tagline: '{tagline}' },
    expand: function (p, env) {
      var a = env.asset(p.asset), w = num(p.width, 900);
      var h = a && a.w > 0 && a.h > 0 ? w * a.h / a.w : w * 0.4;
      if (h > 520) { w = w * 520 / h; h = 520; }                              // a tall logo shrinks so the tagline stays on the screen
      w = Math.round(w); h = Math.round(h);
      var sc = {
        world: env.shot(p.shot),
        worldTime: 3.5,
        textDelay: 0.25,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 1.9, spread: 0.8, arc: 0.35, entry: 'spark', exit: 'drift' },
        elements: [{ kind: 'image', id: 'logo', asset: str(p.asset), x: CX, y: 470, w: w, h: h, fit: 'contain', reveal: 'particles', sample: { mode: p.mode === 'luma' ? 'luma' : 'alpha', maxPoints: 3500 } }],
        text: [],
        cues: [{ at: 0.35, flash: 0.32 }],
        dwell: 6
      };
      if (env.hasParam('spark')) sc.timing = { spark: [0.6, 'outQuad'] };
      if (str(p.tagline)) sc.text.push({ str: str(p.tagline), style: 'subtitle', y: 470 + h / 2 + 90, reveal: 'letters', at: 2.6 });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 16. image */
  PD.template('image', {
    label: 'Image hold',
    summary: 'A photo, full bleed with a slow push-in (or framed), with a caption.',
    requires: {
      worlds: [],
      worldsFor: function (props) { return props && props.fit === 'contain' ? [] : ['photo']; }     // cover (the default) is the photo world
    },
    story: { energy: 3, talkSec: 40, stepTalkSec: 0, roles: ['emotion', 'setup', 'resolution', 'hook'], hook: true },
    props: {
      asset: { type: 'asset', label: 'Image', required: true, accept: 'image' },
      caption: { type: 'text', label: 'Caption', max: 60, style: 'statement', default: '' },
      fit: { type: 'enum', label: 'Fit', options: ['cover', 'contain'], default: 'cover' },
      focusX: { type: 'number', label: 'Focus, left to right', min: 0, max: 1, step: 0.01, default: 0.5 },
      focusY: { type: 'number', label: 'Focus, top to bottom', min: 0, max: 1, step: 0.01, default: 0.5 },
      zoom: { type: 'number', label: 'Push-in', min: 1, max: 1.3, step: 0.01, default: 1.08 },
      dim: { type: 'number', label: 'Dim', min: 0, max: 0.8, step: 0.01, default: 0.25 }
    },
    example: { asset: 'photo', caption: 'Where it all started', fit: 'cover', focusX: 0.5, focusY: 0.5, zoom: 1.08, dim: 0.25 },
    seed: { asset: '', caption: '{caption}' },
    expand: function (p, env) {
      var cap = str(p.caption), sc;
      if (p.fit === 'contain') {
        sc = {
          world: env.shot('DRIFT'),
          worldTime: 2.4,
          elements: [{ kind: 'image', id: 'photo', asset: str(p.asset), x: CX, y: cap ? 500 : CY, w: 1400, h: 760, fit: 'contain', radius: 12, reveal: 'fade' }],
          text: [],
          dwell: 5
        };
      } else {
        sc = {
          world: env.W(env.shot('DRIFT'), { photo: 1, photoAsset: str(p.asset), photoX: p.focusX, photoY: p.focusY, photoZoom: p.zoom, photoDim: p.dim }),
          worldTime: 2.4,
          timing: { photoZoom: [12, 'linear'], photo: [1.2, 'inOutQuad'] },
          text: [],
          dwell: 5
        };
        // the picture is the background: switch off the space layers that would be drawn over it
        ['stars', 'nebulaAmount', 'backdrop', 'dust'].forEach(function (k) { if (env.hasParam(k)) sc.world[k] = 0; });
      }
      if (cap) sc.text.push({ str: cap, style: 'statement', y: 960, reveal: 'fade', at: 0.8 });
      return sc;
    }
  });

  return { ids: ['statement', 'big-number', 'quote', 'three-points', 'logo', 'image'] };
});
