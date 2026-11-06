# Plugins: adding to the engine

The engine is built out of small parts that register themselves by name. You can add your own the same way, from your deck
folder, without editing anything in `engine/`:

| Part | Registry | What it is | Built in |
|---|---|---|---|
| **World** | `PD.world` | a layer of the moving backdrop, with its own parameters and draw passes | `core`, `cosmos`, `planet`, `spark`, `ambient`, `photo` |
| **Element** | `PD.element` | a kind of thing on screen, placed and revealed like text | `text`, `image`, `counter` |
| **Shape** | `PD.shape` | a set of points the glowing particles fly into | `spark`, `cube`, `swarm`, `points` |
| **Reveal** | `PD.reveal` | how text (or a picture) enters | none registered (see below) |
| **Exit** | `PD.exitFx` | how text (or a picture) leaves | none registered (see below) |
| **Template** | `PD.template` | a ready-made scene | 16, see [templates.md](templates.md) |
| **Framework** | `PD.framework` | a story shape for the Studio | `giant-leap`, `sparkline`, `psf`, `scqa`, `blank`, see [story.md](story.md) |
| **Theme** | `PD.theme` | a look | `cosmos`, `slate` (and `one-giant-leap` in its deck), see [themes.md](themes.md) |
| **Deck** | `PD.deck` | a deck | see [authoring.md](authoring.md) |

The reveals `letters`, `focus`, `rise`, `fade`, `wipe` and `particles` and the exits `fade`, `rise`, `sink`, `blur` and
`particles` are part of the text and image code itself, so `PD.reveal.list()` and `PD.exitFx.list()` start empty. A name
you register there is used only when it is not one of those built-in names.

Most people never need a plugin: templates and raw scenes cover a great deal. Reach for one when you want a new kind of
motion or picture that you will reuse.

---

## Where plugin code goes

Put plugin code in a file of your deck folder, such as `decks/my-talk/plugins.js`, and load it in `index.html` and
`notes.html` after the engine and before `deck.js`:

```html
<script src="../../engine/pixeldeck.js"></script>
<script src="../../themes/slate/theme.js"></script>
<script src="plugins.js"></script>
<script src="assets.js"></script>
<script src="deck.js"></script>
<script>PD.start();</script>
```

Three rules:

1. **Wrap it in `PD.module`.** The one-file export carries modules, the deck's theme chain, its assets and the deck,
   nothing else. A bare `PD.reveal(…)` at the top of a file works on the page but is missing from the exported file. Inside
   a module it travels with the deck.
2. **One statement per file.** Every `.js` file under `engine/`, `themes/`, `decks/` and `studio/` is exactly one
   top-level `PD.*(…)` call, because the export re-emits factories with `Function.prototype.toString()`. Nothing may live
   outside the factory. `node tools/lint.js` checks this.
3. **Registration does nothing else.** Registering must not touch the DOM, build textures or draw random numbers; do that
   in the hooks (`create`, `preload`, `warm`, `draw`). `Math.random` is not allowed outside three engine files (lint
   enforces it); use `U.rng(seed)` from `core/util`, which gives the same numbers every time.

## Modules

```text
PD.module(name, deps: string[], factory(PD, ...depExports) → exports, opts?: { export?: boolean })
```

The factory runs at once, with the exports of each dependency, which must already be registered (else
`module "X" needs "Y" loaded first`). Name a module after its file (`decks/my-talk/plugins`). `{ export: false }` keeps a
module out of the one-file export, as the engine does for its Studio-only parts (`core/export`, `core/validate`, `story/*`).

```js
PD.module('decks/demo/plugins', ['core/util'], function (PD, util) {
  var rand = util.U.rng(42);                  // a seeded generator: the same sequence on every run
  return { pick: function (list) { return list[Math.floor(rand() * list.length)]; } };
});
console.log(PD.has('decks/demo/plugins'), typeof PD.get('decks/demo/plugins').pick);   // true function
console.log(PD.modules().length > 30, PD.missing());                                    // true []
```

- `PD.get(name)` returns a module's exports (and throws for an unknown one); `PD.has(name)` tells whether it is there.
- `PD.modules()` lists every module in registration order: `{ name, deps, factory, opts }`.
- `PD.MANIFEST` is the engine's own file list, `[name, required]` in load order. The loader in `engine/pixeldeck.js`
  writes one `<script>` per entry, from `PD.base` (the folder `pixeldeck.js` was loaded from). `PD.missing()` names the
  required entries that did not load; `PD.start` refuses to run while any are missing. Set `window.PD_NO_AUTOLOAD = 1`
  before loading `pixeldeck.js` to load the files yourself.
- `PD.fail(message)` shows the full-screen black panel with the message (it never throws).
- `PD.version` is `'2.0.0'`.

## Registries

Every registry works the same way: `reg(name, def)` registers and returns `def`, and throws
`pixeldeck: <kind> "<name>" is registered twice` if the name is taken. `reg.get(name)` (or `undefined`), `reg.has(name)`,
`reg.list()` (names in registration order) and `reg.kind` read it.

```js
console.log(PD.world.list());     // ['core', 'cosmos', 'planet', 'spark', 'ambient', 'photo']
console.log(PD.element.list());   // ['text', 'image', 'counter']
console.log(PD.shape.list());     // ['spark', 'cube', 'swarm', 'points']
console.log(PD.reveal.list(), PD.exitFx.list());   // [] []
console.log(PD.framework.list()); // ['giant-leap', 'sparkline', 'psf', 'scqa', 'blank']
console.log(PD.world.has('cosmos'), PD.shape.get('cube').container, PD.world.kind);   // true true world
try { PD.shape('cube', {}); } catch (e) { console.log(e.message); }   // pixeldeck: shape "cube" is registered twice
```

The world registry has two more readers: `PD.world.owner(param)` (which world owns a parameter) and `PD.world.passes()`
(every draw pass in order: `{ world, name, z, space }`).

---

## Reveals and exits

A reveal decides, for each frame of a text's entrance, its opacity, vertical offset and scale:

```text
PD.reveal(name, { inDur, animSpan?: 1, pose(layer, t, pIn, eIn) → { alpha?, dy?, scale? },
                  paint?(layer, ctx, rs, pIn, eIn, alpha) })
PD.exitFx(name, { apply(layer, pOut, eOut, pose) })      // change pose.alpha, pose.dy, pose.scale in place
```

`pIn` runs from 0 to 1 over the reveal (`inDur` seconds, unless the text sets `revealTime`); `eIn` is the same eased.
`pOut` and `eOut` do the same for the exit. `paint`, when given, draws the layer itself while the reveal runs. Text and
image elements both use registered reveals and exits.

```js
PD.module('decks/demo/motion', [], function (PD) {
  PD.reveal('drop', { inDur: 0.9, pose: function (layer, t, pIn, eIn) { return { alpha: eIn, dy: -80 * (1 - eIn) }; } });
  PD.exitFx('shrink', { apply: function (layer, pOut, eOut, pose) { pose.alpha *= 1 - eOut; pose.scale *= 1 - 0.4 * eOut; } });
  return {};
});

PD.deck('reveal-demo', { format: 2, id: 'reveal-demo', meta: { title: 'Drop', theme: 'slate' },
  scenes: [
    { id: 'a', text: [{ str: 'Dropped in', style: 'title', reveal: 'drop', exit: 'shrink' }] },
    { id: 'b', text: [{ str: 'Next', style: 'title' }] }
  ] });
console.log(PD.validate(PD.compile('reveal-demo')).length);   // 0 (no reveal.unknown, no exit.unknown)
PD.start();
```

## Shapes

A shape gives the particle field its targets. It is either a fixed list of points or a moving set:

```text
PD.shape(name, { container?: boolean, create(spec, env: { byId, theme, col, uid }) → Shape })
Shape = { id, n, static: [{ x, y, color?, s?, a? }] }                                   // fixed points
      | { id, n, px: Float32Array, py: Float32Array, color(i) → [r, g, b], size(i), alpha?(i), update?(t) }   // moving
```

`create` runs once per spec object on each stage. `env.col(name)` turns a colour name or `#hex` into `[r, g, b]` using the
look's colours; `env.uid()` gives a unique string for the shape's `id`. A moving shape's `update(t)` runs every frame, and
particles parked on it follow. Shapes with `container: true` are built first, so another shape can find them through
`env.byId` (that is how `swarm` finds its `cube` through `inside`).

```js
PD.module('decks/demo/shapes', [], function (PD) {
  PD.shape('orbit', {
    create: function (spec, env) {
      var n = spec.count || 120, r = spec.radius || 220, cx = spec.x == null ? 960 : spec.x, cy = spec.y == null ? 540 : spec.y;
      var rgb = env.col(spec.color || 'gold');
      var sh = { id: 'orbit' + env.uid(), n: n, px: new Float32Array(n), py: new Float32Array(n),
        color: function () { return rgb; }, size: function () { return 9; },
        update: function (t) {
          for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2 + t * 0.4; sh.px[i] = cx + Math.cos(a) * r; sh.py[i] = cy + Math.sin(a) * r * 0.45; }
        } };
      sh.update(0);
      return sh;
    }
  });
  return {};
});

PD.deck('shape-demo', { format: 2, id: 'shape-demo', meta: { title: 'Orbit', theme: 'slate' },
  scenes: [{ id: 'a', particles: [{ shape: 'orbit', id: 'o', color: 'teal', count: 160 }],
             text: [{ str: 'In orbit', style: 'title', y: 540 }] }] });
PD.start().then(function (p) { setTimeout(function () { console.log(p.state().particles > 0); }, 600); });   // true
```

## Elements

An element kind is something drawn on screen with an entrance and an exit. `create(spec, env)` returns a **layer**, an
object the stage animates and draws:

```text
PD.element(kind, { create(spec, env: { theme, col, stage, assets(id) → RuntimeAsset | null }) → Layer,
                   measure?(spec, env) → { x, y, w, h, lines? },     // used by PD.validate and the Director
                   particleCount?(spec, env) → number })              // used by the particle-budget check
Layer = { spec, kind, id, o, reveal, exitKind, inStart, inDur, outStart, outDur, arriveAt, particleAlpha,
          reset(), startOut(t), animating(t) → bool, gone(t) → bool, ensureCache(rs), draw(ctx, t, rs),
          points?(stride?, size?) → targets      /* needed when reveal is 'particles' */ }
```

The stage sets `inStart` (when the entrance begins, in stage seconds) and calls `startOut(t)` when the element should leave;
`finishAll` (any key press while something moves) moves `inStart` and `outStart` into the past, so a layer that computes
its look from those times jumps straight to the end. `draw` runs in the 1920 × 1080 design space; `rs` is the render
scale, for a layer that caches a bitmap in `ensureCache`. The stage reads `reveal === 'particles'` and `arriveAt` only for
particle reveals; a plain layer sets `reveal` to something else and leaves `arriveAt` at `Infinity`.

```js
PD.module('decks/demo/badge', [], function (PD) {
  PD.element('badge', {
    create: function (spec, env) {
      var w = spec.w || 360, h = 84, x = (spec.x == null ? 960 : spec.x) - w / 2, y = (spec.y == null ? 540 : spec.y) - h / 2;
      var fill = spec.color || (env.theme.roles && env.theme.roles.accent) || '#ffb35c';
      return {
        spec: spec, kind: 'badge', id: spec.id || null, o: spec, reveal: 'fade', exitKind: 'fade',
        inStart: Infinity, inDur: 0.6, outStart: Infinity, outDur: 0.5, arriveAt: Infinity, particleAlpha: 1,
        reset: function () { this.inStart = Infinity; this.outStart = Infinity; },
        startOut: function (t) { if (this.outStart === Infinity) this.outStart = t; },
        animating: function (t) { return this.outStart !== Infinity ? t < this.outStart + this.outDur : t < this.inStart + this.inDur; },
        gone: function (t) { return this.outStart !== Infinity && t >= this.outStart + this.outDur; },
        ensureCache: function () { },
        draw: function (ctx, t) {
          if (t < this.inStart) return;
          var a = Math.min(1, (t - this.inStart) / this.inDur);
          if (this.outStart !== Infinity) a *= Math.max(0, 1 - (t - this.outStart) / this.outDur);
          ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = fill;
          ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
          ctx.fillStyle = '#121318'; ctx.font = '700 34px ' + env.theme.fonts.display; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(spec.label || ''), x + w / 2, y + h / 2 + 2);
          ctx.restore();
        }
      };
    },
    measure: function (spec) { var w = spec.w || 360; return { x: (spec.x == null ? 960 : spec.x) - w / 2, y: (spec.y == null ? 540 : spec.y) - 42, w: w, h: 84 }; }
  });
  return {};
});

PD.deck('badge-demo', { format: 2, id: 'badge-demo', meta: { title: 'Badge', theme: 'slate' },
  scenes: [{ id: 'a', elements: [{ kind: 'badge', label: 'NEW', y: 420 }],
             text: [{ str: 'Now with badges', style: 'statement', y: 560 }] }] });
console.log(PD.validate(PD.compile('badge-demo')).length);   // 0
PD.start();
```

## Worlds

A world plugin owns some world parameters, keeps a state per stage, and draws one or more passes:

```text
PD.world(name, {
  params: { [param]: number | string },      // flat names, unique across all worlds; the defaults
  crossfade?: string[],                      // string params that dissolve instead of switching
  create(stage) → state,                     // once per stage
  preload?(theme, compiled), prepare?(state, firstScene, stage),   // before the first frame (textures, buffers)
  warmed?(state) → bool, warm?(state, budgetMs),                   // time-sliced warm-up (both or neither)
  update?(state, dt, W, stage), adapt?(state, workMs),
  passes: [{ z: number, space: 'screen' | 'camera' | 'post', name, draw(ctx, W, state, f: { T, S, thumb, stage, xf, theme }) }]
})
```

`W` holds the current (gliding) values of every parameter. Passes are drawn in `z` order: the built-in ones run from
`cosmos.background` at 0 to `core.blackout` at 160 (the full order is in `PD.world.passes()`). `camera` passes move with
the camera's roll and shake and must form one unbroken run in `z` order (the built-in ones sit at 10 to 60); registering a
pass that would split that run throws, as does a parameter another world already owns. A deck enables an extra world
with `meta.worlds` (or a look with its `worlds` list):

```js
PD.module('decks/demo/tint', [], function (PD) {
  PD.world('tint', {
    params: { tint: 0, tintColor: '#ff6b9a' },
    create: function (stage) { return {}; },
    passes: [{ z: 145, space: 'post', name: 'wash', draw: function (ctx, W) {
      if (W.tint <= 0.001) return;
      ctx.save(); ctx.globalAlpha = Math.min(1, W.tint) * 0.35; ctx.fillStyle = W.tintColor; ctx.fillRect(0, 0, 1920, 1080); ctx.restore();
    } }]
  });
  return {};
});

PD.deck('tint-demo', { format: 2, id: 'tint-demo', meta: { title: 'Tint', theme: 'slate', worlds: ['tint'] },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'Rose-tinted.' }, overrides: { world: { tint: 1 } } }] });
var c = PD.compile('tint-demo');
console.log(c.worlds, PD.world.owner('tint'), PD.validate(c).length);   // ['core', 'ambient', 'photo', 'spark', 'tint'] tint 0
PD.start();
```

At `z` 145 the wash runs after the vignette (120), grain (130) and exposure (140) and before the letterbox (150) and
blackout (160), so the cinema bars and B still cover it. A `screen` pass at `z` below 10 sits under everything else (the backdrops are there).

## Frameworks

A framework is a story shape: an ordered list of beats, each with the roles it plays and the templates that suit it. The
Studio's Shape screen and `PD.story.board` read them; the deck itself never does, so frameworks belong in a Studio-only
module (`{ export: false }`). The fields are described in [story.md](story.md#frameworks).

```js
PD.module('decks/demo/frameworks', [], function (PD) {
  PD.framework('then-now-next', { id: 'then-now-next', name: 'Then, now, next', bestFor: 'updates and roadmaps', turns: 1,
    beats: [
      { id: 'then', label: 'Then', roles: ['setup'], share: 0.3, energy: 2, required: true, min: 1, max: 2,
        ask: 'Where did we start?', example: 'A year ago we had one customer.', templates: ['timeline', 'statement'] },
      { id: 'now', label: 'Now', roles: ['proof', 'turn'], share: 0.4, energy: 4, required: true, min: 1, max: 3,
        ask: 'What is true today?', example: '62% of teams use it weekly.', templates: ['big-number', 'statement'] },
      { id: 'next', label: 'Next', roles: ['cta'], share: 0.3, energy: 4, required: true, min: 1, max: 1,
        ask: 'What happens next, and what do you need?', example: 'Pilot it with us in March.', templates: ['finale', 'statement'] }
    ] });
  return {};
}, { export: false });

var scenes = PD.story.board(Object.assign(PD.story.interview.blank(), { targetMin: 5, brand: 'Acme' }), { framework: 'then-now-next', theme: 'slate' });
console.log(scenes.map(function (s) { return s.id + ':' + s.template; }));   // ['then:timeline', …, 'next:finale']
```

Give every beat at least one template that needs no particular world, so the shape works under every look (a beat with
none gets `statement`).

## Templates

`PD.template(id, Template)` adds a ready-made scene; see [templates.md](templates.md#your-own-template) for the fields and a
worked example.

---

## `PD.Stage`

The stage is the renderer: one canvas, one compiled deck, no window listeners, no keys and no address bar. The Player wraps
it for presenting; the Studio, the presenter window and the thumbnails use it directly. Several stages can share a page.

```text
new PD.Stage(canvas, { deck: CompiledDeck, thumb?: boolean })
  resize(cssW, cssH, dpr), enter(si, step, 'live' | 'settled' | 'instant'), tick(dt), draw(), busy(), finishAll(),
  still(si, step), resolve(si, step), stepsOf(si), setWorld(…), setDeck(compiled, { changed?: sceneIds }),
  preload(), prepare(firstScene), warmTick(), warmAll(), isWarm(), adapt(workMs), uid(), destroy()
  fields: canvas, ctx, deck, theme, T, W, cur: { slide, step }, field, layers, S, ox, oy; blackout, quality, onEnter
```

`thumb: true` makes a still-picture stage (no grain, no warm-up in `tick`). `still(si, step)` renders one state, settled,
for a thumbnail. `setDeck` swaps in a recompiled deck and keeps every cached bitmap whose scene did not change (a new look
or world list resets everything).

```js
PD.deck('still-demo', { format: 2, id: 'still-demo', meta: { title: 'Still', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'A still picture.' } }] });

var canvas = document.createElement('canvas');
var stage = new PD.Stage(canvas, { deck: PD.compile('still-demo'), thumb: true });
stage.resize(480, 270, 1);
stage.still(0, 0);
console.log(canvas.width, canvas.height, canvas.toDataURL('image/png').length > 2000);   // 480 270 true
stage.destroy();
```

To play a stage live yourself, do what the Player does: `preload()`, `prepare(scenes[0])`, `resize(…)`, `enter(0, 0, 'live')`,
then on every animation frame `tick(dt)` and `draw()`.

## `PD.Thumbs`

An idle-time thumbnail cache: one hidden still-picture stage that renders one state per idle moment, so the page never
stalls.

```text
PD.Thumbs(compiled, { w = 480, h = 270, max = 150 }) → { get(si, step) → canvas | null, request(si, step, priority = 0),
  requestAll(), setDeck(compiled), on('ready', fn(si, step, canvas)) → off, pending(), size(), total(), destroy() }
```

```js
PD.deck('thumbs-demo', { format: 2, id: 'thumbs-demo', meta: { title: 'Thumbs', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'One.' } },
           { id: 'b', template: 'three-points', props: { items: [{ title: 'Two' }, { title: 'Three' }] } }] });

var thumbs = PD.Thumbs(PD.compile('thumbs-demo'), { w: 320, h: 180 });
console.log(thumbs.total());                           // 4 states: 1.0, 2.0, 2.1, 2.2
thumbs.on('ready', function (si, step, canvas) {
  if (thumbs.size() === thumbs.total()) { console.log('all ready', thumbs.get(1, 2).width); thumbs.destroy(); }   // all ready 320
});
thumbs.requestAll();
```

`setDeck` drops only the pictures whose scene (or look) changed. The presenter window uses 480 × 270; the Studio's filmstrip
uses 320 × 180.

## Sync and the presenter window

`PD.Sync(deckId, { role: 'stage' | 'notes' })` → `{ id, send(msg), on(fn) → off, close() }` is the message link between a
stage and its presenter window, over `BroadcastChannel('pixeldeck:' + deckId)` (with a `localStorage` fallback). The stage
sends its state after every move; the presenter window binds to the first stage it hears and sends commands (`next`,
`prev`, `goto`, `blackout`, `replay`) addressed to that stage only. Every message carries `{ v: 2, deck, from, mid }`;
a link never hears its own messages, nor another deck's.

```js
var stageLink = PD.Sync('sync-demo', { role: 'stage' }), notesLink = PD.Sync('sync-demo', { role: 'notes' });
notesLink.on(function (msg) {
  if (msg.type === 'state') console.log('presenter sees', (msg.slide + 1) + '.' + msg.step, msg.inst === stageLink.id);   // presenter sees 3.1 true
});
stageLink.send({ type: 'state', inst: stageLink.id, slide: 2, step: 1, steps: 2, total: 5, id: 'c', beat: '', blackout: false, ready: true });
setTimeout(function () { stageLink.close(); notesLink.close(); }, 500);
```

`PD.notes({ deck? })` → a promise of `{ sync, thumbs, compiled, bound(), state(), destroy() }` builds the presenter window
in the current page: notes, the current and next shots, a timer, and a red banner if two stages of the deck are open. It is
what `PD.start(null, { mode: 'notes' })` and `?notes` run.

```js
PD.deck('notes-demo', { format: 2, id: 'notes-demo', meta: { title: 'Notes', theme: 'slate' },
  scenes: [{ id: 'a', template: 'statement', props: { line: 'Hello.' }, notes: 'Say hello, then wait.' }] });
PD.start('notes-demo', { mode: 'notes' }).then(function (presenter) {
  console.log(presenter.compiled.scenes.length, presenter.bound(), document.title);   // 1 null Notes — presenter
});
```
