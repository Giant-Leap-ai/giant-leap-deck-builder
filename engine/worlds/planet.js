/* engine/worlds/planet.js — world plugin 'planet' (spec §4.5): the procedural Earth (core/earth.js) and the sun.
 * Pass bodies verbatim from cinema/engine/stage.js (Stage.draw); the state holds the spin accumulator (formerly
 * stage.spinAcc) and the Earth pixel budget (formerly stage.earthBudget, adapted by the Player's frame cost).
 * The Earth texture is generated once per page: prepare allocates the buffer (and generates it at once when the first
 * scene shows the Earth), warm/warmed time-slice the rest — today's `if (!Earth.ready()) Earth.step(3)`. */
PD.module('worlds/planet', ['core/util', 'core/fx', 'core/earth'], function (PD, util, fx, earth) {
  var U = util.U, FX = fx.FX, Earth = earth.Earth;

  var plugin = PD.world('planet', {
    params: {
      earth: 0, earthX: 960, earthY: 540, earthR: 380, earthPitch: 0.35, earthRot: -1.2, earthSpin: 0.02,
      lightX: -0.7, lightY: 0.35, lightZ: 0.62,
      sun: 0, sunX: 1500, sunY: 260, sunScale: 1
    },
    create: function (stage) { return { spinAcc: 0, budget: 240000 }; },
    prepare: function (st, firstScene, stage) {
      Earth.alloc();
      if (firstScene && (firstScene.world || {}).earth) Earth.step(1e9);
    },
    warmed: function (st) { return !!Earth.ready(); },
    warm: function (st, budgetMs) { Earth.step(budgetMs); },
    update: function (st, dt, W, stage) { st.spinAcc += W.earthSpin * dt; },
    // adaptive safety net: if frames get heavy, render the Earth at lower resolution
    adapt: function (st, workMs) {
      if (workMs > 13 && st.budget > 90000) st.budget *= 0.97;
      else if (workMs < 8 && st.budget < 240000) st.budget *= 1.01;
    },
    passes: [
      { z: 50, space: 'camera', name: 'earth', draw: function (ctx, W, st, f) {
        if (W.earth > 0.01) {
          var view = { cx: W.earthX, cy: W.earthY, R: W.earthR, rot: W.earthRot + st.spinAcc, cloudRot: st.spinAcc * 0.3 + f.T * 0.003,
            pitch: W.earthPitch, light: [W.lightX, W.lightY, W.lightZ], alpha: U.clamp(W.earth, 0, 1), syncGen: f.thumb };
          // a dark disc first so the planet occludes stars & nebula
          ctx.save(); ctx.globalAlpha = U.clamp(W.earth, 0, 1); ctx.fillStyle = '#01030a';
          ctx.beginPath(); ctx.arc(view.cx, view.cy, view.R * 0.995, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          Earth.render(ctx, view, f.S, st.budget);
        }
      } },
      { z: 60, space: 'camera', name: 'sun', draw: function (ctx, W, st, f) {
        if (W.sun > 0.01) {
          var vis = 1;
          if (W.earth > 0.01) {   // hidden behind the Earth
            var dd = Math.sqrt((W.sunX - W.earthX) * (W.sunX - W.earthX) + (W.sunY - W.earthY) * (W.sunY - W.earthY));
            vis = U.lerp(1, U.smooth(W.earthR - 90, W.earthR + 30, dd), U.clamp(W.earth, 0, 1));
          }
          FX.sun(ctx, W.sunX, W.sunY, W.sun * vis, W.sunScale, f.T);
        }
      } }
    ]
  });

  return { plugin: plugin };
});
