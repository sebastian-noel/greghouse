// v1 pixel art, verbatim. Plants: 11-row species top + shared 5-row pot.
// Gardener: CHAR_ROWS with per-user skin palettes.
import { PAL } from './palette.js';
import { SPECIES } from './species.js';

export const POT_ROWS = [
  '..IIIIIIIIIIII..',
  '..IPPPPPPPPPPI..',
  '..IPPPPPPPPPPI..',
  '...IPPPPPPPPI...',
  '....IIIIIIII....'
];
const withPot = top => top.concat(POT_ROWS);

export const SPRITES = {
ficus: withPot([
  '......DLL.......',
  '.....DLLLL......',
  '..DLL.LWL.LLD...',
  '.DLLLL.W.DLLLD..',
  '.DLLL..W..LLD...',
  '..DD..LWL..D....',
  '.DLLL.DWD.LLD...',
  'DLLLLD.W.DLLLD..',
  '.DDD...W...DD...',
  '.......W........',
  '...SSSSWSSSS....'
]),
cactus: withPot([
  '.......LL.......',
  '..L...DLLD...L..',
  '..L...DLLD...L..',
  '..LL..DLLD..LL..',
  '...LLLDLLD......',
  '......DLLDLLL...',
  '......DLLD......',
  '......DLLD......',
  '......DLLD......',
  '......DLLD......',
  '...SSSDLLDSS....'
]),
basil: withPot([
  '................',
  '....LL..LL......',
  '...LLLLLLLL.....',
  '..LLDLLLLDLLL...',
  '..LLLLDLLLLLL...',
  '...LDLLLLDLL....',
  '....LLLDLLL.....',
  '.....L.LL.L.....',
  '.....W.WW.W.....',
  '......WWW.......',
  '...SSSWWWSSS....'
]),
pothos: withPot([
  '................',
  '....LL...LL.....',
  '...LLLL.LLLL....',
  '...DLLL.DLLL....',
  '....DL...DL.....',
  '..LL..LLL..LL...',
  '.LLLL.DLD.LLLL..',
  '.DLLL..W..DLLLLL',
  '..DL...W......LL',
  '.......W......DL',
  '...SSSSWSSSS..L.'
]),
monstera: withPot([
  '.....DLLLLD.....',
  '...DLLLLLLLLD...',
  '..DLLL.LLLLLLD..',
  '..DLLLLLLL..LD..',
  '..DLL.LLLLLLD...',
  '..DLLLLL.LLLD...',
  '...DLLLLLLLD....',
  '....DDLWLDD.....',
  '.......W........',
  '.......W........',
  '...SSSSWSSSS....'
]),
snake_plant: withPot([
  '.......U........',
  '..U...DLD...U...',
  '.DLD..DLD..DLD..',
  '.DLD..DLD..DLD..',
  '.DLD..DLD..DLD..',
  '.DLD..DLD..DLD..',
  '.DLD..DLD..DLD..',
  '..DLD.DLD.DLD...',
  '..DLD.DLD.DLD...',
  '...DLDDLDDLD....',
  '...SSSSSSSSS....'
])
};

export const FACES = {
  happy:    [[12,6,'I'],[12,9,'I'],[13,5,'I'],[14,6,'I'],[14,7,'I'],[14,8,'I'],[14,9,'I'],[13,10,'I']],
  thirsty:  [[12,6,'I'],[13,6,'I'],[12,9,'I'],[13,9,'I'],[14,5,'I'],[13,7,'I'],[14,8,'I'],[13,10,'I'],[10,13,'B']],
  drowning: [[12,5,'I'],[12,6,'I'],[12,9,'I'],[12,10,'I'],[13,7,'I'],[13,8,'I'],[14,7,'I'],[14,8,'I'],[8,3,'B'],[9,12,'B'],[7,12,'B']]
};

export function spriteSVG(plant, scale) {
  scale = scale || 5;
  const grid = (SPRITES[plant.speciesId] || SPRITES.pothos).map(r => r.split(''));
  for (const [r, c, k] of FACES[plant.mood] || FACES.happy) {
    if (grid[r] && grid[r][c] !== undefined) grid[r][c] = k;
  }
  let rects = '';
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    const ch = grid[r][c];
    if (ch === '.') continue;
    const color = ch === 'P' ? plant.potColor : PAL[ch];
    rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="${color}"/>`;
  }
  const sp = SPECIES[plant.speciesId] || SPECIES.pothos;
  return `<svg width="${16 * scale}" height="${16 * scale}" viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="${plant.name} the ${sp.commonName}, ${plant.mood}">${rects}</svg>`;
}

/* ---------- gardener character (v1) ----------
   16x16, drawn facing forward. 'H' hair, 'F' face/skin, 'B' body/overalls,
   'T' shirt trim, 'O' boots, 'I' outline. */
export const CHAR_ROWS = [
  '.....IIIIII.....',
  '....IHHHHHHI....',
  '...IHHHHHHHHI...',
  '...IHFFFFFFHI...',
  '...IHFOOFFOFI...',   // eyes
  '...IHFFFFFFHI...',
  '....IFFFFFFI....',
  '...ITTTTTTTTI...',
  '..ITBBBBBBBBTI..',
  '..IBBBTTTTBBBI..',
  '..IBBBTTTTBBBI..',
  '..IBBBBBBBBBBI..',
  '...IBB.II.BBI...',
  '...IBBI..IBBI...',
  '...IOOI..IOOI...',
  '...IOOI..IOOI...'
];
export const CHAR_PAL = { I: '#1D2B53', H: '#AB5236', F: '#FFCCAA', O: '#5F574F', B: '#29ADFF', T: '#FFEC27' };

export function charSVG(scale, skin) {
  scale = scale || 3;
  const pal = Object.assign({}, CHAR_PAL, skin || {});
  let rects = '';
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    const ch = CHAR_ROWS[r][c];
    if (ch === '.') continue;
    rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="${pal[ch]}"/>`;
  }
  return `<svg width="${16 * scale}" height="${16 * scale}" viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-label="the gardener">${rects}</svg>`;
}

/* ---------- avatar skins (v1 pools) ---------- */
export const SKIN_HAIR = ['#AB5236', '#1D2B53', '#FFEC27', '#FF77A8', '#5F574F', '#FFF1E8', '#008751', '#FFA300'];
export const SKIN_BODY = ['#29ADFF', '#FF004D', '#00E436', '#FF77A8', '#FFA300', '#83769C', '#008751', '#AB5236'];
export const SKIN_TRIM = ['#FFEC27', '#FFF1E8', '#1D2B53', '#FFCCAA', '#29ADFF', '#FF77A8'];
export const SKIN_FACE = ['#FFCCAA', '#E8A87C', '#C68642', '#8D5524'];

export function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

import { mulberry32 } from './worldgen.js';
const pickFrom = (arr, rng) => arr[Math.floor((rng || Math.random)() * arr.length)];
export function randomSkin(rng) {
  return { H: pickFrom(SKIN_HAIR, rng), B: pickFrom(SKIN_BODY, rng), T: pickFrom(SKIN_TRIM, rng), F: pickFrom(SKIN_FACE, rng) };
}
// owner skins are deterministic per user id — same look on every device
export function skinFromString(s) { return randomSkin(mulberry32(hash(s))); }
