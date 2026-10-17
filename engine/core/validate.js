/* engine/core/validate.js — PD.validate(compiled) → Issue[] (spec §4.3 "Validate codes"; WP4). Studio and tools only.
 *
 *   Issue = { level: 'error' | 'warn', code, scene: number, sceneId: string, step?: number, path?: string, msg: string }
 *   scene is the index in compiled.scenes; step is the state (0 = the scene itself, k = after click k) when the finding
 *   belongs to one; path says where in the expanded scene (or in a template's props) it was found. A deck-level finding
 *   (a theme font that is missing) is attached to scene 0. Nothing here throws on a malformed deck: a scene that cannot
 *   be checked yields one 'validate.failed' warning and the other scenes are still checked.
 *
 * What it checks, per code (spec §4.3):
 *   scene.duplicate-id          two scenes share an id
 *   world.unknown-param         a world / timing key that no registered world owns                        (warn)
 *   world.needs-plugin          the key belongs to a world this deck's theme does not enable
 *   style.unknown               a text style that is not in theme.styles
 *   reveal.unknown / exit.unknown   a name that is neither built in nor in PD.reveal / PD.exitFx; also a counter
 *                               element asked to reveal with particles (it cannot; reported as a warning)
 *   motion.unknown              a bad stagger / entry / exit / match value                                (warn)
 *   shape.unknown, element.unknown-kind
 *   asset.missing / asset.not-embedded / asset.wrong-type   image elements, world.photoAsset and the theme's font faces
 *   template.unknown, template.expand-failed    (found by PD.compile; repeated here so one call tells the whole story)
 *   template.requires-world     the template needs a world the deck does not enable
 *   template.prop-required / template.prop-type / template.prop-max   a template scene's props against T.props
 *   text.overflow               measured wider than maxWidth, or the block leaves the 1920 x 1080 frame     (warn)
 *   particles.budget            estimated targets in one state: warn above 8000, error above 9000 (Field.MAX)
 *   steps.remove-unknown        a step removes an id that nothing visible has                              (warn)
 * Template props are checked after the same normalization PD.compile applies (defaults, coercion), so what is reported
 * is what the template really received.
 *
 * Validation draws no random number and allocates no texture. It measures text and (for particle counts) samples glyphs
 * through the 'text' element, reusing one measurement per spec object and theme (spec objects are immutable for the life
 * of a compiled deck). Registered with { export: false }: the Studio and tools use it, an exported deck does not. */
PD.module('core/validate', ['core/util', 'core/text', 'core/compile'], function (PD, util, text, compileMod) {
  var DW = util.DW, DH = util.DH, colFor = util.colFor;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function typeOf(v) { return Array.isArray(v) ? 'a list' : v === null ? 'empty' : typeof v === 'number' ? 'a number' : typeof v === 'string' ? 'text' : typeof v === 'boolean' ? 'a yes/no' : typeof v === 'object' ? 'an object' : typeof v; }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  var CODES = [
    'scene.duplicate-id', 'world.unknown-param', 'world.needs-plugin', 'style.unknown', 'reveal.unknown', 'exit.unknown',
    'motion.unknown', 'shape.unknown', 'element.unknown-kind', 'asset.missing', 'asset.not-embedded', 'asset.wrong-type',
    'template.unknown', 'template.requires-world', 'template.prop-required', 'template.prop-type', 'template.prop-max',
    'template.expand-failed', 'text.overflow', 'particles.budget', 'steps.remove-unknown'
  ];
  // the motion values engine/core/field.js understands (anything else silently falls back to its default)
  var MOTION = {
    stagger: ['random', 'radial', 'leftToRight', 'rightToLeft', 'topDown', 'bottomUp', 'none'],
    entry: ['void', 'spark', 'edges', 'stars', 'center', 'below'],
    exit: ['drift', 'warp', 'scatter', 'fade', 'rise', 'implode'],
    match: ['angle']
  };
  var WARN_AT = 8000, ERROR_AT = 9000;                    // spec §4.3 particles.budget; ERROR_AT is Field.MAX

  /* world parameter ownership (core/stage.js adds PD.world.owner; without it the registry is scanned) */
  function ownerOf(param) {
    if (typeof PD.world.owner === 'function') return PD.world.owner(param);
    var names = PD.world.list();
    for (var i = 0; i < names.length; i++) { var d = PD.world.get(names[i]); if (d && d.params && has(d.params, param)) return names[i]; }
    return undefined;
  }

  var measured = new WeakMap();                           // text spec → { key, box, n } for the theme key it was measured under

  function validate(compiled) {
    if (!compiled || !Array.isArray(compiled.scenes) || !compiled.theme) throw new Error('pixeldeck: PD.validate needs a CompiledDeck (PD.compile)');
    var out = [], theme = compiled.theme, styles = theme.styles || {}, worlds = arr(compiled.worlds);
    var aid = compiled.assetsDeckId || compiled.id, assetMap = PD.assets.get(aid);
    var col = colFor(theme.colors || {});
    var TextE = PD.element.get('text');
    var elEnv = { theme: theme, col: col, stage: null, assets: function (id) { return typeof PD.asset === 'function' ? PD.asset(aid, id) : null; } };
    var H = null;
    function helpers() { return H || (H = compileMod.helpers(compiled)); }

    var seenIds = {};
    compiled.scenes.forEach(function (sc, i) {
      var src = compiled.source && Array.isArray(compiled.source.scenes) ? compiled.source.scenes[i] : sc;
      var sceneId = isObj(sc) && sc.id != null ? String(sc.id) : '';
      function add(level, code, msg, o) {
        var is = { level: level, code: code, scene: i, sceneId: sceneId };
        if (o && o.step) is.step = o.step;
        if (o && o.path) is.path = o.path;
        is.msg = msg;
        out.push(is);
      }
      try {
        /* issues PD.compile found while expanding this scene */
        arr(compiled.errors).forEach(function (e) {
          if (e && e.scene === i) {
            var c = {}; for (var k in e) c[k] = e[k];
            out.push(c);
          }
        });
        if (!isObj(sc)) return;

        if (sceneId) {
          if (has(seenIds, sceneId)) add('error', 'scene.duplicate-id', 'Scene id "' + sceneId + '" is already used by scene ' + (seenIds[sceneId] + 1) + '.', { path: 'id' });
          else seenIds[sceneId] = i;
        }

        if (isObj(src) && src.template !== undefined) checkTemplate(src, add);

        var states = statesOf(sc);
        var budgetWorst = null;
        states.forEach(function (st, k) {
          st.unknownRemove.forEach(function (r) {
            add('warn', 'steps.remove-unknown', 'Step ' + k + ' removes "' + r[1] + '", but nothing visible has that id.', { step: k, path: 'steps[' + (k - 1) + '].remove[' + r[0] + ']' });
          });
          var n = 0;
          st.items.forEach(function (it) { n += itemCount(it); });
          st.shapes.forEach(function (it) { n += shapeCount(it.spec); });
          if (!budgetWorst || n > budgetWorst.n) budgetWorst = { n: n, k: k };
        });
        if (budgetWorst && budgetWorst.n > WARN_AT) {
          var over = budgetWorst.n > ERROR_AT, k0 = budgetWorst.k;
          add(over ? 'error' : 'warn', 'particles.budget',
            'Scene ' + (i + 1) + (k0 ? ', after click ' + k0 + ',' : '') + ' asks for about ' + budgetWorst.n + ' particles. ' +
            (over ? 'The field holds ' + ERROR_AT + ', so part of the shape will be missing.' : 'Above ' + WARN_AT + ' the frame rate starts to suffer.'),
            { step: k0 || undefined });
        }

        /* world and timing keys, motion values (scene, then each step) */
        checkKeys(sc.world, 'world', 0, add); checkKeys(sc.timing, 'timing', 0, add); checkMotion(sc.motion, 0, add);
        checkAssetParam(sc.world, 0, add);
        arr(sc.steps).forEach(function (st, s) {
          if (!isObj(st)) return;
          var step = s + 1;
          checkKeys(st.world, 'steps[' + s + '].world', step, add); checkKeys(st.timing, 'steps[' + s + '].timing', step, add);
          checkMotion(st.motion, step, add, 'steps[' + s + '].motion');
          checkAssetParam(st.world, step, add, 'steps[' + s + '].world');
        });

        /* the specs of every state, once each */
        specsOf(sc, function (spec, kind, step, path) { checkSpec(spec, kind, step, path, add); });
      } catch (e) {
        add('warn', 'validate.failed', 'Checking this scene failed: ' + (e && e.message ? e.message : String(e)));
      }
    });

    /* the theme's font faces need embedded font assets; reported on scene 0 */
    if (compiled.scenes.length && Array.isArray(theme.fontFaces)) {
      theme.fontFaces.forEach(function (ff, j) {
        if (!ff || ff.asset == null) return;
        var sc0 = compiled.scenes[0], id0 = isObj(sc0) && sc0.id != null ? String(sc0.id) : '';
        assetIssue(ff.asset, 'font', 'theme.fontFaces[' + j + '].asset', function (level, code, msg, o) {
          out.push({ level: level, code: code, scene: 0, sceneId: id0, path: o.path, msg: msg });
        });
      });
    }
    return out;

    /* ------------------------------------------------------------ templates */
    function checkTemplate(src, add) {
      var T = PD.template.get(src.template);
      if (!T) return;                                              // template.unknown came from compile
      var props = compileMod.normalizeProps(T.props, T.example, src.props), label = T.label || src.template;
      var need = arr(T.requires && T.requires.worlds);
      if (T.requires && typeof T.requires.worldsFor === 'function') {
        try { need = need.concat(arr(T.requires.worldsFor(props))); } catch (e) { }
      }
      need.forEach(function (w) {
        if (worlds.indexOf(w) < 0 || !PD.world.has(w))
          add('error', 'template.requires-world', '"' + label + '" needs the "' + w + '" world, which this deck\'s theme does not enable.', { path: 'template' });
      });
      checkProps(T.props, props, 'props', add);
    }
    function checkProps(schema, props, path, add) {
      if (!isObj(schema)) return;
      for (var k in schema) if (has(schema, k) && isObj(schema[k])) checkValue(schema[k], isObj(props) ? props[k] : undefined, path + '.' + k, add);
    }
    function checkValue(ps, v, path, add) {
      var label = ps.label || path.replace(/^props\./, '');
      var textish = ps.type === 'text' || ps.type === 'longtext' || ps.type === 'asset' || ps.type === 'color' || ps.type === 'enum' || ps.type === 'shot' || ps.type === 'nebula';
      var missing = v === undefined || v === null || (textish && v === '') || (ps.type === 'list' && Array.isArray(v) && v.length === 0);
      if (missing) {
        if (ps.required) add('error', 'template.prop-required', '"' + label + '" is required. Fill it in.', { path: path });
        return;
      }
      switch (ps.type) {
        case 'text': case 'longtext':
          if (typeof v !== 'string') return add('error', 'template.prop-type', '"' + label + '" should be text, not ' + typeOf(v) + '.', { path: path });
          if (ps.max != null && v.length > ps.max)
            return add('warn', 'template.prop-max', '"' + label + '" is ' + v.length + ' characters. The limit is ' + ps.max + '.', { path: path });
          if (ps.lines && ps.style) {
            var m = null;
            try { m = helpers().measure(v, ps.style, ps.size); } catch (e) { }
            if (m && m.lines.length > ps.lines)
              add('warn', 'template.prop-max', '"' + label + '" wraps onto ' + m.lines.length + ' lines. The limit is ' + ps.lines + '.', { path: path });
          }
          return;
        case 'number':
          if (typeof v !== 'number' || !isFinite(v)) return add('error', 'template.prop-type', '"' + label + '" should be a number, not ' + typeOf(v) + '.', { path: path });
          if ((ps.min != null && v < ps.min) || (ps.max != null && v > ps.max))
            add('warn', 'template.prop-max', '"' + label + '" is ' + v + ', outside ' + (ps.min != null ? ps.min : 'any') + ' to ' + (ps.max != null ? ps.max : 'any') + '.', { path: path });
          return;
        case 'bool':
          if (typeof v !== 'boolean') add('error', 'template.prop-type', '"' + label + '" should be yes or no, not ' + typeOf(v) + '.', { path: path });
          return;
        case 'color':
          if (typeof v !== 'string' || !(has(theme.colors || {}, v) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)))
            add('error', 'template.prop-type', '"' + label + '" is not a colour of this theme or a #hex value.', { path: path });
          return;
        case 'enum':
          if (arr(ps.options).indexOf(v) < 0) add('error', 'template.prop-type', '"' + label + '" should be one of ' + arr(ps.options).join(', ') + '.', { path: path });
          return;
        case 'nebula':
          if (typeof v !== 'string') return add('error', 'template.prop-type', '"' + label + '" should be a nebula name.', { path: path });
          if (isObj(theme.nebulae) && !has(theme.nebulae, v))
            add('error', 'template.prop-type', '"' + label + '": this theme has no nebula "' + v + '" (' + Object.keys(theme.nebulae).join(', ') + ').', { path: path });
          return;
        case 'asset': case 'shot':
          if (typeof v !== 'string') add('error', 'template.prop-type', '"' + label + '" should be a name (text), not ' + typeOf(v) + '.', { path: path });
          return;
        case 'list':
          if (!Array.isArray(v)) return add('error', 'template.prop-type', '"' + label + '" should be a list, not ' + typeOf(v) + '.', { path: path });
          if (ps.max != null && v.length > ps.max) add('warn', 'template.prop-max', '"' + label + '" has ' + v.length + ' items. The limit is ' + ps.max + '.', { path: path });
          else if (ps.min != null && v.length < ps.min) add('warn', 'template.prop-max', '"' + label + '" has ' + v.length + ' item' + (v.length === 1 ? '' : 's') + '. It needs at least ' + ps.min + '.', { path: path });
          v.forEach(function (item, j) {
            var here = path + '[' + j + ']', of = ps.of;
            if (of == null) return;
            if (isObj(of) && typeof of.type === 'string') checkValue(of, item, here, add);
            else if (typeof of === 'string') checkValue({ type: of, label: label }, item, here, add);
            else if (isObj(of)) {
              if (!isObj(item)) return add('error', 'template.prop-type', '"' + label + '" item ' + (j + 1) + ' should be an object, not ' + typeOf(item) + '.', { path: here });
              checkProps(of, item, here, add);
            }
          });
          return;
      }
    }

    /* ------------------------------------------------------------ states */
    // the items and shapes visible in each state, as Stage.resolve builds them (spec §4.2)
    function statesOf(sc) {
      var items = arr(sc.text).filter(isObj).map(function (t) { return { spec: t, kind: 'text' }; })
        .concat(arr(sc.elements).filter(isObj).map(function (e) { return { spec: e, kind: e.kind }; }));
      var shapes = arr(sc.particles).filter(isObj).map(function (s) { return { spec: s }; });
      var states = [{ items: items, shapes: shapes, unknownRemove: [] }], steps = arr(sc.steps);
      for (var s = 1; s <= steps.length; s++) {
        var step = isObj(steps[s - 1]) ? steps[s - 1] : {}, prev = states[s - 1];
        var cur = { items: prev.items.slice(), shapes: prev.shapes.slice(), unknownRemove: [] };
        if (step.clear) { cur.items = []; cur.shapes = []; }
        if (step.remove !== undefined) {
          var rm = arr(step.remove);
          rm.forEach(function (id, j) {
            var hit = cur.items.some(function (it) { return it.spec.id === id; }) || cur.shapes.some(function (it) { return it.spec.id === id; });
            if (!hit) cur.unknownRemove.push([j, id]);
          });
          cur.items = cur.items.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
          cur.shapes = cur.shapes.filter(function (it) { return rm.indexOf(it.spec.id) < 0; });
        }
        arr(step.text).filter(isObj).forEach(function (t) { cur.items.push({ spec: t, kind: 'text' }); });
        arr(step.elements).filter(isObj).forEach(function (e) { cur.items.push({ spec: e, kind: e.kind }); });
        arr(step.particles).filter(isObj).forEach(function (t) { cur.shapes.push({ spec: t }); });
        states.push(cur);
      }
      return states;
    }
    // visits every text / element / shape spec of the scene once: fn(spec, kind, step, path); kind 'shape' for particles
    function specsOf(sc, fn) {
      function visit(holder, step, base) {
        arr(holder.text).forEach(function (t, j) { if (isObj(t)) fn(t, 'text', step, base + 'text[' + j + ']'); });
        arr(holder.elements).forEach(function (e, j) { if (isObj(e)) fn(e, e.kind, step, base + 'elements[' + j + ']'); });
        arr(holder.particles).forEach(function (p, j) { if (isObj(p)) fn(p, 'shape', step, base + 'particles[' + j + ']'); });
      }
      visit(sc, 0, '');
      arr(sc.steps).forEach(function (st, s) { if (isObj(st)) visit(st, s + 1, 'steps[' + s + '].'); });
    }

    /* ------------------------------------------------------------ world, timing, motion */
    function checkKeys(obj, base, step, add) {
      if (!isObj(obj)) return;
      var kind = /timing$/.test(base) ? 'timing' : 'world';
      for (var k in obj) {
        if (!has(obj, k)) continue;
        var owner = ownerOf(k), o = { step: step || undefined, path: base + '.' + k };
        if (owner === undefined) add('warn', 'world.unknown-param', 'No world has a parameter "' + k + '" (in ' + kind + ').', o);
        else if (worlds.indexOf(owner) < 0)
          add('error', 'world.needs-plugin', '"' + k + '" belongs to the "' + owner + '" world, which this deck\'s theme does not enable.', o);
      }
    }
    function checkMotion(m, step, add, base) {
      if (!isObj(m)) return;
      for (var k in MOTION) {
        if (has(m, k) && m[k] !== undefined && MOTION[k].indexOf(m[k]) < 0)
          add('warn', 'motion.unknown', 'Motion ' + k + ' "' + m[k] + '" is not one of ' + MOTION[k].join(', ') + '.', { step: step || undefined, path: (base || 'motion') + '.' + k });
      }
    }
    function checkAssetParam(w, step, add, base) {                 // the photo world's picture is an image asset
      if (isObj(w) && typeof w.photoAsset === 'string' && w.photoAsset)
        assetIssue(w.photoAsset, 'image', (base || 'world') + '.photoAsset', function (level, code, msg, o) { add(level, code, msg, { step: step || undefined, path: o.path }); });
    }

    /* ------------------------------------------------------------ assets */
    function assetIssue(id, want, path, report) {
      var o = { path: path };
      if (typeof id !== 'string' || !id) return report('error', 'asset.missing', 'No ' + want + ' asset is chosen here.', o);
      if (!has(assetMap, id) || !isObj(assetMap[id])) return report('error', 'asset.missing', 'The ' + want + ' asset "' + id + '" is not in this deck\'s assets.', o);
      var a = assetMap[id];
      if (typeof a.src !== 'string' || a.src.slice(0, 5) !== 'data:') return report('error', 'asset.not-embedded', '"' + id + '" is a file link, not an embedded data: URL, so it cannot be shown or exported.', o);
      if (a.type !== want) report('error', 'asset.wrong-type', '"' + id + '" is ' + (a.type === 'image' || a.type === 'font' ? 'a ' + a.type : 'not a ' + want) + ', but a ' + want + ' is needed here.', o);
    }

    /* ------------------------------------------------------------ specs */
    function checkSpec(spec, kind, step, path, add) {
      var at = function (p) { return { step: step || undefined, path: path + (p ? '.' + p : '') }; };
      if (kind === 'shape') {
        if (!PD.shape.has(spec.shape)) add('error', 'shape.unknown', 'Unknown particle shape "' + spec.shape + '". Known: ' + PD.shape.list().join(', ') + '.', at('shape'));
        return;
      }
      if (kind === undefined || kind === null || kind === '' || !PD.element.has(kind)) {
        add('error', 'element.unknown-kind', 'Unknown element kind "' + kind + '". Known: ' + PD.element.list().join(', ') + '.', at('kind'));
        return;
      }
      if (kind === 'text' || kind === 'counter') {
        var sname = spec.style === undefined ? (kind === 'counter' ? 'mega' : undefined) : spec.style;
        if (sname !== undefined && !has(styles, sname)) add('error', 'style.unknown', 'Unknown text style "' + sname + '". This theme has: ' + Object.keys(styles).join(', ') + '.', at('style'));
      }
      if (spec.reveal !== undefined && text.REVEALS.indexOf(spec.reveal) < 0 && !PD.reveal.has(spec.reveal))
        add('error', 'reveal.unknown', 'Unknown reveal "' + spec.reveal + '".', at('reveal'));
      if (kind === 'counter' && spec.reveal === 'particles')
        add('warn', 'reveal.unknown', 'A counter cannot reveal with particles; use big-number\'s particles option (text) instead.', at('reveal'));
      if (spec.exit !== undefined && text.EXITS.indexOf(spec.exit) < 0 && !PD.exitFx.has(spec.exit))
        add('error', 'exit.unknown', 'Unknown exit "' + spec.exit + '".', at('exit'));
      if (kind === 'image') assetIssue(spec.asset, 'image', path + '.asset', function (level, code, msg, o) { add(level, code, msg, { step: step || undefined, path: o.path }); });
      if (kind === 'text' || kind === 'counter') checkOverflow(spec, kind, step, path, add);
    }

    /* text.overflow: measured wider than its limit, or the block leaves the frame */
    function boxOf(spec, kind) {
      var E = PD.element.get(kind);
      if (!E || typeof E.measure !== 'function') return null;
      if (kind === 'text') {
        var c = measured.get(spec);
        if (c && c.key === theme.key && c.box !== undefined) return c.box;
        var box = null;
        try { box = E.measure(spec, elEnv); } catch (e) { box = null; }
        measured.set(spec, { key: theme.key, box: box, n: c && c.key === theme.key ? c.n : undefined });
        return box;
      }
      try { return E.measure(spec, elEnv); } catch (e) { return null; }
    }
    function checkOverflow(spec, kind, step, path, add) {
      if (kind === 'text' && spec.str == null) return;
      var box = boxOf(spec, kind);
      if (!box || !isFinite(box.w)) return;
      var st = has(styles, spec.style) ? styles[spec.style] : styles.title || {};
      var maxW = spec.maxWidth != null ? spec.maxWidth : st.maxWidth || 1700, s = kind === 'text' ? clip(spec.str, 36) : 'the number';
      var o = { step: step || undefined, path: path };
      if (box.w > maxW + 0.5)
        add('warn', 'text.overflow', '"' + s + '" is ' + Math.round(box.w) + ' px wide; its limit is ' + maxW + ' px. Shorten it or step down a style.', o);
      else if (box.x < -0.5 || box.x + box.w > DW + 0.5 || box.y < -0.5 || box.y + box.h > DH + 0.5)
        add('warn', 'text.overflow', '"' + s + '" runs off the ' + DW + ' x ' + DH + ' frame.', o);
    }

    /* particles.budget: estimated targets */
    function shapeCount(spec) {
      var def = PD.shape.get(spec.shape);
      if (!def) return 0;
      if (def.particleCount) { try { return +def.particleCount(spec, elEnv) || 0; } catch (e) { return 0; } }
      switch (spec.shape) {
        case 'spark': return spec.count || 700;
        case 'cube': return 12 * (spec.perEdge || 46);
        case 'swarm': return spec.count || 500;
        case 'points':
          try { var pts = typeof spec.points === 'function' ? spec.points() : spec.points; return Array.isArray(pts) ? pts.length : 0; } catch (e) { return 0; }
      }
      return 0;
    }
    function itemCount(it) {
      var spec = it.spec;
      if (spec.reveal !== 'particles') return 0;
      var E = PD.element.get(it.kind);
      if (!E || typeof E.particleCount !== 'function') return 0;
      if (it.kind !== 'text') {                              // pictures depend on decode state: counted only once decoded, never cached
        if (spec.asset !== undefined) { var ra = elEnv.assets(spec.asset); if (!ra || !ra.ok) return 0; }
        try { return +E.particleCount(spec, elEnv) || 0; } catch (e) { return 0; }
      }
      var c = measured.get(spec);
      if (c && c.key === theme.key && c.n !== undefined) return c.n;
      var n = 0;
      try { n = +E.particleCount(spec, elEnv) || 0; } catch (e) { n = 0; }
      measured.set(spec, { key: theme.key, box: c && c.key === theme.key ? c.box : undefined, n: n });
      return n;
    }
  }

  PD.validate = validate;
  return { validate: validate, CODES: CODES };
}, { export: false });
