/* pixeldeck — slide state machine, content rasterizer, input, presenter sync.
 *
 * A "state" is (slide, step). Entering a state either plays it LIVE (timeline
 * events, sprite paths, delayed items) or SETTLED (jump straight to how it looks
 * once everything has finished, still morphing the particles there). Next plays
 * live; Prev / Go-to / reload are settled. Any input while something is still
 * animating first fast-forwards the current state to its end, so the deck can
 * never desync no matter how fast the clicker is mashed.
 */
var PixelDeck = (function () {
  var W = GRID_W, H = GRID_H;

  var DEFAULTS = {
    transition: 'morph', stagger: 'random', ease: 'easeInOutCubic', duration: 1.0,
    staggerTime: 0.8, arc: 0.25, match: 'hilbert', entry: 'edges', exit: 'scatter',
    bg: 'starfield', twinkle: true, breathe: false
  };

  function deck() { return window.DECK || []; }
  function pick(key, a, b) {
    if (a && a[key] != null) return a[key];
    if (b && b[key] != null) return b[key];
    return DEFAULTS[key];
  }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }

  /* ===================================================== content → targets */
  function addCell(out, x, y, c, extra) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var t = { x: x, y: y, c: c };
    if (extra) for (var k in extra) t[k] = extra[k];
    out.push(t);
  }

  function rasterText(spec, out, ctx, highlights) {
    var L = Font.layout(spec);
    var col = PALETTE.index(spec.color || 'white');
    var str = String(spec.str || '').toUpperCase();
    // highlight ranges (char index -> color)
    var hl = null;
    for (var h = 0; h < highlights.length; h++) {
      var H_ = highlights[h];
      var word = String(H_.word || H_.text || H_.match || '').toUpperCase();
      if (!word) continue;
      if (H_.item != null && H_.item !== spec.id && H_.item !== ctx.textIndex) continue;
      var hc = PALETTE.index(H_.color || 'yellow'), found = false;
      if (H_.word) { // prefer whole-word matches
        var re = new RegExp('(^|[^A-Z0-9])(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^A-Z0-9])', 'g'), m;
        while ((m = re.exec(str))) {
          hl = hl || {};
          var s0 = m.index + m[1].length;
          for (var q = s0; q < s0 + word.length; q++) hl[q] = hc;
          found = true;
        }
      }
      if (!found) {
        var from = 0, at;
        while ((at = str.indexOf(word, from)) >= 0) {
          hl = hl || {};
          for (q = at; q < at + word.length; q++) hl[q] = hc;
          from = at + word.length;
          if (H_.first) break;
        }
      }
    }
    if (spec.shadow) {
      var sc = PALETTE.index(spec.shadow), so = spec.shadowOffset || [1, 1];
      for (var i = 0; i < L.cells.length; i++) {
        var c = L.cells[i];
        addCell(out, c.x + so[0], c.y + so[1], sc, { letter: ctx.letter + c.letter, word: ctx.word + c.word, shadow: true });
      }
    }
    for (i = 0; i < L.cells.length; i++) {
      c = L.cells[i];
      addCell(out, c.x, c.y, hl && hl[c.ci] != null ? hl[c.ci] : col,
        { letter: ctx.letter + c.letter, word: ctx.word + c.word });
    }
    ctx.letter += L.letters;
    ctx.word += L.words;
    ctx.textIndex++;
  }

  function line(out, x0, y0, x1, y1, c, extra) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
      addCell(out, x0, y0, c, extra);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function rasterShape(s, out, ctx) {
    var c = PALETTE.index(s.color || 'white');
    var x, y;
    switch (s.type) {
      case 'rect':
        for (y = 0; y < s.h; y++)
          for (x = 0; x < s.w; x++)
            if (s.fill !== false || y === 0 || x === 0 || y === s.h - 1 || x === s.w - 1)
              addCell(out, s.x + x, s.y + y, c);
        break;
      case 'line':
        line(out, s.x1, s.y1, s.x2, s.y2, c);
        break;
      case 'circle': {
        var r = s.r || 10, cx = s.x, cy = s.y;
        for (y = -r; y <= r; y++)
          for (x = -r; x <= r; x++) {
            var d = x * x + y * y;
            if (s.fill ? d <= r * r + r * 0.8 : (d <= r * r + r * 0.8 && d >= (r - 1) * (r - 1) + (r - 1) * 0.8))
              addCell(out, cx + x, cy + y, c);
          }
        break;
      }
      case 'pixels':
        for (var i = 0; i < s.points.length; i++) {
          var P = s.points[i];
          addCell(out, P[0], P[1], P[2] != null ? PALETTE.index(P[2]) : c);
        }
        break;
      case 'bars': {
        var vals = s.values || [], n = vals.length;
        var max = s.max || Math.max.apply(null, vals.concat([1]));
        var maxH = s.h || 90, base = s.y == null ? 150 : s.y;
        var bw = s.barWidth || 18, gap = s.gap == null ? 8 : s.gap;
        var total = n * bw + (n - 1) * gap;
        var x0 = s.x == null ? Math.round(160 - total / 2) : s.x;
        var colors = arr(s.colors || s.color || 'sky');
        for (i = 0; i < n; i++) {
          var bh = Math.max(1, Math.round(vals[i] / max * maxH));
          var bc = PALETTE.index(colors[i % colors.length]);
          var bx = x0 + i * (bw + gap);
          for (y = 0; y < bh; y++)
            for (x = 0; x < bw; x++)
              addCell(out, bx + x, base - 1 - y, bc, { base: base, bar: i });
          if (s.labels !== false) {
            rasterText({ str: String(s.labelText ? s.labelText[i] : vals[i]), scale: 1,
              x: bx + bw / 2, y: base - bh - 10, color: s.labelColor || 'silver' }, out, ctx, []);
          }
        }
        if (s.axis !== false) line(out, x0 - 4, base, x0 + total + 3, base, PALETTE.index(s.axisColor || 'gray'), { base: base });
        break;
      }
    }
  }

  function rasterImage(img, out) {
    var rows = img.grid || [], keys = img.keys || {};
    var sc = Math.max(1, Math.round(img.scale || 1));
    var w = 0;
    for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    var x0 = img.x == null ? Math.round(160 - w * sc / 2) : (img.align === 'center' ? Math.round(img.x - w * sc / 2) : img.x);
    var y0 = img.y || 0;
    for (var y = 0; y < rows.length; y++)
      for (var x = 0; x < rows[y].length; x++) {
        var ch = rows[y].charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var c = PALETTE.index(keys[ch] || SPRITE_KEYS[ch] || ch);
        for (var sy = 0; sy < sc; sy++)
          for (var sx = 0; sx < sc; sx++)
            addCell(out, x0 + x * sc + sx, y0 + y * sc + sy, c, { letter: x / 4 });
      }
  }
  var SPRITE_KEYS = { k: 'slate', w: 'white', g: 'silver', v: 'sky', b: 'navy', o: 'orange', y: 'yellow', r: 'red', c: 'cyan', n: 'navy', p: 'plum', l: 'lime', e: 'green', t: 'teal', a: 'gray', '0': 'black' };

  /* items: [{kind, spec}] → unique targets (later items win a shared cell) */
  function buildTargets(items, highlights, actors) {
    var out = [], ctx = { letter: 0, word: 0, textIndex: 0 };
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.kind === 'text') rasterText(it.spec, out, ctx, highlights || []);
      else if (it.kind === 'shape') rasterShape(it.spec, out, ctx);
      else if (it.kind === 'image') rasterImage(it.spec, out);
    }
    if (actors) {
      for (i = 0; i < actors.length; i++) {
        var cells = actors[i].cells();
        for (var k = 0; k < cells.length; k++) addCell(out, cells[k].x, cells[k].y, cells[k].c, { owner: actors[i] });
      }
    }
    // de-duplicate cells (last one wins)
    var seen = new Map(), res = [];
    for (i = 0; i < out.length; i++) seen.set(out[i].y * W + out[i].x, i);
    for (i = 0; i < out.length; i++) if (seen.get(out[i].y * W + out[i].x) === i) res.push(out[i]);
    return res;
  }

  /* ===================================================== state resolution */
  function stepsOf(si) { var s = deck()[si]; return s && s.steps ? s.steps.length : 0; }

  function collectItems(src, k, items) {
    arr(src.text).forEach(function (t) { items.push({ kind: 'text', spec: t, at: t.at || 0, step: k, id: t.id }); });
    arr(src.shapes).forEach(function (t) { items.push({ kind: 'shape', spec: t, at: t.at || 0, step: k, id: t.id }); });
    arr(src.images || src.image).forEach(function (t) { items.push({ kind: 'image', spec: t, at: t.at || 0, step: k, id: t.id }); });
  }

  function resolve(si, step) {
    var slide = deck()[si] || {};
    var items = [], highlights = [];
    collectItems(slide, 0, items);
    highlights = highlights.concat(arr(slide.highlight));
    for (var k = 1; k <= step; k++) {
      var st = slide.steps[k - 1] || {};
      if (st.clear) { items = []; highlights = []; }
      if (st.remove) {
        var rm = arr(st.remove);
        items = items.filter(function (it) { return rm.indexOf(it.id) < 0; });
      }
      if (st.clearHighlights) highlights = [];
      collectItems(st, k, items);
      highlights = highlights.concat(arr(st.highlight));
    }
    return { items: items, highlights: highlights };
  }

  function movesOf(s) {
    if (s.moves) return s.moves.map(function (m) { var c = {}; for (var k in m) c[k] = m[k]; if (!c.anim) c.anim = s.anim; return c; });
    if (s.to) return [{ to: s.to, dur: s.dur, path: s.path, height: s.height, anim: s.anim, ease: s.ease }];
    return [];
  }
  function endAnimOf(s, moves, prev) {
    if (s.endAnim) return s.endAnim;
    if (moves.length) {
      var a = moves[moves.length - 1].anim || s.anim;
      return (a === 'walk' || a === 'jump') ? 'idle' : (a || prev || 'idle');
    }
    return s.anim || prev || 'idle';
  }

  // Final (settled) placement of every sprite at the end of (si, step).
  function actorPlan(si, step) {
    var slide = deck()[si] || {}, plan = {}, order = [];
    var lists = [arr(slide.sprites)];
    for (var k = 1; k <= step; k++) {
      var st = slide.steps[k - 1] || {};
      if (st.clear && st.clearSprites) { plan = {}; order = []; }
      lists.push(arr(st.sprites));
    }
    lists.forEach(function (list) {
      list.forEach(function (s) {
        var cur = plan[s.id];
        if (s.remove) { delete plan[s.id]; return; }
        if (!cur) { cur = plan[s.id] = { id: s.id, sprite: s.sprite || 'astronaut', x: 0, y: 0, anim: 'idle', flip: false, gone: false }; order.push(s.id); }
        if (s.sprite) cur.sprite = s.sprite;
        var start = s.from || (s.x != null ? [s.x, s.y] : null);
        if (start) { cur.x = start[0]; cur.y = start[1]; }
        var moves = movesOf(s);
        for (var i = 0; i < moves.length; i++) {
          var to = moves[i].to || [cur.x, cur.y];
          if (moves[i].flip != null) cur.flip = moves[i].flip;
          else if (to[0] !== cur.x) cur.flip = to[0] < cur.x;
          cur.x = to[0]; cur.y = to[1];
        }
        if (s.flip != null) cur.flip = s.flip;
        cur.anim = endAnimOf(s, moves, cur.anim);
        if (s.dissolve || s.dissolveAt != null) cur.gone = true;
        if (s.assemble || s.morph) cur.gone = false;
      });
    });
    return order.filter(function (id) { return plan[id]; }).map(function (id) { return plan[id]; });
  }

  /* ===================================================== runtime */
  var canvas, ctx, R = { ctx: null, S: 1, ox: 0, oy: 0, cell: null };
  var cur = { slide: 0, step: 0 };
  var tl = new Timeline();
  var actors = [];            // live Actor instances
  var spriteCells = {};       // id -> last pixels (for entry "fromSprite:id")
  var T = 0;                  // global clock (s)
  var bgMode = 'starfield', bgIndex = 0, twinkle = true;
  var blackout = false, blackA = 0;
  var manual = false;
  var showFps = false, fpsEl, gotoEl, toastEl;
  var lastTs = 0, frames = 0, fpsAcc = 0, fpsVal = 0, workMs = 0, workAvg = 0;
  var autoAdvance = 0, autoTimer = 0, loopDeck = false;

  function trOpts(slide, stepSpec) {
    var o = {};
    ['transition', 'stagger', 'ease', 'duration', 'staggerTime', 'arc', 'match', 'entry', 'exit'].forEach(function (k) {
      o[k] = pick(k, stepSpec, slide);
    });
    if (stepSpec && stepSpec.transition == null) o.transition = 'morph';
    if (stepSpec && stepSpec.entry == null && slide.stepEntry) o.entry = slide.stepEntry;
    o.keep = pick('keep', stepSpec, slide) !== false;
    return o;
  }
  function morphOpts(o) {
    return {
      stagger: o.stagger, ease: o.ease, dur: o.duration, spread: o.staggerTime, arc: o.arc,
      match: o.match, entry: o.entry, exit: o.exit, keep: o.keep, spriteCells: spriteCells
    };
  }
  function applyTransition(kind, targets, o) {
    if (kind === 'cut') Field.cutTo(targets);
    else if (kind === 'dissolve') Field.dissolveTo(targets, { dur: o.dissolveTime || 0.25 });
    else Field.morph(targets, morphOpts(o));
  }

  function setBackground(slide) {
    bgMode = pick('bg', slide);
    bgIndex = (bgMode === 'starfield' || bgMode === 'none') ? PALETTE.BG : PALETTE.index(bgMode, PALETTE.BG);
    Field.bg = bgIndex;
    twinkle = pick('twinkle', slide) !== false;
    Field.breathe = !!pick('breathe', slide);
  }

  function dissolveActor(a, burst) {
    if (a.gone || !a.visible) { a.gone = true; return; }
    var cells = a.cells();
    spriteCells[a.id] = cells;
    Field.addLoose(cells, { burst: burst == null ? 3 : burst });
    a.gone = true; a.visible = false;
  }

  function newActor(p) {
    var a = new Actor(p.id, p.sprite);
    a.x = p.x; a.y = p.y; a.flip = !!p.flip; a.play(p.anim || 'idle');
    a.animT = Math.random() * 2;
    return a;
  }

  function dropOldActors(kind) {
    actors.forEach(function (a) {
      if (kind === 'morph') dissolveActor(a, 2);
      spriteCells[a.id] = spriteCells[a.id] || (a.gone ? [] : a.cells());
    });
    actors = [];
  }

  function finishAll() {
    tl.finish(function (t) { for (var i = 0; i < actors.length; i++) actors[i].update(t, 0); });
    Field.finishAll();
    for (var i = 0; i < actors.length; i++) actors[i].finish();
    actors = actors.filter(function (a) { return !a.gone; });
  }

  function busy() {
    if (tl.pending() || Field.busy()) return true;
    for (var i = 0; i < actors.length; i++) {
      if (!actors[i].assembled || actors[i].moving(tl.t)) return true;
    }
    return false;
  }

  /* ---------------------------------------------------- settled entry */
  function enterSettled(si, step, override) {
    finishAll();
    var slide = deck()[si];
    if (!slide) return;
    var o = trOpts(slide, null);
    if (override) for (var k in override) o[k] = override[k];
    if (step > 0 && !override) o.transition = o.transition === 'cut' ? 'cut' : 'morph';
    setBackground(slide);
    tl.clear();
    dropOldActors(o.transition);
    var res = resolve(si, step);
    var plan = actorPlan(si, step).filter(function (p) { return !p.gone; });
    var assembling = [];
    plan.forEach(function (p) {
      var a = newActor(p);
      if (o.transition === 'morph') { a.visible = false; a.assembled = false; assembling.push(a); }
      a.onAssembled = function () { a.visible = true; };
      actors.push(a);
    });
    var targets = buildTargets(res.items, res.highlights, assembling);
    applyTransition(o.transition, targets, o);
    cur.slide = si; cur.step = step;
    afterEnter();
  }

  /* ---------------------------------------------------- live entry */
  function enterLive(si, step) {
    finishAll();
    var slide = deck()[si];
    if (!slide) return;
    var isStep = step > 0 && si === cur.slide && step === cur.step + 1;
    if (step > 0 && !isStep) { enterSettled(si, step); return; }
    var stepSpec = isStep ? (slide.steps[step - 1] || {}) : null;
    var o = trOpts(slide, stepSpec);
    var src = isStep ? stepSpec : slide;
    tl.clear();

    if (!isStep) {
      setBackground(slide);
      dropOldActors(o.transition);
      spriteCells = {};
    }

    var res = resolve(si, step);
    // Items that already existed before this step are on screen: treat as at=0.
    res.items.forEach(function (it) { it.when = (isStep && it.step < step) ? 0 : it.at; });

    var offset = 0;
    if (!isStep && slide.prelude === 'explode') {
      offset = slide.preludeTime || 0.8;
      tl.at(0, function () { Field.explode({ power: slide.explodePower || 1 }); }, -1);
    }

    // Sprites
    var specs = arr(src.sprites);
    var assembleAt = {}; // time -> [actors]
    specs.forEach(function (s) {
      var a = null;
      for (var i = 0; i < actors.length; i++) if (actors[i].id === s.id) a = actors[i];
      if (s.remove) {
        if (a) { if (o.transition === 'morph') dissolveActor(a, 2); actors.splice(actors.indexOf(a), 1); }
        return;
      }
      var fresh = !a;
      if (fresh) { a = new Actor(s.id, s.sprite || 'astronaut'); actors.push(a); }
      var start = s.from || (s.x != null ? [s.x, s.y] : null);
      if (start) { a.x = start[0]; a.y = start[1]; }
      if (s.flip != null) a.flip = s.flip;
      var moves = movesOf(s);
      var startT = (s.at || 0) + offset;
      a.play(moves.length && moves[0].anim ? moves[0].anim : (s.anim || a.anim));
      a.setMoves(moves, startT, endAnimOf(s, moves, a.anim));
      a.gone = false;
      if (s.assemble || s.morph) {
        a.visible = false; a.assembled = false;
        (assembleAt[startT] = assembleAt[startT] || []).push(a);
        a.onAssembled = function () { a.visible = true; a.t0 = Math.max(a.t0, tl.t); a.animT = 0; };
      } else if (fresh && startT > 0) {
        a.visible = false;
        tl.at(startT, function () { a.visible = true; a.animT = 0; }, -2);
      } else {
        a.visible = true;
      }
      var dAt = s.dissolveAt != null ? s.dissolveAt + offset : (s.dissolve ? a.movesEnd() + (s.dissolveDelay || 0.05) : null);
      if (dAt != null) tl.at(dAt, function () { a.update(dAt, 0); dissolveActor(a, s.burst); }, 0);
    });

    // Morph passes: one per distinct "at" time (items) or assembling time (sprites).
    var times = {};
    res.items.forEach(function (it) { times[it.when + offset] = 1; });
    for (var t in assembleAt) times[t] = 1;
    times[offset] = 1;
    var tlist = Object.keys(times).map(Number).sort(function (a, b) { return a - b; });
    tlist.forEach(function (time, idx) {
      var run = function () {
        var items = res.items.filter(function (it) { return it.when + offset <= time + 1e-6; });
        var targets = buildTargets(items, res.highlights, assembleAt[time] || null);
        var kind = idx === 0 ? o.transition : 'morph';
        applyTransition(kind, targets, o);
      };
      if (time <= 0) run(); else tl.at(time, run, 1);
    });

    cur.slide = si; cur.step = step;
    afterEnter();
  }

  function afterEnter() {
    try {
      var h = '#' + (cur.slide + 1) + '.' + cur.step;
      if (location.hash !== h) history.replaceState(null, '', h);
    } catch (e) { /* file:// in some browsers */ }
    broadcast();
    autoTimer = 0;
  }

  /* ---------------------------------------------------- navigation */
  function next() {
    finishAll();
    if (cur.step < stepsOf(cur.slide)) enterLive(cur.slide, cur.step + 1);
    else if (cur.slide < deck().length - 1) enterLive(cur.slide + 1, 0);
    else if (loopDeck) enterLive(0, 0);
  }
  function prev() {
    finishAll();
    if (cur.step > 0) enterSettled(cur.slide, cur.step - 1);
    else if (cur.slide > 0) enterSettled(cur.slide - 1, stepsOf(cur.slide - 1));
  }
  function goTo(si, step) {
    si = Math.max(0, Math.min(deck().length - 1, si | 0));
    step = Math.max(0, Math.min(stepsOf(si), step | 0));
    if (step === 0 && si === cur.slide + 1 && cur.step === stepsOf(cur.slide)) { next(); return; }
    enterSettled(si, step);
  }
  function replay() {
    finishAll();
    var si = cur.slide;
    if (si > 0) enterSettled(si - 1, stepsOf(si - 1), { transition: 'cut' });
    else { Field.clear(); actors = []; tl.clear(); }
    enterLive(si, 0);
  }
  function setBlackout(v) { blackout = v == null ? !blackout : !!v; broadcast(); toast(blackout ? 'BLACKOUT' : ''); }

  /* ---------------------------------------------------- rendering */
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var cw = Math.round(window.innerWidth * dpr), ch = Math.round(window.innerHeight * dpr);
    canvas.width = cw; canvas.height = ch;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    var S = Math.min(cw / W, ch / H);
    R.S = S;
    R.ox = Math.round((cw - W * S) / 2);
    R.oy = Math.round((ch - H * S) / 2);
    ctx.imageSmoothingEnabled = false;
  }
  R.cell = function (x, y) {
    var S = R.S, px = Math.round(x * S), py = Math.round(y * S);
    R.ctx.fillRect(R.ox + px, R.oy + py, Math.round((x + 1) * S) - px, Math.round((y + 1) * S) - py);
  };

  function draw() {
    var cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    var sw = Math.round(W * R.S), sh = Math.round(H * R.S);
    ctx.save();
    ctx.beginPath(); ctx.rect(R.ox, R.oy, sw, sh); ctx.clip();
    ctx.fillStyle = PALETTE.hex[bgIndex];
    ctx.fillRect(R.ox, R.oy, sw, sh);
    if (bgMode === 'starfield') Starfield.draw(R, T, twinkle);
    Field.draw(R);
    for (var i = 0; i < actors.length; i++) actors[i].draw(R);
    if (blackA > 0) {
      ctx.globalAlpha = blackA; ctx.fillStyle = '#000';
      ctx.fillRect(R.ox, R.oy, sw, sh); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function tick(dt) {
    T += dt;
    tl.update(dt, function (t) { for (var i = 0; i < actors.length; i++) actors[i].update(t, 0); });
    for (var i = 0; i < actors.length; i++) actors[i].update(tl.t, dt);
    Field.update(T);
    Field.idle(dt);
    blackA += ((blackout ? 1 : 0) - blackA) * Math.min(1, dt * 12);
    if (Math.abs(blackA - (blackout ? 1 : 0)) < 0.01) blackA = blackout ? 1 : 0;
    if (autoAdvance && !busy()) {
      autoTimer += dt;
      if (autoTimer >= autoAdvance) { autoTimer = 0; next(); }
    }
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
    var raw = lastTs ? (ts - lastTs) : 16.7;
    lastTs = ts;
    var w0 = performance.now();
    if (!manual) tick(dt);
    draw();
    workMs = performance.now() - w0;
    workAvg = workAvg * 0.95 + workMs * 0.05;
    frames++; fpsAcc += raw;
    if (fpsAcc >= 500) {
      fpsVal = frames * 1000 / fpsAcc; frames = 0; fpsAcc = 0;
      if (showFps) fpsEl.textContent = fpsVal.toFixed(0) + ' fps · ' + workAvg.toFixed(1) + ' ms/frame · ' +
        Field.count() + ' px · ' + (cur.slide + 1) + '.' + cur.step + (busy() ? ' · anim' : '');
    }
  }

  /* ---------------------------------------------------- overlays */
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.opacity = msg ? 1 : 0;
    clearTimeout(toast._t);
    if (msg && msg !== 'BLACKOUT') toast._t = setTimeout(function () { toastEl.style.opacity = 0; }, 1200);
  }

  /* ---------------------------------------------------- input */
  var gotoBuf = null, gotoTimer = 0;
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (gotoBuf != null) {
      if (/^[0-9.]$/.test(k)) { gotoBuf += k; showGoto(); e.preventDefault(); return; }
      if (k === 'Backspace') { gotoBuf = gotoBuf.slice(0, -1); showGoto(); e.preventDefault(); return; }
      if (k === 'Enter') {
        var parts = gotoBuf.split('.');
        var si = parseInt(parts[0], 10), st = parseInt(parts[1] || '0', 10);
        gotoBuf = null; showGoto();
        if (si > 0) goTo(si - 1, isNaN(st) ? 0 : st);
        e.preventDefault(); return;
      }
      gotoBuf = null; showGoto();
      if (k === 'Escape') { e.preventDefault(); return; }
    }
    var nav = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Spacebar: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 };
    if (nav[k]) {
      e.preventDefault();
      if (e.repeat) return;
      if (nav[k] > 0) next(); else prev();
      return;
    }
    switch (k) {
      case 'Home': e.preventDefault(); finishAll(); enterLive(0, 0); return;
      case 'End': e.preventDefault(); goTo(deck().length - 1, stepsOf(deck().length - 1)); return;
      case 'f': case 'F': showFps = !showFps; fpsEl.style.display = showFps ? 'block' : 'none'; return;
      case 'b': case 'B': case '.': setBlackout(); return;
      case 'r': case 'R': replay(); return;
      case 'n': case 'N': openNotes(); return;
      case 'g': case 'G': gotoBuf = ''; showGoto(); return;
    }
  }
  function showGoto() {
    clearTimeout(gotoTimer);
    if (gotoBuf == null) { gotoEl.style.opacity = 0; return; }
    gotoEl.textContent = 'GO TO SLIDE ' + gotoBuf + '_  (of ' + deck().length + ')';
    gotoEl.style.opacity = 1;
    gotoTimer = setTimeout(function () { gotoBuf = null; showGoto(); }, 5000);
  }

  /* ---------------------------------------------------- presenter sync */
  var notesWin = null;
  function openNotes() {
    try {
      notesWin = window.open('notes.html', 'pixeldeck-notes', 'width=1200,height=760');
      Sync.addPeer(notesWin);
    } catch (e) { /* popup blocked */ }
    setTimeout(broadcast, 400);
    setTimeout(broadcast, 1200);
  }
  function stateMsg() {
    var s = deck()[cur.slide] || {};
    return {
      type: 'state', slide: cur.slide, step: cur.step, steps: stepsOf(cur.slide),
      total: deck().length, id: s.id || '', blackout: blackout
    };
  }
  function broadcast() { if (window.Sync) Sync.send(stateMsg()); }
  function onSync(msg) {
    if (msg.type === 'hello') broadcast();
    if (msg.type !== 'cmd') return;
    switch (msg.cmd) {
      case 'next': next(); break;
      case 'prev': prev(); break;
      case 'goto': goTo(msg.slide, msg.step || 0); break;
      case 'blackout': setBlackout(); break;
      case 'replay': replay(); break;
    }
  }

  /* ---------------------------------------------------- boot */
  function parseHash() {
    var m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash || '');
    if (!m) return null;
    var si = Math.max(0, Math.min(deck().length - 1, parseInt(m[1], 10) - 1));
    return { slide: si, step: Math.max(0, Math.min(stepsOf(si), parseInt(m[2] || '0', 10))) };
  }

  function stressDeck(n) {
    function block(seed) {
      var pts = [], cols = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'cyan', 'blue', 'plum', 'white', 'silver'];
      var w = Math.ceil(Math.sqrt(n * 1.78)), h = Math.ceil(n / w);
      for (var i = 0; i < n; i++) {
        var x = i % w, y = (i / w) | 0;
        if (seed) {
          var a = i / n * Math.PI * 2 * 9, r = 8 + 80 * Math.sqrt(i / n);
          pts.push([160 + Math.cos(a) * r * 1.4, 90 + Math.sin(a) * r * 0.95, cols[(i * 7 / n | 0) % cols.length]]);
        } else pts.push([160 - (w >> 1) + x, 90 - (h >> 1) + y, cols[(x * cols.length / w) | 0]]);
      }
      return pts;
    }
    return [
      { id: 'stress-a', stagger: 'radial', entry: 'stars', shapes: [{ type: 'pixels', points: block(0) }], notes: 'Stress A' },
      { id: 'stress-b', stagger: 'leftToRight', exit: 'swirl', shapes: [{ type: 'pixels', points: block(1) }], notes: 'Stress B' }
    ];
  }

  function boot(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    R.ctx = ctx;
    fpsEl = document.getElementById('fps');
    gotoEl = document.getElementById('goto');
    toastEl = document.getElementById('toast');

    var q = new URLSearchParams(location.search);
    if (q.get('stress')) { window.DECK = stressDeck(Math.min(12000, parseInt(q.get('stress'), 10) || 6000)); loopDeck = true; }
    if (q.get('auto')) autoAdvance = parseFloat(q.get('auto')) || 3;
    if (q.get('loop')) loopDeck = true;
    if (q.get('fps')) { showFps = true; fpsEl.style.display = 'block'; }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('click', function (e) { e.preventDefault(); next(); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); prev(); });
    window.addEventListener('hashchange', function () {
      var h = parseHash();
      if (h && (h.slide !== cur.slide || h.step !== cur.step)) goTo(h.slide, h.step);
    });
    if (window.Sync) Sync.on(onSync);

    var start = parseHash() || { slide: 0, step: 0 };
    cur.slide = start.slide;
    if (start.step === 0) { cur.step = -1; enterLiveFresh(start.slide); }
    else enterSettled(start.slide, start.step);
    requestAnimationFrame(loop);
  }
  function enterLiveFresh(si) { cur.slide = -1; cur.step = 0; enterLive(si, 0); }

  /* ---------------------------------------------------- thumbnails (notes) */
  function renderThumb(cv, si, step) {
    var c = cv.getContext('2d');
    cv.width = W; cv.height = H;
    var slide = deck()[si];
    if (!slide) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); return; }
    var bg = pick('bg', slide);
    c.fillStyle = PALETTE.hex[(bg === 'starfield' || bg === 'none') ? 0 : PALETTE.index(bg, 0)];
    c.fillRect(0, 0, W, H);
    if (bg === 'starfield') Starfield.drawThumb(c);
    var res = resolve(si, step);
    var targets = buildTargets(res.items, res.highlights, null);
    for (var i = 0; i < targets.length; i++) {
      c.fillStyle = PALETTE.hex[targets[i].c];
      c.fillRect(targets[i].x, targets[i].y, 1, 1);
    }
    actorPlan(si, step).forEach(function (p) {
      if (p.gone) return;
      var a = newActor(p); a.animT = 0;
      a.cells().forEach(function (q) { c.fillStyle = PALETTE.hex[q.c]; c.fillRect(q.x, q.y, 1, 1); });
    });
  }

  /* ---------------------------------------------------- public */
  return {
    boot: boot,
    next: next, prev: prev, goTo: goTo, replay: replay, blackout: setBlackout,
    finish: finishAll,
    isBusy: busy,
    state: function () { return { slide: cur.slide, step: cur.step, particles: Field.count(), busy: busy(), fps: fpsVal, workMs: workAvg }; },
    info: function () { return deck().map(function (s, i) { return { id: s.id, steps: stepsOf(i), dwell: s.dwell }; }); },
    notesFor: function (si, step) {
      var s = deck()[si];
      if (!s) return '';
      var parts = [s.notes || ''];
      for (var k = 1; k <= step; k++) { var st = s.steps[k - 1]; if (st && st.notes) parts.push(st.notes); }
      return parts.filter(Boolean).join('\n\n');
    },
    stepsOf: stepsOf,
    renderThumb: renderThumb,
    // deterministic stepping for the video recorder
    setManualClock: function (v) { manual = !!v; },
    tick: function (dt) { tick(dt); draw(); },
    buildTargets: buildTargets, resolve: resolve
  };
})();

/* ------------------------------------------------------------ Sync
 * Stage <-> notes messaging. Uses BroadcastChannel, plus localStorage events
 * and direct window.postMessage as fallbacks (file:// quirks differ per browser).
 */
var Sync = (function () {
  var me = Math.random().toString(36).slice(2), seq = 0, handlers = [], seen = {}, peers = [];
  var bc = null;
  function recv(msg) {
    if (!msg || !msg.__pixeldeck || msg.from === me || seen[msg.mid]) return;
    seen[msg.mid] = 1;
    for (var i = 0; i < handlers.length; i++) handlers[i](msg);
  }
  try { bc = new BroadcastChannel('pixeldeck'); bc.onmessage = function (e) { recv(e.data); }; } catch (e) { bc = null; }
  window.addEventListener('storage', function (e) {
    if (e.key === 'pixeldeck:msg' && e.newValue) { try { recv(JSON.parse(e.newValue)); } catch (err) { } }
  });
  window.addEventListener('message', function (e) { if (e.data && e.data.__pixeldeck) recv(e.data); });
  function send(msg) {
    msg.__pixeldeck = 1; msg.from = me; msg.mid = me + ':' + (++seq); msg.ts = Date.now();
    if (bc) { try { bc.postMessage(msg); } catch (e) { } }
    try { localStorage.setItem('pixeldeck:msg', JSON.stringify(msg)); } catch (e) { }
    var targets = peers.slice();
    if (window.opener) targets.push(window.opener);
    for (var i = 0; i < targets.length; i++) {
      try { if (targets[i] && !targets[i].closed) targets[i].postMessage(msg, '*'); } catch (e) { }
    }
  }
  return {
    send: send,
    on: function (fn) { handlers.push(fn); },
    addPeer: function (w) { if (w && peers.indexOf(w) < 0) peers.push(w); }
  };
})();
