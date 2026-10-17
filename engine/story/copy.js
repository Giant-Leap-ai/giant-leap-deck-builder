/* engine/story/copy.js — the guide's voice and the shared text helpers of the story backbone (spec §6.7–§6.9, WP5).
 *
 * Creates the PD.story namespace (every other story module adds to it) and exports, both as the module's exports and
 * on PD.story:
 *   COPY            { key: string }  microcopy, second person, at most two sentences, no "error" / "invalid". {tokens}
 *                   are filled by say(). Keys: welcome, q.goal q.audience q.targetMin q.bigIdea q.bigIdea.long
 *                   q.shortIdea q.shortIdea.long q.turn q.turn.long q.ask q.ask.verb q.proof q.brand q.tone q.max,
 *                   fw.pick fw.pick.open, board.emptyBeat board.placeholder, lint.clean lint.summary lint.ready
 *                   lint.notReady lint.ignore, assets.drop assets.tainted assets.heic assets.solidLogo,
 *                   save.local save.quota, export.done export.fontWarn
 *   COPY_PARTS      { key: [title, help?] }  the question keys split in two (a question and its one-line help); the
 *                   COPY string of such a key is the two parts joined with a space (a full stop is added after a title that
 *                   has no closing mark of its own, so "Your three strongest pieces of evidence" reads as a sentence)
 *   say(key, vars?) COPY[key] with {tokens} replaced from vars (an unknown token is left as it is); '' for an unknown key
 *   fmt(str, vars?) the same replacement for any string
 *   BUDGET          { style: { words, chars, lines, voice, perLine? } }  copy budget per text style (§6.8)
 *   DEVICES         [{ id, label, tip }]  the copy devices the editor suggests (§6.8): split sentence, Not X. Y., number then
 *                   meaning, callback, one accent = the future, silence beats
 *   STOPWORDS, IMPERATIVES, JARGON   arrays of lower-case strings (§6.7)
 *   PLACEHOLDER     the placeholder regex /\{[^{}]{1,40}\}/
 *   words(s) → n    s.trim().split(/\s+/).filter(Boolean).length (0 for a non-string)
 *   tokens(s) → string[]   lower-case words with punctuation stripped (apostrophes vanish, hyphens split), STOPWORDS dropped
 *                          ("not" is kept)
 *   match(a, b) → bool     a === b, or both at least 5 characters long and sharing their first 5
 *   echo(bigIdea, text) → bool   at least 2 distinct tokens of bigIdea match tokens of text
 *   placeholderIn(str) → string | null   the first {token} (or "lorem" / "TODO") found in str
 *   placeholders(value) → string[]   every {token} found in any string of value (a string, array or plain object, deep);
 *                                    the storyboard cards use it for the dashed border and "no placeholders remain"
 *   firstWord(str) → string   the first word, lower-case, punctuation stripped ("Let's" → "let's")
 *   startsImperative(str) → bool   firstWord(str) is in IMPERATIVES
 *   jargonIn(str) → string[]  JARGON words used in str (plurals and -ed / -ing forms count)
 *   speech(notes) → string    notes without the prompt lines the storyboard writes ("▸ …"): those ask the speaker a
 *                             question, they are not words to say, so they count neither as speaking time nor as notes
 *
 * Registration defines functions and tables only: no DOM, no texture, no random number. */
PD.module('story/copy', [], function (PD) {
  var S = PD.story || (PD.story = {});
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------------------------------------------------------- microcopy (§6.9)
   * [key, title, help?]. A key with a help line is a question: COPY[key] = title + ' ' + help. */
  var TEXTS = [
    ['welcome', "Let's build a talk people remember. Ten questions, about ten minutes, and you can skip any of them."],

    ['q.goal', 'What should this talk do?', 'Pick the closest one, because it decides the shape of your story.'],
    ['q.audience', "Who's in the room, and what do they believe today?", 'One or two lines is plenty.'],
    ['q.targetMin', 'How long is your slot?', 'Pick the minutes you really have, because they set how many scenes you start with.'],
    ['q.bigIdea', 'If they remember one sentence, what is it?', "Write it the way you'd say it to a friend in a lift."],
    ['q.bigIdea.long', "That's {n} words. Try it in one breath: 15 words or fewer."],
    ['q.shortIdea', 'Now say it in six words or fewer.', 'This is what goes on screen.'],
    ['q.shortIdea.long', "That's {n} words. Cut it to six or fewer so it fits on one line."],
    ['q.turn', 'What do they believe now, and what should they believe after?', "This becomes your turning point: 'Not ___. ___.'"],
    ['q.turn.long', 'Try five words or fewer on each side.'],
    ['q.ask', 'What should they do by next week?', 'Start with a verb, like Book, Try or Pick.'],
    ['q.ask.verb', 'Start with a verb: Book, Try, Pick.'],
    ['q.proof', 'Your three strongest pieces of evidence', 'A number, a quote, a story or a demo each; skip any you do not have.'],
    ['q.brand', 'Who are you, in one line?', 'A name up to 30 characters, then a tagline up to 40.'],
    ['q.tone', 'What should it feel like?', 'Pick the closest one, because it chooses your look.'],
    ['q.max', "That's {n} characters. Aim for {max} or fewer."],

    ['fw.pick', "Here's the shape we'd suggest. You want to {goal} in {targetMin} minutes, and {framework} is built for {bestFor}."],
    ['fw.pick.open', "Here's the shape we'd suggest. {framework} is built for {bestFor}."],
    ['board.emptyBeat', 'This beat needs a scene. {ask}'],
    ['board.placeholder', "Answer '{token}' in the interview, or type over it."],

    ['lint.clean', 'Your story holds together. Rehearse it out loud once.'],
    ['lint.summary', '{e} to fix, {w} to consider, {i} tips.'],
    ['lint.ready', 'Ready for the stage'],
    ['lint.notReady', "{e} things to fix before it's stage-ready. You can still present."],
    ['lint.ignore', 'Ignore for this scene'],

    ['assets.drop', "Drop a logo or image. We'll keep it inside the deck so it works offline."],
    ['assets.tainted', "This image came from a file link, so it can't become particles. Drop it here again and we'll embed it."],
    ['assets.heic', "Can't use .{ext} yet. Export it as PNG or JPEG."],
    ['assets.solidLogo', 'Your logo has a solid background, so particles will draw a box. Try brightness mode.'],

    ['save.local', 'Autosave lives in this browser only. Saving to a file is the real save.'],
    ['save.quota', 'Autosave is full. Save to a file now.'],
    ['export.done', 'Saved. Double-click {file} to present, no internet needed.'],
    ['export.fontWarn', 'This deck uses {font}, which only exists on Macs. Drop a font file in to embed it.']
  ];
  var COPY = {}, COPY_PARTS = {};
  // The title of a question is a heading and may have no closing mark ("Your three strongest pieces of evidence"); joined
  // with its help line it needs one, or the two run into each other. COPY_PARTS keeps the title exactly as written.
  function joinParts(title, help) { return /[.!?:;\u2026]$/.test(title) ? title + ' ' + help : title + '. ' + help; }
  TEXTS.forEach(function (t) {
    COPY[t[0]] = t[2] ? joinParts(t[1], t[2]) : t[1];
    COPY_PARTS[t[0]] = t[2] ? [t[1], t[2]] : [t[1]];
  });

  function fmt(str, vars) {
    return String(str).replace(/\{([A-Za-z][\w.]*)\}/g, function (m, name) {
      return vars && has(vars, name) && vars[name] != null ? String(vars[name]) : m;
    });
  }
  function say(key, vars) { return has(COPY, key) ? fmt(COPY[key], vars) : ''; }

  /* ---------------------------------------------------------- copy budget per style (§6.8) */
  var BUDGET = {
    mega:      { words: 2,  chars: 10,  lines: 1, voice: 'numerals, never a sentence' },
    hero:      { words: 3,  chars: 14,  lines: 1, voice: 'a noun phrase, or one word with a period; one per shot' },
    title:     { words: 5,  chars: 24,  lines: 1, voice: 'a concrete fact of scale' },
    statement: { words: 14, chars: 141, lines: 3, perLine: 47, voice: 'spoken, present tense' },
    subtitle:  { words: 7,  chars: 40,  lines: 1, voice: 'a tagline, no period' },
    kicker:    { words: 5,  chars: 30,  lines: 1, voice: 'the first half of a sentence' },
    body:      { words: 30, chars: 256, lines: 4, perLine: 64, voice: 'last resort' },
    year:      { words: 2,  chars: 14,  lines: 1, voice: '' },
    label:     { words: 4,  chars: 22,  lines: 1, voice: '' },
    caption:   { words: 6,  chars: 40,  lines: 1, voice: '' }
  };

  var DEVICES = [
    { id: 'split', label: 'Split sentence', tip: 'A kicker sets the line up and a statement lands it.' },
    { id: 'not-x-y', label: 'Not X. Y.', tip: 'Name the old belief first, then the new one.' },
    { id: 'number-meaning', label: 'Number, then meaning', tip: 'A scale fact never stands alone: the next line says why it matters.' },
    { id: 'callback', label: 'Callback', tip: 'The last hero repeats the first.' },
    { id: 'one-accent', label: 'One accent', tip: 'Use the accent color only for "what could be".' },
    { id: 'silence', label: 'Silence beats', tip: 'Add a scene of eight words or fewer, with "pause" in its notes, at least every five minutes.' }
  ];
  var STOPWORDS = ('a an the and or but of to in on at for with is are was were be it its that this these those we you they our your their ' +
    'more most as by from into than so just very').split(' ');
  var IMPERATIVES = ('book try pick start join visit email call sign choose bring share download schedule ask talk build test pilot register ' +
    "apply contact follow read watch write go come reply send plan map pair stop let's").split(' ');
  var JARGON = ('leverage synergy utilise utilize robust seamless best-in-class paradigm holistic solutions unlock game-changer').split(' ');
  var PLACEHOLDER = /\{[^{}]{1,40}\}/;

  var stopSet = {}, impSet = {};
  STOPWORDS.forEach(function (w) { stopSet[w] = 1; });
  IMPERATIVES.forEach(function (w) { impSet[w] = 1; });

  /* ---------------------------------------------------------- text helpers (§6.7) */
  function words(s) { return typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean).length : 0; }

  var WORD = /[\p{L}\p{N}]+(?:[-'\u2019][\p{L}\p{N}]+)*/gu;
  function rawTokens(s) {
    var m = typeof s === 'string' ? s.toLowerCase().match(WORD) : null;
    return m ? m.map(function (t) { return t.replace(/\u2019/g, "'"); }) : [];
  }
  var PLAIN = /[\p{L}\p{N}]+/gu;      // tokens(): apostrophes are removed ("it's" is "its", a stopword), hyphens split a word
  function tokens(s) {
    var m = typeof s === 'string' ? s.toLowerCase().replace(/['\u2019]/g, '').match(PLAIN) : null;
    return m ? m.filter(function (t) { return !has(stopSet, t); }) : [];
  }
  function match(a, b) { return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)); }
  function echo(bigIdea, text) {
    var a = tokens(bigIdea), b = tokens(text), seen = {}, n = 0;
    for (var i = 0; i < a.length; i++) {
      if (has(seen, a[i])) continue;
      for (var j = 0; j < b.length; j++) if (match(a[i], b[j])) { seen[a[i]] = 1; n++; break; }
    }
    return n >= 2;
  }
  function placeholderIn(str) {
    if (typeof str !== 'string') return null;
    var m = str.match(PLACEHOLDER);
    if (m) return m[0];
    m = str.match(/lorem|TODO/i);
    return m ? m[0] : null;
  }
  function placeholders(v, out) {
    out = out || [];
    if (typeof v === 'string') { var re = new RegExp(PLACEHOLDER.source, 'g'), m; while ((m = re.exec(v))) out.push(m[0]); }
    else if (Array.isArray(v)) v.forEach(function (x) { placeholders(x, out); });
    else if (v && typeof v === 'object') for (var k in v) if (has(v, k)) placeholders(v[k], out);
    return out;
  }
  function firstWord(str) {
    var m = typeof str === 'string' ? str.toLowerCase().match(WORD) : null;
    return m ? m[0].replace(/\u2019/g, "'") : '';
  }
  function startsImperative(str) { return has(impSet, firstWord(str)); }

  var jargonTerms = JARGON.map(function (w) { return { w: w, s: w.replace(/e$/, '') }; });
  function jargonIn(str) {
    var out = [];
    rawTokens(str).forEach(function (t) {
      for (var i = 0; i < jargonTerms.length; i++) {
        var j = jargonTerms[i];
        var hit = t === j.w || (t.indexOf(j.w) === 0 && /^(s|es|d|ed|ing)$/.test(t.slice(j.w.length))) ||
          (j.s !== j.w && t.indexOf(j.s) === 0 && /^(ed|ing)$/.test(t.slice(j.s.length)));
        if (hit) { if (out.indexOf(j.w) < 0) out.push(j.w); break; }
      }
    });
    return out;
  }
  function speech(notes) {
    if (typeof notes !== 'string') return '';
    return notes.split('\n').filter(function (l) { return l.trim().charAt(0) !== '\u25b8'; }).join('\n').trim();
  }

  var api = {
    COPY: COPY, COPY_PARTS: COPY_PARTS, say: say, fmt: fmt, BUDGET: BUDGET, DEVICES: DEVICES,
    STOPWORDS: STOPWORDS, IMPERATIVES: IMPERATIVES, JARGON: JARGON, PLACEHOLDER: PLACEHOLDER,
    words: words, tokens: tokens, match: match, echo: echo, placeholderIn: placeholderIn, placeholders: placeholders,
    firstWord: firstWord, startsImperative: startsImperative, jargonIn: jargonIn, speech: speech
  };
  for (var k in api) S[k] = api[k];
  return api;
}, { export: false });
