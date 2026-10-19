/**
 * The display case: where every layer sits.
 *
 * The client's animator delivered the case as a Blender render cut into
 * layers (18 October 2026): one shared background with eight dark niches, and
 * per character the lit niche, its brass plate, the faint silhouette of the
 * figure, and the figure itself. Any combination of the eight can be lit, so
 * one set of layers covers all 256 states a collector can be in.
 *
 * The coordinates are theirs, copied from the `repisa.json` that ships beside
 * the images, and they are in pixels of the 1170 x 2080 render. They live here
 * rather than being fetched at runtime because they are geometry, not artwork:
 * TypeScript can check them, the case renders on the server with no round
 * trip, and a collector with JavaScript off still sees their collection.
 *
 * The images themselves are BINKIS material and stay off the repository, the
 * same as the character art. See docs/VITRINA.md.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Niche {
  /** The code that starts the serial: SP, BM, HQ... */
  characterCode: string;
  /** The animator's file-name key. Not derivable: Harley is `harleyqueen`. */
  key: string;
  name: string;
  /** The character's own colour, for the halo and the sparks of the reveal. */
  color: string;
  espacio: Box;
  placa: Box;
  silueta: Box;
  pieza: Box;
}

/** Pixels of the render every box below is measured in. */
export const STAGE = { w: 1170, h: 2080 } as const;

/** Where the layers are served from. Off-repo, like the character art. */
export const VITRINA_BASE = '/vitrina';

/** The eight niches, top-left to bottom-right, the order the case shows them. */
export const NICHES: readonly Niche[] = [
  {
    characterCode: 'SP',
    key: 'superman',
    name: 'Superman',
    color: '#4f8bff',
    espacio: { x: 232, y: 242, w: 355, h: 403 },
    placa: { x: 296, y: 617, w: 227, h: 52 },
    silueta: { x: 278, y: 339, w: 236, h: 266 },
    pieza: { x: 278, y: 339, w: 236, h: 266 },
  },
  {
    characterCode: 'SG',
    key: 'supergirl',
    name: 'Supergirl',
    color: '#ff5a8a',
    espacio: { x: 583, y: 242, w: 355, h: 403 },
    placa: { x: 647, y: 617, w: 227, h: 52 },
    silueta: { x: 641, y: 341, w: 284, h: 271 },
    pieza: { x: 641, y: 341, w: 284, h: 271 },
  },
  {
    characterCode: 'WW',
    key: 'wonderwoman',
    name: 'Wonder Woman',
    color: '#ff3b4e',
    espacio: { x: 232, y: 662, w: 355, h: 383 },
    placa: { x: 296, y: 1037, w: 227, h: 53 },
    silueta: { x: 314, y: 728, w: 243, h: 293 },
    pieza: { x: 314, y: 728, w: 243, h: 293 },
  },
  {
    characterCode: 'BM',
    key: 'batman',
    name: 'Batman',
    color: '#ffd84a',
    espacio: { x: 583, y: 662, w: 355, h: 383 },
    placa: { x: 647, y: 1037, w: 227, h: 53 },
    silueta: { x: 630, y: 714, w: 267, h: 307 },
    pieza: { x: 630, y: 714, w: 267, h: 307 },
  },
  {
    characterCode: 'FL',
    key: 'flash',
    name: 'The Flash',
    color: '#ff7a1f',
    espacio: { x: 232, y: 1079, w: 355, h: 386 },
    placa: { x: 296, y: 1457, w: 227, h: 53 },
    silueta: { x: 254, y: 1162, w: 289, h: 273 },
    pieza: { x: 254, y: 1162, w: 289, h: 273 },
  },
  {
    characterCode: 'CY',
    key: 'cyborg',
    name: 'Cyborg',
    color: '#ff3a3a',
    espacio: { x: 583, y: 1079, w: 355, h: 386 },
    placa: { x: 647, y: 1457, w: 227, h: 53 },
    silueta: { x: 640, y: 1162, w: 230, h: 273 },
    pieza: { x: 640, y: 1162, w: 230, h: 273 },
  },
  {
    characterCode: 'JK',
    key: 'joker',
    name: 'The Joker',
    color: '#57e07a',
    espacio: { x: 232, y: 1480, w: 355, h: 405 },
    placa: { x: 293, y: 1905, w: 229, h: 53 },
    silueta: { x: 296, y: 1553, w: 258, h: 294 },
    pieza: { x: 296, y: 1553, w: 258, h: 294 },
  },
  {
    characterCode: 'HQ',
    key: 'harleyqueen',
    name: 'Harley Quinn',
    color: '#ff4f9b',
    espacio: { x: 583, y: 1480, w: 355, h: 405 },
    placa: { x: 648, y: 1905, w: 229, h: 53 },
    silueta: { x: 622, y: 1531, w: 265, h: 316 },
    pieza: { x: 622, y: 1531, w: 265, h: 316 },
  },
];

/** The niche a serial's character code belongs to, or null if it has none. */
export function nicheFor(characterCode: string): Niche | null {
  const code = characterCode.toUpperCase();
  return NICHES.find((n) => n.characterCode === code) ?? null;
}
