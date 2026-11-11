import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANIMATIONS,
  findAnimation,
  megabytes,
  runtime,
  watchable,
  type Animation,
} from '../../src/lib/videos/catalog.ts';
import { mediaUrl } from '../../src/lib/comics/catalog.ts';

/**
 * The animation catalogue.
 *
 * Every one of these guards a failure the client has already lived through
 * once on the comic side: a declared file that was not on the server, a
 * cached 404 that outlived the fix, a size printed on a button that did not
 * match the download. The clips are bigger than the comic pages and a phone
 * on mobile data pays for every one of those mistakes.
 */

const LOCAL_MEDIA = join(process.cwd(), 'public');

function clipPaths(clip: Animation): string[] {
  return [clip.poster, clip.source.file];
}

describe('animation catalogue', () => {
  it('declares every path in the one shape Caddy serves', () => {
    // /videos/* is its own handle block in the Caddyfile, rooted at
    // /srv/media. A path outside that prefix reaches Next instead and 404s.
    for (const clip of ANIMATIONS) {
      expect(clip.poster, clip.slug).toMatch(/^\/videos\/[a-z0-9-]+\/[^?#\s]+\.jpg$/);
      expect(clip.source.file, clip.slug).toMatch(/^\/videos\/[a-z0-9-]+\/[^?#\s]+\.mp4$/);
    }
  });

  it('points at files that exist', () => {
    // The art is uploaded by hand, separately from the deploy, so this is the
    // one place a typo in a filename gets caught before it is a dead player.
    for (const clip of ANIMATIONS) {
      for (const path of clipPaths(clip)) {
        expect(existsSync(join(LOCAL_MEDIA, path)), `${clip.slug}: ${path}`).toBe(true);
      }
    }
  });

  it('prints the size the file actually is', () => {
    // The number on the button is a promise about what a tap will cost
    // somebody on mobile data. Declared by hand, so it can drift; a re-encode
    // that changes the bytes and not this line fails here.
    for (const clip of ANIMATIONS) {
      const real = statSync(join(LOCAL_MEDIA, clip.source.file)).size;
      expect(clip.source.bytes, clip.slug).toBe(real);
    }
  });

  it('serves H.264 in an MP4 with the index at the front', () => {
    // The two codecs the client's animator has actually sent are AV1, which
    // no iPhone before the 15 Pro decodes, and H.265, which Firefox refuses.
    // Both looked fine on the machine they were made on. This reads the real
    // boxes rather than trusting the extension.
    for (const clip of ANIMATIONS) {
      const buf = readFileSync(join(LOCAL_MEDIA, clip.source.file));
      const boxes = topLevelBoxes(buf);

      expect(boxes, clip.slug).toContain('moov');
      expect(boxes, clip.slug).toContain('mdat');
      // faststart: playback can begin before the whole file has landed.
      expect(boxes.indexOf('moov'), `${clip.slug}: moov must precede mdat`).toBeLessThan(
        boxes.indexOf('mdat'),
      );

      // avc1 is H.264. hvc1/hev1 is H.265, av01 is AV1: both have shipped
      // here and neither plays everywhere.
      const head = buf.subarray(0, Math.min(buf.length, 200_000)).toString('latin1');
      expect(head.includes('avc1'), `${clip.slug}: not H.264`).toBe(true);
      expect(head.includes('hvc1') || head.includes('hev1'), `${clip.slug}: H.265`).toBe(false);
      expect(head.includes('av01'), `${clip.slug}: AV1`).toBe(false);
    }
  });

  it('keeps slugs unique and URL-safe, because these links get shared', () => {
    const slugs = ANIMATIONS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('declares both languages for every clip, with nothing blank', () => {
    for (const clip of ANIMATIONS) {
      for (const locale of ['es', 'en'] as const) {
        expect(clip.title[locale].trim(), `${clip.slug}.title.${locale}`).not.toBe('');
        expect(clip.blurb[locale].trim(), `${clip.slug}.blurb.${locale}`).not.toBe('');
      }
    }
  });

  it('names a comic that exists when it names one at all', async () => {
    const { COMICS } = await import('../../src/lib/comics/catalog.ts');
    const slugs = new Set(COMICS.map((c) => c.slug));
    for (const clip of ANIMATIONS) {
      if (clip.comic) expect(slugs.has(clip.comic), `${clip.slug} -> ${clip.comic}`).toBe(true);
    }
  });

  it('hides what is not published', () => {
    const unpublished = ANIMATIONS.filter((a) => a.publishedAt === null);
    for (const clip of unpublished) {
      expect(findAnimation(clip.slug), clip.slug).toBeNull();
      expect(watchable().map((a) => a.slug)).not.toContain(clip.slug);
    }
  });

  it('returns null for a slug nobody declared', () => {
    expect(findAnimation('does-not-exist')).toBeNull();
    // A path traversal in the URL segment is still just a miss.
    expect(findAnimation('../comics/krox')).toBeNull();
  });

  it('versions every URL it hands the browser', () => {
    // Same reason as the comic pages: /videos/* is served immutable, so a
    // file that has to be re-fetched is re-fetched by changing the URL.
    for (const clip of ANIMATIONS) {
      for (const path of clipPaths(clip)) {
        expect(mediaUrl(path)).toMatch(/\?v=\d+$/);
      }
    }
  });
});

describe('runtime', () => {
  it('writes m:ss with a padded second', () => {
    expect(runtime(83)).toBe('1:23');
    expect(runtime(9)).toBe('0:09');
    expect(runtime(60)).toBe('1:00');
    expect(runtime(600)).toBe('10:00');
  });
});

describe('megabytes', () => {
  it('uses the viewer own number format', () => {
    expect(megabytes(5_682_147, 'en')).toBe('5.4 MB');
    expect(megabytes(5_682_147, 'es')).toBe('5,4 MB');
  });
});

/** Walks the top-level box types of an MP4, in file order. */
function topLevelBoxes(b: Buffer): string[] {
  const types: string[] = [];
  let o = 0;
  while (o + 8 <= b.length) {
    let size = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    let head = 8;
    if (size === 1) {
      size = Number(b.readBigUInt64BE(o + 8));
      head = 16;
    } else if (size === 0) {
      size = b.length - o;
    }
    if (size < head || o + size > b.length) break;
    types.push(type);
    o += size;
  }
  return types;
}
