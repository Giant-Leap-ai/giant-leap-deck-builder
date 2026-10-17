/* pixeldeck — hand-built 5x7 bitmap font + text layout.
 * Glyphs are rows of "0"/"1". Narrow glyphs (I . , ! : ' ( ) ") use fewer columns,
 * which gives the font a little natural kerning. Lowercase maps to uppercase.
 */
var Font = (function () {
  var G = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
    'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    'I': ['111', '010', '010', '010', '010', '010', '111'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'N': ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '.': ['0', '0', '0', '0', '0', '0', '1'],
    ',': ['00', '00', '00', '00', '01', '01', '10'],
    '!': ['1', '1', '1', '1', '1', '0', '1'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
    "'": ['1', '1', '0', '0', '0', '0', '0'],
    '-': ['0000', '0000', '0000', '1111', '0000', '0000', '0000'],
    ':': ['0', '0', '1', '0', '0', '1', '0'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
    '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
    '%': ['11001', '11001', '00010', '00100', '01000', '10011', '10011'],
    '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
    '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
    '(': ['001', '010', '100', '100', '100', '010', '001'],
    ')': ['100', '010', '001', '001', '001', '010', '100'],
    '"': ['101', '101', '000', '000', '000', '000', '000'],
    '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
    '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
    '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
    '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
    ' ': ['000', '000', '000', '000', '000', '000', '000']
  };
  var H = 7;

  // Precompute lit pixels and widths.
  var glyphs = {};
  for (var ch in G) {
    var rows = G[ch], px = [];
    for (var y = 0; y < rows.length; y++)
      for (var x = 0; x < rows[y].length; x++)
        if (rows[y].charAt(x) === '1') px.push(x, y);
    glyphs[ch] = { w: rows[0].length, px: px };
  }
  function glyph(ch) {
    ch = ch.toUpperCase();
    return glyphs[ch] || glyphs['?'];
  }

  // Width in cells of a run of text.
  function measure(str, scale, ls) {
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      w += glyph(str.charAt(i)).w * scale;
      if (i < str.length - 1) w += ls;
    }
    return w;
  }

  /* Word-wrap into lines. Returns [{text, start}] where start is the index of
   * the line's first char in the original string (for highlight ranges). */
  function wrap(str, scale, ls, maxWidth) {
    var lines = [];
    var paras = str.split('\n'), offset = 0;
    for (var p = 0; p < paras.length; p++) {
      var para = paras[p];
      var re = /\S+/g, m, line = '', lineStart = offset;
      while ((m = re.exec(para))) {
        var word = m[0];
        var cand = line ? line + ' ' + word : word;
        if (line && measure(cand, scale, ls) > maxWidth) {
          lines.push({ text: line, start: lineStart });
          line = word;
          lineStart = offset + m.index;
        } else {
          if (!line) lineStart = offset + m.index;
          line = cand;
        }
      }
      lines.push({ text: line, start: lineStart });
      offset += para.length + 1;
    }
    return lines;
  }

  /* Rasterize a text item to target cells.
   * item: { str, scale=1, x, y=0, align='center'|'left'|'right', maxWidth=300,
   *         letterSpacing=1 (font px), lineSpacing (cells, default 3*scale), color }
   * Returns { cells:[{x,y,ci,letter,word,line}], width, height, lines } where ci is the
   * char index in item.str, letter/word are running indexes within this item. */
  function layout(item) {
    var str = String(item.str == null ? '' : item.str);
    var scale = Math.max(1, Math.round(item.scale || 1));
    var ls = (item.letterSpacing == null ? 1 : item.letterSpacing) * scale;
    var lineGap = item.lineSpacing == null ? 3 * scale : item.lineSpacing;
    var maxWidth = item.maxWidth || 300;
    var align = item.align || 'center';
    var lines = wrap(str, scale, ls, maxWidth);
    var lineH = H * scale;
    var cells = [], letter = 0, word = 0, widest = 0;
    var top = item.y || 0;

    for (var li = 0; li < lines.length; li++) {
      var L = lines[li], w = measure(L.text, scale, ls);
      widest = Math.max(widest, w);
      var x0;
      if (align === 'left') x0 = item.x == null ? 20 : item.x;
      else if (align === 'right') x0 = (item.x == null ? 300 : item.x) - w;
      else x0 = Math.round((item.x == null ? 160 : item.x) - w / 2);
      var y0 = top + li * (lineH + lineGap);
      var cx = x0, prevSpace = true;
      for (var i = 0; i < L.text.length; i++) {
        var ch = L.text.charAt(i), g = glyph(ch);
        if (ch === ' ') { prevSpace = true; }
        else {
          if (prevSpace && (i > 0 || li > 0)) word++;
          prevSpace = false;
          for (var k = 0; k < g.px.length; k += 2) {
            var gx = g.px[k], gy = g.px[k + 1];
            for (var sy = 0; sy < scale; sy++)
              for (var sx = 0; sx < scale; sx++)
                cells.push({ x: cx + gx * scale + sx, y: y0 + gy * scale + sy, ci: L.start + i, letter: letter, word: word, line: li });
          }
          letter++;
        }
        cx += g.w * scale + ls;
      }
    }
    return {
      cells: cells, width: widest, lines: lines.length,
      height: lines.length * lineH + (lines.length - 1) * lineGap,
      letters: letter, words: word + 1
    };
  }

  return { H: H, glyph: glyph, measure: measure, wrap: wrap, layout: layout, glyphs: glyphs };
})();
