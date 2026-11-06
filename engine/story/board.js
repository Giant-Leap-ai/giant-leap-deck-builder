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
 * 1. Scene count n = clamp(round(targetMin·60/50), R, 24) with R = Σ base over the beats; n = R when targetMin is null.
 *    Allocation: every required beat starts with max(1, min) scenes and every optional beat with min, and a proof beat
 *    with at least one scene per proof row of the story (in beat order, up to its max: PD.story.baseCounts), so R is
 *    §6.5's Σ max(1, b.min) plus the proofs that need a scene of their own. Without that, sparkline at 5 minutes had two
 *    contrast scenes for three proofs and the third (often the story, the strongest proof a small business has) was
 *    silently dropped. The quotas n·share are rounded down inside [base, max] and the scenes still missing go one by one
 *    to the beat with the largest remainder (quota − count) that has room under its max (ties: the earlier beat). When
 *    the beats cannot hold n scenes (Σ max < n) the board has Σ max scenes. The blank framework has no beats and gives [].
 * 2. Scenes follow the beat order; scenes of one beat are consecutive; ids are beatId, beatId-2, beatId-3 …
 * 3. Template (§6.5 step 4 with AMEND-10's rotation). A beat's eligible templates are the entries of b.templates whose
 *    requires.worlds (and requires.worldsFor(seed)) are enabled in the theme's worlds, leaving out a template that needs
 *    an asset (logo, image: a required `asset` prop, or `asset` in its seed) unless the board can give it one: `logo` is
 *    eligible when a logo asset exists, `image` never (it is the once-only override below). The overrides come first:
 *    a proof beat consumes story.proof in order (number → big-number {value, label, suffix}: suffix '%' when the words start
 *    with '%', "percent" or "of", else '' rather than the template's default '%'; quote → quote {quote, who},
 *    story / demo → statement {line}; a number row with no value has no number to show, so it is a statement {line} too:
 *    the board never puts a number on screen that nobody gave); an identity beat takes `logo` when a logo asset exists;
 *    an emotion or resolution beat takes `image` once, when a photo exists. Every other scene rotates: it takes the first
 *    eligible template the beat has not used yet (so a beat's first scene is its first eligible template), and once every
 *    one has been used, the eligible template after the previous scene's, cycling. A beat with ONE eligible template does
 *    not repeat that shot: after it comes the adaptive `statement`, and the two alternate (psf's solution with no logo is
 *    brand-reveal then statement, not the same name and tagline twice; a beat whose one template is statement repeats it).
 *    A beat with no eligible template uses the adaptive `statement` (or its first template while the catalog is not loaded
 *    at all, a stub fixture).
 * 4. props = the template's `seed` with the named tokens {brand} {tagline} {bigIdea} {shortIdea} {oldWay} {newWay} {ask}
 *    {audience} {proof1} {proof2} {proof3} replaced (an empty answer leaves its token). A token at the start of a string
 *    gets a capital letter when its first word is all lower-case ("automation" → "Automation"; "iPads", "eBay" stay as
 *    typed); {brand} and {tagline} are always kept exactly as typed. A token inside a sentence ("Not {oldWay}.") loses the
 *    capital of an answer typed in sentence case: a Title-case first word followed only by lower-case words ("Stale
 *    bread" → "Not stale bread."), unless that word is a word of the brand; one word ("Excel") or a capitalised name
 *    ("Google Sheets") stays as typed. A trailing . ! ? of the answer is dropped before a punctuation mark of the seed.
 *    Every other {…} stays as a visible placeholder (PD.story.PLACEHOLDER), a prompt for the author (AMEND-10).
 * 5. notes = '▸ ' + b.ask (a prompt, see PD.story.speech), beat = b.id, point = b.label + ': ' + b.ask. The first scene's
 *    notes also carry the big idea, on its own line under the prompt, as words to say: the brief's one sentence is then
 *    in the talk from the first scene on (story.idea-early reads notes), not only in the Director's complaint that it is
 *    missing. It is the author's own sentence (P9: the board writes no copy of its own), and like any note it is timed at
 *    140 words a minute (§6.6).
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
    var beats = (fw && fw.beats) || [], R = 0, cap = 0, bases = fws.baseCounts(fw, story);
    beats.forEach(function (b) { R += bases[b.id]; cap += b.max; });
    var t = story && story.targetMin;
    var asked = t == null || !isFinite(+t) || +t <= 0 ? R : clamp(Math.round(+t * 60 / 50), R, 24);
    var counts = {}, total = 0, quota = {}, order = [];
    var n = Math.min(asked, cap);
    beats.forEach(function (b) {
      var base = bases[b.id];
      quota[b.id] = n * b.share;
      counts[b.id] = clamp(Math.floor(quota[b.id]), base, b.max);
      total += counts[b.id];
      order.push(b);
    });
    // too many (the minimums outweigh the quotas): take from the most over-served beat that is above its minimum
    while (total > n) {
      var worst = null;
      order.forEach(function (b) {
        var base = bases[b.id];
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
  var AS_TYPED = { brand: 1, tagline: 1 };     // a name and a tagline keep their own case wherever they land
  var SENTENCE_CASE = /^(\p{Lu}\p{Ll}*)((?:\s+[^\s\p{Lu}]+)+)$/u;   // "Stale bread", "Wholesale means stale bread"; not "Google Sheets"
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
      if (at === 0 && !has(AS_TYPED, name) && !/\p{Lu}/u.test(v.split(/\s/)[0])) v = v.charAt(0).toUpperCase() + v.slice(1);
      else if (at > 0 && !has(AS_TYPED, name)) {
        var sc = SENTENCE_CASE.exec(v), bw = typeof tk.brand === 'string' ? tk.brand.split(/[^\p{L}\p{N}]+/u) : [];
        if (sc && bw.indexOf(sc[1]) < 0) v = sc[1].toLowerCase() + sc[2];     // a word of the brand is a name
      }
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

  // a template that cannot be built without an asset: a required asset prop, or an empty `asset` in its seed (the stub
  // catalog has seeds but no prop table)
  function needsAsset(id) {
    var T = PD.template.get(id);
    if (!T) return false;
    var P = isObj(T.props) ? T.props : {};
    for (var k in P) if (has(P, k) && P[k] && P[k].type === 'asset' && P[k].required) return true;
    return isObj(T.seed) && has(T.seed, 'asset') && !T.seed.asset;
  }
  // step 3: the beat's eligible templates in preference order. When none is (a catalog that lacks them all) the adaptive
  // `statement`, or the beat's first template while the catalog is not loaded at all (a stub fixture).
  function eligible(b, worlds, assets, catalogKnown) {
    var out = b.templates.filter(function (id) {
      if (needsAsset(id)) return id === 'logo' && !!assets.logo && usable(id, worlds, merge(seedOf(id), { asset: assets.logo }));
      return usable(id, worlds, seedOf(id));
    });
    if (out.length) return out;
    if (!catalogKnown) return [b.templates[0]];
    return [usable('statement', worlds) ? 'statement' : b.templates[0]];
  }
  // AMEND-10: the first eligible template the beat has not used yet; when all are used, the one after the previous scene's.
  // A beat with one eligible template would show that one shot again (psf's solution without a logo: brand-reveal twice,
  // the same name and tagline), so its next scene takes `alt`, the adaptive statement, and the two alternate.
  function rotate(elig, used, prev, alt) {
    for (var i = 0; i < elig.length; i++) if (used.indexOf(elig[i]) < 0) return elig[i];
    if (elig.length === 1 && alt && prev === elig[0] && alt !== elig[0]) return alt;
    return elig[(elig.indexOf(prev) + 1) % elig.length];
  }

  // the unit of a number row: the template's own default suffix is '%', and "9" with "days from idea to release" is not 9%. A '%'
  // (or "percent") leading the words is the suffix; words that start with "of" read as a share ("62" "of hours lost" is 62%);
  // anything else has no suffix, so the screen never shows a unit nobody gave (P9)
  function unitOf(text) {
    var m = /^\s*(?:%|per\s?cent\b)[\s,:-]*/i.exec(text || '');
    if (m) return { suffix: '%', label: text.slice(m[0].length).trim() };
    return { suffix: /^\s*of\s/i.test(text || '') ? '%' : '', label: text };
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
    var proofs = arr(story.proof).filter(function (p) { return p && ((typeof p.text === 'string' && p.text.trim()) || isFinite(+p.value) && p.value !== '' && p.value != null); }).slice(0, 3);
    var pi = 0, photo = 0, imageUsed = false, out = [];
    var alt = catalogKnown && usable('statement', worlds) ? 'statement' : null;

    fw.beats.forEach(function (b) {
      var elig = eligible(b, worlds, assets, catalogKnown), used = [], prev = null;
      for (var j = 0; j < counts[b.id]; j++) {
        var tpl = null, extra = null;
        if (b.roles.indexOf('proof') >= 0 && pi < proofs.length) {
          var pf = proofs[pi], text = typeof pf.text === 'string' ? pf.text.trim() : '';
          var hasValue = pf.value != null && pf.value !== '' && isFinite(+pf.value);
          var want = pf.kind === 'number' && (hasValue || !text) ? 'big-number' : pf.kind === 'quote' ? 'quote' : 'statement';
          if (usable(want, worlds, seedOf(want))) {
            pi++; tpl = want;
            if (want === 'big-number') { var u = unitOf(text); extra = { suffix: u.suffix }; if (u.label) extra.label = u.label; if (hasValue) extra.value = +pf.value; }
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
        if (!tpl) {
          tpl = rotate(elig, used, prev, alt);
          if (tpl === 'logo') extra = { asset: assets.logo };
        }
        used.push(tpl); prev = tpl;
        var props = fill(merge(seedOf(tpl), extra || {}), tk);
        var notes = '\u25b8 ' + b.ask;
        if (!out.length && tk.bigIdea) notes += '\n' + tk.bigIdea;          // step 5: the big idea, said in the first scene
        out.push({ id: j === 0 ? b.id : b.id + '-' + (j + 1), template: tpl, props: props, beat: b.id, point: b.label + ': ' + b.ask, notes: notes });
      }
    });
    return out;
  }
  board.plan = plan; board.tokens = tokens; board.fill = fill;

  S.board = board;
  return { board: board, plan: plan, tokens: tokens, fill: fill };
}, { export: false });
