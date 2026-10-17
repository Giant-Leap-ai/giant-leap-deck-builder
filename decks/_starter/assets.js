/* decks/_starter/assets.js — this deck's embedded assets (spec §4.8): none yet.
 * An asset is a data: URL and nothing else, so the deck stays one self-contained file and a canvas is never tainted:
 *   PD.assets('starter', {
 *     logo: { type: 'image', src: 'data:image/png;base64,…', w: 1200, h: 400, name: 'logo.png', bytes: 18234 },
 *     brand: { type: 'font', src: 'data:font/woff2;base64,…', family: 'Brand Sans', name: 'brand.woff2', bytes: 41200 }
 *   });
 * The id (here 'starter') must be the id of the deck in deck.js. The Studio writes this file for you. */
PD.assets('starter', {});
