/* engine/story/interview.js — the guided interview: ten skippable questions, hints, and the logline (spec §6.4, WP5).
 *
 * Pure data and pure functions; nothing here touches the DOM. The Studio's Brief screen (WP6) renders one question per
 * panel from `questions`, shows `hint()` inline in amber and never blocks on it (validation produces hints only).
 *
 *   questions: Question[]    in the order of §6.4
 *   Question = { n: 1..10, id, fields: string[]          the StoryMeta field(s) the answer fills
 *                title, help                              the question and its one-line help (COPY_PARTS 'q.<id>')
 *                input: { type: 'choice', options: [{ value, label }] }
 *                     | { type: 'text', max: number, rows?: number, maxWords?: number }
 *                     | { type: 'number', min, max, chips: number[], unit: 'min' }
 *                     | { type: 'pair', fields: [{ field, label, max?, maxWords? }] }
 *                     | { type: 'proof', rows: 3, kinds: ['number','quote','story','demo'] }
 *                max / maxWords are what the answer's slot on screen holds (§5), not §6.4's looser numbers, so an answer the
 *                brief takes without a hint never comes back from the Director as too wide:
 *                  turn       oldWay ≤ 2 words / 13 characters and newWay ≤ 3 / 17: pivot shows "Not {oldWay}." and
 *                             "{newWay}." in hero type, at most 18 characters and 3 words (§6.4 said 5 words a side, which
 *                             no hero line holds); the-box's slots are wider
 *                  shortIdea  ≤ 44 characters, 6 words: the pivot subtitle (text≤44)
 *                  ask        ≤ 40 characters, 7 words: the finale subtitle (text≤40, subtitle style); §6.4 said 80
 *                  brand      ≤ 18 characters: the brand-reveal and finale titles (text≤18, hero); §6.4 said 30
 *                  tagline    ≤ 40 characters: the brand-reveal subtitle
 *                flows: string[]                           where the answer goes (framework, logline, notes, echo rules …)
 *              }
 *   question(id) → Question | null
 *   blank() → StoryMeta                the empty story (§6.1): framework 'blank', everything unanswered
 *   get(story, id) → value             the answer in the shape the input wants: a string, a number | null, a
 *                                      { field: value } map for a pair, an array of proof rows
 *   patch(id, value) → { field: value }   the StoryMeta fields one answer sets. Plain strings are kept as typed (the
 *                                      Studio trims them when the field loses focus, see clean()); a number is rounded
 *                                      and clamped to 1–90, anything that is not a number gives null; a proof array is
 *                                      sanitized (empty rows dropped, at most 3 kept, unknown kinds become 'story')
 *   set(story, id, value) → StoryMeta  a NEW story with the answer applied (the input is never mutated)
 *   clean(story) → StoryMeta           a NEW story with every string trimmed and proof rows sanitized
 *   answered(story, id) → boolean      has the question got an answer (a goal, a number, a non-blank string, a proof row)
 *   progress(story) → { answered, total, done }   done = step ① done = bigIdea and targetMin are answered
 *   done(story) → boolean
 *   hint(id, value) → string | null    the amber hint for an answer, or null:
 *        bigIdea  more than 15 words         q.bigIdea.long
 *        shortIdea more than 6 words         q.shortIdea.long
 *        turn     a side over its words or characters  q.turn.long
 *        ask      first word not an imperative q.ask.verb; more than 7 words q.ask.long
 *        proof    a number row with words but no number   q.proof.value; a row longer than its scene holds: a story or
 *                 demo over 14 words (the statement budget, §6.8) q.proof.long, over 90 characters, a number's words over
 *                 60, a quote over 160 or its who over 30 (the §5 prop limits) q.max
 *        any text longer than its limit      q.max
 *   hints(story) → { [id]: string }    the hints of every answered question that has one
 *   logline(story) → string            "For {audience}, this talk shows {shortIdea||bigIdea}, so they {ask}." Each
 *                                      clause is dropped when its token is empty. Trailing . ! ? … are trimmed from
 *                                      the pieces so the sentence ends with a single full stop. '' when all are empty.
 *                                      Capitals (open item a): a name cannot be told from a word without a dictionary
 *                                      ("Shopify merchants", "Europe first", "Google Cloud customers"), so the audience
 *                                      and the idea keep the case they were typed in. The one exception is a leading
 *                                      article, pronoun or determiner (one of STOPWORDS) whose next word is lower-case:
 *                                      "The ops team" → "For the ops team" ("The Hague", "A Team" stay). The ask is the
 *                                      verb of "so they …": its first word loses a plain Title-case capital ("Pilot",
 *                                      "Approve", "Let's"); one of IMPERATIVES always does, any other word unless it is
 *                                      a word of the brand or the answers write it with a capital mid-sentence (a name).
 *                                      Kept as typed everywhere: all-caps or mixed case ("AI", "CFOs", "iPhone") and "I".
 *   GOALS, TONES                       the choice values
 *
 * Registration defines functions and tables only: no DOM, no texture, no random number. */
PD.module('story/interview', ['story/copy'], function (PD, copy) {
  var S = PD.story;
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var GOALS = ['inspire', 'persuade', 'decide', 'launch', 'update', 'teach'];
  var TONES = ['cinematic', 'warm', 'crisp', 'playful'];
  var KINDS = ['number', 'quote', 'story', 'demo'];
  function choice(vals) { return { type: 'choice', options: vals.map(function (v) { return { value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }; }) }; }

  function Q(n, id, fields, input, flows) {
    var parts = copy.COPY_PARTS['q.' + id] || [id, ''];
    return { n: n, id: id, fields: fields, title: parts[0], help: parts[1] || '', input: input, flows: flows };
  }
  var questions = [
    Q(1, 'goal', ['goal'], choice(GOALS), ['framework']),
    Q(2, 'audience', ['audience'], { type: 'text', max: 200, rows: 2 }, ['logline', 'notes']),
    Q(3, 'targetMin', ['targetMin'], { type: 'number', min: 1, max: 90, chips: [3, 5, 10, 20], unit: 'min' }, ['scene count', 'pace.runtime']),
    Q(4, 'bigIdea', ['bigIdea'], { type: 'text', max: 200, rows: 2, maxWords: 15 }, ['echo rules', 'logline']),
    Q(5, 'shortIdea', ['shortIdea'], { type: 'text', max: 44, maxWords: 6 }, ['{shortIdea}']),
    Q(6, 'turn', ['oldWay', 'newWay'], { type: 'pair', fields: [{ field: 'oldWay', label: 'The old answer', max: 13, maxWords: 2 }, { field: 'newWay', label: 'Your answer', max: 17, maxWords: 3 }] }, ['pivot', 'the-box']),
    Q(7, 'ask', ['ask'], { type: 'text', max: 40, maxWords: 7 }, ['finale', 'story.cta']),
    Q(8, 'proof', ['proof'], { type: 'proof', rows: 3, kinds: KINDS.slice() }, ['proof beats']),
    Q(9, 'brand', ['brand', 'tagline'], { type: 'pair', fields: [{ field: 'brand', label: 'Name', max: 18 }, { field: 'tagline', label: 'Tagline', max: 40 }] }, ['brand-reveal', 'finale']),
    Q(10, 'tone', ['tone'], choice(TONES), ['recommendation', 'theme'])
  ];
  var byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });
  function question(id) { return has(byId, id) ? byId[id] : null; }

  function blank() {
    return { framework: 'blank', goal: null, audience: '', targetMin: null, bigIdea: '', shortIdea: '', oldWay: '', newWay: '', ask: '',
             proof: [], brand: '', tagline: '', tone: null };
  }
  function str(v) { return typeof v === 'string' ? v : (typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' ? String(v) : ''; }   // objects are not answers
  function minutes(v) {
    if (v === '' || v == null) return null;
    var n = +v;
    if (!isFinite(n)) return null;
    return Math.max(1, Math.min(90, Math.round(n)));
  }
  function proofRows(v, trim) {
    var out = [];
    (Array.isArray(v) ? v : []).forEach(function (r) {
      if (!r || typeof r !== 'object' || out.length >= 3) return;
      var text = trim ? str(r.text).trim() : str(r.text);
      var kind = KINDS.indexOf(r.kind) >= 0 ? r.kind : 'story';
      var row = { kind: kind, text: text };
      var val = r.value === '' || r.value == null ? NaN : +r.value;
      if (kind === 'number' && isFinite(val)) row.value = val;
      var who = trim ? str(r.who).trim() : str(r.who);
      if (kind === 'quote' && who) row.who = who;
      if (text.trim() || row.value !== undefined) out.push(row);
    });
    return out;
  }

  function patch(id, value) {
    var q = question(id), out = {};
    if (!q) return out;
    switch (id) {
      case 'goal': out.goal = GOALS.indexOf(value) >= 0 ? value : null; break;
      case 'tone': out.tone = TONES.indexOf(value) >= 0 ? value : null; break;
      case 'targetMin': out.targetMin = minutes(value); break;
      case 'proof': out.proof = proofRows(value, false); break;
      case 'turn': case 'brand':
        q.fields.forEach(function (f) { out[f] = str(value && typeof value === 'object' ? value[f] : ''); });
        break;
      default: out[q.fields[0]] = str(value);
    }
    return out;
  }
  function set(story, id, value) {
    var out = {}, k, s = story || blank();
    for (k in s) if (has(s, k)) out[k] = s[k];
    out.proof = Array.isArray(s.proof) ? s.proof.map(function (r) { var c = {}; for (var j in r) c[j] = r[j]; return c; }) : [];
    var p = patch(id, value);
    for (k in p) out[k] = p[k];
    return out;
  }
  function clean(story) {
    var out = {}, s = story || blank();
    for (var k in s) if (has(s, k)) out[k] = typeof s[k] === 'string' ? s[k].trim() : s[k];
    out.proof = proofRows(s.proof, true);
    return out;
  }

  function get(story, id) {
    var q = question(id), s = story || blank();
    if (!q) return undefined;
    if (id === 'proof') return Array.isArray(s.proof) ? s.proof.slice() : [];
    if (q.fields.length > 1) { var o = {}; q.fields.forEach(function (f) { o[f] = str(s[f]); }); return o; }
    var v = s[q.fields[0]];
    return id === 'targetMin' || id === 'goal' || id === 'tone' ? (v == null ? null : v) : str(v);
  }
  function answered(story, id) {
    var q = question(id), s = story || blank();
    if (!q) return false;
    if (id === 'proof') return proofRows(s.proof, true).length > 0;
    if (id === 'targetMin') return s.targetMin != null && isFinite(+s.targetMin) && +s.targetMin > 0;
    return q.fields.some(function (f) { return s[f] != null && String(s[f]).trim() !== ''; });
  }
  function done(story) { return answered(story, 'bigIdea') && answered(story, 'targetMin'); }
  function progress(story) {
    var n = 0;
    questions.forEach(function (q) { if (answered(story, q.id)) n++; });
    return { answered: n, total: questions.length, done: done(story) };
  }

  function tooLong(text, max) {
    var n = str(text).trim().length;
    return n > max ? copy.say('q.max', { n: n, max: max }) : null;
  }
  function hint(id, value) {
    var q = question(id);
    if (!q) return null;
    var text, n, side, i, h;
    switch (id) {
      case 'bigIdea':
        n = copy.words(str(value));
        if (n > 15) return copy.say('q.bigIdea.long', { n: n });
        return tooLong(value, q.input.max);
      case 'shortIdea':
        n = copy.words(str(value));
        return n > 6 ? copy.say('q.shortIdea.long', { n: n }) : tooLong(value, q.input.max);
      case 'turn':
        for (i = 0; i < q.input.fields.length; i++) {
          var f = q.input.fields[i];
          side = str(value && typeof value === 'object' ? value[f.field] : '').trim().replace(/[.!?\u2026]+$/, '');
          if (copy.words(side) > f.maxWords || side.length > f.max) return copy.say('q.turn.long', { n: copy.words(side) });
        }
        return null;
      case 'ask':
        text = str(value).trim();
        if (text && !copy.startsImperative(text)) return copy.say('q.ask.verb');
        n = copy.words(text);
        if (n > q.input.maxWords) return copy.say('q.ask.long', { n: n });
        return tooLong(text, q.input.max);
      case 'audience':
        return tooLong(value, q.input.max);
      case 'proof':
        if (!Array.isArray(value)) return null;
        for (i = 0; i < value.length; i++) {
          var r = value[i];
          if (!r || typeof r !== 'object') continue;
          text = str(r.text).trim();
          if (r.kind === 'number' && text && !(r.value !== '' && r.value != null && isFinite(+r.value))) return copy.say('q.proof.value');
          if (r.kind === 'number') h = tooLong(text, 60);
          else if (r.kind === 'quote') h = tooLong(text, 160) || tooLong(r.who, 30);
          else if (copy.words(text) > 14) h = copy.say('q.proof.long', { row: i + 1, n: copy.words(text), max: 14 });
          else h = tooLong(text, 90);
          if (h) return h;
        }
        return null;
      case 'brand':
        for (i = 0; i < q.input.fields.length; i++) {
          side = value && typeof value === 'object' ? value[q.input.fields[i].field] : '';
          h = tooLong(side, q.input.fields[i].max);
          if (h) return h;
        }
        return null;
      default: return null;
    }
  }
  function hints(story) {
    var out = {};
    questions.forEach(function (q) {
      if (!answered(story, q.id)) return;
      var h = hint(q.id, get(story, q.id));
      if (h) out[q.id] = h;
    });
    return out;
  }

  function piece(v) { return str(v).trim().replace(/[.!?\u2026\s]+$/, ''); }
  var WORD_RE = /[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu;
  var LEAD = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*)/u;
  var TITLE = /^\p{Lu}\p{Ll}*(?:['\u2019-]\p{Ll}+)*$/u;           // "Pilot", "Let's", "Human-first"; not "AI", "iPhone", "McKinsey"
  // the words the story writes as names: every capitalised word of the brand (but "The", "Of" …), and any capitalised word
  // that stands in the middle of a sentence of an answer
  function names(s) {
    var out = {};
    function all(t) {
      var m; WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(t))) if (/^\p{Lu}/u.test(m[0]) && copy.STOPWORDS.indexOf(m[0].toLowerCase()) < 0) out[m[0]] = 1;
    }
    function mid(t) {
      var m; WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(t))) {
        var before = t.slice(0, m.index).replace(/[\s"'\u201c\u2018(\[]+$/, '');
        if (before && !/[.!?:\u2026]$/.test(before) && /^\p{Lu}/u.test(m[0])) out[m[0]] = 1;
      }
    }
    all(str(s.brand));
    var texts = [s.audience, s.bigIdea, s.shortIdea, s.oldWay, s.newWay, s.ask, s.tagline].map(str);
    (Array.isArray(s.proof) ? s.proof : []).forEach(function (p) { if (p && typeof p === 'object') texts.push(str(p.text)); });
    texts.forEach(mid);
    return out;
  }
  // verb: the ask (the verb slot of "so they \u2026"). Otherwise the audience or the idea, where only a leading stopword is lowered.
  function lowerLead(text, known, verb) {
    var m = text.match(LEAD);
    if (!m) return text;
    var w = m[2], rest = text.slice(m[0].length);
    if (!TITLE.test(w) || w === 'I' || /^I['\u2019]/.test(w)) return text;
    if (verb) {
      if (!copy.startsImperative(w) && has(known, w)) return text;
    } else {
      if (copy.STOPWORDS.indexOf(w.toLowerCase()) < 0 || has(known, w)) return text;
      var next = rest.match(/^[^\p{L}\p{N}]*([\p{L}\p{N}])/u);
      if (next && /\p{Lu}/u.test(next[1])) return text;               // part of a capitalised name: "The Hague", "A Team"
    }
    return m[1] + w.charAt(0).toLowerCase() + w.slice(1) + rest;
  }
  function logline(story) {
    var s = story || blank();
    var audience = piece(s.audience), idea = piece(s.shortIdea) || piece(s.bigIdea), ask = piece(s.ask);
    if (audience || idea || ask) {
      var known = names(s);
      audience = lowerLead(audience, known, false); idea = lowerLead(idea, known, false); ask = lowerLead(ask, known, true);
    }
    var clauses = [];
    if (audience) clauses.push('For ' + audience);
    if (idea) clauses.push('this talk shows ' + idea);
    if (ask) clauses.push('so they ' + ask);
    if (!clauses.length) return '';
    var line = clauses.join(', ');
    return line.charAt(0).toUpperCase() + line.slice(1) + '.';
  }

  var api = {
    GOALS: GOALS, TONES: TONES, questions: questions, question: question, blank: blank, get: get, patch: patch, set: set,
    clean: clean, answered: answered, progress: progress, done: done, hint: hint, hints: hints, logline: logline
  };
  S.interview = api;
  return api;
}, { export: false });
