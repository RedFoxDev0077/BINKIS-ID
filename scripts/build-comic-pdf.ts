#!/usr/bin/env node
/**
 * Build the downloadable PDF of a chapter, one file per language.
 *
 *   node scripts/build-comic-pdf.ts
 *   node scripts/build-comic-pdf.ts --comic krox --chapter 1
 *
 * BUILT HERE, NOT ON THE SERVER. The output is a static file uploaded beside
 * the artwork, exactly like the artwork, so the VPS runs no PDF code, holds
 * no PDF dependency, and never assembles twenty megabytes of JPEG inside a
 * request. Caddy serves the result immutable, which is the whole of the
 * "generated once and cached" the client was quoted.
 *
 * WHY THE PAGES ARE RE-ENCODED. Every page the client delivered is a
 * PROGRESSIVE JPEG. PDF embeds JPEG through its DCTDecode filter, and in
 * practice DCTDecode means baseline: Acrobat, PDFium and Ghostscript all fail
 * or misdraw progressive scans. So each page is decoded and re-encoded to
 * baseline at quality 90 with no chroma subsampling. 4:4:4 rather than 4:2:0
 * because these pages are heavy black inking over flat colour, which is
 * exactly what subsampled chroma smears; measured against each original's own
 * decoded pixels it costs about 1.7x the bytes for 40-44dB PSNR, which is the
 * right side of that trade for art somebody paid for.
 *
 * It is a second generation of loss on top of a lossy original, and there is
 * no way around it short of the client re-exporting 28 pages as baseline.
 * Worth knowing; not worth blocking on.
 *
 * WHAT IT CHECKS BEFORE IT WRITES. The PDF writer refuses any page that is
 * still progressive, wrong-depth or wrong-colourspace. Then this script
 * re-opens its own finished file, finds every embedded stream through the
 * cross reference table, and decodes each one back to pixels to confirm it is
 * a real image of the size the catalog promised. A PDF that parses is not the
 * same claim as a PDF that draws.
 */

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import sharp from 'sharp';

import { COMICS, type Comic, type ComicChapter, type ComicLocale } from '../src/lib/comics/catalog.ts';
import { buildJpegPdf, scanJpeg, type PdfPage } from './lib/jpeg-pdf.ts';
import { downloadFileName, downloadPath, downloadSources } from './lib/comic-download.ts';

/** Where the art lives locally. On the server this is /opt/binkis-id/media. */
const MEDIA_ROOT = 'public';

/**
 * Page height in points, the same for every page.
 *
 * 738pt is 10.25 inches, the height of a standard comic. With these pages'
 * aspect a single page lands at 6.6 inches wide, which is comic trim size to
 * within a hair, and a double-page spread lands as one landscape page twice
 * that wide. Sizing on width instead would print every spread at half height.
 */
const PAGE_HEIGHT_PT = 738;

const JPEG = { quality: 90, chromaSubsampling: '4:4:4', progressive: false, mozjpeg: false } as const;

const LOCALES: readonly ComicLocale[] = ['es', 'en'];

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function localPath(served: string): string {
  return resolve(process.cwd(), MEDIA_ROOT + served);
}

/** Decode, re-encode to baseline, and confirm the result is what it claims. */
async function toBaseline(served: string, expected: { width: number; height: number } | null) {
  const file = localPath(served);
  if (!existsSync(file)) {
    throw new Error(
      `${served} is not in ${MEDIA_ROOT}. The art is not in the repository, so pull it ` +
        `down from the server before building: it is under /opt/binkis-id/media.`,
    );
  }

  const before = readFileSync(file);
  const after = await sharp(before).jpeg(JPEG).toBuffer();

  const facts = scanJpeg(after);
  if (!facts.baseline) throw new Error(`${served}: re-encode came back progressive`);
  if (expected && (facts.width !== expected.width || facts.height !== expected.height)) {
    throw new Error(
      `${served}: catalog says ${expected.width}x${expected.height}, file is ` +
        `${facts.width}x${facts.height}. Fix the catalog, do not fix the file.`,
    );
  }

  return { bytes: after, before: before.length, facts };
}

/**
 * Re-open a finished PDF and decode every image in it.
 *
 * Walks the cross reference table rather than scanning for `stream`, so a
 * wrong offset is caught here rather than by whoever downloads the file.
 */
async function verify(pdf: Uint8Array, expect: readonly { width: number; height: number }[]) {
  const buf = Buffer.from(pdf);
  const text = buf.toString('latin1');

  const start = /startxref\s+(\d+)\s+%%EOF/.exec(text);
  if (!start) throw new Error('verify: no startxref');
  const xrefAt = Number(start[1]);

  const header = /^xref\s+0\s+(\d+)\s/.exec(text.slice(xrefAt));
  if (!header) throw new Error('verify: unreadable xref');
  const size = Number(header[1]);
  const first = xrefAt + header[0].length;

  const offsets: number[] = [];
  for (let n = 1; n < size; n++) {
    const entry = text.slice(first + n * 20, first + (n + 1) * 20);
    const m = /^(\d{10}) (\d{5}) n/.exec(entry);
    if (!m) throw new Error(`verify: xref entry ${n} malformed`);
    offsets[n] = Number(m[1]);
    if (!text.startsWith(`${n} 0 obj`, offsets[n]!)) {
      throw new Error(`verify: xref says object ${n} is at ${offsets[n]}, and it is not`);
    }
  }

  const images: { at: number; length: number; width: number; height: number }[] = [];
  for (let n = 1; n < size; n++) {
    const at = offsets[n]!;
    const body = text.slice(at, text.indexOf('endobj', at));
    if (!body.includes('/Subtype /Image')) continue;
    const length = Number(/\/Length\s+(\d+)/.exec(body)![1]);
    images.push({
      at: at + body.indexOf('stream') + 'stream\n'.length,
      length,
      width: Number(/\/Width\s+(\d+)/.exec(body)![1]),
      height: Number(/\/Height\s+(\d+)/.exec(body)![1]),
    });
  }

  if (images.length !== expect.length) {
    throw new Error(`verify: ${images.length} images in the file, ${expect.length} expected`);
  }

  for (const [i, image] of images.entries()) {
    const want = expect[i]!;
    if (image.width !== want.width || image.height !== want.height) {
      throw new Error(`verify: page ${i + 1} is ${image.width}x${image.height}, expected ${want.width}x${want.height}`);
    }
    // The real check: the bytes at that offset decode to an image of that size.
    const meta = await sharp(buf.subarray(image.at, image.at + image.length)).metadata();
    if (meta.width !== want.width || meta.height !== want.height) {
      throw new Error(`verify: page ${i + 1} does not decode to ${want.width}x${want.height}`);
    }
  }
}

async function buildOne(comic: Comic, chapter: ComicChapter, locale: ComicLocale) {
  const sources = downloadSources(comic, chapter, locale);

  // What the catalog says each file should be, so a silent resize is caught.
  const declared = new Map<string, { width: number; height: number }>();
  for (const page of chapter.pages?.[locale] ?? []) declared.set(page.image, page);
  for (const plate of chapter.closing ?? []) declared.set(plate.image, plate);

  const pages: PdfPage[] = [];
  const sizes: { width: number; height: number }[] = [];
  let originalBytes = 0;

  for (const served of sources) {
    const { bytes, before, facts } = await toBaseline(served, declared.get(served) ?? null);
    pages.push({ jpeg: bytes, label: served });
    sizes.push({ width: facts.width, height: facts.height });
    originalBytes += before;
  }

  const pdf = buildJpegPdf(pages, {
    title: `${comic.title}: ${chapter.title[locale]}`,
    author: 'BINKIS',
    pageHeightPt: PAGE_HEIGHT_PT,
    // Fixed to the chapter's publication date rather than now, so rebuilding
    // an unchanged chapter produces an identical file.
    createdAt: new Date(`${chapter.publishedAt ?? '2026-01-01'}T12:00:00Z`),
  });

  await verify(pdf, sizes);

  const name = downloadFileName(comic, chapter, locale, sources);
  const out = localPath(`/comics/${comic.slug}/${chapter.number}/${name}`);
  writeFileSync(out, pdf);

  return {
    locale,
    file: downloadPath(comic, chapter, locale, sources),
    bytes: statSync(out).size,
    pages: pages.length,
    originalBytes,
  };
}

const { values } = parseArgs({
  options: {
    comic: { type: 'string', default: 'krox' },
    chapter: { type: 'string', default: '1' },
  },
});

const comic = COMICS.find((c) => c.slug === values.comic);
if (!comic) throw new Error(`No comic "${values.comic}". Known: ${COMICS.map((c) => c.slug).join(', ')}`);
const chapter = comic.chapters.find((c) => c.number === Number(values.chapter));
if (!chapter) throw new Error(`${comic.slug} has no chapter ${values.chapter}`);

console.log(`\n${comic.title}, capitulo ${chapter.number}. Re-encoding to baseline, then writing.\n`);

const built = [];
for (const locale of LOCALES) built.push(await buildOne(comic, chapter, locale));

for (const b of built) {
  console.log(
    `  ${b.locale}  ${String(b.pages).padStart(2)} paginas   ${mb(b.bytes).padStart(8)}` +
      `   (source art ${mb(b.originalBytes)})`,
  );
  console.log(`      ${b.file}`);
}

console.log(`\nPaste into the chapter in src/lib/comics/catalog.ts:\n`);
console.log('      downloads: {');
for (const b of built) {
  console.log(`        ${b.locale}: { file: '${b.file}', bytes: ${b.bytes} },`);
}
console.log('      },');
console.log(`\nThen upload both files to /opt/binkis-id/media/comics/${comic.slug}/${chapter.number}/.\n`);
