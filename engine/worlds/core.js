/* engine/worlds/core.js — world plugin 'core' (spec §4.5): camera params (roll, shake), the particle field and the
 * element layers, and the post passes (flash, vignette, grain, exposure, letterbox, blackout). Always enabled.
 * Pass bodies verbatim from cinema/engine/stage.js (Stage.draw). The camera transform (roll + shake jitter) is
 * applied by the stage around the camera passes; flashV, blackA, the field and the layers belong to the stage. */
PD.module('worlds/core', ['core/util', 'core/fx'], function (PD, util, fx) {
  var DW = util.DW, DH = util.DH, U = util.U, FX = fx.FX;
  function nameOf(L) {             // how a failing layer is named in Stage.fault's message
    var sp = L && L.spec, str = L && typeof L.str === 'string' ? L.str : null;
    if (sp && sp.id != null) return 'element "' + sp.id + '"';
    if (str != null) return 'the text "' + (str.length > 40 ? str.slice(0, 40) + '…' : str) + '"';
    return 'an element';
  }

  var plugin = PD.world('core', {
    params: { roll: 0, shake: 0, letterbox: 0, exposure: 1, vignette: 0.6, grain: 0.05, particles: 1 },
    create: function (stage) { return {}; },
    passes: [
      { z: 80, space: 'screen', name: 'particles', draw: function (ctx, W, st, f) {
        var field = f.stage.field;
        field.alpha = W.particles;
        field.draw(ctx, f.T);
      } },
      { z: 100, space: 'screen', name: 'elements', draw: function (ctx, W, st, f) {
        var s = f.stage, layers = s.layers, T = f.T, S = f.S, faulted = s.faultedLayers, bad;
        for (var i = 0; i < layers.length; i++) {
          var L = layers[i];
          // an element (or its reveal or exit) that throws must not take the other layers and the post passes with it
          // (Stage.fault): after its first failure it is drawn guarded
          if (!faulted.has(L)) {
            try { L.draw(ctx, T, S); } catch (e) { faulted.add(L); s.firstFault(nameOf(L), e, false); }
          } else if ((bad = s.guarded(L.draw, L, T, S))) s.fault(nameOf(L), bad.e);
        }
      } },
      { z: 110, space: 'post', name: 'flash', draw: function (ctx, W, st, f) {
        var s = f.stage;
        if (s.flashV > 0.005) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, s.flashV);
          ctx.fillStyle = '#dff1ff'; ctx.fillRect(0, 0, DW, DH); ctx.restore();
        }
      } },
      { z: 120, space: 'post', name: 'vignette', draw: function (ctx, W) { FX.vignette(ctx, W.vignette); } },
      { z: 130, space: 'post', name: 'grain', draw: function (ctx, W, st, f) { if (!f.thumb) FX.grain(ctx, W.grain, f.T); } },
      { z: 140, space: 'post', name: 'exposure', draw: function (ctx, W) {
        if (W.exposure < 0.999) { ctx.fillStyle = 'rgba(0,0,0,' + U.clamp(1 - W.exposure, 0, 1) + ')'; ctx.fillRect(0, 0, DW, DH); }
      } },
      { z: 150, space: 'post', name: 'letterbox', draw: function (ctx, W) { FX.letterbox(ctx, W.letterbox); } },
      { z: 160, space: 'post', name: 'blackout', draw: function (ctx, W, st, f) {
        var s = f.stage;
        if (s.blackA > 0.002) { ctx.fillStyle = 'rgba(0,0,0,' + s.blackA + ')'; ctx.fillRect(0, 0, DW, DH); }
      } }
    ]
  });

  return { plugin: plugin };
});
