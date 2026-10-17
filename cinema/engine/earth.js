/* cinema — procedural Earth.
 * Continents come from hand-plotted coastline polygons (lon, lat), roughened
 * with fractal noise; oceans, deserts, ice, clouds and night-side city lights
 * are generated at load (time-sliced so the deck stays responsive). Each frame
 * the visible part of the globe is ray-cast per pixel into a buffer (lighting,
 * specular ocean glint, atmosphere rim), then composited with a vector halo. */
var Earth = (function () {
  var LAND = [
    // North America
    [-168, 66, -162, 70, -156, 71, -140, 70, -128, 70, -115, 68, -95, 72, -82, 73, -80, 63, -94, 59, -92, 57, -82, 55, -79, 52, -77, 60, -70, 61, -64, 60, -56, 52, -60, 47, -66, 45, -70, 43, -70, 41, -74, 40, -76, 35, -81, 31, -80, 25, -82, 27, -84, 30, -89, 30, -94, 29, -97, 26, -97, 21, -94, 18, -90, 21, -87, 21, -88, 16, -83, 15, -83, 10, -79, 9, -77, 8, -80, 7, -85, 10, -87, 13, -92, 14, -96, 16, -105, 20, -106, 23, -112, 29, -110, 23, -115, 30, -117, 32, -121, 35, -124, 40, -124, 46, -123, 49, -128, 51, -132, 55, -136, 58, -146, 61, -152, 59, -158, 57, -164, 55, -158, 59, -162, 60, -166, 62, -164, 64],
    // Baffin Island
    [-90, 72, -80, 74, -68, 70, -62, 66, -66, 62, -75, 64, -82, 66, -88, 69],
    // Greenland
    [-73, 78, -60, 82, -30, 83, -20, 80, -18, 75, -22, 70, -32, 68, -40, 65, -43, 60, -48, 61, -52, 65, -54, 69, -58, 75, -68, 77],
    // Iceland
    [-24, 64, -14, 64, -14, 66, -22, 66.5],
    // Cuba
    [-85, 22, -80, 23.2, -74, 20, -77, 20],
    // South America
    [-80, 9, -75, 11, -72, 12, -63, 11, -60, 8, -52, 5, -50, 0, -44, -2, -35, -5, -35, -9, -39, -14, -40, -20, -48, -26, -53, -34, -58, -38, -62, -39, -65, -42, -67, -46, -69, -51, -68, -55, -72, -54, -75, -48, -74, -40, -71, -30, -70, -18, -76, -14, -81, -6, -80, -2, -78, 2, -77, 7],
    // Africa
    [-17, 21, -16, 13, -14, 10, -8, 4, -2, 5, 5, 6, 9, 4, 10, 0, 12, -5, 13, -12, 12, -18, 15, -27, 18, -34, 20, -35, 26, -34, 31, -29, 33, -26, 35, -22, 40, -15, 40, -10, 39, -5, 42, 0, 46, 3, 51, 11, 44, 11, 43, 13, 39, 17, 37, 22, 35, 27, 32, 31, 25, 32, 20, 31, 15, 32, 10, 34, 11, 37, 5, 37, -2, 35, -6, 36, -9, 32, -10, 29, -13, 27],
    // Madagascar
    [44, -25, 47, -25, 50, -15, 49, -12, 44, -17],
    // Eurasia
    [-10, 36, -9, 43, -2, 43, -4, 48, 2, 51, 8, 54, 9, 57, 12, 56, 11, 59, 5, 58, 5, 62, 14, 67, 20, 70, 29, 71, 40, 68, 44, 68, 56, 69, 68, 73, 80, 73, 95, 76, 105, 78, 115, 74, 130, 71, 140, 72, 160, 70, 170, 70, 180, 68, 180, 65, 170, 60, 162, 58, 160, 54, 156, 51, 155, 57, 142, 59, 137, 54, 140, 48, 135, 43, 130, 42, 129, 36, 126, 35, 126, 38, 121, 40, 122, 37, 119, 35, 121, 30, 117, 24, 110, 21, 108, 16, 109, 12, 105, 9, 104, 11, 100, 13, 100, 8, 103, 2, 101, 3, 98, 8, 98, 15, 94, 17, 92, 22, 87, 22, 80, 15, 77, 8, 73, 17, 73, 21, 67, 25, 57, 26, 56, 24, 59, 22, 52, 17, 44, 12, 42, 16, 35, 28, 34, 31, 36, 36, 30, 36, 27, 37, 26, 40, 23, 40, 24, 37, 21, 37, 19, 40, 16, 41, 18, 40, 16, 38, 12, 42, 10, 44, 8, 44, 3, 43, 0, 39, -2, 37, -6, 36],
    // Great Britain, Ireland
    [-5, 50, 1, 51, 2, 53, -2, 56, -2, 58.5, -5, 58.5, -6, 56, -3, 54, -5, 52],
    [-10, 52, -6, 52, -6, 55, -8, 55],
    // Japan
    [130, 31, 135, 34, 140, 35, 142, 40, 141, 45, 144, 44, 141, 41, 140, 38, 136, 36, 131, 34],
    // Sri Lanka, Taiwan
    [80, 6, 82, 7, 81, 9.5, 79.8, 8], [120, 22, 122, 25, 121, 25.3, 120, 23],
    // Sumatra, Java, Borneo, Sulawesi, New Guinea, Philippines
    [95, 5, 106, -6, 103, -5, 98, 1], [105, -6, 114, -8, 106, -8], [109, 1, 117, 7, 119, 1, 116, -4, 110, -3],
    [119, -5, 121, 1, 125, 1, 122, -2, 123, -5], [131, -1, 141, -3, 150, -10, 143, -9, 138, -8, 132, -4],
    [120, 18, 122, 18, 126, 7, 122, 7, 120, 13],
    // Australia, Tasmania, New Zealand
    [114, -22, 114, -34, 118, -35, 124, -34, 132, -32, 138, -35, 141, -38, 147, -39, 150, -37, 153, -31, 153, -25, 146, -19, 142, -11, 141, -17, 136, -12, 132, -11, 129, -15, 122, -17],
    [145, -41, 148, -41, 148, -43.5, 146, -43.5], [172, -35, 178, -38, 175, -42, 171, -46, 167, -46, 172, -41],
    // Antarctica
    [-180, -90, 180, -90, 180, -72, 150, -68, 100, -66, 60, -67, 20, -70, -10, -71, -60, -64, -70, -70, -100, -73, -140, -76, -180, -78]
  ];
  var WATER = [
    [28, 41, 41, 41, 41, 44, 34, 46.5, 30, 46, 28, 43],                    // Black Sea
    [47, 37, 54, 37, 54, 42, 52, 46, 48, 47, 47, 43],                      // Caspian
    [10, 54, 14, 54, 21, 55, 24, 58, 30, 60, 22, 61, 18, 63, 22, 65, 25, 66, 21, 66, 17, 62, 18, 59, 16, 56, 12, 56], // Baltic
    [48, 30, 50, 26, 56, 26, 56, 24, 51, 24, 48, 28],                      // Persian Gulf
    [32.5, 30, 36, 26, 39, 21, 43, 14, 41, 15, 37, 20, 33.5, 27]           // Red Sea
  ];

  var TW = 1024, TH = 512;
  var tex = null;           // {r,g,b,light,ocean,cloud} typed arrays
  var gen = null;           // generation progress
  var mask = null;

  function buildMask() {
    var c = U.canvas(TW, TH), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, TW, TH);
    function poly(p) {
      x.beginPath();
      for (var i = 0; i < p.length; i += 2) {
        var px = (p[i] + 180) / 360 * TW, py = (90 - p[i + 1]) / 180 * TH;
        if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.closePath(); x.fill();
    }
    x.fillStyle = '#fff'; LAND.forEach(poly);
    x.fillStyle = '#000'; WATER.forEach(poly);
    // soften: downsample + upsample
    var s = U.canvas(TW / 4, TH / 4), sx = s.getContext('2d');
    sx.imageSmoothingEnabled = true; sx.drawImage(c, 0, 0, TW / 4, TH / 4);
    var b = U.canvas(TW, TH), bx = b.getContext('2d');
    bx.imageSmoothingEnabled = true; bx.globalAlpha = 0.6; bx.drawImage(c, 0, 0);
    bx.globalAlpha = 0.4; bx.drawImage(s, 0, 0, TW, TH);
    var d = bx.getImageData(0, 0, TW, TH).data, m = new Float32Array(TW * TH);
    for (var i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
    return m;
  }
  function sampleMask(u, v) {
    u = ((u % TW) + TW) % TW; v = U.clamp(v, 0, TH - 1.001);
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, x1 = (x0 + 1) % TW;
    var a = mask[y0 * TW + x0], b = mask[y0 * TW + x1], c = mask[(y0 + 1) * TW + x0], d = mask[(y0 + 1) * TW + x1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }

  function startGen() {
    if (gen) return;
    mask = buildMask();
    var n = TW * TH;
    tex = { r: new Uint8ClampedArray(n), g: new Uint8ClampedArray(n), b: new Uint8ClampedArray(n),
            light: new Uint8ClampedArray(n), ocean: new Uint8ClampedArray(n), cloud: new Uint8ClampedArray(n) };
    gen = { row: 0, done: false };
  }
  // Generate rows until `budgetMs` is spent. Returns true when complete.
  function step(budgetMs) {
    startGen();
    if (gen.done) return true;
    var t0 = performance.now();
    while (gen.row < TH) {
      genRow(gen.row++);
      if (performance.now() - t0 > budgetMs) break;
    }
    if (gen.row >= TH) gen.done = true;
    return gen.done;
  }
  function genRow(j) {
    var lat = (0.5 - (j + 0.5) / TH) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    var latDeg = lat * 57.2958, alat = Math.abs(latDeg);
    for (var i = 0; i < TW; i++) {
      var lon = ((i + 0.5) / TW - 0.5) * Math.PI * 2;
      var px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
      var o = j * TW + i;
      // roughen coastline with noise
      var wx = U.fbm3(px * 3 + 11, py * 3, pz * 3, 4) - 0.5, wy = U.fbm3(px * 3, py * 3 + 7, pz * 3 + 3, 4) - 0.5;
      var m = sampleMask(i + wx * 26, j + wy * 18);
      var det = U.fbm3(px * 9, py * 9, pz * 9, 3);
      m += (det - 0.5) * 0.18;
      var R, G, B;
      if (m > 0.5) {
        // land
        var dry = U.smooth(10, 22, alat) * (1 - U.smooth(30, 38, alat)) * U.smooth(0.42, 0.6, U.fbm3(px * 2.2 + 5, py * 2.2, pz * 2.2, 3) + 0.12);
        var green = [52, 86, 50], temperate = [84, 100, 62], desert = [196, 160, 108], tundra = [120, 118, 98];
        var base = U.mix(green, temperate, U.smooth(20, 45, alat));
        base = U.mix(base, desert, dry);
        base = U.mix(base, tundra, U.smooth(52, 64, alat));
        var mtn = U.smooth(0.55, 0.75, det);
        R = base[0] * (0.85 + det * 0.35) + mtn * 30; G = base[1] * (0.85 + det * 0.35) + mtn * 26; B = base[2] * (0.85 + det * 0.35) + mtn * 22;
        var ice = U.smooth(66, 72, alat + det * 6);
        if (latDeg < -62) ice = 1;
        // Greenland is mostly ice
        if (latDeg > 60 && i / TW * 360 - 180 > -60 && i / TW * 360 - 180 < -18) ice = Math.max(ice, 0.9);
        R = U.lerp(R, 236, ice); G = U.lerp(G, 242, ice); B = U.lerp(B, 250, ice);
        tex.ocean[o] = 0;
        // city lights: populated latitude bands, clustered
        var pop = U.smooth(-38, -10, latDeg) * (1 - U.smooth(58, 66, latDeg)) * (1 - ice) * (1 - dry * 0.75);
        var cn = U.noise3(px * 40, py * 40, pz * 40) * U.fbm3(px * 6 + 3, py * 6, pz * 6, 3);
        tex.light[o] = U.clamp((cn - 0.3) * 4.2 * pop, 0, 1) * 255;
      } else {
        var shallow = U.smooth(0.18, 0.5, m);
        var deep = [6, 22, 58], mid = [10, 52, 112], sh = [28, 112, 160];
        var oc = U.mix(deep, mid, U.fbm3(px * 4, py * 4, pz * 4, 2) * 0.8 + alat / 300);
        oc = U.mix(oc, sh, shallow * 0.8);
        R = oc[0]; G = oc[1]; B = oc[2];
        var seaIce = U.smooth(70, 78, alat + det * 8);
        R = U.lerp(R, 210, seaIce); G = U.lerp(G, 225, seaIce); B = U.lerp(B, 240, seaIce);
        tex.ocean[o] = 255 * (1 - seaIce);
        tex.light[o] = 0;
      }
      tex.r[o] = R; tex.g[o] = G; tex.b[o] = B;
      // clouds: swirly bands
      var cw = U.fbm3(px * 2 + 40, py * 2.6, pz * 2, 3);
      var cloud = U.fbm3(px * 4 + cw * 2.5, py * 5 + cw * 2, pz * 4 + 20, 5);
      var band = 0.85 + 0.25 * Math.cos(lat * 6);
      tex.cloud[o] = U.clamp((cloud * band - 0.5) * 3.2, 0, 1) * 235;
    }
  }

  /* ---------------------------------------------------------------- render */
  // One fixed pixel buffer, allocated once (re-allocating while the planet
  // zooms caused 25-50ms hitches).
  var BW = 2048, BH = 1024, buf = null, bctx = null, img = null, d32 = null;
  function alloc() {
    if (buf) return;
    buf = U.canvas(BW, BH);
    bctx = buf.getContext('2d');
    img = bctx.createImageData(BW, BH);
    d32 = new Uint32Array(img.data.buffer);
  }

  // view: {cx, cy, R, rot, cloudRot, pitch, light:[x,y,z], alpha}
  function render(ctx, view, pxScale, maxPx) {
    var MAXPX = maxPx || 240000;
    if (view.alpha <= 0.01 || view.R < 0.5) return;
    if (!step(view.syncGen ? 1e9 : 6)) {
      // texture still generating: draw a placeholder disc
      drawHalo(ctx, view);
      return;
    }
    var R = view.R;
    var x0 = Math.max(0, view.cx - R * 1.02), x1 = Math.min(DW, view.cx + R * 1.02);
    var y0 = Math.max(0, view.cy - R * 1.02), y1 = Math.min(DH, view.cy + R * 1.02);
    if (x1 <= x0 || y1 <= y0) return;
    var bw = x1 - x0, bh = y1 - y0;
    var k = pxScale * Math.min(1, Math.sqrt(MAXPX / (bw * bh * pxScale * pxScale)));
    k = Math.min(k, (BW - 2) / bw, (BH - 2) / bh);
    var W = Math.max(2, Math.ceil(bw * k)), H = Math.max(2, Math.ceil(bh * k));
    alloc();
    var stride = img.width;
    var L = view.light, lx = L[0], ly = L[1], lz = L[2];
    var ll = Math.sqrt(lx * lx + ly * ly + lz * lz); lx /= ll; ly /= ll; lz /= ll;
    var hx = lx, hy = ly, hz = lz + 1, hl = Math.sqrt(hx * hx + hy * hy + hz * hz); hx /= hl; hy /= hl; hz /= hl;
    var cp = Math.cos(view.pitch || 0), sp = Math.sin(view.pitch || 0);
    var rot = view.rot, crot = view.cloudRot || 0;
    var TR = tex.r, TG = tex.g, TB = tex.b, TLt = tex.light, TO = tex.ocean, TC = tex.cloud;
    var invK = 1 / k, invR = 1 / R, TWOPI = 6.2831853;
    for (var j = 0; j < H; j++) {
      var dy = (y0 + (j + 0.5) * invK - view.cy) * invR;
      var row = j * stride;
      for (var i = 0; i < W; i++) {
        var dx = (x0 + (i + 0.5) * invK - view.cx) * invR;
        var d2 = dx * dx + dy * dy;
        if (d2 >= 1) { d32[row + i] = 0; continue; }
        var nz = Math.sqrt(1 - d2), nx = dx, ny = -dy;
        // tilt toward viewer
        var ey = ny * cp + nz * sp, ez = -ny * sp + nz * cp;
        var lon = U.atan2(nx, ez) + rot;
        var lat = U.atan2(ey, Math.sqrt(nx * nx + ez * ez));
        var u = lon / TWOPI + 0.5; u -= Math.floor(u);
        var ti = ((0.5 - lat / 3.1415927) * TH | 0) * TW + (u * TW | 0);
        if (ti < 0) ti = 0; else if (ti >= TW * TH) ti = TW * TH - 1;
        var uc = (lon + crot) / TWOPI + 0.5; uc -= Math.floor(uc);
        var ci = ((0.5 - lat / 3.1415927) * TH | 0) * TW + (uc * TW | 0);
        if (ci < 0) ci = 0; else if (ci >= TW * TH) ci = TW * TH - 1;
        var lam = nx * lx + ny * ly + nz * lz;
        var day = lam < -0.15 ? 0 : lam > 0.3 ? 1 : (lam + 0.15) / 0.45;
        day = day * day * (3 - 2 * day);
        var diff = lam > 0 ? lam : 0;
        var lit = 0.035 + day * (0.25 + 0.9 * diff);
        var cloud = TC[ci] / 255;
        var r = TR[ti] * lit, g = TG[ti] * lit, b = TB[ti] * lit;
        // clouds (lit + faint at night)
        var cl = cloud * (0.04 + day * (0.2 + 0.85 * diff)) * 255;
        r = r * (1 - cloud) + cl; g = g * (1 - cloud) + cl; b = b * (1 - cloud) + cl * 1.04;
        // ocean glint
        if (TO[ti] > 0) {
          var sh = nx * hx + ny * hy + nz * hz;
          if (sh > 0.97) { var spc = Math.pow(sh, 260) * (TO[ti] / 255) * day * (1 - cloud) * 150; r += spc; g += spc * 0.92; b += spc * 0.8; }
        }
        // city lights on the night side
        var night = 1 - day;
        if (night > 0.05 && (TLt[ti] > 0 || TLt[ti + 1 < TW * TH ? ti + 1 : ti] > 0)) {
          // bilinear so lights stay soft points even when the globe is huge
          var fu = u * TW, fv = (0.5 - lat / 3.1415927) * TH, a0 = fu - Math.floor(fu), b0 = fv - Math.floor(fv);
          var t1 = ti + 1 < TW * TH ? ti + 1 : ti, t2 = ti + TW < TW * TH ? ti + TW : ti, t3 = t2 + 1 < TW * TH ? t2 + 1 : t2;
          var lv = (TLt[ti] * (1 - a0) + TLt[t1] * a0) * (1 - b0) + (TLt[t2] * (1 - a0) + TLt[t3] * a0) * b0;
          // break lights into sub-texel specks (stable: hashed on texture coords)
          var hs = Math.sin(Math.floor(fu * 5) * 12.9898 + Math.floor(fv * 5) * 78.233) * 43758.5453;
          hs -= Math.floor(hs);
          var cv = lv * night * (1 - cloud * 0.8) * (hs > 0.55 ? (hs - 0.55) * 3.2 : 0);
          r += cv * 1.0; g += cv * 0.7; b += cv * 0.35;
        }
        // atmosphere: fresnel rim, stronger on the lit side
        var rim = 1 - nz; rim = rim * rim * rim;
        var atm = rim * (0.08 + 1.3 * U.clamp(lam + 0.35, 0, 1));
        r += 70 * atm; g += 150 * atm; b += 255 * atm;
        r = r > 255 ? 255 : r; g = g > 255 ? 255 : g; b = b > 255 ? 255 : b;
        d32[row + i] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
      }
    }
    bctx.putImageData(img, 0, 0, 0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = view.alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buf, 0, 0, W, H, x0, y0, W * invK, H * invK);
    ctx.restore();
    drawHalo(ctx, view);
  }

  // Atmospheric glow outside the limb, brighter toward the sun.
  function drawHalo(ctx, view) {
    var R = view.R, L = view.light;
    var T = Math.min(R * 0.08, 64);
    var len = Math.sqrt(L[0] * L[0] + L[1] * L[1]) || 1;
    var back = L[2] < 0 ? U.clamp(-L[2], 0, 1) : 0;   // sun behind the planet = brighter rim
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var pass = 0; pass < 2; pass++) {
      var off = pass ? R * 0.012 : 0;
      var cx = view.cx - (pass ? L[0] / len * off : 0), cy = view.cy + (pass ? L[1] / len * off : 0);
      var a = view.alpha * (pass ? 0.35 + back * 0.6 : 0.5);
      var g = ctx.createRadialGradient(cx, cy, R - 2, cx, cy, R + T * (pass ? 0.6 : 1));
      g.addColorStop(0, 'rgba(120,190,255,' + a + ')');
      g.addColorStop(0.3, 'rgba(70,140,255,' + a * 0.45 + ')');
      g.addColorStop(1, 'rgba(30,60,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R + T, 0, Math.PI * 2); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2, true); ctx.fill();
    }
    ctx.restore();
  }

  return { render: render, step: step, alloc: alloc, ready: function () { return gen && gen.done; } };
})();
