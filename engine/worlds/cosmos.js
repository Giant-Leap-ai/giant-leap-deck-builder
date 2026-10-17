/* engine/worlds/cosmos.js — world plugin 'cosmos' (spec §4.5): deep space — background, nebula backdrop, galaxy,
 * nebula billboards, stars (with warp) and dust. The per-stage state is a Space.World (core/space.js, seed 7).
 * Pass bodies verbatim from cinema/engine/stage.js (Stage.draw); `nebula` is a crossfade param, so the backdrop and
 * the nebulae read the stage's stack f.xf.nebula (layers { value: preset, amount, … }). */
PD.module('worlds/cosmos', ['core/space'], function (PD, space) {
  var Space = space.Space;

  var plugin = PD.world('cosmos', {
    params: {
      speed: 16, warp: 0, warpColor: 'cyan', stars: 1,
      nebula: 'aurora', nebulaAmount: 0.75, backdrop: 0.75, dust: 0.35,
      galaxy: 0, galaxyX: 1250, galaxyY: 520, galaxyScale: 1, galaxyTilt: 0.42
    },
    crossfade: ['nebula'],
    create: function (stage) { return { space: new Space.World(7, stage.theme) }; },
    // textures, once per page per theme: every theme.nebulae palette × seeds 0–2, plus the galaxy
    preload: function (theme, compiled) { Space.preload(theme); },
    update: function (st, dt, W, stage) { st.space.update(dt, W); },
    passes: [
      { z: 0, space: 'screen', name: 'background', draw: function (ctx, W, st) { st.space.drawBackground(ctx); } },
      { z: 10, space: 'camera', name: 'backdrop', draw: function (ctx, W, st, f) { st.space.drawBackdrop(ctx, f.xf.nebula, W.backdrop * W.nebulaAmount); } },
      { z: 20, space: 'camera', name: 'galaxy', draw: function (ctx, W, st) { st.space.drawGalaxy(ctx, W); } },
      { z: 30, space: 'camera', name: 'nebulae', draw: function (ctx, W, st, f) { st.space.drawNebulae(ctx, f.xf.nebula, W.nebulaAmount); } },
      { z: 40, space: 'camera', name: 'stars', draw: function (ctx, W, st) { st.space.drawStars(ctx, W); } },
      { z: 70, space: 'screen', name: 'dust', draw: function (ctx, W, st) { st.space.drawDust(ctx, W.dust); } }
    ]
  });

  return { plugin: plugin };
});
