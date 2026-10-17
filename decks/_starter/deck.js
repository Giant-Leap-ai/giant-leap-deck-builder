/* decks/_starter/deck.js — a one-scene deck to copy (spec §4.2). Run it by opening index.html.
 *
 * PD.deck(id, DeckSource): the id is lower-case letters, digits and dashes, and it is the id used in assets.js.
 * Design space is 1920 x 1080; a text layer's y is the vertical CENTRE of its block.
 *   meta.theme   the look; the page must load that theme's script (index.html: slate here).
 *   scenes       one entry per scene, played in order. Space or the right arrow reveals the next step or scene.
 *
 * A TEMPLATE scene says what it is and fills in its props; the engine lays it out:
 *   { id: 'hello', template: 'statement', props: { kicker: '…', line: '…' }, notes: 'what you say here' }
 * The template catalogue (cold-open, brand-reveal, statement, big-number, quote, three-points, pivot, finale, …) is in
 * docs/templates.md. `overrides` patches the expansion, `stepNotes` adds notes for each extra click.
 *
 * A RAW scene is written out layer by layer, and can use anything the theme's worlds offer:
 *   { id: 'by-hand', text: [{ str: 'Written by hand', style: 'hero', y: 540, reveal: 'letters' }], notes: '…' }
 * Add `steps: [{ text: [...] }]` for extra clicks inside one scene.
 *
 * To write code instead of plain data (shared helpers, loops), make the second argument a factory:
 *   PD.deck('starter', function (PD, h) { return { format: 2, id: 'starter', meta: {…}, scenes: […] }; });
 * where h offers W, U, col, shot, measure, fit … (spec §4.2). The result then exports as a hand-written deck.
 *
 * Export one self-contained file:  node tools/export.js decks/_starter   →   decks/_starter/export/starter.html */
PD.deck('starter', {
  format: 2,
  id: 'starter',
  meta: {
    title: 'Starter deck',
    subtitle: 'One scene to build from',
    theme: 'slate',
    story: {
      framework: 'blank', goal: null, audience: '', targetMin: null,
      bigIdea: '', shortIdea: '', oldWay: '', newWay: '', ask: '',
      proof: [], brand: '', tagline: '', tone: null
    },
    generator: 'hand'
  },
  scenes: [
    {
      id: 'hello',
      template: 'statement',
      props: { kicker: 'Your first scene', line: 'Say one thing, and say it big.' },
      point: 'Welcome the room with a single idea',
      notes: 'Open on one sentence. Wait for the words to land before you speak.'
    }
  ]
});
