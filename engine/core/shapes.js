/* engine/core/shapes.js — dynamic particle shapes: spark, cube, swarm (body verbatim from cinema/engine/particles.js (Shapes)),
 * and the built-in entries of the shape registry (spec §4.7): spark, cube (container), swarm (inside: <id>), points. */
PD.module('core/shapes', ['core/util'], function (PD, util) {
  var CX = util.CX, CY = util.CY, U = util.U, col = util.col;
  /* cinema — glowing particle field.
   * Particles are additive glow sprites in 1920x1080 design space. They morph
   * between target sets (text sampled from real typography, or live 3D shapes)
   * using the same O(n log n) Hilbert-curve pairing as pixeldeck, follow eased
   * bezier arcs, lerp color/alpha/size in flight, and shimmer gently at rest. */

  /* ---------------------------------------------------------- dynamic shapes
   * A shape exposes count, px/py (positions this frame), and per-point color.
   * update(t) is called every frame; particles parked on a shape follow it. */
  var Shapes = (function () {
    var uid = 0;

    // M4: the constructors take the stage theme's col() (spec §4.7 env.col); without one they use the base table.
    function Spark(o, cf) {
      cf = cf || col;
      this.id = 'spark' + (uid++);
      this.n = o.count || 700;
      this.x = o.x == null ? CX : o.x; this.y = o.y == null ? CY : o.y;
      this.radius = o.radius || 34;
      var r = U.rng(o.seed || 5);
      this.r = new Float32Array(this.n); this.a = new Float32Array(this.n); this.w = new Float32Array(this.n); this.z = new Float32Array(this.n);
      for (var i = 0; i < this.n; i++) {
        this.r[i] = Math.pow(r(), 2.2) * this.radius + 1;
        this.a[i] = r() * 6.283; this.w[i] = (0.4 + r() * 1.6) * (r() < 0.5 ? -1 : 1); this.z[i] = r();
      }
      this.px = new Float32Array(this.n); this.py = new Float32Array(this.n);
      this.c = U.hex(cf(o.color || 'gold')); this.c2 = U.hex(cf(o.color2 || 'white'));
    }
    Spark.prototype.update = function (t) {
      var breathe = 1 + Math.sin(t * 1.7) * 0.08;
      for (var i = 0; i < this.n; i++) {
        var a = this.a[i] + t * this.w[i] * (1.5 - this.r[i] / this.radius);
        var rr = this.r[i] * breathe;
        this.px[i] = this.x + Math.cos(a) * rr;
        this.py[i] = this.y + Math.sin(a) * rr * 0.85;
      }
    };
    Spark.prototype.color = function (i) { return U.mix(this.c2, this.c, U.clamp(this.r[i] / this.radius * 1.4, 0, 1)); };
    Spark.prototype.size = function (i) { return 6 + (1 - this.r[i] / this.radius) * 10; };

    // Wireframe cube, rotating in 3D with perspective.
    function Cube(o, cf) {
      cf = cf || col;
      this.id = 'cube' + (uid++);
      this.x = o.x == null ? CX : o.x; this.y = o.y == null ? CY : o.y;
      this.scale = o.size || 300;
      this.per = o.perEdge || 46;
      this.spin = o.spin == null ? 0.25 : o.spin;
      this.tilt = o.tilt == null ? 0.45 : o.tilt;
      var V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
      var E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      this.pts = [];
      for (var e = 0; e < E.length; e++) {
        var A = V[E[e][0]], B = V[E[e][1]];
        for (var k = 0; k < this.per; k++) {
          var f = k / this.per;
          this.pts.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]);
        }
      }
      this.n = this.pts.length;
      this.px = new Float32Array(this.n); this.py = new Float32Array(this.n); this.pz = new Float32Array(this.n);
      this.c = U.hex(cf(o.color || 'cyan'));
      this.c2 = U.hex(cf(o.color2 || 'violet'));
    }
    Cube.prototype.project = function (x, y, z, t, out, i) {
      var a = t * this.spin + 0.6, ca = Math.cos(a), sa = Math.sin(a);
      var X = x * ca - z * sa, Z = x * sa + z * ca;
      var cb = Math.cos(this.tilt), sb = Math.sin(this.tilt);
      var Y = y * cb - Z * sb; Z = y * sb + Z * cb;
      var s = this.scale, p = 900 / (900 + Z * s);
      this.px[i] = this.x + X * s * p; this.py[i] = this.y + Y * s * p; this.pz[i] = Z;
    };
    Cube.prototype.update = function (t) {
      this.t = t;
      for (var i = 0; i < this.n; i++) { var P = this.pts[i]; this.project(P[0], P[1], P[2], t, null, i); }
    };
    Cube.prototype.color = function (i) { return U.mix(this.c, this.c2, (this.pts[i][2] + 1) / 2); };
    Cube.prototype.size = function (i) { return 7; };
    Cube.prototype.alpha = function (i) { return 0.55 + 0.45 * (1 - (this.pz[i] + 1) / 2); };

    // Particles drifting inside a cube (shares its rotation).
    function Swarm(o, cube, cf) {
      cf = cf || col;
      this.id = 'swarm' + (uid++);
      this.cube = cube;
      this.n = o.count || 500;
      var r = U.rng(o.seed || 11);
      this.p = [];
      for (var i = 0; i < this.n; i++) this.p.push([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 6.28, 0.3 + r() * 0.8]);
      this.px = new Float32Array(this.n); this.py = new Float32Array(this.n);
      this.cs = (o.colors || ['gold', 'orange', 'rose', 'white']).map(function (c) { return U.hex(cf(c)); });
      this.r = r;
    }
    Swarm.prototype.update = function (t) {
      var c = this.cube;
      for (var i = 0; i < this.n; i++) {
        var P = this.p[i], ph = P[3], w = P[4];
        var x = U.clamp(P[0] * 0.8 + Math.sin(t * w + ph) * 0.18, -0.88, 0.88);
        var y = U.clamp(P[1] * 0.8 + Math.cos(t * w * 1.3 + ph * 2) * 0.18, -0.88, 0.88);
        var z = U.clamp(P[2] * 0.8 + Math.sin(t * w * 0.7 + ph * 3) * 0.18, -0.88, 0.88);
        var a = t * c.spin + 0.6, ca = Math.cos(a), sa = Math.sin(a);
        var X = x * ca - z * sa, Z = x * sa + z * ca;
        var cb = Math.cos(c.tilt), sb = Math.sin(c.tilt);
        var Y = y * cb - Z * sb; Z = y * sb + Z * cb;
        var s = c.scale, p = 900 / (900 + Z * s);
        this.px[i] = c.x + X * s * p; this.py[i] = c.y + Y * s * p;
      }
    };
    Swarm.prototype.color = function (i) { return this.cs[i % this.cs.length]; };
    Swarm.prototype.size = function (i) { return 7 + (i % 5); };

    return { Spark: Spark, Cube: Cube, Swarm: Swarm };
  })();

  /* M4: the shape registry's built-ins (spec §4.7). create(spec, env) with env = { byId, theme, col, uid }:
   * byId maps the ids of the state's container shapes (built first, Stage.enter), col is the stage theme's col(),
   * uid() is stage.uid(). Registration allocates nothing, touches no DOM and draws no random number. */
  PD.shape('spark', { create: function (spec, env) { return new Shapes.Spark(spec, env && env.col); } });
  PD.shape('cube', { container: true, create: function (spec, env) { return new Shapes.Cube(spec, env && env.col); } });
  PD.shape('swarm', {          // drifts inside the container shape whose id is spec.inside (a lone default cube without one)
    create: function (spec, env) {
      var cf = env && env.col, byId = (env && env.byId) || {};
      return new Shapes.Swarm(spec, byId[spec.inside] || new Shapes.Cube({}, cf), cf);
    }
  });
  PD.shape('points', {         // static targets: spec.points is an array, or a function called once per stage
    create: function (spec, env) {
      var pts = typeof spec.points === 'function' ? spec.points() : spec.points;
      return { id: 'pts' + env.uid(), n: pts.length, static: pts };
    }
  });

  return { Shapes: Shapes };
});
