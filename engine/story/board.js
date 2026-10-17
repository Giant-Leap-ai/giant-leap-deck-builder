/* engine/story/board.js — storyboard generation: interview answers + a framework → TemplateScene[] (spec §6.5, WP5).
 *
 *   PD.story.board(story, { framework?, theme?, worlds?, assets? }) → TemplateScene[]
 *     story      StoryMeta (§6.1). Unanswered fields leave their {token} in the copy as a visible placeholder.
 *     framework  framework id (or a Framework object); default story.framework, else the recommended one for the goal and tone.
 *     theme      a theme id ('cosmos', 'slate', …: resolved through PD.theme), a resolved theme / any object with
 *                `worlds`, or omitted: the default look for story.tone (cinematic → cosmos, else slate).
 *     worlds     extra world plugin names the deck enables (meta.worlds).
 *     assets     what the user has dropped. Either { logo: assetId | null, photos: [assetId, …] } or the deck's asset
 *                map { [id]: AssetSource } where a source may say role: 'logo' | 'photo' and otherwise an image whose id or
 *                name contains "logo", "brand" or "mark" is the logo and every other image is a photo.
 *   → [{ id, template, props, beat, point, notes }]   TemplateScenes for DeckSource.scenes
 *
 * 1. Scene count n = clamp(round(targetMin·60/50), R, 24) with R = Σ max(1, b.min) over the required beats; n = R when
 *    targetMin is null. Allocation: every required beat starts with max(1, min) scenes and every optional beat with min.
 *    The quotas n·share are rounded down inside [base, max] and the scenes still missing go one by one to the beat with
 *    the largest remainder (quota − count) that has room under its max (ties: the earlier beat). When the beats cannot
 *    hold n scenes (Σ max < n) the board has Σ max scenes. The blank framework has no beats and gives [].
 * 2. Scenes follow the beat order; scenes of one beat are consecutive; ids are beatId, beatId-2, beatId-3 …
 * 3. Template (§6.5 step 4, literally): the first of b.templates whose requires.worlds (and requires.worldsFor(props)) are
 *    enabled in the theme's worlds, for every scene of the beat. Overrides: a proof beat consumes story.proof in order
 *    (number → big-number {value, label}, quote → quote {quote, who}, story / demo → statement {line}); an identity beat
 *    takes `logo` when a logo asset exists; an emotion or resolution beat takes `image` once, when a photo exists.
 * 4. props = the template's `seed` with the named tokens {brand} {tagline} {bigIdea} {shortIdea} {oldWay} {newWay} {ask}
 *    {audience} {proof1} {proof2} {proof3} replaced (an empty answer leaves its token). A token at the start of a string
 *    gets a capital letter; a trailing . ! ? of the answer is dropped before a punctuation mark of the seed. Every other
 *    {…} stays as a visible placeholder (PD.story.PLACEHOLDER).
 * 5. notes = '▸ ' + b.ask (a prompt, see PD.story.speech), beat = b.id, point = b.label + ': ' + b.ask.
 *
 *   PD.story.board.plan(story, framework) → { n, asked, required, counts: { [beatId]: scenes }, capacity }   step 1 on its
 *       own. n is the number of scenes the board has; asked is clamp(round(targetMin·60/50), R, 24) before the cap, so
 *       asked > n says "this slot wants more scenes than this framework can hold" (capacity = Σ max)
 *   PD.story.board.tokens(story) → { [name]: string }   the named tokens that have an answer
 *   PD.story.board.fill(value, tokens) → value           replace tokens in a string, array or plain object (a copy)
 *
 * Registration defines functions only: no DOM, no texture, no random number. */
PD.module('story/board', ['story/copy', 'story/frameworks'], function (PD, copy, fws) {
  var S = PD.story;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------------------------------------------------- 1. how many scenes per beat */
  function plan(story, fw) {
    var beats = (fw && fw.beats) || [], R = 0, cap = 0;
    beats.forEach(function (b) { if (b.required) R += Math.max(1, b.min); cap += b.max; });
    var t = story && story.targetMin;
    var asked = t == null || !isFinite(+t) || +t <= 0 ? R : clamp(Math.round(+t * 60 / 50), R, 24);
    var counts = {}, total = 0, quota = {}, order = [];
    var n = Math.min(asked, cap);
    beats.forEach(function (b) {
      var base = b.required ? Math.max(1, b.min) : b.min;
      quota[b.id] = n * b.share;
      counts[b.id] = clamp(Math.floor(quota[b.id]), base, b.max);
      total += counts[b.id];
      order.push(b);
    });
    // too many (the minimums outweigh the quotas): take from the most over-served beat that is above its minimum
    while (total > n) {
      var worst = null;
      order.forEach(function (b) {
        var base = b.required ? Math.max(1, b.min) : b.min;
        if (counts[b.id] > base && (worst === null || counts[b.id] - quota[b.id] > counts[worst.id] - quota[worst.id])) worst = b;
      });
      if (!worst) break;
      counts[worst.id]--; total--;
    }
    // too few: the largest remainder with room under its max gets the next scene
    while (total < n) {
      var best = null;
      order.forEach(function (b) {
        if (counts[b.id] < b.max && (best === null || quota[b.id] - counts[b.id] > quota[best.id] - counts[best.id])) best = b;
      });
      if (!best) break;
      counts[best.id]++; total++;
    }
    return { n: total, asked: asked, required: R, counts: counts, capacity: cap };
  }

  /* ---------------------------------------------------------- 4. tokens */
  var NAMED = ['brand', 'tagline', 'bigIdea', 'shortIdea', 'oldWay', 'newWay', 'ask', 'audience'];
  function tokens(story) {
    var out = {}, s = story || {};
    NAMED.forEach(function (k) { var v = typeof s[k] === 'string' ? s[k].trim() : ''; if (v) out[k] = v; });
    arr(s.proof).slice(0, 3).forEach(function (p, i) { var v = p && typeof p.text === 'string' ? p.text.trim() : ''; if (v) out['proof' + (i + 1)] = v; });
    return out;
  }
  function fillString(str, tk) {
    return str.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, function (m, name, at) {
      if (!has(tk, name)) return m;
      var v = tk[name], next = str.charAt(at + m.length);
      if (/[.,!?:;\u2026]/.test(next)) v = v.replace(/[.!?\u2026]+$/, '');
      if (at === 0) v = v.charAt(0).toUpperCase() + v.slice(1);
      return v;
    });
  }
  function fill(value, tk) {
    if (typeof value === 'string') return fillString(value, tk);
    if (Array.isArray(value)) return value.map(function (x) { return fill(x, tk); });
    if (isObj(value)) { var o = {}; for (var k in value) if (has(value, k)) o[k] = fill(value[k], tk); return o; }
    return value;
  }

  /* ---------------------------------------------------------- templates and assets */
  function worldsOf(story, opts) {
    var list = [], th = opts.theme, id;
    if (isObj(th)) list = arr(th.worlds);
    else {
      id = typeof th === 'string' && th ? th : fws.defaultTheme(story && story.tone);
      if (!PD.theme.has(id)) throw new Error('pixeldeck: PD.story.board: theme "' + id + '" is not registered');
      list = PD.theme.resolve(id).worlds || [];
    }
    var out = ['core'];
    list.concat(arr(opts.worlds)).forEach(function (w) { if (typeof w === 'string' && out.indexOf(w) < 0) out.push(w); });
    return out;
  }
  function usable(id, worlds, props) {
    var T = PD.template.get(id);
    if (!T) return false;
    var req = T.requires || {}, need = arr(req.worlds);
    if (typeof req.worldsFor === 'function') { try { need = need.concat(arr(req.worldsFor(props || T.seed || {}))); } catch (e) { } }
    return need.every(function (w) { return worlds.indexOf(w) >= 0; });
  }
  function classify(assets) {
    var logo = null, photos = [];
    if (!assets || typeof assets !== 'object') return { logo: logo, photos: photos };
    if (has(assets, 'logo') || has(assets, 'photos')) return { logo: assets.logo || null, photos: arr(assets.photos).filter(Boolean) };
    Object.keys(assets).forEach(function (id) {
      var a = assets[id];
      if (!a || a.type !== 'image') return;
      var role = a.role || (/logo|brand|mark/i.test(id + ' ' + (a.name || '')) ? 'logo' : 'photo');
      if (role === 'logo') { if (logo === null) logo = id; } else photos.push(id);
    });
    return { logo: logo, photos: photos };
  }
  function seedOf(id) {
    var T = PD.template.get(id);
    return T && isObj(T.seed) ? T.seed : {};
  }
  function merge(base, extra) { var o = {}, k; for (k in base) if (has(base, k)) o[k] = base[k]; for (k in extra) if (has(extra, k)) o[k] = extra[k]; return o; }

  // §6.5 step 4: the first entry of b.templates that the theme satisfies. When none does (a catalog that lacks them all) the
  // adaptive `statement`, or the beat's first template while the catalog is not loaded at all (a stub fixture).
  function pickTemplate(b, worlds, catalogKnown) {
    for (var i = 0; i < b.templates.length; i++) if (usable(b.templates[i], worlds, seedOf(b.templates[i]))) return b.templates[i];
    if (!catalogKnown) return b.templates[0];
    return usable('statement', worlds) ? 'statement' : b.templates[0];
  }

  /* ---------------------------------------------------------- the board */
  function board(story, opts) {
    opts = opts || {};
    story = story || {};
    var f0 = opts.framework || story.framework;
    var fw = isObj(f0) && Array.isArray(f0.beats) ? f0 : fws.framework(f0) || fws.framework(fws.recommend(story).id);
    if (!fw || !fw.beats.length) return [];
    var worlds = worldsOf(story, opts), tk = tokens(story), assets = classify(opts.assets);
    var counts = plan(story, fw).counts;
    var catalogKnown = PD.template.list().some(function (id) { return fw.beats.some(function (b) { return b.templates.indexOf(id) >= 0; }); });
    var proofs = arr(story.proof).filter(function (p) { return p && ((typeof p.text === 'string' && p.text.trim()) || isFinite(+p.value) && p.value !== '' && p.value != null); });
    var pi = 0, photo = 0, imageUsed = false, out = [];

    fw.beats.forEach(function (b) {
      for (var j = 0; j < counts[b.id]; j++) {
        var tpl = null, extra = null;
        if (b.roles.indexOf('proof') >= 0 && pi < proofs.length) {
          var pf = proofs[pi], text = typeof pf.text === 'string' ? pf.text.trim() : '';
          var want = pf.kind === 'number' ? 'big-number' : pf.kind === 'quote' ? 'quote' : 'statement';
          if (usable(want, worlds, seedOf(want))) {
            pi++; tpl = want;
            if (want === 'big-number') { extra = {}; if (text) extra.label = text; if (pf.value != null && pf.value !== '' && isFinite(+pf.value)) extra.value = +pf.value; }
            else if (want === 'quote') { extra = {}; if (text) extra.quote = text; if (typeof pf.who === 'string' && pf.who.trim()) extra.who = pf.who.trim(); }
            else if (text) extra = { line: text };
          }
        }
        if (!tpl && b.roles.indexOf('identity') >= 0 && assets.logo && usable('logo', worlds, merge(seedOf('logo'), { asset: assets.logo }))) {
          tpl = 'logo'; extra = { asset: assets.logo };
        }
        if (!tpl && !imageUsed && photo < assets.photos.length && (b.roles.indexOf('emotion') >= 0 || b.roles.indexOf('resolution') >= 0) &&
            usable('image', worlds, merge(seedOf('image'), { asset: assets.photos[photo] }))) {
          tpl = 'image'; extra = { asset: assets.photos[photo++] }; imageUsed = true;
        }
        if (!tpl) tpl = pickTemplate(b, worlds, catalogKnown);
        var props = fill(merge(seedOf(tpl), extra || {}), tk);
        out.push({ id: j === 0 ? b.id : b.id + '-' + (j + 1), template: tpl, props: props, beat: b.id, point: b.label + ': ' + b.ask, notes: '\u25b8 ' + b.ask });
      }
    });
    return out;
  }
  board.plan = plan; board.tokens = tokens; board.fill = fill;

  S.board = board;
  return { board: board, plan: plan, tokens: tokens, fill: fill };
}, { export: false });
