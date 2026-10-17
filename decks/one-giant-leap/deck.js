/* decks/one-giant-leap/deck.js — the cinematic talk, as a deck factory (spec §4.2, §8.2 M5). Edit this file to author.
 * Design space is 1920 x 1080. Text y = vertical CENTER of the text block.
 * Each slide sets `world` (the camera/universe), `text` layers, `particles` (shapes for the glowing field) and
 * optional `steps` (extra clicks). See README.md in this folder for every option.
 *
 * PD.deck(id, factory): the engine calls factory(PD, h) once per page (PD.compile) and gets the DeckSource back.
 * Every helper and every scene value is verbatim from the pre-v2 scenes.js; only U and col now come from h (col is
 * bound to this deck's theme, decks/one-giant-leap/theme.js, whose colours are the same values). The scenes are raw
 * scenes, so the engine uses these very objects (no copies). Each scene also carries its story metadata from spec
 * §6.10 (beat, like = the template it plays, energy); the renderer ignores those fields. */
PD.deck('one-giant-leap', function (PD, h) {
  var U = h.U, col = h.col;
  function W() { var o = {}; for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) o[k] = arguments[i][k]; return o; }

  // Reusable camera setups ---------------------------------------------------
  var HORIZON = {            // orbit, looking along Earth's edge toward the sun
    earth: 1, earthX: 960, earthY: 3330, earthR: 2600, earthPitch: -0.6, earthRot: 0.25, earthSpin: 0.004,
    lightX: 0.25, lightY: 0.25, lightZ: -0.93, sunX: 1330, sunY: 772
  };
  var BELOW = W(HORIZON, { earth: 0, earthY: 3900, sun: 0, sunY: 1000 });   // planet parked out of frame

  // The ascending curve of human progress (used by the timeline scene) -------
  function curveXY(u) { return { x: 170 + u * 1580, y: 860 - 590 * Math.pow(u, 2.3) }; }
  function curvePoints() {
    var pts = [];
    for (var i = 0; i <= 420; i++) {
      var u = i / 420, p = curveXY(u);
      var c = U.mix(col('teal'), col('gold'), u);
      pts.push({ x: p.x, y: p.y, color: '#' + c.map(function (v) { return ('0' + (v | 0).toString(16)).slice(-2); }).join(''), s: 6, a: 0.75 });
    }
    return pts;
  }
  function nodePoints(u, color) {
    var p = curveXY(u), pts = [];
    for (var i = 0; i < 22; i++) { var a = i / 22 * Math.PI * 2; pts.push({ x: p.x + Math.cos(a) * 15, y: p.y + Math.sin(a) * 15, s: 6, color: color }); }
    pts.push({ x: p.x, y: p.y, s: 22, color: '#ffffff' });
    return pts;
  }
  function leap(u, year, label, pos, color) {
    // pos: 'above' | 'below' | 'left' — where the year/label sit relative to the node
    var p = curveXY(u), tx = p.x, ty, align = 'center';
    if (pos === 'left') { tx = p.x - 40; ty = p.y - 6; align = 'right'; }
    else if (pos === 'below') ty = p.y + 74;
    else ty = p.y - 88;
    return {
      particles: [{ shape: 'points', points: nodePoints(u, color || '#ffd27a') }],
      text: [
        { str: year, style: 'year', x: tx, y: ty - 18, align: align, reveal: 'rise' },
        { str: label, style: 'label', x: tx, y: ty + 26, align: align, reveal: 'rise', at: 0.15 }
      ]
    };
  }

  return {
    format: 2,
    id: 'one-giant-leap',
    meta: {
      title: 'One Giant Leap',
      subtitle: 'Making work more human',
      theme: 'one-giant-leap',
      generator: 'hand',
      story: {                       // spec §6.1, values from §6.10 (the OGL calibration fixture)
        framework: 'giant-leap', goal: 'inspire', tone: 'cinematic',
        audience: '', targetMin: null,
        bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
        shortIdea: 'Augmentation, not automation',
        oldWay: 'automation', newWay: 'augmentation', ask: '',
        proof: [],
        brand: 'One Giant Leap', tagline: 'Making work more human'
      }
    },
    scenes: [
      /* 1 ─ Cold open: a single spark in the dark. */
      {
        id: 'spark', beat: 'spark', like: 'cold-open', energy: 2,   // story metadata (spec §6.10), not rendered
        world: { stars: 0.12, nebulaAmount: 0, backdrop: 0, dust: 0, speed: 3, spark: 1, vignette: 0.9, grain: 0.07 },
        worldTime: 3,
        particles: [{ shape: 'spark', id: 'spark', count: 700, radius: 40 }],
        motion: { entry: 'spark', dur: 2.4, spread: 1.8, ease: 'easeOutCubic', arc: 0.8 },
        text: [{ str: 'Every giant leap begins with a single spark.', style: 'statement', y: 820, reveal: 'letters', revealTime: 2.4, at: 1.8 }],
        dwell: 6,
        notes: 'Lights down. Let the spark breathe for a few seconds before you speak.'
      },

      /* 2 ─ The spark bursts into the brand; the cosmos blooms in. */
      {
        id: 'title', beat: 'name', like: 'brand-reveal', energy: 4,   // story metadata (spec §6.10), not rendered
        world: { stars: 1, nebula: 'aurora', nebulaAmount: 0.85, backdrop: 0.8, dust: 0.45, speed: 22, spark: 0, vignette: 0.6 },
        worldTime: 3.5,
        timing: { spark: [0.6, 'outQuad'] },
        cues: [{ at: 0.35, flash: 0.32 }],
        textDelay: 0.25,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 1.9, spread: 0.8, arc: 0.35, entry: 'spark', exit: 'drift' },
        text: [
          { id: 'brand', str: 'One Giant Leap', style: 'hero', y: 470, reveal: 'particles' },
          { str: 'Making work more human', style: 'subtitle', y: 610, reveal: 'letters', at: 2.6 }
        ],
        dwell: 6,
        notes: 'Introduce yourself and One Giant Leap. "Today I want to take you on a short trip."'
      },

      /* 3 ─ Hyperspace. */
      {
        id: 'warp', beat: 'zoom-out', like: 'hyperspace', energy: 5,   // story metadata (spec §6.10), not rendered
        world: { speed: 5200, warp: 1, warpColor: 'cyan', nebula: 'cosmic', nebulaAmount: 1, backdrop: 0.35, letterbox: 1, roll: 0.12, shake: 0.22, dust: 0, vignette: 0.85 },
        timing: {
          speed: [3.2, 'inQuart'], warp: [2.6, 'inCubic'], roll: [6, 'inOutQuad'], shake: [2.4, 'inQuad', 1.2],
          letterbox: [1.6, 'inOutCubic'], nebulaAmount: [3, 'inQuad'], backdrop: [2, 'inOutQuad']
        },
        cues: [{ at: 3.0, flash: 0.5 }],
        motion: { exit: 'warp' },
        text: [{ id: 'w1', str: '13.8 billion years', style: 'title', y: 540, reveal: 'focus', at: 3.1 }],
        steps: [
          { remove: ['w1'], textDelay: 0.6, text: [{ str: 'Hundreds of billions of galaxies', style: 'title', size: 68, y: 540, reveal: 'focus' }],
            notes: 'Let the scale land.' }
        ],
        dwell: 4,
        notes: 'Hold on. "Let\'s zoom out — way out." Click once the stars are streaking.'
      },

      /* 4 ─ Drop out of warp in front of a galaxy. The pale blue dot. */
      {
        id: 'galaxy', beat: 'you-are-here', like: 'galaxy-reveal', energy: 3,   // story metadata (spec §6.10), not rendered
        world: W(BELOW, {
          speed: 30, warp: 0, galaxy: 0.9, galaxyX: 1400, galaxyY: 500, galaxyScale: 1.0, galaxyTilt: 0.42,
          nebula: 'violet', nebulaAmount: 0.4, backdrop: 0.45, letterbox: 1, roll: -0.05, shake: 0, dust: 0.25,
          earth: 0, earthX: 520, earthY: 700, earthR: 8, earthPitch: 0.35, earthRot: -1.2, lightX: -0.75, lightY: 0.4, lightZ: 0.55, sunY: 1000
        }),
        timing: { speed: [2.2, 'outCubic'], warp: [1.4, 'outCubic'], galaxy: [3.5, 'inOutQuad', 0.4], shake: [0.8, 'outQuad'], roll: [5, 'inOutQuad'] },
        cues: [{ at: 0, flash: 0.45 }],
        text: [
          { str: 'Somewhere in all of this', style: 'kicker', x: 220, y: 430, align: 'left', at: 1.8 },
          { str: 'there is one small, blue world.', style: 'statement', x: 220, y: 500, align: 'left', at: 2.4, reveal: 'letters' }
        ],
        steps: [
          { world: { earth: 1 }, timing: { earth: [1.5, 'inOutQuad'] },
            particles: [{ shape: 'points', points: function () {
              var p = []; for (var i = 0; i < 40; i++) { var a = i / 40 * Math.PI * 2; p.push({ x: 520 + Math.cos(a) * 30, y: 700 + Math.sin(a) * 30, s: 5, a: 0.7, color: '#7fd4ff' }); } return p; } }],
            text: [{ str: 'You are here', style: 'caption', x: 520, y: 760, reveal: 'fade', at: 0.6 }],
            notes: 'The pale blue dot. Pause.' }
        ],
        dwell: 5,
        notes: 'Out of warp. Let the galaxy turn. "Somewhere in all of this…"'
      },

      /* 5 ─ Fly home: the dot becomes the Earth. */
      {
        id: 'home', beat: 'you-are-here', like: 'planet', energy: 2,   // story metadata (spec §6.10), not rendered
        world: W(BELOW, {
          galaxy: 0, earth: 1, earthX: 960, earthY: 540, earthR: 350, earthPitch: 0.32, earthRot: -1.1, earthSpin: 0.05,
          lightX: -0.75, lightY: 0.4, lightZ: 0.55, speed: 60, nebula: 'deep', nebulaAmount: 0.5, backdrop: 0.6, letterbox: 0, roll: 0, sunY: 1000
        }),
        timing: { earthR: [5, 'inOutCubic'], earthX: [5, 'inOutCubic'], earthY: [5, 'inOutCubic'], galaxy: [2.5, 'inQuad'], speed: [5, 'inOutQuad'], letterbox: [3, 'inOutCubic', 2.5] },
        text: [
          { str: 'Third planet from the sun', style: 'kicker', y: 120, at: 4.2 },
          { str: 'Home to the most restless minds we know of.', style: 'statement', y: 975, at: 4.8, reveal: 'letters' }
        ],
        dwell: 6,
        notes: 'Bring it back to Earth — literally. "And on this planet lives a species that never stays put."'
      },

      /* 6 ─ Sunrise over the edge of the world. */
      {
        id: 'sunrise', beat: 'human-truth', like: 'sunrise', energy: 4,   // story metadata (spec §6.10), not rendered
        world: W(HORIZON, { sun: 1, sunScale: 1.1, speed: 8, nebula: 'dawn', nebulaAmount: 0.3, backdrop: 0.35, letterbox: 1, dust: 0.2, vignette: 0.7 }),
        worldTime: 5,
        timing: { sun: [3.5, 'inOutQuad', 2.6], sunY: [5, 'outCubic', 1.8], letterbox: [2, 'inOutCubic'], nebula: [4],
          lightX: [2.4, 'inOutQuad'], lightY: [2.4, 'inOutQuad'], lightZ: [2.4, 'inOutQuad'], earthPitch: [4, 'inOutCubic'] },
        text: [
          { str: 'For 300,000 years', style: 'kicker', y: 300, at: 4.4 },
          { str: 'we have thought outside the box.', style: 'statement', size: 78, y: 382, at: 5.0, reveal: 'letters' }
        ],
        dwell: 7,
        notes: 'The sunrise is the emotional beat. Say nothing until the sun clears the horizon.'
      },

      /* 7 ─ A short history of leaps. Each click lights a milestone. */
      {
        id: 'leaps', beat: 'pattern', like: 'timeline', energy: 3,   // story metadata (spec §6.10), not rendered
        world: W(HORIZON, { earthY: 3640, sun: 0.45, sunY: 1050, speed: 10, nebula: 'deep', nebulaAmount: 0.35, backdrop: 0.4, letterbox: 0, dust: 0.25 }),
        worldTime: 2.5,
        motion: { stagger: 'leftToRight', dur: 1.4, spread: 1.6, ease: 'easeInOutCubic', arc: 0.15, entry: 'void', exit: 'drift' },
        particles: [{ id: 'curve', shape: 'points', points: curvePoints }],
        text: [
          { str: 'A short history of', style: 'kicker', x: 160, y: 150, align: 'left' },
          { str: 'Thinking outside the box', style: 'statement', x: 160, y: 215, align: 'left', at: 0.3 }
        ],
        steps: [
          W(leap(0.04, '~1,000,000 BCE', 'Fire', 'above'), { notes: 'Fire: we stopped waiting for the sun.' }),
          W(leap(0.22, '3500 BCE', 'The wheel', 'below'), { notes: 'The wheel.' }),
          W(leap(0.43, '1440', 'The printing press', 'below'), { notes: 'Ideas stopped being scarce.' }),
          W(leap(0.6, '1903', 'First flight', 'left'), { notes: 'Twelve seconds that changed everything.' }),
          W(leap(0.74, '1969', 'The Moon', 'left'), { notes: 'One giant leap.' }),
          W(leap(0.86, '1989', 'The World Wide Web', 'left'), { notes: 'Knowledge for everyone.' }),
          W(leap(0.975, 'Now', 'The next leap', 'left', '#ff8a3d'), { notes: 'And now: the next one is ours to make.' })
        ],
        dwell: 3,
        notes: 'Each click is a leap. Notice the curve keeps getting steeper.'
      },

      /* 8 ─ The box. Then the ideas escape it. */
      {
        id: 'box', beat: 'the-box', like: 'the-box', energy: 3,   // story metadata (spec §6.10), not rendered
        world: W(BELOW, { sparkX: 640, sparkY: 520, nebula: 'aurora', nebulaAmount: 0.5, backdrop: 0.6, speed: 12, letterbox: 0, dust: 0.3 }),
        worldTime: 2.4,
        motion: { entry: 'void', exit: 'drift', dur: 1.8, spread: 1.0, arc: 0.35 },
        particles: [
          { shape: 'cube', id: 'cube', x: 640, y: 520, size: 200, perEdge: 40, color: 'cyan', color2: 'violet', spin: 0.22 },
          { shape: 'swarm', id: 'swarm', inside: 'cube', count: 420 }
        ],
        text: [{ id: 'boxText', str: "Every breakthrough began as an idea that didn't fit.", style: 'statement', x: 1060, y: 520, align: 'left', maxWidth: 720, at: 1.0, reveal: 'letters' }],
        steps: [
          {
            remove: ['swarm', 'boxText'],
            motion: { stagger: 'leftToRight', dur: 2.0, spread: 0.9, ease: 'easeInOutCubic', arc: 0.5, entry: 'spark' },
            text: [
              { str: 'Outside', style: 'hero', x: 1380, y: 500, reveal: 'particles', color: ['#fff1c9', '#ffb347'], glow: '#ff8a3d' },
              { str: 'is where the future lives', style: 'subtitle', x: 1380, y: 610, at: 2.6, color: '#ffd27a' }
            ],
            notes: 'Click: the ideas escape the box.'
          }
        ],
        dwell: 4,
        notes: 'Every leap we just saw started as an idea that did not fit inside the existing box.'
      },

      /* 9 ─ The next leap. */
      {
        id: 'next', beat: 'the-leap', like: 'pivot', energy: 5,   // story metadata (spec §6.10), not rendered
        world: W(BELOW, { nebula: 'dawn', nebulaAmount: 0.55, backdrop: 0.65, speed: 14, dust: 0.35 }),
        worldTime: 2.4,
        motion: { stagger: 'leftToRight', dur: 1.8, spread: 0.9, ease: 'easeInOutCubic', arc: 0.3, entry: 'void', exit: 'drift' },
        text: [
          { str: 'The next leap', style: 'kicker', y: 360 },
          { id: 'auto', str: 'Not automation.', style: 'hero', size: 118, y: 520, reveal: 'particles', color: ['#dfe6f2', '#8c9bb6'], glow: '#5a6b8a', glowAlpha: 0.35 }
        ],
        steps: [
          {
            remove: ['auto'],
            motion: { stagger: 'leftToRight', dur: 1.9, spread: 0.8, ease: 'easeInOutCubic', arc: 0.45, entry: 'void' },
            text: [
              { str: 'Augmentation.', style: 'hero', size: 118, y: 520, reveal: 'particles', color: ['#fff1c9', '#ffb347'], glow: '#ff8a3d' },
              { str: 'Technology that makes work more human', style: 'subtitle', y: 650, at: 2.6, color: '#ffd27a' }
            ],
            notes: 'The pivot: augmentation, not automation.'
          }
        ],
        dwell: 4,
        notes: 'So what is the next leap?'
      },

      /* 10 ─ Finale: back to the sunrise. */
      {
        id: 'thanks', beat: 'callback', like: 'finale', energy: 4,   // story metadata (spec §6.10), not rendered
        world: W(HORIZON, { sun: 1, sunScale: 1.35, sunY: 735, speed: 10, nebula: 'dawn', nebulaAmount: 0.35, backdrop: 0.4, letterbox: 1, dust: 0.3 }),
        worldTime: 4,
        timing: { sun: [3, 'inOutQuad', 1], sunY: [5, 'outCubic', 0.5] },
        prelude: 'explode', preludeTime: 0.8, explodePower: 1.1,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 2.0, spread: 0.9, arc: 0.4, entry: 'void', exit: 'drift' },
        text: [
          { str: 'One Giant Leap', style: 'hero', y: 380, reveal: 'particles' },
          { str: 'Thank you', style: 'subtitle', y: 500, at: 2.8 }
        ],
        dwell: 7,
        notes: 'Thank the room. Leave this up for Q&A.'
      }
    ]
  };
});
