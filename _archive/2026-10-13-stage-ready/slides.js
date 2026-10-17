/* ============================================================================
 *  slides.js — THE talk. This is the only file you need to edit.
 *  See README.md for every option. Coordinates are grid cells: 320 x 180.
 *  Text: { str, scale 1|2|3, x?, y, align, maxWidth, color, shadow, at }
 *  Sprite x,y is the TOP-LEFT of its 24x30 frame (feet are ~27 cells below y).
 * ========================================================================== */

// A tiny embedded pixel-grid logo: a moon with a flag planted on it.
var LOGO_MOON = [
  '......woo......',
  '......wooo.....',
  '......wo.......',
  '......w........',
  '....kkwkkk.....',
  '..kkgggwgggkk..',
  '.kgggaaggggggk.',
  'kgggaaagggaaggk',
  'kggggaggggaaggk',
  'kgggggggggggggk'
];

DECK = [
  /* 1 ─ Title: pixels stream in from the stars; the astronaut floats in. */
  {
    id: 'title',
    transition: 'morph', stagger: 'radial', entry: 'stars', bg: 'starfield',
    duration: 1.6, staggerTime: 1.6, arc: 0.35, breathe: true,
    text: [
      { str: 'ONE GIANT LEAP', scale: 3, y: 46, color: 'white', shadow: 'navy' },
      { str: 'MAKING WORK MORE HUMAN', scale: 1, y: 78, color: 'cyan', at: 1.4 }
    ],
    shapes: [
      { type: 'circle', x: 160, y: 420, r: 262, color: 'gray', at: 0.6 }   // curved moon horizon
    ],
    sprites: [
      { id: 'astro', anim: 'float', from: [-34, 132], to: [196, 104], path: 'arc', height: 26, dur: 3.4, at: 1.2,
        ease: 'easeOutCubic' }
    ],
    dwell: 6,
    notes: 'Open with the leap story. Pause while the astronaut drifts in — let the room settle.'
  },

  /* 2 ─ The astronaut walks on, jumps, and on landing bursts into the word. */
  {
    id: 'leap',
    transition: 'morph', exit: 'fall', stagger: 'byLetter', entry: 'fromSprite:astro',
    duration: 1.1, staggerTime: 0.8, ease: 'easeOutBack', arc: 0.4,
    shapes: [
      { type: 'line', x1: 0, y1: 157, x2: 319, y2: 157, color: 'gray' }
    ],
    sprites: [
      { id: 'astro', from: [-26, 128],
        moves: [
          { to: [92, 128], dur: 1.9, anim: 'walk', ease: 'linear' },
          { to: [148, 128], dur: 1.1, anim: 'jump', path: 'jump', height: 40 }
        ],
        dissolve: true }
    ],
    text: [
      { str: 'AUTOMATION', scale: 3, y: 64, color: 'orange', shadow: 'plum', at: 3.25 }
    ],
    dwell: 6.5,
    notes: 'For a decade we pointed technology at one goal: take the human out of the loop. Watch what happens when we jump.'
  },

  /* 3 ─ AUTOMATION → AUGMENTATION, then highlight "AUG". */
  {
    id: 'augment',
    transition: 'morph', stagger: 'byLetter', duration: 1.0, staggerTime: 1.0, exit: 'scatter',
    text: [
      { str: 'AUGMENTATION', scale: 3, y: 64, color: 'orange', shadow: 'plum' },
      { str: 'NOT REPLACING PEOPLE. AMPLIFYING THEM.', scale: 1, y: 98, color: 'silver', at: 1.3 }
    ],
    shapes: [
      { type: 'line', x1: 0, y1: 157, x2: 319, y2: 157, color: 'gray' }
    ],
    steps: [
      {
        highlight: { match: 'AUG', color: 'cyan' },
        stagger: 'byLetter', staggerTime: 0.3, entry: 'left',
        sprites: [{ id: 'astro', x: 24, y: 59, anim: 'point', assemble: true }],
        notes: 'AUG — augment. Same letters, different intent.'
      }
    ],
    dwell: 4,
    notes: 'Swap a few letters and the whole philosophy changes.'
  },

  /* 4 ─ A bar chart grows from its baseline, then the bars become the headline. */
  {
    id: 'chart',
    transition: 'morph', stagger: 'bottomUp', entry: 'base', exit: 'scatter',
    duration: 0.45, staggerTime: 1.5, ease: 'easeOutCubic', arc: 0,
    text: [
      { str: 'TIME TO VALUE', scale: 2, y: 14, color: 'white' }
    ],
    shapes: [
      { id: 'bars', type: 'bars', values: [12, 30, 55, 80], y: 150, h: 92, barWidth: 22, gap: 12,
        colors: ['gray', 'teal', 'sky', 'cyan'], labelColor: 'silver', axis: false, at: 0.5 },
      { type: 'line', x1: 30, y1: 150, x2: 290, y2: 150, color: 'gray' }
    ],
    sprites: [
      { id: 'astro', x: 46, y: 123, anim: 'idle', at: 0.3, assemble: true }
    ],
    steps: [
      {
        remove: ['bars'],
        text: [
          { str: '4X FASTER', scale: 3, y: 62, color: 'lime', shadow: 'green' },
          { str: 'FROM IDEA TO IMPACT', scale: 1, y: 94, color: 'silver', at: 1.0 }
        ],
        stagger: 'leftToRight', entry: 'edges', duration: 1.2, staggerTime: 0.7, ease: 'easeInOutCubic', arc: 0.3,
        sprites: [{ id: 'astro', moves: [{ to: [46, 123], path: 'jump', height: 18, dur: 0.9, anim: 'jump' }], endAnim: 'idle' }],
        notes: 'Land the number. Then stop talking for a beat.'
      }
    ],
    dwell: 4.5,
    notes: 'Teams that augment instead of automate reach value faster. Let the bars grow before speaking.'
  },

  /* 5 ─ A plain, readable text slide with a quick dissolve. */
  {
    id: 'principles',
    transition: 'dissolve', twinkle: false,
    text: [
      { str: 'WHAT CHANGES', scale: 2, x: 24, y: 26, align: 'left', color: 'yellow' },
      { str: '>', x: 24, y: 64, align: 'left', color: 'orange' },
      { str: 'PEOPLE SPEND TIME ON JUDGMENT, NOT TYPING.', x: 34, y: 64, align: 'left', color: 'white' },
      { str: '>', x: 24, y: 82, align: 'left', color: 'orange' },
      { str: 'TEAMS SHIP IN DAYS INSTEAD OF QUARTERS.', x: 34, y: 82, align: 'left', color: 'white' },
      { str: '>', x: 24, y: 100, align: 'left', color: 'orange' },
      { str: 'EVERY TOOL MAKES SOMEONE BETTER AT WORK.', x: 34, y: 100, align: 'left', color: 'white' }
    ],
    shapes: [
      { type: 'rect', x: 24, y: 46, w: 40, h: 2, color: 'orange' }
    ],
    images: [
      { grid: LOGO_MOON, x: 268, y: 136, scale: 2 }
    ],
    dwell: 5,
    notes: 'Three principles. Read them slowly — this slide is the takeaway.'
  },

  /* 6 ─ Finale: everything explodes outward and re-forms; the astronaut waves. */
  {
    id: 'thanks',
    transition: 'morph', prelude: 'explode', preludeTime: 0.9, explodePower: 1.2,
    stagger: 'radial', ease: 'easeOutBack', duration: 1.3, staggerTime: 1.0, entry: 'edges', exit: 'swirl',
    arc: 0.3, breathe: true,
    text: [
      { str: 'THANK YOU', scale: 3, y: 44, color: 'white', shadow: 'navy' },
      { str: "QUESTIONS? LET'S TALK.", scale: 1, y: 76, color: 'orange', at: 0.8 }
    ],
    sprites: [
      { id: 'astro', x: 148, y: 100, anim: 'wave', assemble: true, at: 0.5 }
    ],
    dwell: 6,
    notes: 'Thank the room. Leave this up during Q&A.'
  }
];
