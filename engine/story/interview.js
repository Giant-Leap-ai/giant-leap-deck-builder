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
 *        turn     a side of more than 5 words  q.turn.long
 *        ask      first word not an imperative q.ask.verb
 *        any text longer than its limit      q.max
 *   hints(story) → { [id]: string }    the hints of every answered question that has one
 *   logline(story) → string            "For {audience}, this talk shows {shortIdea||bigIdea}, so they {ask}." Each
 *                                      clause is dropped when its token is empty. Trailing . ! ? … are trimmed from
 *                                      the pieces so the sentence ends with a single full stop. '' when all are empty.
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
    Q(5, 'shortIdea', ['shortIdea'], { type: 'text', max: 80, maxWords: 6 }, ['{shortIdea}']),
    Q(6, 'turn', ['oldWay', 'newWay'], { type: 'pair', fields: [{ field: 'oldWay', label: 'Now they believe', maxWords: 5 }, { field: 'newWay', label: 'After, they believe', maxWords: 5 }] }, ['pivot', 'the-box']),
    Q(7, 'ask', ['ask'], { type: 'text', max: 80 }, ['finale', 'story.cta']),
    Q(8, 'proof', ['proof'], { type: 'proof', rows: 3, kinds: KINDS.slice() }, ['proof beats']),
    Q(9, 'brand', ['brand', 'tagline'], { type: 'pair', fields: [{ field: 'brand', label: 'Name', max: 30 }, { field: 'tagline', label: 'Tagline', max: 40 }] }, ['brand-reveal', 'finale']),
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
        for (i = 0; i < q.fields.length; i++) {
          side = value && typeof value === 'object' ? value[q.fields[i]] : '';
          if (copy.words(str(side)) > 5) return copy.say('q.turn.long', { n: copy.words(str(side)) });
        }
        return null;
      case 'ask':
        text = str(value).trim();
        if (text && !copy.startsImperative(text)) return copy.say('q.ask.verb');
        return tooLong(text, q.input.max);
      case 'audience':
        return tooLong(value, q.input.max);
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
  function logline(story) {
    var s = story || blank();
    var audience = piece(s.audience), idea = piece(s.shortIdea) || piece(s.bigIdea), ask = piece(s.ask);
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
