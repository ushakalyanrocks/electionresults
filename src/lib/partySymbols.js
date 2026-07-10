// Static party symbol/favicon lookup — hand-maintained, no database involved.
// Keyed by party code (upper-case). Edit this file directly to add, change,
// or remove an icon; it takes effect on next deploy/reload, nothing else needed.
//
// symbol: readable name of the actual ballot symbol (not shown in UI yet,
//         kept here for reference / future use, e.g. tooltips)
// favicon: website favicon via Google's s2 service — used as the icon
//          until/unless you swap in a real symbol image URL

// Real Election Commission of India symbol artwork, sourced from Wikimedia
// Commons (CC-BY-SA govt election symbol scans). Using the stable
// Special:FilePath redirect so we don't depend on guessing upload hash paths.
const ADMK_ENTRY = { name: 'Two Leaves', symbolUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Indian_Election_Symbol_Two_Leaves.svg', favicon: 'https://www.aiadmk.com/favicon.ico' };
const TVK_ENTRY  = { name: 'Whistle',    symbolUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Indian_Election_Symbol_Whistle.svg', favicon: 'https://www.google.com/s2/favicons?domain=vijay.com&sz=128' };

const PARTY_SYMBOLS = {
  DMK:    { name: 'Rising Sun',              symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=dmk.in&sz=128' },
  ADMK:   ADMK_ENTRY,
  AIADMK: ADMK_ENTRY, // alias — DB/API rows sometimes use the full official code instead of ADMK
  TVK:    TVK_ENTRY,
  BJP:    { name: 'Lotus',                   symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=bjp.org&sz=128' },
  INC:    { name: 'Hand',                    symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=inc.in&sz=128' },
  PMK:    { name: 'Mango',                   symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=pmkofficial.com&sz=128' },
  VCK:    { name: 'Pot',                     symbolUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cg fill='%23d35400'%3E%3Cpath d='M16 24h32v6h6v8c0 8-6 14-14 14H24c-8 0-14-6-14-14v-8h6z'/%3E%3Cpath d='M20 24V18h24v6H20z' fill='%23f9e79f'/%3E%3C/g%3E%3C/svg%3E", favicon: 'https://www.google.com/s2/favicons?domain=vck.party/&sz=128' },
  IUML:   { name: 'Star',                    symbolUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23155b8f'/%3E%3Cpolygon points='32,14 38,28 54,30 42,39 46,54 32,46 18,54 22,39 10,30 26,28' fill='%23f1c40f'/%3E%3C/svg%3E", favicon: null },
  DMDK:   { name: 'Nagara',                  symbolUrl: null, favicon: null },
  NTK:    { name: 'Farmer',                  symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=naamtamilar.org&sz=128' },
  CPI:    { name: 'Ears of Corn and Sickle', symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=cpiindia.org&sz=128' },
  CPM:    { name: 'Hammer Sickle and Star',  symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=cpim.org&sz=128' },
  AMMK:   { name: 'Gift Box',                symbolUrl: null, favicon: null },
  MDMK:   { name: 'Top',                     symbolUrl: null, favicon: null },
  MNM:    { name: 'Torchlight',              symbolUrl: null, favicon: 'https://www.google.com/s2/favicons?domain=maiam.com&sz=128' }
};

// To add a real ballot-symbol image for any party (recommended for DMDK,
// AMMK, MDMK which have no favicon fallback at all):
//   1. Get a small PNG/SVG of the symbol (transparent bg, ~64-128px).
//   2. Base64-encode it:
//        macOS/Linux: base64 -w0 admk-symbol.png
//        Windows PS:  [Convert]::ToBase64String([IO.File]::ReadAllBytes("admk-symbol.png"))
//   3. Paste the result into symbolUrl as a data URI:
//        symbolUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
//   This renders instantly, needs no network call, and can never 404/CORS-fail.
//   Tier 0 in PartySymbol.jsx checks symbolUrl first, so it takes priority
//   over the favicon automatically once set.

export default PARTY_SYMBOLS;
