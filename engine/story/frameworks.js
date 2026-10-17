/* engine/story/frameworks.js — narrative frameworks as data, and the recommendation table (spec §6.2, §6.3, WP5).
 *
 * Registers five frameworks with PD.framework(id, Framework): giant-leap, sparkline, psf, scqa, blank.
 *   Framework = { id, name, bestFor, turns: number | null, beats: Beat[] }
 *   Beat = { id, label, roles: string[], share, energy: 1..5, required, min, max, ask, example, templates: string[] }
 * `templates` lists template ids in preference order; every beat names at least one adaptive template (one that needs
 * no particular world), so every beat can be built under every look. The registered objects are frozen.
 * blank has no beats: every rule that depends on beats is skipped, and the storyboard starts empty.
 *
 * Added to PD.story:
 *   frameworks() → Framework[]            the registered frameworks, in registration order
 *   framework(id) → Framework | null      ('blank' gives the blank framework; an unknown id gives null)
 *   recommend(story) → { id, runnerUp, row }   first match of the §6.3 table wins; story = { goal, tone } (both may be null)
 *   RECOMMEND                             the table itself: [{ goal?: string[], tone?: string[], recommend, runnerUp }]
 *   pickText(story, id?) → string         the fw.pick sentence for a framework (the recommended one by default); it
 *                                         drops the "in {targetMin} minutes" clause when the slot is unknown
 *   defaultTheme(tone) → 'cosmos' | 'slate'   cinematic → cosmos, anything else → slate
 *   energyCurve(fw) → [{ beat, mid, energy }]  each beat's energy at the midpoint of its share (the ideal arc)
 *   idealEnergy(fw, pos) → number         the ideal curve at runtime position pos (0..1): linear between midpoints, flat
 *                                         before the first and after the last
 *   beatIndex(fw, beatId) → number        position of the beat in the framework (-1 when absent)
 *   ROLES                                 the role vocabulary
 *
 * Registration allocates nothing, touches no DOM and draws no random number. */
PD.module('story/frameworks', ['story/copy'], function (PD, copy) {
  var S = PD.story;
  var ROLES = ['hook', 'setup', 'identity', 'scale', 'relevance', 'emotion', 'proof', 'tension', 'turn', 'idea', 'climax', 'resolution', 'cta', 'callback'];

  function B(id, label, roles, share, energy, req, min, max, ask, example, templates) {
    return { id: id, label: label, roles: roles, share: share, energy: energy, required: req, min: min, max: max, ask: ask, example: example, templates: templates };
  }
  function deepFreeze(v) {
    if (v && typeof v === 'object') { Object.keys(v).forEach(function (k) { deepFreeze(v[k]); }); Object.freeze(v); }
    return v;
  }

  var FRAMEWORKS = [
    { id: 'giant-leap', name: 'One Giant Leap', turns: 1,
      bestFor: 'vision keynotes, brand openers and "why change now" talks',
      beats: [
        B('spark', 'Spark', ['hook'], 0.05, 2, true, 1, 1, 'What tiny beginning does your story grow from?',
          'Every giant leap begins with a single spark.', ['cold-open', 'statement', 'big-number']),
        B('name', 'Name', ['identity'], 0.07, 4, true, 1, 1, 'Who are you, in one line?',
          'One Giant Leap / Making work more human', ['brand-reveal', 'logo']),
        B('zoom-out', 'Zoom out', ['scale'], 0.10, 5, false, 0, 2, "What's the biggest frame your topic lives in?",
          '13.8 billion years', ['hyperspace', 'big-number', 'galaxy-reveal']),
        B('you-are-here', 'You are here', ['relevance'], 0.13, 3, true, 1, 2, 'Where is your audience inside that frame?',
          'there is one small, blue world.', ['galaxy-reveal', 'planet', 'statement']),
        B('human-truth', 'Human truth', ['emotion'], 0.12, 4, true, 1, 2, 'What has always been true about people?',
          'For 300,000 years we have thought outside the box.', ['sunrise', 'statement', 'quote', 'image']),
        B('pattern', 'Pattern', ['proof'], 0.18, 3, true, 1, 3, 'Which 3–7 moments prove that truth?',
          '1440 · The printing press', ['timeline', 'three-points', 'big-number']),
        B('the-box', 'The box', ['tension'], 0.12, 3, true, 1, 2, 'What box is your audience in today?',
          "Every breakthrough began as an idea that didn't fit.", ['the-box', 'statement']),
        B('the-leap', 'The leap', ['turn'], 0.13, 5, true, 1, 1, "What's the old answer, and what's yours?",
          'Not automation. → Augmentation.', ['pivot']),
        B('callback', 'Callback', ['callback', 'cta'], 0.10, 4, true, 1, 1, 'Which opening image returns, changed, and what do they do now?',
          "One Giant Leap / Let's make the next one together", ['finale', 'statement'])
      ] },

    { id: 'sparkline', name: 'What is / what could be', turns: 2,
      bestFor: 'persuading people to change',
      beats: [
        B('what-is', 'What is', ['hook', 'setup'], 0.08, 2, true, 1, 1, 'What does their world honestly look like today?',
          'Your best people spend 40% of the week copy-pasting.', ['cold-open', 'big-number', 'statement']),
        B('could-be', 'What could be', ['turn'], 0.10, 4, true, 1, 1, 'What could it be instead?',
          'What if that 40% went back to customers?', ['sunrise', 'statement']),
        B('contrast', 'Contrast', ['proof'], 0.50, 3, true, 2, 4, "What's true now, and what's possible?",
          'Today: 3 days to quote. Tomorrow: 3 minutes.', ['big-number', 'quote', 'three-points', 'statement']),
        B('call-to-action', 'Call to action', ['turn', 'cta'], 0.15, 5, true, 1, 1, 'What must they do, or give up?',
          'Pick one workflow. Augment it in 30 days.', ['pivot', 'statement']),
        B('new-bliss', 'New bliss', ['resolution', 'callback'], 0.17, 4, true, 1, 1, 'What does their world look like after they act?',
          'Work that feels human again.', ['finale', 'sunrise', 'image'])
      ] },

    { id: 'psf', name: 'Problem, solution, future', turns: 1,
      bestFor: 'launches and proposals',
      beats: [
        B('hook', 'Hook', ['hook'], 0.08, 3, true, 1, 1, 'Which image or number makes the pain visible?',
          '11 tabs. 4 logins. 1 customer waiting.', ['cold-open', 'big-number', 'image']),
        B('problem', 'Problem', ['tension'], 0.20, 3, true, 1, 2, 'Who hurts, how much, and what does it cost?',
          'Every hand-off loses a day.', ['statement', 'big-number', 'the-box']),
        B('insight', 'Insight', ['turn'], 0.12, 4, true, 1, 1, 'What do you see that others miss?',
          "It's not the people. It's the seams.", ['pivot', 'statement']),
        B('solution', 'Solution', ['idea'], 0.20, 5, true, 1, 2, 'Name your answer in three words.',
          'Meet Relay.', ['brand-reveal', 'logo', 'image']),
        B('proof', 'Proof', ['proof'], 0.20, 3, true, 1, 3, "What's your evidence: a demo, a case, a number?",
          'Pilot: 62% fewer hand-offs.', ['big-number', 'quote', 'three-points']),
        B('future', 'Future', ['resolution'], 0.12, 4, false, 0, 1, 'What becomes possible next?',
          'Every team, with a co-pilot.', ['sunrise', 'statement', 'image']),
        B('ask', 'Ask', ['cta'], 0.08, 4, true, 1, 1, 'Exactly what should they do, and by when?',
          'Start a 30-day pilot.', ['finale', 'statement'])
      ] },

    { id: 'scqa', name: 'Situation, complication, question, answer', turns: 1,
      bestFor: 'executive briefings',
      beats: [
        B('situation', 'Situation', ['hook', 'setup'], 0.10, 2, true, 1, 1, 'What does everyone in the room already agree on?',
          'AI is now in every tool we buy.', ['statement', 'big-number']),
        B('complication', 'Complication', ['tension'], 0.15, 3, true, 1, 1, 'What changed, or what broke?',
          'Adoption has stalled at 12%.', ['big-number', 'the-box', 'statement']),
        B('question', 'Question', ['setup'], 0.05, 3, false, 0, 1, 'What question does that raise?',
          'So how do we get value, not just licences?', ['statement']),
        B('answer', 'Answer', ['turn', 'idea'], 0.15, 5, true, 1, 1, "What's your answer in one sentence?",
          'Augment roles, not tasks.', ['pivot', 'statement']),
        B('support', 'Support', ['proof'], 0.40, 3, true, 1, 3, 'What are your three supporting points?',
          '1 · Redesign the role first', ['three-points', 'big-number', 'quote']),
        B('ask', 'Ask', ['cta'], 0.15, 4, true, 1, 1, 'What decision do you need, from whom, by when?',
          'Approve a two-team pilot by 1 Nov.', ['finale', 'statement'])
      ] },

    { id: 'blank', name: 'Blank', turns: null, bestFor: 'building the arc yourself', beats: [] }
  ];
  FRAMEWORKS.forEach(function (f) { PD.framework(f.id, deepFreeze(f)); });

  function frameworks() { return PD.framework.list().map(function (id) { return PD.framework.get(id); }); }
  function framework(id) { return typeof id === 'string' && PD.framework.has(id) ? PD.framework.get(id) : null; }
  function beatIndex(fw, beatId) {
    if (!fw) return -1;
    for (var i = 0; i < fw.beats.length; i++) if (fw.beats[i].id === beatId) return i;
    return -1;
  }

  /* ---------------------------------------------------------- recommendation (§6.3), first match wins */
  var RECOMMEND = [
    { goal: ['decide'], recommend: 'scqa', runnerUp: 'psf' },
    { goal: ['launch'], recommend: 'psf', runnerUp: 'sparkline' },
    { goal: ['update'], recommend: 'scqa', runnerUp: 'psf' },
    { goal: ['teach'], recommend: 'psf', runnerUp: 'scqa' },
    { goal: ['inspire'], tone: ['cinematic'], recommend: 'giant-leap', runnerUp: 'sparkline' },
    { goal: ['inspire', 'persuade'], recommend: 'sparkline', runnerUp: 'giant-leap' },
    { recommend: 'sparkline', runnerUp: 'giant-leap' }
  ];
  function recommend(story) {
    var goal = story && story.goal || null, tone = story && story.tone || null;
    for (var i = 0; i < RECOMMEND.length; i++) {
      var r = RECOMMEND[i];
      if (r.goal && r.goal.indexOf(goal) < 0) continue;
      if (r.tone && r.tone.indexOf(tone) < 0) continue;
      return { id: r.recommend, runnerUp: r.runnerUp, row: r };
    }
    return { id: 'sparkline', runnerUp: 'giant-leap', row: RECOMMEND[RECOMMEND.length - 1] };
  }
  function pickText(story, id) {
    var fw = framework(id || recommend(story).id);
    if (!fw) return '';
    var t = story && story.targetMin;
    return copy.say(story && story.goal && t ? 'fw.pick' : 'fw.pick.open', {
      goal: story && story.goal, targetMin: t, framework: fw.name, bestFor: fw.bestFor
    });
  }
  function defaultTheme(tone) { return tone === 'cinematic' ? 'cosmos' : 'slate'; }

  /* ---------------------------------------------------------- the ideal energy arc */
  function energyCurve(fw) {
    var out = [], acc = 0;
    ((fw && fw.beats) || []).forEach(function (b) {
      out.push({ beat: b.id, mid: acc + b.share / 2, energy: b.energy });
      acc += b.share;
    });
    return out;
  }
  function idealEnergy(fw, pos) {
    var c = energyCurve(fw);
    if (!c.length) return 3;
    if (pos <= c[0].mid) return c[0].energy;
    for (var i = 1; i < c.length; i++) {
      if (pos <= c[i].mid) {
        var a = c[i - 1], b = c[i];
        return a.energy + (b.energy - a.energy) * (pos - a.mid) / (b.mid - a.mid);
      }
    }
    return c[c.length - 1].energy;
  }

  var api = {
    ROLES: ROLES, frameworks: frameworks, framework: framework, beatIndex: beatIndex,
    RECOMMEND: RECOMMEND, recommend: recommend, pickText: pickText, defaultTheme: defaultTheme,
    energyCurve: energyCurve, idealEnergy: idealEnergy
  };
  for (var k in api) S[k] = api[k];
  return api;
}, { export: false });
