/* themes/slate/theme.js — Slate: the non-space look (spec §4.4). Values only.
 * Charcoal and warm light instead of stars and nebulae: the ambient world (soft gradient blobs, a slow beam, bokeh
 * and a horizon glow, engine/worlds/ambient.js) sits behind a quiet system-font typography, with one warm accent.
 * The numbers follow the spec: the text styles are cosmos' styles with glowAlpha x 0.3, glowSize x 0.6 and the hero
 * and title tracking x 0.7 (written as the products, so they equal cosmos' values times the factor exactly); only the
 * fill and glow COLOURS are retuned, from cosmos' icy white-blue to warm paper and amber (a deviation from the letter of
 * §4.4 that AMEND-11 accepts as it is: cosmos' cyan subtitles and blue halos clash with the warm light). Weights, sizes,
 * line heights, widths and pushes are cosmos' own, so a template laid out for one look measures the same in the other.
 * Self-contained (no `extends`): later work on cosmos can never change this look. The named colours keep cosmos' names
 * and values, so templates that say 'gold' or 'teal' work under both looks.
 * Shots (spec §4.4): DRIFT (the calm default), WARM (ember light), COOL (steel light), DARK (nearly lights-out). */
PD.theme('slate', {
  label: 'Slate',
  worlds: ['ambient', 'photo', 'spark'],
  fonts: { display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Segoe UI", Roboto, Arial, system-ui, sans-serif' },
  colors: {
    white: '#ffffff', ice: '#d6ecff', silver: '#aab7cf', mist: '#7f8db0',
    cyan: '#5ef1ff', teal: '#2fd4c4', sky: '#53a8ff', blue: '#3d6bff', indigo: '#5b4bff',
    violet: '#8b5cf6', purple: '#b04dff', magenta: '#ff4fd8', rose: '#ff6b9a',
    red: '#ff4d5e', orange: '#ff8a3d', amber: '#ffb347', gold: '#ffd27a', sun: '#fff1c9',
    lime: '#b6ff6b', green: '#3ee08f',
    paper: '#f6f2ec', brass: '#ffb35c', smoke: '#a9a398', charcoal: '#121318'
  },
  roles: {
    accent: '#ffb35c', accentGlow: '#ff8f3a',
    future: ['#ffe7c2', '#ffb35c'], futureGlow: '#ff8a3d',
    past: ['#d8dce6', '#8993a8'], pastGlow: '#4a5368'
  },
  styles: {
    mega:      { weight: 700, size: 210, track: 0.06, upper: true, fill: ['#ffffff', '#ebe0d0'], glow: '#ffb35c', glowSize: 50 * 0.6, glowAlpha: 0.55 * 0.3, push: 0.025 },
    hero:      { weight: 700, size: 148, track: 0.14 * 0.7, upper: true, fill: ['#ffffff', '#efe6d9'], glow: '#ffb35c', glowSize: 44 * 0.6, glowAlpha: 0.5 * 0.3, push: 0.02 },
    title:     { weight: 600, size: 86, track: 0.12 * 0.7, upper: true, fill: ['#ffffff', '#f0e8dc'], glow: '#ffc78a', glowSize: 30 * 0.6, glowAlpha: 0.38 * 0.3, push: 0.015 },
    statement: { weight: 500, size: 64, track: 0.015, fill: '#f6f2ec', glow: '#ffc78a', glowSize: 26 * 0.6, glowAlpha: 0.22 * 0.3, lineHeight: 1.25, maxWidth: 1500, push: 0.012 },
    subtitle:  { weight: 500, size: 32, track: 0.45, upper: true, fill: '#d6c8b4', glow: '#ffb35c', glowSize: 16 * 0.6, glowAlpha: 0.5 * 0.3 },
    kicker:    { weight: 600, size: 22, track: 0.6, upper: true, fill: '@accent', glow: '@accentGlow', glowSize: 14 * 0.6, glowAlpha: 0.55 * 0.3 },
    body:      { weight: 500, size: 40, track: 0.01, fill: '#e9e4dc', lineHeight: 1.45, maxWidth: 1300, glow: '#ffc78a', glowSize: 10 * 0.6, glowAlpha: 0.12 * 0.3 },
    year:      { weight: 700, size: 40, track: 0.08, fill: '@future', glow: '@futureGlow', glowSize: 18 * 0.6, glowAlpha: 0.6 * 0.3 },
    label:     { weight: 600, size: 22, track: 0.32, upper: true, fill: '#ffffff', glow: '#ffc78a', glowSize: 10 * 0.6, glowAlpha: 0.3 * 0.3 },
    caption:   { weight: 500, size: 20, track: 0.3, upper: true, fill: '#a9a398' }
  },
  ambients: {
    // base: [edge, centre] of the backdrop gradient; blobs: the soft lights that drift over it; bokeh: the disc tint
    charcoal: { base: ['#121318', '#1c1e26'], blobs: ['#ffb35c', '#5f7fb8', '#d9824a', '#34406a'], bokeh: '#ffd9a0' },
    ember:    { base: ['#150f0e', '#271a18'], blobs: ['#ff7a3d', '#c2405f', '#ffb347', '#5a2030'], bokeh: '#ffb070' },
    steel:    { base: ['#0f1218', '#1a222d'], blobs: ['#6fa8e8', '#2fa3b8', '#9aa4e8', '#1d3b66'], bokeh: '#a8d4ff' },
    dusk:     { base: ['#14111c', '#241b2e'], blobs: ['#ff8a7a', '#8a5bd8', '#ffb35c', '#3c2f7a'], bokeh: '#ffc7b0' }
  },
  world: { vignette: 0.6, grain: 0.055, bokeh: 0.5, horizonGlow: 0.2 },
  motion: { ease: 'easeInOutCubic', dur: 1.7, spread: 1.0, arc: 0.3, stagger: 'random', entry: 'void', exit: 'drift' },
  timing: {
    worldTime: 2.6, worldEase: 'inOutCubic', settledWorldTime: 1.4, textDelay: 0.5, stepTextDelay: 0.15,
    settledTextDelay: 0.2, settledDurMax: 1.2, settledSpreadMax: 0.5, preludeTime: 0.9
  },
  shots: {
    DRIFT: {},
    WARM: { ambientPreset: 'ember', bokeh: 0.7, horizonGlow: 0.5 },
    COOL: { ambientPreset: 'steel', bokeh: 0.45, horizonGlow: 0.22 },
    DARK: { ambientPreset: 'charcoal', bokeh: 0.12, horizonGlow: 0, vignette: 0.85 }
  },
  ui: { accent: '#ffb35c' }
});
