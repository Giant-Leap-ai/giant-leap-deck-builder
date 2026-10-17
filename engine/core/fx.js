/* engine/core/fx.js — lens and film effects: sun, vignette, grain, letterbox (body verbatim from cinema/engine/fx.js (FX)). */
PD.module('core/fx', ['core/util'], function (PD, util) {
  var DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, U = util.U;
  var FX = (function () {
    var grainTiles = [], vig = null, vigKey = '';
    function makeGrain() {
      for (var t = 0; t < 4; t++) {
        var c = U.canvas(256, 256), x = c.getContext('2d');
        var img = x.createImageData(256, 256), d = img.data, r = U.rng(77 + t);
        for (var i = 0; i < d.length; i += 4) {
          var v = (r() * 255) | 0;
          d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        grainTiles.push(c);
      }
    }

    function vignette(ctx, amount) {
      if (amount <= 0) return;
      if (!vig) {
        vig = U.canvas(480, 270);
        var x = vig.getContext('2d');
        var g = x.createRadialGradient(240, 135, 60, 240, 135, 300);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0.95)');
        x.fillStyle = g; x.fillRect(0, 0, 480, 270);
      }
      ctx.globalAlpha = U.clamp(amount, 0, 1);
      ctx.drawImage(vig, 0, 0, DW, DH);
      ctx.globalAlpha = 1;
    }

    function grain(ctx, amount, t) {
      if (amount <= 0) return;
      if (!grainTiles.length) makeGrain();
      var tile = grainTiles[(t * 24 | 0) % 4];
      ctx.save();
      ctx.globalAlpha = amount;
      ctx.globalCompositeOperation = 'overlay';
      var ox = (Math.sin(t * 91.7) * 128) | 0, oy = (Math.cos(t * 57.3) * 128) | 0;
      ctx.translate(ox, oy);
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(-ox, -oy, DW, DH);
      ctx.restore();
    }

    function letterbox(ctx, amount) {
      if (amount <= 0.001) return;
      var h = Math.round(138 * U.clamp(amount, 0, 1));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, DW, h);
      ctx.fillRect(0, DH - h, DW, h);
    }

    function radial(ctx, x, y, r, stops) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* Cinematic sun: core, bloom, anamorphic streak, rays, ghosts. intensity 0..1 */
    function sun(ctx, x, y, intensity, scale, t, occlude) {
      if (intensity <= 0.002) return;
      var I = intensity, S = scale || 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // wide warm bloom
      radial(ctx, x, y, 900 * S, [[0, 'rgba(255,170,90,' + 0.35 * I + ')'], [0.25, 'rgba(255,120,60,' + 0.16 * I + ')'], [0.6, 'rgba(160,60,120,' + 0.05 * I + ')'], [1, 'rgba(0,0,0,0)']]);
      // god rays
      ctx.translate(x, y);
      ctx.rotate(t * 0.02);
      for (var i = 0; i < 14; i++) {
        var a = i / 14 * Math.PI * 2 + Math.sin(i * 7.3) * 0.2;
        var len = (500 + 380 * Math.abs(Math.sin(i * 3.1 + t * 0.15))) * S;
        ctx.rotate(a);
        var g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(255,220,170,' + 0.11 * I + ')');
        g.addColorStop(1, 'rgba(255,160,100,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -4 * S); ctx.lineTo(len, -26 * S); ctx.lineTo(len, 26 * S); ctx.lineTo(0, 4 * S); ctx.fill();
        ctx.rotate(-a);
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // anamorphic streak
      ctx.translate(x, y); ctx.scale(9, 0.5);
      radial(ctx, 0, 0, 120 * S, [[0, 'rgba(255,230,200,' + 0.55 * I + ')'], [0.3, 'rgba(120,180,255,' + 0.18 * I + ')'], [1, 'rgba(0,0,0,0)']]);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // core
      radial(ctx, x, y, 170 * S, [[0, 'rgba(255,255,255,' + I + ')'], [0.18, 'rgba(255,248,225,' + I + ')'], [0.4, 'rgba(255,200,130,' + 0.5 * I + ')'], [1, 'rgba(255,140,60,0)']]);
      // lens ghosts along the axis through the frame center
      var dx = CX - x, dy = CY - y;
      var ghosts = [[0.5, 40, '120,200,255', 0.10], [0.85, 90, '255,150,220', 0.07], [1.25, 26, '180,255,210', 0.12], [1.6, 140, '120,140,255', 0.05]];
      for (i = 0; i < ghosts.length; i++) {
        var G = ghosts[i], gx = x + dx * G[0] * 2, gy = y + dy * G[0] * 2;
        radial(ctx, gx, gy, G[1] * S, [[0, 'rgba(' + G[2] + ',' + G[3] * I + ')'], [0.7, 'rgba(' + G[2] + ',' + G[3] * 0.6 * I + ')'], [1, 'rgba(' + G[2] + ',0)']]);
      }
      ctx.restore();
    }

    return { vignette: vignette, grain: grain, letterbox: letterbox, sun: sun, radial: radial };
  })();
  return { FX: FX };
});
