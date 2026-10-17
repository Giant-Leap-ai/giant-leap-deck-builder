/* pixeldeck — sprite definitions + animation player.
 *
 * A sprite frame is an array of equal-length strings; each char is a palette key
 * from the sprite's `keys` map ('.' = transparent). Frames are up to 32x32.
 *
 *   Sprites.define('name', {
 *     keys: { k: 'slate', w: 'white', ... },
 *     anims: { idle: { fps: 2, frames: [ [...rows], [...rows] ] }, ... }
 *   });
 *
 * The astronaut below is assembled from a few hand-drawn parts (helmet, torso,
 * legs, arms) so every pose shares the exact same outline and highlights. The
 * result of compose() is just an ordinary frame (array of strings).
 */
var Sprites = (function () {
  var defs = {};

  function compile(def) {
    var keys = def.keys || {};
    var w = 0, h = 0;
    for (var an in def.anims) {
      var A = def.anims[an];
      A.name = an;
      A.fps = A.fps || 6;
      A.loop = A.loop !== false;
      A.cells = [];
      for (var f = 0; f < A.frames.length; f++) {
        var rows = A.frames[f], cells = [];
        for (var y = 0; y < rows.length; y++) {
          h = Math.max(h, rows.length);
          w = Math.max(w, rows[y].length);
          for (var x = 0; x < rows[y].length; x++) {
            var ch = rows[y].charAt(x);
            if (ch === '.' || ch === ' ') continue;
            cells.push({ x: x, y: y, c: PALETTE.index(keys[ch] || ch) });
          }
        }
        A.cells.push(cells);
      }
    }
    def.w = def.w || w;
    def.h = def.h || h;
    // Flipped versions (mirror inside the frame box).
    for (an in def.anims) {
      A = def.anims[an];
      A.cellsFlip = A.cells.map(function (cells) {
        return cells.map(function (c) { return { x: def.w - 1 - c.x, y: c.y, c: c.c }; });
      });
    }
    return def;
  }

  function define(name, def) { defs[name] = compile(def); return defs[name]; }
  function get(name) { return defs[name]; }

  /* Paint parts onto a W x H canvas of '.'; later parts draw over earlier ones. */
  function compose(W, H, layers) {
    var g = [];
    for (var y = 0; y < H; y++) { g.push([]); for (var x = 0; x < W; x++) g[y].push('.'); }
    for (var i = 0; i < layers.length; i++) {
      var part = layers[i][0], ox = layers[i][1], oy = layers[i][2];
      if (!part) continue;
      for (var py = 0; py < part.length; py++) {
        for (var px = 0; px < part[py].length; px++) {
          var ch = part[py].charAt(px);
          var X = ox + px, Y = oy + py;
          if (ch !== '.' && X >= 0 && Y >= 0 && X < W && Y < H) g[Y][X] = ch;
        }
      }
    }
    return g.map(function (r) { return r.join(''); });
  }

  return { define: define, get: get, compose: compose, defs: defs };
})();

/* ------------------------------------------------------------ the astronaut
 * Palette keys: k outline (slate) · w suit (white) · g suit shade (silver)
 *               v visor (sky) · b visor shade (navy) · o accent (orange)
 */
(function () {
  var P = {
    antenna: ['o', 'g'],
    head: [
      '....kkkkkk.....',
      '..kkwwwwwwkk...',
      '.kwwwwwwwwwwk..',
      '.kwwwwkkkkkkkk.',
      'kwwwwkvvvvvvvvk',
      'kgwwwkvwwvvvvvk',
      'kgwwwkvwvvvvvbk',
      'kgwwwkvvvvvvbbk',
      'kggwwwkvvvvbbk.',
      '.kggwwwkkkkkkk.',
      '..kkgggwwwwkk..',
      '....kkkkkkk....'
    ],
    // head with visor glint moved (idle blink of light)
    head2: [
      '....kkkkkk.....',
      '..kkwwwwwwkk...',
      '.kwwwwwwwwwwk..',
      '.kwwwwkkkkkkkk.',
      'kwwwwkvvvvvvvvk',
      'kgwwwkvvvwwvvvk',
      'kgwwwkvvvwvvvbk',
      'kgwwwkvvvvvvbbk',
      'kggwwwkvvvvbbk.',
      '.kggwwwkkkkkkk.',
      '..kkgggwwwwkk..',
      '....kkkkkkk....'
    ],
    pack: [
      'kkkk',
      'kggk',
      'kgwk',
      'kgwk',
      'kggk',
      'kggk',
      'kkkk'
    ],
    torso: [
      'kkkkkkkkk',
      'kwwwwwwwk',
      'kwwwoowwk',
      'kwwwoowwk',
      'kgwwwwwwk',
      'kgggggggk',
      'kkkkkkkkk'
    ],
    // legs: bottom row is the ground line
    legStand: [
      '.kggkwwk...',
      '.kggkwwk...',
      '.kggkwwkk..',
      '.kgggkgggk.',
      '.kkkkkkkkk.'
    ],
    legWalk1: [
      '..kgkwwk...',
      '.kggkkwwk..',
      '.kgk..kwwk.',
      'kggk..kgggk',
      'kkkk..kkkkk'
    ],
    legWalk2: [
      '..kggkwwk..',
      '..kggkwwkk.',
      '..kggkkgggk',
      '..kgggkkkkk',
      '..kkkkk....'
    ],
    legWalk3: [
      '...kwwkgk..',
      '..kwwkkggk.',
      '.kwwk..kgk.',
      'kgggk..kggk',
      'kkkkk..kkkk'
    ],
    legWalk4: [
      '..kggkwwk..',
      '..kggkwwk..',
      '..kgkkwwkk.',
      '..kkkkgggk.',
      '......kkkk.'
    ],
    legCrouch: [
      '.kggkwwwk..',
      'kgggkkgggk.',
      'kkkkkkkkkk.'
    ],
    legStretch: [
      '..kggkwwk..',
      '..kggkwwk..',
      '..kggkwwk..',
      '..kggkwwk..',
      '..kgkkwgk..',
      '..kk..kk...'
    ],
    legTuck: [
      '.kggkwwwwk.',
      '.kgggkgggk.',
      '..kkkkkkk..'
    ],
    legDangle: [
      '..kggkwwk..',
      '..kggkwwk..',
      '...kggkwwk.',
      '...kgk.kggk',
      '...kk...kk.'
    ],
    armDown: [
      'kkk',
      'kwk',
      'kwk',
      'kwk',
      'kgk',
      'kkk'
    ],
    armSwingF: [
      'kkk.',
      'kwk.',
      'kwwk',
      '.kwk',
      '.kgk',
      '.kkk'
    ],
    armSwingB: [
      '.kkk',
      '.kwk',
      'kwwk',
      'kwk.',
      'kgk.',
      'kkk.'
    ],
    armUp: [
      '.....kkk.',
      '.....kgk.',
      '.....kgk.',
      '.....kwk.',
      '.....kwk.',
      '....kwwk.',
      '...kwwk..',
      '.kkwwk...',
      'kwwwk....'
    ],
    armUpL: [
      '....kkk..',
      '....kgk..',
      '....kgkk.',
      '.....kwk.',
      '.....kwk.',
      '....kwwk.',
      '...kwwk..',
      '.kkwwk...',
      'kwwwk....'
    ],
    armUpR: [
      '......kkk',
      '......kgk',
      '.....kkgk',
      '.....kwk.',
      '.....kwk.',
      '....kwwk.',
      '...kwwk..',
      '.kkwwk...',
      'kwwwk....'
    ],
    armOut: [
      'kkkkkk.',
      'kwwwwgk',
      'kkkkkkk'
    ],
    armFloat: [
      'kkk...',
      'kwwk..',
      '.kwwkk',
      '..kwgk',
      '...kkk'
    ],
    armFloat2: [
      'kkk....',
      'kwwkkk.',
      '.kwwwgk',
      '..kkkkk'
    ],
    armPoint: [
      'kkkkkkk..',
      'kwwwwwggk',
      'kkkkkkkk.'
    ],
    armPoint2: [
      'kkkkkkkk.',
      'kwwwwwgggk',
      'kkkkkkkkk.'
    ]
  };

  var W = 24, H = 30, TOP = 2, GROUND = 27;

  /* Build one pose.
   *  dy      : upper-body vertical offset (bob / squash)
   *  legs    : leg part
   *  air     : legs hang from the torso instead of standing on the ground
   *  arm     : near-arm part + [ax, ay] offset from the shoulder
   */
  function pose(o) {
    var dy = o.dy || 0;
    var head = o.head || P.head;
    var torsoY = TOP + 14 + dy;
    var legs = o.legs || P.legStand;
    var legY = o.air ? torsoY + 6 + (o.legDy || 0) : GROUND - legs.length + 1;
    var layers = [];
    if (o.armBack) layers.push([o.armBack, 5 + (o.abx || 0), torsoY + 1 + (o.aby || 0)]);
    layers.push([legs, 6 + (o.lx || 0), legY]);
    layers.push([P.pack, 3, TOP + 13 + dy]);
    layers.push([P.torso, 6, torsoY]);
    layers.push([P.antenna, 9, TOP + 1 + dy + (o.headDy || 0)]);
    layers.push([head, 4, TOP + 3 + dy + (o.headDy || 0)]);
    if (o.arm) layers.push([o.arm, 13 + (o.ax || 0), torsoY + 1 + (o.ay || 0)]);
    return Sprites.compose(W, H, layers);
  }

  Sprites.define('astronaut', {
    w: W, h: H,
    keys: { k: 'slate', w: 'white', g: 'silver', v: 'sky', b: 'navy', o: 'orange' },
    anims: {
      idle: { fps: 2, frames: [
        pose({ arm: P.armDown }),
        pose({ arm: P.armDown, dy: 1, head: P.head2 })
      ] },
      walk: { fps: 8, frames: [
        pose({ legs: P.legWalk1, arm: P.armSwingB, ax: -1 }),
        pose({ legs: P.legWalk2, arm: P.armDown, dy: -1 }),
        pose({ legs: P.legWalk3, arm: P.armSwingF }),
        pose({ legs: P.legWalk4, arm: P.armDown, dy: -1 })
      ] },
      // 6 frames: crouch (squash) · launch (stretch) · rise · apex tuck · fall (stretch) · land (squash)
      jump: { fps: 10, loop: false, sync: 'jump', frames: [
        pose({ legs: P.legCrouch, dy: 3, arm: P.armDown }),
        pose({ legs: P.legStretch, air: true, dy: -2, headDy: -1, arm: P.armUp, ax: 1, ay: -8 }),
        pose({ legs: P.legStand, air: true, legDy: -1, arm: P.armUp, ax: 1, ay: -8 }),
        pose({ legs: P.legTuck, air: true, legDy: -1, dy: 1, arm: P.armOut, ay: 0 }),
        pose({ legs: P.legStretch, air: true, dy: -1, arm: P.armUpR, ax: 1, ay: -8 }),
        pose({ legs: P.legCrouch, dy: 3, arm: P.armDown, ax: 0 })
      ] },
      point: { fps: 3, frames: [
        pose({ arm: P.armPoint, ay: 0 }),
        pose({ arm: P.armPoint2, ay: 0, head: P.head2 })
      ] },
      wave: { fps: 6, frames: [
        pose({ arm: P.armUpL, ax: 1, ay: -8 }),
        pose({ arm: P.armUp, ax: 1, ay: -8 }),
        pose({ arm: P.armUpR, ax: 1, ay: -8 })
      ] },
      float: { fps: 2, frames: [
        pose({ legs: P.legDangle, air: true, arm: P.armFloat, ay: 0 }),
        pose({ legs: P.legDangle, air: true, dy: -1, legDy: 1, arm: P.armFloat2, ay: 0, head: P.head2 })
      ] }
    }
  });
})();

/* ------------------------------------------------------------------ Actor
 * A placed sprite instance that plays animations and moves along paths.
 * Motion is computed from the deck's state clock so it can be fast-forwarded
 * deterministically.
 */
function Actor(id, spriteName) {
  this.id = id;
  this.def = Sprites.get(spriteName) || Sprites.get('astronaut');
  this.x = 0; this.y = 0;
  this.flip = false;
  this.anim = 'idle';
  this.animT = 0;
  this.visible = true;
  this.gone = false;          // dissolved into particles
  this.assembled = true;
  this.pending = 0;
  this.moves = [];            // [{sx,sy,tx,ty,t0,dur,path,height,anim,ease,flip}]
  this.endAnim = null;
  this.t0 = 0;                // state time at which the moves start
  this.syncFrame = -1;
}

Actor.prototype.play = function (anim) {
  if (!this.def.anims[anim]) anim = 'idle';
  if (anim !== this.anim) { this.anim = anim; this.animT = 0; }
};

/* moves: [{to:[x,y], dur, path:'linear'|'arc'|'jump', height, anim, ease, flip}] */
Actor.prototype.setMoves = function (moves, startT, endAnim) {
  var x = this.x, y = this.y, t = 0;
  this.moves = [];
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    var to = m.to || [x, y];
    var dur = m.dur == null ? 1 : m.dur;
    this.moves.push({
      sx: x, sy: y, tx: to[0], ty: to[1], t0: t, dur: dur,
      path: m.path || 'linear', height: m.height == null ? 20 : m.height,
      anim: m.anim, ease: Ease.get(m.ease || (m.path === 'jump' ? 'linear' : 'inOutQuad')),
      flip: m.flip
    });
    x = to[0]; y = to[1]; t += dur + (m.pause || 0);
  }
  this.t0 = startT;
  this.endAnim = endAnim || null;
};

Actor.prototype.movesEnd = function () {
  if (!this.moves.length) return this.t0;
  var m = this.moves[this.moves.length - 1];
  return this.t0 + m.t0 + m.dur;
};

Actor.prototype.moving = function (stateT) {
  return this.moves.length > 0 && stateT < this.movesEnd();
};

Actor.prototype.update = function (stateT, dt) {
  this.animT += dt;
  this.syncFrame = -1;
  if (!this.visible || !this.moves.length) return;
  var local = stateT - this.t0;
  if (local < 0) return;
  for (var i = 0; i < this.moves.length; i++) {
    var m = this.moves[i];
    if (local > m.t0 + m.dur && i < this.moves.length - 1) continue;
    var p = Math.max(0, Math.min(1, (local - m.t0) / m.dur));
    if (local < m.t0) { // pause between segments
      this.x = m.sx; this.y = m.sy;
      return;
    }
    if (m.anim) this.play(m.anim);
    this.flip = m.flip != null ? m.flip : (m.tx < m.sx ? true : m.tx > m.sx ? false : this.flip);
    if (p >= 1) {
      this.x = m.tx; this.y = m.ty;
      if (i === this.moves.length - 1 && this.endAnim) this.play(this.endAnim);
      return;
    }
    var A = this.def.anims[this.anim];
    if (m.path === 'jump') {
      var pre = 0.16, post = 0.16;
      var u = Math.max(0, Math.min(1, (p - pre) / (1 - pre - post)));
      var e = m.ease(u);
      this.x = m.sx + (m.tx - m.sx) * e;
      this.y = m.sy + (m.ty - m.sy) * u - m.height * 4 * u * (1 - u);
      if (A && A.sync === 'jump') {
        this.syncFrame = p < pre ? 0 : p >= 1 - post ? 5 : u < 0.22 ? 1 : u < 0.42 ? 2 : u < 0.62 ? 3 : 4;
      }
    } else if (m.path === 'arc') {
      e = m.ease(p);
      this.x = m.sx + (m.tx - m.sx) * e;
      this.y = m.sy + (m.ty - m.sy) * e - m.height * Math.sin(Math.PI * e);
    } else {
      e = m.ease(p);
      this.x = m.sx + (m.tx - m.sx) * e;
      this.y = m.sy + (m.ty - m.sy) * e;
    }
    return;
  }
};

// Jump to the end of all moves.
Actor.prototype.finish = function () {
  if (this.moves.length) {
    var m = this.moves[this.moves.length - 1];
    this.x = m.tx; this.y = m.ty;
    if (m.tx !== m.sx && m.flip == null) this.flip = m.tx < m.sx;
    if (m.flip != null) this.flip = m.flip;
    this.moves = [];
  }
  if (this.endAnim) { this.play(this.endAnim); this.endAnim = null; }
  this.syncFrame = -1;
};

Actor.prototype.frame = function () {
  var A = this.def.anims[this.anim];
  if (this.syncFrame >= 0 && this.syncFrame < A.cells.length) return this.syncFrame;
  var f = Math.floor(this.animT * A.fps);
  return A.loop ? f % A.cells.length : Math.min(f, A.cells.length - 1);
};

// Current pixels in grid space: [{x,y,c}]
Actor.prototype.cells = function () {
  var A = this.def.anims[this.anim];
  var src = (this.flip ? A.cellsFlip : A.cells)[this.frame()];
  var ox = Math.round(this.x), oy = Math.round(this.y), out = [];
  for (var i = 0; i < src.length; i++) out.push({ x: ox + src[i].x, y: oy + src[i].y, c: src[i].c });
  return out;
};

Actor.prototype.draw = function (R) {
  if (!this.visible || this.gone) return;
  var A = this.def.anims[this.anim];
  var src = (this.flip ? A.cellsFlip : A.cells)[this.frame()];
  var ox = Math.round(this.x), oy = Math.round(this.y), ctx = R.ctx, hex = PALETTE.hex, last = -1;
  for (var i = 0; i < src.length; i++) {
    var c = src[i];
    if (c.c !== last) { ctx.fillStyle = hex[c.c]; last = c.c; }
    R.cell(ox + c.x, oy + c.y);
  }
};
