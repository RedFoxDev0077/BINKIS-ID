/**
 * UNIVERSALS animation: the short clips, and what is watchable today.
 *
 * Declared here rather than read off disk, for the same reason the comic
 * catalogue is: a clip that points at a file which is not there should be a
 * build-time mistake in one obvious place, not a dead player on someone's
 * phone.
 *
 * Asked for by the client on 10 November 2026 - "un boton donde podamos ir
 * implementando mas videos posteriores" - so the shape that matters here is
 * the one that makes clip number six a four-line addition to this file and
 * nothing else.
 *
 * VIDEO LIVES OUTSIDE THE REPO, exactly like the comic pages and the
 * character art. Caddy serves /videos/* from /srv/media, which is
 * /opt/binkis-id/media on the server and public/videos locally. Several
 * megabytes of the client's animation per clip has no business in git.
 */

import type { ComicLocale, Localised } from '../comics/catalog';

export { mediaUrl } from '../comics/catalog';

/**
 * The encoded file the browser actually plays.
 *
 * ONE FILE, H.264 AND AAC, AND THAT IS A DELIVERY DECISION RATHER THAN A
 * DEFAULT. The client's animator has now sent the same clip twice in codecs
 * that do not play everywhere: AV1 on 10 November, which no iPhone before the
 * 15 Pro can decode, and H.265 on 11 November, which Firefox refuses and
 * which desktop Chrome on Windows only plays with a codec extension almost
 * nobody has installed. H.264 is the one video codec every browser in use
 * plays, so every clip here is re-encoded to it before it ships, whatever
 * arrives.
 *
 * `faststart` matters as much as the codec and is invisible until it is
 * missing: with the index at the end of the file, nothing plays until the
 * whole download lands. The delivered H.265 cut was built that way, so it
 * made a viewer on mobile data wait for 13 MB before the first frame.
 */
export interface VideoSource {
  /** Served path, e.g. /videos/krox/04-480p.mp4 */
  file: string;
  /** Intrinsic pixel size, so the player reserves the right box up front. */
  width: number;
  height: number;
  /** Printed next to the clip, because this is a phone on mobile data. */
  bytes: number;
}

export interface Animation {
  /** URL segment. Stable once published: these links get shared. */
  slug: string;
  title: Localised<string>;
  blurb: Localised<string>;
  /**
   * The comic this belongs to, by slug, when it belongs to one.
   *
   * Optional because the client has not said where every clip sits yet. A
   * clip with no comic is still watchable; it just does not offer the link
   * back into the chapter.
   */
  comic?: string;
  /** A frame from the clip itself, shown before anything is downloaded. */
  poster: string;
  source: VideoSource;
  /** Runtime, printed as m:ss. */
  seconds: number;
  /**
   * The language of the words IN the clip, or null when it carries none.
   *
   * Declared rather than guessed. It drives the same note the comic reader
   * shows when the lettering is not in the reader's language, and a wrong
   * value here is a promise the clip does not keep. Leave it null until
   * somebody who has heard the audio says otherwise: null means "no words to
   * warn anybody about", so an unset value is quiet rather than wrong.
   */
  spokenIn: ComicLocale | null;
  /** ISO date. Null means encoded but not released. */
  publishedAt: string | null;
}

/**
 * KROX: Origen.
 *
 * Delivered by the client 11 November 2026 as `04.mp4`, 854x480 H.265 with
 * the index at the tail, and re-encoded here to H.264 High at CRF 28 with
 * faststart: 12.5 MB down to 5.4 MB with no visible loss, because the source
 * was carrying far more bits than 480p animation needs.
 *
 * 854x480 is the ceiling the source sets, not a choice. Upscaling would add
 * megabytes and no detail. The animator has been asked for 1080 vertical on
 * the next one, and when it arrives it ships as a new file under a new name
 * rather than replacing this one, because /videos/* is served immutable.
 */
export const ANIMATIONS: readonly Animation[] = [
  {
    slug: 'krox-origen',
    title: {
      es: 'KROX: Origen',
      en: 'KROX: Origin',
    },
    blurb: {
      es: 'Antes de ser KROX, fue Atlas Bonn. El primer corto animado de UNIVERSALS.',
      en: 'Before he was KROX, he was Atlas Bonn. The first UNIVERSALS short.',
    },
    comic: 'krox',
    poster: '/videos/krox/04-poster.jpg',
    source: {
      file: '/videos/krox/04-480p.mp4',
      width: 854,
      height: 480,
      bytes: 5682147,
    },
    seconds: 83,
    spokenIn: null,
    publishedAt: '2026-11-11',
  },
];

/** Published clips, newest first. The list the site is allowed to show. */
export function watchable(): readonly Animation[] {
  return ANIMATIONS.filter((a) => a.publishedAt !== null).sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );
}

/** One published clip by slug, or null. Unpublished is not findable. */
export function findAnimation(slug: string): Animation | null {
  return watchable().find((a) => a.slug === slug) ?? null;
}

/**
 * Runtime as m:ss.
 *
 * Not Intl: there is no locale on earth that writes 1:23 differently, and
 * reaching for a formatter here would only add a way to get it wrong.
 */
export function runtime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** File size in megabytes, in the viewer's own number format. */
export function megabytes(bytes: number, locale: string): string {
  const mb = bytes / 1024 / 1024;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
}
