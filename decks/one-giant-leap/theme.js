/* decks/one-giant-leap/theme.js — the One Giant Leap look: a SELF-CONTAINED literal snapshot (spec §4.4, P6).
 * It does not extend cosmos, so later work on the generic look can never change this deck. Every value is the
 * deck's value on 2026-10-13: fonts.display = FONT, colors = COLORS, styles = STYLES, nebulae = NEBULA_PRESETS,
 * world = WORLD_DEFAULTS (pinned here, so a change to an engine default cannot reach this deck either), and the
 * motion and timing defaults that Stage.enter hard-coded. No roles, no shots. Values only (export writes it as JSON). */
PD.theme('one-giant-leap', {
  label: 'One Giant Leap',
  worlds: ['cosmos', 'planet', 'spark'],
  fonts: { display: '"Avenir Next", "Avenir", "Helvetica Neue", "Segoe UI", system-ui, sans-serif' },
  colors: {
    white: '#ffffff', ice: '#d6ecff', silver: '#aab7cf', mist: '#7f8db0',
    cyan: '#5ef1ff', teal: '#2fd4c4', sky: '#53a8ff', blue: '#3d6bff', indigo: '#5b4bff',
    violet: '#8b5cf6', purple: '#b04dff', magenta: '#ff4fd8', rose: '#ff6b9a',
    red: '#ff4d5e', orange: '#ff8a3d', amber: '#ffb347', gold: '#ffd27a', sun: '#fff1c9',
    lime: '#b6ff6b', green: '#3ee08f'
  },
  styles: {
    mega:      { weight: 700, size: 210, track: 0.06, upper: true, fill: ['#ffffff', '#bfe6ff'], glow: '#4fb8ff', glowSize: 50, glowAlpha: 0.55, push: 0.025 },
    hero:      { weight: 700, size: 148, track: 0.14, upper: true, fill: ['#ffffff', '#c6ecff'], glow: '#4fb8ff', glowSize: 44, glowAlpha: 0.5, push: 0.02 },
    title:     { weight: 600, size: 86, track: 0.12, upper: true, fill: ['#ffffff', '#d9ecff'], glow: '#6aa8ff', glowSize: 30, glowAlpha: 0.38, push: 0.015 },
    statement: { weight: 500, size: 64, track: 0.015, fill: '#f3f6ff', glow: '#8fb8ff', glowSize: 26, glowAlpha: 0.22, lineHeight: 1.25, maxWidth: 1500, push: 0.012 },
    subtitle:  { weight: 500, size: 32, track: 0.45, upper: true, fill: '#a8ecff', glow: '#2fb8ff', glowSize: 16, glowAlpha: 0.5 },
    kicker:    { weight: 600, size: 22, track: 0.6, upper: true, fill: '#ffd27a', glow: '#ff9a3d', glowSize: 14, glowAlpha: 0.55 },
    body:      { weight: 500, size: 40, track: 0.01, fill: '#e6edfb', lineHeight: 1.45, maxWidth: 1300, glow: '#6aa8ff', glowSize: 10, glowAlpha: 0.12 },
    year:      { weight: 700, size: 40, track: 0.08, fill: ['#fff1c9', '#ffb347'], glow: '#ff8a3d', glowSize: 18, glowAlpha: 0.6 },
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
  world: {
    speed: 16, warp: 0, warpColor: 'cyan', stars: 1, roll: 0, shake: 0,
    nebula: 'aurora', nebulaAmount: 0.75, backdrop: 0.75,
    galaxy: 0, galaxyX: 1250, galaxyY: 520, galaxyScale: 1, galaxyTilt: 0.42,
    earth: 0, earthX: 960, earthY: 540, earthR: 380, earthPitch: 0.35, earthRot: -1.2, earthSpin: 0.02,
    lightX: -0.7, lightY: 0.35, lightZ: 0.62,
    sun: 0, sunX: 1500, sunY: 260, sunScale: 1,
    letterbox: 0, exposure: 1, vignette: 0.6, grain: 0.05, dust: 0.35, particles: 1,
    spark: 0, sparkX: 960, sparkY: 540
  },
  motion: { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' },
  timing: {
    worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
    settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9
  },
  ui: { accent: '#ef7d57' }
});
