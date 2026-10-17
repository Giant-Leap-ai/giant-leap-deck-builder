/* tools/test/fixtures/wp5-catalog.js — WP5 test fixture: the §5 template catalog as METADATA ONLY (ids, requires, story,
 * seed), so the storyboard and the checker can be tested without WP4's real templates (and keep passing when they change).
 * Loaded on demand by tools/test/specs/wp5-00-env.test.js (a classic script; the harness page loads it by <script src>).
 *
 *   WP5_CATALOG.ids                  the 16 template ids of §5, in table order
 *   WP5_CATALOG.register(K)          registers the 16 stubs on a kernel K (PD.template); expand() is a generic text-only
 *                                    expansion: every string prop becomes a text (kicker → kicker, subtitle-like → subtitle,
 *                                    the rest → statement) so {tokens} left in a seed show up as visible placeholders
 *   WP5_CATALOG.meta                 { id: { label, requires: string[], story, seed } } for oracles
 *
 * Values are copied from the spec tables (§5 rows 1–16 and the seed table); nothing here is derived from WP4's files. */
(function () {
  var ROLES_ALL = ['hook', 'setup', 'identity', 'scale', 'relevance', 'emotion', 'proof', 'tension', 'turn', 'idea', 'climax', 'resolution', 'cta', 'callback'];
  function T(id, label, requires, energy, talk, per, roles, hook, seed) {
    return { id: id, label: label, requires: requires, story: { energy: energy, talkSec: talk, stepTalkSec: per, roles: roles, hook: hook }, seed: seed };
  }
  var three = function (o) { return [o, o, o].map(function (x) { var c = {}; for (var k in x) c[k] = x[k]; return c; }); };
  var META = [
    T('cold-open', 'Spark cold open', ['spark'], 2, 20, 0, ['hook'], true, { line: '{opening line}' }),
    T('brand-reveal', 'Brand reveal', [], 4, 30, 0, ['identity', 'idea', 'callback'], false, { title: '{brand}', subtitle: '{tagline}' }),
    T('hyperspace', 'Hyperspace', ['cosmos'], 5, 20, 20, ['scale', 'hook'], true, { lines: ['{a big number}', '{an even bigger one}'] }),
    T('galaxy-reveal', 'Galaxy, you are here', ['cosmos', 'planet'], 3, 40, 20, ['relevance', 'scale'], false, { line: '{where your audience fits}' }),
    T('planet', 'Fly home', ['cosmos', 'planet'], 2, 40, 0, ['relevance', 'setup'], false, { kicker: '{where}', line: '{who lives here}' }),
    T('sunrise', 'Sunrise', ['cosmos', 'planet'], 4, 45, 0, ['emotion', 'turn', 'resolution'], false, { kicker: '{since when}', line: '{a human truth}' }),
    T('timeline', 'Milestones', [], 3, 15, 20, ['proof', 'setup'], false, { title: '{topic}', milestones: three({ when: '{when}', label: '{milestone}' }) }),
    T('the-box', 'The box', [], 3, 45, 20, ['tension'], false, { line: '{oldWay} was built for a world that is gone.', escape: 'Outside', subtitle: 'is where {newWay} lives' }),
    T('pivot', 'Not X. Y.', [], 5, 40, 20, ['turn', 'idea', 'cta'], false, { kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' }),
    T('finale', 'Finale', [], 4, 30, 0, ['callback', 'cta', 'resolution'], false, { title: '{brand}', subtitle: '{ask}' }),
    T('statement', 'Big statement', [], 2, 45, 0, ROLES_ALL, true, { line: '{your line}' }),
    T('big-number', 'Big number', [], 4, 40, 0, ['hook', 'proof', 'scale', 'tension'], true, { value: 0, label: '{what the number means}' }),
    T('quote', 'Quote', [], 2, 40, 0, ['proof', 'emotion'], true, { quote: '{quote}', who: '{who}' }),
    T('three-points', 'Points, one per click', [], 3, 20, 30, ['proof', 'idea'], false, { items: three({ title: '{point}' }) }),
    T('logo', 'Logo reveal', [], 4, 30, 0, ['identity', 'callback'], false, { asset: '', tagline: '{tagline}' }),
    T('image', 'Image hold', [], 3, 40, 0, ['emotion', 'setup', 'resolution', 'hook'], true, { asset: '', caption: '{caption}' })
  ];
  var SUBTITLE_LIKE = { subtitle: 1, tagline: 1, who: 1, caption: 1, role: 1 };

  function texts(p) {
    var out = [], y = 250;
    (function walk(v, key) {
      if (typeof v === 'string') {
        if (key === 'asset' || v === '') return;
        out.push({ str: v, style: key === 'kicker' ? 'kicker' : SUBTITLE_LIKE[key] ? 'subtitle' : 'statement', y: y });
        y += 110;
      } else if (typeof v === 'number') {
        if (key === 'value') { out.push({ str: String(v), style: 'subtitle', y: y }); y += 110; }
      } else if (Array.isArray(v)) v.forEach(function (x) { walk(x, key); });
      else if (v && typeof v === 'object') for (var k in v) walk(v[k], k);
    })(p, '');
    return out;
  }

  window.WP5_CATALOG = {
    ids: META.map(function (m) { return m.id; }),
    meta: (function () { var o = {}; META.forEach(function (m) { o[m.id] = m; }); return o; })(),
    register: function (K) {
      META.forEach(function (m) {
        var requires = { worlds: m.requires.slice() };
        if (m.id === 'image') requires.worldsFor = function (p) { return (!p || p.fit == null || p.fit === 'cover') ? ['photo'] : []; };
        K.template(m.id, {
          label: m.label, requires: requires, story: m.story, props: {}, example: m.seed, seed: m.seed,
          expand: function (p, env) {
            var sc = { world: env.shot('DRIFT'), text: texts(p), dwell: 3 };
            return sc;
          }
        });
      });
    }
  };
})();
