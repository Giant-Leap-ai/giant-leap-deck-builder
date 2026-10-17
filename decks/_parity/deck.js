/* decks/_parity/deck.js — One Giant Leap rebuilt from templates, under the cosmos look (spec §8.2 M8, §9 WP4).
 *
 * Ten template scenes whose props are the templates' `example` props, which are One Giant Leap's own values. Rendered
 * with `?quality=1`, every frame must match the One Giant Leap baseline within the tolerance of tools/regression/diff.py
 * (the stretch goal is byte-identical frames). The notes, the step notes and the story metadata (beat, energy) are the
 * original deck's, so the replica is also the Studio's editable sample ("One Giant Leap: template replica").
 *
 * The deck id is 'parity' (deck ids are /^[a-z0-9][a-z0-9-]{0,47}$/, so the folder's underscore cannot be part of it).
 * The theme is the shared 'cosmos' look (themes/cosmos/theme.js), not a snapshot: if the generic look drifts from One
 * Giant Leap, this deck is where it shows. */
PD.deck('parity', function (PD, h) {
  return {
    format: 2,
    id: 'parity',
    meta: {
      title: 'One Giant Leap (template replica)',
      subtitle: 'Making work more human',
      theme: 'cosmos',
      generator: 'hand',
      story: {                       // spec §6.1, values from §6.10
        framework: 'giant-leap', goal: 'inspire', tone: 'cinematic',
        audience: '', targetMin: null,
        bigIdea: 'The next leap is augmentation, not automation: technology that makes work more human.',
        shortIdea: 'Augmentation, not automation',
        oldWay: 'automation', newWay: 'augmentation', ask: '',
        proof: [],
        brand: 'One Giant Leap', tagline: 'Making work more human'
      }
    },
    scenes: [
      /* 1 ─ Cold open: a single spark in the dark. */
      {
        id: 'spark', template: 'cold-open', beat: 'spark', energy: 2,
        props: { line: 'Every giant leap begins with a single spark.', lineAt: 1.8, sparkCount: 700, sparkColor: 'gold', shot: 'SPARK' },
        notes: 'Lights down. Let the spark breathe for a few seconds before you speak.'
      },

      /* 2 ─ The spark bursts into the brand; the cosmos blooms in. */
      {
        id: 'title', template: 'brand-reveal', beat: 'name', energy: 4,
        props: { title: 'One Giant Leap', subtitle: 'Making work more human', subtitleAt: 2.6, flash: 0.32, entry: 'spark', shot: 'BLOOM' },
        notes: 'Introduce yourself and One Giant Leap. "Today I want to take you on a short trip."'
      },

      /* 3 ─ Hyperspace. */
      {
        id: 'warp', template: 'hyperspace', beat: 'zoom-out', energy: 5,
        props: { lines: ['13.8 billion years', 'Hundreds of billions of galaxies'], warpColor: 'cyan', nebula: 'cosmic', flashAt: 3.0 },
        notes: 'Hold on. "Let\'s zoom out — way out." Click once the stars are streaking.',
        stepNotes: ['Let the scale land.']
      },

      /* 4 ─ Drop out of warp in front of a galaxy. The pale blue dot. */
      {
        id: 'galaxy', template: 'galaxy-reveal', beat: 'you-are-here', energy: 3,
        props: { kicker: 'Somewhere in all of this', line: 'there is one small, blue world.', marker: 'You are here' },
        notes: 'Out of warp. Let the galaxy turn. "Somewhere in all of this…"',
        stepNotes: ['The pale blue dot. Pause.']
      },

      /* 5 ─ Fly home: the dot becomes the Earth. */
      {
        id: 'home', template: 'planet', beat: 'you-are-here', energy: 2,
        props: { kicker: 'Third planet from the sun', line: 'Home to the most restless minds we know of.', region: 'americas' },
        notes: 'Bring it back to Earth — literally. "And on this planet lives a species that never stays put."'
      },

      /* 6 ─ Sunrise over the edge of the world. */
      {
        id: 'sunrise', template: 'sunrise', beat: 'human-truth', energy: 4,
        props: { kicker: 'For 300,000 years', line: 'we have thought outside the box.', nebula: 'dawn' },
        notes: 'The sunrise is the emotional beat. Say nothing until the sun clears the horizon.'
      },

      /* 7 ─ A short history of leaps. Each click lights a milestone. */
      {
        id: 'leaps', template: 'timeline', beat: 'pattern', energy: 3,
        props: {
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
        notes: 'Each click is a leap. Notice the curve keeps getting steeper.',
        stepNotes: [
          'Fire: we stopped waiting for the sun.',
          'The wheel.',
          'Ideas stopped being scarce.',
          'Twelve seconds that changed everything.',
          'One giant leap.',
          'Knowledge for everyone.',
          'And now: the next one is ours to make.'
        ]
      },

      /* 8 ─ The box. Then the ideas escape it. */
      {
        id: 'box', template: 'the-box', beat: 'the-box', energy: 3,
        props: {
          line: "Every breakthrough began as an idea that didn't fit.", escape: 'Outside', subtitle: 'is where the future lives',
          cubeColor: 'cyan', cubeColor2: 'violet', shot: 'BOX'
        },
        notes: 'Every leap we just saw started as an idea that did not fit inside the existing box.',
        stepNotes: ['Click: the ideas escape the box.']
      },

      /* 9 ─ The next leap. */
      {
        id: 'next', template: 'pivot', beat: 'the-leap', energy: 5,
        props: { kicker: 'The next leap', from: 'Not automation.', to: 'Augmentation.', subtitle: 'Technology that makes work more human', shot: 'PIVOT' },
        notes: 'So what is the next leap?',
        stepNotes: ['The pivot: augmentation, not automation.']
      },

      /* 10 ─ Finale: back to the sunrise. */
      {
        id: 'thanks', template: 'finale', beat: 'callback', energy: 4,
        props: { title: 'One Giant Leap', subtitle: 'Thank you', shot: 'FINALE' },
        notes: 'Thank the room. Leave this up for Q&A.'
      }
    ]
  };
});
