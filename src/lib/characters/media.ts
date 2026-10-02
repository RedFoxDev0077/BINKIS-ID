/**
 * Character artwork, keyed by the two-letter code on the serial.
 *
 * The client supplied a still for all thirteen characters and, for the eight
 * Classics, a 13 second animation of the figure landing on its base. The
 * animations are 720 x 720, silent and between 0.6 and 1.7 MB, because this
 * panel loads on every scan and a scan happens on a phone in a shop, not on a
 * desk. The 2160 x 2160 masters they were cut from are eight times the size
 * and would show a blank hero for several seconds on mobile data.
 *
 * Declared here rather than read off disk, so a missing file is a build-time
 * mistake in one obvious place instead of an empty box on a passport.
 */

export interface CharacterMedia {
  /** Still, always present. Shown first, and the only thing shown when
   *  the visitor asked their system for reduced motion. */
  image: string;
  /** Poster frame of the animation, matching its first frame exactly. */
  poster?: string;
  /** The animation. Absent for the Limited characters, which have no clip. */
  video?: string;
}

const WITH_VIDEO = ['SP', 'BM', 'HQ', 'FL', 'WW', 'JK', 'SG', 'CY'] as const;
const STILL_ONLY = ['RF', 'BZ', 'CH', 'RD', 'GL'] as const;

export const CHARACTER_MEDIA: Record<string, CharacterMedia> = Object.fromEntries([
  ...WITH_VIDEO.map((code) => [
    code,
    {
      image: `/characters/${code}.png`,
      poster: `/characters/${code}.jpg`,
      video: `/characters/${code}.mp4`,
    },
  ]),
  ...STILL_ONLY.map((code) => [code, { image: `/characters/${code}.png` }]),
]);

/**
 * Aguila, the brand's own character.
 *
 * Deliberately not in CHARACTER_MEDIA: that map is keyed by the code on a
 * serial, and Aguila has no pieces. It is the mascot, so it belongs where the
 * brand speaks for itself rather than where a piece is described. Client's
 * decision, 2 October 2026: the empty collection is exactly that place.
 */
export const BRAND_MASCOT = {
  video: "/brand/aguila.mp4",
  poster: "/brand/aguila.jpg",
} as const;

export function characterMedia(characterCode: string): CharacterMedia | null {
  return CHARACTER_MEDIA[characterCode.toUpperCase()] ?? null;
}
