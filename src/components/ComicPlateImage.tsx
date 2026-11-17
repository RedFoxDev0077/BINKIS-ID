import { mediaUrl, type ComicPlate } from '@/lib/comics/catalog';

/**
 * One delivered file: a page, a spread, a cover, a poster.
 *
 * width and height are the intrinsic pixel size and they are declared so the
 * browser reserves the right box before the image arrives. Without them a
 * chapter of 14 tall images reflows under the reader's thumb all the way
 * down, which on a phone on mobile data is the difference between reading and
 * chasing the page.
 *
 * A plain img, not next/image: these files are served by Caddy straight off
 * the host, so the optimiser inside the app container cannot fetch them.
 *
 * Shared by the reader and the announcement page since 17 November 2026. It
 * lived inside the reader until then, and the teaser needs the identical
 * box-reservation behaviour over the identical kind of file; a second copy
 * would have been the same four attributes waiting to drift apart.
 */
export function ComicPlateImage({
  page,
  label,
  priority,
}: {
  page: ComicPlate;
  label: string;
  priority: boolean;
}) {
  return (
    <figure className="bg-ink-925">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(page.image)}
        alt={label}
        width={page.width}
        height={page.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="h-auto w-full sm:rounded-lg"
      />
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
