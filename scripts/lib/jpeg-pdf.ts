/**
 * A PDF whose every page is one JPEG, written by hand.
 *
 * WHY NOT A PDF LIBRARY. The job is narrow enough to own: a catalog, a page
 * tree, and per page an image XObject plus a six-operator content stream.
 * Nothing here is novel and nothing here is guessed - it is the subset of
 * PDF 1.4 that a scanned-document writer emits, and it is exercised by
 * tests/unit/22-comic-pdf.test.ts against a parser that shares no code with
 * it.
 *
 * WHY THE PAGES MUST BE BASELINE. A JPEG goes into a PDF uncompressed and
 * unconverted, as a DCTDecode stream: the file's own bytes become the image.
 * That is the whole appeal - no second round of compression on art that is
 * already lossy - but DCTDecode in practice means BASELINE JPEG. Acrobat,
 * PDFium and Ghostscript all fail or misrender progressive scans, and pdf-lib
 * refuses them outright. Every page the client delivered is progressive, so
 * the build script transcodes before it reaches here and `scanJpeg` refuses
 * anything that slipped through. A PDF that opens on my machine and not on
 * the reader's phone is the failure this guard exists to prevent.
 */

/** What a JPEG's own header says about it. */
export interface JpegFacts {
  width: number;
  height: number;
  /** Component count: 1 grayscale, 3 YCbCr, 4 CMYK or YCCK. */
  components: number;
  /** Bits per component. DCTDecode wants 8. */
  precision: number;
  baseline: boolean;
}

/** Start-of-frame markers, and whether each one is a baseline frame. */
const FRAME_MARKERS = new Map<number, boolean>([
  [0xc0, true], // baseline DCT, the only one worth embedding
  [0xc1, false], // extended sequential
  [0xc2, false], // progressive
  [0xc3, false], // lossless
  [0xc5, false],
  [0xc6, false],
  [0xc7, false],
  [0xc9, false],
  [0xca, false],
  [0xcb, false],
  [0xcd, false],
  [0xce, false],
  [0xcf, false],
]);

/**
 * Read a JPEG's frame header.
 *
 * Deliberately a separate implementation from whatever encoded the file, so
 * that "the encoder said baseline" and "the bytes are baseline" stay two
 * different claims and the build only passes when both hold.
 */
export function scanJpeg(bytes: Uint8Array): JpegFacts {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG: no SOI marker');

  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    let marker = buf[i + 1]!;
    // Fill bytes: any number of 0xff may precede the marker itself.
    while (marker === 0xff && i + 2 < buf.length) {
      i++;
      marker = buf[i + 1]!;
    }
    // Standalone markers carry no length word.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    const baseline = FRAME_MARKERS.get(marker);
    if (baseline !== undefined) {
      return {
        precision: buf[i + 4]!,
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
        components: buf[i + 9]!,
        baseline,
      };
    }
    // Start of scan: pixel data from here on, so the frame header is behind us.
    if (marker === 0xda) break;
    i += 2 + length;
  }
  throw new Error('not a JPEG: no frame header before the first scan');
}

export interface PdfPage {
  /** The file's own bytes, embedded without re-compression. */
  jpeg: Uint8Array;
  /** What to call this page if the build has to complain about it. */
  label: string;
}

export interface PdfOptions {
  title: string;
  author: string;
  /**
   * The height of every page, in points.
   *
   * Height rather than width, because a two-page spread is one drawing as
   * tall as a single page and twice as wide. Fixing the height lands a spread
   * as a landscape page beside its portrait neighbours at the same physical
   * size, which is how the printed book reads. Fixing the width instead would
   * shrink every spread to half height.
   */
  pageHeightPt: number;
  createdAt: Date;
}

const LATIN1 = 'latin1';

/** A PDF text string, UTF-16BE in hex so accented titles survive. */
function textString(value: string): string {
  const utf16 = Buffer.from('﻿' + value, 'utf16le').swap16();
  return '<' + utf16.toString('hex') + '>';
}

function pdfDate(when: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    '(D:' +
    when.getUTCFullYear() +
    p(when.getUTCMonth() + 1) +
    p(when.getUTCDate()) +
    p(when.getUTCHours()) +
    p(when.getUTCMinutes()) +
    p(when.getUTCSeconds()) +
    "Z00'00')"
  );
}

/** Trim a float to something a PDF parser reads back as the same number. */
function num(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Assemble the file.
 *
 * Objects are emitted in order and their byte offsets recorded as they go,
 * because the cross-reference table at the end is a list of absolute offsets.
 * A PDF with a wrong one opens in a forgiving reader and fails in a strict
 * one, which is the worst way for this to break: it would look fine here and
 * be broken for the person who downloaded it.
 */
export function buildJpegPdf(pages: readonly PdfPage[], options: PdfOptions): Uint8Array {
  if (pages.length === 0) throw new Error('a PDF needs at least one page');

  const facts = pages.map((page) => {
    const f = scanJpeg(page.jpeg);
    if (!f.baseline) {
      throw new Error(
        page.label +
          ': progressive JPEG. Most PDF readers cannot draw one, so it has to be ' +
          'transcoded to baseline before it is embedded.',
      );
    }
    if (f.precision !== 8) {
      throw new Error(page.label + ': ' + f.precision + '-bit JPEG, DCTDecode wants 8');
    }
    if (f.components !== 3 && f.components !== 1) {
      throw new Error(
        page.label + ': ' + f.components + '-component JPEG, expected grayscale or YCbCr',
      );
    }
    return f;
  });

  // Object 1 is the catalog, 2 the page tree, 3 the info dictionary, then
  // three objects per page.
  const PER_PAGE = 3;
  const pageObj = (i: number) => 4 + i * PER_PAGE;
  const contentObj = (i: number) => pageObj(i) + 1;
  const imageObj = (i: number) => pageObj(i) + 2;
  const objectCount = 3 + pages.length * PER_PAGE;

  const chunks: Buffer[] = [];
  let offset = 0;
  /** Byte offset of each object, indexed by object number. */
  const offsets = new Array<number>(objectCount + 1).fill(0);

  const push = (buf: Buffer) => {
    chunks.push(buf);
    offset += buf.length;
  };
  const write = (text: string) => push(Buffer.from(text, LATIN1));
  const begin = (n: number) => {
    offsets[n] = offset;
    write(n + ' 0 obj\n');
  };
  const end = () => write('endobj\n');

  // The binary comment on line 2 is what tells a transport that this file is
  // binary and must not have its newlines translated.
  write('%PDF-1.4\n%âãÏÓ\n');

  begin(1);
  write('<< /Type /Catalog /Pages 2 0 R >>\n');
  end();

  begin(2);
  const kids = pages.map((_, i) => pageObj(i) + ' 0 R').join(' ');
  write('<< /Type /Pages /Count ' + pages.length + ' /Kids [ ' + kids + ' ] >>\n');
  end();

  begin(3);
  write(
    '<< /Title ' +
      textString(options.title) +
      ' /Author ' +
      textString(options.author) +
      ' /Creator ' +
      textString('BINKIS ID') +
      ' /Producer ' +
      textString('BINKIS ID') +
      ' /CreationDate ' +
      pdfDate(options.createdAt) +
      ' /ModDate ' +
      pdfDate(options.createdAt) +
      ' >>\n',
  );
  end();

  pages.forEach((page, i) => {
    const f = facts[i]!;
    const heightPt = options.pageHeightPt;
    const widthPt = (heightPt * f.width) / f.height;

    begin(pageObj(i));
    write(
      '<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ' +
        num(widthPt) +
        ' ' +
        num(heightPt) +
        ' ] /Resources << /XObject << /Im0 ' +
        imageObj(i) +
        ' 0 R >> /ProcSet [ /PDF /ImageB /ImageC ] >> /Contents ' +
        contentObj(i) +
        ' 0 R >>\n',
    );
    end();

    // Scale the unit image square to fill the page exactly.
    const content = Buffer.from(
      'q\n' + num(widthPt) + ' 0 0 ' + num(heightPt) + ' 0 0 cm\n/Im0 Do\nQ\n',
      LATIN1,
    );
    begin(contentObj(i));
    write('<< /Length ' + content.length + ' >>\nstream\n');
    push(content);
    // The EOL before `endstream` is not counted in /Length, so it is written
    // separately from the content even though the content also ends in one.
    write('\nendstream\n');
    end();

    begin(imageObj(i));
    write(
      '<< /Type /XObject /Subtype /Image /Width ' +
        f.width +
        ' /Height ' +
        f.height +
        ' /ColorSpace ' +
        (f.components === 1 ? '/DeviceGray' : '/DeviceRGB') +
        ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        page.jpeg.length +
        ' >>\nstream\n',
    );
    push(Buffer.from(page.jpeg.buffer, page.jpeg.byteOffset, page.jpeg.byteLength));
    write('\nendstream\n');
    end();
  });

  const xrefAt = offset;
  write('xref\n0 ' + (objectCount + 1) + '\n');
  write('0000000000 65535 f \n');
  for (let n = 1; n <= objectCount; n++) {
    write(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
  }
  write(
    'trailer\n<< /Size ' +
      (objectCount + 1) +
      ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' +
      xrefAt +
      '\n%%EOF\n',
  );

  return Buffer.concat(chunks);
}
