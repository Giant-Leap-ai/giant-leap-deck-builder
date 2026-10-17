/* engine/worlds/spark.js — world plugin 'spark' (spec §4.5): the flickering glow of the cold-open spark.
 * Pass body verbatim from cinema/engine/stage.js (Stage.draw). Stateless. */
PD.module('worlds/spark', ['core/fx'], function (PD, fx) {
  var FX = fx.FX;

  var plugin = PD.world('spark', {
    params: { spark: 0, sparkX: 960, sparkY: 540 },
    create: function (stage) { return {}; },
    passes: [
      { z: 90, space: 'screen', name: 'glow', draw: function (ctx, W, st, f) {
        if (W.spark > 0.01) {
          var T = f.T;
          var fl = W.spark * (0.85 + 0.15 * Math.sin(T * 9) * Math.sin(T * 5.3));
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          FX.radial(ctx, W.sparkX, W.sparkY, 260, [[0, 'rgba(255,240,210,' + 0.5 * fl + ')'], [0.2, 'rgba(255,170,80,' + 0.18 * fl + ')'], [1, 'rgba(0,0,0,0)']]);
          FX.radial(ctx, W.sparkX, W.sparkY, 26, [[0, 'rgba(255,255,255,' + fl + ')'], [1, 'rgba(255,220,180,0)']]);
          ctx.restore();
        }
      } }
    ]
  });

  return { plugin: plugin };
});
