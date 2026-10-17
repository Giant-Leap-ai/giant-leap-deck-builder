/* engine/core/space.js — deep space: textures and the World (body verbatim from cinema/engine/space.js). */
PD.module('core/space', ['core/util', 'core/glow', 'core/fx'], function (PD, util, glow, fx) {
  var DW = util.DW, DH = util.DH, CX = util.CX, CY = util.CY, U = util.U, colFor = util.colFor, Glow = glow.Glow, FX = fx.FX;
  /* cinema — deep space: 3D starfield with warp streaks, volumetric-looking
   * nebulae (procedural, generated at load), a spiral galaxy, floating dust. */
  /* M3 (spec §4.5 "Cosmos specifics"): the nebula palettes come from the stage's theme (theme.nebulae, by
   * preset name) and the texture cache is keyed by the palette itself, colors.join(',') + ':' + seed, so two
   * themes that give the same preset name different colours never share a stale texture. */
  /* M4: drawBackdrop / drawNebulae take the stage's crossfade stack for `nebula` (stage.xf.nebula, spec §4.5): layers
   * { value, amount, … }, where value is the preset name (formerly stage.neb with .preset). The cosmos world plugin
   * (engine/worlds/cosmos.js) owns the World per stage and calls these from its passes. */

  var Space = (function () {
    var FAR = 3000, NEAR = 12, F = 720;

    /* ------------------------------------------------------------ textures */
    var texCache = {};
    function nebulaTexture(colors, seed) {
      var key = colors.join(',') + ':' + seed;
      if (texCache[key]) return texCache[key];
      var cols = colors.map(U.hex);
      var N = 256, c = U.canvas(N, N), x = c.getContext('2d');
      var img = x.createImageData(N, N), d = img.data;
      var s = seed * 13.7;
      for (var j = 0; j < N; j++) {
        for (var i = 0; i < N; i++) {
          var u = i / N * 2 - 1, v = j / N * 2 - 1;
          var r = Math.sqrt(u * u + v * v);
          var o = (j * N + i) * 4;
          if (r > 1) { d[o + 3] = 0; continue; }
          var qx = U.fbm3(u * 1.4 + s, v * 1.4, 0.5, 4), qy = U.fbm3(u * 1.4, v * 1.4 + s, 2.3, 4);
          var n = U.fbm3(u * 2.1 + qx * 2.2 + s, v * 2.1 + qy * 2.2, s * 0.3, 5);
          var fall = 1 - U.smooth(0.25, 1.0, r);
          var dens = Math.pow(U.clamp((n - 0.38) * 2.6, 0, 1), 1.5) * fall;
          var ct = U.clamp(qx * 1.6 - 0.3 + r * 0.4, 0, 1);
          var cc = U.ramp(cols, ct);
          var hot = Math.pow(dens, 3) * 0.6; // brighter cores tend toward white
          d[o] = Math.min(255, cc[0] + (255 - cc[0]) * hot);
          d[o + 1] = Math.min(255, cc[1] + (255 - cc[1]) * hot);
          d[o + 2] = Math.min(255, cc[2] + (255 - cc[2]) * hot);
          d[o + 3] = Math.min(255, dens * 255);
        }
      }
      x.putImageData(img, 0, 0);
      texCache[key] = c;
      return c;
    }

    var galaxyTex = null;
    function galaxyTexture() {
      if (galaxyTex) return galaxyTex;
      var N = 1024, c = U.canvas(N, N), x = c.getContext('2d'), h = N / 2;
      var r = U.rng(4242);
      x.globalCompositeOperation = 'lighter';
      FX.radial(x, h, h, 500, [[0, 'rgba(120,140,255,0.22)'], [0.5, 'rgba(90,60,200,0.08)'], [1, 'rgba(0,0,0,0)']]);
      var arms = 2;
      for (var i = 0; i < 90000; i++) {
        var t = Math.pow(r(), 0.75);
        var arm = (r() * arms) | 0;
        var ang = Math.log(1 + t * 9) * 2.1 + arm * Math.PI + U.gauss(r) * (0.9 - t * 0.35);
        var rad = 14 + t * 480;
        var spread = (40 + 150 * t) * U.gauss(r);
        var px = h + Math.cos(ang) * rad + Math.cos(ang + 1.57) * spread;
        var py = h + Math.sin(ang) * rad + Math.sin(ang + 1.57) * spread;
        var core = 1 - t;
        var pick = r();
        var cr, cg, cb;
        if (core > 0.75) { cr = 255; cg = 225; cb = 170; }
        else if (pick < 0.06) { cr = 255; cg = 110; cb = 180; }   // star-forming regions
        else if (pick < 0.5) { cr = 140; cg = 180; cb = 255; }
        else { cr = 200; cg = 210; cb = 255; }
        var a = 0.08 + 0.35 * r() * (0.4 + core);
        x.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')';
        var sz = r() < 0.02 ? 2.2 : 1.2;
        x.fillRect(px, py, sz, sz);
      }
      // halo stars
      for (i = 0; i < 2500; i++) {
        var a2 = r() * 6.283, rr = Math.pow(r(), 2) * 500;
        x.fillStyle = 'rgba(255,240,220,' + (0.1 + r() * 0.3).toFixed(2) + ')';
        x.fillRect(h + Math.cos(a2) * rr, h + Math.sin(a2) * rr, 1.2, 1.2);
      }
      // diffuse glow: blurred copy of the arms
      var sm = U.canvas(128, 128), smx = sm.getContext('2d');
      smx.drawImage(c, 0, 0, 128, 128);
      x.globalAlpha = 0.9; x.imageSmoothingEnabled = true; x.drawImage(sm, 0, 0, N, N); x.globalAlpha = 1;
      FX.radial(x, h, h, 170, [[0, 'rgba(255,250,235,0.95)'], [0.15, 'rgba(255,225,170,0.6)'], [0.5, 'rgba(255,170,110,0.15)'], [1, 'rgba(0,0,0,0)']]);
      FX.radial(x, h, h, 40, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,240,210,0)']]);
      galaxyTex = c;
      return c;
    }

    var bgTex = null;
    function backgroundTexture() {
      if (bgTex) return bgTex;
      var c = U.canvas(480, 270), x = c.getContext('2d');
      var g = x.createRadialGradient(240, 150, 10, 240, 135, 320);
      g.addColorStop(0, '#0b0f24');
      g.addColorStop(0.6, '#05060f');
      g.addColorStop(1, '#010103');
      x.fillStyle = g; x.fillRect(0, 0, 480, 270);
      bgTex = c;
      return c;
    }

    /* ------------------------------------------------------------ instance */
    function World(seed, theme) {
      // theme (M3): nebula palettes by preset name (an unknown name falls back to the theme's first preset,
      // which is 'aurora' for cosmos and OGL, as before) and the theme-bound col() for warpColor.
      this.nebulae = theme.nebulae || {};
      this.nebulaFallback = this.nebulae[Object.keys(this.nebulae)[0]];
      this.col = colFor(theme.colors);
      var r = U.rng(seed || 1);
      this.r = r;
      // stars
      var n = 1800;
      this.n = n;
      this.sx = new Float32Array(n); this.sy = new Float32Array(n); this.sz = new Float32Array(n);
      this.sb = new Float32Array(n); this.st = new Uint8Array(n); this.sp = new Float32Array(n);
      for (var i = 0; i < n; i++) this.spawnStar(i, NEAR + r() * (FAR - NEAR));
      // nebula billboards
      this.bills = [];
      for (i = 0; i < 9; i++) this.bills.push(this.spawnBill({}, 300 + i / 9 * (FAR - 300)));
      // dust motes (screen-space with depth)
      this.dust = [];
      for (i = 0; i < 220; i++) this.dust.push({ x: r() * DW, y: r() * DH, d: 0.3 + r() * 0.7, ph: r() * 6.28, c: r() < 0.7 ? [180, 210, 255] : [255, 200, 150] });
      this.camZ = 0;
      this.time = 0;
    }

    World.prototype.palette = function (preset) { return this.nebulae[preset] || this.nebulaFallback; };

    World.prototype.spawnStar = function (i, z) {
      var r = this.r;
      this.sz[i] = z;
      this.sx[i] = (r() * 2 - 1) * (DW * 0.75) * z / F;
      this.sy[i] = (r() * 2 - 1) * (DH * 0.8) * z / F;
      var b = r();
      this.sb[i] = 0.25 + Math.pow(b, 3) * 0.9;
      this.st[i] = r() < 0.18 ? 1 : 0;
      this.sp[i] = r() * 6.28;
    };

    World.prototype.spawnBill = function (b, z) {
      var r = this.r;
      b.z = z;
      var ang = r() * 6.283, rad = 200 + r() * 900;
      b.x = Math.cos(ang) * rad; b.y = Math.sin(ang) * rad * 0.6;
      b.size = 1500 + r() * 1700;
      b.rot = r() * 6.283; b.spin = (r() - 0.5) * 0.05;
      b.seed = (r() * 3) | 0;
      return b;
    };

    World.prototype.update = function (dt, W) {
      this.time += dt;
      var v = W.speed, n = this.n;
      this.camZ += v * dt;
      for (var i = 0; i < n; i++) {
        this.sz[i] -= v * dt;
        if (this.sz[i] < NEAR) this.spawnStar(i, this.sz[i] + FAR - NEAR);
        else if (this.sz[i] > FAR) this.spawnStar(i, this.sz[i] - FAR + NEAR);
      }
      var bv = v * 0.55; // nebulae sit "between" — slightly slower parallax feels deeper
      for (i = 0; i < this.bills.length; i++) {
        var b = this.bills[i];
        b.z -= bv * dt; b.rot += b.spin * dt;
        if (b.z < 60) this.spawnBill(b, b.z + FAR);
      }
      for (i = 0; i < this.dust.length; i++) {
        var d = this.dust[i];
        d.x += (Math.sin(this.time * 0.2 + d.ph) * 4 + 3) * d.d * dt;
        d.y += (Math.cos(this.time * 0.17 + d.ph) * 3 - 2) * d.d * dt;
        // zoom outward with forward speed
        var k = 1 + v * dt * 0.0006 * d.d;
        d.x = CX + (d.x - CX) * k; d.y = CY + (d.y - CY) * k;
        if (d.x < -20 || d.x > DW + 20 || d.y < -20 || d.y > DH + 20) {
          var r = this.r;
          d.x = CX + (r() - 0.5) * DW * (v > 200 ? 0.3 : 1); d.y = CY + (r() - 0.5) * DH * (v > 200 ? 0.3 : 1);
        }
      }
    };

    World.prototype.drawBackground = function (ctx) {
      ctx.drawImage(backgroundTexture(), 0, 0, DW, DH);
    };

    // Screen-fixed, slowly drifting color wash so even still scenes feel rich.
    World.prototype.drawBackdrop = function (ctx, layers, amount) {
      if (amount <= 0.01) return;
      var t = this.time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var L = 0; L < layers.length; L++) {
        var lay = layers[L], a = lay.amount * amount;
        if (a <= 0.01) continue;
        var pal = this.palette(lay.value);
        var tx1 = nebulaTexture(pal, 0), tx2 = nebulaTexture(pal, 1);
        ctx.globalAlpha = a * 0.55;
        ctx.save(); ctx.translate(CX - 380 + Math.sin(t * 0.03) * 60, CY - 120); ctx.rotate(t * 0.006);
        ctx.drawImage(tx1, -1300, -900, 2600, 1800); ctx.restore();
        ctx.globalAlpha = a * 0.42;
        ctx.save(); ctx.translate(CX + 520, CY + 200 + Math.cos(t * 0.025) * 50); ctx.rotate(-t * 0.005 + 2);
        ctx.drawImage(tx2, -1100, -800, 2200, 1600); ctx.restore();
      }
      ctx.restore();
    };

    World.prototype.drawNebulae = function (ctx, layers, amount) {
      if (amount <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sorted = this.bills.slice().sort(function (a, b) { return b.z - a.z; });
      for (var L = 0; L < layers.length; L++) {
        var lay = layers[L], A = lay.amount * amount;
        if (A <= 0.01) continue;
        var pal = this.palette(lay.value);
        for (var i = 0; i < sorted.length; i++) {
          var b = sorted[i];
          var s = F / b.z;
          var size = b.size * s;
          var a = A * U.smooth(FAR, FAR * 0.65, b.z) * U.smooth(60, 420, b.z) * 0.5;
          if (a <= 0.004 || size < 20) continue;
          var px = CX + b.x * s, py = CY + b.y * s;
          if (px + size < 0 || px - size > DW || py + size < 0 || py - size > DH) continue;
          ctx.globalAlpha = a;
          ctx.save(); ctx.translate(px, py); ctx.rotate(b.rot);
          ctx.drawImage(nebulaTexture(pal, b.seed), -size / 2, -size / 2, size, size);
          ctx.restore();
        }
      }
      ctx.restore();
    };

    World.prototype.drawGalaxy = function (ctx, W) {
      if (W.galaxy <= 0.01) return;
      var tex = galaxyTexture();
      var sz = 1300 * W.galaxyScale;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = U.clamp(W.galaxy, 0, 1);
      ctx.translate(W.galaxyX, W.galaxyY);
      ctx.rotate(-0.35);
      ctx.scale(1, W.galaxyTilt);
      ctx.rotate(this.time * 0.025);
      ctx.drawImage(tex, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    };

    var BUCK = 6;
    World.prototype.drawStars = function (ctx, W) {
      var amt = W.stars;
      if (amt <= 0.01) return;
      var v = W.speed, warp = W.warp, t = this.time, n = this.n;
      var streakT = 0.012 + warp * 0.16;
      var cool = [205, 225, 255], warm = [255, 228, 200];
      var wc = U.mix([205, 225, 255], this.col(W.warpColor || 'cyan'), U.clamp(warp, 0, 1) * 0.7);
      // bucketed paths: [tint][alphaBucket]
      var lines = [[], []], dots = [[], []];
      for (var k = 0; k < 2; k++) for (var q = 0; q < BUCK; q++) { lines[k].push([]); dots[k].push([]); }
      for (var i = 0; i < n; i++) {
        var z = this.sz[i];
        var s = F / z;
        var x = CX + this.sx[i] * s, y = CY + this.sy[i] * s;
        if (x < -50 || x > DW + 50 || y < -50 || y > DH + 50) continue;
        var tw = 0.75 + 0.25 * Math.sin(t * (1.5 + this.sp[i]) + this.sp[i] * 10);
        var a = this.sb[i] * U.smooth(FAR, FAR * 0.55, z) * tw * amt * (0.6 + Math.min(1.8, 260 / z));
        if (a < 0.03) continue;
        var bq = Math.min(BUCK - 1, (a * BUCK) | 0);
        var tint = this.st[i];
        var z2 = Math.min(FAR, z + v * streakT);
        var s2 = F / z2;
        var x2 = CX + this.sx[i] * s2, y2 = CY + this.sy[i] * s2;
        var len = Math.abs(x - x2) + Math.abs(y - y2);
        if (len > 2.5) lines[tint][bq].push(x2, y2, x, y, Math.min(4, 0.6 + 140 / z));
        else dots[tint][bq].push(x, y, Math.min(3.2, 0.9 + 90 / z));
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (k = 0; k < 2; k++) {
        var base = k ? warm : (warp > 0.05 ? wc : cool);
        var cs = 'rgb(' + (base[0] | 0) + ',' + (base[1] | 0) + ',' + (base[2] | 0) + ')';
        ctx.strokeStyle = cs; ctx.fillStyle = cs;
        for (q = 0; q < BUCK; q++) {
          ctx.globalAlpha = (q + 0.6) / BUCK;
          var L = lines[k][q];
          // two widths for depth
          for (var pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            var any = false;
            for (var j = 0; j < L.length; j += 5) {
              if ((L[j + 4] > 1.6) !== (pass === 1)) continue;
              ctx.moveTo(L[j], L[j + 1]); ctx.lineTo(L[j + 2], L[j + 3]); any = true;
            }
            if (any) { ctx.lineWidth = pass ? 2.4 : 1.2; ctx.stroke(); }
          }
          var D = dots[k][q];
          for (j = 0; j < D.length; j += 3) {
            var sz = D[j + 2];
            ctx.fillRect(D[j] - sz / 2, D[j + 1] - sz / 2, sz, sz);
          }
        }
      }
      ctx.restore();
      // a few bright stars get a soft glow + cross
      if (warp < 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var spr = Glow.get([190, 215, 255]);
        for (i = 0; i < n; i += 9) {
          if (this.sb[i] < 0.8) continue;
          z = this.sz[i]; s = F / z;
          x = CX + this.sx[i] * s; y = CY + this.sy[i] * s;
          if (x < 0 || x > DW || y < 0 || y > DH) continue;
          a = amt * (1 - warp * 3) * U.smooth(FAR, FAR * 0.6, z) * (0.6 + 0.4 * Math.sin(t * 2 + this.sp[i] * 7));
          ctx.globalAlpha = U.clamp(a, 0, 1);
          var g = 18 + 30 * Math.min(1, 300 / z);
          ctx.drawImage(spr, x - g, y - g, g * 2, g * 2);
        }
        ctx.restore();
      }
    };

    World.prototype.drawDust = function (ctx, amount) {
      if (amount <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < this.dust.length; i++) {
        var d = this.dust[i];
        ctx.globalAlpha = amount * (0.25 + 0.35 * Math.sin(this.time * 0.8 + d.ph) * 0.5 + 0.2) * d.d;
        var s = 4 + d.d * 8;
        ctx.drawImage(Glow.get(d.c), d.x - s, d.y - s, s * 2, s * 2);
      }
      ctx.restore();
    };

    // warm all procedural textures (call once at boot): every theme.nebulae palette × seeds 0–2, plus the galaxy
    function preload(theme) {
      var neb = theme.nebulae || {};
      Object.keys(neb).forEach(function (p) { for (var s = 0; s < 3; s++) nebulaTexture(neb[p], s); });
      galaxyTexture();
    }

    return { World: World, preload: preload, nebulaTexture: nebulaTexture, F: F };
  })();
  // The nebula palettes are theme values (theme.nebulae, spec §4.4); there is no NEBULA_PRESETS global.
  return { Space: Space };
});
