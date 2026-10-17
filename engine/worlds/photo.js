/* engine/worlds/photo.js — world plugin 'photo' (spec §4.5): a full-bleed picture behind the scene, with a slow
 * Ken Burns push-in. The picture is one of the deck's image assets (a data: URL, so the canvas stays clean).
 *
 *   params   photo        0..1    opacity of the picture (0 = off)
 *            photoAsset   id      CROSSFADE param: an image asset of the deck ('' = none). Changing it dissolves
 *                                 from one picture to the next (the older one fades out, the newer in)
 *            photoZoom    >= 1    scale on top of "cover" (1 fills the frame exactly). Ken Burns is just timing:
 *                                 a scene sets photoZoom 1.08 with timing { photoZoom: [12, 'linear'] } and the
 *                                 world tween does the rest
 *            photoX, photoY 0..1  the focus point: which part of the picture stays on screen when it is cropped, and
 *                                 the point the zoom grows from (0.5, 0.5 = the centre)
 *            photoDim     0..1    darkens the picture so the text stays readable (a soft scrim under the lower third
 *                                 comes with it, for captions)
 *            photoTint    colour  '' or a colour (a theme colour name or '#rrggbb') graded over the picture
 *
 * Draw: one screen pass, photo.image at z 4: above ambient.base (z 2) and below the cosmos backdrop (z 10), so under
 * the cosmos look the picture replaces the starfield's black and the nebulae still glow over it, and under slate it
 * replaces the ambient backdrop. During a crossfade (picture to picture) the pictures are mixed so their weights add
 * up to the photo's opacity without a dip: the older one is drawn first, each later one with the opacity that leaves
 * it exactly its share (alpha_i = p_i / (1 - sum of the shares above it)). An empty or missing asset takes no share:
 * the photo param alone fades a picture in from nothing and out to nothing.
 *
 * Registration allocates nothing. warm() draws each picture a deck scene shows once onto a tiny scratch canvas, so
 * the browser decodes and uploads it during warm-up instead of on the frame the picture first appears. The runtime
 * asset (PD.asset) is looked up once per id and cached on the stage state: the lookup compares the whole data: URL,
 * far too slow for every frame. Cost budget: photo <= 1.5 ms per frame at 1920 x 1080, quality 1.5. */
PD.module('worlds/photo', ['core/util'], function (PD, util) {
  var DW = util.DW, DH = util.DH, U = util.U;
  var MAXL = 6;                    // crossfade layers drawn at once
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------------------------------------------------------- the scrim under the lower third (page-wide, lazy) */
  var scrim = null;
  function scrimStrip() {
    if (scrim) return scrim;
    var c = U.canvas(4, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    for (var i = 0; i <= 16; i++) { var t = i / 16; g.addColorStop(t, 'rgba(0,0,0,' + (Math.pow(t, 1.8) * 0.62).toFixed(4) + ')'); }
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    return (scrim = c);
  }

  /* ---------------------------------------------------------- the deck's pictures */
  // → the decoded <img> of an image asset, or null while it is missing, failed or not decoded yet.
  // A hit costs a property read; a miss is looked up again about every 45 frames (PD.asset is slow).
  function imageOf(st, id) {
    var stage = st.stage, aid = stage.deck.assetsDeckId || stage.deck.id;
    var src = PD.assets.get(aid)[id], e = has(st.look, id) ? st.look[id] : null;
    if (e && e.src === src) {
      if (e.ra) return e.ra.ok ? e.ra.img : null;
      if (st.frames < e.retry) return null;
    }
    var ra = PD.asset(aid, id);
    if (ra && ra.type !== 'image') ra = null;
    st.look[id] = { src: src, ra: ra, retry: st.frames + 45 };
    return ra && ra.ok ? ra.img : null;
  }

  // every photoAsset a scene (or one of its steps) asks for, in deck order
  function wantedAssets(deck) {
    var out = [];
    function add(w) { var id = w && w.photoAsset; if (typeof id === 'string' && id && out.indexOf(id) < 0) out.push(id); }
    (deck.scenes || []).forEach(function (sc) {
      if (!sc) return;
      add(sc.world);
      (sc.steps || []).forEach(function (s) { add(s && s.world); });
    });
    return out;
  }

  /* ---------------------------------------------------------- the plugin */
  var plugin = PD.world('photo', {
    params: { photo: 0, photoAsset: '', photoZoom: 1, photoX: 0.5, photoY: 0.5, photoDim: 0.25, photoTint: '' },
    crossfade: ['photoAsset'],
    preload: function (theme, compiled) { scrimStrip(); },
    create: function (stage) {
      return {
        stage: stage, look: {}, frames: 0, queue: null, scratch: null,
        al: new Float32Array(MAXL), imgs: new Array(MAXL), ids: new Array(MAXL),
        tint: '', tintStyle: ''
      };
    },
    // warm-up: touch each picture the deck shows, one per call
    warmed: function (st) {
      if (!st.queue) st.queue = wantedAssets(st.stage.deck);
      return st.queue.length === 0;
    },
    warm: function (st, budgetMs) {
      if (!st.queue) st.queue = wantedAssets(st.stage.deck);
      var id = st.queue.shift();
      if (id == null) return;
      var img = imageOf(st, id);
      if (!img) return;
      if (!st.scratch) st.scratch = U.canvas(32, 18);
      st.scratch.getContext('2d').drawImage(img, 0, 0, 32, 18);
    },
    passes: [
      { z: 4, space: 'screen', name: 'image', draw: function (ctx, W, st, f) {
        var ph = W.photo > 1 ? 1 : W.photo;
        if (ph <= 0.003) return;
        st.frames++;
        var stack = f.xf.photoAsset, n = stack.length, i0 = n > MAXL ? n - MAXL : 0, m = n - i0, al = st.al, i;
        // the pictures that can be drawn, with their weights; empty and missing ones take no share, so the photo
        // param alone fades a picture in from nothing and out to nothing, and only picture to picture is a crossfade
        var imgs = st.imgs, ids = st.ids, c = 0, sum = 0, cover = 0, share = 0;
        for (i = 0; i < m; i++) {
          var id = stack[i0 + i].value, img = id ? imageOf(st, id) : null;
          if (!img) continue;
          var w = stack[i0 + i].amount;
          imgs[c] = img; ids[c] = id; al[c] = w > 0 ? w : 0; sum += al[c]; c++;
        }
        if (!c) return;
        if (sum < 1e-6) { for (i = 0; i < c; i++) al[i] = 0; al[c - 1] = 1; sum = 1; }
        // shares add up to the photo's opacity; each picture is drawn with the opacity that leaves it exactly its
        // share (the older first): alpha_i = p_i / (1 - sum of the shares drawn after it)
        for (i = 0; i < c; i++) { al[i] = al[i] / sum * ph; cover += al[i]; }
        for (i = c - 1; i >= 0; i--) { var p = al[i], den = 1 - share; al[i] = den > 1e-6 ? p / den : 0; share += p; }

        var z = W.photoZoom < 1 ? 1 : W.photoZoom;
        var fx = W.photoX < 0 ? 0 : W.photoX > 1 ? 1 : W.photoX, fy = W.photoY < 0 ? 0 : W.photoY > 1 ? 1 : W.photoY;
        ctx.save();
        for (i = 0; i < c; i++) {
          var ra = st.look[ids[i]].ra, iw = ra.w || imgs[i].naturalWidth || 1, ih = ra.h || imgs[i].naturalHeight || 1;   // natural size
          var s = (DW / iw > DH / ih ? DW / iw : DH / ih) * z, dw = iw * s, dh = ih * s;
          ctx.globalAlpha = al[i] > 1 ? 1 : al[i];
          ctx.drawImage(imgs[i], fx * (DW - dw), fy * (DH - dh), dw, dh);   // the focus point keeps its place on screen
        }
        var tint = W.photoTint;
        if (tint) {
          if (tint !== st.tint) { var rgb = f.stage.col(tint); st.tint = tint; st.tintStyle = 'rgb(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ')'; }
          ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = cover * 0.7;
          ctx.fillStyle = st.tintStyle; ctx.fillRect(0, 0, DW, DH);
          ctx.globalCompositeOperation = 'source-over';
        }
        var dim = W.photoDim;
        if (dim > 0.003) {
          ctx.globalAlpha = (dim > 1 ? 1 : dim) * cover;
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, DW, DH);
        }
        ctx.globalAlpha = cover;
        ctx.drawImage(scrimStrip(), 0, DH * 0.5, DW, DH * 0.5);
        ctx.restore();
      } }
    ]
  });

  return { plugin: plugin };
});
