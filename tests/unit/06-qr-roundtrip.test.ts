import { describe, it, expect } from 'vitest';
import { encodeQr } from '../../src/lib/qr/encode.ts';
import { renderQrSvg, parseQrSvg } from '../../src/lib/qr/svg.ts';
import { decodeQr, QrDecodeError } from '../../src/lib/qr/decode.ts';
import { matricesEqual, getModule, setModule } from '../../src/lib/qr/matrix.ts';
import { qrPayload } from '../../src/lib/codes/qr-token.ts';
import { generateQrToken } from '../../src/lib/codes/mint.ts';

// Requirement 5: every QR is machine-decoded back to confirm it resolves to
// the intended URL. The decoder is written from ISO/IEC 18004 and the encoder
// is the `qrcode` library, so a round trip is real evidence rather than one
// implementation agreeing with itself.

const ORIGIN = 'https://id.binkis.com';

describe('QR round trip: encode, render to SVG, re-read, decode', () => {
  it('recovers the exact URL for 300 random tokens', () => {
    for (let i = 0; i < 300; i++) {
      const token = generateQrToken();
      const payload = qrPayload(token, ORIGIN);

      const encoded = encodeQr(payload, 'M');
      const svg = renderQrSvg(encoded.matrix);
      const decoded = decodeQr(parseQrSvg(svg));

      expect(decoded.text).toBe(payload);
      expect(decoded.text.endsWith(`/p/${token}`)).toBe(true);
    }
  });

  it('agrees with the encoder about version, mask and error correction level', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as const) {
      const payload = qrPayload(generateQrToken(), ORIGIN);
      const encoded = encodeQr(payload, level);
      const decoded = decodeQr(parseQrSvg(renderQrSvg(encoded.matrix)));

      expect(decoded.errorCorrectionLevel).toBe(level);
      expect(decoded.version).toBe(encoded.version);
      expect(decoded.maskPattern).toBe(encoded.maskPattern);
    }
  });

  it('produces a version 3, 29x29 symbol at level M for a BINKIS payload', () => {
    // This is the number that decides how big a printed module is on the
    // hologram, so it is pinned rather than left to drift.
    const encoded = encodeQr(qrPayload(generateQrToken(), ORIGIN), 'M');
    expect(encoded.version).toBe(3);
    expect(encoded.matrix.size).toBe(29);
  });

  it('the QR contains only the token, never the serial or the claim code', () => {
    const token = generateQrToken();
    const payload = qrPayload(token, ORIGIN);
    const decoded = decodeQr(parseQrSvg(renderQrSvg(encodeQr(payload, 'M').matrix)));

    expect(decoded.text).toBe(`${ORIGIN}/p/${token}`);
    expect(decoded.text).not.toMatch(/[?&]/); // no tracking parameters
    expect(decoded.text.split('/').filter(Boolean)).toHaveLength(4); // https:, host, p, token
  });

  it('refuses a token that is not well formed rather than encoding it', () => {
    expect(() => qrPayload('TOO-SHORT')).toThrow();
    expect(() => qrPayload('AAAAAAAAAAA0')).toThrow(); // excluded character
  });
});

describe('the SVG is what gets verified, not the matrix it came from', () => {
  it('re-reads the rendered SVG into exactly the original module grid', () => {
    for (let i = 0; i < 50; i++) {
      const encoded = encodeQr(qrPayload(generateQrToken(), ORIGIN), 'M');
      expect(matricesEqual(parseQrSvg(renderQrSvg(encoded.matrix)), encoded.matrix)).toBe(true);
    }
  });

  it('survives being rendered at a different module size and quiet zone', () => {
    const payload = qrPayload(generateQrToken(), ORIGIN);
    const encoded = encodeQr(payload, 'M');
    for (const moduleSize of [1, 4, 8, 16, 40]) {
      for (const quietZone of [4, 6, 10]) {
        const svg = renderQrSvg(encoded.matrix, { moduleSize, quietZone });
        expect(decodeQr(parseQrSvg(svg)).text).toBe(payload);
      }
    }
  });

  it('rejects a quiet zone below the 4 modules the spec requires', () => {
    const encoded = encodeQr(qrPayload(generateQrToken(), ORIGIN), 'M');
    expect(() => renderQrSvg(encoded.matrix, { quietZone: 2 })).toThrow(/quiet zone/i);
  });
});

describe('the verification actually detects damage', () => {
  // A round trip is only worth running if it can fail. These flip bits in the
  // symbol and confirm the decoder notices, rather than trusting that it would.

  it('fails Reed-Solomon when a data module is flipped', () => {
    let detected = 0;
    const attempts = 60;

    for (let i = 0; i < attempts; i++) {
      const payload = qrPayload(generateQrToken(), ORIGIN);
      const encoded = encodeQr(payload, 'M');
      const damaged = { size: encoded.matrix.size, data: Uint8Array.from(encoded.matrix.data) };

      // The bottom-right 4x4 of a version 3 symbol is pure data: the nearest
      // alignment pattern is centred at (22,22) and spans rows and columns
      // 20-24, and no finder reaches here. Flipping a reserved module instead
      // would prove nothing, because the decoder skips those.
      const row = encoded.matrix.size - 1 - (i % 4);
      const col = encoded.matrix.size - 1 - (Math.floor(i / 4) % 4);
      setModule(damaged, row, col, getModule(damaged, row, col) ^ 1);

      try {
        const decoded = decodeQr(parseQrSvg(renderQrSvg(damaged)));
        if (decoded.text !== payload) detected++;
      } catch (error) {
        expect(error).toBeInstanceOf(QrDecodeError);
        detected++;
      }
    }

    expect(detected).toBe(attempts);
  });

  it('rejects a symbol whose format information has been corrupted', () => {
    const encoded = encodeQr(qrPayload(generateQrToken(), ORIGIN), 'M');
    const damaged = { size: encoded.matrix.size, data: Uint8Array.from(encoded.matrix.data) };

    // Wreck both copies of the format information.
    for (let i = 0; i <= 5; i++) setModule(damaged, i, 8, getModule(damaged, i, 8) ^ 1);
    for (let j = 0; j <= 5; j++) setModule(damaged, 8, j, getModule(damaged, 8, j) ^ 1);
    for (let i = damaged.size - 7; i < damaged.size; i++) {
      setModule(damaged, i, 8, getModule(damaged, i, 8) ^ 1);
    }

    expect(() => decodeQr(parseQrSvg(renderQrSvg(damaged)))).toThrow(QrDecodeError);
  });

  it('rejects an SVG that is not a valid QR symbol size', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
      '<rect x="0" y="0" width="100" height="100" fill="#FFFFFF"/>' +
      '<rect x="10" y="10" width="10" height="10" fill="#000000"/>' +
      '<rect x="60" y="60" width="10" height="10" fill="#000000"/>' +
      '</svg>';
    expect(() => parseQrSvg(svg)).toThrow();
  });
});
