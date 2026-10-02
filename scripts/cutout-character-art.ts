#!/usr/bin/env node
/**
 * Knock the white background out of the character stills.
 *
 *   node scripts/cutout-character-art.ts artwork/*.png --out public/characters
 *
 * The client's stills arrive as RGB with a solid white backdrop baked in, so
 * on the passport's near-black card they render as a white box with a figure
 * in it. The eight Classics hide this behind their animation; the five
 * Limiteds have no clip, so the box is all anyone sees.
 *
 * The fill starts at the border and spreads, rather than making every white
 * pixel transparent. Superman's eyes, Cyborg's highlights and Bizarro's teeth
 * are white too, and they are enclosed by outlines, so a flood from the edge
 * never reaches them. Edge pixels get partial alpha by how close they are to
 * white, which keeps the outline smooth instead of jagged.
 *
 * No image library: PNG is a zlib stream of filtered scanlines, and these are
 * flat-colour drawings, so the whole job is a decode, a flood fill and an
 * encode. Adding a dependency to do it would be the bigger cost.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'public/characters' },
    /** How close to white still counts as background. */
    threshold: { type: 'string', default: '238' },
  },
});

if (positionals.length === 0) {
  console.log('\n  node scripts/cutout-character-art.ts <png...> [--out dir] [--threshold 238]\n');
  process.exit(1);
}

const THRESHOLD = Number(values.threshold);

interface Image {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function decode(file: string): Image {
  const raw = readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  while (pos < raw.length) {
    const length = raw.readUInt32BE(pos);
    const type = raw.toString('latin1', pos + 4, pos + 8);
    const data = raw.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8]!;
      const colour = data[9]!;
      if (depth !== 8) throw new Error(`${file}: only 8-bit PNGs, got ${depth}`);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour as 0 | 2 | 4 | 6] ?? 0;
      if (!channels) throw new Error(`${file}: palette PNGs are not supported`);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    }
    pos += 12 + length;
  }

  const buf = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = buf[p++]!;
    const line = new Uint8Array(buf.subarray(p, p + stride));
    p += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let x = line[i]!;
      if (filter === 1) x = (x + a) & 255;
      else if (filter === 2) x = (x + b) & 255;
      else if (filter === 3) x = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        x = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      line[i] = x;
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      const [r, g, bl] =
        channels >= 3 ? [line[s]!, line[s + 1]!, line[s + 2]!] : [line[s]!, line[s]!, line[s]!];
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = bl;
      out[d + 3] = channels === 4 ? line[s + 3]! : channels === 2 ? line[s + 1]! : 255;
    }
    prev = line;
  }

  return { width, height, data: out };
}

function encode(image: Image): Buffer {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none. These compress fine flat.
    Buffer.from(data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Flood the background from the border inwards, leaving enclosed whites alone. */
function cutout(image: Image): number {
  const { width, height, data } = image;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];

  const isBackground = (i: number): boolean => {
    const d = i * 4;
    return data[d]! >= THRESHOLD && data[d + 1]! >= THRESHOLD && data[d + 2]! >= THRESHOLD;
  };

  for (let x = 0; x < width; x++) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    stack.push(y * width, y * width + width - 1);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (seen[i] || !isBackground(i)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    cleared++;

    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < height - 1) stack.push(i + width);
  }

  // Soften the boundary: a pixel next to transparency that is still bright is
  // the anti-aliased edge of the original white, so fade it by its brightness.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (data[i * 4 + 3] === 0) continue;
      const touching =
        data[(i - 1) * 4 + 3] === 0 ||
        data[(i + 1) * 4 + 3] === 0 ||
        data[(i - width) * 4 + 3] === 0 ||
        data[(i + width) * 4 + 3] === 0;
      if (!touching) continue;
      const lum = (data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!) / 3;
      if (lum > 200) data[i * 4 + 3] = Math.round(255 * Math.max(0, (255 - lum) / 55));
    }
  }

  return cleared;
}

mkdirSync(values.out!, { recursive: true });
console.log('');
for (const file of positionals) {
  const image = decode(file);
  const cleared = cutout(image);
  const out = join(values.out!, basename(file));
  const png = encode(image);
  writeFileSync(out, png);
  const share = ((cleared / (image.width * image.height)) * 100).toFixed(0);
  console.log(
    `  ${basename(file).padEnd(34)} ${image.width}x${image.height}  ` +
      `fondo retirado ${share.padStart(2)}%  ${(png.length / 1024).toFixed(0)} KB  -> ${out}`,
  );
}
console.log('');
