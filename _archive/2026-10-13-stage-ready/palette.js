/* pixeldeck — 16-color palette.
 * Index 0 is the stage background. Colors are referenced by name everywhere
 * (slides.js, sprites) — rename/retint here and the whole deck follows.
 * Based on the "Sweetie 16" palette by GrafxKid.
 */
var PALETTE = (function () {
  var defs = [
    ['black',  '#1a1c2c'], // 0  stage background (deep space)
    ['plum',   '#5d275d'], // 1
    ['red',    '#b13e53'], // 2
    ['orange', '#ef7d57'], // 3  brand accent
    ['yellow', '#ffcd75'], // 4
    ['lime',   '#a7f070'], // 5
    ['green',  '#38b764'], // 6
    ['teal',   '#257179'], // 7
    ['navy',   '#29366f'], // 8
    ['blue',   '#3b5dc9'], // 9
    ['sky',    '#41a6f6'], // 10
    ['cyan',   '#73eff7'], // 11
    ['white',  '#f4f4f4'], // 12
    ['silver', '#94b0c2'], // 13
    ['gray',   '#566c86'], // 14
    ['slate',  '#333c57']  // 15
  ];
  var aliases = {
    space: 'black', bg: 'black', background: 'black', purple: 'plum', grey: 'gray',
    lightblue: 'sky', gold: 'yellow', ink: 'slate', pink: 'red', darkblue: 'navy'
  };

  var names = [], hex = [], rgb = [], byName = {};
  for (var i = 0; i < defs.length; i++) {
    names.push(defs[i][0]);
    hex.push(defs[i][1]);
    var h = defs[i][1];
    rgb.push([parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]);
    byName[defs[i][0]] = i;
  }
  for (var a in aliases) byName[a] = byName[aliases[a]];

  // Precomputed color ramps between every pair of palette entries, used while
  // particles are in flight. RAMP[(a*16+b)*STEPS1 + k] is a CSS color string.
  var STEPS = 8, STEPS1 = STEPS + 1;
  var ramp = new Array(16 * 16 * STEPS1);
  for (var p = 0; p < 16; p++) {
    for (var q = 0; q < 16; q++) {
      for (var k = 0; k <= STEPS; k++) {
        var t = k / STEPS, A = rgb[p], B = rgb[q];
        var r = Math.round(A[0] + (B[0] - A[0]) * t);
        var g = Math.round(A[1] + (B[1] - A[1]) * t);
        var b = Math.round(A[2] + (B[2] - A[2]) * t);
        ramp[(p * 16 + q) * STEPS1 + k] = 'rgb(' + r + ',' + g + ',' + b + ')';
      }
    }
  }

  function index(c, fallback) {
    if (typeof c === 'number') return c & 15;
    if (typeof c === 'string') {
      var key = c.toLowerCase();
      if (key in byName) return byName[key];
    }
    return fallback === undefined ? byName.white : fallback;
  }

  return {
    names: names, hex: hex, rgb: rgb,
    BG: 0, STEPS: STEPS, STEPS1: STEPS1, RAMP: ramp,
    index: index,
    css: function (c) { return hex[index(c)]; }
  };
})();
