/* decks/_gallery/deck.js — the gallery: one deck that exercises everything WP3 adds, under the Slate look (spec §9 WP3).
 *   the ambient world (charcoal, ember, steel, dusk presets; crossfades, bokeh, horizon glow)
 *   the photo world (Ken Burns, a picture-to-picture crossfade, a tint)        the image element (contain, rounded, glow,
 *   every reveal, particles from a logo)        the counter element (decimals, prefix, suffix)
 * Open decks/_gallery/index.html (keys as in any deck: arrows / space, G n.m, F for the frame rate). The pictures are
 * procedural drawings embedded in assets.js (see tools/test/fixtures/wp3-make-gallery-assets.js).
 * A factory deck may not use the theme helpers (h.shot, h.col, …) while it builds its scenes: its theme (slate) is
 * not named after the deck, so the shots are spelled out here, with the values themes/slate/theme.js gives them. */
PD.deck('gallery', function (PD, h) {
  var WARM = { ambientPreset: 'ember', bokeh: 0.7, horizonGlow: 0.5 };
  var COOL = { ambientPreset: 'steel', bokeh: 0.45, horizonGlow: 0.22 };
  var DARK = { ambientPreset: 'charcoal', bokeh: 0.12, horizonGlow: 0, vignette: 0.85 };
  function W() { var o = {}; for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) o[k] = arguments[i][k]; return o; }

  return {
    format: 2,
    id: 'gallery',
    meta: {
      title: 'Pixeldeck Gallery',
      subtitle: 'The Slate look, the ambient and photo worlds, image and counter elements',
      theme: 'slate',
      generator: 'hand',
      story: {
        framework: 'blank', goal: null, tone: null, audience: '', targetMin: null,
        bigIdea: '', shortIdea: '', oldWay: '', newWay: '', ask: '', proof: [], brand: 'pixeldeck', tagline: ''
      }
    },
    scenes: [
      /* 1 ─ The look: charcoal and warm light, one accent. Click: the light turns to ember. */
      {
        id: 'slate',
        world: {}, worldTime: 2.4,
        text: [
          { str: 'Pixeldeck 2 · Slate', style: 'kicker', y: 410, reveal: 'rise' },
          { str: 'Slate', style: 'hero', y: 540, reveal: 'focus', revealTime: 1.7, at: 0.3 },
          { id: 'sub', str: 'Calm light for stories that aren’t space', style: 'subtitle', y: 668, reveal: 'letters', at: 1.4 }
        ],
        steps: [{
          world: WARM, timing: { ambientPreset: [2.6, 'inOutQuad'] },
          remove: ['sub'],
          text: [{ str: 'Charcoal base. Warm light. One accent.', style: 'statement', y: 690, reveal: 'rise' }],
          notes: 'The ambient preset crossfades from charcoal to ember. Nothing dips to black.'
        }],
        dwell: 4,
        notes: 'Slate is the quiet look: a charcoal field, soft moving light and one warm accent.'
      },

      /* 2 ─ The ambient world: steel light, then dusk with larger bokeh. */
      {
        id: 'light',
        world: COOL, worldTime: 2.8,
        text: [
          { str: 'The ambient world', style: 'kicker', y: 430, reveal: 'rise' },
          { str: 'Soft light, slow drift, a little bokeh.', style: 'statement', y: 535, reveal: 'letters', at: 0.4 }
        ],
        steps: [{
          world: { ambientPreset: 'dusk', bokeh: 0.85, bokehSize: 1.5, horizonGlow: 0.6 },
          timing: { ambientPreset: [2.6, 'inOutQuad'], bokehSize: [2.6, 'inOutQuad'] },
          text: [{ str: 'Dusk', style: 'label', y: 650, reveal: 'rise' }],
          notes: 'Dusk: bigger discs, a warmer horizon.'
        }],
        dwell: 4,
        notes: 'Four presets: charcoal, ember, steel, dusk. Each is a crossfade, never a cut.'
      },

      /* 3 ─ The counter element: decimals and a percent sign, then a currency prefix. */
      {
        id: 'counter',
        world: { ambientPreset: 'ember', bokeh: 0.35, horizonGlow: 0.3 }, worldTime: 2.6,
        elements: [{ kind: 'counter', id: 'big', to: 1234.5, decimals: 1, suffix: '%', style: 'mega', y: 450, countTime: 2.2 }],
        text: [{ id: 'lab', str: 'growth you can count on', style: 'statement', y: 660, reveal: 'rise', at: 1.2 }],
        steps: [{
          remove: ['big', 'lab'],
          elements: [{ kind: 'counter', id: 'money', to: 2847300, prefix: '$', style: 'hero', y: 470, countTime: 2.4 }],
          text: [{ str: 'in the first year', style: 'subtitle', y: 625, reveal: 'rise', at: 1.6 }],
          notes: 'Counters use a glyph atlas: no text is drawn per frame.'
        }],
        dwell: 4,
        notes: 'Numbers count up and settle on the exact value, formatted: 1,234.5%.'
      },

      /* 4 ─ The photo world: a slow push-in with a soft scrim; the next click dissolves to another picture. */
      {
        id: 'photo',
        world: { photo: 1, photoAsset: 'ridge', photoZoom: 1.1, photoX: 0.5, photoY: 0.62, photoDim: 0.2, bokeh: 0.2, horizonGlow: 0, ambientPreset: 'dusk' },
        worldTime: 2.6,
        timing: { photoZoom: [14, 'linear'], photo: [1.6, 'inOutQuad'], photoAsset: [0] },
        text: [
          { str: 'The photo world', style: 'kicker', y: 868, reveal: 'rise' },
          { id: 'cap', str: 'A slow push-in, a soft scrim, readable type.', style: 'statement', y: 950, reveal: 'rise', at: 0.4 }
        ],
        steps: [{
          world: { photoAsset: 'harbor', photoZoom: 1.07, photoY: 0.5 },
          timing: { photoAsset: [2.2, 'inOutQuad'], photoZoom: [14, 'linear'] },
          remove: ['cap'],
          text: [{ str: 'Pictures dissolve into each other.', style: 'statement', y: 950, reveal: 'rise' }],
          notes: 'photoAsset is a crossfade parameter: the old picture fades out as the new one fades in.'
        }],
        dwell: 5,
        notes: 'A picture behind the scene. The zoom is just a slow world tween.'
      },

      /* 5 ─ The image element: contained, rounded, with a warm glow. */
      {
        id: 'frame',
        world: { ambientPreset: 'dusk', bokeh: 0.55, horizonGlow: 0.35 }, worldTime: 2.6,
        elements: [{ kind: 'image', asset: 'harbor', x: 960, y: 470, w: 1400, h: 760, fit: 'contain', radius: 18, glow: '#ffb35c', glowSize: 56, reveal: 'focus', revealTime: 1.7 }],
        text: [{ str: 'Image · contain · rounded · glow', style: 'label', y: 940, reveal: 'rise', at: 1.0 }],
        dwell: 4,
        notes: 'The image element frames a picture inside the scene, with rounded corners and a glow.'
      },

      /* 6 ─ Every picture reveal, side by side. */
      {
        id: 'reveals',
        world: { ambientPreset: 'charcoal', bokeh: 0.4, horizonGlow: 0.2 }, worldTime: 2.4,
        elements: [
          { kind: 'image', asset: 'ridge', x: 270, y: 520, w: 400, h: 225, fit: 'cover', radius: 10, reveal: 'fade', at: 0 },
          { kind: 'image', asset: 'ridge', x: 730, y: 520, w: 400, h: 225, fit: 'cover', radius: 10, reveal: 'rise', at: 0.4 },
          { kind: 'image', asset: 'ridge', x: 1190, y: 520, w: 400, h: 225, fit: 'cover', radius: 10, reveal: 'focus', at: 0.8 },
          { kind: 'image', asset: 'ridge', x: 1650, y: 520, w: 400, h: 225, fit: 'cover', radius: 10, reveal: 'wipe', at: 1.2 }
        ],
        text: [
          { str: 'Image reveals', style: 'kicker', y: 350, reveal: 'rise' },
          { str: 'Fade', style: 'label', x: 270, y: 690, reveal: 'rise', at: 0.6 },
          { str: 'Rise', style: 'label', x: 730, y: 690, reveal: 'rise', at: 1.0 },
          { str: 'Focus', style: 'label', x: 1190, y: 690, reveal: 'rise', at: 1.4 },
          { str: 'Wipe', style: 'label', x: 1650, y: 690, reveal: 'rise', at: 1.8 }
        ],
        dwell: 4,
        notes: 'The same reveals text uses, on pictures. Particles come next.'
      },

      /* 7 ─ A transparent logo dissolves into the particle field. */
      {
        id: 'logo',
        world: W(WARM, { horizonGlow: 0.45 }), worldTime: 3,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 2.0, spread: 0.9, arc: 0.4, entry: 'void', exit: 'drift' },
        elements: [{ kind: 'image', asset: 'logo', x: 960, y: 450, w: 900, reveal: 'particles', sample: { mode: 'alpha', maxPoints: 3500 } }],
        text: [{ str: 'Cinematic decks, no server', style: 'subtitle', y: 700, reveal: 'letters', at: 2.6 }],
        dwell: 6,
        notes: 'A logo with a transparent background is sampled into at most 3,500 particles.'
      },

      /* 8 ─ The close: lights down, bars in. */
      {
        id: 'finale',
        world: W(DARK, { letterbox: 1, horizonGlow: 0.3, bokeh: 0.3 }), worldTime: 3,
        text: [
          { str: 'Built with pixeldeck', style: 'kicker', y: 420, reveal: 'rise' },
          { str: 'One engine, two looks.', style: 'title', y: 520, reveal: 'letters', revealTime: 1.8, at: 0.4 },
          { str: 'Cosmos for space. Slate for the rest.', style: 'subtitle', y: 640, reveal: 'rise', at: 1.8 }
        ],
        dwell: 5,
        notes: 'Cosmos for space stories, Slate for everything else.'
      }
    ]
  };
});
