/* engine/templates/cinematic.js — the 10 One Giant Leap derived templates (spec §5, rows 1–10; WP4).
 *
 * A template is a pure function from props to a raw scene, registered with PD.template(id, T). PD.compile expands each
 * template scene once (core/compile.js): props are normalized against T.props / T.example, T.expand(props, env) runs,
 * then `overrides` and the scene metadata (id, notes, dwell, beat, energy, point, lint, flashback, like) are applied.
 *
 *   T = {
 *     label, summary,                       // picker texts
 *     requires: { worlds: string[],         // world plugins the template needs; [] = adaptive (any theme)
 *                 worldsFor?(props) → string[] },   // extra worlds that depend on the props, which may be partial
 *                                       // (a seed): image needs photo unless fit is 'contain'
 *     story: { energy: 1..5, talkSec, stepTalkSec, roles: string[], hook: boolean },   // spec §6.1, §6.6
 *     props: { [name]: PropSpec },          // the schema (below); the Studio builds its form from it, PD.validate checks it
 *     example: props,                       // a complete, valid props object (OGL's values for this set)
 *     seed: props,                          // storyboard placeholders; {tokens} are filled from the story (spec §6.5)
 *     expand(props, env) → RawScene         // pure and deterministic; env = the deck helpers h (spec §4.2)
 *   }
 *   PropSpec = {
 *     type: 'text' | 'longtext' | 'number' | 'bool' | 'color' | 'enum' | 'asset' | 'list' | 'shot' | 'nebula',
 *     label: string, hint?: string,         // form label and placeholder
 *     required?: true,                      // marked * in spec §5; never filled from `example` (validate reports it missing)
 *     default?: any,                        // used when the prop is absent; every optional prop has one
 *     max?: number,                         // text: at most this many characters; number: the largest value; list: most items
 *     min?: number,                         // number: the smallest value; list: fewest items
 *     style?: string, size?: number,        // text: the theme style (and font size) the string is measured against
 *     lines?: number,                       // text: at most this many wrapped lines when measured with style and size
 *     step?: number, int?: true,            // number: slider step; whole numbers only
 *     options?: string[],                   // enum
 *     accept?: 'image' | 'font',            // asset: the asset type the picker offers
 *     of?: PropSpec | { [sub]: PropSpec }   // list items: one PropSpec (a text list) or a map of sub-props (a list of records)
 *   }
 * Props that are optional and carry no value take their `default`; a prop with neither stays absent (so '' is how a
 * template says "no kicker"). Because expand reads defaults from the schema, `example` never leaks into a scene.
 *
 * Rules every expand obeys (spec §5): it never reads the clock or a random source (a unit test spies on that), never
 * touches the DOM except through env.measure / env.fit, never mutates its inputs, and returns plain data (arrays, never
 * closures, so a scene's content hash sees everything it shows). An adaptive template builds its world with
 * env.shot(p.shot), which falls back to DRIFT when the theme has no such shot, and adds a world, timing or cue key only
 * when env.hasParam(key). The ten templates below reproduce the One Giant Leap scenes: expand(example) matches the
 * original scene object for object (decks/_parity checks the rendered frames).
 *
 * Registration allocates nothing, touches no DOM and draws no random number. */
PD.module('templates/cinematic', [], function (PD) {
  var ROLE_FUTURE = ['#fff1c9', '#ffb347'], ROLE_PAST = ['#dfe6f2', '#8c9bb6'];   // only used when a theme defines no such role

  function str(v) { return v == null ? '' : String(v); }
  function list(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  function role(env, name, fallback) { var r = env.role(name); if (r === undefined) r = fallback; return Array.isArray(r) ? r.slice() : r; }   // always a copy
  function hex2(v) { return ('0' + (v | 0).toString(16)).slice(-2); }
  // a ring of n glow points around (cx, cy); the angle maths is the original's, term for term
  function ring(cx, cy, n, r, s, color, a) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var ang = i / n * Math.PI * 2, q = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, s: s, color: color };
      if (a != null) q.a = a;
      pts.push(q);
    }
    return pts;
  }

  /* ------------------------------------------------------------------ 1. cold-open */
  PD.template('cold-open', {
    label: 'Spark cold open',
    summary: 'A single spark in the dark, then one line. The quietest way to start.',
    requires: { worlds: ['spark'] },
    story: { energy: 2, talkSec: 20, stepTalkSec: 0, roles: ['hook'], hook: true },
    props: {
      line: { type: 'text', label: 'Opening line', required: true, max: 60, style: 'statement' },
      lineAt: { type: 'number', label: 'Line appears after (s)', min: 0, max: 6, step: 0.1, default: 1.8 },
      sparkCount: { type: 'number', label: 'Spark particles', min: 200, max: 1200, step: 50, int: true, default: 700 },
      sparkColor: { type: 'color', label: 'Spark colour', default: 'gold' },
      shot: { type: 'shot', label: 'World', default: 'SPARK' }
    },
    example: { line: 'Every giant leap begins with a single spark.', lineAt: 1.8, sparkCount: 700, sparkColor: 'gold', shot: 'SPARK' },
    seed: { line: '{opening line}' },
    expand: function (p, env) {
      var spark = { shape: 'spark', id: 'spark', count: p.sparkCount, radius: 40 };
      if (p.sparkColor && p.sparkColor !== 'gold') spark.color = p.sparkColor;       // gold is the spark's own colour
      return {
        world: env.W(env.shot(p.shot), { spark: 1 }),
        worldTime: 3,
        particles: [spark],
        motion: { entry: 'spark', dur: 2.4, spread: 1.8, ease: 'easeOutCubic', arc: 0.8 },
        text: [{ str: str(p.line), style: 'statement', y: 820, reveal: 'letters', revealTime: 2.4, at: p.lineAt }],
        dwell: 6
      };
    }
  });

  /* ------------------------------------------------------------------ 2. brand-reveal */
  PD.template('brand-reveal', {
    label: 'Brand reveal',
    summary: 'Your name assembles out of particles, with an optional tagline.',
    requires: { worlds: [] },
    story: { energy: 4, talkSec: 30, stepTalkSec: 0, roles: ['identity', 'idea', 'callback'], hook: false },
    props: {
      title: { type: 'text', label: 'Name', required: true, max: 18, style: 'hero' },
      subtitle: { type: 'text', label: 'Tagline', max: 40, style: 'subtitle', default: 'Making work more human' },
      subtitleAt: { type: 'number', label: 'Tagline appears after (s)', min: 0, max: 6, step: 0.1, default: 2.6 },
      flash: { type: 'number', label: 'Flash', min: 0, max: 1, step: 0.01, default: 0.32 },
      entry: { type: 'enum', label: 'Particles arrive from', options: ['spark', 'void', 'edges', 'center'], default: 'spark' },
      shot: { type: 'shot', label: 'World', default: 'BLOOM' }
    },
    example: { title: 'One Giant Leap', subtitle: 'Making work more human', subtitleAt: 2.6, flash: 0.32, entry: 'spark', shot: 'BLOOM' },
    seed: { title: '{brand}', subtitle: '{tagline}' },
    expand: function (p, env) {
      var sc = {
        world: env.shot(p.shot),
        worldTime: 3.5,
        textDelay: 0.25,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 1.9, spread: 0.8, arc: 0.35, entry: p.entry, exit: 'drift' },
        text: [{ id: 'brand', str: str(p.title), style: 'hero', y: 470, reveal: 'particles' }],
        dwell: 6
      };
      if (env.hasParam('spark')) sc.timing = { spark: [0.6, 'outQuad'] };       // the cold-open spark fades as the brand blooms
      if (p.flash > 0) sc.cues = [{ at: 0.35, flash: p.flash }];
      if (str(p.subtitle)) sc.text.push({ str: str(p.subtitle), style: 'subtitle', y: 610, reveal: 'letters', at: p.subtitleAt });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 3. hyperspace */
  PD.template('hyperspace', {
    label: 'Hyperspace',
    summary: 'Warp speed through the stars. One line per click.',
    requires: { worlds: ['cosmos'] },
    story: { energy: 5, talkSec: 20, stepTalkSec: 20, roles: ['scale', 'hook'], hook: true },
    props: {
      lines: { type: 'list', label: 'Lines (one per click)', required: true, min: 1, max: 3, of: { type: 'text', label: 'Line', max: 34, style: 'title' } },
      warpColor: { type: 'enum', label: 'Warp colour', options: ['cyan', 'violet', 'gold', 'white'], default: 'cyan' },
      nebula: { type: 'nebula', label: 'Nebula', default: 'cosmic' },
      flashAt: { type: 'number', label: 'Flash at (s)', min: 0, max: 5, step: 0.1, default: 3.0 }
    },
    example: { lines: ['13.8 billion years', 'Hundreds of billions of galaxies'], warpColor: 'cyan', nebula: 'cosmic', flashAt: 3.0 },
    seed: { lines: ['{a big number}', '{an even bigger one}'] },
    expand: function (p, env) {
      var lines = list(p.lines).map(str);
      if (!lines.length) lines = [''];
      var texts = lines.map(function (s, i) {
        var t = { str: s, style: 'title', y: 540, reveal: 'focus' };
        if (i < lines.length - 1) t.id = 'w' + (i + 1);                         // a later step removes it
        if (s.length > 24) t.size = 68;
        return t;
      });
      texts[0].at = Math.round((p.flashAt + 0.1) * 1000) / 1000;                // the first line lands just after the flash
      var sc = {
        world: env.W(env.shot('HYPERSPACE'), { warpColor: p.warpColor, nebula: p.nebula }),
        timing: {
          speed: [3.2, 'inQuart'], warp: [2.6, 'inCubic'], roll: [6, 'inOutQuad'], shake: [2.4, 'inQuad', 1.2],
          letterbox: [1.6, 'inOutCubic'], nebulaAmount: [3, 'inQuad'], backdrop: [2, 'inOutQuad']
        },
        cues: [{ at: p.flashAt, flash: 0.5 }],
        motion: { exit: 'warp' },
        text: [texts[0]],
        dwell: 4
      };
      if (texts.length > 1) sc.steps = texts.slice(1).map(function (t, i) { return { remove: ['w' + (i + 1)], textDelay: 0.6, text: [t] }; });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 4. galaxy-reveal */
  PD.template('galaxy-reveal', {
    label: 'Galaxy, you are here',
    summary: 'Out of warp, in front of a galaxy. Then a pale blue dot.',
    requires: { worlds: ['cosmos', 'planet'] },
    story: { energy: 3, talkSec: 40, stepTalkSec: 20, roles: ['relevance', 'scale'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: 'Somewhere in all of this' },
      line: { type: 'text', label: 'Line', required: true, max: 50, style: 'statement' },
      marker: { type: 'text', label: 'Marker label (empty = no click)', max: 24, style: 'caption', default: 'You are here' }
    },
    example: { kicker: 'Somewhere in all of this', line: 'there is one small, blue world.', marker: 'You are here' },
    seed: { line: '{where your audience fits}' },
    expand: function (p, env) {
      var w = env.shot('GALAXY'), ex = w.earthX == null ? 520 : w.earthX, ey = w.earthY == null ? 700 : w.earthY;
      var sc = {
        world: w,
        timing: { speed: [2.2, 'outCubic'], warp: [1.4, 'outCubic'], galaxy: [3.5, 'inOutQuad', 0.4], shake: [0.8, 'outQuad'], roll: [5, 'inOutQuad'] },
        cues: [{ at: 0, flash: 0.45 }],
        text: [],
        dwell: 5
      };
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', x: 220, y: 430, align: 'left', at: 1.8 });
      sc.text.push({ str: str(p.line), style: 'statement', x: 220, y: 500, align: 'left', at: 2.4, reveal: 'letters' });
      if (str(p.marker)) {
        sc.steps = [{
          world: { earth: 1 }, timing: { earth: [1.5, 'inOutQuad'] },
          particles: [{ shape: 'points', points: ring(ex, ey, 40, 30, 5, '#7fd4ff', 0.7) }],
          text: [{ str: str(p.marker), style: 'caption', x: ex, y: ey + 60, reveal: 'fade', at: 0.6 }]
        }];
      }
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 5. planet */
  PD.template('planet', {
    label: 'Fly home',
    summary: 'The dot becomes the Earth, filling the frame.',
    requires: { worlds: ['cosmos', 'planet'] },
    story: { energy: 2, talkSec: 40, stepTalkSec: 0, roles: ['relevance', 'setup'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: 'Third planet from the sun' },
      line: { type: 'text', label: 'Line', required: true, max: 50, style: 'statement' },
      region: { type: 'enum', label: 'Region facing the camera', options: ['americas', 'europe-africa', 'asia'], default: 'americas' }
    },
    example: { kicker: 'Third planet from the sun', line: 'Home to the most restless minds we know of.', region: 'americas' },
    seed: { kicker: '{where}', line: '{who lives here}' },
    expand: function (p, env) {
      var rot = { americas: -1.1, 'europe-africa': 0.25, asia: 1.9 };
      var sc = {
        world: env.W(env.shot('HOME'), { earthRot: rot[p.region] === undefined ? -1.1 : rot[p.region] }),
        timing: {
          earthR: [5, 'inOutCubic'], earthX: [5, 'inOutCubic'], earthY: [5, 'inOutCubic'], galaxy: [2.5, 'inQuad'],
          speed: [5, 'inOutQuad'], letterbox: [3, 'inOutCubic', 2.5]
        },
        text: [],
        dwell: 6
      };
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', y: 120, at: 4.2 });
      sc.text.push({ str: str(p.line), style: 'statement', y: 975, at: 4.8, reveal: 'letters' });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 6. sunrise */
  PD.template('sunrise', {
    label: 'Sunrise',
    summary: 'The sun clears the edge of the world. The emotional beat.',
    requires: { worlds: ['cosmos', 'planet'] },
    story: { energy: 4, talkSec: 45, stepTalkSec: 0, roles: ['emotion', 'turn', 'resolution'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: 'For 300,000 years' },
      line: { type: 'text', label: 'Line', required: true, max: 40, style: 'statement', size: 78 },
      nebula: { type: 'nebula', label: 'Nebula', default: 'dawn' }
    },
    example: { kicker: 'For 300,000 years', line: 'we have thought outside the box.', nebula: 'dawn' },
    seed: { kicker: '{since when}', line: '{a human truth}' },
    expand: function (p, env) {
      var sc = {
        world: env.W(env.shot('SUNRISE'), { nebula: p.nebula }),
        worldTime: 5,
        timing: {
          sun: [3.5, 'inOutQuad', 2.6], sunY: [5, 'outCubic', 1.8], letterbox: [2, 'inOutCubic'], nebula: [4],
          lightX: [2.4, 'inOutQuad'], lightY: [2.4, 'inOutQuad'], lightZ: [2.4, 'inOutQuad'], earthPitch: [4, 'inOutCubic']
        },
        text: [],
        dwell: 7
      };
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', y: 300, at: 4.4 });
      sc.text.push({ str: str(p.line), style: 'statement', size: 78, y: 382, at: 5.0, reveal: 'letters' });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 7. timeline */
  PD.template('timeline', {
    label: 'Milestones',
    summary: 'A rising curve. Each click lights one milestone.',
    requires: { worlds: [] },
    story: { energy: 3, talkSec: 15, stepTalkSec: 20, roles: ['proof', 'setup'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: 'A short history of' },
      title: { type: 'text', label: 'Title', required: true, max: 40, style: 'statement' },
      milestones: {
        type: 'list', label: 'Milestones (one per click)', required: true, min: 2, max: 8,
        of: {
          when: { type: 'text', label: 'When', required: true, max: 14, style: 'year' },
          label: { type: 'text', label: 'What', required: true, max: 22, style: 'label' },
          u: { type: 'number', label: 'Position on the curve', min: 0, max: 1, step: 0.005 },
          pos: { type: 'enum', label: 'Text position', options: ['auto', 'above', 'below', 'left'], default: 'auto' },
          color: { type: 'color', label: 'Node colour' }
        }
      },
      highlightLast: { type: 'bool', label: 'Highlight the last milestone', default: true },
      curve: { type: 'bool', label: 'Draw the curve', default: true },
      shot: { type: 'shot', label: 'World', default: 'LEAPS' }
    },
    example: {
      kicker: 'A short history of', title: 'Thinking outside the box',
      milestones: [
        { when: '~1,000,000 BCE', label: 'Fire', u: 0.04 },
        { when: '3500 BCE', label: 'The wheel', u: 0.22 },
        { when: '1440', label: 'The printing press', u: 0.43 },
        { when: '1903', label: 'First flight', u: 0.6 },
        { when: '1969', label: 'The Moon', u: 0.74 },
        { when: '1989', label: 'The World Wide Web', u: 0.86 },
        { when: 'Now', label: 'The next leap', u: 0.975 }
      ],
      highlightLast: true, curve: true, shot: 'LEAPS'
    },
    seed: { title: '{topic}', milestones: [{ when: '{when}', label: '{milestone}' }, { when: '{when}', label: '{milestone}' }, { when: '{when}', label: '{milestone}' }] },
    expand: function (p, env) {
      var U = env.U, ms = list(p.milestones), n = ms.length;
      var accent = role(env, 'accent', '#ffd27a'), glow = role(env, 'futureGlow', '#ff8a3d');
      function curveXY(u) { return { x: 170 + u * 1580, y: 860 - 590 * Math.pow(u, 2.3) }; }
      function pointsOf(u, color) {
        var c = curveXY(u), pts = ring(c.x, c.y, 22, 15, 6, color);
        pts.push({ x: c.x, y: c.y, s: 22, color: '#ffffff' });
        return pts;
      }
      var sc = {
        world: env.shot(p.shot),
        worldTime: 2.5,
        motion: { stagger: 'leftToRight', dur: 1.4, spread: 1.6, ease: 'easeInOutCubic', arc: 0.15, entry: 'void', exit: 'drift' },
        text: [],
        steps: ms.map(function (m, i) {
          var u = typeof m.u === 'number' && isFinite(m.u) ? Math.min(1, Math.max(0, m.u)) : (n > 1 ? 0.04 + i * 0.935 / (n - 1) : 0.5);
          var pos = m.pos === 'above' || m.pos === 'below' || m.pos === 'left' ? m.pos : (u < 0.12 ? 'above' : u < 0.5 ? 'below' : 'left');
          var color = m.color || (p.highlightLast && i === n - 1 ? glow : accent);
          var c = curveXY(u), tx = c.x, ty, align = 'center';
          if (pos === 'left') { tx = c.x - 40; ty = c.y - 6; align = 'right'; }
          else if (pos === 'below') ty = c.y + 74;
          else ty = c.y - 88;
          return {
            particles: [{ shape: 'points', points: pointsOf(u, color) }],
            text: [
              { str: str(m.when), style: 'year', x: tx, y: ty - 18, align: align, reveal: 'rise' },
              { str: str(m.label), style: 'label', x: tx, y: ty + 26, align: align, reveal: 'rise', at: 0.15 }
            ]
          };
        }),
        dwell: 3
      };
      if (p.curve) {
        var pts = [];
        for (var i = 0; i <= 420; i++) {
          var u = i / 420, c = curveXY(u), mc = U.mix(env.col('teal'), env.col('gold'), u);
          pts.push({ x: c.x, y: c.y, color: '#' + mc.map(hex2).join(''), s: 6, a: 0.75 });
        }
        sc.particles = [{ id: 'curve', shape: 'points', points: pts }];
      }
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', x: 160, y: 150, align: 'left' });
      sc.text.push({ str: str(p.title), style: 'statement', x: 160, y: 215, align: 'left', at: 0.3 });
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 8. the-box */
  PD.template('the-box', {
    label: 'The box',
    summary: 'A glowing box holds the old idea. One click and the ideas escape it.',
    requires: { worlds: [] },
    story: { energy: 3, talkSec: 45, stepTalkSec: 20, roles: ['tension'], hook: false },
    props: {
      line: { type: 'text', label: 'Line beside the box', required: true, max: 60, style: 'statement' },
      escape: { type: 'text', label: 'The escape word', required: true, max: 12, style: 'hero' },
      subtitle: { type: 'text', label: 'Line under the escape word', max: 40, style: 'subtitle', default: 'is where the future lives' },
      cubeColor: { type: 'color', label: 'Box colour', default: 'cyan' },
      cubeColor2: { type: 'color', label: 'Box colour, far edge', default: 'violet' },
      shot: { type: 'shot', label: 'World', default: 'BOX' }
    },
    example: {
      line: "Every breakthrough began as an idea that didn't fit.", escape: 'Outside', subtitle: 'is where the future lives',
      cubeColor: 'cyan', cubeColor2: 'violet', shot: 'BOX'
    },
    seed: { line: '{oldWay} was built for a world that is gone.', escape: 'Outside', subtitle: 'is where {newWay} lives' },
    expand: function (p, env) {
      var out = [{
        str: str(p.escape), style: 'hero', x: 1380, y: 500, reveal: 'particles',
        color: role(env, 'future', ROLE_FUTURE), glow: role(env, 'futureGlow', '#ff8a3d')
      }];
      if (str(p.subtitle)) out.push({ str: str(p.subtitle), style: 'subtitle', x: 1380, y: 610, at: 2.6, color: role(env, 'accent', '#ffd27a') });
      return {
        world: env.shot(p.shot),
        worldTime: 2.4,
        motion: { entry: 'void', exit: 'drift', dur: 1.8, spread: 1.0, arc: 0.35 },
        particles: [
          { shape: 'cube', id: 'cube', x: 640, y: 520, size: 200, perEdge: 40, color: p.cubeColor, color2: p.cubeColor2, spin: 0.22 },
          { shape: 'swarm', id: 'swarm', inside: 'cube', count: 420 }
        ],
        text: [{ id: 'boxText', str: str(p.line), style: 'statement', x: 1060, y: 520, align: 'left', maxWidth: 720, at: 1.0, reveal: 'letters' }],
        steps: [{
          remove: ['swarm', 'boxText'],
          motion: { stagger: 'leftToRight', dur: 2.0, spread: 0.9, ease: 'easeInOutCubic', arc: 0.5, entry: 'spark' },
          text: out
        }],
        dwell: 4
      };
    }
  });

  /* ------------------------------------------------------------------ 9. pivot */
  PD.template('pivot', {
    label: 'Not X. Y.',
    summary: 'The old answer in grey, then yours in gold.',
    requires: { worlds: [] },
    story: { energy: 5, talkSec: 40, stepTalkSec: 20, roles: ['turn', 'idea', 'cta'], hook: false },
    props: {
      kicker: { type: 'text', label: 'Kicker', max: 30, style: 'kicker', default: 'The next leap' },
      from: { type: 'text', label: 'The old answer', required: true, max: 18, style: 'hero' },
      to: { type: 'text', label: 'Your answer', required: true, max: 18, style: 'hero' },
      subtitle: { type: 'text', label: 'Line under your answer', max: 44, style: 'subtitle', default: 'Technology that makes work more human' },
      shot: { type: 'shot', label: 'World', default: 'PIVOT' }
    },
    example: { kicker: 'The next leap', from: 'Not automation.', to: 'Augmentation.', subtitle: 'Technology that makes work more human', shot: 'PIVOT' },
    seed: { kicker: 'The turn', from: 'Not {oldWay}.', to: '{newWay}.', subtitle: '{shortIdea}' },
    expand: function (p, env) {
      var from = str(p.from), to = str(p.to);
      var past = { str: from, style: 'hero', size: env.fit(from, 'hero', 118, 1700), y: 520, reveal: 'particles', id: 'auto' };
      past.color = role(env, 'past', ROLE_PAST); past.glow = role(env, 'pastGlow', '#5a6b8a'); past.glowAlpha = 0.35;
      var now = [{ str: to, style: 'hero', size: env.fit(to, 'hero', 118, 1700), y: 520, reveal: 'particles', color: role(env, 'future', ROLE_FUTURE), glow: role(env, 'futureGlow', '#ff8a3d') }];
      if (str(p.subtitle)) now.push({ str: str(p.subtitle), style: 'subtitle', y: 650, at: 2.6, color: role(env, 'accent', '#ffd27a') });
      var sc = {
        world: env.shot(p.shot),
        worldTime: 2.4,
        motion: { stagger: 'leftToRight', dur: 1.8, spread: 0.9, ease: 'easeInOutCubic', arc: 0.3, entry: 'void', exit: 'drift' },
        text: [],
        steps: [{
          remove: ['auto'],
          motion: { stagger: 'leftToRight', dur: 1.9, spread: 0.8, ease: 'easeInOutCubic', arc: 0.45, entry: 'void' },
          text: now
        }],
        dwell: 4
      };
      if (str(p.kicker)) sc.text.push({ str: str(p.kicker), style: 'kicker', y: 360 });
      sc.text.push(past);
      return sc;
    }
  });

  /* ------------------------------------------------------------------ 10. finale */
  PD.template('finale', {
    label: 'Finale',
    summary: 'The opening image returns, changed. Your closing line and ask.',
    requires: { worlds: [] },
    story: { energy: 4, talkSec: 30, stepTalkSec: 0, roles: ['callback', 'cta', 'resolution'], hook: false },
    props: {
      title: { type: 'text', label: 'Name', required: true, max: 18, style: 'hero' },
      subtitle: { type: 'text', label: 'Closing line or ask', max: 40, style: 'subtitle', hint: 'Put your ask here', default: 'Thank you' },
      shot: { type: 'shot', label: 'World', default: 'FINALE' }
    },
    example: { title: 'One Giant Leap', subtitle: 'Thank you', shot: 'FINALE' },
    seed: { title: '{brand}', subtitle: '{ask}' },
    expand: function (p, env) {
      var sc = {
        world: env.shot(p.shot),
        worldTime: 4,
        prelude: 'explode', preludeTime: 0.8, explodePower: 1.1,
        motion: { stagger: 'radial', ease: 'easeOutCubic', dur: 2.0, spread: 0.9, arc: 0.4, entry: 'void', exit: 'drift' },
        text: [{ str: str(p.title), style: 'hero', y: 380, reveal: 'particles' }],
        dwell: 7
      };
      if (env.hasParam('sun')) sc.timing = { sun: [3, 'inOutQuad', 1], sunY: [5, 'outCubic', 0.5] };
      if (str(p.subtitle)) sc.text.push({ str: str(p.subtitle), style: 'subtitle', y: 500, at: 2.8 });
      return sc;
    }
  });

  return { ids: ['cold-open', 'brand-reveal', 'hyperspace', 'galaxy-reveal', 'planet', 'sunrise', 'timeline', 'the-box', 'pivot', 'finale'] };
});
