import { describe, it, expect } from 'vitest';

import { buildJpegPdf, scanJpeg } from '../../scripts/lib/jpeg-pdf.ts';

/**
 * The PDF writer, checked by reading the file back.
 *
 * The parser below shares no code with the writer on purpose. Asserting that
 * `buildJpegPdf` produced the string `buildJpegPdf` meant to produce would
 * prove nothing; what matters is whether a reader that only knows the format
 * can find the pages, the sizes and the image bytes.
 *
 * What these tests do NOT cover is whether a real reader draws the result.
 * That is checked twice elsewhere: the build script re-opens its own output
 * and decodes every embedded stream back to pixels, and the finished file is
 * opened in an actual PDF renderer before it ships.
 *
 * Fixtures are 24x16 JPEGs generated once with sharp and pasted in, rather
 * than encoded at test time, so that a change in sharp's output cannot move
 * what these tests are measuring.
 */
const BASELINE_24x16 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABgDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABwAG/8QAHxAAAAYCAwEAAAAAAAAAAAAAAAECBQYxIqEDBCMS/8QAFwEAAwEAAAAAAAAAAAAAAAAAAwQFB//EAB8RAAEEAgIDAAAAAAAAAAAAAAEAAgMEBQYniyJRsf/aAAwDAQACEQMRAD8AGmyMV56GrbIxWGgkNkYrDQ1bZGK89Ada2o+F2jx2Rw2RisNCDj0I2njR9rSRJKzMhB+TNVavDZ5WtJ9uA+lahS2ZzohwV//Z';
const PROGRESSIVE_24x16 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAQABgDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgAF/8QAFwEAAwEAAAAAAAAAAAAAAAAAAgMEBv/aAAwDAQACEAMQAAABGayTVGM5OJ+o/8QAGBAAAwEBAAAAAAAAAAAAAAAAAAMEAhH/2gAIAQEAAQUCXMLmFzC5hcxibh//xAAaEQACAgMAAAAAAAAAAAAAAAAAAQIFAwRh/9oACAEDAQE/AdK06YbNuJ//xAAaEQACAgMAAAAAAAAAAAAAAAACAwABBCGB/9oACAECAQE/AVthZqlaMqrs/8QAFhABAQEAAAAAAAAAAAAAAAAAMRAg/9oACAEBAAY/AjBP/8QAGRAAAwADAAAAAAAAAAAAAAAAAAFhEBEh/9oACAEBAAE/ITTJk8ZSba4f/9oADAMBAAIAAwAAABCQ7//EABcRAAMBAAAAAAAAAAAAAAAAAAABETH/2gAIAQMBAT8QwCjGf//EABgRAQEAAwAAAAAAAAAAAAAAAAEAEVGx/9oACAECAQE/ELwCx2Drf//EABgQAAMBAQAAAAAAAAAAAAAAAAABMcER/9oACAEBAAE/EJ4J5J5J5J4ORySto//Z';
const GRAY_24x16 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/wAALCAAQABgBAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABwYI/8QAIhAAAAUDBQEBAAAAAAAAAAAAAAECBQYRIjIDBAcSIRYj/9oACAEBAAA/ABaLNuFoYIs24WhgizbhaM6RZtwtDBFm3C0UHJkm+A443zroH1ctamz2Hlf3WR0V6lRWpJS6KKh9OtfSH//Z';

const baseline = () => Buffer.from(BASELINE_24x16, 'base64');
const progressive = () => Buffer.from(PROGRESSIVE_24x16, 'base64');
const gray = () => Buffer.from(GRAY_24x16, 'base64');

const OPTIONS = {
  title: 'KROX: El último guerrero de Athos',
  author: 'BINKIS',
  pageHeightPt: 792,
  createdAt: new Date(Date.UTC(2026, 10, 9, 12, 0, 0)),
};

/**
 * A deliberately literal PDF reader: find the trailer, walk the cross
 * reference table, and pull objects out by the offsets it lists. It trusts
 * nothing the writer told it, which is the point.
 */
function parse(pdf: Uint8Array) {
  const buf = Buffer.from(pdf);
  const text = buf.toString('latin1');

  expect(text.startsWith('%PDF-1.')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);

  const startxref = /startxref\s+(\d+)\s+%%EOF/.exec(text);
  if (!startxref) throw new Error('no startxref');
  const xrefAt = Number(startxref[1]);
  expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');

  const header = /^xref\s+0\s+(\d+)\s/.exec(text.slice(xrefAt));
  if (!header) throw new Error('unreadable xref header');
  const size = Number(header[1]);

  // Entries are fixed width at 20 bytes, starting after the subsection header.
  // Entry 0 is the free-list head, so object n sits at n * 20.
  const first = xrefAt + header[0].length;
  expect(text.slice(first, first + 20)).toMatch(/^0000000000 65535 f/);

  const offsets: number[] = [];
  for (let n = 1; n < size; n++) {
    const entry = text.slice(first + n * 20, first + (n + 1) * 20);
    const m = /^(\d{10}) (\d{5}) n/.exec(entry);
    if (!m) throw new Error(`xref entry ${n} is malformed: ${JSON.stringify(entry)}`);
    offsets[n] = Number(m[1]);
  }

  /** The raw text of object n, located only through the xref table. */
  const object = (n: number): string => {
    const at = offsets[n]!;
    expect(text.slice(at, at + String(n).length + 6), `object ${n} header`).toBe(`${n} 0 obj`);
    const close = text.indexOf('endobj', at);
    return text.slice(at, close);
  };

  const catalog = object(1);
  const rootRef = /\/Pages\s+(\d+)\s+0\s+R/.exec(catalog);
  if (!rootRef) throw new Error('catalog names no page tree');

  const tree = object(Number(rootRef[1]));
  const count = Number(/\/Count\s+(\d+)/.exec(tree)![1]);
  const kids = [.../\/Kids\s*\[([^\]]*)\]/.exec(tree)![1]!.matchAll(/(\d+)\s+0\s+R/g)].map((m) =>
    Number(m[1]),
  );

  const pages = kids.map((kid) => {
    const page = object(kid);
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(page)!;
    const imageRef = Number(/\/XObject\s*<<\s*\/Im0\s+(\d+)\s+0\s+R/.exec(page)![1]);

    const image = object(imageRef);
    const dict = image.slice(0, image.indexOf('stream'));
    const at = offsets[imageRef]! + image.indexOf('stream') + 'stream\n'.length;
    const length = Number(/\/Length\s+(\d+)/.exec(dict)![1]);

    return {
      widthPt: Number(box[1]),
      heightPt: Number(box[2]),
      pixelWidth: Number(/\/Width\s+(\d+)/.exec(dict)![1]),
      pixelHeight: Number(/\/Height\s+(\d+)/.exec(dict)![1]),
      colorSpace: /\/ColorSpace\s+(\/\w+)/.exec(dict)![1],
      filter: /\/Filter\s+(\/\w+)/.exec(dict)![1],
      bytes: buf.subarray(at, at + length),
    };
  });

  const infoRef = /\/Info\s+(\d+)\s+0\s+R/.exec(text.slice(text.lastIndexOf('trailer')));
  const info = infoRef ? object(Number(infoRef[1])) : '';

  return { count, pages, info, objectCount: size - 1 };
}

/** Read a UTF-16BE hex string back out of a PDF dictionary. */
function hexText(dict: string, key: string): string {
  const m = new RegExp(`/${key}\\s*<([0-9a-fA-F]+)>`).exec(dict);
  if (!m) throw new Error(`no /${key}`);
  const bytes = Buffer.from(m[1]!, 'hex');
  expect(bytes.readUInt16BE(0)).toBe(0xfeff);
  return bytes.subarray(2).swap16().toString('utf16le');
}

describe('scanJpeg', () => {
  it('reads a baseline frame header', () => {
    expect(scanJpeg(baseline())).toEqual({
      width: 24,
      height: 16,
      components: 3,
      precision: 8,
      baseline: true,
    });
  });

  it('reports a progressive frame as not baseline', () => {
    const facts = scanJpeg(progressive());
    expect(facts.baseline).toBe(false);
    expect(facts.width).toBe(24);
    expect(facts.height).toBe(16);
  });

  it('reads a grayscale frame as one component', () => {
    expect(scanJpeg(gray()).components).toBe(1);
  });

  it('refuses something that is not a JPEG', () => {
    expect(() => scanJpeg(Buffer.from('%PDF-1.4'))).toThrow(/not a JPEG/);
  });
});

describe('buildJpegPdf', () => {
  it('refuses a progressive page rather than writing one a reader cannot draw', () => {
    expect(() =>
      buildJpegPdf([{ jpeg: progressive(), label: 'page 4-5' }], OPTIONS),
    ).toThrow(/page 4-5.*progressive/i);
  });

  it('refuses an empty document', () => {
    expect(() => buildJpegPdf([], OPTIONS)).toThrow(/at least one page/);
  });

  /**
   * The load-bearing test. Every offset in the cross reference table has to
   * land exactly on its object header, or the file opens in a forgiving
   * reader and fails in a strict one - which would look like success here and
   * be broken for whoever downloaded it.
   */
  it('writes a cross reference table whose offsets all land on their objects', () => {
    const pdf = buildJpegPdf(
      [
        { jpeg: baseline(), label: 'cover' },
        { jpeg: gray(), label: 'page 1' },
        { jpeg: baseline(), label: 'page 2-3' },
      ],
      OPTIONS,
    );
    const read = parse(pdf);
    expect(read.count).toBe(3);
    // Catalog, page tree, info, then three objects per page.
    expect(read.objectCount).toBe(3 + 3 * 3);
  });

  it('embeds each JPEG byte for byte, with no re-compression', () => {
    const cover = baseline();
    const inside = gray();
    const pdf = buildJpegPdf(
      [
        { jpeg: cover, label: 'cover' },
        { jpeg: inside, label: 'page 1' },
      ],
      OPTIONS,
    );
    const read = parse(pdf);

    expect(read.pages[0]!.filter).toBe('/DCTDecode');
    expect(Buffer.compare(read.pages[0]!.bytes, cover)).toBe(0);
    expect(Buffer.compare(read.pages[1]!.bytes, inside)).toBe(0);
  });

  it('declares the colour space each JPEG actually uses', () => {
    const pdf = buildJpegPdf(
      [
        { jpeg: baseline(), label: 'colour' },
        { jpeg: gray(), label: 'grey' },
      ],
      OPTIONS,
    );
    const read = parse(pdf);
    expect(read.pages[0]!.colorSpace).toBe('/DeviceRGB');
    expect(read.pages[1]!.colorSpace).toBe('/DeviceGray');
  });

  it('carries the pixel dimensions through unchanged', () => {
    const read = parse(buildJpegPdf([{ jpeg: baseline(), label: 'p' }], OPTIONS));
    expect(read.pages[0]!.pixelWidth).toBe(24);
    expect(read.pages[0]!.pixelHeight).toBe(16);
  });

  /**
   * A spread is one drawing as tall as a single page and twice as wide, so
   * every page gets the same height and takes its width from its own aspect.
   * Sizing on width instead would print every spread at half height.
   */
  it('gives every page the same height and a width from its own aspect', () => {
    const tall = baseline(); // 24x16 landscape
    const read = parse(
      buildJpegPdf(
        [
          { jpeg: tall, label: 'a' },
          { jpeg: gray(), label: 'b' },
        ],
        { ...OPTIONS, pageHeightPt: 800 },
      ),
    );
    for (const page of read.pages) {
      expect(page.heightPt).toBe(800);
      expect(page.widthPt).toBeCloseTo((800 * page.pixelWidth) / page.pixelHeight, 2);
    }
  });

  it('keeps an accented title readable', () => {
    const read = parse(buildJpegPdf([{ jpeg: baseline(), label: 'p' }], OPTIONS));
    expect(hexText(read.info, 'Title')).toBe('KROX: El último guerrero de Athos');
    expect(hexText(read.info, 'Author')).toBe('BINKIS');
  });

  it('dates the file in UTC rather than wherever the build ran', () => {
    const read = parse(buildJpegPdf([{ jpeg: baseline(), label: 'p' }], OPTIONS));
    expect(read.info).toContain("(D:20261109120000Z00'00')");
  });
});
