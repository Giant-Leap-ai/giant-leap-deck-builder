/* themes/cosmos/theme.js — Cosmos: the generic cinematic look (spec §4.4). Values only.
 * Every value is today's, unchanged: fonts.display = FONT, colors = COLORS, styles = STYLES, nebulae = NEBULA_PRESETS,
 * and the motion and timing defaults that Stage.enter hard-coded. The kicker and year styles reference roles, which
 * resolve to today's literals. A factory so the shots can be composed with W: DRIFT, HORIZON and BELOW, plus one
 * shot per One Giant Leap scene holding that scene's world verbatim. New decks start from this look; One Giant Leap
 * itself does NOT extend it (decks/one-giant-leap/theme.js is a self-contained snapshot). */
PD.theme('cosmos', function (PD) {
  function W() { var o = {}; for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) o[k] = arguments[i][k]; return o; }

  // Reusable camera setups (verbatim from the One Giant Leap scenes)
  var HORIZON = {            // orbit, looking along Earth's edge toward the sun
    earth: 1, earthX: 960, earthY: 3330, earthR: 2600, earthPitch: -0.6, earthRot: 0.25, earthSpin: 0.004,
    lightX: 0.25, lightY: 0.25, lightZ: -0.93, sunX: 1330, sunY: 772
  };
  var BELOW = W(HORIZON, { earth: 0, earthY: 3900, sun: 0, sunY: 1000 });   // planet parked out of frame

  return {
    label: 'Cosmos',
    worlds: ['cosmos', 'planet', 'spark', 'photo'],
    fonts: { display: '"Avenir Next", "Avenir", "Helvetica Neue", "Segoe UI", system-ui, sans-serif' },
    colors: {
      white: '#ffffff', ice: '#d6ecff', silver: '#aab7cf', mist: '#7f8db0',
      cyan: '#5ef1ff', teal: '#2fd4c4', sky: '#53a8ff', blue: '#3d6bff', indigo: '#5b4bff',
      violet: '#8b5cf6', purple: '#b04dff', magenta: '#ff4fd8', rose: '#ff6b9a',
      red: '#ff4d5e', orange: '#ff8a3d', amber: '#ffb347', gold: '#ffd27a', sun: '#fff1c9',
      lime: '#b6ff6b', green: '#3ee08f'
    },
    roles: {
      accent: '#ffd27a', accentGlow: '#ff9a3d',
      future: ['#fff1c9', '#ffb347'], futureGlow: '#ff8a3d',
      past: ['#dfe6f2', '#8c9bb6'], pastGlow: '#5a6b8a'
    },
    styles: {
      mega:      { weight: 700, size: 210, track: 0.06, upper: true, fill: ['#ffffff', '#bfe6ff'], glow: '#4fb8ff', glowSize: 50, glowAlpha: 0.55, push: 0.025 },
      hero:      { weight: 700, size: 148, track: 0.14, upper: true, fill: ['#ffffff', '#c6ecff'], glow: '#4fb8ff', glowSize: 44, glowAlpha: 0.5, push: 0.02 },
      title:     { weight: 600, size: 86, track: 0.12, upper: true, fill: ['#ffffff', '#d9ecff'], glow: '#6aa8ff', glowSize: 30, glowAlpha: 0.38, push: 0.015 },
      statement: { weight: 500, size: 64, track: 0.015, fill: '#f3f6ff', glow: '#8fb8ff', glowSize: 26, glowAlpha: 0.22, lineHeight: 1.25, maxWidth: 1500, push: 0.012 },
      subtitle:  { weight: 500, size: 32, track: 0.45, upper: true, fill: '#a8ecff', glow: '#2fb8ff', glowSize: 16, glowAlpha: 0.5 },
      kicker:    { weight: 600, size: 22, track: 0.6, upper: true, fill: '@accent', glow: '@accentGlow', glowSize: 14, glowAlpha: 0.55 },
      body:      { weight: 500, size: 40, track: 0.01, fill: '#e6edfb', lineHeight: 1.45, maxWidth: 1300, glow: '#6aa8ff', glowSize: 10, glowAlpha: 0.12 },
      year:      { weight: 700, size: 40, track: 0.08, fill: '@future', glow: '@futureGlow', glowSize: 18, glowAlpha: 0.6 },
      label:     { weight: 600, size: 22, track: 0.32, upper: true, fill: '#ffffff', glow: '#8fb8ff', glowSize: 10, glowAlpha: 0.3 },
      caption:   { weight: 500, size: 20, track: 0.3, upper: true, fill: '#9fb0cf' }
    },
    nebulae: {
      aurora: ['#1b3cff', '#18e0c8', '#8b5cf6'],
      cosmic: ['#ff3fb4', '#6a2cff', '#2bb8ff'],
      violet: ['#4b2bff', '#c04dff', '#ff6fb1'],
      dawn:   ['#ff7a3d', '#ff3f8e', '#6a2cff'],
      deep:   ['#1b2cff', '#3fa8ff', '#0f8fa8'],
      ember:  ['#ff5a1f', '#ffb347', '#b0207a']
    },
    world: {},
    motion: { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' },
    timing: {
      worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
      settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9
    },
    shots: {
      DRIFT: {},
      HORIZON: HORIZON,
      BELOW: BELOW,
      SPARK: { stars: 0.12, nebulaAmount: 0, backdrop: 0, dust: 0, speed: 3, spark: 1, vignette: 0.9, grain: 0.07 },
      BLOOM: { stars: 1, nebula: 'aurora', nebulaAmount: 0.85, backdrop: 0.8, dust: 0.45, speed: 22, spark: 0, vignette: 0.6 },
      HYPERSPACE: { speed: 5200, warp: 1, warpColor: 'cyan', nebula: 'cosmic', nebulaAmount: 1, backdrop: 0.35, letterbox: 1, roll: 0.12, shake: 0.22, dust: 0, vignette: 0.85 },
      GALAXY: W(BELOW, {
        speed: 30, warp: 0, galaxy: 0.9, galaxyX: 1400, galaxyY: 500, galaxyScale: 1.0, galaxyTilt: 0.42,
        nebula: 'violet', nebulaAmount: 0.4, backdrop: 0.45, letterbox: 1, roll: -0.05, shake: 0, dust: 0.25,
        earth: 0, earthX: 520, earthY: 700, earthR: 8, earthPitch: 0.35, earthRot: -1.2, lightX: -0.75, lightY: 0.4, lightZ: 0.55, sunY: 1000
      }),
      HOME: W(BELOW, {
        galaxy: 0, earth: 1, earthX: 960, earthY: 540, earthR: 350, earthPitch: 0.32, earthRot: -1.1, earthSpin: 0.05,
        lightX: -0.75, lightY: 0.4, lightZ: 0.55, speed: 60, nebula: 'deep', nebulaAmount: 0.5, backdrop: 0.6, letterbox: 0, roll: 0, sunY: 1000
      }),
      SUNRISE: W(HORIZON, { sun: 1, sunScale: 1.1, speed: 8, nebula: 'dawn', nebulaAmount: 0.3, backdrop: 0.35, letterbox: 1, dust: 0.2, vignette: 0.7 }),
      LEAPS: W(HORIZON, { earthY: 3640, sun: 0.45, sunY: 1050, speed: 10, nebula: 'deep', nebulaAmount: 0.35, backdrop: 0.4, letterbox: 0, dust: 0.25 }),
      BOX: W(BELOW, { sparkX: 640, sparkY: 520, nebula: 'aurora', nebulaAmount: 0.5, backdrop: 0.6, speed: 12, letterbox: 0, dust: 0.3 }),
      PIVOT: W(BELOW, { nebula: 'dawn', nebulaAmount: 0.55, backdrop: 0.65, speed: 14, dust: 0.35 }),
      FINALE: W(HORIZON, { sun: 1, sunScale: 1.35, sunY: 735, speed: 10, nebula: 'dawn', nebulaAmount: 0.35, backdrop: 0.4, letterbox: 1, dust: 0.3 })
    },
    ui: { accent: '#ef7d57' }
  };
});
